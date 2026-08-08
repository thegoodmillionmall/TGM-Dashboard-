import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const PAGE_GROUPS = [
  { label: 'ภาพรวม',         pages: [['overview','ภาพรวมผู้บริหาร'],['dashboard','รายช่องทาง'],['profit','กำไร'],['products','สินค้าขายดี']] },
  { label: 'โฆษณา',          pages: [['ads','สรุปโฆษณา']] },
  { label: 'สินค้า & ต้นทุน', pages: [['accounting','COGS']] },
  { label: 'การเงิน',         pages: [['payables','บัญชีจ่าย'],['statements','งบการเงิน'],['mtledger','MT (GP)'],['manual','Manual']] },
  { label: 'MC Live',         pages: [['liveplanner','MC Live']] },
  { label: 'จัดการข้อมูล',    pages: [['upload','นำเข้าข้อมูล']] },
  { label: 'ตรวจสอบ',        pages: [['deepaudit','Deep Audit'],['reconcile','ชนยอด'],['bankrecon','Statement'],['uploadlog','ประวัติอัปโหลด']] },
  { label: 'ตั้งค่า',         pages: [['fees','Fee/Mapping'],['health','สุขภาพระบบ'],['users','ผู้ใช้'],['ai','AI']] },
];
const ALL_PAGES = PAGE_GROUPS.flatMap(g => g.pages);

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
                <option value="ADMIN">ADMIN</option><option value="UPLOADER">UPLOADER</option><option value="VIEWER">VIEWER</option><option value="MC_LEAD">MC_LEAD</option><option value="MC">MC</option>
              </select>
            </label>
            <label>รหัสผ่าน {edit._isEdit ? '(เว้นว่าง = ไม่เปลี่ยน)' : ''}
              <input type="password" value={edit.password} onChange={e => setEdit(x => ({ ...x, password: e.target.value }))} />
            </label>
          </div>
          {edit.role !== 'ADMIN' && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>หน้าที่เข้าถึงได้</b>
                <div style={{ display:'flex', gap:6 }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize:11, padding:'2px 10px' }}
                    onClick={() => setEdit(e => ({ ...e, permissions: ALL_PAGES.map(([k])=>k) }))}>เลือกทั้งหมด</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize:11, padding:'2px 10px' }}
                    onClick={() => setEdit(e => ({ ...e, permissions: [] }))}>ล้างทั้งหมด</button>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {PAGE_GROUPS.map(group => {
                  const groupKeys = group.pages.map(([k])=>k);
                  const allChecked = groupKeys.every(k => edit.permissions.includes(k));
                  const someChecked = groupKeys.some(k => edit.permissions.includes(k));
                  const toggleGroup = () => setEdit(e => ({
                    ...e,
                    permissions: allChecked
                      ? e.permissions.filter(k => !groupKeys.includes(k))
                      : [...new Set([...e.permissions, ...groupKeys])]
                  }));
                  return (
                    <div key={group.label} style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px', border:'1px solid #e2e8f0' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:'0.5px', textTransform:'uppercase' }}>{group.label}</span>
                        <button type="button" onClick={toggleGroup}
                          style={{ fontSize:10, padding:'1px 8px', borderRadius:4, border:'1px solid #cbd5e1',
                            background: allChecked ? '#1a2a3a' : someChecked ? '#e2e8f0' : 'white',
                            color: allChecked ? 'white' : '#475569', cursor:'pointer', lineHeight:1.6 }}>
                          {allChecked ? 'ยกเลิกทั้งกลุ่ม' : 'เลือกทั้งกลุ่ม'}
                        </button>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {group.pages.map(([key, label]) => {
                          const on = edit.permissions.includes(key);
                          return (
                            <label key={key} style={{
                              display:'flex', gap:5, alignItems:'center', fontSize:12, cursor:'pointer',
                              border:`1px solid ${on ? '#7DB9B9' : '#e2e8f0'}`,
                              background: on ? '#edf6f6' : 'white',
                              borderRadius:6, padding:'4px 10px',
                              fontWeight: on ? 600 : 400,
                              color: on ? '#1a5f5f' : '#374151',
                              transition:'all .15s'
                            }}>
                              <input type="checkbox" checked={on} onChange={() => togglePerm(key)} style={{ accentColor:'#7DB9B9' }} />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
