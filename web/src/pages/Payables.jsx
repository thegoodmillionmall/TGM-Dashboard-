import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, fmtMoney, fmt, getToken } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const STATUSES = [
  ['PENDING', 'รอจ่าย'],
  ['APPROVED', 'อนุมัติแล้ว (รอโอน)'],
  ['PAID', 'จ่ายแล้ว'],
  ['CANCELLED', 'ยกเลิก']
];
const BANKS = ['กสิกร (Kbank)', 'ไทยพาณิชย์ (SCB)', 'กรุงไทย (KTB)', 'กรุงเทพ (BBL)', 'กรุงศรี (BAY)', 'ทีทีบี (ttb)', 'ออมสิน', 'อื่นๆ'];
const COMPANIES = ['TG', 'AZHER'];
const DOC_TYPES = [
  ['QUOTATION', 'ใบเสนอราคา'],
  ['BILLING', 'ใบวางบิล'],
  ['RECEIPT', 'ใบเสร็จ'],
  ['TAX_INVOICE', 'ใบกำกับภาษี'],
  ['ID_CARD', 'บัตรประชาชน'],
  ['OTHER', 'อื่นๆ']
];
const docLabel = t => (DOC_TYPES.find(([k]) => k === t) || ['', t])[1];

const EMPTY = {
  id: '', dueDate: '', status: 'PENDING', company: 'TG', vendor: '', description: '',
  grossAmount: '', whtAmount: '', netAmount: '', bank: '', accountNo: '', accountName: '',
  ref: '', documentLink: '', needReceipt: false, receiptStatus: 'MISSING',
  needTaxInvoice: false, taxInvoiceStatus: 'NOT_REQUIRED', needWhtIssue: false, whtIssueStatus: 'NOT_REQUIRED',
  needOriginal: false, originalStatus: 'MISSING', note: ''
};

