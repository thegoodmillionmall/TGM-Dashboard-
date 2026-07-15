import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, fmt } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

export default function Health() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setData(null);
    try { setData(await apiGet('/system/health')); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }
  useEffect(() => { load(); }, []);

  async function refreshAll() {
    setBusy(true); setMsg(null);
    try {
      await apiPost('/uploads/refresh-all');
      setMsg({ type: 'success', text: 'สั่ง refresh สรุปรายวันทั้งหมดแล้ว' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-title">สุขภาพระบบ</div>
      <div className="page-sub">สถานะการเชื่อมต่อ Supabase, RPC และบริการเสริม</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      <div className="toolbar">
        <button className="btn btn-ghost" onClick={load}>ตรวจอีกครั้ง</button>
        <button className="btn btn-primary" disabled={busy} onClick={refreshAll}>Refresh สรุปรายวันทั้งหมด</button>
      </div>
      {!data ? <Loading /> : (
        <>
          <div className={'alert ' + (data.ok ? 'success' : 'error')}>
            {data.ok ? 'ระบบทำงานปกติ' : 'พบปัญหาบางรายการ'} — ใช้เวลา {fmt(data.elapsedMs)} ms
          </div>
          <div className="card table-scroll">
            <table className="data">
              <thead><tr><th>รายการ</th><th>สถานะ</th><th className="num">เวลา (ms)</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {data.checks.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td><span className={'badge ' + (c.status === 'OK' ? 'ok' : 'err')}>{c.status}</span></td>
                    <td className="num">{fmt(c.elapsedMs)}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>
                      {typeof c.detail === 'object' ? JSON.stringify(c.detail) : String(c.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
