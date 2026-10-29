import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { audit, listVehicles } from '../lib/db'
import { bad, jsonNum, requireMember, requireSpace } from './helpers'
import { ACCOUNTS, CURRENCIES } from '../lib/constants'
import { validDate, addDays, addMonthsDate } from '../lib/date'
import { putBytes } from '../lib/storage'
import { sniffMime } from '../lib/seed'
import { sha256Hex } from '../lib/auth'

export const vehicleRoutes = new Hono<{ Bindings: Env }>()

const MAX_BYTES = 10 * 1024 * 1024

vehicleRoutes.get('/vehicles', async (c) => {
  const m = await requireMember(c)
  return c.json({ vehicles: await listVehicles(c.env.DB, m.spaces) })
})

function validateVehicle(d: any) {
  const name = String(d.name || '').trim()
  const plate = String(d.plate || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!name) throw bad('Nama / model kenderaan diperlukan.')
  if (!plate || plate.length > 12) throw bad('No. pendaftaran diperlukan.')
  if (!ACCOUNTS.some((a) => a.id === d.entity)) throw bad('Pilih ruang kewangan.')
  if (!CURRENCIES.includes(d.currency)) throw bad('Mata wang tidak sah.')
  const dt = (v: any, l: string) => {
    if (!v) return null
    if (!validDate(String(v))) throw bad(l + ' tidak sah.')
    return String(v)
  }
  const am = (v: any, l: string) => {
    const n = jsonNum(v)
    if (n != null && !(n > 0)) throw bad(l + ' mesti lebih daripada 0, atau kosongkan.')
    return n
  }
  const iv = Number(d.serviceIntervalMonths ?? 3)
  if (!Number.isInteger(iv) || iv < 1 || iv > 24) throw bad('Selang servis 1–24 bulan.')
  const rd = Number(d.readyDays ?? 30)
  if (!Number.isInteger(rd) || rd < 0 || rd > 180) throw bad('Tempoh sedia duit tidak sah.')
  const km = jsonNum(d.lastServiceKm)
  if (km != null && !(km >= 0)) throw bad('Bacaan odometer tidak sah.')
  return {
    name, plate, entity: d.entity, currency: d.currency,
    roadtaxExpiry: dt(d.roadtaxExpiry, 'Tarikh tamat roadtax'),
    roadtaxAmount: am(d.roadtaxAmount, 'Anggaran roadtax'),
    insuranceExpiry: dt(d.insuranceExpiry, 'Tarikh tamat insurans'),
    insuranceAmount: am(d.insuranceAmount, 'Anggaran insurans'),
    insurer: String(d.insurer || '').trim().slice(0, 100),
    readyDays: rd, serviceIntervalMonths: iv,
    lastServiceDate: dt(d.lastServiceDate, 'Tarikh servis terakhir'),
    lastServiceKm: km,
    serviceEstimate: am(d.serviceEstimate, 'Anggaran servis'),
    note: String(d.note || '').slice(0, 500),
  }
}

