import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRpcOne, sbRequest } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { getProductCostsMaster, getFeeSettingsMaster, getDataSourceMappingsMaster } from '../lib/fast.js';
import { writeUploadRaw, runRefreshRpcs, getLatestBatchRows } from '../lib/uploads.js';
import { cacheClear } from '../cache.js';
import { loadRawOrderItems } from './productsales.js';

const router = Router();
router.use(requireAuth);

const MANUAL_HEADERS = ['Date', 'Entry_Type', 'Platform', 'Section', 'Category', 'Sub_Category', 'Vendor', 'Description', 'Amount', 'Apply_To', 'Source_Mode', 'Created_By', 'Created_At', 'Upload_Batch_ID'];
const FINANCIAL_STATEMENTS_KEY = 'financial_statements';
const FINANCIAL_STATEMENT_SEED = {
  version: 1,
  source: 'seeded-from-google-sheet',
  months: [
    {
      month: '2026-01',
      title: 'งบกำไรขาดทุน มกราคม 2026',
      unit: 'บาท',
      lockedSource: true,
      rows: [
        { section: 'รายได้', group: 'รายได้สุทธิ', item: 'รายได้จากการขายสินค้า', amount: 84087.88 },
        { section: 'รายได้', group: 'รายได้สุทธิ', item: 'รายได้จากการให้บริการ', amount: 1239190.65 },
        { section: 'รายได้', group: '', item: 'รวมรายได้สุทธิ', amount: 1323278.53, total: true },
        { section: 'รายได้', group: '', item: 'รวมรายได้', amount: 1323278.53, total: true },
        { section: 'ค่าใช้จ่าย', group: 'ต้นทุนขายสุทธิ', item: 'ต้นทุนขายสินค้าเพื่อขาย', amount: 351339.72 },
        { section: 'ค่าใช้จ่าย', group: 'ต้นทุนขายสุทธิ', item: 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', amount: 351339.72 },
        { section: 'ค่าใช้จ่าย', group: '', item: 'รวมต้นทุนขายสุทธิ', amount: 351339.72, total: true },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าใช้จ่ายเดินทางและยานพาหนะ', amount: 4000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าใช้จ่ายเดินทางและที่พัก', amount: 920 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าขนส่ง', amount: 9064 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่ารับรองลูกค้า', amount: 26785.76 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าส่งเสริมการขาย', amount: 9522.6 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าธรรมเนียมการขาย - Shopee', amount: 104893.46 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าธรรมเนียมการขาย - Lazada', amount: 178.64 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการขาย', item: 'ค่าธรรมเนียมการขาย - Tiktok', amount: 33704.64 },
        { section: 'ค่าใช้จ่าย', group: '', item: 'รวมค่าใช้จ่ายในการขาย', amount: 189069.1, total: true },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'เงินเดือนและค่าจ้างแรงงาน', amount: 167357.93 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'เงินประกันสังคม/กองทุนสำรองฯ', amount: -780 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', amount: 50000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าโฆษณา - Shopee', amount: 285000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าโฆษณา - Tiktok', amount: 90211.81 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าโฆษณา - Facebook', amount: 50000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าจ้างด้านโฆษณาและการตลาด', amount: 25000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าใช้จ่ายสำนักงาน', amount: 1370 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าซ่อมแซมและบำรุงรักษา', amount: 15530 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าทำบัญชี', amount: 9000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าบริการให้คำแนะนำและปรึกษา', amount: 30000 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าจ้างฟรีแลนซ์', amount: 111028.87 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าบริการอื่นๆ', amount: 102598.93 },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายในการบริหาร', item: 'ค่าภาษีอื่นๆ', amount: 32745.42 },
        { section: 'ค่าใช้จ่าย', group: '', item: 'รวมค่าใช้จ่ายในการบริหาร', amount: 969062.96, total: true },
        { section: 'ค่าใช้จ่าย', group: 'ค่าใช้จ่ายอื่น', item: 'รายจ่ายอื่นๆ', amount: 106.57 },
        { section: 'ค่าใช้จ่าย', group: '', item: 'รวมค่าใช้จ่ายอื่น', amount: 106.57, total: true },
        { section: 'ค่าใช้จ่าย', group: '', item: 'รวมค่าใช้จ่าย', amount: 1509578.35, total: true },
        { section: 'สรุป', group: '', item: 'กำไร(ขาดทุน) สุทธิ', amount: -186299.82, total: true }
      ]
    }
  ]
};

