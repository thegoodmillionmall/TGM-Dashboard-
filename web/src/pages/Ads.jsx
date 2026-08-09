import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar, Line, Doughnut } from '../components/ui.jsx';
import ChartDataLabels from 'chartjs-plugin-datalabels';

const CHANNELS = [
  { key: 'ttManager', label: 'TT Ads Manager',  color: '#7DB9B9', gmvKey: null,    icon: '🎯' },
  { key: 'ttGmv',    label: 'TikTok GMV Max',   color: '#B2D8D8', gmvKey: 'ttGmv', icon: '📈' },
  { key: 'ttLive',   label: 'TikTok Shop/Search Ads', color: '#5fa8a8', gmvKey: 'ttLive', icon: '🛍️' },
  { key: 'shAds',    label: 'Shopee Ads',        color: '#e98a4b', gmvKey: 'shAds', icon: '🛒' },
  { key: 'shLive',   label: 'Shopee Live Ads',   color: '#c96a2a', gmvKey: 'shLive',icon: '📺' },
  { key: 'meta',     label: 'Facebook Ads',      color: '#6699ff', gmvKey: null,    icon: '🌐' },
];

const n = v => Number(v || 0);
const ma3 = arr => arr.map((_, i) => {
  const sl = arr.slice(Math.max(0, i - 2), i + 1).filter(x => x > 0);
  return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : null;
});

