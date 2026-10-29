import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import type { Env, Member } from './db'
import nodemailer from 'nodemailer'

const SESSION_COOKIE = 'rb_session'
// Keep the authenticated device remembered for six months. The session can
// still be revoked immediately from logout/logout-all or by disabling a user.
const SESSION_DAYS = 180
const OTP_TTL_MIN = 10
const OTP_MAX_ATTEMPTS = 5
const OTP_RATE_WINDOW_MIN = 15
const OTP_RATE_MAX = 5

export const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return hex(await crypto.subtle.digest('SHA-256', buf))
}

export function randomCode(): string {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return String(a[0] % 1000000).padStart(6, '0')
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function findMemberByEmail(env: Env, email: string): Promise<(Member & { status: string }) | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, m.role, m.spaces, m.status
       FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE lower(u.email) = ?`
  )
    .bind(email.trim().toLowerCase())
    .first<any>()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    spaces: row.spaces ? JSON.parse(row.spaces) : [],
    status: row.status,
  }
}

export async function createOtp(env: Env, email: string): Promise<{ code: string; id: string } | { error: string }> {
  const since = new Date(Date.now() - OTP_RATE_WINDOW_MIN * 60_000).toISOString()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM otp_codes WHERE email = ? AND created_at > ?')
    .bind(email, since)
    .first<{ n: number }>()
  if (env.OTP_DEV_MODE !== '1' && (recent?.n || 0) >= OTP_RATE_MAX) {
    return { error: 'Terlalu banyak percubaan. Cuba lagi dalam 15 minit.' }
  }
  const code = randomCode()
  const id = crypto.randomUUID()
  const now = new Date()
  await env.DB.prepare(
    'INSERT INTO otp_codes (id, email, code_hash, created_at, expires_at, attempts) VALUES (?,?,?,?,?,0)'
  )
    .bind(id, email, await sha256Hex(`${email}:${code}`), now.toISOString(), new Date(now.getTime() + OTP_TTL_MIN * 60_000).toISOString())
    .run()
  return { code, id }
}

export async function verifyOtp(env: Env, email: string, code: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT * FROM otp_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1'
  )
    .bind(email)
    .first<any>()
  if (!row) return false
  if (new Date(row.expires_at).getTime() < Date.now()) return false
  if (row.attempts >= OTP_MAX_ATTEMPTS) return false
  const ok = (await sha256Hex(`${email}:${code}`)) === row.code_hash
  if (!ok) {
    await env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    return false
  }
  await env.DB.prepare('UPDATE otp_codes SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run()
  return true
}

export async function createSession(env: Env, userId: string, ua: string): Promise<string> {
  const id = crypto.randomUUID() + '.' + crypto.randomUUID()
  const now = new Date()
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)')
    .bind(id, userId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * 864e5).toISOString(), ua.slice(0, 200))
    .run()
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now.toISOString(), userId).run()
  return id
}

export function setSessionCookie(c: Context, sid: string) {
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export type Session = Member

export async function currentMember(c: Context<{ Bindings: Env }>): Promise<Session | null> {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid && c.env.AUTH_DEV_BYPASS === '1') {
    const owner = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, m.role, m.spaces, m.status
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE m.role = 'owner' AND m.status = 'active' LIMIT 1`
    ).first<any>()
    if (owner) return { id: owner.id, email: owner.email || '', name: owner.name, role: owner.role, spaces: owner.spaces ? JSON.parse(owner.spaces) : [], status: owner.status }
  }
  if (!sid) return null
  const row = await c.env.DB.prepare(
    `SELECT s.id AS sid, s.expires_at, u.id, u.email, u.name, m.role, m.spaces, m.status
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN memberships m ON m.user_id = u.id
      WHERE s.id = ? AND s.revoked_at IS NULL`
  )
    .bind(sid)
    .first<any>()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  return {
    id: row.id,
    email: row.email || '',
    name: row.name,
    role: row.role,
    spaces: row.spaces ? JSON.parse(row.spaces) : [],
    status: row.status,
  }
}

export async function revokeSession(c: Context<{ Bindings: Env }>) {
  const sid = getCookie(c, SESSION_COOKIE)
  if (sid) {
    await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(new Date().toISOString(), sid).run()
  }
}

export async function revokeAllSessions(env: Env, userId: string) {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), userId)
    .run()
}

/* ---------------- kebenaran peranan ---------------- */
export type Capability =
  | 'read'
  | 'record_payment'
  | 'upload_doc'
  | 'add_income'
  | 'edit_item'
  | 'delete_item'
  | 'manage_members'
  | 'set_rate'
  | 'export'
  | 'backup'

const MATRIX: Record<string, Capability[]> = {
  owner: ['read', 'record_payment', 'upload_doc', 'add_income', 'edit_item', 'delete_item', 'manage_members', 'set_rate', 'export', 'backup'],
  partner: ['read', 'record_payment', 'upload_doc', 'add_income', 'edit_item', 'set_rate', 'export'],
  viewer: ['read'],
}

export const can = (role: string, cap: Capability) => (MATRIX[role] || []).includes(cap)

/** Ruang efektif: pemilik = semua; ahli lain = senarai yang diberi. */
export function effectiveSpaces(m: Member): string[] {
  return m.spaces || []
}

export const canSeeSpace = (m: Member, entity: string) => m.role === 'owner' || (m.spaces || []).includes(entity)

/* ---------------- e-mel ---------------- */
export async function sendOtpEmail(env: Env, to: string, code: string) {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === '1' || env.SMTP_SECURE === 'true',
      name: env.SMTP_NAME || 'xboss.asia',
      requireTLS: Number(env.SMTP_PORT || 587) === 587,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
    await transporter.sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to,
      subject: `Kod log masuk Rekod Boss: ${code}`,
      text: `Kod sekali guna anda ialah ${code}. Sah selama 10 minit.\n\nJika anda tidak meminta kod ini, abaikan e-mel ini.`,
    })
    return { sent: true, reason: 'smtp' }
  }
  if (env.SMTP_BRIDGE_URL) {
    const res = await fetch(env.SMTP_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        subject: `Kod log masuk Rekod Boss: ${code}`,
        text: `Kod sekali guna anda ialah ${code}. Sah selama 10 minit.\n\nJika anda tidak meminta kod ini, abaikan e-mel ini.`,
      }),
    })
    return { sent: res.ok, reason: res.ok ? 'smtp_bridge' : `bridge_http_${res.status}` }
  }
  if (!env.RESEND_API_KEY) return { sent: false, reason: 'no_provider' }
  const from = env.MAIL_FROM || 'Rekod Boss <noreply@rekodboss.app>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Kod log masuk Rekod Boss: ${code}`,
      text: `Kod sekali guna anda ialah ${code}. Sah selama 10 minit.\n\nJika anda tidak meminta kod ini, abaikan e-mel ini.`,
    }),
  })
  return { sent: res.ok, reason: res.ok ? 'sent' : `http_${res.status}` }
}

