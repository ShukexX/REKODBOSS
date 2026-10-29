/* Rekod Boss — skrin utama: Ringkasan, Bayaran, Duit masuk, Kenderaan, Rekod, Tetapan, Semakan. */
import { h } from '/static/vendor/preact.mjs'
import { useState, useEffect, useMemo, useRef } from '/static/vendor/hooks.mjs'
import {
  html, Icon, fmtMoney, fmtShort, fmtDate, fmtSize, fmtStamp, STATUS, acc, ACCOUNTS, CURRENCIES,
  CATEGORIES, FREQ, PAY_METHODS, monthLabel, addMonths, api, todayISO, curMonth, daysBetween,
} from './lib.js'
import {
  useStore, MonthPicker, V2Month, Ring, PayCard, StatusPill, SrcBadge, DocRow, openViewerFn, toast, reload, store,
} from './ui.js'
import {
  buildOccurrences, totals, combine, bySource, pendingItems, vehicleStatus, vehicleAlerts,
} from './domain.js'
import { DetailSheet, PaySheet, EditSheet, DocsSheet, RefDocsSheet, IncomeSheet, RateSheet, QuickPaySheet, AccessSheet } from './sheets.js'

export const useOccs = (month) => {
  const d = useStore()
  return useMemo(() => {
    if (!d.data) return []
    return buildOccurrences({ items: d.data.items, payments: d.data.payments, docs: d.data.docs, month, today: todayISO(), cm: curMonth() })
  }, [d.data, month])
}

const cnt = (occs, s) => occs.filter((o) => !o.income && (s === 'open' ? o.status !== 'paid' : o.status === s)).length

