/**
 * diag_shopee_dates.mjs — เช็ควันที่จริงใน raw_upload_rows ของ Shopee Sep 1-11
 * node diag_shopee_dates.mjs
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

async function main() {
  // หา batch Shopee Sep 1-11 ที่ RECEIVED
  const batches = await sb(
    'upload_batches?select=id,file_name,admin_start_date,admin_end_date,total_rows,status' +
    '&source_sheet=eq.Shopee_Orders&status=eq.RECEIVED' +
    '&admin_start_date=gte.2026-09-01&admin_end_date=lte.2026-09-15' +
    '&order=created_at.desc&limit=5'
  );
  console.log('=== Shopee RECEIVED batches (Sep) ===');
  batches.forEach(b => console.log(`  [${b.status}] ${b.file_name} | ${b.admin_start_date}→${b.admin_end_date} | rows=${b.total_rows}`));

  if (!batches.length) { console.log('ไม่พบ batch'); return; }

  const batch = batches[0];
  console.log(`\nกำลังวิเคราะห์ batch: ${batch.id.slice(0,8)}... (${batch.file_name})`);

  // ดู keys ของ row_data
  const sample = await sb(`raw_upload_rows?select=row_data&batch_id=eq.${batch.id}&limit=3`);
  if (!sample.length) { console.log('ไม่มีแถว!'); return; }
  const allKeys = Object.keys(sample[0].row_data || {});
  console.log('\nคอลัมน์ใน row_data:');
  console.log(' ', allKeys.join(', '));

  // หา date key
  const dateKey = allKeys.find(k => /^(orderdate|วันที่|order.*date|date)$/i.test(k)) ||
                  allKeys.find(k => /date|วันที่/i.test(k));
  console.log(`\ndate key: "${dateKey}"`);

  if (!dateKey) { console.log('⚠️ ไม่พบ date column!'); return; }

  // ดู 5 ตัวอย่าง
  console.log('\nตัวอย่าง 5 แถว:');
  sample.slice(0, 3).forEach((r, i) => {
    console.log(`  ${i+1}. ${dateKey}="${r.row_data[dateKey]}" | order="${r.row_data['เลขคำสั่งซื้อ'] || r.row_data['orderid'] || '?'}"`);
  });

  // นับวันที่จากทุก rows ใน batch (ดึงมาครั้งละ 200)
  console.log('\n⏳ กำลังโหลด rows ทั้งหมด...');
  const batchSize = 200;
  let offset = 0;
  const dateCounts = {};
  let totalLoaded = 0;

  while (true) {
    const rows = await sb(
      `raw_upload_rows?select=row_data&batch_id=eq.${batch.id}` +
      `&limit=${batchSize}&offset=${offset}`
    );
    if (!rows.length) break;
    for (const r of rows) {
      const raw = String(r.row_data[dateKey] || '').trim();
      const d = raw.slice(0, 10); // เอาแค่ YYYY-MM-DD
      dateCounts[d] = (dateCounts[d] || 0) + 1;
    }
    totalLoaded += rows.length;
    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  console.log(`\n=== วันที่ใน raw_upload_rows (โหลดมา ${totalLoaded} rows) ===`);
  const entries = Object.entries(dateCounts).sort();
  if (entries.length === 0) {
    console.log('⚠️ ไม่พบวันที่เลย!');
  } else {
    entries.forEach(([d, c]) => console.log(`  ${d}: ${c} rows`));
  }

  if (entries.length === 1) {
    console.log('\n🔴 ปัญหา: ทุก row มีวันที่เดียวกัน!');
    console.log('   → ไฟล์ที่อัพจริงๆ อาจมีวันที่เดียวทั้งไฟล์');
    console.log('   → หรือ refresh_product_sales_daily ใช้ admin_start_date ไม่ใช่ orderdate');

    // ตรวจว่า value ของ dateKey มีหรือเปล่า
    const firstRows = await sb(
      `raw_upload_rows?select=row_data&batch_id=eq.${batch.id}&limit=5&offset=300`
    );
    console.log('\nตัวอย่าง row ช่วงกลางไฟล์ (offset 300):');
    firstRows.forEach((r, i) => {
      console.log(`  ${i+1}. ${dateKey}="${r.row_data[dateKey]}" | order="${r.row_data['เลขคำสั่งซื้อ'] || r.row_data['orderid'] || '?'}"`);
    });
  } else {
    console.log(`\n✅ มี ${entries.length} วันที่ต่างกัน — ข้อมูลใน raw_upload_rows ถูกต้อง`);
    console.log('   → ปัญหาน่าจะอยู่ที่ refresh_product_sales_daily RPC ใน Supabase');
    console.log('   → ตรวจสอบ RPC ด้วย: SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = \'refresh_product_sales_daily\';');
  }
}

main().catch(console.error);
