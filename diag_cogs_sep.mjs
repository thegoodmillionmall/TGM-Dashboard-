/**
 * diag_cogs_sep.mjs — ตรวจสอบว่า COGS ขาดทำไม
 * รัน: node diag_cogs_sep.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dir, 'server', '.env'), 'utf-8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;

async function sb(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function rpc(fn, params = {}) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

const SEP_START = '2026-09-01';
const SEP_END   = '2026-09-12';

async function main() {
  console.log('=== COGS Diagnostic (Sep 2026) ===\n');

  // 1. product_costs_master — RPC คืน {rows:[...], source:'...'} ต้องเอา .rows
  let costs = [];
  try {
    const costsRaw = await rpc('get_product_costs_master', {});
    if (Array.isArray(costsRaw)) costs = costsRaw;
    else if (costsRaw?.rows) costs = costsRaw.rows;
    else if (costsRaw) costs = [costsRaw];
  } catch {}
  if (!costs.length) {
    try {
      const rows = await sb('product_costs_master?select=*&limit=500');
      costs = rows || [];
    } catch (e2) { console.log('costs fallback error:', e2.message); }
  }
  console.log(`product_costs_master: ${costs.length} รายการ`);
  if (costs.length) console.log('  ตัวอย่าง keys:', Object.keys(costs[0]).join(', '));

  // 1b. ดูโครงสร้างตาราง product_sales_daily ก่อน
  const sampleRow = await sb('product_sales_daily?select=*&limit=1');
  if (sampleRow && sampleRow[0]) {
    console.log('\ncolumns ใน product_sales_daily:', Object.keys(sampleRow[0]).join(', '));
  }

  // 2. product_sales_daily สำหรับ Sep — คอลัมน์จริง: file_date, platform, product_name, rows, orders, revenue, refreshed_at
  const sales = await sb(
    `product_sales_daily?select=product_name,platform,orders,revenue` +
    `&file_date=gte.${SEP_START}&file_date=lte.${SEP_END}&order=revenue.desc`
  );
  console.log(`product_sales_daily (Sep): ${sales.length} rows`);

  // รวมยอดต่อชื่อ+platform
  const salesMap = {};
  for (const r of sales) {
    const k = `${r.product_name}|${r.platform}`;
    if (!salesMap[k]) salesMap[k] = { name: r.product_name, platform: r.platform, orders: 0, revenue: 0 };
    salesMap[k].orders  += Number(r.orders  || 0);
    salesMap[k].revenue += Number(r.revenue || 0);
  }
  const salesList = Object.values(salesMap).sort((a, b) => b.revenue - a.revenue);

  console.log(`\n--- product_sales_daily ยอดรวม Sep ---`);
  const totalOrders  = salesList.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = salesList.reduce((s, r) => s + r.revenue, 0);
  console.log(`Orders: ${totalOrders.toLocaleString()}, Revenue: ฿${totalRevenue.toLocaleString()}`);

  // 3. จับคู่ชื่อ
  // หา key ชื่อสินค้าจากตาราง costs (อาจเป็น productName หรือ product_name หรือ name)
  const nameKey = costs[0] ? (costs[0].productName !== undefined ? 'productName' : costs[0].product_name !== undefined ? 'product_name' : 'name') : 'name';
  const typeKey = costs[0] ? (costs[0].costType !== undefined ? 'costType' : 'cost_type') : 'costType';
  const valKey  = costs[0] ? (costs[0].costValue !== undefined ? 'costValue' : 'cost_value') : 'costValue';
  console.log(`  ใช้ keys: name=${nameKey}, type=${typeKey}, val=${valKey}`);

  const costsMap = {};
  for (const c of costs) {
    const n = String(c[nameKey] || '').trim();
    if (n) costsMap[n] = c;
  }

  let matched = 0, unmatched = 0;
  let totalCogs = 0;
  console.log('\n--- สินค้าที่ match ได้ (Top 10 by COGS) ---');
  const matchedList = [];

  for (const s of salesList) {
    const c = costsMap[s.name];
    if (!c) { unmatched++; continue; }
    matched++;
    const val = Number(c[valKey] || 0);
    const type = String(c[typeKey] || '%').toUpperCase();
    const cogs = type === '%' || type === 'PERCENT'
      ? s.revenue * (val / 100)
      : val * s.orders;   // FIXED = บาท/ออเดอร์
    totalCogs += cogs;
    matchedList.push({ name: s.name, platform: s.platform, orders: s.orders, revenue: s.revenue, type, val, cogs });
  }

  matchedList.sort((a, b) => b.cogs - a.cogs).slice(0, 10).forEach(m => {
    console.log(`  ✅ [${m.platform}] ${m.name.slice(0, 50)}`);
    console.log(`      orders=${m.orders}, type=${m.type} val=${m.val} → COGS=฿${m.cogs.toFixed(0)}`);
  });

  console.log(`\n--- สินค้าใน sales ที่ ไม่มี cost entry (Top 10 by revenue) ---`);
  salesList.filter(s => !costsMap[s.name]).slice(0, 10).forEach(s => {
    console.log(`  ❌ [${s.platform}] ${s.name.slice(0, 60)} | rev=฿${s.revenue.toFixed(0)}`);
  });

  console.log(`\n--- ชื่อใน costs ที่ ไม่ตรงกับ sales (ตัวอย่าง 10 อัน) ---`);
  const salesNames = new Set(salesList.map(s => s.name));
  const unmatchedCosts = costs.filter(c => {
    const n = String(c.productName || c.name || '').trim();
    return n && !salesNames.has(n);
  });
  unmatchedCosts.slice(0, 10).forEach(c => {
    const n = String(c.productName || c.name || '').trim();
    console.log(`  ⚠️  "${n.slice(0, 60)}"`);
  });

  console.log(`\n=== สรุป ===`);
  console.log(`matched: ${matched} / ไม่ match: ${unmatched}`);
  console.log(`unmatchedCosts (ใน costs แต่ไม่มีใน sales): ${unmatchedCosts.length}`);
  console.log(`COGS คำนวณได้จากที่ match: ฿${totalCogs.toLocaleString(undefined, {maximumFractionDigits:0})}`);
  console.log(`\nถ้า COGS ต่ำ → ดูที่ ❌ ด้านบน (สินค้าขายได้แต่ไม่มี cost) และ ⚠️ (cost ตั้งไว้แต่ชื่อไม่ตรง)`);
}

main().catch(console.error);
