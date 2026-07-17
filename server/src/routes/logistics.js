import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest } from '../supabase.js';
import { validateUploadHeaders, writeUploadRaw } from '../lib/uploads.js';
import { writeActivityLog } from '../lib/log.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.use(requireAuth);

// ดึงสรุปขนส่งรายวัน — group by วันที่จัดส่ง + แพลตฟอร์ม
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = req.query;
    const rows = await sbRequest('raw_upload_rows?select=row_data&source_sheet=eq.Logistics&order=row_index.asc&limit=100000', 'get');

    const dayMap = {};
    for (const r of (rows || [])) {
      const d = r.row_data || {};
      const rawDate = String(d['วันที่จัดส่ง'] || d['วันที่สั่งซื้อ'] || '').slice(0, 10);
      if (!rawDate || rawDate.length < 10) continue;
      if (start && rawDate < start) continue;
      if (end   && rawDate > end)   continue;

      const platform = String(d['แพลตฟอร์ม'] || 'Other').trim();
      const status   = String(d['สถานะคำสั่งซื้อ'] || '').trim();
      const shipped  = Number(d['จำนวนสินค้าที่ส่งจริง'] || 0);
      const returned = Number(d['สินค้าตีกลับจริง'] || d['จํานวนสินค้าตีกลับ'] || 0);
      const revenue  = Number(String(d['ราคาสินค้า'] || d['จำนวนเงินที่ควรได้รับ'] || 0).toString().replace(/,/g, ''));
      const cogs     = Number(String(d['ต้นทุนสินค้า'] || 0).toString().replace(/,/g, ''));
      const grossProfit = Number(String(d['กำไรขั้นต้น'] || 0).toString().replace(/,/g, ''));

      const key = `${rawDate}|${platform}`;
      if (!dayMap[key]) {
        dayMap[key] = { date: rawDate, platform, orders: 0, shipped: 0, returned: 0, revenue: 0, cogs: 0, grossProfit: 0, statusCounts: {} };
      }
      const slot = dayMap[key];
      slot.orders++;
      slot.shipped  += shipped;
      slot.returned += returned;
      slot.revenue  += revenue;
      slot.cogs     += cogs;
      slot.grossProfit += grossProfit;
      slot.statusCounts[status] = (slot.statusCounts[status] || 0) + 1;
    }

    const daily = Object.values(dayMap).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.platform < b.platform ? -1 : 1
    );

    const totals = daily.reduce((acc, r) => {
      acc.orders      += r.orders;
      acc.shipped     += r.shipped;
      acc.returned    += r.returned;
      acc.revenue     += r.revenue;
      acc.cogs        += r.cogs;
      acc.grossProfit += r.grossProfit;
      return acc;
    }, { orders: 0, shipped: 0, returned: 0, revenue: 0, cogs: 0, grossProfit: 0 });

    res.json({ daily, totals, rowsRead: (rows || []).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// อัปโหลด CSV ขนส่ง
router.post('/upload', requireRole('ADMIN', 'UPLOADER'), upload.single('file'), async (req, res) => {
  try {
    const { adminStart, adminEnd } = req.body || {};
    if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ CSV' });

    const csvText = req.file.buffer.toString('utf-8');
    const parsed  = Papa.parse(csvText.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    const rows    = parsed.data;
    if (!rows || rows.length <= 1) return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล' });

    const validation = validateUploadHeaders('Logistics', rows[0]);
    if (!validation.ok) return res.status(400).json({ error: 'ขาดคอลัมน์: ' + validation.missing.join(', ') });

    const result = await writeUploadRaw('Logistics', 'Logistics', rows, req.file.originalname, adminStart, adminEnd, req.user.username);
    await writeActivityLog(req.user, 'UPLOAD_DATA', 'Logistics', result.batchId, 'SUCCESS',
      `อัปโหลด ${req.file.originalname} (${result.inserted} แถว)`);

    res.json({ ok: true, message: `อัปโหลดสำเร็จ: ${result.inserted} แถว`, batchId: result.batchId, inserted: result.inserted });
  } catch (err) {
    await writeActivityLog(req.user, 'UPLOAD_DATA', 'Logistics', '', 'FAILED', err.message).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

export default router;
