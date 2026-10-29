import { Hono } from 'hono'
import type { Env } from '../lib/db'
import {
  audit, getRate, listDocs, listItems, listPayments, listSources, listVehicles, setMeta,
} from '../lib/db'
import {
  bad, forbidden, jsonNum, requireMember, requireSpace, checkOrigin, type Ctx,
} from './helpers'
import { currentMember } from '../lib/auth'
import { ACCOUNTS, CATEGORIES, CHANNELS, CURRENCIES, INCOME_SOURCES, FREQ, PAY_METHODS } from '../lib/constants'
import { RX_MONTH, validDate, todayISO, addMonthsDate } from '../lib/date'
import { putBytes, getBytes } from '../lib/storage'
import { sniffMime, assetBytes } from '../lib/seed'
import { sha256Hex } from '../lib/auth'

export const ledgerRoutes = new Hono<{ Bindings: Env }>()

const MAX_BYTES = 10 * 1024 * 1024

/* ---------- state penuh (ditapis mengikut skop ruang) ---------- */
ledgerRoutes.get('/state', async (c) => {
  const m = await requireMember(c)
  const spaces = (m.spaces || []).filter((s) => ACCOUNTS.some((a) => a.id === s))
  const [items, payments, docs, vehicles, sources, rate] = await Promise.all([
    listItems(c.env.DB, spaces),
    listPayments(c.env.DB, spaces),
    listDocs(c.env.DB, spaces),
    listVehicles(c.env.DB, spaces),
    listSources(c.env.DB),
    getRate(c.env.DB),
  ])
  const meta = await c.env.DB.prepare('SELECT key, value FROM meta').all()
  const metaObj: Record<string, string> = {}
  for (const r of meta.results || []) metaObj[(r as any).key] = (r as any).value
  return c.json({
    me: m,
    items,
    payments,
    vehicles,
    sources,
    rate,
    meta: metaObj,
    docs: docs.map((d) => ({
      id: d.id, itemId: d.itemId, month: d.month, kind: d.kind, recipient: d.recipient,
      name: d.name, mime: d.mime, size: d.size, sha256: d.sha256, uploadedAt: d.uploadedAt,
    })),
    spaces,
  })
})

/* ---------- item ---------- */
type ItemPayload = {
  name?: string
  entity?: string
  currency?: string
  amount?: any
  day?: any
  start?: string | null
  frequency?: string
  category?: string
  type?: string
  note?: string
  paySource?: string | null
  payMethod?: string | null
}

function validateItem(d: ItemPayload) {
  const name = String(d.name || '').trim()
  if (!name || name.length > 150) throw bad('Nama komitmen diperlukan.')
  if (!ACCOUNTS.some((a) => a.id === d.entity)) throw bad('Pilih ruang kewangan.')
  if (!CURRENCIES.includes(d.currency as any)) throw bad('Mata wang tidak sah.')
  if (!FREQ[String(d.frequency)]) throw bad('Kekerapan tidak sah.')
  const amount = jsonNum(d.amount)
  if (amount != null && (!(amount > 0) || Number.isNaN(amount))) throw bad('Amaun mesti lebih daripada 0, atau kosongkan jika belum diketahui.')
  const day = jsonNum(d.day)
  if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) throw bad('Hari bayaran mesti 1–31, atau kosongkan.')
  const start = d.start || null
  if (start && !RX_MONTH.test(start)) throw bad('Bulan mula tidak sah.')
  const acct = ACCOUNTS.find((a) => a.id === d.entity)!
  const isInc = d.type === 'income'
  let category = d.category || 'Lain-lain'
  if (isInc && !INCOME_SOURCES.includes(category)) category = 'Lain-lain'
  if (!isInc && !CATEGORIES.includes(category)) category = 'Lain-lain'
  const pm = d.payMethod || null
  if (pm && !PAY_METHODS.includes(pm)) throw bad('Cara bayaran tidak sah.')
  return {
    name, entity: d.entity!, scope: acct.scope, currency: d.currency as 'MYR' | 'IDR',
    amount, day, start, frequency: String(d.frequency), category,
    type: (isInc ? 'income' : 'expense') as 'income' | 'expense',
    note: String(d.note || '').slice(0, 1000),
    paySource: isInc ? null : (d.paySource || null),
    payMethod: isInc ? null : pm,
  }
}

