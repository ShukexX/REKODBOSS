import type { Context } from 'hono'
import type { Env, Member } from '../lib/db'
import { currentMember, can, type Capability } from '../lib/auth'
import { getMeta } from '../lib/db'
import { SCHEMA_SQL } from '../lib/schema'

export type Ctx = Context<{ Bindings: Env }>

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const bad = (msg: string) => new HttpError(400, msg)
export const forbidden = (msg = 'Tiada akses.') => new HttpError(403, msg)

/* ---------- bootstrap skema + seed (lazy) ---------- */
let readyFlag = false

export async function ensureReady(env: Env) {
  if (readyFlag) return
  let ok = true
  try {
    await env.DB.prepare('SELECT 1 FROM meta LIMIT 1').first()
  } catch {
    ok = false
  }
  if (!ok) {
    // D1 exec menerima berbilang statement; jalankan satu per satu untuk keselamatan.
    const stmts = SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)
    for (const s of stmts) {
      try {
        await env.DB.exec(s + ';')
      } catch (e: any) {
        if (!/already exists/i.test(e?.message || '')) throw e
      }
    }
  }
  const seeded = await getMeta(env.DB, 'seed_version')
  if (!seeded) {
    const { ensureInitialized } = await import('../lib/seed')
    await ensureInitialized(env)
  }
  readyFlag = true
}

/* ---------- pengesahan sesi ---------- */
export async function requireMember(c: Ctx, cap: Capability = 'read'): Promise<Member> {
  const m = await currentMember(c)
  if (!m) throw new HttpError(401, 'Sesi tamat. Sila log masuk semula.')
  if (m.status === 'disabled') throw forbidden('Akses akaun ini telah dimatikan.')
  if (!can(m.role, cap)) throw forbidden('Peranan anda tidak dibenarkan untuk tindakan ini.')
  return m
}

export function requireSpace(m: Member, entity: string) {
  if (m.role === 'owner') return
  if (!(m.spaces || []).includes(entity)) throw forbidden('Ruang ini tidak dibenarkan untuk akaun anda.')
}

/* ---------- CSRF: asal permintaan mesti sama ---------- */
export function checkOrigin(c: Ctx) {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return
  const origin = c.req.header('origin')
  if (!origin) return // klien bukan pelayar (curl/ujian) — cookie sesi tetap diperlukan
  const host = c.req.header('host')
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, 'Permintaan dari asal tidak sah.')
  } catch {
    throw new HttpError(403, 'Permintaan dari asal tidak sah.')
  }
}

/* ---------- util ---------- */
export const jsonNum = (v: any) => (v === '' || v == null ? null : Number(v))
