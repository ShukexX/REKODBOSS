import { CURRENCIES, type Currency, type PaySource, PAY_SOURCES } from './constants'
import { addMonths, addDays, addMonthsDate, daysBetween, dueDate, monthLabel, todayISO, curMonth } from './date'

export type Item = {
  id: string
  name: string
  entity: string
  scope: string
  currency: Currency
  amount: number | null
  day: number | null
  start: string | null
  endMonth: string | null
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'once'
  category: string
  type: 'expense' | 'income'
  note: string
  paySource: string | null
  payMethod: string | null
  vehicleId: string | null
  source: 'import' | 'user' | 'app'
  deleted?: boolean
  deletedAt?: string | null
  createdAt?: string
}

export type Split = {
  recipient: string
  channel: string
  account: string
  amount: number
  receivedCurrency: Currency
  receivedAmount: number | null
  date: string
  reference: string
}

export type Payroll = { pokok: number | null; elaun: number | null; ot: number | null; bonus: number | null; potongan: number | null; thp: number }

export type Payment = {
  key: string
  itemId: string
  month: string
  date: string
  amount: number
  currency: Currency
  reference: string
  nameSnapshot: string
  paySource: string | null
  payMethod: string | null
  payroll: Payroll | null
  splits: Split[] | null
  source: string
  createdAt: string
}

export type Doc = {
  id: string
  itemId: string
  month: string
  kind: 'invoice' | 'receipt'
  recipient: string
  name: string
  mime: string
  size: number
  sha256: string
  storageKey: string
  originalObjectId: string | null
  uploadedAt: string
  uploadedBy: string | null
}

export type Vehicle = {
  id: string
  name: string
  plate: string
  entity: string
  currency: Currency
  linkedItemId: string | null
  roadtaxExpiry: string | null
  roadtaxAmount: number | null
  insuranceExpiry: string | null
  insuranceAmount: number | null
  insurer: string
  readyDays: number
  serviceIntervalMonths: number
  lastServiceDate: string | null
  lastServiceKm: number | null
  serviceEstimate: number | null
  note: string
  history: any[]
  source?: string
}

export type Occurrence = {
  income: boolean
  item: Item
  month: string
  key: string
  payment: Payment | null
  due: string | null
  docs: Doc[]
  status: 'paid' | 'unpaid' | 'overdue' | 'received' | 'expected'
  amount: number | null
  currency: Currency
}

export type Totals = {
  count: number
  known: number
  unknown: number
  paid: number
  unpaid: number
  overdue: number
  paidCount: number
  overdueCount: number
  unpaidCount: number
  income: number
  incomeExpected: number
  incomePending: number
  incomeCount: number
  incomeRecvCount: number
  incomeUnknown: number
  bySource: Record<string, { expected: number; received: number; n: number }>
  pct?: number
  cashNow?: number
  cashEnd?: number
}

export function occursInMonth(it: Item, month: string): boolean {
  if (!it.start || it.start > month) return false
  if (it.endMonth && month > it.endMonth) return false
  const [sy, sm] = it.start.split('-').map(Number)
  const [y, m] = month.split('-').map(Number)
  const gap = (y - sy) * 12 + m - sm
  return (
    it.frequency === 'monthly' ||
    (it.frequency === 'quarterly' && gap % 3 === 0) ||
    (it.frequency === 'yearly' && gap % 12 === 0) ||
    (it.frequency === 'once' && gap === 0)
  )
}

export function nextOccurrence(it: Item, from: string): string | null {
  if (!it.start) return null
  let m = from < it.start ? it.start : from
  for (let i = 0; i < 25; i++) {
    if (occursInMonth(it, m)) return m
    m = addMonths(m, 1)
  }
  return null
}

export const splitKey = (k: string) => {
  const i = k.lastIndexOf(':')
  return [k.slice(0, i), k.slice(i + 1)] as const
}

