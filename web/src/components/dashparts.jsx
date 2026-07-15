import React, { useState } from 'react';
import { fmtMoney, fmtPct, fmt } from '../api.js';

// ---------- Audit modal (พอร์ตจาก showAudit ใน Index.html) ----------
export function useAuditModal(data) {
  const [auditKey, setAuditKey] = useState(null);
  const a = data?.audit;
  const s = data?.summary || {};

  const MAP = a ? {
    rev: {
      title: 'ที่มา: ยอดขายรวม (Gross Revenue)',
      rows: [
        ['TikTok Analytics GMV', a.rev.tt],
        ['Shopee Orders GMV', a.rev.sh],
        ['Modern Trade', a.rev.mt],
        ['Manual Income', a.manual.income]
      ],
      total: s.revenue
    },
    deduct: {
      title: 'ที่มา: หักแพลตฟอร์ม (Deductions)',
      rows: [
        ['TikTok Fees (Settlement)', a.deduct.ttFees],
        ['TikTok Affiliate', a.deduct.ttAff],
        ['Shopee Fees (Settlement)', a.deduct.shFees],
        ['Shopee Affiliate', a.deduct.shAff],
        ['Modern Trade GP', a.deduct.mtGp],
        ['Manual Deduction', a.manual.deduction]
      ],
      total: s.deductions
    },
    ads: {
      title: 'ที่มา: ค่าโฆษณา (Ads Spend)',
      rows: [
        ['TikTok Ads Manager', a.ads.ttManager],
        ['TikTok Ads GMV', a.ads.ttGmv],
        ['TikTok Ads Live', a.ads.ttLive],
        ['Shopee Ads', a.ads.shAds],
        ['Shopee Ads Live', a.ads.shLive],
        ['Meta Ads', a.ads.meta],
        ['Manual (ลง Ads)', a.manual.ads]
      ],
      total: s.ads
    },
    profit: {
      title: 'กำไรขั้นต้น = ยอดขาย − หักแพลตฟอร์ม − ค่าโฆษณา',
      rows: [
        ['ยอดขายรวม', s.revenue],
        ['หักแพลตฟอร์ม', -s.deductions],
        ['ค่าโฆษณา', -s.ads]
      ],
      total: s.profit
    },
    cogs: {
      title: 'ที่มา: ต้นทุนสินค้า (COGS)',
      rows: [['Manual (ลง COGS)', a.manual.cogs], ['COGS ตามระบบ', s.cogs - a.manual.cogs]],
      total: s.cogs
    },
    netIncome: {
      title: 'กำไรสุทธิ = กำไรขั้นต้น − COGS',
      rows: [['กำไรขั้นต้น', s.profit], ['COGS', -s.cogs]],
      total: s.netIncome
    }
  } : {};

  const modal = auditKey && MAP[auditKey] ? (
    <div className="modal-back" onClick={() => setAuditKey(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{MAP[auditKey].title}</h3>
        <table className="data">
          <tbody>
            {MAP[auditKey].rows.map(([label, val], i) => (
              <tr key={i}><td>{label}</td><td className="num">{fmtMoney(val)}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td>รวม</td><td className="num">{fmtMoney(MAP[auditKey].total)}</td></tr>
          </tbody>
        </table>
        <button className="btn btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => setAuditKey(null)}>ปิด</button>
      </div>
    </div>
  ) : null;

  return { showAudit: setAuditKey, modal };
}

// ---------- โครงสร้างกำไร (finance flow) ----------
export function FinanceFlow({ summary, onAudit }) {
  const s = summary || {};
  return (
    <div className="card">
      <h3>สรุปโครงสร้างกำไร <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 12 }}>👆 กดที่กล่องเพื่อดูที่มาของตัวเลข</span></h3>
      <div className="fin-flow">
        <div className="fin-step fin-rev" onClick={() => onAudit('rev')}><h5>ยอดขายรวม<br/>(Gross Revenue)</h5><p>{fmtMoney(s.revenue)}</p></div>
        <div className="fin-op">−</div>
        <div className="fin-step fin-deduct" onClick={() => onAudit('deduct')}><h5>หัก แพลตฟอร์ม<br/>(Deductions)</h5><p>{fmtMoney(s.deductions)}</p></div>
        <div className="fin-op">−</div>
        <div className="fin-step fin-ads" onClick={() => onAudit('ads')}><h5>หัก ค่าโฆษณา<br/>(Ads Spend)</h5><p>{fmtMoney(s.ads)}</p></div>
        <div className="fin-op">=</div>
        <div className="fin-step fin-profit" onClick={() => onAudit('profit')}><h5>กำไรขั้นต้น<br/>(Gross Profit)</h5><p>{fmtMoney(s.profit)}</p></div>
        <div className="fin-op">−</div>
        <div className="fin-step fin-cogs" onClick={() => onAudit('cogs')}><h5>หัก ต้นทุนสินค้า<br/>(COGS)</h5><p>{fmtMoney(s.cogs)}</p></div>
        <div className="fin-op">=</div>
        <div className="fin-step fin-net" onClick={() => onAudit('netIncome')}><h5>กำไรสุทธิบริษัท<br/>(Net Income)</h5><p>{fmtMoney(s.netIncome)}</p></div>
      </div>
    </div>
  );
}

// ---------- สรุปการเปลี่ยนแปลงรายเดือน ----------
export function MonthlyChangePanel({ charts }) {
  if (!charts || !charts.labels || charts.labels.length === 0) return null;
  const totals = charts.labels.map((label, i) =>
    ({ label, total: (charts.ttRev[i] || 0) + (charts.shRev[i] || 0) + (charts.mtRev[i] || 0) }));
  const last = totals[totals.length - 1];
  const prev = totals.length > 1 ? totals[totals.length - 2] : null;
  const diff = prev ? last.total - prev.total : 0;
  const pct = prev && prev.total ? (diff / prev.total) * 100 : 0;
  const up = diff >= 0;
  return (
    <div className="mc-panel">
      <div>
        <h3>สรุปการเปลี่ยนแปลงรายเดือน</h3>
        <div className="mc-sub">เทียบยอดขายรวมของเดือน {last.label} กับ {prev ? prev.label : '-'}</div>
        <div className="mc-value" style={{ color: up ? '#6ee7b7' : '#fca5a5' }}>
          {up ? '+' : ''}{fmtMoney(diff)}
        </div>
        <span className={'mc-pill ' + (up ? 'up' : 'down')}>{up ? '▲' : '▼'} {fmtPct(Math.abs(pct))}</span>
      </div>
      <div>
        <h3>ยอดรวมรายเดือน</h3>
        <div className="mc-grid">
          {totals.map((m, i) => {
            const p = i > 0 ? totals[i - 1].total : null;
            const d = p !== null ? m.total - p : null;
            return (
              <div className="mc-month" key={m.label}>
                {m.label}
                <b>{fmtMoney(m.total)}</b>
                {d !== null && (
                  <span className={'diff ' + (d >= 0 ? 'up' : 'down')}>
                    {d >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(d))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- source card ----------
export function SourceCard({ title, value, totalRev, note }) {
  const pct = totalRev > 0 ? (value / totalRev) * 100 : 0;
  return (
    <div className="source-card">
      <div className="t">{title}</div>
      <div className="v">{fmtMoney(value)}</div>
      <span className="pill">{fmtPct(pct)} ของยอดขาย</span>
      {note && <div className="t" style={{ marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ---------- ตารางรายวัน (พร้อมอัตรายกเลิก) ----------
export function DailyTable({ rows }) {
  return (
    <div className="card table-scroll">
      <h3>ตารางสรุปข้อมูลรายวัน</h3>
      <table className="data">
        <thead><tr>
          <th>วันที่</th><th className="num">ยอดขาย</th><th className="num">หักแพลตฟอร์ม</th>
          <th className="num">ค่าโฆษณา</th><th className="num">กำไรขั้นต้น</th>
          <th className="num">ออเดอร์</th><th className="num">อัตรายกเลิก</th>
        </tr></thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i}>
              <td>{r.month}</td>
              <td className="num">{fmtMoney(r.rev)}</td>
              <td className="num">{fmtMoney(r.deductions)}</td>
              <td className="num">{fmtMoney(r.ads)}</td>
              <td className="num" style={{ color: r.profit >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(r.profit)}</td>
              <td className="num">{fmt(r.orders)}</td>
              <td className="num">{fmtPct(r.cancelRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
