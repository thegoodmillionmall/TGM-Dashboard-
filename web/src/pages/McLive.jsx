import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiUpload, fmt, fmtMoney, getUser } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const STATUSES = ['PLANNED', 'LIVE', 'DONE', 'CANCELLED'];
const GO_LIVE_DATE = '2026-08-01';
const EMPTY = {
  id: '', date: '', brand: '', platform: '', mc: '', startTime: '', endTime: '', planTopic: '',
  targetSales: 0, actualSales: 0, orders: 0, viewers: 0, peakCcu: 0, comments: 0, clicks: 0,
  addToCart: 0, coins: 0, adsCost: 0, status: 'PLANNED', documentStatus: 'MISSING',
  documentLinks: '', attachmentNames: '', note: ''
};
const DOCS = [
  ['liveImage', 'live', 'ภาพหน้าจอที่ไลฟ์'],
  ['salesImage', 'sales', 'หน้ายอดขาย'],
  ['endImage', 'end', 'หน้าจบไลฟ์'],
];

const num = v => Number(v || 0) || 0;
const dateText = v => String(v || '').slice(0, 10);
const platformKey = v => String(v || '').toLowerCase().includes('shopee') ? 'Shopee' : 'TikTok';
const docUrl = doc => doc?.url || '';
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

function addSum(map, key, row) {
  const item = map.get(key) || {
    key, date: row.date, mc: row.mc, lives: 0, hours: 0, sales: 0, ads: 0, coins: 0,
    shopeeSales: 0, tiktokSales: 0, shopeeAds: 0, tiktokAds: 0
  };
  const platform = platformKey(row.platform);
  const sales = num(row.actualSales);
  const ads = num(row.adsCost);
  item.lives += 1;
  item.hours += liveHours(row.startTime, row.endTime);
  item.sales += sales;
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
  const canManage = user?.role === 'ADMIN' || user?.role === 'UPLOADER';
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [view, setView] = useState(canManage ? 'summary' : 'mine');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef(null);

  async function load() {
    try {
      const [allRows, myRows] = await Promise.all([
        apiGet('/ops/mc-live', { status }),
        apiGet('/ops/mc-live/mine')
      ]);
      setData(allRows);
      setMine(myRows);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }
  useEffect(() => { load(); }, [status]);

  const rows = data?.rows || [];
  const filteredRows = useMemo(() => rows.filter(r => {
    const d = dateText(r.date);
    return (!start || d >= start) && (!end || d <= end);
  }), [rows, start, end]);

  const summary = useMemo(() => buildSummary(filteredRows), [filteredRows]);
  const update = (i, k, v) => setData(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  async function saveAll() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/ops/mc-live', { rows });
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
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

  return (
    <div className="mc-live-page">
      <div className="page-title">MC Live Planner</div>
      <div className="page-sub">เริ่มใช้จริง 2026-08-01 | ทีมกรอกของตัวเอง ผู้บริหารดู performance รายคน</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="mc-live-view-tabs">
        <button className={'btn ' + (view === 'summary' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('summary')}>ผู้บริหาร</button>
        <button className={'btn ' + (view === 'mine' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('mine')}>กรอกของฉัน</button>
        {canManage && <button className={'btn ' + (view === 'edit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('edit')}>แก้ไขตาราง</button>}
      </div>

      {view === 'summary' && (
        <>
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
              <StatTile label="ค่า Ads" value={fmtMoney(summary.totals.ads)} tone="warn" />
              <StatTile label="เอกสารไม่ครบ" value={fmt(summary.totals.missingDocs, 0)} tone="bad" />
            </div>
          </div>

          <div className="toolbar mc-live-toolbar">
            <label>สถานะ
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="ALL">ทั้งหมด</option>
                {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
            {canManage && <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>↑ นำเข้า Excel เก่า</button>}
          </div>
        </>
      )}

      {!data || !mine ? <Loading /> : view === 'summary' ? (
        <SummaryView rows={filteredRows} summary={summary} />
      ) : view === 'mine' ? (
        <TeamEntryView rows={mine.rows || []} busy={busy} setBusy={setBusy} setMsg={setMsg} reload={load} />
      ) : (
        <EditTable rows={rows} update={update} setData={setData} setMsg={setMsg} saveAll={saveAll} busy={busy} />
      )}
    </div>
  );
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
    acc.ads += num(r.adsCost);
    acc.coins += num(r.coins);
    acc.orders += num(r.orders);
    if (r.status === 'DONE') acc.done += 1;
    if (r.status === 'DONE' && r.documentStatus !== 'COMPLETE') acc.missingDocs += 1;
    return acc;
  }, { lives: 0, done: 0, hours: 0, sales: 0, ads: 0, coins: 0, orders: 0, missingDocs: 0 });
  return { dailyRows, mcRows, mcNames, pivot, totals };
}

function SummaryView({ rows, summary }) {
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
          <div className="mc-live-rank">
            {summary.mcRows.slice(0, 8).map((r, i) => {
              const maxSales = Math.max(summary.mcRows[0]?.sales || 1, 1);
              return (
                <div className="mc-live-rank-row" key={r.key}>
                  <div className="rank-no">{i + 1}</div>
                  <div className="mc-live-rank-body">
                    <div className="mc-live-rank-head"><b>{r.key}</b><strong>{fmtMoney(r.sales)}</strong></div>
                    <div className="mc-live-rank-meta">{fmt(r.lives, 0)} ไลฟ์ | {fmtHours(r.hours)} | เฉลี่ย {fmtMoney(r.sales / Math.max(r.hours, 1))}/ชม.</div>
                    <div className="mc-live-bar"><span style={{ width: `${Math.max(4, (r.sales / maxSales) * 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card mc-live-card mc-live-daily-card">
          <h3>สรุปยอดรายวัน</h3>
          <DailyTable rows={summary.dailyRows} />
        </div>
      </div>
      <div className="card mc-live-card">
        <h3>Performance รายคน แยกตามวัน</h3>
        <div className="mc-live-day-list">
          {summary.dailyRows.map(day => {
            const items = summary.mcNames.map(mc => summary.pivot.get(`${day.key}__${mc}`)).filter(item => item && (item.sales || item.ads || item.coins || item.lives));
            return (
              <div className="mc-live-day-card" key={day.key}>
                <div className="mc-live-day-head"><div><b>{day.key}</b><span>{fmt(day.lives, 0)} ไลฟ์ | {fmtHours(day.hours)}</span></div><strong>{fmtMoney(day.sales)}</strong></div>
                <div className="mc-live-day-grid">
                  {items.map(item => <McPerfCard key={item.key} item={item} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card mc-live-card">
        <h3>ตรวจหลักฐานที่แนบล่าสุด</h3>
        <div className="table-scroll">
          <table className="data mc-live-summary-table">
            <thead><tr><th>วันที่</th><th>MC</th><th>Platform</th><th>เวลา</th><th className="num">ยอดขาย</th><th>หลักฐาน</th></tr></thead>
            <tbody>
              {rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(r => (
                <tr key={r.id}>
                  <td className="strong">{dateText(r.date)}</td>
                  <td>{r.mc || '-'}</td>
                  <td>{r.platform || '-'}</td>
                  <td>{r.startTime || '-'} - {r.endTime || '-'} ({fmtHours(liveHours(r.startTime, r.endTime))})</td>
                  <td className="num strong">{fmtMoney(r.actualSales)}</td>
                  <td><DocBadges docs={r.documents || {}} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DailyTable({ rows }) {
  return (
    <div className="table-scroll">
      <table className="data mc-live-summary-table">
        <thead><tr><th>วันที่</th><th className="num">Shopee</th><th className="num">TikTok</th><th className="num">ยอดรวม</th><th className="num">Ads</th><th className="num">ชั่วโมง</th><th className="num">ไลฟ์</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.key}><td className="strong">{r.key}</td><td className="num">{fmtMoney(r.shopeeSales)}</td><td className="num">{fmtMoney(r.tiktokSales)}</td><td className="num strong">{fmtMoney(r.sales)}</td><td className="num">{fmtMoney(r.ads)}</td><td className="num">{fmtHours(r.hours)}</td><td className="num">{fmt(r.lives, 0)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function McPerfCard({ item }) {
  return (
    <div className="mc-live-mc-card">
      <div className="mc-live-mc-head"><b>{item.key}</b><strong>{fmtMoney(item.sales)}</strong></div>
      <div className="mc-live-mc-hours">{fmt(item.lives, 0)} ไลฟ์ | {fmtHours(item.hours)} | {fmtMoney(item.sales / Math.max(item.hours, 1))}/ชม.</div>
      <div className="mc-live-platform-lines">
        <div><span className="tag sp">SP</span><b>{fmtMoney(item.shopeeSales)}</b><small>Ads {fmtMoney(item.shopeeAds)}</small></div>
        <div><span className="tag tt">TT</span><b>{fmtMoney(item.tiktokSales)}</b><small>Ads {fmtMoney(item.tiktokAds)}</small></div>
      </div>
    </div>
  );
}

function TeamEntryView({ rows, busy, setBusy, setMsg, reload }) {
  const [form, setForm] = useState({ platform: 'TikTok', actualSales: '', date: GO_LIVE_DATE, startTime: '', endTime: '', orders: '', adsCost: '', coins: '', note: '', id: '' });
  const [formKey, setFormKey] = useState(1);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const previewHours = liveHours(form.startTime, form.endTime);
  const previewSales = num(form.actualSales);
  const previewOrders = num(form.orders);
  const salesPerHour = previewHours ? previewSales / previewHours : 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(e.currentTarget);
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      const res = await apiUpload('/ops/mc-live/mine', fd);
      setMsg({ type: 'success', text: res.message });
      setForm({ platform: 'TikTok', actualSales: '', date: GO_LIVE_DATE, startTime: '', endTime: '', orders: '', adsCost: '', coins: '', note: '', id: '' });
      setFormKey(k => k + 1);
      reload();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  function edit(row) {
    setForm({
      id: row.id, platform: row.platform || 'TikTok', actualSales: row.actualSales || '',
      date: dateText(row.date) || GO_LIVE_DATE, startTime: row.startTime || '', endTime: row.endTime || '',
      orders: row.orders || '', adsCost: row.adsCost || '', coins: row.coins || '', note: row.note || ''
    });
    setFormKey(k => k + 1);
  }

  return (
    <div className="mc-live-team-grid">
      <form className="card mc-live-entry-card" key={formKey} onSubmit={submit}>
        <h3>{form.id ? 'แก้ไข performance ของฉัน' : 'กรอก performance ของฉัน'}</h3>
        <div className="mc-live-entry-grid">
          <input type="hidden" name="id" value={form.id} />
          <label>Platform<select name="platform" value={form.platform} onChange={e => set('platform', e.target.value)} required><option value="TikTok">TikTok</option><option value="Shopee">Shopee</option></select></label>
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
          {DOCS.map(([field, , label]) => <label key={field}>{label}<input name={field} type="file" accept="image/*" /></label>)}
        </div>
        <div className="mc-live-form-actions">
          <button className="btn btn-green" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกของฉัน'}</button>
          {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm({ platform: 'TikTok', actualSales: '', date: GO_LIVE_DATE, startTime: '', endTime: '', orders: '', adsCost: '', coins: '', note: '', id: '' })}>ยกเลิกแก้ไข</button>}
        </div>
        <p className="mc-live-help">ต้องแนบครบ 3 รูป: หน้าจอที่ไลฟ์, หน้ายอดขาย, หน้าจบไลฟ์</p>
      </form>

      <div className="card mc-live-card">
        <h3>รายการของฉัน</h3>
        <div className="table-scroll">
          <table className="data mc-live-summary-table">
            <thead><tr><th>วันที่</th><th>Platform</th><th className="num">ยอดขาย</th><th>เวลา</th><th>เอกสาร</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="strong">{dateText(r.date)}</td><td>{r.platform}</td><td className="num strong">{fmtMoney(r.actualSales)}</td><td>{r.startTime || '-'} - {r.endTime || '-'}</td>
                  <td><DocBadges docs={r.documents || {}} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => edit(r)}>แก้ไข</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="6" className="empty-state">ยังไม่มีรายการของฉันตั้งแต่ 2026-08-01</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DocBadges({ docs }) {
  return <div className="mc-live-doc-badges">{DOCS.map(([, key, label]) => {
    const url = docUrl(docs[key]);
    return url ? <a key={key} className="badge green" href={url} target="_blank" rel="noreferrer">{label}</a> : <span key={key} className="badge red">{label}</span>;
  })}</div>;
}

function EditTable({ rows, update, setData, setMsg, saveAll, busy }) {
  return (
    <>
      <div className="toolbar mc-live-toolbar">
        <button className="btn btn-ghost" onClick={() => setData(d => ({ ...d, rows: [...(d?.rows || []), { ...EMPTY }] }))}>+ เพิ่มไลฟ์</button>
        <button className="btn btn-green" disabled={busy} onClick={saveAll}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
      </div>
      <div className="card table-scroll">
        <table className="data" style={{ fontSize: 12 }}>
          <thead><tr><th>วันที่</th><th>แบรนด์</th><th>แพลตฟอร์ม</th><th>MC</th><th>เวลา</th><th>หัวข้อ</th><th className="num">ยอดจริง</th><th className="num">Ads</th><th>สถานะ</th><th>เอกสาร</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id || i}>
              <td><input type="date" value={dateText(r.date)} onChange={e => update(i, 'date', e.target.value)} /></td>
              <td><input value={r.brand || ''} onChange={e => update(i, 'brand', e.target.value)} style={{ width: 90 }} /></td>
              <td><select value={r.platform || ''} onChange={e => update(i, 'platform', e.target.value)}><option value="">-</option><option value="TikTok">TikTok</option><option value="Shopee">Shopee</option></select></td>
              <td><input value={r.mc || ''} onChange={e => update(i, 'mc', e.target.value)} style={{ width: 90 }} /></td>
              <td><input value={r.startTime || ''} onChange={e => update(i, 'startTime', e.target.value)} style={{ width: 62 }} /> - <input value={r.endTime || ''} onChange={e => update(i, 'endTime', e.target.value)} style={{ width: 62 }} /></td>
              <td><input value={r.planTopic || ''} onChange={e => update(i, 'planTopic', e.target.value)} style={{ minWidth: 120 }} /></td>
              <td><input type="number" value={r.actualSales || 0} onChange={e => update(i, 'actualSales', e.target.value)} style={{ width: 90, textAlign: 'right' }} /></td>
              <td><input type="number" value={r.adsCost || 0} onChange={e => update(i, 'adsCost', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
              <td><select value={r.status || 'PLANNED'} onChange={e => update(i, 'status', e.target.value)}>{STATUSES.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
              <td><select value={r.documentStatus || 'MISSING'} onChange={e => update(i, 'documentStatus', e.target.value)}><option value="MISSING">MISSING</option><option value="PARTIAL">PARTIAL</option><option value="COMPLETE">COMPLETE</option></select></td>
              <td><button className="btn btn-ghost btn-sm" onClick={async () => {
                if (!confirm('ลบไลฟ์ "' + (r.planTopic || r.date) + '" ?')) return;
                try {
                  if (r.id) await apiDelete('/ops/mc-live/' + encodeURIComponent(r.id));
                  setData(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
                } catch (err) { setMsg({ type: 'error', text: err.message }); }
              }}>ลบ</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
