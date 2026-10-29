/* Rekod Boss — komponen UI kongsi (setara prototaip/app/ui.jsx). */
import { h, Fragment } from '/static/vendor/preact.mjs'
import { useState, useEffect, useRef, useCallback } from '/static/vendor/hooks.mjs'
import {
  html, Icon, fmtMoney, fmtShort, fmtDate, fmtSize, fmtStamp, STATUS,
  acc, ACCOUNTS, CURRENCIES, PAY_METHODS, monthLabel, addMonths, api, curMonth, todayISO, FREQ,
} from './lib.js'

/* ---------------- stor ---------------- */
export const store = { data: null, me: null }
const subs = new Set()
export const notify = () => subs.forEach((f) => f())
export function useStore() {
  const [, set] = useState(0)
  useEffect(() => {
    const f = () => set((x) => x + 1)
    subs.add(f)
    return () => subs.delete(f)
  }, [])
  return store
}
export async function reload() {
  store.data = await api.state()
  store.me = store.data.me
  notify()
  return store.data
}

/* ---------------- toast ---------------- */
let pushToast = () => {}
export function Toaster() {
  const [t, setT] = useState(null)
  useEffect(() => { pushToast = (msg, kind) => setT({ msg, kind, k: Date.now() }) }, [])
  useEffect(() => {
    if (!t) return
    const hdl = setTimeout(() => setT(null), 3400)
    return () => clearTimeout(hdl)
  }, [t])
  if (!t) return null
  return html`<div class=${'rb-toast ' + (t.kind || '')} role="status" key=${t.k}><${Icon} n=${t.kind === 'err' ? 'alert' : 'check'} s=${18} />${t.msg}</div>`
}
export const toast = (m, k) => pushToast(m, k)

/* ---------------- sheet ---------------- */
export function Sheet({ title, onClose, children, foot, wide, onBack }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [])
  return html`<div class="rb-scrim" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${'rb-sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="rb-sh-head">
        ${onBack && html`<button class="rb-x" onClick=${onBack} aria-label="Kembali"><${Icon} n="left" s=${18} /></button>`}
        <h3>${title}</h3>
        <button class="rb-x" onClick=${onClose} aria-label="Tutup"><${Icon} n="x" s=${18} /></button>
      </div>
      <div class="rb-sh-body">${children}</div>
      ${foot && html`<div class="rb-sh-foot">${foot}</div>`}
    </div>
  </div>`
}

/* ---------------- pemilih bulan ---------------- */
export function MonthPicker({ month, setMonth, light }) {
  return html`<div class=${'rb-month' + (light ? ' light' : '')}>
    <button onClick=${() => setMonth(addMonths(month, -1))} aria-label="Bulan sebelum"><${Icon} n="left" s=${18} /></button>
    <span>${monthLabel(month)}</span>
    <button onClick=${() => setMonth(addMonths(month, 1))} aria-label="Bulan seterusnya"><${Icon} n="right" s=${18} /></button>
  </div>`
}

export function V2Month({ month, setMonth }) {
  return html`<div class="v2-month">
    <button onClick=${() => setMonth(addMonths(month, -1))} aria-label="Bulan sebelum"><${Icon} n="left" s=${17} /></button>
    <span>${monthLabel(month)}</span>
    <button onClick=${() => setMonth(addMonths(month, 1))} aria-label="Bulan seterusnya"><${Icon} n="right" s=${17} /></button>
  </div>`
}

/* ---------------- cincin peratus ---------------- */
let ringId = 0
export function Ring({ pct, size = 44 }) {
  const id = 'rbg' + (++ringId % 100000)
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0))
  const labelSize = safePct >= 100 ? 9 : 10
  return html`<svg class="v2-ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-label=${safePct + '% selesai'}>
    <defs><linearGradient id=${id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#7f57e3" /><stop offset="1" stopColor="#e45bb0" />
    </linearGradient></defs>
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="#efe8fe" strokeWidth="5" />
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${'url(#' + id + ')'} strokeWidth="5"
      strokeLinecap="round" strokeDasharray=${c} strokeDashoffset=${c * (1 - safePct / 100)}
      transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x=${size / 2} y=${size / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize=${labelSize} fontWeight="800" fill="#2c1562">${safePct}%</text>
  </svg>`
}

/* ---------------- teks & lencana ---------------- */
export const recipientLine = (it) => {
  const n = (it.note || '').split(/\.\s/)[0]
  return n.length > 90 ? n.slice(0, 88) + '…' : n
}

export function BankNote({ text }) {
  if (!text) return html`<div class="rb-bank" style="color:var(--mut)">Tiada catatan penerima / bank.</div>`
  const parts = text.split(/(\b\d{8,}\b)/g)
  return html`<div class="rb-bank">${parts.map((p, i) =>
    /^\d{8,}$/.test(p)
      ? html`<button key=${i} class="acct" title="Salin nombor" onClick=${() => { navigator.clipboard && navigator.clipboard.writeText(p); toast('Nombor ' + p + ' disalin') }}>${p}<${Icon} n="copy" s=${12} /></button>`
      : html`<span key=${i}>${p}</span>`
  )}</div>`
}

