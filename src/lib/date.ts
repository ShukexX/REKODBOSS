import { MONTHS } from './constants'

export const pad = (n: number) => String(n).padStart(2, '0')

export const RX_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
export const RX_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export function validDate(s: string): boolean {
  if (!s || !RX_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return d <= daysIn(y, m)
}

export function todayISO(clock: Date = new Date()): string {
  return `${clock.getUTCFullYear()}-${pad(clock.getUTCMonth() + 1)}-${pad(clock.getUTCDate())}`
}

export const curMonth = (clock: Date = new Date()) => todayISO(clock).slice(0, 7)

export function addMonths(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m += n
  y += Math.floor((m - 1) / 12)
  m = ((((m - 1) % 12) + 12) % 12) + 1
  return `${y}-${pad(m)}`
}

export function monthLabel(ym: string, short = false): string {
  if (!ym || !RX_MONTH.test(ym)) return ym || ''
  const [y, m] = ym.split('-').map(Number)
  const n = MONTHS[m - 1]
  return (short ? n.slice(0, 3) : n) + ' ' + y
}

export function dueDate(day: number | null, month: string): string | null {
  if (day == null) return null
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(Math.min(day, daysIn(y, m)))}`
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function addMonthsDate(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ym = addMonths(`${y}-${pad(m)}`, n)
  const [ny, nm] = ym.split('-').map(Number)
  return `${ym}-${pad(Math.min(d, daysIn(ny, nm)))}`
}

export function daysBetween(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((p(b) - p(a)) / 864e5)
}

/** Julat bulan inklusif dari start ke end (untuk arkib / jadual). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let m = from
  while (m <= to) {
    out.push(m)
    m = addMonths(m, 1)
  }
  return out
}
