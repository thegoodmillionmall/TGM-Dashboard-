import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, fmt, fmtMoney } from '../api.js';
import { Alert, Bar, Line, Doughnut, Loading } from '../components/ui.jsx';
import { useAuditModal } from '../components/dashparts.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const shortMoney = v => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return '฿' + (n / 1_000).toFixed(0) + 'K';
  return '฿' + fmt(n, 0);
};
const pct  = v => fmt(v || 0, 1) + '%';
const roi  = v => Number(v || 0) > 0 ? fmt(v, 2) + 'x' : '-';
const iso  = date => {
  const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};
// 3-day moving average
const ma3 = arr => arr.map((_, i) => {
  const sl = arr.slice(Math.max(0, i-2), i+1).filter(x => x > 0);
  return sl.length ? sl.reduce((a,b)=>a+b,0)/sl.length : null;
});

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end   = new Date(date.getFullYear(), date.getMonth()+1, 0);
  const today = new Date();
  return { start: iso(start), end: iso(end > today ? today : end) };
}
function prevMonthRange() {
  const n = new Date();
  return monthRange(new Date(n.getFullYear(), n.getMonth()-1, 1));
}
function last30() {
  const e = new Date(), s = new Date(); s.setDate(e.getDate()-29);
  return { start: iso(s), end: iso(e) };
}

const PERIODS = [
  { key: 'this-month',  label: 'เดือนนี้',   getRange: monthRange },
  { key: 'last-month',  label: 'เดือนก่อน',  getRange: prevMonthRange },
  { key: '30-days',     label: '30 วัน',      getRange: last30 },
  { key: 'year',        label: 'ปีนี้',       getRange: () => ({ start: `${new Date().getFullYear()}-01-01`, end: iso(new Date()) }) },
];
const PLATFORMS = [
  { value: 'All',         label: 'ทุกช่องทาง' },
  { value: 'TikTok',      label: 'TikTok' },
  { value: 'Shopee',      label: 'Shopee' },
  { value: 'ModernTrade', label: 'Modern Trade' },
];

// ─── Channel meta ─────────────────────────────────────────────────────────────
const CH = {
  TikTok:      { label: 'TikTok Shop',  color: '#B2D8D8', bg: '#0d2233', accent: '#B2D8D8', chipBg: 'rgba(178,216,216,.15)', icon: '🎵' },
  Shopee:      { label: 'Shopee',       color: '#e98a4b', bg: '#2a1800', accent: '#e98a4b', chipBg: 'rgba(233,138,75,.15)',  icon: '🛒' },
  ModernTrade: { label: 'Modern Trade', color: '#2ecc8f', bg: '#0a2218', accent: '#2ecc8f', chipBg: 'rgba(46,204,143,.15)', icon: '🏪' },
  Facebook:    { label: 'Facebook',     color: '#6699ff', bg: '#0a1433', accent: '#6699ff', chipBg: 'rgba(102,153,255,.15)',icon: '📘' },
};

