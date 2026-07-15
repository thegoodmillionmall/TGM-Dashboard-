import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbInsertRows } from '../supabase.js';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Thai month → MM ──────────────────────────────────────────────────────────
const THAI_MONTH_MAP = {
  'มกราคม':'01','กุมภาพันธ์':'02','มีนาคม':'03','เมษายน':'04',
  'พฤษภาคม':'05','มิถุนายน':'06','กรกฎาคม':'07','สิงหาคม':'08',
  'กันยายน':'09','ตุลาคม':'10','พฤศจิกายน':'11','ธันวาคม':'12'
};

function parseThaiYearMonth(header) {
  // "มกราคม 2026   ·   77 รายการ ..." or "มกราคม 2026   ·   1 รายการ"
  for (const [thName, mm] of Object.entries(THAI_MONTH_MAP)) {
    if (header.includes(thName)) {
      const yearMatch = header.match(/(\d{4})/);
      if (yearMatch) {
        let year = parseInt(yearMatch[1]);
        if (year > 2500) year -= 543; // พ.ศ. → ค.ศ.
        return `${year}-${mm}`;
      }
    }
  }
  return null;
}

// ─── SKU → product_key ────────────────────────────────────────────────────────
function classifyProduct(sku) {
  if (!sku || sku === '-' || sku === '') return 'other';
  const s = String(sku).toLowerCase().trim();

  // Bundles / Sets first (before individual checks)
  if (s.includes('-set-') || s.includes('sethbd') || s.includes('hairseries') ||
      s.includes('haircare') || s.includes('boostretox') || s.includes('retoxkeraglow') ||
      s.includes('keraglowboost') || s.includes('boostdrop2') || s.includes('retox2') ||
      s.includes('karaglow2') || s.includes('boostdrop-3') ||
      s === 'puff_boostdrop' || s.startsWith('puff02_') || s.startsWith('puff_'))
    return 'bundle';

  if (s === 'tg01' || s === 'tg02' || s === 'tg04' || s === 'tg-00' || s === 'pf')
    return 'puff';
  if (s.includes('boostdrop'))  return 'boostdrop';
  if (s.includes('retox'))      return 'retox';
  if (s.includes('karaglow') || s.includes('keraglow') || s.includes('kera')) return 'keraglow';
  if (s.includes('hairbrush'))  return 'comb';
  return 'other';
}

const PRODUCT_LABELS = {
  puff:      'พัฟผมเด้ง',
  retox:     'Retox',
  boostdrop: 'Boostdrop',
  keraglow:  'Keraglow',
  comb:      'หวี',
  bundle:    'เซ็ต/Bundle',
  other:     'อื่นๆ',
};

// ─── Parse JST xlsx (sheet: สินค้ารายเดือน(JST)) ─────────────────────────────
// Cols: อันดับ | รหัสสินค้า | ชื่อสินค้า | จำนวนสินค้า | ราคาสินค้าทั้งหมด | รายได้ที่ควรได้รับ | ยอดขายสุทธิ | ต้นทุนสินค้า | กำไรขั้นต้น | อัตรากำไร
function parseJST(workbook) {
  const sheetName = workbook.SheetNames.find(n => n.includes('สินค้ารายเดือน'));
  if (!sheetName) throw new Error('ไม่พบ sheet สินค้ารายเดือน ในไฟล์ JST');
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const result = [];
  let currentMonth = null;

  for (const row of rows) {
    const cell0 = row[0] != null ? String(row[0]).trim() : '';

    // Month header
    if (cell0 && /[ก-๙]/.test(cell0) && cell0.includes('2')) {
      const ym = parseThaiYearMonth(cell0);
      if (ym) { currentMonth = ym; continue; }
    }
    // Skip header / total rows
    if (!currentMonth) continue;
    if (cell0 === 'อันดับ' || cell0 === 'รวม') continue;
    // Data row: col0=rank(number), col1=sku, col2=name, col3=units
    if (typeof row[0] !== 'number' || !row[1]) continue;

    const sku    = String(row[1]).trim();
    const name   = String(row[2] || '').trim();
    const units  = Number(row[3]) || 0;
    const gross  = Number(row[4]) || 0;
    const netRev = Number(row[6]) || 0;
    const cogs   = Number(row[7]) || 0;
    const profit = Number(row[8]) || 0;

    result.push({
      year_month:    currentMonth,
      source:        'JST',
      platform:      'ALL',
      sku_code:      sku,
      product_key:   classifyProduct(sku),
      product_name:  name,
      orders:        units, // JST ไม่มี orders แยก ใช้ units แทน
      units,
      gross_revenue: gross,
      net_revenue:   netRev,
      cogs,
      gross_profit:  profit,
    });
  }
  return result;
}

