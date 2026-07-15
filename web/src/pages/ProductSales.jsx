import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiUpload, apiDelete } from '../api.js';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const fmt  = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = v => '฿' + fmt(v, 0);

const PRODUCT_COLORS = {
  puff:      '#B2D8D8',
  retox:     '#7DB9B9',
  boostdrop: '#f97316',
  keraglow:  '#ec4899',
  comb:      '#8b5cf6',
  bundle:    '#94a3b8',
  other:     '#d1d5db',
};
const PRODUCT_LABELS = {
  puff:'พัฟผมเด้ง', retox:'Retox', boostdrop:'Boostdrop',
  keraglow:'Keraglow', comb:'หวี', bundle:'เซ็ต/Bundle', other:'อื่นๆ',
};

const SOURCE_TAG = { JST: { bg:'#dcfce7', color:'#166534', label:'JST ERP' },
                     GOSELL: { bg:'#dbeafe', color:'#1d4ed8', label:'GoSell' } };

function SourceBadge({ source }) {
  const s = SOURCE_TAG[source] || { bg:'#f1f5f9', color:'#5a6a7a', label: source };
  return <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
    background: s.bg, color: s.color }}>{s.label}</span>;
}

// ── Upload zone ──
function UploadZone({ onDone }) {
  const [busy,    setBusy]    = useState(false);
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');
  const fileRef = useRef();
  const dropRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/product-sales/import', fd);
      setMsg(`✅ ${res.message}`);
      onDone();
    } catch (e) { setErr('❌ ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom:14 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>📁 นำเข้าข้อมูลสินค้าขายดี</div>
      <div style={{ fontSize:12, color:'#5a6a7a', marginBottom:10 }}>
        รองรับไฟล์ <b>JST ERP</b> (JST2026.xlsx) และ <b>GoSell</b> (TGM2026.xlsx, Sales_2026.xlsx) — ระบบตรวจประเภทอัตโนมัติ
      </div>
      {msg && <div style={{ background:'#f0fdf4', border:'1px solid #6ee7b7', borderRadius:7, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#065f46' }}>{msg}</div>}
      {err && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:7, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#dc2626' }}>{err}</div>}
      <div ref={dropRef}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        style={{ border:'2px dashed #B2D8D8', borderRadius:8, padding:'16px 20px',
          background:'#f8fffe', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:13, color:'#5a6a7a', flex:1 }}>ลากไฟล์มาวางตรงนี้ หรือ</span>
        <input ref={fileRef} type="file" accept=".xlsx" style={{ display:'none' }}
          onChange={e => handleFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ background:'#B2D8D8', color:'#1a2a3a', border:'none', borderRadius:7,
            padding:'7px 16px', cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit' }}>
          {busy ? '⏳ กำลังนำเข้า...' : 'เลือกไฟล์'}
        </button>
      </div>
      <div style={{ fontSize:11, color:'#94a3b8', marginTop:6 }}>
        💡 อัปโหลดทีละไฟล์ — ระบบจะลบข้อมูลเดิมของเดือนเดียวกันจากแหล่งเดียวกันก่อน
      </div>
    </div>
  );
}

// ── Main ──
export default function ProductSales() {
  const [tab,     setTab]     = useState('ranking'); // 'ranking' | 'monthly' | 'batches'
  const [ranking, setRanking] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [byProd,  setByProd]  = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [rank, sum, bp, bt] = await Promise.all([
        apiGet('/product-sales/ranking'),
        apiGet('/product-sales/summary'),
        apiGet('/product-sales/monthly-by-product'),
        apiGet('/product-sales/batches'),
      ]);
      setRanking(rank || []);
      setMonthly(sum  || []);
      setByProd(bp    || []);
      setBatches(bt   || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Months available ──
  const months = [...new Set(byProd.map(r => r.year_month))].sort();
  const coreKeys = ['puff','retox','boostdrop','keraglow','comb'];

  // ── Stacked bar: units per product per month ──
  const barData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, mo - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    }),
    datasets: coreKeys.map(key => ({
      label: PRODUCT_LABELS[key],
      data: months.map(m => {
        const r = byProd.find(x => x.year_month === m && x.product_key === key);
        return r ? r.units : 0;
      }),
      backgroundColor: PRODUCT_COLORS[key],
      stack: 'units',
    })),
  };

  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 } } },
               title: { display: false } },
    scales: {
      x: { stacked: true, ticks: { font: { family: 'Kanit', size: 11 } } },
      y: { stacked: true, ticks: { font: { family: 'Kanit', size: 11 } } },
    },
  };

  // ── Ranking bar (horizontal) ──
  const coreRank = ranking.filter(r => coreKeys.includes(r.product_key));
  const rankBar  = {
    labels: coreRank.map(r => r.label),
    datasets: [{ label: 'จำนวนชิ้น', data: coreRank.map(r => r.units),
      backgroundColor: coreRank.map(r => PRODUCT_COLORS[r.product_key] || '#B2D8D8') }],
  };
  const rankOpts = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { family: 'Kanit', size: 11 } } },
              y: { ticks: { font: { family: 'Kanit', size: 11 } } } },
  };

  const tabBtn = (t, label) => (
    <button key={t} onClick={() => setTab(t)}
      style={{ padding:'6px 16px', borderRadius:7, fontSize:12, cursor:'pointer',
        border:'1px solid #e2e8f0', fontFamily:'inherit', fontWeight: tab===t ? 700 : 400,
        background: tab===t ? '#1a2a3a' : '#f8fafc', color: tab===t ? '#B2D8D8' : '#5a6a7a' }}>
      {label}
    </button>
  );

  if (loading) return <div style={{ padding:32, color:'#94a3b8', textAlign:'center' }}>⏳ กำลังโหลด...</div>;

  return (
    <div style={{ maxWidth:'100%' }}>
      <div className="page-title">สินค้าขายดี</div>
      <div className="page-sub">ข้อมูลจาก JST ERP + GoSell — ม.ค.–ก.ค. 2026</div>

      {err && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'10px 14px', marginBottom:12, color:'#dc2626', fontSize:13 }}>⚠️ {err}</div>}

      <UploadZone onDone={load} />

      {ranking.length === 0 ? (
        <div style={{ textAlign:'center', color:'#94a3b8', padding:48, border:'1px dashed #e2e8f0',
          borderRadius:10, fontSize:13 }}>
          ยังไม่มีข้อมูล — อัปโหลดไฟล์ JST หรือ GoSell ด้านบนก่อน
        </div>
      ) : (<>

        {/* KPI cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
          {[
            { label:'ออเดอร์รวม',   value: fmt(ranking.reduce((s,r)=>s+r.orders,0)) + ' รายการ' },
            { label:'ชิ้นที่ขายได้', value: fmt(ranking.reduce((s,r)=>s+r.units,0)) + ' ชิ้น' },
            { label:'ยอดขายรวม',   value: fmtM(ranking.reduce((s,r)=>s+r.net_revenue,0)) },
            { label:'เดือนที่มีข้อมูล', value: months.length + ' เดือน' },
          ].map(k => (
            <div key={k.label} className="card" style={{ padding:'12px 14px', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--mint)' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          {tabBtn('ranking', '🏆 อันดับสินค้า')}
          {tabBtn('monthly', '📅 รายเดือน')}
          {tabBtn('trend',   '📈 เทรนด์รายเดือน')}
          {tabBtn('batches', '📂 ประวัตินำเข้า')}
        </div>

        {/* ── RANKING TAB ── */}
        {tab === 'ranking' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {/* Bar chart */}
            <div className="card" style={{ padding:16 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>อันดับ (จำนวนชิ้น รวมทุกเดือน)</div>
              <div style={{ height:260 }}>
                <Bar data={rankBar} options={rankOpts} />
              </div>
            </div>

            {/* Table */}
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                    <th style={th}>สินค้า</th>
                    <th style={{ ...th, textAlign:'right' }}>ชิ้น</th>
                    <th style={{ ...th, textAlign:'right' }}>ยอดสุทธิ</th>
                    <th style={{ ...th, textAlign:'right' }}>กำไรขั้นต้น</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.product_key} style={{ background: i%2?'#f8fafc':'#fff' }}>
                      <td style={{ ...td, display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:10, height:10, borderRadius:3, flexShrink:0,
                          background: PRODUCT_COLORS[r.product_key] || '#e2e8f0', display:'inline-block' }} />
                        {r.label}
                      </td>
                      <td style={{ ...td, textAlign:'right', fontWeight:600 }}>{fmt(r.units)}</td>
                      <td style={{ ...td, textAlign:'right' }}>{fmtM(r.net_revenue)}</td>
                      <td style={{ ...td, textAlign:'right',
                        color: r.gross_profit >= 0 ? '#059669' : '#dc2626' }}>
                        {r.gross_profit ? fmtM(r.gross_profit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MONTHLY SUMMARY TAB ── */}
        {tab === 'monthly' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                  <th style={th}>เดือน</th>
                  <th style={th}>แหล่งข้อมูล</th>
                  <th style={{ ...th, textAlign:'right' }}>ออเดอร์</th>
                  <th style={{ ...th, textAlign:'right' }}>จำนวนชิ้น</th>
                  <th style={{ ...th, textAlign:'right' }}>ยอดขายรวม</th>
                  <th style={{ ...th, textAlign:'right' }}>ยอดสุทธิ</th>
                  <th style={{ ...th, textAlign:'right' }}>กำไรขั้นต้น</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={m.year_month} style={{ background: i%2?'#f8fafc':'#fff' }}>
                    <td style={{ ...td, fontWeight:600 }}>
                      {new Date(m.year_month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                    </td>
                    <td style={td}>
                      {(m.sources || []).map(s => <SourceBadge key={s} source={s} />)}
                    </td>
                    <td style={{ ...td, textAlign:'right' }}>{fmt(m.orders)}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:600, color:'var(--mint)' }}>{fmt(m.units)}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmtM(m.gross_revenue)}</td>
                    <td style={{ ...td, textAlign:'right' }}>{fmtM(m.net_revenue)}</td>
                    <td style={{ ...td, textAlign:'right',
                      color: m.gross_profit >= 0 ? '#059669' : '#dc2626' }}>
                      {m.gross_profit ? fmtM(m.gross_profit) : '-'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#1a2a3a', fontWeight:700 }}>
                  <td style={{ ...td, color:'#B2D8D8' }}>รวม</td>
                  <td style={td} />
                  <td style={{ ...td, color:'#e2e8f0', textAlign:'right' }}>{fmt(monthly.reduce((s,m)=>s+m.orders,0))}</td>
                  <td style={{ ...td, color:'#B2D8D8', textAlign:'right' }}>{fmt(monthly.reduce((s,m)=>s+m.units,0))}</td>
                  <td style={{ ...td, color:'#e2e8f0', textAlign:'right' }}>{fmtM(monthly.reduce((s,m)=>s+m.gross_revenue,0))}</td>
                  <td style={{ ...td, color:'#e2e8f0', textAlign:'right' }}>{fmtM(monthly.reduce((s,m)=>s+m.net_revenue,0))}</td>
                  <td style={{ ...td, color:'#86efac', textAlign:'right' }}>{fmtM(monthly.reduce((s,m)=>s+m.gross_profit,0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── TREND TAB ── */}
        {tab === 'trend' && (
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>
              เทรนด์ยอดขายรายเดือน (จำนวนชิ้น แยกประเภทสินค้า)
            </div>
            <div style={{ height:340 }}>
              <Bar data={barData} options={barOpts} />
            </div>
            <div style={{ marginTop:16, overflowX:'auto' }}>
              <table style={{ fontSize:11, borderCollapse:'collapse', width:'100%' }}>
                <thead>
                  <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                    <th style={{ ...th, fontSize:11 }}>สินค้า</th>
                    {months.map(m => (
                      <th key={m} style={{ ...th, fontSize:11, textAlign:'right' }}>
                        {new Date(m+'-01').toLocaleDateString('th-TH',{month:'short',year:'2-digit'})}
                      </th>
                    ))}
                    <th style={{ ...th, fontSize:11, textAlign:'right', background:'#0f172a' }}>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {coreKeys.map((key, ki) => {
                    const monthlyUnits = months.map(m => {
                      const r = byProd.find(x => x.year_month===m && x.product_key===key);
                      return r ? r.units : 0;
                    });
                    const total = monthlyUnits.reduce((s,v)=>s+v,0);
                    if (total === 0) return null;
                    return (
                      <tr key={key} style={{ background: ki%2?'#f8fafc':'#fff' }}>
                        <td style={{ ...td, display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                          <span style={{ width:9,height:9,borderRadius:2,background:PRODUCT_COLORS[key],display:'inline-block' }} />
                          {PRODUCT_LABELS[key]}
                        </td>
                        {monthlyUnits.map((v, mi) => (
                          <td key={mi} style={{ ...td, textAlign:'right', fontSize:11,
                            color: v > 0 ? '#1a2a3a' : '#d1d5db' }}>{v > 0 ? fmt(v) : '-'}</td>
                        ))}
                        <td style={{ ...td, textAlign:'right', fontSize:11, fontWeight:700,
                          background:'#f0f9f9', color:'var(--mint)' }}>{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── BATCHES TAB ── */}
        {tab === 'batches' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                  <th style={th}>Batch ID</th>
                  <th style={th}>แหล่งข้อมูล</th>
                  <th style={th}>นำเข้าเมื่อ</th>
                  <th style={th}>ลบ</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr><td colSpan={4} style={{ ...td, color:'#94a3b8', textAlign:'center' }}>ยังไม่มีประวัติ</td></tr>
                ) : batches.map((b, i) => (
                  <tr key={b.batch_id} style={{ background: i%2?'#f8fafc':'#fff' }}>
                    <td style={{ ...td, fontSize:11, color:'#64748b' }}>{b.batch_id}</td>
                    <td style={td}><SourceBadge source={b.source} /></td>
                    <td style={{ ...td, fontSize:11 }}>
                      {new Date(b.created_at).toLocaleString('th-TH', {
                        day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit'
                      })}
                    </td>
                    <td style={td}>
                      <button onClick={async () => {
                        if (!confirm('ลบ batch นี้?')) return;
                        try { await apiDelete('/product-sales/batch/' + b.batch_id); load(); }
                        catch (e) { alert(e.message); }
                      }} style={{ background:'none', border:'none', color:'#fca5a5',
                        cursor:'pointer', fontSize:12 }}>✕ ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </>)}
    </div>
  );
}

const th = { padding:'8px 12px', textAlign:'left', fontSize:12, fontWeight:700 };
const td = { padding:'7px 12px', borderBottom:'1px solid #f1f5f9' };
