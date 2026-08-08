import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';

function safeNum(value) {
  return Number(value || 0);
}

function buildPlatformBar(rows) {
  return {
    labels: rows.map(r => r.platform),
    datasets: [
      { label: 'ยอดขาย', data: rows.map(r => safeNum(r.revenue)), backgroundColor: '#7db9b9', borderRadius: 6 },
      { label: 'ค่าใช้จ่ายรวม', data: rows.map(r => safeNum(r.deductions) + safeNum(r.ads) + safeNum(r.cogs)), backgroundColor: '#f97316', borderRadius: 6 },
      { label: 'กำไรสุทธิ', data: rows.map(r => safeNum(r.netIncome)), backgroundColor: '#22c55e', borderRadius: 6 }
    ]
  };
}

function thMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

function buildMonthlyBar(rows) {
  return {
    labels: rows.map(r => thMonth(r.month)),
    datasets: [
      { label: 'TikTok GMV', data: rows.map(r => safeNum(r.ttRev)), backgroundColor: '#B2D8D8', stack: 'rev', borderRadius: 3 },
      { label: 'Shopee GMV', data: rows.map(r => safeNum(r.shRev)), backgroundColor: '#f97316', stack: 'rev', borderRadius: 3 },
      { label: 'MT GMV',     data: rows.map(r => safeNum(r.mtRev)), backgroundColor: '#8b5cf6', stack: 'rev', borderRadius: 3 },
      { label: 'ค่าธรรมเนียม', data: rows.map(r => -safeNum(r.deductions)), backgroundColor: '#fca5a5', stack: 'cost', borderRadius: 3 },
      { label: 'โฆษณา',     data: rows.map(r => -safeNum(r.ads)), backgroundColor: '#fb923c', stack: 'cost', borderRadius: 3 },
    ]
  };
}

function buildProductBar(products) {
  const top = products.slice(0, 10);
  return {
    labels: top.map(p => p.name.length > 34 ? p.name.slice(0, 32) + '...' : p.name),
    datasets: [{
      label: 'กำไร',
      data: top.map(p => safeNum(p.profit)),
      backgroundColor: top.map(p => safeNum(p.profit) >= 0 ? '#22c55ecc' : '#ef4444cc'),
      borderRadius: 6
    }]
  };
}

function PnlStep({ label, value, helper, tone = 'neutral', width = 0 }) {
  return (
    <div className={`profit-step ${tone}`}>
      <div>
        <span>{label}</span>
        <b>{fmtMoney(value)}</b>
        {helper ? <small>{helper}</small> : null}
      </div>
      <i><em style={{ width: `${Math.max(4, Math.min(100, width))}%` }} /></i>
    </div>
  );
}