/* ================= RINGKASAN ================= */
export function Dashboard({ month, setMonth, open, go }) {
  const d = useStore()
  const occs = useOccs(month)
  const t = totals(occs)
  const [cur, setCur] = useState('MYR')
  const [comboIn, setComboIn] = useState('MYR')
  const rate = d.data.rate
  const isCombo = cur === 'ALL'
  const x = isCombo ? (combine(t, comboIn, rate && rate.idrPerMyr) || t.MYR) : t[cur]
  const dc = isCombo ? comboIn : cur
  const pend = pendingItems(d.data.items)
  const upcoming = occs.filter((o) => !o.income && o.status !== 'paid')
    .sort((a, b) => (b.status === 'overdue') - (a.status === 'overdue') || (a.due || '9').localeCompare(b.due || '9')).slice(0, 4)
  const hr = new Date().getHours()
  const greet = hr < 12 ? 'Selamat pagi' : hr < 15 ? 'Selamat tengah hari' : hr < 19 ? 'Selamat petang' : 'Selamat malam'
  const first = (d.me && d.me.name || 'Boss').split(' ')[0]

  return html`<div class="rb-wrap">
    <div class="v2-head">
      <div><small>${greet}, ${d.me && d.me.name ? d.me.name.split(' ').slice(0, 2).join(' ') : 'Boss Shukex'}</small><h1>Rekod Boss</h1></div>
      <div style="display:flex;gap:8px">
        <button class="v2-bell" onClick=${() => go('bayaran', { status: 'overdue' })} aria-label="Tertunggak">
          <${Icon} n="alert" s=${20} />${cnt(occs, 'overdue') > 0 && html`<span class="dot"></span>`}</button>
        <button class="v2-bell" onClick=${() => go('tetapan')} aria-label="Tetapan"><${Icon} n="set" s=${20} /></button>
      </div>
    </div>

    <div class="v2-bal">
      <span class="orb o3"></span><span class="orb o1"></span><span class="orb o2"></span>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="cur">
          ${CURRENCIES.map((c) => html`<button key=${c} class=${cur === c ? 'on' : ''} onClick=${() => setCur(c)}>${c}</button>`)}
          <button class=${isCombo ? 'on' : ''} onClick=${() => setCur('ALL')}>Gabung</button>
        </div>
        ${isCombo && rate && html`<div class="cur">
          ${['MYR', 'IDR'].map((c) => html`<button key=${c} class=${comboIn === c ? 'on' : ''} onClick=${() => setComboIn(c)}>${c === 'MYR' ? 'RM' : 'Rp'}</button>`)}</div>`}
      </div>
      ${isCombo && !rate ? html`<div style="margin-top:18px">
          <div class="lbl">Jumlah gabungan Malaysia + Indonesia</div>
          <div style="font-size:15px;font-weight:600;margin:6px 0 14px;max-width:78%">Tetapkan kadar tukaran dahulu supaya MYR dan IDR boleh dijumlahkan.</div>
          <button class="v2-ratebtn" onClick=${() => open('rate')}><${Icon} n="edit" s=${16} />Tetapkan kadar RM → Rp</button>
        </div>` : html`
        <div class="pill"><${Icon} n="check" s=${14} w=${2.4} /><span>${x.pct}% selesai · ${monthLabel(month, true)}${isCombo ? ' · 2 negara' : ''}</span></div>
        <div class="lbl">${isCombo ? 'Baki belum bayar — gabungan (anggaran)' : 'Baki belum bayar'}</div>
        <div class="big num">${isCombo ? '≈ ' : ''}${fmtMoney(x.unpaid, dc)}</div>
        ${isCombo && html`<div class="v2-alt num">Jumlah kos sebulan: <b>≈ ${fmtMoney(x.known, dc)}</b> · ≈ ${fmtShort(combine(t, dc === 'MYR' ? 'IDR' : 'MYR', rate.idrPerMyr).known, dc === 'MYR' ? 'IDR' : 'MYR')}</div>`}
        <div class="foot">
          <button class="go" onClick=${() => go('bayaran', isCombo ? { status: 'open' } : { status: 'open', currency: cur })} aria-label="Lihat bayaran">
            <${Icon} n="right" s=${20} w=${2.4} /></button>
          <div class="mini">
            <div>Sudah bayar<b class="num">${fmtShort(x.paid, dc)}</b></div>
            <div class=${x.overdue ? 'red' : ''}>Tertunggak<b class="num">${fmtShort(x.overdue, dc)}</b></div>
            <div>Komitmen<b class="num">${fmtShort(x.known, dc)}</b></div>
          </div>
        </div>`}
    </div>

    ${isCombo && rate && html`<div class="v2-combo">
      <div class="hd"><b>Pecahan jumlah 2 negara · ${monthLabel(month, true)}</b>
        <button onClick=${() => open('rate')}>Kadar: RM1 = Rp ${rate.idrPerMyr.toLocaleString('id-ID')} <${Icon} n="edit" s=${13} /></button></div>
      <div class="tbl">
        <div class="r h"><span></span><span>Komitmen</span><span>Dibayar</span><span>Baki</span></div>
        <div class="r"><span><i class="rb-flag MY">MY</i>MYR</span>
          <span class="num">${fmtShort(t.MYR.known, 'MYR')}</span><span class="num">${fmtShort(t.MYR.paid, 'MYR')}</span><span class="num">${fmtShort(t.MYR.unpaid, 'MYR')}</span></div>
        <div class="r"><span><i class="rb-flag ID">ID</i>IDR</span>
          <span class="num">${fmtShort(t.IDR.known, 'IDR')}</span><span class="num">${fmtShort(t.IDR.paid, 'IDR')}</span><span class="num">${fmtShort(t.IDR.unpaid, 'IDR')}</span></div>
        <div class="r sub"><span>IDR dalam RM</span>
          <span class="num">≈ ${fmtShort(t.IDR.known / rate.idrPerMyr, 'MYR')}</span>
          <span class="num">≈ ${fmtShort(t.IDR.paid / rate.idrPerMyr, 'MYR')}</span>
          <span class="num">≈ ${fmtShort(t.IDR.unpaid / rate.idrPerMyr, 'MYR')}</span></div>
        ${['MYR', 'IDR'].map((c) => {
          const g = combine(t, c, rate.idrPerMyr)
          return html`<div class="r tot" key=${c}><span>Jumlah (${c === 'MYR' ? 'RM' : 'Rp'})</span>
            <span class="num">≈ ${fmtShort(g.known, c)}</span><span class="num">≈ ${fmtShort(g.paid, c)}</span><span class="num">≈ ${fmtShort(g.unpaid, c)}</span></div>`
        })}
      </div>
      <div class="nt">Anggaran paparan sahaja menggunakan kadar yang Boss tetapkan (${fmtDate(rate.date)}). Rekod bayaran tetap disimpan dalam mata wang asal.${(t.MYR.unknown + t.IDR.unknown) ? ` ${t.MYR.unknown + t.IDR.unknown} item tanpa amaun tidak dikira.` : ''}</div>
    </div>`}

    <${CashControl} t=${t} cur=${cur} comboIn=${comboIn} month=${month} open=${open} go=${go} />
    <${SourceDash} occs=${occs} month=${month} go=${go} />
    <${VehicleDash} open=${open} go=${go} />

    <div class="v2-sec">
      <div class="v2-sechead"><h2>Tindakan</h2><${V2Month} month=${month} setMonth=${setMonth} /></div>
      <div class="v2-acts">
        <button class="v2-act a1" onClick=${() => go('bayaran', { status: 'overdue' })}>
          <span class="gi"><${Icon} n="alert" s=${22} /></span><div><b>${cnt(occs, 'overdue')}</b><span>Tertunggak</span></div></button>
        <button class="v2-act a2" onClick=${() => go('bayaran', { status: 'open' })}>
          <span class="gi"><${Icon} n="pay" s=${22} /></span><div><b>${cnt(occs, 'open')}</b><span>Belum bayar</span></div></button>
        <button class="v2-act a3" onClick=${() => go('bayaran', { status: 'paid' })}>
          <span class="gi"><${Icon} n="check" s=${22} /></span><div><b>${cnt(occs, 'paid')}</b><span>Selesai</span></div></button>
        <button class="v2-act a4" onClick=${() => open('quick')}>
          <span class="gi"><${Icon} n="upload" s=${22} /></span><div><b style="font-size:17px">Rekod</b><span>Bayar pantas</span></div></button>
      </div>
    </div>

    <div class="v2-sec">
      <div class="v2-sechead"><h2>Ruang kewangan</h2><button class="lnk" onClick=${() => go('bayaran', {})}>Semua</button></div>
      <div class="v2-accs">
        ${ACCOUNTS.filter((a) => (d.data.spaces || []).includes(a.id)).map((a) => {
          const ao = occs.filter((o) => !o.income && o.item.entity === a.id)
          const at = totals(ao)
          const curs = CURRENCIES.filter((c) => at[c].count)
          const done = ao.filter((o) => o.status === 'paid').length
          const pct = ao.length ? Math.round((done / ao.length) * 100) : 0
          return html`<button class="v2-acc" key=${a.id} onClick=${() => go('bayaran', { entity: a.id })}>
            <div class="t"><div class=${'rb-flag ' + a.cc}>${a.cc}</div>
              <div style="flex:1;min-width:0"><div class="nm">${a.name}</div><div class="mt">${a.scope} · ${a.country}</div></div></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <div style="min-width:0">
                ${curs.length ? curs.map((c) => html`<div key=${c} class="amt num">${fmtShort(at[c].known, c)}</div>`)
                  : html`<div class="amt" style="color:var(--mut);font-size:14px">Tiada jadual</div>`}
                <div class="row" style="margin-top:2px">${done}/${ao.length} selesai</div>
              </div>
              <${Ring} pct=${pct} />
            </div>
            ${curs.map((c) => at[c].unpaid > 0 && html`<div class="row" key=${'u' + c}>
              <span>Belum bayar</span>
              <span class=${at[c].overdue ? 'due num' : 'num'} style="font-weight:700">${fmtShort(at[c].unpaid, c)}</span></div>`)}
          </button>`
        })}
      </div>
    </div>

    <div class="v2-sec">
      <div class="v2-sechead"><h2>Perlu dibayar</h2><button class="lnk" onClick=${() => go('bayaran', { status: 'open' })}>Lihat semua</button></div>
      ${upcoming.length
        ? html`<div class="rb-list">${upcoming.map((o) => html`<${PayCard} key=${o.key} o=${o} open=${open} />`)}</div>`
        : html`<div class="rb-empty"><b>Semua selesai 🎉</b>Tiada baki untuk ${monthLabel(month)}.</div>`}
    </div>

    ${pend.length > 0 && html`<div class="v2-sec">
      <div class="v2-sechead"><h2>Menunggu amaun / jadual</h2><span style="font-size:13px;color:var(--mut)">${pend.length}</span></div>
      <div class="rb-card">${pend.map((it) => html`<button class="rb-row" key=${it.id} onClick=${() => open('edit', { item: it })}>
        <div class="rb-ico"><${Icon} n="clock" s=${18} /></div>
        <div class="grow"><div class="t1">${it.name}</div>
          <div class="t2">${!it.start ? 'Bulan mula belum ditetapkan' : 'Amaun belum ditentukan'}</div></div>
        <${Icon} n="right" s=${16} /></button>`)}</div>
    </div>`}
  </div>`
}

