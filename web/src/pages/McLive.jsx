import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiUpload, fmt, fmtMoney } from '../api.js';
import { Alert, Loading, Kpi } from '../components/ui.jsx';

const STATUSES = ['PLANNED', 'LIVE', 'DONE', 'CANCELLED'];

const EMPTY = {
  id: '', date: '', brand: '', platform: '', mc: '', startTime: '', endTime: '', planTopic: '',
  targetSales: 0, actualSales: 0, orders: 0, viewers: 0, peakCcu: 0, comments: 0, clicks: 0,
  addToCart: 0, coins: 0, adsCost: 0, status: 'PLANNED', documentStatus: 'MISSING',
  documentLinks: '', attachmentNames: '', note: ''
};

const num = v => Number(v || 0) || 0;
const dateText = v => String(v || '').slice(0, 10);
const platformKey = v => String(v || '').toLowerCase().includes('shopee') ? 'Shopee' : 'TikTok';

function monthLabel(value) {
  if (!value) return '-';
  const [y, m] = String(value).split('-');
  return `${m}/${y}`;
}

function addSum(map, key, row) {
  const item = map.get(key) || {
    key, date: row.date, mc: row.mc, lives: 0, sales: 0, ads: 0, coins: 0,
    shopeeSales: 0, tiktokSales: 0, shopeeAds: 0, tiktokAds: 0
  };
  const platform = platformKey(row.platform);
  const sales = num(row.actualSales);
  const ads = num(row.adsCost);
  item.lives += 1;
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

function CompactMoney({ value }) {
  return <span className="num strong">{fmtMoney(value)}</span>;
}

export default function McLive() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [view, setView] = useState('summary');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = React.useRef(null);

  async function load() {
    try {
      const res = await apiGet('/ops/mc-live', { status });
      setData(res);
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

  const summary = useMemo(() => {
    const daily = new Map();
    const mc = new Map();
    const pivot = new Map();
    for (const row of filteredRows) {
      const d = dateText(row.date);
      if (!d) continue;
      addSum(daily, d, { ...row, date: d });
      addSum(mc, row.mc || 'ไม่ระบุ MC', row);
      const pKey = `${d}__${row.mc || 'ไม่ระบุ MC'}`;
      addSum(pivot, pKey, { ...row, date: d });
    }

    const dailyRows = [...daily.values()].sort((a, b) => a.key.localeCompare(b.key));
    const mcRows = [...mc.values()].sort((a, b) => b.sales - a.sales);
    const mcNames = mcRows.map(r => r.key).slice(0, 12);
    const totals = filteredRows.reduce((acc, r) => {
      acc.lives += 1;
      acc.sales += num(r.actualSales);
      acc.ads += num(r.adsCost);
      acc.coins += num(r.coins);
      acc.orders += num(r.orders);
      if (r.status === 'DONE') acc.done += 1;
      if (r.status === 'DONE' && r.documentStatus !== 'COMPLETE') acc.missingDocs += 1;
      return acc;
    }, { lives: 0, done: 0, sales: 0, ads: 0, coins: 0, orders: 0, missingDocs: 0 });

    return { dailyRows, mcRows, mcNames, pivot, totals };
  }, [filteredRows]);

  const update = (i, k, v) => setData(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  async function save() {
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
      <div className="page-sub">วางแผนตารางไลฟ์ บันทึกผล และดูสรุปทีมไลฟ์</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="kpis">
        <Kpi label="ไลฟ์ทั้งหมด" value={summary.totals.lives} format="num" />
        <Kpi label="จบแล้ว" value={summary.totals.done} format="num" tone="green" />
        <Kpi label="ยอดขายรวม" value={summary.totals.sales} tone="blue" />
        <Kpi label="ออเดอร์" value={summary.totals.orders} format="num" />
        <Kpi label="ค่า Ads" value={summary.totals.ads} />
        <Kpi label="Coins" value={summary.totals.coins} format="num" />
        <Kpi label="เอกสารไม่ครบ" value={summary.totals.missingDocs} format="num" tone="red" />
      </div>

      <div className="toolbar">
        <label>สถานะ
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="ALL">ทั้งหมด</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <button className={'btn ' + (view === 'summary' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('summary')}>สรุปอ่านง่าย</button>
        <button className={'btn ' + (view === 'edit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('edit')}>แก้ไขรายการ</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>↑ นำเข้า Excel ทีมไลฟ์</button>
        <button className="btn btn-ghost" onClick={() => setData(d => ({ ...d, rows: [...(d?.rows || []), { ...EMPTY }] }))}>+ เพิ่มไลฟ์</button>
        <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
      </div>

      {!data ? <Loading /> : view === 'summary' ? (
        <SummaryView rows={filteredRows} summary={summary} />
      ) : (
        <EditTable rows={rows} update={update} setData={setData} setMsg={setMsg} />
      )}
    </div>
  );
}

function SummaryView({ rows, summary }) {
  if (!rows.length) {
    return <div className="card empty-state">ยังไม่มีข้อมูลตามเงื่อนไขที่เลือก</div>;
  }

  return (
    <>
      <div className="grid2">
        <div className="card mc-live-card">
          <h3>สรุปยอดรายวัน</h3>
          <div className="table-scroll">
            <table className="data mc-live-summary-table">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th className="num">Shopee</th>
                  <th className="num">TikTok</th>
                  <th className="num">ยอดรวม</th>
                  <th className="num">Ads</th>
                  <th className="num">Coins</th>
                  <th className="num">ไลฟ์</th>
                </tr>
              </thead>
              <tbody>
                {summary.dailyRows.map(r => (
                  <tr key={r.key}>
                    <td className="strong">{r.key}</td>
                    <td className="num">{fmtMoney(r.shopeeSales)}</td>
                    <td className="num">{fmtMoney(r.tiktokSales)}</td>
                    <td><CompactMoney value={r.sales} /></td>
                    <td className="num">{fmtMoney(r.ads)}</td>
                    <td className="num">{fmt(r.coins, 0)}</td>
                    <td className="num">{fmt(r.lives, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card mc-live-card">
          <h3>อันดับ MC ตามยอดขาย</h3>
          <div className="mc-live-rank">
            {summary.mcRows.slice(0, 8).map((r, i) => (
              <div className="mc-live-rank-row" key={r.key}>
                <div className="rank-no">{i + 1}</div>
                <div>
                  <b>{r.key}</b>
                  <span>{fmt(r.lives, 0)} ไลฟ์ | Shopee {fmtMoney(r.shopeeSales)} | TikTok {fmtMoney(r.tiktokSales)}</span>
                </div>
                <strong>{fmtMoney(r.sales)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mc-live-card">
        <h3>ตารางเทียบรายวันตาม MC</h3>
        <div className="table-scroll">
          <table className="data mc-live-pivot">
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">รวม</th>
                {summary.mcNames.map(mc => <th key={mc}>{mc}</th>)}
              </tr>
            </thead>
            <tbody>
              {summary.dailyRows.map(day => (
                <tr key={day.key}>
                  <td className="strong">{day.key}</td>
                  <td><CompactMoney value={day.sales} /></td>
                  {summary.mcNames.map(mc => {
                    const item = summary.pivot.get(`${day.key}__${mc}`);
                    return (
                      <td key={mc} className="mc-live-pivot-cell">
                        {item ? (
                          <>
                            <div><b>SP</b> {fmtMoney(item.shopeeSales)} <small>Ads {fmtMoney(item.shopeeAds)}</small></div>
                            <div><b>TT</b> {fmtMoney(item.tiktokSales)} <small>Ads {fmtMoney(item.tiktokAds)}</small></div>
                          </>
                        ) : <span className="muted">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function EditTable({ rows, update, setData, setMsg }) {
  return (
    <div className="card table-scroll">
      <table className="data" style={{ fontSize: 12 }}>
        <thead><tr>
          <th>วันที่</th><th>แบรนด์</th><th>แพลตฟอร์ม</th><th>MC</th><th>เวลา</th><th>หัวข้อ</th>
          <th className="num">เป้า</th><th className="num">ยอดจริง</th><th className="num">ออเดอร์</th>
          <th className="num">ผู้ชม</th><th className="num">Ads</th><th>สถานะ</th><th>เอกสาร</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              <td><input type="date" value={dateText(r.date)} onChange={e => update(i, 'date', e.target.value)} /></td>
              <td><input value={r.brand} onChange={e => update(i, 'brand', e.target.value)} style={{ width: 90 }} /></td>
              <td>
                <select value={r.platform} onChange={e => update(i, 'platform', e.target.value)}>
                  <option value="">-</option><option value="TikTok">TikTok</option><option value="Shopee">Shopee</option>
                </select>
              </td>
              <td><input value={r.mc} onChange={e => update(i, 'mc', e.target.value)} style={{ width: 80 }} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <input value={r.startTime} onChange={e => update(i, 'startTime', e.target.value)} style={{ width: 62 }} placeholder="19:00" />
                -
                <input value={r.endTime} onChange={e => update(i, 'endTime', e.target.value)} style={{ width: 62 }} placeholder="21:00" />
              </td>
              <td><input value={r.planTopic} onChange={e => update(i, 'planTopic', e.target.value)} style={{ minWidth: 120 }} /></td>
              <td><input type="number" value={r.targetSales} onChange={e => update(i, 'targetSales', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
              <td><input type="number" value={r.actualSales} onChange={e => update(i, 'actualSales', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
              <td><input type="number" value={r.orders} onChange={e => update(i, 'orders', e.target.value)} style={{ width: 60, textAlign: 'right' }} /></td>
              <td><input type="number" value={r.viewers} onChange={e => update(i, 'viewers', e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>
              <td><input type="number" value={r.adsCost} onChange={e => update(i, 'adsCost', e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>
              <td>
                <select value={r.status} onChange={e => update(i, 'status', e.target.value)}>
                  {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </td>
              <td>
                <select value={r.documentStatus} onChange={e => update(i, 'documentStatus', e.target.value)}>
                  <option value="MISSING">MISSING</option><option value="PARTIAL">PARTIAL</option><option value="COMPLETE">COMPLETE</option>
                </select>
              </td>
              <td><button className="btn btn-ghost btn-sm" onClick={async () => {
                if (!confirm('ลบไลฟ์ "' + (r.planTopic || r.date) + '" ?')) return;
                try {
                  if (r.id) await apiDelete('/ops/mc-live/' + encodeURIComponent(r.id));
                  setData(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
                } catch (err) { setMsg({ type: 'error', text: err.message }); }
              }}>ลบ</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
