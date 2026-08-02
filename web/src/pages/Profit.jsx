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
