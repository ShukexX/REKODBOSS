import type { Env } from './db'
import { audit, getMeta, setMeta } from './db'
import { ASSET_FILES } from '../seed/assets'
import { REFDOC_FILES } from '../seed/refdocs'
import snapshotJson from '../seed/data/02_DATA_SEMASA.json'
import { DELETED_IDS, USER_ADDITIONS, VEHICLE_SEEDS, PAY_SOURCES } from './constants'
import { putBytes, hasBytes } from './storage'
import { sha256Hex } from './auth'

export const SNAPSHOT: any = snapshotJson
export const SNAPSHOT_EXPORTED_AT: string = SNAPSHOT.exported_at
export const SNAPSHOT_REVISION: number = SNAPSHOT.revision

const nowISO = () => new Date().toISOString()

export function assetBytes(rel: string): ArrayBuffer {
  const b64 = ASSET_FILES[rel] || REFDOC_FILES[rel]
  if (!b64) throw new Error('Aset tidak dijumpai: ' + rel)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** Magic-byte sniff — PDF/PNG/JPEG/WebP (bukan berdasarkan sambungan fail). */
export function sniffMime(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf.slice(0, 12))
  const s = (a: number, z: number) => String.fromCharCode(...b.slice(a, z))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return 'image/png'
  if (s(0, 5) === '%PDF-') return 'application/pdf'
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp'
  return ''
}

export type ImportResult = {
  items: { added: number; skipped: number }
  payments: { added: number; skipped: number }
  docs: { added: number; skipped: number }
  additions: { added: number; skipped: number }
  vehicles: { added: number; skipped: number }
}

/**
 * Import snapshot SEKALI sahaja, idempotent:
 *  - items  : ON CONFLICT DO NOTHING (ID asal dikekalkan)
 *  - payments: ON CONFLICT DO NOTHING (kunci '<itemId>:<YYYY-MM>')
 *  - docs   : bytes daripada aset asal → storan persendirian; sha256 & saiz disahkan
 * Tidak menyentuh 06_SENARAI_ASAL_RUJUKAN.json dan tidak menghidupkan semula
 * import-personal-my-alrahman-fee-nov.
 */
