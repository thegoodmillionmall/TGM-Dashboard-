import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { DateRange, useDateRange, Alert, Loading } from '../components/ui.jsx';

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
  const rows = data?.rows || data?.daily || [];

  return (
    <div>
      <div className="page-title">ตรวจสอบชนยอด (Reconciliation)</div>
      <div className="page-sub">เทียบยอดขายกับยอดโอนจริงจาก Settlement</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          <div className="kpis">
            {Object.entries(summary).map(([k, v]) => (
              <div className="kpi" key={k}>
                <div className="label">{k}</div>
                <div className="value" style={{ fontSize: 16 }}>
                  {typeof v === 'number' ? (Math.abs(v) > 999 ? fmtMoney(v) : fmt(v, 2)) : String(v)}
                </div>
              </div>
            ))}
          </div>
          {Array.isArray(rows) && rows.length > 0 && (
            <div className="card table-scroll">
              <table className="data">
                <thead><tr>{Object.keys(rows[0]).map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      {Object.values(r).map((v, j) => (
                        <td key={j} className={typeof v === 'number' ? 'num' : ''}>
                          {typeof v === 'number' ? fmt(v, 2) : String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
