import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload, fmt, fmtMoney, getUser } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const STATUSES = ['PLANNED', 'LIVE', 'DONE', 'APPROVED', 'CANCELLED'];
const GO_LIVE_DATE = '2026-08-01';
const COMPANIES = ['TGM', 'Nola'];
const MC_NAMES = ['ปุ๊กปิ๊ก', 'มายด์', 'แตงโม', 'โบว์', 'แพรวา'];
const CAMERA_TYPES = [
  { key: 'mobile', label: 'มือถือ' },
  { key: 'obs', label: 'OBS' }
];
const DOCS = [
  ['liveImage', 'live', 'ภาพหน้าจอไลฟ์'],
  ['salesImage', 'sales', 'หน้ายอดขาย'],
  ['endImage', 'end', 'หน้าจบไลฟ์']
];
const EMPTY = {
  id: '', date: GO_LIVE_DATE, brand: 'TGM', company: 'TGM', cameraType: 'mobile', platform: 'TikTok',
  mc: '', startTime: '', endTime: '', planTopic: '', targetSales: 0, actualSales: 0, orders: 0,
  viewers: 0, peakCcu: 0, comments: 0, clicks: 0, addToCart: 0, coins: 0, adsCost: 0,
  status: 'PLANNED', documentStatus: 'MISSING', documentLinks: '', attachmentNames: '', note: ''
};

const num = v => Number(v || 0) || 0;
const dateText = v => String(v || '').slice(0, 10);
const monthText = v => dateText(v).slice(0, 7);
const docUrl = doc => doc?.url || '';
const platformKey = v => String(v || '').toLowerCase().includes('shopee') ? 'Shopee' : 'TikTok';
const requiredDocs = cameraType => cameraType === 'obs' ? [DOCS[0]] : DOCS;
const isDoneRow = r => ['DONE', 'APPROVED'].includes(String(r?.status || '').toUpperCase());
const isApprovedRow = r => String(r?.status || '').toUpperCase() === 'APPROVED';
const isReviewed = r => !!r?.docReview?.checked && !r?.docReview?.rejected;
const needsReview = r => isDoneRow(r) && (r.documentStatus !== 'COMPLETE' || !isReviewed(r));
const fmtHours = v => `${fmt(v, 1)} ชม.`;

function liveHours(start, end) {
  const m1 = String(start || '').match(/^(\d{1,2}):(\d{2})/);
  const m2 = String(end || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m1 || !m2) return 0;
  let s = Number(m1[1]) * 60 + Number(m1[2]);
  let e = Number(m2[1]) * 60 + Number(m2[2]);
  if (e < s) e += 24 * 60;
  return Math.max(0, (e - s) / 60);
}

function checkedText(review) {
  if (review?.rejected) return `ส่งกลับแก้ไขโดย ${review.checkedBy || '-'} ${String(review.checkedAt || '').slice(0, 16).replace('T', ' ')}`;
  if (review?.checked) return `เช็คแล้วโดย ${review.checkedBy || '-'} ${String(review.checkedAt || '').slice(0, 16).replace('T', ' ')}`;
  return 'รอหัวหน้าทีมเช็ค';
}

function addSum(map, key, row) {
  const item = map.get(key) || {
    key, date: row.date, mc: row.mc, lives: 0, done: 0, approved: 0, checked: 0, missingDocs: 0,
    hours: 0, sales: 0, orders: 0, ads: 0, coins: 0, shopeeSales: 0, tiktokSales: 0, shopeeAds: 0, tiktokAds: 0
  };
  const platform = platformKey(row.platform);
  const sales = num(row.actualSales);
  const ads = num(row.adsCost);
  item.lives += 1;
  if (isDoneRow(row)) item.done += 1;
  if (isApprovedRow(row)) item.approved += 1;
  if (isReviewed(row)) item.checked += 1;
  if (needsReview(row)) item.missingDocs += 1;
  item.hours += liveHours(row.startTime, row.endTime);
  item.sales += sales;
  item.orders += num(row.orders);
  item.ads += ads;
  item.coins += num(row.coins);
  if (platform === 'Shopee') {
    item.shopeeSales += sales;
    item.shopeeAds += ads;
  } else {
    item.tiktokSales += sales;
    item.tiktokAds += ads;
  }
  map.set(key, item);
}

function buildSummary(rows) {
  const daily = new Map();
  const mc = new Map();
  const pivot = new Map();
  for (const row of rows) {
    const d = dateText(row.date);
    if (!d) continue;
    addSum(daily, d, { ...row, date: d });
    addSum(mc, row.mc || 'ไม่ระบุ MC', row);
    addSum(pivot, `${d}__${row.mc || 'ไม่ระบุ MC'}`, { ...row, date: d });
  }
  const dailyRows = [...daily.values()].sort((a, b) => a.key.localeCompare(b.key));
  const mcRows = [...mc.values()].sort((a, b) => b.sales - a.sales);
  const mcNames = mcRows.map(r => r.key).slice(0, 12);
  const totals = rows.reduce((acc, r) => {
    acc.lives += 1;
    acc.hours += liveHours(r.startTime, r.endTime);
    acc.sales += num(r.actualSales);
    acc.orders += num(r.orders);
    acc.ads += num(r.adsCost);
    acc.coins += num(r.coins);
    if (isDoneRow(r)) acc.done += 1;
    if (isApprovedRow(r)) acc.approved += 1;
    if (isReviewed(r)) acc.checked += 1;
    if (needsReview(r)) acc.missingDocs += 1;
    return acc;
  }, { lives: 0, done: 0, approved: 0, checked: 0, hours: 0, sales: 0, ads: 0, coins: 0, orders: 0, missingDocs: 0 });
  return { dailyRows, mcRows, mcNames, pivot, totals };
}

