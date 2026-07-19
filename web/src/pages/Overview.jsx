import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmtPct, fmt } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar, Line, Doughnut } from '../components/ui.jsx';
import { useAuditModal, FinanceFlow, MonthlyChangePanel, DailyTable } from '../components/dashparts.jsx';

export default function Overview() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { showAudit, modal } = useAuditModal(data);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/dashboard', { start, end, platform: 'All' })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary || {};
  const a = data?.audit;
  const p = data?.platformBreakdown || {};
  const tt = data?.ttBreakdown || {};
  const sh = data?.shBreakdown || {};
  const mt = data?.mtBreakdown || {};
  const ttOrganic = Math.max((p.tiktok || 0) - (tt.affiliate || 0) - (tt.ads || 0) - (tt.adsLive || 0) - (tt.live || 0), 0);
  const shOrganic = Math.max((p.shopee || 0) - (sh.ads || 0) - (sh.affiliate || 0), 0);

  const platformRows = a ? [
    { name: 'TikTok Shop', rev: p.tiktok, deduct: a.deduct.ttFees + a.deduct.ttAff, ads: a.ads.ttManager + a.ads.ttGmv + a.ads.ttLive },
    { name: 'Shopee', rev: p.shopee, deduct: a.deduct.shFees + a.deduct.shAff, ads: a.ads.shAds + a.ads.shLive },
    { name: 'Modern Trade', rev: p.modernTrade, deduct: a.deduct.mtGp, ads: 0 },
    { name: 'Meta Ads (ส่วนกลาง)', rev: 0, deduct: 0, ads: a.ads.meta }
  ].map(r => ({ ...r, profit: r.rev - r.deduct - r.ads, share: s.revenue > 0 ? (r.rev / s.revenue) * 100 : 0 })) : [];

  return (
    <div>
      <div className="page-title">ภาพรวมธุรกิจ</div>
      <div className="page-sub">รวมทุกแพลตฟอร์ม (ข้อมูลจาก Supabase)</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          <FinanceFlow summary={s} onAudit={showAudit} />

          <div className="kpis">
            <Kpi label="จำนวนออเดอร์รวม" value={s.totalOrders} format="num" />
            <Kpi label="อัตราการยกเลิกรวม" value={s.cancelRate} format="pct" tone="red" />
            <Kpi label="ROAS ภาพรวม" value={s.roas} format="x" tone="green" />
            <Kpi label="Net Margin" value={s.netMargin} format="pct" />
            <Kpi label="AOV" value={s.aov} />
            <Kpi label="รายรับ Manual" value={s.manualIncome} tone="blue" />
            <Kpi label="รายจ่าย Manual" value={s.manualExpense} tone="red" />
          </div>

          <div className="card table-scroll">
            <h3>สรุปสัดส่วนยอดขายรายช่องทาง</h3>
            <table className="data">
              <thead><tr>
                <th>ช่องทาง (Platform)</th><th className="num">ยอดขาย</th><th className="num">หักแพลตฟอร์ม</th>
                <th className="num">ค่าโฆษณา</th><th className="num">กำไรขั้นต้น</th><th className="num">สัดส่วน (%)</th>
              </tr></thead>
              <tbody>
                {platformRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="num">{fmtMoney(r.rev)}</td>
                    <td className="num">{fmtMoney(r.deduct)}</td>
                    <td className="num">{fmtMoney(r.ads)}</td>
                    <td className="num" style={{ color: r.profit >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(r.profit)}</td>
                    <td className="num">{fmtPct(r.share)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td>รวม</td>
                  <td className="num">{fmtMoney(s.revenue)}</td>
                  <td className="num">{fmtMoney(s.deductions)}</td>
                  <td className="num">{fmtMoney(s.ads)}</td>
                  <td className="num">{fmtMoney(s.profit)}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pie-grid">
            <div className="pie-card">
              <h4>สัดส่วนยอดขายตามช่องทาง</h4>
              <Doughnut data={{
                labels: ['TikTok', 'Shopee', 'Modern Trade'],
                datasets: [{ data: [p.tiktok, p.shopee, p.modernTrade], backgroundColor: ['#111827', '#f4511e', '#059669'] }]
              }} />
            </div>
            <div className="pie-card">
              <h4>สัดส่วน Modern Trade</h4>
              <Doughnut data={{
                labels: Object.keys(mt),
                datasets: [{ data: Object.values(mt), backgroundColor: ['#7c3aed', '#0ea5e9', '#f59e0b', '#6b7280'] }]
              }} />
            </div>
            <div className="pie-card">
              <h4>สัดส่วน Shopee (Ads vs Organic)</h4>
              <Doughnut data={{
                labels: ['Ads', 'Affiliate', 'Organic'],
                datasets: [{ data: [sh.ads, sh.affiliate, shOrganic], backgroundColor: ['#f4511e', '#fb923c', '#fed7aa'] }]
              }} />
            </div>
            <div className="pie-card">
              <h4>สัดส่วนแหล่งที่มา TikTok</h4>
              <Doughnut data={{
                labels: ['Live', 'Affiliate', 'Ads', 'Ads Live', 'Organic/อื่นๆ'],
                datasets: [{ data: [tt.live, tt.affiliate, tt.ads, tt.adsLive, ttOrganic], backgroundColor: ['#111827', '#4b5563', '#2563eb', '#7c3aed', '#d1d5db'] }]
              }} />
            </div>
          </div>

          <MonthlyChangePanel charts={data.charts} />

          <div className="card">
            <h3>ยอดขายรายเดือน แยกแพลตฟอร์ม + ค่าโฆษณา</h3>
            <Bar data={{
              labels: data.charts.labels,
              datasets: [
                { label: 'TikTok', data: data.charts.ttRev, backgroundColor: '#1a2a3a', stack: 'rev' },
                { label: 'Shopee', data: data.charts.shRev, backgroundColor: '#f4511e', stack: 'rev' },
                { label: 'Modern Trade', data: data.charts.mtRev, backgroundColor: '#059669', stack: 'rev' },
                { label: 'Ads', data: data.charts.ads, backgroundColor: 'rgba(220,38,38,0.7)', stack: 'ads' }
              ]
            }} options={{
              interaction: { mode: 'index', intersect: false },
              plugins: {
                tooltip: {
                  callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ฿${Number(ctx.parsed.y).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
                    footer: items => {
                      const total = items.filter(i => i.dataset.stack === 'rev').reduce((s, i) => s + i.parsed.y, 0);
                      return total ? `รวม GMV: ฿${total.toLocaleString('th-TH', { maximumFractionDigits: 0 })}` : '';
                    }
                  }
                },
                datalabels: false
              },
              scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: v => '฿' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { size: 11 } } }
              }
            }} />
          </div>

          <div className="card">
            <h3>ยอดขายรายวัน แยกแพลตฟอร์ม</h3>
            <Line data={{
              labels: data.dailyCharts.labels,
              datasets: [
                { label: 'TikTok', data: data.dailyCharts.ttRev, borderColor: '#1a2a3a', backgroundColor: 'rgba(26,42,58,0.08)', tension: 0.3, pointRadius: 2, pointHoverRadius: 6, fill: true },
                { label: 'Shopee', data: data.dailyCharts.shRev, borderColor: '#f4511e', backgroundColor: 'rgba(244,81,30,0.06)', tension: 0.3, pointRadius: 2, pointHoverRadius: 6, fill: true },
                { label: 'Modern Trade', data: data.dailyCharts.mtRev, borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.06)', tension: 0.3, pointRadius: 2, pointHoverRadius: 6, fill: true }
              ]
            }} options={{
              interaction: { mode: 'index', intersect: false },
              plugins: {
                tooltip: {
                  callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ฿${Number(ctx.parsed.y).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
                    footer: items => {
                      const total = items.reduce((s, i) => s + i.parsed.y, 0);
                      return `รวม: ฿${total.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
                    }
                  }
                }
              },
              scales: {
                x: { ticks: { maxTicksLimit: 15, font: { size: 11 } } },
                y: { ticks: { callback: v => '฿' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { size: 11 } } }
              }
            }} />
          </div>

          <div className="card">
            <h3>ค่าโฆษณารายวัน</h3>
            <Line data={{
              labels: data.dailyCharts.labels,
              datasets: [{ label: 'Ads', data: data.dailyCharts.ads, borderColor: '#dc2626', backgroundColor: '#dc2626' }]
            }} />
          </div>

          <DailyTable rows={data.table} />
          {modal}
        </>
      )}
    </div>
  );
}
