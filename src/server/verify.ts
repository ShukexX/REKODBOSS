import type { Env } from '../lib/db'
import { SNAPSHOT, SNAPSHOT_REVISION, SNAPSHOT_EXPORTED_AT, assetBytes, sniffMime } from '../lib/seed'
import { SCHEDULE_ROWS } from '../seed/schedule'
import { ACCOUNTS, DELETED_IDS, USER_ADDITIONS } from '../lib/constants'
import { occursInMonth } from "../lib/domain"
import { sha256Hex } from '../lib/auth'
import { getBytes } from '../lib/storage'

export type Check = {
  group: string
  label: string
  expected: string
  actual: string
  ok: boolean
  note?: string | null
}

const IMG_TOTAL = 10400
const FIXED: Record<string, [number, number]> = {
  'personal-my': [6, 9486],
  'personal-id': [3, 5400],
  'xboss-my': [7, 15500],
  'xboss-id': [14, 136219803],
}

/**
 * Semakan migrasi server-side — dibina semula daripada RB.verify() (prototaip).
 * Membaca DB langsung, manifest, jadual 03E dan bytes lampiran dalam storan.
 */
export async function runVerify(env: Env) {
  const checks: Check[] = []
  const add = (group: string, label: string, expected: any, actual: any, ok?: boolean, note?: string | null) =>
    checks.push({
      group,
      label,
      expected: String(expected),
      actual: String(actual),
      ok: ok ?? String(expected) === String(actual),
      note: note || null,
    })

  const sItems = SNAPSHOT.ledger.items as any[]
  const sPayments = SNAPSHOT.ledger.payments as Record<string, any>
  const sDocs = SNAPSHOT.documents as any[]

  /* ---------- 1. import berulang (simulasi pangkalan sementara) ---------- */
  const sim = (db: { items: Set<string>; payments: Set<string>; docs: Set<string> }) => {
    const r = { items: 0, payments: 0, docs: 0 }
    for (const it of sItems) {
      if (DELETED_IDS.includes(it.id)) continue
      if (db.items.has(it.id)) continue
      db.items.add(it.id)
      r.items++
    }
    for (const k of Object.keys(sPayments || {})) {
      if (db.payments.has(k)) continue
      db.payments.add(k)
      r.payments++
    }
    for (const d of sDocs) {
      if (db.docs.has(d.original_object_id)) continue
      db.docs.add(d.original_object_id)
      r.docs++
    }
    return r
  }
  const tmp = { items: new Set<string>(), payments: new Set<string>(), docs: new Set<string>() }
  const r1 = sim(tmp)
  const r2 = sim(tmp)
  add('Import', 'Import pertama: komitmen ditambah', sItems.length, r1.items)
  add('Import', 'Import pertama: bayaran ditambah', Object.keys(sPayments).length, r1.payments)
  add('Import', 'Import pertama: lampiran ditambah', sDocs.length, r1.docs)
  add('Import', 'Import kedua: rekod baharu (mesti 0)', 0, r2.items + r2.payments + r2.docs)
  add('Import', 'Selepas 2× import: jumlah komitmen', sItems.length, tmp.items.size)
  add('Import', 'ID komitmen unik dalam snapshot', sItems.length, new Set(sItems.map((i) => i.id)).size)

  /* ---------- 2. komitmen dalam pangkalan langsung ---------- */
  const liveRows = await env.DB.prepare('SELECT * FROM items').all()
  const live = (liveRows.results || []) as any[]
  const byId = new Map(live.map((r) => [r.id, r]))
  const F = ['name', 'entity', 'currency', 'amount', 'day', 'start', 'frequency', 'note', 'category', 'type'] as const
  let present = 0
  let same = 0
  const edited: string[] = []
  for (const s of sItems) {
    const l = byId.get(s.id)
    if (!l) continue
    present++
    const eq = F.every((f) => {
      const lv = l[f]
      const sv = s[f] ?? null
      if (typeof sv === 'number') return Number(lv) === sv
      return (lv ?? null) === sv
    })
    if (eq) same++
    else edited.push(s.name)
  }
  add('Komitmen', 'Komitmen snapshot wujud dalam sistem', sItems.length, present)
  add(
    'Komitmen',
    'Medan sama dengan snapshot',
    sItems.length,
    same,
    same === sItems.length,
    edited.length ? 'Dipinda: ' + edited.join(', ') : null
  )
  for (const a of ACCOUNTS) {
    const n = sItems.filter((i) => i.entity === a.id).length
    const liveN = live.filter((i) => i.source === 'import' && i.entity === a.id).length
    add('Komitmen', `${a.name}: bilangan`, n, liveN)
  }
  for (const id of DELETED_IDS) {
    add('Komitmen', `Rekod dipadam tidak dihidupkan (${id})`, 'tiada', byId.has(id) ? 'WUJUD' : 'tiada')
  }
  add(
    'Komitmen',
    'Personal Indonesia: semua gaji dalam MYR',
    'MYR',
    [...new Set(sItems.filter((i) => i.entity === 'personal-id').map((i) => i.currency))].join('/')
  )
  add(
    'Komitmen',
    'PT XBOSS Asia Group: semua dalam IDR',
    'IDR',
    [...new Set(sItems.filter((i) => i.entity === 'xboss-id').map((i) => i.currency))].join('/')
  )

  /* ---------- 3. pindaan terkini ---------- */
  const g = (id: string) => byId.get(id) || ({} as any)
  add('Pindaan', 'Komisen Noralfiza — amaun', 2800, g('import-myr-komisen-noralfiza').amount)
  add('Pindaan', 'Vista Hill — bulan mula', '2026-12', g('import-personal-my-vista-hill').start)
  add(
    'Pindaan',
    'Vista Hill — nota MAC/JUN/SEPT/DEC',
    'ada',
    /MAC , JUN , SEPT, DEC/.test(g('import-personal-my-vista-hill').note || '') ? 'ada' : 'tiada'
  )
  add('Pindaan', 'Tadika LC Aakif — hari', 1, g('import-personal-my-lc-aakif').day)
  for (const [id, n] of [
    ['import-idr-ruko-xboss', 'Ruko XBOSS'],
    ['import-idr-rumah-batam-2003', 'Rumah Batam 2003'],
    ['import-idr-rumah-batam-2001', 'Rumah Batam 2001'],
    ['import-idr-central-hill', 'Central Hill'],
  ]) {
    add('Pindaan', `${n} — hari`, 20, g(id).day)
  }

  /* ---------- 4. bayaran ---------- */
  const payRows: {
    key: string
    itemId: string
    month: string
    expectedAmount: number
    expectedDate: string
    currency: string
    ok: boolean
    live: any
  }[] = []
  for (const [k, p] of Object.entries(sPayments || {})) {
    const i = k.lastIndexOf(':')
    const itemId = k.slice(0, i)
    const month = k.slice(i + 1)
    const row = await env.DB.prepare('SELECT * FROM payments WHERE key = ?').bind(k).first<any>()
    const item = byId.get(itemId)
    const ok = !!row && Number(row.amount) === p.amount && row.date === p.date && (row.reference || '') === (p.reference || '') && !!item
    add(
      'Bayaran',
      `${(item && item.name) || itemId} · ${month}`,
      `${p.amount} · ${p.date}`,
      row ? `${Number(row.amount)} · ${row.date}` : 'TIADA',
      ok
    )
    payRows.push({
      key: k, itemId, month, expectedAmount: p.amount, expectedDate: p.date,
      currency: item ? item.currency : 'MYR', ok, live: row,
    })
  }
  const sumMYR = payRows.filter((r) => r.currency === 'MYR').reduce((s, r) => s + (r.live ? Number(r.live.amount) : 0), 0)
  add('Bayaran', 'Jumlah bayaran selesai MYR (import)', IMG_TOTAL, sumMYR)
  add('Bayaran', 'Jumlah bayaran selesai IDR (import)', 0, payRows.filter((r) => r.currency === 'IDR').length)
  const splitCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_splits').first<{ n: number }>()
  add('Bayaran', 'Rekod pecahan penerima (03C kosong)', 0, splitCount?.n || 0)
  const importPay = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE source = 'import'`).first<{ n: number }>()
  add('Bayaran', 'Tiada bayaran baharu dicipta daripada import', Object.keys(sPayments).length, importPay?.n || 0)

  /* ---------- 5. lampiran — bytes, saiz, SHA-256 ---------- */
  const docRows: any[] = []
  for (const d of sDocs) {
    let size: number | null = null
    let sha: string | null = null
    let mime: string | null = null
    let error: string | null = null
    let openable = false
    const row = await env.DB.prepare('SELECT * FROM documents WHERE original_object_id = ?').bind(d.original_object_id).first<any>()
    try {
      const got = row ? await getBytes(env, row.storage_key) : null
      if (!got) throw new Error('tiada dalam storan')
      const buf = got.bytes
      size = buf.byteLength
      sha = await sha256Hex(buf)
      mime = sniffMime(buf)
      openable = !!mime
    } catch (e: any) {
      error = e.message
    }
    // pembandingan bytes asal dalam bundle (yang diimport)
    let srcSha: string | null = null
    let srcSize: number | null = null
    try {
      const srcBytes = assetBytes(d.local_file)
      srcSize = srcBytes.byteLength
      srcSha = await sha256Hex(srcBytes)
    } catch (e: any) {
      error = error || e.message
    }
    const linked = !!row && !!(await env.DB.prepare('SELECT key FROM payments WHERE key = ?').bind(`${d.record_id}:${d.month}`).first<any>())
    const ok =
      !error && size === d.size && sha === d.sha256 && srcSha === d.sha256 && srcSize === d.size &&
      mime === d.metadata.mime && linked && openable
    add(
      'Lampiran',
      d.metadata.name,
      `${d.size} B · ${d.sha256.slice(0, 12)}…`,
      error ? 'GAGAL: ' + error : `${size} B · ${(sha || '').slice(0, 12)}…`,
      ok
    )
    docRows.push({
      id: row ? row.id : null,
      name: d.metadata.name,
      mime: mime,
      expectedMime: d.metadata.mime,
      kind: d.metadata.kind,
      recordId: d.record_id,
      month: d.month,
      size,
      expectedSize: d.size,
      sha,
      expectedSha: d.sha256,
      linked,
      ok,
      error,
    })
  }

  /* ---------- 6. jadual 03E ---------- */
  let schedOk = 0
  const schedRows = SCHEDULE_ROWS.map((r) => {
    const its = sItems.filter((i) => i.entity === r.entity && occursInMonth(i as any, r.month))
    const cnt = its.length
    const tot = its.reduce((s, i) => s + (i.amount || 0), 0)
    const ok = cnt === r.scheduled_count && Math.abs(tot - r.known_total) < 0.005
    if (ok) schedOk++
    return { ...r, cnt, tot, ok }
  })
  add('Jadual', 'Baris jadual 03E (Okt 2026 – Dis 2027) sepadan', SCHEDULE_ROWS.length, schedOk)

  /* ---------- 7. jumlah bulanan tetap ---------- */
  for (const a of ACCOUNTS) {
    const m = sItems.filter((i) => i.entity === a.id && i.frequency === 'monthly')
    const sum = m.reduce((s, i) => s + i.amount, 0)
    add('Jadual', `${a.name}: bulanan tetap`, `${FIXED[a.id][0]} · ${FIXED[a.id][1].toLocaleString()}`, `${m.length} · ${sum.toLocaleString()}`)
  }

  /* ---------- 8. tambahan Boss selepas snapshot ---------- */
  for (const u of USER_ADDITIONS) {
    const l: any = byId.get(u.id)
    add(
      'Tambahan Boss',
      u.name,
      `${u.amount} · hari ${u.day} · mula ${u.start}`,
      l ? `${Number(l.amount)} · hari ${l.day} · mula ${l.start}` : 'TIADA',
      !!l && Number(l.amount) === u.amount && Number(l.day) === u.day && l.start === u.start
    )
  }
  const aia = live.filter((i) => /^user-aia-/.test(i.id))
  add('Tambahan Boss', 'Insurans AIA tanpa pendua', USER_ADDITIONS.length, aia.length)
  add('Tambahan Boss', 'Tidak bercampur dengan rekod import', sItems.length, live.filter((i) => i.source === 'import').length)

  const passed = checks.filter((c) => c.ok).length
  return {
    checks,
    passed,
    total: checks.length,
    payRows: payRows.map((r) => ({ ...r, live: r.live ? { amount: Number(r.live.amount), date: r.live.date, reference: r.live.reference } : null })),
    docRows,
    schedRows,
    byAcc: ACCOUNTS.map((a) => ({
      id: a.id,
      name: a.name,
      n: sItems.filter((i) => i.entity === a.id).length,
      cur: [...new Set(sItems.filter((i) => i.entity === a.id).map((i) => i.currency))],
    })),
    snapMeta: { exported_at: SNAPSHOT_EXPORTED_AT, revision: SNAPSHOT_REVISION },
    generated_at: new Date().toISOString(),
  }
}