export function StatusPill({ s }) {
  return html`<span class=${'rb-st ' + s}>${STATUS[s] || s}</span>`
}

export function SrcBadge({ id, method, size }) {
  const d = useStore()
  const s = id && (d.data?.sources || []).find((x) => x.id === id)
  if (!s) return html`<span class="src-badge none">${size === 'lg' ? 'Sumber bayaran belum ditetapkan' : 'Sumber belum ditetapkan'}</span>`
  return html`<span class=${'src-badge' + (size === 'lg' ? ' lg' : '')}>
    <i style=${`background:${s.color};color:${s.ink}`}>${s.short.slice(0, 1)}</i>${size === 'lg' ? s.name : s.short}${method ? html`<em> · ${method}</em>` : null}
  </span>`
}

export function SourcePicker({ value, onChange, currency }) {
  const d = useStore()
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState('')
  const [kind, setKind] = useState('Bank')
  const [er, setEr] = useState('')
  const [busy, setBusy] = useState(false)
  return html`<div>
    <div class="src-pick">
      ${(d.data?.sources || []).map((s) => html`<button type="button" key=${s.id} class=${value === s.id ? 'on' : ''}
        onClick=${() => onChange(value === s.id ? null : s.id)}>
        <i style=${`background:${s.color};color:${s.ink}`}>${s.short.slice(0, 1)}</i>
        <span><b>${s.short}</b><small>${s.kind}${s.currency ? ' · ' + s.currency : ''}${currency && s.currency && s.currency !== currency ? ' ⚠' : ''}</small></span>
      </button>`)}
      <button type="button" class="add" onClick=${() => setAdding(!adding)}><i>+</i><span><b>Lain</b><small>Tambah</small></span></button>
    </div>
    ${adding && html`<div style="margin-top:8px">
      <div style="display:flex;gap:8px">
        <input class="inp" value=${nm} onInput=${(e) => setNm(e.target.value)} placeholder="cth: Maybank Kad Kredit" />
        <select class="inp" style="max-width:110px" value=${kind} onChange=${(e) => setKind(e.target.value)}>
          ${['Bank', 'Kad', 'Sistem', 'Tunai'].map((k) => html`<option key=${k}>${k}</option>`)}
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn sec" disabled=${busy} onClick=${async () => {
          setEr(''); setBusy(true)
          try {
            const r = await api.addSource({ name: nm, kind, currency })
            await reload(); onChange(r.id); setNm(''); setAdding(false)
          } catch (e) { setEr(e.message) }
          setBusy(false)
        }}>Tambah sumber</button>
      </div>
      ${er && html`<div class="rb-note err" style="margin-top:6px">${er}</div>`}
    </div>`}
  </div>`
}

/* ---------------- pemilih fail ---------------- */
export function FilePick({ files, setFiles, label = 'Pilih fail', compact }) {
  const ref = useRef()
  const [over, setOver] = useState(false)
  const add = (list) => setFiles([...(files || []), ...Array.from(list || [])])
  return html`<div>
    <label class=${'rb-drop' + (over ? ' over' : '')} style=${compact ? 'padding:10px' : null}
      onDragOver=${(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
      <input ref=${ref} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" class="rb-sr"
        onChange=${(e) => { add(e.target.files); e.target.value = '' }} />
      <${Icon} n="upload" s=${18} style="vertical-align:-4px;margin-right:6px;color:var(--g6)" />
      <b>${label}</b> atau seret ke sini<br /><span style="font-size:12px">JPG, PNG, WebP, PDF · maks 10MB setiap fail</span>
    </label>
    ${files && files.length > 0 && html`<div class="rb-files">${files.map((f, i) =>
      html`<div key=${i}><${Icon} n="file" s=${16} /><span>${f.name}</span>
        <small style="color:var(--mut)">${fmtSize(f.size)}</small>
        <button onClick=${() => setFiles(files.filter((_, j) => j !== i))} aria-label="Buang"><${Icon} n="x" s=${14} /></button></div>`)}</div>`}
  </div>`
}

