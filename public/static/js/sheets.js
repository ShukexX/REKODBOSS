/* Rekod Boss — sheet: butiran, rekod bayar, edit, lampiran, duit masuk, kadar, akses. */
import { h } from '/static/vendor/preact.mjs'
import { useState, useEffect, useMemo } from '/static/vendor/hooks.mjs'
import {
  html, Icon, fmtMoney, fmtShort, fmtDate, fmtSize, fmtStamp, STATUS, acc, ACCOUNTS, CURRENCIES,
  PAY_METHODS, CHANNELS, CATEGORIES, INCOME_SOURCES, FREQ, monthLabel, addMonths, api, todayISO, curMonth, REF_DOCS,
} from './lib.js'
import {
  Sheet, SrcBadge, SourcePicker, FilePick, DocRow, StatusPill, BankNote, openViewerFn,
  toast, reload, useStore, recipientLine, store,
} from './ui.js?v=20261029-auth1'
import { buildOccurrences } from './domain.js?v=20261029-deletefix'

/* ================= KATA LALUAN ================= */
export function PasswordSheet({ onClose }) {
  const d = useStore()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setErr('')
    if (newPassword.length < 8) return setErr('Kata laluan mesti sekurang-kurangnya 8 aksara.')
    if (newPassword !== confirmPassword) return setErr('Pengesahan kata laluan tidak sama.')
    setBusy(true)
    try {
      await api.setPassword({ currentPassword, newPassword })
      toast('Kata laluan berjaya disimpan')
      onClose()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title="Kata laluan" onClose=${onClose}
    foot=${html`<button class="btn pri" disabled=${busy} onClick=${save}>${busy ? html`<span class="rb-spin"></span>` : html`<${Icon} n="check" s=${16} />`} Simpan kata laluan</button>`}>
    <div class="ac-hero">
      <div class="ic"><${Icon} n="shield" s=${22} /></div>
      <div><b>Login OTP dan kata laluan boleh digunakan bersama</b>
        <span>${d.me?.email || ''} · Kata laluan disimpan secara selamat dan tidak boleh dilihat semula.</span></div>
    </div>
    <div class="rb-split">
      <div class="f"><label>Kata laluan semasa ${d.me?.email ? '' : '(pilihan)'}</label>
        <input class="inp" type="password" autoComplete="current-password" value=${currentPassword} onInput=${(e) => setCurrentPassword(e.target.value)} placeholder="Kosongkan jika belum pernah ditetapkan" /></div>
      <div class="f"><label>Kata laluan baharu</label>
        <input class="inp" type="password" autoComplete="new-password" value=${newPassword} onInput=${(e) => setNewPassword(e.target.value)} placeholder="Minimum 8 aksara" /></div>
      <div class="f"><label>Ulang kata laluan baharu</label>
        <input class="inp" type="password" autoComplete="new-password" value=${confirmPassword} onInput=${(e) => setConfirmPassword(e.target.value)} placeholder="Taip semula kata laluan" /></div>
      ${err && html`<div class="rb-note err">${err}</div>`}
      <div class="rb-note ok">Selepas disimpan, anda boleh memilih <b>Log masuk dengan kata laluan</b> pada skrin login. OTP masih boleh digunakan bila-bila masa.</div>
    </div>
  <//>`
}

async function pasteClipboardImage(files, setFiles) {
  if (!navigator.clipboard?.read) throw new Error('Browser tidak membenarkan akses clipboard gambar. Gunakan Ctrl+V pada ruang tampal di Lampiran.')
  const items = await navigator.clipboard.read()
  const added = []
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    const ext = type.split('/')[1] || 'png'
    added.push(new File([blob], 'tampal-' + Date.now() + '-' + added.length + '.' + ext, { type }))
  }
  if (!added.length) throw new Error('Clipboard tidak mengandungi gambar.')
  setFiles([...(files || []), ...added])
}

const isPayrollPT = (it) => it.id.startsWith('import-pt-staff-') || (it.category === 'Gaji & bantuan' && it.entity === 'xboss-id')
const isSplitable = (it) => it.category === 'Gaji & bantuan'

