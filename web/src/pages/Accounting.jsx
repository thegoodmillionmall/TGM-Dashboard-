import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

export default function Accounting() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function load() {
    try {
      const data = await apiGet('/finance/product-costs');
      setRows(data.map(r => ({
        platform: r.platform || '',
        productName: r.productName || r.name || '',
        costType: r.costType || '%',
        costValue: Number(r.costValue || 0)
      })));
    } catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-costs/sync');
      setRows(res.rows.map(r => ({
        platform: r.platform || '', productName: r.productName || r.name || '',
        costType: r.costType || '%', costValue: Number(r.costValue || 0)
      })));
      setMsg({ type: 'success', text: 'ดึงสินค้าใหม่เข้าตาราง ' + res.added + ' รายการ (อย่าลืมกดบันทึก)' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-costs', { rows });
      setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  const update = (i, key, val) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const visible = (rows || []).map((r, i) => ({ ...r, _i: i })).filter(r => !q || r.productName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-title">ต้นทุนสินค้า (COGS)</div>
      <div className="page-sub">กำหนดต้นทุนเป็น % ของยอดขาย หรือบาทต่อออเดอร์</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      <div className="toolbar">
        <label>ค้นหา<input value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อสินค้า" /></label>
        <button className="btn btn-ghost" disabled={busy} onClick={sync}>ดึงสินค้าที่มียอดขาย</button>
        <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
      </div>
      {!rows ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data">
            <thead><tr><th>แพลตฟอร์ม</th><th>สินค้า</th><th>ประเภทต้นทุน</th><th className="num">มูลค่า</th><th></th></tr></thead>
            <tbody>
              {visible.map(r => (
                <tr key={r._i}>
                  <td><input value={r.platform} onChange={e => update(r._i, 'platform', e.target.value)} style={{ width: 110 }} /></td>
                  <td><input value={r.productName} onChange={e => update(r._i, 'productName', e.target.value)} style={{ minWidth: 260 }} /></td>
                  <td>
                    <select value={r.costType} onChange={e => update(r._i, 'costType', e.target.value)}>
                      <option value="%">% ของยอดขาย</option>
                      <option value="THB">บาท / ออเดอร์</option>
                    </select>
                  </td>
                  <td><input type="number" step="0.01" value={r.costValue} onChange={e => update(r._i, 'costValue', e.target.value)} style={{ width: 100, textAlign: 'right' }} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setRows(rs => rs.filter((_, j) => j !== r._i))}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-ghost" style={{ marginTop: 10 }}
            onClick={() => setRows(rs => [...rs, { platform: '', productName: '', costType: '%', costValue: 0 }])}>
            + เพิ่มสินค้า
          </button>
        </div>
      )}
    </div>
  );
}
