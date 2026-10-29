import type { Currency, Item, Payment, Payroll, Split, Doc, Vehicle } from './domain'
import { PAY_SOURCES, type PaySource } from './constants'

export type Env = {
  DB: any
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
  DOCS?: any
  RESEND_API_KEY?: string
  MAIL_FROM?: string
  OTP_DEV_MODE?: string
  OTP_DEV_FALLBACK?: string
  AUTH_DEV_BYPASS?: string
  APP_ORIGIN?: string
  SMTP_BRIDGE_URL?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  SMTP_SECURE?: string
  SMTP_NAME?: string
}

export type Member = {
  id: string
  email: string
  name: string
  role: 'owner' | 'partner' | 'viewer'
  spaces: string[]
  status: string
}

/* ---------------- meta ---------------- */
export async function getMeta(db: any, key: string): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>()
  return r ? r.value : null
}

export async function setMeta(db: any, key: string, value: string) {
  await db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run()
}

/* ---------------- mappers ---------------- */
const num = (v: any) => (v == null ? null : Number(v))

export function rowItem(r: any): Item {
  return {
    id: r.id,
    name: r.name,
    entity: r.entity,
    scope: r.scope,
    currency: r.currency as Currency,
    amount: num(r.amount),
    day: num(r.day),
    start: r.start,
    endMonth: r.end_month,
    frequency: r.frequency,
    category: r.category,
    type: r.type,
    note: r.note || '',
    bankName: r.bank_name || '',
    bankAccount: r.bank_account || '',
    paySource: r.pay_source,
    payMethod: r.pay_method,
    vehicleId: r.vehicle_id,
    source: r.source,
    deleted: !!r.deleted_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
  }
}

export function rowPayment(r: any, splits: Split[] | null): Payment {
  return {
    key: r.key,
    itemId: r.item_id,
    month: r.month,
    date: r.date,
    amount: Number(r.amount),
    currency: r.currency,
    reference: r.reference || '',
    nameSnapshot: r.name_snapshot,
    paySource: r.pay_source,
    payMethod: r.pay_method,
    payroll: r.payroll ? (JSON.parse(r.payroll) as Payroll) : null,
    splits,
    source: r.source,
    createdAt: r.created_at,
  }
}

export function rowDoc(r: any): Doc {
  return {
    id: r.id,
    itemId: r.item_id,
    month: r.month,
    kind: r.kind,
    recipient: r.recipient || '',
    name: r.name,
    mime: r.mime,
    size: Number(r.size),
    sha256: r.sha256,
    storageKey: r.storage_key,
    originalObjectId: r.original_object_id,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
  }
}

export function rowVehicle(r: any, history: any[] = []): Vehicle {
  return {
    id: r.id,
    name: r.name,
    plate: r.plate,
    entity: r.entity,
    currency: r.currency,
    linkedItemId: r.linked_item_id,
    roadtaxExpiry: r.roadtax_expiry,
    roadtaxAmount: num(r.roadtax_amount),
    insuranceExpiry: r.insurance_expiry,
    insuranceAmount: num(r.insurance_amount),
    insurer: r.insurer || '',
    readyDays: Number(r.ready_days),
    serviceIntervalMonths: Number(r.service_interval_months),
    lastServiceDate: r.last_service_date,
    lastServiceKm: num(r.last_service_km),
    serviceEstimate: num(r.service_estimate),
    note: r.note || '',
    history,
    source: r.source,
  }
}

/* ---------------- queries ---------------- */
export async function listItems(db: any, spaces: string[]): Promise<Item[]> {
  const ph = spaces.map(() => '?').join(',')
  const rs = await db.prepare(`SELECT * FROM items WHERE entity IN (${ph}) ORDER BY created_at, id`).bind(...spaces).all()
  return (rs.results || []).map(rowItem)
}

export async function getItemRow(db: any, id: string) {
  return db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>()
}

export async function listPayments(db: any, spaces: string[]): Promise<Payment[]> {
  if (!spaces.length) return []
  const ph = spaces.map(() => '?').join(',')
  const rs = await db
    .prepare(
      `SELECT p.* FROM payments p JOIN items i ON i.id = p.item_id WHERE i.entity IN (${ph}) AND i.deleted_at IS NULL ORDER BY p.month DESC, p.date DESC`
    )
    .bind(...spaces)
    .all()
  const rows = rs.results || []
  if (!rows.length) return []
  const sp = await db
    .prepare(
      `SELECT s.* FROM payment_splits s JOIN payments p ON p.key = s.payment_key JOIN items i ON i.id = p.item_id WHERE i.entity IN (${ph}) AND i.deleted_at IS NULL ORDER BY s.payment_key, s.n`
    )
    .bind(...spaces)
    .all()
  const byKey = new Map<string, Split[]>()
  for (const s of sp.results || []) {
    const arr = byKey.get((s as any).payment_key) || []
    arr.push({
      recipient: (s as any).recipient,
      channel: (s as any).channel,
      account: (s as any).account || '',
      amount: Number((s as any).amount),
      receivedCurrency: (s as any).received_currency,
      receivedAmount: num((s as any).received_amount),
      date: (s as any).date,
      reference: (s as any).reference || '',
    })
    byKey.set((s as any).payment_key, arr)
  }
  return rows.map((r) => rowPayment(r, byKey.get((r as any).key) || null))
}