/* ================= BUTIRAN ================= */
export function DetailSheet({ o: o0, onClose, open }) {
  const d = useStore()
  const list = useMemo(
    () => buildOccurrences({ items: d.data.items, payments: d.data.payments, docs: d.data.docs, month: o0.month, today: todayISO(), cm: curMonth() }),
    [d.data, o0.month]
  )
  const o = list.find((x) => x.key === o0.key) || o0
  const it = o.item
  const p = o.payment
  const a = acc(it.entity)
  const hist = (d.data.payments || []).filter((x) => x.itemId === it.id).sort((x, y) => y.month.localeCompare(x.month))
  const receipts = o.docs.filter((x) => x.kind === 'receipt')
  const invoices = o.docs.filter((x) => x.kind === 'invoice')
  const refs = REF_DOCS.filter((r) => (r.items === 'pt-staff' ? it.id.startsWith('import-pt-staff-') : r.items.includes(it.id)))
  return html`<${Sheet} title=${monthLabel(o.month)} onClose=${onClose}
    foot=${p
      ? html`<button class="btn sec" onClick=${() => open('docs', o, 'receipt')}><${Icon} n="upload" s=${18} />Tambah bukti</button>
              <button class="btn sec" onClick=${() => open('edit', o)}><${Icon} n="edit" s=${18} />Edit</button>`
      : html`<button class="btn sec" onClick=${() => open('edit', o)}><${Icon} n="edit" s=${18} />Edit</button>
              <button class="btn pri" onClick=${() => open(it.type === 'income' ? 'incomeRecord' : 'pay', o)}>
                <${Icon} n=${it.type === 'income' ? 'dl' : 'pay'} s=${18} />${it.type === 'income' ? 'Rekod Terima' : 'Rekod Bayar'}</button>`}>
    <div class="rb-dhead">
      <div class="acc"><span class=${'rb-flag ' + a.cc} style="width:22px;height:22px;font-size:9px;border-radius:6px">${a.cc}</span>${a.name} · ${it.scope}</div>
      <div class="nm">${p && p.nameSnapshot && p.nameSnapshot !== it.name ? p.nameSnapshot : it.name}</div>
      <div class="am num">${o.amount == null ? html`<span style="font-size:20px">Belum ditentukan</span>` : fmtMoney(o.amount, o.currency)}<small>${o.currency}</small></div>
      <${StatusPill} s=${o.status} />
    </div>

    <div class="rb-kv">
      <div><small>Bulan bayaran</small><b>${monthLabel(o.month)}</b></div>
      <div><small>${p ? (it.type === 'income' ? 'Tarikh diterima' : 'Tarikh dibayar') : (it.type === 'income' ? 'Tarikh dijangka' : 'Tarikh perlu bayar')}</small>
        <b>${p ? fmtDate(p.date) : o.due ? fmtDate(o.due) : html`<span class="nul">Belum ditetapkan</span>`}</b></div>
      <div><small>Kekerapan</small><b>${FREQ[it.frequency]}</b></div>
      <div><small>${it.type === 'income' ? 'Sumber' : 'Kategori'}</small><b>${it.category}</b></div>
      ${p && html`<div><small>Rujukan</small><b>${p.reference || html`<span class="nul">Tiada</span>`}</b></div>`}
      ${p && html`<div><small>Amaun jadual semasa</small><b class="num">${fmtMoney(it.amount, it.currency)}</b></div>`}
      ${!p && html`<div><small>Mula</small><b>${it.start ? monthLabel(it.start) : html`<span class="nul">Belum ditetapkan</span>`}</b></div>`}
      ${!p && html`<div><small>Hari bayaran</small><b>${it.day ?? html`<span class="nul">Belum ditetapkan</span>`}</b></div>`}
    </div>

    <div class="rb-h4">${it.type === 'income' ? 'Pembayar / akaun masuk' : 'Penerima & bank'}</div>
    ${(it.bankName || it.bankAccount) && html`<div class="rb-bank" style="display:flex;justify-content:space-between;gap:12px;white-space:normal">
      <div><small style="display:block;color:var(--mut);font-size:12px">Akaun bank</small><b>${it.bankName || 'Bank belum ditetapkan'}</b></div>
      <div style="text-align:right"><small style="display:block;color:var(--mut);font-size:12px">No. akaun</small><b class="num">${it.bankAccount || '—'}</b></div>
    </div>`}
    <${BankNote} text=${it.note} />
    ${it.type !== 'income' && html`<div class="rb-h4">Bayar dari</div>
      <div class="rb-bank" style="display:flex;align-items:center;justify-content:space-between;gap:10px;white-space:normal">
        <div>
          <${SrcBadge} size="lg" id=${(p && p.paySource) || it.paySource} method=${(p && p.payMethod) || it.payMethod} />
          ${p && p.paySource && it.paySource && p.paySource !== it.paySource &&
            html`<div style="font-size:12px;color:var(--mut);margin-top:4px">Bulan ini dibayar dari sumber berbeza daripada biasa.</div>`}
        </div>
        <button class="btn ghost sm" onClick=${() => open('edit', o)}>Ubah</button>
      </div>`}

    ${p && p.payroll && html`<div class="rb-h4">Butiran gaji bulan ini</div>
      <div class="rb-kv" style="margin-top:0">
        ${[['pokok', 'Gaji pokok'], ['elaun', 'Elaun'], ['ot', 'OT'], ['bonus', 'Bonus'], ['potongan', 'Potongan']].map(([k, l]) =>
          html`<div key=${k}><small>${l}</small><b class="num">${p.payroll[k] == null ? html`<span class="nul">—</span>` : fmtMoney(p.payroll[k], o.currency)}</b></div>`)}
        <div><small>THP</small><b class="num">${fmtMoney(p.payroll.thp, o.currency)}</b></div>
      </div>`}

    ${p && p.splits && html`<div class="rb-h4">Pecahan penerima (${p.splits.length})</div>
      ${p.splits.map((s, i) => {
        const sd = receipts.filter((x) => x.recipient === s.recipient)
        return html`<div class="rb-split" key=${i}>
          <div class="sh"><span>${s.recipient}</span><span class="num">${fmtMoney(s.amount, o.currency)}</span></div>
          <div style="font-size:13px;color:var(--ink2)">${s.channel}${s.account ? ' · ' + s.account : ''} · ${fmtDate(s.date)}${s.reference ? ' · Ruj ' + s.reference : ''}</div>
          ${s.receivedAmount != null && html`<div style="font-size:13px;margin-top:4px">Diterima: <b class="num">${fmtMoney(s.receivedAmount, s.receivedCurrency)}</b> <span style="color:var(--mut)">(direkod berasingan)</span></div>`}
          <div style="margin-top:8px">${sd.map((x) => html`<${DocRow} key=${x.id} d=${x} onOpen=${openViewerFn} />`)}</div>
        </div>`
      })}`}

    <div class="rb-h4"><span>Bukti bayaran (${receipts.length})</span><button class="btn ghost sm" onClick=${() => open('docs', o, 'receipt')}>+ Tambah</button></div>
    ${receipts.length
      ? receipts.map((x) => html`<${DocRow} key=${x.id} d=${x} onOpen=${openViewerFn} />`)
      : it.type !== 'income' && html`<div class="rb-note warn">${p ? 'Bayaran ini selesai tetapi belum ada fail bukti. Tambah bukti bila tersedia — tarikh bayaran tidak akan berubah.' : 'Bukti diperlukan semasa merekod bayaran.'}</div>`}

    <div class="rb-h4"><span>Invoice / bil (${invoices.length})</span><button class="btn ghost sm" onClick=${() => open('docs', o, 'invoice')}>+ Tambah</button></div>
    ${invoices.length ? invoices.map((x) => html`<${DocRow} key=${x.id} d=${x} onOpen=${openViewerFn} />`)
      : html`<div style="font-size:13px;color:var(--mut);padding:0 2px">Tiada invoice untuk bulan ini.</div>`}

    ${refs.length > 0 && html`<div class="rb-h4">Dokumen rujukan</div>
      ${refs.map((r) => html`<${DocRow} key=${r.file}
        d=${{ id: r.file, name: r.title, mime: r.mime, url: '/api/refdocs/' + encodeURIComponent(r.file), label: 'Dokumen rujukan — bukan resit bank' }}
        tag="Rujukan · bukan bukti transfer" onOpen=${openViewerFn} />`)}`}

    <div class="rb-h4">Sejarah bayaran (${hist.length})</div>
    ${hist.length
      ? html`<div class="rb-card">${hist.map((x) => html`<button class="rb-row" key=${x.key}
          onClick=${() => { const mm = o; open('detail', { ...mm, month: x.month, key: x.key }) }}>
          <div class="grow"><div class="t1">${monthLabel(x.month)}</div><div class="t2">Dibayar ${fmtDate(x.date)}${x.reference ? ' · ' + x.reference : ''}</div></div>
          <b class="num" style="font-size:14px">${fmtMoney(x.amount, x.currency)}</b>
        </button>`)}</div>`
      : html`<div style="font-size:13px;color:var(--mut);padding:0 2px">Belum ada bayaran direkod.</div>`}
    <div style="font-size:11.5px;color:var(--mut2);margin-top:16px" class="mono">ID: ${it.id}</div>
  <//>`
}