vehicleRoutes.post('/vehicles', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const body = await c.req.json().catch(() => ({}))
  const f = validateVehicle(body)
  requireSpace(m, f.entity)
  const id = 'veh-' + f.plate.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 6)
  const at = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO vehicles (id, name, plate, entity, currency, linked_item_id, roadtax_expiry, roadtax_amount,
                           insurance_expiry, insurance_amount, insurer, ready_days, service_interval_months,
                           last_service_date, last_service_km, service_estimate, note, source, created_at)
     VALUES (?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,'app',?)`
  )
    .bind(f.id ? id : id, f.name, f.plate, f.entity, f.currency, f.roadtaxExpiry, f.roadtaxAmount, f.insuranceExpiry, f.insuranceAmount, f.insurer, f.readyDays, f.serviceIntervalMonths, f.lastServiceDate, f.lastServiceKm, f.serviceEstimate, f.note, at)
    .run()
  await audit(c.env.DB, m.id, 'vehicle_create', 'vehicle', id, null, f)
  return c.json({ ok: true, id })
})

vehicleRoutes.patch('/vehicles/:id', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Kenderaan tidak ditemui.')
  requireSpace(m, before.entity)
  const body = await c.req.json().catch(() => ({}))
  const f = validateVehicle({ ...before, ...body })
  requireSpace(m, f.entity)
  await c.env.DB.prepare(
    `UPDATE vehicles SET name=?, plate=?, entity=?, currency=?, roadtax_expiry=?, roadtax_amount=?, insurance_expiry=?,
                         insurance_amount=?, insurer=?, ready_days=?, service_interval_months=?, last_service_date=?,
                         last_service_km=?, service_estimate=?, note=? WHERE id=?`
  )
    .bind(f.name, f.plate, f.entity, f.currency, f.roadtaxExpiry, f.roadtaxAmount, f.insuranceExpiry, f.insuranceAmount, f.insurer, f.readyDays, f.serviceIntervalMonths, f.lastServiceDate, f.lastServiceKm, f.serviceEstimate, f.note, id)
    .run()
  await audit(c.env.DB, m.id, 'vehicle_update', 'vehicle', id, before, f)
  return c.json({ ok: true })
})

vehicleRoutes.delete('/vehicles/:id', async (c) => {
  const m = await requireMember(c, 'delete_item')
  const id = c.req.param('id')
  const before = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first<any>()
  if (!before) throw bad('Kenderaan tidak ditemui.')
  requireSpace(m, before.entity)
  await c.env.DB.prepare('UPDATE vehicles SET deleted_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
  await audit(c.env.DB, m.id, 'vehicle_delete', 'vehicle', id, before, null)
  return c.json({ ok: true })
})

/** Rekod belanja sekali (roadtax / insurans / servis) + bukti wajib + sejarah. */
async function vehicleExpense(
  env: Env,
  userId: string,
  v: any,
  opts: { label: string; date: string; amount: number; reference?: string; note?: string; files: File[] }
) {
  if (!validDate(opts.date)) throw bad('Tarikh bayaran tidak sah.')
  if (!(opts.amount > 0)) throw bad('Amaun mesti lebih daripada 0.')
  if (!opts.files.length) throw bad('Upload resit / bukti bayaran sebelum sahkan.')
  const month = opts.date.slice(0, 7)
  const at = new Date().toISOString()
  const id = 'app-' + opts.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 7)
  const name = `${opts.label} — ${v.name} ${v.plate}`
  await env.DB.prepare(
    `INSERT INTO items (id, name, entity, scope, currency, amount, day, start, end_month, frequency, category, type,
                        note, pay_source, pay_method, vehicle_id, source, created_at, updated_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,NULL,'once','Kenderaan','expense',?,NULL,NULL,?,'app',?,?,?)`
  )
    .bind(id, name, v.entity, v.scope || 'Peribadi', v.currency, opts.amount, Number(opts.date.slice(8)), month, String(opts.note || '').slice(0, 1000), v.id, at, at, userId)
    .run()
  const scopeRow = await env.DB.prepare('SELECT scope FROM items WHERE id = ?').bind(id).first<any>()
  if (scopeRow && !scopeRow.scope) {
    await env.DB.prepare('UPDATE items SET scope = ? WHERE id = ?').bind(ACCOUNTS.find((a) => a.id === v.entity)?.scope || 'Peribadi', id).run()
  }
  for (const f of opts.files) {
    const buf = await f.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw bad(`${f.name}: melebihi had 10MB.`)
    const mime = sniffMime(buf)
    if (!mime) throw bad(`${f.name}: kandungan bukan JPG, PNG, WebP atau PDF.`)
    const did = crypto.randomUUID()
    const storageKey = `documents/${did}`
    await putBytes(env, storageKey, buf, mime)
    await env.DB.prepare(
      `INSERT INTO documents (id, item_id, month, kind, recipient, name, mime, size, sha256, storage_key,
                              original_object_id, uploaded_at, uploaded_by)
       VALUES (?,?,?,'receipt','',?,?,?,?,?,NULL,?,?)`
    )
      .bind(did, id, month, f.name.slice(0, 200), mime, buf.byteLength, await sha256Hex(buf), storageKey, at, userId)
      .run()
  }
  await env.DB.prepare(
    `INSERT INTO payments (key, item_id, month, date, amount, currency, reference, name_snapshot, pay_source,
                           pay_method, payroll, source, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,'app',?,?)`
  )
    .bind(`${id}:${month}`, id, month, opts.date, opts.amount, v.currency, String(opts.reference || '').slice(0, 200), name, userId, at)
    .run()
  return { itemId: id, month }
}

async function readMultipart(c: any) {
  const ct = (c.req.header('content-type') || '').toLowerCase()
  if (!ct.includes('multipart/form-data')) return { payload: await c.req.json().catch(() => ({})), files: [] as File[] }
  const form = await c.req.formData()
  const payload = JSON.parse(String(form.get('payload') || '{}'))
  const files = form.getAll('files').filter((f) => f instanceof File) as File[]
  return { payload, files }
}

function plus12(iso: string | null): string | null {
  if (!iso) return null
  return addMonthsDate(iso, 12)
}

vehicleRoutes.post('/vehicles/:id/renewal', async (c) => {
  const m = await requireMember(c, 'record_payment')
  const id = c.req.param('id')
  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first<any>()
  if (!v) throw bad('Kenderaan tidak ditemui.')
  requireSpace(m, v.entity)
  const { payload, files } = await readMultipart(c)
  const kind = String(payload.kind || 'both')
  const doR = kind === 'roadtax' || kind === 'both'
  const doI = kind === 'insurance' || kind === 'both'
  const ra = doR ? jsonNum(payload.roadtaxAmount) : 0
  const ia = doI ? jsonNum(payload.insuranceAmount) : 0
  if (doR && !(ra > 0)) throw bad('Masukkan amaun roadtax.')
  if (doI && !(ia > 0)) throw bad('Masukkan amaun insurans.')
  if (doR && !validDate(String(payload.roadtaxNewExpiry || ''))) throw bad('Tarikh tamat roadtax baharu tidak sah.')
  if (doI && !validDate(String(payload.insuranceNewExpiry || ''))) throw bad('Tarikh tamat insurans baharu tidak sah.')
  const label = kind === 'both' ? 'Roadtax + Insurans' : doR ? 'Roadtax' : 'Insurans'
  const parts = [
    doR && `Roadtax ${ra} (tamat ${payload.roadtaxNewExpiry})`,
    doI && `Insurans ${ia}${payload.insurer ? ' · ' + payload.insurer : ''} (tamat ${payload.insuranceNewExpiry})`,
  ]
    .filter(Boolean)
    .join('; ')
  const ref = await vehicleExpense(c.env, m.id, v, {
    label, date: String(payload.date), amount: (ra || 0) + (ia || 0), reference: payload.reference, note: parts, files,
  })
  const at = new Date().toISOString()
  if (doR) {
    await c.env.DB.prepare('UPDATE vehicles SET roadtax_expiry = ?, roadtax_amount = ? WHERE id = ?').bind(payload.roadtaxNewExpiry, ra, id).run()
    await c.env.DB.prepare('INSERT INTO vehicle_history (id, vehicle_id, kind, date, amount, expiry, item_id, month) VALUES (?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), id, 'roadtax', String(payload.date), ra, payload.roadtaxNewExpiry, ref.itemId, ref.month)
      .run()
  }
  if (doI) {
    await c.env.DB.prepare('UPDATE vehicles SET insurance_expiry = ?, insurance_amount = ?, insurer = COALESCE(NULLIF(?, \'\'), insurer) WHERE id = ?')
      .bind(payload.insuranceNewExpiry, ia, String(payload.insurer || ''), id)
      .run()
    await c.env.DB.prepare('INSERT INTO vehicle_history (id, vehicle_id, kind, date, amount, expiry, provider, item_id, month) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), id, 'insurance', String(payload.date), ia, payload.insuranceNewExpiry, String(payload.insurer || ''), ref.itemId, ref.month)
      .run()
  }
  await audit(c.env.DB, m.id, 'vehicle_renewal', 'vehicle', id, null, { kind, ra, ia, at })
  return c.json({ ok: true, ...ref })
})

vehicleRoutes.post('/vehicles/:id/service', async (c) => {
  const m = await requireMember(c, 'record_payment')
  const id = c.req.param('id')
  const v = await c.env.DB.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first<any>()
  if (!v) throw bad('Kenderaan tidak ditemui.')
  requireSpace(m, v.entity)
  const { payload, files } = await readMultipart(c)
  const amount = jsonNum(payload.amount)
  if (!(amount > 0)) throw bad('Masukkan kos servis.')
  const km = jsonNum(payload.km)
  const interval = Number(payload.interval || v.service_interval_months)
  const note = [payload.workshop, km != null ? km + ' km' : '', payload.note].filter(Boolean).join(' · ')
  const ref = await vehicleExpense(c.env, m.id, v, {
    label: 'Servis', date: String(payload.date), amount, note, files,
  })
  await c.env.DB.prepare(
    'UPDATE vehicles SET last_service_date = ?, last_service_km = ?, service_estimate = ?, service_interval_months = ? WHERE id = ?'
  )
    .bind(String(payload.date), km ?? v.last_service_km, amount, interval, id)
    .run()
  await c.env.DB.prepare('INSERT INTO vehicle_history (id, vehicle_id, kind, date, amount, km, workshop, note, item_id, month) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), id, 'service', String(payload.date), amount, km, String(payload.workshop || '').slice(0, 100), String(payload.note || '').slice(0, 300), ref.itemId, ref.month)
    .run()
  await audit(c.env.DB, m.id, 'vehicle_service', 'vehicle', id, null, { amount, km })
  return c.json({ ok: true, ...ref })
})