function mcNameOptions(rows) {
  return [...new Set(rows.map(r => r.mc).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
}

function filterMcLiveRows(rows, filters = {}) {
  return rows.filter(r => {
    const d = dateText(r.date);
    const st = String(r.status || 'PLANNED').toUpperCase();
    const company = r.company || r.brand || 'TGM';
    return (!filters.company || filters.company === 'ALL' || company === filters.company)
      && (!filters.mc || filters.mc === 'ALL' || r.mc === filters.mc)
      && (!filters.platform || filters.platform === 'ALL' || platformKey(r.platform) === filters.platform)
      && (!filters.status || filters.status === 'ALL' || st === filters.status)
      && (!filters.start || d >= filters.start)
      && (!filters.end || d <= filters.end);
  });
}

function McLiveListFilters({ rows, filters, setFilters, compact = false }) {
  const mcOptions = mcNameOptions(rows);
  return (
    <div className={compact ? 'mc-live-filterbar compact' : 'mc-live-filterbar'}>
      <label>บริษัท
        <select value={filters.company || 'ALL'} onChange={e => setFilters(f => ({ ...f, company: e.target.value }))}>
          <option value="ALL">ทุกบริษัท</option>
          {COMPANIES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>MC
        <select value={filters.mc || 'ALL'} onChange={e => setFilters(f => ({ ...f, mc: e.target.value }))}>
          <option value="ALL">ทุกคน</option>
          {mcOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>Platform
        <select value={filters.platform || 'ALL'} onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}>
          <option value="ALL">ทุกแพลตฟอร์ม</option>
          <option value="TikTok">TikTok</option>
          <option value="Shopee">Shopee</option>
        </select>
      </label>
      <label>สถานะ
        <select value={filters.status || 'ALL'} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="ALL">ทุกสถานะ</option>
          {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      {!compact && (
        <>
          <label>เริ่ม<input type="date" value={filters.start || ''} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} /></label>
          <label>ถึง<input type="date" value={filters.end || ''} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} /></label>
        </>
      )}
      <button className="btn btn-ghost" type="button" onClick={() => setFilters({ mc: 'ALL', platform: 'ALL', status: 'ALL', start: '', end: '' })}>ล้างตัวกรอง</button>
    </div>
  );
}

function StatTile({ label, value, sub, tone = '' }) {
  return (
    <div className={'mc-live-stat ' + tone}>
      <div className="mc-live-stat-label">{label}</div>
      <div className="mc-live-stat-value">{value}</div>
      {sub ? <div className="mc-live-stat-sub">{sub}</div> : null}
    </div>
  );
}

export default function McLive() {
  const user = getUser();
  const role = String(user?.role || '').toUpperCase();
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const canLead = ['ADMIN', 'MC_LEAD'].includes(role) || perms.includes('liveplanner_lead');
  const canExecutive = role === 'ADMIN';
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [company, setCompany] = useState('ALL');
  const [view, setView] = useState(canLead ? 'summary' : 'daily');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    try {
      const [allRows, myRows] = await Promise.all([
        apiGet('/ops/mc-live', { status, company }),
        apiGet('/ops/mc-live/mine')
      ]);
      setData(allRows);
      setMine(myRows);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }
  useEffect(() => { load(); }, [status, company]);

  const rows = data?.rows || [];
  const filteredRows = useMemo(() => rows.filter(r => {
    const d = dateText(r.date);
    const rowCompany = r.company || r.brand || 'TGM';
    return (!start || d >= start) && (!end || d <= end) && (company === 'ALL' || rowCompany === company);
  }), [rows, start, end, company]);
  const summary = useMemo(() => buildSummary(filteredRows), [filteredRows]);
  const update = (i, k, v) => setData(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  async function saveAll() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/ops/mc-live', { rows });
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function importExcel(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/ops/mc-live/import', fd);
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function clearDemo() {
    if (!confirm('ล้างข้อมูล MC Live ตั้งแต่ 2026-08-01 เป็นต้นไป? ใช้เฉพาะตอนลบข้อมูลตัวอย่างก่อนเปิดใช้จริง')) return;
    setBusy(true); setMsg(null);
    try {
      const res = await apiDelete('/ops/mc-live/demo?start=' + GO_LIVE_DATE);
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mc-live-page">
      <div className="page-title">MC Live</div>
      <div className="page-sub">เริ่มใช้จริง 2026-08-01 | MC กรอกของตัวเอง หัวหน้าทีมเช็คหลักฐาน ผู้บริหารอนุมัติยอดรายเดือน</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="mc-live-view-tabs">
        {canLead && <button className={'btn ' + (view === 'summary' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('summary')}>ภาพรวม</button>}
        <button className={'btn ' + (view === 'daily' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('daily')}>ภาพรวมรายวัน</button>
        <button className={'btn ' + (view === 'mine' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('mine')}>กรอกของฉัน</button>
        {canLead && <button className={'btn ' + (view === 'review' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('review')}>หัวหน้าเช็ค</button>}
        {canExecutive && <button className={'btn ' + (view === 'month' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('month')}>อนุมัติรายเดือน</button>}
        {canLead && <button className={'btn ' + (view === 'edit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('edit')}>แก้ไขตาราง</button>}
      </div>

      {canLead && view === 'summary' && (
        <>
          <Hero summary={summary} start={start} end={end} />
          <div className="toolbar mc-live-toolbar">
            <label>สถานะ
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="ALL">ทั้งหมด</option>
                {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>บริษัท
              <select value={company} onChange={e => setCompany(e.target.value)}>
                <option value="ALL">ทุกบริษัท</option>
                {COMPANIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
            {canLead && <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>↑ นำเข้า Excel เก่า</button>}
            {canExecutive && <button className="btn btn-ghost" disabled={busy} onClick={clearDemo}>ล้างข้อมูลตัวอย่าง</button>}
          </div>
        </>
      )}

      {!data || !mine ? <Loading /> : view === 'summary' && canLead ? (
        <SummaryView rows={filteredRows} summary={summary} setModal={setModal} />
      ) : view === 'daily' ? (
        <DailyOverviewView rows={filteredRows} summary={summary} start={start} end={end} setStart={setStart} setEnd={setEnd} />
      ) : view === 'mine' ? (
        <TeamEntryView rows={mine.rows || []} busy={busy} setBusy={setBusy} setMsg={setMsg} reload={load} isAdmin={canExecutive} allRows={data?.rows || []} />
      ) : view === 'review' && canLead ? (
        <ReviewQueueView rows={filteredRows} setModal={setModal} />
      ) : view === 'month' && canExecutive ? (
        <MonthlyApprovalView rows={rows} reload={load} setMsg={setMsg} setModal={setModal} />
      ) : canLead ? (
        <EditTable rows={rows} update={update} setData={setData} setMsg={setMsg} saveAll={saveAll} busy={busy} canExecutive={canExecutive} />
      ) : (
        <TeamEntryView rows={mine.rows || []} busy={busy} setBusy={setBusy} setMsg={setMsg} reload={load} isAdmin={canExecutive} allRows={data?.rows || []} />
      )}
      {modal && <McLiveModal modal={modal} onClose={() => setModal(null)} canLead={canLead} reload={load} setMsg={setMsg} />}
    </div>
  );
}

function Hero({ summary, start, end }) {
  return (
    <div className="mc-live-hero">
      <div className="mc-live-hero-main">
        <div className="mc-live-eyebrow">ภาพรวมทีมไลฟ์</div>
        <div className="mc-live-hero-value">{fmtMoney(summary.totals.sales)}</div>
        <div className="mc-live-hero-sub">
          {start || end ? `ช่วง ${start || 'เริ่มต้น'} ถึง ${end || 'ล่าสุด'}` : 'ทุกช่วงวันที่ที่มีข้อมูล'}
        </div>
      </div>
      <div className="mc-live-stat-grid">
        <StatTile label="จำนวนไลฟ์" value={fmt(summary.totals.lives, 0)} sub={`${fmt(summary.totals.done, 0)} รายการจบแล้ว`} />
        <StatTile label="ชั่วโมงไลฟ์รวม" value={fmtHours(summary.totals.hours)} sub={`เฉลี่ย ${fmtHours(summary.totals.lives ? summary.totals.hours / summary.totals.lives : 0)} / ไลฟ์`} />
        <StatTile label="ออเดอร์รวม" value={`${fmt(summary.totals.orders, 0)} ออเดอร์`} />
        <StatTile label="เช็คหลักฐาน" value={`${fmt(summary.totals.checked, 0)} / ${fmt(summary.totals.done, 0)}`} sub={`${fmt(summary.totals.missingDocs, 0)} รายการรอแก้/รอเช็ค`} tone={summary.totals.missingDocs ? 'warn' : ''} />
        <StatTile label="ค่า Ads" value={fmtMoney(summary.totals.ads)} tone="warn" />
        <StatTile label="อนุมัติรายเดือนแล้ว" value={`${fmt(summary.totals.approved, 0)} รายการ`} tone="good" />
      </div>
    </div>
  );
}

function DailyOverviewView({ rows, summary, start, end, setStart, setEnd }) {
  if (!rows.length) return (
    <div className="card" style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>
      ยังไม่มีข้อมูลในช่วงวันที่ที่เลือก
    </div>
  );
  return (
    <>
      {/* date filter bar */}
      <div className="toolbar mc-live-toolbar" style={{ marginBottom:0 }}>
        <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <button className="btn btn-ghost" onClick={() => { setStart(''); setEnd(''); }}>ล้าง</button>
      </div>

      {/* stat strip */}
      <div className="mc-live-channel-strip">
        <div><span className="dot tiktok"></span><b>TikTok</b><strong>{fmtMoney(summary.dailyRows.reduce((s,r)=>s+r.tiktokSales,0))}</strong><small>Ads {fmtMoney(summary.dailyRows.reduce((s,r)=>s+r.tiktokAds,0))}</small></div>
        <div><span className="dot shopee"></span><b>Shopee</b><strong>{fmtMoney(summary.dailyRows.reduce((s,r)=>s+r.shopeeSales,0))}</strong><small>Ads {fmtMoney(summary.dailyRows.reduce((s,r)=>s+r.shopeeAds,0))}</small></div>
        <div><b>รวมทุกช่องทาง</b><strong>{fmtMoney(summary.totals.sales)}</strong><small>{fmt(summary.totals.lives,0)} session | {fmtHours(summary.totals.hours)}</small></div>
      </div>

      {/* daily table */}
      <div className="card mc-live-card">
        <h3>ตารางสรุปรายวัน</h3>
        <DailyTable rows={summary.dailyRows} />
      </div>

      {/* per-day MC breakdown */}
      <div className="card mc-live-card">
        <h3>รายละเอียดแต่ละวัน</h3>
        <div className="mc-live-day-list">
          {summary.dailyRows.map(day => {
            const items = summary.mcNames
              .map(mc => summary.pivot.get(`${day.key}__${mc}`))
              .filter(item => item && (item.sales || item.ads || item.coins || item.lives));
            return (
              <div className="mc-live-day-card" key={day.key}>
                <div className="mc-live-day-head">
                  <div>
                    <b>{day.key}</b>
                    <span>{fmt(day.lives,0)} session | {fmtHours(day.hours)} | {fmt(day.orders,0)} ออเดอร์</span>
                  </div>
                  <strong>{fmtMoney(day.sales)}</strong>
                </div>
                {items.length ? (
                  <div className="mc-live-day-grid">
                    {items.map(item => (
                      <div className="mc-live-mc-card" key={item.key}>
                        <div className="mc-live-mc-head"><b>{item.mc || 'ไม่ระบุ MC'}</b><strong>{fmtMoney(item.sales)}</strong></div>
                        <div className="mc-live-mc-hours">{fmt(item.lives,0)} ไลฟ์ | {fmtHours(item.hours)} | {fmt(item.orders,0)} ออเดอร์ | {fmtMoney(item.sales/Math.max(item.hours,1))}/ชม.</div>
                        <div className="mc-live-platform-lines">
                          {item.tiktokSales>0 && <div><span className="tag tt">TT</span><b>{fmtMoney(item.tiktokSales)}</b>{item.tiktokAds>0 && <small>Ads {fmtMoney(item.tiktokAds)}</small>}</div>}
                          {item.shopeeSales>0 && <div><span className="tag sp">SP</span><b>{fmtMoney(item.shopeeSales)}</b>{item.shopeeAds>0 && <small>Ads {fmtMoney(item.shopeeAds)}</small>}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color:'#9ca3af', fontSize:12, padding:'8px 4px' }}>ยังไม่มีข้อมูล MC ในวันนี้</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SummaryView({ rows, summary, setModal }) {
  const [filters, setFilters] = useState({ company: 'ALL', mc: 'ALL', platform: 'ALL', status: 'ALL', start: '', end: '' });
  const detailRows = filterMcLiveRows(rows, filters);
  const detailSummary = buildSummary(detailRows);
  if (!rows.length) return <div className="card empty-state">ยังไม่มีข้อมูลตามเงื่อนไขที่เลือก</div>;
  return (
    <>
      <div className="mc-live-channel-strip">
        <div><span className="dot shopee"></span><b>Shopee</b><strong>{fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.shopeeSales, 0))}</strong><small>Ads {fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.shopeeAds, 0))}</small></div>
        <div><span className="dot tiktok"></span><b>TikTok</b><strong>{fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.tiktokSales, 0))}</strong><small>Ads {fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.tiktokAds, 0))}</small></div>
      </div>
      <div className="mc-live-dashboard-grid">
        <div className="card mc-live-card mc-live-rank-card">
          <h3>อันดับ MC ตามยอดขาย</h3>
          <McRanking rows={summary.mcRows} />
        </div>
        <div className="card mc-live-card mc-live-daily-card">
          <h3>สรุปยอดรายวัน</h3>
          <DailyTable rows={summary.dailyRows} />
        </div>
      </div>
      <div className="card mc-live-card">
        <div className="section-head-row">
          <div>
            <h3>รายละเอียดรายคน / รายการ</h3>
            <p>กรองเฉพาะ MC, แพลตฟอร์ม หรือสถานะ เพื่อเช็คและเปิดรายการที่ต้องแก้ได้เร็วขึ้น</p>
          </div>
          <strong>{fmt(detailRows.length, 0)} รายการ</strong>
        </div>
        <McLiveListFilters rows={rows} filters={filters} setFilters={setFilters} />
        <div className="mc-live-mini-stats">
          <StatTile label="ยอดขายในตัวกรอง" value={fmtMoney(detailSummary.totals.sales)} />
          <StatTile label="จำนวนไลฟ์" value={`${fmt(detailSummary.totals.lives, 0)} ไลฟ์`} />
          <StatTile label="ชั่วโมงรวม" value={fmtHours(detailSummary.totals.hours)} />
          <StatTile label="ออเดอร์รวม" value={`${fmt(detailSummary.totals.orders, 0)} ออเดอร์`} />
        </div>
        <ReviewTable rows={detailRows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60)} setModal={setModal} title="รายการตามตัวกรอง" />
      </div>
      <div className="card mc-live-card">
        <h3>Performance รายคน แยกตามวัน</h3>
        <div className="mc-live-day-list">
          {summary.dailyRows.map(day => {
            const items = summary.mcNames.map(mc => summary.pivot.get(`${day.key}__${mc}`)).filter(item => item && (item.sales || item.ads || item.coins || item.lives));
            return (
              <div className="mc-live-day-card" key={day.key}>
                <div className="mc-live-day-head"><div><b>{day.key}</b><span>{fmt(day.lives, 0)} ไลฟ์ | {fmtHours(day.hours)} | {fmt(day.orders, 0)} ออเดอร์</span></div><strong>{fmtMoney(day.sales)}</strong></div>
                <div className="mc-live-day-grid">
                  {items.map(item => <McPerfCard key={item.key} item={item} onOpen={() => setModal({ type: 'perf', item, title: `${day.key} - ${item.key}` })} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ReviewTable rows={rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30)} setModal={setModal} title="ตรวจหลักฐานที่แนบล่าสุด" />
    </>
  );
}

function McRanking({ rows }) {
  return (
    <div className="mc-live-rank">
      {rows.slice(0, 8).map((r, i) => {
        const maxSales = Math.max(rows[0]?.sales || 1, 1);
        return (
          <div className="mc-live-rank-row" key={r.key}>
            <div className="rank-no">{i + 1}</div>
            <div className="mc-live-rank-body">
              <div className="mc-live-rank-head"><b>{r.key}</b><strong>{fmtMoney(r.sales)}</strong></div>
              <div className="mc-live-rank-meta">{fmt(r.lives, 0)} ไลฟ์ | {fmtHours(r.hours)} | {fmt(r.orders, 0)} ออเดอร์ | เฉลี่ย {fmtMoney(r.sales / Math.max(r.hours, 1))}/ชม.</div>
              <div className="mc-live-bar"><span style={{ width: `${Math.max(4, (r.sales / maxSales) * 100)}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyTable({ rows }) {
  return (
    <div className="table-scroll">
      <table className="data mc-live-summary-table">
        <thead><tr><th>วันที่</th><th className="num">Shopee</th><th className="num">TikTok</th><th className="num">ยอดรวม</th><th className="num">ออเดอร์</th><th className="num">Ads</th><th className="num">ชั่วโมง</th><th className="num">ไลฟ์</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.key}><td className="strong">{r.key}</td><td className="num">{fmtMoney(r.shopeeSales)}</td><td className="num">{fmtMoney(r.tiktokSales)}</td><td className="num strong">{fmtMoney(r.sales)}</td><td className="num">{fmt(r.orders, 0)}</td><td className="num">{fmtMoney(r.ads)}</td><td className="num">{fmtHours(r.hours)}</td><td className="num">{fmt(r.lives, 0)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function McPerfCard({ item, onOpen }) {
  return (
    <button type="button" className="mc-live-mc-card mc-live-open-card" onClick={onOpen}>
      <div className="mc-live-mc-head"><b>{item.key}</b><strong>{fmtMoney(item.sales)}</strong></div>
      <div className="mc-live-mc-hours">{fmt(item.lives, 0)} ไลฟ์ | {fmtHours(item.hours)} | {fmt(item.orders, 0)} ออเดอร์ | {fmtMoney(item.sales / Math.max(item.hours, 1))}/ชม.</div>
      <div className="mc-live-platform-lines">
        <div><span className="tag sp">SP</span><b>{fmtMoney(item.shopeeSales)}</b><small>Ads {fmtMoney(item.shopeeAds)}</small></div>
        <div><span className="tag tt">TT</span><b>{fmtMoney(item.tiktokSales)}</b><small>Ads {fmtMoney(item.tiktokAds)}</small></div>
      </div>
    </button>
  );
}

function ReviewQueueView({ rows, setModal }) {
  const reviewRows = rows.filter(isDoneRow).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pending = reviewRows.filter(needsReview);
  const checked = reviewRows.filter(isReviewed);
  const rejected = reviewRows.filter(r => r.docReview?.rejected);

  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [previewMode, setPreviewMode] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  const exportRows = rows.filter(r => {
    if (exportStart && r.date < exportStart) return false;
    if (exportEnd && r.date > exportEnd) return false;
    return true;
  }).sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.mc||'').localeCompare(b.mc||''));

  function buildTeamLineReport() {
    if (!exportRows.length) return 'ไม่มีข้อมูลในช่วงที่เลือก';
    const byDate = {};
    exportRows.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
    let text = '📊 รายงาน MC Live ทีม\n\n';
    Object.entries(byDate).forEach(([date, sessions]) => {
      text += `📅 ${dateText(date)}\n`;
      const byMc = {};
      sessions.forEach(r => { if (!byMc[r.mc||'?']) byMc[r.mc||'?'] = []; byMc[r.mc||'?'].push(r); });
      Object.entries(byMc).forEach(([mc, mcSessions]) => {
        text += `👤 ${mc}\n`;
        mcSessions.forEach((r, i) => {
          const h = liveHours(r.startTime, r.endTime);
          text += `  รอบ ${i+1}: ${r.startTime||'?'}–${r.endTime||'?'} (${fmtHours(h)}) | 💰 ${fmtMoney(r.actualSales)} | ${fmt(r.orders,0)} ออเดอร์\n`;
          if (r.note) text += `  📝 ${r.note}\n`;
        });
      });
      const ds = sessions.reduce((s,r)=>s+num(r.actualSales),0);
      const do_ = sessions.reduce((s,r)=>s+num(r.orders),0);
      text += `📈 รวมวัน: ${fmtMoney(ds)} | ${fmt(do_,0)} ออเดอร์\n`;
      text += '─'.repeat(28) + '\n\n';
    });
    const total = exportRows.reduce((s,r)=>s+num(r.actualSales),0);
    const orders = exportRows.reduce((s,r)=>s+num(r.orders),0);
    text += `✅ รวม ${exportRows.length} session | ${fmtMoney(total)} | ${fmt(orders,0)} ออเดอร์`;
    return text;
  }

  function handleCopyTeamLine() {
    const text = buildTeamLineReport();
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('✓ Copy แล้ว!'); setTimeout(() => setCopyMsg(''), 3000);
    });
  }

  function handleDownloadTeamCsv() {
    if (!exportRows.length) return;
    const BOM = '﻿';
    const headers = ['วันที่','MC','Platform','เวลาเริ่ม','เวลาสิ้นสุด','ชั่วโมง','ยอดขาย','ออเดอร์','Ads','หมายเหตุ'];
    const csvRows = [headers.join(',')];
    exportRows.forEach(r => {
      const h = liveHours(r.startTime, r.endTime).toFixed(1);
      csvRows.push([dateText(r.date), r.mc||'', r.platform||'', r.startTime||'', r.endTime||'',
        h, num(r.actualSales), num(r.orders), num(r.adsCost),
        '"'+String(r.note||'').replace(/"/g,'""')+'"'].join(','));
    });
    const t = exportRows.reduce((s,r)=>s+num(r.actualSales),0);
    const o = exportRows.reduce((s,r)=>s+num(r.orders),0);
    csvRows.push(['รวม','','','','','',t,o,'',''].join(','));
    const blob = new Blob([BOM+csvRows.join('\n')],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`MCLive_ทีม_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mc-live-mini-stats">
        <StatTile label="รอหัวหน้าเช็ค/รอแก้" value={`${fmt(pending.length, 0)} รายการ`} tone={pending.length ? 'warn' : 'good'} />
        <StatTile label="เช็คแล้ว" value={`${fmt(checked.length, 0)} รายการ`} tone="good" />
        <StatTile label="ส่งกลับแก้ไข" value={`${fmt(rejected.length, 0)} รายการ`} tone={rejected.length ? 'bad' : ''} />
        <StatTile label="ยอดที่ส่งเช็ค" value={fmtMoney(reviewRows.reduce((s, r) => s + num(r.actualSales), 0))} />
      </div>
      <ReviewTable rows={reviewRows} setModal={setModal} title="คิวตรวจหลักฐานรายวัน" />

      {/* ── Export ทีม ── */}
      <div className="card mc-live-card">
        <h3 style={{ marginBottom: 12 }}>📤 ส่งออกรายงานทีม</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            เริ่ม<input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            ถึง<input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
          </label>
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'flex-end', marginBottom: 4 }}>
            {exportRows.length} session | {[...new Set(exportRows.map(r=>r.mc).filter(Boolean))].join(', ') || '-'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="btn btn-ghost" onClick={handleCopyTeamLine} disabled={!exportRows.length}>📋 Copy รายงาน LINE</button>
          <button className="btn btn-ghost" onClick={handleDownloadTeamCsv} disabled={!exportRows.length}>⬇️ Download Excel (.csv)</button>
          {exportRows.length > 0 && <>
            <button className="btn btn-ghost" onClick={() => setPreviewMode(m => m==='line'?'':'line')} style={{ background: previewMode==='line'?'#edf6f6':'' }}>👁 ดูตัวอย่าง LINE</button>
            <button className="btn btn-ghost" onClick={() => setPreviewMode(m => m==='table'?'':'table')} style={{ background: previewMode==='table'?'#edf6f6':'' }}>📊 ดูตารางสรุป</button>
          </>}
        </div>
        {copyMsg && <div style={{ color: '#10b981', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{copyMsg}</div>}
        {previewMode === 'line' && exportRows.length > 0 && (
          <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto', fontFamily: 'Kanit, sans-serif' }}>
            {buildTeamLineReport()}
          </pre>
        )}
        {previewMode === 'table' && exportRows.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table className="data" style={{ fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: '#1a2a3a', color: '#B2D8D8' }}>
                  <th>วันที่</th><th>MC</th><th>Platform</th><th>เวลา</th>
                  <th className="num">ชม.</th><th className="num">ยอดขาย</th><th className="num">ออเดอร์</th><th className="num">Ads</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map((r, i) => {
                  const h = liveHours(r.startTime, r.endTime);
                  return (
                    <tr key={r.id} style={{ background: i%2?'#f8fafc':'#fff' }}>
                      <td style={{ fontWeight: 600 }}>{dateText(r.date)}</td>
                      <td style={{ color: '#7DB9B9', fontWeight: 600 }}>{r.mc || '-'}</td>
                      <td>{r.platform}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.startTime}–{r.endTime}</td>
                      <td className="num">{h.toFixed(1)}</td>
                      <td className="num" style={{ fontWeight: 700, color: '#059669' }}>{fmtMoney(r.actualSales)}</td>
                      <td className="num">{fmt(r.orders, 0)}</td>
                      <td className="num" style={{ color: '#f97316' }}>{num(r.adsCost) ? fmtMoney(r.adsCost) : '—'}</td>
                      <td style={{ fontSize: 11, color: '#64748b' }}>{r.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#1a2a3a' }}>
                  <td colSpan={4} style={{ color: '#B2D8D8', fontWeight: 700, padding: '8px 12px' }}>รวม {exportRows.length} session</td>
                  <td className="num" style={{ color: '#B2D8D8' }}>{exportRows.reduce((s,r)=>s+liveHours(r.startTime,r.endTime),0).toFixed(1)}</td>
                  <td className="num" style={{ color: '#fff', fontWeight: 800 }}>{fmtMoney(exportRows.reduce((s,r)=>s+num(r.actualSales),0))}</td>
                  <td className="num" style={{ color: '#fff' }}>{fmt(exportRows.reduce((s,r)=>s+num(r.orders),0),0)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewTable({ rows, setModal, title }) {
  return (
    <div className="card mc-live-card">
      <h3>{title}</h3>
      <div className="table-scroll">
        <table className="data mc-live-summary-table">
          <thead><tr><th>วันที่</th><th>MC</th><th>บริษัท</th><th>Platform</th><th>เวลา</th><th className="num">ยอดขาย</th><th className="num">ออเดอร์</th><th>หลักฐาน</th><th>สถานะเช็ค</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="clickable-row" onClick={() => setModal({ type: 'docs', row: r })}>
                <td className="strong">{dateText(r.date)}</td>
                <td>{r.mc || '-'}</td>
                <td>{r.company || r.brand || '-'}</td>
                <td>{r.platform || '-'}</td>
                <td>{r.startTime || '-'} - {r.endTime || '-'} ({fmtHours(liveHours(r.startTime, r.endTime))})</td>
                <td className="num strong">{fmtMoney(r.actualSales)}</td>
                <td className="num">{fmt(r.orders, 0)}</td>
                <td><DocBadges docs={r.documents || {}} review={r.docReview} cameraType={r.cameraType} /></td>
                <td><StatusPill row={r} /></td>
                <td>
                  {!isApprovedRow(r) ? (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={e => {
                      e.stopPropagation();
                      setModal({ type: 'editRow', row: r });
                    }}>แก้ไข</button>
                  ) : <span className="badge green">ล็อก</span>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="10" className="empty-state">ยังไม่มีรายการที่ต้องตรวจ</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyApprovalView({ rows, reload, setMsg, setModal }) {
  const months = [...new Set(rows.map(r => monthText(r.date)).filter(Boolean))].sort().reverse();
  const [month, setMonth] = useState(months[0] || GO_LIVE_DATE.slice(0, 7));
  const [company, setCompany] = useState('ALL');
  const [filters, setFilters] = useState({ company: 'ALL', mc: 'ALL', platform: 'ALL', status: 'ALL' });
  useEffect(() => {
    if (!months.includes(month) && months[0]) setMonth(months[0]);
  }, [months.join('|')]);
  const monthRows = rows.filter(r => monthText(r.date) === month && (company === 'ALL' || (r.company || r.brand || 'TGM') === company));
  const detailRows = filterMcLiveRows(monthRows, filters);
  const detailSummary = buildSummary(detailRows);
  const summary = buildSummary(monthRows);
  const pending = monthRows.filter(r => !isDoneRow(r) || r.documentStatus !== 'COMPLETE' || !isReviewed(r));
  const approved = monthRows.length > 0 && monthRows.every(isApprovedRow);

  async function submit(action) {
    try {
      const res = await apiPatch('/ops/mc-live/month-review', { month, action, company });
      setMsg({ type: 'success', text: res.message });
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <>
      <div className="card mc-live-month-panel">
        <div>
          <h3>อนุมัติยอดจริงรายเดือน</h3>
          <p>เมื่ออนุมัติแล้ว รายการในเดือนนี้จะถูกล็อกเป็นยอดจริง ถ้าต้องแก้ให้กดเปิดเดือนกลับมาก่อน</p>
        </div>
        <label>เดือน
          <select value={month} onChange={e => setMonth(e.target.value)}>
            {months.length ? months.map(m => <option key={m} value={m}>{m}</option>) : <option value={month}>{month}</option>}
          </select>
        </label>
        <label>บริษัท
          <select value={company} onChange={e => {
            const nextCompany = e.target.value;
            setCompany(nextCompany);
            setFilters(f => ({ ...f, company: nextCompany }));
          }}>
            <option value="ALL">ทุกบริษัท</option>
            {COMPANIES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <div className="mc-live-month-actions">
          <button className="btn btn-green" disabled={!monthRows.length || pending.length > 0 || approved} onClick={() => submit('approve')}>อนุมัติยอดจริงเดือนนี้</button>
          <button className="btn btn-ghost" disabled={!approved} onClick={() => submit('reopen')}>เปิดเดือนกลับมาแก้ไข</button>
        </div>
      </div>
      <Hero summary={summary} start={month + '-01'} end={month + '-31'} />
      {pending.length > 0 && <Alert type="error">ยังอนุมัติไม่ได้: มีรายการที่ยังไม่จบ/หลักฐานไม่ครบ/หัวหน้ายังไม่เช็ค {pending.length} รายการ</Alert>}
      {approved && <Alert type="success">เดือนนี้ผู้บริหารอนุมัติแล้ว เป็นยอดจริงของเดือน</Alert>}
      <div className="mc-live-dashboard-grid">
        <div className="card mc-live-card"><h3>ยอดรายวันของเดือน</h3><DailyTable rows={summary.dailyRows} /></div>
        <div className="card mc-live-card"><h3>Performance รายคนของเดือน</h3><McRanking rows={summary.mcRows} /></div>
      </div>
      <div className="card mc-live-card">
        <div className="section-head-row">
          <div>
            <h3>ตรวจรายละเอียดก่อนอนุมัติ</h3>
            <p>เลือกดูเฉพาะรายคนหรือรายการที่ต้องเช็คก่อนล็อกยอดจริงของเดือน</p>
          </div>
          <strong>{fmt(detailRows.length, 0)} รายการ</strong>
        </div>
        <McLiveListFilters rows={monthRows} filters={filters} setFilters={setFilters} compact />
        <div className="mc-live-mini-stats">
          <StatTile label="ยอดที่เลือก" value={fmtMoney(detailSummary.totals.sales)} />
          <StatTile label="ชั่วโมง" value={fmtHours(detailSummary.totals.hours)} />
          <StatTile label="ออเดอร์" value={`${fmt(detailSummary.totals.orders, 0)} ออเดอร์`} />
          <StatTile label="รอเช็ค/รอแก้" value={`${fmt(detailSummary.totals.missingDocs, 0)} รายการ`} tone={detailSummary.totals.missingDocs ? 'warn' : 'good'} />
        </div>
        <ReviewTable rows={detailRows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))} setModal={setModal} title="รายการรายคนของเดือน" />
      </div>
    </>
  );
}

function TeamEntryView({ rows, busy, setBusy, setMsg, reload, isAdmin = false, allRows = [] }) {
  const blankForm = () => ({ company: 'TGM', cameraType: 'mobile', platform: 'TikTok', actualSales: '', date: GO_LIVE_DATE, startTime: '', endTime: '', orders: '', adsCost: '', coins: '', note: '', id: '', mc: '' });
  const [form, setForm] = useState(blankForm);
  const [formKey, setFormKey] = useState(1);
  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === 'company' && v === 'Nola') next.platform = 'TikTok';
    return next;
  });
  const previewHours = liveHours(form.startTime, form.endTime);
  const previewSales = num(form.actualSales);
  const previewOrders = num(form.orders);
  const salesPerHour = previewHours ? previewSales / previewHours : 0;
  const docsForForm = requiredDocs(form.cameraType);

  // ── Export ──
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [previewMode, setPreviewMode] = useState(''); // 'line' | 'table' | ''
  const exportRows = rows.filter(r => {
    if (exportStart && r.date < exportStart) return false;
    if (exportEnd && r.date > exportEnd) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  function buildLineReport() {
    if (!exportRows.length) return 'ไม่มีข้อมูลในช่วงที่เลือก';
    const byDate = {};
    exportRows.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
    let text = '';
    Object.entries(byDate).forEach(([date, sessions]) => {
      text += `📅 ${dateText(date)}\n`;
      sessions.forEach((r, i) => {
        const h = liveHours(r.startTime, r.endTime);
        text += `รอบที่ ${i + 1}: ${r.startTime || '?'}–${r.endTime || '?'} (${fmtHours(h)})\n`;
        text += `💰 ยอดขาย: ${fmtMoney(r.actualSales)} | ออเดอร์: ${fmt(r.orders, 0)}\n`;
        if (num(r.adsCost)) text += `📢 Ads: ${fmtMoney(r.adsCost)}\n`;
        if (r.note) text += `📝 ${r.note}\n`;
        text += '\n';
      });
      const ds = sessions.reduce((s, r) => s + num(r.actualSales), 0);
      const do_ = sessions.reduce((s, r) => s + num(r.orders), 0);
      text += `📈 รวมวัน: ${fmtMoney(ds)} | ${fmt(do_, 0)} ออเดอร์\n`;
      text += '─'.repeat(28) + '\n\n';
    });
    const total = exportRows.reduce((s, r) => s + num(r.actualSales), 0);
    const orders = exportRows.reduce((s, r) => s + num(r.orders), 0);
    text += `✅ รวม ${exportRows.length} session | ${fmtMoney(total)} | ${fmt(orders, 0)} ออเดอร์`;
    return text;
  }

  function handleCopyLine() {
    const text = buildLineReport();
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('✓ Copy แล้ว! วางใน LINE ได้เลย');
      setTimeout(() => setCopyMsg(''), 3000);
    }).catch(() => setCopyMsg('ไม่สามารถ copy ได้ กรุณา copy ด้วยตนเอง'));
  }

  function handleDownloadCsv() {
    if (!exportRows.length) return;
    const mcName = exportRows[0]?.mc || 'MC';
    const BOM = '﻿';
    const headers = ['วันที่', 'Platform', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'ชั่วโมง', 'ยอดขาย', 'ออเดอร์', 'Ads', 'Coins', 'หมายเหตุ'];
    const csvRows = [headers.join(',')];
    exportRows.forEach(r => {
      const h = liveHours(r.startTime, r.endTime).toFixed(1);
      csvRows.push([
        dateText(r.date), r.platform || '', r.startTime || '', r.endTime || '',
        h, num(r.actualSales), num(r.orders), num(r.adsCost), num(r.coins),
        '"' + String(r.note || '').replace(/"/g, '""') + '"'
      ].join(','));
    });
    const total = exportRows.reduce((s, r) => s + num(r.actualSales), 0);
    const orders = exportRows.reduce((s, r) => s + num(r.orders), 0);
    csvRows.push(['รวม', '', '', '', '', total, orders, '', '', ''].join(','));
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `MCLive_${mcName}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(e.currentTarget);
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      const res = await apiUpload('/ops/mc-live/mine', fd);
      setMsg({ type: 'success', text: res.message });
      setForm(blankForm());
      setFormKey(k => k + 1);
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  function edit(row) {
    setForm({
      id: row.id, company: row.company || row.brand || 'TGM', cameraType: row.cameraType || 'mobile', platform: row.platform || 'TikTok',
      actualSales: row.actualSales || '', date: dateText(row.date) || GO_LIVE_DATE, startTime: row.startTime || '', endTime: row.endTime || '',
      orders: row.orders || '', adsCost: row.adsCost || '', coins: row.coins || '', note: row.note || '', mc: row.mc || ''
    });
    setFormKey(k => k + 1);
  }

  return (
    <div className="mc-live-team-grid">
      <form className="card mc-live-entry-card" key={formKey} onSubmit={submit}>
        <h3>{form.id ? 'แก้ไข performance ของฉัน' : 'กรอก performance ของฉัน'}</h3>
        <div className="mc-live-entry-grid">
          <input type="hidden" name="id" value={form.id} />
          {isAdmin && (
            <label style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: 8, padding: '6px 10px' }}>
              กรอกแทน MC (admin)
              <select name="mc" value={form.mc} onChange={e => set('mc', e.target.value)}>
                <option value="">— กรอกในนามตัวเอง —</option>
                {mcNameOptions(allRows).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
          <label>บริษัท<select name="company" value={form.company} onChange={e => set('company', e.target.value)} required>{COMPANIES.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label>Platform<select name="platform" value={form.platform} onChange={e => set('platform', e.target.value)} required disabled={form.company === 'Nola'}><option value="TikTok">TikTok</option>{form.company !== 'Nola' && <option value="Shopee">Shopee</option>}</select></label>
          <label>กล้อง<select name="cameraType" value={form.cameraType} onChange={e => set('cameraType', e.target.value)} required>{CAMERA_TYPES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
          <label>จำนวนเงินที่ขายได้<input name="actualSales" type="number" min="0" step="0.01" value={form.actualSales} onChange={e => set('actualSales', e.target.value)} required /></label>
          <label>วันที่<input name="date" type="date" min={GO_LIVE_DATE} value={form.date} onChange={e => set('date', e.target.value)} required /></label>
          <label>เวลาเริ่มต้น<input name="startTime" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} required /></label>
          <label>เวลาสิ้นสุด<input name="endTime" type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} required /></label>
          <label>ออเดอร์<input name="orders" type="number" min="0" value={form.orders} onChange={e => set('orders', e.target.value)} /></label>
          <label>Ads<input name="adsCost" type="number" min="0" step="0.01" value={form.adsCost} onChange={e => set('adsCost', e.target.value)} /></label>
          <label>Coins<input name="coins" type="number" min="0" value={form.coins} onChange={e => set('coins', e.target.value)} /></label>
        </div>
        <div className="mc-live-form-preview">
          <div><span>ชั่วโมงไลฟ์ที่ระบบคิดให้</span><b>{fmtHours(previewHours)}</b></div>
          <div><span>จำนวนเงินที่ขายได้</span><b>{fmtMoney(previewSales)}</b></div>
          <div><span>จำนวนออเดอร์</span><b>{fmt(previewOrders, 0)} ออเดอร์</b></div>
          <div><span>ยอดขายต่อชั่วโมง</span><b>{fmtMoney(salesPerHour)}/ชม.</b></div>
        </div>
        <label>หมายเหตุ<textarea name="note" value={form.note} onChange={e => set('note', e.target.value)} placeholder="เช่น โปรโมชัน/ปัญหาระหว่างไลฟ์" /></label>
        <div className="mc-live-doc-grid">
          {docsForForm.map(([field, , label]) => <label key={field}>{label}<input name={field} type="file" accept="image/*" /></label>)}
        </div>
        <div className="mc-live-form-actions">
          <button className="btn btn-green" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกของฉัน'}</button>
          {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm(blankForm())}>ยกเลิกแก้ไข</button>}
        </div>
        <p className="mc-live-help">
          {form.company === 'Nola' ? 'Nola ใช้ TikTok เท่านั้น | ' : ''}
          {form.cameraType === 'obs' ? 'OBS แนบ 1 รูป: ภาพหน้าจอไลฟ์' : 'มือถือแนบครบ 3 รูป: ภาพหน้าจอไลฟ์, หน้ายอดขาย, หน้าจบไลฟ์'}
        </p>
      </form>

      <div className="card mc-live-card">
        <h3>รายการของฉัน</h3>
        <div className="table-scroll">
          <table className="data mc-live-summary-table">
            <thead><tr><th>วันที่</th><th>Platform</th><th className="num">ยอดขาย</th><th className="num">ออเดอร์</th><th>เวลา</th><th>เอกสาร</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="strong">{dateText(r.date)}</td>
                  <td>{r.company || r.brand || '-'} / {r.platform}</td>
                  <td className="num strong">{fmtMoney(r.actualSales)}</td>
                  <td className="num">{fmt(r.orders, 0)}</td>
                  <td>{r.startTime || '-'} - {r.endTime || '-'}</td>
                  <td><DocBadges docs={r.documents || {}} review={r.docReview} cameraType={r.cameraType} /></td>
                  <td><StatusPill row={r} /></td>
                  <td>{isApprovedRow(r) ? <span className="badge green">อนุมัติแล้ว</span> : <button className="btn btn-ghost btn-sm" onClick={() => edit(r)}>แก้ไข</button>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="8" className="empty-state">ยังไม่มีรายการของฉันตั้งแต่ 2026-08-01</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Export ── */}
      <div className="card mc-live-card" style={{ gridColumn: '1 / -1' }}>
        <h3 style={{ marginBottom: 12 }}>📤 ส่งออกรายงาน</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            เริ่ม<input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} style={{ fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
            ถึง<input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} style={{ fontSize: 13 }} />
          </label>
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'flex-end', marginBottom: 4 }}>
            {exportRows.length} session{exportRows.length ? ` | ${fmtMoney(exportRows.reduce((s,r)=>s+num(r.actualSales),0))}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn btn-ghost" onClick={handleCopyLine} disabled={!exportRows.length}>
            📋 Copy รายงาน LINE
          </button>
          <button className="btn btn-ghost" onClick={handleDownloadCsv} disabled={!exportRows.length}>
            ⬇️ Download Excel (.csv)
          </button>
          {exportRows.length > 0 && (
            <>
              <button className="btn btn-ghost" onClick={() => setPreviewMode(m => m === 'line' ? '' : 'line')}
                style={{ background: previewMode === 'line' ? '#edf6f6' : '' }}>
                👁 ดูตัวอย่าง LINE
              </button>
              <button className="btn btn-ghost" onClick={() => setPreviewMode(m => m === 'table' ? '' : 'table')}
                style={{ background: previewMode === 'table' ? '#edf6f6' : '' }}>
                📊 ดูตารางสรุป
              </button>
            </>
          )}
        </div>
        {copyMsg && <div style={{ color: '#10b981', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>{copyMsg}</div>}
        {exportRows.length === 0 && exportStart && (
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>ไม่มีข้อมูลในช่วงที่เลือก</div>
        )}

        {/* Preview LINE */}
        {previewMode === 'line' && exportRows.length > 0 && (
          <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflowY: 'auto', fontFamily: 'Kanit, sans-serif', color: '#1a2a3a' }}>
            {buildLineReport()}
          </pre>
        )}

        {/* Preview Table */}
        {previewMode === 'table' && exportRows.length > 0 && (() => {
          const byDate = {};
          exportRows.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
          const grandTotal = exportRows.reduce((s, r) => s + num(r.actualSales), 0);
          const grandOrders = exportRows.reduce((s, r) => s + num(r.orders), 0);
          return (
            <div className="table-scroll" style={{ marginTop: 8 }}>
              <table className="data" style={{ fontSize: 12, minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#1a2a3a', color: '#B2D8D8' }}>
                    <th>วันที่</th><th>รอบที่</th><th>Platform</th><th>เวลา</th><th className="num">ชั่วโมง</th>
                    <th className="num">ยอดขาย</th><th className="num">ออเดอร์</th><th className="num">Ads</th><th className="num">ยอด/ชม.</th><th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byDate).map(([date, sessions]) => {
                    const dayTotal = sessions.reduce((s, r) => s + num(r.actualSales), 0);
                    const dayOrders = sessions.reduce((s, r) => s + num(r.orders), 0);
                    const dayHours = sessions.reduce((s, r) => s + liveHours(r.startTime, r.endTime), 0);
                    return [
                      ...sessions.map((r, i) => {
                        const h = liveHours(r.startTime, r.endTime);
                        return (
                          <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                            {i === 0 && <td rowSpan={sessions.length} style={{ fontWeight: 700, verticalAlign: 'middle', borderRight: '2px solid #B2D8D8' }}>{dateText(date)}</td>}
                            <td style={{ textAlign: 'center', color: '#64748b' }}>รอบ {i + 1}</td>
                            <td>{r.platform}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{r.startTime}–{r.endTime}</td>
                            <td className="num">{h.toFixed(1)}</td>
                            <td className="num" style={{ fontWeight: 600, color: '#059669' }}>{fmtMoney(r.actualSales)}</td>
                            <td className="num">{fmt(r.orders, 0)}</td>
                            <td className="num" style={{ color: '#f97316' }}>{num(r.adsCost) ? fmtMoney(r.adsCost) : '—'}</td>
                            <td className="num" style={{ color: '#64748b', fontSize: 11 }}>{h > 0 ? fmtMoney(num(r.actualSales) / h) : '—'}</td>
                            <td style={{ fontSize: 11, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '—'}</td>
                          </tr>
                        );
                      }),
                      <tr key={date + '_sub'} style={{ background: '#f0fdf4', borderTop: '1px solid #d1fae5' }}>
                        <td /><td colSpan={3} style={{ fontWeight: 700, color: '#065f46', fontSize: 11 }}>รวมวัน {sessions.length} session | {dayHours.toFixed(1)} ชม.</td>
                        <td className="num" style={{ fontWeight: 800, color: '#065f46' }}>{fmtMoney(dayTotal)}</td>
                        <td className="num" style={{ fontWeight: 700, color: '#065f46' }}>{fmt(dayOrders, 0)}</td>
                        <td colSpan={3} />
                      </tr>
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1a2a3a' }}>
                    <td colSpan={4} style={{ color: '#B2D8D8', fontWeight: 700, padding: '8px 12px' }}>รวมทั้งหมด {exportRows.length} session</td>
                    <td className="num" style={{ color: '#B2D8D8' }}>{exportRows.reduce((s,r)=>s+liveHours(r.startTime,r.endTime),0).toFixed(1)}</td>
                    <td className="num" style={{ color: '#fff', fontWeight: 800 }}>{fmtMoney(grandTotal)}</td>
                    <td className="num" style={{ color: '#fff' }}>{fmt(grandOrders, 0)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DocBadges({ docs, review, cameraType = 'mobile' }) {
  return (
    <div className="mc-live-doc-badges">
      {requiredDocs(cameraType).map(([, key, label]) => {
        const url = docUrl(docs[key]);
        return url ? <a key={key} className="badge green" href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{label}</a> : <span key={key} className="badge red">{label}</span>;
      })}
      <span className="badge wait">{cameraType === 'obs' ? 'OBS' : 'มือถือ'}</span>
      {review?.rejected ? <span className="badge red">ส่งกลับแก้ไข</span> : review?.checked ? <span className="badge green">เช็คแล้ว</span> : <span className="badge wait">รอเช็ค</span>}
    </div>
  );
}

function StatusPill({ row }) {
  if (isApprovedRow(row)) return <span className="mc-live-status-pill approved">อนุมัติรายเดือนแล้ว</span>;
  if (row.docReview?.rejected) return <span className="mc-live-status-pill rejected">ส่งกลับแก้ไข</span>;
  if (isReviewed(row)) return <span className="mc-live-status-pill checked">หัวหน้าเช็คแล้ว</span>;
  if (row.documentStatus !== 'COMPLETE') return <span className="mc-live-status-pill missing">เอกสารไม่ครบ</span>;
  return <span className="mc-live-status-pill wait">รอเช็ค</span>;
}

function McLiveModal({ modal, onClose, canLead, reload, setMsg }) {
  const row = modal.row;
  const [rejectNote, setRejectNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [editRow, setEditRow] = useState(() => row ? {
    ...row,
    brand: row.brand || row.company || 'TGM',
    company: row.company || row.brand || 'TGM',
    date: dateText(row.date),
    actualSales: num(row.actualSales),
    orders: num(row.orders),
    adsCost: num(row.adsCost),
    coins: num(row.coins)
  } : null);
  async function reviewDocs(action = 'approve') {
    try {
      const res = await apiPatch('/ops/mc-live/' + encodeURIComponent(row.id) + '/review', {
        action,
        note: action === 'reject' ? rejectNote : ''
      });
      setMsg({ type: 'success', text: res.message });
      onClose();
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function saveRowEdit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...editRow,
        company: editRow.company || editRow.brand || 'TGM',
        brand: editRow.company || editRow.brand || 'TGM',
        actualSales: num(editRow.actualSales),
        orders: num(editRow.orders),
        adsCost: num(editRow.adsCost),
        coins: num(editRow.coins)
      };
      const res = await apiPost('/ops/mc-live', { rows: [payload] });
      setMsg({ type: 'success', text: res.message });
      onClose();
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  if (modal.type === 'perf') {
    const item = modal.item;
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel mc-live-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <h3>{modal.title}</h3>
          <div className="mc-live-modal-grid">
            <StatTile label="ยอดขายรวม" value={fmtMoney(item.sales)} />
            <StatTile label="จำนวนไลฟ์" value={fmt(item.lives, 0)} />
            <StatTile label="ชั่วโมงรวม" value={fmtHours(item.hours)} />
            <StatTile label="ออเดอร์" value={fmt(item.orders, 0)} />
            <StatTile label="ยอดขาย/ชั่วโมง" value={`${fmtMoney(item.sales / Math.max(item.hours, 1))}/ชม.`} />
          </div>
          <div className="mc-live-modal-platforms">
            <div><b>Shopee</b><span>{fmtMoney(item.shopeeSales)}</span><small>Ads {fmtMoney(item.shopeeAds)}</small></div>
            <div><b>TikTok</b><span>{fmtMoney(item.tiktokSales)}</span><small>Ads {fmtMoney(item.tiktokAds)}</small></div>
          </div>
        </div>
      </div>
    );
  }

  if (modal.type === 'editRow' && editRow) {
    const setEdit = (k, v) => setEditRow(r => {
      const next = { ...r, [k]: v };
      if (k === 'company' && v === 'Nola') next.platform = 'TikTok';
      return next;
    });
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <form className="modal-panel mc-live-modal mc-live-edit-modal" onClick={e => e.stopPropagation()} onSubmit={saveRowEdit}>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
          <h3>แก้ไขรายการไลฟ์</h3>
          <p className="soft-note">แก้เฉพาะรายการนี้ได้เลย ไม่ต้องเปิดตารางเต็ม รายการที่ผู้บริหารอนุมัติรายเดือนแล้วจะถูกล็อก</p>
          <div className="mc-live-entry-grid">
            <label>วันที่<input type="date" value={dateText(editRow.date)} onChange={e => setEdit('date', e.target.value)} /></label>
            <label>บริษัท
              <select value={editRow.company || editRow.brand || 'TGM'} onChange={e => setEdit('company', e.target.value)}>
                {COMPANIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>Platform
              <select value={editRow.platform || 'TikTok'} onChange={e => setEdit('platform', e.target.value)} disabled={(editRow.company || editRow.brand) === 'Nola'}>
                <option value="TikTok">TikTok</option>
                <option value="Shopee">Shopee</option>
              </select>
            </label>
            <label>MC<input list="mc-names" value={editRow.mc || ''} onChange={e => setEdit('mc', e.target.value)} /></label>
            <label>กล้อง
              <select value={editRow.cameraType || 'mobile'} onChange={e => setEdit('cameraType', e.target.value)}>
                {CAMERA_TYPES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            <label>เวลาเริ่ม<input type="time" value={editRow.startTime || ''} onChange={e => setEdit('startTime', e.target.value)} /></label>
            <label>เวลาสิ้นสุด<input type="time" value={editRow.endTime || ''} onChange={e => setEdit('endTime', e.target.value)} /></label>
            <label>ยอดขาย<input type="number" value={editRow.actualSales || 0} onChange={e => setEdit('actualSales', e.target.value)} /></label>
            <label>ออเดอร์<input type="number" value={editRow.orders || 0} onChange={e => setEdit('orders', e.target.value)} /></label>
            <label>Ads<input type="number" value={editRow.adsCost || 0} onChange={e => setEdit('adsCost', e.target.value)} /></label>
            <label>Coins<input type="number" value={editRow.coins || 0} onChange={e => setEdit('coins', e.target.value)} /></label>
            <label>สถานะ
              <select value={editRow.status || 'PLANNED'} onChange={e => setEdit('status', e.target.value)}>
                {STATUSES.filter(s => s !== 'APPROVED').map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <label className="wide-label">หัวข้อ / หมายเหตุ
            <textarea value={editRow.planTopic || editRow.note || ''} onChange={e => setEdit('planTopic', e.target.value)} />
          </label>
          <div className="mc-live-form-preview">
            <div><span>ชั่วโมง</span><b>{fmtHours(liveHours(editRow.startTime, editRow.endTime))}</b></div>
            <div><span>ยอด/ชั่วโมง</span><b>{fmtMoney(num(editRow.actualSales) / Math.max(liveHours(editRow.startTime, editRow.endTime), 1))}/ชม.</b></div>
            <div><span>ออเดอร์</span><b>{fmt(num(editRow.orders), 0)}</b></div>
          </div>
          <div className="mc-live-form-actions">
            <button className="btn btn-green" type="submit">บันทึกรายการนี้</button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>ยกเลิก</button>
          </div>
          <datalist id="mc-names">{MC_NAMES.map(n => <option key={n} value={n} />)}</datalist>
        </form>
      </div>
    );
  }

  const docs = row.documents || {};
  const canReview = canLead && !isApprovedRow(row);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel mc-live-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>ตรวจหลักฐานไลฟ์</h3>
        <div className="mc-live-modal-meta">
          <b>{row.mc || '-'}</b>
          <span>{dateText(row.date)} | {row.company || row.brand || '-'} | {row.platform || '-'} | {row.cameraType === 'obs' ? 'OBS' : 'มือถือ'} | {row.startTime || '-'} - {row.endTime || '-'} ({fmtHours(liveHours(row.startTime, row.endTime))})</span>
          <strong>{fmtMoney(row.actualSales)}</strong>
          <em>{checkedText(row.docReview)}</em>
        </div>
        {row.docReview?.note && <div className="mc-live-review-note">หมายเหตุล่าสุด: {row.docReview.note}</div>}
        <div className="mc-live-doc-modal-grid">
          {requiredDocs(row.cameraType).map(([, key, label]) => {
            const url = docUrl(docs[key]);
            return (
              <div className="mc-live-doc-tile" key={key}>
                <span>{label}</span>
                {url ? (
                  <>
                    <button className="mc-live-preview-thumb" type="button" onClick={() => setPreview({ url, label })}>
                      <img src={url} alt={label} />
                    </button>
                    <div className="mc-live-doc-actions">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreview({ url, label })}>Preview</button>
                      <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">เปิดแท็บใหม่</a>
                    </div>
                  </>
                ) : <b className="badge red">ยังไม่มีรูป</b>}
              </div>
            );
          })}
        </div>
        <div className="mc-live-guide">
          <b>คู่มือเช็ค</b>
          <p>1. ภาพไลฟ์ต้องเห็นว่าเริ่มไลฟ์จริงและตรงกับ platform</p>
          {row.cameraType === 'obs'
            ? <p>2. OBS ใช้ภาพหน้าจอเดียว แต่ต้องเห็นภาพรวมที่ยืนยันการไลฟ์และ platform ได้</p>
            : <>
              <p>2. หน้ายอดขายต้องตรงกับยอดที่ทีมกรอก</p>
              <p>3. หน้าจบไลฟ์ต้องยืนยันเวลาจบหรือผลหลังจบไลฟ์</p>
            </>}
        </div>
        {canReview && (
          <div className="mc-live-review-actions">
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="ถ้าไม่ตรง ให้พิมพ์เหตุผลที่ต้องแก้ เช่น ยอดไม่ตรง / รูปไม่ครบ / platform ไม่ตรง" />
            <div>
              <button className="btn btn-green" onClick={() => reviewDocs('approve')}>เช็คแล้ว ถูกต้องครบถ้วน</button>
              <button className="btn btn-ghost" onClick={() => reviewDocs('reject')}>ส่งกลับไปแก้ไข</button>
            </div>
          </div>
        )}
        {preview && (
          <div className="image-preview-backdrop" onClick={() => setPreview(null)}>
            <div className="image-preview-panel" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setPreview(null)}>×</button>
              <b>{preview.label}</b>
              <img src={preview.url} alt={preview.label} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditTable({ rows, update, setData, setMsg, saveAll, busy, canExecutive }) {
  const [filters, setFilters] = useState({ company: 'ALL', mc: 'ALL', platform: 'ALL', status: 'ALL', start: '', end: '' });
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => filterMcLiveRows([row], filters).length);
  const updateCompany = (i, value) => {
    update(i, 'brand', value);
    update(i, 'company', value);
    if (value === 'Nola') update(i, 'platform', 'TikTok');
  };

  return (
    <>
      <div className="toolbar mc-live-toolbar">
        <button className="btn btn-ghost" onClick={() => setData(d => ({ ...d, rows: [...(d?.rows || []), { ...EMPTY }] }))}>+ เพิ่มไลฟ์</button>
        <button className="btn btn-green" disabled={busy} onClick={saveAll}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
        {!canExecutive && <span className="soft-note">รายการที่ผู้บริหารอนุมัติรายเดือนแล้วจะแก้ไม่ได้</span>}
      </div>
      <div className="card mc-live-card">
        <div className="section-head-row">
          <div>
            <h3>เลือกดูเฉพาะรายการที่ต้องแก้</h3>
            <p>กรอง MC, platform, status หรือช่วงวันที่ก่อนแก้ จะได้ไม่เห็นฟิลด์เยอะเกินไป</p>
          </div>
          <strong>{fmt(visibleRows.length, 0)} / {fmt(rows.length, 0)} รายการ</strong>
        </div>
        <McLiveListFilters rows={rows} filters={filters} setFilters={setFilters} />
      </div>
      <div className="card table-scroll">
        <table className="data" style={{ fontSize: 12 }}>
          <thead><tr><th>วันที่</th><th>บริษัท</th><th>แพลตฟอร์ม</th><th>MC</th><th>เวลา</th><th>หัวข้อ</th><th className="num">ยอดจริง</th><th className="num">ออเดอร์</th><th className="num">Ads</th><th>สถานะ</th><th>เอกสาร</th><th></th></tr></thead>
          <tbody>{visibleRows.map(({ row: r, index: i }) => {
            const locked = isApprovedRow(r) && !canExecutive;
            const companyValue = r.company || r.brand || 'TGM';
            return (
              <tr key={r.id || i}>
                <td><input type="date" value={dateText(r.date)} onChange={e => update(i, 'date', e.target.value)} disabled={locked} /></td>
                <td><select value={companyValue} onChange={e => updateCompany(i, e.target.value)} disabled={locked}>{COMPANIES.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
                <td><select value={companyValue === 'Nola' ? 'TikTok' : (r.platform || '')} onChange={e => update(i, 'platform', e.target.value)} disabled={locked || companyValue === 'Nola'}><option value="">-</option><option value="TikTok">TikTok</option>{companyValue !== 'Nola' && <option value="Shopee">Shopee</option>}</select></td>
                <td><input list="mc-names" value={r.mc || ''} onChange={e => update(i, 'mc', e.target.value)} style={{ width: 90 }} disabled={locked} /></td>
                <td><input value={r.startTime || ''} onChange={e => update(i, 'startTime', e.target.value)} style={{ width: 62 }} disabled={locked} /> - <input value={r.endTime || ''} onChange={e => update(i, 'endTime', e.target.value)} style={{ width: 62 }} disabled={locked} /></td>
                <td><input value={r.planTopic || ''} onChange={e => update(i, 'planTopic', e.target.value)} style={{ minWidth: 120 }} disabled={locked} /></td>
                <td><input type="text" value={(Number(r.actualSales)||0).toLocaleString('th-TH')} onChange={e => update(i, 'actualSales', e.target.value.replace(/,/g, ''))} style={{ width: 100, textAlign: 'right' }} disabled={locked} /></td>
                <td><input type="number" value={r.orders || 0} onChange={e => update(i, 'orders', e.target.value)} style={{ width: 70, textAlign: 'right' }} disabled={locked} /></td>
                <td><input type="text" value={(Number(r.adsCost)||0).toLocaleString('th-TH')} onChange={e => update(i, 'adsCost', e.target.value.replace(/,/g, ''))} style={{ width: 90, textAlign: 'right' }} disabled={locked} /></td>
                <td><select value={r.status || 'PLANNED'} onChange={e => update(i, 'status', e.target.value)} disabled={locked}>{STATUSES.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
                <td><select value={r.documentStatus || 'MISSING'} onChange={e => update(i, 'documentStatus', e.target.value)} disabled={locked}><option value="MISSING">MISSING</option><option value="PARTIAL">PARTIAL</option><option value="COMPLETE">COMPLETE</option></select></td>
                <td>{locked ? <span className="badge green">ล็อกแล้ว</span> : <button className="btn btn-ghost btn-sm" onClick={async () => {
                  if (!confirm('ลบไลฟ์ "' + (r.planTopic || r.date) + '" ?')) return;
                  try {
                    if (r.id) await apiDelete('/ops/mc-live/' + encodeURIComponent(r.id));
                    setData(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
                  } catch (err) { setMsg({ type: 'error', text: err.message }); }
                }}>ลบ</button>}</td>
              </tr>
            );
          })}
          {!visibleRows.length && <tr><td colSpan="12" className="empty-state">ยังไม่มีรายการตามตัวกรองนี้</td></tr>}
          </tbody>
        </table>
        <datalist id="mc-names">{MC_NAMES.map(n => <option key={n} value={n} />)}</datalist>
      </div>
    </>
  );
}
