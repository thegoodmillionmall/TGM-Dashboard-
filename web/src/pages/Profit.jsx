import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, fmtMoney, fmt, fmtPct } from '../api.js';
import { DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';

const n = v => Number(v || 0);

function thMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}
function thMonthShort(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

function KpiCard({ label, value, sub, color = 'var(--acc)', onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? '#1a2a3a' : '#fff',
      border: active ? '2px solid var(--mint)' : '1px solid var(--border)',
      borderRadius: 12, padding: '14px 18px', cursor: onClick ? 'pointer' : 'default',
      transition: 'all .15s'
    }}>
      <div style={{ fontSize: 11, color: active ? '#7DB9B9' : 'var(--grey-light)', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: active ? '#fff' : color, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: active ? '#94a3b8' : 'var(--grey-light)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function WaterfallRow({ step, label, value, helper, tone, pct }) {
  const colors = { income: '#10b981', expense: '#f97316', net: '#10b981', loss: '#ef4444', neutral: '#64748b' };
  const col = colors[tone] || '#64748b';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, background: col + '20', color: col, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step}</div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--grey-light)', fontWeight: 600 }}>{label}</div>
        {helper && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{helper}</div>}
        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 99, background: col, width: `${Math.max(2, Math.min(100, pct || 0))}%`, transition: 'width .4s' }} />
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: col, textAlign: 'right', minWidth: 130 }}>{fmtMoney(value)}</div>
    </div>
  );
}

