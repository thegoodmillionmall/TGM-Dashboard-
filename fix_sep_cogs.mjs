/**
 * fix_sep_cogs.mjs
 * อัปเดต row_data ของ TT_Sales และ Shopee_Orders เดือน ก.ย. 2026
 * ให้มี English column alias (skusubtotalafterdiscount, totalamount)
 * จากนั้นเรียก refresh_product_sales_daily เพื่อ re-build COGS
 *
 * รัน: node fix_sep_cogs.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// โหลด .env
const envFile = join(__dir, 'server', '.env');
const env = Object.fromEntries(
  readFileSync(envFile, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

async function sb(path, method = 'GET', body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=minimal' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${t}`);
  }
  return method === 'GET' ? res.json() : null;
}

async function sbRpc(fn, args = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return res.json();
}

// Thai → English aliases เหมือนใน uploads.js
const ALIASES = {
  'ยอดรวมย่อยของskuหลังหักส่วนลด': 'skusubtotalafterdiscount',
  'ยอดรวมย่อยของ sku หลังหักส่วนลด': 'skusubtotalafterdiscount',
  'เวลาที่สร้าง': 'createdtime',
  'หมายเลขคำสั่งซื้อ': 'orderid',
  'ชื่อสินค้า': 'productname',
  'จำนวน': 'quantity',
  'สถานะ': 'orderstatus',
  'ยอดคืนเงิน/จำนวนคืน': 'refundamount',
  'ยอดขาย': 'totalamount',
  'วันที่': 'orderdate',
  'เลขคำสั่งซื้อ': 'orderid',
};

async function listBatches(sourceSheet) {
  const batches = await sb(
    `upload_batches?select=id,file_name,admin_start_date,admin_end_date,total_rows,status,created_at` +
    `&source_sheet=eq.${encodeURIComponent(sourceSheet)}` +
    `&admin_start_date=gte.2026-08-01&status=eq.RECEIVED&order=created_at.desc&limit=20`
  );
  return batches;
}

async function fixRowsByBatchId(batchId, label) {
  console.log(`  → batch ${batchId.slice(0,8)}... (${label})`);
  const rows = await sb(
    `raw_upload_rows?select=id,row_data&batch_id=eq.${batchId}&limit=5000`
  );
  let updated = 0;
  for (const row of rows) {
    const d = row.row_data || {};
    const newKeys = {};
    for (const [thKey, enKey] of Object.entries(ALIASES)) {
      if (d[thKey] !== undefined && d[enKey] === undefined) {
        newKeys[enKey] = d[thKey];
      }
    }
    if (Object.keys(newKeys).length > 0) {
      await sb(`raw_upload_rows?id=eq.${row.id}`, 'PATCH', { row_data: { ...d, ...newKeys } });
      updated++;
    }
  }
  console.log(`     พบ ${rows.length} rows, อัปเดต alias ${updated} rows`);
  return updated;
}

async function fixAllSepBatches(sourceSheet) {
  console.log(`\n=== ${sourceSheet} ===`);
  const batches = await listBatches(sourceSheet);
  if (!batches.length) { console.log('  ไม่พบ batch ใดเลย'); return; }
  for (const b of batches) {
    console.log(`  batch: ${b.file_name} | ${b.admin_start_date}→${b.admin_end_date} | rows=${b.total_rows} | status=${b.status}`);
    await fixRowsByBatchId(b.id, b.file_name);
  }
}

async function main() {
  console.log('🔧 Fix September COGS: เพิ่ม English alias ให้ row_data\n');
  console.log('📋 ค้นหา batch ที่มีอยู่จริงใน Supabase...');

  await fixAllSepBatches('TT_Sales');
  await fixAllSepBatches('Shopee_Orders');

  console.log('\n⏳ เรียก refresh_product_sales_daily...');
  const r1 = await sbRpc('refresh_product_sales_daily', {});
  console.log('refresh_product_sales_daily:', JSON.stringify(r1));

  console.log('\n⏳ เรียก refresh_tiktok_gmv_audit_daily...');
  const r2 = await sbRpc('refresh_tiktok_gmv_audit_daily', {});
  console.log('refresh_tiktok_gmv_audit_daily:', JSON.stringify(r2));

  console.log('\n✅ เสร็จแล้ว! refresh dashboard แล้วดู COGS ใหม่ได้เลยค่ะ');
}

main().catch(console.error);
