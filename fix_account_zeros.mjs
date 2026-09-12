/**
 * fix_account_zeros.mjs
 * เติมเลข 0 นำหน้าเลขบัญชีในตาราง payables
 * Rule: ถ้า account_no เป็นตัวเลขล้วน และสั้นกว่า 10 หลัก → pad ให้ครบ 10 หลัก
 *
 * รัน: node fix_account_zeros.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dir, 'server', '.env'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const URL  = env.SUPABASE_URL;
const KEY  = env.SUPABASE_SERVICE_KEY;

async function sb(path, method = 'GET', body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=minimal' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return method === 'GET' ? res.json() : null;
}

async function main() {
  console.log('🔧 เติมเลข 0 นำหน้าเลขบัญชีใน payables\n');

  // ดึงทุก payable ที่มี account_no
  const rows = await sb('payables?select=id,vendor,account_no&limit=1000');
  console.log(`พบทั้งหมด ${rows.length} รายการ`);

  let fixed = 0;
  for (const row of rows) {
    const acc = String(row.account_no || '').trim();
    // ข้ามถ้า: ว่าง, มีขีด/ตัวอักษร, ยาวครบ 10+ หลักแล้ว
    if (!acc || !/^\d+$/.test(acc) || acc.length >= 10) continue;

    const padded = acc.padStart(10, '0');
    console.log(`  แก้: ${row.vendor} | ${acc} → ${padded}`);
    await sb(`payables?id=eq.${row.id}`, 'PATCH', { account_no: padded });
    fixed++;
  }

  console.log(`\n✅ แก้ทั้งหมด ${fixed} รายการ`);
  if (fixed === 0) console.log('   (ไม่มีรายการที่ต้องแก้ หรือเลขบัญชีครบแล้ว)');
}

main().catch(console.error);
