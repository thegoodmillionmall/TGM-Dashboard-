import React, { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

function compressImage(dataUrl, maxSize = 200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ── Status badge ── */
function StatusBadge({ linked, hasCost }) {
  if (!linked)         return <span style={badge('#ef4444','#fff')}>⚠ ยังไม่เชื่อม</span>;
  if (!hasCost)        return <span style={badge('#f59e0b','#fff')}>! กรอกต้นทุน</span>;
  return               <span style={badge('#10b981','#fff')}>✓ ตั้งค่าแล้ว</span>;
}
function badge(bg, color) {
  return { background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' };
}

/* ══ Image Preview Modal ══ */
function ImagePreviewModal({ src, name, onClose, onChange }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 20, maxWidth: 340, width: '90vw',
        boxShadow: '0 20px 50px rgba(26,42,58,.35)'
      }}>
        <img src={src} alt={name} style={{ width: '100%', borderRadius: 10, maxHeight: 300, objectFit: 'contain', display: 'block' }} />
        <div style={{ fontSize: 12, color: 'var(--grey-light)', textAlign: 'center', marginTop: 8 }}>{name}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { onChange(); onClose(); }}>🔄 เปลี่ยนรูป</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}

/* ══ Product Master Modal ══ */
function ProductMasterModal({ items, onClose, onSave }) {
  const [list, setList] = useState(items.map(p => ({ ...p })));
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setList(l => l.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const existingCats = [...new Set(list.map(p => p.category||'').filter(Boolean))].sort();

  async function save() {
    setBusy(true);
    await onSave(list.filter(p => p.sku.trim()).map(p => ({
      sku: p.sku.trim(), name: p.name.trim(), category: (p.category||'').trim()
    })));
    setBusy(false); onClose();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 660, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '82vh' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title">📦 จัดการรายการสินค้า</div>
          <p style={{ fontSize: 12, color: 'var(--grey-light)', margin: 0 }}>กำหนดรหัส, ชื่อ, หมวดหมู่ — ใช้เป็น dropdown เลือกในตาราง</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          <table className="data">
            <thead><tr>
              <th style={{ width: 28 }}></th>
              <th style={{ width: 120 }}>รหัส (SKU)</th>
              <th>ชื่อสินค้า</th>
              <th style={{ width: 150 }}>หมวดหมู่</th>
              <th style={{ width: 36 }}></th>
            </tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      if (i === 0) return;
                      setList(l => { const n=[...l]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; });
                    }} disabled={i === 0} style={{ padding: '1px 5px', fontSize: 12 }}>↑</button>
                  </td>
                  <td><input value={p.sku} onChange={e => set(i, 'sku', e.target.value)}
                    placeholder="TG01" style={{ width: 105, fontFamily: 'monospace', fontSize: 12 }} /></td>
                  <td><input value={p.name} onChange={e => set(i, 'name', e.target.value)}
                    placeholder="ชื่อสินค้า…" style={{ width: '100%' }} /></td>
                  <td><input value={p.category||''} onChange={e => set(i, 'category', e.target.value)}
                    placeholder="หมวดหมู่…" list="pm-cats" style={{ width: 138 }} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setList(l => l.filter((_, j) => j !== i))}
                    style={{ padding: '2px 6px' }}>✕</button></td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--grey-light)', padding: 24, fontSize: 13 }}>
                  ยังไม่มีรายการ — กด &quot;+ เพิ่มสินค้า&quot;
                </td></tr>
              )}
            </tbody>
          </table>
          <datalist id="pm-cats">{existingCats.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => setList(l => [...l, { sku: '', name: '', category: '' }])}>+ เพิ่มสินค้า</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : '💾 บันทึก'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   หน้าหลัก COGS
   ══════════════════════════════════════════ */
