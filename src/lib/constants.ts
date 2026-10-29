/* Pemalar domain — sama dengan prototaip/app/data.js */

export const MONTHS = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember',
]

export type Account = {
  id: string
  name: string
  short: string
  country: string
  cc: 'MY' | 'ID'
  scope: 'Peribadi' | 'Bisnes'
}

export const ACCOUNTS: Account[] = [
  { id: 'personal-my', name: 'Personal Malaysia', short: 'Personal MY', country: 'Malaysia', cc: 'MY', scope: 'Peribadi' },
  { id: 'personal-id', name: 'Personal Indonesia', short: 'Personal ID', country: 'Indonesia', cc: 'ID', scope: 'Peribadi' },
  { id: 'xboss-my', name: 'XBOSS Asia Empire', short: 'XBOSS Empire', country: 'Malaysia', cc: 'MY', scope: 'Bisnes' },
  { id: 'xboss-id', name: 'PT XBOSS Asia Group', short: 'PT XBOSS', country: 'Indonesia', cc: 'ID', scope: 'Bisnes' },
]

export const CATEGORIES = [
  'Bisnes', 'Gaji & bantuan', 'Insurans', 'Kenderaan', 'Pendidikan',
  'Pinjaman', 'Rumah', 'Utiliti', 'Lain-lain',
]

export const INCOME_SOURCES = ['Gaji', 'Komisen', 'Bisnes', 'Dividen', 'Sewa', 'Lain-lain']

export const FREQ: Record<string, string> = {
  monthly: 'Bulanan',
  quarterly: 'Setiap 3 bulan',
  yearly: 'Tahunan',
  once: 'Sekali',
}

export const CHANNELS = ['Bank Indonesia', 'TNG Malaysia', 'Bank Malaysia', 'Tunai', 'Lain-lain']

export const CURRENCIES = ['MYR', 'IDR'] as const
export type Currency = 'MYR' | 'IDR'

export const PAY_METHODS = [
  'Transfer bank', 'Auto debit', 'Kad kredit', 'Kad debit',
  'DuitNow / FPX', 'Swipey', 'Tunai', 'Lain-lain',
]

export type PaySource = {
  id: string
  name: string
  short: string
  kind: string
  currency: string
  color: string
  ink: string
  custom?: boolean
}

export const PAY_SOURCES: PaySource[] = [
  { id: 'wise', name: 'Wise Card', short: 'Wise', kind: 'Kad', currency: '', color: '#9fe870', ink: '#163300' },
  { id: 'hlb-xboss', name: 'Hong Leong Bank — XBOSS Asia Empire', short: 'HLB XBOSS', kind: 'Bank', currency: 'MYR', color: '#0b3d91', ink: '#fff' },
  { id: 'cimb-shukrie', name: 'CIMB — Muhammad Shukrie (Personal)', short: 'CIMB Shukrie', kind: 'Bank', currency: 'MYR', color: '#c8102e', ink: '#fff' },
  { id: 'swipey', name: 'Swipey', short: 'Swipey', kind: 'Sistem', currency: '', color: '#5b3df5', ink: '#fff' },
  { id: 'mandiri-xboss', name: 'Bank Mandiri — XBOSS Asia Group', short: 'Mandiri XBOSS', kind: 'Bank', currency: 'IDR', color: '#003d79', ink: '#ffc800' },
  { id: 'mandiri-shukrie', name: 'Bank Mandiri — Shukrie', short: 'Mandiri Shukrie', kind: 'Bank', currency: 'IDR', color: '#f5a800', ink: '#003d79' },
]

/** Item yang TIDAK dihidupkan semula semasa import (keputusan Boss). */
export const DELETED_IDS = ['import-personal-my-alrahman-fee-nov']

