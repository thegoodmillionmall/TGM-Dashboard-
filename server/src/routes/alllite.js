import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbInsertRows, sbDelete } from '../supabase.js';
import { getProductCostsMaster } from '../lib/fast.js';
import { writeActivityLog } from '../lib/log.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.use(requireAuth);

const n = v => { const x = Number(v ?? 0); return isNaN(x) ? 0 : x; };

// แปลง Excel date serial → ISO date string
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel base date: 1899-12-30 (เพราะ bug Lotus 1-2-3)
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

// Normalize string: lowercase + ตัดอักขระพิเศษ (ใช้เปรียบเทียบ)
function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s\-_()\[\],.]/g, '');
}

// Fuzzy match ชื่อสินค้า AllLite → ตาราง COGS
// Strategy: exact → contains keyword → keyword contains
function fuzzyMatch(allLiteName, cogsRows) {
  const src = norm(allLiteName);
  if (!src) return null;

  // 1. Exact match (normalized)
  for (const c of cogsRows) {
    if (norm(c.productName) === src) return c;
  }

  // Extract meaningful keywords (≥4 chars เพื่อหลีกเลี่ยง false positive)
  const srcWords = allLiteName.split(/[\s\-_()\[\],.]+/).filter(w => w.length >= 4);

  // 2. Any COGS keyword found in AllLite name
  for (const c of cogsRows) {
    const cogsWords = String(c.productName || '').split(/[\s\-_()\[\],.]+/).filter(w => w.length >= 4);
    for (const w of cogsWords) {
      if (src.includes(norm(w))) return c;
    }
  }

  // 3. Any AllLite keyword found in COGS name
  for (const c of cogsRows) {
    const cogsNorm = norm(c.productName);
    for (const w of srcWords) {
      if (cogsNorm.includes(norm(w))) return c;
    }
  }

  return null;
}

// ตรวจสถานะ — กรองเฉพาะออเดอร์ที่ยังไม่ถูกยกเลิก
function isActive(status) {
  const s = String(status || '').toLowerCase();
  return !s.includes('ยกเลิก') && !s.includes('cancel') && !s.includes('returned');
}

// ดึง platform จากชื่อ
function detectPlatform(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('shopee')) return 'Shopee';
  if (s.includes('tiktok') || s.includes('tik tok')) return 'TikTok';
  if (s.includes('lazada')) return 'Lazada';
  return raw || 'Other';
}

// Column indices (0-based จาก A)
// A=0, B=1, ... F=5, K=10, AA=26, BD=55, CD=81, CH=85, CJ=87
const COL = {
  onlineOrderId: 1,   // B — หมายเลขคำสั่งซื้อออนไลน์
  status:        5,   // F — สถานะ
  orderTime:     10,  // K — เวลาสั่งซื้อ (Excel serial)
  shipping:      26,  // AA — ค่าจัดส่ง
  platform:      55,  // BD — แพลตฟอร์ม
  productName:   81,  // CD — ชื่อสินค้า
  unitPrice:     85,  // CH — ราคาต่อหน่วย
  quantity:      87,  // CJ — จำนวน
};

