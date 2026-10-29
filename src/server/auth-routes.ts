import { Hono } from 'hono'
import type { Env, Member } from '../lib/db'
import {
  createOtp, verifyOtp, createSession, setSessionCookie, clearSessionCookie,
  currentMember, findMemberByEmail, isEmail, sendOtpEmail, revokeSession, revokeAllSessions,
  hashPassword, verifyPassword,
} from '../lib/auth'
import { bad, forbidden, requireMember, type Ctx } from './helpers'
import { audit, listMembers, getMeta, setMeta } from '../lib/db'
import { ensureOwner, ensureInitialized } from '../lib/seed'

export const authRoutes = new Hono<{ Bindings: Env }>()

const devMode = (env: Env) => env.OTP_DEV_MODE === '1' || (!env.RESEND_API_KEY && !env.SMTP_BRIDGE_URL && !env.SMTP_HOST)

/** Status awam: adakah pemilik sudah ditetapkan? */
authRoutes.get('/status', async (c) => {
  const owner = await c.env.DB.prepare(
    `SELECT u.email FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role='owner' LIMIT 1`
  ).first<any>()
  return c.json({
    needsSetup: !owner || !owner.email,
    devMode: devMode(c.env),
    provider: c.env.SMTP_HOST ? 'smtp' : c.env.SMTP_BRIDGE_URL ? 'smtp-bridge' : c.env.RESEND_API_KEY ? 'resend' : 'none',
  })
})

/** Persediaan awal: e-mel pemilik (dan pasangan). Hanya sekali. */
authRoutes.post('/setup', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase()
  const ownerName = String(body.ownerName || 'Muhammad Shukrie').trim().slice(0, 100)
  const partnerEmail = String(body.partnerEmail || '').trim().toLowerCase()
  const partnerName = String(body.partnerName || '').trim().slice(0, 100)
  if (!isEmail(ownerEmail)) throw bad('Masukkan e-mel pemilik yang sah.')
  if (partnerEmail && !isEmail(partnerEmail)) throw bad('E-mel pasangan tidak sah.')
  if (partnerEmail && partnerEmail === ownerEmail) throw bad('E-mel pasangan mesti berbeza.')

  const existing = await c.env.DB.prepare(
    `SELECT u.id, u.email FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role='owner' LIMIT 1`
  ).first<any>()
  if (existing && existing.email) throw forbidden('Pemilik sudah ditetapkan.')

  const ownerId = await ensureOwner(c.env, ownerEmail, ownerName)
  await ensureInitialized(c.env)

  if (partnerEmail) {
    const dup = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(partnerEmail).first<any>()
    if (!dup) {
      const pid = crypto.randomUUID()
      const at = new Date().toISOString()
      await c.env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(pid, partnerEmail, partnerName || 'Pasangan', at).run()
      await c.env.DB.prepare(`INSERT INTO memberships (user_id, role, spaces, status) VALUES (?, 'partner', ?, 'active')`)
        .bind(pid, JSON.stringify(['personal-my', 'personal-id']))
        .run()
    }
  }
  await audit(c.env.DB, ownerId, 'setup', 'owner', ownerId, null, { ownerEmail, partnerEmail: partnerEmail || null })
  return c.json({ ok: true })
})

/** Minta kod OTP — hanya e-mel yang ada dalam senarai ahli. */
authRoutes.post('/request-otp', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!isEmail(email)) throw bad('Masukkan e-mel yang sah.')
  const member = await findMemberByEmail(c.env, email)
  if (!member) throw bad('Akaun ini tiada akses.')
  if (member.status === 'disabled') throw bad('Akaun ini tiada akses.')
  const res = await createOtp(c.env, email)
  if ('error' in res) throw bad(res.error)
  let sent: { sent: boolean; reason: string }
  try {
    sent = await sendOtpEmail(c.env, email, res.code)
  } catch (error: any) {
    await audit(c.env.DB, member.id, 'otp_request', 'user', member.id, null, { sent: false, reason: 'smtp_error' })
    console.error('OTP SMTP error:', error?.message || error)
    if (c.env.OTP_DEV_FALLBACK === '1') {
      return c.json({ ok: true, sent: false, devCode: res.code, note: 'SMTP ditolak dalam preview lokal — gunakan kod ini untuk ujian.' })
    }
    return c.json({ ok: false, sent: false, error: 'E-mel OTP ditolak oleh pelayan SMTP. Sila cuba dari rangkaian/IP yang tidak disenarai hitam.' }, 502)
  }
  await audit(c.env.DB, member.id, 'otp_request', 'user', member.id, null, { sent: sent.sent })
  return c.json({
    ok: true,
    sent: sent.sent,
    // Kod dipaparkan HANYA apabila tiada pembekal e-mel dikonfigurasi (mod pembangunan).
    devCode: sent.sent || !devMode(c.env) ? undefined : res.code,
    note: sent.sent ? null : devMode(c.env) ? 'Tiada pembekal e-mel dikonfigurasi — kod dipaparkan pada skrin (mod pembangunan).' : 'E-mel OTP gagal dihantar.',
  })
})

/** Sahkan OTP → sesi. */
authRoutes.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const code = String(body.code || '').trim()
  if (!isEmail(email)) throw bad('Masukkan e-mel yang sah.')
  if (!/^\d{6}$/.test(code)) throw bad('Kod mesti 6 digit.')
  const member = await findMemberByEmail(c.env, email)
  if (!member) throw bad('Akaun ini tiada akses.')
  const ok = await verifyOtp(c.env, email, code)
  if (!ok) throw bad('Kod tidak sah atau sudah tamat.')
  const sid = await createSession(c.env, member.id, c.req.header('user-agent') || '')
  setSessionCookie(c, sid)
  await audit(c.env.DB, member.id, 'login', 'user', member.id, null, null, c.req.header('cf-connecting-ip'))
  return c.json({ ok: true, me: member })
})

