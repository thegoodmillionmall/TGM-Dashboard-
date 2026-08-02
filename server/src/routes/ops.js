import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import { sbRequest, sbUpsert, sbDelete, sbStorageUpload, sbStorageDownload, sbStorageDelete } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { runSheetSync, runFullSync, setupSheetTab, testSheetConnection, importFromSheet, sheetSyncEnabled, sheetSyncTab } from '../lib/sheetSync.js';

const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const sheetSyncMissingMessage = 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN หรือ PAYABLES_SCRIPT_URL / PAYABLES_SCRIPT_TOKEN ใน .env';
const DOC_BUCKET = 'payable-docs';
const MC_GO_LIVE_DATE = '2026-08-01';
const MC_DOC_FIELDS = [
  ['liveImage', 'live', 'เธ เธฒเธเธซเธเนเธฒเธเธญเธ—เธตเนเนเธฅเธเน'],
  ['salesImage', 'sales', 'เธซเธเนเธฒเธขเธญเธ”เธเธฒเธข'],
  ['endImage', 'end', 'เธซเธเนเธฒเธเธเนเธฅเธเน'],
];
const MC_COMPANIES = new Set(['TGM', 'Nola']);

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
const cleanDbRecord = record => Object.fromEntries(
  Object.entries(record).map(([key, value]) => [key, value === undefined ? null : value])
);
const PAYABLE_COLUMNS = [
  'id', 'due_date', 'status', 'company', 'vendor', 'description',
  'gross_amount', 'wht_amount', 'net_amount',
  'bank', 'account_no', 'account_name', 'ref', 'document_link',
  'need_receipt', 'receipt_status',
  'need_tax_invoice', 'tax_invoice_status',
  'need_wht_issue', 'wht_issue_status',
  'need_original', 'original_status',
  'note', 'created_at', 'updated_at', 'updated_by'
];
const normalizePayableRecord = record => {
  const cleaned = cleanDbRecord(record);
  return PAYABLE_COLUMNS.reduce((out, key) => {
    out[key] = cleaned[key] === undefined ? null : cleaned[key];
    return out;
  }, {});
};

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeMcCompany(value) {
  const raw = String(value || '').trim();
  if (/^nola$/i.test(raw)) return 'Nola';
  if (MC_COMPANIES.has(raw)) return raw;
  return 'TGM';
}

function normalizeMcCameraType(value) {
  return String(value || '').trim().toLowerCase() === 'obs' ? 'obs' : 'mobile';
}

function mcRequiredDocFields(cameraType) {
  return normalizeMcCameraType(cameraType) === 'obs' ? [MC_DOC_FIELDS[0]] : MC_DOC_FIELDS;
}

function mcDocStatus(docs, cameraType = docs?._meta?.cameraType) {
  const required = mcRequiredDocFields(cameraType);
  const done = required.filter(([, key]) => docs?.[key]?.path || docs?.[key]?.url).length;
  if (done >= required.length) return 'COMPLETE';
  return done > 0 ? 'PARTIAL' : 'MISSING';
}

function mcLeadRole(req) {
  return ['ADMIN', 'MC_LEAD'].includes(String(req.user?.role || '').toUpperCase());
}

function mcApproved(row) {
  return String(row?.status || '').toUpperCase() === 'APPROVED';
}

function mcDone(row) {
  return ['DONE', 'APPROVED'].includes(String(row?.status || '').toUpperCase());
}

function userCanEditMcLive(req, row) {
  if (mcLeadRole(req)) return true;
  return row?.updated_by && row.updated_by === req.user?.username;
}

function mcLiveRow(r) {
  const documents = parseJsonObject(r.document_links);
  const meta = documents._meta || {};
  const company = normalizeMcCompany(meta.company || r.brand);
  const cameraType = normalizeMcCameraType(meta.cameraType);
  return {
    id: r.id, date: r.date || '', brand: r.brand, company, cameraType, platform: r.platform, mc: r.mc,
    startTime: r.start_time, endTime: r.end_time, planTopic: r.plan_topic,
    targetSales: num(r.target_sales), actualSales: num(r.actual_sales), orders: num(r.orders),
    viewers: num(r.viewers), peakCcu: num(r.peak_ccu), comments: num(r.comments), clicks: num(r.clicks),
    addToCart: num(r.add_to_cart), coins: num(r.coins), adsCost: num(r.ads_cost),
    status: r.status, documentStatus: r.document_status, documentLinks: r.document_links,
    documents, docReview: documents._review || null, monthReview: documents._monthReview || null, attachmentNames: r.attachment_names, note: r.note,
    createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by
  };
}

