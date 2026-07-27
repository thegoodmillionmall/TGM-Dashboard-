import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar, Line, Doughnut } from '../components/ui.jsx';

const CHANNELS = [
  { key: 'ttManager', label: 'TT Ads Manager',  color: '#7DB9B9', gmvKey: null      },
  { key: 'ttGmv',    label: 'TikTok GMV Max',   color: '#B2D8D8', gmvKey: 'ttGmv'  },
  { key: 'ttLive',   label: 'TikTok GMV Live',  color: '#5fa8a8', gmvKey: 'ttLive' },
  { key: 'shAds',    label: 'Shopee Ads',        color: '#e98a4b', gmvKey: 'shAds'  },
  { key: 'shLive',   label: 'Shopee Live Ads',   color: '#c96a2a', gmvKey: 'shLive' },
  { key: 'meta',     label: 'Facebook Ads',      color: '#6699ff', gmvKey: null      },
];

const ma3 = arr => arr.map((_, i) => {
  const sl = arr.slice(Math.max(0, i - 2), i + 1).filter(x => x > 0);
  return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : null;
});

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

  /* ---- Donut: spend per channel ---- */
  const donutData = a ? {
    labels: CHANNELS.map(c => c.label),
    datasets: [{
      data: CHANNELS.map(c => a.ads[c.key] || 0),
      backgroundColor: CHANNELS.map(c => c.color),
      borderWidth: 0,
    }]
  } : null;

  /* ---- ROAS bar: เฉพาะ channel ที่มีทั้ง spend + GMV ---- */
  const roasChs = CHANNELS.filter(c => c.gmvKey && (a?.ads[c.key] || 0) > 0 && (a?.adsGmv[c.gmvKey] || 0) > 0);
  const roasBar = roasChs.length ? {
    labels: roasChs.map(c => c.label),
    datasets: [{
      label: 'ROAS',
      data: roasChs.map(c => {
        const spend = a.ads[c.key] || 0;
        const gmv   = a.adsGmv[c.gmvKey] || 0;
        return spend > 0 ? +(gmv / spend).toFixed(2) : 0;
      }),
      backgroundColor: roasChs.map(c => c.color),
    }]
  } : null;

  /* ---- Line: daily spend trend + MA3 ---- */
  const daily = data?.daily || [];
  const lineData = daily.length ? {
    labels: daily.map(d => d.date),
    datasets: [
      {
        label: 'Spend รายวัน',
        data: daily.map(d => d.spend),
        borderColor: '#e98a4b',
        backgroundColor: 'rgba(233,138,75,0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      },
      {
        label: 'MA3 Spend',
        data: ma3(daily.map(d => d.spend)),
        borderColor: '#B2D8D8',
        borderDash: [4, 3],
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      },
    ]
  } : null;

  return (
    <div>
      <div className="page-title">โฆษณา</div>
      <div className="page-sub">ค่าโฆษณา GMV และ ROAS แยกช่องทาง</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {!data && !error ? <Loading /> : data && a && (
        <>
          {/* KPI Strip */}
          <div className="kpis">
            <Kpi label="ค่าโฆษณารวม"    value={data.summary.ads}    tone="red"   />
            <Kpi label="Ads GMV รวม"     value={data.summary.adsGmv} tone="blue"  />
            <Kpi label="ROAS เฉลี่ย"     value={data.summary.roas}   format="x"   tone="green" />
            <Kpi label="Impressions รวม" value={data.summary.views}  format="num" />
          </div>

          {/* Donut + ROAS bar */}
          <div className="grid2">
            <div className="card">
              <h3>สัดส่วน Spend ต่อช่องทาง</h3>
              <Doughnut
                data={donutData}
                options={{
                  plugins: {
                    legend: { position: 'right', labels: { font: { family: 'Kanit', size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: ctx => ` ${ctx.label}: ${fmtMoney(ctx.raw)} (${data.summary.ads > 0 ? ((ctx.raw / data.summary.ads) * 100).toFixed(1) : 0}%)`
                      }
                    }
                  }
                }}
              />
            </div>
            <div className="card">
              <h3>ROAS ต่อช่องทาง</h3>
              {roasBar ? (
                <Bar
                  data={roasBar}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        ticks: { callback: v => v + 'x' },
                        grid: { color: 'rgba(0,0,0,0.06)' }
                      }
                    }
                  }}
                />
              ) : (
                <p style={{ color: '#6b7280', fontSize: 13 }}>ไม่มีข้อมูล ROAS ในช่วงนี้</p>
              )}
            </div>
          </div>

          {/* Daily trend line */}
          {lineData && (
            <div className="card">
              <h3>Trend ค่าโฆษณารายวัน</h3>
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
          )}

          {/* Warnings */}
          {!!data.missing?.length && (
            <div className="card">
              <h3 style={{ color: '#d97706' }}>⚠️ ข้อมูลที่ขาดหรือไม่สมบูรณ์</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#6b7280' }}>
                {data.missing.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {/* Channel breakdown table */}
          <div className="card table-scroll">
            <h3>รายละเอียดต่อช่องทาง</h3>
            <table className="data">
              <thead><tr>
                <th>ช่องทาง</th>
                <th className="num">Spend</th>
                <th className="num">Ads GMV</th>
                <th className="num">ROAS</th>
                <th className="num">Impressions</th>
                <th className="num">Reach / Views</th>
              </tr></thead>
              <tbody>
                {CHANNELS.map(ch => {
                  const spend = a.ads[ch.key] || 0;
                  const gmv   = ch.gmvKey ? (a.adsGmv[ch.gmvKey] || 0) : 0;
                  const m     = a.adsMetrics[ch.key] || {};
                  const roas  = spend > 0 && gmv > 0 ? gmv / spend : null;
                  return (
                    <tr key={ch.key}>
                      <td>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ch.color, marginRight: 6 }} />
                        {ch.label}
                      </td>
                      <td className="num">{fmtMoney(spend)}</td>
                      <td className="num">{gmv ? fmtMoney(gmv) : '—'}</td>
                      <td className="num">{roas ? fmt(roas, 2) + 'x' : '—'}</td>
                      <td className="num">{(m.imp || m.views) ? fmt((m.imp || 0) + (m.views || 0)) : '—'}</td>
                      <td className="num">{m.reach ? fmt(m.reach) : '—'}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 600, borderTop: '2px solid #e5e7eb' }}>
                  <td>รวม</td>
                  <td className="num">{fmtMoney(data.summary.ads)}</td>
                  <td className="num">{fmtMoney(data.summary.adsGmv)}</td>
                  <td className="num">{data.summary.roas ? fmt(data.summary.roas, 2) + 'x' : '—'}</td>
                  <td className="num">{fmt(data.summary.views)}</td>
                  <td className="num">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