/* ---------------- baris dokumen + pemapar ---------------- */
export function DocRow({ d, onOpen, tag }) {
  const pdf = d.mime === 'application/pdf'
  return html`<button class="rb-doc" onClick=${() => onOpen(d)}>
    <div class=${'ft ' + (pdf ? 'pdf' : 'img')}>${pdf ? 'PDF' : (d.mime || '').split('/')[1]?.toUpperCase().slice(0, 4)}</div>
    <div class="grow">
      <div class="t1">${d.name}</div>
      <div class="t2">${tag || (d.kind === 'invoice' ? 'Invoice / bil' : d.kind === 'receipt' ? 'Bukti bayaran' : 'Dokumen rujukan')}${d.recipient ? ' · ' + d.recipient : ''}${d.size ? ' · ' + fmtSize(d.size) : ''}${d.uploadedAt ? ' · ' + fmtStamp(d.uploadedAt) : ''}</div>
    </div>
    <${Icon} n="eye" s=${18} style="color:var(--mut)" />
  </button>`
}

let openViewer = () => {}
export function Viewer() {
  const [d, setD] = useState(null)
  useEffect(() => { openViewer = setD }, [])
  useEffect(() => {
    if (!d) return
    const k = (e) => e.key === 'Escape' && setD(null)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [d])
  if (!d) return null
  const pdf = d.mime === 'application/pdf'
  return html`<div class="rb-viewer" role="dialog" aria-label=${d.name}>
    <div class="vh">
      <button class="vbtn" onClick=${() => setD(null)} aria-label="Tutup"><${Icon} n="x" s=${16} /></button>
      <div class="grow"><b>${d.name}</b><small>${d.label || (d.kind === 'invoice' ? 'Invoice / bil' : d.kind === 'receipt' ? 'Bukti bayaran' : 'Dokumen rujukan')}${d.size ? ' · ' + fmtSize(d.size) : ''}</small></div>
      <a class="vbtn" href=${d.url} target="_blank" rel="noopener">Buka</a>
      <a class="vbtn" href=${d.url} download=${d.name}><${Icon} n="dl" s=${16} />Muat turun</a>
    </div>
    <div class="vb">${pdf
      ? html`<iframe src=${d.url} title=${d.name}></iframe>`
      : html`<img src=${d.url} alt=${d.name} />`}</div>
  </div>`
}
export const openViewerFn = (d) => openViewer(d)

/* ---------------- kad bayaran ---------------- */
export function PayCard({ o, open }) {
  const it = o.item
  const inv = o.docs.filter((d) => d.kind === 'invoice').length
  const rc = o.docs.filter((d) => d.kind === 'receipt').length
  return html`<div class="rb-pay">
    <button class="main" onClick=${() => open('detail', o)}>
      <div class="rb-cat"><${Icon} n=${it.category} s=${20} /></div>
      <div class="body">
        <div class="t">
          <div style="min-width:0">
            <div class="name">${it.name}</div>
            <div class="rcp">${recipientLine(it) || '—'}</div>
          </div>
          <div class=${'amt num'} style=${o.amount == null ? 'color:var(--blue);font-size:13px' : o.income ? 'color:var(--grn,#1f8a5b)' : null}>
            ${o.income && o.amount != null ? '+ ' : ''}${fmtMoney(o.amount, o.currency)}
            <small>${o.payment
              ? (o.income ? 'Diterima ' : 'Dibayar ') + fmtDate(o.payment.date, false)
              : o.due ? 'Perlu ' + fmtDate(o.due, false) : 'Tarikh belum ditetapkan'}</small>
          </div>
        </div>
        <div class="tags">
          <${StatusPill} s=${o.status} />
          ${!o.income && html`<${SrcBadge} id=${(o.payment && o.payment.paySource) || it.paySource} />`}
          <span class="rb-tag">${acc(it.entity).short}</span>
          <span class="rb-tag">${it.category}</span>
          ${it.frequency !== 'monthly' && html`<span class="rb-tag">${FREQ[it.frequency]}</span>`}
          ${o.payment && o.payment.splits && html`<span class="rb-tag"><${Icon} n="users" s=${12} />${o.payment.splits.length} penerima</span>`}
          ${o.payment && !rc && html`<span class="rb-tag" style="color:var(--amb)">Tiada bukti</span>`}
        </div>
      </div>
    </button>
    <div class="acts">
      ${o.payment
        ? html`<button class="pri" onClick=${() => open('detail', o)}><${Icon} n="check" s=${16} />${o.income ? 'Diterima' : 'Selesai'}</button>`
        : html`<button class="pri" onClick=${() => open(o.income ? 'incomeRecord' : 'pay', o)}><${Icon} n=${o.income ? 'dl' : 'pay'} s=${16} />${o.income ? 'Rekod Terima' : 'Rekod Bayar'}</button>`}
      <button onClick=${() => open('docs', o, 'receipt')}><${Icon} n="file" s=${16} />Bukti${rc > 0 && html`<span class="n">${rc}</span>`}</button>
      <button onClick=${() => open('docs', o, 'invoice')}><${Icon} n="inv" s=${16} />Invoice${inv > 0 && html`<span class="n">${inv}</span>`}</button>
      <button onClick=${() => open('edit', o)}><${Icon} n="edit" s=${16} />Edit</button>
    </div>
  </div>`
}
