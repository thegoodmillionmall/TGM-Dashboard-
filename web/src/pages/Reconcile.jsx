import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { DateRange, useDateRange, Alert, Loading } from '../components/ui.jsx';

/* Label map สำหรับ key จาก Supabase RPC */
const LABEL = {
  checkedOrders:    'ออเดอร์ที่ตรวจ',
  discrepancyCount: 'พบส่วนต่าง',
  varianceTotal:    'ส่วนต่างรวม',
  matchedOrders:    'ตรงกัน',
  unmatchedOrders:  'ไม่พบคู่',
  totalSaleGmv:     'ยอดขาย (Order)',
  totalSettlement:  'ยอดโอนจริง',
  totalFee:         'ค่าธรรมเนียมรวม',
  totalRefund:      'Refund รวม',
  totalAdjustment:  'Adjustment รวม',
  netTransfer:      'Net Transfer',
  platformFeeRate:  'Fee Rate (%)',
  source:           null,
  fetchedAt:        null,
  ok:               null,
  schemaVersion:    null,
};

const isMoneyField = k => ['varianceTotal','totalSaleGmv','totalSettlement','totalFee',
  'totalRefund','totalAdjustment','netTransfer'].includes(k);
const isPctField = k => k.includes('Rate') || k.includes('Pct') || k.includes('rate') || k.includes('pct');

const primaryKeys = ['checkedOrders','matchedOrders','discrepancyCount','varianceTotal'];

export default function Reconcile() {
  const { start, end, setStart, setEnd } = useDateRange();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try { setData(await apiGet('/dashboard/reconcile', { start, end })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  const summary = data?.summary || {};
  const rows    = data?.rows || data?.daily || [];

  const summaryEntries = Object.entries(summary).filter(([k]) => LABEL[k] !== null);
  const primary   = primaryKeys.filter(k => k in summary);
  const secondary = summaryEntries.filter(([k]) => !primaryKeys.includes(k));

  /* หา column ที่เป็น variance ในตาราง */
  const varCol = rows.length > 0
    ? Object.keys(rows[0]).find(k => k.toLowerCase().includes('varian') || k.toLowerCase().includes('diff') || k.toLowerCase().includes('gap'))
    : null;

  const fmtVal = (k, v) => {
    if (typeof v !== 'number') return String(v ?? '—');
    if (isMoneyField(k)) return fmtMoney(v);
    if (isPctField(k))   return v.toFixed(2) + '%';
    return fmt(v);
  };

  return (
    <div>
      <div className="page-title">ตรวจสอบชนยอด</div>
      <div className="page-sub">เทียบยอดขาย Order vs ยอดโอนจริงจาก Settlement</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {!data && !error ? <Loading /> : data && (
        <>
          {/* Primary KPIs */}
          {primary.length > 0 && (
            <div className="kpis">
              {primary.map(k => {
                const v = summary[k];
                const isDanger = (k === 'discrepancyCount' && typeof v === 'number' && v > 0)
                              || (k === 'varianceTotal'    && typeof v === 'number' && Math.abs(v) > 500);
                return (
                  <div key={k} className={'kpi' + (isDanger ? ' red' : k === 'matchedOrders' ? ' green' : '')}>
                    <div className="label">{LABEL[k] ?? k}</div>
                    <div className="value" style={{ fontSize: 18 }}>{fmtVal(k, v)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discrepancy alert banner */}
          {typeof summary.discrepancyCount === 'number' && summary.discrepancyCount > 0 && (
            <div className="alert error" style={{ marginBottom: 12 }}>
              ⚠️ พบ {fmt(summary.discrepancyCount)} ออเดอร์ที่มีส่วนต่าง
              {typeof summary.varianceTotal === 'number' && (
                <> · ส่วนต่างรวม <strong>{fmtMoney(summary.varianceTotal)}</strong></>
              )}
              {' '} — ตรวจสอบตารางด้านล่าง (แถวแดง = ส่วนต่างเกิน 500 บาท)
            </div>
          )}

          {/* GMV vs Settlement comparison cards */}
          {(summary.totalSaleGmv !== undefined || summary.totalSettlement !== undefined) && (
            <div className="card">
              <h3>เปรียบเทียบยอด</h3>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {[
                  { key: 'totalSaleGmv',   label: 'ยอดขาย (Order)',  color: '#2563eb' },
                  { key: 'totalSettlement', label: 'ยอดโอนจริง',     color: '#059669' },
                  { key: 'totalFee',        label: 'ค่าธรรมเนียม',   color: '#dc2626' },
                  { key: 'totalRefund',     label: 'Refund',          color: '#f59e0b' },
                  { key: 'varianceTotal',   label: 'ส่วนต่างสุทธิ',
                    color: Math.abs(summary.varianceTotal || 0) > 500 ? '#dc2626' : '#059669' },
                ].filter(item => item.key in summary).map(item => (
                  <div key={item.key} style={{ minWidth: 140 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>
                      {fmtMoney(summary[item.key])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Secondary KPIs (ถ้ามี) */}
          {secondary.length > 0 && (
            <div className="kpis">
              {secondary.map(([k, v]) => (
                <div key={k} className="kpi">
                  <div className="label">{LABEL[k] ?? k}</div>
                  <div className="value" style={{ fontSize: 15 }}>{fmtVal(k, v)}</div>
                </div>
              ))}
            </div>
          )}

          {/* No-data state */}
          {primary.length === 0 && secondary.length === 0 && (
            <div className="alert info">ไม่มีข้อมูล summary — ลองกด โหลด อีกครั้ง หรือตรวจสอบ Supabase RPC</div>
          )}

          {/* Detail table */}
          {Array.isArray(rows) && rows.length > 0 && (
            <div className="card table-scroll">
              <h3>รายละเอียด ({fmt(rows.length)} แถว)</h3>
              <table className="data">
                <thead>
                  <tr>{Object.keys(rows[0]).map(k => <th key={k}>{LABEL[k] ?? k}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => {
                    const variance = varCol ? Math.abs(Number(r[varCol] || 0)) : 0;
                    const rowHighlight = varCol && variance > 500;
                    return (
                      <tr key={i} style={rowHighlight ? { background: '#fef2f2' } : {}}>
                        {Object.entries(r).map(([k, v], j) => {
                          const isVar  = k === varCol;
                          const isMoney = typeof v === 'number' && Math.abs(v) > 999;
                          const color  = isVar && Math.abs(Number(v || 0)) > 500 ? '#dc2626'
                                       : isVar ? '#059669' : undefined;
                          return (
                            <td key={j} className={typeof v === 'number' ? 'num' : ''}
                              style={color ? { color, fontWeight: 600 } : {}}>
                              {typeof v === 'number'
                                ? (isMoney ? fmtMoney(v) : fmt(v, 2))
                                : String(v ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 200 && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                  แสดง 200 จาก {fmt(rows.length)} แถว
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {(!Array.isArray(rows) || rows.length === 0) && typeof summary.checkedOrders === 'number' && summary.checkedOrders === 0 && (
            <div className="alert info">
              ยังไม่มีข้อมูล Settlement ในช่วงนี้ — ต้องอัปโหลดไฟล์ Settlement ก่อน
            </div>
          )}
        </>
      )}
    </div>
  );
}