/* ================= KAWALAN BULANAN ================= */
function CashControl({ t, cur, comboIn, month, open, go }) {
  const d = useStore()
  const isCombo = cur === 'ALL'
  const rate = d.data.rate
  if (isCombo && !rate) return null
  const c = isCombo ? comboIn : cur
  const x = isCombo ? combine(t, comboIn, rate.idrPerMyr) : t[cur]
  const pre = isCombo ? '≈ ' : ''
  const srcs = Object.entries(x.bySource).filter(([, b]) => b.expected > 0 || b.received > 0).sort((a, b) => b[1].expected - a[1].expected)
  const tot = srcs.reduce((s, [, b]) => s + Math.max(b.expected, b.received), 0) || 1
  const COL = { Gaji: '#7f57e3', Komisen: '#e45bb0', Bisnes: '#f4b73e', Dividen: '#3fc28b', Sewa: '#4aa3df', 'Lain-lain': '#aaa3bd' }
  const noInc = x.incomeCount === 0
  const sign = (v) => (v < 0 ? '− ' : '')
  const other = cur === 'MYR' ? 'IDR' : 'MYR'
  return html`<div class="v2-sec">
    <div class="v2-sechead"><h2>Kawalan bulanan</h2><button class="lnk" onClick=${() => go('pendapatan')}>Duit masuk →</button></div>
    <div class="v2-cash">
      <div class="flow">
        <div class="in"><span class="ic"><${Icon} n="dl" s=${18} w=${2.2} /></span><small>Duit masuk</small>
          <b class="num">${pre}${fmtShort(x.income, c)}</b><em class="num">dijangka ${pre}${fmtShort(x.incomeExpected, c)}</em></div>
        <div class="out"><span class="ic"><${Icon} n="upload" s=${18} w=${2.2} /></span><small>Duit keluar</small>
          <b class="num">${pre}${fmtShort(x.paid, c)}</b><em class="num">komitmen ${pre}${fmtShort(x.known, c)}</em></div>
      </div>
      <div class="bal">
        <div><small>Baki sekarang</small><span class="hint">masuk diterima − keluar dibayar</span></div>
        <b class=${'num ' + (x.cashNow < 0 ? 'neg' : 'pos')}>${pre}${sign(x.cashNow)}${fmtMoney(Math.abs(x.cashNow), c)}</b>
      </div>
      <div class="bal end">
        <div><small>Unjuran hujung ${monthLabel(month, true)}</small><span class="hint">semua dijangka masuk − semua komitmen</span></div>
        <b class=${'num ' + (x.cashEnd < 0 ? 'neg' : 'pos')}>${pre}${sign(x.cashEnd)}${fmtMoney(Math.abs(x.cashEnd), c)}</b>
      </div>
      ${srcs.length > 0 && html`<div class="srcbar">${srcs.map(([k, b]) =>
          html`<i key=${k} style=${`width:${(Math.max(b.expected, b.received) / tot) * 100}%;background:${COL[k] || COL['Lain-lain']}`}></i>`)}</div>
        <div class="srcs">${srcs.map(([k, b]) => html`<div key=${k}>
          <i style=${'background:' + (COL[k] || COL['Lain-lain'])}></i><span>${k}</span>
          <b class="num">${pre}${fmtShort(b.received, c)}</b><em class="num">/ ${fmtShort(b.expected, c)}</em></div>`)}</div>`}
      ${noInc && html`<div class="empty">Belum ada sumber duit masuk untuk bulan ini. Tambah gaji, komisen atau pendapatan lain untuk nampak baki sebenar.</div>`}
      ${!isCombo && (t[other].incomeCount + t[other].count) > 0 && html`<div class="nt">Hanya ${cur}. Tekan <b>Gabung</b> untuk lihat kedua-dua negara.</div>`}
      ${x.incomeUnknown > 0 && html`<div class="nt">${x.incomeUnknown} sumber tanpa amaun tidak dikira.</div>`}
      <div class="btns">
        <button class="btn pri" onClick=${() => open('income')}><${Icon} n="plus" s=${18} />Duit masuk</button>
        <button class="btn sec" onClick=${() => open('edit', { item: null, preset: 'income' })}><${Icon} n="rec" s=${18} />Pendapatan berulang</button>
      </div>
    </div>
  </div>`
}

/* ================= IKUT SUMBER BAYARAN ================= */
function SourceDash({ occs, month, go }) {
  const d = useStore()
  const groups = bySource(occs, d.data.sources || [])
  const known = (groups || []).filter((g) => g.id)
  return html`<div class="v2-sec">
    <div class="v2-sechead"><h2>Ikut sumber bayaran</h2><button class="lnk" onClick=${() => go('bayaran', { groupBy: 'source' })}>Semua</button></div>
    <div class="src-dash">
      ${known.map((g) => {
        const s = g.src
        if (!s) return null
        const cur = g.MYR.known ? 'MYR' : 'IDR'
        const v = g[cur]
        return html`<button class="src-card" key=${g.id} onClick=${() => go('bayaran', { source: g.id })}>
          <div class="hd"><i style=${`background:${s.color};color:${s.ink}`}>${s.short.slice(0, 1)}</i>
            <div style="min-width:0"><b>${s.short}</b><small>${g.paidN}/${g.n} dibayar</small></div></div>
          <div class="rw"><span class="num">${fmtShort(v.known, cur)}</span>
            ${v.unpaid > 0 && html`<em class="num">baki ${fmtShort(v.unpaid, cur)}</em>`}</div>
        </button>`
      })}
      ${groups.find((g) => !g.id) ? html`<button class="src-card none" onClick=${() => go('bayaran', { source: 'none' })}>
        <div class="hd"><i>?</i><div><b>Belum ditetapkan</b>
          <small>${groups.find((g) => !g.id).n} komitmen</small></div></div>
        <div class="rw"><span style="font-size:13px;color:var(--mut)">Pilih sumber untuk peringatan</span></div>
      </button>` : null}
    </div>
  </div>`
}

/* ================= KENDERAAN (ringkasan) ================= */
const VK = { roadtax: 'Roadtax', insurance: 'Insurans', service: 'Servis' }
const daysText = (a) => {
  if (a.status === 'missing') return 'Tarikh belum diisi'
  if (a.days < 0) return `Tamat ${-a.days} hari lalu`
  if (a.days === 0) return 'Tamat hari ini'
  return `${a.days} hari lagi`
}

