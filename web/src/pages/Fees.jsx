import React, { useEffect, useState, useMemo, useRef } from 'react';
import { apiGet, apiPost } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

// ---------- แผนผังความเชื่อมโยง (ลากจัดวางได้ + ดูตัวอย่างข้อมูล) ----------
const APPLY_COLORS = {
  REVENUE: '#7DB9B9', DEDUCTION: '#e74c3c', ADS: '#e67e22', MANUAL: '#8e6bb8', OTHER: '#8a9ab0'
};
const APPLY_LABELS = {
  REVENUE: 'ยอดขาย (Revenue)', DEDUCTION: 'หักแพลตฟอร์ม', ADS: 'ค่าโฆษณา', MANUAL: 'Manual', OTHER: 'อื่นๆ'
};
const NODE_W = 210;

function MappingGraph({ maps }) {
  const active = maps.filter(m => (m.status || 'ACTIVE') === 'ACTIVE' && m.sourceSheet);
  const [focus, setFocus] = useState(null);
  const [samples, setSamples] = useState({});
  const [preview, setPreview] = useState(null); // ชื่อ sheet ที่เปิดดูตัวอย่าง
  const [pos, setPos] = useState({});
  const dragRef = useRef(null);
  const boxRef = useRef(null);

  const { sources, metrics, targets, edges } = useMemo(() => {
    const sources = Array.from(new Set(active.map(m => m.sourceSheet)));
    const metrics = active.map(m => ({ key: m.platform + '·' + m.metricKey, m }));
    const targets = Array.from(new Set(active.map(m => (APPLY_COLORS[m.applyTo] ? m.applyTo : 'OTHER'))));
    const edges = active.map(m => ({
      src: 'S:' + m.sourceSheet,
      mid: 'M:' + m.platform + '·' + m.metricKey,
      tgt: 'T:' + (APPLY_COLORS[m.applyTo] ? m.applyTo : 'OTHER'),
      color: APPLY_COLORS[m.applyTo] || APPLY_COLORS.OTHER
    }));
    return { sources, metrics, targets, edges };
  }, [maps]);

  // ตำแหน่งเริ่มต้น 3 คอลัมน์
  useEffect(() => {
    setPos(p => {
      const next = { ...p };
      sources.forEach((s, i) => { if (!next['S:' + s]) next['S:' + s] = { x: 10, y: 16 + i * 96 }; });
      metrics.forEach((mm, i) => { if (!next['M:' + mm.key]) next['M:' + mm.key] = { x: 360, y: 16 + i * 62 }; });
      targets.forEach((t, i) => { if (!next['T:' + t]) next['T:' + t] = { x: 710, y: 16 + i * 90 }; });
      return next;
    });
  }, [maps]);

  // โหลดตัวอย่างข้อมูล
  useEffect(() => {
    if (!sources.length) return;
    apiGet('/system/sheet-samples', { sheets: sources.join(',') }).then(setSamples).catch(() => {});
  }, [maps]);

  // ---------- ลาก node ----------
  function onMouseDown(e, id) {
    const p = pos[id] || { x: 0, y: 0 };
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false };
    e.preventDefault();
  }
  function onMouseMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setPos(p => ({ ...p, [d.id]: { x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy) } }));
  }
  function onMouseUp() {
    const d = dragRef.current;
    if (d && !d.moved) setFocus(f => (f === d.id ? null : d.id)); // คลิกเฉยๆ = ไฮไลต์
    dragRef.current = null;
  }

  const isDimEdge = e => focus && ![e.src, e.mid, e.tgt].includes(focus);
  const isDimNode = id => focus && focus !== id && !edges.some(e => !isDimEdge(e) && [e.src, e.mid, e.tgt].includes(id));

  const anchorOut = id => { const p = pos[id] || { x: 0, y: 0 }; return [p.x + NODE_W, p.y + 24]; };
  const anchorIn = id => { const p = pos[id] || { x: 0, y: 0 }; return [p.x, p.y + 24]; };
  const path = (a, b) => `M ${a[0]} ${a[1]} C ${a[0] + 60} ${a[1]}, ${b[0] - 60} ${b[1]}, ${b[0]} ${b[1]}`;

  const height = Math.max(
    ...Object.values(pos).map(p => p.y + 130), 420
  );
  const width = Math.max(...Object.values(pos).map(p => p.x + NODE_W + 40), 960);

  const nodeStyle = (id, color) => ({
    position: 'absolute', left: (pos[id] || {}).x, top: (pos[id] || {}).y, width: NODE_W,
    background: '#fff', border: `2px solid ${color}`, borderRadius: 10, padding: '6px 10px',
    cursor: 'grab', opacity: isDimNode(id) ? 0.22 : 1, transition: 'opacity .2s',
    fontSize: 12, boxShadow: 'var(--shadow-sm)', zIndex: 2, userSelect: 'none'
  });

  return (
    <div className="card">
      <h3>แผนผังความเชื่อมโยงข้อมูล — ลากกล่องจัดวางได้ · คลิกเพื่อไฮไลต์ · 🔍 ดูตัวอย่างข้อมูล</h3>
      <div style={{ display: 'flex', gap: 20, fontSize: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {Object.entries(APPLY_LABELS).map(([k, l]) => (
          <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: APPLY_COLORS[k], marginRight: 4 }} />{l}</span>
        ))}
      </div>
      <div className="table-scroll">
        <div ref={boxRef} style={{ position: 'relative', height, minWidth: width }}
          onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            {edges.map((e, i) => (
              <g key={i} opacity={isDimEdge(e) ? 0.1 : 0.85}>
                <path d={path(anchorOut(e.src), anchorIn(e.mid))} stroke={e.color} strokeWidth="2" fill="none" />
                <path d={path(anchorOut(e.mid), anchorIn(e.tgt))} stroke={e.color} strokeWidth="2" fill="none" />
                <circle cx={anchorIn(e.tgt)[0]} cy={anchorIn(e.tgt)[1]} r="3.5" fill={e.color} />
              </g>
            ))}
          </svg>

          {sources.map(s => {
            const id = 'S:' + s;
            const sm = samples[s];
            return (
              <div key={id} style={nodeStyle(id, '#2C3E50')} onMouseDown={e => onMouseDown(e, id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: 'var(--acc)' }}>{s}</b>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '1px 7px' }}
                    onMouseDown={e => e.stopPropagation()} onClick={() => setPreview(s)}>🔍</button>
                </div>
                <div style={{ color: 'var(--grey-light)', fontSize: 10.5 }}>raw_upload_rows{sm?.totalCols ? ` · ${sm.totalCols} คอลัมน์` : ''}</div>
                {sm?.columns?.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {sm.columns.slice(0, 5).map(c => (
                      <span key={c} style={{ background: 'var(--mint-light)', color: 'var(--acc2)', borderRadius: 5, padding: '0 5px', fontSize: 10 }}>{String(c).slice(0, 14)}</span>
                    ))}
                    {sm.totalCols > 5 && <span style={{ fontSize: 10, color: 'var(--grey-light)' }}>+{sm.totalCols - 5}</span>}
                  </div>
                )}
              </div>
            );
          })}

          {metrics.map(({ key, m }) => {
            const id = 'M:' + key;
            const color = APPLY_COLORS[m.applyTo] || APPLY_COLORS.OTHER;
            return (
              <div key={id} style={nodeStyle(id, color)} onMouseDown={e => onMouseDown(e, id)}>
                <b style={{ color: 'var(--acc)' }}>{m.metricKey}</b>
                <div style={{ color: 'var(--grey-light)', fontSize: 10.5 }}>{m.platform}{m.aggregation ? ' · ' + m.aggregation : ''}</div>
              </div>
            );
          })}

          {targets.map(t => {
            const id = 'T:' + t;
            return (
              <div key={id} style={nodeStyle(id, APPLY_COLORS[t])} onMouseDown={e => onMouseDown(e, id)}>
                <b style={{ color: 'var(--acc)' }}>{APPLY_LABELS[t] || t}</b>
                <div style={{ color: 'var(--grey-light)', fontSize: 10.5 }}>Dashboard</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- ป็อปอัพตัวอย่างข้อมูล ---------- */}
      {preview && (
        <div className="modal-back" onClick={() => setPreview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 760, maxWidth: '94vw' }}>
            <h3>ตัวอย่างข้อมูล: {preview}</h3>
            {!samples[preview]?.columns?.length ? (
              <div className="loading">ไม่มีข้อมูลตัวอย่าง (ตารางว่างหรือยังไม่ได้อัปโหลด)</div>
            ) : (
              <div className="table-scroll">
                <table className="data" style={{ fontSize: 11.5 }}>
                  <thead><tr>{samples[preview].columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {samples[preview].rows.map((r, i) => (
                      <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: 'var(--grey-light)', marginTop: 6 }}>
                  แสดง {samples[preview].columns.length} จาก {samples[preview].totalCols} คอลัมน์ · 3 แถวล่าสุด
                </div>
              </div>
            )}
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setPreview(null)}>ปิด</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Fees() {
  const [fees, setFees] = useState(null);
  const [maps, setMaps] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [f, m] = await Promise.all([apiGet('/finance/fees'), apiGet('/finance/mappings')]);
      setFees(f); setMaps(m);
    } catch (err) { setMsg({ type: 'error', text: err.message }); setFees([]); setMaps([]); }
  }
  useEffect(() => { load(); }, []);

  async function saveFees() {
    setBusy(true); setMsg(null);
    try { setMsg({ type: 'success', text: (await apiPost('/finance/fees', { rows: fees })).message }); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }
  async function saveMaps() {
    setBusy(true); setMsg(null);
    try { setMsg({ type: 'success', text: (await apiPost('/finance/mappings', { rows: maps })).message }); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  const uf = (i, k, v) => setFees(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const um = (i, k, v) => setMaps(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div>
      <div className="page-title">ตั้งค่า Mapping / Fee</div>
      <div className="page-sub">ค่าธรรมเนียมมาตรฐานและการ map แหล่งข้อมูล</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      {maps && maps.length > 0 && <MappingGraph maps={maps} />}

      <div className="card table-scroll">
        <h3>Fee Settings</h3>
        {!fees ? <Loading /> : (
          <>
            <table className="data">
              <thead><tr><th>ชื่อ</th><th>ประเภท</th><th className="num">ค่า</th><th>Apply To</th><th>สถานะ</th><th></th></tr></thead>
              <tbody>
                {fees.map((r, i) => (
                  <tr key={i}>
                    <td><input value={r.name || ''} onChange={e => uf(i, 'name', e.target.value)} /></td>
                    <td>
                      <select value={r.type || '%'} onChange={e => uf(i, 'type', e.target.value)}>
                        <option value="%">%</option><option value="THB">THB</option>
                      </select>
                    </td>
                    <td><input type="number" step="0.01" value={r.value || 0} onChange={e => uf(i, 'value', e.target.value)} style={{ width: 90, textAlign: 'right' }} /></td>
                    <td><input value={r.applyTo || ''} onChange={e => uf(i, 'applyTo', e.target.value)} style={{ width: 120 }} /></td>
                    <td>
                      <select value={r.status || 'ACTIVE'} onChange={e => uf(i, 'status', e.target.value)}>
                        <option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option>
                      </select>
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setFees(rs => rs.filter((_, j) => j !== i))}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setFees(rs => [...rs, { name: '', type: '%', value: 0, applyTo: '', status: 'ACTIVE' }])}>+ เพิ่ม</button>
              <button className="btn btn-green" disabled={busy} onClick={saveFees}>บันทึก Fee</button>
            </div>
          </>
        )}
      </div>

      <div className="card table-scroll">
        <h3>Data Source Mappings</h3>
        {!maps ? <Loading /> : (
          <>
            <table className="data" style={{ fontSize: 12 }}>
              <thead><tr><th>Platform</th><th>Metric Key</th><th>Source Sheet</th><th>Field Aliases</th><th>Aggregation</th><th>Apply To</th><th>สถานะ</th><th></th></tr></thead>
              <tbody>
                {maps.map((r, i) => (
                  <tr key={i}>
                    <td><input value={r.platform || ''} onChange={e => um(i, 'platform', e.target.value)} style={{ width: 100 }} /></td>
                    <td><input value={r.metricKey || ''} onChange={e => um(i, 'metricKey', e.target.value)} style={{ width: 130 }} /></td>
                    <td><input value={r.sourceSheet || ''} onChange={e => um(i, 'sourceSheet', e.target.value)} style={{ width: 130 }} /></td>
                    <td><input value={r.fieldAliases || ''} onChange={e => um(i, 'fieldAliases', e.target.value)} style={{ minWidth: 200 }} /></td>
                    <td>
                      <select value={r.aggregation || 'SUM'} onChange={e => um(i, 'aggregation', e.target.value)}>
                        <option value="SUM">SUM</option><option value="SUM_ABS">SUM_ABS</option><option value="COUNT">COUNT</option>
                      </select>
                    </td>
                    <td><input value={r.applyTo || ''} onChange={e => um(i, 'applyTo', e.target.value)} style={{ width: 100 }} /></td>
                    <td>
                      <select value={r.status || 'ACTIVE'} onChange={e => um(i, 'status', e.target.value)}>
                        <option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option>
                      </select>
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setMaps(rs => rs.filter((_, j) => j !== i))}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setMaps(rs => [...rs, { platform: '', metricKey: '', sourceSheet: '', fieldAliases: '', aggregation: 'SUM', valueType: 'NUMBER', applyTo: '', status: 'ACTIVE', note: '' }])}>+ เพิ่ม</button>
              <button className="btn btn-green" disabled={busy} onClick={saveMaps}>บันทึก Mapping</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