// ─── Parse GoSell xlsx (sheet: สินค้ารายเดือน(ทุกอันดับ)) ────────────────────
// Cols: อันดับ | รหัสสินค้า | ชื่อสินค้า | คำสั่งซื้อ | จำนวนสินค้า | ยอดขาย (บาท)
function parseGoSell(workbook) {
  const sheetName = workbook.SheetNames.find(n =>
    n.includes('สินค้ารายเดือน') || n.includes('สินค้าขายดีรายเดือน'));
  if (!sheetName) throw new Error('ไม่พบ sheet สินค้ารายเดือน ในไฟล์ GoSell');
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const result = [];
  let currentMonth = null;

  for (const row of rows) {
    const cell0 = row[0] != null ? String(row[0]).trim() : '';

    // Month header
    if (cell0 && /[ก-๙]/.test(cell0) && cell0.includes('2')) {
      const ym = parseThaiYearMonth(cell0);
      if (ym) { currentMonth = ym; continue; }
    }
    if (!currentMonth) continue;
    if (cell0 === 'อันดับ' || cell0 === 'รวม') continue;
    if (typeof row[0] !== 'number' || !row[1]) continue;

    const sku    = String(row[1]).trim();
    const name   = String(row[2] || '').trim();
    const orders = Number(row[3]) || 0;
    const units  = Number(row[4]) || 0;
    const rev    = Number(row[5]) || 0;

    result.push({
      year_month:    currentMonth,
      source:        'GOSELL',
      platform:      'ALL',
      sku_code:      sku,
      product_key:   classifyProduct(sku),
      product_name:  name,
      orders,
      units,
      gross_revenue: rev,
      net_revenue:   rev,
      cogs:          0,
      gross_profit:  0,
    });
  }
  return result;
}

// ─── Auto-detect file type ────────────────────────────────────────────────────
function detectAndParse(workbook) {
  const sheets = workbook.SheetNames.join('|');
  if (sheets.includes('JST') || sheets.includes('สินค้ารายเดือน(JST)') ||
      sheets.includes('รายวัน ก.ค'))
    return { source: 'JST', rows: parseJST(workbook) };
  if (sheets.includes('ทุกอันดับ') || sheets.includes('สินค้าขายดีรายเดือน') ||
      sheets.includes('GoSell') || sheets.includes('ภาพรวม 2026'))
    return { source: 'GOSELL', rows: parseGoSell(workbook) };
  // Try both
  try { return { source: 'JST',    rows: parseJST(workbook) }; } catch {}
  try { return { source: 'GOSELL', rows: parseGoSell(workbook) }; } catch {}
  throw new Error('ไม่สามารถระบุประเภทไฟล์ได้ — รองรับไฟล์จาก JST ERP และ GoSell เท่านั้น');
}

