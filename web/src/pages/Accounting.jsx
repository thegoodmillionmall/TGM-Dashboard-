import React, { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

// ---------- Helpers ----------
async function compressImage(file, maxW = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- Sub-components ----------
function StatusBadge({ value }) {
  const ok = value > 0;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11,
      background: ok ? '#d1fae5' : '#fee2e2', color: ok ? '#065f46' : '#991b1b'
    }}>
      {ok ? `${value.toFixed(1)}%` : 'ยังไม่ตั้ง'}
    </span>
  );
}

function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <img src={src} alt="preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
    </div>
  );
}

function ProductMasterModal({ open, onClose, onSeedFromJST }) {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    Promise.all([apiGet('/finance/product-master'), apiGet('/finance/categories')])
      .then(([pm, c]) => {
        setItems(pm.map(p => ({ sku: p.sku || '', name: p.name || '', category: p.category || '' })));
        setCats(c || []);
      })
      .catch(err => setMsg({ type: 'error', text: err.message }));
  }, [open]);

  if (!open) return null;

  const updateItem = (i, key, val) => setItems(rs => rs.map((r, j) => j === i ? { ...r, [key]: val } : r));
  const addRow = () => setItems(rs => [...rs, { sku: '', name: '', category: '' }]);
  const removeRow = i => setItems(rs => rs.filter((_, j) => j !== i));

  async function saveMaster() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-master', items);
      setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function saveCats() {
    setBusy(true); setMsg(null);
    try {
      const all = [...cats, ...(newCat.trim() ? [newCat.trim()] : [])];
      const res = await apiPost('/finance/categories', all);
      setCats(all); setNewCat('');
      setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function seedFromJST() {
    if (!window.confirm('โหลดข้อมูลจาก JST จะเขียนทับรายการปัจจุบัน ยืนยัน?')) return;
    setBusy(true); setMsg(null);
    try {
      const res = await onSeedFromJST();
      setMsg({ type: 'success', text: res.message || 'โหลดสำเร็จ' });
      const pm = await apiGet('/finance/product-master');
      setItems(pm.map(p => ({ sku: p.sku || '', name: p.name || '', category: p.category || '' })));
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 8000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40 }}>
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 28, width: '90vw', maxWidth: 860, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📦 จัดการ Product Master</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ ปิด</button>
        </div>

        {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'} style={{ marginBottom: 12 }}>{msg.text}</Alert>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-green btn-sm" disabled={busy} onClick={saveMaster}>💾 บันทึกรายการสินค้า</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={addRow}>+ เพิ่มแถว</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={seedFromJST}
            style={{ background: '#fffbeb', border: '1px solid #fbbf24', color: '#92400e' }}>
            🔄 โหลดจาก JST อัตโนมัติ
          </button>
        </div>

        {!items ? <Loading /> : (
          <table className="data" style={{ marginBottom: 24 }}>
            <thead>
              <tr><th style={{ width: 120 }}>SKU</th><th>ชื่อสินค้า (ชื่อในระบบ)</th><th style={{ width: 140 }}>หมวดหมู่</th><th style={{ width: 60 }}></th></tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={i}>
                  <td><input value={r.sku} onChange={e => updateItem(i, 'sku', e.target.value)} style={{ width: '100%' }} /></td>
                  <td><input value={r.name} onChange={e => updateItem(i, 'name', e.target.value)} style={{ width: '100%' }} /></td>
                  <td>
                    <select value={r.category} onChange={e => updateItem(i, 'category', e.target.value)} style={{ width: '100%' }}>
                      <option value="">-- เลือก --</option>
                      {cats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => removeRow(i)}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ fontSize: 14, marginBottom: 8 }}>หมวดหมู่สินค้า</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {cats.map((c, i) => (
            <span key={i} style={{ background: 'var(--mint-bg)', padding: '3px 10px', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              {c}
              <button onClick={() => setCats(cs => cs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="เพิ่มหมวดหมู่ใหม่" style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={saveCats}>บันทึกหมวดหมู่</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function Accounting() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [showMaster, setShowMaster] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  const importRef = useRef();

  async function load() {
    setMsg(null);
    try {
      const [costRows, metaData] = await Promise.all([
        apiGet('/finance/product-costs'),
        apiGet('/finance/product-costs-meta').catch(() => ({}))
      ]);
      setRows(costRows.map(r => ({
        platform: r.platform || '',
        productName: r.productName || r.name || '',
        costType: r.costType || '%',
        costValue: Number(r.costValue || 0)
      })));
      setMeta(metaData || {});
    } catch (err) { setMsg({ type: 'error', text: err.message }); setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/product-costs/sync');
      setRows(res.rows.map(r => ({
        platform: r.platform || '', productName: r.productName || r.name || '',
        costType: r.costType || '%', costValue: Number(r.costValue || 0)
      })));
      setMsg({ type: 'success', text: 'ดึงสินค้าใหม่เข้าตาราง ' + res.added + ' รายการ (อย่าลืมกดบันทึก)' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      // บันทึก product_costs_master (เดิม)
      const res = await apiPost('/finance/product-costs', { rows });
      // บันทึก product_costs_meta (ใหม่ — map จาก productName → {costType, costValue})
      const metaNew = {};
      rows.forEach(r => {
        if (r.productName) metaNew[r.productName] = { platform: r.platform, costType: r.costType, costValue: Number(r.costValue) };
      });
      await apiPost('/finance/product-costs-meta', metaNew).catch(() => {});
      setMsg({ type: 'success', text: res.message });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  function exportExcel() {
    const data = (rows || []).map(r => ({
      'แพลตฟอร์ม': r.platform,
      'ชื่อสินค้า': r.productName,
      'ประเภทต้นทุน': r.costType,
      'มูลค่า': r.costValue
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'COGS');
    XLSX.writeFile(wb, 'TGM_COGS_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function importExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const imported = data.map(r => ({
          platform: String(r['แพลตฟอร์ม'] || r['platform'] || ''),
          productName: String(r['ชื่อสินค้า'] || r['productName'] || r['name'] || ''),
          costType: String(r['ประเภทต้นทุน'] || r['costType'] || '%'),
          costValue: Number(r['มูลค่า'] || r['costValue'] || 0)
        })).filter(r => r.productName);
        setRows(imported);
        setMsg({ type: 'success', text: `นำเข้า ${imported.length} รายการสำเร็จ (กดบันทึกเพื่อยืนยัน)` });
      } catch (err) { setMsg({ type: 'error', text: 'อ่านไฟล์ไม่ได้: ' + err.message }); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function seedFromJST() {
    return await apiPost('/finance/seed-product-master', {});
  }

  const update = (i, key, val) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  const visible = (rows || []).map((r, i) => ({ ...r, _i: i }))
    .filter(r => !q || r.productName.toLowerCase().includes(q.toLowerCase()) || r.platform.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-title">ต้นทุนสินค้า (COGS)</div>
      <div className="page-sub">กำหนดต้นทุนเป็น % ของยอดขาย หรือบาทต่อออเดอร์ — ระบบนำไปคำนวณกำไรอัตโนมัติ</div>

      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label style={{ marginBottom: 0 }}>
          ค้นหา&nbsp;
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อสินค้า / แพลตฟอร์ม" style={{ width: 200 }} />
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setShowMaster(true)}>📦 จัดการสินค้า</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={exportExcel}>⬇ Export Excel</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => importRef.current?.click()}>⬆ Import Excel</button>
        <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={sync}>🔄 ดึงสินค้าที่มียอดขาย</button>
        <button className="btn btn-green" disabled={busy} onClick={save}>
          {busy ? 'กำลังบันทึก...' : '💾 บันทึกต้นทุน'}
        </button>
      </div>

      {!rows ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 110 }}>แพลตฟอร์ม</th>
                <th>ชื่อสินค้า (ตรงกับชื่อใน Platform)</th>
                <th style={{ width: 160 }}>ประเภทต้นทุน</th>
                <th className="num" style={{ width: 110 }}>มูลค่า</th>
                <th style={{ width: 80 }}>สถานะ</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r._i}>
                  <td>
                    <select value={r.platform} onChange={e => update(r._i, 'platform', e.target.value)} style={{ width: '100%' }}>
                      <option value="">ทุกช่องทาง</option>
                      <option value="TikTok">TikTok</option>
                      <option value="Shopee">Shopee</option>
                      <option value="ModernTrade">Modern Trade</option>
                    </select>
                  </td>
                  <td>
                    <input value={r.productName} onChange={e => update(r._i, 'productName', e.target.value)}
                      style={{ minWidth: 240, width: '100%' }} />
                  </td>
                  <td>
                    <select value={r.costType} onChange={e => update(r._i, 'costType', e.target.value)}>
                      <option value="%">% ของยอดขาย</option>
                      <option value="THB">บาท / ออเดอร์</option>
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.01" value={r.costValue}
                      onChange={e => update(r._i, 'costValue', e.target.value)}
                      style={{ width: 90, textAlign: 'right' }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <StatusBadge value={r.costType === '%' ? Number(r.costValue) : (r.costValue > 0 ? 1 : 0)} />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setRows(rs => rs.filter((_, j) => j !== r._i))}>ลบ</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: 20 }}>
                  {q ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีข้อมูลต้นทุน — กด "ดึงสินค้าที่มียอดขาย" เพื่อเริ่มต้น'}
                </td></tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setRows(rs => [...(rs || []), { platform: '', productName: '', costType: '%', costValue: 0 }])}>
              + เพิ่มสินค้า
            </button>
            {rows.length > 0 && (
              <span style={{ color: '#888', fontSize: 12, alignSelf: 'center' }}>
                {visible.length} / {rows.length} รายการ
              </span>
            )}
          </div>
        </div>
      )}

      <ProductMasterModal
        open={showMaster}
        onClose={() => setShowMaster(false)}
        onSeedFromJST={seedFromJST}
      />
      <ImagePreviewModal src={previewImg} onClose={() => setPreviewImg(null)} />
    </div>
  );
}
