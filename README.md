# Rekod Boss

Sistem **merekod** kewangan peribadi & bisnes (Malaysia + Indonesia) untuk Muhammad Shukrie (“Boss Shukex”) dan isteri. Bukan pemindahan wang — satu tempat untuk lihat apa perlu dibayar, bila, kepada siapa, dari akaun mana, bukti transfer, duit masuk dan baki bulanan.

MYR dan IDR **dikira berasingan**. Gabungan hanya paparan anggaran menggunakan kadar yang Boss tetapkan sendiri.

---

## Status

| Perkara | Status |
|---|---|
| Backend (Hono + Cloudflare D1 + R2) | ✅ Siap |
| Login e-mel + OTP, senarai ahli tertutup | ✅ Siap |
| Peranan Pemilik / Pasangan / Lihat sahaja + skop ruang di pelayan | ✅ Siap |
| Import snapshot (31 item · 4 bayaran · 3 lampiran) idempotent | ✅ Siap |
| 3 insurans AIA (seksyen 6.3) | ✅ Siap |
| 2 kenderaan (Alphard Y5050, Vellfire SYQ5050) | ✅ Siap |
| 3 PDF bukti bayaran + sahkan SHA-256 | ✅ Lulus |
| Halaman Semakan Migrasi | ✅ **44/44 lulus** |
| Deploy ke Cloudflare | ⏳ **Belum** — menunggu pilihan laluan (lihat bawah) |

### Belum siap / menunggu keputusan Boss
- **Deploy**: perlu pilih sama ada (A) Genspark-hosted atau (B) akaun Cloudflare sendiri.
- **E-mel pemilik & isteri**: belum diberikan (seksyen 11 README handoff). App ada skrin persediaan untuk isi.
- **Pembekal e-mel OTP**: belum dikonfigurasi. Tanpa `RESEND_API_KEY`, kod OTP dipaparkan pada skrin (mod pembangunan sahaja).
- **UI belum diuji dalam pelayar sebenar** — alat pelayar sandbox gagal dibuka (browser closed) semasa ujian. API, aliran data dan semua aset statik (HTTP 200) sudah diuji.

---

## URL

- **Lokal (sandbox)**: http://localhost:3000
- **Produksi**: belum di-deploy

## Akaun & akses

Tiada pendaftaran awam. Pada permintaan pertama, app memaparkan **skrin persediaan** untuk menetapkan e-mel pemilik (dan pilihan e-mel isteri). Selepas itu hanya e-mel yang ada dalam `memberships` boleh log masuk.

| Peranan | Kebenaran |
|---|---|
| **Pemilik** | Semua: urus ahli, padam, eksport, backup penuh, kadar |
| **Pasangan** | Lihat & rekod bayaran, upload bukti, tambah duit masuk, edit komitmen dalam ruang dibenarkan. Tidak boleh padam / urus ahli / backup |
| **Lihat sahaja** | Baca sahaja |

Skop ruang ditapis **di pelayan** pada setiap query, muat turun fail dan mutasi (`requireSpace`), bukan di pelayar.

---

## Seni bina

```
src/
├─ index.tsx                 Hono app + bootstrap skema/seed automatik
├─ lib/
│  ├─ constants.ts           akaun, kategori, sumber bayaran, 3 tambahan AIA, dokumen rujukan
│  ├─ date.ts                tarikh/bulan (pad, addMonths, dueDate, daysBetween)
│  ├─ domain.ts              occursInMonth, status, totals, combine, bySource, vehicleStatus
│  ├─ db.ts                  mapper baris→objek, query, audit log
│  ├─ auth.ts                OTP (SHA-256, 6 digit, 10 min, 5 cubaan), sesi, matriks peranan
│  ├─ seed.ts                import idempotent + sahkan SHA-256 & magic bytes
│  ├─ storage.ts             R2 (utama) / jadual document_blobs (sandaran)
│  └─ schema.ts              dijana daripada migrations/0001_init.sql
├─ server/
│  ├─ auth-routes.ts         status/setup/OTP/verify/me/logout/ahli
│  ├─ ledger-routes.ts       state, item CRUD, bayaran, lampiran, duit masuk, kadar, sumber
│  ├─ vehicle-routes.ts      kenderaan, pembaharuan, servis
│  ├─ misc-routes.ts         semakan migrasi, CSV, backup, audit
│  ├─ verify.ts              44 semakan server-side
│  └─ page.ts                shell HTML
└─ seed/                     aset dibundel (3 PDF, 6 rujukan, jadual 03E)

public/static/
├─ styles.css, styles-v2.css CSS prototaip (tidak diubah)
├─ app.css                   tambahan (login OTP, semakan migrasi)
├─ vendor/                   preact, hooks, htm (ESM)
└─ js/{lib,domain,ui,screens,sheets,vehicles,app}.js

migrations/0001_init.sql
```

