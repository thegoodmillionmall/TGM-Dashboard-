/**
 * refresh_now.mjs — เช็ค batch ใหม่ แล้ว refresh product_sales_daily
 * node refresh_now.mjs
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
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
               'statement-timeout': '300000' },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. เช็ค batch ใหม่ Sep 7-9
  console.log('📋 Batch Sep 7–9 ปัจจุบัน:');
  const batches = await sb(
    'upload_batches?select=source_sheet,file_name,total_rows,admin_start_date,admin_end_date,status' +
    '&admin_start_date=gte.2026-09-07&admin_start_date=lte.2026-09-09' +
    '&source_sheet=in.(TT_Sales,Shopee_Orders)&order=created_at.desc'
  );
  batches.forEach(b => {
    const ok = b.status === 'RECEIVED' ? '✅' : '❌';
    console.log(`  ${ok} [${b.source_sheet}] ${b.file_name} | rows=${b.total_rows} | ${b.status}`);
  });

  const hasNew = batches.some(b => b.status === 'RECEIVED');
  if (!hasNew) {
    console.log('\n⚠️ ยังไม่มี batch RECEIVED ใหม่ — ลองดูใน Upload History อีกที');
    return;
  }

  // 2. Refresh product_sales_daily
  console.log('\n🔄 กำลัง refresh product_sales_daily (อาจใช้เวลา 1-2 นาที)...');
  try {
    const result = await rpc('refresh_product_sales_daily', {});
    console.log('✅ Refresh สำเร็จ:', JSON.stringify(result));
  } catch (e) {
    if (e.message.includes('57014') || e.message.includes('timeout')) {
      console.log('⏱️ Timeout — ต้องรันใน Supabase SQL Editor แทน:');
      console.log('   SET statement_timeout = \'300s\';');
      console.log('   SELECT refresh_product_sales_daily();');
    } else {
      throw e;
    }
  }

  // 3. เช็คออเดอร์ใหม่
  console.log('\n📊 ออเดอร์ Sep หลัง refresh:');
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
  let total = 0;
  for (const [p, d] of Object.entries(byPlatform)) {
    console.log(`  ${p}: ${d.orders.toLocaleString()} orders | ฿${d.revenue.toLocaleString()}`);
    total += d.orders;
  }
  console.log(`  รวม: ${total.toLocaleString()} orders`);
}

main().catch(console.error);
