import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';
import { sbRequest, sbRpc } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { PLATFORM_CONFIG, validateUploadHeaders, writeUploadRaw, runRefreshRpcs, rollbackBatch } from '../lib/uploads.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);

// พอร์ตจาก uploadDataFromWeb — multipart: file + platform + adminStart + adminEnd
router.post('/', requireRole('ADMIN', 'UPLOADER'), upload.single('file'), async (req, res) => {
  const startedAt = Date.now();
  try {
    const platform = String(req.body?.platform || '');
    const adminStart = req.body?.adminStart || null;
    const adminEnd = req.body?.adminEnd || null;
    const target = PLATFORM_CONFIG[platform];
    if (!target) return res.status(400).json({ error: 'ไม่พบ Platform: ' + platform });
    if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ CSV' });

    const csvText = req.file.buffer.toString('utf-8');
    const parsed = Papa.parse(csvText.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    const rows = parsed.data;
    if (!rows || rows.length <= 1) return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล หรือไม่มีแถวข้อมูลหลัง Header' });

    const validation = validateUploadHeaders(platform, rows[0]);
    if (!validation.ok) {
      return res.status(400).json({ error: 'ไฟล์นี้ขาดคอลัมน์สำคัญ: ' + validation.missing.join(', ') });
    }

    const result = await writeUploadRaw(platform, target.sheet, rows, req.file.originalname, adminStart, adminEnd, req.user.username);
    const refresh = await runRefreshRpcs(platform);

    await writeActivityLog(req.user, 'UPLOAD_DATA', platform, result.batchId, 'SUCCESS',
      `อัปโหลด ${req.file.originalname} (${result.inserted} แถว)`, { adminStart, adminEnd });

    res.json({
      ok: true,
      message: `อัปโหลดสำเร็จ: ${result.inserted} แถว → ${target.sheet}`,
      batchId: result.batchId,
      inserted: result.inserted,
      refresh: Object.keys(refresh),
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    await writeActivityLog(req.user, 'UPLOAD_DATA', req.body?.platform || '', '', 'FAILED', err.message);
    res.status(500).json({ error: err.message });
  }
});

// พอร์ตจาก getUploadLogs (Supabase path)
router.get('/logs', requirePermission('upload', 'uploadlog'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const rows = await sbRequest(
      'upload_batches?select=id,platform,source_sheet,file_name,admin_start_date,admin_end_date,total_rows,uploaded_by,status,created_at&order=created_at.desc&limit=' + limit,
      'get'
    );
    res.json((rows || []).map(row => ({
      timestamp: row.created_at || '',
      user: row.uploaded_by || '',
      batchId: row.id || '',
      fileName: row.file_name || '',
      platform: row.platform || '',
      sheetName: row.source_sheet || '',
      adminStart: row.admin_start_date || '',
      adminEnd: row.admin_end_date || '',
      totalRows: row.total_rows || 0,
      status: row.status || 'RECEIVED'
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก rollbackUploadLog — ลบ raw rows ของ batch + refresh summary
router.post('/rollback', requireRole('ADMIN'), async (req, res) => {
  try {
    const { batchId, platform } = req.body || {};
    if (!batchId) return res.status(400).json({ error: 'กรุณาระบุ batchId' });
    await rollbackBatch(batchId);
    if (platform) await runRefreshRpcs(platform);
    await writeActivityLog(req.user, 'ROLLBACK_UPLOAD', platform || '', batchId, 'SUCCESS', 'Rollback batch ' + batchId);
    res.json({ ok: true, message: 'Rollback สำเร็จ: ' + batchId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ตรวจสอบ coverage จริงจากข้อมูลใน raw_upload_rows (ไม่ใช้ batch date)
router.get('/coverage', requirePermission('upload'), async (req, res) => {
  try {
    const rows = await sbRpc('get_upload_month_coverage', {});
    const coverage = [];
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r.source_sheet && r.ym) coverage.push(r.source_sheet + ':' + r.ym);
      }
    }
    res.json({ coverage });
  } catch (err) {
    // ถ้า RPC ยังไม่มีใน Supabase ส่ง fallback เป็น empty array
    res.json({ coverage: [], _error: err.message });
  }
});

// ดึงข้อมูลจาก Google Sheet ที่ Publish to web แล้ว
router.post('/gsheet-sync', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  const SHEET_ID = process.env.GSHEET_DAILY_ID || '1RdnJQrPQHUsPYBzKxt5GiUeWy7kUeVnWFVXWwnyPzMA';
  const TABS = [
    { sheet: 'Tiktok',                      platform: 'TiktokAnalytics' },
    { sheet: 'Shopee',                       platform: 'ShopeeOrder'     },
    { sheet: 'Shopee Affiliate (รายเดือน)', platform: 'ShopeeAffiliate' },
    { sheet: 'Tiktok Affiliate (รายเดือน)', platform: 'TiktokAffiliate' },
  ];
  const results = [];
  for (const { sheet, platform } of TABS) {
    try {
      const pubId = process.env.GSHEET_PUBLISHED_ID;
      const url = pubId
        ? `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&sheet=${encodeURIComponent(sheet)}`
        : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'TGM-Server/1.0' } });
      if (!r.ok) { results.push({ sheet, platform, ok: false, error: `HTTP ${r.status} — Sheet อาจยังไม่ได้ Publish to web` }); continue; }
      const csvText = await r.text();
      if (csvText.includes('<!DOCTYPE') || csvText.includes('accounts.google.com')) {
        results.push({ sheet, platform, ok: false, error: 'ต้อง Publish to web ก่อน (File → Share → Publish to web → CSV)' }); continue;
      }
      const parsed = Papa.parse(csvText.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
      const rows = parsed.data;
      if (!rows || rows.length <= 1) { results.push({ sheet, platform, ok: false, error: 'ไม่มีข้อมูลใน sheet' }); continue; }
      // skip header validation for sheet-imported data (columns may differ from Seller Center format)
      const result = await writeUploadRaw(platform, PLATFORM_CONFIG[platform]?.sheet || platform, rows,
        `gsheet_${sheet}.csv`, null, null, req.user.username);
      await runRefreshRpcs(platform);
      await writeActivityLog(req.user, 'GSHEET_SYNC', platform, result.batchId, 'SUCCESS', `Sync ${sheet} (${result.inserted} แถว)`);
      results.push({ sheet, platform, ok: true, inserted: result.inserted, batchId: result.batchId });
    } catch (err) {
      results.push({ sheet, platform, ok: false, error: err.message });
    }
  }
  res.json({ ok: true, results });
});

// เรียก refresh ทุก summary ด้วยตนเอง
router.post('/refresh-all', requireRole('ADMIN'), async (req, res) => {
  try {
    const platforms = ['TiktokOrder', 'ShopeeOrder', 'MetaAds', 'ModernTrade', 'ManualFinance'];
    const out = {};
    for (const p of platforms) out[p] = Object.keys(await runRefreshRpcs(p));
    res.json({ ok: true, refreshed: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
