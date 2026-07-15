import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRpcOne, sbRequest } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { getProductCostsMaster, getFeeSettingsMaster, getDataSourceMappingsMaster } from '../lib/fast.js';
import { writeUploadRaw, runRefreshRpcs, getLatestBatchRows } from '../lib/uploads.js';
import { cacheClear } from '../cache.js';

const router = Router();
router.use(requireAuth);

const MANUAL_HEADERS = ['Date', 'Entry_Type', 'Platform', 'Section', 'Category', 'Sub_Category', 'Vendor', 'Description', 'Amount', 'Apply_To', 'Source_Mode', 'Created_By', 'Created_At', 'Upload_Batch_ID'];

// ---------- ต้นทุนสินค้า (Accounting / COGS) ----------
router.get('/product-costs', async (req, res) => {
  try { res.json(await getProductCostsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก saveAccountingData → replace_product_costs_master
router.post('/product-costs', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || [])
      .map(r => ({
        platform: r.platform || '',
        productName: String(r.productName || r.name || '').trim(),
        costType: r.costType || '%',
        costValue: Number(r.costValue || 0)
      }))
      .filter(r => r.productName);
    const result = await sbRpcOne('replace_product_costs_master', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_PRODUCT_COSTS', 'product_costs', '', 'SUCCESS', 'บันทึกต้นทุนสินค้า ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึกต้นทุนสินค้าสำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก syncAccountingProducts — ดึงชื่อสินค้าที่มียอดขายมาเติมตาราง
router.post('/product-costs/sync', requireRole('ADMIN'), async (req, res) => {
  try {
    const data = await sbRpcOne('get_product_sales', { p_start: null, p_end: null, p_platform: 'All' });
    const candidates = (data?.topProducts || []).map(p => ({ name: p.name, platform: p.platform || '' }));
    const existing = await getProductCostsMaster();
    const existingNames = new Set(existing.map(r => String(r.productName || r.name || '').trim()));
    const merged = existing.concat(
      candidates.filter(c => c.name && !existingNames.has(c.name))
        .map(c => ({ platform: c.platform, productName: c.name, costType: '%', costValue: 0 }))
    );
    res.json({ ok: true, rows: merged, added: merged.length - existing.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Fee settings ----------
router.get('/fees', async (req, res) => {
  try { res.json(await getFeeSettingsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fees', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || []).filter(r => r && r.name);
    const result = await sbRpcOne('replace_fee_settings_master', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_FEE_SETTINGS', 'fee_settings', '', 'SUCCESS', 'บันทึกค่าธรรมเนียม ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึกค่าธรรมเนียมสำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Data source mappings ----------
router.get('/mappings', requireRole('ADMIN'), async (req, res) => {
  try { res.json(await getDataSourceMappingsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mappings', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || []).filter(r => r && r.platform && r.metricKey);
    const result = await sbRpcOne('replace_data_source_mappings', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_DATA_SOURCE_MAPPING', 'data_source_mappings', '', 'SUCCESS', 'บันทึก mapping ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึก Data Source Mapping สำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Manual Finance ----------
// อ่านรายการปัจจุบัน (จาก batch ล่าสุดใน raw_upload_rows)
router.get('/manual-finance', async (req, res) => {
  try {
    const objs = await getLatestBatchRows('Manual_Finance');
    const pick = (o, keys, dflt = '') => {
      for (const k of keys) {
        const hit = Object.keys(o).find(h => h.replace(/\s/g, '').toLowerCase() === k);
        if (hit !== undefined && o[hit] !== undefined && o[hit] !== '') return o[hit];
      }
      return dflt;
    };
    res.json(objs.map(o => ({
      date: pick(o, ['date', 'วันที่']),
      entryType: String(pick(o, ['entry_type', 'entrytype', 'type', 'ประเภท'], 'EXPENSE')).toUpperCase(),
      platform: pick(o, ['platform', 'แพลตฟอร์ม'], 'All') || 'All',
      section: pick(o, ['section']),
      category: pick(o, ['category', 'หมวด']),
      subCategory: pick(o, ['sub_category', 'subcategory']),
      vendor: pick(o, ['vendor']),
      description: pick(o, ['description', 'รายละเอียด']),
      amount: Number(String(pick(o, ['amount', 'จำนวนเงิน'], 0)).replace(/[^0-9.-]/g, '')) || 0,
      applyTo: String(pick(o, ['apply_to', 'applyto'], 'DEDUCTION')).toUpperCase(),
      sourceMode: String(pick(o, ['source_mode', 'sourcemode'], 'MANUAL')).toUpperCase()
    })).filter(r => r.date && r.amount));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก saveManualFinanceEntries — replace ทั้งชุดเป็น batch ใหม่ + refresh
router.post('/manual-finance', requireRole('ADMIN'), async (req, res) => {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entries = (req.body?.rows || [])
      .map(r => {
        const amount = Number(String(r.amount || 0).toString().replace(/[^0-9.-]/g, '')) || 0;
        if (!r.date || !amount) return null;
        return [
          r.date,
          String(r.entryType || 'EXPENSE').toUpperCase(),
          r.platform || 'All',
          r.section || '', r.category || '', r.subCategory || '', r.vendor || '', r.description || '',
          amount,
          String(r.applyTo || 'DEDUCTION').toUpperCase(),
          String(r.sourceMode || 'MANUAL').toUpperCase(),
          req.user.username, now, ''
        ];
      })
      .filter(Boolean);
    const rows = [MANUAL_HEADERS, ...entries];
    const result = await writeUploadRaw('ManualFinance', 'Manual_Finance', rows, 'manual-editor', null, null, req.user.username);
    const refresh = await runRefreshRpcs('ManualFinance');
    await writeActivityLog(req.user, 'SAVE_MANUAL_FINANCE', 'Manual_Finance', result.batchId, 'SUCCESS', 'Updated manual income/expense table', { rows: entries.length });
    res.json({ ok: true, message: 'บันทึกรายได้/รายจ่าย Manual สำเร็จ: ' + entries.length + ' รายการ', batchId: result.batchId, refresh: Object.keys(refresh) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Modern Trade (กรอกมือ) ----------
const MT_HEADERS = ['วันที่รับ PO', 'PO number', 'Sales platform', 'Branch', 'Product', 'Amount', 'ราคาสินค้า', 'GP', 'Price', 'ยอด GP', 'Net Profit', 'ETD', 'ETA', 'Ship via', 'Order number', 'Status', 'Notes', 'Received'];

router.post('/modern-trade', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const dataRows = (req.body?.rows || []).filter(r => Array.isArray(r) && String(r[1] || '').trim());
    if (!dataRows.length) return res.status(400).json({ error: 'ไม่มีรายการที่มี PO number' });
    const rows = [MT_HEADERS, ...dataRows.map(r => {
      const nr = [...r];
      while (nr.length < MT_HEADERS.length) nr.push('');
      return nr.slice(0, MT_HEADERS.length);
    })];
    const result = await writeUploadRaw('ModernTrade', 'ModernTrade', rows, 'manual-mt-editor', null, null, req.user.username);
    const refresh = await runRefreshRpcs('ModernTrade');
    await writeActivityLog(req.user, 'SAVE_MODERN_TRADE', 'ModernTrade', result.batchId, 'SUCCESS', 'บันทึก Modern Trade ' + dataRows.length + ' รายการ');
    res.json({ ok: true, message: `บันทึกข้อมูล Modern Trade เรียบร้อย: ${dataRows.length} รายการ`, batchId: result.batchId, refresh: Object.keys(refresh) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Overview display config (app_settings) ----------
router.get('/overview-config', async (req, res) => {
  try {
    const rows = await sbRequest("app_settings?key=eq.overview_display&limit=1", 'get');
    res.json(rows && rows.length ? rows[0].value : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/overview-config', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'overview_display', value: req.body || {}, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: 'บันทึกการตั้งค่าหน้า Overview สำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
