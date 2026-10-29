/* Rekod Boss — logik domain klien (padanan data.js prototaip).
   Semua status/jumlah dikira daripada data server; tiada data kewangan disimpan dalam localStorage. */
import { CURRENCIES } from './lib.js'

export const occursInMonth = (it, month) => {
  if (!it.start || it.start > month) return false
  if (it.endMonth && month > it.endMonth) return false
  const [sy, sm] = it.start.split('-').map(Number)
  const [y, m] = month.split('-').map(Number)
  const gap = (y - sy) * 12 + m - sm
  return it.frequency === 'monthly' || (it.frequency === 'quarterly' && gap % 3 === 0) ||
    (it.frequency === 'yearly' && gap % 12 === 0) || (it.frequency === 'once' && gap === 0)
}

export const dueDate = (day, month) => {
  if (day == null) return null
  const [y, m] = month.split('-').map(Number)
  const dim = new Date(y, m, 0).getDate()
  return `${month}-${String(Math.min(day, dim)).padStart(2, '0')}`
}

export function buildOccurrences({ items, payments, docs, month, today, cm }) {
  const payMap = new Map(payments.map((p) => [p.key, p]))
  const docMap = new Map()
  for (const d of docs || []) {
    const k = d.itemId + ':' + d.month
    docMap.set(k, [...(docMap.get(k) || []), d])
  }
  const occ = (it, payment) => {
    const key = it.id + ':' + month
    const due = dueDate(it.day, month)
    const income = it.type === 'income'
    const overdue = !income && !payment && (due ? due < today : month < cm)
    return {
      income, item: it, month, key, payment, due, docs: docMap.get(key) || [],
      status: payment ? (income ? 'received' : 'paid') : income ? 'expected' : overdue ? 'overdue' : 'unpaid',
      amount: payment ? payment.amount : it.amount,
      currency: (payment && payment.currency) || it.currency,
    }
  }
  const active = items.filter((i) => !i.deleted)
  const list = active.filter((it) => occursInMonth(it, month)).map((it) => occ(it, payMap.get(it.id + ':' + month) || null))
  const seen = new Set(list.map((o) => o.key))
  for (const p of payments) {
    if (p.month !== month || seen.has(p.key)) continue
    const it = items.find((i) => i.id === p.itemId)
    // Jangan masukkan bayaran sejarah milik rekod yang telah dipadam.
    if (!it || it.deleted) continue
    list.push(occ(it, p))
  }
  return list
}

const blank = () => ({ count: 0, known: 0, unknown: 0, paid: 0, unpaid: 0, overdue: 0, paidCount: 0, overdueCount: 0, unpaidCount: 0, income: 0, incomeExpected: 0, incomePending: 0, incomeCount: 0, incomeRecvCount: 0, incomeUnknown: 0, bySource: {} })

export function totals(occs) {
  const t = { MYR: blank(), IDR: blank() }
  for (const o of occs) {
    const c = t[o.currency]
    if (!c) continue
    if (o.item.type === 'income') {
      c.incomeCount++
      const src = o.item.category || 'Lain-lain'
      const b = c.bySource[src] || (c.bySource[src] = { expected: 0, received: 0, n: 0 })
      b.n++
      if (o.amount == null) { c.incomeUnknown++; continue }
      c.incomeExpected += o.amount; b.expected += o.amount
      if (o.status === 'received') { c.income += o.amount; c.incomeRecvCount++; b.received += o.amount }
      else c.incomePending += o.amount
      continue
    }
    c.count++
    if (o.status === 'paid') c.paidCount++
    else if (o.status === 'overdue') { c.overdueCount++; c.unpaidCount++ }
    else c.unpaidCount++
    if (o.amount == null) { c.unknown++; continue }
    c.known += o.amount
    if (o.status === 'paid') c.paid += o.amount
    else { c.unpaid += o.amount; if (o.status === 'overdue') c.overdue += o.amount }
  }
  for (const k of CURRENCIES) {
    const c = t[k]
    c.pct = c.known ? Math.round((c.paid / c.known) * 100) : 0
    c.cashNow = c.income - c.paid
    c.cashEnd = c.incomeExpected - c.known
  }
  return t
}