function cleanFinancialStatements(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const months = Array.isArray(src.months) ? src.months : [];
  return {
    version: 1,
    source: src.source || 'system',
    months: months.map(m => ({
      month: String(m.month || '').slice(0, 7),
      title: String(m.title || '').trim(),
      unit: m.unit || 'บาท',
      lockedSource: !!m.lockedSource,
      rows: Array.isArray(m.rows) ? m.rows.map(r => ({
        section: String(r.section || '').trim(),
        group: String(r.group || '').trim(),
        item: String(r.item || '').trim(),
        amount: Number(r.amount || 0) || 0,
        total: !!r.total
      })).filter(r => r.item) : []
    })).filter(m => m.month && m.rows.length)
  };
}

function financialSummary(month) {
  const rows = month?.rows || [];
  const valueOf = label => rows.find(r => r.item === label)?.amount || 0;
  const revenue = valueOf('รวมรายได้') || valueOf('รวมรายได้สุทธิ') || rows.filter(r => r.section === 'รายได้' && !r.total).reduce((s, r) => s + r.amount, 0);
  const cogs = valueOf('รวมต้นทุนขายสุทธิ');
  const selling = valueOf('รวมค่าใช้จ่ายในการขาย');
  const admin = valueOf('รวมค่าใช้จ่ายในการบริหาร');
  const other = valueOf('รวมค่าใช้จ่ายอื่น');
  const expenses = valueOf('รวมค่าใช้จ่าย') || (cogs + selling + admin + other);
  const net = valueOf('กำไร(ขาดทุน) สุทธิ') || (revenue - expenses);
  return { revenue, cogs, selling, admin, other, expenses, net, margin: revenue ? (net / revenue) * 100 : 0 };
}

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
        costType: r.costType || 'THB',
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
    const start = req.body?.start || null;
    const end = req.body?.end || null;
    const orderItems = await loadRawOrderItems({ start, end });
    const candidateMap = new Map();

    for (const item of orderItems) {
      const name = String(item.productName || '').trim();
      if (!name) continue;
      const platform = item.platform || '';
      const key = `${platform}|${name}`.toLowerCase();
      if (!candidateMap.has(key)) {
        candidateMap.set(key, {
          name,
          platform,
          units: 0,
          orders: new Set(),
        });
      }
      const slot = candidateMap.get(key);
      slot.units += Number(item.qty || 0);
      if (item.orderId) slot.orders.add(item.orderId);
    }

    let source = 'raw_order_detail';
    let candidates = [...candidateMap.values()]
      .sort((a, b) => (b.units - a.units) || a.name.localeCompare(b.name, 'th'))
      .map(c => ({ name: c.name, platform: c.platform || '', units: c.units, orders: c.orders.size }));

    if (!candidates.length) {
      const data = await sbRpcOne('get_product_sales', { p_start: null, p_end: null, p_platform: 'All' });
      candidates = (data?.topProducts || []).map(p => ({ name: p.name, platform: p.platform || '' }));
      source = 'product_sales_summary';
    }

    const existing = await getProductCostsMaster();
    const existingKeys = new Set(existing.map(r =>
      `${String(r.platform || '').trim()}|${String(r.productName || r.name || '').trim()}`.toLowerCase()
    ));
    const existingAllNames = new Set(existing
      .filter(r => !String(r.platform || '').trim())
      .map(r => String(r.productName || r.name || '').trim().toLowerCase())
    );
    const merged = existing.concat(
      candidates.filter(c => {
        const name = String(c.name || '').trim();
        const platform = String(c.platform || '').trim();
        if (!name) return false;
        if (existingAllNames.has(name.toLowerCase())) return false;
        return !existingKeys.has(`${platform}|${name}`.toLowerCase());
      })
        .map(c => ({ platform: c.platform, productName: c.name, costType: 'THB', costValue: 0 }))
    );
    res.json({
      ok: true,
      rows: merged,
      added: merged.length - existing.length,
      source,
      orderProducts: candidates.length
    });
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

