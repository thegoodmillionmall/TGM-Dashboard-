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
  const statementGroups = useMemo(() => buildStatementGroups(month), [month]);

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

          <div className="statement-group-grid">
            {statementGroups.map(g => (
              <details className={`statement-group-card ${g.tone || ''}`} key={g.key} open={g.key === 'net'}>
                <summary>
                  <span>
                    <b>{g.title}</b>
                    <small>{g.subtitle}</small>
                  </span>
                  <strong>{fmtMoney(g.amount)}</strong>
                </summary>
                <div className="statement-progress">
                  <span style={{ width: `${Math.min(Math.abs(g.percent), 100)}%` }} />
                </div>
                <div className="statement-group-meta">
                  <span>{g.percentLabel}</span>
                  <span>{g.rows.length} รายการ</span>
                </div>
                <div className="statement-line-list">
                  {g.rows.map((r, i) => (
                    <div className={r.total ? 'is-total' : ''} key={`${g.key}-${i}`}>
                      <span>{r.item}</span>
                      <b>{fmtMoney(r.amount)}</b>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="card">
            <h3>รายละเอียดงบแบบตาราง</h3>
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

function buildStatementGroups(month) {
  if (!month) return [];
  const rows = month.rows || [];
  const revenue = month.summary?.revenue || 0;
  const getTotal = label => rows.find(r => r.item === label)?.amount || 0;
  const pct = amount => revenue ? (amount / revenue) * 100 : 0;
  const lineRows = (group, totalLabel) => rows.filter(r => r.group === group && r.item !== totalLabel);
  const totalRow = label => rows.find(r => r.item === label);
  const groups = [
    {
      key: 'revenue',
      title: 'รายได้',
      subtitle: 'ยอดขายและรายได้บริการ',
      amount: revenue,
      percent: 100,
      percentLabel: 'ฐานรายได้ 100%',
      rows: rows.filter(r => r.section === 'รายได้' && !r.total),
      tone: 'income'
    },
    {
      key: 'cogs',
      title: 'ต้นทุนขาย',
      subtitle: 'ต้นทุนสินค้าและต้นทุนขายสุทธิ',
      amount: getTotal('รวมต้นทุนขายสุทธิ'),
      percent: pct(getTotal('รวมต้นทุนขายสุทธิ')),
      percentLabel: `${fmtPct(pct(getTotal('รวมต้นทุนขายสุทธิ')))} ของรายได้`,
      rows: [...lineRows('ต้นทุนขายสุทธิ', 'รวมต้นทุนขายสุทธิ'), totalRow('รวมต้นทุนขายสุทธิ')].filter(Boolean),
      tone: 'cost'
    },
    {
      key: 'selling',
      title: 'ค่าใช้จ่ายขาย',
      subtitle: 'ค่าธรรมเนียม แอด ขนส่ง และส่งเสริมการขาย',
      amount: getTotal('รวมค่าใช้จ่ายในการขาย'),
      percent: pct(getTotal('รวมค่าใช้จ่ายในการขาย')),
      percentLabel: `${fmtPct(pct(getTotal('รวมค่าใช้จ่ายในการขาย')))} ของรายได้`,
      rows: [...lineRows('ค่าใช้จ่ายในการขาย', 'รวมค่าใช้จ่ายในการขาย'), totalRow('รวมค่าใช้จ่ายในการขาย')].filter(Boolean),
      tone: 'expense'
    },
    {
      key: 'admin',
      title: 'ค่าใช้จ่ายบริหาร',
      subtitle: 'เงินเดือน ค่าบริการ สำนักงาน และค่าใช้จ่ายบริษัท',
      amount: getTotal('รวมค่าใช้จ่ายในการบริหาร'),
      percent: pct(getTotal('รวมค่าใช้จ่ายในการบริหาร')),
      percentLabel: `${fmtPct(pct(getTotal('รวมค่าใช้จ่ายในการบริหาร')))} ของรายได้`,
      rows: [...lineRows('ค่าใช้จ่ายในการบริหาร', 'รวมค่าใช้จ่ายในการบริหาร'), totalRow('รวมค่าใช้จ่ายในการบริหาร')].filter(Boolean),
      tone: 'expense'
    },
    {
      key: 'net',
      title: 'กำไรสุทธิ',
      subtitle: 'รายได้หักต้นทุนและค่าใช้จ่ายทั้งหมด',
      amount: month.summary?.net || 0,
      percent: pct(month.summary?.net || 0),
      percentLabel: `Net Margin ${fmtPct(month.summary?.margin || 0)}`,
      rows: [
        { item: 'รวมรายได้', amount: revenue, total: true },
        { item: 'รวมค่าใช้จ่าย', amount: month.summary?.expenses || 0, total: true },
        { item: 'กำไร(ขาดทุน) สุทธิ', amount: month.summary?.net || 0, total: true }
      ],
      tone: (month.summary?.net || 0) >= 0 ? 'income' : 'loss'
    }
  ];
  return groups;
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