// POST /api/alllite/upload
router.post('/upload', requireRole('ADMIN', 'UPLOADER'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ xlsx' });

    // Parse xlsx buffer
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (allRows.length < 2) return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล' });

    // ดึง COGS master — เฉพาะ FIXED type (บาท/ชิ้น)
    const cogsRaw = await getProductCostsMaster();
    const cogsRows = cogsRaw.filter(c => {
      const t = String(c.costType || '').toUpperCase();
      return t === 'FIXED' || t === 'บาท' || t === 'BAHT';
    });

    const batchId = uuidv4();
    const sourceFile = req.file.originalname;
    const toInsert = [];
    const unmatched = new Set();

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!Array.isArray(row) || !row[COL.onlineOrderId]) continue;

      const onlineId   = String(row[COL.onlineOrderId] || '').trim();
      const status     = String(row[COL.status]        || '').trim();
      const platform   = detectPlatform(row[COL.platform]);
      const productName = String(row[COL.productName]  || '').trim();
      const qty        = n(row[COL.quantity]);
      const shipping   = n(row[COL.shipping]);

      if (!onlineId || !isActive(status)) continue;

      // แปลงวันที่
      let orderDate = null;
      const rawDate = row[COL.orderTime];
      if (typeof rawDate === 'number') {
        orderDate = excelDateToISO(rawDate);
      } else {
        const m = String(rawDate || '').match(/(\d{4}-\d{2}-\d{2})/);
        if (m) orderDate = m[1];
      }

      // Fuzzy match COGS
      const match = fuzzyMatch(productName, cogsRows);
      let unitCost = 0, totalCogs = 0, cogsMatchName = null;
      if (match) {
        unitCost = n(match.costValue || match.val);
        totalCogs = unitCost * qty;
        cogsMatchName = match.productName || match.name;
      } else {
        if (productName) unmatched.add(productName);
      }

      toInsert.push({
        batch_id:        batchId,
        source_file:     sourceFile,
        order_date:      orderDate,
        platform,
        online_order_id: onlineId,
        product_name:    productName,
        quantity:        qty,
        shipping_cost:   shipping,
        status,
        cogs_matched:    !!match,
        cogs_match_name: cogsMatchName,
        unit_cost:       unitCost,
        total_cogs:      totalCogs
      });
    }

    if (toInsert.length === 0)
      return res.status(400).json({ error: 'ไม่พบข้อมูลออเดอร์ที่ active ในไฟล์' });

    await sbInsertRows('alllite_shipments', toInsert, 300);

    const totalCogs    = toInsert.reduce((a, r) => a + r.total_cogs, 0);
    const totalShipping = toInsert.reduce((a, r) => a + r.shipping_cost, 0);
    const matched      = toInsert.filter(r => r.cogs_matched).length;

    await writeActivityLog(req.user, 'UPLOAD_ALLLITE', 'alllite_shipments', batchId, 'SUCCESS',
      `AllLite: ${toInsert.length} รายการ, COGS ฿${totalCogs.toLocaleString()}`, {
        sourceFile, matched, unmatched: [...unmatched].slice(0, 20)
      });

    res.json({
      ok: true,
      batchId,
      inserted:     toInsert.length,
      matched,
      unmatchedCount: unmatched.size,
      unmatched:    [...unmatched],
      totalCogs:    +totalCogs.toFixed(2),
      totalShipping: +totalShipping.toFixed(2)
    });

  } catch (err) {
    await writeActivityLog(req.user, 'UPLOAD_ALLLITE', 'alllite_shipments', '', 'FAILED', err.message).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alllite/summary?start=&end=
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = req.query;
    let path = 'alllite_shipments?select=*&order=order_date.asc&limit=5000';
    if (start) path += '&order_date=gte.' + start;
    if (end)   path += '&order_date=lte.' + end;
    const rows = await sbRequest(path, 'get') || [];

    // Group by date + platform
    const dayMap = {};
    const productMap = {};
    let totalCogs = 0, totalShipping = 0;

    rows.forEach(r => {
      const date  = r.order_date || 'unknown';
      const plat  = r.platform   || 'unknown';
      const key   = date + '|' + plat;
      if (!dayMap[key]) dayMap[key] = { date, platform: plat, cogs: 0, orders: 0, shipping: 0 };
      dayMap[key].cogs     += n(r.total_cogs);
      dayMap[key].orders   += 1;
      dayMap[key].shipping += n(r.shipping_cost);
      totalCogs    += n(r.total_cogs);
      totalShipping += n(r.shipping_cost);

      const pn = r.product_name || 'unknown';
      if (!productMap[pn]) productMap[pn] = {
        productName: pn, matchedAs: r.cogs_match_name, unitCost: n(r.unit_cost),
        qty: 0, totalCogs: 0, matched: !!r.cogs_matched
      };
      productMap[pn].qty      += n(r.quantity);
      productMap[pn].totalCogs += n(r.total_cogs);
    });

    res.json({
      totalRows: rows.length,
      totalCogs: +totalCogs.toFixed(2),
      totalShipping: +totalShipping.toFixed(2),
      unmatched: Object.values(productMap).filter(p => !p.matched).map(p => p.productName),
      daily:    Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
      byProduct: Object.values(productMap)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/alllite/batches — ประวัติการนำเข้า
router.get('/batches', async (req, res) => {
  try {
    const rows = await sbRequest(
      'alllite_shipments?select=batch_id,source_file,created_at&order=created_at.desc&limit=500',
      'get'
    ) || [];
    // unique batches
    const seen = new Set();
    const batches = [];
    rows.forEach(r => {
      if (!seen.has(r.batch_id)) {
        seen.add(r.batch_id);
        batches.push({ batchId: r.batch_id, sourceFile: r.source_file, createdAt: r.created_at });
      }
    });
    res.json(batches);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/alllite/batch/:batchId — ลบ batch
router.delete('/batch/:batchId', requireRole('ADMIN'), async (req, res) => {
  try {
    const batchId = req.params.batchId;
    await sbDelete(`alllite_shipments?batch_id=eq.${batchId}`);
    await writeActivityLog(req.user, 'DELETE_ALLLITE_BATCH', 'alllite_shipments', batchId, 'SUCCESS', 'ลบ AllLite batch ' + batchId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