export default function Profit() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data,  setData]  = useState(null);
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [filterMonth, setFilterMonth] = useState(null); // '2026-01' | null

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/dashboard/profit', { start, end })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const s            = data?.summary || {};
  const byPlatform   = data?.byPlatform || [];
  const topProfit    = data?.topProfit || [];
  const monthlyRows  = data?.monthlyRows || [];

  const totals = useMemo(() => {
    const revenue  = n(s.revenue);
    const deductions = n(s.deductions);
    const ads      = n(s.ads);
    const cogs     = n(s.cogs);
    const net      = n(s.netIncome);
    const maxBase  = Math.max(revenue, 1);
    return { revenue, deductions, ads, cogs, net, maxBase, grossAfterFee: revenue - deductions, afterAds: revenue - deductions - ads };
  }, [s]);

  // monthly rows with estimated COGS
  const monthly = useMemo(() => monthlyRows.map(r => {
    const rev  = n(r.rev);
    const fees = n(r.deductions);
    const ads  = n(r.ads);
    const cogs = totals.revenue > 0 ? Math.round(rev / totals.revenue * totals.cogs) : 0;
    const net  = rev - fees - ads - cogs;
    return { ...r, rev, fees, ads, cogs, net, margin: rev > 0 ? (net / rev) * 100 : 0 };
  }), [monthlyRows, totals]);

  const shownMonthly = filterMonth ? monthly.filter(r => r.month === filterMonth) : monthly;

  // bar chart
  const barData = {
    labels: monthly.map(r => thMonthShort(r.month)),
    datasets: [
      { label: 'TikTok GMV',     data: monthly.map(r => n(r.ttRev)), backgroundColor: '#7DB9B9', stack: 'rev', borderRadius: 3 },
      { label: 'Shopee GMV',     data: monthly.map(r => n(r.shRev)), backgroundColor: '#f97316', stack: 'rev', borderRadius: 3 },
      { label: 'MT GMV',         data: monthly.map(r => n(r.mtRev)), backgroundColor: '#8b5cf6', stack: 'rev', borderRadius: 3 },
      { label: 'ค่าธรรมเนียม',  data: monthly.map(r => -r.fees),  backgroundColor: '#fda4af', stack: 'cost', borderRadius: 3 },
      { label: 'โฆษณา',          data: monthly.map(r => -r.ads),   backgroundColor: '#fb923c', stack: 'cost', borderRadius: 3 },
      { label: 'COGS (est.)',    data: monthly.map(r => -r.cogs),  backgroundColor: '#a78bfa', stack: 'cost', borderRadius: 3 },
    ]
  };
  const barOpts = {
    maintainAspectRatio: false,
    onClick: (_, els) => {
      if (!els.length) { setFilterMonth(null); return; }
      const idx = els[0].index;
      const m = monthly[idx]?.month;
      setFilterMonth(prev => prev === m ? null : m);
    },
    plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } }, position: 'bottom' },
               tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtMoney(Math.abs(ctx.raw)) } } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Kanit', size: 11 } } },
      y: { stacked: false,
           ticks: { callback: v => (v < 0 ? '-' : '') + fmtMoney(Math.abs(v)).replace('.00','').replace(/,000$/, 'K'),
                    font: { family: 'Kanit', size: 10 } },
           grid: { color: 'rgba(0,0,0,0.05)' } }
    }
  };

  const sumRow = arr => ({
    rev: arr.reduce((s,r) => s+r.rev, 0), fees: arr.reduce((s,r) => s+r.fees, 0),
    ads: arr.reduce((s,r) => s+r.ads, 0), cogs: arr.reduce((s,r) => s+r.cogs, 0),
    net: arr.reduce((s,r) => s+r.net, 0),
    ttRev: arr.reduce((s,r) => s+n(r.ttRev), 0), shRev: arr.reduce((s,r) => s+n(r.shRev), 0), mtRev: arr.reduce((s,r) => s+n(r.mtRev), 0)
  });
  const total = sumRow(monthly);

  if (!data && !error) return <Loading />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-title">กำไร-ขาดทุน</div>
      <div className="page-sub">GMV รายเดือน → หักค่าธรรมเนียม → หักโฆษณา → หัก COGS → กำไรสุทธิ</div>

      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {data && <>
        {/* ── KPI Hero ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <KpiCard label="กำไรสุทธิ" value={fmtMoney(totals.net)}
            color={totals.net >= 0 ? '#10b981' : '#ef4444'}
            sub={`Margin ${fmtPct(s.netMargin)}`} />
          <KpiCard label="ยอดขายรวม" value={fmtMoney(totals.revenue)} sub={`${monthly.length} เดือน`} />
          <KpiCard label="ค่าธรรมเนียม" value={fmtMoney(totals.deductions)}
            color="#f97316" sub={`${fmtPct(totals.revenue ? totals.deductions/totals.revenue*100:0)} ของยอดขาย`} />
          <KpiCard label="ค่าโฆษณา" value={fmtMoney(totals.ads)}
            color="#f97316" sub={`ROAS ${fmt(s.roas||0,2)}x`} />
          <KpiCard label="ต้นทุนสินค้า (COGS)" value={fmtMoney(totals.cogs)}
            color="#8b5cf6" sub={`${fmtPct(totals.revenue ? totals.cogs/totals.revenue*100:0)} ของยอดขาย`} />
        </div>

        {/* ── Monthly Chart + Table ── */}
        <div className="card" style={{ padding: '20px 20px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>สรุปรายเดือน</div>
              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginTop: 2 }}>
                คลิกที่แท่งกราฟเพื่อดูรายละเอียดเฉพาะเดือน
              </div>
            </div>
            {filterMonth && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFilterMonth(null)}>
                ✕ {thMonth(filterMonth)} — ดูทั้งหมด
              </button>
            )}
          </div>

          {/* Bar chart */}
          <div style={{ height: 280, marginBottom: 20 }}>
            <Bar data={barData} options={barOpts} />
          </div>

          {/* Monthly table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="num">GMV รวม</th>
                  <th className="num" style={{ color: '#7DB9B9' }}>TikTok</th>
                  <th className="num" style={{ color: '#f97316' }}>Shopee</th>
                  <th className="num" style={{ color: '#8b5cf6' }}>MT</th>
                  <th className="num" style={{ color: '#fda4af' }}>ค่าธรรมเนียม</th>
                  <th className="num" style={{ color: '#fb923c' }}>โฆษณา</th>
                  <th className="num" style={{ color: '#a78bfa' }}>COGS*</th>
                  <th className="num">กำไรสุทธิ*</th>
                  <th className="num">Margin*</th>
                </tr>
              </thead>
              <tbody>
                {shownMonthly.map((r, i) => (
                  <tr key={r.month}
                    style={{ background: filterMonth === r.month ? '#f0fdf4' : i%2 ? '#f8fafc' : '#fff',
                             cursor: 'pointer', outline: filterMonth === r.month ? '2px solid #10b981' : 'none' }}
                    onClick={() => setFilterMonth(prev => prev === r.month ? null : r.month)}>
                    <td style={{ fontWeight: 600 }}>{thMonth(r.month)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(r.rev)}</td>
                    <td className="num" style={{ color: '#7DB9B9', fontSize: 11 }}>{fmtMoney(r.ttRev)}</td>
                    <td className="num" style={{ color: '#f97316', fontSize: 11 }}>{fmtMoney(r.shRev)}</td>
                    <td className="num" style={{ color: '#8b5cf6', fontSize: 11 }}>{fmtMoney(r.mtRev)}</td>
                    <td className="num" style={{ color: '#fda4af' }}>{fmtMoney(r.fees)}</td>
                    <td className="num" style={{ color: '#fb923c' }}>{fmtMoney(r.ads)}</td>
                    <td className="num" style={{ color: '#a78bfa' }}>{fmtMoney(r.cogs)}</td>
                    <td className={`num ${r.net>=0?'good':'bad'}`}><b>{fmtMoney(r.net)}</b></td>
                    <td className={`num ${r.margin>=0?'good':'bad'}`}>{fmtPct(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
              {!filterMonth && (
                <tfoot>
                  <tr style={{ background: '#1a2a3a' }}>
                    <td style={{ color: '#B2D8D8', fontWeight: 700, padding: '8px 12px' }}>รวมทั้งหมด</td>
                    <td className="num" style={{ color: '#e2e8f0', fontWeight: 700 }}>{fmtMoney(total.rev)}</td>
                    <td className="num" style={{ color: '#7DB9B9', fontSize: 11 }}>{fmtMoney(total.ttRev)}</td>
                    <td className="num" style={{ color: '#f97316', fontSize: 11 }}>{fmtMoney(total.shRev)}</td>
                    <td className="num" style={{ color: '#8b5cf6', fontSize: 11 }}>{fmtMoney(total.mtRev)}</td>
                    <td className="num" style={{ color: '#fda4af' }}>{fmtMoney(total.fees)}</td>
                    <td className="num" style={{ color: '#fb923c' }}>{fmtMoney(total.ads)}</td>
                    <td className="num" style={{ color: '#a78bfa' }}>{fmtMoney(total.cogs)}</td>
                    <td className="num" style={{ color: '#86efac', fontWeight: 800 }}>{fmtMoney(total.net)}</td>
                    <td className="num" style={{ color: '#86efac' }}>{fmtPct(total.rev>0?(total.net/total.rev)*100:0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              * COGS และกำไรสุทธิรายเดือนเป็นค่าประมาณ (สัดส่วนยอดขาย × COGS รวม) — ยอดรวมทั้งช่วงถูกต้อง
            </div>
          </div>
        </div>

        {/* ── Waterfall + Platform ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Waterfall */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>โครงสร้างกำไร</div>
            <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 16 }}>ภาพรวมช่วงที่เลือกทั้งหมด</div>
            <WaterfallRow step="1" label="ยอดขายรวม" value={totals.revenue}
              tone="income" pct={100} />
            <WaterfallRow step="2" label="หักค่าธรรมเนียมแพลตฟอร์ม"
              helper={`เหลือ ${fmtMoney(totals.grossAfterFee)}`}
              value={totals.deductions} tone="expense"
              pct={totals.deductions/totals.maxBase*100} />
            <WaterfallRow step="3" label="หักค่าโฆษณา"
              helper={`Ads/Revenue ${fmtPct(s.adsRate)}`}
              value={totals.ads} tone="expense"
              pct={totals.ads/totals.maxBase*100} />
            <WaterfallRow step="4" label="หักต้นทุนสินค้า (COGS)"
              helper={`หลังแอด ${fmtMoney(totals.afterAds)}`}
              value={totals.cogs} tone="expense"
              pct={totals.cogs/totals.maxBase*100} />
            <WaterfallRow step="5" label="กำไรสุทธิ"
              helper={`Margin ${fmtPct(s.netMargin)}`}
              value={totals.net} tone={totals.net>=0?'net':'loss'}
              pct={Math.abs(totals.net)/totals.maxBase*100} />
          </div>

          {/* Platform breakdown */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>แยกตามแพลตฟอร์ม</div>
            <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 16 }}>ยอดขาย / ค่าใช้จ่าย / กำไร</div>
            <table className="data" style={{ fontSize: 12 }}>
              <thead><tr>
                <th>แพลตฟอร์ม</th>
                <th className="num">ยอดขาย</th>
                <th className="num">หักรวม</th>
                <th className="num">กำไรสุทธิ</th>
                <th className="num">Margin</th>
              </tr></thead>
              <tbody>
                {byPlatform.map((r, i) => {
                  const exp = n(r.deductions) + n(r.ads) + n(r.cogs);
                  return (
                    <tr key={i} style={{ background: i%2?'#f8fafc':'#fff' }}>
                      <td>
                        <b style={{ color: 'var(--acc)', display: 'block' }}>{r.platform}</b>
                        <span style={{ fontSize: 10, color: 'var(--grey-light)' }}>Ads {fmtMoney(r.ads)} · COGS {fmtMoney(r.cogs)}</span>
                      </td>
                      <td className="num">{fmtMoney(r.revenue)}</td>
                      <td className="num" style={{ color: '#f97316' }}>{fmtMoney(exp)}</td>
                      <td className={`num ${n(r.netIncome)>=0?'good':'bad'}`}><b>{fmtMoney(r.netIncome)}</b></td>
                      <td className="num">{fmtPct(r.margin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Top products ── */}
        {topProfit.length > 0 && (
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>สินค้า Margin ต่ำ — ควรตรวจ</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data" style={{ fontSize: 12 }}>
                <thead><tr>
                  <th>สินค้า</th>
                  <th className="num">ยอดขาย</th>
                  <th className="num">กำไร</th>
                  <th className="num">Margin</th>
                </tr></thead>
                <tbody>
                  {(data?.lowMargin||[]).slice(0,10).map((p,i) => (
                    <tr key={i} style={{ background: i%2?'#f8fafc':'#fff' }}>
                      <td style={{ maxWidth: 380, fontSize: 11, lineHeight: 1.4 }}>{p.name}</td>
                      <td className="num">{fmtMoney(p.revenue)}</td>
                      <td className={`num ${n(p.profit)>=0?'good':'bad'}`}>{fmtMoney(p.profit)}</td>
                      <td className="num">{fmtPct(p.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}