/** Tambahan pengguna selepas snapshot (28 Okt 2026) — 3 caruman insurans AIA. */
export const USER_ADDITIONS = [
  {
    id: 'user-aia-x253427a06',
    name: 'Insurans AIA A-Life Medik Famili — Keluarga (X253427A06)',
    category: 'Insurans',
    entity: 'personal-my',
    scope: 'Peribadi',
    currency: 'MYR',
    amount: 646.58,
    day: 27,
    start: '2026-11',
    frequency: 'monthly',
    type: 'expense',
    note:
      'AIA · Medical Protection · Sijil X253427A06 · In Force Contribution Paying. Pemilik sijil / pencarum: Muhammad Shukrie Bin Ab Rahim. Ahli dilindungi: Muhammad Shukrie Bin Ab Rahim; Norashikin Binti Nordin; Amanda Senrose Binti Mohamad Sukahre; Muhammad Aisy Farrel Bin Mohammad Sukahre; Muhammad Khalish Amsyar Bin Mohamad Sukahre; Muhammad Zyan Akasyah Bin Mohamad Sukahre. Had perubatan tahunan RM150,000. Caruman perlu dibayar 27 Nov 2026: RM646.58 (cukai kerajaan RM0.00).',
  },
  {
    id: 'user-aia-x364132a06',
    name: 'Insurans AIA A-Life Medik Famili — Aakif Dayyan (X364132A06)',
    category: 'Insurans',
    entity: 'personal-my',
    scope: 'Peribadi',
    currency: 'MYR',
    amount: 120.32,
    day: 2,
    start: '2026-11',
    frequency: 'monthly',
    type: 'expense',
    note:
      'AIA · Medical Protection · Sijil X364132A06 · In Force Contribution Paying. Dilindungi: Muhammad Aakif Dayyan Bin Mohamad Sukahre. Pemilik sijil / pencarum: Muhammad Shukrie Bin Ab Rahim. Had perubatan tahunan RM150,000 (baki sah hingga 01 Okt 2027). Caruman perlu dibayar 02 Nov 2026: RM120.32 (cukai kerajaan RM0.00).',
  },
  {
    id: 'user-aia-x364135a08',
    name: 'Insurans AIA A-Life Medik Famili — Aariz Dayyan (X364135A08)',
    category: 'Insurans',
    entity: 'personal-my',
    scope: 'Peribadi',
    currency: 'MYR',
    amount: 120.32,
    day: 2,
    start: '2026-11',
    frequency: 'monthly',
    type: 'expense',
    note:
      'AIA · Medical Protection · Sijil X364135A08 · In Force Contribution Paying. Dilindungi: Muhammad Aariz Dayyan (nama penuh terpotong dalam tangkapan skrin). Had perubatan tahunan RM150,000. Caruman perlu dibayar 02 Nov 2026: RM120.32.',
  },
] as const

/** Dokumen rujukan — BUKAN bukti bayaran. */
export const REF_DOCS = [
  { file: 'Akaun_Alphard.png', title: 'Maklumat akaun Alphard', mime: 'image/png', items: ['import-personal-my-alphard-y5050'] },
  { file: 'Akaun_Vista_Hill.png', title: 'Maklumat akaun Vista Hill', mime: 'image/png', items: ['import-personal-my-vista-hill'] },
  { file: 'Yuran_Al_Rahman_November.png', title: 'Yuran Al Rahman — November', mime: 'image/png', items: ['import-personal-my-alrahman'] },
  { file: 'Yuran_LC_November.png', title: 'Yuran Tadika LC — November', mime: 'image/png', items: ['import-personal-my-lc-aarif', 'import-personal-my-lc-aakif'] },
  { file: 'Payroll_Indonesia_November_2026.pdf', title: 'Laporan payroll Mandiri — Nov 2026', mime: 'application/pdf', items: 'pt-staff' },
  { file: 'Komitmen_IDR_Asal.png', title: 'Senarai komitmen IDR asal', mime: 'image/png', items: [] as string[] },
] as const

export const VEHICLE_SEEDS = [
  { id: 'veh-y5050', name: 'Alphard', plate: 'Y5050', linked: 'import-personal-my-alphard-y5050' },
  { id: 'veh-syq5050', name: 'Vellfire', plate: 'SYQ5050', linked: 'import-personal-my-vellfire-syq5050' },
]

export const ROLES: Record<string, { name: string; desc: string }> = {
  owner: { name: 'Pemilik', desc: 'Akses penuh — urus ahli, padam, eksport & backup' },
  partner: {
    name: 'Pasangan',
    desc: 'Lihat & rekod bayaran, upload bukti, tambah duit masuk. Tidak boleh padam, urus ahli atau backup penuh.',
  },
  viewer: { name: 'Lihat sahaja', desc: 'Lihat ringkasan, bayaran dan lampiran. Tidak boleh ubah apa-apa.' },
}

export const acc = (id: string) => ACCOUNTS.find((a) => a.id === id) || null
