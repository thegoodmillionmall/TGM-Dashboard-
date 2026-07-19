import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, fmt, fmtMoney } from '../api.js';
import { Alert, Bar, Line, Loading, useDateRange } from '../components/ui.jsx';

const shortMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '฿' + (n / 1_000).toFixed(0) + 'K';
  return '฿' + fmt(n, 0);
};

const pct = v => fmt(v || 0, 2) + '%';
const roi = v => Number(v || 0) > 0 ? fmt(v, 2) + 'x' : '-';

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
  const { start, end, setStart, setEnd } = useDateRange();
  const [platform, setPlatform] = useState('All');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await apiGet('/dashboard', { start, end, platform, subPlatform: 'All' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const s = data?.summary || {};
  const audit = data?.audit || {};

  const platformRows = useMemo(() => {
    const p = data?.platformBreakdown || {};
    const ads = audit.ads || {};
    const deduct = audit.deduct || {};
    const rows = [
      {
        name: 'TikTok Shop',
        revenue: Number(p.tiktok || 0),
        ads: Number(ads.ttManager || 0) + Number(ads.ttGmv || 0) + Number(ads.ttLive || 0),
        deductions: Number(deduct.ttFees || 0) + Number(deduct.ttAff || 0)
      },
      {
        name: 'Shopee',
        revenue: Number(p.shopee || 0),
        ads: Number(ads.shAds || 0) + Number(ads.shLive || 0),
        deductions: Number(deduct.shFees || 0) + Number(deduct.shAff || 0)
      },
      {
        name: 'Modern Trade',
        revenue: Number(p.modernTrade || 0),
        ads: 0,
        deductions: Number(deduct.mtGp || 0)
      },
      {
        name: 'Meta Ads',
        revenue: 0,
        ads: Number(ads.meta || 0),
        deductions: 0
      }
    ];
    const platformKey = row => row.name === 'TikTok Shop' ? 'TikTok'
      : row.name === 'Modern Trade' ? 'ModernTrade'
      : row.name;
    return rows
      .filter(row => platform === 'All' || platformKey(row) === platform)
      .map(row => ({ ...row, profitAfterAds: row.revenue - row.ads - row.deductions }));
  }, [data, audit, platform]);

  const monthlyRows = (data?.charts?.labels || []).map((label, i) => {
    const tiktok = Number(data.charts.ttRev?.[i] || 0);
    const shopee = Number(data.charts.shRev?.[i] || 0);
    const mt = Number(data.charts.mtRev?.[i] || 0);
    const ads = Number(data.charts.ads?.[i] || 0);
    const revenue = tiktok + shopee + mt;
    return { label, tiktok, shopee, mt, revenue, ads, roi: ads > 0 ? revenue / ads : 0 };
  });

  return (
    <div className="exec-page">
      <div className="exec-head">
        <div>
          <div className="page-title">ภาพรวมผู้บริหาร</div>
          <div className="page-sub">ยอดขาย ค่าโฆษณา ROI และตารางสรุปที่ใช้ตัดสินใจเร็ว</div>
        </div>
        <div className="exec-filters">
          <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
          <label>ประเภท
            <select value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="All">ทุกช่องทาง</option>
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
              <option value="ModernTrade">Modern Trade</option>
            </select>
          </label>
          <button className="btn btn-primary" onClick={load} disabled={busy}>{busy ? 'กำลังโหลด...' : 'แสดงข้อมูล'}</button>
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
              <h3>ยอดขายรายเดือนตามช่องทาง</h3>
              <Bar
                data={{
                  labels: monthlyRows.map(m => m.label),
                  datasets: [
                    { label: 'TikTok', data: monthlyRows.map(m => m.tiktok), backgroundColor: '#111827', borderColor: '#111827', stack: 'sales' },
                    { label: 'Shopee', data: monthlyRows.map(m => m.shopee), backgroundColor: '#ef4b2b', borderColor: '#ef4b2b', stack: 'sales' },
                    { label: 'Modern Trade', data: monthlyRows.map(m => m.mt), backgroundColor: '#059669', borderColor: '#059669', stack: 'sales' }
                  ]
                }}
                plugins={[valueLabelPlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
                  scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: shortMoney } } }
                }}
              />
            </div>

            <div className="card exec-chart-card">
              <h3>ค่าโฆษณาและ ROI รายเดือน</h3>
              <Line
                data={{
                  labels: monthlyRows.map(m => m.label),
                  datasets: [
                    { label: 'ค่าโฆษณา', data: monthlyRows.map(m => m.ads), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.14)', tension: .32, yAxisID: 'money', fill: true },
                    { label: 'ROI', data: monthlyRows.map(m => m.roi), borderColor: '#059669', backgroundColor: '#059669', tension: .28, yAxisID: 'roi' }
                  ]
                }}
                plugins={[valueLabelPlugin]}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: { legend: { position: 'bottom' } },
                  scales: {
                    money: { type: 'linear', position: 'left', ticks: { callback: shortMoney } },
                    roi: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + 'x' } }
                  }
                }}
              />
            </div>
          </div>

          <PlatformTable rows={platformRows} totalRevenue={s.revenue} />

          <div className="card table-scroll exec-table-card">
            <h3>ตารางรายเดือน: ยอดขาย ค่าโฆษณา ROI</h3>
            <table className="data exec-table">
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="num">TikTok</th>
                  <th className="num">Shopee</th>
                  <th className="num">Modern Trade</th>
                  <th className="num">ยอดขายรวม</th>
                  <th className="num">ค่าโฆษณา</th>
                  <th className="num">ROI</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map(row => (
                  <tr key={row.label}>
                    <td><b>{row.label}</b></td>
                    <td className="num">{fmtMoney(row.tiktok)}</td>
                    <td className="num">{fmtMoney(row.shopee)}</td>
                    <td className="num">{fmtMoney(row.mt)}</td>
                    <td className="num"><b>{fmtMoney(row.revenue)}</b></td>
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
