import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';

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

  return (
    <div>
      <div className="page-title">กำไร</div>
      <div className="page-sub">กำไรสุทธิต่อแพลตฟอร์มและต่อสินค้า</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          <div className="kpis">
            <Kpi label="ยอดขายรวม" value={data.summary.revenue} tone="blue" />
            <Kpi label="กำไรสุทธิรวม" value={data.summary.netIncome} tone={data.summary.netIncome >= 0 ? 'green' : 'red'} />
            <Kpi label="Net Margin" value={data.summary.netMargin} format="pct" />
          </div>
          <div className="card table-scroll">
            <h3>กำไรต่อแพลตฟอร์ม</h3>
            <table className="data">
              <thead><tr>
                <th>แพลตฟอร์ม</th><th className="num">ยอดขาย</th><th className="num">หัก</th>
                <th className="num">โฆษณา</th><th className="num">COGS</th><th className="num">กำไรสุทธิ</th><th className="num">Margin</th>
              </tr></thead>
              <tbody>
                {data.byPlatform.map((r, i) => (
                  <tr key={i}>
                    <td>{r.platform}</td>
                    <td className="num">{fmtMoney(r.revenue)}</td>
                    <td className="num">{fmtMoney(r.deductions)}</td>
                    <td className="num">{fmtMoney(r.ads)}</td>
                    <td className="num">{fmtMoney(r.cogs)}</td>
                    <td className="num" style={{ color: r.netIncome >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(r.netIncome)}</td>
                    <td className="num">{fmtPct(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>เทียบกำไรต่อแพลตฟอร์ม</h3>
            <Bar data={{
              labels: data.byPlatform.map(r => r.platform),
              datasets: [
                { label: 'ยอดขาย', data: data.byPlatform.map(r => r.revenue), backgroundColor: '#2563eb' },
                { label: 'กำไรสุทธิ', data: data.byPlatform.map(r => r.netIncome), backgroundColor: '#059669' }
              ]
            }} />
          </div>
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
