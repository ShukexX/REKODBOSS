import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { audit, getRate, listDocs, listItems, listPayments, listVehicles } from '../lib/db'
import { requireMember } from './helpers'
import { runVerify } from './verify'
import { buildOccurrences, totals, splitKey } from '../lib/domain'
import { ACCOUNTS, PAY_SOURCES } from '../lib/constants'
import { monthLabel, todayISO } from '../lib/date'
import { getBytes } from '../lib/storage'

export const miscRoutes = new Hono<{ Bindings: Env }>()

/* ---------- Semakan migrasi ---------- */
miscRoutes.get('/verify', async (c) => {
  await requireMember(c)
  return c.json(await runVerify(c.env))
})

/* ---------- eksport CSV ---------- */
const csvCell = (v: any) => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const asText = (v: any) => (v == null || v === '' ? '' : `="${String(v).replace(/"/g, '""')}"`)

const STATUS_MS: Record<string, string> = {
  paid: 'Selesai', overdue: 'Tertunggak', unpaid: 'Belum bayar', received: 'Diterima', expected: 'Dijangka',
}

miscRoutes.get('/export/csv', async (c) => {
  const m = await requireMember(c, 'export')
  const month = c.req.query('month') || todayISO().slice(0, 7)
  const entity = c.req.query('entity') || ''
  const [items, payments, docs] = await Promise.all([
    listItems(c.env.DB, m.spaces),
    listPayments(c.env.DB, m.spaces),
    listDocs(c.env.DB, m.spaces),
  ])
  const occs = buildOccurrences({ items, payments, docs, month }).filter((o) => !entity || o.item.entity === entity)
  const rows: any[][] = [
    ['bulan', 'ruang', 'id', 'nama', 'kategori', 'sumber_bayaran', 'cara_bayaran', 'mata_wang', 'amaun_jadual',
      'status', 'tarikh_perlu_bayar', 'amaun_dibayar', 'tarikh_dibayar', 'rujukan', 'bil_penerima', 'bil_lampiran', 'nota'],
  ]
  for (const o of occs) {
    const sid = (o.payment && o.payment.paySource) || o.item.paySource
    const src = PAY_SOURCES.find((s) => s.id === sid)
    rows.push([
      month, o.item.entity, o.item.id, o.item.name, o.item.category, src ? src.name : '',
      (o.payment && o.payment.payMethod) || o.item.payMethod || '', o.currency, o.item.amount ?? '',
      STATUS_MS[o.status], o.due || '', o.payment ? o.payment.amount : '', o.payment ? o.payment.date : '',
      o.payment ? asText(o.payment.reference) : '', o.payment && o.payment.splits ? o.payment.splits.length : 0,
      o.docs.length, o.item.note,
    ])
  }
  const csv =
    '\uFEFF' +
    rows.map((r) => r.map((cell) => (String(cell).startsWith('="') ? '"' + String(cell).replace(/"/g, '""') + '"' : csvCell(cell))).join(',')).join('\r\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rekod-boss-${entity || 'semua'}-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
})

/* ---------- backup penuh JSON + lampiran (base64) ---------- */
miscRoutes.get('/export/backup', async (c) => {
  const m = await requireMember(c, 'backup')
  const [items, payments, docs, vehicles, rate] = await Promise.all([
    listItems(c.env.DB, m.spaces),
    listPayments(c.env.DB, m.spaces),
    listDocs(c.env.DB, m.spaces),
    listVehicles(c.env.DB, m.spaces),
    getRate(c.env.DB),
  ])
  const files: any[] = []
  for (const d of docs) {
    const got = await getBytes(c.env, d.storageKey)
    if (!got) continue
    const b = new Uint8Array(got.bytes)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < b.length; i += chunk) bin += String.fromCharCode(...b.subarray(i, i + chunk))
    files.push({ ...d, base64: btoa(bin) })
  }
  const payload = {
    exported_at: new Date().toISOString(),
    app: 'Rekod Boss',
    accounts: ACCOUNTS,
    rate,
    items,
    payments,
    vehicles,
    documents: files,
  }
  await audit(c.env.DB, m.id, 'backup', 'export', null, null, { docs: files.length })
  return new Response(JSON.stringify(payload, null, 1), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="rekod-boss-backup-${todayISO()}.json"`,
      'Cache-Control': 'no-store',
    },
  })
})

/* ---------- ringkasan audit (Ketua: log aktiviti) ---------- */
miscRoutes.get('/audit', async (c) => {
  const m = await requireMember(c)
  const rs = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT 100').all()
  return c.json({ entries: rs.results || [], role: m.role })
})
