import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const EMPTY = { date: '', entryType: 'EXPENSE', platform: 'All', section: '', category: '', subCategory: '', vendor: '', description: '', amount: '', applyTo: 'DEDUCTION', sourceMode: 'MANUAL' };

export default function Manual() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mtRows, setMtRows] = useState([]);

  async function load() {
    try { setRows(await apiGet('/finance/manual-finance')); }
    catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  function update(i, key, val) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/manual-finance', { rows });
      setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  function addMtRow() {
    setMtRows(rs => [...rs, Array(18).fill('')]);
  }
  function updateMt(i, j, val) {
    setMtRows(rs => rs.map((r, x) => (x === i ? r.map((c, y) => (y === j ? val : c)) : r)));
  }
  async function saveMt() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/modern-trade', { rows: mtRows });
      setMsg({ type: 'success', text: res.message });
      setMtRows([]);
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  const MT_COLS = ['วันที่รับ PO', 'PO number', 'Sales platform', 'Branch', 'Product', 'Amount', 'ราคาสินค้า', 'GP', 'Price', 'ยอด GP', 'Net Profit', 'ETD', 'ETA', 'Ship via', 'Order number', 'Status', 'Notes', 'Received'];

  return (
    <div>
      <div className="page-title">กรอกข้อมูล Manual</div>
      <div className="page-sub">รายรับ/รายจ่าย Manual และ Modern Trade PO</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="card table-scroll">
        <h3>รายรับ / รายจ่าย Manual</h3>
        {!rows ? <Loading /> : (
          <>
            <table className="data">
              <thead><tr>
                <th>วันที่</th><th>ประเภท</th><th>แพลตฟอร์ม</th><th>หมวด</th><th>รายละเอียด</th>
                <th className="num">จำนวนเงิน</th><th>ลงส่วน</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input type="date" value={String(r.date).slice(0, 10)} onChange={e => update(i, 'date', e.target.value)} /></td>
                    <td>
                      <select value={r.entryType} onChange={e => update(i, 'entryType', e.target.value)}>
                        <option value="INCOME">รายรับ</option>
                        <option value="EXPENSE">รายจ่าย</option>
                      </select>
                    </td>
                    <td>
                      <select value={r.platform} onChange={e => update(i, 'platform', e.target.value)}>
                        <option value="All">All</option><option value="TikTok">TikTok</option>
                        <option value="Shopee">Shopee</option><option value="ModernTrade">ModernTrade</option>
                      </select>
                    </td>
                    <td><input value={r.category} onChange={e => update(i, 'category', e.target.value)} /></td>
                    <td><input value={r.description} onChange={e => update(i, 'description', e.target.value)} /></td>
                    <td><input type="number" step="0.01" value={r.amount} onChange={e => update(i, 'amount', e.target.value)} /></td>
                    <td>
                      <select value={r.applyTo} onChange={e => update(i, 'applyTo', e.target.value)}>
                        <option value="DEDUCTION">หักจากยอด</option>
                        <option value="ADS">ค่าโฆษณา</option>
                        <option value="COGS">ต้นทุนสินค้า</option>
                      </select>
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setRows(rs => [...rs, { ...EMPTY }])}>+ เพิ่มแถว</button>
              <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
            </div>
          </>
        )}
      </div>

      <div className="card table-scroll">
        <h3>Modern Trade — เพิ่ม PO ใหม่</h3>
        {mtRows.length > 0 && (
          <table className="data" style={{ fontSize: 12 }}>
            <thead><tr>{MT_COLS.map(c => <th key={c}>{c}</th>)}<th></th></tr></thead>
            <tbody>
              {mtRows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}><input style={{ minWidth: 90 }} value={c} onChange={e => updateMt(i, j, e.target.value)} /></td>
                  ))}
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setMtRows(rs => rs.filter((_, x) => x !== i))}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={addMtRow}>+ เพิ่มแถว PO</button>
          {mtRows.length > 0 && (
            <button className="btn btn-green" disabled={busy} onClick={saveMt}>บันทึก Modern Trade</button>
          )}
        </div>
      </div>
    </div>
  );
}
