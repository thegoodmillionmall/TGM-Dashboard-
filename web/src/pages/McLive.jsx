import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, fmt, fmtMoney } from '../api.js';
import { Alert, Loading, Kpi } from '../components/ui.jsx';

const STATUSES = ['PLANNED', 'LIVE', 'DONE', 'CANCELLED'];

const EMPTY = {
  id: '', date: '', brand: '', platform: '', mc: '', startTime: '', endTime: '', planTopic: '',
  targetSales: 0, actualSales: 0, orders: 0, viewers: 0, peakCcu: 0, comments: 0, clicks: 0,
  addToCart: 0, coins: 0, adsCost: 0, status: 'PLANNED', documentStatus: 'MISSING',
  documentLinks: '', attachmentNames: '', note: ''
};

export default function McLive() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setData(await apiGet('/ops/mc-live', { status })); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }
  useEffect(() => { load(); }, [status]);

  const rows = data?.rows || [];
  const s = data?.summary || {};
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

  return (
    <div>
      <div className="page-title">MC Live Planner</div>
      <div className="page-sub">วางแผนตารางไลฟ์และบันทึกผล</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      <div className="kpis">
        <Kpi label="ไลฟ์ทั้งหมด" value={s.total} format="num" />
        <Kpi label="จบแล้ว" value={s.done} format="num" tone="green" />
        <Kpi label="ยอดขายรวม" value={s.sales} tone="blue" />
        <Kpi label="ออเดอร์" value={s.orders} format="num" />
        <Kpi label="เอกสารไม่ครบ" value={s.missingDocs} format="num" tone="red" />
      </div>
      <div className="toolbar">
        <label>สถานะ
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="ALL">ทั้งหมด</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost" onClick={() => setData(d => ({ ...d, rows: [...(d?.rows || []), { ...EMPTY }] }))}>+ เพิ่มไลฟ์</button>
        <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
      </div>
      {!data ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>วันที่</th><th>แบรนด์</th><th>แพลตฟอร์ม</th><th>MC</th><th>เวลา</th><th>หัวข้อ</th>
              <th className="num">เป้า</th><th className="num">ยอดจริง</th><th className="num">ออเดอร์</th>
              <th className="num">ผู้ชม</th><th className="num">Ads</th><th>สถานะ</th><th>เอกสาร</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input type="date" value={String(r.date).slice(0, 10)} onChange={e => update(i, 'date', e.target.value)} /></td>
                  <td><input value={r.brand} onChange={e => update(i, 'brand', e.target.value)} style={{ width: 90 }} /></td>
                  <td>
                    <select value={r.platform} onChange={e => update(i, 'platform', e.target.value)}>
                      <option value="">-</option><option value="TikTok">TikTok</option><option value="Shopee">Shopee</option>
                    </select>
                  </td>
                  <td><input value={r.mc} onChange={e => update(i, 'mc', e.target.value)} style={{ width: 80 }} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input value={r.startTime} onChange={e => update(i, 'startTime', e.target.value)} style={{ width: 55 }} placeholder="19:00" />
                    -
                    <input value={r.endTime} onChange={e => update(i, 'endTime', e.target.value)} style={{ width: 55 }} placeholder="21:00" />
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
      )}
    </div>
  );
}
