import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney } from '../api.js';
import { Kpi, Alert, Loading, Bar, Line } from '../components/ui.jsx';

const fmtROI = v => (v && v > 0) ? v.toFixed(2) + 'x' : '-';

const tooltipCallbacks = {
  label: ctx => ` ${ctx.dataset.label}: ฿${Number(ctx.parsed.y).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
  footer: items => `รวม: ฿${items.reduce((s, i) => s + i.parsed.y, 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
};

const yTicks = {
  callback: v => '฿' + (v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? (v / 1_000).toFixed(0) + 'k' : v),
};

export default function Overview() {
  const [data, setData]   = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/gsheet/overview')); }
    catch (e) { setError(e.message); }
    finally   { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const t       = data?.totals  ?? {};
  const monthly = data?.monthly ?? [];
  const daily   = data?.daily   ?? [];
  const lastM   = monthly.length > 0 ? monthly[monthly.length - 1] : {};

  return (
    <div>
      <div className="page-title">ภาพรวมธุรกิจ</div>
      <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span>ข้อมูลจาก Google Sheet (Dashboard)</span>
        {data?.fetchedAt && (
          <span style={{ color: 'var(--grey)' }}>
            · อัปเดต: {new Date(data.fetchedAt).toLocaleString('th-TH')}
          </span>
        )}
        <button
          className="btn btn-outline"
          onClick={load}
          disabled={busy}
          style={{ marginLeft: 'auto', padding: '4px 14px', fontSize: 13 }}
        >
          {busy ? 'กำลังโหลด...' : '⟳ รีเฟรช'}
        </button>
      </div>

      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          {/* KPI Cards */}
          <div className="kpis">
            <Kpi label="ยอดขายรวม (ทุกเดือน)" value={t.total} />
            <Kpi label="ยอดขาย TikTok" value={t.tiktok} />
            <Kpi label="ยอดขาย Shopee" value={t.shopee} />
            <Kpi label="ค่าโฆษณารวม" value={t.totalAds} tone="red" />
            <Kpi label="ROI รวม" value={t.roi} format="x" tone="green" />
            <Kpi label={`ยอดขาย ${lastM.month ?? 'เดือนล่าสุด'}`} value={lastM.total} />
            <Kpi label="ROI เดือนล่าสุด" value={lastM.roi} format="x" tone="green" />
          </div>

          {/* Monthly Sales Chart */}
          <div className="card">
            <h3>ยอดขายรายเดือน แยกแพลตฟอร์ม (Shopee + TikTok)</h3>
            <Bar
              data={{
                labels: monthly.map(m => m.month),
                datasets: [
                  { label: 'TikTok', data: monthly.map(m => m.tiktok), backgroundColor: '#1a2a3a', stack: 'rev' },
                  { label: 'Shopee', data: monthly.map(m => m.shopee), backgroundColor: '#f4511e', stack: 'rev' },
                ],
              }}
              options={{
                interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: { callbacks: tooltipCallbacks }, datalabels: false },
                scales: {
                  x: { stacked: true },
                  y: { stacked: true, ticks: yTicks },
                },
              }}
            />
          </div>

          {/* Monthly Ads Chart */}
          <div className="card">
            <h3>ค่าโฆษณา (Shopee + TikTok) รายเดือน</h3>
            <Bar
              data={{
                labels: monthly.map(m => m.month),
                datasets: [
                  { label: 'Shopee Ads', data: monthly.map(m => m.shopeeAds), backgroundColor: 'rgba(244,81,30,0.75)', stack: 'ads' },
                  { label: 'TikTok Ads', data: monthly.map(m => m.tiktokAds), backgroundColor: 'rgba(26,42,58,0.75)', stack: 'ads' },
                ],
              }}
              options={{
                interaction: { mode: 'index', intersect: false },
                plugins: { tooltip: { callbacks: tooltipCallbacks }, datalabels: false },
                scales: {
                  x: { stacked: true },
                  y: { stacked: true, ticks: yTicks },
                },
              }}
            />
          </div>

          {/* Daily Chart (current month from GSheet filter) */}
          {daily.length > 0 && (
            <div className="card">
              <h3>ยอดขายรายวัน (เดือนที่เลือกใน Google Sheet)</h3>
              <Line
                data={{
                  labels: daily.map(d => d.date),
                  datasets: [
                    {
                      label: 'TikTok',
                      data: daily.map(d => d.tiktok),
                      borderColor: '#1a2a3a',
                      backgroundColor: 'rgba(26,42,58,0.07)',
                      tension: 0.3, pointRadius: 2, pointHoverRadius: 5, fill: true,
                    },
                    {
                      label: 'Shopee',
                      data: daily.map(d => d.shopee),
                      borderColor: '#f4511e',
                      backgroundColor: 'rgba(244,81,30,0.05)',
                      tension: 0.3, pointRadius: 2, pointHoverRadius: 5, fill: true,
                    },
                  ],
                }}
                options={{
                  interaction: { mode: 'index', intersect: false },
                  plugins: { tooltip: { callbacks: tooltipCallbacks }, datalabels: false },
                  scales: {
                    x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } },
                    y: { ticks: yTicks },
                  },
                }}
              />
            </div>
          )}

          {/* Monthly Summary Table */}
          <div className="card table-scroll">
            <h3>ตารางสรุปรายเดือน</h3>
            <table className="data">
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="num">TikTok</th>
                  <th className="num">Shopee</th>
                  <th className="num">รวม GMV</th>
                  <th className="num">ค่าโฆษณา</th>
                  <th className="num">ROI</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={i}>
                    <td>{m.month}</td>
                    <td className="num">{fmtMoney(m.tiktok)}</td>
                    <td className="num">{fmtMoney(m.shopee)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(m.total)}</td>
                    <td className="num">{fmtMoney(m.totalAds)}</td>
                    <td className="num" style={{
                      color: m.roi >= 4 ? '#059669' : m.roi >= 2.5 ? '#d97706' : m.roi > 0 ? '#dc2626' : 'inherit',
                      fontWeight: 600,
                    }}>
                      {fmtROI(m.roi)}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td>รวมทั้งหมด</td>
                  <td className="num">{fmtMoney(t.tiktok)}</td>
                  <td className="num">{fmtMoney(t.shopee)}</td>
                  <td className="num">{fmtMoney(t.total)}</td>
                  <td className="num">{fmtMoney(t.totalAds)}</td>
                  <td className="num">{fmtROI(t.roi)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