function VehicleDash({ open, go }) {
  const d = useStore()
  const vs = d.data.vehicles || []
  const today = todayISO()
  const alerts = vehicleAlerts(vs, today).filter((a) => a.status !== 'missing')
  const missing = vehicleAlerts(vs, today).filter((a) => a.status === 'missing').length
  const need = CURRENCIES.map((c) => [c, alerts.filter((a) => a.v.currency === c && a.days <= 60 && a.amount).reduce((s, a) => s + a.amount, 0)]).filter((x) => x[1])
  return html`<div class="v2-sec">
    <div class="v2-sechead"><h2>Kenderaan</h2><button class="lnk" onClick=${() => go('kenderaan')}>Urus →</button></div>
    <div class="vh-dash">
      ${alerts.length > 0 ? html`<div>
          <div class="vh-need">
            <div><small>Perlu sedia dalam 60 hari</small>
              ${need.length ? need.map(([c, v]) => html`<b key=${c} class="num">${fmtMoney(v, c)}</b>`)
                : html`<b style="font-size:14px">Anggaran belum diisi</b>`}</div>
            <span class="vh-cnt">${alerts.length} perkara</span>
          </div>
          ${alerts.slice(0, 4).map((a, i) => html`<button class="vh-al" key=${i} onClick=${() => open('vehicle', a.v)}>
            <span class=${'vh-dot ' + a.status}></span>
            <div style="flex:1;min-width:0">
              <div class="t1">${VK[a.kind]} · ${a.v.name} <span class="pl">${a.v.plate}</span></div>
              <div class="t2">${a.kind === 'service' ? 'Servis seterusnya ' : 'Tamat '}${fmtDate(a.date)} · ${daysText(a)}${a.kind !== 'service' && a.status === 'ok' ? ' · sedia duit ' + fmtDate(a.ready) : ''}</div>
            </div>
            <b class="num" style="font-size:13.5px;white-space:nowrap">${a.amount ? fmtMoney(a.amount, a.v.currency) : '—'}</b>
          </button>`)}
        </div>`
        : html`<div class="vh-ok"><${Icon} n="check" s=${18} />${vs.length ? 'Tiada roadtax, insurans atau servis dalam 60 hari.' : 'Belum ada kenderaan.'}</div>`}
      ${missing > 0 && html`<button class="vh-miss" onClick=${() => go('kenderaan')}>
        <${Icon} n="info" s=${16} />${missing} tarikh belum diisi — lengkapkan untuk peringatan</button>`}
    </div>
  </div>`
}

/* ================= BAYARAN ================= */
export function Payments({ month, setMonth, open, filters, setFilters }) {
  const d = useStore()
  const all = useOccs(month).filter((o) => !o.income)
  const [q, setQ] = useState('')
  const f = filters
  const set = (k, v) => setFilters({ ...f, [k]: v })
  const srcOf = (o) => (o.payment && o.payment.paySource) || o.item.paySource || ''
  const base = all.filter((o) =>
    (!f.entity || o.item.entity === f.entity) &&
    (!f.source || (f.source === 'none' ? !srcOf(o) : srcOf(o) === f.source)) &&
    (!f.currency || o.currency === f.currency) &&
    (!f.category || o.item.category === f.category) &&
    (!q || (o.item.name + ' ' + o.item.note).toLowerCase().includes(q.toLowerCase())))
  const counts = { all: base.length, open: base.filter((o) => o.status !== 'paid').length, overdue: base.filter((o) => o.status === 'overdue').length, paid: base.filter((o) => o.status === 'paid').length }
  const list = base.filter((o) => f.status === 'all' || (f.status === 'open' ? o.status !== 'paid' : o.status === f.status))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.item.name.localeCompare(b.item.name))
  const t = totals(list)
  const groups = f.groupBy === 'source'
    ? [...(d.data.sources || []).map((x) => ({ a: { id: x.id, name: x.name }, items: list.filter((o) => srcOf(o) === x.id) })),
        { a: { id: 'none', name: 'Sumber belum ditetapkan' }, items: list.filter((o) => !srcOf(o)) }].filter((g) => g.items.length)
    : ACCOUNTS.map((a) => ({ a, items: list.filter((o) => o.item.entity === a.id) })).filter((g) => g.items.length)
  return html`<div class="rb-wrap">
    <div class="rb-plain-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div><h1>Bayaran</h1><p>Jadual berulang untuk ${monthLabel(month)}</p></div>
      <${MonthPicker} month=${month} setMonth=${setMonth} light />
    </div>
    <div class="rb-filters">
      <div class="rb-search"><${Icon} n="search" s=${18} style="color:var(--mut)" />
        <input placeholder="Cari nama, penerima, no. akaun…" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Cari" />
        ${q && html`<button onClick=${() => setQ('')} aria-label="Kosongkan"><${Icon} n="x" s=${16} /></button>`}</div>
      <div style="margin-top:10px" class="rb-seg">
        ${[['open', 'Belum bayar'], ['overdue', 'Tertunggak'], ['paid', 'Selesai'], ['all', 'Semua']].map(([k, l]) =>
          html`<button key=${k} class=${f.status === k ? 'on' : ''} onClick=${() => set('status', k)}>${l}<span class="c">${counts[k]}</span></button>`)}
      </div>
      <div class="rb-chips">
        <button class=${'rb-chip' + (!f.entity ? ' on' : '')} onClick=${() => set('entity', '')}>Semua ruang</button>
        ${ACCOUNTS.filter((a) => (d.data.spaces || []).includes(a.id)).map((a) =>
          html`<button key=${a.id} class=${'rb-chip' + (f.entity === a.id ? ' on' : '')} onClick=${() => set('entity', a.id)}>${a.name}</button>`)}
      </div>
      <div class="rb-selrow">
        <select class="rb-sel" value=${f.currency} onChange=${(e) => set('currency', e.target.value)} aria-label="Mata wang">
          <option value="">MYR & IDR</option><option>MYR</option><option>IDR</option></select>
        <select class="rb-sel" value=${f.source || ''} onChange=${(e) => set('source', e.target.value)} aria-label="Sumber bayaran">
          <option value="">Semua sumber</option>
          ${(d.data.sources || []).map((x) => html`<option key=${x.id} value=${x.id}>${x.short}</option>`)}
          <option value="none">Belum ditetapkan</option></select>
        <select class="rb-sel" value=${f.category} onChange=${(e) => set('category', e.target.value)} aria-label="Kategori">
          <option value="">Semua kategori</option>${CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select>
      </div>
    </div>
    <div class="rb-strip">
      ${CURRENCIES.map((c) => html`<div key=${c}>
        <small><span>${c} · ${t[c].count} item</span><span>${f.status === 'paid' ? 'dibayar' : f.status === 'all' ? 'jumlah' : 'baki'}</span></small>
        <b class="num">${fmtShort(f.status === 'paid' ? t[c].paid : f.status === 'all' ? t[c].known : f.status === 'overdue' ? t[c].overdue : t[c].unpaid, c)}</b>
        ${t[c].unknown > 0 && html`<div class="s">+${t[c].unknown} belum ditentukan</div>`}</div>`)}
    </div>
    <div class="rb-seg" style="margin-top:12px">
      ${[['entity', 'Ikut ruang'], ['source', 'Ikut sumber bayaran']].map(([k, l]) =>
        html`<button key=${k} class=${(f.groupBy || 'entity') === k ? 'on' : ''} onClick=${() => set('groupBy', k)}>${l}</button>`)}
    </div>
    ${groups.length === 0 && html`<div class="rb-empty" style="margin-top:16px"><b>Tiada bayaran</b>Tiada rekod sepadan dengan penapis untuk bulan ini.</div>`}
    ${groups.map((g) => html`<div key=${g.a.id}>
      <div class="rb-grp"><span>${g.a.name}</span><span>${g.items.length} item</span></div>
      <div class="rb-list">${g.items.map((o) => html`<${PayCard} key=${o.key} o=${o} open=${open} />`)}</div>
    </div>`)}
    <div style="height:16px"></div>
    <button class="btn sec full" onClick=${() => open('edit', { item: null })}><${Icon} n="plus" s=${18} />Tambah komitmen baharu</button>
  </div>`
}

