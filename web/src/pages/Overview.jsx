import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, fmt, fmtMoney } from '../api.js';
import { Alert, Bar, Line, Loading } from '../components/ui.jsx';

const shortMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '฿' + (n / 1_000).toFixed(0) + 'K';
  return '฿' + fmt(n, 0);
};

const pct = v => fmt(v || 0, 2) + '%';
const roi = v => Number(v || 0) > 0 ? fmt(v, 2) + 'x' : '-';
const iso = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const monthValue = dateText => String(dateText || '').slice(0, 7);
const dayMs = 86400000;
const daysBetween = (a, b) => {
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 999;
  return Math.max(1, Math.round((end - start) / dayMs) + 1);
};
const paddedMax = (value, min = 1) => Math.max(min, Math.ceil(Number(value || 0) * 1.22));

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const today = new Date();
  return { start: iso(start), end: iso(end > today ? today : end) };
}

function previousMonthRange() {
  const now = new Date();
  return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

function lastDaysRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  return { start: iso(start), end: iso(end) };
}

function rangeFromMonth(value) {
  if (!value) return monthRange();
  const [year, month] = value.split('-').map(Number);
  return monthRange(new Date(year, month - 1, 1));
}

const PERIODS = [
  { key: 'this-month', label: 'เดือนนี้', getRange: () => monthRange() },
  { key: 'last-month', label: 'เดือนก่อน', getRange: previousMonthRange },
  { key: '30-days', label: '30 วัน', getRange: () => lastDaysRange(30) },
  { key: 'year', label: 'ปีนี้', getRange: () => ({ start: `${new Date().getFullYear()}-01-01`, end: iso(new Date()) }) }
];

const PLATFORMS = [
  { value: 'All', label: 'ทุกช่องทาง' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Shopee', label: 'Shopee' },
  { value: 'ModernTrade', label: 'Modern Trade' }
];

const TH_MONTHS = {
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4,
  'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8,
  'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12
};

const normalizeDate = value => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return text;
  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
};

const labelToIsoInRange = (label, start) => {
  const text = String(label || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return text;
  const year = match[3] || String(start || '').slice(0, 4) || String(new Date().getFullYear());
  return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
};

const monthKeyFromLabel = label => {
  const text = String(label || '').trim();
  const hit = text.match(/^(.+?)\s+(\d{4})$/);
  if (!hit) return '';
  const month = TH_MONTHS[hit[1].trim()];
  return month ? `${hit[2]}-${String(month).padStart(2, '0')}` : '';
};

const inDateRange = (value, start, end) => {
  const date = normalizeDate(value);
  return date >= start && date <= end;
};

const inMonthRange = (monthKey, start, end) => {
  if (!monthKey) return false;
  const monthStart = `${monthKey}-01`;
  const [year, month] = monthKey.split('-').map(Number);
  const monthEnd = iso(new Date(year, month, 0));
  return monthEnd >= start && monthStart <= end;
};

const valueLabelPlugin = {
  id: 'tgmValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11px Kanit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((point, index) => {
        const value = Number(dataset.data[index] || 0);
        if (!value) return;
        ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || '#1a2a3a';
        const label = dataset.label?.includes('ROI') ? roi(value) : shortMoney(value);
        ctx.fillText(label, point.x, point.y - 5);
      });
    });
    ctx.restore();
  }
};

function MetricCard({ label, value, sub, tone = 'default' }) {
  return (
    <div className={'exec-metric ' + tone}>
      <div className="exec-label">{label}</div>
      <div className="exec-value">{value}</div>
      {sub && <div className="exec-sub">{sub}</div>}
    </div>
  );
}

