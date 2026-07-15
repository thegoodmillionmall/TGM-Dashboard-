import { useState, useCallback, useRef, useEffect } from 'react';
import { apiGet, apiPost, apiDelete } from '../api.js';

// ─── Product master (initial) ────────────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  { key: 'retox',     label: 'Retox',         cost: 52,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 52,    price: 199 }] },
  { key: 'boostdrop', label: 'Boostdrop',     cost: 40,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 40,    price: 199 }] },
  { key: 'keraglow',  label: 'Keraglow',      cost: 40,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 40,    price: 199 }] },
  { key: 'p-old',     label: 'พัฟ(เก่า)',     cost: 28.58, price: 199, priceHistory: [{ from: '1/1/2026', cost: 28.58, price: 199 }] },
  { key: 'p-green',   label: 'พัฟเขียวใหม่', cost: 24,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 24,    price: 199 }] },
  { key: 'p-pink',    label: 'พัฟชมพู',      cost: 24,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 24,    price: 199 }] },
  { key: 'p-blue',    label: 'พัฟฟ้า',       cost: 24,    price: 199, priceHistory: [{ from: '1/1/2026', cost: 24,    price: 199 }] },
  { key: 'limited',   label: 'Limited SET',   cost: 72,    price: 399, priceHistory: [{ from: '1/1/2026', cost: 72,    price: 399 }] },
  { key: 'comb',      label: 'หวี',           cost: 26,    price: 79,  priceHistory: [{ from: '1/1/2026', cost: 26,    price: 79  }] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseDate(s) { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); }
function todayStr()   { const n = new Date(); return `${n.getDate()}/${n.getMonth() + 1}/${n.getFullYear()}`; }

function getPriceForDate(product, dateStr) {
  const target = parseDate(dateStr);
  const sorted = (product.priceHistory || [])
    .filter(h => parseDate(h.from) <= target)
    .sort((a, b) => parseDate(b.from) - parseDate(a.from));
  return sorted.length ? { cost: sorted[0].cost, price: sorted[0].price } : { cost: product.cost, price: product.price };
}

function matchProduct(name) {
  const n = name.toLowerCase();
  if (n.includes('retox'))                                             return 'retox';
  if (n.includes('boostdrop'))                                         return 'boostdrop';
  if (n.includes('keraglow'))                                          return 'keraglow';
  if (n.includes('พัฟ') && n.includes('เก่า'))                       return 'p-old';
  if (n.includes('พัฟ') && n.includes('เขียว'))                      return 'p-green';
  if (n.includes('พัฟ') && n.includes('ชมพู'))                       return 'p-pink';
  if (n.includes('พัฟ') && (n.includes('ฟ้า') || n.includes('ฟา'))) return 'p-blue';
  if (n.includes('limited') || n.includes('set'))                      return 'limited';
  if (n.includes('หวี'))                                               return 'comb';
  return null;
}

function parseMsg(txt) {
  const lines = txt.trim().split('\n');
  let date = null, cmpDate = null;
  const items = [];
  for (const line of lines) {
    const t = line.trim();
    const dm = t.match(/สต(?:๊)?อกวันที่\s*(\d+)\/(\d+)\/(\d+)(?:[^0-9]*(\d+)\/(\d+)\/(\d+))?/);
    if (dm) {
      date = `${parseInt(dm[1])}/${parseInt(dm[2])}/${parseInt(dm[3]) - 543}`;
      if (dm[4]) cmpDate = `${parseInt(dm[4])}/${parseInt(dm[5])}/${parseInt(dm[6]) - 543}`;
      continue;
    }
    if (/รวม.*ชิ้น/.test(t) || t.startsWith('✅')) continue;
    const pm = t.match(/(.+?):\s*([\d,]+)\s*[➝→>]\s*(ลดลง|เพิ่มขึ้น)\s*([\d,]+)\s*ชิ้น/);
    if (pm) {
      const raw    = pm[1].replace(/[^\w฀-๿()\s]/g, '').trim();
      const stock  = parseInt(pm[2].replace(/,/g, ''));
      const change = parseInt(pm[4].replace(/,/g, ''));
      const dec    = pm[3] === 'ลดลง';
      const key    = matchProduct(raw);
      if (key) items.push({ key, label: raw, stock, change, dec });
    }
  }
  return { date, cmpDate, items };
}

