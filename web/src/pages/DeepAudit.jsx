import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { DateRange, useDateRange, Alert, Loading, Line } from '../components/ui.jsx';

export default function DeepAudit() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [platform, setPlatform] = useState('All');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/dashboard/deep-audit', { start, end, platform })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-title">ตรวจสอบแพลตฟอร์ม (Deep Audit)</div>
      <div className="page-sub">เทียบ GMV จากหลายแหล่งข้อมูลและสถานะชั้นข้อมูล</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy}>
        <label>แพลตฟอร์ม
          <select value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="All">ทั้งหมด</option>
            <option value="TikTok">TikTok</option>
            <option value="Shopee">Shopee</option>
          </select>
        </label>
      </DateRange>
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (data.platforms || []).map(p => (
        <div key={p.key} className="card">
          <h3 style={{ color: p.color }}>{p.label}</h3>
          <div className="kpis">
            <div className="kpi blue"><div className="label">ยอดขาย</div><div className="value">{fmtMoney(p.revenue)}</div></div>
            <div className="kpi"><div className="label">ออเดอร์</div><div className="value">{fmt(p.orders)}</div></div>
            <div className="kpi red"><div className="label">ค่าธรรมเนียม</div><div className="value">{fmtMoney(p.platformFee)}</div></div>
            <div className="kpi red"><div className="label">ค่าโฆษณา</div><div className="value">{fmtMoney(p.adsCost)}</div></div>
            <div className="kpi green"><div className="label">กำไรขั้นต้น</div><div className="value">{fmtMoney(p.grossProfit)}</div></div>
            <div className="kpi"><div className="label">ROAS</div><div className="value">{fmt(p.roas, 2)}x</div></div>
            <div className="kpi"><div className="label">Net Margin</div><div className="value">{fmtPct(p.netMargin)}</div></div>
          </div>
          <div className="grid2">
            <div>
              <h3>แหล่งที่มาของยอด</h3>
              <table className="data">
                <thead><tr><th>แหล่ง</th><th className="num">มูลค่า</th><th className="num">%</th><th>หมายเหตุ</th></tr></thead>
                <tbody>
                  {(p.sources || []).map((sx, i) => (
                    <tr key={i}>
                      <td>{sx.label}</td>
                      <td className="num">{fmtMoney(sx.value)}</td>
                      <td className="num">{fmtPct(sx.pct)}</td>
                      <td style={{ color: '#6b7280', fontSize: 12 }}>{sx.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3>ชั้นข้อมูล</h3>
              <table className="data">
                <thead><tr><th>ชั้น</th><th>Source</th><th className="num">แถว</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {(p.layers || []).map((l, i) => (
                    <tr key={i}>
                      <td>{l.name}</td>
                      <td>{l.sheet}</td>
                      <td className="num">{fmt(l.rows)}</td>
                      <td><span className={'badge ' + (l.status === 'READY' ? 'ok' : l.status === 'PENDING' ? 'warn' : 'err')}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {p.gmvAudit?.daily && (() => {
            const days = p.gmvAudit.daily.slice(0, 62);
            const lineData = {
              labels: days.map(d => d.date),
              datasets: [
                {
                  label: 'Analytics GMV',
                  data: days.map(d => d.analyticsGmv ?? d.orderGmv ?? 0),
                  borderColor: p.color || '#B2D8D8',
                  backgroundColor: (p.color || '#B2D8D8') + '22',
                  fill: true, tension: 0.3, pointRadius: 1, borderWidth: 1.5,
                },
                {
                  label: 'Order GMV',
                  data: days.map(d => d.saleOrderGmv ?? d.orderGmv ?? 0),
                  borderColor: '#6699ff',
                  borderDash: [4, 3],
                  fill: false, tension: 0.3, pointRadius: 1, borderWidth: 2,
                },
              ]
            };
            return (
              <>
                <div style={{ marginTop: 12 }}>
                  <h3>GMV รายวัน — Analytics vs Order</h3>
                  <Line
                    data={lineData}
                    options={{
                      plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } } } },
                      scales: {
                        x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } },
                        y: { ticks: { callback: v => (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(0,0,0,0.06)' } }
                      }
                    }}
                  />
                </div>
                <div className="table-scroll" style={{ marginTop: 12 }}>
                  <h3>ตารางรายวัน</h3>
                  <table className="data">
                    <thead><tr><th>วันที่</th><th className="num">Analytics GMV</th><th className="num">Order GMV</th><th className="num">ส่วนต่าง</th><th className="num">ออเดอร์</th></tr></thead>
                    <tbody>
                      {days.map((d, i) => {
                        const anal = d.analyticsGmv ?? d.orderGmv ?? 0;
                        const ord  = d.saleOrderGmv ?? d.orderGmv ?? 0;
                        const diff = anal - ord;
                        return (
                          <tr key={i}>
                            <td>{d.date}</td>
                            <td className="num">{fmtMoney(anal)}</td>
                            <td className="num">{fmtMoney(ord)}</td>
                            <td className="num" style={{ color: Math.abs(diff) > 1000 ? '#dc2626' : '#6b7280' }}>
                              {diff !== 0 ? (diff > 0 ? '+' : '') + fmtMoney(diff) : '—'}
                            </td>
                            <td className="num">{fmt(d.saleOrderOrders ?? d.orders ?? 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
