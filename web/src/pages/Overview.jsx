import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { apiGet, fmt, fmtMoney } from '../api.js';
import { MonthlyChangePanel } from '../components/dashparts.jsx';
import { Alert, Bar, Line, Loading } from '../components/ui.jsx';

// ─── Helpers ────────────────────────────────────────────────────────────────
const shortMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '฿' + (n / 1_000).toFixed(0) + 'K';
  return '฿' + fmt(n, 0);
};
const pct = v => fmt(v || 0, 2) + '%';
const roi = v => Number(v || 0) > 0 ? fmt(v, 2) + 'x' : '-';
const iso = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const monthValue = dateText => String(dateText || '').slice(0, 7);
const dayMs = 86400000;
const daysBetween = (a, b) => {
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 999;
  return Math.max(1, Math.round((end - start) / dayMs) + 1);
};
const paddedMax = (value, min = 1) => Math.max(min, Math.ceil(Number(value || 0) * 1.22));

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const today = new Date();
  return { start: iso(start), end: iso(end > today ? today : end) };
}
function previousMonthRange() {
  const now = new Date();
  return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}
function lastDaysRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  return { start: iso(start), end: iso(end) };
}
function rangeFromMonth(value) {
  if (!value) return monthRange();
  const [year, month] = value.split('-').map(Number);
  return monthRange(new Date(year, month - 1, 1));
}

const PERIODS = [
  { key: 'this-month', label: 'เดือนนี้', getRange: () => monthRange() },
  { key: 'last-month', label: 'เดือนก่อน', getRange: previousMonthRange },
  { key: '30-days', label: '30 วัน', getRange: () => lastDaysRange(30) },
  { key: 'year', label: 'ปีนี้', getRange: () => ({ start: `${new Date().getFullYear()}-01-01`, end: iso(new Date()) }) }
];
const PLATFORMS = [
  { value: 'All', label: 'ทุกช่องทาง' },
  { value: 'TikTok', label: 'TikTok' },
  { value: 'Shopee', label: 'Shopee' },
  { value: 'ModernTrade', label: 'Modern Trade' }
];
const THEMES = [
  { key: 'brief', label: 'Executive Brief', icon: '◼' },
  { key: 'deck',  label: 'Command Deck',    icon: '◈' },
  { key: 'tracker', label: 'Plan Tracker',  icon: '◉' },
];

const TH_MONTHS = {
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4,
  'พฤษภาคม': 5, 'มิถุนายน': 6, 'กรกฎาคม': 7, 'สิงหาคม': 8,
  'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12
};
const normalizeDate = value => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return text;
  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
};
const labelToIsoInRange = (label, start) => {
  const text = String(label || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return text;
  const year = match[3] || String(start || '').slice(0, 4) || String(new Date().getFullYear());
  return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
};
const monthKeyFromLabel = label => {
  const text = String(label || '').trim();
  const hit = text.match(/^(.+?)\s+(\d{4})$/);
  if (!hit) return '';
  const month = TH_MONTHS[hit[1].trim()];
  return month ? `${hit[2]}-${String(month).padStart(2, '0')}` : '';
};
const inDateRange = (value, start, end) => {
  const date = normalizeDate(value);
  return date >= start && date <= end;
};
const inMonthRange = (monthKey, start, end) => {
  if (!monthKey) return false;
  const monthStart = `${monthKey}-01`;
  const [year, month] = monthKey.split('-').map(Number);
  const monthEnd = iso(new Date(year, month, 0));
  return monthEnd >= start && monthStart <= end;
};
const shiftMonthKey = (monthKey, offset) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return '';
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// ─── Chart plugin ────────────────────────────────────────────────────────────
const valueLabelPlugin = {
  id: 'tgmValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11px Kanit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((point, index) => {
        const value = Number(dataset.data[index] || 0);
        if (!value) return;
        ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || '#1a2a3a';
        const label = dataset.label?.includes('ROI') ? roi(value) : shortMoney(value);
        ctx.fillText(label, point.x, point.y - 5);
      });
    });
    ctx.restore();
  }
};

// ─── Shared components ───────────────────────────────────────────────────────
function MetricCard({ label, value, sub, tone = 'default' }) {
  return (
    <div className={'exec-metric ' + tone}>
      <div className="exec-label">{label}</div>
      <div className="exec-value">{value}</div>
      {sub && <div className="exec-sub">{sub}</div>}
    </div>
  );
}