// ─── POST /api/product-sales/import ──────────────────────────────────────────
router.post('/import', requireRole('ADMIN', 'UPLOADER'),
  upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const { source, rows } = detectAndParse(wb);

    if (!rows.length) return res.status(400).json({ error: 'ไม่พบข้อมูลในไฟล์' });

    const batchId = `${source}_${Date.now()}`;
    const toInsert = rows.map(r => ({ ...r, batch_id: batchId }));

    // ลบข้อมูลเดิมของ source เดียวกัน (ถ้ามี) ก่อน insert
    const months = [...new Set(rows.map(r => r.year_month))];
    for (const ym of months) {
      await sbRequest(
        `product_sales_monthly?year_month=eq.${ym}&source=eq.${source}`,
        'delete', null, { Prefer: 'return=minimal' }
      ).catch(() => {});
    }

    // Batch insert ทีละ 500 แถว
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await sbInsertRows('product_sales_monthly', toInsert.slice(i, i + BATCH));
    }

    res.json({
      ok: true, source, months,
      rowsImported: toInsert.length,
      batchId,
      message: `นำเข้าสำเร็จ ${toInsert.length} รายการ จาก ${source} (${months.join(', ')})`,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/product-sales/batch/:batchId ─────────────────────────────────
router.delete('/batch/:batchId', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest(
      `product_sales_monthly?batch_id=eq.${req.params.batchId}`,
      'delete', null, { Prefer: 'return=minimal' }
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/summary — monthly totals ──────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const rows = await sbRequest(
      'product_sales_monthly?select=year_month,source,orders,units,gross_revenue,net_revenue,gross_profit' +
      '&order=year_month.asc', 'get') || [];

    // Group by month
    const byMonth = {};
    for (const r of rows) {
      if (!byMonth[r.year_month]) byMonth[r.year_month] = {
        year_month: r.year_month, sources: [], orders: 0, units: 0,
        gross_revenue: 0, net_revenue: 0, gross_profit: 0
      };
      const m = byMonth[r.year_month];
      m.orders        += r.orders || 0;
      m.units         += r.units  || 0;
      m.gross_revenue += Number(r.gross_revenue) || 0;
      m.net_revenue   += Number(r.net_revenue)   || 0;
      m.gross_profit  += Number(r.gross_profit)  || 0;
      if (!m.sources.includes(r.source)) m.sources.push(r.source);
    }
    res.json(Object.values(byMonth));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/ranking — top products ────────────────────────────
router.get('/ranking', async (req, res) => {
  try {
    const { start, end, source } = req.query;
    let path = 'product_sales_monthly?select=product_key,product_name,sku_code,year_month,source,orders,units,gross_revenue,net_revenue,gross_profit';
    if (start)  path += `&year_month=gte.${start}`;
    if (end)    path += `&year_month=lte.${end}`;
    if (source) path += `&source=eq.${source}`;
    path += '&order=year_month.asc&limit=5000';

    const rows = await sbRequest(path, 'get') || [];

    // Aggregate by product_key
    const byKey = {};
    for (const r of rows) {
      const key = r.product_key || 'other';
      if (!byKey[key]) byKey[key] = {
        product_key: key,
        label: PRODUCT_LABELS[key] || key,
        orders: 0, units: 0, gross_revenue: 0, net_revenue: 0, gross_profit: 0,
        monthly: {}
      };
      const p = byKey[key];
      p.orders        += r.orders || 0;
      p.units         += r.units  || 0;
      p.gross_revenue += Number(r.gross_revenue) || 0;
      p.net_revenue   += Number(r.net_revenue)   || 0;
      p.gross_profit  += Number(r.gross_profit)  || 0;
      if (!p.monthly[r.year_month]) p.monthly[r.year_month] = 0;
      p.monthly[r.year_month] += r.units || 0;
    }

    const sorted = Object.values(byKey).sort((a, b) => b.units - a.units);
    res.json(sorted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/batches ──────────────────────────────────────────
router.get('/batches', async (req, res) => {
  try {
    const rows = await sbRequest(
      'product_sales_monthly?select=batch_id,source,created_at&order=created_at.desc&limit=100',
      'get') || [];
    const seen = new Set();
    const batches = [];
    for (const r of rows) {
      if (!seen.has(r.batch_id)) {
        seen.add(r.batch_id);
        batches.push({ batch_id: r.batch_id, source: r.source, created_at: r.created_at });
      }
    }
    res.json(batches);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/monthly-by-product ────────────────────────────────
router.get('/monthly-by-product', async (req, res) => {
  try {
    const { start, end } = req.query;
    let path = 'product_sales_monthly?select=year_month,product_key,units,gross_revenue,net_revenue&order=year_month.asc&limit=5000';
    if (start) path += `&year_month=gte.${start}`;
    if (end)   path += `&year_month=lte.${end}`;

    const rows = await sbRequest(path, 'get') || [];
    // Group by month+product_key
    const byMonthKey = {};
    for (const r of rows) {
      const k = `${r.year_month}|${r.product_key}`;
      if (!byMonthKey[k]) byMonthKey[k] = {
        year_month: r.year_month, product_key: r.product_key,
        units: 0, net_revenue: 0
      };
      byMonthKey[k].units       += r.units || 0;
      byMonthKey[k].net_revenue += Number(r.net_revenue) || 0;
    }
    res.json(Object.values(byMonthKey).sort((a, b) =>
      a.year_month.localeCompare(b.year_month) || a.product_key.localeCompare(b.product_key)
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
