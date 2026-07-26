import React, { useEffect, useState, useMemo } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { Alert, Bar, Line, Loading } from '../components/ui.jsx';
import { useAuditModal, DailyTable } from '../components/dashparts.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const shortMoney = v => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return '฿' + (n / 1_000).toFixed(0) + 'K';
  return '฿' + fmt(n, 0);
};
const pct  = v => fmt(v || 0, 1) + '%';
const roi  = v => Number(v || 0) > 0 ? fmt(v, 2) + 'x' : '-';
const fmtPct = v => fmt(v || 0, 1) + '%';
const iso  = date => {
  const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};
const dayMs = 86400000;
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

// ─── Chart plugin ─────────────────────────────────────────────────────────────
const valueLabelPlugin = {
  id: 'tgmChannelLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save(); ctx.font = '600 10px Kanit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((pt, i) => {
        const val = Number(ds.data[i] || 0);
        if (!val) return;
        ctx.fillStyle = ds.borderColor || ds.backgroundColor || '#1a2a3a';
        ctx.fillText(shortMoney(val), pt.x, pt.y - 4);
      });
    });
    ctx.restore();
  }
};

// ─── Channel comparison card ──────────────────────────────────────────────────
function ChannelCard({ name, revenue, ads, totalRevenue, color, icon, breakdown, onClick }) {
  const share  = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
  const roiVal = ads > 0 ? revenue / ads : 0;
  const profit = revenue - ads;
  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', border: `2px solid ${onClick ? color : '#e5e7eb'}`,
        borderRadius: 12, padding: '16px 20px', cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 700, color: '#1a2a3a', fontSize: 15 }}>{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 8px', borderRadius: 20, background: color + '22', color, fontWeight: 600 }}>{pct(share)}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a2a3a', marginBottom: 8 }}>{fmtMoney(revenue)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>ค่าโฆษณา</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>{fmtMoney(ads)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>ROI</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: roiVal >= 3 ? '#059669' : roiVal > 0 ? '#d97706' : '#9ca3af' }}>{roi(roiVal)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>กำไรหลังแอด</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: profit >= 0 ? '#059669' : '#dc2626' }}>{shortMoney(profit)}</div>
        </div>
      </div>
      {breakdown && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
          {Object.entries(breakdown).filter(([,v]) => v > 0).map(([k, v]) => {
            const bpct = revenue > 0 ? (v / revenue) * 100 : 0;
            return (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                <span>{k}</span>
                <span style={{ color: '#374151' }}>{shortMoney(v)} ({pct(bpct)})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Metric pill row ──────────────────────────────────────────────────────────
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
    <div
      onClick={onClick}
      style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 14px', cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const init = monthRange();
  const [start, setStart]         = useState(init.start);
  const [end, setEnd]             = useState(init.end);
  const [period, setPeriod]       = useState('this-month');
  const [platform, setPlatform]   = useState('All');
  const [subPlatform, setSubPlatform] = useState('All');
  const [data, setData]           = useState(null);
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);
  const { showAudit, modal }      = useAuditModal(data);

  async function load(next = {}) {
    const ns = next.start    || start;
    const ne = next.end      || end;
    const np = next.platform || platform;
    const nsp = next.subPlatform || subPlatform;
    setBusy(true); setError('');
    try {
      setData(await apiGet('/gsheet/channel-dashboard', { start: ns, end: ne, platform: np, subPlatform: np === 'ModernTrade' ? nsp : 'All' }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  function applyPeriod(item) {
    const range = item.getRange();
    setPeriod(item.key); setStart(range.start); setEnd(range.end);
    load(range);
  }
  function applyPlatform(val) { setPlatform(val); load({ platform: val }); }
  function applyCustom(ns, ne) { setPeriod('custom'); setStart(ns); setEnd(ne); }

  const s  = data?.summary || {};
  const a  = data?.audit   || {};
  const p  = data?.platformBreakdown || {};
  const tt = data?.ttBreakdown || {};
  const sh = data?.shBreakdown || {};
  const mt = data?.mtBreakdown || {};

  const ttRev = p.tiktok      || 0;
  const shRev = p.shopee      || 0;
  const fbRev = p.facebook    || 0;
  const mtRev = p.modernTrade || 0;
  const totalRev = ttRev + shRev + fbRev + mtRev || s.revenue || 0;

  const ttAds = (a.ads?.ttManager || 0) + (a.ads?.ttGmv || 0) + (a.ads?.ttLive || 0);
  const shAds = (a.ads?.shAds || 0) + (a.ads?.shLive || 0);
  const fbAds = a.ads?.meta || 0;

  const ttOrganic = Math.max(ttRev - (tt.live || 0) - (tt.ads || 0) - (tt.adsLive || 0) - (tt.affiliate || 0), 0);
  const shOrganic = Math.max(shRev - (sh.ads || 0) - (sh.affiliate || 0), 0);

  const showTt = platform === 'All' || platform === 'TikTok';
  const showSh = platform === 'All' || platform === 'Shopee';
  const showFb = platform === 'All' || platform === 'Facebook';
  const showMt = platform === 'All' || platform === 'ModernTrade';

  const charts     = data?.charts     || {};
  const dailyCharts = data?.dailyCharts || {};
  const hasMonthly = (charts.labels || []).length > 0;
  const hasDaily   = (dailyCharts.labels || []).length > 0;

  const salesMax = hasMonthly
    ? Math.max(...(charts.labels||[]).map((_, i) => (charts.ttRev?.[i]||0)+(charts.shRev?.[i]||0)+(charts.fbRev?.[i]||0)+(charts.mtRev?.[i]||0)), 0) * 1.22
    : 1;
  const dailyMax = hasDaily
    ? Math.max(...(dailyCharts.labels||[]).map((_, i) => (dailyCharts.ttRev?.[i]||0)+(dailyCharts.shRev?.[i]||0)+(dailyCharts.fbRev?.[i]||0)+(dailyCharts.mtRev?.[i]||0)), 0) * 1.22
    : 1;

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
                  onClick={() => applyPeriod(item)} disabled={busy}>{item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่องทาง</div>
            <div className="exec-chip-row">
              {PLATFORMS.map(item => (
                <button key={item.value} type="button"
                  className={'exec-chip channel ' + (platform === item.value ? 'active' : '')}
                  onClick={() => applyPlatform(item.value)} disabled={busy}>{item.label}
                </button>
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
          {/* ── Channel comparison cards ── */}
          {platform === 'All' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
              {ttRev > 0 && (
                <ChannelCard
                  name="TikTok Shop" revenue={ttRev} ads={ttAds} totalRevenue={totalRev}
                  color="#111827" icon="🎵"
                  breakdown={{ 'Organic': ttOrganic, 'Live': tt.live || 0, 'Affiliate': tt.affiliate || 0, 'Ads GMV': tt.ads || 0 }}
                />
              )}
              {shRev > 0 && (
                <ChannelCard
                  name="Shopee" revenue={shRev} ads={shAds} totalRevenue={totalRev}
                  color="#ef4b2b" icon="🛒"
                  breakdown={{ 'Organic': shOrganic, 'Affiliate': sh.affiliate || 0, 'Shopee Ads': sh.ads || 0 }}
                />
              )}
              {mtRev > 0 && (
                <ChannelCard
                  name="Modern Trade" revenue={mtRev} ads={0} totalRevenue={totalRev}
                  color="#059669" icon="🏪"
                  breakdown={Object.fromEntries(Object.entries(mt).filter(([,v]) => v > 0))}
                />
              )}
              {fbRev > 0 && (
                <ChannelCard
                  name="Facebook" revenue={fbRev} ads={fbAds} totalRevenue={totalRev}
                  color="#2563eb" icon="📘"
                  breakdown={{}}
                />
              )}
            </div>
          )}

          {/* ── KPI metrics ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
            <MetricPill label="ยอดขาย (Revenue)"    value={fmtMoney(s.revenue)}    onClick={() => showAudit('rev')}       tone="blue" />
            <MetricPill label="ค่าโฆษณา"            value={fmtMoney(s.ads)}         onClick={() => showAudit('ads')}       tone="warn" />
            <MetricPill label="ROI รวม"              value={roi(s.roas)}             tone={s.roas >= 3 ? 'good' : 'warn'}  />
            <MetricPill label="กำไรหลังโฆษณา"       value={fmtMoney(s.profit)}      onClick={() => showAudit('netIncome')} tone={s.profit >= 0 ? 'good' : 'bad'} />
            <MetricPill label="Ads/Revenue"          value={pct(s.adsRate)}          tone={s.adsRate <= 25 ? 'good' : 'warn'} sub="เป้า ≤ 25%" />
            <MetricPill label="ออเดอร์รวม"          value={fmt(s.totalOrders, 0)}   tone="default" />
            <MetricPill label="สินค้าขายได้"         value={fmt(s.soldItems, 0)}    tone="default" />
            <MetricPill label="ตีคืน"               value={fmt(s.returnedItems, 0)} tone={s.returnedItems > 0 ? 'bad' : 'default'} />
            <MetricPill label="Net Margin"           value={pct(s.netMargin)}        tone={s.netMargin >= 30 ? 'good' : 'warn'} />
            <MetricPill label="AOV"                  value={fmtMoney(s.aov)}         />
          </div>

          {/* ── Source breakdown (single platform) ── */}
          {platform !== 'All' && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>
                {platform === 'TikTok' && `สัดส่วนยอดขาย TikTok — ${fmtMoney(ttRev)}`}
                {platform === 'Shopee' && `สัดส่วนยอดขาย Shopee — ${fmtMoney(shRev)}`}
                {platform === 'ModernTrade' && `สัดส่วนยอดขาย Modern Trade — ${fmtMoney(mtRev)}`}
                {platform === 'Facebook' && `Facebook — ${fmtMoney(fbRev)}`}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {platform === 'TikTok' && ttRev > 0 && [
                  { label: 'Organic', value: ttOrganic,      note: 'หน้าสินค้า / ไม่ถูก map' },
                  { label: 'Live',    value: tt.live || 0,   note: 'ยอดจาก Live ร้านค้า' },
                  { label: 'Affiliate', value: tt.affiliate || 0, note: 'ยอดจาก Creator/Partner' },
                  { label: 'Ads GMV Max', value: tt.ads || 0,    note: 'GMV Max campaign' },
                  { label: 'Ads Live Boost', value: tt.adsLive || 0, note: 'Boost ระหว่าง Live' },
                ].map(({ label, value, note }) => (
                  <div key={label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a3a' }}>{fmtMoney(value)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                      {ttRev > 0 ? pct((value / ttRev) * 100) : '-'} · {note}
                    </div>
                  </div>
                ))}
                {platform === 'Shopee' && shRev > 0 && [
                  { label: 'Organic',      value: shOrganic,         note: 'หน้าสินค้า / ไม่ถูก map' },
                  { label: 'Affiliate',    value: sh.affiliate || 0, note: 'Shopee Affiliate' },
                  { label: 'Shopee Ads',   value: sh.ads || 0,       note: 'ยอดจาก Ads / Live' },
                ].map(({ label, value, note }) => (
                  <div key={label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a3a' }}>{fmtMoney(value)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                      {shRev > 0 ? pct((value / shRev) * 100) : '-'} · {note}
                    </div>
                  </div>
                ))}
                {platform === 'ModernTrade' && Object.entries(mt).filter(([,v]) => v > 0).map(([name, v]) => (
                  <div key={name} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a3a' }}>{fmtMoney(v)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                      {mtRev > 0 ? pct((v / mtRev) * 100) : '-'}
                    </div>
                  </div>
                ))}
                {platform === 'Facebook' && (
                  <>
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Revenue</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2a3a' }}>{fmtMoney(fbRev)}</div>
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Ads Cost</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#d97706' }}>{fmtMoney(fbAds)}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Monthly chart ── */}
          {hasMonthly && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>ยอดขายรายเดือนตามช่องทาง</h3>
              <div style={{ height: 260 }}>
                <Bar
                  data={{
                    labels: charts.labels,
                    datasets: [
                      showTt && { label: 'TikTok',      data: charts.ttRev, backgroundColor: '#111827', borderColor: '#111827', stack: 'r' },
                      showSh && { label: 'Shopee',       data: charts.shRev, backgroundColor: '#ef4b2b', borderColor: '#ef4b2b', stack: 'r' },
                      showFb && { label: 'Facebook',     data: charts.fbRev || [], backgroundColor: '#2563eb', borderColor: '#2563eb', stack: 'r' },
                      showMt && { label: 'Modern Trade', data: charts.mtRev, backgroundColor: '#059669', borderColor: '#059669', stack: 'r' },
                      { label: 'ค่าโฆษณา', data: charts.ads, backgroundColor: 'rgba(220,38,38,.7)', borderColor: '#dc2626', stack: 'a' },
                    ].filter(Boolean)
                  }}
                  plugins={[valueLabelPlugin]}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
                    scales: {
                      x: { stacked: true },
                      y: { stacked: true, beginAtZero: true, max: Math.ceil(salesMax), ticks: { callback: shortMoney } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Daily chart ── */}
          {hasDaily && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>ยอดขายรายวัน</h3>
              <div style={{ height: 240 }}>
                <Bar
                  data={{
                    labels: dailyCharts.labels,
                    datasets: [
                      showTt && { label: 'TikTok',      data: dailyCharts.ttRev, backgroundColor: '#111827', stack: 'r' },
                      showSh && { label: 'Shopee',       data: dailyCharts.shRev, backgroundColor: '#ef4b2b', stack: 'r' },
                      showFb && { label: 'Facebook',     data: dailyCharts.fbRev || [], backgroundColor: '#2563eb', stack: 'r' },
                      showMt && { label: 'Modern Trade', data: dailyCharts.mtRev, backgroundColor: '#059669', stack: 'r' },
                    ].filter(Boolean)
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: {
                      x: { stacked: true },
                      y: { stacked: true, beginAtZero: true, max: Math.ceil(dailyMax), ticks: { callback: shortMoney } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Summary table ── */}
          {(data.table || []).length > 0 && (
            <div className="card table-scroll">
              <h3>ตารางรายวัน</h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th className="num">ยอดขาย</th>
                    <th className="num">ค่าโฆษณา</th>
                    <th className="num">กำไรหลังแอด</th>
                    <th className="num">ออเดอร์</th>
                    <th className="num">ยกเลิก %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.map((row, i) => (
                    <tr key={i}>
                      <td><b>{row.month}</b></td>
                      <td className="num">{fmtMoney(row.rev)}</td>
                      <td className="num">{fmtMoney(row.ads)}</td>
                      <td className="num" style={{ color: row.profit >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>{fmtMoney(row.profit)}</td>
                      <td className="num">{fmt(row.orders, 0)}</td>
                      <td className="num" style={{ color: row.cancelRate > 5 ? '#dc2626' : '#6b7280' }}>{pct(row.cancelRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modal}
        </>
      )}
    </div>
  );
}
