import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const PAGES = [
  ['home', 'หน้าแรก'], ['overview', 'ภาพรวม'], ['dashboard', 'รายช่องทาง'], ['profit', 'กำไร'],
  ['upload', 'นำเข้าข้อมูล'], ['manual', 'Manual'], ['products', 'สินค้า'], ['ads', 'โฆษณา'],
  ['accounting', 'COGS'], ['payables', 'บัญชีจ่าย'], ['liveplanner', 'MC Live'], ['mtledger', 'MT (GP)'],
  ['deepaudit', 'Deep Audit'], ['reconcile', 'ชนยอด'], ['bankrecon', 'Statement'], ['uploadlog', 'ประวัติอัปโหลด'],
  ['ai', 'AI'], ['fees', 'Fee/Mapping'], ['health', 'สุขภาพระบบ'], ['users', 'ผู้ใช้']
];

const EMPTY = { username: '', displayName: '', role: 'VIEWER', status: 'ACTIVE', password: '', permissions: [] };

export default function Users() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setRows(await apiGet('/users')); }
    catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/users', edit);
      setMsg({ type: 'success', text: res.message });
      setEdit(null);
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function toggleStatus(u) {
    try {
      await apiPatch('/users/' + encodeURIComponent(u.username) + '/status', {
        status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  }

  const togglePerm = key => setEdit(e => ({
    ...e,
    permissions: e.permissions.includes(key) ? e.permissions.filter(p => p !== key) : [...e.permissions, key]
  }));

  return (
    <div>
      <div className="page-title">ผู้ใช้และสิทธิ์</div>
      <div className="page-sub">จัดการบัญชี บทบาท และหน้าที่เข้าถึงได้ (เฉพาะ ADMIN)</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>+ เพิ่มผู้ใช้</button>
      </div>

      {edit && (
        <div className="card" style={{ maxWidth: 620 }}>
          <h3>{edit._isEdit ? 'แก้ไขผู้ใช้: ' + edit.username : 'เพิ่มผู้ใช้ใหม่'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>Username<input value={edit.username} disabled={edit._isEdit} onChange={e => setEdit(x => ({ ...x, username: e.target.value }))} /></label>
            <label>ชื่อแสดง<input value={edit.displayName} onChange={e => setEdit(x => ({ ...x, displayName: e.target.value }))} /></label>
            <label>Role
              <select value={edit.role} onChange={e => setEdit(x => ({ ...x, role: e.target.value }))}>
                <option value="ADMIN">ADMIN</option><option value="UPLOADER">UPLOADER</option><option value="VIEWER">VIEWER</option>
              </select>
            </label>
            <label>รหัสผ่าน {edit._isEdit ? '(เว้นว่าง = ไม่เปลี่ยน)' : ''}
              <input type="password" value={edit.password} onChange={e => setEdit(x => ({ ...x, password: e.target.value }))} />
            </label>
          </div>
          {edit.role !== 'ADMIN' && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13 }}>หน้าที่เข้าถึงได้:</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {PAGES.map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' }}>
                    <input type="checkbox" checked={edit.permissions.includes(key)} onChange={() => togglePerm(key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-green" disabled={busy} onClick={save}>บันทึก</button>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      {!rows ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data">
            <thead><tr><th>Username</th><th>ชื่อแสดง</th><th>Role</th><th>สถานะ</th><th>เข้าระบบล่าสุด</th><th></th></tr></thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={i}>
                  <td>{u.username}</td>
                  <td>{u.displayName}</td>
                  <td>{u.role}</td>
                  <td><span className={'badge ' + (u.status === 'ACTIVE' ? 'ok' : 'err')}>{u.status}</span></td>
                  <td>{String(u.lastLogin || '-').replace('T', ' ').slice(0, 19)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...u, password: '', _isEdit: true })}>แก้ไข</button>{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(u)}>
                      {u.status === 'ACTIVE' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