export async function listDocs(db: any, spaces: string[]): Promise<Doc[]> {
  if (!spaces.length) return []
  const ph = spaces.map(() => '?').join(',')
  const rs = await db
    .prepare(
      `SELECT d.* FROM documents d JOIN items i ON i.id = d.item_id WHERE i.entity IN (${ph}) ORDER BY d.uploaded_at DESC`
    )
    .bind(...spaces)
    .all()
  return (rs.results || []).map(rowDoc)
}

export async function listAllDocs(db: any): Promise<Doc[]> {
  const rs = await db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all()
  return (rs.results || []).map(rowDoc)
}

export async function listVehicles(db: any, spaces: string[]): Promise<Vehicle[]> {
  if (!spaces.length) return []
  const ph = spaces.map(() => '?').join(',')
  const rs = await db.prepare(`SELECT * FROM vehicles WHERE entity IN (${ph}) AND deleted_at IS NULL ORDER BY created_at`).bind(...spaces).all()
  const vs = (rs.results || []).map((r) => rowVehicle(r))
  if (!vs.length) return vs
  const hs = await db.prepare(`SELECT * FROM vehicle_history ORDER BY date DESC`).all()
  const map = new Map<string, any[]>()
  for (const h of hs.results || []) {
    const arr = map.get((h as any).vehicle_id) || []
    arr.push({
      kind: (h as any).kind,
      date: (h as any).date,
      amount: Number((h as any).amount),
      expiry: (h as any).expiry,
      km: num((h as any).km),
      workshop: (h as any).workshop,
      provider: (h as any).provider,
      note: (h as any).note,
      itemId: (h as any).item_id,
      month: (h as any).month,
    })
    map.set((h as any).vehicle_id, arr)
  }
  for (const v of vs) v.history = map.get(v.id) || []
  return vs
}

export async function listSources(db: any): Promise<PaySource[]> {
  const rs = await db.prepare('SELECT * FROM pay_sources ORDER BY sort, name').all()
  const custom = (rs.results || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    short: r.short,
    kind: r.kind,
    currency: r.currency || '',
    color: r.color,
    ink: r.ink,
    custom: !!r.custom,
  }))
  return [...PAY_SOURCES, ...custom]
}

export async function getRate(db: any): Promise<{ idrPerMyr: number; date: string } | null> {
  const r = await db.prepare('SELECT * FROM fx_rate LIMIT 1').first<any>()
  if (!r) return null
  return { idrPerMyr: Number(r.idr_per_myr), date: r.set_on }
}

export async function listMembers(db: any): Promise<Member[]> {
  const rs = await db
    .prepare(`SELECT u.id, u.email, u.name, m.role, m.spaces, m.status FROM users u JOIN memberships m ON m.user_id = u.id ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END, u.created_at`)
    .all()
  return (rs.results || []).map((r: any) => ({
    id: r.id,
    email: r.email || '',
    name: r.name,
    role: r.role,
    spaces: r.spaces ? JSON.parse(r.spaces) : [],
    status: r.status,
  }))
}

/* ---------------- audit ---------------- */
export async function audit(
  db: any,
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  before: any,
  after: any,
  ip?: string
) {
  await db
    .prepare('INSERT INTO audit_log (id, user_id, action, entity, entity_id, before, after, at, ip) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(
      crypto.randomUUID(),
      userId,
      action,
      entity,
      entityId,
      before ? JSON.stringify(before).slice(0, 4000) : null,
      after ? JSON.stringify(after).slice(0, 4000) : null,
      new Date().toISOString(),
      ip || null
    )
    .run()
}

/* ---------------- storan fail ---------------- */
export async function putFile(env: Env, key: string, bytes: ArrayBuffer, mime: string, name: string) {
  await env.DOCS.put(key, bytes, {
    httpMetadata: { contentType: mime, contentDisposition: `inline; filename="${encodeURIComponent(name)}"` },
  })
}

export async function getFile(env: Env, key: string) {
  return env.DOCS.get(key)
}

export async function hasFile(env: Env, key: string) {
  return (await env.DOCS.head(key)) !== null
}