// ช่องกรอกเงินแบบมี comma คั่นหลักพัน
const fmtInput = v => {
  const s = String(v ?? '').replace(/,/g, '');
  if (s === '' || s === '-') return s;
  const [i, d] = s.split('.');
  const int = i === '' ? '' : Number(i).toLocaleString('en-US');
  return d !== undefined ? int + '.' + d : int;
};
function MoneyInput({ value, onChange, width = 110 }) {
  return (
    <input
      type="text" inputMode="decimal"
      value={fmtInput(value)}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9.\-]/g, '');
        onChange(raw);
      }}
      style={{ width, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

const netOf = r => {
  const gross = Number(r.grossAmount || 0), wht = Number(r.whtAmount || 0);
  return r.netAmount === '' || r.netAmount === null || r.netAmount === undefined
    ? Math.max(gross - wht, 0) : Number(r.netAmount || 0);
};
const thDate = iso => {
  const s = String(iso || '').slice(0, 10);
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
};

export default function Payables() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [start, setStart] = useState('2026-01-01');
  const [end, setEnd] = useState('2026-12-31');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [lineDate, setLineDate] = useState(new Date().toISOString().slice(0, 10));
  const [lineText, setLineText] = useState('');
  const [docRow, setDocRow] = useState(null);
  const [docList, setDocList] = useState([]);
  const [docType, setDocType] = useState('BILLING');
  const [docBusy, setDocBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // { ok, tab, totalRows, reason }

  async function load() {
    try { setData(await apiGet('/ops/payables', { status, start, end })); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }
  useEffect(() => { load(); }, [status]);

  const rows = data?.rows || [];
  const update = (i, k, v) => setData(d => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  // ---------- ยอดสรุปตามช่วงเวลา ----------
  const active = rows.filter(r => r.status !== 'CANCELLED');
  const pendingRows = active.filter(r => ['PENDING', 'APPROVED'].includes(r.status));
  const paidRows = active.filter(r => r.status === 'PAID');
  const sum = arr => arr.reduce((s, r) => s + netOf(r), 0);

  async function save(extraRows) {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/ops/payables', { rows: extraRows || rows });
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function saveForm() {
    if (!form.dueDate || !form.vendor || !Number(form.grossAmount)) {
      setMsg({ type: 'error', text: 'กรอกอย่างน้อย: รอบจ่าย, ชื่อผู้รับเงิน, ยอดเงินรวม' });
      return;
    }
    await save([...rows, { ...form }]);
    setForm(null);
  }

  // ---------- สรุปส่งไลน์ ----------
  function buildLineSummary() {
    const items = rows.filter(r =>
      String(r.dueDate).slice(0, 10) === lineDate && !['PAID', 'CANCELLED'].includes(r.status));
    if (!items.length) { setLineText(`รอบจ่ายวันที่ ${thDate(lineDate)}\nไม่มีรายการค้างจ่าย`); return; }
    const total = items.reduce((s, r) => s + netOf(r), 0);
    const numEmoji = n => {
      const map = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      return map[n - 1] || `${n}.`;
    };
    const blocks = items.map((r, i) => [
      `${numEmoji(i + 1)} บริษัท ${r.vendor || '-'}`,
      `🏦 ธนาคาร : ${r.bank || '-'}`,
      `🔢 เลขบัญชี : ${r.accountNo || '-'}`,
      `💵 จำนวนเงิน : ${fmt(netOf(r), 2)} บาท`,
      `📝 รายละเอียดงาน : ${r.description || '-'}`
    ].join('\n'));
    setLineText([
      `📋 รอบจ่ายวันที่ ${thDate(lineDate)}`,
      `📌 ยอดรวมจ่าย ${items.length} รายการ`,
      `💰 จำนวนเงินรวม ${fmt(total, 2)} บาท`,
      `━━━━━━━━━━━━━━━`,
      `ได้แก่`, '',
      blocks.join('\n\n─────────────────\n\n'),
      '',
      `━━━━━━━━━━━━━━━`,
      `✅ รวมทั้งสิ้น ${fmt(total, 2)} บาท`
    ].join('\n'));
  }

  async function copyLine() {
    try {
      await navigator.clipboard.writeText(lineText);
      setMsg({ type: 'success', text: 'คัดลอกแล้ว — เปิดไลน์แล้ววางได้เลย' });
    } catch {
      setMsg({ type: 'error', text: 'คัดลอกอัตโนมัติไม่ได้ ให้ลากคลุมข้อความแล้วกด Ctrl+C' });
    }
  }

  // ---------- ไฟล์แนบ ----------
  async function openDocs(row) {
    setDocRow(row); setDocList([]);
    try { setDocList(await apiGet('/ops/payables/' + encodeURIComponent(row.id) + '/attachments')); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }

  async function uploadDoc(file) {
    if (!file || !docRow) return;
    setDocBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('docType', docType);
      const res = await fetch('/api/ops/payables/' + encodeURIComponent(docRow.id) + '/attachments', {
        method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'อัปโหลดไม่สำเร็จ');
      setDocList(await apiGet('/ops/payables/' + encodeURIComponent(docRow.id) + '/attachments'));
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setDocBusy(false); }
  }

  async function deleteDoc(att) {
    if (!confirm('ลบไฟล์ "' + att.file_name + '" ?')) return;
    try {
      await apiDelete('/ops/attachments/' + encodeURIComponent(att.id));
      setDocList(list => list.filter(a => a.id !== att.id));
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  }

  function viewDoc(att) {
    fetch('/api/ops/attachments/' + encodeURIComponent(att.id) + '/download', {
      headers: { Authorization: 'Bearer ' + getToken() }
    }).then(async res => {
      if (!res.ok) throw new Error('เปิดไฟล์ไม่สำเร็จ');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    }).catch(err => setMsg({ type: 'error', text: err.message }));
  }

  return (
    <div>
      <div className="page-title">บัญชีจ่าย (Payables)</div>
      <div className="page-sub">บันทึกรายการรอจ่าย + เอกสารแนบ + สรุปยอดส่งไลน์</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      {/* ---------- ช่วงเวลา + ยอดสรุป ---------- */}
      <div className="toolbar">
        <label>ตั้งแต่<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>สถานะ
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="ALL">ทั้งหมด</option>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" onClick={load}>แสดงข้อมูล</button>
        <button className="btn btn-ghost" onClick={() => setForm({ ...EMPTY })}>+ เพิ่มรายการใหม่</button>
        <button className="btn btn-green" disabled={busy} onClick={() => save()}>{busy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
        <button className="btn btn-ghost" disabled={busy} title="สร้าง tab TGM_Payables ใหม่ในชีต (ไม่แตะ tab เดิม)" onClick={async () => {
          if (!confirm('สร้าง tab "TGM_Payables" ใหม่ในชีต?\nTab เดิมจะไม่ถูกแตะ')) return;
          setBusy(true); setMsg(null);
          try {
            const res = await apiPost('/ops/payables/setup-sheet');
            setMsg({ type: 'success', text: res.message });
          } catch (err) { setMsg({ type: 'error', text: err.message }); }
          finally { setBusy(false); }
        }}>🆕 สร้าง TGM Tab ใหม่</button>
        <button className="btn btn-ghost" disabled={busy}
          title="รับ status จาก Google Sheet → ระบบ (ชีตเป็น master)"
          onClick={async () => {
            setBusy(true); setMsg(null); setSyncStatus(null);
            try {
              const res = await apiPost('/ops/payables/sync-sheet');
              setMsg({ type: 'success', text: res.message || `ดึง status จากชีตแล้ว (${res.pulled || 0} รายการที่เปลี่ยน)` });
              setSyncStatus({ ok: true, tab: res.tab, totalRows: res.totalRows, pulled: res.pulled });
              load();
            } catch (err) { setMsg({ type: 'error', text: err.message }); }
            finally { setBusy(false); }
          }}>⟳ รับ Status จากชีต</button>
        <button className="btn btn-ghost" disabled={busy}
          title="⚠️ ส่งข้อมูลจากระบบไปทับชีต — ใช้เมื่อต้องการให้ระบบเป็น master เท่านั้น"
          onClick={async () => {
            if (!confirm('⚠️ การ Push จะส่งข้อมูลจากระบบไปทับ Google Sheet\ncheckbox ที่ติ๊กไว้ในชีตอาจถูกเขียนทับ\n\nทำต่อไหม?')) return;
            setBusy(true); setMsg(null); setSyncStatus(null);
            try {
              const res = await apiPost('/ops/payables/full-sync');
              setMsg({ type: 'success', text: res.message });
              setSyncStatus({ ok: true, tab: res.tab, totalRows: res.totalRows, pulled: res.pulled, sheetUpdated: res.sheetUpdated, sheetAdded: res.sheetAdded });
              load();
            } catch (err) { setMsg({ type: 'error', text: err.message }); }
            finally { setBusy(false); }
          }}>↑ Push ระบบ→ชีต</button>
        <button className="btn btn-ghost" disabled={busy} onClick={async () => {
          setBusy(true); setSyncStatus(null);
          try {
            const res = await apiGet('/ops/payables/sync-sheet/test');
            setSyncStatus({ ...res });
            setMsg(res.ok
              ? { type: 'success', text: `เชื่อมต่อสำเร็จ — tab "${res.tab}" มี ${res.totalRows} แถว` }
              : { type: 'error', text: 'เชื่อมต่อไม่สำเร็จ: ' + res.reason });
          } catch (err) { setMsg({ type: 'error', text: err.message }); }
          finally { setBusy(false); }
        }}>🔍 ทดสอบการเชื่อมต่อ</button>
        <button className="btn btn-primary" disabled={busy}
          title="นำเข้ารายการทั้งหมดจาก Google Sheet — สร้างรายการใหม่ที่ยังไม่มีในระบบ"
          onClick={async () => {
            if (!confirm('นำเข้ารายการทั้งหมดจาก Google Sheet?\n(รายการที่มีอยู่แล้วจะถูกข้ามอัตโนมัติ)')) return;
            setBusy(true); setMsg(null); setSyncStatus(null);
            try {
              const res = await apiPost('/ops/payables/import-sheet');
              setMsg({ type: 'success', text: res.message });
              setSyncStatus({ ok: true, tab: res.tab, totalRows: res.totalRows });
              load();
            } catch (err) { setMsg({ type: 'error', text: err.message }); }
            finally { setBusy(false); }
          }}>📥 นำเข้าจาก Sheet</button>
      </div>

      {syncStatus && (
        <div style={{
          marginBottom: 10, padding: '8px 14px', borderRadius: 8, fontSize: 13,
          background: syncStatus.ok ? 'rgba(178,216,216,0.2)' : 'rgba(220,53,69,0.1)',
          border: `1px solid ${syncStatus.ok ? 'var(--mint)' : 'var(--danger)'}`,
          color: syncStatus.ok ? 'var(--text)' : 'var(--danger)'
        }}>
          {syncStatus.ok
            ? [
                `✅ tab "${syncStatus.tab}" · ${syncStatus.totalRows ?? '?'} แถว`,
                syncStatus.pulled ? `รับ status ${syncStatus.pulled} รายการ` : null,
                syncStatus.sheetUpdated ? `อัปเดตชีต ${syncStatus.sheetUpdated} แถว` : null,
                syncStatus.sheetAdded ? `เพิ่มในชีต ${syncStatus.sheetAdded} แถวใหม่` : null,
                (!syncStatus.pulled && !syncStatus.sheetUpdated && !syncStatus.sheetAdded) ? 'ไม่มีการเปลี่ยนแปลง' : null,
              ].filter(Boolean).join(' · ')
            : `❌ เชื่อมต่อไม่สำเร็จ: ${syncStatus.reason}`}
        </div>
      )}

      <div className="kpis">
        <div className="kpi red">
          <div className="label">รอจ่าย ({fmt(pendingRows.length)} รายการ)</div>
          <div className="value">{fmtMoney(sum(pendingRows))}</div>
        </div>
        <div className="kpi green">
          <div className="label">จ่ายแล้ว ({fmt(paidRows.length)} รายการ)</div>
          <div className="value">{fmtMoney(sum(paidRows))}</div>
        </div>
        <div className="kpi blue">
          <div className="label">รวมทั้งหมด ({fmt(active.length)} รายการ)</div>
          <div className="value">{fmtMoney(sum(active))}</div>
        </div>
        <div className="kpi">
          <div className="label">เกินกำหนด</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{fmtMoney(data?.summary?.overdueAmount || 0)}</div>
        </div>
      </div>

      {/* ---------- สรุปส่งไลน์ ---------- */}
      <div className="card">
        <h3>สรุปยอดจ่ายส่งไลน์ (เฉพาะรายการที่ยังไม่จ่าย)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--grey-light)' }}>
            รอบจ่ายวันที่
            <input type="date" value={lineDate} onChange={e => setLineDate(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={buildLineSummary}>สรุปยอดจ่าย</button>
          {lineText && <button className="btn btn-green" onClick={copyLine}>คัดลอกส่งไลน์</button>}
        </div>
        {lineText && (
          <textarea readOnly value={lineText} style={{ width: '100%', minHeight: 220, marginTop: 12, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} />
        )}
      </div>

      {/* ---------- ฟอร์มเพิ่มรายการ ---------- */}
      {form && (
        <div className="card" style={{ borderTop: '4px solid var(--mint-dark)' }}>
          <h3>เพิ่มรายการจ่ายใหม่</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label>รอบจ่าย (วันที่)<input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: '100%' }} /></label>
            <label>บริษัทผู้จ่าย
              <select value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={{ width: '100%' }}>
                {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>รายละเอียดงาน<input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%' }} /></label>
            <label>ชื่อผู้รับเงิน<input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={{ width: '100%' }} /></label>
            <label>ยอดเงินรวม<MoneyInput width="100%" value={form.grossAmount} onChange={v => setForm(f => ({ ...f, grossAmount: v }))} /></label>
            <label>หัก ณ ที่จ่าย<MoneyInput width="100%" value={form.whtAmount} onChange={v => setForm(f => ({ ...f, whtAmount: v }))} /></label>
            <label>สรุปยอดจ่าย (อัตโนมัติ)<input readOnly value={fmt(netOf(form), 2)} style={{ width: '100%', background: 'var(--mint-light)', fontWeight: 600 }} /></label>
            <label>เลขบัญชี<input value={form.accountNo} onChange={e => setForm(f => ({ ...f, accountNo: e.target.value }))} style={{ width: '100%' }} /></label>
            <label>ธนาคาร
              <select value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} style={{ width: '100%' }}>
                <option value="">- เลือก -</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label>Ref / เลขที่เอกสาร<input value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} style={{ width: '100%' }} /></label>
            <label>หมายเหตุ<input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%' }} /></label>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn btn-green" disabled={busy} onClick={saveForm}>บันทึกรายการ</button>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
          </div>
          <div className="alert info" style={{ marginTop: 12 }}>บันทึกรายการก่อน แล้วจึงกดปุ่ม "เอกสาร" ในตารางเพื่อแนบไฟล์</div>
        </div>
      )}

      {/* ---------- ตาราง ---------- */}
      {!data ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data" style={{ fontSize: 12.5 }}>
            <thead><tr>
              <th style={{ width: 130 }}>รอบจ่าย</th><th style={{ width: 120 }}>สถานะ</th><th style={{ width: 80 }}>บริษัท</th><th>ผู้รับเงิน</th><th>รายละเอียด</th>
              <th className="num">ยอดรวม</th><th className="num">หัก ณ ที่จ่าย</th><th className="num">สรุปจ่าย</th>
              <th>เลขบัญชี</th><th>ธนาคาร</th><th>เอกสาร</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i} style={r.status === 'PAID' ? { opacity: .55 } : {}}>
                  <td><input type="date" value={String(r.dueDate).slice(0, 10)} onChange={e => update(i, 'dueDate', e.target.value)} /></td>
                  <td>
                    <select value={r.status} onChange={e => update(i, 'status', e.target.value)}>
                      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.company} onChange={e => update(i, 'company', e.target.value)}>
                      {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                      {!COMPANIES.includes(r.company) && r.company && <option value={r.company}>{r.company}</option>}
                    </select>
                  </td>
                  <td style={{ minWidth: 180 }}><textarea rows={1} value={r.vendor} onChange={e => update(i, 'vendor', e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}><textarea rows={1} value={r.description} onChange={e => update(i, 'description', e.target.value)} /></td>
                  <td><MoneyInput width={105} value={r.grossAmount} onChange={v => update(i, 'grossAmount', v)} /></td>
                  <td><MoneyInput width={90} value={r.whtAmount} onChange={v => update(i, 'whtAmount', v)} /></td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(netOf(r))}</td>
                  <td><input value={r.accountNo} onChange={e => update(i, 'accountNo', e.target.value)} style={{ width: 115 }} /></td>
                  <td>
                    <select value={r.bank} onChange={e => update(i, 'bank', e.target.value)}>
                      <option value="">-</option>
                      {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      {!BANKS.includes(r.bank) && r.bank && <option value={r.bank}>{r.bank}</option>}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDocs(r)} disabled={!r.id}>
                      📎 {r.attachmentCount > 0 ? r.attachmentCount : 'แนบ'}
                    </button>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={async () => {
                    if (!confirm('ลบรายการ "' + (r.description || r.vendor) + '" ?')) return;
                    try {
                      if (r.id) await apiDelete('/ops/payables/' + encodeURIComponent(r.id));
                      setData(d => ({ ...d, rows: d.rows.filter((_, j) => j !== i) }));
                    } catch (err) { setMsg({ type: 'error', text: err.message }); }
                  }}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Modal เอกสารแนบ ---------- */}
      {docRow && (
        <div className="modal-back" onClick={() => setDocRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
            <h3>เอกสารแนบ — {docRow.vendor} ({thDate(docRow.dueDate)})</h3>
            <div style={{ fontSize: 12, color: 'var(--grey-light)', marginBottom: 10 }}>{docRow.description}</div>

            {DOC_TYPES.map(([type, label]) => {
              const files = docList.filter(a => a.doc_type === type);
              if (!files.length) return null;
              return (
                <div key={type} style={{ marginBottom: 10 }}>
                  <b style={{ fontSize: 13 }}>{label}</b>
                  {files.map(att => (
                    <div key={att.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #eef4f8', fontSize: 13 }}>
                      <span style={{ flex: 1, cursor: 'pointer', color: 'var(--mint-dark)' }} onClick={() => viewDoc(att)}>
                        📄 {att.file_name}
                      </span>
                      <span style={{ color: 'var(--grey-light)', fontSize: 11 }}>{fmt(att.file_size / 1024)} KB</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteDoc(att)}>ลบ</button>
                    </div>
                  ))}
                </div>
              );
            })}
            {!docList.length && <div className="loading" style={{ padding: 14 }}>ยังไม่มีเอกสารแนบ</div>}

            <div style={{ marginTop: 14, padding: 12, background: 'var(--mint-light)', borderRadius: 10 }}>
              <b style={{ fontSize: 13 }}>แนบเอกสารใหม่</b>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input type="file" disabled={docBusy} onChange={e => { uploadDoc(e.target.files?.[0]); e.target.value = ''; }} />
                {docBusy && <span style={{ fontSize: 12 }}>กำลังอัปโหลด...</span>}
              </div>
            </div>

            <button className="btn btn-ghost" style={{ marginTop: 14, width: '100%' }} onClick={() => setDocRow(null)}>ปิด</button>
          </div>
        </div>
      )}
    </div>
  );
}