function fmt(n, d = 0) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function sortByDate(arr) {
  return [...arr].sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function calcDay(data, products) {
  let totalStock = 0, totalCost = 0, totalValue = 0;
  let dUnits = 0, dCogs = 0, dRev = 0;
  let rUnits = 0, rCogs = 0, rRev = 0;
  for (const item of data.items) {
    const p   = products.find(p => p.key === item.key);
    const cfg = p ? getPriceForDate(p, data.date) : { cost: 0, price: 0 };
    totalStock += item.stock;
    totalCost  += item.stock * cfg.cost;
    totalValue += item.stock * cfg.price;
    if (item.dec) {
      dUnits += item.change; dCogs += item.change * cfg.cost; dRev += item.change * cfg.price;
    } else if (item.change > 0) {
      rUnits += item.change; rCogs += item.change * cfg.cost; rRev += item.change * cfg.price;
    }
  }
  return { totalStock, totalCost, totalValue, dUnits, dCogs, dRev, rUnits, rCogs, rRev };
}

// ─── Style constants ──────────────────────────────────────────────────────────
const BORDER  = '1px solid #b4c8c8';
const tdStyle = { padding: '5px 8px', border: BORDER, color: 'var(--text-main)', fontSize: 12 };
const tdNum   = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const thStyle = (left) => ({ padding: '5px 8px', border: BORDER, fontWeight: 700, color: '#3a5a5a', background: '#e8f4f4', textAlign: left ? 'left' : 'right', fontSize: 12 });

// ─── html2canvas helper ───────────────────────────────────────────────────────
function exportElem(elem, filename, onDone) {
  function doExport(h2c) {
    h2c(elem, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      .then(canvas => {
        const a = document.createElement('a');
        a.download = filename; a.href = canvas.toDataURL('image/png'); a.click();
        onDone(false);
      }).catch(() => onDone(false));
  }
  if (window.html2canvas) { doExport(window.html2canvas); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.onload = () => doExport(window.html2canvas);
  s.onerror = () => onDone(false);
  document.head.appendChild(s);
}

// ─── DayTable ─────────────────────────────────────────────────────────────────
function DayTable({ data, products }) {
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  let totalStock = 0, totalCost = 0, totalValue = 0;
  let dUnits = 0, dCogs = 0, dRev = 0;   // ขายออก (ลดลง)
  let rUnits = 0, rCogs = 0, rRev = 0;   // คืนสต็อก (เพิ่มขึ้น)
  const rows = data.items.map(item => {
    const p   = products.find(pr => pr.key === item.key);
    const cfg = p ? getPriceForDate(p, data.date) : { cost: 0, price: 0 };
    const ct  = item.stock * cfg.cost, vt = item.stock * cfg.price;
    totalStock += item.stock; totalCost += ct; totalValue += vt;
    if (item.dec) {
      dUnits += item.change; dCogs += item.change * cfg.cost; dRev += item.change * cfg.price;
    } else if (item.change > 0) {
      // สต็อกเพิ่มขึ้น = คืนสินค้า / รับของเพิ่ม
      rUnits += item.change; rCogs += item.change * cfg.cost; rRev += item.change * cfg.price;
    }
    return { item, cfg, ct, vt };
  });

  return (
    <div ref={cardRef} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ background: '#d4ecec', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#2a5a5a' }}>
          วันที่ {data.date}
          {data.cmpDate && <span style={{ fontWeight: 400, fontSize: 12, opacity: .7 }}> (เทียบ {data.cmpDate})</span>}
        </span>
        <button onClick={() => { setSaving(true); exportElem(cardRef.current, `stock_${data.date.replace(/\//g, '-')}.png`, setSaving); }}
          disabled={saving}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #7aacac', background: 'white', color: '#3a7a7a', cursor: saving ? 'wait' : 'pointer', opacity: saving ? .6 : 1 }}>
          {saving ? '⏳...' : '📷 บันทึกรูป'}
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['สินค้า', 'ทุน', 'ราคาขาย', 'คงเหลือ', 'ทุนรวม', 'ยอดขาย'].map((h, i) => (
                <th key={h} style={thStyle(i === 0)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, cfg, ct, vt }, ri) => (
              <tr key={item.key} style={{ background: ri % 2 === 1 ? '#f7fbfb' : 'white' }}>
                <td style={tdStyle}>{item.label}</td>
                <td style={tdNum}>{fmt(cfg.cost, cfg.cost % 1 ? 2 : 0)}</td>
                <td style={tdNum}>{fmt(cfg.price)}</td>
                <td style={tdNum}>{fmt(item.stock)}</td>
                <td style={tdNum}>{fmt(ct, ct % 1 ? 2 : 0)}</td>
                <td style={tdNum}>{fmt(vt)}</td>
              </tr>
            ))}
            <tr style={{ background: '#e8f4f4', fontWeight: 700 }}>
              <td colSpan={3} style={{ ...tdStyle, fontWeight: 700 }}>Total</td>
              <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalStock)}</td>
              <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalCost, totalCost % 1 ? 2 : 0)}</td>
              <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalValue)}</td>
            </tr>
            {dUnits > 0 && (
              <tr style={{ background: '#fffbe6' }}>
                <td colSpan={3} style={{ ...tdStyle, color: '#7a5c00', fontWeight: 600 }}>📦 ขายออกวันนี้</td>
                <td style={{ ...tdNum, color: '#7a5c00', fontWeight: 600 }}>{fmt(dUnits)}</td>
                <td style={{ ...tdNum, color: '#7a5c00', fontWeight: 600 }}>{fmt(dCogs, dCogs % 1 ? 2 : 0)}</td>
                <td style={{ ...tdNum, color: '#7a5c00', fontWeight: 600 }}>{fmt(dRev)}</td>
              </tr>
            )}
            {rUnits > 0 && (
              <tr style={{ background: '#f0fdf4' }}>
                <td colSpan={3} style={{ ...tdStyle, color: '#15803d', fontWeight: 600 }}>🔄 คืนสต็อก / รับเพิ่ม</td>
                <td style={{ ...tdNum, color: '#15803d', fontWeight: 600 }}>+{fmt(rUnits)}</td>
                <td style={{ ...tdNum, color: '#15803d', fontWeight: 600 }}>{fmt(rCogs, rCogs % 1 ? 2 : 0)}</td>
                <td style={{ ...tdNum, color: '#15803d', fontWeight: 600 }}>{fmt(rRev)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SummaryPanel ─────────────────────────────────────────────────────────────
function SummaryPanel({ history, products }) {
  const panelRef  = useRef(null);
  const sumRef    = useRef(null);
  const [saving,    setSaving]    = useState(false);
  const [sumSaving, setSumSaving] = useState(false);
  const [sumFilter, setSumFilter] = useState('all'); // 'all' | '7d' | '30d' | 'MM/YYYY'

  if (!history.length) return null;

  const latest  = history[history.length - 1];
  const latestC = calcDay(latest, products);
  const thS = (left) => ({ padding: '5px 7px', border: BORDER, fontWeight: 700, color: '#3a5a5a', background: '#e8f4f4', textAlign: left ? 'left' : 'right', whiteSpace: 'pre-line', lineHeight: 1.3, fontSize: 11 });

  // unique months oldest → newest
  const months = [...new Set(history.map(d => monthKey(d.date)))].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number), [mb, yb] = b.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });

  // filtered history for the summary table
  const filteredHist = (() => {
    if (sumFilter === 'all') return history;
    if (sumFilter === '7d') {
      const cut = new Date(); cut.setDate(cut.getDate() - 7);
      return history.filter(d => parseDate(d.date) >= cut);
    }
    if (sumFilter === '30d') {
      const cut = new Date(); cut.setDate(cut.getDate() - 30);
      return history.filter(d => parseDate(d.date) >= cut);
    }
    return history.filter(d => monthKey(d.date) === sumFilter);
  })();

  const chipStyle = (active) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer', border: '1px solid',
    background:  active ? '#7DB9B9' : 'white',
    color:       active ? 'white'   : '#3a7a7a',
    borderColor: '#9ab8b8', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
  });

  return (
    <div ref={panelRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'transparent' }}>
      <div className="card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#2a5a5a' }}>ล่าสุด: {latest.date}</span>
          <button onClick={() => { setSaving(true); exportElem(panelRef.current, `stock_summary_${latest.date.replace(/\//g, '-')}.png`, setSaving); }}
            disabled={saving}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #9ab8b8', background: 'white', color: '#3a7a7a', cursor: saving ? 'wait' : 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? '⏳...' : '📷 บันทึกรูป'}
          </button>
        </div>
        {[
          { label: 'คงเหลือ',         value: fmt(latestC.totalStock) + ' ชิ้น',                             color: 'var(--mint)' },
          { label: 'ต้นทุนสต็อก',     value: '฿' + fmt(latestC.totalCost, latestC.totalCost % 1 ? 2 : 0),  color: '#7DB9B9' },
          { label: 'มูลค่าถ้าขายหมด', value: '฿' + fmt(latestC.totalValue),                                color: '#1a2a3a' },
          { label: 'ขายออกวันนี้',    value: fmt(latestC.dUnits) + ' ชิ้น',                                color: '#f59e0b' },
          { label: 'COGS ที่ขาย',     value: '฿' + fmt(latestC.dCogs, latestC.dCogs % 1 ? 2 : 0),          color: '#ef4444' },
          { label: 'รายได้จากขาย',   value: '฿' + fmt(latestC.dRev),                                      color: '#22c55e' },
        ].map(k => (
          <div key={k.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: BORDER }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</span>
          </div>
        ))}
      </div>

      {history.length > 1 && (
        <div ref={sumRef} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* header row */}
          <div style={{ padding: '7px 12px', background: '#e8f4f4', borderBottom: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3a5a5a' }}>
              สรุปรายวัน ({filteredHist.length}{filteredHist.length !== history.length ? `/${history.length}` : ''} วัน)
            </span>
            <button
              onClick={() => { setSumSaving(true); exportElem(sumRef.current, `stock_summary_table_${latest.date.replace(/\//g, '-')}.png`, setSumSaving); }}
              disabled={sumSaving}
              style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid #9ab8b8', background: 'white', color: '#3a7a7a', cursor: sumSaving ? 'wait' : 'pointer', opacity: sumSaving ? .6 : 1 }}>
              {sumSaving ? '⏳...' : '📷'}
            </button>
          </div>

          {/* filter chips */}
          <div style={{ padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: BORDER, background: '#f7fbfb' }}>
            <button style={chipStyle(sumFilter === 'all')}  onClick={() => setSumFilter('all')}>ทั้งหมด</button>
            <button style={chipStyle(sumFilter === '7d')}   onClick={() => setSumFilter('7d')}>7 วัน</button>
            <button style={chipStyle(sumFilter === '30d')}  onClick={() => setSumFilter('30d')}>30 วัน</button>
            {months.map(mk => (
              <button key={mk} style={chipStyle(sumFilter === mk)} onClick={() => setSumFilter(mk)}>
                {monthLabel(mk)}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 360 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['วันที่', 'คง\nเหลือ', 'ต้นทุน\nสต็อก (฿)', 'ขาย\nออก', 'รายได้\n(฿)'].map((h, i) => (
                    <th key={i} style={thS(i === 0)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHist.map((d, ri) => {
                  const c = calcDay(d, products);
                  return (
                    <tr key={d.date} style={{ background: ri % 2 === 1 ? '#f7fbfb' : 'white' }}>
                      <td style={{ ...tdStyle, fontSize: 11, whiteSpace: 'nowrap' }}>{d.date}</td>
                      <td style={{ ...tdNum, fontSize: 11 }}>{fmt(c.totalStock)}</td>
                      <td style={{ ...tdNum, fontSize: 11 }}>{fmt(c.totalCost, c.totalCost % 1 ? 2 : 0)}</td>
                      <td style={{ ...tdNum, fontSize: 11, color: c.dUnits ? '#f59e0b' : 'inherit', fontWeight: c.dUnits ? 600 : 400 }}>{fmt(c.dUnits)}</td>
                      <td style={{ ...tdNum, fontSize: 11, color: c.dRev ? '#22c55e' : 'inherit', fontWeight: c.dRev ? 600 : 400 }}>{fmt(c.dRev)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#e8f4f4', fontWeight: 700 }}>
                  <td style={{ ...tdStyle, fontSize: 11, fontWeight: 700 }}>รวม</td>
                  <td style={{ ...tdNum, fontSize: 11, fontWeight: 700 }}>—</td>
                  <td style={{ ...tdNum, fontSize: 11, fontWeight: 700 }}>—</td>
                  <td style={{ ...tdNum, fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>
                    {fmt(filteredHist.reduce((s, d) => s + calcDay(d, products).dUnits, 0))}
                  </td>
                  <td style={{ ...tdNum, fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
                    {fmt(filteredHist.reduce((s, d) => s + calcDay(d, products).dRev, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PriceEditModal ───────────────────────────────────────────────────────────
function PriceEditModal({ product, onSave, onClose }) {
  const [cost,  setCost]  = useState(String(product.cost));
  const [price, setPrice] = useState(String(product.price));
  const [from,  setFrom]  = useState(todayStr());

  function save() {
    const c = parseFloat(cost), p = parseFloat(price);
    if (isNaN(c) || isNaN(p) || !from.match(/\d+\/\d+\/\d{4}/)) return;
    onSave({ cost: c, price: p, from });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#0005', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 24, width: 320, boxShadow: '0 8px 32px #0003' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#2a5a5a' }}>
          แก้ไขราคา — {product.label}
        </div>

        {/* current prices */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, background: '#f0f8f8', borderRadius: 6, padding: '8px 10px' }}>
          <div>ปัจจุบัน: ทุน <b>฿{product.cost}</b> / ขาย <b>฿{product.price}</b></div>
          <div>ข้อมูลเก่าจะยึดราคาเดิม ไม่มีผลย้อนหลัง</div>
        </div>

        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>ต้นทุนใหม่ (฿)</label>
        <input type="number" value={cost} step="0.01" onChange={e => setCost(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: BORDER, borderRadius: 6, fontSize: 13, marginBottom: 10, background: 'var(--card-bg)', color: 'var(--text-main)' }} />

        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>ราคาขายใหม่ (฿)</label>
        <input type="number" value={price} step="1" onChange={e => setPrice(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: BORDER, borderRadius: 6, fontSize: 13, marginBottom: 10, background: 'var(--card-bg)', color: 'var(--text-main)' }} />

        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>เริ่มใช้ตั้งแต่วันที่ (ว/ด/ปปปป)</label>
        <input type="text" value={from} onChange={e => setFrom(e.target.value)} placeholder="8/7/2026"
          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: BORDER, borderRadius: 6, fontSize: 13, marginBottom: 16, background: 'var(--card-bg)', color: 'var(--text-main)' }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-mint" style={{ flex: 1 }} onClick={save}>✓ บันทึก</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

// ─── Month helpers ────────────────────────────────────────────────────────────
const TH_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
function monthKey(dateStr)  { const [, m, y] = dateStr.split('/'); return `${m}/${y}`; }
function monthLabel(mk)     { const [m, y] = mk.split('/'); return `${TH_MONTHS[parseInt(m)]} ${parseInt(y) + 543}`; }

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StockUpdate() {
  const [history, setHistory]       = useState([]);
  const [products, setProducts]     = useState(DEFAULT_PRODUCTS);
  const [input, setInput]           = useState('');
  const [cfgOpen, setCfgOpen]       = useState(false);
  const [toast, setToast]           = useState(null);
  const [filterMode,  setFilterMode]  = useState('month'); // '7d'|'month'|'range'|'MM/YYYY'
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd,   setFilterEnd]   = useState('');
  const [editProduct, setEditProduct] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'

  // ── Load from Supabase on mount ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [histRows, priceRows] = await Promise.all([
          apiGet('/stock/history'),
          apiGet('/stock/prices'),
        ]);
        setHistory(histRows || []);
        if (priceRows?.length) {
          setProducts(DEFAULT_PRODUCTS.map(def => {
            const ph = priceRows
              .filter(r => r.product_key === def.key)
              .map(r => ({ from: r.effective_from, cost: r.cost, price: r.price }))
              .sort((a, b) => parseDate(a.from) - parseDate(b.from));
            if (!ph.length) return def;
            const latest = ph[ph.length - 1];
            return { ...def, cost: latest.cost, price: latest.price, priceHistory: ph };
          }));
        }
      } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'warning');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function saveDay(data) {
    setSaveStatus('saving');
    try {
      await apiPost('/stock/history', { date: data.date, cmpDate: data.cmpDate || null, items: data.items });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('error');
      showToast('บันทึกไม่สำเร็จ: ' + err.message, 'warning');
    }
  }

  async function addDay() {
    if (!input.trim()) return;
    const data = parseMsg(input);
    if (!data.date) { showToast('ไม่พบวันที่ในข้อความ กรุณาตรวจสอบรูปแบบ', 'warning'); return; }
    const existing = history.find(d => d.date === data.date);
    if (existing) {
      if (!window.confirm(`⚠️ มีข้อมูลวันที่ ${data.date} อยู่แล้ว\nต้องการทับข้อมูลเดิมไหม?`)) return;
      showToast(`ทับข้อมูลวันที่ ${data.date} แล้ว`, 'info');
    }
    setHistory(prev => sortByDate([...prev.filter(d => d.date !== data.date), data]));
    setFilterMode('month'); setFilterStart(''); setFilterEnd('');
    setInput('');
    await saveDay(data);
  }

  function handlePaste(e) {
    setTimeout(async () => {
      const val = e.target.value;
      if (val.includes('สต') && val.includes('ชิ้น')) {
        const data = parseMsg(val);
        if (data.date) {
          const exists = history.find(d => d.date === data.date);
          if (exists) {
            if (!window.confirm(`⚠️ มีข้อมูลวันที่ ${data.date} อยู่แล้ว\nต้องการทับข้อมูลเดิมไหม?`)) { setInput(''); return; }
            showToast(`ทับข้อมูลวันที่ ${data.date} แล้ว`, 'info');
          }
          setHistory(prev => sortByDate([...prev.filter(d => d.date !== data.date), data]));
          setFilterMode('month'); setFilterStart(''); setFilterEnd('');
          setInput('');
          await saveDay(data);
        }
      }
    }, 100);
  }

  async function clearAll() {
    if (!window.confirm('ล้างข้อมูลทั้งหมดใช่ไหม? (ลบออกจาก Supabase ด้วย ไม่สามารถกู้คืนได้)')) return;
    try {
      await apiDelete('/stock/history');
      setHistory([]);
      showToast('ล้างข้อมูลทั้งหมดแล้ว', 'info');
    } catch (err) {
      showToast('ลบไม่สำเร็จ: ' + err.message, 'warning');
    }
  }

  // Price history update — บันทึกลง Supabase
  async function handlePriceSave({ cost, price, from }) {
    if (!editProduct) return;
    try {
      await apiPost('/stock/prices', {
        product_key: editProduct.key, product_label: editProduct.label,
        cost, price, effective_from: from,
      });
      setProducts(prev => prev.map(p => {
        if (p.key !== editProduct.key) return p;
        const ph = [...(p.priceHistory || []), { from, cost, price }]
          .sort((a, b) => parseDate(a.from) - parseDate(b.from));
        return { ...p, cost, price, priceHistory: ph };
      }));
      showToast(`อัปเดตราคา ${editProduct.label} เริ่ม ${from} แล้ว`, 'info');
    } catch (err) {
      showToast('บันทึกราคาไม่สำเร็จ: ' + err.message, 'warning');
    }
    setEditProduct(null);
  }

  function collectRows() {
    const hdr = ['วันที่', 'สินค้า', 'ต้นทุน', 'ราคาขาย', 'จำนวนคงเหลือ', 'ต้นทุนรวม', 'ยอดขาย', 'ขายได้(ชิ้น)', 'COGS', 'รายได้จากขาย'];
    const rows = [hdr];
    for (const data of history) {
      let tS = 0, tC = 0, tV = 0, dU = 0, dC = 0, dR = 0;
      for (const it of data.items) {
        const p   = products.find(pr => pr.key === it.key);
        const cfg = p ? getPriceForDate(p, data.date) : { cost: 0, price: 0 };
        const ct = it.stock * cfg.cost, vt = it.stock * cfg.price;
        tS += it.stock; tC += ct; tV += vt;
        if (it.dec) { dU += it.change; dC += it.change * cfg.cost; dR += it.change * cfg.price; }
        rows.push([data.date, it.label, cfg.cost, cfg.price, it.stock, +ct.toFixed(2), vt, '', '', '']);
      }
      rows.push([data.date, 'Total', '', '', tS, +tC.toFixed(2), tV, dU, +dC.toFixed(2), dR]);
      rows.push([]);
    }
    return rows;
  }

  function dlCSV() {
    if (!history.length) { showToast('ยังไม่มีข้อมูล', 'warning'); return; }
    const csv = collectRows().map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'stock.csv'; a.click();
  }

  const dlXLSX = useCallback(() => {
    if (!history.length) { showToast('ยังไม่มีข้อมูล', 'warning'); return; }
    function doExport(XLSX) {
      const rows = collectRows();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [12, 18, 9, 9, 14, 13, 12, 12, 12, 14].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'สต็อกรายวัน');
      XLSX.writeFile(wb, 'stock_history.xlsx');
    }
    if (window.XLSX) { doExport(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => doExport(window.XLSX);
    document.head.appendChild(s);
  }, [history, products]);

  // Months available in history
  const months = [...new Set(history.map(d => monthKey(d.date)))].sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number), [mb, yb] = b.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });
  const latestMonth = months[months.length - 1];

  // Filtered history for left column (newest first)
  const displayHist = (() => {
    let r;
    if (filterMode === '7d') {
      const cut = new Date(); cut.setDate(cut.getDate() - 7);
      r = history.filter(d => parseDate(d.date) >= cut);
    } else if (filterMode === 'month') {
      const n = new Date();
      r = history.filter(d => {
        const [, m, y] = d.date.split('/').map(Number);
        return m === n.getMonth() + 1 && y === n.getFullYear();
      });
      if (!r.length && latestMonth) r = history.filter(d => monthKey(d.date) === latestMonth);
    } else if (filterMode === 'range') {
      const s = filterStart ? parseDate(filterStart) : null;
      const e = filterEnd   ? parseDate(filterEnd)   : null;
      r = history.filter(d => {
        const dt = parseDate(d.date);
        return (!s || dt >= s) && (!e || dt <= e);
      });
    } else {
      r = history.filter(d => monthKey(d.date) === filterMode);
    }
    return [...r].reverse();
  })();

  function applyPreset(mode) { setFilterMode(mode); setFilterStart(''); setFilterEnd(''); }
  function applyRange(s, e) {
    setFilterStart(s); setFilterEnd(e);
    if (s || e) setFilterMode('range');
  }
  const presetBtn = (mode, label) => (
    <button key={mode} onClick={() => applyPreset(mode)} style={{
      padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid',
      background: filterMode === mode ? 'var(--mint)' : 'white',
      color:      filterMode === mode ? 'white' : 'var(--mint)',
      borderColor: 'var(--mint)', fontWeight: filterMode === mode ? 700 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: toast.type === 'warning' ? '#fef3c7' : '#dcfce7', color: '#1a1a18', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 2px 8px #0002', maxWidth: 320 }}>
          {toast.msg}
        </div>
      )}

      {/* Price edit modal */}
      {editProduct && (
        <PriceEditModal
          product={editProduct}
          onSave={handlePriceSave}
          onClose={() => setEditProduct(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>อัปเดตสต็อกรายวัน</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>
            บันทึกใน Supabase — วางข้อความสต็อกแล้วระบบคำนวณต้นทุน/ยอดขายอัตโนมัติ
          </p>
        </div>
        {saveStatus && (
          <div style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, fontWeight: 600,
            background: saveStatus === 'saved' ? '#dcfce7' : saveStatus === 'error' ? '#fee2e2' : '#e0f2fe',
            color:      saveStatus === 'saved' ? '#166534' : saveStatus === 'error' ? '#991b1b' : '#0369a1' }}>
            {saveStatus === 'saving' ? '⏳ กำลังบันทึก...' : saveStatus === 'saved' ? '✓ บันทึกแล้ว' : '✗ บันทึกไม่สำเร็จ'}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
          ⏳ กำลังโหลดข้อมูลจาก Supabase...
        </div>
      )}
      {loading ? null : (<>

      {/* Config — product price settings */}
      <div className="card" style={{ marginBottom: 14, maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setCfgOpen(o => !o)}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>⚙️ ตั้งค่าต้นทุน / ราคาขาย</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{cfgOpen ? '▲ ซ่อน' : '▼ แสดง'}</span>
        </div>
        {cfgOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
            {products.map(p => {
              const sortedPH = [...(p.priceHistory || [])].sort((a, b) => parseDate(b.from) - parseDate(a.from));
              const cur = sortedPH[0] || { cost: p.cost, price: p.price, from: '—' };
              return (
                <div key={p.key} style={{ background: '#f0f8f8', border: BORDER, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{p.label}</span>
                    <button onClick={() => setEditProduct(p)}
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--mint)', background: 'white', color: 'var(--mint)', cursor: 'pointer' }}>
                      แก้ไข
                    </button>
                  </div>
                  <div style={{ fontSize: 12 }}>ทุน <b>฿{cur.cost}</b> / ขาย <b>฿{cur.price}</b></div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>เริ่ม {cur.from}</div>
                  {sortedPH.length > 1 && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 11, color: 'var(--mint)', cursor: 'pointer' }}>ประวัติราคา ({sortedPH.length})</summary>
                      <div style={{ marginTop: 4 }}>
                        {sortedPH.map((h, i) => (
                          <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0', borderBottom: i < sortedPH.length - 1 ? '1px solid #dde' : 'none' }}>
                            {h.from}: ทุน ฿{h.cost} / ขาย ฿{h.price}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paste card */}
      <div className="card" style={{ marginBottom: 14, maxWidth: 900 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📋 วางข้อความสต็อก</div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onPaste={handlePaste}
          rows={8}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, resize: 'vertical', padding: '9px 11px', border: BORDER, borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-main)', fontFamily: 'inherit', lineHeight: 1.5 }}
          placeholder={'📅 สต๊อกวันที่ 07/07/2569 (เทียบ 06/07/2569)\n💚 Retox: 8,163 ➝ ลดลง 47 ชิ้น\n...'}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-mint" onClick={addDay}>+ เพิ่มวัน / คำนวณ</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Paste อัตโนมัติ · ทับได้ · บันทึกใน Supabase</span>
        </div>
      </div>

      {/* Action bar */}
      {history.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', maxWidth: 900, alignItems: 'center' }}>
          <button className="btn btn-blue" onClick={dlXLSX}>⬇ Excel</button>
          <button className="btn btn-ghost" onClick={dlCSV}>⬇ CSV</button>
          <button className="btn btn-danger" onClick={clearAll}>🗑 ล้างทั้งหมด</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{history.length} วัน · บันทึกใน Supabase</span>
        </div>
      )}

      {/* Two-column area */}
      {history.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, border: '1px dashed var(--border-color)', borderRadius: 8, fontSize: 13, maxWidth: 900 }}>
          วางข้อความแล้วกด "เพิ่มวัน / คำนวณ" เพื่อสร้างตาราง
        </div>
      ) : (
        <div>
          {/* Filter bar */}
          <div className="card" style={{ marginBottom: 14, padding: '12px 14px' }}>
            {/* Row 1: date range + presets */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>เริ่มต้น</label>
                <input type="text" value={filterStart} placeholder="ว/ด/ปปปป"
                  onChange={e => applyRange(e.target.value, filterEnd)}
                  style={{ width: 100, padding: '4px 8px', border: BORDER, borderRadius: 6, fontSize: 12, background: 'var(--card-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>สิ้นสุด</label>
                <input type="text" value={filterEnd} placeholder="ว/ด/ปปปป"
                  onChange={e => applyRange(filterStart, e.target.value)}
                  style={{ width: 100, padding: '4px 8px', border: BORDER, borderRadius: 6, fontSize: 12, background: 'var(--card-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ width: 1, background: '#c8d8d8', height: 24, margin: '0 2px' }} />
              {presetBtn('month', 'เดือนนี้')}
              {presetBtn('7d', '7 วัน')}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                แสดง {displayHist.length} วัน
              </span>
            </div>
            {/* Row 2: month chips */}
            {months.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>เดือน:</span>
                {months.map(mk => (
                  <button key={mk} onClick={() => applyPreset(mk)}
                    style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', border: '1px solid',
                      background: filterMode === mk ? '#7DB9B9' : 'white',
                      color:      filterMode === mk ? 'white'   : '#3a7a7a',
                      borderColor: '#9ab8b8', fontWeight: filterMode === mk ? 700 : 400 }}>
                    {monthLabel(mk)} ({history.filter(d => monthKey(d.date) === mk).length})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {/* Left: newest first, filtered */}
            <div style={{ flex: 1, minWidth: 0, maxWidth: 'calc(100% - 294px)' }}>
              {displayHist.length === 0
                ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>ไม่มีข้อมูลเดือนนี้</div>
                : displayHist.map(data => <DayTable key={data.date} data={data} products={products} />)
              }
            </div>
            {/* Right: summary — ALL history, sticky */}
            <div style={{ width: 280, flexShrink: 0, position: 'sticky', top: 20 }}>
              <SummaryPanel history={history} products={products} />
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