/* ---------- pembinaan occurrence ---------- */
export function makeOcc(
  it: Item,
  month: string,
  payment: Payment | null,
  docs: Doc[],
  today = todayISO(),
  cm = curMonth()
): Occurrence {
  const key = it.id + ':' + month
  const due = dueDate(it.day, month)
  const income = it.type === 'income'
  const overdue = !income && !payment && (due ? due < today : month < cm)
  return {
    income,
    item: it,
    month,
    key,
    payment,
    due,
    docs,
    status: payment ? (income ? 'received' : 'paid') : income ? 'expected' : overdue ? 'overdue' : 'unpaid',
    amount: payment ? payment.amount : it.amount,
    currency: ((payment && payment.currency) || it.currency) as Currency,
  }
}

export function buildOccurrences(opts: {
  items: Item[]
  payments: Payment[]
  docs: Doc[]
  month: string
  today?: string
}): Occurrence[] {
  const { items, payments, docs, month } = opts
  const today = opts.today || todayISO()
  const cm = today.slice(0, 7)
  const payMap = new Map(payments.map((p) => [p.key, p]))
  const docMap = new Map<string, Doc[]>()
  for (const d of docs) {
    const k = d.itemId + ':' + d.month
    const arr = docMap.get(k) || []
    arr.push(d)
    docMap.set(k, arr)
  }
  const active = items.filter((i) => !i.deleted)
  const list = active
    .filter((it) => occursInMonth(it, month))
    .map((it) => makeOcc(it, month, payMap.get(it.id + ':' + month) || null, docMap.get(it.id + ':' + month) || [], today, cm))
  // bayaran yang wujud untuk bulan ini walaupun jadual dipinda kemudian — sejarah tidak hilang
  const seen = new Set(list.map((o) => o.key))
  for (const p of payments) {
    if (p.month !== month || seen.has(p.key)) continue
    const it = items.find((i) => i.id === p.itemId)
    if (!it) continue
    list.push(makeOcc(it, month, p, docMap.get(p.key) || [], today, cm))
  }
  return list
}

export const blankTotals = (): Totals => ({
  count: 0, known: 0, unknown: 0, paid: 0, unpaid: 0, overdue: 0,
  paidCount: 0, overdueCount: 0, unpaidCount: 0,
  income: 0, incomeExpected: 0, incomePending: 0,
  incomeCount: 0, incomeRecvCount: 0, incomeUnknown: 0, bySource: {},
})

export function totals(occs: Occurrence[]): Record<Currency, Totals> {
  const t: any = { MYR: blankTotals(), IDR: blankTotals() }
  for (const o of occs) {
    const c = t[o.currency]
    if (!c) continue
    if (o.item.type === 'income') {
      c.incomeCount++
      const src = o.item.category || 'Lain-lain'
      const b = c.bySource[src] || (c.bySource[src] = { expected: 0, received: 0, n: 0 })
      b.n++
      if (o.amount == null) {
        c.incomeUnknown++
        continue
      }
      c.incomeExpected += o.amount
      b.expected += o.amount
      if (o.status === 'received') {
        c.income += o.amount
        c.incomeRecvCount++
        b.received += o.amount
      } else c.incomePending += o.amount
      continue
    }
    c.count++
    if (o.status === 'paid') c.paidCount++
    else if (o.status === 'overdue') {
      c.overdueCount++
      c.unpaidCount++
    } else c.unpaidCount++
    if (o.amount == null) {
      c.unknown++
      continue
    }
    c.known += o.amount
    if (o.status === 'paid') c.paid += o.amount
    else {
      c.unpaid += o.amount
      if (o.status === 'overdue') c.overdue += o.amount
    }
  }
  for (const k of CURRENCIES) {
    const c = t[k]
    c.pct = c.known ? Math.round((c.paid / c.known) * 100) : 0
    c.cashNow = c.income - c.paid
    c.cashEnd = c.incomeExpected - c.known
  }
  return t
}

