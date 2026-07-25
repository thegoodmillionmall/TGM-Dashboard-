import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbInsertRows } from '../supabase.js';
import { writeUploadRaw, runRefreshRpcs, rollbackBatch, PLATFORM_CONFIG } from '../lib/uploads.js';

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

  if (s === 'tg01' || s === 'tg02' || s === 'tg04' || s === 'tg-00' || s === 'pf' ||
      s === 'tg-green' || s === 'tg-pink' || s === 'tg-blue' || s.includes('green-2pcs'))
    return 'puff';
  if (s.includes('boostdrop'))  return 'boostdrop';
  if (s.includes('retox'))      return 'retox';
  if (s.includes('karaglow') || s.includes('keraglow') || s.includes('kera')) return 'keraglow';
  if (s.includes('hairbrush'))  return 'comb';
  return 'other';
}

function normalizeHeader(value) {
  return String(value || '').replace(/\s/g, '').toLowerCase();
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/[,฿\t]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function orderDateToMonth(value) {
  const text = String(value || '').trim().replace(/\t/g, '');
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}`;
  return null;
}

function sourceFromOrderFile(fileName, platform) {
  const matches = String(fileName || '').match(/(\d{8})/g) || [];
  const range = matches.length ? '_' + matches.slice(0, 2).join('_') : '';
  return `${platform === 'Shopee' ? 'SHOPEE_ORDER' : 'TIKTOK_ORDER'}${range}`;
}

function isBadOrderStatus(status) {
  const text = String(status || '').toLowerCase();
  return ['ยกเลิก', 'ค้างชำระ', 'ยังไม่ชำระ', 'cancel', 'unpaid'].some(k => text.includes(k));
}

function parseOrderDetail(workbook, fileName = '') {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .filter(row => row.some(cell => String(cell || '').trim() !== ''));
  if (rows.length <= 1) return null;

  const headers = rows[0].map(normalizeHeader);
  const hasSku = headers.some(h => h === 'sku');
  const hasQty = headers.some(h => h.includes('จำนวน'));
  const hasChannel = headers.some(h => h.includes('ช่องทาง') || h.includes('platform'));
  const hasOrderNo = headers.some(h => h.includes('คำสั่งซื้อ') || h.includes('order'));
  if (!hasSku || !hasQty || !hasOrderNo) return null;

  const pick = (keywords, fallback) => {
    const index = headers.findIndex(h => keywords.some(k => h.includes(k)));
    return index >= 0 ? index : fallback;
  };

  const idx = {
    date: pick(['เวลาที่สร้าง', 'วันที่', 'created', 'date'], 0),
    order: pick(['หมายเลขคำสั่งซื้อ', 'เลขคำสั่งซื้อ', 'order'], 1),
    channel: pick(['ช่องทาง', 'platform'], 2),
    sku: pick(['sku'], 3),
    name: pick(['ชื่อสินค้า', 'productname', 'product'], 4),
    qty: pick(['จำนวน'], 5),
    sales: pick(['ยอดขาย', 'ยอดรวมย่อย', 'subtotal', 'sales'], 6),
    status: pick(['สถานะ', 'status'], 7),
    refund: pick(['คืนเงิน', 'จำนวนคืน', 'refund', 'return'], 8)
  };

  const sourcePlatform = String(fileName).toLowerCase().includes('shopee') ? 'Shopee' : 'TikTok';
  const source = sourceFromOrderFile(fileName, sourcePlatform);
  const groups = new Map();

  for (const row of rows.slice(1)) {
    const status = row[idx.status];
    if (isBadOrderStatus(status)) continue;

    const ym = orderDateToMonth(row[idx.date]);
    const sku = String(row[idx.sku] || '').trim();
    if (!ym || !sku) continue;

    const orderId = String(row[idx.order] || '').trim();
    const platform = String(row[idx.channel] || sourcePlatform || '').trim() || sourcePlatform;
    const name = String(row[idx.name] || '').trim();
    const qty = Math.max(0, toNumber(row[idx.qty]));
    const gross = Math.max(0, toNumber(row[idx.sales]));
    const refund = Math.max(0, toNumber(row[idx.refund]));
    const key = `${ym}|${platform}|${sku}`;

    if (!groups.has(key)) {
      groups.set(key, {
        year_month: ym,
        source,
        platform,
        sku_code: sku,
        product_key: classifyProduct(sku),
        product_name: name,
        orderSet: new Set(),
        units: 0,
        gross_revenue: 0,
        refund_amount: 0
      });
    }

    const item = groups.get(key);
    if (orderId) item.orderSet.add(orderId);
    item.units += qty;
    item.gross_revenue += gross;
    item.refund_amount += Math.min(refund, gross);
  }

  return {
    source,
    rows: [...groups.values()].map(({ orderSet, refund_amount, ...r }) => ({
      ...r,
      orders: orderSet.size,
      net_revenue: Math.max(0, r.gross_revenue - refund_amount),
      cogs: 0,
      gross_profit: 0
    }))
  };
}

const RAW_ORDER_SHEETS = ['TT_Sales', 'Shopee_Orders'];
const RAW_ORDER_PAGE_SIZE = 1000;
const RAW_ORDER_CACHE_TTL_MS = 2 * 60 * 1000;
let rawOrderCache = { expiresAt: 0, items: null, promise: null };

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
}

function rawOrderDate(value) {
  const text = String(value || '').trim().replace(/\t/g, '');
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return '';
}

function classifyProductText(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('set') || s.includes('เซ็ต') || s.includes('แถม')) return 'bundle';
  if (s.includes('retox') || s.includes('รีท็อก')) return 'retox';
  if (s.includes('boostdrop') || s.includes('บูส')) return 'boostdrop';
  if (s.includes('karaglow') || s.includes('keraglow') || s.includes('เคราโกล')) return 'keraglow';
  if (s.includes('brush') || s.includes('หวี')) return 'comb';
  if (s.includes('พัฟ') || s.includes('fluffy') || s.includes('dry shampoo') || s.includes('ดรายแชมพู')) return 'puff';
  return 'other';
}

function rawOrderToItem(raw) {
  const row = raw.row_data || {};
  const date = rawOrderDate(firstValue(row, ['เวลาที่สร้าง', 'วันที่ทำการสั่งซื้อ', 'วันที่', 'Created Time', 'created_time']));
  const orderId = String(firstValue(row, ['หมายเลขคำสั่งซื้อ', 'เลขคำสั่งซื้อ', 'Order ID', 'order_id'])).trim();
  const sku = String(firstValue(row, [
    'Seller SKU', 'เลขอ้างอิง SKU (SKU Reference No.)', 'เลขอ้างอิง Parent SKU', 'SKU', 'sku'
  ])).trim();
  const productName = String(firstValue(row, ['ชื่อสินค้า', 'Product Name', 'product_name'])).trim();
  const status = firstValue(row, ['สถานะคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'สถานะ', 'Order Status', 'status']);
  if (!date || !productName || isBadOrderStatus(status)) return null;

  const platform = raw.source_sheet === 'Shopee_Orders' || raw.platform === 'ShopeeOrder' ? 'Shopee' : 'TikTok';
  const qty = Math.max(0, toNumber(firstValue(row, ['Quantity', 'จำนวน', 'Sku Quantity'])));
  const gross = Math.max(0, toNumber(firstValue(row, [
    'ยอดรวมย่อยของ SKU หลังหักส่วนลด',
    'ยอดรวมย่อยของskuหลังหักส่วนลด',
    'ราคาขายสุทธิ',
    'ยอดขาย',
    'Order Amount',
    'ราคาสินค้าที่ชำระโดยผู้ซื้อ (THB)'
  ])));
  const refundOrReturn = Math.max(0, toNumber(firstValue(row, ['Order Refund Amount', 'ยอดคืนเงิน/จำนวนคืน'])));
  const explicitReturnQty = Math.max(0, toNumber(firstValue(row, ['Sku Quantity of return', 'จำนวนที่ส่งคืน'])));
  const returnQty = explicitReturnQty || (refundOrReturn > 0 && refundOrReturn <= qty ? refundOrReturn : 0);
  const refundAmount = refundOrReturn > qty ? refundOrReturn : 0;
  return {
    date,
    year_month: date.slice(0, 7),
    platform,
    orderId,
    sku,
    productName,
    product_key: classifyProduct(sku) !== 'other' ? classifyProduct(sku) : classifyProductText(productName),
    qty,
    gross,
    net: Math.max(0, gross - Math.min(refundAmount, gross)),
    returnQty
  };
}

function clearRawOrderCache() {
  rawOrderCache = { expiresAt: 0, items: null, promise: null };
}

async function fetchAllRawOrderItems() {
  const rows = [];
  for (const sheet of RAW_ORDER_SHEETS) {
    for (let offset = 0; ; offset += RAW_ORDER_PAGE_SIZE) {
      const page = await sbRequest(
        `raw_upload_rows?select=platform,source_sheet,row_data,uploaded_at&source_sheet=eq.${sheet}&limit=${RAW_ORDER_PAGE_SIZE}&offset=${offset}`,
        'get'
      ) || [];
      rows.push(...page);
      if (page.length < RAW_ORDER_PAGE_SIZE) break;
    }
  }
  return rows
    .filter(r => RAW_ORDER_SHEETS.includes(r.source_sheet))
    .map(rawOrderToItem)
    .filter(Boolean);
}

async function loadRawOrderItems({ start, end } = {}) {
  const now = Date.now();
  if (!rawOrderCache.items || rawOrderCache.expiresAt <= now) {
    if (!rawOrderCache.promise) {
      rawOrderCache.promise = fetchAllRawOrderItems()
        .then(items => {
          rawOrderCache = {
            items,
            expiresAt: Date.now() + RAW_ORDER_CACHE_TTL_MS,
            promise: null,
          };
          return items;
        })
        .catch(err => {
          rawOrderCache.promise = null;
          throw err;
        });
    }
    await rawOrderCache.promise;
  }

  return (rawOrderCache.items || [])
    .filter(item => (!start || item.year_month >= start) && (!end || item.year_month <= end));
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
function detectAndParse(workbook, fileName = '') {
  const orderDetail = parseOrderDetail(workbook, fileName);
  if (orderDetail) return orderDetail;

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
    const orderDetail = parseOrderDetail(wb, req.file.originalname);
    if (orderDetail) {
      const platform = orderDetail.source.startsWith('SHOPEE_ORDER') ? 'ShopeeOrder' : 'TiktokOrder';
      const sheetName = PLATFORM_CONFIG[platform].sheet;
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        .filter(row => row.some(cell => String(cell || '').trim() !== ''));
      const result = await writeUploadRaw(platform, sheetName, rawRows, req.file.originalname, null, null, req.user?.username || '');
      const refresh = await runRefreshRpcs(platform);
      clearRawOrderCache();
      return res.json({
        ok: true,
        source: orderDetail.source,
        rowsImported: result.inserted,
        batchId: result.batchId,
        refresh,
        message: `นำเข้า Order Detail สำเร็จ ${result.inserted} แถว (${platform === 'ShopeeOrder' ? 'Shopee' : 'TikTok'})`,
      });
    }

    const { source, rows } = detectAndParse(wb, req.file.originalname);

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
    await rollbackBatch(req.params.batchId);
    clearRawOrderCache();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/summary — monthly totals ──────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const rows = await loadRawOrderItems({});

    // Group by month
    const byMonth = {};
    for (const r of rows) {
      if (!byMonth[r.year_month]) byMonth[r.year_month] = {
        year_month: r.year_month, sources: [], orderSet: new Set(), orders: 0, units: 0,
        gross_revenue: 0, net_revenue: 0, gross_profit: 0, returned_units: 0
      };
      const m = byMonth[r.year_month];
      if (r.orderId) m.orderSet.add(r.orderId);
      m.units         += r.qty || 0;
      m.returned_units += r.returnQty || 0;
      m.gross_revenue += Number(r.gross) || 0;
      m.net_revenue   += Number(r.net)   || 0;
      if (!m.sources.includes(r.platform)) m.sources.push(r.platform);
    }
    res.json(Object.values(byMonth).map(({ orderSet, ...m }) => ({
      ...m,
      orders: orderSet.size,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/ranking — top products ────────────────────────────
router.get('/ranking', async (req, res) => {
  try {
    const { start, end, source } = req.query;
    const rows = (await loadRawOrderItems({ start, end }))
      .filter(r => !source || r.platform === source || r.platform.toUpperCase() === String(source).toUpperCase());

    // Aggregate by product_key
    const byKey = {};
    for (const r of rows) {
      const key = r.product_key || 'other';
      if (!byKey[key]) byKey[key] = {
        product_key: key,
        label: PRODUCT_LABELS[key] || key,
        orders: 0, units: 0, returned_units: 0, gross_revenue: 0, net_revenue: 0, gross_profit: 0,
        monthly: {}
      };
      const p = byKey[key];
      p.orders        += r.orderId ? 1 : 0;
      p.units         += r.qty || 0;
      p.returned_units += r.returnQty || 0;
      p.gross_revenue += Number(r.gross) || 0;
      p.net_revenue   += Number(r.net)   || 0;
      if (!p.monthly[r.year_month]) p.monthly[r.year_month] = 0;
      p.monthly[r.year_month] += r.qty || 0;
    }

    const sorted = Object.values(byKey).sort((a, b) => b.units - a.units);
    res.json(sorted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/batches ──────────────────────────────────────────
router.get('/batches', async (req, res) => {
  try {
    const rows = await sbRequest(
      'upload_batches?select=id,platform,source_sheet,file_name,created_at&source_sheet=in.(TT_Sales,Shopee_Orders)&order=created_at.desc&limit=100',
      'get') || [];
    res.json(rows.map(r => ({
      batch_id: r.id,
      source: r.platform === 'ShopeeOrder' ? 'SHOPEE_ORDER' : 'TIKTOK_ORDER',
      file_name: r.file_name,
      created_at: r.created_at
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/product-sales/monthly-by-product ────────────────────────────────
router.get('/monthly-by-product', async (req, res) => {
  try {
    const { start, end } = req.query;
    const rows = await loadRawOrderItems({ start, end });
    // Group by month+product_key
    const byMonthKey = {};
    for (const r of rows) {
      const k = `${r.year_month}|${r.product_key}`;
      if (!byMonthKey[k]) byMonthKey[k] = {
        year_month: r.year_month, product_key: r.product_key,
        units: 0, net_revenue: 0
      };
      byMonthKey[k].units       += r.qty || 0;
      byMonthKey[k].net_revenue += Number(r.net) || 0;
    }
    res.json(Object.values(byMonthKey).sort((a, b) =>
      a.year_month.localeCompare(b.year_month) || a.product_key.localeCompare(b.product_key)
    ));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
