import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';

const CHANNELS = [
  ['ttManager', 'TT Ads Manager'],
  ['ttGmv', 'TikTok GMV Max'],
  ['ttLive', 'TikTok GMV Live'],
  ['shAds', 'Shopee Ads'],
  ['shLive', 'Shopee Live Ads'],
  ['meta', 'Facebook Ads']
];

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

  return (
    <div>
      <div className="page-title">โฆษณา</div>
      <div className="page-sub">ค่าโฆษณา GMV และ ROAS แยกช่องทาง</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && a && (
        <>
          <div className="kpis">
            <Kpi label="ค่าโฆษณารวม" value={data.summary.ads} tone="red" />
            <Kpi label="Ads GMV" value={data.summary.adsGmv} tone="blue" />
            <Kpi label="ROAS (Ads GMV)" value={data.summary.roas} format="x" tone="green" />
            <Kpi label="Impressions รวม" value={data.summary.views} format="num" />
          </div>
          {!!data.missing?.length && (
            <div className="card">
              <h3>ข้อมูลที่ยังขาดจาก Google Sheet</h3>
              <ul>
                {data.missing.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          <div className="card table-scroll">
            <table className="data">
              <thead><tr>
                <th>ช่องทาง</th><th className="num">Spend</th><th className="num">Ads GMV</th>
                <th className="num">ROAS</th><th className="num">Impressions</th><th className="num">Reach/Clicks</th>
              </tr></thead>
              <tbody>
                {CHANNELS.map(([key, label]) => {
                  const spend = a.ads[key] || 0;
                  const gmv = a.adsGmv[key] || 0;
                  const m = a.adsMetrics[key] || {};
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="num">{fmtMoney(spend)}</td>
                      <td className="num">{gmv ? fmtMoney(gmv) : '-'}</td>
                      <td className="num">{spend && gmv ? fmt(gmv / spend, 2) + 'x' : '-'}</td>
                      <td className="num">{m.imp || m.views ? fmt((m.imp || 0) + (m.views || 0)) : '-'}</td>
                      <td className="num">{m.reach ? fmt(m.reach) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>เทียบ Spend ต่อช่องทาง</h3>
            <Bar data={{
              labels: CHANNELS.map(c => c[1]),
              datasets: [{ label: 'Spend', data: CHANNELS.map(c => a.ads[c[0]] || 0), backgroundColor: '#dc2626' }]
            }} />
          </div>
        </>
      )}
    </div>
  );
}