ledgerRoutes.post('/items', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const body = (await c.req.json().catch(() => ({}))) as ItemPayload
  const f = validateItem(body)
  requireSpace(m, f.entity)
  if (f.paySource) {
    const s = await c.env.DB.prepare('SELECT id FROM pay_sources WHERE id = ?').bind(f.paySource).first<any>()
    if (!s && !['wise', 'hlb-xboss', 'cimb-shukrie', 'swipey', 'mandiri-xboss', 'mandiri-shukrie'].includes(f.paySource)) throw bad('Sumber bayaran tidak sah.')
  }
  const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const id = 'app-' + slug + '-' + Math.random().toString(36).slice(2, 7)
  const at = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO items (id, name, entity, scope, currency, amount, day, start, end_month, frequency, category, type,
                        note, pay_source, pay_method, vehicle_id, source, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,NULL,'app',?,?,?)`
  )
    .bind(id, f.name, f.entity, f.scope, f.currency, f.amount, f.day, f.start, f.frequency, f.category, f.type, f.note, f.paySource, f.payMethod, at, at, m.id)
    .run()
  await audit(c.env.DB, m.id, 'item_create', 'item', id, null, f)
  return c.json({ ok: true, id })
})

ledgerRoutes.patch('/items/:id', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, before.entity)
  const body = (await c.req.json().catch(() => ({}))) as ItemPayload
  const f = validateItem({ ...before, ...body, entity: body.entity || before.entity, currency: body.currency || before.currency, frequency: body.frequency || before.frequency, type: body.type || before.type })
  requireSpace(m, f.entity)
  const at = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE items SET name=?, entity=?, scope=?, currency=?, amount=?, day=?, start=?, frequency=?, category=?, type=?,
                      note=?, pay_source=?, pay_method=?, updated_at=? WHERE id=?`
  )
    .bind(f.name, f.entity, f.scope, f.currency, f.amount, f.day, f.start, f.frequency, f.category, f.type, f.note, f.paySource, f.payMethod, at, id)
    .run()
  await audit(c.env.DB, m.id, 'item_update', 'item', id, before, f)
  return c.json({ ok: true })
})

ledgerRoutes.post('/items/:id/archive', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const endMonth = String(body.endMonth || '')
  if (!RX_MONTH.test(endMonth)) throw bad('Bulan akhir tidak sah.')
  const before = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, before.entity)
  await c.env.DB.prepare('UPDATE items SET end_month = ?, updated_at = ? WHERE id = ?').bind(endMonth, new Date().toISOString(), id).run()
  await audit(c.env.DB, m.id, 'item_archive', 'item', id, before, { endMonth })
  return c.json({ ok: true })
})

ledgerRoutes.post('/items/:id/unarchive', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, before.entity)
  await c.env.DB.prepare('UPDATE items SET end_month = NULL, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
  await audit(c.env.DB, m.id, 'item_unarchive', 'item', id, before, null)
  return c.json({ ok: true })
})

