/* Rekod Boss — Kenderaan: roadtax, insurans, servis. */
import { h } from '/static/vendor/preact.mjs'
import { useState } from '/static/vendor/hooks.mjs'
import {
  html, Icon, fmtMoney, fmtDate, api, todayISO, addMonthsDate, acc, ACCOUNTS, CURRENCIES,
} from './lib.js'
import { Sheet, FilePick, toast, reload, useStore } from './ui.js?v=20261029-paste2'
import { vehicleStatus } from './domain.js'

const VK = { roadtax: 'Roadtax', insurance: 'Insurans', service: 'Servis' }
const VIC = { roadtax: 'shield', insurance: 'shield', service: 'set' }
const daysText = (a) => {
  if (a.status === 'missing') return 'Tarikh belum diisi'
  if (a.days < 0) return `Tamat ${-a.days} hari lalu`
  if (a.days === 0) return 'Tamat hari ini'
  return `${a.days} hari lagi`
}

/* ================= BUTIRAN KENDERAAN ================= */
export function VehicleSheet({ v: v0, onClose, open }) {
  const d = useStore()
  const v = (d.data.vehicles || []).find((x) => x.id === v0.id) || v0
  const st = vehicleStatus(v, todayISO())
  const linked = v.linkedItemId && (d.data.items || []).find((i) => i.id === v.linkedItemId)
  return html`<${Sheet} title=${v.name + ' · ' + v.plate} onClose=${onClose}
    foot=${html`<button class="btn sec" onClick=${() => open('vehicleEdit', v)}><${Icon} n="edit" s=${18} />Edit</button>
      <button class="btn pri" onClick=${() => open('renew', v)}><${Icon} n="shield" s=${18} />Rekod pembaharuan</button>`}>
    <div class="rb-dhead">
      <div class="acc">${acc(v.entity).name}${v.insurer ? ' · ' + v.insurer : ''}</div>
      <div class="nm">${v.name}</div>
      <div class="vh-plate big">${v.plate}</div>
    </div>
    ${st.map((a) => html`<div class=${'vh-box ' + a.status} key=${a.kind}>
      <div class="hd">
        <div class="ic"><${Icon} n=${VIC[a.kind]} s=${18} /></div>
        <div style="flex:1">
          <b>${VK[a.kind]}</b>
          <small>${a.kind === 'service' ? `Setiap ${v.serviceIntervalMonths} bulan`
            : a.status === 'missing' ? 'Tarikh tamat belum diisi' : 'Tamat ' + fmtDate(a.date)}</small>
        </div>
        <span class=${'vh-days ' + a.status}>${a.status === 'missing' ? 'Belum diisi' : a.days < 0 ? 'Tamat' : a.days + ' hari'}</span>
      </div>
      ${a.status !== 'missing' && html`<div class="vh-grid">
        ${a.kind === 'service'
          ? html`<div><small>Servis terakhir</small><b>${fmtDate(a.last)}${v.lastServiceKm != null ? ' · ' + Number(v.lastServiceKm).toLocaleString() + ' km' : ''}</b></div>
              <div><small>Servis seterusnya</small><b>${fmtDate(a.date)}</b></div>`
          : html`<div><small>Sedia duit sebelum</small><b>${fmtDate(a.ready)}</b></div>
              <div><small>Simpan sebulan</small><b class="num">${a.perMonth ? '≈ ' + fmtMoney(a.perMonth, v.currency) : '—'}</b></div>`}
        <div><small>${a.kind === 'service' ? 'Anggaran kos' : 'Anggaran / amaun lepas'}</small>
          <b class="num">${a.amount ? fmtMoney(a.amount, v.currency) : html`<span class="nul">Belum diisi</span>`}</b></div>
      </div>`}
      ${a.kind === 'service'
        ? html`<button class="btn sec full sm" style="margin-top:10px" onClick=${() => open('service', v)}>
            <${Icon} n="plus" s=${16} />Rekod servis</button>`
        : a.status === 'missing' && html`<button class="btn sec full sm" style="margin-top:10px" onClick=${() => open('vehicleEdit', v)}>
            <${Icon} n="edit" s=${16} />Isi tarikh tamat</button>`}
    </div>`)}
    ${linked && html`<div class="rb-h4">Ansuran bulanan</div>
      <button class="rb-doc" onClick=${() => open('edit', { item: linked })}>
        <div class="rb-ico"><${Icon} n="Kenderaan" s=${18} /></div>
        <div class="grow"><div class="t1">${linked.name}</div>
          <div class="t2 num">${fmtMoney(linked.amount, linked.currency)} · ${linked.frequency}</div></div>
        <${Icon} n="right" s=${16} /></button>`}
    ${v.note && html`<div class="rb-h4">Catatan</div><div class="rb-bank">${v.note}</div>`}
    <div class="rb-h4">Sejarah (${(v.history || []).length})</div>
    ${(v.history || []).length
      ? html`<div class="rb-card">${v.history.map((x, i) => html`<div class="rb-row" key=${i}>
          <div class="grow"><div class="t1">${VK[x.kind]} · ${fmtDate(x.date)}</div>
            <div class="t2">${x.expiry ? 'Tamat baharu ' + fmtDate(x.expiry) : ''}${x.km != null ? ' · ' + Number(x.km).toLocaleString() + ' km' : ''}${x.workshop ? ' · ' + x.workshop : ''}${x.provider ? ' · ' + x.provider : ''}</div></div>
          <b class="num" style="font-size:14px">${fmtMoney(x.amount, v.currency)}</b></div>`)}</div>`
      : html`<div style="font-size:13px;color:var(--mut)">Belum ada rekod.</div>`}
  <//>`
}