/* ================= DUIT MASUK ================= */
export function IncomeScreen({ month, setMonth, open }) {
  const d = useStore()
  const [entity, setEntity] = useState('')
  const occs = useOccs(month).filter((o) => o.income && (!entity || o.item.entity === entity))
    .sort((a, b) => (a.status === 'received') - (b.status === 'received') || (a.due || '9').localeCompare(b.due || '9'))
  const t = totals(occs)
  const recurring = (d.data.items || []).filter((i) => !i.deleted && i.type === 'income' && i.frequency !== 'once' && (!entity || i.entity === entity))
  return html`<div class="rb-wrap">
    <div class="rb-plain-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div><h1>Duit masuk</h1><p>Gaji, komisen dan sumber pendapatan lain</p></div>
      <${V2Month} month=${month} setMonth=${setMonth} /></div>
    <div class="rb-chips">
      <button class=${'rb-chip' + (!entity ? ' on' : '')} onClick=${() => setEntity('')}>Semua ruang</button>
      ${ACCOUNTS.filter((a) => (d.data.spaces || []).includes(a.id)).map((a) =>
        html`<button key=${a.id} class=${'rb-chip' + (entity === a.id ? ' on' : '')} onClick=${() => setEntity(a.id)}>${a.name}</button>`)}
    </div>
    <div class="rb-strip">${CURRENCIES.map((c) => html`<div key=${c}>
      <small><span>Diterima ${c}</span><span>${t[c].incomeRecvCount}/${t[c].incomeCount}</span></small>
      <b class="num" style="color:#1f8a5b">${fmtShort(t[c].income, c)}</b>
      <div class="s num">dijangka ${fmtShort(t[c].incomeExpected, c)}</div></div>`)}</div>
    <div class="btns-row">
      <button class="btn pri" onClick=${() => open('income')}><${Icon} n="plus" s=${18} />Rekod duit masuk</button>
      <button class="btn sec" onClick=${() => open('edit', { item: null, preset: 'income' })}><${Icon} n="rec" s=${18} />Berulang</button>
    </div>
    <div class="rb-grp"><span>${monthLabel(month)}</span><span>${occs.length} rekod</span></div>
    ${occs.length ? html`<div class="rb-list">${occs.map((o) => html`<${PayCard} key=${o.key} o=${o} open=${open} />`)}</div>`
      : html`<div class="rb-empty"><b>Tiada duit masuk</b>Belum ada pendapatan direkod atau dijadualkan untuk bulan ini.</div>`}
    ${recurring.length > 0 && html`<div class="rb-grp"><span>Pendapatan berulang</span><span>${recurring.length}</span></div>
      <div class="rb-card">${recurring.map((it) => html`<button class="rb-row" key=${it.id} onClick=${() => open('edit', { item: it })}>
        <div class="rb-ico" style="background:#e2f5eb;color:#1f8a5b"><${Icon} n="dl" s=${18} /></div>
        <div class="grow"><div class="t1">${it.name}</div>
          <div class="t2">${it.category} · ${acc(it.entity).short} · ${FREQ[it.frequency]}${it.day ? ' · hari ' + it.day : ''}</div></div>
        <b class="num" style="font-size:14px">${fmtMoney(it.amount, it.currency)}</b></button>`)}</div>`}
  </div>`
}

/* ================= KENDERAAN ================= */
export function VehicleScreen({ open }) {
  const d = useStore()
  const vs = d.data.vehicles || []
  const today = todayISO()
  const hist = vs.flatMap((v) => (v.history || []).map((x) => ({ ...x, v }))).sort((a, b) => b.date.localeCompare(a.date))
  return html`<div class="rb-wrap">
    <div class="rb-plain-head"><h1>Kenderaan</h1><p>Roadtax, insurans dan servis berkala</p></div>
    <div class="vh-list">${vs.map((v) => html`<${VehicleCard} key=${v.id} v=${v} open=${open} today=${today} />`)}</div>
    <button class="btn sec full" style="margin-top:12px" onClick=${() => open('vehicleEdit', null)}>
      <${Icon} n="plus" s=${18} />Tambah kenderaan</button>
    <div class="rb-grp" style="margin-top:24px"><span>Sejarah pembaharuan & servis</span><span>${hist.length}</span></div>
    ${hist.length ? html`<div class="rb-card">${hist.map((x, i) => html`<div class="rb-row" key=${i}>
        <div class="rb-ico"><${Icon} n=${x.kind === 'service' ? 'set' : 'shield'} s=${18} /></div>
        <div class="grow"><div class="t1">${VK[x.kind]} · ${x.v.name} ${x.v.plate}</div>
          <div class="t2">${fmtDate(x.date)}${x.expiry ? ' · tamat baharu ' + fmtDate(x.expiry) : ''}${x.km != null ? ' · ' + Number(x.km).toLocaleString() + ' km' : ''}${x.workshop ? ' · ' + x.workshop : ''}${x.provider ? ' · ' + x.provider : ''}</div></div>
        <b class="num" style="font-size:14px">${fmtMoney(x.amount, x.v.currency)}</b></div>`)}</div>`
      : html`<div class="rb-empty"><b>Belum ada sejarah</b>Rekod pembaharuan roadtax / insurans dan servis akan muncul di sini.</div>`}
  </div>`
}

