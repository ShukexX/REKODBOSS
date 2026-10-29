/* Rekod Boss — utiliti klien: format, ikon, API. */
import { h } from '/static/vendor/preact.mjs'
import htm from '/static/vendor/htm.mjs'

export const html = htm.bind(h)

export const MONTHS = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember']
export const ACCOUNTS = [
  { id: 'personal-my', name: 'Personal Malaysia', short: 'Personal MY', country: 'Malaysia', cc: 'MY', scope: 'Peribadi' },
  { id: 'personal-id', name: 'Personal Indonesia', short: 'Personal ID', country: 'Indonesia', cc: 'ID', scope: 'Peribadi' },
  { id: 'xboss-my', name: 'XBOSS Asia Empire', short: 'XBOSS Empire', country: 'Malaysia', cc: 'MY', scope: 'Bisnes' },
  { id: 'xboss-id', name: 'PT XBOSS Asia Group', short: 'PT XBOSS', country: 'Indonesia', cc: 'ID', scope: 'Bisnes' },
]
export const CATEGORIES = ['Bisnes','Gaji & bantuan','Insurans','Kenderaan','Pendidikan','Pinjaman','Rumah','Utiliti','Lain-lain']
export const INCOME_SOURCES = ['Gaji','Komisen','Bisnes','Dividen','Sewa','Lain-lain']
export const FREQ = { monthly: 'Bulanan', quarterly: 'Setiap 3 bulan', yearly: 'Tahunan', once: 'Sekali' }
export const CHANNELS = ['Bank Indonesia','TNG Malaysia','Bank Malaysia','Tunai','Lain-lain']
export const CURRENCIES = ['MYR','IDR']
export const PAY_METHODS = ['Transfer bank','Auto debit','Kad kredit','Kad debit','DuitNow / FPX','Swipey','Tunai','Lain-lain']
export const STATUS = { paid: 'Selesai', unpaid: 'Belum bayar', overdue: 'Tertunggak', received: 'Diterima', expected: 'Dijangka' }
export const REF_DOCS = [
  { file: 'Akaun_Alphard.png', title: 'Maklumat akaun Alphard', mime: 'image/png', items: ['import-personal-my-alphard-y5050'] },
  { file: 'Akaun_Vista_Hill.png', title: 'Maklumat akaun Vista Hill', mime: 'image/png', items: ['import-personal-my-vista-hill'] },
  { file: 'Yuran_Al_Rahman_November.png', title: 'Yuran Al Rahman — November', mime: 'image/png', items: ['import-personal-my-alrahman'] },
  { file: 'Yuran_LC_November.png', title: 'Yuran Tadika LC — November', mime: 'image/png', items: ['import-personal-my-lc-aarif','import-personal-my-lc-aakif'] },
  { file: 'Payroll_Indonesia_November_2026.pdf', title: 'Laporan payroll Mandiri — Nov 2026', mime: 'application/pdf', items: 'pt-staff' },
  { file: 'Komitmen_IDR_Asal.png', title: 'Senarai komitmen IDR asal', mime: 'image/png', items: [] },
]

export const acc = (id) => ACCOUNTS.find((a) => a.id === id) || { name: id, short: id, cc: 'MY' }

