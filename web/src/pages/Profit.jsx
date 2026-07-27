import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';

/* ── Waterfall bar แบบ floating (Chart.js) ──
   แต่ละ bar = [start, end] — บวกขึ้น หรือลบลง
   ลำดับ: ยอดขาย → หักค่าธรรมเนียม → หักโฆษณา → หัก COGS → กำไรสุทธิ
*/
function buildWaterfall(s) {
  const rev   = s.revenue     || 0;
  const ded   = s.deductions  || 0;
  const ads   = s.ads         || 0;
  const cogs  = s.cogs        || 0;
  const net   = s.netIncome   ?? (rev - ded - ads - cogs);

  const steps = [
    { label: 'ยอดขาย',        start: 0,                    end: rev,               color: '#2563eb' },
    { label: 'หักค่าธรรมเนียม', start: rev - ded,            end: rev,               color: '#dc2626' },
    { label: 'หักโฆษณา',      start: rev - ded - ads,       end: rev - ded,         color: '#f59e0b' },
    { label: 'หัก COGS',      start: rev - ded - ads - cogs, end: rev - ded - ads,   color: '#d97706' },
    { label: 'กำไรสุทธิ',     start: 0,                    end: net,               color: net >= 0 ? '#059669' : '#dc2626' },
  ];

  return {
    labels: steps.map(s => s.label),
    datasets: [{
      label: 'บาท',
      data: steps.map(s => [s.start, s.end]),
      backgroundColor: steps.map(s => s.color + 'cc'),
      borderColor:     steps.map(s => s.color),
      borderWidth: 1,
      borderRadius: 4,
    }]
  };
}

/* ── Horizontal bar: top สินค้า ── */
function buildProductBar(products, field, color) {
  const top = products.slice(0, 15);
  return {
    labels: top.map(p => p.name.length > 28 ? p.name.slice(0, 26) + '…' : p.name),
    datasets: [{
      label: field === 'profit' ? 'กำไร' : 'ยอดขาย',
      data: top.map(p => p[field] || p.profit || 0),
      backgroundColor: color + 'cc',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 3,
    }]
  };
}

export default function Profit() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/dashboard/profit', { start, end })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary || {};

  return (
    <div>
      <div className="page-title">กำไร</div>
      <div className="page-sub">P&L รวม · กำไรต่อแพลตฟอร์ม · Top สินค้าและ Margin</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {!data && !error ? <Loading /> : data && (
        <>
          {/* KPI Strip */}
          <div className="kpis">
            <Kpi label="ยอดขายรวม"   value={s.revenue}   tone="blue" />
            <Kpi label="กำไรสุทธิ"   value={s.netIncome} tone={s.netIncome >= 0 ? 'green' : 'red'} />
            <Kpi label="Net Margin"  value={s.netMargin} format="pct" />
            <Kpi label="ค่าธรรมเนียม" value={s.deductions} tone="red" />
            <Kpi label="ค่าโฆษณา"   value={s.ads}       tone="red" />
            <Kpi label="COGS"        value={s.cogs}      tone="red" />
          </div>

          {/* P&L Waterfall */}
          <div className="card">
            <h3>P&L Waterfall — ยอดขาย → กำไรสุทธิ</h3>
            <Bar
              data={buildWaterfall(s)}
              options={{
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: ctx => {
                        const [lo, hi] = ctx.raw;
                        return ` ${fmtMoney(Math.abs(hi - lo))}`;
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    ticks: { callback: v => (v / 1e6).toFixed(1) + 'M' },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                  }
                }
              }}
            />
            {/* Summary row ใต้ chart */}
            <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap', fontSize: 13 }}>
              {[
                { label: 'ยอดขาย',        val: s.revenue,    color: '#2563eb' },
                { label: 'หักค่าธรรมเนียม', val: s.deductions, color: '#dc2626' },
                { label: 'หักโฆษณา',      val: s.ads,        color: '#f59e0b' },
                { label: 'หัก COGS',      val: s.cogs,       color: '#d97706' },
                { label: 'กำไรสุทธิ',     val: s.netIncome,  color: s.netIncome >= 0 ? '#059669' : '#dc2626' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: 'inline-block' }} />
                  <span style={{ color: '#6b7280' }}>{item.label}:</span>
                  <span style={{ color: item.color, fontWeight: 600 }}>{fmtMoney(item.val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Platform comparison */}
          <div className="grid2">
            <div className="card">
              <h3>ยอดขาย vs กำไรสุทธิ ต่อแพลตฟอร์ม</h3>
              <Bar data={{
                labels: data.byPlatform.map(r => r.platform),
                datasets: [
                  { label: 'ยอดขาย',   data: data.byPlatform.map(r => r.revenue),   backgroundColor: '#2563ebcc', borderRadius: 3 },
                  { label: 'กำไรสุทธิ', data: data.byPlatform.map(r => r.netIncome), backgroundColor: '#059669cc', borderRadius: 3 }
                ]
              }} options={{ plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } } } }, scales: { y: { ticks: { callback: v => (v/1e6).toFixed(1)+'M' } } } }} />
            </div>
            <div className="card table-scroll">
              <h3>P&L ต่อแพลตฟอร์ม</h3>
              <table className="data">
                <thead><tr>
                  <th>แพลตฟอร์ม</th><th className="num">ยอดขาย</th>
                  <th className="num">หัก</th><th className="num">โฆษณา</th>
                  <th className="num">COGS</th><th className="num">กำไร</th><th className="num">Margin</th>
                </tr></thead>
                <tbody>
                  {data.byPlatform.map((r, i) => (
                    <tr key={i}>
                      <td>{r.platform}</td>
                      <td className="num">{fmtMoney(r.revenue)}</td>
                      <td className="num">{fmtMoney(r.deductions)}</td>
                      <td className="num">{fmtMoney(r.ads)}</td>
                      <td className="num">{fmtMoney(r.cogs)}</td>
                      <td className="num" style={{ color: r.netIncome >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>{fmtMoney(r.netIncome)}</td>
                      <td className="num">{fmtPct(r.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top profit products — horizontal bar */}
          {data.topProfit?.length > 0 && (
            <div className="card">
              <h3>Top 15 สินค้ากำไรสูงสุด</h3>
              <Bar
                data={buildProductBar(data.topProfit, 'profit', '#059669')}
                options={{
                  indexAxis: 'y',
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { callback: v => (v/1000).toFixed(0)+'k' }, grid: { color: 'rgba(0,0,0,0.06)' } },
                    y: { ticks: { font: { size: 11 } } }
                  }
                }}
              />
            </div>
          )}

          {/* Top/Low margin tables */}
          <div className="grid2">
            <div className="card table-scroll">
              <h3>Top กำไรสูงสุด</h3>
              <table className="data">
                <thead><tr><th>สินค้า</th><th className="num">ยอดขาย</th><th className="num">กำไร</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {data.topProfit.map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td className="num">{fmtMoney(p.revenue)}</td>
                      <td className="num" style={{ color: '#059669' }}>{fmtMoney(p.profit)}</td>
                      <td className="num">{fmtPct(p.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card table-scroll">
              <h3>Margin ต่ำสุด (ควรตรวจสอบ)</h3>
              <table className="data">
                <thead><tr><th>สินค้า</th><th className="num">ยอดขาย</th><th className="num">กำไร</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {data.lowMargin.map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td className="num">{fmtMoney(p.revenue)}</td>
                      <td className="num" style={{ color: p.profit >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(p.profit)}</td>
                      <td className="num">{fmtPct(p.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
