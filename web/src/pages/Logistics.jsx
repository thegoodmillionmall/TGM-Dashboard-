import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiUpload } from '../api.js';

const fmt  = v => Number(v || 0).toLocaleString('th-TH');
const fmtM = v => '฿' + Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct  = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '—';

const PLAT_COLOR = { TikTok: '#1a2a3a', Shopee: '#ee4d2d', Other: '#9ca3af' };

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function iso30ago() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function Logistics() {
  const [start, setStart]       = useState(iso30ago());
  const [end, setEnd]           = useState(isoToday());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef();

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await apiGet('/logistics/summary', { start, end });
      setData(res);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function doUpload(file) {
    if (!file) return;
    setUploading(true); setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/logistics/upload', fd);
      setUploadMsg(`✓ นำเข้าสำเร็จ ${res.inserted?.toLocaleString() || 0} แถว`);
      load();
    } catch (e) { setUploadMsg('✗ ' + e.message); }
    setUploading(false);
  }

  const daily = data?.daily || [];
  const dateMap = {};
  for (const r of daily) {
    if (!dateMap[r.date]) dateMap[r.date] = { date: r.date };
    const slot = dateMap[r.date];
    const p = r.platform;
    slot[p + '_orders']   = (slot[p + '_orders']   || 0) + r.orders;
    slot[p + '_shipped']  = (slot[p + '_shipped']  || 0) + r.shipped;
    slot[p + '_returned'] = (slot[p + '_returned'] || 0) + r.returned;
    slot['total_orders']  = (slot['total_orders']  || 0) + r.orders;
    slot['total_shipped'] = (slot['total_shipped'] || 0) + r.shipped;
    slot['total_returned']= (slot['total_returned']|| 0) + r.returned;
  }
  const rows = Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
  const tot = data?.totals || {};
  const maxOrders = Math.max(...rows.map(r => r.total_orders || 0), 1);

  return (
    <div>
      <div className="page-title">📦 ขนส่ง (Logistics)</div>
      <div className="page-sub">เปรียบเทียบยอดจัดส่งรายวันจาก JST กับ TikTok / Shopee</div>

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>เริ่ม
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            style={{ marginLeft: 6, padding: '3px 6px', fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 13 }}>ถึง
          <input type="date" value={end} onChange={e => setEnd(e.target.value)}
            style={{ marginLeft: 6, padding: '3px 6px', fontSize: 13 }} />
        </label>
        <button className="btn btn-primary" onClick={load} disabled={loading}
          style={{ padding: '4px 16px' }}>{loading ? 'โหลด...' : 'แสดง'}</button>
        <button className="btn btn-ghost" onClick={() => { setStart(isoToday()); setEnd(isoToday()); }}
          style={{ padding: '4px 10px', fontSize: 12 }}>วันนี้</button>
        <button className="btn btn-ghost" onClick={() => { setStart(iso30ago()); setEnd(isoToday()); }}
          style={{ padding: '4px 10px', fontSize: 12 }}>30 วัน</button>
        {data && <span style={{ fontSize: 12, color: '#9ca3af' }}>อ่าน {data.rowsRead?.toLocaleString()} แถว</span>}
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'คำสั่งซื้อรวม', value: fmt(tot.orders), sub: 'ทุกแพลตฟอร์ม' },
            { label: 'จัดส่งแล้ว (ชิ้น)', value: fmt(tot.shipped), sub: 'จำนวนสินค้า' },
            { label: 'ตีกลับ (ชิ้น)', value: fmt(tot.returned), sub: pct(tot.returned, tot.shipped) + ' ของส่ง', tone: tot.returned > 0 ? 'red' : '' },
            { label: 'รายได้ JST', value: fmtM(tot.revenue), sub: 'ราคาสินค้า' },
            { label: 'ต้นทุน (COGS)', value: fmtM(tot.cogs), sub: 'จาก Gosell', tone: 'red' },
            { label: 'กำไรขั้นต้น', value: fmtM(tot.grossProfit), sub: pct(tot.grossProfit, tot.revenue), tone: tot.grossProfit >= 0 ? 'green' : 'red' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.tone === 'red' ? '#ef4444' : k.tone === 'green' ? '#059669' : 'inherit' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 12px' }}>รายวัน</h3>
        {loading ? (
          <div style={{ color: '#9ca3af', padding: 20 }}>โหลด...</div>
        ) : rows.length === 0 ? (
          <div style={{ color: '#9ca3af', padding: 20 }}>ยังไม่มีข้อมูล — อัปโหลด CSV JST ด้านล่าง</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>วันที่จัดส่ง</th>
                  <th className="num">TikTok<br/><span style={{fontSize:10,color:'#9ca3af'}}>ออเดอร์</span></th>
                  <th className="num">Shopee<br/><span style={{fontSize:10,color:'#9ca3af'}}>ออเดอร์</span></th>
                  <th className="num">รวม<br/><span style={{fontSize:10,color:'#9ca3af'}}>ออเดอร์</span></th>
                  <th className="num">ชิ้นส่ง</th>
                  <th className="num">ตีกลับ</th>
                  <th style={{ minWidth: 100 }}>สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const ttO = r['TikTok_orders'] || 0;
                  const shO = r['Shopee_orders'] || 0;
                  const tot = r.total_orders || 0;
                  const barW = tot ? Math.round((tot / maxOrders) * 80) : 0;
                  return (
                    <tr key={r.date}>
                      <td style={{ fontWeight: 500 }}>{r.date}</td>
                      <td className="num">
                        {ttO > 0 ? <span style={{ color: PLAT_COLOR.TikTok, fontWeight: 600 }}>{fmt(ttO)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td className="num">
                        {shO > 0 ? <span style={{ color: PLAT_COLOR.Shopee, fontWeight: 600 }}>{fmt(shO)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmt(tot)}</td>
                      <td className="num">{fmt(r.total_shipped)}</td>
                      <td className="num" style={{ color: (r.total_returned || 0) > 0 ? '#ef4444' : '#d1d5db' }}>
                        {(r.total_returned || 0) > 0 ? fmt(r.total_returned) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          {ttO > 0 && <div style={{ width: Math.round(barW * (ttO / tot)), height: 8, borderRadius: 2, background: PLAT_COLOR.TikTok }} title={`TikTok ${ttO}`} />}
                          {shO > 0 && <div style={{ width: Math.round(barW * (shO / tot)), height: 8, borderRadius: 2, background: PLAT_COLOR.Shopee }} title={`Shopee ${shO}`} />}
                          {(r['Other_orders'] || 0) > 0 && <div style={{ width: Math.round(barW * ((r['Other_orders'] || 0) / tot)), height: 8, borderRadius: 2, background: PLAT_COLOR.Other }} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 10px' }}>นำเข้าข้อมูลขนส่ง (JST CSV)</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
          ดาวน์โหลดรายงานจาก <strong>JST (Gosell)</strong> → Export เป็น CSV → อัปโหลดที่นี่<br/>
          คอลัมน์ที่ต้องมี: <code>แพลตฟอร์ม, วันที่จัดส่ง, สถานะคำสั่งซื้อ, หมายเลขออเดอร์ภายใน</code>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) doUpload(e.target.files[0]); e.target.value = ''; }} />
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'กำลังอัปโหลด...' : '📂 เลือกไฟล์ CSV'}
          </button>
          {uploadMsg && (
            <span style={{ fontSize: 13, color: uploadMsg.startsWith('✓') ? '#059669' : '#dc2626' }}>{uploadMsg}</span>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          หรือวางไฟล์ที่ชื่อขึ้นต้นด้วย <code>Logistics_</code> ใน inbox/ — ระบบดูดเข้าอัตโนมัติ
        </div>
      </div>
    </div>
  );
}
