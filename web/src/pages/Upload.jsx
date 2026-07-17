import React, { useState, useEffect, useRef } from 'react';
import { apiUpload, apiGet } from '../api.js';

const PLATFORMS = [
  ['TiktokAnalytics',  'TikTok Analytics',   'TT_Analytics'],
  ['TiktokOrder',      'TikTok Order',        'TT_Sales'],
  ['TiktokSettlement', 'TikTok Settlement',   'TT_Settlement'],
  ['TiktokLive',       'TikTok Live',         'TT_Live'],
  ['TiktokAffiliate',  'TikTok Affiliate',    'TT_Affiliate'],
  ['TiktokAdsManager', 'TikTok Ads Manager',  'TT_Ads_Manager'],
  ['TiktokAdsGMV',     'TikTok Ads GMV',      'TT_Ads_GMV'],
  ['TiktokAdsGMVLive', 'TikTok Ads GMV Live', 'TT_Ads_GMV_Live'],
  ['ShopeeOrder',      'Shopee Order',         'Shopee_Orders'],
  ['ShopeeSettlement', 'Shopee Settlement',    'Shopee_Settlement'],
  ['ShopeeAds',        'Shopee Ads',           'Shopee_Ads'],
  ['ShopeeAdsLive',    'Shopee Ads Live',      'Shopee_Ads_Live'],
  ['ShopeeAffiliate',  'Shopee Affiliate',     'Shopee_Affiliate'],
  ['MetaAds',          'Meta Ads',             'Meta_Ads'],
  ['ModernTrade',      'Modern Trade',         'MT_Sales'],
  ['ManualFinance',    'Manual Finance',       'Manual_Finance'],
];

const P_LABEL = Object.fromEntries(PLATFORMS.map(([k, l]) => [k, l]));
const P_SHEET = Object.fromEntries(PLATFORMS.map(([k, , s]) => [k, s]));

// แพลตฟอร์มที่ต้องอัปทุกเดือน (เช็คลิสต์)
const MONTHLY_REQUIRED = [
  { key: 'TT_Analytics',      label: 'TikTok Analytics'   },
  { key: 'TT_Sales',          label: 'TikTok Orders'       },
  { key: 'TT_Settlement',     label: 'TikTok Settlement'   },
  { key: 'Shopee_Orders',     label: 'Shopee Orders'       },
  { key: 'Shopee_Settlement', label: 'Shopee Settlement'   },
  { key: 'Shopee_Ads',        label: 'Shopee Ads'          },
  { key: 'TT_Ads_GMV',        label: 'TikTok Ads GMV'      },
  { key: 'Meta_Ads',          label: 'Meta Ads'            },
];

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

let _uid = 0;

