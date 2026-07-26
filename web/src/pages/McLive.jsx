import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiUpload, fmt, fmtMoney } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

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
          <StatTile label="ค่า Ads" value={fmtMoney(summary.totals.ads)} tone="warn" />
          <StatTile label="Coins" value={fmt(summary.totals.coins, 0)} />
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
        <div className="mc-live-view-toggle">
          <button className={'btn ' + (view === 'summary' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('summary')}>สรุปอ่านง่าย</button>
          <button className={'btn ' + (view === 'edit' ? 'btn-primary' : 'btn-ghost')} onClick={() => setView('edit')}>แก้ไขรายการ</button>
        </div>
        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>↑ นำเข้า Excel</button>
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
      <div className="mc-live-channel-strip">
        <div>
          <span className="dot shopee"></span>
          <b>Shopee</b>
          <strong>{fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.shopeeSales, 0))}</strong>
          <small>Ads {fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.shopeeAds, 0))}</small>
        </div>
        <div>
          <span className="dot tiktok"></span>
          <b>TikTok</b>
          <strong>{fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.tiktokSales, 0))}</strong>
          <small>Ads {fmtMoney(summary.dailyRows.reduce((sum, r) => sum + r.tiktokAds, 0))}</small>
        </div>
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
                    <div className="mc-live-rank-head">
                      <b>{r.key}</b>
                      <strong>{fmtMoney(r.sales)}</strong>
                    </div>
                    <div className="mc-live-rank-meta">{fmt(r.lives, 0)} ไลฟ์ | Shopee {fmtMoney(r.shopeeSales)} | TikTok {fmtMoney(r.tiktokSales)}</div>
                    <div className="mc-live-bar"><span style={{ width: `${Math.max(4, (r.sales / maxSales) * 100)}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card mc-live-card mc-live-daily-card">
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
      </div>

      <div className="card mc-live-card">
        <h3>รายละเอียดรายวันตาม MC</h3>
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
                    <span>{fmt(day.lives, 0)} ไลฟ์</span>
                  </div>
                  <strong>{fmtMoney(day.sales)}</strong>
                </div>
                <div className="mc-live-day-grid">
                  {items.map(item => (
                    <div className="mc-live-mc-card" key={item.key}>
                      <div className="mc-live-mc-head">
                        <b>{item.key}</b>
                        <strong>{fmtMoney(item.sales)}</strong>
                      </div>
                      <div className="mc-live-platform-lines">
                        <div><span className="tag sp">SP</span><b>{fmtMoney(item.shopeeSales)}</b><small>Ads {fmtMoney(item.shopeeAds)}</small></div>
                        <div><span className="tag tt">TT</span><b>{fmtMoney(item.tiktokSales)}</b><small>Ads {fmtMoney(item.tiktokAds)}</small></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