export default function Accounting() {
  const [rows,          setRows]          = useState(null);
  const [meta,          setMeta]          = useState({});
  const [productMaster, setProductMaster] = useState([]);
  const [newItems,      setNewItems]      = useState(new Set());
  const [msg,           setMsg]           = useState(null);
  const [busy,          setBusy]          = useState(false);
  const [q,             setQ]             = useState('');
  const [filter,        setFilter]        = useState('all');
  const [catFilter,     setCatFilter]     = useState('');
  const [expandedRow,   setExpandedRow]   = useState(null);
  const [showMaster,    setShowMaster]    = useState(false);
  const [imgPreview,    setImgPreview]    = useState(null);
  const [uploadFor,     setUploadFor]     = useState(null);
  const fileRef = useRef(null);

  async function load() {
    try {
      const [data, metaData, master] = await Promise.all([
        apiGet('/finance/product-costs'),
        apiGet('/finance/product-costs-meta').catch(() => ({})),
        apiGet('/finance/product-master').catch(() => [])
      ]);
      setRows(norm(data)); setMeta(metaData || {}); setProductMaster(master || []);
    } catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  function norm(data) {
    return (data || []).map(r => ({
      platform: r.platform || '', productName: String(r.productName || r.name || '').trim(),
      costType: r.costType || '%', costValue: Number(r.costValue || 0)
    }));
  }

  const masterMap  = Object.fromEntries(productMaster.map(p => [p.sku, p]));
  const masterSkus = new Set(productMaster.map(p => p.sku));
  const allCats    = [...new Set(productMaster.map(p => p.category||'').filter(Boolean))].sort();

  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-costs/sync');
      const existing = new Set((rows || []).map(r => r.productName));
      const fresh = new Set();
      res.rows.forEach(r => { const n = String(r.productName||r.name||'').trim(); if (!existing.has(n)) fresh.add(n); });
      setNewItems(fresh); setRows(norm(res.rows));
      setMsg({ type: 'success', text: `+${res.added} รายการ${fresh.size ? ` — 🆕 ใหม่ ${fresh.size}` : ''}` });
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
      setNewItems(new Set()); setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function saveProductMaster(items) { await apiPost('/finance/product-master', items); setProductMaster(items); }

  const update     = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const updateMeta = (name, k, v) => setMeta(m => ({ ...m, [name]: { ...(m[name]||{}), [k]: v } }));

  function selectSku(rowIdx, sku) {
    const old = rows[rowIdx].productName;
    update(rowIdx, 'productName', sku);
    if (sku && masterMap[sku]) {
      setMeta(m => {
        const updated = { ...m, [sku]: { ...(m[old]||{}), displayName: masterMap[sku].name } };
        if (old && old !== sku) delete updated[old];
        return updated;
      });
    }
  }

  function updateComponents(productName, newComps) {
    updateMeta(productName, 'components', newComps);
    const total = newComps.reduce((s, c) => s + Number(c.cost || 0), 0);
    if (total > 0) setRows(rs => rs.map(r => r.productName === productName ? { ...r, costType: 'THB', costValue: total } : r));
  }

  function pickImage(name) { setUploadFor(name); fileRef.current?.click(); }
  async function handleFile(e) {
    const f = e.target.files?.[0]; if (!f || !uploadFor) return;
    const reader = new FileReader();
    reader.onload = async ev => { updateMeta(uploadFor, 'imageUrl', await compressImage(ev.target.result, 200)); setUploadFor(null); };
    reader.readAsDataURL(f); e.target.value = '';
  }

  const missingCount = (rows || []).filter(r => r.costValue === 0).length;
  const newCount     = newItems.size;
  const linkedCount  = (rows || []).filter(r => masterSkus.has(r.productName)).length;

  const visible = (rows || [])
    .map((r, i) => ({ ...r, _i: i, _meta: meta[r.productName] || {} }))
    .filter(r => {
      const master = masterMap[r.productName];
      if (q) { const s = q.toLowerCase(); if (!r.productName.toLowerCase().includes(s) && !(r._meta.displayName||master?.name||'').toLowerCase().includes(s)) return false; }
      if (catFilter && (masterMap[r.productName]?.category || '') !== catFilter) return false;
      if (filter === 'missing'   && r.costValue > 0) return false;
      if (filter === 'unlinked'  && masterSkus.has(r.productName)) return false;
      if (filter === 'new'       && !newItems.has(r.productName)) return false;
      return true;
    });

  /* ═══════════════════════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div>
      {showMaster && <ProductMasterModal items={productMaster} onClose={() => setShowMaster(false)} onSave={saveProductMaster} />}
      {imgPreview && <ImagePreviewModal src={imgPreview.src} name={imgPreview.name} onClose={() => setImgPreview(null)} onChange={() => pickImage(imgPreview.name)} />}

      <div className="page-title">ต้นทุนสินค้า (COGS)</div>
      <div className="page-sub">กำหนดต้นทุนและจัดการรายการสินค้า</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      {/* ─── Stat cards ─── */}
      {rows && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'สินค้าทั้งหมด',  val: rows.length,                color: 'var(--acc)' },
            { label: 'เชื่อมรายการแล้ว', val: `${linkedCount} / ${rows.length}`,  color: linkedCount === rows.length ? '#10b981' : '#f59e0b' },
            { label: 'ยังไม่กรอกต้นทุน', val: missingCount,               color: missingCount > 0 ? '#ef4444' : '#10b981' },
            { label: 'สินค้าในระบบ',    val: productMaster.length,        color: 'var(--acc)' }
          ].map(s => (
            <div key={s.label} style={{
              background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 18px', minWidth: 130
            }}>
              <div style={{ fontSize: 11, color: 'var(--grey-light)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-ghost" onClick={() => setShowMaster(true)} style={{ padding: '8px 16px' }}>
              📦 จัดการรายการสินค้า ({productMaster.length})
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={sync}>🔄 ดึงจากยอดขาย</button>
            <button className="btn btn-green" disabled={busy} onClick={save}>
              {busy ? 'กำลังบันทึก...' : '💾 บันทึกทั้งหมด'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Filter bar ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหาสินค้า…"
          style={{ width: 200, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
        {allCats.length > 0 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
            <option value="">ทุกหมวด</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'all',      label: `ทั้งหมด (${(rows||[]).length})` },
            { key: 'unlinked', label: `⚠ ยังไม่เชื่อม (${(rows||[]).length - linkedCount})`, warn: linkedCount < (rows||[]).length },
            { key: 'missing',  label: `! ยังไม่กรอก (${missingCount})`, warn: missingCount > 0 },
            { key: 'new',      label: `🆕 NEW (${newCount})`,            warn: newCount > 0 }
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)} style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
              background: filter === t.key ? 'var(--mint)' : t.warn ? 'rgba(245,158,11,.15)' : 'var(--border)',
              color: filter === t.key ? 'var(--acc)' : t.warn ? '#92400e' : 'var(--grey-light)',
              fontWeight: filter === t.key ? 700 : 400
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={handleFile} />

      {!rows ? <Loading /> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 48 }} />   {/* รูป */}
              <col style={{ width: 110 }} />  {/* สถานะ */}
              <col />                          {/* ชื่อจากยอดขาย */}
              <col style={{ width: 220 }} />  {/* เชื่อมกับ */}
              <col style={{ width: 100 }} />  {/* แพลตฟอร์ม */}
              <col style={{ width: 120 }} />  {/* ต้นทุน */}
              <col style={{ width: 60 }} />   {/* actions */}
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--mint-pale, rgba(178,216,216,.15))' }}>
                <th></th>
                <th>สถานะ</th>
                <th>ชื่อสินค้า (จากยอดขาย)</th>
                <th>เชื่อมกับสินค้าในระบบ</th>
                <th>แพลตฟอร์ม</th>
                <th className="num">ต้นทุน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const isNew      = newItems.has(r.productName);
                const master     = masterMap[r.productName];
                const linked     = masterSkus.has(r.productName);
                const hasCost    = r.costValue > 0;
                const isExpanded = expandedRow === r._i;
                const comps      = r._meta.components || [];
                const hasComps   = comps.length > 0;
                const compTotal  = comps.reduce((s, c) => s + Number(c.cost || 0), 0);

                return (
                  <React.Fragment key={r._i}>
                    <tr style={{
                      background: !linked ? 'rgba(239,68,68,.04)' : !hasCost ? 'rgba(245,158,11,.05)' : undefined,
                      borderLeft: `3px solid ${!linked ? '#ef4444' : !hasCost ? '#f59e0b' : '#10b981'}`
                    }}>

                      {/* รูป */}
                      <td style={{ padding: '6px 8px' }}>
                        <div onClick={() => r._meta.imageUrl ? setImgPreview({ src: r._meta.imageUrl, name: r.productName }) : pickImage(r.productName)}
                          title={r._meta.imageUrl ? 'ดู preview' : 'อัปโหลดรูป'}
                          style={{
                            width: 36, height: 36, borderRadius: 6, cursor: 'pointer', overflow: 'hidden',
                            border: `2px solid ${r._meta.imageUrl ? 'var(--mint)' : 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: r._meta.imageUrl ? 'transparent' : 'var(--border)'
                          }}>
                          {r._meta.imageUrl
                            ? <img src={r._meta.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 14, opacity: .5 }}>📷</span>}
                        </div>
                      </td>

                      {/* สถานะ */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <StatusBadge linked={linked} hasCost={hasCost} />
                          {isNew && <span style={badge('#6366f1','#fff')}>🆕 NEW</span>}
                        </div>
                      </td>

                      {/* ชื่อจากยอดขาย */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {r.productName}
                        </div>
                        {master?.category && (
                          <span style={{ fontSize: 11, color: '#7DB9B9', marginTop: 2, display: 'inline-block' }}>
                            {master.category}
                          </span>
                        )}
                      </td>

                      {/* เชื่อมกับ */}
                      <td style={{ padding: '6px 8px' }}>
                        {productMaster.length > 0 ? (
                          <div>
                            <select value={linked ? r.productName : ''} onChange={e => selectSku(r._i, e.target.value)}
                              style={{
                                width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 6,
                                border: `1px solid ${linked ? 'var(--mint)' : '#fbbf24'}`,
                                background: linked ? 'rgba(178,216,216,.12)' : 'rgba(251,191,36,.08)'
                              }}>
                              <option value="">— เลือกสินค้า —</option>
                              {productMaster.map(p => (
                                <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>
                              ))}
                            </select>
                            {linked && (
                              <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 2, paddingLeft: 2 }}>
                                {master?.name}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setShowMaster(true)}
                            style={{ fontSize: 12, color: '#f59e0b' }}>
                            + เพิ่มสินค้าในระบบก่อน
                          </button>
                        )}
                      </td>

                      {/* แพลตฟอร์ม */}
                      <td>
                        <input value={r.platform} onChange={e => update(r._i, 'platform', e.target.value)}
                          style={{ width: 90, fontSize: 12 }} />
                      </td>

                      {/* ต้นทุน */}
                      <td className="num" style={{ padding: '6px 10px' }}>
                        {hasComps ? (
                          <div>
                            <div style={{ fontWeight: 700, color: compTotal > 0 ? 'var(--acc)' : '#f59e0b', fontSize: 14 }}>
                              ฿{compTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--grey-light)' }}>จาก {comps.length} รายการ</div>
                          </div>
                        ) : (
                          <div>
                            <input type="number" step="0.01" value={r.costValue}
                              onChange={e => update(r._i, 'costValue', e.target.value)}
                              style={{ width: 76, textAlign: 'right', fontSize: 13, color: !hasCost ? '#f59e0b' : undefined }} />
                            <div style={{ fontSize: 10, color: 'var(--grey-light)', textAlign: 'right', marginTop: 1 }}>
                              {r.costType === '%' ? '% ยอดขาย' : 'บาท/ออเดอร์'}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* actions */}
                      <td style={{ padding: '6px 6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm"
                            title={isExpanded ? 'ซ่อน' : 'ส่วนประกอบ / รายละเอียด'}
                            onClick={() => setExpandedRow(isExpanded ? null : r._i)}
                            style={{ fontSize: 12 }}>
                            {isExpanded ? '▲' : '▼'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                            onClick={() => setRows(rs => rs.filter((_, j) => j !== r._i))}>ลบ</button>
                        </div>
                      </td>
                    </tr>

                    {/* ── ส่วนขยาย ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ background: 'rgba(0,0,0,.03)', padding: '14px 20px 18px' }}>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

                            {/* ── ประเภทต้นทุน ── */}
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 4 }}>ประเภทต้นทุน</div>
                              <select value={r.costType} onChange={e => update(r._i, 'costType', e.target.value)}
                                style={{ fontSize: 13 }}>
                                <option value="%">% ของยอดขาย</option>
                                <option value="THB">บาท / ออเดอร์</option>
                              </select>
                            </div>

                            {/* ── หมายเหตุ ── */}
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 4 }}>หมายเหตุ</div>
                              <input value={r._meta.note||''} onChange={e => updateMeta(r.productName, 'note', e.target.value)}
                                placeholder="เช่น ตะกร้า 1 แถม 1…" style={{ width: '100%' }} />
                            </div>
                          </div>

                          {/* ── ส่วนประกอบ ── */}
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                              📦 ส่วนประกอบตะกร้า
                              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--grey-light)', marginLeft: 6 }}>
                                (ต้นทุนรวมจะคำนวณอัตโนมัติ)
                              </span>
                            </div>

                            {comps.length > 0 && (
                              <table className="data" style={{ maxWidth: 500, marginBottom: 8 }}>
                                <thead><tr>
                                  <th>สินค้าย่อย</th>
                                  <th className="num" style={{ width: 120 }}>ต้นทุน/ชิ้น (฿)</th>
                                  <th style={{ width: 36 }}></th>
                                </tr></thead>
                                <tbody>
                                  {comps.map((c, ci) => (
                                    <tr key={ci}>
                                      <td>
                                        {productMaster.length > 0 ? (
                                          <select value={c.sku||''} style={{ minWidth: 200, fontSize: 12 }}
                                            onChange={e => {
                                              const p = masterMap[e.target.value];
                                              const next = comps.map((x, xi) => xi === ci ? { ...x, sku: e.target.value, name: p?.name||x.name } : x);
                                              updateComponents(r.productName, next);
                                            }}>
                                            <option value="">— เลือก —</option>
                                            {productMaster.map(p => <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>)}
                                          </select>
                                        ) : (
                                          <input value={c.name||''} style={{ minWidth: 200 }}
                                            onChange={e => { const next = comps.map((x, xi) => xi === ci ? { ...x, name: e.target.value } : x); updateComponents(r.productName, next); }} />
                                        )}
                                      </td>
                                      <td>
                                        <input type="number" step="0.01" value={c.cost||0} style={{ width: 100, textAlign: 'right' }}
                                          onChange={e => {
                                            const next = comps.map((x, xi) => xi === ci ? { ...x, cost: Number(e.target.value) } : x);
                                            updateComponents(r.productName, next);
                                          }} />
                                      </td>
                                      <td>
                                        <button className="btn btn-ghost btn-sm"
                                          onClick={() => updateComponents(r.productName, comps.filter((_, xi) => xi !== ci))}>✕</button>
                                      </td>
                                    </tr>
                                  ))}
                                  {comps.length > 0 && (
                                    <tr style={{ background: 'rgba(178,216,216,.15)' }}>
                                      <td style={{ fontWeight: 600 }}>รวมต้นทุน</td>
                                      <td className="num" style={{ fontWeight: 700, color: 'var(--acc)' }}>
                                        ฿{compTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td></td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}

                            <button className="btn btn-ghost btn-sm"
                              onClick={() => updateComponents(r.productName, [...comps, { sku: '', name: '', cost: 0 }])}>
                              + เพิ่มสินค้าย่อย
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {visible.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--grey-light)', padding: 32 }}>
                  ไม่พบสินค้าตามเงื่อนไข
                </td></tr>
              )}
            </tbody>
          </table>

          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setRows(rs => [...rs, { platform: '', productName: '', costType: '%', costValue: 0 }])}>
              + เพิ่มแถว
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