// ─── Dark channel card (matches Executive Suite design) ──────────────────────
function DarkChannelCard({ name, revenue, ads, totalRevenue, breakdown }) {
  const meta   = CH[name] || CH.TikTok;
  const share  = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
  const roiVal = ads > 0 ? revenue / ads : 0;
  const maxBreak = Math.max(...Object.values(breakdown).filter(v => v > 0), 1);
  return (
    <div style={{
      background: '#14252f', border: '1px solid rgba(178,216,216,.1)',
      borderTop: `3px solid ${meta.color}`,
      borderRadius: 14, padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ font: '600 15px Kanit, sans-serif', color: '#fff' }}>{meta.icon} {meta.label}</div>
        <div style={{ font: '600 11px Kanit, sans-serif', color: meta.accent, padding: '2px 10px', borderRadius: 999, background: meta.chipBg }}>
          {pct(share)}
        </div>
      </div>
      <div style={{ font: '600 26px/1 Kanit, sans-serif', color: '#fff', margin: '8px 0 2px', fontVariantNumeric: 'tabular-nums' }}>
        {fmtMoney(revenue)}
      </div>
      <div style={{ font: '300 12px Kanit, sans-serif', color: '#7d93a5', marginBottom: 16 }}>
        ค่าแอด {fmtMoney(ads)} · ROI{' '}
        <span style={{ color: roiVal >= 3 ? '#2ecc8f' : roiVal > 0 ? '#e9a83b' : '#6f8798', fontWeight: 600 }}>{roi(roiVal)}</span>
      </div>

      {Object.entries(breakdown).filter(([,v]) => v > 0).map(([label, value]) => {
        const bPct = revenue > 0 ? (value / revenue) * 100 : 0;
        const barW  = maxBreak > 0 ? (value / maxBreak) * 100 : 0;
        return (
          <div key={label} style={{ marginBottom: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 12.5px Kanit, sans-serif', color: '#cfdce6', marginBottom: 5 }}>
              <span>{label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{shortMoney(value)} <span style={{ color: '#6f8798', fontSize: 11 }}>({pct(bPct)})</span></span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,.07)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barW}%`, background: meta.color, borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Light metric pill ────────────────────────────────────────────────────────
function MetricPill({ label, value, tone = 'default', onClick, sub }) {
  const tones = {
    default: { bg: '#f9fafb', border: '#e5e7eb', color: '#1a2a3a' },
    good:    { bg: '#f0fdf4', border: '#bbf7d0', color: '#059669' },
    bad:     { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    warn:    { bg: '#fffbeb', border: '#fde68a', color: '#d97706' },
    blue:    { bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb' },
  };
  const t = tones[tone] || tones.default;
  return (
    <div onClick={onClick} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Source breakdown card (single platform) ──────────────────────────────────
function SourceBreakdownCard({ title, value, totalRev, note }) {
  const p = totalRev > 0 ? (value / totalRev) * 100 : 0;
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a3a', margin: '3px 0' }}>{fmtMoney(value)}</div>
      <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ height: '100%', width: `${Math.min(100, p)}%`, background: '#7DB9B9', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>{pct(p)}{note ? ` · ${note}` : ''}</div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const init = monthRange();
  const [start, setStart]       = useState(init.start);
  const [end, setEnd]           = useState(init.end);
  const [period, setPeriod]     = useState('this-month');
  const [platform, setPlatform] = useState('All');
  const [subPlatform, setSubPlatform] = useState('All');
  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const { showAudit, modal }    = useAuditModal(data);

  async function load(next = {}) {
    const ns  = next.start       || start;
    const ne  = next.end         || end;
    const np  = next.platform    || platform;
    const nsp = next.subPlatform || subPlatform;
    setBusy(true); setError('');
    try {
      setData(await apiGet('/gsheet/channel-dashboard', { start: ns, end: ne, platform: np, subPlatform: np === 'ModernTrade' ? nsp : 'All' }));
    } catch (e) { setError(e.message); }
    finally    { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  function applyPeriod(item) {
    const r = item.getRange(); setPeriod(item.key); setStart(r.start); setEnd(r.end);
    load(r);
  }
  function applyPlatform(val) { setPlatform(val); load({ platform: val }); }
  function applyCustom(ns, ne) { setPeriod('custom'); setStart(ns); setEnd(ne); }

  const s   = data?.summary  || {};
  const a   = data?.audit    || {};
  const p   = data?.platformBreakdown || {};
  const tt  = data?.ttBreakdown || {};
  const sh  = data?.shBreakdown || {};
  const mt  = data?.mtBreakdown || {};

  const ttRev = p.tiktok      || 0;
  const shRev = p.shopee      || 0;
  const fbRev = p.facebook    || 0;
  const mtRev = p.modernTrade || 0;
  const totalRev = ttRev + shRev + fbRev + mtRev || s.revenue || 0;

  const ttAds = (a.ads?.ttManager || 0) + (a.ads?.ttGmv || 0) + (a.ads?.ttLive || 0);
  const shAds = (a.ads?.shAds || 0) + (a.ads?.shLive || 0);
  const fbAds =  a.ads?.meta   || 0;

  const ttOrganic = Math.max(ttRev - (tt.live||0) - (tt.ads||0) - (tt.adsLive||0) - (tt.affiliate||0), 0);
  const shOrganic = Math.max(shRev - (sh.ads||0) - (sh.affiliate||0), 0);

  const dc = data?.dailyCharts || {};
  const mc = data?.charts      || {};

  // Donut data
  const donutData = useMemo(() => {
    const entries = [
      ['TikTok', ttRev, '#B2D8D8'],
      ['Shopee', shRev, '#e98a4b'],
      ['Modern Trade', mtRev, '#2ecc8f'],
      ['Facebook', fbRev, '#6699ff'],
    ].filter(([, v]) => v > 0);
    return {
      labels: entries.map(([l]) => l),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([,,c]) => c),
        borderColor: '#14252f',
        borderWidth: 2,
        hoverOffset: 6,
      }]
    };
  }, [ttRev, shRev, fbRev, mtRev]);

  // Daily trend line data
  const lineData = useMemo(() => {
    const labels = dc.labels || [];
    return {
      labels,
      datasets: [
        ttRev > 0 && { label: 'TikTok (MA3)', data: ma3(dc.ttRev||[]), borderColor: '#B2D8D8', backgroundColor: 'transparent', tension: .4, borderWidth: 2, pointRadius: 0 },
        shRev > 0 && { label: 'Shopee (MA3)', data: ma3(dc.shRev||[]), borderColor: '#e98a4b', backgroundColor: 'transparent', tension: .4, borderWidth: 2, pointRadius: 0 },
        mtRev > 0 && { label: 'Modern Trade',  data: dc.mtRev || [], borderColor: '#2ecc8f', backgroundColor: 'transparent', tension: .3, borderWidth: 1.5, pointRadius: 0 },
      ].filter(Boolean)
    };
  }, [dc, ttRev, shRev, mtRev]);

  // Monthly chart
  const showTt = platform === 'All' || platform === 'TikTok';
  const showSh = platform === 'All' || platform === 'Shopee';
  const showFb = platform === 'All' || platform === 'Facebook';
  const showMt = platform === 'All' || platform === 'ModernTrade';

  const maxMon = (mc.labels||[]).length
    ? Math.max(...(mc.labels||[]).map((_, i) => (mc.ttRev?.[i]||0)+(mc.shRev?.[i]||0)+(mc.fbRev?.[i]||0)+(mc.mtRev?.[i]||0)), 0) * 1.22 : 1;

  return (
    <div className="exec-page">
      {/* ── Header ── */}
      <div className="exec-head">
        <div>
          <div className="page-title">แยกช่องทาง</div>
          <div className="page-sub">เจาะยอด TikTok / Shopee / Modern Trade</div>
        </div>
        <div className="exec-filters">
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่วงเวลา</div>
            <div className="exec-chip-row">
              {PERIODS.map(item => (
                <button key={item.key} type="button"
                  className={'exec-chip ' + (period === item.key ? 'active' : '')}
                  onClick={() => applyPeriod(item)} disabled={busy}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่องทาง</div>
            <div className="exec-chip-row">
              {PLATFORMS.map(item => (
                <button key={item.value} type="button"
                  className={'exec-chip channel ' + (platform === item.value ? 'active' : '')}
                  onClick={() => applyPlatform(item.value)} disabled={busy}>{item.label}</button>
              ))}
            </div>
          </div>
          {platform === 'ModernTrade' && (
            <div className="exec-filter-block">
              <div className="exec-filter-title">ร้าน</div>
              <div className="exec-chip-row">
                {['All','EVEANDBOY','WATSONS','KONVY'].map(v => (
                  <button key={v} type="button"
                    className={'exec-chip ' + (subPlatform === v ? 'active' : '')}
                    onClick={() => { setSubPlatform(v); load({ subPlatform: v }); }} disabled={busy}>
                    {v === 'All' ? 'ทุกร้าน' : v}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="exec-custom-range">
            <label>เริ่ม<input type="date" value={start} onChange={e => applyCustom(e.target.value, end)} /></label>
            <label>ถึง<input  type="date" value={end}   onChange={e => applyCustom(start, e.target.value)} /></label>
            <button className="btn btn-primary" onClick={() => load()} disabled={busy}>{busy ? 'กำลังโหลด...' : 'แสดงข้อมูล'}</button>
          </div>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          {/* ── 1. สรุป KPI หลัก (ขึ้นก่อนเสมอ) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#1a2a3a', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #7DB9B9' }}>
              <div style={{ fontSize: 11, color: '#7DB9B9', fontWeight: 600, marginBottom: 6 }}>ยอดขายรวม</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{shortMoney(s.revenue)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{fmt(s.totalOrders,0)} ออเดอร์ · AOV {shortMoney(s.aov)}</div>
            </div>
            <div style={{ background: '#1a2a3a', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${s.profit >= 0 ? '#10b981' : '#ef4444'}` }}>
              <div style={{ fontSize: 11, color: s.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, marginBottom: 6 }}>กำไรหลังโฆษณา</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{shortMoney(s.profit)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Net Margin {pct(s.netMargin)}</div>
            </div>
            <div style={{ background: '#1a2a3a', borderRadius: 12, padding: '16px 20px', borderLeft: `4px solid ${s.roas >= 3 ? '#10b981' : '#f59e0b'}` }}>
              <div style={{ fontSize: 11, color: s.roas >= 3 ? '#10b981' : '#f59e0b', fontWeight: 600, marginBottom: 6 }}>ROI โฆษณา</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{roi(s.roas)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>ค่าแอด {shortMoney(s.ads)} · Ads {pct(s.adsRate)}</div>
            </div>
            <div style={{ background: '#1a2a3a', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginBottom: 6 }}>สินค้า & ออเดอร์</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{fmt(s.soldItems||s.totalOrders,0)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>ตีคืน {fmt(s.returnedItems,0)} ชิ้น</div>
            </div>
          </div>

          {/* ── 2. Dark channel cards (แยกตามแพลตฟอร์ม) ── */}
          {platform === 'All' && totalRev > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
              {ttRev > 0 && (
                <DarkChannelCard name="TikTok" revenue={ttRev} ads={ttAds} totalRevenue={totalRev}
                  breakdown={{ 'Organic / ไม่ map': ttOrganic, 'Live ร้านค้า': tt.live||0, 'Affiliate': tt.affiliate||0, 'Ads GMV Max': tt.ads||0, 'Live Boost': tt.adsLive||0 }} />
              )}
              {shRev > 0 && (
                <DarkChannelCard name="Shopee" revenue={shRev} ads={shAds} totalRevenue={totalRev}
                  breakdown={{ 'Organic / ไม่ map': shOrganic, 'Affiliate': sh.affiliate||0, 'Shopee Ads': sh.ads||0 }} />
              )}
              {mtRev > 0 && (
                <DarkChannelCard name="ModernTrade" revenue={mtRev} ads={0} totalRevenue={totalRev}
                  breakdown={Object.fromEntries(Object.entries(mt).filter(([,v]) => v > 0))} />
              )}
              {fbRev > 0 && (
                <DarkChannelCard name="Facebook" revenue={fbRev} ads={fbAds} totalRevenue={totalRev}
                  breakdown={{ Revenue: fbRev, 'Ads Cost': fbAds }} />
              )}
            </div>
          )}

          {/* Single platform breakdown */}
          {platform !== 'All' && (
            <div style={{ background: '#f7f9fa', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ font: '600 14px Kanit, sans-serif', color: '#1a2a3a', marginBottom: 12 }}>
                {platform === 'TikTok' && `สัดส่วน TikTok — ${fmtMoney(ttRev)}`}
                {platform === 'Shopee' && `สัดส่วน Shopee — ${fmtMoney(shRev)}`}
                {platform === 'ModernTrade' && `สัดส่วน Modern Trade — ${fmtMoney(mtRev)}`}
                {platform === 'Facebook' && `Facebook — ${fmtMoney(fbRev)}`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {platform === 'TikTok' && ttRev > 0 && [
                  { title: 'Organic', value: ttOrganic, note: 'ไม่ถูก map' },
                  { title: 'Live ร้านค้า', value: tt.live||0 },
                  { title: 'Affiliate', value: tt.affiliate||0 },
                  { title: 'Ads GMV Max', value: tt.ads||0 },
                  { title: 'Live Boost', value: tt.adsLive||0 },
                ].map(({ title, value, note }) => (
                  <SourceBreakdownCard key={title} title={title} value={value} totalRev={ttRev} note={note} />
                ))}
                {platform === 'Shopee' && shRev > 0 && [
                  { title: 'Organic', value: shOrganic, note: 'ไม่ถูก map' },
                  { title: 'Affiliate', value: sh.affiliate||0 },
                  { title: 'Shopee Ads', value: sh.ads||0 },
                ].map(({ title, value, note }) => (
                  <SourceBreakdownCard key={title} title={title} value={value} totalRev={shRev} note={note} />
                ))}
                {platform === 'ModernTrade' && Object.entries(mt).filter(([,v]) => v > 0).map(([name, v]) => (
                  <SourceBreakdownCard key={name} title={name} value={v} totalRev={mtRev} />
                ))}
              </div>
            </div>
          )}

          {/* ── 3. Charts: Donut + Daily trend ── */}
          {platform === 'All' && totalRev > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 16, marginBottom: 16 }}>
              <div style={{ background: '#f7f9fa', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ font: '600 13px Kanit, sans-serif', color: '#1a2a3a', marginBottom: 12 }}>สัดส่วนตามช่องทาง</div>
                <div style={{ height: 220 }}>
                  <Doughnut data={donutData} options={{
                    responsive: true, maintainAspectRatio: false, cutout: '62%',
                    plugins: {
                      legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, boxWidth: 10, padding: 10 } },
                      tooltip: { callbacks: { label: c => ` ${c.label}: ${shortMoney(c.parsed)} (${totalRev > 0 ? pct((c.parsed/totalRev)*100) : '-'})` } }
                    }
                  }} />
                </div>
              </div>
              <div style={{ background: '#f7f9fa', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ font: '600 13px Kanit, sans-serif', color: '#1a2a3a', marginBottom: 4 }}>แนวโน้มรายวัน (MA3)</div>
                <div style={{ font: '300 11px Kanit, sans-serif', color: '#7d93a5', marginBottom: 10 }}>ค่าเฉลี่ยเคลื่อนที่ 3 วัน</div>
                <div style={{ height: 200 }}>
                  <Line data={lineData} options={{
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${shortMoney(c.parsed.y)}` } } },
                    scales: { x: { ticks: { maxTicksLimit: 8, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { callback: shortMoney, font: { size: 10 } } } }
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* ── 4. Monthly bar (ถ้ามีหลายเดือน) ── */}
          {(mc.labels||[]).length > 1 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ font: '600 13px Kanit, sans-serif', color: '#1a2a3a', marginBottom: 14 }}>ยอดขายรายเดือนตามช่องทาง</div>
              <div style={{ height: 240 }}>
                <Bar data={{
                  labels: mc.labels,
                  datasets: [
                    showTt && { label: 'TikTok',      data: mc.ttRev,   backgroundColor: '#7DB9B9', stack: 'r', borderRadius: 3 },
                    showSh && { label: 'Shopee',       data: mc.shRev,   backgroundColor: '#e98a4b', stack: 'r', borderRadius: 3 },
                    showFb && { label: 'Facebook',     data: mc.fbRev||[], backgroundColor: '#6699ff', stack: 'r', borderRadius: 3 },
                    showMt && { label: 'Modern Trade', data: mc.mtRev,   backgroundColor: '#2ecc8f', stack: 'r', borderRadius: 3 },
                    { label: 'ค่าโฆษณา', data: mc.ads, backgroundColor: 'rgba(233,138,75,.5)', stack: 'a', borderRadius: 3 },
                  ].filter(Boolean)
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${shortMoney(c.parsed.y)}` } } },
                  scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, max: Math.ceil(maxMon), ticks: { callback: shortMoney, font: { size: 10 } } } }
                }} />
              </div>
            </div>
          )}

          {/* ── 5. Daily bar (เดือนเดียว) ── */}
          {(dc.labels||[]).length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ font: '600 13px Kanit, sans-serif', color: '#1a2a3a', marginBottom: 14 }}>ยอดขายและค่าแอดรายวัน</div>
              <div style={{ height: 220 }}>
                <Bar data={{
                  labels: dc.labels,
                  datasets: [
                    showTt && { label: 'TikTok', data: dc.ttRev, backgroundColor: '#7DB9B9', stack: 'r', borderRadius: 2 },
                    showSh && { label: 'Shopee', data: dc.shRev, backgroundColor: '#e98a4b', stack: 'r', borderRadius: 2 },
                    showFb && { label: 'Facebook', data: dc.fbRev||[], backgroundColor: '#6699ff', stack: 'r', borderRadius: 2 },
                    showMt && { label: 'Modern Trade', data: dc.mtRev, backgroundColor: '#2ecc8f', stack: 'r', borderRadius: 2 },
                    { label: 'ค่าโฆษณา', data: dc.ads, backgroundColor: 'rgba(233,138,75,.45)', stack: 'a', borderRadius: 2 },
                  ].filter(Boolean)
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, boxWidth: 10 } } },
                  scales: { x: { stacked: true, ticks: { maxTicksLimit: 12, font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, ticks: { callback: shortMoney, font: { size: 10 } } } }
                }} />
              </div>
            </div>
          )}

          {modal}
        </>
      )}
    </div>
  );
}
