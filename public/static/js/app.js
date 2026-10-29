/* Rekod Boss — shell aplikasi: login OTP, navigasi, dan pengurusan sheet. */
import { h, render } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { html, Icon, api, monthLabel, curMonth, addMonths } from './lib.js'
import {
  Toaster, toast, Sheet, Viewer, MonthPicker, V2Month, reload, store, useStore,
} from './ui.js'
import {
  Dashboard, Payments, IncomeScreen, VehicleScreen, History, Settings, VerifySheet,
} from './screens.js'
import {
  DetailSheet, PaySheet, EditSheet, DocsSheet, RefDocsSheet, IncomeSheet, RateSheet, QuickPaySheet, AccessSheet,
} from './sheets.js'
import { VehicleSheet, VehicleEditSheet, RenewSheet, ServiceSheet, VehPickSheet } from './vehicles.js'

const NAV = [
  ['ringkasan', 'Ringkasan', 'home'],
  ['pendapatan', 'Duit masuk', 'dl'],
  ['bayaran', 'Bayaran', 'pay'],
  ['kenderaan', 'Kenderaan', 'Kenderaan'],
  ['rekod', 'Rekod', 'rec'],
  ['tetapan', 'Tetapan', 'set'],
]

/* ================= LOGIN ================= */
function Login({ onIn }) {
  const [step, setStep] = useState('email') // email | code | setup
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [dev, setDev] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [setup, setSetup] = useState({ ownerEmail: '', ownerName: 'Muhammad Shukrie', partnerEmail: '', partnerName: '' })

  useEffect(() => {
    api.status().then((s) => { setStatus(s); if (s.needsSetup) setStep('setup') }).catch(() => {})
  }, [])

  const sendCode = async (e) => {
    e && e.preventDefault()
    setErr('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Masukkan e-mel yang sah.')
    setBusy(true)
    try {
      const r = await api.requestOtp(email)
      setDev(r.sent ? null : { code: r.devCode, note: r.note })
      setStep('code')
      toast('Kod dihantar ke ' + email)
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  const verify = async (e) => {
    e && e.preventDefault()
    setErr('')
    if (!/^\d{6}$/.test(code)) return setErr('Kod mesti 6 digit.')
    setBusy(true)
    try {
      await api.verify(email, code)
      await reload()
      onIn()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  const doSetup = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await api.setup(setup)
      setEmail(setup.ownerEmail)
      setStep('email')
      toast('Pemilik ditetapkan — minta kod untuk log masuk')
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  return html`<div class="v2-login">
    <span class="orb o4"></span><span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
    <form class="box" onSubmit=${step === 'setup' ? doSetup : step === 'code' ? verify : sendCode}>
      <h1>Semua komitmen,<br />satu tempat.</h1>
      <p class="s">Personal & bisnes — Malaysia dan Indonesia. MYR dan IDR dikira berasingan.</p>

      ${step === 'setup' && html`<div>
        <div class="setupnote"><b>Persediaan awal.</b> Tiada akaun lagi. Masukkan e-mel pemilik (Boss) dan, jika ada, e-mel isteri. Hanya e-mel ini boleh log masuk — tiada pendaftaran awam.</div>
        <div class="f"><label>E-mel pemilik (Boss)</label>
          <input class="inp" type="email" autoComplete="username" value=${setup.ownerEmail}
            onInput=${(e) => setSetup({ ...setup, ownerEmail: e.target.value })} placeholder="nama@contoh.com" /></div>
        <div class="f"><label>Nama pemilik</label>
          <input class="inp" value=${setup.ownerName} onInput=${(e) => setSetup({ ...setup, ownerName: e.target.value })} /></div>
        <div class="f"><label>E-mel pasangan (isteri) — pilihan</label>
          <input class="inp" type="email" value=${setup.partnerEmail}
            onInput=${(e) => setSetup({ ...setup, partnerEmail: e.target.value })} placeholder="isteri@contoh.com" /></div>
        <div class="f"><label>Nama pasangan</label>
          <input class="inp" value=${setup.partnerName} onInput=${(e) => setSetup({ ...setup, partnerName: e.target.value })} placeholder="Nama isteri" /></div>
      </div>`}

      ${step === 'email' && html`<div class="f"><label>E-mel</label>
        <input class="inp" type="email" autoComplete="username" value=${email}
          onInput=${(e) => setEmail(e.target.value)} placeholder="nama@contoh.com" /></div>`}

      ${step === 'code' && html`<div>
        <div class="f"><label>Kod 6 digit untuk ${email}</label>
          <input class="inp" inputMode="numeric" maxLength=${6} value=${code} autofocus
            onInput=${(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••"
            style="text-align:center;letter-spacing:.4em;font-size:20px;font-weight:800" /></div>
        ${dev && html`<div class="devcode">Mod pembangunan (tiada pembekal e-mel): kod anda
          <b>${dev.code}</b>${dev.note || ''}</div>`}
      </div>`}

      ${err && html`<div class="rb-note err" style="margin-bottom:12px" role="alert">${err}</div>`}

      <button class="cta" disabled=${busy}>
        <span class="ar">${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n=${step === 'code' ? 'check' : 'right'} s=${20} w=${2.4} />`}</span>
        ${step === 'setup' ? 'Tetapkan akaun' : step === 'code' ? 'Sahkan & masuk' : 'Hantar kod OTP'}
      </button>

      ${step === 'code' && html`<button type="button" class="linkbtn" onClick=${sendCode}>Hantar kod baharu / tukar e-mel</button>`}
      <div class="fine"><${Icon} n="shield" s=${15} style="flex:none;margin-top:1px" />
        Sistem merekod sahaja — tiada pindahan wang dibuat. Login hanya untuk ahli yang dijemput.</div>
      ${status && status.devMode && html`<div class="who">Mod pembangunan · tiada e-mel keluar. Tetapkan RESEND_API_KEY untuk kod sebenar.</div>`}
    </form>
  </div>`
}

/* ================= SHELL ================= */
function App() {
  const d = useStore()
  const saved = (() => { try { return JSON.parse(localStorage.getItem('rb-ui')) || {} } catch { return {} } })()
  const [authed, setAuthed] = useState(false)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState(saved.tab || 'ringkasan')
  const [month, setMonth] = useState(saved.month || curMonth())
  const [filters, setFilters] = useState({ status: 'open', entity: '', currency: '', category: '', source: '', groupBy: 'entity' })
  const [sheet, setSheet] = useState(null)

  useEffect(() => {
    api.me().then(async (r) => {
      if (r.me) { await reload(); setAuthed(true) }
      setReady(true)
    }).catch(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!authed) return
    localStorage.setItem('rb-ui', JSON.stringify({ tab, month }))
  }, [tab, month, authed])
  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  const open = useCallback((kind, o, extra) => setSheet({ kind, o, extra }), [])
  const close = () => setSheet(null)
  const go = (t, f) => {
    if (f) setFilters({ status: 'all', entity: '', currency: '', category: '', source: '', groupBy: 'entity', ...f })
    setTab(t)
  }
  const logout = async () => {
    try { await api.logout() } catch {}
    setAuthed(false)
    setSheet(null)
    store.data = null
  }

  if (!ready) return html`<${Toaster} />`
  if (!authed) return html`<div><${Login} onIn=${() => setAuthed(true)} /><${Toaster} /><${Viewer} /></div>`

  const props = { month, setMonth, open, go }
  const B = (k, l, ic) => html`<button class=${'it' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}
    aria-current=${tab === k ? 'page' : undefined}><span class="ic"><${Icon} n=${ic} s=${22} /></span>${l}</button>`

  return html`<div class="rb-shell">
    <div class="v2-bgorb"><i></i><i></i></div>
    <aside class="rb-side">
      <div class="rb-brand"><div class="rb-logo">RB</div>
        <div><b>Rekod Boss</b><small>${d.me ? d.me.name.split(' ').slice(0, 2).join(' ') : ''}</small></div></div>
      <nav class="rb-sidenav">${NAV.map(([k, l, ic]) => html`<button key=${k} class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>
        <${Icon} n=${ic} s=${20} />${l}</button>`)}</nav>
      <div class="rb-sidefoot">${(d.data.items || []).filter((i) => !i.deleted).length} komitmen · ${(d.data.spaces || []).length} ruang<br />MYR & IDR dikira berasingan</div>
    </aside>
    <main class="rb-main" data-screen-label=${tab}>
      ${tab === 'ringkasan' && html`<${Dashboard} ...${props} />`}
      ${tab === 'pendapatan' && html`<${IncomeScreen} ...${props} />`}
      ${tab === 'kenderaan' && html`<${VehicleScreen} open=${open} />`}
      ${tab === 'bayaran' && html`<${Payments} ...${props} filters=${filters} setFilters=${setFilters} />`}
      ${tab === 'rekod' && html`<${History} ...${props} />`}
      ${tab === 'tetapan' && html`<${Settings} ...${props} onLogout=${logout} />`}
    </main>

    <nav class="rb-nav2">
      ${B('ringkasan', 'Ringkasan', 'home')}${B('pendapatan', 'Masuk', 'dl')}
      <button class="fab" onClick=${() => open('quick')} aria-label="Rekod bayar pantas"><${Icon} n="plus" s=${26} w=${2.4} /></button>
      ${B('bayaran', 'Bayaran', 'pay')}${B('rekod', 'Rekod', 'rec')}
    </nav>

    ${sheet && sheet.kind === 'detail' && html`<${DetailSheet} key=${sheet.o.key} o=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'pay' && html`<${PaySheet} o=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'edit' && html`<${EditSheet} o=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'docs' && html`<${DocsSheet} o=${sheet.o} kind=${sheet.extra} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'verify' && html`<${VerifySheet} onClose=${close} />`}
    ${sheet && sheet.kind === 'vehicle' && html`<${VehicleSheet} key=${sheet.o.id} v=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'vehicleEdit' && html`<${VehicleEditSheet} v=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'renew' && html`<${RenewSheet} v=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'service' && html`<${ServiceSheet} v=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'vehPick' && html`<${VehPickSheet} next=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'access' && html`<${AccessSheet} onClose=${close} />`}
    ${sheet && sheet.kind === 'income' && html`<${IncomeSheet} month=${month} onClose=${close} />`}
    ${sheet && sheet.kind === 'incomeRecord' && html`<${PaySheet} o=${sheet.o} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'rate' && html`<${RateSheet} onClose=${close} />`}
    ${sheet && sheet.kind === 'quick' && html`<${QuickPaySheet} month=${month} onClose=${close} open=${open} />`}
    ${sheet && sheet.kind === 'refdocs' && html`<${RefDocsSheet} onClose=${close} />`}
    <${Viewer} />
    <${Toaster} />
  </div>`
}

render(html`<${App} />`, document.getElementById('root'))
