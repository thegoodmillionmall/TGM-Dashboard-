// รัน: node seed_products.mjs
// จากโฟลเดอร์ tgm-local/
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// อ่าน .env
const envText = readFileSync(path.join(__dirname, 'server/.env'), 'utf-8');
const env = Object.fromEntries(
  envText.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('ไม่พบ SUPABASE_URL หรือ SUPABASE_SERVICE_KEY ใน .env');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(path.join(__dirname, 'seeds/product-master.json'), 'utf-8'));

async function upsert(key, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ key, value, updated_by: 'seed-script', updated_at: new Date().toISOString() }])
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

console.log('กำลังบันทึกสินค้า...');
await upsert('product_master', seed.productMaster);
console.log(`✅ product_master: ${seed.productMaster.length} รายการ`);

await upsert('product_costs_meta', seed.productCostsMeta);
console.log(`✅ product_costs_meta: ${Object.keys(seed.productCostsMeta).length} รายการ`);

await upsert('sku_costs_reference', seed.skuCosts);
console.log(`✅ sku_costs_reference: ${Object.keys(seed.skuCosts).length} รายการ`);

console.log('\n✅ เสร็จ! เปิดหน้า COGS ในระบบแล้ว refresh ได้เลย');
