import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar, Line, Doughnut } from '../components/ui.jsx';

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
        {/* ── KPI (waterfall: Spend → GMV → ROAS) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #e98a4b' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>① ค่าโฆษณารวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e98a4b', marginTop: 4 }}>{fmtMoney(totalSpend)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>จาก {CHANNELS.filter(c=>n(a.ads[c.key])>0).length} ช่องทาง</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #7DB9B9' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>② Ads GMV รวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--acc)', marginTop: 4 }}>{fmtMoney(totalGmv)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>ยอดขายที่เชื่อมกับโฆษณา</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid ' + (totalRoas >= 1 ? '#10b981' : '#ef4444') }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>③ ROAS เฉลี่ย</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalRoas >= 1 ? '#10b981' : '#ef4444', marginTop: 4 }}>{fmt(totalRoas, 2)}x</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>{totalRoas >= 1 ? 'คุ้มค่า' : '⚠️ ต่ำกว่า 1x — ตรวจสอบ'}</div>
          </div>
          <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', fontWeight: 600 }}>④ Impressions รวม</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6', marginTop: 4 }}>{fmt(totalViews)}</div>
            <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 3 }}>การแสดงโฆษณาทั้งหมด</div>
          </div>
        </div>

        {/* ── Channel breakdown table (สำคัญสุด ── วางก่อน) ── */}
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

        {/* ── Charts row: Donut + ROAS ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          <div className="card" style={{ padding:'18px 20px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>สัดส่วน Spend ต่อช่องทาง</div>
            <div style={{ height:260 }}>
              <Doughnut data={donutData} options={{
                ...chartOpts,
                plugins: {
                  legend: { position:'right', labels: { font:{family:'Kanit',size:11}, boxWidth:12 } },
                  tooltip: { callbacks: {
                    label: ctx => ` ${ctx.label}: ${fmtMoney(ctx.raw)} (${totalSpend>0?((ctx.raw/totalSpend)*100).toFixed(1):0}%)`
                  }}
                }
              }} />
            </div>
          </div>
          <div className="card" style={{ padding:'18px 20px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>ROAS ต่อช่องทาง</div>
            <div style={{ fontSize:11, color:'var(--grey-light)', marginBottom:14 }}>เฉพาะช่องทางที่มีทั้ง spend + GMV — เส้น 1x = คุ้มทุน</div>
            <div style={{ height:230 }}>
              {roasBar ? (
                <Bar data={roasBar} options={{
                  ...chartOpts,
                  plugins: { legend:{display:false},
                    annotation: { annotations: { line1: { type:'line', yMin:1, yMax:1, borderColor:'#ef4444', borderWidth:1.5, borderDash:[4,3] } } }
                  },
                  scales: {
                    x: { ticks:{font:{family:'Kanit',size:11}}, grid:{display:false} },
                    y: { ticks:{callback:v=>v+'x', font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} }
                  }
                }} />
              ) : <p style={{ color:'#6b7280',fontSize:13,paddingTop:20 }}>ไม่มีข้อมูล ROAS ในช่วงนี้</p>}
            </div>
          </div>
        </div>

        {/* ── Monthly spend vs GMV ── */}
        {monthlyBar && (
          <div className="card" style={{ padding:'18px 20px', marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>Spend vs Ads GMV รายเดือน</div>
            <div style={{ fontSize:11, color:'var(--grey-light)', marginBottom:14 }}>เปรียบเทียบค่าโฆษณาที่จ่าย (ส้ม) กับ GMV ที่ได้จากโฆษณา (มินต์)</div>
            <div style={{ height:220 }}>
              <Bar data={monthlyBar} options={{
                ...chartOpts,
                plugins: { legend:{ labels:{font:{family:'Kanit',size:11}}, position:'bottom' } },
                scales: {
                  x: { ticks:{font:{family:'Kanit',size:11}}, grid:{display:false} },
                  y: { ticks:{callback:v=>(v/1000).toFixed(0)+'K', font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'} }
                }
              }} />
            </div>
          </div>
        )}

        {/* ── Daily trend ── */}
        {lineData && (
          <div className="card" style={{ padding:'18px 20px', marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Trend ค่าโฆษณารายวัน</div>
            <div style={{ height:180 }}>
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

        {/* ── Warnings ── */}
        {!!data.missing?.length && (
          <div className="card" style={{ padding:'14px 18px', background:'#fffbeb', border:'1px solid #fcd34d' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#d97706', marginBottom:6 }}>⚠️ ข้อมูลที่ขาดหรือไม่สมบูรณ์</div>
            {data.missing.map((item,i) => <div key={i} style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>• {item}</div>)}
          </div>
        )}
      </>}
    </div>
  );
}
