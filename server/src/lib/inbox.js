import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { PLATFORM_CONFIG, validateUploadHeaders, writeUploadRaw, runRefreshRpcs } from './uploads.js';
import { writeActivityLog } from './log.js';

const AUTO_USER = { username: 'inbox-auto', displayName: 'Inbox Auto Import', role: 'UPLOADER' };

// เรียงชื่อ platform ยาว→สั้น เพื่อ match prefix ที่เจาะจงที่สุดก่อน
// (เช่น TiktokAdsGMVLive ต้องชนะ TiktokAdsGMV)
const PLATFORM_KEYS = Object.keys(PLATFORM_CONFIG).sort((a, b) => b.length - a.length);

export function platformFromFileName(fileName) {
  const base = String(fileName || '').toLowerCase();
  return PLATFORM_KEYS.find(key => base.startsWith(key.toLowerCase())) || null;
}

// ดึงช่วงวันที่จากชื่อไฟล์ (ถ้ามี) เช่น ShopeeOrder_2026-06-01_2026-06-30.csv
function datesFromFileName(fileName) {
  const matches = String(fileName).match(/(\d{4}-\d{2}-\d{2})/g) || [];
  return { adminStart: matches[0] || null, adminEnd: matches[1] || matches[0] || null };
}

function ensureDirs(inboxDir) {
  for (const sub of ['', 'done', 'error']) {
    const dir = path.join(inboxDir, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function moveTo(inboxDir, sub, filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(inboxDir, sub, stamp + '_' + path.basename(filePath));
  fs.renameSync(filePath, dest);
  return dest;
}

export async function scanInbox(inboxDir) {
  ensureDirs(inboxDir);
  const files = fs.readdirSync(inboxDir)
    .filter(f => f.toLowerCase().endsWith('.csv'))
    .map(f => path.join(inboxDir, f))
    .filter(f => fs.statSync(f).isFile());

  const results = [];
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    try {
      // ข้ามไฟล์ที่เพิ่งถูกเขียน (อาจยัง copy ไม่เสร็จ)
      const age = Date.now() - fs.statSync(filePath).mtimeMs;
      if (age < 15000) { results.push({ fileName, status: 'WAITING', message: 'ไฟล์ใหม่เกินไป รอรอบถัดไป' }); continue; }

      const platform = platformFromFileName(fileName);
      if (!platform) {
        throw new Error('ตั้งชื่อไฟล์ไม่ตรงรูปแบบ ต้องขึ้นต้นด้วยชื่อ platform เช่น TiktokOrder_xxx.csv (ดู README ใน inbox)');
      }

      const csvText = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
      const rows = Papa.parse(csvText, { skipEmptyLines: 'greedy' }).data;
      if (!rows || rows.length <= 1) throw new Error('ไฟล์ไม่มีข้อมูลหลัง Header');

      const validation = validateUploadHeaders(platform, rows[0]);
      if (!validation.ok) throw new Error('ขาดคอลัมน์สำคัญ: ' + validation.missing.join(', '));

      const { adminStart, adminEnd } = datesFromFileName(fileName);
      const result = await writeUploadRaw(platform, PLATFORM_CONFIG[platform].sheet, rows, fileName, adminStart, adminEnd, AUTO_USER.username);
      await runRefreshRpcs(platform);
      moveTo(inboxDir, 'done', filePath);

      await writeActivityLog(AUTO_USER, 'INBOX_AUTO_IMPORT', platform, result.batchId, 'SUCCESS',
        `นำเข้าอัตโนมัติ ${fileName} (${result.inserted} แถว)`, { adminStart, adminEnd });
      results.push({ fileName, status: 'SUCCESS', platform, inserted: result.inserted, batchId: result.batchId });
      console.log(`[inbox] ✓ ${fileName} → ${platform} (${result.inserted} แถว)`);
    } catch (err) {
      try {
        const dest = moveTo(inboxDir, 'error', filePath);
        fs.writeFileSync(dest + '.สาเหตุ.txt', err.message, 'utf-8');
      } catch {}
      await writeActivityLog(AUTO_USER, 'INBOX_AUTO_IMPORT', fileName, '', 'FAILED', err.message);
      results.push({ fileName, status: 'FAILED', message: err.message });
      console.warn(`[inbox] ✗ ${fileName}: ${err.message}`);
    }
  }
  return results;
}

export function writeInboxReadme(inboxDir) {
  ensureDirs(inboxDir);
  const readme = path.join(inboxDir, 'README.txt');
  fs.writeFileSync(readme, [
    'โฟลเดอร์นำเข้าข้อมูลอัตโนมัติ — วางไฟล์ .csv ที่นี่ ระบบจะดูดเข้าเองภายใน 10 นาที',
    '',
    'กติกาการตั้งชื่อไฟล์: ต้องขึ้นต้นด้วยชื่อประเภทข้อมูล ตามด้วยอะไรก็ได้',
    '',
    'ชื่อที่ใช้ได้:',
    '  TiktokAnalytics_...csv   ยอด GMV รายวันจาก Seller Center',
    '  TiktokOrder_...csv       คำสั่งซื้อ TikTok',
    '  TiktokSettlement_...csv  ค่าธรรมเนียม/ยอดโอน TikTok',
    '  TiktokAffiliate_...csv   ค่าคอม TikTok',
    '  TiktokLive_...csv        ยอด Live',
    '  TiktokAdsManager_...csv  TikTok Ads Manager',
    '  TiktokAdsGMV_...csv      TikTok Ads GMV Max',
    '  TiktokAdsGMVLive_...csv  TikTok Ads GMV Live',
    '  ShopeeOrder_...csv       คำสั่งซื้อ Shopee',
    '  ShopeeSettlement_...csv  ยอดโอน Shopee',
    '  ShopeeAds_...csv         Shopee Ads',
    '  ShopeeAdsLive_...csv     Shopee Ads Live',
    '  ShopeeAffiliate_...csv   ค่าคอม Shopee',
    '  MetaAds_...csv           Meta Ads',
    '  ModernTrade_...csv       Modern Trade',
    '  ManualFinance_...csv     รายรับรายจ่าย Manual',
    '',
    '(ทางเลือก) ใส่ช่วงวันที่ของข้อมูลในชื่อไฟล์ได้: ShopeeOrder_2026-06-01_2026-06-30.csv',
    '',
    'ผลลัพธ์:',
    '  สำเร็จ  → ไฟล์ย้ายไปโฟลเดอร์ done',
    '  ผิดพลาด → ไฟล์ย้ายไปโฟลเดอร์ error พร้อมไฟล์ .สาเหตุ.txt บอกเหตุผล',
    '',
    'ดูประวัติทั้งหมดได้ที่หน้า "ประวัติการอัปโหลด" ในระบบ (ผู้อัปโหลด: inbox-auto)'
  ].join('\r\n'), 'utf-8');
}
