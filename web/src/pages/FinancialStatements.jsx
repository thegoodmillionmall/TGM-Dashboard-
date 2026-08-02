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
  const statementGroups = useMemo(() => buildStatementGroups(month), [month]);
  const detailSections = useMemo(() => buildDetailSections(month), [month]);
  const statementOverview = useMemo(() => buildStatementOverview(months), [months]);

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
          <div className="statement-exec-overview">
            <div className="statement-exec-head">
              <div>
                <span>ภาพรวมใหญ่</span>
                <h2>งบกำไรขาดทุน {statementOverview.periodLabel}</h2>
                <p>ดูรายได้ ค่าใช้จ่าย กำไรสุทธิ และ Net Margin รายเดือนในหน้าเดียว</p>
              </div>
              <div className={`statement-exec-net ${statementOverview.totalNet >= 0 ? 'positive' : 'negative'}`}>
                <small>กำไรสุทธิรวม</small>
                <b>{fmtMoney(statementOverview.totalNet)}</b>
                <span>Net Margin {fmtPct(statementOverview.totalMargin)}</span>
              </div>
            </div>
            <div className="statement-exec-kpis">
              <StatCard label="รายได้รวม" value={fmtMoney(statementOverview.totalRevenue)} />
              <StatCard label="ต้นทุนขายรวม" value={fmtMoney(statementOverview.totalCogs)} />
              <StatCard label="ค่าใช้จ่ายรวม" value={fmtMoney(statementOverview.totalExpenses)} />
              <StatCard label="เดือนที่มีกำไรสูงสุด" value={statementOverview.bestMonth?.label || '-'} helper={statementOverview.bestMonth ? fmtMoney(statementOverview.bestMonth.net) : ''} />
            </div>
            <div className="statement-month-strip">
              {statementOverview.months.map(m => (
                <button
                  className={`statement-month-card ${selected === m.month ? 'active' : ''} ${m.net >= 0 ? 'profit' : 'loss'}`}
                  key={m.month}
                  onClick={() => setSelected(m.month)}
                >
                  <span>{m.label}</span>
                  <b>{fmtMoney(m.net)}</b>
                  <small>รายได้ {fmtMoney(m.revenue)} | Margin {fmtPct(m.margin)}</small>
                  <i><em style={{ width: `${m.bar}%` }} /></i>
                </button>
              ))}
            </div>
          </div>

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

          <div className="statement-document card">
            <div className="statement-doc-head">
              <b>บริษัท เดอะ กู้ด มิลเลี่ยน จำกัด</b>
              <span>{month.title || `งบกำไรขาดทุน ${month.month}`}</span>
              <small>หน่วย: {month.unit || 'บาท'}</small>
            </div>
            <div className="statement-doc-body">
              {detailSections.map(section => (
                <details className="statement-doc-collapse" key={section.key}>
                  <summary>
                    <span>
                      <b>{section.title}</b>
                      <small>{section.groups.length} กลุ่ม | {section.count} รายการ</small>
                    </span>
                    <strong style={{ color: section.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(section.amount)}</strong>
                  </summary>
                  <div className="statement-doc-groups">
                    {section.groups.map(group => (
                      <div className="statement-doc-mini-group" key={group.key}>
                        <div className="statement-doc-row statement-doc-group">
                          <span>{group.title}</span>
                          <b style={{ color: group.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(group.amount)}</b>
                        </div>
                        {group.rows.map((r, i) => (
                          <div className={`statement-doc-row ${r.total ? 'statement-doc-total' : ''}`} key={`${group.key}-${i}`}>
                            <span>{r.item}</span>
                            <b style={{ color: r.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(r.amount)}</b>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title-row">
              <h3>รายละเอียดงบแบบตาราง</h3>
              <span>ย่อไว้ก่อน กดหมวดเพื่อดูรายการย่อย</span>
            </div>
            <div className="statement-detail-accordion">
              {detailSections.map(section => (
                <details className="statement-detail-section" key={`table-${section.key}`}>
                  <summary>
                    <span>
                      <b>{section.title}</b>
                      <small>{section.groups.length} กลุ่ม | {section.count} รายการ</small>
                    </span>
                    <strong style={{ color: section.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(section.amount)}</strong>
                  </summary>
                  <div className="statement-detail-groups">
                    {section.groups.map(group => (
                      <details className="statement-detail-group" key={`table-${group.key}`}>
                        <summary>
                          <span>{group.title}</span>
                          <b style={{ color: group.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(group.amount)}</b>
                        </summary>
                        <div className="table-scroll">
                          <table className="data statement-table">
                            <thead><tr><th>รายการ</th><th className="num">จำนวนเงิน</th></tr></thead>
                            <tbody>
                              {group.rows.map((r, i) => (
                                <tr key={i} className={r.total ? 'statement-total-row' : ''}>
                                  <td className="strong">{r.item}</td>
                                  <td className="num strong" style={{ color: r.amount < 0 ? '#ef4444' : undefined }}>{fmtMoney(r.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
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

function StatCard({ label, value, helper }) {
  return (
    <div className="statement-kpi-card">
      <span>{label}</span>
      <b>{value}</b>
      {helper && <small>{helper}</small>}
    </div>
  );
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

function buildStatementOverview(months) {
  const items = (months || []).map(m => ({
    month: m.month,
    label: monthLabel(m.month),
    revenue: m.summary?.revenue || 0,
    cogs: m.summary?.cogs || 0,
    expenses: m.summary?.expenses || 0,
    net: m.summary?.net || 0,
    margin: m.summary?.margin || 0
  }));
  const maxNet = Math.max(1, ...items.map(m => Math.abs(m.net)));
  const totalRevenue = items.reduce((sum, m) => sum + m.revenue, 0);
  const totalNet = items.reduce((sum, m) => sum + m.net, 0);
  const withBars = items.map(m => ({ ...m, bar: Math.max(4, Math.round((Math.abs(m.net) / maxNet) * 100)) }));
  return {
    months: withBars,
    periodLabel: withBars.length ? `${withBars[0].label} - ${withBars[withBars.length - 1].label}` : '',
    totalRevenue,
    totalCogs: items.reduce((sum, m) => sum + m.cogs, 0),
    totalExpenses: items.reduce((sum, m) => sum + m.expenses, 0),
    totalNet,
    totalMargin: totalRevenue ? (totalNet / totalRevenue) * 100 : 0,
    bestMonth: withBars.slice().sort((a, b) => b.net - a.net)[0]
  };
}

function monthLabel(month) {
  const names = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const [y, m] = String(month || '').split('-').map(Number);
  return `${names[(m || 1) - 1] || month} ${y || ''}`.trim();
}

function buildDetailSections(month) {
  if (!month) return [];
  const rows = groupRows(month.rows || []).filter(r => r.item);
  const sections = new Map();
  for (const row of rows) {
    const sectionKey = row.section || 'ไม่ระบุหมวด';
    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        key: sectionKey,
        title: sectionKey,
        groups: new Map(),
        count: 0
      });
    }
    const section = sections.get(sectionKey);
    const groupKey = row.group || 'ไม่มีกลุ่ม';
    if (!section.groups.has(groupKey)) {
      section.groups.set(groupKey, {
        key: `${sectionKey}-${groupKey}`,
        title: groupKey,
        rows: []
      });
    }
    section.groups.get(groupKey).rows.push(row);
    section.count += 1;
  }

  return Array.from(sections.values()).map(section => {
    const groups = Array.from(section.groups.values()).map(group => ({
      ...group,
      amount: groupTotal(rows, group.title)
    }));
    return {
      ...section,
      groups,
      amount: sectionTotal(month, section.title, groups)
    };
  });
}

function sectionTotal(month, section, groups) {
  const summary = month?.summary || {};
  if (section === 'รายได้') return summary.revenue || 0;
  if (section === 'ค่าใช้จ่าย') return summary.expenses || 0;
  if (section.includes('กำไร')) return summary.net || 0;
  const directTotals = groups.flatMap(g => g.rows).filter(r => r.total);
  if (directTotals.length) return directTotals.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  return groups.reduce((sum, g) => sum + Number(g.amount || 0), 0);
}

function groupTotal(rows, group) {
  const total = rows.find(r => r.total && r.item.includes(group.replace('สุทธิ', '').trim()));
  if (total) return total.amount;
  return rows.filter(r => r.group === group && !r.total).reduce((sum, r) => sum + Number(r.amount || 0), 0);
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
