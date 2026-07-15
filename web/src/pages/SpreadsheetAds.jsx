import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../api.js';
import * as XLSX from 'xlsx';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const n = v => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(x) ? 0 : x; };
const fmt2 = v => v ? Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const fmtRoas = v => v ? Number(v).toFixed(2) + 'x' : '-';

function isoToThai(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
}
function isoToThaiLong(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: '2-digit' });
}
function changedAtThai(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// Generate all days of a month
function daysInMonth(year, month) {
  const days = [];
  const count = new Date(year, month, 0).getDate();
  for (let d = 1; d <= count; d++) {
    days.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  return days;
}

// Column definitions
const COLS = [
  { key: 'ttGmvmaxRevenue',  label: 'GMV MAX', sub: 'ยอดขาย',   w: 110, color: '#059669' },
  { key: 'ttGmvmaxSpend',    label: 'GMV MAX', sub: 'ค่าแอด',   w: 110, color: '#dc2626' },
  { key: 'ttGmvliveRevenue', label: 'GMV LIVE', sub: 'ยอดขาย',  w: 110, color: '#059669' },
  { key: 'ttGmvliveSpend',   label: 'GMV LIVE', sub: 'ค่าแอด',  w: 110, color: '#dc2626' },
  { key: 'ttSpecificSpend',  label: 'Ads เฉพาะ', sub: 'ค่าแอด', w: 100, color: '#dc2626' },
  { key: 'ttSpecificCount',  label: 'เฉพาะ', sub: 'จำนวน',      w: 70,  color: '#64748b', isInt: true },
  { key: 'ttBackendSpend',   label: 'หลังบ้าน', sub: 'ค่าแอด',  w: 100, color: '#dc2626' },
  { key: 'shopeeSpend',      label: 'Shopee', sub: 'ค่าแอด',     w: 100, color: '#f97316' },
  { key: 'shopeeLiveSpend',  label: 'Shopee Live', sub: 'ค่าแอด',w: 100, color: '#f97316' },
  { key: 'metaSpend',        label: 'Meta', sub: 'ค่าแอด',       w: 100, color: '#1877f2' },
];

const COMPUTED = [
  { key: '_ttRevenue',  label: 'ยอดขาย TT', sub: 'รวม',    color: '#059669', bold: true },
  { key: '_ttSpend',   label: 'ค่าแอด TT',  sub: 'รวม',    color: '#dc2626', bold: true },
  { key: '_roas',      label: 'ROAS',         sub: 'วันนี้', color: '#7c3aed', bold: true, isRoas: true },
];

function computeRow(r) {
  const ttRev  = n(r.ttGmvmaxRevenue) + n(r.ttGmvliveRevenue);
  const ttSpend = n(r.ttGmvmaxSpend) + n(r.ttGmvliveSpend) + n(r.ttSpecificSpend) + n(r.ttBackendSpend);
  const total  = ttSpend + n(r.shopeeSpend) + n(r.shopeeLiveSpend) + n(r.metaSpend);
  return { ...r, _ttRevenue: ttRev, _ttSpend: ttSpend, _totalSpend: total, _roas: total > 0 ? ttRev / total : 0 };
}

function sumRows(rows) {
  const s = { ttGmvmaxRevenue:0, ttGmvmaxSpend:0, ttGmvliveRevenue:0, ttGmvliveSpend:0,
    ttSpecificSpend:0, ttSpecificCount:0, ttBackendSpend:0, shopeeSpend:0, shopeeLiveSpend:0, metaSpend:0 };
  rows.forEach(r => { Object.keys(s).forEach(k => { s[k] += n(r[k]); }); });
  return computeRow(s);
}

// ──────────────────────────────────────────────
// Editable cell
// ──────────────────────────────────────────────
function Cell({ value, onChange, onBlur, onKeyDown, autoFocus, isInt }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus) ref.current?.select(); }, [autoFocus]);
  return (
    <input ref={ref} type="text" inputMode="decimal" defaultValue={value === 0 ? '' : value}
      onKeyDown={onKeyDown} onBlur={e => onBlur(e.target.value)}
      style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent',
        textAlign: 'right', fontSize: 12, fontFamily: 'inherit', padding: '0 4px' }} />
  );
}