ledgerRoutes.delete('/items/:id', async (c) => {
  const m = await requireMember(c, 'delete_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, before.entity)
  await c.env.DB.prepare('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), new Date().toISOString(), id).run()
  await audit(c.env.DB, m.id, 'item_delete', 'item', id, before, null)
  return c.json({ ok: true })
})

ledgerRoutes.post('/items/:id/restore', async (c) => {
  const m = await requireMember(c, 'delete_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, before.entity)
  await c.env.DB.prepare('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
  await audit(c.env.DB, m.id, 'item_restore', 'item', id, before, null)
  return c.json({ ok: true })
})

/* ---------- bayaran ---------- */
type SplitIn = {
  recipient: string; channel: string; account?: string; amount: any
  receivedCurrency: string; receivedAmount?: any; date: string; reference?: string
}

ledgerRoutes.post('/payments', async (c) => {
  const m = await requireMember(c, 'record_payment')
  const ct = (c.req.header('content-type') || '').toLowerCase()
  let payload: any = {}
  const files: { bytes: ArrayBuffer; name: string; mime: string; size: number; recipient: string }[] = []

  if (ct.includes('multipart/form-data')) {
    const form = await c.req.formData()
    payload = JSON.parse(String(form.get('payload') || '{}'))
    const push = async (f: File, recipient = '') => {
      if (!f || typeof f === 'string') return
      const buf = await f.arrayBuffer()
      if (!buf.byteLength) throw bad(`${f.name}: fail kosong.`)
      if (buf.byteLength > MAX_BYTES) throw bad(`${f.name}: melebihi had 10MB.`)
      const mime = sniffMime(buf)
      if (!mime) throw bad(`${f.name}: kandungan bukan JPG, PNG, WebP atau PDF.`)
      files.push({ bytes: buf, name: f.name.slice(0, 200), mime, size: buf.byteLength, recipient })
    }
    for (const entry of form.getAll('proofs')) if (entry instanceof File) await push(entry)
    for (const [k, v] of form.entries()) {
      const mm = /^splitProof:(\d+)$/.exec(k)
      if (mm && v instanceof File) await push(v, String(payload.splits?.[Number(mm[1])]?.recipient || ''))
    }
  } else {
    payload = await c.req.json().catch(() => ({}))
  }

  const { itemId, month, date, amount, reference, payroll, paySource, payMethod } = payload
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(String(itemId)).first<any>()
  if (!item) throw bad('Komitmen tidak ditemui.')
  requireSpace(m, item.entity)
  if (!RX_MONTH.test(String(month))) throw bad('Bulan tidak sah.')
  const key = `${itemId}:${month}`
  const exists = await c.env.DB.prepare('SELECT key FROM payments WHERE key = ?').bind(key).first<any>()
  if (exists) throw bad('Bulan ini sudah direkod sebagai selesai.')
  if (!validDate(String(date))) throw bad('Tarikh selesai tidak sah.')
  const amt = jsonNum(amount)
  if (!(amt > 0) || amt > 1e14) throw bad('Jumlah dibayar mesti lebih daripada 0.')
  const ref = String(reference || '').trim().slice(0, 200)
  const income = item.type === 'income'

  // pecahan penerima
  const rawSplits: SplitIn[] = Array.isArray(payload.splits) ? payload.splits : []
  const splits = rawSplits.length
    ? rawSplits.map((s, i) => {
        const n = i + 1
        const recipient = String(s.recipient || '').trim()
        if (!recipient || recipient.length > 150) throw bad(`Penerima ${n}: nama diperlukan.`)
        if (!CHANNELS.includes(s.channel)) throw bad(`Penerima ${n}: saluran tidak sah.`)
        const a = jsonNum(s.amount)
        if (!(a > 0)) throw bad(`Penerima ${n}: jumlah mesti lebih daripada 0.`)
        if (!CURRENCIES.includes(s.receivedCurrency as any)) throw bad(`Penerima ${n}: mata wang diterima tidak sah.`)
        const ra = jsonNum(s.receivedAmount)
        if (ra != null && !(ra > 0)) throw bad(`Penerima ${n}: amaun diterima tidak sah.`)
        if (!validDate(String(s.date))) throw bad(`Penerima ${n}: tarikh tidak sah.`)
        return {
          recipient, channel: s.channel, account: String(s.account || '').trim().slice(0, 200),
          amount: a, receivedCurrency: s.receivedCurrency as 'MYR' | 'IDR', receivedAmount: ra,
          date: String(s.date), reference: String(s.reference || '').trim().slice(0, 200),
          hasProof: files.some((f) => f.recipient === recipient),
        }
      })
    : null
  if (splits) {
    const sum = splits.reduce((x, s) => x + s.amount, 0)
    if (Math.abs(sum - amt) >= 0.005) throw bad(`Jumlah pecahan (${sum.toLocaleString()}) mesti sama dengan jumlah penuh (${amt.toLocaleString()}).`)
    for (const s of splits) if (!s.hasProof) throw bad(`Bukti bayaran diperlukan untuk penerima ${s.recipient}.`)
  }
  // bukti wajib untuk duit keluar (bukan split)
  if (!income && !splits && !files.filter((f) => !f.recipient).length) {
    throw bad('Upload sekurang-kurangnya satu bukti bayaran sebelum sahkan.')
  }

  // butiran gaji PT
  let pr: any = null
  if (payroll && Object.values(payroll).some((v) => v !== '' && v != null)) {
    pr = {}
    for (const k of ['pokok', 'elaun', 'ot', 'bonus', 'potongan']) {
      const v = jsonNum((payroll as any)[k])
      if (v != null && (Number.isNaN(v) || v < 0)) throw bad('Butiran gaji tidak sah.')
      pr[k] = v
    }
    pr.thp = (pr.pokok || 0) + (pr.elaun || 0) + (pr.ot || 0) + (pr.bonus || 0) - (pr.potongan || 0)
    if (Math.abs(pr.thp - amt) >= 0.005) throw bad(`THP dikira (${pr.thp.toLocaleString()}) tidak sama dengan jumlah dibayar.`)
  }

  // tulis fail ke storan dahulu — jika satu gagal, tiada bayaran disimpan
  const docIds: string[] = []
  const at = new Date().toISOString()
  for (const f of files) {
    const id = crypto.randomUUID()
    const storageKey = `documents/${id}`
    await putBytes(c.env, storageKey, f.bytes, f.mime)
    const sha = await sha256Hex(f.bytes)
    await c.env.DB.prepare(
      `INSERT INTO documents (id, item_id, month, kind, recipient, name, mime, size, sha256, storage_key,
                              original_object_id, uploaded_at, uploaded_by)
       VALUES (?,?,?,'receipt',?,?,?,?,?,?,NULL,?,?)`
    )
      .bind(id, String(itemId), String(month), f.recipient, f.name, f.mime, f.size, sha, storageKey, at, m.id)
      .run()
    docIds.push(id)
  }

  if (paySource) {
    const known = ['wise', 'hlb-xboss', 'cimb-shukrie', 'swipey', 'mandiri-xboss', 'mandiri-shukrie']
    const custom = await c.env.DB.prepare('SELECT id FROM pay_sources WHERE id = ?').bind(paySource).first<any>()
    if (!known.includes(paySource) && !custom) throw bad('Sumber bayaran tidak sah.')
  }
  if (payMethod && !PAY_METHODS.includes(payMethod)) throw bad('Cara bayaran tidak sah.')

  await c.env.DB.prepare(
    `INSERT INTO payments (key, item_id, month, date, amount, currency, reference, name_snapshot, pay_source,
                           pay_method, payroll, source, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'app', ?, ?)`
  )
    .bind(key, String(itemId), String(month), String(date), amt, item.currency, ref, item.name,
      income ? null : (paySource || null), income ? null : (payMethod || null), pr ? JSON.stringify(pr) : null, m.id, at)
    .run()

  if (splits) {
    for (const [i, s] of splits.entries()) {
      await c.env.DB.prepare(
        `INSERT INTO payment_splits (payment_key, n, recipient, channel, account, amount, received_currency,
                                     received_amount, date, reference)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
        .bind(key, i + 1, s.recipient, s.channel, s.account, s.amount, s.receivedCurrency, s.receivedAmount, s.date, s.reference)
        .run()
    }
  }
  await audit(c.env.DB, m.id, 'payment_record', 'payment', key, null, { amount: amt, date, reference: ref, docs: docIds.length, splits: splits ? splits.length : 0 })
  return c.json({ ok: true, key, documents: docIds.length })
})

/* ---------- lampiran ---------- */
ledgerRoutes.post('/documents', async (c) => {
  const m = await requireMember(c, 'upload_doc')
  const form = await c.req.formData()
  const itemId = String(form.get('itemId') || '')
  const month = String(form.get('month') || '')
  const kind = String(form.get('kind') || '')
  const recipient = String(form.get('recipient') || '').slice(0, 150)
  if (!RX_MONTH.test(month)) throw bad('Bulan tidak sah.')
  if (!['invoice', 'receipt'].includes(kind)) throw bad('Jenis lampiran tidak sah.')
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first<any>()
  if (!item) throw bad('Rekod tidak ditemui.')
  requireSpace(m, item.entity)
  const list = form.getAll('files').filter((f) => f instanceof File) as File[]
  if (!list.length) throw bad('Pilih sekurang-kurangnya satu fail.')
  const at = new Date().toISOString()
  let n = 0
  for (const f of list) {
    const buf = await f.arrayBuffer()
    if (!buf.byteLength) throw bad(`${f.name}: fail kosong.`)
    if (buf.byteLength > MAX_BYTES) throw bad(`${f.name}: melebihi had 10MB.`)
    const mime = sniffMime(buf)
    if (!mime) throw bad(`${f.name}: kandungan bukan JPG, PNG, WebP atau PDF.`)
    const id = crypto.randomUUID()
    const storageKey = `documents/${id}`
    await putBytes(c.env, storageKey, buf, mime)
    const sha = await sha256Hex(buf)
    await c.env.DB.prepare(
      `INSERT INTO documents (id, item_id, month, kind, recipient, name, mime, size, sha256, storage_key,
                              original_object_id, uploaded_at, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?)`
    )
      .bind(id, itemId, month, kind, recipient, f.name.slice(0, 200), mime, buf.byteLength, sha, storageKey, at, m.id)
      .run()
    n++
  }
  await audit(c.env.DB, m.id, 'document_upload', 'item', itemId, null, { month, kind, count: n })
  return c.json({ ok: true, count: n })
})

ledgerRoutes.get('/documents/:id/file', async (c) => {
  const m = await currentMember(c)
  if (!m) return c.json({ error: 'Sesi tamat. Sila log masuk semula.' }, 401)
  const id = c.req.param('id')
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>()
  if (!doc) return c.json({ error: 'Fail tidak dijumpai' }, 404)
  const item = await c.env.DB.prepare('SELECT entity FROM items WHERE id = ?').bind(doc.item_id).first<any>()
  requireSpace(m, item ? item.entity : '')
  const got = await getBytes(c.env, doc.storage_key)
  if (!got) return c.json({ error: 'Fail tiada dalam storan' }, 404)
  return new Response(got.bytes, {
    headers: {
      'Content-Type': doc.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

ledgerRoutes.delete('/documents/:id', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id')
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<any>()
  if (!doc) throw bad('Fail tidak dijumpai.')
  if (doc.original_object_id) throw bad('Lampiran import asal tidak boleh dibuang.')
  const item = await c.env.DB.prepare('SELECT entity FROM items WHERE id = ?').bind(doc.item_id).first<any>()
  requireSpace(m, item ? item.entity : '')
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
  await audit(c.env.DB, m.id, 'document_delete', 'document', id, doc, null)
  return c.json({ ok: true })
})

/* ---------- duit masuk sekali (item 'once' + penerimaan serentak) ---------- */
ledgerRoutes.post('/income', async (c) => {
  const m = await requireMember(c, 'add_income')
  const ct = (c.req.header('content-type') || '').toLowerCase()
  let body: any = {}
  let files: { bytes: ArrayBuffer; name: string; mime: string; size: number }[] = []
  if (ct.includes('multipart/form-data')) {
    const form = await c.req.formData()
    body = JSON.parse(String(form.get('payload') || '{}'))
    for (const f of form.getAll('files')) {
      if (!(f instanceof File)) continue
      const buf = await f.arrayBuffer()
      if (buf.byteLength > MAX_BYTES) throw bad(`${f.name}: melebihi had 10MB.`)
      const mime = sniffMime(buf)
      if (!mime) throw bad(`${f.name}: kandungan bukan JPG, PNG, WebP atau PDF.`)
      files.push({ bytes: buf, name: f.name.slice(0, 200), mime, size: buf.byteLength })
    }
  } else body = await c.req.json().catch(() => ({}))

  const { name, entity, currency, amount, date, source, note } = body
  if (!validDate(String(date))) throw bad('Tarikh terima tidak sah.')
  const a = jsonNum(amount)
  if (!(a > 0)) throw bad('Amaun mesti lebih daripada 0.')
  if (!INCOME_SOURCES.includes(String(source))) throw bad('Pilih sumber duit masuk.')
  if (!ACCOUNTS.some((x) => x.id === entity)) throw bad('Pilih ruang kewangan.')
  if (!CURRENCIES.includes(currency)) throw bad('Mata wang tidak sah.')
  requireSpace(m, entity)
  const month = String(date).slice(0, 7)
  const id = 'app-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 7)
  const at = new Date().toISOString()
  const scope = ACCOUNTS.find((x) => x.id === entity)!.scope
  await c.env.DB.prepare(
    `INSERT INTO items (id, name, entity, scope, currency, amount, day, start, end_month, frequency, category, type,
                        note, pay_source, pay_method, vehicle_id, source, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,NULL,'once',?,'income',?,NULL,NULL,NULL,'app',?,?,?)`
  )
    .bind(id, String(name).trim().slice(0, 150), entity, scope, currency, a, Number(String(date).slice(8)), month, String(source), String(note || '').slice(0, 1000), at, at, m.id)
    .run()
  for (const f of files) {
    const did = crypto.randomUUID()
    const storageKey = `documents/${did}`
    await putBytes(c.env, storageKey, f.bytes, f.mime)
    const sha = await sha256Hex(f.bytes)
    await c.env.DB.prepare(
      `INSERT INTO documents (id, item_id, month, kind, recipient, name, mime, size, sha256, storage_key,
                              original_object_id, uploaded_at, uploaded_by)
       VALUES (?,?,?,'receipt','',?,?,?,?,?,NULL,?,?)`
    )
      .bind(did, id, month, f.name, f.mime, f.size, sha, storageKey, at, m.id)
      .run()
  }
  await c.env.DB.prepare(
    `INSERT INTO payments (key, item_id, month, date, amount, currency, reference, name_snapshot, pay_source,
                           pay_method, payroll, source, created_by, created_at)
     VALUES (?,?,?,?,?,?,'',? ,NULL,NULL,NULL,'app',?,?)`
  )
    .bind(`${id}:${month}`, id, month, String(date), a, currency, String(name).trim().slice(0, 150), m.id, at)
    .run()
  await audit(c.env.DB, m.id, 'income_add', 'item', id, null, { amount: a, entity, currency, date, source })
  return c.json({ ok: true, id })
})

/* ---------- kadar tukaran ---------- */
ledgerRoutes.post('/rate', async (c) => {
  const m = await requireMember(c, 'set_rate')
  const body = await c.req.json().catch(() => ({}))
  const v = Number(body.idrPerMyr)
  if (!(v > 0) || v > 1e7) throw bad('Kadar tidak sah.')
  await c.env.DB.prepare(
    `INSERT INTO fx_rate (user_scope, idr_per_myr, set_on, set_by) VALUES ('owner', ?, ?, ?)
     ON CONFLICT(user_scope) DO UPDATE SET idr_per_myr = excluded.idr_per_myr, set_on = excluded.set_on, set_by = excluded.set_by`
  )
    .bind(v, todayISO(), m.id)
    .run()
  await audit(c.env.DB, m.id, 'rate_set', 'fx_rate', 'owner', null, { idrPerMyr: v })
  return c.json({ ok: true })
})

ledgerRoutes.delete('/rate', async (c) => {
  const m = await requireMember(c, 'set_rate')
  await c.env.DB.prepare(`DELETE FROM fx_rate`).run()
  await audit(c.env.DB, m.id, 'rate_clear', 'fx_rate', 'owner', null, null)
  return c.json({ ok: true })
})

/* ---------- sumber bayaran tersuai ---------- */
ledgerRoutes.post('/sources', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name || name.length > 80) throw bad('Nama sumber bayaran diperlukan.')
  const dup = await c.env.DB.prepare('SELECT id FROM pay_sources WHERE lower(name) = lower(?)').bind(name).first<any>()
  if (dup) throw bad('Sumber ini sudah ada.')
  const id = 'src-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 5)
  const short = name.length > 16 ? name.slice(0, 15) + '…' : name
  const cur = CURRENCIES.includes(body.currency) ? body.currency : ''
  await c.env.DB.prepare('INSERT INTO pay_sources (id, name, short, kind, currency, color, ink, custom, sort) VALUES (?,?,?,?,?,?,?,1,?)')
    .bind(id, name, short, String(body.kind || 'Bank'), cur, '#6b3fd4', '#fff', 100)
    .run()
  await audit(c.env.DB, m.id, 'source_add', 'pay_source', id, null, { name })
  return c.json({ ok: true, id })
})

/* ---------- dokumen rujukan (BUKAN bukti bayaran) ---------- */
ledgerRoutes.get('/refdocs/:file', async (c) => {
  const m = await currentMember(c)
  if (!m) return c.json({ error: 'Sesi tamat.' }, 401)
  const file = c.req.param('file')
  // Aset rujukan disimpan sebagai WebP (dikecilkan) + satu PDF. Nama asal .png dipetakan.
  const base = file.replace(/\.(png|jpe?g|webp|pdf)$/i, '')
  const allowed = ['Akaun_Alphard', 'Akaun_Vista_Hill', 'Komitmen_IDR_Asal', 'Payroll_Indonesia_November_2026', 'Yuran_Al_Rahman_November', 'Yuran_LC_November']
  if (!allowed.includes(base)) return c.json({ error: 'Tidak dijumpai' }, 404)
  const candidates = [base + '.webp', base + '.pdf']
  let bytes: ArrayBuffer | null = null
  for (const cand of candidates) {
    try {
      bytes = assetBytes(cand)
      break
    } catch {
      /* cuba calon seterusnya */
    }
  }
  if (!bytes) return c.json({ error: 'Dokumen rujukan tiada dalam bundle' }, 404)
  const mime = sniffMime(bytes)
  return new Response(bytes, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