function VehicleCard({ v, open, today }) {
  const st = vehicleStatus(v, today)
  const worst = st.find((a) => a.status === 'expired') || st.find((a) => a.status === 'due')
  return html`<div class="vh-card">
    <button class="vh-top" onClick=${() => open('vehicle', v)}>
      <div class="vh-plate">${v.plate}</div>
      <div style="flex:1;min-width:0"><div class="vh-nm">${v.name}</div>
        <div class="vh-mt">${acc(v.entity).short}${v.insurer ? ' · ' + v.insurer : ''}</div></div>
      ${worst && html`<span class=${'rb-st ' + (worst.status === 'expired' ? 'overdue' : 'unpaid')}>${worst.status === 'expired' ? 'Tamat' : 'Sedia duit'}</span>`}
      <${Icon} n="right" s=${16} style="color:var(--mut)" />
    </button>
    <div class="vh-chips">${st.map((a) => html`<button key=${a.kind} class=${'vh-chip ' + a.status} onClick=${() => open('vehicle', v)}>
      <span class="k">${VK[a.kind]}</span>
      <b>${a.status === 'missing' ? '—' : fmtDate(a.date)}</b>
      <small>${daysText(a)}</small></button>`)}</div>
  </div>`
}

/* ================= REKOD (sejarah) ================= */
export function History({ month, setMonth, open }) {
  const d = useStore()
  const [entity, setEntity] = useState('')
  const [view, setView] = useState('bulan')
  const all = useOccs(month)
  const occs = all.filter((o) => (o.status === 'paid' || o.status === 'received') && (!entity || o.item.entity === entity))
    .sort((a, b) => b.payment.date.localeCompare(a.payment.date))
  const t = totals(occs)
  const months = [...new Set((d.data.payments || []).map((p) => p.month))].sort().reverse()
  const allPaid = (d.data.payments || []).filter((p) => !entity || (d.data.items.find((i) => i.id === p.itemId) || {}).entity === entity)
  const docsMonth = all.filter((o) => !entity || o.item.entity === entity).flatMap((o) => o.docs.map((x) => ({ d: x, o })))
  return html`<div class="rb-wrap">
    <div class="rb-plain-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div><h1>Rekod</h1><p>Sejarah bayaran selesai dan lampiran</p></div>
      <${MonthPicker} month=${month} setMonth=${setMonth} light /></div>
    <div class="rb-filters">
      <div class="rb-seg">${[['bulan', 'Bulan ini'], ['lampiran', 'Lampiran'], ['arkib', 'Semua bulan']].map(([k, l]) =>
        html`<button key=${k} class=${view === k ? 'on' : ''} onClick=${() => setView(k)}>${l}</button>`)}</div>
      <div class="rb-chips">
        <button class=${'rb-chip' + (!entity ? ' on' : '')} onClick=${() => setEntity('')}>Semua ruang</button>
        ${ACCOUNTS.filter((a) => (d.data.spaces || []).includes(a.id)).map((a) =>
          html`<button key=${a.id} class=${'rb-chip' + (entity === a.id ? ' on' : '')} onClick=${() => setEntity(a.id)}>${a.name}</button>`)}
      </div>
    </div>

    ${view === 'bulan' && html`<div>
      <div class="rb-strip">${CURRENCIES.map((c) => html`<div key=${c}>
        <small><span>Dibayar ${c}</span><span>${t[c].paidCount} item</span></small>
        <b class="num">${fmtMoney(t[c].paid, c)}</b></div>`)}</div>
      ${occs.length === 0
        ? html`<div class="rb-empty" style="margin-top:14px"><b>Tiada bayaran selesai</b>Belum ada rekod selesai untuk ${monthLabel(month)}.</div>`
        : html`<div class="rb-card" style="margin-top:12px">${occs.map((o) => html`<button class="rb-row" key=${o.key} onClick=${() => open('detail', o)}>
          <div class="rb-ico"><${Icon} n=${o.item.category} s=${18} /></div>
          <div class="grow"><div class="t1">${(o.payment && o.payment.nameSnapshot) || o.item.name}</div>
            <div class="t2">${acc(o.item.entity).short} · ${o.income ? 'diterima' : 'dibayar'} ${fmtDate(o.payment.date)}${o.payment.reference ? ' · Ruj ' + o.payment.reference : ''} · ${o.docs.filter((x) => x.kind === 'receipt').length ? o.docs.filter((x) => x.kind === 'receipt').length + ' bukti' : 'tiada bukti'}${o.payment.splits ? ` · ${o.payment.splits.length} penerima` : ''}</div></div>
          <b class="num" style="font-size:14px;white-space:nowrap;${o.income ? 'color:#1f8a5b' : ''}">${o.income ? '+ ' : ''}${fmtMoney(o.payment.amount, o.currency)}</b>
        </button>`)}</div>`}
    </div>`}

    ${view === 'lampiran' && (docsMonth.length === 0
      ? html`<div class="rb-empty" style="margin-top:6px"><b>Tiada lampiran</b>Belum ada invoice atau bukti untuk ${monthLabel(month)}.</div>`
      : html`<div style="margin-top:6px">${docsMonth.map(({ d: dd, o }) => html`<${DocRow} key=${dd.id} d=${{ ...dd, url: '/api/documents/' + dd.id + '/file' }}
          onOpen=${openViewerFn} tag=${(dd.kind === 'invoice' ? 'Invoice' : 'Bukti') + ' · ' + o.item.name} />`)}</div>`)}

    ${view === 'arkib' && (months.length === 0 ? html`<div class="rb-empty"><b>Tiada sejarah</b></div>` :
      html`<div class="rb-card" style="margin-top:6px">${months.map((m) => {
        const ps = allPaid.filter((p) => p.month === m)
        if (!ps.length) return null
        const sums = CURRENCIES.map((c) => [c, ps.filter((p) => p.currency === c).reduce((s, p) => s + Number(p.amount), 0)]).filter(([, v]) => v)
        return html`<button class="rb-row" key=${m} onClick=${() => { setMonth(m); setView('bulan') }}>
          <div class="rb-ico"><${Icon} n="cal" s=${18} /></div>
          <div class="grow"><div class="t1">${monthLabel(m)}</div><div class="t2">${ps.length} bayaran selesai</div></div>
          <div style="text-align:right">${sums.map(([c, v]) => html`<div key=${c} class="num" style="font-weight:700;font-size:13.5px">${fmtMoney(v, c)}</div>`)}</div>
          <${Icon} n="right" s=${16} /></button>`
      })}</div>`)}
  </div>`
}

