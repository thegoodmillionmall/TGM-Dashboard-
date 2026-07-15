// สคริปต์ตรวจสอบ: node debug.js
import 'dotenv/config';

const URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';

async function rpc(fn, payload) {
  const res = await fetch(URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log('---', fn, '→ HTTP', res.status);
  if (!res.ok) { console.log('ERROR BODY:', text.slice(0, 400)); return null; }
  let data;
  try { data = JSON.parse(text); } catch { console.log('ไม่ใช่ JSON:', text.slice(0, 200)); return null; }
  if (Array.isArray(data)) { console.log('(ตอบกลับเป็น array ยาว', data.length, ')'); data = data[0]; }
  if (typeof data === 'string') { console.log('(ตอบกลับเป็น string — double encoded!)'); data = JSON.parse(data); }
  console.log('top-level keys:', Object.keys(data || {}).join(', '));
  return data;
}

const start = '2026-01-01', end = '2026-06-30';
console.log('SUPABASE_URL =', URL || '(ว่าง!)');
console.log('KEY prefix   =', KEY.slice(0, 12) + '...');
console.log('ช่วงวันที่    =', start, '→', end, '\n');

const sh = await rpc('get_shopee_audit', { p_start: start, p_end: end });
if (sh) {
  console.log('orders summary :', JSON.stringify(sh.orders || null));
  console.log('settlement     :', JSON.stringify(sh.settlement || null));
  console.log('daily rows     :', (sh.daily || []).length, '| ตัวอย่าง:', JSON.stringify((sh.daily || [])[0] || null));
}

const tt = await rpc('get_tiktok_gmv_audit', { p_start: start, p_end: end });
if (tt) {
  console.log('analytics      :', JSON.stringify(tt.analytics || null));
  console.log('sales          :', JSON.stringify(tt.sales || null));
  console.log('daily rows     :', (tt.daily || []).length);
}

const mt = await rpc('get_moderntrade_audit', { p_start: start, p_end: end, p_channel: 'All' });
if (mt) console.log('mt summary     :', JSON.stringify(mt.summary || null));

const ads = await rpc('get_ads_audit', { p_start: start, p_end: end });
if (ads) {
  console.log('platforms keys :', Object.keys(ads.platforms || {}).join(', '));
  console.log('channels keys  :', Object.keys(ads.channels || {}).join(', '));
}