const todayKey = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const compact = v => String(v || '').trim();
const slug = v => compact(v).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const thb = v => Math.round(num(v) * 100) / 100;

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function parseThaiDate(text) {
  const s = compact(text);
  if (!s) return '';
  if (/เธงเธฑเธเธเธตเน/.test(s)) return todayKey();
  if (/เธเธฃเธธเนเธเธเธตเน/.test(s)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const iso = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const dmy = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](25\d{2}|20\d{2})\b/);
  if (dmy) {
    const y = Number(dmy[3]) > 2400 ? Number(dmy[3]) - 543 : Number(dmy[3]);
    return `${y}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return '';
}

function guessExpense(text) {
  const s = compact(text);
  const amountMatches = [...s.matchAll(/(?:เธฟ|เธเธฒเธ—)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:เธเธฒเธ—|เธ\.|เธฟ)?/g)]
    .map(m => thb(m[1]))
    .filter(v => v > 0);
  const whtMatch = s.match(/(?:เธซเธฑเธ\s*เธ“\s*เธ—เธตเนเธเนเธฒเธข|wht|เธซเธฑเธ)\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:เธเธฒเธ—|เธ\.|เธฟ)?/i);
  const pctMatch = s.match(/(?:เธซเธฑเธ\s*เธ“\s*เธ—เธตเนเธเนเธฒเธข|wht|เธซเธฑเธ)\s*(\d+(?:\.\d+)?)\s*%/i);
  const gross = amountMatches[0] || 0;
  let wht = whtMatch ? thb(whtMatch[1]) : 0;
  if (!wht && pctMatch && gross) wht = thb(gross * (Number(pctMatch[1]) / 100));
  const netMatch = s.match(/(?:เธขเธญเธ”เธชเธธเธ—เธเธด|เธชเธธเธ—เธเธด|เนเธญเธเธเธฃเธดเธ|เธเนเธฒเธขเธเธฃเธดเธ)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  const net = netMatch ? thb(netMatch[1]) : thb(Math.max(gross - wht, 0));
  const explicitVendor = s.match(/(?:เนเธซเนเธเธฃเธดเธฉเธฑเธ—|เธเธฃเธดเธฉเธฑเธ—|เธเธเธ\.?|vendor|เธเธนเนเธฃเธฑเธเน€เธเธดเธ|เนเธญเธเนเธซเน)\s+(.+?)(?:\s+(?:ref|เน€เธฅเธเธ—เธตเน|เน€เธญเธเธชเธฒเธฃ|เธขเธญเธ”|เธเธณเธเธงเธ|เธซเธฑเธ|เธเธเธฒเธเธฒเธฃ|เธเธฑเธเธเธต|เน€เธฅเธ|เธงเธฑเธเธเธตเน|เธงเธฑเธเธ—เธตเน)|$)/i);
  const vendorMatch = explicitVendor || s.match(/(?:เธเนเธฒเธขเนเธซเน|เนเธซเน)\s+(.+?)(?:\s+(?:เธขเธญเธ”|เธเธณเธเธงเธ|เธเนเธฒ|เธซเธฑเธ|เธเธเธฒเธเธฒเธฃ|เธเธฑเธเธเธต|เน€เธฅเธ|เธงเธฑเธเธเธตเน|เธงเธฑเธเธ—เธตเน)|$)/i);
  const descMatch = s.match(/(?:เธเนเธฒ|เน€เธฃเธทเนเธญเธ|เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”)\s*([^,๏ผ\n]+?)(?:\s+(?:เธขเธญเธ”|เธเธณเธเธงเธ|เธซเธฑเธ|เธเธเธฒเธเธฒเธฃ|เธเธฑเธเธเธต|เน€เธฅเธ|เธงเธฑเธเธเธตเน|เธงเธฑเธเธ—เธตเน)|$)/i);
  const accountMatch = s.match(/(?:เน€เธฅเธเธเธฑเธเธเธต|เธเธฑเธเธเธต|acc(?:ount)?)\s*[:๏ผ]?\s*([0-9\- ]{6,})/i);
  const bankMatch = s.match(/(เธเธชเธดเธเธฃ|kbank|scb|เนเธ—เธขเธเธฒเธ“เธดเธเธขเน|ktb|เธเธฃเธธเธเนเธ—เธข|bbl|เธเธฃเธธเธเน€เธ—เธ|bay|เธเธฃเธธเธเธจเธฃเธต|ttb|เธ—เธตเธ—เธตเธเธต)/i);

  return {
    dueDate: parseThaiDate(s) || todayKey(),
    status: /เธเนเธฒเธขเนเธฅเนเธง|เนเธญเธเนเธฅเนเธง|paid/i.test(s) ? 'PAID' : 'PENDING',
    company: /azher/i.test(s) ? 'AZHER' : 'TG',
    vendor: compact(vendorMatch?.[1] || ''),
    description: compact(descMatch?.[1] || s.slice(0, 80)),
    grossAmount: gross,
    whtAmount: wht,
    netAmount: net,
    bank: compact(bankMatch?.[1] || ''),
    accountNo: compact(accountMatch?.[1] || ''),
    accountName: '',
    ref: compact((s.match(/(?:ref|เน€เธฅเธเธ—เธตเน|เน€เธญเธเธชเธฒเธฃ)\s*[:๏ผ]?\s*([A-Z0-9\-\/]+)/i) || [])[1] || ''),
    documentLink: compact((s.match(/https?:\/\/\S+/i) || [])[0] || ''),
    note: ''
  };
}

async function askPayableAi(text) {
  if (!config.googleAiKey) return null;
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(config.googleAiModel) + ':generateContent?key=' + encodeURIComponent(config.googleAiKey);
  const prompt = [
    'เธญเนเธฒเธเธเนเธญเธกเธนเธฅเธฃเธฒเธขเธเนเธฒเธขเธ เธฒเธฉเธฒเนเธ—เธข เนเธฅเนเธงเธ•เธญเธเน€เธเนเธ JSON เน€เธ—เนเธฒเธเธฑเนเธ เธซเนเธฒเธกเธกเธต markdown',
    'schema: {"dueDate":"YYYY-MM-DD","status":"PENDING|PAID","company":"TG|AZHER","vendor":"","description":"","grossAmount":0,"whtAmount":0,"netAmount":0,"bank":"","accountNo":"","accountName":"","ref":"","documentLink":"","note":"","confidence":0}',
    'เธ–เนเธฒเนเธกเนเธเธเธงเธฑเธเธ—เธตเนเนเธซเนเนเธเนเธงเธฑเธเธเธตเน: ' + todayKey(),
    'เธ–เนเธฒเนเธกเนเธเธ netAmount เนเธซเนเธเธณเธเธงเธ“ grossAmount - whtAmount',
    'เธเนเธญเธเธงเธฒเธก:',
    text
  ].join('\n');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 700 }
    })
  });
  if (!response.ok) return null;
  const body = await response.json();
  const answer = (body?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  return extractJson(answer);
}

async function payableWarnings(draft, existingRows = []) {
  const warnings = [];
  const gross = thb(draft.grossAmount);
  const wht = thb(draft.whtAmount);
  const net = thb(draft.netAmount);
  if (!draft.vendor) warnings.push('เธขเธฑเธเนเธกเนเธเธเธเธทเนเธญเธเธนเนเธฃเธฑเธเน€เธเธดเธ/เธเธฃเธดเธฉเธฑเธ—');
  if (!draft.description) warnings.push('เธขเธฑเธเนเธกเนเธเธเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธฃเธฒเธขเธเนเธฒเธข');
  if (!gross) warnings.push('เธขเธฑเธเนเธกเนเธเธเธขเธญเธ”เน€เธเธดเธเธฃเธงเธก');
  if (Math.abs((gross - wht) - net) > 0.01) warnings.push('เธขเธญเธ”เธชเธธเธ—เธเธดเนเธกเนเน€เธ—เนเธฒเธเธฑเธเธขเธญเธ”เธฃเธงเธก - เธซเธฑเธ เธ“ เธ—เธตเนเธเนเธฒเธข');
  if (draft.status === 'PAID') warnings.push('เธเนเธญเธเธงเธฒเธกเธเธญเธเธงเนเธฒเธเนเธฒเธขเนเธฅเนเธง: เธเธงเธฃเธเธฃเธฐเธ—เธ Statement เธเนเธญเธเธเธดเธ”เธเธฒเธ');
  const vendorKey = compact(draft.vendor).toLowerCase();
  const dup = existingRows.find(r =>
    compact(r.vendor).toLowerCase() === vendorKey &&
    Math.abs(num(r.net_amount) - net) < 0.01 &&
    r.status !== 'CANCELLED'
  );
  if (dup) warnings.push(`เธญเธฒเธเธเนเธณเธเธฑเธเธฃเธฒเธขเธเธฒเธฃเน€เธ”เธดเธก ${dup.id || ''} (${dup.due_date || ''}) เธขเธญเธ” ${net.toLocaleString('th-TH')}`);
  const oldVendor = existingRows.find(r => compact(r.vendor).toLowerCase() === vendorKey && compact(r.account_no));
  if (oldVendor && draft.accountNo && compact(oldVendor.account_no) !== compact(draft.accountNo)) {
    warnings.push(`Vendor เธเธตเนเน€เธเธขเนเธเนเน€เธฅเธเธเธฑเธเธเธต ${oldVendor.account_no} เนเธ•เนเธฃเนเธฒเธเธเธตเนเน€เธเนเธ ${draft.accountNo}`);
  }
  return warnings;
}

// ---------- Payables (เธเธญเธฃเนเธ•เธเธฒเธ getPayablesData / savePayablesData) ----------
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
    // เธเธฑเธเนเธเธฅเนเนเธเธเธเธญเธเนเธ•เนเธฅเธฐเธฃเธฒเธขเธเธฒเธฃ
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
    const inputRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const records = inputRows.map(r => {
      const gross = num(r.grossAmount), wht = num(r.whtAmount);
      const net = r.netAmount === '' || r.netAmount === null || r.netAmount === undefined
        ? Math.max(gross - wht, 0) : num(r.netAmount);
      return normalizePayableRecord({
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
        note: r.note || '', created_at: r.createdAt || now, updated_at: now, updated_by: req.user?.username || ''
      });
    });
    // upsert เน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธชเนเธเธกเธฒ (เนเธกเนเธฅเนเธฒเธเธ•เธฒเธฃเธฒเธ โ€” เธเธฅเธญเธ”เธ เธฑเธขเธ•เนเธญเธเธฒเธฃเธเธฃเธญเธเธชเธ–เธฒเธเธฐ)
    if (records.length) await sbUpsert('payables', records, 'id');
    // เธซเธกเธฒเธขเน€เธซเธ•เธธ: เนเธกเน auto-push เนเธเธเธตเธ•เธ—เธธเธเธเธฃเธฑเนเธเธ—เธตเนเธเธฑเธเธ—เธถเธ โ€” เนเธซเนเธเธ”เธเธธเนเธก "Sync Google Sheet" เนเธ—เธ
    await writeActivityLog(req.user, 'SAVE_PAYABLES', 'payables', '', 'SUCCESS', 'Saved payables records', { rows: records.length });
    res.json({ ok: true, message: 'บันทึกบัญชีจ่ายสำเร็จ ' + records.length + ' รายการ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/payables/ai-draft', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const text = compact(req.body?.text);
    if (!text) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเธงเธฒเธเธเนเธญเธเธงเธฒเธกเธฃเธฒเธขเธเนเธฒเธขเธเนเธญเธ' });

    const aiDraft = await askPayableAi(text).catch(() => null);
    const fallbackDraft = guessExpense(text);
    const draft = { ...fallbackDraft, ...(aiDraft || {}) };
    draft.dueDate = dateKey(draft.dueDate) || fallbackDraft.dueDate || todayKey();
    draft.status = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'].includes(String(draft.status || '').toUpperCase())
      ? String(draft.status).toUpperCase()
      : fallbackDraft.status;
    draft.company = ['TG', 'AZHER'].includes(String(draft.company || '').toUpperCase()) ? String(draft.company).toUpperCase() : 'TG';
    draft.grossAmount = thb(draft.grossAmount);
    draft.whtAmount = thb(draft.whtAmount);
    draft.netAmount = thb(draft.netAmount || Math.max(draft.grossAmount - draft.whtAmount, 0));

    const existing = await sbRequest('payables?select=id,due_date,vendor,net_amount,account_no,status&order=due_date.desc&limit=500', 'get').catch(() => []) || [];
    const warnings = await payableWarnings(draft, existing);
    const confidence = Number(aiDraft?.confidence || 0) || (warnings.length ? 0.55 : 0.75);

    await writeActivityLog(req.user, 'AI_DRAFT_PAYABLE', 'payables', '', 'SUCCESS', 'AI drafted payable', { warnings: warnings.length, confidence });
    res.json({ ok: true, draft, warnings, confidence, source: aiDraft ? 'AI' : 'rule-based fallback' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เธฅเธเธฃเธฒเธขเธเธฒเธฃเน€เธ”เธตเธขเธง
router.delete('/payables/:id', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    await sbDelete('payables?id=eq.' + encodeURIComponent(req.params.id));
    await writeActivityLog(req.user, 'DELETE_PAYABLE', 'payables', req.params.id, 'SUCCESS', 'Deleted payable');
    res.json({ ok: true, message: 'เธฅเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Debug: เธ”เธนเธเนเธญเธกเธนเธฅเธ”เธดเธเธ—เธตเน GAS เธชเนเธเธเธฅเธฑเธเธกเธฒ (5 เนเธ–เธงเนเธฃเธ)
router.get('/payables/debug-sheet', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    const { callSheet } = await import('../lib/sheetSync.js');
    return res.status(501).json({ error: 'เนเธเน /payables/sync-sheet/raw เนเธ—เธ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เธ”เธนเธเนเธญเธกเธนเธฅเธ”เธดเธเธเธฒเธ GAS เนเธ”เธขเธ•เธฃเธ
router.get('/payables/sync-sheet/raw', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    // เน€เธฃเธตเธขเธ GAS เนเธ”เธขเธ•เธฃเธ
    const cfg = {
      url:   process.env.SHEET_SYNC_URL || process.env.PAYABLES_SCRIPT_URL,
      token: process.env.SHEET_SYNC_TOKEN || process.env.PAYABLES_SCRIPT_TOKEN,
      tab:   process.env.SHEET_SYNC_TAB || process.env.GOOGLE_PAYABLES_TAB || 'TGM_Payables',
    };
    const target = cfg.url + (cfg.url.includes('?') ? '&' : '?') +
      'token=' + encodeURIComponent(cfg.token) + '&tab=' + encodeURIComponent(cfg.tab);
    const r = await fetch(target);
    const data = await r.json();
    const rows = data.rows || [];
    // เธชเนเธเนเธเนเนเธ–เธงเธ—เธตเนเธกเธต paid=true เน€เธเธทเนเธญเธ”เธนเธงเนเธฒ GAS เธญเนเธฒเธ checkbox เธ–เธนเธเนเธซเธก
    const sample = rows.slice(0, 10).map(row => ({
      id: row.id, dueDate: row.dueDate, vendor: row.vendor,
      net: row.net, paid: row.paid, paidType: typeof row.paid, row: row.row
    }));
    const paidCount = rows.filter(r => r.paid === true || r.paid === 'TRUE' || r.paid === 1).length;
    res.json({ total: rows.length, paidCount, sample, tab: data.tab });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เธ—เธ”เธชเธญเธเธเธฒเธฃเน€เธเธทเนเธญเธกเธ•เนเธญ
router.get('/payables/sync-sheet/test', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const result = await testSheetConnection();
    res.json({ ...result, tab: sheetSyncTab() });
  } catch (err) { res.status(500).json({ ok: false, reason: err.message }); }
});

// เธชเธฃเนเธฒเธ TGM tab เนเธซเธกเนเนเธเธเธตเธ• (เธเธฅเธญเธ”เธ เธฑเธข โ€” เนเธกเนเนเธ•เธฐ tab เน€เธ”เธดเธก)
router.post('/payables/setup-sheet', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    const result = await setupSheetTab();
    if (result.error) return res.status(502).json({ error: result.error });
    const tab = sheetSyncTab();
    res.json({ ok: true, message: result.created ? `สร้าง tab "${tab}" สำเร็จ - พร้อม Full Sync` : `tab "${tab}" มีอยู่แล้ว`, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sync เนเธเธเธเธฅเธญเธ”เธ เธฑเธข: Pull เน€เธ—เนเธฒเธเธฑเนเธ (เธเธตเธ•โ’TGM) เนเธกเนเน€เธเธดเนเธกเนเธ–เธงเนเธเธเธตเธ•
router.post('/payables/sync-sheet', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    const result = await runSheetSync();
    if (result.error) return res.status(502).json({ error: result.error });
    const parts = [];
    if (result.pulled) parts.push(`อัปเดต status ${result.pulled} รายการ`);
    if (result.newIds) parts.push(`จับคู่แถวใหม่ ${result.newIds} แถว`);
    const msg = parts.length
      ? parts.join(' - ')
      : `อ่านชีตสำเร็จ - ไม่มีรายการที่เปลี่ยน status (${result.totalRows || 0} แถว)`;
    res.json({ ok: true, message: msg, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full sync 2 เธ—เธฒเธ: Push (TGMโ’เธเธตเธ•) เนเธฅเนเธง Pull (เธเธตเธ•โ’TGM)
// เนเธเนเธซเธฅเธฑเธ Deploy Apps Script เน€เธงเธญเธฃเนเธเธฑเธเนเธซเธกเนเนเธฅเนเธงเน€เธ—เนเธฒเธเธฑเนเธ
router.post('/payables/full-sync', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    const result = await runFullSync();
    if (result.error) return res.status(502).json({ error: result.error });
    const parts = [];
    if (result.sheetUpdated) parts.push(`อัปเดตชีต ${result.sheetUpdated} แถว`);
    if (result.sheetAdded) parts.push(`เพิ่มในชีต ${result.sheetAdded} แถวใหม่`);
    if (result.pulled) parts.push(`รับ status ${result.pulled} รายการ`);
    if (result.newIds) parts.push(`จับคู่ใหม่ ${result.newIds} แถว`);
    res.json({ ok: true, message: parts.join(' - ') || 'Sync สำเร็จ ไม่มีการเปลี่ยนแปลง', ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เธเธณเน€เธเนเธฒเธฃเธฒเธขเธเธฒเธฃเนเธซเธกเนเธ—เธฑเนเธเธซเธกเธ”เธเธฒเธเธเธตเธ• (เนเธเนเธเธฃเธฑเนเธเนเธฃเธ / sync เธเธฃเธฑเนเธเน€เธ”เธตเธขเธง)
router.post('/payables/import-sheet', requireRole('ADMIN'), async (req, res) => {
  try {
    if (!sheetSyncEnabled()) return res.status(400).json({ error: sheetSyncMissingMessage });
    const result = await importFromSheet();
    const parts = [`นำเข้าสำเร็จ ${result.created} รายการ`];
    if (result.dateFixed) parts.push(`แก้วันที่ ${result.dateFixed} รายการ`);
    if (result.skipped) parts.push(`ข้าม ${result.skipped} รายการที่มีอยู่แล้ว`);
    parts.push(`(${result.tab} - ${result.totalRows} แถวในชีต)`);
    const msg = parts.join(' - ');
    res.json({ ok: true, message: msg, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- เนเธเธฅเนเนเธเธเธเธฑเธเธเธตเธเนเธฒเธข ----------
// เธเธฃเธฐเน€เธ เธ—เน€เธญเธเธชเธฒเธฃ: QUOTATION เนเธเน€เธชเธเธญเธฃเธฒเธเธฒ, BILLING เนเธเธงเธฒเธเธเธดเธฅ, RECEIPT เนเธเน€เธชเธฃเนเธ,
// TAX_INVOICE เนเธเธเธณเธเธฑเธเธ เธฒเธฉเธต, ID_CARD เธเธฑเธ•เธฃเธเธฃเธฐเธเธฒเธเธ, OTHER เธญเธทเนเธเน
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
    if (!req.file) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเนเธเธเนเธเธฅเน' });
    const docType = String(req.body?.docType || 'OTHER').toUpperCase();
    const attId = uuidv4();
    const safeName = req.file.originalname.replace(/[^\w.\- ]/g, '_');
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
      `เนเธเธ ${docType}: ${req.file.originalname}`, { payableId: req.params.id });
    res.json({ ok: true, message: 'เนเธเธเน€เธญเธเธชเธฒเธฃเนเธฅเนเธง: ' + req.file.originalname, id: attId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/attachments/:attId/download', async (req, res) => {
  try {
    const rows = await sbRequest('payable_attachments?id=eq.' + encodeURIComponent(req.params.attId) + '&limit=1', 'get');
    if (!rows || !rows.length) return res.status(404).json({ error: 'เนเธกเนเธเธเนเธเธฅเน' });
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
    await writeActivityLog(req.user, 'DELETE_PAYABLE_DOC', 'payable_attachments', req.params.attId, 'SUCCESS', 'เธฅเธเนเธเธฅเนเนเธเธ');
    res.json({ ok: true, message: 'เธฅเธเนเธเธฅเนเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function cell(ws, r, c) {
  return ws[XLSX.utils.encode_cell({ r, c })] || null;
}

function cellText(ws, r, c) {
  const x = cell(ws, r, c);
  if (!x) return '';
  return compact(x.w !== undefined ? x.w : x.v);
}

function cellNum(ws, r, c) {
  const x = cell(ws, r, c);
  if (!x) return 0;
  return num(x.v !== undefined ? x.v : x.w);
}

function isUsefulTime(text) {
  const s = compact(text);
  return !!s && s !== '0' && s !== '-' && !/เธเธดเธ”เนเธขเธ/i.test(s);
}

function sheetMonthYear(sheetName) {
  const m = String(sheetName || '').match(/\b(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})/i);
  if (!m) return null;
  const monthMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const month = monthMap[m[1].toLowerCase()];
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  return month && year ? { month, year } : null;
}

function parseLiveDate(text, expected) {
  const s = compact(text);
  if (!s) return '';
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4,5})$/);
  if (m) {
    let y = expected?.year || Number(m[3]);
    if (y > 2500) y -= 543;
    return `${y}-${String(expected?.month || m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return dateKey(s);
}

function liveRecord({ id, date, mc, platform, liveTime, sales, orders, viewers, addToCart, coins, adsCost, sourceSheet, rowNo }) {
  return {
    id,
    date,
    brand: 'The Good Million',
    platform,
    mc,
    startTime: liveTime || '',
    endTime: '',
    planTopic: `${platform} Live`,
    targetSales: 0,
    actualSales: thb(sales),
    orders: num(orders),
    viewers: num(viewers),
    peakCcu: 0,
    comments: 0,
    clicks: 0,
    addToCart: num(addToCart),
    coins: num(coins),
    adsCost: thb(adsCost),
    status: 'DONE',
    documentStatus: 'MISSING',
    documentLinks: '',
    attachmentNames: '',
    note: `เธเธณเน€เธเนเธฒเธเธฒเธ ${sourceSheet} เนเธ–เธง ${rowNo}${liveTime ? ` | เน€เธงเธฅเธฒเนเธฅเธเน ${liveTime}` : ''}`,
  };
}

function parseLiveMetricSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const records = [];
  let currentDate = '';
  const expectedDate = sheetMonthYear(sheetName);

  for (let r = 3; r <= ref.e.r; r++) {
    const shownDate = cellText(ws, r, 0);
    if (shownDate) currentDate = parseLiveDate(shownDate, expectedDate);
    if (!currentDate) continue;

    for (let c = 1; c <= ref.e.c; c += 8) {
      const mc = cellText(ws, 1, c);
      if (!mc || mc.includes('เธชเธฃเธธเธ') || /summary|coin|ads/i.test(mc)) continue;

      const spTime = cellText(ws, r, c);
      const spSales = cellNum(ws, r, c + 1);
      const spCoins = cellNum(ws, r, c + 2);
      const spAds = cellNum(ws, r, c + 3);
      if (isUsefulTime(spTime) || spSales || spCoins || spAds) {
        records.push(liveRecord({
          id: `LIVE-${slug(sheetName)}-${r + 1}-${slug(mc)}-SP`,
          date: currentDate, mc, platform: 'Shopee', liveTime: isUsefulTime(spTime) ? spTime : '',
          sales: spSales, coins: spCoins, adsCost: spAds, sourceSheet: sheetName, rowNo: r + 1,
        }));
      }

      const ttTime = cellText(ws, r, c + 4);
      const ttSales = cellNum(ws, r, c + 5);
      const ttAds = cellNum(ws, r, c + 6);
      if (isUsefulTime(ttTime) || ttSales || ttAds) {
        records.push(liveRecord({
          id: `LIVE-${slug(sheetName)}-${r + 1}-${slug(mc)}-TT`,
          date: currentDate, mc, platform: 'TikTok', liveTime: isUsefulTime(ttTime) ? ttTime : '',
          sales: ttSales, adsCost: ttAds, sourceSheet: sheetName, rowNo: r + 1,
        }));
      }
    }
  }
  return records;
}

function parseSale44Sheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const records = [];

  for (let r = 3; r <= ref.e.r; r++) {
    const mc = cellText(ws, r, 1);
    const date = parseLiveDate(cellText(ws, r, 2));
    if (!mc || !date) continue;
    const liveTime = cellText(ws, r, 3);
    const ttAds = cellNum(ws, r, 7);
    const ttSales = cellNum(ws, r, 8);
    const spAds = cellNum(ws, r, 11);
    const spSales = cellNum(ws, r, 12);

    if (ttSales || ttAds) {
      records.push(liveRecord({
        id: `LIVE-${slug(sheetName)}-${r + 1}-${slug(mc)}-TT`,
        date, mc, platform: 'TikTok', liveTime, sales: ttSales, adsCost: ttAds,
        sourceSheet: sheetName, rowNo: r + 1,
      }));
    }
    if (spSales || spAds) {
      records.push(liveRecord({
        id: `LIVE-${slug(sheetName)}-${r + 1}-${slug(mc)}-SP`,
        date, mc, platform: 'Shopee', liveTime, sales: spSales, adsCost: spAds,
        sourceSheet: sheetName, rowNo: r + 1,
      }));
    }
  }
  return records;
}

function parseMcLiveWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const metricSheets = wb.SheetNames.filter(name => /เธเธก\.?\+เธขเธญเธ”|เธเธฑเนเธงเนเธกเธ\+เธขเธญเธ”/.test(name));
  const records = metricSheets.flatMap(name => parseLiveMetricSheet(wb, name));
  if (wb.SheetNames.includes('4.4 Sales')) records.push(...parseSale44Sheet(wb, '4.4 Sales'));

  const dedup = new Map();
  for (const r of records) {
    if (!r.date || !r.mc || !r.platform) continue;
    dedup.set(r.id, r);
  }
  return {
    sheets: [...metricSheets, ...(wb.SheetNames.includes('4.4 Sales') ? ['4.4 Sales'] : [])],
    rows: [...dedup.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || String(a.mc).localeCompare(String(b.mc), 'th') || String(a.platform).localeCompare(String(b.platform))
    ),
  };
}

// ---------- MC Live Planner (เธเธญเธฃเนเธ•เธเธฒเธ getMcLiveData / saveMcLiveData) ----------
router.get('/mc-live', async (req, res) => {
  try {
    const { start, end, brand, platform, status } = req.query;
    let path = 'mc_live_planner?select=*&order=date.asc';
    if (start) path += '&date=gte.' + dateKey(start);
    if (end) path += '&date=lte.' + dateKey(end);
    if (brand && brand !== 'ALL') path += '&brand=eq.' + encodeURIComponent(brand);
    if (platform && platform !== 'ALL') path += '&platform=eq.' + encodeURIComponent(platform);
    if (status && String(status).toUpperCase() !== 'ALL') path += '&status=eq.' + String(status).toUpperCase();
    if (String(req.user?.role || '').toUpperCase() === 'MC') path += '&updated_by=eq.' + encodeURIComponent(req.user.username);
    const raw = await sbRequest(path, 'get') || [];
    const rows = raw.map(mcLiveRow);
    res.json({
      ok: true, rows,
      summary: {
        total: rows.length,
        done: rows.filter(r => mcDone(r)).length,
        sales: rows.reduce((s, r) => s + r.actualSales, 0),
        orders: rows.reduce((s, r) => s + r.orders, 0),
        adsCost: rows.reduce((s, r) => s + r.adsCost, 0),
        coins: rows.reduce((s, r) => s + r.coins, 0),
        missingDocs: rows.filter(r => mcDone(r) && (r.documentStatus !== 'COMPLETE' || !r.docReview?.checked || r.docReview?.rejected)).length
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mc-live', requireRole('ADMIN', 'MC_LEAD'), async (req, res) => {
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
    if (String(req.user?.role || '').toUpperCase() !== 'ADMIN') {
      for (const record of records) {
        if (!record.id) continue;
        const existing = await sbRequest('mc_live_planner?select=status&id=eq.' + encodeURIComponent(record.id) + '&limit=1', 'get');
        if (mcApproved(existing?.[0])) {
          return res.status(403).json({ error: 'รายการนี้ผู้บริหารอนุมัติรายเดือนแล้ว ต้องให้ ADMIN เปิดเดือนกลับมาก่อนจึงแก้ไขได้' });
        }
      }
    }
    if (records.length) await sbUpsert('mc_live_planner', records, 'id');
    await writeActivityLog(req.user, 'SAVE_MC_LIVE', 'mc_live_planner', '', 'SUCCESS', 'Saved MC Live records', { rows: records.length });
    res.json({ ok: true, message: 'เธเธฑเธเธ—เธถเธ MC Live Planner เธชเธณเน€เธฃเนเธ ' + records.length + ' เธฃเธฒเธขเธเธฒเธฃ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/mc-live/mine', async (req, res) => {
  try {
    const start = dateKey(req.query.start) || MC_GO_LIVE_DATE;
    const end = dateKey(req.query.end);
    let path = 'mc_live_planner?select=*&order=date.desc&updated_by=eq.' + encodeURIComponent(req.user.username);
    if (start) path += '&date=gte.' + start;
    if (end) path += '&date=lte.' + end;
    const rows = (await sbRequest(path, 'get') || []).map(mcLiveRow);
    res.json({ ok: true, rows, goLiveDate: MC_GO_LIVE_DATE });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mc-live/mine', uploadFile.fields(MC_DOC_FIELDS.map(([name]) => ({ name, maxCount: 1 }))), async (req, res) => {
  try {
    const body = req.body || {};
    const liveDate = dateKey(body.date);
    const company = normalizeMcCompany(body.company || body.brand);
    const cameraType = normalizeMcCameraType(body.cameraType);
    const platform = company === 'Nola' ? 'TikTok' : String(body.platform || '').trim();
    const startTime = String(body.startTime || '').trim();
    const endTime = String(body.endTime || '').trim();
    if (!liveDate) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธงเธฑเธเธ—เธตเน' });
    if (liveDate < MC_GO_LIVE_DATE) return res.status(400).json({ error: 'เธฃเธฒเธขเธเธฒเธฃเธ—เธตเธกเน€เธฃเธดเนเธกเนเธเนเธเธฃเธดเธเธ•เธฑเนเธเนเธ•เน 2026-08-01' });
    if (!platform) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ platform' });
    if (!startTime || !endTime) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเน€เธงเธฅเธฒเน€เธฃเธดเนเธกเธ•เนเธเนเธฅเธฐเน€เธงเธฅเธฒเธชเธดเนเธเธชเธธเธ”' });

    const id = String(body.id || '').trim() || 'MC-' + uuidv4();
    let existing = null;
    if (body.id) {
      const found = await sbRequest('mc_live_planner?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1', 'get');
      existing = found?.[0] || null;
      if (!existing) return res.status(404).json({ error: 'เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเธเนเธเธตเน' });
      if (!userCanEditMcLive(req, existing)) return res.status(403).json({ error: 'เนเธเนเนเธเนเธ”เนเน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเธเธญเธเธ•เธฑเธงเน€เธญเธเน€เธ—เนเธฒเธเธฑเนเธ' });
      if (mcApproved(existing) && req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'รายการนี้ผู้บริหารอนุมัติแล้ว ต้องให้ ADMIN เปิดเดือนกลับมาก่อนจึงแก้ไขได้' });
    }

    const docs = parseJsonObject(existing?.document_links);
    const names = parseJsonObject(existing?.attachment_names);
    delete docs._review;
    delete docs._monthReview;
    docs._meta = { ...(docs._meta || {}), company, cameraType };
    for (const [fieldName, docKey, label] of MC_DOC_FIELDS) {
      const file = req.files?.[fieldName]?.[0];
      if (!file) continue;
      if (!String(file.mimetype || '').startsWith('image/')) {
        return res.status(400).json({ error: `${label} เธ•เนเธญเธเน€เธเนเธเนเธเธฅเนเธฃเธนเธเธ เธฒเธ` });
      }
      const safeName = file.originalname.replace(/[^\w.\- ]/g, '_');
      const storagePath = `mc-live/${id}/${docKey}_${Date.now()}_${safeName}`;
      await sbStorageUpload(DOC_BUCKET, storagePath, file.buffer, file.mimetype);
      docs[docKey] = {
        name: file.originalname,
        path: storagePath,
        url: `/api/ops/mc-live/docs/${encodeURIComponent(id)}/${docKey}/download`
      };
      names[docKey] = file.originalname;
    }

    const documentStatus = mcDocStatus(docs, cameraType);
    if (documentStatus !== 'COMPLETE') {
      const missing = mcRequiredDocFields(cameraType).filter(([, key]) => !docs?.[key]?.path && !docs?.[key]?.url).map(([, , label]) => label);
      return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเนเธเธเน€เธญเธเธชเธฒเธฃเนเธซเนเธเธฃเธ: ' + missing.join(', ') });
    }

    const now = new Date().toISOString();
    const record = {
      id,
      date: liveDate,
      brand: company,
      platform,
      mc: req.user.displayName || req.user.username,
      start_time: startTime,
      end_time: endTime,
      plan_topic: body.planTopic || '',
      target_sales: num(body.targetSales),
      actual_sales: num(body.actualSales),
      orders: num(body.orders),
      viewers: num(body.viewers),
      peak_ccu: num(body.peakCcu),
      comments: num(body.comments),
      clicks: num(body.clicks),
      add_to_cart: num(body.addToCart),
      coins: num(body.coins),
      ads_cost: num(body.adsCost),
      status: 'DONE',
      document_status: documentStatus,
      document_links: JSON.stringify(docs),
      attachment_names: JSON.stringify(names),
      note: body.note || 'เธเธฑเธเธ—เธถเธ performance เธฃเธฒเธขเธเธ',
      updated_at: now,
      updated_by: req.user.username
    };
    await sbUpsert('mc_live_planner', [record], 'id');
    await writeActivityLog(req.user, existing ? 'UPDATE_MY_MC_LIVE' : 'CREATE_MY_MC_LIVE', 'mc_live_planner', id, 'SUCCESS', 'Saved own MC Live performance');
    res.json({ ok: true, row: mcLiveRow(record), message: existing ? 'เธญเธฑเธเน€เธ”เธ•เธฃเธฒเธขเธเธฒเธฃเธเธญเธเธเธฑเธเนเธฅเนเธง' : 'เธเธฑเธเธ—เธถเธเธฃเธฒเธขเธเธฒเธฃเธเธญเธเธเธฑเธเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/mc-live/month-review', requireRole('ADMIN'), async (req, res) => {
  try {
    const month = String(req.body?.month || '').trim();
    const action = String(req.body?.action || 'approve').toLowerCase();
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'กรุณาระบุเดือนรูปแบบ YYYY-MM' });
    const start = month + '-01';
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const rows = await sbRequest(`mc_live_planner?select=*&date=gte.${start}&date=lte.${end}&order=date.asc`, 'get') || [];
    if (!rows.length) return res.status(400).json({ error: 'ยังไม่มีข้อมูล MC Live ในเดือนนี้' });

    if (action === 'approve') {
      const invalid = rows.filter(row => {
        const parsed = mcLiveRow(row);
        return !mcDone(parsed) || parsed.documentStatus !== 'COMPLETE' || !parsed.docReview?.checked || parsed.docReview?.rejected;
      });
      if (invalid.length) return res.status(400).json({ error: `ยังอนุมัติไม่ได้ มีรายการที่หัวหน้ายังไม่เช็คหรือเอกสารไม่ครบ ${invalid.length} รายการ` });
    } else if (action !== 'reopen') {
      return res.status(400).json({ error: 'unknown action' });
    }

    const now = new Date().toISOString();
    const records = rows.map(row => {
      const docs = parseJsonObject(row.document_links);
      docs._monthReview = action === 'approve'
        ? { approved: true, month, approvedBy: req.user.displayName || req.user.username, approvedAt: now }
        : { approved: false, month, reopenedBy: req.user.displayName || req.user.username, reopenedAt: now };
      return {
        ...row,
        status: action === 'approve' ? 'APPROVED' : 'DONE',
        document_links: JSON.stringify(docs),
        updated_at: now,
        updated_by: req.user.username
      };
    });
    await sbUpsert('mc_live_planner', records, 'id');
    await writeActivityLog(req.user, action === 'approve' ? 'APPROVE_MC_LIVE_MONTH' : 'REOPEN_MC_LIVE_MONTH', 'mc_live_planner', month, 'SUCCESS', 'Monthly MC Live review');
    res.json({ ok: true, month, updated: records.length, message: action === 'approve' ? 'อนุมัติยอดจริงรายเดือนแล้ว' : 'เปิดเดือนกลับมาแก้ไขแล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/mc-live/demo', requireRole('ADMIN'), async (req, res) => {
  try {
    const start = dateKey(req.query.start) || MC_GO_LIVE_DATE;
    await sbDelete('mc_live_planner?date=gte.' + start);
    await writeActivityLog(req.user, 'CLEAR_MC_LIVE_DEMO', 'mc_live_planner', start, 'SUCCESS', 'Cleared MC Live demo data');
    res.json({ ok: true, message: 'ล้างข้อมูลตัวอย่าง MC Live แล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/mc-live/:id/review', requireRole('ADMIN', 'MC_LEAD'), async (req, res) => {
  try {
    const rows = await sbRequest('mc_live_planner?select=*&id=eq.' + encodeURIComponent(req.params.id) + '&limit=1', 'get');
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเธเนเธเธตเน' });
    if (mcApproved(row) && req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'รายการนี้ผู้บริหารอนุมัติรายเดือนแล้ว' });
    const docs = parseJsonObject(row.document_links);
    const status = mcDocStatus(docs, docs._meta?.cameraType);
    const action = String(req.body?.action || 'approve').toLowerCase();
    if (action !== 'reject' && status !== 'COMPLETE') return res.status(400).json({ error: 'เธขเธฑเธเน€เธเนเธเนเธกเนเนเธ”เน เน€เธเธฃเธฒเธฐเนเธเธเธซเธฅเธฑเธเธเธฒเธเนเธกเนเธเธฃเธ' });
    docs._review = {
      checked: action !== 'reject',
      rejected: action === 'reject',
      checkedBy: req.user.displayName || req.user.username,
      checkedAt: new Date().toISOString(),
      note: String(req.body?.note || '').trim()
    };
    const updated = await sbRequest('mc_live_planner?id=eq.' + encodeURIComponent(req.params.id), 'patch', {
      document_links: JSON.stringify(docs),
      updated_at: new Date().toISOString()
    });
    await writeActivityLog(req.user, action === 'reject' ? 'REJECT_MC_LIVE_DOCS' : 'REVIEW_MC_LIVE_DOCS', 'mc_live_planner', req.params.id, 'SUCCESS', action === 'reject' ? 'Rejected MC Live documents' : 'Reviewed MC Live documents');
    res.json({ ok: true, row: mcLiveRow(updated?.[0] || { ...row, document_links: JSON.stringify(docs) }), message: action === 'reject' ? 'เธชเนเธเธเธฅเธฑเธเนเธซเนเธ—เธตเธกเนเธเนเนเธเธซเธฅเธฑเธเธเธฒเธเนเธฅเนเธง' : 'เธเธฑเธเธ—เธถเธเธงเนเธฒเน€เธเนเธเธซเธฅเธฑเธเธเธฒเธเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/mc-live/docs/:id/:kind/download', async (req, res) => {
  try {
    const rows = await sbRequest('mc_live_planner?select=document_links,attachment_names&id=eq.' + encodeURIComponent(req.params.id) + '&limit=1', 'get');
    if (!rows || !rows.length) return res.status(404).json({ error: 'เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเธเนเธเธตเน' });
    const docs = parseJsonObject(rows[0].document_links);
    const doc = docs[req.params.kind];
    if (!doc?.path) return res.status(404).json({ error: 'เนเธกเนเธเธเนเธเธฅเนเนเธเธ' });
    const { buffer, contentType } = await sbStorageDownload(DOC_BUCKET, doc.path);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(doc.name || 'mc-live-document'));
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/mc-live/mine/:id', async (req, res) => {
  try {
    const rows = await sbRequest('mc_live_planner?select=*&id=eq.' + encodeURIComponent(req.params.id) + '&limit=1', 'get');
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'เนเธกเนเธเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเธเนเธเธตเน' });
    if (!userCanEditMcLive(req, row)) return res.status(403).json({ error: 'เธฅเธเนเธ”เนเน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเธเธญเธเธ•เธฑเธงเน€เธญเธเน€เธ—เนเธฒเธเธฑเนเธ' });
    if (mcApproved(row) && req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'รายการนี้ผู้บริหารอนุมัติรายเดือนแล้ว' });
    await sbDelete('mc_live_planner?id=eq.' + encodeURIComponent(req.params.id));
    await writeActivityLog(req.user, 'DELETE_MY_MC_LIVE', 'mc_live_planner', req.params.id, 'SUCCESS', 'Deleted own MC Live row');
    res.json({ ok: true, message: 'เธฅเธเธฃเธฒเธขเธเธฒเธฃเธเธญเธเธเธฑเธเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mc-live/import', requireRole('ADMIN', 'MC_LEAD'), uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'เนเธกเนเธเธเนเธเธฅเน Excel' });
    const parsed = parseMcLiveWorkbook(req.file.buffer);
    const now = new Date().toISOString();
    const records = parsed.rows.map(r => ({
      id: r.id,
      date: dateKey(r.date), brand: r.brand || '', platform: r.platform || '', mc: r.mc || '',
      start_time: r.startTime || '', end_time: r.endTime || '', plan_topic: r.planTopic || '',
      target_sales: num(r.targetSales), actual_sales: num(r.actualSales), orders: num(r.orders),
      viewers: num(r.viewers), peak_ccu: num(r.peakCcu), comments: num(r.comments), clicks: num(r.clicks),
      add_to_cart: num(r.addToCart), coins: num(r.coins), ads_cost: num(r.adsCost),
      status: String(r.status || 'DONE').toUpperCase(),
      document_status: String(r.documentStatus || 'MISSING').toUpperCase(),
      document_links: r.documentLinks || '', attachment_names: r.attachmentNames || '',
      note: r.note || '', updated_at: now, updated_by: req.user.username
    }));

    if (records.length) await sbUpsert('mc_live_planner', records, 'id');
    await writeActivityLog(req.user, 'IMPORT_MC_LIVE', 'mc_live_planner', '', 'SUCCESS', 'Imported MC Live Excel', {
      rows: records.length,
      sheets: parsed.sheets,
      file: req.file.originalname,
    });
    res.json({
      ok: true,
      imported: records.length,
      sheets: parsed.sheets,
      message: `เธเธณเน€เธเนเธฒเนเธเธฅเนเธ—เธตเธกเนเธฅเธเนเธชเธณเน€เธฃเนเธ ${records.length} เธฃเธฒเธขเธเธฒเธฃ เธเธฒเธ ${parsed.sheets.length} เธเธตเธ—`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// เธฅเธเธฃเธฒเธขเธเธฒเธฃ MC Live เน€เธ”เธตเธขเธง
router.delete('/mc-live/:id', requireRole('ADMIN', 'MC_LEAD'), async (req, res) => {
  try {
    await sbDelete('mc_live_planner?id=eq.' + encodeURIComponent(req.params.id));
    await writeActivityLog(req.user, 'DELETE_MC_LIVE', 'mc_live_planner', req.params.id, 'SUCCESS', 'Deleted MC Live row');
    res.json({ ok: true, message: 'เธฅเธเธฃเธฒเธขเธเธฒเธฃเนเธฅเนเธง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;