function thMonthShort(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.slice(0, 7).split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

export default function Ads() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/gsheet/ads', { start, end })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const a = data?.audit;
  const daily = data?.daily || [];
  const totalSpend = n(data?.summary?.ads);
  const totalGmv   = n(data?.summary?.adsGmv);
  const totalRoas  = n(data?.summary?.roas);
  const totalViews = n(data?.summary?.views);

  // monthly aggregate from daily
  const monthlyMap = new Map();
  daily.forEach(row => {
    const key = String(row.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const m = monthlyMap.get(key) || { month: key, spend: 0, gmv: 0 };
    m.spend += n(row.spend);
    m.gmv   += n(row.gmv);
    monthlyMap.set(key, m);
  });
  const monthlyRows = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  /* ── Donut: spend per channel ── */
  const donutData = a ? {
    labels: CHANNELS.map(c => c.label),
    datasets: [{
      data: CHANNELS.map(c => n(a.ads[c.key])),
      backgroundColor: CHANNELS.map(c => c.color),
      borderWidth: 2, borderColor: '#fff',
    }]
  } : null;

  /* ── ROAS bar (เฉพาะ channel ที่มี spend + GMV) ── */
  const roasChs = CHANNELS.filter(c => c.gmvKey && n(a?.ads[c.key]) > 0 && n(a?.adsGmv[c.gmvKey]) > 0);
  const roasBar = roasChs.length ? {
    labels: roasChs.map(c => c.label),
    datasets: [{
      label: 'ROAS', borderRadius: 6,
      data: roasChs.map(c => n(a.ads[c.key]) > 0 ? +(n(a.adsGmv[c.gmvKey]) / n(a.ads[c.key])).toFixed(2) : 0),
      backgroundColor: roasChs.map(c => c.color),
    }]
  } : null;

  /* ── Monthly bar ── */
  const monthlyBar = monthlyRows.length ? {
    labels: monthlyRows.map(r => thMonthShort(r.month)),
    datasets: [
      { label: 'Spend', data: monthlyRows.map(r => r.spend), backgroundColor: '#e98a4b', borderRadius: 4, stack: 'a' },
      { label: 'Ads GMV', data: monthlyRows.map(r => r.gmv), backgroundColor: '#7DB9B9', borderRadius: 4, stack: 'b' },
    ]
  } : null;

  /* ── Daily trend ── */
  const lineData = daily.length ? {
    labels: daily.map(d => d.date),
    datasets: [
      { label: 'Spend รายวัน', data: daily.map(d => d.spend),
        borderColor: '#e98a4b', backgroundColor: 'rgba(233,138,75,0.1)',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
      { label: 'MA3', data: ma3(daily.map(d => d.spend)),
        borderColor: '#B2D8D8', borderDash: [5, 3],
        fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2 },
    ]
  } : null;

  const chartOpts = {
    maintainAspectRatio: false,
    plugins: { legend: { labels: { font: { family: 'Kanit', size: 11 } } } },
  };

  if (!data && !error) return <Loading />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-title">โฆษณา</div>
      <div className="page-sub">ค่าโฆษณา GMV และ ROAS แยกช่องทาง — ดึงจาก Google Sheet รายวัน</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {data && a && <>
        {/* ── KPI ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #e98a4b' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>ค่าโฆษณารวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e98a4b', marginTop: 4 }}>{fmtMoney(totalSpend)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>จาก {CHANNELS.filter(c=>n(a.ads[c.key])>0).length} ช่องทาง</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #7DB9B9' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>Ads GMV รวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--acc)', marginTop: 4 }}>{fmtMoney(totalGmv)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>ยอดขายที่เชื่อมกับโฆษณา</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid ' + (totalRoas >= 1 ? '#10b981' : '#ef4444') }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>ROAS เฉลี่ย</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalRoas >= 1 ? '#10b981' : '#ef4444', marginTop: 4 }}>{fmt(totalRoas, 2)}x</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>{totalRoas >= 1 ? 'คุ้มค่า' : '⚠️ ต่ำกว่า 1x'}</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>Impressions รวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6', marginTop: 4 }}>{fmt(totalViews)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>การแสดงโฆษณาทั้งหมด</div>
          </div>
        </div>

        {/* ── MONTHLY TREND (ขึ้นก่อน ใหญ่ชัด) ── */}
        {monthlyRows.length > 0 && (
          <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1a2a3a' }}>เทรนรายเดือน — Spend vs Ads GMV</div>
                <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>แท่งส้ม = ค่าโฆษณา · แท่งมินต์ = GMV ที่ได้จากโฆษณา · จุด = ROAS</div>
              </div>
            </div>

            {/* Chart */}
            <div style={{ height: 320 }}>
              <Bar
                plugins={[ChartDataLabels]}
                data={{
                  labels: monthlyRows.map(r => thMonthShort(r.month)),
                  datasets: [
                    { type: 'bar', label: 'Spend', data: monthlyRows.map(r => r.spend),
                      backgroundColor: 'rgba(233,138,75,0.85)', borderRadius: 5, yAxisID: 'y', order: 2,
                      datalabels: { anchor: 'end', align: 'end', color: '#e98a4b', font: { size: 10, family: 'Kanit', weight: 700 },
                        formatter: v => v > 0 ? (v >= 1000000 ? (v/1000000).toFixed(1)+'M' : Math.round(v/1000)+'K') : '' } },
                    { type: 'bar', label: 'Ads GMV', data: monthlyRows.map(r => r.gmv),
                      backgroundColor: 'rgba(125,185,185,0.85)', borderRadius: 5, yAxisID: 'y', order: 3,
                      datalabels: { anchor: 'end', align: 'end', color: '#5a9a9a', font: { size: 10, family: 'Kanit', weight: 700 },
                        formatter: v => v > 0 ? (v >= 1000000 ? (v/1000000).toFixed(1)+'M' : Math.round(v/1000)+'K') : '' } },
                    { type: 'line', label: 'ROAS', data: monthlyRows.map(r => r.spend > 0 && r.gmv > 0 ? +(r.gmv / r.spend).toFixed(2) : null),
                      borderColor: '#8b5cf6', backgroundColor: '#8b5cf6',
                      pointBackgroundColor: '#8b5cf6', pointRadius: 5, pointHoverRadius: 7,
                      borderWidth: 2, tension: 0.3, yAxisID: 'roas', order: 1,
                      datalabels: { display: false } },
                  ]
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  layout: { padding: { top: 24 } },
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, boxWidth: 12, padding: 16 } },
                    tooltip: { callbacks: {
                      label: ctx => {
                        if (ctx.dataset.label === 'ROAS') return ` ROAS: ${ctx.parsed.y}x`;
                        return ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`;
                      }
                    }}
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Kanit', size: 11 } } },
                    y: { position: 'left', beginAtZero: true,
                      ticks: { callback: v => (v/1000).toFixed(0)+'K', font: { size: 10 } },
                      grid: { color: 'rgba(0,0,0,0.05)' } },
                    roas: { position: 'right', beginAtZero: true,
                      ticks: { callback: v => v+'x', font: { size: 10 }, color: '#8b5cf6' },
                      grid: { display: false } }
                  }
                }}
              />
            </div>

            {/* Monthly table */}
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="data" style={{ fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    <th>เดือน</th>
                    <th className="num">Spend</th>
                    <th className="num">Ads GMV</th>
                    <th className="num">ROAS</th>
                    <th className="num">Ads/GMV %</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((r, i) => {
                    const roas = r.spend > 0 && r.gmv > 0 ? r.gmv / r.spend : null;
                    const adsRate = r.gmv > 0 ? (r.spend / r.gmv * 100) : null;
                    const roasColor = !roas ? '#94a3b8' : roas >= 3 ? '#10b981' : roas >= 1 ? '#f59e0b' : '#ef4444';
                    return (
                      <tr key={r.month} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                        <td style={{ fontWeight: 600 }}>{thMonthShort(r.month)}</td>
                        <td className="num" style={{ color: '#e98a4b', fontWeight: 600 }}>{fmtMoney(r.spend)}</td>
                        <td className="num" style={{ color: '#7DB9B9', fontWeight: 600 }}>{r.gmv ? fmtMoney(r.gmv) : '—'}</td>
                        <td className="num">
                          {roas ? <span style={{ color: roasColor, fontWeight: 700 }}>{roas.toFixed(2)}x</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td className="num" style={{ color: adsRate ? (adsRate <= 30 ? '#10b981' : '#f59e0b') : '#94a3b8' }}>
                          {adsRate ? adsRate.toFixed(1)+'%' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1a2a3a' }}>
                    <td style={{ color: '#B2D8D8', fontWeight: 700, padding: '8px 12px' }}>รวม</td>
                    <td className="num" style={{ color: '#e98a4b', fontWeight: 800 }}>{fmtMoney(totalSpend)}</td>
                    <td className="num" style={{ color: '#7DB9B9', fontWeight: 800 }}>{fmtMoney(totalGmv)}</td>
                    <td className="num" style={{ color: totalRoas>=1?'#86efac':'#fca5a5', fontWeight: 800 }}>{fmt(totalRoas,2)}x</td>
                    <td className="num" style={{ color: '#94a3b8' }}>{totalGmv>0?(totalSpend/totalGmv*100).toFixed(1)+'%':'—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Channel breakdown table ── */}
        <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>รายละเอียดต่อช่องทาง</div>
          <table className="data" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>ช่องทาง</th>
              <th className="num">Spend (฿)</th>
              <th className="num">สัดส่วน</th>
              <th className="num">Ads GMV (฿)</th>
              <th className="num">ROAS</th>
              <th className="num">Impressions</th>
            </tr></thead>
            <tbody>
              {CHANNELS.map((ch, i) => {
                const spend = n(a.ads[ch.key]);
                const gmv   = ch.gmvKey ? n(a.adsGmv[ch.gmvKey]) : 0;
                const m     = a.adsMetrics[ch.key] || {};
                const roas  = spend > 0 && gmv > 0 ? gmv / spend : null;
                const pct   = totalSpend > 0 ? (spend / totalSpend * 100) : 0;
                return (
                  <tr key={ch.key} style={{ background: i%2?'#f8fafc':'#fff' }}>
                    <td>
                      <span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:ch.color, marginRight:6 }}/>
                      {ch.icon} {ch.label}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{spend ? fmtMoney(spend) : '—'}</td>
                    <td className="num">
                      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                        <div style={{ width:60, height:6, background:'#e5e7eb', borderRadius:99 }}>
                          <div style={{ width:`${Math.min(100,pct)}%`, height:'100%', background:ch.color, borderRadius:99 }}/>
                        </div>
                        <span style={{ minWidth:36 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="num">{gmv ? fmtMoney(gmv) : '—'}</td>
                    <td className="num" style={{ color: roas && roas >= 1 ? '#10b981' : roas ? '#ef4444' : '#94a3b8' }}>
                      {roas ? <b>{fmt(roas,2)}x</b> : '—'}
                    </td>
                    <td className="num">{(m.imp||m.views) ? fmt((m.imp||0)+(m.views||0)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1a2a3a' }}>
                <td style={{ color:'#B2D8D8', fontWeight:700, padding:'8px 12px' }}>รวม</td>
                <td className="num" style={{ color:'#e98a4b', fontWeight:800 }}>{fmtMoney(totalSpend)}</td>
                <td className="num" style={{ color:'#94a3b8' }}>100%</td>
                <td className="num" style={{ color:'#7DB9B9', fontWeight:800 }}>{fmtMoney(totalGmv)}</td>
                <td className="num" style={{ color: totalRoas>=1?'#86efac':'#fca5a5', fontWeight:800 }}>{fmt(totalRoas,2)}x</td>
                <td className="num" style={{ color:'#94a3b8' }}>{fmt(totalViews)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Donut + Daily trend ── */}
        <div style={{ display:'grid', gridTemplateColumns:'360px 1fr', gap:16, marginBottom:20 }}>
          <div className="card" style={{ padding:'18px 20px' }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>สัดส่วน Spend ต่อช่องทาง</div>
            <div style={{ height:220 }}>
              <Doughnut data={donutData} options={{
                ...chartOpts,
                plugins: {
                  legend: { position:'bottom', labels: { font:{family:'Kanit',size:10}, boxWidth:10, padding:8 } },
                  tooltip: { callbacks: {
                    label: ctx => ` ${ctx.label}: ${fmtMoney(ctx.raw)} (${totalSpend>0?((ctx.raw/totalSpend)*100).toFixed(1):0}%)`
                  }}
                }
              }} />
            </div>
          </div>
          {lineData && (
            <div className="card" style={{ padding:'18px 20px' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Trend รายวัน</div>
              <div style={{ fontSize:11, color:'var(--grey-light)', marginBottom:10 }}>เส้นส้ม = spend รายวัน · เส้นมินต์ = MA3</div>
              <div style={{ height:220 }}>
                <Line data={lineData} options={{
                  ...chartOpts,
                  plugins: { legend:{ labels:{font:{family:'Kanit',size:11}} } },
                  scales: {
                    x: { ticks:{maxTicksLimit:10, font:{size:10}}, grid:{display:false} },
                    y: { ticks:{callback:v=>(v/1000).toFixed(0)+'K', font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} }
                  }
                }} />
              </div>
            </div>
          )}
        </div>

      </>}
    </div>
  );
}