export default function Upload() {
  const [queue, setQueue]       = useState([]);
  const [uploading, setUploading] = useState(false);
  const [calYear, setCalYear]   = useState(new Date().getFullYear());
  const [batches, setBatches]   = useState([]);
  const [calLoading, setCalLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const now = new Date();
  const currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  async function loadBatches() {
    setCalLoading(true);
    try {
      const res = await apiGet('/uploads/logs', { limit: 500 });
      setBatches(Array.isArray(res) ? res : []);
    } catch {}
    setCalLoading(false);
  }

  useEffect(() => { loadBatches(); }, []);

  function addFiles(files) {
    const items = Array.from(files).map(f => ({
      id: ++_uid,
      file: f,
      platform: 'TiktokOrder',
      adminStart: '',
      adminEnd: '',
      status: 'pending',   // pending | uploading | done | error
      result: null,
    }));
    setQueue(q => [...q, ...items]);
  }

  function upd(id, patch) {
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  async function uploadAll() {
    const pending = queue.filter(x => x.status === 'pending');
    if (!pending.length) return;
    setUploading(true);
    for (const item of pending) {
      upd(item.id, { status: 'uploading' });
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('platform', item.platform);
        if (item.adminStart) fd.append('adminStart', item.adminStart);
        if (item.adminEnd)   fd.append('adminEnd',   item.adminEnd);
        const res = await apiUpload('/uploads', fd);
        upd(item.id, { status: 'done', result: res });
      } catch (err) {
        upd(item.id, { status: 'error', result: { error: err.message } });
      }
    }
    setUploading(false);
    loadBatches();
  }

  // build set "SHEET:YYYY-MM" จาก batches ที่ไม่ถูก rollback
  const uploadedSet = new Set();
  for (const b of batches) {
    if (b.status === 'ROLLED_BACK') continue;
    const dateStr = b.adminStart || b.timestamp || '';
    const ym = dateStr.slice(0, 7);          // YYYY-MM
    if (ym.length === 7 && b.sheetName) {
      uploadedSet.add(b.sheetName + ':' + ym);
    }
  }

  const pendingCount = queue.filter(x => x.status === 'pending').length;
  const hasDone      = queue.some(x => x.status === 'done' || x.status === 'error');

  return (
    <div>
      <div className="page-title">นำเข้าข้อมูล</div>
      <div className="page-sub">อัปโหลดหลายไฟล์พร้อมกัน → เก็บ raw ใน Supabase → refresh สรุปอัตโนมัติ</div>

      {/* ===== คิวอัปโหลด ===== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ margin:0 }}>คิวอัปโหลด</h3>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>+ เพิ่มไฟล์</button>
            {hasDone && (
              <button className="btn btn-ghost" onClick={() => setQueue(q => q.filter(x => x.status === 'pending'))}>
                ล้างรายการเสร็จ
              </button>
            )}
            <button className="btn btn-primary"
              disabled={uploading || pendingCount === 0}
              onClick={uploadAll}>
              {uploading ? 'กำลังอัปโหลด...' : `อัปโหลด${pendingCount > 0 ? ` ${pendingCount} ไฟล์` : ''}`}
            </button>
          </div>
        </div>

        <input ref={fileRef} type="file" multiple accept=".csv,text/csv" style={{ display:'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

        {/* Drop zone / ตารางคิว */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          style={{
            border: `2px dashed ${dragOver ? '#7DB9B9' : '#d1d5db'}`,
            borderRadius: 8,
            background: dragOver ? 'rgba(178,216,216,0.1)' : 'transparent',
            transition: 'all 0.2s',
            minHeight: queue.length === 0 ? 120 : undefined,
          }}
        >
          {queue.length === 0 ? (
            <div onClick={() => fileRef.current?.click()}
              style={{ padding:'40px 16px', textAlign:'center', color:'#9ca3af', cursor:'pointer' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div>ลากไฟล์ CSV มาวางที่นี่ หรือคลิกเพื่อเลือก</div>
              <div style={{ fontSize:12, marginTop:4 }}>เลือกได้หลายไฟล์พร้อมกัน</div>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table className="data" style={{ fontSize:13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left' }}>ชื่อไฟล์</th>
                    <th style={{ textAlign:'left' }}>ประเภท</th>
                    <th style={{ textAlign:'left', color:'#7DB9B9' }}>→ เก็บใน Sheet</th>
                    <th className="num">ข้อมูลเริ่ม</th>
                    <th className="num">ถึง</th>
                    <th>สถานะ / ผลลัพธ์</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(item => (
                    <QueueRow key={item.id} item={item}
                      onUpdate={patch => upd(item.id, patch)}
                      onRemove={() => setQueue(q => q.filter(x => x.id !== item.id))} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ===== เช็คลิสต์รายเดือน ===== */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <h3 style={{ margin:0 }}>เช็คลิสต์ข้อมูลรายเดือน</h3>
          <button className="btn btn-ghost" style={{ padding:'2px 10px', fontSize:14 }}
            onClick={() => setCalYear(y => y - 1)}>◀</button>
          <span style={{ fontWeight:700, fontSize:16, minWidth:40, textAlign:'center' }}>{calYear}</span>
          <button className="btn btn-ghost" style={{ padding:'2px 10px', fontSize:14 }}
            onClick={() => setCalYear(y => y + 1)}>▶</button>
          <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:13, marginLeft:4 }}
            title="รีเฟรช" onClick={loadBatches}>↻</button>
        </div>

        {calLoading ? (
          <div style={{ color:'#9ca3af', padding:16 }}>โหลด...</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="data" style={{ fontSize:13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', minWidth:155 }}>แพลตฟอร์ม</th>
                  {MONTHS_TH.map((m, i) => (
                    <th key={i} className="num" style={{ minWidth:46 }}>{m}</th>
                  ))}
                  <th className="num" style={{ minWidth:60 }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {MONTHLY_REQUIRED.map(p => {
                  const maxM = calYear < now.getFullYear() ? 12
                              : calYear > now.getFullYear() ? 0
                              : now.getMonth() + 1;
                  let filled = 0;
                  const cells = Array.from({ length: 12 }, (_, i) => {
                    const mm  = String(i + 1).padStart(2, '0');
                    const ym  = `${calYear}-${mm}`;
                    const future = ym > currentYM;
                    const has    = uploadedSet.has(p.key + ':' + ym);
                    if (has) filled++;
                    return (
                      <td key={i} className="num" style={{ padding:'5px 2px' }}>
                        {future
                          ? <span style={{ color:'#e5e7eb' }}>—</span>
                          : has
                          ? <span style={{ color:'#059669', fontSize:15 }} title={`${p.label} ${ym}`}>✓</span>
                          : <span style={{ color:'#ef4444', fontSize:15 }} title={`${p.label} ${ym} ยังไม่มีข้อมูล`}>✗</span>
                        }
                      </td>
                    );
                  });
                  const allDone = maxM > 0 && filled >= maxM;
                  const partial = filled > 0 && !allDone;
                  return (
                    <tr key={p.key}>
                      <td style={{ fontWeight:500 }}>{p.label}</td>
                      {cells}
                      <td className="num">
                        <span style={{ fontWeight:600, color: allDone ? '#059669' : partial ? '#f59e0b' : '#ef4444' }}>
                          {filled}/{maxM}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop:8, fontSize:11, color:'#9ca3af' }}>
              ✓ มีข้อมูล &nbsp;✗ ยังไม่มี &nbsp;— อนาคต
              &nbsp;|&nbsp; ใช้ admin_start_date ของ batch (ถ้าไม่กรอก = วันที่อัปโหลด)
            </div>
          </div>
        )}
      </div>

      <div className="alert info" style={{ marginTop:12 }}>
        ระบบตรวจคอลัมน์สำคัญก่อนบันทึก · อัปโหลดซ้ำได้ · rollback ได้จากหน้าประวัติการอัปโหลด
      </div>
    </div>
  );
}

// ---------- แถวในตารางคิว ----------
function QueueRow({ item, onUpdate, onRemove }) {
  const editable = item.status === 'pending';
  return (
    <tr>
      {/* ชื่อไฟล์ */}
      <td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12 }}
        title={item.file.name}>
        {item.file.name}
      </td>

      {/* ประเภท */}
      <td>
        {editable ? (
          <select value={item.platform} onChange={e => onUpdate({ platform: e.target.value })}
            style={{ fontSize:12, padding:'2px 4px', maxWidth:160 }}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <span style={{ fontSize:12 }}>{P_LABEL[item.platform]}</span>
        )}
      </td>

      {/* sheet ปลายทาง */}
      <td style={{ fontFamily:'monospace', fontSize:11, color:'#7DB9B9', whiteSpace:'nowrap' }}>
        {P_SHEET[item.platform]}
      </td>

      {/* วันเริ่ม */}
      <td className="num">
        {editable ? (
          <input type="date" value={item.adminStart}
            onChange={e => onUpdate({ adminStart: e.target.value })}
            style={{ fontSize:12, padding:'2px 4px', width:126 }} />
        ) : (
          <span style={{ fontSize:12 }}>{item.adminStart || '—'}</span>
        )}
      </td>

      {/* วันสิ้นสุด */}
      <td className="num">
        {editable ? (
          <input type="date" value={item.adminEnd}
            onChange={e => onUpdate({ adminEnd: e.target.value })}
            style={{ fontSize:12, padding:'2px 4px', width:126 }} />
        ) : (
          <span style={{ fontSize:12 }}>{item.adminEnd || '—'}</span>
        )}
      </td>

      {/* สถานะ */}
      <td style={{ minWidth:180 }}>
        {item.status === 'pending'   && <span style={{ color:'#9ca3af', fontSize:12 }}>รอ</span>}
        {item.status === 'uploading' && <span style={{ color:'#f59e0b', fontSize:12 }}>⏳ กำลังอัป...</span>}
        {item.status === 'done' && (
          <span style={{ color:'#059669', fontSize:12 }}>
            ✓ {Number(item.result?.inserted || 0).toLocaleString()} แถว
            <span style={{ color:'#7DB9B9', fontFamily:'monospace', marginLeft:4 }}>
              → {P_SHEET[item.platform]}
            </span>
          </span>
        )}
        {item.status === 'error' && (
          <span style={{ color:'#dc2626', fontSize:11 }} title={item.result?.error}>
            ✗ {(item.result?.error || '').slice(0, 90)}
          </span>
        )}
      </td>

      {/* ปุ่มลบ */}
      <td>
        <button className="btn btn-ghost" style={{ padding:'2px 8px', fontSize:12 }}
          onClick={onRemove}>
          {item.status === 'pending' ? 'ลบ' : '×'}
        </button>
      </td>
    </tr>
  );
}
