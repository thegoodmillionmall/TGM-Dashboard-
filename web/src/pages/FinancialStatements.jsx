import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, fmtMoney, fmtPct, getUser } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

const blankMonth = rows => ({
  month: new Date().toISOString().slice(0, 7),
  title: '',
  unit: 'บาท',
  rows: rows.map(r => ({ ...r, amount: 0, total: !!r.total }))
});

export default function FinancialStatements() {
  const user = getUser();
  const canEdit = user?.role === 'ADMIN';
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setData(await apiGet('/finance/statements'));
  }

  useEffect(() => { load().catch(err => setMsg({ type: 'error', text: err.message })); }, []);

  const months = data?.months || [];
  const month = months.find(m => m.month === selected) || months[months.length - 1];
  useEffect(() => {
    if (!selected && months.length) setSelected(months[months.length - 1].month);
  }, [months.length, selected]);

  const monthOptions = months.map(m => ({ key: m.month, label: m.title || m.month }));
  const groupedRows = useMemo(() => groupRows(month?.rows || []), [month]);

  async function seed() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/statements/seed');
      setMsg({ type: 'success', text: res.message });
      await load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function saveMonth() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/finance/statements/month', edit);
      setMsg({ type: 'success', text: res.message });
      setEdit(null);
      await load();
      setSelected(res.month.month);
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  function startNewMonth() {
    const template = data?.templateRows?.length ? data.templateRows : month?.rows || [];
    const next = nextMonth(month?.month || '2026-01');
    setEdit({ ...blankMonth(template), month: next, title: `งบกำไรขาดทุน ${next}` });
  }

  if (!data) return <Loading />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">งบการเงิน</div>
          <div className="page-sub">เก็บงบไว้ในระบบโดยตรง ไม่แก้ Google Sheet ต้นทาง</div>
        </div>
        <div className="toolbar">
          <select value={selected} onChange={e => setSelected(e.target.value)}>
            {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {canEdit && <button className="btn btn-ghost" disabled={busy} onClick={seed}>นำข้อมูลงบตั้งต้นเข้า</button>}
          {canEdit && <button className="btn btn-green" onClick={startNewMonth}>+ เพิ่มเดือนใหม่</button>}
        </div>
      </div>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}

      {month && (
        <>
          <div className="statement-hero">
            <div>
              <span>{month.title || month.month}</span>
              <h2>{fmtMoney(month.summary.net)}</h2>
              <p>กำไรสุทธิ | Net Margin {fmtPct(month.summary.margin)}</p>
            </div>
            <Stat label="รายได้รวม" value={fmtMoney(month.summary.revenue)} />
            <Stat label="ต้นทุนขาย" value={fmtMoney(month.summary.cogs)} />
            <Stat label="ค่าใช้จ่ายขาย" value={fmtMoney(month.summary.selling)} />
            <Stat label="ค่าใช้จ่ายบริหาร" value={fmtMoney(month.summary.admin)} />
          </div>

          <div className="card">
            <h3>รายละเอียดงบ</h3>
            <div className="table-scroll">
              <table className="data statement-table">
                <thead><tr><th>หมวดหลัก</th><th>กลุ่ม</th><th>รายการ</th><th className="num">จำนวนเงิน</th></tr></thead>
                <tbody>
                  {groupedRows.map((r, i) => (
                    <tr key={i} className={r.total ? 'statement-total-row' : ''}>
                      <td>{r.section}</td>
                      <td>{r.group || '-'}</td>
                      <td className="strong">{r.item}</td>
                      <td className="num strong" style={{ color: r.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {edit && (
        <div className="modal-backdrop" onClick={() => setEdit(null)}>
          <div className="modal-panel statement-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setEdit(null)}>×</button>
            <h3>เพิ่ม/แก้งบรายเดือน</h3>
            <div className="form-grid">
              <label>เดือน<input type="month" value={edit.month} onChange={e => setEdit({ ...edit, month: e.target.value })} /></label>
              <label>ชื่องบ<input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
            </div>
            <div className="table-scroll statement-edit-scroll">
              <table className="data statement-table">
                <thead><tr><th>หมวดหลัก</th><th>กลุ่ม</th><th>รายการ</th><th className="num">จำนวนเงิน</th></tr></thead>
                <tbody>{edit.rows.map((r, i) => (
                  <tr key={i} className={r.total ? 'statement-total-row' : ''}>
                    <td><input value={r.section} onChange={e => updateRow(setEdit, i, 'section', e.target.value)} /></td>
                    <td><input value={r.group} onChange={e => updateRow(setEdit, i, 'group', e.target.value)} /></td>
                    <td><input value={r.item} onChange={e => updateRow(setEdit, i, 'item', e.target.value)} /></td>
                    <td><input type="number" className="num" value={r.amount} onChange={e => updateRow(setEdit, i, 'amount', e.target.value)} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="statement-actions">
              <button className="btn btn-ghost" onClick={() => setEdit(e => ({ ...e, rows: [...e.rows, { section: '', group: '', item: '', amount: 0 }] }))}>+ เพิ่มรายการ</button>
              <button className="btn btn-green" disabled={busy} onClick={saveMonth}>{busy ? 'กำลังบันทึก...' : 'บันทึกเดือนนี้'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="statement-stat"><span>{label}</span><b>{value}</b></div>;
}

function groupRows(rows) {
  return rows.slice().sort((a, b) =>
    String(a.section).localeCompare(String(b.section), 'th') ||
    String(a.group).localeCompare(String(b.group), 'th') ||
    Number(a.total || 0) - Number(b.total || 0)
  );
}

function nextMonth(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  const d = new Date(y || 2026, (m || 1), 1);
  return d.toISOString().slice(0, 7);
}

function updateRow(setEdit, i, key, value) {
  setEdit(e => ({
    ...e,
    rows: e.rows.map((r, idx) => idx === i ? { ...r, [key]: key === 'amount' ? Number(value || 0) : value } : r)
  }));
}
