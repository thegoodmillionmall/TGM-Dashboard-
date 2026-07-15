import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading } from '../components/ui.jsx';

export default function Products() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [platform, setPlatform] = useState('All');
  const [mode, setMode] = useState('summary'); // summary | monthly
  const [metric, setMetric] = useState('orders'); // orders | rev
  const [data, setData] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function load() {
    setBusy(true); setError('');
    try {
      if (mode === 'summary') {
        setData(await apiGet('/dashboard/products', { start, end, platform }));
      } else {
        setMonthly(await apiGet('/dashboard/products-monthly', { start, end, platform }));
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [mode]);

  const filterRows = rows => rows.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  // ---------- ดาวน์โหลด CSV (มุมมองรายเดือน) ----------
  function exportCsv() {
    if (!monthly) return;
    const head = ['สินค้า', 'แพลตฟอร์ม',
      ...monthly.months.flatMap(m => [`${m} ออเดอร์`, `${m} ยอดขาย`]),
      'รวมออเดอร์', 'รวมยอดขาย', 'ต้นทุน', 'กำไร'];
    const lines = filterRows(monthly.rows).map(r => [
      '"' + r.name.replace(/"/g, '""') + '"', r.platform,
      ...monthly.months.flatMap(m => [r.months[m]?.orders || 0, r.months[m]?.rev || 0]),
      r.totalOrders, r.totalRev, r.totalCost, r.totalProfit
    ].join(','));
    const csv = '﻿' + [head.join(','), ...lines].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `TGM_products_monthly_${start}_${end}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="page-title">สินค้า</div>
      <div className="page-sub">ยอดขาย ออเดอร์ ต้นทุน และกำไรต่อสินค้า — ดูแบบสรุปช่วง หรือรายเดือน</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy}>
        <label>แพลตฟอร์ม
          <select value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="All">ทั้งหมด</option>
            <option value="TikTok">TikTok</option>
            <option value="Shopee">Shopee</option>
          </select>
        </label>
        <label>มุมมอง
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="summary">สรุปทั้งช่วง</option>
            <option value="monthly">รายเดือน</option>
          </select>
        </label>
        {mode === 'monthly' && (
          <label>ตัวเลขที่แสดง
            <select value={metric} onChange={e => setMetric(e.target.value)}>
              <option value="orders">ออเดอร์ (หน่วย)</option>
              <option value="rev">ยอดขาย (บาท)</option>
            </select>
          </label>
        )}
        <label>ค้นหา<input value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อสินค้า" /></label>
        {mode === 'monthly' && monthly && (
          <button className="btn btn-ghost" onClick={exportCsv}>⬇ ดาวน์โหลด CSV</button>
        )}
      </DateRange>
      <Alert type="error">{error}</Alert>

      {/* ---------- มุมมองสรุปทั้งช่วง ---------- */}
      {mode === 'summary' && (!data && !error ? <Loading /> : data && (
        <>
          <div className="kpis">
            <Kpi label="ยอดขายรวม" value={data.summary.revenue} tone="blue" />
            <Kpi label="ออเดอร์" value={data.summary.totalOrders} format="num" />
            <Kpi label="จำนวนสินค้า" value={data.summary.productCount} format="num" />
          </div>
          <div className="card table-scroll">
            <table className="data">
              <thead><tr>
                <th>#</th><th>สินค้า</th><th>แพลตฟอร์ม</th>
                <th className="num">ยอดขาย</th><th className="num">ออเดอร์</th>
                <th className="num">ต้นทุน</th><th className="num">กำไร</th><th className="num">Margin</th>
              </tr></thead>
              <tbody>
                {filterRows(data.topProducts || []).map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{p.name}</td>
                    <td>{p.platform}</td>
                    <td className="num">{fmtMoney(p.rev)}</td>
                    <td className="num">{fmt(p.orders)}</td>
                    <td className="num">{fmtMoney(p.cost)}</td>
                    <td className="num" style={{ color: p.profit >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(p.profit)}</td>
                    <td className="num">{fmtPct(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}

      {/* ---------- มุมมองรายเดือน ---------- */}
      {mode === 'monthly' && (!monthly && !error ? <Loading /> : monthly && (
        <div className="card table-scroll">
          <h3>{metric === 'orders' ? 'จำนวนออเดอร์ต่อเดือน' : 'ยอดขายต่อเดือน (บาท)'} — {fmt(filterRows(monthly.rows).length)} สินค้า</h3>
          <table className="data" style={{ fontSize: 12.5 }}>
            <thead><tr>
              <th>สินค้า</th><th>แพลตฟอร์ม</th>
              {monthly.months.map(m => {
                const [y, mo] = m.split('-');
                return <th key={m} className="num">{Number(mo)}/{y}</th>;
              })}
              <th className="num">รวม</th><th className="num">ต้นทุน</th><th className="num">กำไร</th>
            </tr></thead>
            <tbody>
              {filterRows(monthly.rows).map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{r.platform}</td>
                  {monthly.months.map(m => {
                    const cell = r.months[m];
                    const v = cell ? cell[metric] : 0;
                    return (
                      <td key={m} className="num" style={!v ? { color: '#c3ccd6' } : {}}>
                        {v ? (metric === 'rev' ? fmt(v, 0) : fmt(v)) : '-'}
                      </td>
                    );
                  })}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {metric === 'rev' ? fmt(r.totalRev, 0) : fmt(r.totalOrders)}
                  </td>
                  <td className="num">{fmt(r.totalCost, 0)}</td>
                  <td className="num" style={{ color: r.totalProfit >= 0 ? '#059669' : '#dc2626' }}>{fmt(r.totalProfit, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alert info" style={{ marginTop: 12 }}>
            "ออเดอร์" = จำนวนคำสั่งซื้อที่มีสินค้านี้ (จากไฟล์ Order ของแพลตฟอร์ม) — ใช้ปุ่มดาวน์โหลด CSV เพื่อเอาไปคำนวณต้นทุนต่อหน่วยใน Excel ได้เลย
          </div>
        </div>
      ))}
    </div>
  );
}