/* ================= REKOD BAYAR ================= */
const blankSplit = (cur, date) => ({
  recipient: '', channel: 'Bank Indonesia', account: '', amount: '',
  receivedCurrency: cur === 'MYR' ? 'IDR' : cur, receivedAmount: '', date, reference: '', files: [],
})

export function PaySheet({ o, onClose, open }) {
  const it = o.item
  const inc = it.type === 'income'
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState(it.amount ?? '')
  const [reference, setReference] = useState('')
  const [psrc, setPsrc] = useState(it.paySource || null)
  const [pmth, setPmth] = useState(it.payMethod || '')
  const [proofs, setProofs] = useState([])
  const [useSplit, setUseSplit] = useState(false)
  const [splits, setSplits] = useState([blankSplit(it.currency, todayISO()), blankSplit(it.currency, todayISO())])
  const [usePay, setUsePay] = useState(false)
  const [payroll, setPayroll] = useState({ pokok: '', elaun: '', ot: '', bonus: '', potongan: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const sum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const sumOk = Math.abs(sum - Number(amount)) < 0.005
  const thp = ['pokok', 'elaun', 'ot', 'bonus'].reduce((s, k) => s + (Number(payroll[k]) || 0), 0) - (Number(payroll.potongan) || 0)
  const upd = (i, k, v) => setSplits(splits.map((s, j) => (j === i ? { ...s, [k]: v } : s)))

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      const payload = {
        itemId: it.id, month: o.month, date, amount, reference,
        paySource: psrc, payMethod: pmth || null,
        payroll: usePay ? payroll : null,
        splits: useSplit ? splits.map((s) => ({ recipient: s.recipient, channel: s.channel, account: s.account, amount: s.amount, receivedCurrency: s.receivedCurrency, receivedAmount: s.receivedAmount, date: s.date, reference: s.reference })) : null,
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      if (useSplit) splits.forEach((s, i) => (s.files || []).forEach((f) => fd.append('splitProof:' + i, f)))
      else proofs.forEach((f) => fd.append('proofs', f))
      await api.recordPayment(fd)
      await reload()
      toast(inc ? 'Duit masuk ' + monthLabel(o.month) + ' direkod' : 'Bayaran ' + monthLabel(o.month) + ' disahkan selesai')
      onClose()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return html`<${Sheet} title=${inc ? 'Rekod Duit Masuk' : 'Rekod Bayar'} onClose=${onClose}
    onBack=${() => open('detail', o)}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${submit} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}
        ${inc ? 'Sahkan diterima' : 'Sahkan selesai'}</button>`}>
    <div class="rb-card" style="padding:14px;margin-bottom:14px;display:flex;gap:12px;align-items:center">
      <div class="rb-cat" style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center"><${Icon} n=${it.category} s=${20} /></div>
      <div style="flex:1;min-width:0"><div style="font-weight:650">${it.name}</div>
        <div style="font-size:12.5px;color:var(--mut)">${acc(it.entity).name} · bulan ${monthLabel(o.month)}</div></div>
    </div>
    <div class="fg">
      <div class="f"><label>${inc ? 'Jumlah diterima' : 'Jumlah dibayar'} (${it.currency})</label>
        <input class="inp num" inputMode="decimal" value=${amount} onInput=${(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder=${it.amount == null ? 'Masukkan amaun' : ''} />
        ${it.amount != null && Number(amount) !== it.amount && amount !== '' && html`<span class="hint">Jadual: ${fmtMoney(it.amount, it.currency)}</span>`}</div>
      <div class="f"><label>${inc ? 'Tarikh diterima' : 'Tarikh selesai'}</label>
        <input class="inp" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></div>
    </div>
    <div class="f"><label>Rujukan transaksi</label>
      <input class="inp" value=${reference} onInput=${(e) => setReference(e.target.value)} placeholder="Pilihan" maxLength=${200} /></div>
    ${!inc && html`<div class="f"><label>Dibayar dari</label>
      <${SourcePicker} value=${psrc} onChange=${setPsrc} currency=${it.currency} /></div>
      <div class="f"><label>Cara bayaran</label>
        <select class="inp" value=${pmth} onChange=${(e) => setPmth(e.target.value)}>
          <option value="">— Pilih —</option>${PAY_METHODS.map((m) => html`<option key=${m}>${m}</option>`)}
        </select></div>`}
    <div class="rb-note" style="margin-bottom:12px;font-size:12.5px">
      ${inc ? 'Duit masuk ini dikira dalam' : 'Bayaran ini kekal dalam'} <b>${monthLabel(o.month)}</b>
      walaupun tarikh transfer dalam bulan lain. Tiada wang dipindahkan oleh sistem ini.</div>

    ${!inc && isPayrollPT(it) && html`<button class=${'rb-switch' + (usePay ? ' on' : '')} onClick=${() => setUsePay(!usePay)}>
      <span><b style="font-size:14px">Butiran gaji bulan ini</b><br /><span style="font-size:12.5px;color:var(--mut)">Gaji pokok, elaun, OT, bonus, potongan</span></span><span class="knob"></span></button>`}
    ${usePay && html`<div class="rb-split">
      <div class="fg">${[['pokok', 'Gaji pokok'], ['elaun', 'Elaun'], ['ot', 'OT'], ['bonus', 'Bonus'], ['potongan', 'Potongan']].map(([k, l]) =>
        html`<div class="f" key=${k}><label>${l}</label>
          <input class="inp num" inputMode="decimal" value=${payroll[k]} onInput=${(e) => setPayroll({ ...payroll, [k]: e.target.value.replace(/[^\d.]/g, '') })} /></div>`)}
        <div class="f"><label>THP dikira</label>
          <div class="inp num" style="display:flex;align-items:center;background:var(--bg)">${fmtMoney(thp, it.currency)}</div></div>
      </div>
      ${Math.abs(thp - Number(amount)) >= 0.005 && html`<div class="rb-note warn" style="font-size:12.5px">THP mesti sama dengan jumlah dibayar.</div>`}
    </div>`}

    ${!inc && isSplitable(it) && html`<button class=${'rb-switch' + (useSplit ? ' on' : '')} onClick=${() => setUseSplit(!useSplit)}>
      <span><b style="font-size:14px">Pecah kepada beberapa penerima</b><br />
      <span style="font-size:12.5px;color:var(--mut)">Gaji dikira sekali; setiap penerima perlu bukti sendiri</span></span><span class="knob"></span></button>`}

    ${useSplit ? html`<div class=${'rb-sum ' + (sumOk ? 'ok' : 'no')}>
        <span>Jumlah pecahan</span><span class="num">${fmtMoney(sum, it.currency)} / ${fmtMoney(Number(amount) || 0, it.currency)}</span></div>
      ${splits.map((s, i) => html`<div class="rb-split" key=${i}>
        <div class="sh"><span>Penerima ${i + 1}</span>${splits.length > 1 && html`<button class="btn ghost sm" style="color:var(--red)"
          onClick=${() => setSplits(splits.filter((_, j) => j !== i))}>Buang</button>`}</div>
        <div class="f"><label>Nama penerima</label>
          <input class="inp" value=${s.recipient} onInput=${(e) => upd(i, 'recipient', e.target.value)} maxLength=${150} /></div>
        <div class="fg">
          <div class="f"><label>Saluran</label>
            <select class="inp" value=${s.channel} onChange=${(e) => upd(i, 'channel', e.target.value)}>
              ${CHANNELS.map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
          <div class="f"><label>No. akaun / telefon</label>
            <input class="inp num" value=${s.account} onInput=${(e) => upd(i, 'account', e.target.value)} /></div>
          <div class="f"><label>Amaun (${it.currency})</label>
            <input class="inp num" inputMode="decimal" value=${s.amount} onInput=${(e) => upd(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div class="f"><label>Tarikh</label>
            <input class="inp" type="date" value=${s.date} onInput=${(e) => upd(i, 'date', e.target.value)} /></div>
          <div class="f"><label>Mata wang diterima</label>
            <select class="inp" value=${s.receivedCurrency} onChange=${(e) => upd(i, 'receivedCurrency', e.target.value)}>
              ${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
          <div class="f"><label>Amaun diterima</label>
            <input class="inp num" inputMode="decimal" value=${s.receivedAmount} onInput=${(e) => upd(i, 'receivedAmount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="Pilihan" /></div>
        </div>
        <div class="f"><label>Rujukan</label>
          <input class="inp" value=${s.reference} onInput=${(e) => upd(i, 'reference', e.target.value)} placeholder="Pilihan" /></div>
        <div class="f" style="margin-bottom:0"><label>Bukti untuk penerima ini</label>
          <${FilePick} compact files=${s.files} setFiles=${(f) => upd(i, 'files', f)} label="Upload bukti" /></div>
      </div>`)}
      <button class="btn sec full" onClick=${() => setSplits([...splits, blankSplit(it.currency, date)])}>
        <${Icon} n="plus" s=${18} />Tambah penerima</button>`
      : html`<div class="f"><label>${inc ? 'Bukti terima (pilihan)' : 'Bukti bayaran (wajib)'}</label>
          <${FilePick} files=${proofs} setFiles=${setProofs} label=${inc ? 'Upload slip / penyata' : 'Upload resit / bukti transfer'} />
          <button class="btn sec sm" style="margin-top:8px" onClick=${async () => { try { await pasteClipboardImage(proofs, setProofs) } catch (e) { setErr(e.message) } }}>
            <${Icon} n="upload" s=${16} />Tampal gambar dari clipboard</button></div>`}

    ${err && html`<div class="rb-note err" style="margin-top:12px" role="alert">${err}</div>`}
  <//>`
}

/* ================= EDIT / KOMITMEN BAHARU ================= */
export function EditSheet({ o, onClose, open }) {
  const src = o && o.item
  const preset = o && o.preset
  const [d, setD] = useState(src
    ? { ...src, amount: src.amount ?? '', day: src.day ?? '', start: src.start ?? '', bankName: src.bankName || '', bankAccount: src.bankAccount || '' }
    : { name: '', entity: 'personal-my', currency: 'MYR', amount: '', day: '', start: curMonth(), frequency: 'monthly',
        category: preset === 'income' ? 'Gaji' : 'Lain-lain', type: preset === 'income' ? 'income' : 'expense', note: '', bankName: '', bankAccount: '', paySource: null, payMethod: '' })
  const [err, setErr] = useState('')
  const [end, setEnd] = useState(curMonth())
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = (k, v) => setD({ ...d, [k]: v })
  const hasPaid = src && (store.data.payments || []).some((p) => p.itemId === src.id)

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      if (src) await api.updateItem(src.id, d)
      else await api.createItem(d)
      await reload()
      toast(src ? 'Perubahan disimpan' : 'Komitmen ditambah')
      onClose()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return html`<${Sheet} title=${src ? (src.type === 'income' ? 'Edit pendapatan' : 'Edit komitmen') : (preset === 'income' ? 'Pendapatan berulang baharu' : 'Komitmen baharu')}
    onClose=${onClose} onBack=${o && o.month ? () => open('detail', o) : null}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${save} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}Simpan</button>`}>
    <div class="f"><label>Nama</label>
      <input class="inp" value=${d.name} onInput=${(e) => s('name', e.target.value)} maxLength=${150} /></div>
    <div class="f"><label>Ruang kewangan</label>
      <select class="inp" value=${d.entity} onChange=${(e) => s('entity', e.target.value)}>
        ${ACCOUNTS.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}</select></div>
    <div class="fg">
      <div class="f"><label>Mata wang</label>
        <select class="inp" value=${d.currency} onChange=${(e) => s('currency', e.target.value)}>
          ${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
      <div class="f"><label>Amaun</label>
        <input class="inp num" inputMode="decimal" value=${d.amount} onInput=${(e) => s('amount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="Kosong = belum diketahui" /></div>
      <div class="f"><label>Kekerapan</label>
        <select class="inp" value=${d.frequency} onChange=${(e) => s('frequency', e.target.value)}>
          ${Object.entries(FREQ).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}</select></div>
      <div class="f"><label>${d.type === 'income' ? 'Sumber' : 'Kategori'}</label>
        <select class="inp" value=${d.category} onChange=${(e) => s('category', e.target.value)}>
          ${(d.type === 'income' ? INCOME_SOURCES : CATEGORIES).map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
      <div class="f"><label>Bulan mula</label>
        <input class="inp" type="month" value=${d.start} onInput=${(e) => s('start', e.target.value)} /></div>
      <div class="f"><label>Hari bayaran</label>
        <input class="inp num" inputMode="numeric" value=${d.day} onInput=${(e) => s('day', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Kosong = belum" /></div>
    </div>
    <div class="f"><label>Jenis</label>
      <div class="rb-seg">${[['expense', 'Duit keluar'], ['income', 'Duit masuk']].map(([k, l]) =>
        html`<button key=${k} class=${d.type === k ? 'on' : ''}
          onClick=${() => setD({ ...d, type: k, category: k === 'income' ? (INCOME_SOURCES.includes(d.category) ? d.category : 'Gaji') : (CATEGORIES.includes(d.category) ? d.category : 'Lain-lain') })}>${l}</button>`)}</div></div>
    ${d.type !== 'income' && html`<div class="f"><label>Bayar dari (sumber)</label>
        <${SourcePicker} value=${d.paySource || null} onChange=${(v) => s('paySource', v)} currency=${d.currency} /></div>
      <div class="f"><label>Cara bayaran</label>
        <select class="inp" value=${d.payMethod || ''} onChange=${(e) => s('payMethod', e.target.value || null)}>
          <option value="">— Belum ditetapkan —</option>${PAY_METHODS.map((m) => html`<option key=${m}>${m}</option>`)}</select></div>`}
    <div class="fg">
      <div class="f"><label>Bank / institusi</label>
        <input class="inp" value=${d.bankName || ''} onInput=${(e) => s('bankName', e.target.value)} maxLength=${120} placeholder="Contoh: CIMB Bank" /></div>
      <div class="f"><label>No. akaun</label>
        <input class="inp num" value=${d.bankAccount || ''} onInput=${(e) => s('bankAccount', e.target.value)} maxLength=${120} placeholder="Contoh: 8001234567" /></div>
    </div>
    <div class="f"><label>${d.type === 'income' ? 'Catatan (pembayar / akaun masuk)' : 'Catatan tambahan penerima'}</label>
      <textarea class="inp" value=${d.note} onInput=${(e) => s('note', e.target.value)} rows=${4} placeholder="Catatan kekal seperti biasa — contoh nama penerima, arahan atau maklumat tambahan"></textarea></div>
    ${d.day > 28 && html`<div class="rb-note" style="font-size:12.5px;margin-bottom:12px">Hari ${d.day} akan dipendekkan ke hari terakhir bagi bulan yang lebih pendek.</div>`}
    ${hasPaid && html`<div class="rb-note" style="font-size:12.5px;margin-bottom:12px">Pindaan hanya mengubah jadual. Bayaran yang sudah selesai kekal dengan amaun dan tarikh asal.</div>`}
    ${err && html`<div class="rb-note err" role="alert">${err}</div>`}

    ${src && !src.deleted && html`<div class="rb-h4">Tamatkan / arkib</div>
      <div class="rb-card" style="padding:14px">
        ${src.endMonth
          ? html`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <span style="font-size:13.5px">Ditamatkan selepas <b>${monthLabel(src.endMonth)}</b></span>
              <button class="btn sm sec" onClick=${async () => { await api.unarchiveItem(src.id); await reload(); toast('Diaktifkan semula'); onClose() }}>Aktifkan</button></div>`
          : html`<div style="font-size:13px;color:var(--mut);margin-bottom:10px">Jadual berhenti selepas bulan dipilih. Sejarah bayaran tidak dipadam.</div>
            <div style="display:flex;gap:8px">
              <input class="inp" type="month" value=${end} onInput=${(e) => setEnd(e.target.value)} />
              <button class="btn sec" onClick=${async () => { try { await api.archiveItem(src.id, end); await reload(); toast('Komitmen ditamatkan'); onClose() } catch (e) { setErr(e.message) } }}>
                <${Icon} n="archive" s=${16} />Tamatkan</button></div>`}
      </div>
      <div style="margin-top:12px">
        ${!confirmDel
          ? html`<button class="btn dan full" onClick=${() => setConfirmDel(true)}><${Icon} n="trash" s=${16} />Padam komitmen</button>`
          : html`<div class="rb-note err"><div style="margin-bottom:10px">Padam “${src.name}”? Ia akan disembunyikan daripada jadual dan boleh dipulihkan di Tetapan → Dipadam. Sejarah bayaran disimpan.</div>
            <div style="display:flex;gap:8px"><button class="btn sm sec" onClick=${() => setConfirmDel(false)}>Batal</button>
              <button class="btn sm pri" style="background:var(--red)" onClick=${async () => { await api.deleteItem(src.id); await reload(); toast('Dipadam — boleh dipulihkan di Tetapan'); onClose() }}>Ya, padam</button></div></div>`}
      </div>`}
  <//>`
}

/* ================= LAMPIRAN ================= */
export function DocsSheet({ o: o0, kind: k0, onClose, open }) {
  const d = useStore()
  const [kind, setKind] = useState(k0 || 'receipt')
  const [files, setFiles] = useState([])
  const [paste, setPaste] = useState('')
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const docs = (d.data.docs || []).filter((x) => x.itemId === o0.item.id && x.month === o0.month && x.kind === kind)
  const payment = (d.data.payments || []).find((p) => p.key === o0.key)
  const splits = payment && payment.splits
  const up = async () => {
    setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('itemId', o0.item.id)
      fd.append('month', o0.month)
      fd.append('kind', kind)
      fd.append('recipient', recipient)
      files.forEach((f) => fd.append('files', f))
      if (paste.trim()) fd.append('files', new File([paste], `${kind === 'invoice' ? 'invoice' : 'resit'}-${o0.month}.txt`, { type: 'text/plain' }))
      const r = await api.uploadDocs(fd)
      await reload()
      setFiles([])
      setPaste('')
      toast(r.count + ' fail dimuat naik')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const pasteImage = (e) => {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter((x) => x.kind === 'file' && x.type.startsWith('image/'))
      .map((x) => x.getAsFile())
      .filter(Boolean)
      .map((f, i) => new File([f], `tampal-${Date.now()}-${i}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))
    if (imgs.length) {
      e.preventDefault()
      setFiles([...(files || []), ...imgs])
      setPaste('')
    }
  }
  return html`<${Sheet} title=${o0.item.name} onClose=${onClose} onBack=${() => open('detail', o0)}>
    <div class="rb-seg" style="margin-bottom:14px">
      ${[['receipt', 'Bukti bayaran'], ['invoice', 'Invoice / bil']].map(([k, l]) =>
        html`<button key=${k} class=${kind === k ? 'on' : ''} onClick=${() => setKind(k)}>${l}</button>`)}</div>
    <div style="font-size:13px;color:var(--mut);margin-bottom:10px">${monthLabel(o0.month)} · ${kind === 'invoice'
      ? 'Invoice boleh dimuat naik sebelum bayar.'
      : payment ? 'Tambah bukti untuk bayaran selesai; tarikh bayaran kekal.' : 'Status hanya bertukar selesai melalui Rekod Bayar.'}</div>
    ${docs.length ? docs.map((x) => { const d = { ...x, url: '/api/documents/' + x.id + '/file' }; return html`<div key=${x.id} style="margin-bottom:8px"><${DocRow} d=${d} onOpen=${openViewerFn} />
      ${x.mime?.startsWith('image/') && html`<img src=${d.url} alt=${x.name} style="display:block;max-width:100%;max-height:220px;margin:6px auto;border-radius:10px;object-fit:contain" />`}
      <button class="btn dan sm" style="margin-top:4px" onClick=${async () => { if (!confirm('Padam lampiran ini?')) return; await api.deleteDoc(x.id); await reload(); toast('Lampiran dipadam') }}>Padam gambar</button></div>` })
      : html`<div class="rb-empty" style="padding:22px"><b>Tiada fail</b>Belum ada ${kind === 'invoice' ? 'invoice' : 'bukti'} untuk bulan ini.</div>`}
    <div class="rb-h4">Muat naik</div>
    ${kind === 'receipt' && splits && html`<div class="f"><label>Untuk penerima</label>
      <select class="inp" value=${recipient} onChange=${(e) => setRecipient(e.target.value)}>
        <option value="">Keseluruhan</option>${splits.map((x) => html`<option key=${x.recipient}>${x.recipient}</option>`)}</select></div>`}
    <${FilePick} files=${files} setFiles=${setFiles} />
    <div class="f" style="margin-top:12px"><label>Atau tampal gambar / teks invoice atau resit</label>
      <textarea class="inp" rows="6" value=${paste} onInput=${(e) => setPaste(e.target.value)} onPaste=${pasteImage} placeholder="Tekan Ctrl+V untuk masukkan gambar, atau paste teks di sini..."></textarea>
      <small style="color:var(--mut)">Gambar yang dicopy akan masuk sebagai fail lampiran. Teks disimpan sebagai .txt.</small></div>
    ${err && html`<div class="rb-note err" style="margin-top:10px" role="alert">${err}</div>`}
    <button class="btn pri full" style="margin-top:12px" disabled=${(!files.length && !paste.trim()) || busy} onClick=${up}>
      ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="upload" s=${18} />`}
      Muat naik ${files.length ? files.length + ' fail' : ''}</button>
  <//>`
}

export function RefDocsSheet({ onClose }) {
  return html`<${Sheet} title="Dokumen rujukan asal" onClose=${onClose}>
    <div class="rb-note warn" style="margin-bottom:12px">Bahan sokongan sahaja — bukan bukti bahawa transfer telah selesai. Tiada status bayaran ditukar berdasarkan dokumen ini.</div>
    ${REF_DOCS.map((r) => html`<${DocRow} key=${r.file}
      d=${{ id: r.file, name: r.title, mime: r.mime, url: '/api/refdocs/' + encodeURIComponent(r.file), label: 'Dokumen rujukan' }}
      tag=${r.file} onOpen=${openViewerFn} />`)}
  <//>`
}

/* ================= DUIT MASUK ================= */
export function IncomeSheet({ onClose, month }) {
  const today = todayISO()
  const [d, setD] = useState({
    name: '', source: 'Gaji', entity: 'personal-my', currency: 'MYR', amount: '',
    date: month === curMonth() ? today : month + '-01', note: '',
  })
  const [files, setFiles] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const s = (k, v) => setD({ ...d, [k]: v })
  const suggest = { Gaji: 'Gaji', Komisen: 'Komisen', Bisnes: 'Hasil bisnes', Dividen: 'Dividen', Sewa: 'Sewa', 'Lain-lain': 'Duit masuk' }
  const save = async () => {
    setErr(''); setBusy(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({ ...d, name: d.name || suggest[d.source] }))
      files.forEach((f) => fd.append('files', f))
      await api.recordIncome(fd)
      await reload()
      toast('Duit masuk direkod')
      onClose()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title="Rekod Duit Masuk" onClose=${onClose}
    foot=${html`<button class="btn sec" onClick=${onClose}>Batal</button>
      <button class="btn pri" onClick=${save} disabled=${busy}>
        ${busy ? html`<span class="rb-spin" style="border-top-color:#fff"></span>` : html`<${Icon} n="check" s=${18} />`}Simpan</button>`}>
    <div class="f"><label>Sumber</label>
      <div class="rb-seg">${INCOME_SOURCES.map((x) => html`<button key=${x} class=${d.source === x ? 'on' : ''} onClick=${() => s('source', x)}>${x}</button>`)}</div></div>
    <div class="f"><label>Keterangan</label>
      <input class="inp" value=${d.name} onInput=${(e) => s('name', e.target.value)} placeholder=${suggest[d.source]} maxLength=${150} /></div>
    <div class="fg">
      <div class="f"><label>Ruang</label>
        <select class="inp" value=${d.entity} onChange=${(e) => s('entity', e.target.value)}>
          ${ACCOUNTS.map((a) => html`<option key=${a.id} value=${a.id}>${a.name}</option>`)}</select></div>
      <div class="f"><label>Mata wang</label>
        <select class="inp" value=${d.currency} onChange=${(e) => s('currency', e.target.value)}>
          ${CURRENCIES.map((c) => html`<option key=${c}>${c}</option>`)}</select></div>
      <div class="f"><label>Amaun</label>
        <input class="inp num" inputMode="decimal" value=${d.amount} onInput=${(e) => s('amount', e.target.value.replace(/[^\d.]/g, ''))} /></div>
      <div class="f"><label>Tarikh diterima</label>
        <input class="inp" type="date" value=${d.date} onInput=${(e) => s('date', e.target.value)} /></div>
    </div>
    <div class="f"><label>Catatan</label>
      <textarea class="inp" rows=${2} value=${d.note} onInput=${(e) => s('note', e.target.value)}></textarea></div>
    <div class="f"><label>Slip / bukti (pilihan)</label><${FilePick} files=${files} setFiles=${setFiles} /></div>
    <div class="rb-note" style="font-size:12.5px">Duit masuk ini direkod sebagai pendapatan sekali sahaja untuk bulan tarikh yang dipilih.</div>
    ${err && html`<div class="rb-note err" style="margin-top:10px" role="alert">${err}</div>`}
  <//>`
}

/* ================= KADAR TUKARAN ================= */
export function RateSheet({ onClose }) {
  const d = useStore()
  const r = d.data.rate
  const [v, setV] = useState(r ? String(r.idrPerMyr) : '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(v)
  const save = async () => {
    setErr(''); setBusy(true)
    try { await api.setRate(v); await reload(); toast('Kadar disimpan'); onClose() } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title="Kadar tukaran RM → Rp" onClose=${onClose}
    foot=${html`${r && html`<button class="btn sec" onClick=${async () => { await api.clearRate(); await reload(); toast('Kadar dibuang'); onClose() }}>Buang kadar</button>`}
      <button class="btn pri" onClick=${save} disabled=${busy}><${Icon} n="check" s=${18} />Simpan</button>`}>
    <div class="f"><label>Rp bagi RM 1</label>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-weight:700">RM 1 =</span>
        <input class="inp num" inputMode="decimal" value=${v} onInput=${(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Masukkan kadar semasa" />
        <span style="font-weight:700">Rp</span>
      </div>
      <span class="hint">Guna kadar bank / money changer yang Boss guna. Sistem tidak mengambil kadar secara automatik.</span></div>
    ${n > 0 && html`<div class="rb-note" style="margin-bottom:12px">Contoh: RM 1,000 ≈ Rp ${(1000 * n).toLocaleString('id-ID')} · Rp 1.000.000 ≈ RM ${(1e6 / n).toLocaleString('en-MY', { maximumFractionDigits: 2 })}</div>`}
    ${err && html`<div class="rb-note err">${err}</div>`}
    <div class="rb-note warn" style="font-size:12.5px">Jumlah gabungan hanya anggaran untuk paparan. Ia tidak mengubah amaun komitmen atau rekod bayaran.</div>
  <//>`
}

/* ================= BAYAR PANTAS ================= */
export function QuickPaySheet({ month, onClose, open }) {
  const d = useStore()
  const [q, setQ] = useState('')
  const occs = useMemo(
    () => buildOccurrences({ items: d.data.items, payments: d.data.payments, docs: d.data.docs, month, today: todayISO(), cm: curMonth() }),
    [d.data, month]
  )
  const list = occs.filter((o) => !o.income && o.status !== 'paid' && (!q || o.item.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.status === 'overdue') - (a.status === 'overdue') || a.item.name.localeCompare(b.item.name))
  return html`<${Sheet} title=${'Rekod bayar · ' + monthLabel(month, true)} onClose=${onClose}>
    <div class="v2-qtop">
      <button class="v2-qbtn in" onClick=${() => open('income')}><span><${Icon} n="dl" s=${20} w=${2.2} /></span><b>Duit masuk</b><small>Gaji, komisen…</small></button>
      <button class="v2-qbtn out" onClick=${() => open('edit', { item: null })}><span><${Icon} n="plus" s=${20} w=${2.2} /></span><b>Komitmen baharu</b><small>Bayaran berulang</small></button>
      <button class="v2-qbtn car" onClick=${() => open('vehPick', 'renew')}><span><${Icon} n="shield" s=${20} w=${2.2} /></span><b>Roadtax / insurans</b><small>Rekod pembaharuan</small></button>
      <button class="v2-qbtn svc" onClick=${() => open('vehPick', 'service')}><span><${Icon} n="set" s=${20} w=${2.2} /></span><b>Servis kereta</b><small>Rekod servis</small></button>
    </div>
    <div class="rb-h4" style="margin-top:6px">Rekod bayar belum selesai</div>
    <div class="rb-search" style="margin-bottom:12px">
      <${Icon} n="search" s=${18} style="color:var(--mut)" />
      <input placeholder="Cari komitmen…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    ${list.length === 0 && html`<div class="rb-empty"><b>Tiada baki</b>Semua bayaran bulan ini selesai.</div>`}
    ${list.map((o) => html`<button class="v2-qp" key=${o.key} onClick=${() => open('pay', o)}>
      <div class="rb-cat" style="width:42px;height:42px;display:grid;place-items:center;flex:none"><${Icon} n=${o.item.category} /></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px">${o.item.name}</div>
        <div style="font-size:12px;color:var(--mut)">${acc(o.item.entity).short} · ${o.due ? 'perlu ' + fmtDate(o.due, false) : 'tarikh belum ditetapkan'}</div>
      </div>
      <div style="text-align:right"><div class="num" style="font-weight:800;font-size:14px">${fmtShort(o.amount, o.currency)}</div>
        <${StatusPill} s=${o.status} /></div>
    </button>`)}
  <//>`
}

/* ================= AKSES AKAUN ================= */
export function AccessSheet({ onClose }) {
  const d = useStore()
  const [ms, setMs] = useState([])
  const [form, setForm] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const isOwner = d.me && d.me.role === 'owner'
  const load = async () => { try { const r = await api.members(); setMs(r.members) } catch (e) { setErr(e.message) } }
  useEffect(() => { load() }, [])
  const tog = (id) => setForm({ ...form, spaces: form.spaces.includes(id) ? form.spaces.filter((x) => x !== id) : [...form.spaces, id] })
  const send = async () => {
    setErr(''); setBusy(true)
    try { await api.invite(form); await load(); toast('Jemputan disediakan untuk ' + form.email); setForm(null) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return html`<${Sheet} title="Akses akaun" onClose=${onClose}>
    <div class="ac-hero">
      <div class="ic"><${Icon} n="shield" s=${22} /></div>
      <div><b>Hanya orang yang Boss jemput boleh masuk</b>
        <span>Tiada pendaftaran terbuka. Setiap login disemak terhadap senarai di bawah, dan setiap data ditapis di pelayan mengikut ruang yang dibenarkan.</span></div>
    </div>

    <div class="rb-h4">Ahli (${ms.length})</div>
    <div class="rb-card">
      ${ms.map((m) => html`<div class="ac-mem" key=${m.id}>
        <div class="av">${m.name.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</div>
        <div class="grow">
          <div class="t1">${m.name} ${m.status === 'invited' && html`<span class="rb-st unpaid" style="margin-left:4px">Dijemput</span>`}</div>
          <div class="t2">${m.email || html`<span style="color:var(--amb)">E-mel belum ditetapkan</span>`}</div>
          <div class="t2"><b style="color:var(--g6)">${({ owner: 'Pemilik', partner: 'Pasangan', viewer: 'Lihat sahaja' })[m.role]}</b>
            · ${m.role === 'owner' ? 'Semua 4 ruang' : m.spaces.map((s) => acc(s).short).join(', ')}</div>
        </div>
        ${isOwner && m.role !== 'owner' && html`<button class="btn sm dan" onClick=${async () => {
          if (!confirm('Buang akses ' + m.email + '?')) return
          await api.removeMember(m.id); await load(); toast('Akses dibuang')
        }}>Buang</button>`}
      </div>`)}
    </div>

    ${isOwner && (!form ? html`<button class="btn pri full" style="margin-top:12px" onClick=${() => setForm({ name: '', email: '', role: 'partner', spaces: ['personal-my', 'personal-id'] })}>
        <${Icon} n="plus" s=${18} />Jemput isteri / ahli keluarga</button>`
      : html`<div class="rb-split" style="margin-top:12px">
          <div class="sh"><span>Jemput ahli</span><button class="btn ghost sm" onClick=${() => setForm(null)}>Batal</button></div>
          <div class="f"><label>Nama</label><input class="inp" value=${form.name} onInput=${(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama isteri" /></div>
          <div class="f"><label>E-mel login</label><input class="inp" type="email" value=${form.email} onInput=${(e) => setForm({ ...form, email: e.target.value })} placeholder="e-mel isteri" /></div>
          <div class="f"><label>Peranan</label>
            ${['partner', 'viewer'].map((r) => html`<button key=${r} class=${'ac-role' + (form.role === r ? ' on' : '')} onClick=${() => setForm({ ...form, role: r })}>
              <span class="rd"></span><span><b>${({ partner: 'Pasangan', viewer: 'Lihat sahaja' })[r]}</b>
              <small>${({
                partner: 'Lihat & rekod bayaran, upload bukti, tambah duit masuk. Tidak boleh padam, urus ahli atau backup penuh.',
                viewer: 'Lihat ringkasan, bayaran dan lampiran. Tidak boleh ubah apa-apa.',
              })[r]}</small></span></button>`)}
          </div>
          <div class="f"><label>Ruang yang boleh dilihat</label>
            <div class="ac-spaces">${ACCOUNTS.map((a) => html`<button key=${a.id} class=${form.spaces.includes(a.id) ? 'on' : ''} onClick=${() => tog(a.id)}>
              <span class="cb">${form.spaces.includes(a.id) && html`<${Icon} n="check" s=${13} w=${3} />`}</span>${a.name}</button>`)}</div>
            <span class="hint">Contoh: isteri lihat Personal sahaja, bisnes kekal untuk Boss.</span>
          </div>
          ${err && html`<div class="rb-note err" style="margin-bottom:10px">${err}</div>`}
          <button class="btn pri full" disabled=${busy} onClick=${send}><${Icon} n="check" s=${18} />Hantar jemputan</button>
        </div>`)}
    ${err && !form && html`<div class="rb-note err" style="margin-top:10px">${err}</div>`}

    <div class="rb-h4">Keselamatan login</div>
    <div class="rb-card">
      ${[
        ['shield', 'Login dengan e-mel + kod sekali guna (OTP)', 'Tiada kata laluan untuk dicuri. Kod dihantar ke e-mel ahli.'],
        ['users', 'Senarai ahli tertutup', 'E-mel yang tiada dalam senarai ditolak, walaupun tahu alamat web.'],
        ['eye', 'Log aktiviti', 'Setiap bayaran, edit dan upload direkod: siapa & bila.'],
        ['logout', 'Log keluar semua peranti', 'Jika telefon hilang, Boss boleh tamatkan semua sesi.'],
      ].map(([ic, t, dd]) => html`<div class="rb-row" key=${t}>
        <div class="rb-ico"><${Icon} n=${ic} s=${17} /></div>
        <div class="grow"><div class="t1" style="font-size:13.5px">${t}</div><div class="t2">${dd}</div></div></div>`)}
    </div>
    <div class="rb-note ok" style="margin-top:14px;font-size:12.5px">
      <b>Aktif.</b> Login OTP, sesi pelayan, semakan pemilikan pada setiap baca/tulis/muat turun, dan tapisan ruang di pelayan sudah berjalan dalam versi ini.</div>
    <button class="btn sec full" style="margin-top:12px" onClick=${async () => {
      if (!confirm('Tamatkan semua sesi untuk akaun anda?')) return
      await api.logoutAll(); toast('Semua sesi ditamatkan'); location.reload()
    }}><${Icon} n="logout" s=${16} />Log keluar semua peranti</button>
  <//>`
}