/* ================= TETAPAN ================= */
export function Settings({ month, open, onLogout, go }) {
  const d = useStore()
  const [show, setShow] = useState('arkib')
  const [busy, setBusy] = useState(false)
  const all = d.data.items || []
  const lists = { aktif: all.filter((i) => !i.deleted && !i.endMonth), arkib: all.filter((i) => !i.deleted && i.endMonth), dipadam: all.filter((i) => i.deleted) }
  const isOwner = d.me && d.me.role === 'owner'
  const dl = (url) => { const a = document.createElement('a'); a.href = url; a.click() }
  return html`<div class="rb-wrap">
    <div class="rb-plain-head"><h1>Tetapan</h1><p>Komitmen, eksport dan semakan data</p></div>

    <div class="rb-sec" style="margin-top:14px"><div class="rb-card">
      <button class="rb-row" onClick=${() => open('verify')}>
        <div class="rb-ico" style="background:var(--g7);color:#fff"><${Icon} n="shield" s=${18} /></div>
        <div class="grow"><div class="t1">Semakan migrasi data</div>
          <div class="t2">Padanan rekod, bayaran, jadual dan SHA-256 lampiran</div></div>
        <${Icon} n="right" s=${16} /></button>
      <button class="rb-row" onClick=${() => open('refdocs')}>
        <div class="rb-ico"><${Icon} n="file" s=${18} /></div>
        <div class="grow"><div class="t1">Dokumen rujukan asal</div><div class="t2">6 fail sokongan · bukan bukti transfer</div></div>
        <${Icon} n="right" s=${16} /></button>
      <button class="rb-row" onClick=${() => open('rate')}>
        <div class="rb-ico"><${Icon} n="pay" s=${18} /></div>
        <div class="grow"><div class="t1">Kadar tukaran RM → Rp</div>
          <div class="t2">${d.data.rate ? `RM 1 = Rp ${d.data.rate.idrPerMyr.toLocaleString('id-ID')} · untuk jumlah gabungan` : 'Belum ditetapkan · untuk jumlah gabungan 2 negara'}</div></div>
        <${Icon} n="right" s=${16} /></button>
    </div></div>

    <div class="rb-sec">
      <div class="rb-sechead"><h2>Eksport</h2></div>
      <div class="rb-card">
        <button class="rb-row" onClick=${() => { dl('/api/export/csv?month=' + month); toast('CSV ' + monthLabel(month) + ' dimuat turun') }}>
          <div class="rb-ico"><${Icon} n="dl" s=${18} /></div>
          <div class="grow"><div class="t1">CSV — ${monthLabel(month)} (semua ruang)</div>
            <div class="t2">UTF-8 · nombor rujukan sebagai teks</div></div></button>
        ${ACCOUNTS.filter((a) => (d.data.spaces || []).includes(a.id)).map((a) => html`<button class="rb-row" key=${a.id}
          onClick=${() => { dl('/api/export/csv?month=' + month + '&entity=' + a.id); toast('CSV ' + a.name + ' dimuat turun') }}>
          <div class="rb-ico" style="background:transparent"></div>
          <div class="grow"><div class="t1" style="font-weight:500">CSV — ${a.name}</div></div>
          <${Icon} n="dl" s=${16} /></button>`)}
        ${isOwner ? html`<button class="rb-row" disabled=${busy} onClick=${async () => {
            setBusy(true)
            try { dl('/api/export/backup'); toast('Backup JSON + lampiran dimuat turun') } catch (e) { toast('Backup gagal: ' + e.message, 'err') }
            setBusy(false)
          }}>
          <div class="rb-ico"><${Icon} n="archive" s=${18} /></div>
          <div class="grow"><div class="t1">Backup penuh JSON + lampiran</div>
            <div class="t2">Semua komitmen, bayaran dan fail (base64)</div></div>
          ${busy && html`<span class="rb-spin"></span>`}</button>`
          : html`<div class="rb-row"><div class="rb-ico"><${Icon} n="archive" s=${18} /></div>
            <div class="grow"><div class="t1" style="color:var(--mut)">Backup penuh JSON</div>
            <div class="t2">Hanya pemilik boleh buat backup penuh.</div></div></div>`}
      </div>
    </div>

    ${(lists.arkib.length + lists.dipadam.length) > 0 && html`<div class="rb-sec">
      <div class="rb-sechead"><h2>Ditamatkan & dipadam</h2><span class="cnt">boleh dipulihkan</span></div>
      <div class="rb-seg" style="margin-bottom:10px">
        ${[['arkib', 'Ditamatkan'], ['dipadam', 'Dipadam']].map(([k, l]) =>
          html`<button key=${k} class=${show === k ? 'on' : ''} onClick=${() => setShow(k)}>${l}<span class="c">${lists[k].length}</span></button>`)}
      </div>
      ${lists[show].length === 0 ? html`<div class="rb-empty"><b>Tiada rekod</b></div>`
        : html`<div class="rb-card">${lists[show].map((it) => html`<div class="rb-row" key=${it.id}>
          <div class="rb-ico"><${Icon} n=${it.category} s=${18} /></div>
          <button class="grow" style="text-align:left" onClick=${() => open('edit', { item: it })}>
            <div class="t1">${it.name}</div>
            <div class="t2 num">${acc(it.entity).short} · ${fmtMoney(it.amount, it.currency)}${it.endMonth ? ' · tamat ' + monthLabel(it.endMonth, true) : ''}</div></button>
          ${show === 'dipadam' && html`<button class="btn sm sec" onClick=${async () => { await api.restoreItem(it.id); await reload(); toast('Dipulihkan') }}>
            <${Icon} n="undo" s=${14} />Pulih</button>`}
          ${show === 'arkib' && html`<button class="btn sm sec" onClick=${async () => { await api.unarchiveItem(it.id); await reload(); toast('Diaktifkan semula') }}>
            <${Icon} n="undo" s=${14} />Aktif</button>`}
        </div>`)}</div>`}
    </div>`}

    <div class="rb-sec"><div class="rb-card">
      <div class="rb-row"><div class="rb-ico"><${Icon} n="users" s=${18} /></div>
        <div class="grow"><div class="t1">${d.me.name}</div>
          <div class="t2">${({ owner: 'Pemilik', partner: 'Pasangan', viewer: 'Lihat sahaja' })[d.me.role]} · ${d.me.role === 'owner' ? 'semua 4 ruang' : d.me.spaces.map((s) => acc(s).short).join(', ')}</div></div></div>
      <button class="rb-row" onClick=${() => open('access')}>
        <div class="rb-ico" style="background:var(--g7);color:#fff"><${Icon} n="shield" s=${18} /></div>
        <div class="grow"><div class="t1">Akses akaun</div>
          <div class="t2">Ahli, peranan & ruang yang dibenarkan</div></div>
        <${Icon} n="right" s=${16} /></button>
      <button class="rb-row" onClick=${onLogout}>
        <div class="rb-ico" style="color:var(--red);background:var(--red1)"><${Icon} n="logout" s=${18} /></div>
        <div class="grow"><div class="t1" style="color:var(--red)">Log keluar</div></div></button>
    </div></div>
    <div style="height:24px"></div>
  </div>`
}