**Teknologi**: Hono 4 · Cloudflare Pages/Workers · D1 (SQLite) · R2 · Preact + htm (tanpa build pelayar, tanpa CDN).

---

## Data

### Sumber import
`prototaip/source/02_DATA_SEMASA.json` — snapshot 2026-10-28, revision 18.

- 31 item (`ledger.items`) → `items` dengan `source='import'`, ID asal dikekalkan
- 4 bayaran (`ledger.payments`, kunci `<itemId>:<YYYY-MM>`) → `payments`
- 3 lampiran → storan persendirian, `original_object_id` UNIQUE
- Lapan item `import-pt-staff-*` → `pay_source='mandiri-xboss'` (nota: “Sumber: Mandiri XBOSS ASIA GROUP”)
- **Tidak** diimport: `06_SENARAI_ASAL_RUJUKAN.json`
- **Tidak** dihidupkan: `import-personal-my-alrahman-fee-nov`

### Tambahan selepas snapshot (`source='user'`)
| ID | Amaun | Hari | Mula |
|---|---:|---:|---|
| `user-aia-x253427a06` | 646.58 | 27 | 2026-11 |
| `user-aia-x364132a06` | 120.32 | 2 | 2026-11 |
| `user-aia-x364135a08` | 120.32 | 2 | 2026-11 |

Jumlah item = **34**. Personal Malaysia Nov 2026 = **10,373.22 MYR**.

### Jangkaan selepas import
| Ruang | Item | Mata wang | Bulanan tetap |
|---|---:|---|---:|
| Personal Malaysia | 7 | MYR | 6 · 9,486.00 |
| Personal Indonesia | 3 | MYR | 3 · 5,400.00 |
| XBOSS Asia Empire | 7 | MYR | 7 · 15,500.00 |
| PT XBOSS Asia Group | 14 | IDR | 14 · 136,219,803 |

### Jadual (03E)
60 baris (Okt 2026–Dis 2027 × 4 ruang) — **60/60 sepadan** dengan kiraan semula daripada data.

### Prinsip integriti
- `null` kekal `null` — **tiada amaun / tarikh / penerima direka**.
- ID asal dikekalkan; pindaan item tidak mengubah bayaran lama.
- Satu bayaran per `itemId:bulan` (`PRIMARY KEY`).
- Bukti **wajib** untuk duit keluar sebelum disahkan.

---

## API