/** Login alternatif menggunakan kata laluan; OTP kekal tersedia sebagai pilihan lain. */
authRoutes.post('/login-password', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!isEmail(email)) throw bad('Masukkan e-mel yang sah.')
  if (password.length < 8) throw bad('Kata laluan mesti sekurang-kurangnya 8 aksara.')
  const member = await findMemberByEmail(c.env, email)
  if (!member || member.status === 'disabled') throw bad('E-mel atau kata laluan tidak sah.')
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(member.id).first<any>()
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) throw bad('E-mel atau kata laluan tidak sah.')
  const sid = await createSession(c.env, member.id, c.req.header('user-agent') || '')
  setSessionCookie(c, sid)
  await audit(c.env.DB, member.id, 'login_password', 'user', member.id, null, null, c.req.header('cf-connecting-ip'))
  return c.json({ ok: true, me: member })
})

/** Tetapkan atau tukar kata laluan untuk akaun yang sedang login. */
authRoutes.post('/password', async (c) => {
  const m = await requireMember(c)
  const body = await c.req.json().catch(() => ({}))
  const currentPassword = String(body.currentPassword || '')
  const newPassword = String(body.newPassword || '')
  if (newPassword.length < 8) throw bad('Kata laluan baharu mesti sekurang-kurangnya 8 aksara.')
  if (newPassword.length > 128) throw bad('Kata laluan terlalu panjang.')
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(m.id).first<any>()
  if (row?.password_hash && !(await verifyPassword(currentPassword, row.password_hash))) throw bad('Kata laluan semasa tidak betul.')
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), m.id).run()
  await audit(c.env.DB, m.id, 'password_change', 'user', m.id, null, { changed: true })
  return c.json({ ok: true })
})

authRoutes.get('/me', async (c) => {
  const m = await currentMember(c)
  if (!m) return c.json({ me: null }, 200)
  return c.json({ me: m })
})

authRoutes.post('/logout', async (c) => {
  await revokeSession(c)
  clearSessionCookie(c)
  return c.json({ ok: true })
})

authRoutes.post('/logout-all', async (c) => {
  const m = await requireMember(c)
  const target = c.req.query('user') || m.id
  if (target !== m.id && m.role !== 'owner') throw forbidden()
  await revokeAllSessions(c.env, target)
  clearSessionCookie(c)
  await audit(c.env.DB, m.id, 'logout_all', 'user', target, null, null)
  return c.json({ ok: true })
})

/* ---------- ahli (Akses akaun) ---------- */
authRoutes.get('/members', async (c) => {
  await requireMember(c)
  return c.json({ members: await listMembers(c.env.DB) })
})

authRoutes.post('/members', async (c) => {
  const m = await requireMember(c, 'manage_members')
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name || '').trim().slice(0, 100)
  const email = String(body.email || '').trim().toLowerCase()
  const role = String(body.role || 'partner')
  const spaces: string[] = Array.isArray(body.spaces) ? body.spaces : []
  if (!name) throw bad('Nama diperlukan.')
  if (!isEmail(email)) throw bad('E-mel tidak sah.')
  if (role !== 'partner' && role !== 'viewer') throw bad('Peranan tidak sah.')
  if (!spaces.length) throw bad('Pilih sekurang-kurangnya satu ruang.')
  const dup = await c.env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first<any>()
  if (dup) throw bad('E-mel ini sudah dijemput.')
  const id = crypto.randomUUID()
  const at = new Date().toISOString()
  await c.env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(id, email, name, at).run()
  await c.env.DB.prepare('INSERT INTO memberships (user_id, role, spaces, status) VALUES (?,?,?,?)')
    .bind(id, role, JSON.stringify(spaces), 'active')
    .run()
  await audit(c.env.DB, m.id, 'member_invite', 'user', id, null, { name, email, role, spaces })
  return c.json({ ok: true, id })
})

authRoutes.patch('/members/:id', async (c) => {
  const m = await requireMember(c, 'manage_members')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const row = await c.env.DB.prepare('SELECT * FROM memberships WHERE user_id = ?').bind(id).first<any>()
  if (!row) throw bad('Ahli tidak dijumpai.')
  if (row.role === 'owner') throw bad('Peranan pemilik tidak boleh diubah.')
  const spaces = Array.isArray(body.spaces) ? body.spaces : JSON.parse(row.spaces)
  if (!spaces.length) throw bad('Pilih sekurang-kurangnya satu ruang.')
  const role = body.role === 'viewer' ? 'viewer' : 'partner'
  await c.env.DB.prepare('UPDATE memberships SET role = ?, spaces = ? WHERE user_id = ?')
    .bind(role, JSON.stringify(spaces), id)
    .run()
  await audit(c.env.DB, m.id, 'member_update', 'user', id, row, { role, spaces })
  return c.json({ ok: true })
})

authRoutes.delete('/members/:id', async (c) => {
  const m = await requireMember(c, 'manage_members')
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM memberships WHERE user_id = ?').bind(id).first<any>()
  if (!row) throw bad('Ahli tidak dijumpai.')
  if (row.role === 'owner') throw bad('Pemilik tidak boleh dibuang.')
  await c.env.DB.prepare('DELETE FROM memberships WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  await revokeAllSessions(c.env, id)
  await audit(c.env.DB, m.id, 'member_remove', 'user', id, row, null)
  return c.json({ ok: true })
})

