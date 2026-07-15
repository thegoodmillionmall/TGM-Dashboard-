import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete, fmtMoney } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

// ---- Helpers ----
const n = v => { const x = parseFloat(String(v).replace(/,/g, '')); return isNaN(x) ? 0 : x; };
const fmtNum = v => v ? Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
const today = () => new Date().toISOString().slice(0, 10);
const thaiDate = iso => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
};
const currentMonth = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };

// ---- Field row component ----
function Field({ label, sub, value, onChange, readOnly = false, bold = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: bold ? 700 : 500, color: '#1a2a3a' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
      </div>
      {readOnly
        ? <div style={{ minWidth: 130, textAlign: 'right', fontWeight: 700, color: bold ? '#059669' : '#1a2a3a', fontSize: 14 }}>
            {value ? '฿' + fmtNum(value) : '-'}
          </div>
        : <input
            type="text" inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="0"
            style={{ width: 130, textAlign: 'right', border: '1.5px solid #B2D8D8', borderRadius: 7, padding: '6px 10px', fontSize: 14, fontFamily: 'inherit', background: '#f8fffe' }}
          />
      }
    </div>
  );
}

function SectionCard({ title, color = '#1a2a3a', children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${color}30`, padding: '14px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 4, height: 16, background: color, borderRadius: 2, display: 'inline-block' }} />
        {title}
      </div>
      {children}
    </div>
  );
}

const EMPTY_FORM = {
  date: today(),
  ttGmvmaxRevenue: '', ttGmvmaxSpend: '',
  ttGmvliveRevenue: '', ttGmvliveSpend: '',
  ttSpecificSpend: '', ttSpecificCount: '',
  ttBackendSpend: '',
  shopeeSpend: '', shopeeLiveSpend: '',
  metaSpend: '',
  notes: '', reporter: ''
};

export default function AdsEntry() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  const [mtd, setMtd] = useState(null);
  const [mtdBusy, setMtdBusy] = useState(false);
  const { year, month } = currentMonth();

  const [history, setHistory] = useState([]);
  const [histBusy, setHistBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Computed auto-values
  const ttTotalRevenue = n(form.ttGmvmaxRevenue) + n(form.ttGmvliveRevenue);
  const ttTotalSpend   = n(form.ttGmvmaxSpend) + n(form.ttGmvliveSpend) + n(form.ttSpecificSpend) + n(form.ttBackendSpend);
  const shopeeTotal    = n(form.shopeeSpend) + n(form.shopeeLiveSpend);
  const totalSpend     = ttTotalSpend + shopeeTotal + n(form.metaSpend);
  const ttRoas         = ttTotalSpend > 0 ? (ttTotalRevenue / ttTotalSpend).toFixed(2) : '-';

  // Load MTD
  const loadMtd = useCallback(async () => {
    setMtdBusy(true);
    try { setMtd(await apiGet('/ads-manual/mtd', { year, month })); }
    catch { setMtd(null); }
    finally { setMtdBusy(false); }
  }, [year, month]);

  // Load history (last 14 days)
  const loadHistory = useCallback(async () => {
    setHistBusy(true);
    try {
      const start = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      setHistory(await apiGet('/ads-manual', { start }));
    } catch { setHistory([]); }
    finally { setHistBusy(false); }
  }, []);

  useEffect(() => {
    loadMtd();
    loadHistory();
  }, []);

  // Load existing data for a date
  async function loadDate(date) {
    try {
      const rows = await apiGet('/ads-manual', { start: date, end: date });
      if (rows && rows.length > 0) {
        const r = rows[0];
        setForm({
          date,
          ttGmvmaxRevenue: r.ttGmvmaxRevenue || '',
          ttGmvmaxSpend:   r.ttGmvmaxSpend   || '',
          ttGmvliveRevenue: r.ttGmvliveRevenue || '',
          ttGmvliveSpend:  r.ttGmvliveSpend   || '',
          ttSpecificSpend: r.ttSpecificSpend  || '',
          ttSpecificCount: r.ttSpecificCount  || '',
          ttBackendSpend:  r.ttBackendSpend   || '',
          shopeeSpend:     r.shopeeSpend      || '',
          shopeeLiveSpend: r.shopeeLiveSpend  || '',
          metaSpend:       r.metaSpend        || '',
          notes:    r.notes    || '',
          reporter: r.reporter || ''
        });
      } else {
        setForm(f => ({ ...EMPTY_FORM, date }));
      }
    } catch { /* skip */ }
  }

  // Save
  async function handleSave() {
    setSaving(true); setError(''); setSaveMsg('');
    try {
      await apiPost('/ads-manual', {
        date:             form.date,
        ttGmvmaxRevenue:  n(form.ttGmvmaxRevenue),
        ttGmvmaxSpend:    n(form.ttGmvmaxSpend),
        ttGmvliveRevenue: n(form.ttGmvliveRevenue),
        ttGmvliveSpend:   n(form.ttGmvliveSpend),
        ttSpecificSpend:  n(form.ttSpecificSpend),
        ttSpecificCount:  n(form.ttSpecificCount),
        ttBackendSpend:   n(form.ttBackendSpend),
        shopeeSpend:      n(form.shopeeSpend),
        shopeeLiveSpend:  n(form.shopeeLiveSpend),
        metaSpend:        n(form.metaSpend),
        notes:    form.notes,
        reporter: form.reporter
      });
      setSaveMsg('✅ บันทึกสำเร็จ');
      loadMtd();
      loadHistory();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  // Generate LINE report text
  function generateLineReport() {
    const dateLabel = thaiDate(form.date);
    const gmvmaxRoi = n(form.ttGmvmaxSpend) > 0 ? (n(form.ttGmvmaxRevenue) / n(form.ttGmvmaxSpend)).toFixed(2) : '-';
    const gmvliveRoi = n(form.ttGmvliveSpend) > 0 ? (n(form.ttGmvliveRevenue) / n(form.ttGmvliveSpend)).toFixed(2) : '-';
    const todayRoas = totalSpend > 0 ? (ttTotalRevenue / totalSpend).toFixed(2) : '-';
    const mtdSales = mtd?.ttRevenue || 0;
    const mtdAds   = mtd?.totalSpend || 0;
    const mtdRoas  = mtdAds > 0 ? (mtdSales / mtdAds).toFixed(2) : '-';

    const lines = [
      `📊 TGM Ads Report — ${dateLabel}${form.reporter ? ' / ' + form.reporter : ''}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🎵 TikTok Ads`,
      `ยอดขาย GMV MAX: ${n(form.ttGmvmaxRevenue).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ค่าใช้จ่าย GMV MAX: ${n(form.ttGmvmaxSpend).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ยอดขาย GMV LIVE: ${n(form.ttGmvliveRevenue).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ค่าใช้จ่าย Ads GMV LIVE: ${n(form.ttGmvliveSpend).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ROI: ${gmvliveRoi}`,
      `ค่า Ads เฉพาะ${n(form.ttSpecificCount) > 0 ? ' ' + n(form.ttSpecificCount) + ' รายการ' : ''}: ${n(form.ttSpecificSpend).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ค่าใช้จ่าย Ads หลังบ้าน: ${n(form.ttBackendSpend).toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ROAS: ${todayRoas}`,
      `ยอดขายรวมทั้งหมด/วัน: ${ttTotalRevenue.toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ยอดค่าใช้จ่ายรวม/วัน: ${totalSpend.toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `ROI: ${todayRoas}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📅 MTD (${month}/${year})`,
      `MTD Sales: ${mtdSales.toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `MTD ค่าแอด: ${mtdAds.toLocaleString('th-TH', {minimumFractionDigits:2})}`,
      `MTD ROAS: ${mtdRoas}`,
    ];

    if (n(form.shopeeSpend) + n(form.shopeeLiveSpend) > 0) {
      lines.splice(lines.indexOf('━━━━━━━━━━━━━━━━━━━━━━'), 0,
        `🛍 Shopee Ads: ${shopeeTotal.toLocaleString('th-TH', {minimumFractionDigits:2})}`
      );
    }
    if (n(form.metaSpend) > 0) {
      lines.splice(lines.indexOf('━━━━━━━━━━━━━━━━━━━━━━'), 0,
        `📘 Meta Ads: ${n(form.metaSpend).toLocaleString('th-TH', {minimumFractionDigits:2})}`
      );
    }

    return lines.join('\n');
  }

  async function copyLineReport() {
    try {
      await navigator.clipboard.writeText(generateLineReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { alert(generateLineReport()); }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-title">กรอกค่าแอดรายวัน</div>
      <div className="page-sub">กรอกตัวเลขจาก LINE report ของทีม Marketing — บันทึกรายวัน MTD คำนวณอัตโนมัติ</div>

      <Alert type="error">{error}</Alert>
      {saveMsg && <div style={{ background:'#f0fdf4', border:'1.5px solid #6ee7b7', borderRadius:8, padding:'10px 14px', marginBottom:14, color:'#065f46', fontSize:13, fontWeight:600 }}>{saveMsg}</div>}

      {/* Date + Reporter */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e2e8f0', padding:'14px 18px', marginBottom:14 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:12, color:'#5a6a7a', marginBottom:4 }}>วันที่</div>
            <input type="date" value={form.date}
              onChange={e => { set('date', e.target.value); loadDate(e.target.value); }}
              style={{ border:'1.5px solid #B2D8D8', borderRadius:7, padding:'7px 11px', fontSize:14, fontFamily:'inherit' }} />
          </div>
          <div style={{ flex:1, minWidth:120 }}>
            <div style={{ fontSize:12, color:'#5a6a7a', marginBottom:4 }}>ผู้รายงาน (ไม่บังคับ)</div>
            <input value={form.reporter} onChange={e => set('reporter', e.target.value)}
              placeholder="เช่น แทนกาย"
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:7, padding:'7px 11px', fontSize:14, fontFamily:'inherit' }} />
          </div>
        </div>
      </div>

      {/* TikTok section */}
      <SectionCard title="🎵 TikTok Ads" color="#111827">
        <Field label="ยอดขาย GMV MAX" value={form.ttGmvmaxRevenue} onChange={v => set('ttGmvmaxRevenue', v)} />
        <Field label="ค่าใช้จ่าย GMV MAX" value={form.ttGmvmaxSpend} onChange={v => set('ttGmvmaxSpend', v)} />
        <div style={{ height:1, background:'#f1f5f9', margin:'8px 0' }} />
        <Field label="ยอดขาย GMV LIVE" value={form.ttGmvliveRevenue} onChange={v => set('ttGmvliveRevenue', v)} />
        <Field label="ค่าใช้จ่าย Ads GMV LIVE" value={form.ttGmvliveSpend} onChange={v => set('ttGmvliveSpend', v)} />
        <div style={{ height:1, background:'#f1f5f9', margin:'8px 0' }} />
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <Field label="ค่า Ads เฉพาะ" sub="ค่าใช้จ่าย (บาท)" value={form.ttSpecificSpend} onChange={v => set('ttSpecificSpend', v)} />
          </div>
          <div style={{ width:90 }}>
            <div style={{ fontSize:12, color:'#5a6a7a', marginBottom:4 }}>จำนวนรายการ</div>
            <input type="text" inputMode="numeric" value={form.ttSpecificCount}
              onChange={e => set('ttSpecificCount', e.target.value)}
              placeholder="0"
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:7, padding:'6px 10px', fontSize:13, fontFamily:'inherit', textAlign:'right' }} />
          </div>
        </div>
        <Field label="ค่าใช้จ่าย Ads หลังบ้าน" sub="Ads Manager" value={form.ttBackendSpend} onChange={v => set('ttBackendSpend', v)} />

        {/* TikTok auto-summary */}
        <div style={{ background:'#f8fffe', borderRadius:8, padding:'10px 14px', marginTop:8, border:'1px solid #B2D8D8' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
            <span>ยอดขายรวม TikTok</span>
            <span style={{ fontWeight:700 }}>฿{fmtNum(ttTotalRevenue)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginTop:4 }}>
            <span>ค่าแอดรวม TikTok</span>
            <span style={{ fontWeight:700, color:'#dc2626' }}>฿{fmtNum(ttTotalSpend)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginTop:4 }}>
            <span>ROAS / วันนี้</span>
            <span style={{ fontWeight:700, color:'#059669' }}>{ttRoas}</span>
          </div>
        </div>
      </SectionCard>

      {/* Shopee section */}
      <SectionCard title="🛍 Shopee Ads" color="#f4511e">
        <Field label="ค่าแอด Shopee" value={form.shopeeSpend} onChange={v => set('shopeeSpend', v)} />
        <Field label="ค่าแอด Shopee Live" value={form.shopeeLiveSpend} onChange={v => set('shopeeLiveSpend', v)} />
      </SectionCard>

      {/* Meta section */}
      <SectionCard title="📘 Meta Ads (FB/IG)" color="#1877f2">
        <Field label="ค่าแอด Meta" value={form.metaSpend} onChange={v => set('metaSpend', v)} />
      </SectionCard>

      {/* Total */}
      <div style={{ background:'#1a2a3a', borderRadius:12, padding:'14px 18px', marginBottom:14, color:'#fff' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:13, opacity:0.8 }}>ยอดขายรวม TikTok / วัน</span>
          <span style={{ fontWeight:700, color:'#B2D8D8' }}>฿{fmtNum(ttTotalRevenue)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:13, opacity:0.8 }}>ค่าแอดรวมทุก Platform / วัน</span>
          <span style={{ fontWeight:700, color:'#fca5a5' }}>฿{fmtNum(totalSpend)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, opacity:0.8 }}>ROAS รวม</span>
          <span style={{ fontWeight:700, color:'#6ee7b7' }}>{totalSpend > 0 ? (ttTotalRevenue / totalSpend).toFixed(2) : '-'}</span>
        </div>
      </div>

      {/* Notes */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e2e8f0', padding:'14px 18px', marginBottom:14 }}>
        <div style={{ fontSize:12, color:'#5a6a7a', marginBottom:4 }}>หมายเหตุ (ไม่บังคับ)</div>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="บันทึกอื่นๆ เช่น แคมเปญพิเศษ 7.7..."
          rows={2}
          style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:7, padding:'8px 11px', fontSize:13, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box' }} />
      </div>

      {/* Buttons */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ flex:1, background:'#1a2a3a', color:'#B2D8D8', border:'none', borderRadius:9, padding:'13px 0', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
        </button>
        <button onClick={copyLineReport}
          style={{ background: copied ? '#059669' : '#B2D8D8', color:'#1a2a3a', border:'none', borderRadius:9, padding:'13px 18px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          {copied ? '✅ Copied!' : '📋 Copy LINE'}
        </button>
      </div>

      {/* MTD Summary */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e2e8f0', padding:'14px 18px', marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#1a2a3a', marginBottom:10 }}>
          📅 MTD — {month}/{year} {mtdBusy && <span style={{ fontSize:11, color:'#94a3b8' }}>กำลังโหลด...</span>}
        </div>
        {mtd && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[
              { label:'MTD Sales (TikTok)', value: mtd.ttRevenue, color:'#059669' },
              { label:'MTD ค่าแอดรวม', value: mtd.totalSpend, color:'#dc2626' },
              { label:'MTD ROAS', value: null, extra: mtd.roas + 'x', color:'#7c3aed' }
            ].map((item, i) => (
              <div key={i} style={{ background:'#f8fafc', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{item.label}</div>
                <div style={{ fontSize:15, fontWeight:700, color: item.color }}>
                  {item.value !== null ? '฿' + fmtNum(item.value) : item.extra}
                </div>
              </div>
            ))}
          </div>
        )}
        {mtd && (
          <div style={{ marginTop:10, fontSize:11, color:'#94a3b8' }}>
            TikTok: ฿{fmtNum(mtd.ttSpend)} | Shopee: ฿{fmtNum(mtd.shopeeSpend)} | Meta: ฿{fmtNum(mtd.metaSpend)} | {mtd.days} วันที่บันทึก
          </div>
        )}
      </div>

      {/* History table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e2e8f0', padding:'14px 18px' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#1a2a3a', marginBottom:10 }}>
          📋 ประวัติ 14 วัน {histBusy && <span style={{ fontSize:11, color:'#94a3b8' }}>กำลังโหลด...</span>}
        </div>
        {history.length === 0 && !histBusy && (
          <div style={{ color:'#94a3b8', fontSize:13 }}>ยังไม่มีข้อมูล</div>
        )}
        {history.length > 0 && (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                  <th style={{ padding:'7px 10px', textAlign:'left' }}>วันที่</th>
                  <th style={{ padding:'7px 10px', textAlign:'right' }}>ยอดขาย TT</th>
                  <th style={{ padding:'7px 10px', textAlign:'right' }}>ค่าแอด TT</th>
                  <th style={{ padding:'7px 10px', textAlign:'right' }}>Shopee</th>
                  <th style={{ padding:'7px 10px', textAlign:'right' }}>Meta</th>
                  <th style={{ padding:'7px 10px', textAlign:'right' }}>ROAS</th>
                  <th style={{ padding:'7px 10px' }}></th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td style={{ padding:'6px 10px' }}>
                      <button onClick={() => loadDate(r.date)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#1d4ed8', textDecoration:'underline', fontSize:12, padding:0, fontFamily:'inherit' }}>
                        {thaiDate(r.date)}
                      </button>
                    </td>
                    <td style={{ padding:'6px 10px', textAlign:'right' }}>฿{fmtNum(r.ttTotalRevenue)}</td>
                    <td style={{ padding:'6px 10px', textAlign:'right', color:'#dc2626' }}>฿{fmtNum(r.ttTotalSpend)}</td>
                    <td style={{ padding:'6px 10px', textAlign:'right' }}>฿{fmtNum(r.shopeeTotal)}</td>
                    <td style={{ padding:'6px 10px', textAlign:'right' }}>฿{fmtNum(r.metaSpend)}</td>
                    <td style={{ padding:'6px 10px', textAlign:'right', color:'#059669', fontWeight:600 }}>{r.ttRoas || '-'}</td>
                    <td style={{ padding:'6px 10px', textAlign:'center' }}>
                      <button onClick={async () => {
                        if (!confirm('ลบข้อมูลวันที่ ' + thaiDate(r.date) + '?')) return;
                        try { await apiDelete('/ads-manual/' + r.date); loadHistory(); loadMtd(); }
                        catch (err) { alert(err.message); }
                      }} style={{ background:'#fee2e2', border:'none', borderRadius:4, padding:'2px 8px', color:'#dc2626', cursor:'pointer', fontSize:11 }}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