/* ================= TAMBAH / EDIT KENDERAAN ================= */
export function VehicleEditSheet({ v, onClose, open }) {
  const [d, setD] = useState(v
    ? {
        ...v, roadtaxAmount: v.roadtaxAmount ?? '', insuranceAmount: v.insuranceAmount ?? '',
        serviceEstimate: v.serviceEstimate ?? '', lastServiceKm: v.lastServiceKm ?? '',
        roadtaxExpiry: v.roadtaxExpiry || '', insuranceExpiry: v.insuranceExpiry || '',
        lastServiceDate: v.lastServiceDate || '',
      }
    : {
        name: '', plate: '', entity: 'personal-my', currency: 'MYR', roadtaxExpiry: '', roadtaxAmount: '',
        insuranceExpiry: '', insuranceAmount: '', insurer: '', readyDays: 30, serviceIntervalMonths: 3,
        lastServiceDate: '', lastServiceKm: '', serviceEstimate: '', note: '',
      })
  const [err, setErr] = useState('')
  const [conf, setConf] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = (k, val) => setD({ ...d, [k]: val })
  const n = (e) => e.target.value.replace(/[^\d.]/g, '')
  const save = async () => {
    setErr(''); setBusy(true)
    try {
      if (v) { await api.updateVehicle(v.id, d); await reload(); toast('Kenderaan dikemas kini'); open('vehicle', (useStore().data.vehicles || []).find((x) => x.id === v.id)) }
      else { const r = await api.createVehicle(d); await reload(); toast('Kenderaan ditambah'); open('vehicle', (useStore().data.vehicles || []).find((x) => x.id === r.id)) }
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title=${v ? 'Edit kenderaan' : 'Tambah kenderaan'} onClose=${onClose} onBack=${v ? () => open('vehicle', v) : null}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${save} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}Simpan</button>`}>
    <div class="fg">
      <div class="f"><label>Model</label><input class="inp" value=${d.name} onInput=${(e) => s('name', e.target.value)} placeholder="cth: Alphard" /></div>
      <div class="f"><label>No. pendaftaran</label><input class="inp" value=${d.plate} onInput=${(e) => s('plate', e.target.value.toUpperCase())} placeholder="cth: Y5050" /></div>
      <div class="f"><label>Ruang</label><select class="inp" value=${d.entity} onChange=${(e) => s('entity', e.target.value)}>
        ${ACCOUNTS.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}</select></div>
      <div class="f"><label>Mata wang</label><select class="inp" value=${d.currency} onChange=${(e) => s('currency', e.target.value)}>
        ${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
    </div>
    <div class="rb-h4">Roadtax</div>
    <div class="fg">
      <div class="f"><label>Tarikh tamat</label><input class="inp" type="date" value=${d.roadtaxExpiry} onInput=${(e) => s('roadtaxExpiry', e.target.value)} /></div>
      <div class="f"><label>Anggaran amaun</label><input class="inp num" inputMode="decimal" value=${d.roadtaxAmount} onInput=${(e) => s('roadtaxAmount', n(e))} placeholder="Pilihan" /></div>
    </div>
    <div class="rb-h4">Insurans</div>
    <div class="fg">
      <div class="f"><label>Tarikh tamat</label><input class="inp" type="date" value=${d.insuranceExpiry} onInput=${(e) => s('insuranceExpiry', e.target.value)} /></div>
      <div class="f"><label>Anggaran premium</label><input class="inp num" inputMode="decimal" value=${d.insuranceAmount} onInput=${(e) => s('insuranceAmount', n(e))} placeholder="Pilihan" /></div>
    </div>
    <div class="f"><label>Syarikat insurans</label><input class="inp" value=${d.insurer} onInput=${(e) => s('insurer', e.target.value)} placeholder="Pilihan" /></div>
    <div class="f"><label>Ingatkan sedia duit</label>
      <div class="rb-seg">${[14, 30, 45, 60].map((x) => html`<button key=${x} class=${Number(d.readyDays) === x ? 'on' : ''} onClick=${() => s('readyDays', x)}>${x} hari</button>`)}</div>
      <span class="hint">sebelum tarikh tamat roadtax / insurans</span></div>
    <div class="rb-h4">Servis</div>
    <div class="f"><label>Selang servis</label>
      <div class="rb-seg">${[3, 4, 6].map((x) => html`<button key=${x} class=${Number(d.serviceIntervalMonths) === x ? 'on' : ''} onClick=${() => s('serviceIntervalMonths', x)}>${x} bulan</button>`)}</div></div>
    <div class="fg">
      <div class="f"><label>Servis terakhir</label><input class="inp" type="date" value=${d.lastServiceDate} onInput=${(e) => s('lastServiceDate', e.target.value)} /></div>
      <div class="f"><label>Odometer (km)</label><input class="inp num" inputMode="numeric" value=${d.lastServiceKm} onInput=${(e) => s('lastServiceKm', n(e))} placeholder="Pilihan" /></div>
    </div>
    <div class="f"><label>Anggaran kos servis</label><input class="inp num" inputMode="decimal" value=${d.serviceEstimate} onInput=${(e) => s('serviceEstimate', n(e))} placeholder="Pilihan" /></div>
    <div class="f"><label>Catatan</label><textarea class="inp" rows=${2} value=${d.note} onInput=${(e) => s('note', e.target.value)}></textarea></div>
    ${err && html`<div class="rb-note err" role="alert">${err}</div>`}
    ${v && html`<div style="margin-top:8px">${!conf
      ? html`<button class="btn dan full" onClick=${() => setConf(true)}><${Icon} n="trash" s=${16} />Buang kenderaan</button>`
      : html`<div class="rb-note err"><div style="margin-bottom:8px">Buang ${v.name} ${v.plate}? Rekod bayaran lama kekal dalam sejarah.</div>
          <div style="display:flex;gap:8px"><button class="btn sm sec" onClick=${() => setConf(false)}>Batal</button>
            <button class="btn sm pri" style="background:var(--red)" onClick=${async () => { await api.deleteVehicle(v.id); await reload(); toast('Kenderaan dibuang'); onClose() }}>Ya, buang</button></div></div>`}</div>`}
  <//>`
}

/* ================= PEMBAHARUAN ROADTAX / INSURANS ================= */
export function RenewSheet({ v, onClose, open }) {
  const plus12 = (iso) => (iso ? addMonthsDate(iso, 12) : '')
  const [kind, setKind] = useState('both')
  const [d, setD] = useState({
    date: todayISO(),
    roadtaxAmount: v.roadtaxAmount ?? '', insuranceAmount: v.insuranceAmount ?? '',
    roadtaxNewExpiry: plus12(v.roadtaxExpiry), insuranceNewExpiry: plus12(v.insuranceExpiry),
    insurer: v.insurer || '', reference: '',
  })
  const [files, setFiles] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = (k, val) => setD({ ...d, [k]: val })
  const n = (e) => e.target.value.replace(/[^\d.]/g, '')
  const doR = kind !== 'insurance'
  const doI = kind !== 'roadtax'
  const total = (doR ? Number(d.roadtaxAmount) || 0 : 0) + (doI ? Number(d.insuranceAmount) || 0 : 0)
  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({ kind, ...d }))
      files.forEach((f) => fd.append('files', f))
      await api.renewVehicle(v.id, fd)
      await reload()
      toast('Pembaharuan direkod')
      open('vehicle', (useStore().data.vehicles || []).find((x) => x.id === v.id))
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title=${'Pembaharuan · ' + v.plate} onClose=${onClose} onBack=${() => open('vehicle', v)}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${save} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}
        Sahkan · ${fmtMoney(total, v.currency)}</button>`}>
    <div class="f"><label>Yang diperbaharui</label>
      <div class="rb-seg">${[['both', 'Kedua-dua'], ['roadtax', 'Roadtax'], ['insurance', 'Insurans']].map(([k, l]) =>
        html`<button key=${k} class=${kind === k ? 'on' : ''} onClick=${() => setKind(k)}>${l}</button>`)}</div></div>
    <div class="f"><label>Tarikh bayar</label><input class="inp" type="date" value=${d.date} onInput=${(e) => s('date', e.target.value)} /></div>
    ${doR && html`<div class="rb-split"><div class="sh"><span>Roadtax</span></div><div class="fg">
      <div class="f"><label>Amaun (${v.currency})</label><input class="inp num" inputMode="decimal" value=${d.roadtaxAmount} onInput=${(e) => s('roadtaxAmount', n(e))} /></div>
      <div class="f"><label>Tamat baharu</label><input class="inp" type="date" value=${d.roadtaxNewExpiry} onInput=${(e) => s('roadtaxNewExpiry', e.target.value)} /></div>
    </div></div>`}
    ${doI && html`<div class="rb-split"><div class="sh"><span>Insurans</span></div><div class="fg">
      <div class="f"><label>Premium (${v.currency})</label><input class="inp num" inputMode="decimal" value=${d.insuranceAmount} onInput=${(e) => s('insuranceAmount', n(e))} /></div>
      <div class="f"><label>Tamat baharu</label><input class="inp" type="date" value=${d.insuranceNewExpiry} onInput=${(e) => s('insuranceNewExpiry', e.target.value)} /></div>
    </div>
    <div class="f" style="margin-bottom:0"><label>Syarikat insurans</label><input class="inp" value=${d.insurer} onInput=${(e) => s('insurer', e.target.value)} /></div></div>`}
    <div class="f"><label>Rujukan</label><input class="inp" value=${d.reference} onInput=${(e) => s('reference', e.target.value)} placeholder="Pilihan" /></div>
    <div class="f"><label>Resit / cover note (wajib)</label><${FilePick} files=${files} setFiles=${setFiles} label="Upload resit" /></div>
    <div class="rb-note" style="font-size:12.5px">Akan direkod sebagai duit keluar ${d.date ? monthLabelOf(d.date) : ''} dan tarikh tamat dikemas kini.</div>
    ${err && html`<div class="rb-note err" style="margin-top:10px" role="alert">${err}</div>`}
  <//>`
}
const monthLabelOf = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  const M = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember']
  return M[m - 1] + ' ' + y
}

