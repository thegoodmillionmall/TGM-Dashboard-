/**
 * diag_daily_orders.mjs — ดูออเดอร์รายวัน Sep ว่าวันไหนขาด
 * node diag_daily_orders.mjs
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
  console.log('=== ออเดอร์รายวัน Sep 2026 ===\n');

  // 1. product_sales_daily รายวัน
  const psd = await sb(
    'product_sales_daily?select=file_date,platform,orders,revenue' +
    '&file_date=gte.2026-09-01&file_date=lte.2026-09-12&order=file_date.asc'
  );

  // รวมต่อวัน
  const byDay = {};
  for (const r of psd) {
    const d = r.file_date.slice(0, 10);
    if (!byDay[d]) byDay[d] = { tt: 0, sh: 0, ttRev: 0, shRev: 0 };
    if (r.platform === 'TikTok') { byDay[d].tt += Number(r.orders||0); byDay[d].ttRev += Number(r.revenue||0); }
    if (r.platform === 'Shopee') { byDay[d].sh += Number(r.orders||0); byDay[d].shRev += Number(r.revenue||0); }
  }

  // วันทั้งหมดใน Sep 1-12
  console.log('วันที่       TikTok  Shopee  รวม    สถานะ');
  console.log('─'.repeat(55));
  let totalTt = 0, totalSh = 0;
  for (let d = 1; d <= 12; d++) {
    const dateStr = `2026-09-${String(d).padStart(2,'0')}`;
    const day = byDay[dateStr];
    const tt = day?.tt || 0;
    const sh = day?.sh || 0;
    const total = tt + sh;
    totalTt += tt; totalSh += sh;
    const status = total === 0 ? '❌ ขาด' : total < 50 ? '⚠️ น้อย' : '✅';
    console.log(`${dateStr}  ${String(tt).padStart(6)}  ${String(sh).padStart(6)}  ${String(total).padStart(5)}  ${status}`);
  }
  console.log('─'.repeat(55));
  console.log(`รวม          ${String(totalTt).padStart(6)}  ${String(totalSh).padStart(6)}  ${String(totalTt+totalSh).padStart(5)}`);

  // 2. raw_upload_rows — นับแถวต่อวัน (จาก batch admin dates)
  console.log('\n=== Batch ที่มีสำหรับ Sep (TT_Sales + Shopee_Orders) ===');
  const batches = await sb(
    'upload_batches?select=source_sheet,file_name,total_rows,admin_start_date,admin_end_date,status' +
    '&source_sheet=in.(TT_Sales,Shopee_Orders)' +
    '&admin_end_date=gte.2026-09-01&admin_start_date=lte.2026-09-12' +
    '&order=admin_start_date.asc'
  );
  batches.forEach(b => {
    const ok = b.status === 'RECEIVED' ? '✅' : '❌ ROLLED_BACK';
    console.log(`  ${ok} [${b.source_sheet}] ${b.admin_start_date}→${b.admin_end_date} | rows=${b.total_rows}`);
  });

  // 3. ดูวันที่จริงในแต่ละ batch (sample จาก raw_upload_rows)
  console.log('\n=== วันที่จริงใน raw_upload_rows ต่อ batch (TT_Sales RECEIVED) ===');
  const ttBatches = batches.filter(b => b.source_sheet === 'TT_Sales' && b.status === 'RECEIVED');
  for (const b of ttBatches.slice(0, 3)) {
    // หา batch_id ก่อน
    const batchInfo = await sb(
      `upload_batches?select=id,file_name&file_name=eq.${encodeURIComponent(b.file_name)}&status=eq.RECEIVED&limit=1`
    );
    if (!batchInfo.length) continue;
    const batchId = batchInfo[0].id;

    // ดูตัวอย่าง row_data เพื่อหา date field
    const rows = await sb(
      `raw_upload_rows?select=row_data&batch_id=eq.${batchId}&limit=3`
    );
    if (!rows.length) continue;
    const sampleKeys = Object.keys(rows[0].row_data || {});
    const dateKey = sampleKeys.find(k => /order.*date|created|วันที่|date/i.test(k));
    console.log(`\n  [${b.file_name}] batch=${batchId.slice(0,8)}...`);
    console.log(`  date key: "${dateKey}"`);
    if (dateKey) {
      rows.forEach(r => console.log(`    → ${r.row_data[dateKey]}`));
    }
  }
}

main().catch(console.error);