| Laluan | Keterangan |
|---|---|
| `GET /api/auth/status` | perlu setup? pembekal e-mel? |
| `POST /api/auth/setup` | tetapkan e-mel pemilik (+ isteri), sekali sahaja |
| `POST /api/auth/request-otp` | minta kod (hanya e-mel ahli) |
| `POST /api/auth/verify` | sahkan kod → sesi (cookie HttpOnly) |
| `GET /api/auth/me` · `POST /api/auth/logout` · `logout-all` | sesi |
| `GET/POST/PATCH/DELETE /api/auth/members` | urus ahli & ruang |
| `GET /api/state` | semua data, ditapis mengikut skop ruang |
| `POST /api/items` · `PATCH /api/items/:id` | komitmen baharu / edit |
| `POST /api/items/:id/archive` · `/unarchive` · `DELETE` · `/restore` | tamat / padam lembut |
| `POST /api/payments` | rekod bayar (multipart: bukti, split, payroll) |
| `POST /api/documents` | muat naik invoice / bukti |
| `GET /api/documents/:id/file` | fail — **sesi sahaja**, `Cache-Control: private, no-store` |
| `POST /api/income` | duit masuk sekali |
| `GET/POST/DELETE /api/rate` | kadar RM → Rp |
| `GET/POST/PATCH/DELETE /api/vehicles` · `/renewal` · `/service` | kenderaan |
| `GET /api/verify` | laporan Semakan Migrasi |
| `GET /api/export/csv?month=&entity=` | CSV UTF-8 BOM, rujukan sebagai teks |
| `GET /api/export/backup` | backup JSON + lampiran base64 (pemilik) |
| `GET /api/refdocs/:file` | 6 dokumen rujukan (bukan bukti) |

---

## Semakan Migrasi — 44/44 lulus

Dijana server-side daripada DB langsung + manifest + jadual 03E + bytes dalam storan.

| Kumpulan | Lulus |
|---|---|
| Import (idempotent, 2× import → 0 rekod baharu) | 6/6 |
| Komitmen (31 wujud, medan sama, 7/3/7/14, MYR/IDR) | 9/9 |
| Pindaan (Noralfiza 2800, Vista Hill 2026-12, LC Aakif hari 1, 4× hari 20) | 8/8 |
| Bayaran (4 padan, MYR 10,400, IDR 0, split 0) | 8/8 |
| Lampiran (saiz + SHA-256 + MIME + pautan bayaran) | 3/3 |
| Jadual 03E (60 baris) + bulanan tetap | 5/5 |
| Tambahan Boss (3 AIA, tanpa pendua, tidak bercampur) | 5/5 |

SHA-256 disahkan sama dengan manifest:

| Fail | Saiz | SHA-256 |
|---|---:|---|
| `0001_…Mre102026.pdf` | 20,322 B | `a1dc1dfc77f1f8fd…` |
| `0002_bina_asetoct_2026.pdf` | 20,398 B | `5b3a387646943efb…` |
| `0003_…Xb181026A.pdf` | 20,426 B | `b175d4e35d9ec795…` |

Buka app → **Tetapan → Semakan migrasi data**.

---

## Menjalankan secara lokal

```bash
npm install
npm run build                 # jana schema + aset, kemudian vite build
npx wrangler d1 migrations apply rekod-boss --local
fuser -k 3000/tcp 2>/dev/null; pm2 start ecosystem.config.cjs
curl http://localhost:3000
```

`.dev.vars` (jangan commit):
```
OTP_DEV_MODE=1
```

## Deploy — perlu pilihan Boss

App ini menggunakan **D1** dan **R2**. Dua laluan tersedia:

- **(A) Genspark-hosted** — D1 + R2 disokong, tiada token diperlukan.
- **(B) Akaun Cloudflare sendiri (BYOK)** — token API dari panel Deploy.

**Tiada deploy dibuat** kerana pilihan ini belum ditetapkan. Untuk produksi sebenar, juga perlu:
1. `RESEND_API_KEY` + `MAIL_FROM` (secret) supaya kod OTP dihantar melalui e-mel.
2. E-mel pemilik & isteri sebenar.

---

## Data yang masih menunggu daripada Boss (kekal `null` — tidak direka)

- E-mel pemilik & isteri; ruang yang isteri boleh lihat
- Penerima keluarga Ermi (2) & Yuli (3); pecahan TNG / bank Jumad
- Hari bayaran ~20 komitmen; Ref 02 TNB; bukti Alphard Okt 2026
- Sumber bayaran untuk 25 komitmen (selain staf PT)
- Tarikh roadtax / insurans / servis Alphard & Vellfire
- Nama penuh Aariz Dayyan; pengesahan ejaan Aarif / Aariz / Aakif
- Amaun gaji / komisen Boss (duit masuk)

---

**Kemas kini terakhir**: 29 Okt 2026
