import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, fmt, getUser } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

export default function UploadLog() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const user = getUser();

  async function load() {
    try { setRows(await apiGet('/uploads/logs', { limit: 200 })); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }
  useEffect(() => { load(); }, []);

  async function rollback(r) {
    if (!confirm(`ยืนยัน rollback ไฟล์ ${r.fileName} (${fmt(r.totalRows)} แถว)? ข้อมูล batch นี้จะถูกลบออกจากระบบ`)) return;
    try {
      const res = await apiPost('/uploads/rollback', { batchId: r.batchId, platform: r.platform });
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <div>
      <div className="page-title">ประวัติการอัปโหลด</div>
      <div className="page-sub">batch ทั้งหมดใน Supabase — rollback ได้ (เฉพาะ ADMIN)</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      {!rows ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data">
            <thead><tr>
              <th>เวลา</th><th>ผู้อัปโหลด</th><th>แพลตฟอร์ม</th><th>ไฟล์</th>
              <th className="num">แถว</th><th>ช่วงข้อมูล</th><th>สถานะ</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{String(r.timestamp).replace('T', ' ').slice(0, 19)}</td>
                  <td>{r.user}</td>
                  <td>{r.platform}</td>
                  <td>{r.fileName}</td>
                  <td className="num">{fmt(r.totalRows)}</td>
                  <td>{r.adminStart ? r.adminStart + ' → ' + r.adminEnd : '-'}</td>
                  <td><span className={'badge ' + (r.status === 'RECEIVED' ? 'ok' : 'warn')}>{r.status}</span></td>
                  <td>
                    {user?.role === 'ADMIN' && r.status === 'RECEIVED' && (
                      <button className="btn btn-red btn-sm" onClick={() => rollback(r)}>Rollback</button>
                    )}
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
