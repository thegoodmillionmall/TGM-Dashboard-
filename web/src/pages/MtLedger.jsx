import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, fmt, fmtMoney } from '../api.js';
import { Alert, Loading, Kpi } from '../components/ui.jsx';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const SALE_CHANNELS = ['EVE', 'KONVY', 'WATSON'];
const RECEIPT_CHANNELS = ['EVE', 'KONVY', 'WATSON', 'GDT'];
const mKey = (year, m) => `${year}-${String(m + 1).padStart(2, '0')}-01`;

// ช่องกรอกเงินแบบมี comma คั่นหลักพัน
const fmtInput = v => {
  const s = String(v ?? '').replace(/,/g, '');
  if (s === '' || s === '-') return s;
  const [i, d] = s.split('.');
  const int = i === '' ? '' : Number(i).toLocaleString('en-US');
  return d !== undefined ? int + '.' + d : int;
};
const MoneyInput = ({ value, onChange, width = 105 }) => (
  <input type="text" inputMode="decimal" value={fmtInput(value)}
    onChange={e => onChange(e.target.value.replace(/[^0-9.\-]/g, ''))}
    style={{ width, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
);

export default function MtLedger() {
  const [year, setYear] = useState(2026);
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth()); // 0-11
  const [tab, setTab] = useState('sales'); // sales | receipts | payments
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    try { setData(await apiGet('/mt/ledger', { year })); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }
  useEffect(() => { load(); }, [year]);

  if (!data) return <div><div className="page-title">Modern Trade (GP)</div>{msg && <Alert type="error">{msg.text}</Alert>}<Loading /></div>;

  const gp = data.gp || {};
  const monthKey = mKey(year, month);

  // ---------- helpers ----------
  const cellOf = (list, m, ch, prod) =>
    list.find(r => String(r.month).slice(0, 10) === m && r.channel === ch && r.product === prod);

  const products = Array.from(new Set([
    ...data.sales.map(r => r.product),
    ...data.receipts.map(r => r.product)
  ])).sort();

  // สรุปรายเดือน: รับ (เงินรับจริงรวม), จ่าย, คงเหลือ
  const monthlySummary = TH_MONTHS.map((label, i) => {
    const m = mKey(year, i);
    const received = data.receipts.filter(r => String(r.month).slice(0, 10) === m).reduce((s, r) => s + Number(r.amount || 0), 0);
    const paid = data.payments.filter(r => String(r.month).slice(0, 10) === m).reduce((s, r) => s + Number(r.amount || 0), 0);
    return { label, m, received, paid, balance: received - paid };
  });

  // ---------- editors state ----------
  const updateCell = (table, ch, prod, field, val) => {
    setData(d => {
      const list = [...d[table]];
      const idx = list.findIndex(r => String(r.month).slice(0, 10) === monthKey && r.channel === ch && r.product === prod);
      if (idx >= 0) list[idx] = { ...list[idx], [field]: val };
      else list.push({ month: monthKey, channel: ch, product: prod, units: 0, revenue: 0, amount: 0, [field]: val });
      return { ...d, [table]: list };
    });
  };

  async function saveSales() {
    setBusy(true); setMsg(null);
    try {
      const rows = data.sales.filter(r => String(r.month).slice(0, 10) === monthKey);
      const res = await apiPost('/mt/sales', { rows });
      setMsg({ type: 'success', text: res.message }); load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }
  async function saveReceipts() {
    setBusy(true); setMsg(null);
    try {
      const rows = data.receipts.filter(r => String(r.month).slice(0, 10) === monthKey);
      const res = await apiPost('/mt/receipts', { rows });
      setMsg({ type: 'success', text: res.message }); load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  const monthPayments = data.payments.filter(r => String(r.month).slice(0, 10) === monthKey);
  const updatePayment = (i, k, v) => {
    setData(d => {
      const others = d.payments.filter(r => String(r.month).slice(0, 10) !== monthKey);
      const mine = [...monthPayments];
      mine[i] = { ...mine[i], [k]: v };
      return { ...d, payments: [...others, ...mine] };
    });
  };
  async function savePayments() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/mt/payments', { month: monthKey, rows: monthPayments });
      setMsg({ type: 'success', text: res.message }); load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  function addProduct() {
    const name = prompt('ชื่อสินค้าใหม่');
    if (!name) return;
    updateCell(tab === 'receipts' ? 'receipts' : 'sales', tab === 'receipts' ? 'EVE' : 'EVE', name.trim(), tab === 'receipts' ? 'amount' : 'units', 0);
  }

  return (
    <div>
      <div className="page-title">Modern Trade (GP)</div>
      <div className="page-sub">ยอดขายก่อนหัก GP · เงินรับจริง · รายการจ่าย — เลียนแบบชีตเดิม</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      <div className="toolbar">
        <label>ปี
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>GP%: EVE {gp.EVE}% · KONVY {gp.KONVY}% · WATSON {gp.WATSON}%</label>
      </div>

      {/* ---------- KPI รวมทั้งปี ---------- */}
      {(() => {
        const totalUnits = data.sales.reduce((s, r) => s + Number(r.units || 0), 0);
        const totalSales = data.sales.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const totalAfterGp = data.sales.reduce((s, r) => s + Number(r.revenue || 0) * (1 - (gp[r.channel] || 0) / 100), 0);
        const totalReceived = data.receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
        const totalPaid = data.payments.reduce((s, r) => s + Number(r.amount || 0), 0);
        const balance = totalReceived - totalPaid;
        return (
          <div className="kpis">
            <Kpi label="ยอดขายก่อนหัก GP" value={totalSales} tone="blue" />
            <Kpi label={'ยอดหลังหัก GP (คาดว่าจะได้รับ)'} value={totalAfterGp} />
            <Kpi label="เงินรับจริง" value={totalReceived} tone="green" />
            <Kpi label="จ่ายรวม" value={totalPaid} tone="red" />
            <Kpi label="คงเหลือสุทธิ" value={balance} tone={balance >= 0 ? 'green' : 'red'} />
            <Kpi label="จำนวนชิ้นรวม" value={totalUnits} format="num" />
            <Kpi label="% ค่าใช้จ่ายต่อเงินรับ" value={totalReceived > 0 ? (totalPaid / totalReceived) * 100 : 0} format="pct" tone="red" />
            <Kpi label="% เก็บเงินได้ (รับจริง/หลัง GP)" value={totalAfterGp > 0 ? (totalReceived / totalAfterGp) * 100 : 0} format="pct" />
          </div>
        );
      })()}

      {/* ---------- สรุปรายเดือน รับ/จ่าย/คงเหลือ ---------- */}
      <div className="card table-scroll">
        <h3>สรุปรายเดือน (เงินรับจริง − จ่าย = คงเหลือ)</h3>
        <table className="data">
          <thead><tr><th>เดือน</th><th className="num">รับ</th><th className="num">จ่าย</th><th className="num">คงเหลือ</th><th></th></tr></thead>
          <tbody>
            {monthlySummary.map((r, i) => (
              <tr key={i} style={i === month ? { background: 'var(--mint-light)' } : {}}>
                <td style={{ cursor: 'pointer', fontWeight: i === month ? 700 : 400 }} onClick={() => setMonth(i)}>{r.label} {year}</td>
                <td className="num">{r.received ? fmt(r.received, 2) : '-'}</td>
                <td className="num">{r.paid ? fmt(r.paid, 2) : '-'}</td>
                <td className="num" style={{ color: r.balance >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                  {r.received || r.paid ? fmt(r.balance, 2) : '-'}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setMonth(i); setEditOpen(true); }}>✏️ แก้ไข</button>
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mint)' }}>
              <td>รวมทั้งปี</td>
              <td className="num">{fmt(monthlySummary.reduce((s, r) => s + r.received, 0), 2)}</td>
              <td className="num">{fmt(monthlySummary.reduce((s, r) => s + r.paid, 0), 2)}</td>
              <td className="num">{fmt(monthlySummary.reduce((s, r) => s + r.balance, 0), 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ---------- รายละเอียดจ่ายทั้งปี (เหมือนชีตฝั่งขวา) ---------- */}
      <div className="card table-scroll">
        <h3>รายละเอียดจ่ายทั้งปี (ยอดเงินสุทธิ)</h3>
        <table className="data">
          <thead><tr><th>เดือน</th><th>ช่องทาง</th><th>รายการ</th><th className="num">จำนวนเงิน</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {TH_MONTHS.flatMap((label, i) => {
              const m = mKey(year, i);
              const items = data.payments.filter(r => String(r.month).slice(0, 10) === m);
              if (!items.length) return [];
              const total = items.reduce((s, r) => s + Number(r.amount || 0), 0);
              return [
                ...items.map((r, j) => (
                  <tr key={m + j}>
                    {j === 0 && (
                      <td rowSpan={items.length + 1} style={{ fontWeight: 700, verticalAlign: 'top', background: '#fafcfd' }}>
                        {label}
                        <div style={{ marginTop: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setMonth(i); setTab('payments'); setEditOpen(true); }}>✏️ แก้ไข</button>
                        </div>
                      </td>
                    )}
                    <td>{r.channel}</td>
                    <td>{r.item}</td>
                    <td className="num">{fmt(r.amount, 2)}</td>
                    <td style={{ color: /ค้าง/.test(r.note) ? 'var(--danger)' : 'var(--grey)', fontSize: 12 }}>{r.note}</td>
                  </tr>
                )),
                <tr key={m + 'sum'} style={{ background: 'var(--mint-light)', fontWeight: 700 }}>
                  <td colSpan={2}>รวม {label}</td>
                  <td className="num">{fmt(total, 2)}</td>
                  <td></td>
                </tr>
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- ยอดขายก่อนหัก GP ทั้งปี (สรุปรายเดือนต่อช่องทาง) ---------- */}
      <div className="card table-scroll">
        <h3>ยอดขายก่อนหัก GP ทั้งปี (สรุปต่อช่องทาง)</h3>
        <table className="data">
          <thead>
            <tr>
              <th rowSpan={2}>เดือน</th>
              {SALE_CHANNELS.map(ch => <th key={ch} colSpan={3} style={{ textAlign: 'center' }}>{ch} (GP {gp[ch] || 0}%)</th>)}
            </tr>
            <tr>
              {SALE_CHANNELS.flatMap(ch => [
                <th key={ch + 'u'} className="num">ชิ้น</th>,
                <th key={ch + 'r'} className="num">ยอดขาย</th>,
                <th key={ch + 'n'} className="num">หลัง GP</th>
              ])}
            </tr>
          </thead>
          <tbody>
            {TH_MONTHS.map((label, i) => {
              const m = mKey(year, i);
              const monthCells = data.sales.filter(r => String(r.month).slice(0, 10) === m);
              if (!monthCells.length) return null;
              return (
                <tr key={m}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setMonth(i)}>{label}</td>
                  {SALE_CHANNELS.flatMap(ch => {
                    const cells = monthCells.filter(r => r.channel === ch);
                    const units = cells.reduce((s, r) => s + Number(r.units || 0), 0);
                    const rev = cells.reduce((s, r) => s + Number(r.revenue || 0), 0);
                    return [
                      <td key={ch + 'u'} className="num">{units ? fmt(units) : '-'}</td>,
                      <td key={ch + 'r'} className="num">{rev ? fmt(rev, 2) : '-'}</td>,
                      <td key={ch + 'n'} className="num" style={{ color: 'var(--grey-light)' }}>{rev ? fmt(rev * (1 - (gp[ch] || 0) / 100), 2) : '-'}</td>
                    ];
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="alert info" style={{ marginTop: 10 }}>กดชื่อเดือนเพื่อลงไปแก้ไขรายละเอียดรายสินค้าของเดือนนั้นด้านล่าง</div>
      </div>

      {/* ---------- ป็อปอัพแก้ไขรายเดือน ---------- */}
      {editOpen && (
      <div className="modal-back" onClick={() => setEditOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '92vw', maxWidth: 1200, maxHeight: '88vh' }}>
      <h3>✏️ กำลังแก้ไข: {tab === 'sales' ? 'ยอดขายก่อนหัก GP' : tab === 'receipts' ? 'เงินรับจริง' : 'รายการจ่าย'} — เดือน {TH_MONTHS[month]} {year}</h3>
      <div className="toolbar" id="mt-editor">
        <label>เดือนที่แก้ไข
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>
            {TH_MONTHS.map((m, i) => <option key={i} value={i}>{m} {year}</option>)}
          </select>
        </label>
        <button className={'btn ' + (tab === 'sales' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('sales')}>ยอดขายก่อนหัก GP</button>
        <button className={'btn ' + (tab === 'receipts' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('receipts')}>เงินรับจริง</button>
        <button className={'btn ' + (tab === 'payments' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('payments')}>รายการจ่าย</button>
      </div>

      {/* ---------- ยอดขายก่อนหัก GP ---------- */}
      {tab === 'sales' && (
        <div className="card table-scroll">
          <h3>ยอดขายก่อนหัก GP — {TH_MONTHS[month]} {year}</h3>
          <table className="data">
            <thead>
              <tr>
                <th rowSpan={2}>รายการ</th>
                {SALE_CHANNELS.map(ch => <th key={ch} colSpan={3} style={{ textAlign: 'center' }}>{ch} (GP {gp[ch] || 0}%)</th>)}
              </tr>
              <tr>
                {SALE_CHANNELS.flatMap(ch => [
                  <th key={ch + 'u'} className="num">จำนวนชิ้น</th>,
                  <th key={ch + 'r'} className="num">ยอดขาย</th>,
                  <th key={ch + 'n'} className="num">หลังหัก GP</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {products.map(prod => (
                <tr key={prod}>
                  <td>{prod}</td>
                  {SALE_CHANNELS.flatMap(ch => {
                    const cell = cellOf(data.sales, monthKey, ch, prod) || {};
                    const rev = Number(cell.revenue || 0);
                    const net = rev * (1 - (gp[ch] || 0) / 100);
                    return [
                      <td key={ch + 'u'}><input type="number" value={cell.units ?? ''} onChange={e => updateCell('sales', ch, prod, 'units', e.target.value)} style={{ width: 70, textAlign: 'right' }} /></td>,
                      <td key={ch + 'r'}><MoneyInput width={100} value={cell.revenue ?? ''} onChange={v => updateCell('sales', ch, prod, 'revenue', v)} /></td>,
                      <td key={ch + 'n'} className="num" style={{ color: 'var(--grey-light)' }}>{rev ? fmt(net, 2) : '-'}</td>
                    ];
                  })}
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: 'var(--mint-light)' }}>
                <td>รวม</td>
                {SALE_CHANNELS.flatMap(ch => {
                  const cells = data.sales.filter(r => String(r.month).slice(0, 10) === monthKey && r.channel === ch);
                  const units = cells.reduce((s, r) => s + Number(r.units || 0), 0);
                  const rev = cells.reduce((s, r) => s + Number(r.revenue || 0), 0);
                  return [
                    <td key={ch + 'u'} className="num">{fmt(units)}</td>,
                    <td key={ch + 'r'} className="num">{fmt(rev, 2)}</td>,
                    <td key={ch + 'n'} className="num">{fmt(rev * (1 - (gp[ch] || 0) / 100), 2)}</td>
                  ];
                })}
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={addProduct}>+ เพิ่มสินค้า</button>
            <button className="btn btn-green" disabled={busy} onClick={saveSales}>{busy ? 'กำลังบันทึก...' : 'บันทึกเดือนนี้'}</button>
          </div>
        </div>
      )}

      {/* ---------- เงินรับจริง ---------- */}
      {tab === 'receipts' && (
        <div className="card table-scroll">
          <h3>เงินรับจริง — {TH_MONTHS[month]} {year}</h3>
          <table className="data">
            <thead><tr>
              <th>รายการ</th>
              {RECEIPT_CHANNELS.map(ch => <th key={ch} className="num">{ch}</th>)}
              <th className="num">รวม</th>
            </tr></thead>
            <tbody>
              {products.map(prod => {
                const rowTotal = RECEIPT_CHANNELS.reduce((s, ch) => s + Number(cellOf(data.receipts, monthKey, ch, prod)?.amount || 0), 0);
                return (
                  <tr key={prod}>
                    <td>{prod}</td>
                    {RECEIPT_CHANNELS.map(ch => {
                      const cell = cellOf(data.receipts, monthKey, ch, prod) || {};
                      return (
                        <td key={ch}>
                          <MoneyInput width={110} value={cell.amount ?? ''} onChange={v => updateCell('receipts', ch, prod, 'amount', v)} />
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 600 }}>{rowTotal ? fmt(rowTotal, 2) : '-'}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700, background: 'var(--mint-light)' }}>
                <td>รวม</td>
                {RECEIPT_CHANNELS.map(ch => {
                  const t = data.receipts.filter(r => String(r.month).slice(0, 10) === monthKey && r.channel === ch)
                    .reduce((s, r) => s + Number(r.amount || 0), 0);
                  return <td key={ch} className="num">{fmt(t, 2)}</td>;
                })}
                <td className="num">{fmt(data.receipts.filter(r => String(r.month).slice(0, 10) === monthKey).reduce((s, r) => s + Number(r.amount || 0), 0), 2)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={addProduct}>+ เพิ่มสินค้า</button>
            <button className="btn btn-green" disabled={busy} onClick={saveReceipts}>{busy ? 'กำลังบันทึก...' : 'บันทึกเดือนนี้'}</button>
          </div>
        </div>
      )}

      {/* ---------- รายการจ่าย ---------- */}
      {tab === 'payments' && (
        <div className="card table-scroll">
          <h3>จ่าย (ยอดเงินสุทธิ) — {TH_MONTHS[month]} {year}</h3>
          <table className="data">
            <thead><tr><th>ช่องทาง</th><th>รายการ</th><th className="num">จำนวนเงิน</th><th>หมายเหตุ</th><th></th></tr></thead>
            <tbody>
              {monthPayments.map((r, i) => (
                <tr key={i}>
                  <td>
                    <select value={r.channel} onChange={e => updatePayment(i, 'channel', e.target.value)}>
                      {['EVE', 'KONVY', 'WATSON', 'GDT', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td><input value={r.item} onChange={e => updatePayment(i, 'item', e.target.value)} style={{ minWidth: 180 }} placeholder="เช่น DC / ค่าเช่า / ค่าเปิดสาขาใหม่" /></td>
                  <td><MoneyInput width={115} value={r.amount} onChange={v => updatePayment(i, 'amount', v)} /></td>
                  <td><textarea rows={1} value={r.note} onChange={e => updatePayment(i, 'note', e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => {
                    setData(d => ({ ...d, payments: d.payments.filter(x => !(String(x.month).slice(0, 10) === monthKey && monthPayments.indexOf(x) === i)) }));
                  }}>ลบ</button></td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, background: 'var(--mint-light)' }}>
                <td colSpan={2}>รวมจ่ายเดือนนี้</td>
                <td className="num">{fmt(monthPayments.reduce((s, r) => s + Number(r.amount || 0), 0), 2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setData(d => ({ ...d, payments: [...d.payments, { month: monthKey, channel: 'EVE', item: '', amount: 0, note: '' }] }))}>+ เพิ่มรายการจ่าย</button>
            <button className="btn btn-green" disabled={busy} onClick={savePayments}>{busy ? 'กำลังบันทึก...' : 'บันทึกเดือนนี้'}</button>
          </div>
        </div>
      )}

      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setEditOpen(false)}>ปิดหน้าต่างแก้ไข</button>
      </div>
      </div>
      )}
    </div>
  );
}