/** Gabungan MYR + IDR — hanya paparan anggaran menggunakan kadar yang Boss tetapkan. */
export function combine(t: Record<Currency, Totals>, to: Currency, idrPerMyr: number | null) {
  if (!idrPerMyr) return null
  const k = idrPerMyr
  const conv = (m: number, i: number) => (to === 'MYR' ? m + i / k : m * k + i)
  const out: any = {}
  for (const f of ['known', 'paid', 'unpaid', 'overdue', 'income', 'incomeExpected', 'incomePending', 'cashNow', 'cashEnd']) out[f] = conv(t.MYR[f], t.IDR[f])
  out.incomeCount = t.MYR.incomeCount + t.IDR.incomeCount
  out.incomeRecvCount = t.MYR.incomeRecvCount + t.IDR.incomeRecvCount
  out.incomeUnknown = t.MYR.incomeUnknown + t.IDR.incomeUnknown
  out.incomePending = conv(t.MYR.incomePending, t.IDR.incomePending)
  out.bySource = {}
  for (const c of CURRENCIES) {
    for (const [s, b] of Object.entries(t[c].bySource)) {
      const o = out.bySource[s] || (out.bySource[s] = { expected: 0, received: 0, n: 0 })
      const f = (v: number) => (c === to ? v : to === 'MYR' ? v / k : v * k)
      o.expected += f(b.expected)
      o.received += f(b.received)
      o.n += b.n
    }
  }
  out.count = t.MYR.count + t.IDR.count
  out.paidCount = t.MYR.paidCount + t.IDR.paidCount
  out.unknown = t.MYR.unknown + t.IDR.unknown
  out.pct = out.known ? Math.round((out.paid / out.known) * 100) : 0
  return out
}

/** Agregat bulan mengikut sumber bayaran (perbelanjaan sahaja). */
export function bySource(occs: Occurrence[], sources: PaySource[] = PAY_SOURCES) {
  const map = new Map<string, any>()
  for (const o of occs) {
    if (o.income) continue
    const sid = (o.payment && o.payment.paySource) || o.item.paySource || ''
    const g =
      map.get(sid) ||
      { id: sid, src: sources.find((s) => s.id === sid) || null, n: 0, paidN: 0, MYR: { known: 0, paid: 0, unpaid: 0 }, IDR: { known: 0, paid: 0, unpaid: 0 }, unknown: 0 }
    g.n++
    const c = g[o.currency]
    if (o.amount == null || !c) g.unknown++
    else {
      c.known += o.amount
      if (o.status === 'paid') {
        c.paid += o.amount
        g.paidN++
      } else c.unpaid += o.amount
    }
    map.set(sid, g)
  }
  return [...map.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.n - a.n)
}

export function pendingItems(items: Item[]) {
  return items.filter((i) => !i.deleted && !i.endMonth && (!i.start || i.amount == null))
}

/* ---------- kenderaan ---------- */
export function vehicleStatus(v: Vehicle, today = todayISO()) {
  const out: any[] = []
  for (const kind of ['roadtax', 'insurance'] as const) {
    const exp = v[kind + 'Expiry' as 'roadtaxExpiry']
    const amount = v[kind + 'Amount' as 'roadtaxAmount']
    if (!exp) {
      out.push({ v, kind, status: 'missing', amount })
      continue
    }
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
    out.push({
      v, kind: 'service',
      status: days < 0 ? 'expired' : days <= 14 ? 'due' : 'ok',
      date: next, days, ready: addDays(next, -14), amount: v.serviceEstimate, last: v.lastServiceDate,
    })
  }
  return out
}

export function vehicleAlerts(vehicles: Vehicle[], today = todayISO()) {
  const rank: Record<string, number> = { expired: 0, due: 1, ok: 2, missing: 3 }
  return vehicles
    .filter((v) => !(v as any).deleted)
    .flatMap((v) => vehicleStatus(v, today))
    .filter((a) => a.status !== 'ok' || a.days <= 60)
    .sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.days ?? 999) - (b.days ?? 999)))
}

export { monthLabel }
