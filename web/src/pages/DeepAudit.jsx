import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { DateRange, useDateRange, Alert, Loading } from '../components/ui.jsx';

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
          {p.gmvAudit?.daily && (
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <h3>รายวัน</h3>
              <table className="data">
                <thead><tr><th>วันที่</th><th className="num">Analytics GMV</th><th className="num">Order GMV</th><th className="num">ออเดอร์</th></tr></thead>
                <tbody>
                  {p.gmvAudit.daily.slice(0, 62).map((d, i) => (
                    <tr key={i}>
                      <td>{d.date}</td>
                      <td className="num">{fmtMoney(d.analyticsGmv ?? d.orderGmv ?? 0)}</td>
                      <td className="num">{fmtMoney(d.saleOrderGmv ?? d.orderGmv ?? 0)}</td>
                      <td className="num">{fmt(d.saleOrderOrders ?? d.orders ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