function PlatformTable({ rows, totalRevenue }) {
  return (
    <div className="card table-scroll exec-table-card">
      <h3>ตารางสรุปตามช่องทาง</h3>
      <table className="data exec-table">
        <thead>
          <tr>
            <th>ช่องทาง</th>
            <th className="num">ยอดขาย</th>
            <th className="num">ค่าโฆษณา</th>
            <th className="num">กำไรหลังโฆษณา</th>
            <th className="num">สัดส่วนยอดขาย</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name}>
              <td><b>{row.name}</b></td>
              <td className="num">{fmtMoney(row.revenue)}</td>
              <td className="num">{fmtMoney(row.ads)}</td>
              <td className="num" style={{ color: row.profitAfterAds >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                {fmtMoney(row.profitAfterAds)}
              </td>
              <td className="num">{pct(totalRevenue ? (row.revenue / totalRevenue) * 100 : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Overview() {
  const initialRange = monthRange();
  const [start, setStart] = useState(initialRange.start);
  const [end, setEnd] = useState(initialRange.end);
  const [period, setPeriod] = useState('this-month');
  const [selectedMonth, setSelectedMonth] = useState(monthValue(initialRange.start));
  const [platform, setPlatform] = useState('All');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(next = {}) {
    const nextStart = next.start || start;
    const nextEnd = next.end || end;
    const nextPlatform = next.platform || platform;
    setBusy(true);
    setError('');
    try {
      const [sheet, ops, channel] = await Promise.all([
        apiGet('/gsheet/overview'),
        apiGet('/dashboard', { start: nextStart, end: nextEnd, platform: nextPlatform, subPlatform: 'All' }).catch(() => null),
        apiGet('/gsheet/channel-dashboard', { start: nextStart, end: nextEnd, platform: nextPlatform, subPlatform: 'All' }).catch(() => null)
      ]);
      setData({ ...sheet, ops, channel, activeStart: nextStart, activeEnd: nextEnd, activePlatform: nextPlatform });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  function applyPeriod(item) {
    const range = item.getRange();
    setPeriod(item.key);
    setStart(range.start);
    setEnd(range.end);
    setSelectedMonth(monthValue(range.start));
    load(range);
  }

  function applyMonth(value) {
    const range = rangeFromMonth(value);
    setPeriod('month');
    setSelectedMonth(value);
    setStart(range.start);
    setEnd(range.end);
    load(range);
  }

  function applyPlatform(value) {
    setPlatform(value);
    load({ platform: value });
  }

  function applyCustomDates(nextStart, nextEnd) {
    setPeriod('custom');
    setStart(nextStart);
    setEnd(nextEnd);
  }

  const activeStart = data?.activeStart || start;
  const activeEnd = data?.activeEnd || end;
  const activePlatform = data?.activePlatform || platform;
  const monthlySheetRows = (data?.monthly || [])
    .map(row => ({ ...row, monthKey: monthKeyFromLabel(row.month) }))
    .filter(row => inMonthRange(row.monthKey, activeStart, activeEnd));
  const dailySheetRows = (data?.daily || [])
    .map(row => ({ ...row, dateKey: normalizeDate(row.date) }))
    .filter(row => inDateRange(row.date, activeStart, activeEnd));
  const detailDailyRows = (data?.ops?.dailyCharts?.labels || []).map((label, index) => {
    const tiktok = Number(data?.ops?.dailyCharts?.ttRev?.[index] || 0);
    const shopee = Number(data?.ops?.dailyCharts?.shRev?.[index] || 0);
    const modernTrade = Number(data?.ops?.dailyCharts?.mtRev?.[index] || 0);
    const ads = Number(data?.ops?.dailyCharts?.ads?.[index] || 0);
    const dateKey = labelToIsoInRange(label, activeStart);
    const revenue = tiktok + shopee + modernTrade;
    return {
      date: label,
      dateKey,
      tiktok,
      shopee,
      facebook: 0,
      modernTrade,
      total: revenue,
      tiktokAds: 0,
      shopeeAds: 0,
      metaAds: 0,
      totalAds: ads,
      roi: ads > 0 ? revenue / ads : 0
    };
  }).filter(row => row.total || row.totalAds);
  const useMonthlySummary = ['this-month', 'last-month', 'month', 'year'].includes(period);
  const summaryRows = monthlySheetRows.length && (useMonthlySummary || dailySheetRows.length === 0) ? monthlySheetRows : dailySheetRows;
  const sumField = (rows, field) => rows.reduce((acc, row) => acc + Number(row[field] || 0), 0);
  const platformRevenue = {
    tiktok: sumField(summaryRows, 'tiktok'),
    shopee: sumField(summaryRows, 'shopee'),
    facebook: sumField(summaryRows, 'facebook'),
    total: sumField(summaryRows, 'total'),
    modernTrade: sumField(summaryRows, 'modernTrade') || sumField(summaryRows, 'mt')
  };
  const platformAds = {
    tiktok: sumField(summaryRows, 'tiktokAds'),
    shopee: sumField(summaryRows, 'shopeeAds'),
    meta: sumField(summaryRows, 'metaAds'),
    total: sumField(summaryRows, 'totalAds'),
    modernTrade: 0
  };
  const selectedRevenue = activePlatform === 'TikTok' ? platformRevenue.tiktok
    : activePlatform === 'Shopee' ? platformRevenue.shopee
    : activePlatform === 'ModernTrade' ? platformRevenue.modernTrade
    : platformRevenue.total || (platformRevenue.tiktok + platformRevenue.shopee + platformRevenue.facebook + platformRevenue.modernTrade);
  const selectedAds = activePlatform === 'TikTok' ? platformAds.tiktok
    : activePlatform === 'Shopee' ? platformAds.shopee
    : activePlatform === 'ModernTrade' ? 0
    : platformAds.total || (platformAds.tiktok + platformAds.shopee + platformAds.meta + platformAds.modernTrade);
  const opsSummary = data?.channel?.summary || data?.ops?.summary || {};
  const totalOrders = Number(opsSummary.totalOrders || 0);
  const s = {
    revenue: selectedRevenue,
    ads: selectedAds,
    profit: selectedRevenue - selectedAds,
    netIncome: selectedRevenue - selectedAds,
    roas: selectedAds > 0 ? selectedRevenue / selectedAds : 0,
    adsRate: selectedRevenue > 0 ? (selectedAds / selectedRevenue) * 100 : 0,
    netMargin: selectedRevenue > 0 ? ((selectedRevenue - selectedAds) / selectedRevenue) * 100 : 0,
    totalOrders,
    soldItems: Number(opsSummary.soldItems || 0),
    returnedItems: Number(opsSummary.returnedItems || 0),
    cancelRate: Number(opsSummary.cancelRate || 0),
    aov: totalOrders > 0 ? selectedRevenue / totalOrders : 0
  };

  const platformRows = useMemo(() => {
    const rows = [
      {
        name: 'TikTok Shop',
        revenue: platformRevenue.tiktok,
        ads: platformAds.tiktok,
        deductions: 0
      },
      {
        name: 'Shopee',
        revenue: platformRevenue.shopee,
        ads: platformAds.shopee,
        deductions: 0
      },
      {
        name: 'Facebook',
        revenue: platformRevenue.facebook,
        ads: platformAds.meta,
        deductions: 0
      },
      {
        name: 'Modern Trade',
        revenue: platformRevenue.modernTrade,
        ads: 0,
        deductions: 0
      }
    ];
    const platformKey = row => row.name === 'TikTok Shop' ? 'TikTok'
      : row.name === 'Modern Trade' ? 'ModernTrade'
      : row.name;
    return rows
      .filter(row => platform === 'All' || platformKey(row) === platform)
      .filter(row => platform !== 'All' || row.revenue || row.ads || row.name !== 'Facebook')
      .map(row => ({ ...row, profitAfterAds: row.revenue - row.ads - row.deductions }));
  }, [platformRevenue.tiktok, platformRevenue.shopee, platformRevenue.facebook, platformRevenue.modernTrade, platformAds.tiktok, platformAds.shopee, platformAds.meta, platform]);

  const wantsDailyChart = daysBetween(activeStart, activeEnd) <= 45;
  const dailyRowsForChart = dailySheetRows.length ? dailySheetRows : detailDailyRows;
  const useDailyChart = wantsDailyChart && dailyRowsForChart.length > 0;
  const showTikTok = activePlatform === 'All' || activePlatform === 'TikTok';
  const showShopee = activePlatform === 'All' || activePlatform === 'Shopee';
  const showFacebook = activePlatform === 'All' || activePlatform === 'Facebook';
  const showModernTrade = activePlatform === 'All' || activePlatform === 'ModernTrade';
  const chartRows = (useDailyChart ? dailyRowsForChart : monthlySheetRows).map(row => {
    const tiktok = showTikTok ? Number(row.tiktok || 0) : 0;
    const shopee = showShopee ? Number(row.shopee || 0) : 0;
    const facebook = showFacebook ? Number(row.facebook || 0) : 0;
    const mt = showModernTrade ? Number(row.modernTrade || row.mt || 0) : 0;
    const tiktokAds = showTikTok ? Number(row.tiktokAds || 0) : 0;
    const shopeeAds = showShopee ? Number(row.shopeeAds || 0) : 0;
    const facebookAds = showFacebook ? Number(row.metaAds || 0) : 0;
    const rowAds = Number(row.totalAds || 0);
    const ads = activePlatform === 'All' ? rowAds : tiktokAds + shopeeAds + facebookAds;
    const revenue = tiktok + shopee + facebook + mt;
    return { label: useDailyChart ? row.date : row.month, tiktok, shopee, facebook, mt, revenue, tiktokAds, shopeeAds, facebookAds, ads, roi: ads > 0 ? revenue / ads : 0 };
  });
  const salesDatasets = [
    { platform: 'TikTok', label: 'TikTok', data: chartRows.map(m => m.tiktok), backgroundColor: '#111827', borderColor: '#111827', stack: 'sales' },
    { platform: 'Shopee', label: 'Shopee', data: chartRows.map(m => m.shopee), backgroundColor: '#ef4b2b', borderColor: '#ef4b2b', stack: 'sales' },
    { platform: 'Facebook', label: 'Facebook', data: chartRows.map(m => m.facebook), backgroundColor: '#2563eb', borderColor: '#2563eb', stack: 'sales' },
    { platform: 'ModernTrade', label: 'Modern Trade', data: chartRows.map(m => m.mt), backgroundColor: '#059669', borderColor: '#059669', stack: 'sales' }
  ].filter(item => activePlatform === 'All' || item.platform === activePlatform);
  const salesAxisMax = paddedMax(Math.max(...chartRows.map(row => row.revenue), 0));
  const adsAxisMax = paddedMax(Math.max(...chartRows.map(row => row.ads), 0));
  const roiAxisMax = Math.max(1, Math.ceil(Math.max(...chartRows.map(row => row.roi), 0) * 1.25));
  const chartModeLabel = useDailyChart ? 'รายวัน' : 'รายเดือน';

  return (
    <div className="exec-page">
      <div className="exec-head">
        <div>
          <div className="page-title">ภาพรวมผู้บริหาร</div>
          <div className="page-sub">ยอดขาย ค่าโฆษณา ROI และตารางสรุปที่ใช้ตัดสินใจเร็ว</div>
        </div>
        <div className="exec-filters">
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่วงเวลา</div>
            <div className="exec-chip-row">
              {PERIODS.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={'exec-chip ' + (period === item.key ? 'active' : '')}
                  onClick={() => applyPeriod(item)}
                  disabled={busy}
                >
                  {item.label}
                </button>
              ))}
              <label className={'exec-month-picker ' + (period === 'month' ? 'active' : '')}>
                เลือกเดือน
                <input type="month" value={selectedMonth} onChange={e => applyMonth(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่องทาง</div>
            <div className="exec-chip-row">
              {PLATFORMS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  className={'exec-chip channel ' + (platform === item.value ? 'active' : '')}
                  onClick={() => applyPlatform(item.value)}
                  disabled={busy}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="exec-custom-range">
            <label>เริ่ม<input type="date" value={start} onChange={e => applyCustomDates(e.target.value, end)} /></label>
            <label>ถึง<input type="date" value={end} onChange={e => applyCustomDates(start, e.target.value)} /></label>
            <button className="btn btn-primary" onClick={() => load()} disabled={busy}>{busy ? 'กำลังโหลด...' : 'แสดงข้อมูล'}</button>
          </div>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          <div className="exec-hero">
            <div>
              <div className="exec-hero-label">ยอดขายรวม</div>
              <div className="exec-hero-value">{fmtMoney(s.revenue)}</div>
              <div className="exec-hero-sub">ช่วง {start} ถึง {end}</div>
            </div>
            <div className="exec-hero-grid">
            <MetricCard label="ค่าโฆษณารวม" value={fmtMoney(s.ads)} tone="warning" />
            <MetricCard label="ROI รวม" value={roi(s.roas)} tone={s.roas >= 3 ? 'good' : 'warning'} />
            <MetricCard label="กำไรหลังโฆษณา" value={fmtMoney(s.profit)} tone={s.profit >= 0 ? 'good' : 'bad'} />
            <MetricCard label="จำนวนออเดอร์" value={fmt(s.totalOrders)} sub={`ยกเลิก ${pct(s.cancelRate)}`} />
            <MetricCard label="สินค้ารวม" value={fmt(s.soldItems)} tone={s.returnedItems > 0 ? 'warning' : 'good'} sub={`ตีคืน ${fmt(s.returnedItems)} ชิ้น`} />
          </div>
          </div>

          <div className="exec-metrics-row">
            <MetricCard label="AOV" value={fmtMoney(s.aov)} />
            <MetricCard label="Net Margin" value={pct(s.netMargin)} tone={s.netMargin >= 30 ? 'good' : 'warning'} />
            <MetricCard label="Ads / Revenue" value={pct(s.adsRate)} tone={s.adsRate <= 25 ? 'good' : 'warning'} />
            <MetricCard label="กำไรสุทธิ" value={fmtMoney(s.netIncome)} tone={s.netIncome >= 0 ? 'good' : 'bad'} sub="รายละเอียดต้นทุนดูที่หน้าบัญชี/ต้นทุน" />
          </div>

          <div className="exec-grid">
            <div className="card exec-chart-card">
              <h3>ยอดขาย{chartModeLabel}ตามช่องทาง</h3>
              <Bar
                data={{
                  labels: chartRows.map(m => m.label),
                  datasets: salesDatasets
                }}
                plugins={[valueLabelPlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
                  scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, max: salesAxisMax, ticks: { callback: shortMoney } }
                  }
                }}
              />
            </div>

            <div className="card exec-chart-card">
              <h3>ค่าโฆษณาและ ROI {chartModeLabel}</h3>
              <Line
                data={{
                  labels: chartRows.map(m => m.label),
                  datasets: [
                    { label: 'ค่าโฆษณา', data: chartRows.map(m => m.ads), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.14)', tension: .32, yAxisID: 'money', fill: true },
                    { label: 'ROI', data: chartRows.map(m => m.roi), borderColor: '#059669', backgroundColor: '#059669', tension: .28, yAxisID: 'roi' }
                  ]
                }}
                plugins={[valueLabelPlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'bottom' } },
                  scales: {
                    money: { type: 'linear', position: 'left', beginAtZero: true, max: adsAxisMax, ticks: { callback: shortMoney } },
                    roi: { type: 'linear', position: 'right', beginAtZero: true, max: roiAxisMax, grid: { drawOnChartArea: false }, ticks: { callback: v => v + 'x' } }
                  }
                }}
              />
            </div>
          </div>

          <PlatformTable rows={platformRows} totalRevenue={s.revenue} />

          <div className="card table-scroll exec-table-card">
            <h3>ตาราง{chartModeLabel}: ยอดขาย ค่าโฆษณา ROI</h3>
            <table className="data exec-table">
              <thead>
                <tr>
                  <th>{useDailyChart ? 'วันที่' : 'เดือน'}</th>
                  <th className="num">TikTok</th>
                  <th className="num">Shopee</th>
                  <th className="num">Modern Trade</th>
                  <th className="num">ยอดขายรวม</th>
                  <th className="num">Ads TikTok</th>
                  <th className="num">Ads Shopee</th>
                  <th className="num">Ads Facebook</th>
                  <th className="num">ค่าโฆษณารวม</th>
                  <th className="num">ROI</th>
                </tr>
              </thead>
              <tbody>
                {chartRows.map(row => (
                  <tr key={row.label}>
                    <td><b>{row.label}</b></td>
                    <td className="num">{fmtMoney(row.tiktok)}</td>
                    <td className="num">{fmtMoney(row.shopee)}</td>
                    <td className="num">{fmtMoney(row.mt)}</td>
                    <td className="num"><b>{fmtMoney(row.revenue)}</b></td>
                    <td className="num">{fmtMoney(row.tiktokAds)}</td>
                    <td className="num">{fmtMoney(row.shopeeAds)}</td>
                    <td className="num">{fmtMoney(row.facebookAds)}</td>
                    <td className="num">{fmtMoney(row.ads)}</td>
                    <td className="num" style={{ color: row.roi >= 3 ? '#059669' : row.roi > 0 ? '#d97706' : '#6b7280', fontWeight: 700 }}>{roi(row.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
