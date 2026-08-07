import React, { useEffect, useState } from 'react';
import { apiGet, fmtMoney, fmt } from '../api.js';
import { DateRange, useDateRange, Alert, Loading } from '../components/ui.jsx';

/* แถบแสดงผล platform section */
function PlatformCard({ title, color, gmv, netSettle, fee, rows, extra }) {
  const diff = gmv - netSettle - fee;
  const feeRate = gmv > 0 ? (fee / gmv) * 100 : 0;
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}`, marginBottom: 16 }}>
      <h3 style={{ color, marginBottom: 12 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <Stat label="GMV / ยอดขาย" value={fmtMoney(gmv)} />
        <Stat label="ยอดโอนจริง (Net)" value={fmtMoney(netSettle)} color="#059669" />
        <Stat label="ค่าธรรมเนียมแพลตฟอร์ม" value={fmtMoney(fee)} color="#dc2626"
          sub={`${feeRate.toFixed(1)}% ของ GMV`} />
        <Stat label="ส่วนต่าง (Refund/Pending)" value={fmtMoney(diff)}
          color={Math.abs(diff) < 1000 ? '#059669' : '#f59e0b'}
          sub={rows ? `${fmt(rows)} แถว Settlement` : undefined} />
        {extra}
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

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

  const s = data?.summary || {};

  return (
    <div>
      <div className="page-title">ชนยอด Settlement</div>
      <div className="page-sub">เทียบ GMV (ยอดขาย) กับยอดโอนจริงจาก Settlement ของแต่ละแพลตฟอร์ม</div>
      <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} onLoad={load} busy={busy} />
      <Alert type="error">{error}</Alert>

      {!data && !error ? <Loading /> : data && (
        <>
          {/* KPI รวม */}
          <div className="kpis" style={{ marginBottom: 24 }}>
            <div className="kpi">
              <div className="label">GMV รวมทุกช่องทาง</div>
              <div className="value">{fmtMoney(s.totalGmv)}</div>
            </div>
            <div className="kpi green">
              <div className="label">ยอดโอนจริงรวม</div>
              <div className="value">{fmtMoney(s.totalNetReceived)}</div>
            </div>
            <div className="kpi red">
              <div className="label">ค่าธรรมเนียมรวม</div>
              <div className="value">{fmtMoney(s.totalPlatformFee)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.feeRate?.toFixed(1)}% ของ GMV</div>
            </div>
            <div className="kpi" style={{ borderColor: Math.abs(s.gmvVsNet || 0) < 5000 ? '#059669' : '#f59e0b' }}>
              <div className="label">ส่วนต่างสุทธิ</div>
              <div className="value" style={{ color: Math.abs(s.gmvVsNet || 0) < 5000 ? '#059669' : '#f59e0b' }}>
                {fmtMoney(s.gmvVsNet)}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>GMV − Net − Fee</div>
            </div>
          </div>

          {/* TikTok */}
          {s.ttAnalyticsGmv !== undefined && (
            <PlatformCard
              title="TikTok Shop"
              color="#111827"
              gmv={s.ttAnalyticsGmv}
              netSettle={s.ttNetSettlement}
              fee={s.ttPlatformFee}
              rows={s.ttSettRows}
              extra={s.ttOrderGmv ? (
                <Stat label="Sale Order GMV" value={fmtMoney(s.ttOrderGmv)}
                  sub={`Δ ${fmtMoney(s.ttAnalyticsGmv - s.ttOrderGmv)} vs Analytics`} />
              ) : null}
            />
          )}

          {/* Shopee */}
          {s.shOrderGmv !== undefined && (
            <PlatformCard
              title="Shopee"
              color="#f4511e"
              gmv={s.shOrderGmv}
              netSettle={s.shNetSettlement}
              fee={s.shPlatformFee}
              rows={s.shSettRows}
            />
          )}

          {/* Note */}
          {data.note && (
            <div className="alert info" style={{ marginTop: 8, fontSize: 12 }}>
              ℹ️ {data.note}
            </div>
          )}
        </>
      )}
    </div>
  );
}