function Stat({ label, value, sub, tone = '' }) {
  return (
    <div className={`profit-stat ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function Profit() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await apiGet('/dashboard/profit', { start, end }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const s = data?.summary || {};
  const byPlatform = data?.byPlatform || [];
  const topProfit = data?.topProfit || [];
  const lowMargin = data?.lowMargin || [];
  const monthlyRows = data?.monthlyRows || [];

  const totals = useMemo(() => {
    const revenue = safeNum(s.revenue);
    const deductions = safeNum(s.deductions);
    const ads = safeNum(s.ads);
    const cogs = safeNum(s.cogs);
    const expenses = deductions + ads + cogs;
    const net = safeNum(s.netIncome);
    const grossAfterFee = revenue - deductions;
    const afterAds = grossAfterFee - ads;
    const maxBase = Math.max(revenue, deductions, ads, cogs, Math.abs(net), 1);
    return { revenue, deductions, ads, cogs, expenses, net, grossAfterFee, afterAds, maxBase };
  }, [s]);

  return (
    <div className="profit-page">
      <div className="page-title">กำไร-ขาดทุน</div>
      <div className="page-sub">อ่านจากบนลงล่าง: ภาพรวมกำไรสุทธิ โครงสร้างค่าใช้จ่าย แพลตฟอร์ม และสินค้า</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {!data && !error ? <Loading /> : data && (
        <>
          <section className={`profit-hero ${totals.net < 0 ? 'loss' : ''}`}>
            <div className="profit-hero-main">
              <span>กำไรสุทธิช่วงที่เลือก</span>
              <h2>{fmtMoney(totals.net)}</h2>
              <p>{start} ถึง {end}</p>
            </div>
            <div className="profit-hero-stats">
              <Stat label="ยอดขายรวม" value={fmtMoney(totals.revenue)} />
              <Stat label="ค่าใช้จ่ายรวม" value={fmtMoney(totals.expenses)} tone="warn" sub="ค่าธรรมเนียม + แอด + COGS" />
              <Stat label="Net Margin" value={fmtPct(s.netMargin)} tone={totals.net >= 0 ? 'good' : 'bad'} />
              <Stat label="ROAS รวม" value={`${fmt(s.roas || 0, 2)}x`} tone="good" />
            </div>
          </section>

          <section className="profit-layout">
            <div className="card profit-flow-card">
              <h3>โครงสร้างกำไรแบบอ่านง่าย</h3>
              <div className="profit-flow">
                <PnlStep label="1. ยอดขายรวม" value={totals.revenue} helper="รายได้ก่อนหักค่าใช้จ่าย" tone="income" width={100} />
                <PnlStep label="2. หักค่าธรรมเนียมแพลตฟอร์ม" value={totals.deductions} helper={`เหลือ ${fmtMoney(totals.grossAfterFee)}`} tone="expense" width={(totals.deductions / totals.maxBase) * 100} />
                <PnlStep label="3. หักค่าโฆษณา" value={totals.ads} helper={`Ads / Revenue ${fmtPct(s.adsRate)}`} tone="expense" width={(totals.ads / totals.maxBase) * 100} />
                <PnlStep label="4. หักต้นทุนสินค้า (COGS)" value={totals.cogs} helper={`หลังแอด ${fmtMoney(totals.afterAds)}`} tone="expense" width={(totals.cogs / totals.maxBase) * 100} />
                <PnlStep label="5. กำไรสุทธิ" value={totals.net} helper={`Margin ${fmtPct(s.netMargin)}`} tone={totals.net >= 0 ? 'net' : 'loss'} width={(Math.abs(totals.net) / totals.maxBase) * 100} />
              </div>
            </div>

            <div className="card profit-read-card">
              <h3>จุดที่ควรดูทันที</h3>
              <div className="profit-read-list">
                <div>
                  <span>ถ้ายอดขายสูงแต่กำไรต่ำ</span>
                  <b>ตรวจค่าแอดและค่าธรรมเนียม</b>
                  <small>{fmtMoney(totals.ads + totals.deductions)}</small>
                </div>
                <div>
                  <span>ต้นทุนสินค้า</span>
                  <b>{fmtPct(totals.revenue ? (totals.cogs / totals.revenue) * 100 : 0)} ของยอดขาย</b>
                  <small>{fmtMoney(totals.cogs)}</small>
                </div>
                <div>
                  <span>กำไรหลังแอดก่อน COGS</span>
                  <b>{fmtMoney(totals.afterAds)}</b>
                  <small>ใช้ดูแรงกดจากโฆษณา</small>
                </div>
              </div>
            </div>
          </section>

          <section className="grid2">
            <div className="card profit-chart-card">
              <h3>ยอดขาย ค่าใช้จ่าย และกำไรต่อแพลตฟอร์ม</h3>
              <Bar
                data={buildPlatformBar(byPlatform)}
                options={{
                  maintainAspectRatio: false,
                  plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } } } },
                  scales: {
                    y: { ticks: { callback: v => fmtMoney(v).replace('.00', '') }, grid: { color: 'rgba(0,0,0,0.06)' } },
                    x: { grid: { display: false } }
                  }
                }}
              />
            </div>
            <div className="card table-scroll">
              <h3>สรุปตามแพลตฟอร์ม</h3>
              <table className="data profit-platform-table">
                <thead><tr>
                  <th>แพลตฟอร์ม</th>
                  <th className="num">ยอดขาย</th>
                  <th className="num">หักรวม</th>
                  <th className="num">กำไรสุทธิ</th>
                  <th className="num">Margin</th>
                </tr></thead>
                <tbody>
                  {byPlatform.map((r, i) => {
                    const expense = safeNum(r.deductions) + safeNum(r.ads) + safeNum(r.cogs);
                    return (
                      <tr key={i}>
                        <td><b>{r.platform}</b><small>Ads {fmtMoney(r.ads)} | COGS {fmtMoney(r.cogs)}</small></td>
                        <td className="num">{fmtMoney(r.revenue)}</td>
                        <td className="num warn">{fmtMoney(expense)}</td>
                        <td className={`num ${safeNum(r.netIncome) >= 0 ? 'good' : 'bad'}`}>{fmtMoney(r.netIncome)}</td>
                        <td className="num">{fmtPct(r.margin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Monthly breakdown ── */}
          {monthlyRows.length > 0 && (() => {
            const totalRev = totals.revenue || 1;
            const totalCogs = totals.cogs;
            const rows = monthlyRows.map(r => {
              const rev = safeNum(r.rev);
              const fees = safeNum(r.deductions);
              const ads = safeNum(r.ads);
              const cogs = Math.round(rev / totalRev * totalCogs);
              const net = rev - fees - ads - cogs;
              const margin = rev > 0 ? (net / rev) * 100 : 0;
              return { ...r, rev, fees, ads, cogs, net, margin };
            });
            return (
              <section style={{ marginBottom: 20 }}>
                <div className="card" style={{ padding: '18px 20px 14px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--grey)' }}>📅 สรุปรายเดือน — GMV หักต้นทุน</h3>

                  {/* Bar chart */}
                  <div style={{ height: 260, marginBottom: 20 }}>
                    <Bar
                      data={buildMonthlyBar(rows)}
                      options={{
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } }, position: 'bottom' } },
                        scales: {
                          x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Kanit', size: 11 } } },
                          y: { stacked: false, ticks: { callback: v => (v < 0 ? '-' : '') + fmtMoney(Math.abs(v)).replace('.00',''), font: { family: 'Kanit', size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } }
                        }
                      }}
                    />
                  </div>

                  {/* Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>เดือน</th>
                          <th className="num">GMV รวม</th>
                          <th className="num" style={{ color: '#7DB9B9' }}>TikTok</th>
                          <th className="num" style={{ color: '#f97316' }}>Shopee</th>
                          <th className="num" style={{ color: '#8b5cf6' }}>MT</th>
                          <th className="num warn">ค่าธรรมเนียม</th>
                          <th className="num warn">โฆษณา</th>
                          <th className="num warn">COGS*</th>
                          <th className="num">กำไรสุทธิ*</th>
                          <th className="num">Margin*</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.month} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                            <td><b>{thMonth(r.month)}</b></td>
                            <td className="num">{fmtMoney(r.rev)}</td>
                            <td className="num" style={{ color: '#7DB9B9', fontSize: 11 }}>{fmtMoney(r.ttRev)}</td>
                            <td className="num" style={{ color: '#f97316', fontSize: 11 }}>{fmtMoney(r.shRev)}</td>
                            <td className="num" style={{ color: '#8b5cf6', fontSize: 11 }}>{fmtMoney(r.mtRev)}</td>
                            <td className="num warn">{fmtMoney(r.fees)}</td>
                            <td className="num warn">{fmtMoney(r.ads)}</td>
                            <td className="num warn">{fmtMoney(r.cogs)}</td>
                            <td className={`num ${r.net >= 0 ? 'good' : 'bad'}`}><b>{fmtMoney(r.net)}</b></td>
                            <td className={`num ${r.margin >= 0 ? 'good' : 'bad'}`}>{fmtPct(r.margin)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#1a2a3a', fontWeight: 700 }}>
                          <td style={{ color: '#B2D8D8' }}>รวม</td>
                          <td className="num" style={{ color: '#e2e8f0' }}>{fmtMoney(rows.reduce((s, r) => s + r.rev, 0))}</td>
                          <td className="num" style={{ color: '#7DB9B9', fontSize: 11 }}>{fmtMoney(rows.reduce((s, r) => s + r.ttRev, 0))}</td>
                          <td className="num" style={{ color: '#f97316', fontSize: 11 }}>{fmtMoney(rows.reduce((s, r) => s + r.shRev, 0))}</td>
                          <td className="num" style={{ color: '#8b5cf6', fontSize: 11 }}>{fmtMoney(rows.reduce((s, r) => s + r.mtRev, 0))}</td>
                          <td className="num" style={{ color: '#fca5a5' }}>{fmtMoney(rows.reduce((s, r) => s + r.fees, 0))}</td>
                          <td className="num" style={{ color: '#fb923c' }}>{fmtMoney(rows.reduce((s, r) => s + r.ads, 0))}</td>
                          <td className="num" style={{ color: '#fca5a5' }}>{fmtMoney(rows.reduce((s, r) => s + r.cogs, 0))}</td>
                          <td className="num" style={{ color: '#86efac' }}><b>{fmtMoney(rows.reduce((s, r) => s + r.net, 0))}</b></td>
                          <td className="num" style={{ color: '#86efac' }}>{fmtPct(rows.reduce((s,r)=>s+r.rev,0) > 0 ? (rows.reduce((s,r)=>s+r.net,0) / rows.reduce((s,r)=>s+r.rev,0)) * 100 : 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                      * COGS และกำไรสุทธิรายเดือนเป็นค่าประมาณ (สัดส่วนยอดขาย × COGS รวม) — ตัวเลขรวมทั้งปีถูกต้อง
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {topProfit.length > 0 && (
            <section className="grid2">
              <div className="card profit-chart-card">
                <h3>สินค้า 10 อันดับกำไรสูงสุด</h3>
                <Bar
                  data={buildProductBar(topProfit)}
                  options={{
                    indexAxis: 'y',
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { ticks: { callback: v => fmtMoney(v).replace('.00', '') }, grid: { color: 'rgba(0,0,0,0.06)' } },
                      y: { ticks: { font: { family: 'Kanit', size: 11 } }, grid: { display: false } }
                    }
                  }}
                />
              </div>
              <div className="card table-scroll">
                <h3>สินค้าที่ Margin ต่ำ ควรตรวจ</h3>
                <table className="data">
                  <thead><tr><th>สินค้า</th><th className="num">ยอดขาย</th><th className="num">กำไร</th><th className="num">Margin</th></tr></thead>
                  <tbody>
                    {lowMargin.slice(0, 12).map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td className="num">{fmtMoney(p.revenue)}</td>
                        <td className={`num ${safeNum(p.profit) >= 0 ? 'good' : 'bad'}`}>{fmtMoney(p.profit)}</td>
                        <td className="num">{fmtPct(p.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