export async function importSnapshot(env: Env, ownerId: string | null): Promise<ImportResult> {
  const res: ImportResult = {
    items: { added: 0, skipped: 0 },
    payments: { added: 0, skipped: 0 },
    docs: { added: 0, skipped: 0 },
    additions: { added: 0, skipped: 0 },
    vehicles: { added: 0, skipped: 0 },
  }
  const db = env.DB
  const at = nowISO()

  for (const it of SNAPSHOT.ledger.items as any[]) {
    if (DELETED_IDS.includes(it.id)) continue
    const paySource = /Sumber: Mandiri XBOSS ASIA GROUP/i.test(it.note || '') ? 'mandiri-xboss' : null
    const r = await db
      .prepare(
        `INSERT INTO items (id, name, entity, scope, currency, amount, day, start, end_month, frequency, category, type,
                            note, pay_source, pay_method, vehicle_id, source, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,'import',?,?,?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(
        it.id, it.name, it.entity, it.scope, it.currency,
        it.amount ?? null, it.day ?? null, it.start ?? null, it.end_month ?? it.endMonth ?? null,
        it.frequency, it.category, it.type, it.note || '',
        paySource, it.pay_method ?? null, at, at, ownerId
      )
      .run()
    if (r.meta.changes > 0) res.items.added++
    else res.items.skipped++
  }

  for (const [key, p] of Object.entries(SNAPSHOT.ledger.payments || {}) as [string, any][]) {
    const i = key.lastIndexOf(':')
    const itemId = key.slice(0, i)
    const month = key.slice(i + 1)
    const it = (SNAPSHOT.ledger.items as any[]).find((x) => x.id === itemId)
    const r = await db
      .prepare(
        `INSERT INTO payments (key, item_id, month, date, amount, currency, reference, name_snapshot, pay_source,
                               pay_method, payroll, source, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,'import',?,?)
         ON CONFLICT(key) DO NOTHING`
      )
      .bind(key, itemId, month, p.date, p.amount, it ? it.currency : 'MYR', p.reference || '', it ? it.name : itemId, ownerId, at)
      .run()
    if (r.meta.changes > 0) {
      res.payments.added++
      for (const [n, s] of ((p.splits || []) as any[]).entries()) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO payment_splits (payment_key, n, recipient, channel, account, amount, received_currency,
                                                   received_amount, date, reference)
             VALUES (?,?,?,?,?,?,?,?,?,?)`
          )
          .bind(key, n + 1, s.recipient, s.channel, s.account || '', s.amount, s.receivedCurrency || 'IDR', s.receivedAmount ?? null, s.date || p.date, s.reference || '')
          .run()
      }
    } else res.payments.skipped++
  }

  for (const d of SNAPSHOT.documents as any[]) {
    const existing = await db.prepare('SELECT id FROM documents WHERE original_object_id = ?').bind(d.original_object_id).first<any>()
    if (existing) {
      res.docs.skipped++
      continue
    }
    const bytes = assetBytes(d.local_file)
    const size = bytes.byteLength
    const sha = await sha256Hex(bytes)
    if (size !== d.size || sha !== d.sha256) {
      throw new Error(`Lampiran ${d.metadata.name}: saiz/SHA-256 tidak sepadan dengan manifest (${size} B / ${sha.slice(0, 12)}…).`)
    }
    const mime = sniffMime(bytes)
    if (mime !== d.metadata.mime) throw new Error(`Lampiran ${d.metadata.name}: MIME kandungan ${mime} ≠ ${d.metadata.mime}.`)
    const storageKey = `documents/${d.original_object_id}`
    if (!(await hasBytes(env, storageKey))) await putBytes(env, storageKey, bytes, mime)
    await db
      .prepare(
        `INSERT INTO documents (id, item_id, month, kind, recipient, name, mime, size, sha256, storage_key,
                                original_object_id, uploaded_at, uploaded_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(
        crypto.randomUUID(), d.record_id, d.month, d.metadata.kind, d.metadata.recipient || '', d.metadata.name,
        mime, size, sha, storageKey, d.original_object_id, d.uploaded || at, ownerId
      )
      .run()
    res.docs.added++
  }

  // 6.3 Tambahan Boss selepas snapshot — 3 caruman AIA (Sumber: 'user')
  for (const u of USER_ADDITIONS) {
    const r = await db
      .prepare(
        `INSERT INTO items (id, name, entity, scope, currency, amount, day, start, end_month, frequency, category, type,
                            note, pay_source, pay_method, vehicle_id, source, created_at, updated_at, created_by)
         VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL,NULL,NULL,'user',?,?,?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(u.id, u.name, u.entity, u.scope, u.currency, u.amount, u.day, u.start, u.frequency, u.category, u.type, u.note, at, at, ownerId)
      .run()
    if (r.meta.changes > 0) res.additions.added++
    else res.additions.skipped++
  }

  // 6.7 kenderaan — hanya nama & plat; semua tarikh/amaun kekal null
  for (const v of VEHICLE_SEEDS) {
    const linked = (SNAPSHOT.ledger.items as any[]).find((x) => x.id === v.linked)
    if (!linked) continue
    const r = await db
      .prepare(
        `INSERT INTO vehicles (id, name, plate, entity, currency, linked_item_id, roadtax_expiry, roadtax_amount,
                               insurance_expiry, insurance_amount, insurer, ready_days, service_interval_months,
                               last_service_date, last_service_km, service_estimate, note, source, created_at)
         VALUES (?,?,?,?,?,?,NULL,NULL,NULL,NULL,'',30,3,NULL,NULL,NULL,'','seed',?)
         ON CONFLICT(id) DO NOTHING`
      )
      .bind(v.id, v.name, v.plate, linked.entity, linked.currency, v.linked, at)
      .run()
    if (r.meta.changes > 0) res.vehicles.added++
    else res.vehicles.skipped++
  }

  await setMeta(db, 'imported_at', at)
  await setMeta(db, 'snapshot_revision', String(SNAPSHOT_REVISION))
  await setMeta(db, 'snapshot_exported_at', SNAPSHOT_EXPORTED_AT)
  return res
}

/** Jalankan sekali semasa permintaan pertama (lazy bootstrap). */
export async function ensureInitialized(env: Env) {
  const done = await getMeta(env.DB, 'seed_version')
  if (done === '1') return false
  const owner = await env.DB.prepare(
    `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role = 'owner' LIMIT 1`
  ).first<any>()
  const res = await importSnapshot(env, owner ? owner.id : null)
  await setMeta(env.DB, 'seed_version', '1')
  await audit(env.DB, owner ? owner.id : null, 'import', 'ledger', null, null, res)
  return true
}

/** Cipta ahli pemilik (bootstrap). E-mel pemilik disimpan; jemputan pasangan dibuat kemudian. */
export async function ensureOwner(env: Env, email: string, name = 'Muhammad Shukrie') {
  const at = nowISO()
  const existing = await env.DB.prepare(`SELECT u.id, u.email FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role='owner' LIMIT 1`).first<any>()
  const allSpaces = JSON.stringify(['personal-my', 'personal-id', 'xboss-my', 'xboss-id'])
  if (existing) {
    if (!existing.email) {
      await env.DB.prepare('UPDATE users SET email = ?, name = ? WHERE id = ?').bind(email.trim().toLowerCase(), name, existing.id).run()
      return existing.id as string
    }
    return existing.id as string
  }
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?,?,?,?)').bind(id, email.trim().toLowerCase(), name, at).run()
  await env.DB.prepare(`INSERT INTO memberships (user_id, role, spaces, status) VALUES (?, 'owner', ?, 'active')`).bind(id, allSpaces).run()
  return id
}

export const DEFAULT_SOURCES = PAY_SOURCES
