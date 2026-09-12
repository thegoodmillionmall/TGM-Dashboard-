/**
 * diag_tt_sep1.mjs — เช็คข้อมูลจริงในไฟล์ TikTok Sep 1-6
 * node diag_tt_sep1.mjs
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
  // หา batch Sep 1-6 TikTok
  const batches = await sb(
    'upload_batches?select=id,file_name,admin_start_date,admin_end_date,total_rows,status' +
    '&source_sheet=eq.TT_Sales&admin_start_date=eq.2026-09-01&order=created_at.desc&limit=5'
  );
  console.log('Batch TT_Sales Sep 1-6:');
  batches.forEach(b => console.log(`  [${b.status}] ${b.file_name} id=${b.id.slice(0,8)} rows=${b.total_rows}`));

  const receivedBatch = batches.find(b => b.status === 'RECEIVED');
  if (!receivedBatch) { console.log('ไม่พบ RECEIVED batch'); return; }

  // ดู rows ใน batch นี้
  const rows = await sb(
    `raw_upload_rows?select=row_data&batch_id=eq.${receivedBatch.id}&limit=5`
  );
  console.log(`\nพบ ${rows.length} ตัวอย่างใน batch ${receivedBatch.id.slice(0,8)}`);

  if (!rows.length) { console.log('ไม่มีแถวข้อมูล!'); return; }

  const allKeys = Object.keys(rows[0].row_data || {});
  console.log('\nคอลัมน์ทั้งหมด:');
  console.log(' ', allKeys.join(', '));

  // หา date field และ product field
  const dateKey = allKeys.find(k => /created|date|วันที่|order.*time/i.test(k));
  const productKey = allKeys.find(k => /product.*name|ชื่อสินค้า|sku.*name|item.*name/i.test(k));

  console.log(`\ndate field: "${dateKey}"`);
  console.log(`product field: "${productKey}"`);

  console.log('\nตัวอย่างข้อมูล (5 แถว):');
  rows.forEach((r, i) => {
    const d = r.row_data;
    console.log(`  ${i+1}. date="${d[dateKey]}" | product="${String(d[productKey]||'').slice(0,40)}"`);
  });

  // ตรวจว่า date อยู่ในช่วง Sep ไหม
  console.log('\nวิเคราะห์ date:');
  const allRows = await sb(
    `raw_upload_rows?select=row_data&batch_id=eq.${receivedBatch.id}&limit=100`
  );
  const dateCounts = {};
  for (const r of allRows) {
    const raw = String(r.row_data[dateKey] || '');
    // แยก date part (DD/MM/YYYY หรือ YYYY-MM-DD)
    const m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // DD/MM/YYYY
    const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);   // YYYY-MM-DD
    let dateStr;
    if (m1) dateStr = `${m1[3]}-${m1[2]}-${m1[1]}`;
    else if (m2) dateStr = `${m2[1]}-${m2[2]}-${m2[3]}`;
    else dateStr = raw.slice(0, 10);
    dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
  }
  Object.entries(dateCounts).sort().forEach(([d, c]) => {
    console.log(`  ${d}: ${c} orders`);
  });
}

main().catch(console.error);
