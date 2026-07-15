import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbUpsert, sbDelete } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { cacheClear } from '../cache.js';

// Modern Trade Ledger (เลียนแบบชีต MT: ยอดขายก่อน GP / เงินรับจริง / จ่าย)
const router = Router();
router.use(requireAuth);

const num = v => { const n = Number(String(v ?? 0).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };

// ดึงทั้งปี: sales + receipts + payments + gp config
router.get('/ledger', async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const start = `${year}-01-01`, end = `${year}-12-31`;
    const range = t => `${t}?select=*&month=gte.${start}&month=lte.${end}&order=month.asc`;
    const [sales, receipts, payments, gpRows] = await Promise.all([
      sbRequest(range('mt_sales'), 'get'),
      sbRequest(range('mt_receipts'), 'get'),
      sbRequest(range('mt_payments'), 'get'),
      sbRequest("app_settings?key=eq.mt_gp&limit=1", 'get')
    ]);
    res.json({
      year,
      sales: sales || [],
      receipts: receipts || [],
      payments: payments || [],
      gp: gpRows?.[0]?.value || { EVE: 45, KONVY: 40, WATSON: 40, GDT: 0 }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// บันทึกยอดขายก่อน GP (upsert ตาม เดือน+ช่องทาง+สินค้า)
router.post('/sales', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const rows = (req.body?.rows || [])
      .map(r => ({
        month: String(r.month).slice(0, 10),
        channel: String(r.channel || '').toUpperCase(),
        product: String(r.product || '').trim(),
        units: num(r.units),
        revenue: num(r.revenue)
      }))
      .filter(r => r.month && r.channel && r.product);
    if (rows.length) await sbUpsert('mt_sales', rows, 'month,channel,product');
    cacheClear(); // ให้ dashboard คำนวณใหม่ทันที
    await writeActivityLog(req.user, 'SAVE_MT_SALES', 'mt_sales', '', 'SUCCESS', 'บันทึกยอดขาย MT ' + rows.length + ' ช่อง');
    res.json({ ok: true, message: 'บันทึกยอดขายก่อน GP แล้ว (' + rows.length + ' ช่อง)' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// บันทึกเงินรับจริง
router.post('/receipts', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const rows = (req.body?.rows || [])
      .map(r => ({
        month: String(r.month).slice(0, 10),
        channel: String(r.channel || '').toUpperCase(),
        product: String(r.product || '').trim(),
        amount: num(r.amount)
      }))
      .filter(r => r.month && r.channel && r.product);
    if (rows.length) await sbUpsert('mt_receipts', rows, 'month,channel,product');
    await writeActivityLog(req.user, 'SAVE_MT_RECEIPTS', 'mt_receipts', '', 'SUCCESS', 'บันทึกเงินรับ MT ' + rows.length + ' ช่อง');
    res.json({ ok: true, message: 'บันทึกเงินรับจริงแล้ว (' + rows.length + ' ช่อง)' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// บันทึกรายการจ่าย (แทนที่ทั้งเดือน)
router.post('/payments', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const month = String(req.body?.month || '').slice(0, 10);
    if (!month) return res.status(400).json({ error: 'กรุณาระบุเดือน' });
    const rows = (req.body?.rows || [])
      .map(r => ({
        month,
        channel: String(r.channel || '').toUpperCase(),
        item: String(r.item || '').trim(),
        amount: num(r.amount),
        note: String(r.note || '')
      }))
      .filter(r => r.item && (r.amount || r.note));
    await sbDelete('mt_payments?month=eq.' + month);
    if (rows.length) await sbRequest('mt_payments', 'post', rows, { Prefer: 'return=minimal' });
    await writeActivityLog(req.user, 'SAVE_MT_PAYMENTS', 'mt_payments', month, 'SUCCESS', 'บันทึกจ่าย MT ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึกรายการจ่ายเดือนนี้แล้ว (' + rows.length + ' รายการ)' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ตั้งค่า GP%
router.post('/gp', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'mt_gp', value: req.body || {}, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: 'บันทึก GP% แล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