function PlatformTable({ rows, totalRevenue }) {
  return (
    <div className="card table-scroll exec-table-card">
      <h3>ตารางสรุปตามช่องทาง</h3>
      <table className="data exec-table">
        <thead>
          <tr>
            <th>ช่องทาง</th>
            <th className="num">ยอดขาย</th>
            <th className="num">ค่าโฆษณา</th>
            <th className="num">กำไรหลังโฆษณา</th>
            <th className="num">ROI เฉลี่ย</th>
            <th className="num">สัดส่วนยอดขาย</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name}>
              <td><b>{row.name}</b></td>
              <td className="num">{fmtMoney(row.revenue)}</td>
              <td className="num">{fmtMoney(row.ads)}</td>
              <td className="num" style={{ color: row.profitAfterAds >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                {fmtMoney(row.profitAfterAds)}
              </td>
              <td className="num" style={{ color: row.avgRoi >= 4 ? '#059669' : row.avgRoi > 0 ? '#dc2626' : '#6b7280', fontWeight: 700 }}>
                {roi(row.avgRoi)}
              </td>
              <td className="num">{pct(totalRevenue ? (row.revenue / totalRevenue) * 100 : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Theme 1a: Executive Brief ───────────────────────────────────────────────
function BriefView({ s, platformRows, chartRows, salesDatasets, executiveMonthlyCharts, salesAxisMax, chartModeLabel, useDailyChart }) {
  const roiGood = s.roas >= 3;
  return (
    <>
      {!roiGood && s.roas > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderLeft: '4px solid #f59e0b', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14, color: '#78350f' }}>
          ⚡ ROI {roi(s.roas)} — ต่ำกว่าเป้า 3x ควรทบทวนงบโฆษณา
        </div>
      )}
      <div className="exec-hero">
        <div>
          <div className="exec-hero-label">ยอดขายรวม</div>
          <div className="exec-hero-value">{fmtMoney(s.revenue)}</div>
          <div className="exec-hero-sub">ROI {roi(s.roas)} · ค่าแอด {fmtMoney(s.ads)}</div>
        </div>
        <div className="exec-hero-grid">
          <MetricCard label="ค่าโฆษณารวม"    value={fmtMoney(s.ads)}    tone="warning" />
          <MetricCard label="ROI รวม"         value={roi(s.roas)}        tone={roiGood ? 'good' : 'warning'} />
          <MetricCard label="กำไรหลังโฆษณา"  value={fmtMoney(s.profit)} tone={s.profit >= 0 ? 'good' : 'bad'} />
          <MetricCard label="จำนวนออเดอร์"   value={fmt(s.totalOrders)} sub={`ยกเลิก ${pct(s.cancelRate)} ของยอดขาย`} />
        </div>
      </div>

      {/* ── Metrics + ROI แยกช่องทาง (แถวเดียวกัน) ── */}
      <div className="exec-metrics-row">
        <MetricCard label="AOV"           value={fmtMoney(s.aov)} />
        <MetricCard label="Net Margin"    value={pct(s.netMargin)}   tone={s.netMargin >= 30 ? 'good' : 'warning'} />
        <MetricCard label="Ads / Revenue" value={pct(s.adsRate)}     tone={s.adsRate <= 25 ? 'good' : 'warning'} />
        <MetricCard label="กำไรสุทธิ"    value={fmtMoney(s.netIncome)} tone={s.netIncome >= 0 ? 'good' : 'bad'} sub="ดูต้นทุนเพิ่มที่หน้าบัญชี" />
        {platformRows.filter(r => r.revenue > 0 && r.ads > 0).map(row => {
          const r = row.avgRoi;
          const icon = row.name === 'TikTok Shop' ? '🎵' : row.name === 'Shopee' ? '🛒' : row.name === 'Facebook' ? '📘' : '🏪';
          return (
            <MetricCard key={row.name}
              label={`${icon} ROI ${row.name}`}
              value={roi(r)}
              tone={r >= 4 ? 'good' : r > 0 ? 'bad' : 'default'}
              sub={`แอด ${shortMoney(row.ads)} · กำไร ${shortMoney(row.profitAfterAds)}`}
            />
          );
        })}
      </div>

      <MonthlyChangePanel charts={executiveMonthlyCharts} />

      <div className="exec-grid">
        <div className="card exec-chart-card">
          <h3>ยอดขาย{chartModeLabel}ตามช่องทาง</h3>
          <Bar
            data={{ labels: chartRows.map(m => m.label), datasets: salesDatasets }}
            plugins={[valueLabelPlugin]}
            options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
              scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, max: salesAxisMax, ticks: { callback: shortMoney } } }
            }}
          />
        </div>
        <div className="card exec-chart-card">
          <h3>ยอดขายและค่าแอด{chartModeLabel}</h3>
          <Line
            data={{
              labels: chartRows.map(m => m.label),
              datasets: [
                { label: 'ยอดขายรวม', data: chartRows.map(m => m.revenue), borderColor: '#1a2a3a', backgroundColor: 'rgba(26,42,58,.10)', tension: .32, yAxisID: 'money', fill: true },
                { label: 'ค่าแอดรวม', data: chartRows.map(m => m.ads),     borderColor: '#f59e0b', backgroundColor: '#f59e0b',            tension: .28, yAxisID: 'money' }
              ]
            }}
            plugins={[valueLabelPlugin]}
            options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
              scales: {
                money: { type: 'linear', position: 'left', beginAtZero: true, max: salesAxisMax, ticks: { callback: shortMoney } }
              }
            }}
          />
        </div>
      </div>

      <PlatformTable rows={platformRows} totalRevenue={s.revenue} />

      <div className="card table-scroll exec-table-card">
        <h3>ตาราง{chartModeLabel}: ยอดขาย ค่าโฆษณา ROI</h3>
        <table className="data exec-table">
          <thead>
            <tr>
              <th>{useDailyChart ? 'วันที่' : 'เดือน'}</th>
              <th className="num">TikTok</th>
              <th className="num">Shopee</th>
              <th className="num">Modern Trade</th>
              <th className="num">ยอดขายรวม</th>
              <th className="num">Ads TikTok</th>
              <th className="num">Ads Shopee</th>
              <th className="num">Ads Facebook</th>
              <th className="num">ค่าโฆษณารวม</th>
              <th className="num" style={{ color: '#7DB9B9' }}>ROI TT</th>
              <th className="num" style={{ color: '#e98a4b' }}>ROI SP</th>
              <th className="num">ROI รวม</th>
            </tr>
          </thead>
          <tbody>
            {chartRows.map(row => {
              const ttRoi = row.tiktokAds > 0 ? row.tiktok / row.tiktokAds : 0;
              const shRoi = row.shopeeAds  > 0 ? row.shopee / row.shopeeAds  : 0;
              const roiCol = v => v >= 4 ? '#059669' : v > 0 ? '#dc2626' : '#9ca3af';
              return (
              <tr key={row.label}>
                <td><b>{row.label}</b></td>
                <td className="num">{fmtMoney(row.tiktok)}</td>
                <td className="num">{fmtMoney(row.shopee)}</td>
                <td className="num">{fmtMoney(row.mt)}</td>
                <td className="num"><b>{fmtMoney(row.revenue)}</b></td>
                <td className="num">{fmtMoney(row.tiktokAds)}</td>
                <td className="num">{fmtMoney(row.shopeeAds)}</td>
                <td className="num">{fmtMoney(row.facebookAds)}</td>
                <td className="num">{fmtMoney(row.ads)}</td>
                <td className="num" style={{ color: roiCol(ttRoi), fontWeight: 600 }}>{ttRoi > 0 ? roi(ttRoi) : '–'}</td>
                <td className="num" style={{ color: roiCol(shRoi), fontWeight: 600 }}>{shRoi > 0 ? roi(shRoi) : '–'}</td>
                <td className="num" style={{ color: roiCol(row.roi), fontWeight: 700 }}>{roi(row.roi)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Theme 1b: Command Deck (dark) ──────────────────────────────────────────
const D = {
  bg:      '#0d1926', bg2: '#132236', card: '#1a2f47', border: '#1e3a55',
  text:    '#c8dde9', muted: '#6a8fa8',
  mint:    '#B2D8D8', mint2: '#7DB9B9',
  green:   '#4ade80', greenBg: '#0d2318',
  yellow:  '#fbbf24', yellowBg: '#2a1e07',
  red:     '#f87171', redBg: '#2a0d0d',
};

function DeckView({ s, platformRows, chartRows, useDailyChart }) {
  const signal = roiVal => {
    if (roiVal <= 0)  return { color: D.muted,   bg: D.card,      label: '–' };
    if (roiVal >= 4)  return { color: D.green,   bg: D.greenBg,   label: 'ดี' };
    if (roiVal >= 3)  return { color: D.yellow,  bg: D.yellowBg,  label: 'เฝ้าระวัง' };
    return               { color: D.red,     bg: D.redBg,     label: 'ต่ำ' };
  };
  const tkSig  = signal(s.roas);
  const spSig  = signal(s.roas);
  const adsSig = s.adsRate <= 25
    ? { color: D.green,  bg: D.greenBg,  label: 'คุ้ม' }
    : s.adsRate <= 35
    ? { color: D.yellow, bg: D.yellowBg, label: 'สูง' }
    : { color: D.red,    bg: D.redBg,    label: 'เกิน' };

  const spRev = platformRows.find(r => r.name === 'Shopee')?.revenue || 0;

  return (
    <div style={{ background: D.bg, borderRadius: 12, padding: 24, color: D.text }}>

      {/* Signal row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'SIGNAL · TikTok', sig: tkSig,  note: `ROI ${roi(s.roas)}` },
          { label: 'SIGNAL · Shopee', sig: spSig,  note: `สัดส่วน ${pct(s.revenue > 0 ? spRev / s.revenue * 100 : 0)}` },
          { label: 'SIGNAL · Ads',    sig: adsSig, note: `Ads/Rev ${pct(s.adsRate)}` },
        ].map(({ label, sig, note }) => (
          <div key={label} style={{ background: sig.bg, border: `1px solid ${D.border}`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: sig.color }}>● {sig.label}</div>
            <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Hero numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'GMV รวม',        value: fmtMoney(s.revenue), color: D.mint },
          { label: 'ค่าโฆษณา',      value: fmtMoney(s.ads),     color: D.yellow },
          { label: 'ROI',            value: roi(s.roas),         color: s.roas >= 4 ? D.green : s.roas > 0 ? D.red : D.muted },
          { label: 'กำไรหลังแอด',   value: fmtMoney(s.profit),  color: s.profit >= 0 ? D.green : D.red },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: D.bg2, border: `1px solid ${D.border}`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: D.muted, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ background: D.bg2, border: `1px solid ${D.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: D.muted, marginBottom: 10 }}>ยอดขาย {useDailyChart ? 'รายวัน' : 'รายเดือน'}</div>
        <div style={{ height: 200 }}>
          <Bar
            data={{
              labels: chartRows.map(r => r.label),
              datasets: [{ label: 'ยอดขายรวม', data: chartRows.map(r => r.revenue), backgroundColor: D.mint2, borderColor: D.mint2 }]
            }}
            plugins={[valueLabelPlugin]}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtMoney(c.parsed.y) } } },
              scales: {
                x: { ticks: { color: D.muted }, grid: { color: D.border } },
                y: { beginAtZero: true, ticks: { color: D.muted, callback: shortMoney }, grid: { color: D.border } }
              }
            }}
          />
        </div>
      </div>

      {/* Secondary chart: sales + ads */}
      <div style={{ background: D.bg2, border: `1px solid ${D.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: D.muted, marginBottom: 10 }}>ยอดขาย & ค่าแอด</div>
        <div style={{ height: 160 }}>
          <Line
            data={{
              labels: chartRows.map(r => r.label),
              datasets: [
                { label: 'ยอดขายรวม', data: chartRows.map(r => r.revenue), borderColor: D.mint2, backgroundColor: 'rgba(125,185,185,.12)', tension: .3, fill: true, yAxisID: 'money' },
                { label: 'ค่าแอดรวม', data: chartRows.map(r => r.ads),     borderColor: D.yellow, backgroundColor: D.yellow, tension: .3, yAxisID: 'money', pointRadius: 3 }
              ]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom', labels: { color: D.muted, boxWidth: 12 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } } },
              scales: {
                money: { type: 'linear', position: 'left', beginAtZero: true, ticks: { color: D.muted, callback: shortMoney }, grid: { color: D.border } }
              }
            }}
          />
        </div>
      </div>

      {/* Platform table — dark */}
      <div style={{ background: D.bg2, border: `1px solid ${D.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${D.border}`, fontSize: 12, color: D.muted }}>สรุปตามช่องทาง</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: D.card }}>
              {['ช่องทาง', 'ยอดขาย', 'ค่าโฆษณา', 'กำไรหลังแอด', 'ROI เฉลี่ย', '%'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === 'ช่องทาง' ? 'left' : 'right', color: D.muted, fontWeight: 500, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {platformRows.map(row => (
              <tr key={row.name} style={{ borderTop: `1px solid ${D.border}` }}>
                <td style={{ padding: '8px 12px', color: D.mint, fontWeight: 600 }}>{row.name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: D.text }}>{fmtMoney(row.revenue)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: D.yellow }}>{fmtMoney(row.ads)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: row.profitAfterAds >= 0 ? D.green : D.red }}>{fmtMoney(row.profitAfterAds)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: row.avgRoi >= 4 ? D.green : row.avgRoi > 0 ? D.red : D.muted }}>{roi(row.avgRoi)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: D.muted }}>{pct(s.revenue ? (row.revenue / s.revenue) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Theme 1c: Plan Tracker ──────────────────────────────────────────────────
const CHANNEL_COLORS = { 'TikTok Shop': '#111827', 'Shopee': '#ef4b2b', 'Modern Trade': '#059669', 'Facebook': '#2563eb' };

function TrackerView({ s, platformRows, allMonthlySheetRows, activeStart, activeEnd, chartRows, useDailyChart }) {
  const avgRevenue = allMonthlySheetRows.length > 0
    ? allMonthlySheetRows.reduce((a, r) => a + Number(r.total || 0), 0) / allMonthlySheetRows.length : 0;
  const avgAds = allMonthlySheetRows.length > 0
    ? allMonthlySheetRows.reduce((a, r) => a + Number(r.totalAds || r.ads || 0), 0) / allMonthlySheetRows.length : 0;
  const prevRow = allMonthlySheetRows.length > 1 ? allMonthlySheetRows[allMonthlySheetRows.length - 2] : null;
  const prevRevenue = prevRow ? Number(prevRow.total || 0) : avgRevenue;
  const roiTarget = 4.0;

  const progBar = (label, fill, note, color) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
        <span style={{ color: '#1a2a3a', fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{note}</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${Math.max(2, Math.min(100, fill))}%`, height: '100%', borderRadius: 6, transition: 'width .5s' }} />
      </div>
    </div>
  );

  return (
    <>
      {/* Monthly history */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 500 }}>ประวัติรายเดือน</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allMonthlySheetRows.map(row => {
            const isActive = inMonthRange(row.monthKey, activeStart, activeEnd);
            const roiVal = Number(row.roi || 0);
            const dot = roiVal >= 4 ? '#059669' : roiVal > 0 ? '#dc2626' : '#9ca3af';
            return (
              <div key={row.monthKey} style={{
                padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: isActive ? 700 : 400,
                background: isActive ? '#1a2a3a' : '#f3f4f6',
                color:      isActive ? '#B2D8D8' : '#374151',
                border:     isActive ? '2px solid #7DB9B9' : '1px solid #e5e7eb',
              }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dot, marginRight: 5, verticalAlign: 'middle' }} />
                {row.month}{row.total ? ` · ${shortMoney(row.total)}` : ''}
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#1a2a3a', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#B2D8D8', marginBottom: 4 }}>ยอดขายรวม</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#B2D8D8' }}>{fmtMoney(s.revenue)}</div>
          <div style={{ fontSize: 11, color: '#7DB9B9', marginTop: 4 }}>ค่าแอด {fmtMoney(s.ads)}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#15803d', marginBottom: 4 }}>ROI รวม</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: s.roas >= 4 ? '#059669' : s.roas > 0 ? '#dc2626' : '#6b7280' }}>{roi(s.roas)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>เป้า {roiTarget}x</div>
        </div>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#c2410c', marginBottom: 4 }}>กำไรหลังโฆษณา</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: s.profit >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(s.profit)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Margin {pct(s.netMargin)}</div>
        </div>
      </div>

      {/* Progress bars */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2a3a', marginBottom: 14 }}>ตัวชี้วัดหลัก</div>
        {progBar(
          'ยอดขาย vs เดือนก่อน',
          prevRevenue > 0 ? (s.revenue / prevRevenue) * 100 : 50,
          `${fmtMoney(s.revenue)} / ${fmtMoney(prevRevenue)}`,
          '#7DB9B9'
        )}
        {progBar(
          'ค่าโฆษณา vs ค่าเฉลี่ย',
          avgAds > 0 ? (s.ads / avgAds) * 100 : 50,
          `${fmtMoney(s.ads)} / ${fmtMoney(avgAds)}`,
          '#f59e0b'
        )}
        {progBar(
          `ROI vs เป้า ${roiTarget}x`,
          (s.roas / roiTarget) * 100,
          `${roi(s.roas)} / ${roiTarget}x`,
          s.roas >= roiTarget ? '#059669' : s.roas >= 3 ? '#f59e0b' : '#dc2626'
        )}
        {progBar(
          'Ads/Revenue (เป้า ≤ 25%)',
          s.adsRate * 2,
          `${pct(s.adsRate)} / 25%`,
          s.adsRate <= 25 ? '#059669' : '#dc2626'
        )}
      </div>

      {/* Channel breakdown bars */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#1a2a3a' }}>สัดส่วนตามช่องทาง</div>
        {platformRows.filter(r => r.revenue > 0).map(row => {
          const pctVal = s.revenue > 0 ? (row.revenue / s.revenue) * 100 : 0;
          return (
            <div key={row.name} style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{row.name}</span>
                <span style={{ color: '#6b7280' }}>{fmtMoney(row.revenue)} · {pct(pctVal)}</span>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: 4, height: 7, overflow: 'hidden' }}>
                <div style={{ background: CHANNEL_COLORS[row.name] || '#9ca3af', width: `${pctVal}%`, height: '100%', borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary table */}
      <div className="card table-scroll exec-table-card">
        <h3>ตาราง{useDailyChart ? 'รายวัน' : 'รายเดือน'}: ยอดขาย ค่าโฆษณา ROI</h3>
        <table className="data exec-table">
          <thead>
            <tr>
              <th>{useDailyChart ? 'วันที่' : 'เดือน'}</th>
              <th className="num">ยอดขายรวม</th>
              <th className="num">ค่าโฆษณา</th>
              <th className="num">กำไรหลังแอด</th>
              <th className="num">ROI</th>
            </tr>
          </thead>
          <tbody>
            {chartRows.map(row => (
              <tr key={row.label}>
                <td><b>{row.label}</b></td>
                <td className="num">{fmtMoney(row.revenue)}</td>
                <td className="num">{fmtMoney(row.ads)}</td>
                <td className="num" style={{ color: (row.revenue - row.ads) >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>{fmtMoney(row.revenue - row.ads)}</td>
                <td className="num" style={{ color: row.roi >= 4 ? '#059669' : row.roi > 0 ? '#dc2626' : '#6b7280', fontWeight: 700 }}>{roi(row.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Theme switcher ──────────────────────────────────────────────────────────
function ThemeSwitcher({ theme, setTheme }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>มุมมอง</span>
      {THEMES.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => {
            setTheme(t.key);
            try { localStorage.setItem('tgm-view-theme', t.key); } catch {}
          }}
          style={{
            padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
            fontFamily: 'Kanit, sans-serif', fontWeight: theme === t.key ? 700 : 400,
            background: theme === t.key ? '#1a2a3a' : '#f3f4f6',
            color:      theme === t.key ? '#B2D8D8' : '#374151',
            transition: 'all .15s',
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Overview() {
  const initialRange = monthRange();
  const [start, setStart]               = useState(initialRange.start);
  const [end, setEnd]                   = useState(initialRange.end);
  const [period, setPeriod]             = useState('this-month');
  const [selectedMonth, setSelectedMonth] = useState(monthValue(initialRange.start));
  const [platform, setPlatform]         = useState('All');
  const [data, setData]                 = useState(null);
  const [error, setError]               = useState('');
  const [busy, setBusy]                 = useState(false);
  const [theme, setTheme]               = useState(() => {
    try { return localStorage.getItem('tgm-view-theme') || 'brief'; } catch { return 'brief'; }
  });
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef(null);

  async function load(next = {}) {
    const nextStart    = next.start    || start;
    const nextEnd      = next.end      || end;
    const nextPlatform = next.platform || platform;
    setBusy(true); setError('');
    try {
      const [sheet, ops, channel] = await Promise.all([
        apiGet('/gsheet/overview'),
        apiGet('/dashboard', { start: nextStart, end: nextEnd, platform: nextPlatform, subPlatform: 'All' }).catch(() => null),
        apiGet('/gsheet/channel-dashboard', { start: nextStart, end: nextEnd, platform: nextPlatform, subPlatform: 'All' }).catch(() => null)
      ]);
      setData({ ...sheet, ops, channel, activeStart: nextStart, activeEnd: nextEnd, activePlatform: nextPlatform });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  function applyPeriod(item) {
    const range = item.getRange();
    setPeriod(item.key); setStart(range.start); setEnd(range.end);
    setSelectedMonth(monthValue(range.start));
    load(range);
  }
  function applyMonth(value) {
    const range = rangeFromMonth(value);
    setPeriod('month'); setSelectedMonth(value); setStart(range.start); setEnd(range.end);
    load(range);
  }
  function applyPlatform(value) {
    setPlatform(value); load({ platform: value });
  }
  function applyCustomDates(nextStart, nextEnd) {
    setPeriod('custom'); setStart(nextStart); setEnd(nextEnd);
  }

  const activeStart    = data?.activeStart    || start;
  const activeEnd      = data?.activeEnd      || end;
  const activePlatform = data?.activePlatform || platform;

  const allMonthlySheetRows = (data?.monthly || [])
    .map(row => ({ ...row, monthKey: monthKeyFromLabel(row.month) }))
    .sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)));
  const monthlySheetRows = allMonthlySheetRows
    .filter(row => inMonthRange(row.monthKey, activeStart, activeEnd));
  const monthlyPanelRows = monthlySheetRows.length === 1
    ? [allMonthlySheetRows.find(row => row.monthKey === shiftMonthKey(monthlySheetRows[0].monthKey, -1)), monthlySheetRows[0]].filter(Boolean)
    : monthlySheetRows;
  const dailySheetRows = (data?.daily || [])
    .map(row => ({ ...row, dateKey: normalizeDate(row.date) }))
    .filter(row => inDateRange(row.date, activeStart, activeEnd));

  const executiveMonthlyCharts = {
    labels: monthlyPanelRows.map(row => row.month),
    ttRev:  monthlyPanelRows.map(row => Number(row.tiktok      || 0)),
    shRev:  monthlyPanelRows.map(row => Number(row.shopee      || 0)),
    fbRev:  monthlyPanelRows.map(row => Number(row.facebook    || 0)),
    mtRev:  monthlyPanelRows.map(row => Number(row.modernTrade || row.mt || 0))
  };

  // ใช้ GSheet channel (Shopee+TikTok tabs) เป็น primary source เพราะเจ้าของ update ทุกวัน
  // และ Shopee settlement ใน Supabase มีได้แค่ถึงกลางเดือน — ส่วน MT ดึงจาก local API เพิ่ม
  const _ch  = data?.channel?.dailyCharts;
  const _ops = data?.ops?.dailyCharts;
  const _base = (_ch?.labels?.length ? _ch : _ops);
  // _ops.labels ใช้ format '1/7', '2/7' แต่ _ch.labels ใช้ ISO '2026-07-01'
  // ต้อง normalize ให้ตรงกันก่อน lookup
  const _opsMt = new Map((_ops?.labels || []).map((l, i) => [labelToIsoInRange(l, activeStart), _ops.mtRev?.[i] || 0]));
  const detailDailyRows = (_base?.labels || []).map((label, index) => {
    const tiktok      = Number(_base.ttRev?.[index] || 0);
    const shopee      = Number(_base.shRev?.[index] || 0);
    const modernTrade = Number(_opsMt.get(label)    || 0);
    const ads         = Number(_base.ads?.[index]   || 0);
    const revenue     = tiktok + shopee + modernTrade;
    return { date: label, dateKey: labelToIsoInRange(label, activeStart), tiktok, shopee, facebook: 0, modernTrade, total: revenue, tiktokAds: 0, shopeeAds: 0, metaAds: 0, totalAds: ads, roi: ads > 0 ? revenue / ads : 0 };
  }).filter(row => row.total || row.totalAds);

  const useMonthlySummary = ['this-month', 'last-month', 'month', 'year'].includes(period);
  const summaryRows = monthlySheetRows.length && (useMonthlySummary || dailySheetRows.length === 0) ? monthlySheetRows : dailySheetRows;
  const sumField = (rows, field) => rows.reduce((acc, row) => acc + Number(row[field] || 0), 0);

  // MT: ดึงจากหลาย source (GSheet monthly → GSheet daily → API daily chart → API platformBreakdown)
  const gsheetMT = sumField(summaryRows, 'modernTrade') || sumField(summaryRows, 'mt')
                || sumField(dailySheetRows, 'modernTrade') || sumField(dailySheetRows, 'mt');
  const apiDailyMT  = sumField(detailDailyRows, 'modernTrade');
  // fallback สุดท้าย: platformBreakdown.modernTrade ตรงจาก /dashboard (ไม่ขึ้นกับ daily label format)
  const apiSummaryMT = Number(data?.ops?.platformBreakdown?.modernTrade || 0);
  const apiMT = gsheetMT ? 0 : (apiDailyMT || apiSummaryMT);
  const platformRevenue = {
    tiktok: sumField(summaryRows, 'tiktok'),
    shopee: sumField(summaryRows, 'shopee'),
    facebook: sumField(summaryRows, 'facebook'),
    total: sumField(summaryRows, 'total') + apiMT, // เพิ่ม MT จาก API เข้า total เมื่อ GSheet ไม่มี
    modernTrade: gsheetMT || apiMT
  };
  const platformAds = {
    tiktok: sumField(summaryRows, 'tiktokAds'),
    shopee: sumField(summaryRows, 'shopeeAds'),
    meta:   sumField(summaryRows, 'metaAds'),
    total:  sumField(summaryRows, 'totalAds'),
  };

  const selectedRevenue = activePlatform === 'TikTok' ? platformRevenue.tiktok
    : activePlatform === 'Shopee' ? platformRevenue.shopee
    : activePlatform === 'ModernTrade' ? platformRevenue.modernTrade
    : platformRevenue.total || (platformRevenue.tiktok + platformRevenue.shopee + platformRevenue.facebook + platformRevenue.modernTrade);
  const selectedAds = activePlatform === 'TikTok' ? platformAds.tiktok
    : activePlatform === 'Shopee' ? platformAds.shopee
    : activePlatform === 'ModernTrade' ? 0
    : platformAds.total || (platformAds.tiktok + platformAds.shopee + platformAds.meta);

  const opsSummary   = data?.channel?.summary || data?.ops?.summary || {};
  const totalOrders  = Number(opsSummary.totalOrders || 0);
  const s = {
    revenue:     selectedRevenue,
    ads:         selectedAds,
    profit:      selectedRevenue - selectedAds,
    netIncome:   selectedRevenue - selectedAds,
    roas:        selectedAds > 0 ? selectedRevenue / selectedAds : 0,
    adsRate:     selectedRevenue > 0 ? (selectedAds / selectedRevenue) * 100 : 0,
    netMargin:   selectedRevenue > 0 ? ((selectedRevenue - selectedAds) / selectedRevenue) * 100 : 0,
    totalOrders,
    soldItems:   Number(opsSummary.soldItems || 0),
    returnedItems: Number(opsSummary.returnedItems || 0),
    cancelRate:  Number(opsSummary.cancelRate || 0),
    aov:         totalOrders > 0 ? selectedRevenue / totalOrders : 0
  };

  const platformRows = useMemo(() => {
    const rows = [
      { name: 'TikTok Shop',  revenue: platformRevenue.tiktok,      ads: platformAds.tiktok, deductions: 0 },
      { name: 'Shopee',       revenue: platformRevenue.shopee,      ads: platformAds.shopee, deductions: 0 },
      { name: 'Facebook',     revenue: platformRevenue.facebook,    ads: platformAds.meta,   deductions: 0 },
      { name: 'Modern Trade', revenue: platformRevenue.modernTrade, ads: 0,                  deductions: 0 },
    ];
    const key = row => row.name === 'TikTok Shop' ? 'TikTok' : row.name === 'Modern Trade' ? 'ModernTrade' : row.name;
    return rows
      .filter(row => platform === 'All' || key(row) === platform)
      .filter(row => platform !== 'All' || row.revenue || row.ads || row.name !== 'Facebook')
      .map(row => ({
        ...row,
        profitAfterAds: row.revenue - row.ads - row.deductions,
        avgRoi: row.ads > 0 ? row.revenue / row.ads : 0
      }));
  }, [platformRevenue.tiktok, platformRevenue.shopee, platformRevenue.facebook, platformRevenue.modernTrade, platformAds.tiktok, platformAds.shopee, platformAds.meta, platform]);

  const wantsDailyChart   = daysBetween(activeStart, activeEnd) <= 45;
  const dailyRowsForChart = dailySheetRows.length ? dailySheetRows : detailDailyRows;
  const useDailyChart     = wantsDailyChart && dailyRowsForChart.length > 0;
  const showTikTok        = activePlatform === 'All' || activePlatform === 'TikTok';
  const showShopee        = activePlatform === 'All' || activePlatform === 'Shopee';
  const showFacebook      = activePlatform === 'All' || activePlatform === 'Facebook';
  const showModernTrade   = activePlatform === 'All' || activePlatform === 'ModernTrade';
  const chartModeLabel    = useDailyChart ? 'รายวัน' : 'รายเดือน';

  const chartRows = (useDailyChart ? dailyRowsForChart : monthlySheetRows).map(row => {
    const tiktok    = showTikTok       ? Number(row.tiktok || 0) : 0;
    const shopee    = showShopee       ? Number(row.shopee || 0) : 0;
    const facebook  = showFacebook     ? Number(row.facebook || 0) : 0;
    const mt        = showModernTrade  ? Number(row.modernTrade || row.mt || 0) : 0;
    const tiktokAds = showTikTok       ? Number(row.tiktokAds || 0) : 0;
    const shopeeAds = showShopee       ? Number(row.shopeeAds || 0) : 0;
    const facebookAds = showFacebook   ? Number(row.metaAds || 0) : 0;
    const rowAds    = Number(row.totalAds || 0);
    const ads       = activePlatform === 'All' ? rowAds : tiktokAds + shopeeAds + facebookAds;
    const revenue   = tiktok + shopee + facebook + mt;
    return { label: useDailyChart ? row.date : row.month, tiktok, shopee, facebook, mt, revenue, tiktokAds, shopeeAds, facebookAds, ads, roi: ads > 0 ? revenue / ads : 0 };
  });

  const salesDatasets = [
    { platform: 'TikTok',      label: 'TikTok',       data: chartRows.map(m => m.tiktok),  backgroundColor: '#111827', borderColor: '#111827', stack: 'sales' },
    { platform: 'Shopee',      label: 'Shopee',        data: chartRows.map(m => m.shopee),  backgroundColor: '#ef4b2b', borderColor: '#ef4b2b', stack: 'sales' },
    { platform: 'Facebook',    label: 'Facebook',      data: chartRows.map(m => m.facebook), backgroundColor: '#2563eb', borderColor: '#2563eb', stack: 'sales' },
    { platform: 'ModernTrade', label: 'Modern Trade',  data: chartRows.map(m => m.mt),      backgroundColor: '#059669', borderColor: '#059669', stack: 'sales' },
  ].filter(item => activePlatform === 'All' || item.platform === activePlatform);
  const salesAxisMax = paddedMax(Math.max(...chartRows.map(row => row.revenue), 0));

  /* ── Export ──────────────────────────────────────────────────────────────── */
  async function exportImage() {
    if (exporting || !pageRef.current) return;
    setExporting(true);
    let clone = null;
    try {
      await document.fonts.ready;

      const el = pageRef.current;

      /* 1. บันทึก pixel data ของทุก Chart.js canvas ก่อน clone
            (cloneNode ไม่ copy canvas pixels) */
      const origCanvases = Array.from(el.querySelectorAll('canvas'));
      const canvasDataURLs = origCanvases.map(c => {
        try { return c.toDataURL('image/png'); } catch { return null; }
      });

      /* 2. Clone element */
      clone = el.cloneNode(true);

      /* 3. วาง clone ตรง ๆ ไว้ใน body (หนีทุก overflow/clipping) */
      Object.assign(clone.style, {
        position:   'absolute',
        top:        '0px',
        left:       '0px',
        width:      Math.max(el.offsetWidth, 1200) + 'px',
        height:     'auto',
        maxHeight:  'none',
        overflow:   'visible',
        zIndex:     '-99999',
        background: '#f5f6fa',
        pointerEvents: 'none',
      });
      clone.querySelectorAll('button,.btn').forEach(b => { b.style.display = 'none'; });
      document.body.appendChild(clone);

      /* 4. Copy canvas pixels กลับเข้า clone */
      const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
      await Promise.all(origCanvases.map((orig, i) => new Promise(res => {
        const dst = cloneCanvases[i];
        const src = canvasDataURLs[i];
        if (!dst || !src) { res(); return; }
        dst.width  = orig.width;
        dst.height = orig.height;
        const img  = new Image();
        img.onload = () => { dst.getContext('2d').drawImage(img, 0, 0); res(); };
        img.onerror = res;
        img.src = src;
      })));

      await new Promise(r => setTimeout(r, 250)); // รอ render clone

      /* 5. Capture clone ที่ full height */
      const W = clone.scrollWidth;
      const H = clone.scrollHeight;
      const canvas = await html2canvas(clone, {
        scrollX: 0, scrollY: 0,
        width: W, height: H,
        windowWidth: W, windowHeight: H + 50,
        scale: 2,
        useCORS: true, allowTaint: true,
        logging: false,
        backgroundColor: '#f5f6fa',
        imageTimeout: 0,
      });

      document.body.removeChild(clone);
      clone = null;

      const link = document.createElement('a');
      link.download = `TGM_ภาพรวม_${activeStart}_${activeEnd}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();

    } catch (err) {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      alert('Export ภาพไม่สำเร็จ: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  function openPrintView() {
    // เปิดหน้า print-friendly ใน tab ใหม่ — ผู้ใช้กด Ctrl+P → Save as PDF/Image
    const w = window.open('', '_blank');
    const styles = Array.from(document.styleSheets)
      .map(ss => { try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; } })
      .join('\n');
    const body = pageRef.current ? pageRef.current.outerHTML : '<p>ไม่พบเนื้อหา</p>';
    w.document.write(`<!DOCTYPE html><html lang="th"><head>
      <meta charset="utf-8"/>
      <title>TGM ภาพรวม ${activeStart}–${activeEnd}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;700&display=swap" rel="stylesheet"/>
      <style>
        ${styles}
        body { margin: 0; padding: 16px; background: #f5f6fa; }
        .exec-page { max-height: none !important; overflow: visible !important; }
        @media print {
          body { padding: 0; }
          button, .btn { display: none !important; }
        }
      </style>
    </head><body>${body}<script>window.onload=()=>window.print();</script></body></html>`);
    w.document.close();
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    /* Sheet 1: สรุป KPI */
    const platLabel = activePlatform === 'All' ? 'ทุกช่องทาง' : activePlatform;
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['TGM BI Dashboard — ภาพรวมผู้บริหาร'],
      ['ช่วงวันที่', `${activeStart} ถึง ${activeEnd}`],
      ['ช่องทาง', platLabel],
      [],
      ['หัวข้อ', 'ค่า', 'หน่วย'],
      ['ยอดขายรวม',        s.revenue,   'บาท'],
      ['ค่าโฆษณารวม',      s.ads,       'บาท'],
      ['กำไรหลังโฆษณา',    s.profit,    'บาท'],
      ['ROI',              s.roas,      'x'],
      ['Net Margin',       s.netMargin, '%'],
      ['Ads/Revenue',      s.adsRate,   '%'],
      ['จำนวนออเดอร์',     s.totalOrders, 'ออเดอร์'],
      ['AOV',              s.aov,       'บาท/ออเดอร์'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, 'สรุป');

    /* Sheet 2: Platform breakdown */
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['แพลตฟอร์ม', 'ยอดขาย', 'ค่าโฆษณา', 'กำไรหลังโฆษณา', 'ROI เฉลี่ย'],
      ...platformRows.map(r => [r.name, r.revenue, r.ads, r.profitAfterAds, r.avgRoi || ''])
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, 'แพลตฟอร์ม');

    /* Sheet 3: รายเดือน */
    if (monthlySheetRows.length > 0) {
      const ws3 = XLSX.utils.aoa_to_sheet([
        ['เดือน', 'TikTok', 'Shopee', 'Facebook', 'Modern Trade', 'รวมยอดขาย', 'TikTok Ads', 'Shopee Ads', 'Meta Ads', 'รวมโฆษณา', 'ROI'],
        ...monthlySheetRows.map(r => [
          r.month,
          r.tiktok || 0, r.shopee || 0, r.facebook || 0, r.modernTrade || r.mt || 0,
          r.total || 0,
          r.tiktokAds || 0, r.shopeeAds || 0, r.metaAds || 0, r.totalAds || 0,
          r.roi || 0
        ])
      ]);
      XLSX.utils.book_append_sheet(wb, ws3, 'รายเดือน');
    }

    /* Sheet 4: รายวัน */
    const dailyToExport = (dailySheetRows.length ? dailySheetRows : detailDailyRows);
    if (dailyToExport.length > 0) {
      const ws4 = XLSX.utils.aoa_to_sheet([
        ['วันที่', 'TikTok', 'Shopee', 'Facebook', 'Modern Trade', 'รวมยอดขาย', 'โฆษณา', 'ROI'],
        ...dailyToExport.map(r => [
          r.date || r.dateKey,
          r.tiktok || 0, r.shopee || 0, r.facebook || 0, r.modernTrade || r.mt || 0,
          r.total || 0, r.totalAds || 0,
          r.totalAds > 0 ? r.total / r.totalAds : 0
        ])
      ]);
      XLSX.utils.book_append_sheet(wb, ws4, 'รายวัน');
    }

    XLSX.writeFile(wb, `TGM_ภาพรวม_${activeStart}_${activeEnd}.xlsx`);
  }

  return (
    <div className="exec-page" ref={pageRef}>
      {/* Header */}
      <div className="exec-head">
        <div>
          <div className="page-title">ภาพรวมผู้บริหาร</div>
          <div className="page-sub">ยอดขาย ค่าโฆษณา ROI</div>
        </div>
        <div className="exec-filters">
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่วงเวลา</div>
            <div className="exec-chip-row">
              {PERIODS.map(item => (
                <button key={item.key} type="button"
                  className={'exec-chip ' + (period === item.key ? 'active' : '')}
                  onClick={() => applyPeriod(item)} disabled={busy}>{item.label}</button>
              ))}
              <label className={'exec-month-picker ' + (period === 'month' ? 'active' : '')}>
                เลือกเดือน
                <input type="month" value={selectedMonth} onChange={e => applyMonth(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="exec-filter-block">
            <div className="exec-filter-title">ช่องทาง</div>
            <div className="exec-chip-row">
              {PLATFORMS.map(item => (
                <button key={item.value} type="button"
                  className={'exec-chip channel ' + (platform === item.value ? 'active' : '')}
                  onClick={() => applyPlatform(item.value)} disabled={busy}>{item.label}</button>
              ))}
            </div>
          </div>
          <div className="exec-custom-range">
            <label>เริ่ม<input type="date" value={start} onChange={e => applyCustomDates(e.target.value, end)} /></label>
            <label>ถึง<input  type="date" value={end}   onChange={e => applyCustomDates(start, e.target.value)} /></label>
            <button className="btn btn-primary" onClick={() => load()} disabled={busy}>{busy ? 'กำลังโหลด...' : 'แสดงข้อมูล'}</button>
          </div>
        </div>

        {/* Theme switcher + Export buttons */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <ThemeSwitcher theme={theme} setTheme={setTheme} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={exportImage}
              disabled={exporting || !data}
              title="บันทึกหน้านี้เป็นรูปภาพ PNG (2x resolution)"
              style={{ fontSize: 13, padding: '5px 14px' }}
            >
              {exporting ? '⏳ กำลัง render...' : '🖼 PNG'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={openPrintView}
              disabled={!data}
              title="เปิด print view → Ctrl+P → Save as PDF หรือ image"
              style={{ fontSize: 13, padding: '5px 14px' }}
            >
              🖨 Print / PDF
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={exportExcel}
              disabled={!data}
              title="ดาวน์โหลดข้อมูลตามฟิลเตอร์เป็น Excel"
              style={{ fontSize: 13, padding: '5px 14px' }}
            >
              📊 Excel
            </button>
          </div>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      {!data && !error ? <Loading /> : data && (
        <>
          {theme === 'brief' && (
            <BriefView
              s={s} platformRows={platformRows} chartRows={chartRows}
              salesDatasets={salesDatasets} executiveMonthlyCharts={executiveMonthlyCharts}
              salesAxisMax={salesAxisMax}
              chartModeLabel={chartModeLabel} useDailyChart={useDailyChart}
            />
          )}
          {theme === 'deck' && (
            <DeckView
              s={s} platformRows={platformRows} chartRows={chartRows}
              useDailyChart={useDailyChart}
            />
          )}
          {theme === 'tracker' && (
            <TrackerView
              s={s} platformRows={platformRows} allMonthlySheetRows={allMonthlySheetRows}
              activeStart={activeStart} activeEnd={activeEnd}
              chartRows={chartRows} useDailyChart={useDailyChart}
            />
          )}
        </>
      )}
    </div>
  );
}