/* ================= SEMAKAN MIGRASI ================= */
export function VerifySheet({ onClose }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setErr(''); setBusy(true)
    try { setR(await api.verifyReport()) } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  useEffect(() => { run() }, [])
  const groups = r ? [...new Set(r.checks.map((c) => c.group))] : []
  const allOk = r && r.passed === r.total
  const download = () => {
    const blob = new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'semakan-migrasi-rekod-boss.json'
    a.click()
  }
  return html`<${Sheet} title="Semakan migrasi data" onClose=${onClose} wide
    foot=${html`<button class="btn sec" onClick=${run} disabled=${busy}>
        ${busy ? html`<span class="rb-spin"></span>` : html`<${Icon} n="undo" s=${16} />`}Jalankan semula</button>
      <button class="btn pri" onClick=${download} disabled=${!r}><${Icon} n="dl" s=${16} />Muat turun laporan</button>`}>
    ${!r && !err && html`<div style="text-align:center;padding:40px">
      <span class="rb-spin"></span>
      <div style="margin-top:10px;color:var(--mut)">Menyemak rekod, bayaran, jadual dan SHA-256 lampiran…</div></div>`}
    ${err && html`<div class="rb-note err">Semakan gagal: ${err}. Migrasi TIDAK boleh dianggap lengkap.</div>`}
    ${r && html`<div>
      <div class=${'vbanner ' + (allOk ? 'ok' : 'no')}>
        <div class="big">${allOk ? '✓' : '!'}</div>
        <div><b>${allOk ? 'Semua semakan lulus' : `${r.total - r.passed} semakan gagal`}</b>
          ${r.passed}/${r.total} semakan · snapshot revision ${r.snapMeta.revision}, ${fmtStamp(r.snapMeta.exported_at)}</div>
      </div>
      <div class="vsum">
        <div><small>Komitmen</small><b>${r.byAcc.reduce((s, x) => s + x.n, 0)}</b><div class="s">dijangka 31</div></div>
        <div><small>Bayaran selesai</small><b>${r.payRows.filter((p) => p.ok).length}</b><div class="s">dijangka 4</div></div>
        <div><small>Lampiran SHA-256</small><b>${r.docRows.filter((x) => x.ok).length}</b><div class="s">dijangka 3</div></div>
      </div>

      <div class="rb-h4">Rekod mengikut ruang</div>
      <div class="vtblwrap"><table class="vtbl"><thead><tr><th>Ruang</th><th class="num">Bil.</th><th>Mata wang</th></tr></thead>
        <tbody>${r.byAcc.map((x) => html`<tr key=${x.id}><td>${x.name}</td><td class="num">${x.n}</td><td>${x.cur.join(', ')}</td></tr>`)}
          <tr><td><b>Jumlah</b></td><td class="num"><b>${r.byAcc.reduce((s, x) => s + x.n, 0)}</b></td><td></td></tr></tbody></table></div>

      <div class="rb-h4">Lampiran — bytes & SHA-256</div>
      <div class="vtblwrap"><table class="vtbl"><thead><tr><th></th><th>Fail</th><th>Rekod · bulan</th><th class="num">Saiz</th><th>SHA-256 dikira</th></tr></thead>
        <tbody>${r.docRows.map((x) => html`<tr key=${x.name}>
          <td class=${x.ok ? 'ok-ic' : 'no-ic'}>${x.ok ? '✓' : '✕'}</td>
          <td style="min-width:150px">${x.name}<div style="font-size:11px;color:var(--mut)">${x.kind} · ${x.mime}</div></td>
          <td class="mono">${x.recordId}<br />${x.month}</td>
          <td class="num">${x.size ?? '—'} / ${x.expectedSize}</td>
          <td class="mono">${x.error ? 'GAGAL: ' + x.error : x.sha}</td></tr>`)}</tbody></table></div>

      <div class="rb-h4">Jadual 03E — kiraan semula</div>
      <div class="vtblwrap"><table class="vtbl"><thead><tr><th></th><th>Bulan</th><th>Ruang</th><th class="num">Bil.</th><th class="num">Jumlah</th></tr></thead>
        <tbody>${r.schedRows.map((s, i) => html`<tr key=${i}>
          <td class=${s.ok ? 'ok-ic' : 'no-ic'}>${s.ok ? '✓' : '✕'}</td>
          <td>${s.month}</td><td>${s.account}</td><td class="num">${s.cnt}/${s.scheduled_count}</td>
          <td class="num">${s.currency === 'IDR' ? s.tot.toLocaleString('id-ID') : s.tot.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td></tr>`)}</tbody></table></div>

      ${groups.map((g) => html`<div class="vgroup" key=${g}>
        <h4>${g}</h4>
        <div class="vcard">${r.checks.filter((c) => c.group === g).map((c, i) => html`<div class="vcheck" key=${i}>
          <div class=${'ic ' + (c.ok ? 'ok' : 'no')}>${c.ok ? '✓' : '✕'}</div>
          <div class="lbl">${c.label}${c.note && html`<small style="color:var(--amb)">${c.note}</small>`}</div>
          <div class="val">${c.actual}<em>dijangka ${c.expected}</em></div>
        </div>`)}</div>
      </div>`)}

      <div class="rb-h4">Menunggu data daripada Boss</div>
      <div class="rb-card" style="padding:4px 0">
        ${['Penerima keluarga Ermi (2) dan Yuli (3) — nama, bank, pecahan',
          'Pecahan TNG / bank Indonesia untuk Jumad',
          'Hari bayaran untuk 20 komitmen yang masih kosong',
          'Ref 02 TNB',
          'Bukti bayaran Alphard Oktober 2026 (status selesai dikekalkan)',
          'Sumber bayaran untuk 25 komitmen (selain staf PT)',
          'Tarikh roadtax / insurans / servis Alphard & Vellfire'].map((t) => html`<div class="rb-row" key=${t}>
          <div class="rb-ico" style="background:var(--blue1);color:var(--blue)"><${Icon} n="info" s=${16} /></div>
          <div class="grow t2" style="color:var(--ink2);font-size:13.5px">${t}</div></div>`)}
      </div>
      <div style="font-size:11.5px;color:var(--mut2);margin-top:14px">Dijana ${fmtStamp(r.generated_at)} · server-side</div>
    </div>`}
  <//>`
}
