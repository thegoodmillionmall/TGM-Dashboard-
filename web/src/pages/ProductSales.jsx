import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api.js';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const fmt  = (n, d = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = v => '฿' + fmt(v, 0);

const th = { padding:'8px 12px', textAlign:'left', fontSize:12, fontWeight:700 };
const td = { padding:'7px 12px', borderBottom:'1px solid #f1f5f9' };

// SKU → สีแสดงผล
const SKU_COLORS = {
  'TG01':         '#B2D8D8',
  'TG01-OLD':     '#7DB9B9',
  'TG-blue':      '#60c4c4',
  'TG-Green':     '#4ade80',
  'TG-Pink':      '#f472b6',
  'TG-BoostDrop': '#f97316',
  'TG-HairBrush': '#8b5cf6',
  'TG-Karaglow':  '#ec4899',
  'TG-Retox':     '#14b8a6',
};
const DEFAULT_COLOR = '#94a3b8';

// สรุป SKU ทั้งหมดในตะกร้า: ยิงคูณจำนวนชิ้น
function calcSkuBreakdown(comps, units) {
  return (comps || [])
    .filter(c => c.sku && c.sku !== '__manual__')
    .map(c => ({ sku: c.sku, name: c.name || c.sku, units }));
}

export default function ProductSales() {
  const [tab,        setTab]        = useState('basket');
  const [byName,     setByName]     = useState([]);
  const [monthly,    setMonthly]    = useState([]);
  const [byProd,     setByProd]     = useState([]);
  const [meta,       setMeta]       = useState({});
  const [master,     setMaster]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState('');
  const [expanded,   setExpanded]   = useState(null); // productName

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [nameData, ovData, metaData, masterData] = await Promise.all([
        apiGet('/product-sales/by-name'),
        apiGet('/product-sales/overview'),
        apiGet('/finance/product-costs-meta').catch(() => ({})),
        apiGet('/finance/product-master').catch(() => []),
      ]);
      setByName(nameData || []);
      setMonthly(ovData.summary || []);
      setByProd(ovData.monthlyByProduct || []);
      setMeta(metaData || {});
      setMaster(masterData || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const masterMap = Object.fromEntries((master || []).map(p => [p.sku, p]));
  const months = [...new Set(byProd.map(r => r.year_month))].sort();

  // ── SKU aggregate totals (across all baskets) ──
  const skuTotals = {};
  for (const row of byName) {
    const comps = (meta[row.productName] || {}).components || [];
    for (const c of comps) {
      if (!c.sku || c.sku === '__manual__') continue;
      if (!skuTotals[c.sku]) skuTotals[c.sku] = { sku: c.sku, name: c.name || c.sku, units: 0 };
      skuTotals[c.sku].units += row.units;
    }
  }
  const skuList = Object.values(skuTotals).sort((a, b) => b.units - a.units);

  // ── Trend bar ──
  const skuKeys = skuList.map(s => s.sku);
  const trendData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, mo - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    }),
    datasets: skuKeys.map(sku => ({
      label: masterMap[sku]?.name || sku,
      data: months.map(m => {
        let total = 0;
        for (const row of byName) {
          const comps = (meta[row.productName] || {}).components || [];
          const hasThisSku = comps.some(c => c.sku === sku);
          if (hasThisSku && row.monthly && row.monthly[m]) total += row.monthly[m];
        }
        return total;
      }),
      backgroundColor: SKU_COLORS[sku] || DEFAULT_COLOR,
      stack: 'units',
    })),
  };
  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 } } } },
    scales: {
      x: { stacked: true, ticks: { font: { family: 'Kanit', size: 11 } } },
      y: { stacked: true, ticks: { font: { family: 'Kanit', size: 11 } } },
    },
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

  const totalUnits = byName.reduce((s, r) => s + r.units, 0);
  const totalRevenue = byName.reduce((s, r) => s + r.net_revenue, 0);
  const totalMonths = months.length;
  const configuredCount = byName.filter(r => (meta[r.productName] || {}).components?.length > 0).length;

  return (
    <div style={{ maxWidth:'100%' }}>
      <div className="page-title">สินค้าขายดี</div>
      <div className="page-sub">ข้อมูลจากออเดอร์จริง แยกตามตะกร้าที่ตั้งค่าใน COGS</div>

      {err && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'10px 14px', marginBottom:12, color:'#dc2626', fontSize:13 }}>⚠️ {err}</div>}

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
        {[
          { label:'ชิ้นที่ขายได้',     value: fmt(totalUnits) + ' ชิ้น' },
          { label:'ยอดขายรวม',         value: fmtM(totalRevenue) },
          { label:'จำนวนตะกร้า',       value: byName.length + ' แบบ' },
          { label:'ตั้งค่าส่วนประกอบ', value: configuredCount + '/' + byName.length },
          { label:'เดือนที่มีข้อมูล',  value: totalMonths + ' เดือน' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding:'12px 14px', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--mint)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {tabBtn('basket', '🧺 ตะกร้า/สินค้า')}
        {tabBtn('sku',    '📦 สรุปรายชิ้น')}
        {tabBtn('trend',  '📈 เทรนด์รายเดือน')}
        {tabBtn('monthly','📅 รายเดือน')}
      </div>

      {/* ── BASKET TAB ── */}
      {tab === 'basket' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                <th style={{ ...th, width:28 }}></th>
                <th style={th}>ชื่อตะกร้า/สินค้า (จากออเดอร์)</th>
                <th style={{ ...th, textAlign:'right', width:90 }}>ชิ้นรวม</th>
                <th style={{ ...th, textAlign:'right', width:110 }}>ยอดสุทธิ</th>
                <th style={{ ...th, width:260 }}>ส่วนประกอบ</th>
              </tr>
            </thead>
            <tbody>
              {byName.map((row, i) => {
                const m = meta[row.productName] || {};
                const comps = m.components || [];
                const isExp = expanded === row.productName;
                const hasComps = comps.length > 0;
                return (
                  <>
                    <tr key={row.productName} style={{ background: i%2?'#f8fafc':'#fff',
                      cursor: hasComps ? 'pointer' : 'default' }}
                      onClick={() => hasComps && setExpanded(isExp ? null : row.productName)}>
                      <td style={{ ...td, textAlign:'center', color:'#94a3b8', fontSize:11 }}>
                        {hasComps ? (isExp ? '▲' : '▼') : ''}
                      </td>
                      <td style={{ ...td }}>
                        <div style={{ fontSize:12, color:'#1a2a3a', lineHeight:1.4 }}>{row.productName}</div>
                        {!hasComps && (
                          <div style={{ fontSize:10, color:'#f59e0b', marginTop:2 }}>⚠️ ยังไม่ตั้งค่าส่วนประกอบใน COGS</div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign:'right', fontWeight:700, color:'var(--mint)' }}>{fmt(row.units)}</td>
                      <td style={{ ...td, textAlign:'right' }}>{fmtM(row.net_revenue)}</td>
                      <td style={{ ...td }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {comps.filter(c => c.sku && c.sku !== '__manual__').map((c, ci) => (
                            <span key={ci} style={{ display:'inline-flex', alignItems:'center', gap:3,
                              background: SKU_COLORS[c.sku] ? SKU_COLORS[c.sku] + '30' : '#f1f5f9',
                              border: '1px solid ' + (SKU_COLORS[c.sku] || DEFAULT_COLOR),
                              borderRadius:99, padding:'1px 8px', fontSize:10, fontWeight:600,
                              color:'#1a2a3a' }}>
                              <span style={{ width:7, height:7, borderRadius:3, background: SKU_COLORS[c.sku] || DEFAULT_COLOR, display:'inline-block' }} />
                              {c.sku}
                            </span>
                          ))}
                          {comps.filter(c => !c.sku || c.sku === '__manual__').map((c, ci) => (
                            <span key={'m'+ci} style={{ fontSize:10, color:'#94a3b8' }}>{c.name}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isExp && hasComps && (
                      <tr key={row.productName + '_detail'} style={{ background:'#f0f9f9' }}>
                        <td colSpan={5} style={{ padding:'10px 20px 14px 48px' }}>
                          <div style={{ fontSize:11, color:'#5a6a7a', marginBottom:6, fontWeight:600 }}>
                            แยกชิ้น: {fmt(row.units)} ออเดอร์ × ส่วนประกอบ
                          </div>
                          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                            {comps.filter(c => c.sku && c.sku !== '__manual__').map((c, ci) => (
                              <div key={ci} style={{ background:'#fff', border:'1px solid #e2e8f0',
                                borderRadius:8, padding:'8px 14px', minWidth:140 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                                  <span style={{ width:8, height:8, borderRadius:2,
                                    background: SKU_COLORS[c.sku] || DEFAULT_COLOR, display:'inline-block' }} />
                                  <span style={{ fontSize:11, fontWeight:700 }}>{c.sku}</span>
                                </div>
                                <div style={{ fontSize:10, color:'#5a6a7a', marginBottom:4 }}>{masterMap[c.sku]?.name || c.name}</div>
                                <div style={{ fontSize:16, fontWeight:800, color:'var(--mint)' }}>{fmt(row.units)} ชิ้น</div>
                                <div style={{ fontSize:10, color:'#94a3b8' }}>ต้นทุน ฿{c.cost}/ชิ้น</div>
                              </div>
                            ))}
                          </div>
                          {/* รายเดือน */}
                          {Object.keys(row.monthly || {}).length > 0 && (
                            <div style={{ marginTop:10 }}>
                              <div style={{ fontSize:11, color:'#5a6a7a', fontWeight:600, marginBottom:4 }}>รายเดือน</div>
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                {Object.entries(row.monthly).sort().map(([m, u]) => (
                                  <span key={m} style={{ background:'#fff', border:'1px solid #e2e8f0',
                                    borderRadius:6, padding:'3px 10px', fontSize:11 }}>
                                    {new Date(m+'-01').toLocaleDateString('th-TH',{month:'short',year:'2-digit'})}: <b>{fmt(u)}</b>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SKU SUMMARY TAB ── */}
      {tab === 'sku' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>ยอดรวมแต่ละ SKU (จากทุกตะกร้า)</div>
            <div style={{ height: Math.max(200, skuList.length * 40) }}>
              <Bar
                data={{
                  labels: skuList.map(s => masterMap[s.sku]?.name || s.sku),
                  datasets: [{
                    label: 'จำนวนชิ้น',
                    data: skuList.map(s => s.units),
                    backgroundColor: skuList.map(s => SKU_COLORS[s.sku] || DEFAULT_COLOR),
                  }]
                }}
                options={{
                  indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { font: { family:'Kanit', size:11 } } },
                    y: { ticks: { font: { family:'Kanit', size:11 } } }
                  }
                }}
              />
            </div>
          </div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                  <th style={th}>SKU</th>
                  <th style={th}>ชื่อ</th>
                  <th style={{ ...th, textAlign:'right' }}>ชิ้นรวม</th>
                  <th style={{ ...th, textAlign:'right' }}>ต้นทุน/ชิ้น</th>
                </tr>
              </thead>
              <tbody>
                {skuList.map((s, i) => (
                  <tr key={s.sku} style={{ background: i%2?'#f8fafc':'#fff' }}>
                    <td style={{ ...td, display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:10, height:10, borderRadius:3,
                        background: SKU_COLORS[s.sku] || DEFAULT_COLOR, display:'inline-block', flexShrink:0 }} />
                      <span style={{ fontFamily:'monospace', fontSize:11 }}>{s.sku}</span>
                    </td>
                    <td style={td}>{masterMap[s.sku]?.name || s.name}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:700, color:'var(--mint)' }}>{fmt(s.units)}</td>
                    <td style={{ ...td, textAlign:'right' }}>
                      {masterMap[s.sku]?.cost ? '฿' + masterMap[s.sku].cost : '-'}
                    </td>
                  </tr>
                ))}
                {skuList.length === 0 && (
                  <tr><td colSpan={4} style={{ ...td, textAlign:'center', color:'#94a3b8', padding:24 }}>
                    ยังไม่มีข้อมูล — ตั้งค่าส่วนประกอบในหน้า COGS ก่อน
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TREND TAB ── */}
      {tab === 'trend' && (
        <div className="card" style={{ padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>
            เทรนด์รายเดือน (จำนวนชิ้น แยก SKU จากทุกตะกร้า)
          </div>
          {skuKeys.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8', padding:32 }}>
              ยังไม่มีข้อมูล SKU — ตั้งค่าส่วนประกอบในหน้า COGS ก่อน
            </div>
          ) : (
            <div style={{ height:340 }}>
              <Bar data={trendData} options={trendOpts} />
            </div>
          )}
        </div>
      )}

      {/* ── MONTHLY TAB ── */}
      {tab === 'monthly' && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2a3a', color:'#fff' }}>
                <th style={th}>เดือน</th>
                <th style={{ ...th, textAlign:'right' }}>จำนวนชิ้น</th>
                <th style={{ ...th, textAlign:'right' }}>ยอดสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m, i) => (
                <tr key={m.year_month} style={{ background: i%2?'#f8fafc':'#fff' }}>
                  <td style={{ ...td, fontWeight:600 }}>
                    {new Date(m.year_month+'-01').toLocaleDateString('th-TH',{month:'long', year:'numeric'})}
                  </td>
                  <td style={{ ...td, textAlign:'right', fontWeight:600, color:'var(--mint)' }}>{fmt(m.units)}</td>
                  <td style={{ ...td, textAlign:'right' }}>{fmtM(m.net_revenue)}</td>
                </tr>
              ))}
              <tr style={{ background:'#1a2a3a', fontWeight:700 }}>
                <td style={{ ...td, color:'#B2D8D8' }}>รวม</td>
                <td style={{ ...td, textAlign:'right', color:'#B2D8D8' }}>{fmt(monthly.reduce((s,m)=>s+m.units,0))}</td>
                <td style={{ ...td, textAlign:'right', color:'#e2e8f0' }}>{fmtM(monthly.reduce((s,m)=>s+m.net_revenue,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
