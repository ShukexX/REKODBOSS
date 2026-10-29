/* Salin aset sumber daripada folder handoff ke src/seed supaya boleh dibundel
   ke dalam Worker (tiada akses fail pada runtime).

   Menghasilkan:
     src/seed/data/*           snapshot + manifest (JSON)
     src/seed/assets.ts        3 PDF bukti bayaran (base64) — mesti tepat bait demi bait
     src/seed/refdocs.ts       6 dokumen rujukan (webp dikecilkan + PDF) sebagai base64
     src/seed/schedule.ts      baris jadual 03E
*/
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2] || '/home/user/design_handoff/prototaip/source'
const OUT = path.resolve('src/seed')
const DATA = path.join(OUT, 'data')

fs.mkdirSync(path.join(DATA, '05_LAMPIRAN_SEMASA'), { recursive: true })

const copy = (rel) => {
  const to = path.join(DATA, rel)
  fs.copyFileSync(path.join(SRC, rel), to)
  return fs.statSync(to).size
}

const files = fs.readdirSync(path.join(SRC, '05_LAMPIRAN_SEMASA'))
const sizes = {}
for (const rel of files) sizes['05_LAMPIRAN_SEMASA/' + rel] = copy('05_LAMPIRAN_SEMASA/' + rel)
copy('02_DATA_SEMASA.json')
copy('09_MANIFEST_SHA256.json')

const b64 = {}
for (const rel of files) b64['05_LAMPIRAN_SEMASA/' + rel] = fs.readFileSync(path.join(DATA, '05_LAMPIRAN_SEMASA', rel)).toString('base64')

fs.writeFileSync(
  path.join(OUT, 'assets.ts'),
  `/* DIJANA oleh scripts/prepare-seed.mjs — jangan sunting tangan.
   3 PDF bukti bayaran asal, base64 tepat (SHA-256 disahkan semasa import). */
export const ASSET_FILES: Record<string, string> = ` + JSON.stringify(b64) + '\n'
)

// ---- dokumen rujukan (webp dikecilkan, sudah disediakan dalam src/seed/ref)
const REF = path.join(OUT, 'ref')
const refB64 = {}
for (const f of fs.readdirSync(REF)) refB64[f] = fs.readFileSync(path.join(REF, f)).toString('base64')
fs.writeFileSync(
  path.join(OUT, 'refdocs.ts'),
  `/* DIJANA oleh scripts/prepare-seed.mjs — dokumen rujukan (bukan bukti bayaran). */
export const REFDOC_FILES: Record<string, string> = ` + JSON.stringify(refB64) + '\n'
)

// ---- jadual 03E
const csv = fs.readFileSync(path.join(SRC, '03E_JADUAL_OKT2026_DIS2027.csv'), 'utf8').replace(/^\uFEFF/, '').trim()
const lines = csv.split(/\r?\n/)
const header = lines[0].split(',')
const rows = lines.slice(1).map((l) => {
  const c = l.split(',')
  const o = {}
  header.forEach((k, i) => (o[k] = c[i]))
  return {
    month: o.month, entity: o.entity, account: o.account, currency: o.currency,
    scheduled_count: Number(o.scheduled_count), known_total: Number(o.known_total),
    unknown_amount_count: Number(o.unknown_amount_count),
  }
})
fs.writeFileSync(path.join(OUT, 'schedule.ts'), '/* DIJANA — jadual 03E */\nexport const SCHEDULE_ROWS = ' + JSON.stringify(rows) + '\n')

const total = Object.values(sizes).reduce((a, b) => a + b, 0)
console.log('bukti bayaran:', files.length, '· bait:', total, '· rujukan:', Object.keys(refB64).length, '· baris jadual:', rows.length)
console.log('assets.ts', (fs.statSync(path.join(OUT, 'assets.ts')).size / 1024).toFixed(0) + 'KB',
  '· refdocs.ts', (fs.statSync(path.join(OUT, 'refdocs.ts')).size / 1024).toFixed(0) + 'KB')
