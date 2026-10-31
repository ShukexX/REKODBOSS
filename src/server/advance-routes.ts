import { Hono } from 'hono'
import type { Env } from '../lib/db'
import { audit, listAdvances } from '../lib/db'
import { bad, requireMember, requireSpace } from './helpers'
import { ACCOUNTS, CURRENCIES } from '../lib/constants'
import { RX_MONTH, validDate } from '../lib/date'

export const advanceRoutes = new Hono<{ Bindings: Env }>()

advanceRoutes.get('/advances', async (c) => {
  const m = await requireMember(c)
  return c.json({ advances: await listAdvances(c.env.DB, m.spaces) })
})

advanceRoutes.post('/advances', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const b = await c.req.json().catch(() => ({}))
  const employeeName = String(b.employeeName || '').trim()
  const entity = String(b.entity || '')
  const currency = String(b.currency || 'MYR')
  const principal = Number(b.principal)
  const issuedDate = String(b.issuedDate || '')
  const startMonth = String(b.startMonth || issuedDate.slice(0, 7))
  if (!employeeName) throw bad('Nama pekerja diperlukan.')
  if (!ACCOUNTS.some((a) => a.id === entity)) throw bad('Ruang kewangan tidak sah.')
  requireSpace(m, entity)
  if (!CURRENCIES.includes(currency as any) || !(principal > 0)) throw bad('Jumlah advance tidak sah.')
  if (!validDate(issuedDate) || !RX_MONTH.test(startMonth)) throw bad('Tarikh atau bulan mula tidak sah.')
  const id = 'adv-' + crypto.randomUUID().slice(0, 8)
  const at = new Date().toISOString()
  await c.env.DB.prepare(`INSERT INTO employee_advances (id, employee_name, entity, currency, principal, issued_date, start_month, reason, note, status, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?)`)
    .bind(id, employeeName, entity, currency, principal, issuedDate, startMonth, String(b.reason || '').slice(0, 500), String(b.note || '').slice(0, 1000), at, m.id).run()
  await audit(c.env.DB, m.id, 'advance_add', 'employee_advance', id, null, { employeeName, principal, currency })
  return c.json({ ok: true, id })
})

advanceRoutes.post('/advances/:id/repayments', async (c) => {
  const m = await requireMember(c, 'edit_item')
  const id = c.req.param('id'); const b = await c.req.json().catch(() => ({}))
  const row = await c.env.DB.prepare('SELECT * FROM employee_advances WHERE id = ?').bind(id).first<any>()
  if (!row) throw bad('Advance tidak ditemui.')
  requireSpace(m, row.entity)
  const month = String(b.month || ''); const date = String(b.date || '')
  const amount = Number(b.amount)
  if (!RX_MONTH.test(month) || !validDate(date) || !(amount > 0)) throw bad('Bulan, tarikh atau jumlah bayaran balik tidak sah.')
  const total = await c.env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM employee_advance_repayments WHERE advance_id = ?').bind(id).first<any>()
  if (amount > Math.max(0, Number(row.principal) - Number(total?.total || 0))) throw bad('Jumlah melebihi baki hutang.')
  const rid = 'adr-' + crypto.randomUUID().slice(0, 8)
  await c.env.DB.prepare('INSERT INTO employee_advance_repayments (id, advance_id, month, amount, date, note, created_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
    .bind(rid, id, month, amount, date, String(b.note || '').slice(0, 500), new Date().toISOString(), m.id).run()
  await audit(c.env.DB, m.id, 'advance_repayment', 'employee_advance', id, null, { month, amount })
  return c.json({ ok: true, id: rid })
})
