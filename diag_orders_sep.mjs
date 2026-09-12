/**
 * diag_orders_sep.mjs — เช็คออเดอร์ Sep ทุก source
 * node diag_orders_sep.mjs
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

async function main() {
  console.log('=== ตรวจออเดอร์ Sep 2026 (01–12) ===\n');

  // 1. product_sales_daily รวม orders ต่อ platform
  const psd = await sb(
    'product_sales_daily?select=platform,orders,revenue' +
    '&file_date=gte.2026-09-01&file_date=lte.2026-09-12'
  );
  const byPlatform = {};
  for (const r of psd) {
    const p = r.platform || 'Unknown';
    byPlatform[p] = byPlatform[p] || { orders: 0, revenue: 0 };
    byPlatform[p].orders  += Number(r.orders  || 0);
    byPlatform[p].revenue += Number(r.revenue || 0);
  }
  console.log('--- product_sales_daily (Sep) ต่อ platform ---');
  let psdTotal = 0;
  for (const [p, d] of Object.entries(byPlatform)) {
    console.log(`  ${p}: orders=${d.orders.toLocaleString()}, revenue=฿${d.revenue.toLocaleString()}`);
    psdTotal += d.orders;
  }
  console.log(`  รวม: ${psdTotal.toLocaleString()} orders`);

  // 2. RPC get_tiktok_gmv_audit
  console.log('\n--- TikTok GMV Audit (Sep) ---');
  try {
    const tt = await rpc('get_tiktok_gmv_audit', { p_start: '2026-09-01', p_end: '2026-09-12' });
    if (tt?.analytics) {
      console.log(`  analytics orders: ${tt.analytics.orders?.toLocaleString() || 'n/a'}`);
      console.log(`  analytics revenue: ฿${Number(tt.analytics.gmv || 0).toLocaleString()}`);
    }
  } catch(e) { console.log('  error:', e.message); }

  // 3. RPC get_shopee_audit
  console.log('\n--- Shopee Audit (Sep) ---');
  try {
    const sh = await rpc('get_shopee_audit', { p_start: '2026-09-01', p_end: '2026-09-12' });
    if (sh?.orders) {
      console.log(`  orders: ${sh.orders.total?.toLocaleString() || JSON.stringify(sh.orders)}`);
      console.log(`  revenue: ฿${Number(sh.summary?.revenue || 0).toLocaleString()}`);
    } else {
      console.log('  :', JSON.stringify(sh).slice(0, 200));
    }
  } catch(e) { console.log('  error:', e.message); }

  // 4. raw_upload_rows — นับแถวต่อ source_sheet สำหรับ Sep batches
  console.log('\n--- raw_upload_rows batches (Sep) ---');
  const batches = await sb(
    'upload_batches?select=source_sheet,file_name,total_rows,admin_start_date,admin_end_date,status' +
    '&admin_start_date=gte.2026-09-01&order=created_at.desc&limit=20'
  );
  if (!batches.length) {
    // ลอง admin_end_date
    const batches2 = await sb(
      'upload_batches?select=source_sheet,file_name,total_rows,admin_start_date,admin_end_date,status' +
      '&admin_end_date=gte.2026-09-01&admin_end_date=lte.2026-09-30&order=created_at.desc&limit=20'
    );
    batches2.forEach(b => {
      console.log(`  [${b.source_sheet}] ${b.file_name} | rows=${b.total_rows} | ${b.admin_start_date}→${b.admin_end_date} | ${b.status}`);
    });
  } else {
    batches.forEach(b => {
      console.log(`  [${b.source_sheet}] ${b.file_name} | rows=${b.total_rows} | ${b.admin_start_date}→${b.admin_end_date} | ${b.status}`);
    });
  }

  // 5. ดู field ออเดอร์ใน raw_upload_rows ของ Shopee (ตัวอย่าง)
  console.log('\n--- ตัวอย่าง Shopee row_data keys (5 rows) ---');
  try {
    const shopeeRows = await sb(
      'raw_upload_rows?select=row_data&source_sheet=eq.Shopee_Orders&limit=3'
    );
    shopeeRows.forEach((r, i) => {
      const keys = Object.keys(r.row_data || {});
      console.log(`  row ${i+1}: ${keys.slice(0, 8).join(', ')}...`);
      // หา field ที่เป็น order number หรือ quantity
      const orderKey = keys.find(k => /order|จำนวน|qty|ออเดอร์/i.test(k));
      if (orderKey) console.log(`    order field: "${orderKey}" =`, r.row_data[orderKey]);
    });
  } catch(e) { console.log('  error:', e.message); }
}

main().catch(console.error);
