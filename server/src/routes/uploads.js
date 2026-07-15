import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest } from '../supabase.js';
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
router.get('/logs', async (req, res) => {
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