// ──────────────────────────────────────────────
// File Upload parser — reads TGM-format xlsx/csv
// Columns expected: Date | GMV MAX ยอดขาย | GMV MAX ค่าแอด | GMV LIVE ยอดขาย | GMV LIVE ค่าแอด |
//                   Ads เฉพาะ | จำนวน | Ads หลังบ้าน | Shopee | Shopee Live | Meta
// ──────────────────────────────────────────────
function parseUploadFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล');

  // Try to find header row
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const joined = raw[i].join('|').toLowerCase();
    if (joined.includes('date') || joined.includes('วันที่') || joined.includes('gmv')) {
      headerIdx = i; break;
    }
  }

  const header = raw[headerIdx].map(h => String(h || '').toLowerCase().trim());
  const rows = [];

  const findCol = (...keywords) => {
    for (const kw of keywords) {
      const idx = header.findIndex(h => h.includes(kw.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const mapCols = {
    date:             findCol('date','วันที่','entry'),
    ttGmvmaxRevenue:  findCol('gmv max ยอดขาย','gmv max rev','gmvmax_rev'),
    ttGmvmaxSpend:    findCol('gmv max ค่าแอด','gmv max spend','gmvmax_spend'),
    ttGmvliveRevenue: findCol('gmv live ยอดขาย','gmv live rev','gmvlive_rev'),
    ttGmvliveSpend:   findCol('gmv live ค่าแอด','gmv live spend','gmvlive_spend'),
    ttSpecificSpend:  findCol('ads เฉพาะ','specific spend','specific_spend'),
    ttSpecificCount:  findCol('จำนวน','count','specific_count'),
    ttBackendSpend:   findCol('หลังบ้าน','backend','backend_spend'),
    shopeeSpend:      findCol('shopee ads','shopee_spend'),
    shopeeLiveSpend:  findCol('shopee live','shopee_live'),
    metaSpend:        findCol('meta','facebook','fb_spend'),
  };

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row[mapCols.date]) continue;

    let dateStr = '';
    const rawDate = row[mapCols.date];
    if (typeof rawDate === 'number') {
      // Excel date serial
      const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
      dateStr = d.toISOString().slice(0, 10);
    } else {
      const s = String(rawDate).trim();
      // Try DD/MM/YYYY or YYYY-MM-DD
      const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) dateStr = m2[0];
      else if (m1) {
        const yr = m1[3].length === 2 ? '20' + m1[3] : m1[3];
        dateStr = `${yr}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
      } else continue;
    }

    const get = key => mapCols[key] >= 0 ? n(row[mapCols[key]]) : 0;
    rows.push({
      date: dateStr,
      ttGmvmaxRevenue:  get('ttGmvmaxRevenue'),
      ttGmvmaxSpend:    get('ttGmvmaxSpend'),
      ttGmvliveRevenue: get('ttGmvliveRevenue'),
      ttGmvliveSpend:   get('ttGmvliveSpend'),
      ttSpecificSpend:  get('ttSpecificSpend'),
      ttSpecificCount:  get('ttSpecificCount'),
      ttBackendSpend:   get('ttBackendSpend'),
      shopeeSpend:      get('shopeeSpend'),
      shopeeLiveSpend:  get('shopeeLiveSpend'),
      metaSpend:        get('metaSpend'),
    });
  }
  return rows;
}

// ──────────────────────────────────────────────
// Export template xlsx
// ──────────────────────────────────────────────
function exportTemplate(year, month) {
  const days = daysInMonth(year, month);
  const header = ['Date (YYYY-MM-DD)','GMV MAX ยอดขาย','GMV MAX ค่าแอด','GMV LIVE ยอดขาย','GMV LIVE ค่าแอด',
    'Ads เฉพาะ','จำนวน','หลังบ้าน','Shopee Ads','Shopee Live','Meta'];
  const rows = [header, ...days.map(d => [d,...Array(10).fill('')])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ads');
  XLSX.writeFile(wb, `TGM_Ads_${year}_${String(month).padStart(2,'0')}.xlsx`);
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
export default function SpreadsheetAds() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab,   setTab]   = useState('sheet'); // 'sheet' | 'log'

  // data: { [date]: rowObject }
  const [data,     setData]     = useState({});
  const [editing,  setEditing]  = useState(null); // { date, key }
  const [dirty,    setDirty]    = useState({}); // { [date]: true }
  const [saving,   setSaving]   = useState({});
  const [saved,    setSaved]    = useState({}); // flash green
  const [error,    setError]    = useState('');

  // Log
  const [logRows,  setLogRows]  = useState([]);
  const [logBusy,  setLogBusy]  = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [preview,   setPreview]   = useState(null); // rows to confirm
  const [previewFile, setPreviewFile] = useState('');
  const fileRef = useRef();
  const dropRef = useRef();

  const days = daysInMonth(year, month);

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      const mm = String(month).padStart(2,'0');
      const rows = await apiGet('/ads-manual', {
        start: `${year}-${mm}-01`, end: `${year}-${mm}-31`
      });
      const map = {};
      rows.forEach(r => { map[r.date] = r; });
      setData(map);
      setDirty({});
    } catch (err) { setError(err.message); }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load log ──
  const loadLog = useCallback(async () => {
    setLogBusy(true);
    try {
      const mm = String(month).padStart(2,'0');
      const rows = await apiGet('/ads-manual/log', {
        start: `${year}-${mm}-01`, end: `${year}-${mm}-31`, limit: 500
      });
      setLogRows(rows);
    } catch { setLogRows([]); }
    finally { setLogBusy(false); }
  }, [year, month]);

  useEffect(() => { if (tab === 'log') loadLog(); }, [tab, loadLog]);

  // ── Cell edit helpers ──
  function getRow(date) {
    return data[date] || { date, ttGmvmaxRevenue:0, ttGmvmaxSpend:0, ttGmvliveRevenue:0,
      ttGmvliveSpend:0, ttSpecificSpend:0, ttSpecificCount:0, ttBackendSpend:0,
      shopeeSpend:0, shopeeLiveSpend:0, metaSpend:0, notes:'', reporter:'' };
  }

  function cellChange(date, key, val) {
    setData(prev => {
      const row = { ...getRow(date), [key]: n(val) };
      return { ...prev, [date]: row };
    });
    setDirty(prev => ({ ...prev, [date]: true }));
  }

  async function saveRow(date) {
    const row = getRow(date);
    setSaving(prev => ({ ...prev, [date]: true }));
    setError('');
    try {
      await apiPost('/ads-manual', row);
      setDirty(prev => { const d = { ...prev }; delete d[date]; return d; });
      setSaved(prev => ({ ...prev, [date]: true }));
      setTimeout(() => setSaved(prev => { const d = { ...prev }; delete d[date]; return d; }), 1500);
    } catch (err) { setError('บันทึกวันที่ ' + date + ': ' + err.message); }
    finally { setSaving(prev => ({ ...prev, [date]: false })); }
  }

  async function deleteRow(date) {
    if (!confirm('ลบข้อมูลวันที่ ' + isoToThaiLong(date) + '?')) return;
    try {
      await apiDelete('/ads-manual/' + date);
      setData(prev => { const d = { ...prev }; delete d[date]; return d; });
    } catch (err) { setError(err.message); }
  }

  // Keyboard navigation: Tab→next cell, Enter→save+next row
  function handleKeyDown(e, date, colIdx) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRow(date);
      setEditing(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const nextIdx = e.shiftKey ? colIdx - 1 : colIdx + 1;
      if (nextIdx >= 0 && nextIdx < COLS.length) {
        setEditing({ date, key: COLS[nextIdx].key });
      } else {
        // Next row
        const dayIdx = days.indexOf(date);
        const nextDay = e.shiftKey ? days[dayIdx - 1] : days[dayIdx + 1];
        if (nextDay) setEditing({ date: nextDay, key: COLS[e.shiftKey ? COLS.length-1 : 0].key });
        else setEditing(null);
      }
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  }

  // ── File upload ──
  async function handleFile(file) {
    if (!file) return;
    setUploadMsg(''); setError('');
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseUploadFile(new Uint8Array(buffer));
      if (rows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์ — ตรวจสอบ header และรูปแบบวันที่');
      setPreview(rows);
      setPreviewFile(file.name);
    } catch (err) { setError('อ่านไฟล์ไม่ได้: ' + err.message); }
  }

  async function confirmUpload() {
    if (!preview) return;
    setUploading(true); setUploadMsg(''); setError('');
    try {
      const result = await apiPost('/ads-manual/bulk', { rows: preview, sourceFile: previewFile });
      setUploadMsg(`✅ นำเข้าสำเร็จ ${result.rowsProcessed} วัน (เปลี่ยน ${result.totalChanged} field) จากไฟล์ "${previewFile}"`);
      setPreview(null); setPreviewFile('');
      await loadData();
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  }

  // Drag-and-drop
  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
    dropRef.current?.classList.remove('drag-over');
  }

  // MTD totals
  const filledRows = days.map(d => data[d]).filter(Boolean).map(computeRow);
  const mtd = sumRows(filledRows);

  // ── Render ──
  const TH = ({ children, style }) => (
    <th style={{ padding: '6px 4px', fontSize: 11, fontWeight: 700, color: '#fff', background: '#1a2a3a',
      textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2, ...style }}>
      {children}
    </th>
  );

  const mm = String(month).padStart(2,'0');

  return (
    <div style={{ maxWidth: '100%' }}>
      <div className="page-title">ค่าแอดรายวัน (Spreadsheet)</div>
      <div className="page-sub">แก้ไข cell ได้เลย — บันทึกอัตโนมัติ + log ทุกการเปลี่ยนแปลง</div>

      {/* Error */}
      {error && <div style={{ background:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#dc2626', fontSize:13 }}>⚠️ {error}</div>}
      {uploadMsg && <div style={{ background:'#f0fdf4', border:'1.5px solid #6ee7b7', borderRadius:8, padding:'10px 14px', marginBottom:12, color:'#065f46', fontSize:13 }}>{uploadMsg}</div>}

      {/* Month nav + Tabs */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
        <button onClick={() => { const d = new Date(year, month-2); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
          style={btnStyle}>◀</button>
        <span style={{ fontWeight:700, fontSize:15, minWidth:100, textAlign:'center' }}>
          {new Date(year, month-1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => { const d = new Date(year, month); setYear(d.getFullYear()); setMonth(d.getMonth()+1); }}
          style={btnStyle}>▶</button>

        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {[['sheet','📊 ตาราง'],['log','📋 ประวัติแก้ไข']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...btnStyle, background: tab===t ? '#1a2a3a' : '#f1f5f9', color: tab===t ? '#B2D8D8' : '#5a6a7a', fontWeight:700 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── SHEET TAB ── */}
      {tab === 'sheet' && (
        <>
          {/* Upload zone */}
          <div ref={dropRef}
            onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drag-over'); }}
            onDragLeave={() => dropRef.current?.classList.remove('drag-over')}
            onDrop={onDrop}
            style={{ border:'2px dashed #B2D8D8', borderRadius:10, padding:'14px 20px', marginBottom:14,
              background:'#f8fffe', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:13, color:'#5a6a7a', flex:1 }}>
              📁 ลากไฟล์ xlsx มาวางตรงนี้ หรือ
            </span>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display:'none' }}
              onChange={e => handleFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle, background:'#B2D8D8', fontWeight:700 }}>
              เลือกไฟล์
            </button>
            <button onClick={() => exportTemplate(year, month)} style={{ ...btnStyle, background:'#e0f2f1', color:'#065f46' }}>
              ⬇️ ดาวน์โหลด template
            </button>
          </div>

          {/* Upload preview */}
          {preview && (
            <div style={{ background:'#fffbeb', border:'1.5px solid #fcd34d', borderRadius:10, padding:14, marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>
                📋 ตัวอย่างข้อมูลจากไฟล์ "{previewFile}" ({preview.length} วัน)
              </div>
              <div style={{ overflowX:'auto', marginBottom:10, maxHeight:200 }}>
                <table style={{ fontSize:11, borderCollapse:'collapse' }}>
                  <thead>
                    <tr><th style={previewTh}>วันที่</th>{COLS.map(c => <th key={c.key} style={previewTh}>{c.label}<br/>{c.sub}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.slice(0,5).map(r => (
                      <tr key={r.date}>
                        <td style={previewTd}>{isoToThai(r.date)}</td>
                        {COLS.map(c => <td key={c.key} style={{ ...previewTd, textAlign:'right' }}>{r[c.key] || ''}</td>)}
                      </tr>
                    ))}
                    {preview.length > 5 && <tr><td colSpan={COLS.length+1} style={{ ...previewTd, color:'#94a3b8', textAlign:'center' }}>... และอีก {preview.length-5} วัน</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={confirmUpload} disabled={uploading}
                  style={{ ...btnStyle, background:'#059669', color:'#fff', fontWeight:700 }}>
                  {uploading ? '⏳ กำลังนำเข้า...' : `✅ ยืนยันนำเข้า ${preview.length} วัน`}
                </button>
                <button onClick={() => { setPreview(null); setPreviewFile(''); }}
                  style={{ ...btnStyle, background:'#f1f5f9' }}>ยกเลิก</button>
              </div>
            </div>
          )}

          {/* Spreadsheet grid */}
          <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #e2e8f0' }}>
            <table style={{ borderCollapse:'collapse', fontSize:12, minWidth:900 }}>
              <thead>
                <tr>
                  <TH style={{ minWidth:70, left:0, zIndex:3 }}>วันที่</TH>
                  {COLS.map(c => (
                    <TH key={c.key} style={{ minWidth:c.w, color: c.color === '#059669' ? '#86efac' : c.color === '#dc2626' ? '#fca5a5' : '#B2D8D8' }}>
                      <div>{c.label}</div>
                      <div style={{ fontSize:10, fontWeight:400, opacity:0.8 }}>{c.sub}</div>
                    </TH>
                  ))}
                  {COMPUTED.map(c => (
                    <TH key={c.key} style={{ background:'#0f172a', color: c.color === '#059669' ? '#86efac' : c.color === '#7c3aed' ? '#c4b5fd' : '#fca5a5' }}>
                      <div>{c.label}</div>
                      <div style={{ fontSize:10, fontWeight:400, opacity:0.8 }}>{c.sub}</div>
                    </TH>
                  ))}
                  <TH style={{ minWidth:60 }}>บันทึก</TH>
                </tr>
              </thead>
              <tbody>
                {days.map((date, rowIdx) => {
                  const raw = getRow(date);
                  const row = computeRow(raw);
                  const hasData = !!data[date];
                  const isDirty = !!dirty[date];
                  const isSaving = !!saving[date];
                  const isSaved = !!saved[date];
                  const isToday = date === new Date().toISOString().slice(0,10);
                  const bg = isSaved ? '#f0fdf4' : isDirty ? '#fffbeb' : rowIdx % 2 === 0 ? '#fff' : '#f8fafc';

                  return (
                    <tr key={date} style={{ background: bg, outline: isToday ? '2px solid #B2D8D8' : 'none', outlineOffset: -1 }}>
                      {/* Date */}
                      <td style={{ padding:'4px 8px', fontWeight: isToday ? 700 : 400, color: isToday ? '#1a2a3a' : '#5a6a7a',
                        fontSize:12, whiteSpace:'nowrap', position:'sticky', left:0, background:bg, zIndex:1 }}>
                        {isoToThai(date)}
                        {!hasData && <span style={{ color:'#d1d5db', marginLeft:4 }}>•</span>}
                      </td>

                      {/* Editable cols */}
                      {COLS.map((col, colIdx) => {
                        const isEditing = editing?.date === date && editing?.key === col.key;
                        const val = raw[col.key] || 0;
                        return (
                          <td key={col.key}
                            onClick={() => setEditing({ date, key: col.key })}
                            style={{ padding:'3px 2px', textAlign:'right', cursor:'text', minWidth:col.w,
                              color: val > 0 ? col.color : '#d1d5db',
                              background: isEditing ? '#eff6ff' : undefined,
                              border: isEditing ? '1.5px solid #93c5fd' : '1px solid transparent' }}>
                            {isEditing
                              ? <Cell value={val} isInt={col.isInt}
                                  onBlur={v => { cellChange(date, col.key, v); setEditing(null); }}
                                  onKeyDown={e => handleKeyDown(e, date, colIdx)}
                                  autoFocus />
                              : <span style={{ padding:'0 4px' }}>
                                  {val > 0 ? (col.isInt ? val : fmt2(val)) : ''}
                                </span>
                            }
                          </td>
                        );
                      })}

                      {/* Computed cols */}
                      <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:700, color:'#059669', background:'#f0fdf4' }}>
                        {row._ttRevenue > 0 ? fmt2(row._ttRevenue) : ''}
                      </td>
                      <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:700, color:'#dc2626', background:'#fef2f2' }}>
                        {row._ttSpend > 0 ? fmt2(row._ttSpend) : ''}
                      </td>
                      <td style={{ padding:'3px 6px', textAlign:'right', fontWeight:700, color:'#7c3aed', background:'#f5f3ff' }}>
                        {row._roas > 0 ? fmtRoas(row._roas) : ''}
                      </td>

                      {/* Save button */}
                      <td style={{ padding:'3px 6px', textAlign:'center' }}>
                        {isDirty && !isSaving && (
                          <button onClick={() => saveRow(date)}
                            style={{ background:'#1a2a3a', color:'#B2D8D8', border:'none', borderRadius:5,
                              padding:'3px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>บันทึก</button>
                        )}
                        {isSaving && <span style={{ color:'#94a3b8', fontSize:11 }}>⏳</span>}
                        {isSaved && <span style={{ color:'#059669', fontSize:13 }}>✅</span>}
                        {hasData && !isDirty && !isSaving && !isSaved && (
                          <button onClick={() => deleteRow(date)}
                            style={{ background:'none', border:'none', color:'#cbd5e1', cursor:'pointer', fontSize:11 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* MTD row */}
                <tr style={{ background:'#1a2a3a', fontWeight:700 }}>
                  <td style={{ padding:'7px 8px', color:'#B2D8D8', fontSize:12, position:'sticky', left:0, background:'#1a2a3a', zIndex:1 }}>MTD</td>
                  {COLS.map(c => (
                    <td key={c.key} style={{ padding:'7px 6px', textAlign:'right', color: mtd[c.key] ? '#e2e8f0' : '#475569', fontSize:12 }}>
                      {mtd[c.key] > 0 ? (c.isInt ? mtd[c.key] : fmt2(mtd[c.key])) : ''}
                    </td>
                  ))}
                  <td style={{ padding:'7px 6px', textAlign:'right', color:'#86efac', fontSize:12 }}>{mtd._ttRevenue > 0 ? fmt2(mtd._ttRevenue) : ''}</td>
                  <td style={{ padding:'7px 6px', textAlign:'right', color:'#fca5a5', fontSize:12 }}>{mtd._ttSpend > 0 ? fmt2(mtd._ttSpend) : ''}</td>
                  <td style={{ padding:'7px 6px', textAlign:'right', color:'#c4b5fd', fontSize:12 }}>{mtd._roas > 0 ? fmtRoas(mtd._roas) : ''}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, color:'#94a3b8', marginTop:8 }}>
            💡 คลิก cell เพื่อแก้ไข | Tab/Enter เพื่อย้าย cell | เซลล์สีเหลือง = ยังไม่บันทึก | ✅ = บันทึกแล้ว
          </div>
        </>
      )}

      {/* ── LOG TAB ── */}
      {tab === 'log' && (
        <div>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:12 }}>
            <span style={{ fontSize:13, color:'#5a6a7a' }}>
              แสดง {logRows.length} รายการ เดือน {new Date(year, month-1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={loadLog} style={{ ...btnStyle, marginLeft:'auto' }}>🔄 รีโหลด</button>
          </div>
          {logBusy && <div style={{ color:'#94a3b8', fontSize:13 }}>กำลังโหลด...</div>}
          {!logBusy && logRows.length === 0 && (
            <div style={{ color:'#94a3b8', fontSize:13, padding:20, textAlign:'center' }}>ยังไม่มีประวัติการแก้ไขในเดือนนี้</div>
          )}
          {logRows.length > 0 && (
            <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid #e2e8f0' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                    <th style={logTh}>เวลาแก้ไข</th>
                    <th style={logTh}>วันที่ข้อมูล</th>
                    <th style={logTh}>Action</th>
                    <th style={logTh}>Field</th>
                    <th style={{ ...logTh, color:'#fca5a5' }}>ค่าเก่า</th>
                    <th style={{ ...logTh, color:'#86efac' }}>ค่าใหม่</th>
                    <th style={logTh}>แก้โดย</th>
                    <th style={logTh}>แหล่ง</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.map((r, i) => (
                    <tr key={r.id} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                      <td style={logTd}>{changedAtThai(r.changedAt)}</td>
                      <td style={logTd}>{isoToThaiLong(r.entityDate)}</td>
                      <td style={logTd}>
                        <span style={{ background: r.action==='CREATE'?'#dcfce7':r.action==='UPDATE'?'#dbeafe':r.action==='DELETE'?'#fee2e2':'#ede9fe',
                          color: r.action==='CREATE'?'#15803d':r.action==='UPDATE'?'#1d4ed8':r.action==='DELETE'?'#dc2626':'#6d28d9',
                          padding:'2px 7px', borderRadius:99, fontSize:10, fontWeight:700 }}>
                          {r.action}
                        </span>
                      </td>
                      <td style={{ ...logTd, fontWeight:500 }}>{r.fieldName || '-'}</td>
                      <td style={{ ...logTd, color:'#dc2626', textAlign:'right' }}>
                        {r.oldValue !== null ? r.oldValue : <span style={{ color:'#d1d5db' }}>-</span>}
                      </td>
                      <td style={{ ...logTd, color:'#059669', textAlign:'right', fontWeight:600 }}>
                        {r.newValue !== null ? r.newValue : <span style={{ color:'#d1d5db' }}>-</span>}
                      </td>
                      <td style={logTd}>{r.changedBy}</td>
                      <td style={logTd}>
                        <span style={{ fontSize:10, color:'#64748b' }}>
                          {r.source === 'FILE_UPLOAD' ? '📁 ' + (r.sourceFile || 'file') : '✏️ manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const btnStyle = { background:'#f1f5f9', color:'#1a2a3a', border:'1px solid #e2e8f0', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontFamily:'inherit' };
const previewTh = { background:'#1a2a3a', color:'#fff', padding:'5px 8px', fontSize:10, textAlign:'center', whiteSpace:'nowrap' };
const previewTd = { padding:'4px 8px', borderBottom:'1px solid #f1f5f9', fontSize:11 };
const logTh = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700 };
const logTd = { padding:'6px 10px', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' };