export function combine(t, to, idrPerMyr) {
  if (!idrPerMyr) return null
  const k = idrPerMyr
  const conv = (m, i) => (to === 'MYR' ? m + i / k : m * k + i)
  const out = {}
  for (const f of ['known', 'paid', 'unpaid', 'overdue', 'income', 'incomeExpected', 'incomePending', 'cashNow', 'cashEnd']) out[f] = conv(t.MYR[f], t.IDR[f])
  out.incomeCount = t.MYR.incomeCount + t.IDR.incomeCount
  out.incomeRecvCount = t.MYR.incomeRecvCount + t.IDR.incomeRecvCount
  out.incomeUnknown = t.MYR.incomeUnknown + t.IDR.incomeUnknown
  out.bySource = {}
  for (const c of CURRENCIES) for (const [s, b] of Object.entries(t[c].bySource)) {
    const o = out.bySource[s] || (out.bySource[s] = { expected: 0, received: 0, n: 0 })
    const f = (v) => (c === to ? v : to === 'MYR' ? v / k : v * k)
    o.expected += f(b.expected); o.received += f(b.received); o.n += b.n
  }
  out.count = t.MYR.count + t.IDR.count
  out.paidCount = t.MYR.paidCount + t.IDR.paidCount
  out.unknown = t.MYR.unknown + t.IDR.unknown
  out.pct = out.known ? Math.round((out.paid / out.known) * 100) : 0
  return out
}

export function bySource(occs, sources) {
  const map = new Map()
  for (const o of occs) {
    if (o.income) continue
    const sid = (o.payment && o.payment.paySource) || o.item.paySource || ''
    const g = map.get(sid) || { id: sid, src: sources.find((s) => s.id === sid) || null, n: 0, paidN: 0, MYR: { known: 0, paid: 0, unpaid: 0 }, IDR: { known: 0, paid: 0, unpaid: 0 }, unknown: 0 }
    g.n++
    const c = g[o.currency]
    if (o.amount == null || !c) g.unknown++
    else {
      c.known += o.amount
      if (o.status === 'paid') { c.paid += o.amount; g.paidN++ } else c.unpaid += o.amount
    }
    map.set(sid, g)
  }
  return [...map.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.n - a.n)
}

export const pendingItems = (items) => items.filter((i) => !i.deleted && !i.endMonth && (!i.start || i.amount == null))

export function vehicleStatus(v, today) {
  const out = []
  const daysBetween = (a, b) => { const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }; return Math.round((p(b) - p(a)) / 864e5) }
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}` }
  const addMonthsDate = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); let mm = m + n, yy = y + Math.floor((mm - 1) / 12); mm = (((mm - 1) % 12) + 12) % 12 + 1; const dim = new Date(yy, mm, 0).getDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}` }
  for (const kind of ['roadtax', 'insurance']) {
    const exp = v[kind + 'Expiry'], amount = v[kind + 'Amount']
    if (!exp) { out.push({ v, kind, status: 'missing', amount }); continue }
    const days = daysBetween(today, exp)
    const ready = addDays(exp, -v.readyDays)
    const status = days < 0 ? 'expired' : today >= ready ? 'due' : 'ok'
    const monthsLeft = Math.max(1, Math.ceil(daysBetween(today, ready) / 30.4))
    out.push({ v, kind, status, date: exp, days, ready, amount, perMonth: amount && status === 'ok' ? amount / monthsLeft : null })
  }
  if (!v.lastServiceDate) out.push({ v, kind: 'service', status: 'missing', amount: v.serviceEstimate })
  else {
    const next = addMonthsDate(v.lastServiceDate, v.serviceIntervalMonths)
    const days = daysBetween(today, next)
    out.push({ v, kind: 'service', status: days < 0 ? 'expired' : days <= 14 ? 'due' : 'ok', date: next, days, ready: addDays(next, -14), amount: v.serviceEstimate, last: v.lastServiceDate })
  }
  return out
}

export function vehicleAlerts(vehicles, today) {
  const rank = { expired: 0, due: 1, ok: 2, missing: 3 }
  return vehicles.flatMap((v) => vehicleStatus(v, today))
    .filter((a) => a.status !== 'ok' || a.days <= 60)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.days ?? 999) - (b.days ?? 999))
}

export const recipientLine = (it) => {
  const n = (it.note || '').split(/\.\s/)[0]
  return n.length > 90 ? n.slice(0, 88) + '…' : n
}
