import React, { useState } from 'react';
import { fmt, fmtMoney, fmtPct } from '../api.js';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

export { Bar, Line, Doughnut };

export function Kpi({ label, value, tone = '', format = 'money' }) {
  const text = format === 'money' ? fmtMoney(value)
    : format === 'pct' ? fmtPct(value)
    : format === 'num' ? fmt(value)
    : format === 'x' ? fmt(value, 2) + 'x'
    : value;
  return (
    <div className={'kpi ' + tone}>
      <div className="label">{label}</div>
      <div className="value">{text}</div>
    </div>
  );
}

// แถบเลือกช่วงวันที่ + preset (เดือนนี้ / 30 วัน / เดือนก่อน)
// ใช้ local time เสมอ (ป้องกัน UTC+7 shift)
const localIso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export function DateRange({ start, end, setStart, setEnd, onLoad, busy, children }) {
  function preset(kind) {
    const now = new Date();
    if (kind === 'month') {
      // เดือนนี้ = วันแรก ถึง วันสุดท้ายของเดือนปฏิทิน (ไม่ใช่วันนี้)
      setStart(localIso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEnd(localIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (kind === '30') {
      const d29 = new Date(now); d29.setDate(d29.getDate() - 29);
      setStart(localIso(d29));
      setEnd(localIso(now));
    } else if (kind === 'prev') {
      setStart(localIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEnd(localIso(new Date(now.getFullYear(), now.getMonth(), 0)));
    }
  }
  return (
    <div className="toolbar">
      <label>เริ่ม<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button className="btn btn-ghost btn-sm" onClick={() => preset('month')}>เดือนนี้</button>
      <button className="btn btn-ghost btn-sm" onClick={() => preset('30')}>30 วัน</button>
      <button className="btn btn-ghost btn-sm" onClick={() => preset('prev')}>เดือนก่อน</button>
      {children}
      <button className="btn btn-primary" onClick={onLoad} disabled={busy}>
        {busy ? 'กำลังโหลด...' : 'แสดงข้อมูล'}
      </button>
    </div>
  );
}

// ค่าเริ่มต้นของช่วงวันที่ทุกหน้า — แก้ตรงนี้ที่เดียว
const DEFAULT_START = '2026-01-01';

export function useDateRange() {
  const now = new Date();
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(localIso(now));
  return { start, end, setStart, setEnd };
}

export function Alert({ type = 'info', children }) {
  return children ? <div className={'alert ' + type}>{children}</div> : null;
}

export function Loading() {
  return <div className="loading">กำลังโหลดข้อมูล...</div>;
}