// ---------- Financial statements (read-only imported budget/P&L workbook) ----------
router.get('/statements', async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const data = cleanFinancialStatements(rows && rows.length ? rows[0].value : FINANCIAL_STATEMENT_SEED);
    const months = data.months.map(m => ({ ...m, summary: financialSummary(m) }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const templateRows = months[0]?.rows || FINANCIAL_STATEMENT_SEED.months[0].rows;
    res.json({ ...data, months, templateRows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/statements/seed', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const current = cleanFinancialStatements(rows && rows.length ? rows[0].value : {});
    const byMonth = new Map(current.months.map(m => [m.month, m]));
    for (const month of FINANCIAL_STATEMENT_SEED.months) byMonth.set(month.month, month);
    const value = cleanFinancialStatements({ ...current, source: 'system', months: [...byMonth.values()] });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: FINANCIAL_STATEMENTS_KEY, value, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await writeActivityLog(req.user, 'SEED_FINANCIAL_STATEMENTS', 'app_settings', FINANCIAL_STATEMENTS_KEY, 'SUCCESS', 'Seeded financial statements');
    res.json({ ok: true, message: 'นำงบเดือนเริ่มต้นเข้าระบบแล้ว', months: value.months.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/statements/month', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const current = cleanFinancialStatements(rows && rows.length ? rows[0].value : FINANCIAL_STATEMENT_SEED);
    const month = cleanFinancialStatements({ months: [req.body || {}] }).months[0];
    if (!month) return res.status(400).json({ error: 'ข้อมูลเดือนนี้ไม่ครบ' });
    const byMonth = new Map(current.months.map(m => [m.month, m]));
    byMonth.set(month.month, month);
    const value = cleanFinancialStatements({ ...current, source: 'system', months: [...byMonth.values()] });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: FINANCIAL_STATEMENTS_KEY, value, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await writeActivityLog(req.user, 'SAVE_FINANCIAL_STATEMENT_MONTH', 'app_settings', FINANCIAL_STATEMENTS_KEY, 'SUCCESS', 'Saved financial statement ' + month.month);
    res.json({ ok: true, message: 'บันทึกงบเดือน ' + month.month + ' แล้ว', month: { ...month, summary: financialSummary(month) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Product Master ----------
router.get('/product-master', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_master&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || []) : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/product-master', requireRole('ADMIN'), async (req, res) => {
  try {
    const items = Array.isArray(req.body)
      ? req.body.map(p => ({ sku: String(p.sku||'').trim(), name: String(p.name||'').trim(), category: String(p.category||'').trim() })).filter(p => p.sku)
      : [];
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_master', value: items, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `บันทึก ${items.length} รายการ` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Seed product master ----------
router.post('/seed-product-master', requireRole('ADMIN'), async (req, res) => {
  try {
    const seedPath = path.resolve(__dirname, '../../../seeds/product-master.json');
    const raw = await readFile(seedPath, 'utf-8');
    const { productMaster, productCostsMeta, skuCosts } = JSON.parse(raw);
    const now = new Date().toISOString();
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_master', value: productMaster, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_costs_meta', value: productCostsMeta, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'sku_costs_reference', value: skuCosts, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `นำเข้าสำเร็จ: ${productMaster.length} สินค้า, ${Object.keys(productCostsMeta).length} auto-linked` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Categories ----------
router.get('/categories', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_categories&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || []) : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', requireRole('ADMIN'), async (req, res) => {
  try {
    const cats = Array.isArray(req.body) ? req.body.map(s => String(s).trim()).filter(Boolean) : [];
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_categories', value: cats, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `บันทึกหมวดหมู่ ${cats.length} รายการ` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Product costs metadata ----------
router.get('/product-costs-meta', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_costs_meta&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || {}) : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/product-costs-meta', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_costs_meta', value: req.body || {}, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: 'บันทึก metadata สำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