/* ---------- format ---------- */
export const fmtMoney = (amount, cur, opts = {}) => {
  if (amount == null) return 'Belum ditentukan'
  if (cur === 'IDR') return 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(amount)
  return 'RM ' + new Intl.NumberFormat('en-MY', { minimumFractionDigits: opts.noDec ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
}
export const fmtShort = (amount, cur) => {
  if (amount == null) return '—'
  if (cur === 'IDR') {
    if (Math.abs(amount) >= 1e9) return 'Rp ' + (amount / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
    if (Math.abs(amount) >= 1e6) return 'Rp ' + (amount / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'
    return fmtMoney(amount, cur)
  }
  return fmtMoney(amount, cur)
}
export const fmtDate = (iso, withYear = true) => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${withYear ? ' ' + y : ''}`
}
export const fmtSize = (b) => (b < 1024 * 1024 ? Math.round(b / 1024) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB')
export const fmtStamp = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const pad = (n) => String(n).padStart(2, '0')
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const curMonth = () => todayISO().slice(0, 7)
export const addMonths = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; y += Math.floor((m - 1) / 12); m = (((m - 1) % 12) + 12) % 12 + 1; return `${y}-${pad(m)}` }
export const monthLabel = (ym, short) => { if (!ym) return ''; const [y, m] = ym.split('-').map(Number); const n = MONTHS[m - 1]; return (short ? n.slice(0, 3) : n) + ' ' + y }
export const daysIn = (y, m) => new Date(y, m, 0).getDate()
export const addMonthsDate = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const ym = addMonths(`${y}-${pad(m)}`, n); const [ny, nm] = ym.split('-').map(Number); return `${ym}-${pad(Math.min(d, daysIn(ny, nm)))}` }
export const daysBetween = (a, b) => { const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }; return Math.round((p(b) - p(a)) / 864e5) }

/* ---------- ikon ---------- */
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  pay: 'M3 6h18v12H3zM3 10h18M7 15h4',
  rec: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5',
  set: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', down: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18', plus: 'M12 5v14M5 12h14', check: 'M5 12.5l4.5 4.5L19 7',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  inv: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  dl: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 6v1',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h0',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h0',
  'Bisnes': 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  'Gaji & bantuan': 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 8v6M14 11h6',
  'Kenderaan': 'M5 16h14M3 16v-4l2-5h14l2 5v4h-2M7 16v2M17 16v2M7 12h0M17 12h0',
  'Pendidikan': 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  'Pinjaman': 'M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3 3 8h18z',
  'Rumah': 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
  'Utiliti': 'M13 2 4 14h7l-1 8 9-12h-7z',
  'Insurans': 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM12 9v6M9 12h6',
  'Lain-lain': 'M5 12h0M12 12h0M19 12h0',
}
export function Icon({ n, s = 20, w = 1.8, style }) {
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${w}
    strokeLinecap="round" strokeLinejoin="round" style=${style} aria-hidden="true"><path d=${P[n] || P['Lain-lain']} /></svg>`
}

/* ---------- API ---------- */
async function req(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) throw new Error((data && data.error) || 'Ralat ' + res.status)
  return data
}

export const api = {
  status: () => req('/auth/status'),
  setup: (body) => req('/auth/setup', { method: 'POST', body }),
  requestOtp: (email) => req('/auth/request-otp', { method: 'POST', body: { email } }),
  verify: (email, code) => req('/auth/verify', { method: 'POST', body: { email, code } }),
  loginPassword: (email, password) => req('/auth/login-password', { method: 'POST', body: { email, password } }),
  setPassword: (body) => req('/auth/password', { method: 'POST', body }),
  me: () => req('/auth/me'),
  logout: () => req('/auth/logout', { method: 'POST' }),
  logoutAll: () => req('/auth/logout-all', { method: 'POST' }),
  members: () => req('/auth/members'),
  invite: (body) => req('/auth/members', { method: 'POST', body }),
  updateMember: (id, body) => req('/auth/members/' + id, { method: 'PATCH', body }),
  removeMember: (id) => req('/auth/members/' + id, { method: 'DELETE' }),
  state: () => req('/state'),
  verifyReport: () => req('/verify'),
  createItem: (body) => req('/items', { method: 'POST', body }),
  updateItem: (id, body) => req('/items/' + id, { method: 'PATCH', body }),
  archiveItem: (id, endMonth) => req('/items/' + id + '/archive', { method: 'POST', body: { endMonth } }),
  unarchiveItem: (id) => req('/items/' + id + '/unarchive', { method: 'POST' }),
  deleteItem: (id) => req('/items/' + id, { method: 'DELETE' }),
  restoreItem: (id) => req('/items/' + id + '/restore', { method: 'POST' }),
  recordPayment: (form) => req('/payments', { method: 'POST', body: form }),
  recordIncome: (form) => req('/income', { method: 'POST', body: form }),
  uploadDocs: (form) => req('/documents', { method: 'POST', body: form }),
  deleteDoc: (id) => req('/documents/' + id, { method: 'DELETE' }),
  setRate: (idrPerMyr) => req('/rate', { method: 'POST', body: { idrPerMyr } }),
  clearRate: () => req('/rate', { method: 'DELETE' }),
  addSource: (body) => req('/sources', { method: 'POST', body }),
  createVehicle: (body) => req('/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body) => req('/vehicles/' + id, { method: 'PATCH', body }),
  deleteVehicle: (id) => req('/vehicles/' + id, { method: 'DELETE' }),
  renewVehicle: (id, form) => req('/vehicles/' + id + '/renewal', { method: 'POST', body: form }),
  serviceVehicle: (id, form) => req('/vehicles/' + id + '/service', { method: 'POST', body: form }),
}

