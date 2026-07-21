import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmtPct } from '../api.js';
import { Kpi, DateRange, useDateRange, Alert, Loading, Bar } from '../components/ui.jsx';
import { useAuditModal, MonthlyChangePanel, SourceCard, DailyTable } from '../components/dashparts.jsx';

export default function Dashboard() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [platform, setPlatform] = useState('All');
  const [subPlatform, setSubPlatform] = useState('All');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { showAudit, modal } = useAuditModal(data);

  async function load() {
    setBusy(true); setError('');
    try {
      setData(await apiGet('/gsheet/channel-dashboard', { start, end, platform, subPlatform: platform === 'ModernTrade' ? subPlatform : 'All' }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const s = data?.summary || {};
  const a = data?.audit;
  const p = data?.platformBreakdown || {};
  const tt = data?.ttBreakdown || {};
  const sh = data?.shBreakdown || {};
  const mt = data?.mtBreakdown || {};
  const ttRev = p.tiktok || 0;
  const shRev = p.shopee || 0;
  const fbRev = p.facebook || 0;
  const mtRev = p.modernTrade || 0;
  const ttOrganic = Math.max(ttRev - (tt.live || 0) - (tt.ads || 0) - (tt.adsLive || 0) - (tt.affiliate || 0), 0);
  const shOrganic = Math.max(shRev - (sh.ads || 0) - (sh.affiliate || 0), 0);
  const mtTotal = Object.values(mt).reduce((x, y) => x + (y || 0), 0);

  const showTt = platform === 'All' || platform === 'TikTok';
  const showSh = platform === 'All' || platform === 'Shopee';
  const showFb = platform === 'All' || platform === 'Facebook';
  const showMt = platform === 'All' || platform === 'ModernTrade';

  return (
    <div>
      <div className="page-title">Dashboard รายช่องทาง</div>
      <div className="page-sub">เจาะข้อมูลราย TikTok / Shopee / Modern Trade</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy}>
        <label>แพลตฟอร์ม
          <select value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="All">รวมทุกช่องทาง</option>
            <option value="TikTok">TikTok Shop</option>
            <option value="Shopee">Shopee</option>
            <option value="Facebook">Facebook</option>
            <option value="ModernTrade">Modern Trade</option>
          </select>
        </label>
        {platform === 'ModernTrade' && (
          <label>ร้าน
            <select value={subPlatform} onChange={e => setSubPlatform(e.target.value)}>
              <option value="All">ภาพรวมทุกร้าน</option>
              <option value="EVEANDBOY">EVEANDBOY</option>
              <option value="WATSONS">WATSONS</option>
              <option value="KONVY">KONVY</option>
            </select>
          </label>
        )}
      </DateRange>
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          {showTt && ttRev > 0 && (
            <div className="card">
              <h3>รายละเอียดสัดส่วนยอดขาย TikTok — ยอดขายรวม {fmtMoney(ttRev)}</h3>
              <div className="source-cards">
                <SourceCard title="หน้ารายละเอียดสินค้า (Organic)" value={ttOrganic} totalRev={ttRev} note="ยอด Organic / ไม่ถูก map" />
                <SourceCard title="Live ของร้านค้า" value={tt.live || 0} totalRev={ttRev} note="ยอดจาก Live / Creator" />
                <SourceCard title="พาร์ทเนอร์ / Affiliate" value={tt.affiliate || 0} totalRev={ttRev} note="ใช้เทียบค่าคอม" />
                <SourceCard title="โฆษณา TikTok Ads (GMV)" value={tt.ads || 0} totalRev={ttRev} note="ยอดขายที่ Ads claim" />
                <SourceCard title="Ads (Live Boost)" value={tt.adsLive || 0} totalRev={ttRev} note="ยอดจากการยิงแอด Live" />
              </div>
            </div>
          )}

          {showSh && shRev > 0 && (
            <div className="card">
              <h3>รายละเอียดสัดส่วนยอดขาย Shopee — ยอดขายรวม {fmtMoney(shRev)}</h3>
              <div className="source-cards">
                <SourceCard title="หน้ารายละเอียดสินค้า (Organic)" value={shOrganic} totalRev={shRev} note="ยอด Organic / ไม่ถูก map" />
                <SourceCard title="พาร์ทเนอร์ / Affiliate" value={sh.affiliate || 0} totalRev={shRev} note="ยอดจาก Shopee Affiliate" />
                <SourceCard title="โฆษณา Shopee Ads" value={sh.ads || 0} totalRev={shRev} note="ยอดขายที่ Ads claim" />
              </div>
            </div>
          )}

          {showFb && (fbRev > 0 || (a?.ads?.meta || 0) > 0) && (
            <div className="card">
              <h3>Facebook Ads — Revenue {fmtMoney(fbRev)}</h3>
              <div className="source-cards">
                <SourceCard title="Facebook Revenue" value={fbRev} totalRev={fbRev || 1} note="จากชีท Facebook Ads" />
                <SourceCard title="Facebook Ads Cost" value={a?.ads?.meta || 0} totalRev={fbRev || 1} note="ค่าแอดจากชีทรายวัน/รายเดือน" />
              </div>
            </div>
          )}

          {showMt && mtRev > 0 && (
            <div className="card">
              <h3>สัดส่วนยอดขาย Modern Trade</h3>
              <div className="source-cards">
                {Object.entries(mt).filter(([, v]) => v > 0).map(([name, v]) => (
                  <SourceCard key={name} title={name} value={v} totalRev={mtTotal} />
                ))}
              </div>
            </div>
          )}

          <div className="kpis">
            <div onClick={() => showAudit('rev')} style={{ cursor: 'pointer' }}><Kpi label="ยอดขาย (Revenue)" value={s.revenue} tone="blue" /></div>
            <div onClick={() => showAudit('deduct')} style={{ cursor: 'pointer' }}><Kpi label="หักแพลตฟอร์ม" value={s.deductions} tone="red" /></div>
            <div onClick={() => showAudit('ads')} style={{ cursor: 'pointer' }}><Kpi label="ค่าโฆษณา" value={s.ads} tone="red" /></div>
            <div onClick={() => showAudit('cogs')} style={{ cursor: 'pointer' }}><Kpi label="ต้นทุน (COGS)" value={s.cogs} tone="red" /></div>
            <div onClick={() => showAudit('netIncome')} style={{ cursor: 'pointer' }}><Kpi label="กำไรบริษัท" value={s.netIncome} tone={s.netIncome >= 0 ? 'green' : 'red'} /></div>
            <Kpi label="ROAS" value={s.roas} format="x" />
            <Kpi label="ออเดอร์" value={s.totalOrders} format="num" />
            <Kpi label="Net Margin %" value={s.netMargin} format="pct" tone="green" />
            <Kpi label="AOV" value={s.aov} />
            <Kpi label="Ads Spend %" value={s.adsRate} format="pct" />
            <Kpi label="Affiliate Cost %" value={s.affiliateRate} format="pct" />
            <Kpi label="Platform Fee %" value={s.platformFeeRate} format="pct" />
          </div>

          <MonthlyChangePanel charts={data.charts} />

          <div className="card">
            <h3>ยอดขายรายเดือน</h3>
            <Bar data={{
              labels: data.charts.labels,
              datasets: [
                { label: 'TikTok', data: data.charts.ttRev, backgroundColor: '#111827', stack: 'r' },
                { label: 'Shopee', data: data.charts.shRev, backgroundColor: '#f4511e', stack: 'r' },
                { label: 'Facebook', data: data.charts.fbRev || [], backgroundColor: '#2563eb', stack: 'r' },
                { label: 'Modern Trade', data: data.charts.mtRev, backgroundColor: '#059669', stack: 'r' },
                { label: 'Ads', data: data.charts.ads, backgroundColor: '#dc2626', stack: 'a' }
              ]
            }} options={{ scales: { x: { stacked: true }, y: { stacked: true } } }} />
          </div>

          <div className="card">
            <h3>ยอดขายรายวัน</h3>
            <Bar data={{
              labels: data.dailyCharts.labels,
              datasets: [
                { label: 'TikTok', data: data.dailyCharts.ttRev, backgroundColor: '#111827', stack: 'r' },
                { label: 'Shopee', data: data.dailyCharts.shRev, backgroundColor: '#f4511e', stack: 'r' },
                { label: 'Facebook', data: data.dailyCharts.fbRev || [], backgroundColor: '#2563eb', stack: 'r' },
                { label: 'Modern Trade', data: data.dailyCharts.mtRev, backgroundColor: '#059669', stack: 'r' }
              ]
            }} options={{ scales: { x: { stacked: true }, y: { stacked: true } } }} />
          </div>

          <DailyTable rows={data.table} />
          {modal}
        </>
      )}
    </div>
  );
}