/* ================= SERVIS ================= */
export function ServiceSheet({ v, onClose, open }) {
  const [d, setD] = useState({ date: todayISO(), amount: '', km: '', workshop: '', note: '', interval: v.serviceIntervalMonths })
  const [files, setFiles] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = (k, val) => setD({ ...d, [k]: val })
  const n = (e) => e.target.value.replace(/[^\d.]/g, '')
  const next = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? addMonthsDate(d.date, Number(d.interval)) : null
  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify(d))
      files.forEach((f) => fd.append('files', f))
      await api.serviceVehicle(v.id, fd)
      await reload()
      toast('Servis direkod')
      open('vehicle', (useStore().data.vehicles || []).find((x) => x.id === v.id))
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title=${'Servis · ' + v.plate} onClose=${onClose} onBack=${() => open('vehicle', v)}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${save} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}Simpan servis</button>`}>
    <div class="fg">
      <div class="f"><label>Tarikh servis</label><input class="inp" type="date" value=${d.date} onInput=${(e) => s('date', e.target.value)} /></div>
      <div class="f"><label>Kos (${v.currency})</label><input class="inp num" inputMode="decimal" value=${d.amount} onInput=${(e) => s('amount', n(e))} /></div>
      <div class="f"><label>Odometer (km)</label><input class="inp num" inputMode="numeric" value=${d.km} onInput=${(e) => s('km', n(e))} placeholder="Pilihan" /></div>
      <div class="f"><label>Bengkel</label><input class="inp" value=${d.workshop} onInput=${(e) => s('workshop', e.target.value)} placeholder="Pilihan" /></div>
    </div>
    <div class="f"><label>Servis seterusnya selepas</label>
      <div class="rb-seg">${[3, 4, 6].map((x) => html`<button key=${x} class=${Number(d.interval) === x ? 'on' : ''} onClick=${() => s('interval', x)}>${x} bulan</button>`)}</div>
      ${next && html`<span class="hint">Servis seterusnya: <b>${fmtDate(next)}</b></span>`}</div>
    <div class="f"><label>Kerja dibuat</label><input class="inp" value=${d.note} onInput=${(e) => s('note', e.target.value)} placeholder="cth: tukar minyak hitam, filter" /></div>
    <div class="f"><label>Resit / invoice bengkel (wajib)</label><${FilePick} files=${files} setFiles=${setFiles} label="Upload resit" /></div>
    ${err && html`<div class="rb-note err" role="alert">${err}</div>`}
  <//>`
}

/* ================= PILIH KENDERAAN ================= */
export function VehPickSheet({ next, onClose, open }) {
  const d = useStore()
  const vs = d.data.vehicles || []
  return html`<${Sheet} title=${next === 'renew' ? 'Roadtax / insurans' : 'Servis kereta'} onClose=${onClose}>
    <div style="font-size:13px;color:var(--mut);margin-bottom:12px">Pilih kenderaan untuk merekod ${next === 'renew' ? 'pembaharuan' : 'servis'}.</div>
    ${vs.length === 0 && html`<div class="rb-empty"><b>Belum ada kenderaan</b>Tambah kenderaan dahulu di skrin Kenderaan.</div>`}
    ${vs.map((v) => html`<button class="v2-qp" key=${v.id} onClick=${() => open(next, v)}>
      <div class="vh-plate" style="min-width:64px">${v.plate}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${v.name}</div>
        <div style="font-size:12px;color:var(--mut)">${acc(v.entity).short}${v.insurer ? ' · ' + v.insurer : ''}</div></div>
      <${Icon} n="right" s=${16} /></button>`)}
  <//>`
}

