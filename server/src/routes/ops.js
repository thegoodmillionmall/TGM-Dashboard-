import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbUpsert, sbDelete, sbStorageUpload, sbStorageDownload, sbStorageDelete } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { runSheetSync, runFullSync, setupSheetTab, testSheetConnection, importFromSheet, sheetSyncEnabled, sheetSyncTab } from '../lib/sheetSync.js';

const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const DOC_BUCKET = 'payable-docs';

const router = Router();
router.use(requireAuth);

const num = v => { const n = Number(String(v ?? 0).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const dateKey = v => {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}`;
  return s.slice(0, 10);
};

// ---------- Payables (พอร์ตจาก getPayablesData / savePayablesData) ----------
router.get('/payables', async (req, res) => {
  try {
    const { start, end, status } = req.query;
    let path = 'payables?select=*&order=due_date.asc';
    if (start) path += '&due_date=gte.' + dateKey(start);
    if (end) path += '&due_date=lte.' + dateKey(end);
    const selectedStatus = String(status || 'ALL').toUpperCase();
    if (selectedStatus !== 'ALL') path += '&status=eq.' + selectedStatus;
    const raw = await sbRequest(path, 'get') || [];
    const rows = raw.map(r => ({
      id: r.id, dueDate: r.due_date || '', status: r.status, company: r.company, vendor: r.vendor, description: r.description,
      grossAmount: num(r.gross_amount), whtAmount: num(r.wht_amount), netAmount: num(r.net_amount),
      bank: r.bank, accountNo: r.account_no, accountName: r.account_name, ref: r.ref, documentLink: r.document_link,
      needReceipt: !!r.need_receipt, receiptStatus: r.receipt_status,
      needTaxInvoice: !!r.need_tax_invoice, taxInvoiceStatus: r.tax_invoice_status,
      needWhtIssue: !!r.need_wht_issue, whtIssueStatus: r.wht_issue_status,
      needOriginal: !!r.need_original, originalStatus: r.original_status,
      note: r.note, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by
    }));
    // นับไฟล์แนบของแต่ละรายการ
    try {
      const atts = await sbRequest('payable_attachments?select=payable_id', 'get') || [];
      const counts = {};
      atts.forEach(a => { counts[a.payable_id] = (counts[a.payable_id] || 0) + 1; });
      rows.forEach(r => { r.attachmentCount = counts[r.id] || 0; });
    } catch { rows.forEach(r => { r.attachmentCount = 0; }); }

    const today = new Date().toISOString().slice(0, 10);
    const active = rows.filter(r => r.status !== 'CANCELLED');
    const unpaid = active.filter(r => r.status !== 'PAID');
    const dueToday = unpaid.filter(r => r.dueDate === today);
    const overdue = unpaid.filter(r => r.dueDate && r.dueDate < today);
    const missingDoc = active.filter(r =>
      (r.needReceipt && !['RECEIVED', 'ISSUED'].includes(r.receiptStatus)) ||
      (r.needTaxInvoice && !['RECEIVED', 'ISSUED'].includes(r.taxInvoiceStatus)) ||
      (r.needWhtIssue && !['RECEIVED', 'ISSUED'].includes(r.whtIssueStatus)) ||
      (r.needOriginal && !['RECEIVED', 'ISSUED'].includes(r.originalStatus)));
    const sum = arr => arr.reduce((s, r) => s + num(r.netAmount), 0);
    res.json({
      ok: true, rows,
      summary: {
        total: rows.length,
        dueTodayCount: dueToday.length, dueTodayAmount: sum(dueToday),
        overdueCount: overdue.length, overdueAmount: sum(overdue),
        missingDocCount: missingDoc.length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payables', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const records = (req.body?.rows || []).map(r => {
      const gross = num(r.grossAmount), wht = num(r.whtAmount);
      const net = r.netAmount === '' || r.netAmount === null || r.netAmount === undefined
        ? Math.max(gross - wht, 0) : num(r.netAmount);
      return {
        id: r.id || 'AP-' + uuidv4(),
        due_date: dateKey(r.dueDate), status: String(r.status || 'PENDING').toUpperCase(),
        company: r.company || '', vendor: r.vendor || '', description: r.description || '',
        gross_amount: gross, wht_amount: wht, net_amount: net,
        bank: r.bank || '', account_no: r.accountNo || '', account_name: r.accountName || '',
        ref: r.ref || '', document_link: r.documentLink || '',
        need_receipt: !!r.needReceipt, receipt_status: r.receiptStatus || 'MISSING',
        need_tax_invoice: !!r.needTaxInvoice, tax_invoice_status: r.taxInvoiceStatus || 'NOT_REQUIRED',
        need_wht_issue: !!r.needWhtIssue, wht_issue_status: r.whtIssueStatus || 'NOT_REQUIRED',
        need_original: !!r.needOriginal, original_status: r.originalStatus || 'MISSING',
        note: r.note || '', updated_at: now, updated_by: req.user.username
      };
    });
    // upsert เฉพาะรายการที่ส่งมา (ไม่ล้างตาราง — ปลอดภัยต่อการกรองสถานะ)
    if (records.length) await sbUpsert('payables', records, 'id');
    // หมายเหตุ: ไม่ auto-push ไปชีตทุกครั้งที่บันทึก — ให้กดปุ่ม "Sync Google Sheet" แทน
    await writeActivityLog(req.user, 'SAVE_PAYABLES', 'payables', '', 'SUCCESS', 'Saved payables records', { rows: records.length });
    res.json({ ok: true, message: 'บันทึกบัญชีจ่ายสำเร็จ ' + records.length + ' รายการ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ลบรายการเดียว
router.delete('/payables/:id', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    await sbDelete('payables?id=eq.' + encodeURIComponent(req.params.id));
    await writeActivityLog(req.user, 'DELETE_PAYABLE', 'payables', req.params.id, 'SUCCESS', 'Deleted payable');
    res.json({ ok: true, message: 'ลบรายการแล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Debug: ดูข้อมูลดิบที่ GAS ส่งกลับมา (5 แถวแรก)
router.get('/payables/debug-sheet', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ตั้งค่า SHEET_SYNC_URL' });
    const { callSheet } = await import('../lib/sheetSync.js');
    return res.status(501).json({ error: 'ใช้ /payables/sync-sheet/raw แทน' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ดูข้อมูลดิบจาก GAS โดยตรง
router.get('/payables/sync-sheet/raw', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ตั้งค่า SHEET_SYNC_URL' });
    // เรียก GAS โดยตรง
    const cfg = {
      url:   process.env.SHEET_SYNC_URL,
      token: process.env.SHEET_SYNC_TOKEN,
      tab:   process.env.SHEET_SYNC_TAB || 'TGM_Payables',
    };
    const target = cfg.url + (cfg.url.includes('?') ? '&' : '?') +
      'token=' + encodeURIComponent(cfg.token) + '&tab=' + encodeURIComponent(cfg.tab);
    const r = await fetch(target);
    const data = await r.json();
    const rows = data.rows || [];
    // ส่งแค่แถวที่มี paid=true เพื่อดูว่า GAS อ่าน checkbox ถูกไหม
    const sample = rows.slice(0, 10).map(row => ({
      id: row.id, dueDate: row.dueDate, vendor: row.vendor,
      net: row.net, paid: row.paid, paidType: typeof row.paid, row: row.row
    }));
    const paidCount = rows.filter(r => r.paid === true || r.paid === 'TRUE' || r.paid === 1).length;
    res.json({ total: rows.length, paidCount, sample, tab: data.tab });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ทดสอบการเชื่อมต่อ
router.get('/payables/sync-sheet/test', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const result = await testSheetConnection();
    res.json({ ...result, tab: sheetSyncTab() });
  } catch (err) { res.status(500).json({ ok: false, reason: err.message }); }
});

// สร้าง TGM tab ใหม่ในชีต (ปลอดภัย — ไม่แตะ tab เดิม)
router.post('/payables/setup-sheet', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env' });
    const result = await setupSheetTab();
    if (result.error) return res.status(502).json({ error: result.error });
    const tab = sheetSyncTab();
    res.json({ ok: true, message: result.created ? `สร้าง tab "${tab}" สำเร็จ — พร้อม Full Sync` : `tab "${tab}" มีอยู่แล้ว`, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sync แบบปลอดภัย: Pull เท่านั้น (ชีต→TGM) ไม่เพิ่มแถวในชีต
router.post('/payables/sync-sheet', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env' });
    const result = await runSheetSync();
    if (result.error) return res.status(502).json({ error: result.error });
    const parts = [];
    if (result.pulled) parts.push(`อัปเดต status ${result.pulled} รายการ`);
    if (result.newIds) parts.push(`จับคู่แถวใหม่ ${result.newIds} แถว`);
    const msg = parts.length
      ? parts.join(' · ')
      : `อ่านชีตสำเร็จ — ไม่มีรายการที่เปลี่ยน status (${result.totalRows || 0} แถว)`;
    res.json({ ok: true, message: msg, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full sync 2 ทาง: Push (TGM→ชีต) แล้ว Pull (ชีต→TGM)
// ใช้หลัง Deploy Apps Script เวอร์ชันใหม่แล้วเท่านั้น
router.post('/payables/full-sync', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env' });
    const result = await runFullSync();
    if (result.error) return res.status(502).json({ error: result.error });
    const parts = [];
    if (result.sheetUpdated) parts.push(`อัปเดตชีต ${result.sheetUpdated} แถว`);
    if (result.sheetAdded) parts.push(`เพิ่มในชีต ${result.sheetAdded} แถวใหม่`);
    if (result.pulled) parts.push(`รับ status ${result.pulled} รายการ`);
    if (result.newIds) parts.push(`จับคู่ใหม่ ${result.newIds} แถว`);
    res.json({ ok: true, message: parts.join(' · ') || 'Sync สำเร็จ ไม่มีการเปลี่ยนแปลง', ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// นำเข้ารายการใหม่ทั้งหมดจากชีต (ใช้ครั้งแรก / sync ครั้งเดียว)
router.post('/payables/import-sheet', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env' });
    const result = await importFromSheet();
    const parts = [`นำเข้าสำเร็จ ${result.created} รายการ`];
    if (result.dateFixed) parts.push(`แก้วันที่ ${result.dateFixed} รายการ`);
    if (result.skipped)   parts.push(`ข้าม ${result.skipped} ที่มีอยู่แล้ว`);
    parts.push(`(${result.tab} · ${result.totalRows} แถวในชีต)`);
    const msg = parts.join(' · ');
    res.json({ ok: true, message: msg, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- ไฟล์แนบบัญชีจ่าย ----------
// ประเภทเอกสาร: QUOTATION ใบเสนอราคา, BILLING ใบวางบิล, RECEIPT ใบเสร็จ,
// TAX_INVOICE ใบกำกับภาษี, ID_CARD บัตรประชาชน, OTHER อื่นๆ
router.get('/payables/:id/attachments', async (req, res) => {
  try {
    const rows = await sbRequest(
      'payable_attachments?select=id,doc_type,file_name,file_size,uploaded_by,uploaded_at&payable_id=eq.' +
      encodeURIComponent(req.params.id) + '&order=uploaded_at.asc', 'get'
    );
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payables/:id/attachments', requireRole('ADMIN', 'UPLOADER'), uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์' });
    const docType = String(req.body?.docType || 'OTHER').toUpperCase();
    const attId = uuidv4();
    const safeName = req.file.originalname.replace(/[^\w.ก-๙เ-ๅ\- ]/g, '_');
    const storagePath = `${req.params.id}/${attId}_${safeName}`;
    await sbStorageUpload(DOC_BUCKET, storagePath, req.file.buffer, req.file.mimetype);
    await sbRequest('payable_attachments', 'post', [{
      id: attId,
      payable_id: req.params.id,
      doc_type: docType,
      file_name: req.file.originalname,
      storage_path: storagePath,
      content_type: req.file.mimetype || '',
      file_size: req.file.size,
      uploaded_by: req.user.username
    }], { Prefer: 'return=minimal' });
    await writeActivityLog(req.user, 'UPLOAD_PAYABLE_DOC', 'payable_attachments', attId, 'SUCCESS',
      `แนบ ${docType}: ${req.file.originalname}`, { payableId: req.params.id });
    res.json({ ok: true, message: 'แนบเอกสารแล้ว: ' + req.file.originalname, id: attId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/attachments/:attId/download', async (req, res) => {
  try {
    const rows = await sbRequest('payable_attachments?id=eq.' + encodeURIComponent(req.params.attId) + '&limit=1', 'get');
    if (!rows || !rows.length) return res.status(404).json({ error: 'ไม่พบไฟล์' });
    const att = rows[0];
    const { buffer, contentType } = await sbStorageDownload(DOC_BUCKET, att.storage_path);
    res.setHeader('Content-Type', att.content_type || contentType);
    res.setHeader('Content-Disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(att.file_name));
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/attachments/:attId', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const rows = await sbRequest('payable_attachments?id=eq.' + encodeURIComponent(req.params.attId) + '&limit=1', 'get');
    if (rows && rows.length) {
      try { await sbStorageDelete(DOC_BUCKET, rows[0].storage_path); } catch {}
      await sbDelete('payable_attachments?id=eq.' + encodeURIComponent(req.params.attId));
    }
    await writeActivityLog(req.user, 'DELETE_PAYABLE_DOC', 'payable_attachments', req.params.attId, 'SUCCESS', 'ลบไฟล์แนบ');
    res.json({ ok: true, message: 'ลบไฟล์แล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- MC Live Planner (พอร์ตจาก getMcLiveData / saveMcLiveData) ----------
router.get('/mc-live', async (req, res) => {
  try {
    const { start, end, brand, platform, status } = req.query;
    let path = 'mc_live_planner?select=*&order=date.asc';
    if (start) path += '&date=gte.' + dateKey(start);
    if (end) path += '&date=lte.' + dateKey(end);
    if (brand && brand !== 'ALL') path += '&brand=eq.' + encodeURIComponent(brand);
    if (platform && platform !== 'ALL') path += '&platform=eq.' + encodeURIComponent(platform);
    if (status && String(status).toUpperCase() !== 'ALL') path += '&status=eq.' + String(status).toUpperCase();
    const raw = await sbRequest(path, 'get') || [];
    const rows = raw.map(r => ({
      id: r.id, date: r.date || '', brand: r.brand, platform: r.platform, mc: r.mc,
      startTime: r.start_time, endTime: r.end_time, planTopic: r.plan_topic,
      targetSales: num(r.target_sales), actualSales: num(r.actual_sales), orders: num(r.orders),
      viewers: num(r.viewers), peakCcu: num(r.peak_ccu), comments: num(r.comments), clicks: num(r.clicks),
      addToCart: num(r.add_to_cart), coins: num(r.coins), adsCost: num(r.ads_cost),
      status: r.status, documentStatus: r.document_status, documentLinks: r.document_links,
      attachmentNames: r.attachment_names, note: r.note,
      createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by
    }));
    res.json({
      ok: true, rows,
      summary: {
        total: rows.length,
        done: rows.filter(r => r.status === 'DONE').length,
        sales: rows.reduce((s, r) => s + r.actualSales, 0),
        orders: rows.reduce((s, r) => s + r.orders, 0),
        missingDocs: rows.filter(r => r.status === 'DONE' && r.documentStatus !== 'COMPLETE').length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mc-live', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const records = (req.body?.rows || []).map(r => ({
      id: r.id || 'MC-' + uuidv4(),
      date: dateKey(r.date), brand: r.brand || '', platform: r.platform || '', mc: r.mc || '',
      start_time: r.startTime || '', end_time: r.endTime || '', plan_topic: r.planTopic || '',
      target_sales: num(r.targetSales), actual_sales: num(r.actualSales), orders: num(r.orders),
      viewers: num(r.viewers), peak_ccu: num(r.peakCcu), comments: num(r.comments), clicks: num(r.clicks),
      add_to_cart: num(r.addToCart), coins: num(r.coins), ads_cost: num(r.adsCost),
      status: String(r.status || 'PLANNED').toUpperCase(),
      document_status: String(r.documentStatus || 'MISSING').toUpperCase(),
      document_links: r.documentLinks || '', attachment_names: r.attachmentNames || '',
      note: r.note || '', updated_at: now, updated_by: req.user.username
    }));
    if (records.length) await sbUpsert('mc_live_planner', records, 'id');
    await writeActivityLog(req.user, 'SAVE_MC_LIVE', 'mc_live_planner', '', 'SUCCESS', 'Saved MC Live records', { rows: records.length });
    res.json({ ok: true, message: 'บันทึก MC Live Planner สำเร็จ ' + records.length + ' รายการ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ลบรายการ MC Live เดียว
router.delete('/mc-live/:id', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    await sbDelete('mc_live_planner?id=eq.' + encodeURIComponent(req.params.id));
    await writeActivityLog(req.user, 'DELETE_MC_LIVE', 'mc_live_planner', req.params.id, 'SUCCESS', 'Deleted MC Live row');
    res.json({ ok: true, message: 'ลบรายการแล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
