import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

async function compressImage(file, maxW = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}

function ProductMasterModal({ items, onClose, onSave }) {
  const [list, setList] = useState(items.map(p => ({ ...p })));
  const [busy, setBusy] = useState(false);
  function set(i, k, v) { setList(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  async function save() {
    setBusy(true);
    await onSave(list.filter(p => String(p.sku || '').trim()));
    setBusy(false); onClose();
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 560, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title">📦 จัดการรายการสินค้า</div>
          <p style={{ fontSize: 12, color: 'var(--grey-light)', margin: 0 }}>รหัสสินค้าสำหรับเชื่อมกับชื่อสินค้าจากยอดขาย</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          <table className="data">
            <thead><tr>
              <th style={{ width: 28 }}>#</th>
              <th style={{ width: 130 }}>รหัสสินค้า</th>
              <th>ชื่อสินค้า</th>
              <th style={{ width: 40 }}></th>
            </tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: 'var(--grey-light)', fontSize: 12 }}>{i + 1}</td>
                  <td><input value={p.sku || ''} onChange={e => set(i, 'sku', e.target.value)}
                    style={{ width: 110, fontFamily: 'monospace', fontSize: 12 }} placeholder="TG01" /></td>
                  <td><input value={p.name || ''} onChange={e => set(i, 'name', e.target.value)}
                    style={{ width: '100%' }} placeholder="ชื่อสินค้า..." /></td>
                  <td><button className="btn btn-ghost btn-sm"
                    onClick={() => setList(l => l.filter((_, j) => j !== i))}>x</button></td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--grey-light)', padding: 24 }}>ยังไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setList(l => [...l, { sku: '', name: '' }])}>+ เพิ่มสินค้า</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Accounting() {
  const today = new Date().toISOString().slice(0, 10);
  const jan1  = today.slice(0, 4) + '-01-01';

  const [start,         setStart]         = useState(jan1);
  const [end,           setEnd]           = useState(today);
  const [rows,          setRows]          = useState(null);
  const [meta,          setMeta]          = useState({});
  const [productMaster, setProductMaster] = useState([]);
  const [newItems,      setNewItems]      = useState(new Set());
  const [msg,           setMsg]           = useState(null);
  const [busy,          setBusy]          = useState(false);
  const [filter,        setFilter]        = useState('all');
  const [expandedRow,   setExpandedRow]   = useState(null);
  const [showMaster,    setShowMaster]    = useState(false);
  const [uploadFor,     setUploadFor]     = useState(null);
  const imgRef    = useRef(null);
  const importRef = useRef(null);

  async function load(s, e) {
    const s2 = s || start; const e2 = e || end;
    try {
      const [data, metaData, master] = await Promise.all([
        apiGet('/finance/product-costs?start=' + s2 + '&end=' + e2),
        apiGet('/finance/product-costs-meta').catch(() => ({})),
        apiGet('/finance/product-master').catch(() => [])
      ]);
      setRows(norm(data)); setMeta(metaData || {}); setProductMaster(master || []);
    } catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  function norm(data) {
    return (data || []).map(r => ({
      platform:    r.platform    || '',
      productName: String(r.productName || r.name || '').trim(),
      costType:    r.costType    || 'THB',
      costValue:   Number(r.costValue   || 0)
    }));
  }

  function preset(days) {
    const e2 = today;
    const s2 = days === 0 ? today.slice(0, 8) + '01'
      : new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    setStart(s2); setEnd(e2); load(s2, e2);
  }
  function presetPrev() {
    const d = new Date(today);
    const m = d.getMonth() === 0 ? 12 : d.getMonth();
    const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const s2 = y + '-' + String(m).padStart(2, '0') + '-01';
    const last = new Date(y, m, 0);
    const e2 = y + '-' + String(m).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0');
    setStart(s2); setEnd(e2); load(s2, e2);
  }

  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-costs/sync');
      const existing = new Set((rows || []).map(r => r.productName));
      const fresh = new Set();
      (res.rows || []).forEach(r => { const n = String(r.productName || r.name || '').trim(); if (!existing.has(n)) fresh.add(n); });
      setNewItems(fresh); setRows(norm(res.rows));
      setMsg({ type: 'success', text: '+' + res.added + ' รายการ' + (fresh.size ? ' — NEW ' + fresh.size : '') });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const [res] = await Promise.all([
        apiPost('/finance/product-costs', { rows }),
        apiPost('/finance/product-costs-meta', meta)
      ]);
      setNewItems(new Set());
      setMsg({ type: 'success', text: res.message || 'บันทึกสำเร็จ' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function saveProductMaster(items) {
    await apiPost('/finance/product-master', items);
    setProductMaster(items);
  }

  function exportExcel() {
    const data = (rows || []).map(r => {
      const m = meta[r.productName] || {};
      return { 'แพลตฟอร์ม': r.platform, 'ชื่อสินค้า (จากยอดขาย)': r.productName,
        'เชื่อมกับ SKU': m.linkedSku || '', 'ประเภทต้นทุน': r.costType,
        'ต้นทุน/ชิ้น': r.costValue, 'หมายเหตุ': m.note || '' };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'COGS');
    XLSX.writeFile(wb, 'TGM_COGS_' + today + '.xlsx');
  }

  function importExcel(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const imported = data.map(r => ({
          platform:    String(r['แพลตฟอร์ม'] || r['platform'] || ''),
          productName: String(r['ชื่อสินค้า (จากยอดขาย)'] || r['ชื่อสินค้า'] || r['productName'] || ''),
          costType:    String(r['ประเภทต้นทุน'] || r['costType'] || 'THB'),
          costValue:   Number(r['ต้นทุน/ชิ้น'] || r['costValue'] || 0)
        })).filter(r => r.productName);
        setRows(imported);
        setMsg({ type: 'success', text: 'นำเข้า ' + imported.length + ' รายการ (กดบันทึกเพื่อยืนยัน)' });
      } catch (err) { setMsg({ type: 'error', text: 'อ่านไฟล์ไม่ได้: ' + err.message }); }
    };
    reader.readAsArrayBuffer(file); e.target.value = '';
  }

  const update     = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const updateMeta = (name, k, v) => setMeta(m => ({ ...m, [name]: { ...(m[name] || {}), [k]: v } }));

  function updateComponents(productName, comps) {
    setMeta(m => ({ ...m, [productName]: { ...(m[productName] || {}), components: comps } }));
    const total = comps.reduce((s, c) => s + Number(c.cost || 0), 0);
    if (total > 0) setRows(rs => rs.map(r => r.productName === productName ? { ...r, costType: 'THB', costValue: total } : r));
  }

  function pickImage(name) { setUploadFor(name); imgRef.current && imgRef.current.click(); }
  async function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f || !uploadFor) return;
    try { const c = await compressImage(f, 200); updateMeta(uploadFor, 'imageUrl', c); } catch {}
    setUploadFor(null); e.target.value = '';
  }

  const allRows      = rows || [];
  const linkedCount  = allRows.filter(r => (meta[r.productName] || {}).linkedSku).length;
  const unlinkCount  = allRows.length - linkedCount;
  const missingCount = allRows.filter(r => r.costValue === 0).length;
  const newCount     = newItems.size;
  const masterMap    = Object.fromEntries(productMaster.map(p => [p.sku, p]));

  const visible = allRows.map((r, i) => ({ ...r, _i: i, _meta: meta[r.productName] || {} })).filter(r => {
    if (filter === 'unlinked') return !r._meta.linkedSku;
    if (filter === 'missing')  return r.costValue === 0;
    if (filter === 'new')      return newItems.has(r.productName);
    return true;
  });

  return (
    <div>
      {showMaster && <ProductMasterModal items={productMaster} onClose={() => setShowMaster(false)} onSave={saveProductMaster} />}
      <input type="file" accept="image/*"    ref={imgRef}    style={{ display: 'none' }} onChange={handleFile} />
      <input type="file" accept=".xlsx,.xls" ref={importRef} style={{ display: 'none' }} onChange={importExcel} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div className="page-title">ต้นทุนสินค้า (COGS)</div>
          <div className="page-sub">กรอกต้นทุน/ชิ้น → ระบบคูณยอดขายอัตโนมัติ</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setShowMaster(true)}>📦 จัดการสินค้า</button>
          <button className="btn btn-ghost" onClick={exportExcel}>↓ Export Excel</button>
          <button className="btn btn-ghost" onClick={() => importRef.current && importRef.current.click()}>↑ Import Excel</button>
          <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : '💾 บันทึกต้นทุน'}</button>
        </div>
      </div>

      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      {/* Date bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--grey-light)', whiteSpace: 'nowrap' }}>เริ่ม</span>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--grey-light)', whiteSpace: 'nowrap' }}>ถึง</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => preset(0)}>เดือนนี้</button>
        <button className="btn btn-ghost btn-sm" onClick={() => preset(30)}>30 วัน</button>
        <button className="btn btn-ghost btn-sm" onClick={presetPrev}>เดือนก่อน</button>
        <button className="btn btn-green btn-sm" onClick={() => load()}>แสดงข้อมูล</button>
      </div>

      {/* KPI cards */}
      {rows !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'สินค้าทั้งหมด',         value: allRows.length,                     color: 'var(--acc)' },
            { label: 'เชื่อมแล้ว',              value: linkedCount + '/' + allRows.length, color: linkedCount === allRows.length ? '#10b981' : '#f59e0b' },
            { label: 'ยังไม่กรอกต้นทุน',       value: missingCount,                       color: missingCount > 0 ? '#f59e0b' : '#10b981' },
            { label: 'ใหม่ (ยังไม่ตั้งค่า)',    value: newCount,                           color: newCount > 0 ? '#3b82f6' : 'var(--grey-light)' }
          ].map(k => (
            <div key={k.label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'all',      label: 'ทั้งหมด (' + allRows.length + ')' },
          { key: 'unlinked', label: 'ยังไม่เชื่อม (' + unlinkCount + ')',  warn: unlinkCount > 0 },
          { key: 'missing',  label: 'ยังไม่กรอก (' + missingCount + ')',   warn: missingCount > 0 },
          { key: 'new',      label: 'NEW (' + newCount + ')',               info: newCount > 0 }
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
            background: filter === t.key ? 'var(--acc)' : t.warn ? 'rgba(245,158,11,.15)' : t.info ? 'rgba(59,130,246,.12)' : 'var(--border)',
            color: filter === t.key ? '#fff' : t.warn ? '#92400e' : t.info ? '#1d4ed8' : 'var(--grey-light)',
            fontWeight: filter === t.key ? 700 : 400
          }}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={sync}>🔄 ดึงสินค้าจากยอดขาย</button>
      </div>

      {/* Table */}
      {!rows ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 46 }}>รูป</th>
                <th style={{ width: 110 }}>สถานะ</th>
                <th>ชื่อสินค้า (จากยอดขาย)</th>
                <th style={{ width: 210 }}>เชื่อมกับสินค้าในระบบ</th>
                <th style={{ width: 90 }}>แพลตฟอร์ม</th>
                <th style={{ width: 165 }}>ต้นทุน/ชิ้น (฿)</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const isLinked   = !!r._meta.linkedSku;
                const isNew      = newItems.has(r.productName);
                const comps      = r._meta.components || [];
                const isExpanded = expandedRow === r._i;
                const linked     = r._meta.linkedSku ? masterMap[r._meta.linkedSku] : null;
                return (
                  <React.Fragment key={r._i}>
                    <tr>
                      <td style={{ padding: '4px 6px' }}>
                        <div onClick={() => pickImage(r.productName)} title="คลิกเพื่อเลือกรูป"
                          style={{ width: 36, height: 36, borderRadius: 6, cursor: 'pointer', background: 'var(--border)',
                            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {r._meta.imageUrl
                            ? <img src={r._meta.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 14, color: 'var(--grey-light)' }}>📷</span>}
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: isLinked ? '#d1fae5' : '#fee2e2', color: isLinked ? '#065f46' : '#991b1b' }}>
                          {isLinked ? '✓ เชื่อมแล้ว' : 'ยังไม่เชื่อม'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isNew && <span style={{ background: '#3b82f6', color: '#fff', fontSize: 10, fontWeight: 700,
                            padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>NEW</span>}
                          <span>{r.productName}</span>
                        </div>
                        {linked && <div style={{ fontSize: 11, color: 'var(--mint-dark)', marginTop: 2 }}>→ {linked.sku}: {linked.name}</div>}
                      </td>
                      <td>
                        {productMaster.length > 0 ? (
                          <select value={r._meta.linkedSku || ''} style={{ width: 198, fontSize: 12 }}
                            onChange={e => updateMeta(r.productName, 'linkedSku', e.target.value)}>
                            <option value="">— ยังไม่เชื่อม —</option>
                            {productMaster.map(p => (
                              <option key={p.sku} value={p.sku}>{p.sku}{p.name ? ' — ' + p.name : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setShowMaster(true)}>+ เพิ่มสินค้าในระบบ</button>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: r.platform === 'TikTok' ? 'rgba(0,0,0,.08)' : 'rgba(238,77,45,.1)',
                          color: r.platform === 'TikTok' ? '#111' : '#c0392b' }}>
                          {r.platform || 'ทุกช่อง'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input type="number" step="0.01" value={r.costValue} onChange={e => update(r._i, 'costValue', e.target.value)}
                            style={{ width: 72, textAlign: 'right', color: r.costValue === 0 ? '#f59e0b' : undefined }} />
                          <span style={{ fontSize: 11, color: 'var(--grey-light)' }}>฿</span>
                          <select value={r.costType} onChange={e => update(r._i, 'costType', e.target.value)}
                            style={{ fontSize: 11, padding: '3px 4px' }}>
                            <option value="THB">บาท/ชิ้น</option>
                            <option value="%">%</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpandedRow(isExpanded ? null : r._i)}
                          style={{ padding: '2px 7px', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ background: 'rgba(0,0,0,.03)', padding: '14px 20px 18px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 14 }}>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 4 }}>ประเภทต้นทุน</div>
                              <select value={r.costType} onChange={e => update(r._i, 'costType', e.target.value)} style={{ width: '100%' }}>
                                <option value="THB">บาท/ชิ้น (Fixed)</option>
                                <option value="%">% ของยอดขาย</option>
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 4 }}>หมายเหตุ</div>
                              <input value={r._meta.note || ''} placeholder="เพิ่มหมายเหตุ..."
                                onChange={e => updateMeta(r.productName, 'note', e.target.value)} style={{ width: '100%' }} />
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--grey-light)', marginBottom: 8 }}>
                            ส่วนประกอบ (คำนวณรวมเป็นต้นทุน/ชิ้น)
                          </div>
                          <table className="data" style={{ maxWidth: 480, marginBottom: 10 }}>
                            <thead><tr>
                              <th>ชื่อส่วนประกอบ</th>
                              <th className="num" style={{ width: 120 }}>ต้นทุน (฿)</th>
                              <th style={{ width: 36 }}></th>
                            </tr></thead>
                            <tbody>
                              {comps.map((c, ci) => (
                                <tr key={ci}>
                                  <td><input value={c.name || ''} placeholder="เช่น Vitamin C 30 เม็ด" style={{ width: '100%' }}
                                    onChange={e => { const n = comps.map((x, xi) => xi === ci ? { ...x, name: e.target.value } : x); updateComponents(r.productName, n); }} /></td>
                                  <td><input type="number" step="0.01" value={c.cost || 0} style={{ width: '100%', textAlign: 'right' }}
                                    onChange={e => { const n = comps.map((x, xi) => xi === ci ? { ...x, cost: Number(e.target.value) } : x); updateComponents(r.productName, n); }} /></td>
                                  <td><button className="btn btn-ghost btn-sm"
                                    onClick={() => updateComponents(r.productName, comps.filter((_, xi) => xi !== ci))}>x</button></td>
                                </tr>
                              ))}
                              {comps.length === 0 && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--grey-light)', padding: 10, fontSize: 12 }}>ยังไม่มีส่วนประกอบ</td></tr>
                              )}
                              {comps.length > 0 && (
                                <tr>
                                  <td style={{ fontWeight: 600, fontSize: 12 }}>รวม</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                                    {comps.reduce((s, c) => s + Number(c.cost || 0), 0).toFixed(2)}
                                  </td>
                                  <td></td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => updateComponents(r.productName, [...comps, { name: '', cost: 0 }])}>
                            + เพิ่มส่วนประกอบ
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--grey-light)', padding: 28 }}>
                  ไม่พบสินค้า — ลองกด "ดึงสินค้าจากยอดขาย"
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
