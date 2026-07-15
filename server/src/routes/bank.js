import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbInsertRows, sbDelete } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';

// กระทบยอด Bank Statement กับบัญชีจ่าย
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
router.use(requireAuth);

const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };

function parseDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0].slice(0, 10);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (y > 2500) y -= 543; // พ.ศ. → ค.ศ.
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

// หา index คอลัมน์จากชื่อหลายแบบ (รองรับ KBank / SCB / KTB / BBL)
function findCol(headers, aliases) {
  const norm = headers.map(h => String(h || '').replace(/\s/g, '').toLowerCase());
  for (const a of aliases) {
    const idx = norm.findIndex(h => h.includes(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

// อ่าน statement PDF ฟอร์แมตกสิกร (K BIZ) — ทดสอบกับไฟล์จริงแล้วตรง 100%
// ทิศทางเงินยืนยันจากผลต่างยอดคงเหลือทีละรายการ (แม่นกว่าดูชื่อรายการ)
function parseStatementPdfText(text) {
  const flat = String(text || '').replace(/\n/g, ' ');
  const numRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
  const MARKERS = ['หน้าที่ (PAGE', 'รวมถอนเงิน', 'รวมฝากเงิน', 'ยอดยกไป', 'ที่ DD', 'ชื่อบัญชี'];

  let prevBalance = null;
  const ob = flat.match(/(\d{2}-\d{2}-\d{2})([\d,]+\.\d{2})ยอดยกมา/);
  if (ob) prevBalance = parseFloat(ob[2].replace(/,/g, ''));

  // จุดเริ่มรายการ = วันที่+เวลาติดกัน เช่น 01-06-2600:00
  const startRe = /\d{2}-\d{2}-\d{2}\d{2}:\d{2}/g;
  const starts = [];
  let m;
  while ((m = startRe.exec(flat)) !== null) starts.push(m.index);

  const txns = [];
  let okBalance = 0;
  for (let i = 0; i < starts.length; i++) {
    let seg = flat.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : undefined);
    let cut = seg.length;
    for (const mk of MARKERS) {
      const idx = seg.indexOf(mk, 14);
      if (idx > 0 && idx < cut) cut = idx;
    }
    seg = seg.slice(0, cut);

    const date = seg.slice(0, 8);
    const time = seg.slice(8, 13);
    const body = seg.slice(13);
    const nums = body.match(numRe) || [];
    if (nums.length < 2) continue;
    const balance = parseFloat(nums[0].replace(/,/g, ''));
    const amount = parseFloat(nums[nums.length - 1].replace(/,/g, ''));
    const balIdx = body.indexOf(nums[0]);
    const channel = body.slice(0, balIdx).trim();
    const amtIdx = body.lastIndexOf(nums[nums.length - 1]);
    const mid = body.slice(balIdx + nums[0].length, amtIdx).trim();
    const typeMatch = mid.match(/([ก-๙]+)$/);
    const type = typeMatch ? typeMatch[1] : '';
    const detail = typeMatch ? mid.slice(0, mid.length - type.length).trim() : mid;

    let direction = null;
    if (prevBalance !== null) {
      const diff = Math.round((balance - prevBalance) * 100) / 100;
      if (Math.abs(Math.abs(diff) - amount) < 0.02) { direction = diff > 0 ? 'IN' : 'OUT'; okBalance++; }
    }
    if (!direction) direction = /รับ|ฝาก/.test(type) ? 'IN' : 'OUT';
    prevBalance = balance;
    txns.push({
      date, time, channel,
      description: (type + ' ' + detail).trim().slice(0, 300),
      direction, amount, balance
    });
  }
  return { txns, okBalance };
}

// POST /api/bank/upload — file + bank(ชื่อธนาคาร)
router.post('/upload', requireRole('ADMIN', 'UPLOADER'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาแนบไฟล์ statement' });
    const bankName = String(req.body?.bank || '');

    // ---------- PDF ----------
    if (/\.pdf$/i.test(req.file.originalname)) {
      const parsed = await pdfParse(req.file.buffer);
      const { txns, okBalance } = parseStatementPdfText(parsed.text);
      if (!txns.length) {
        return res.status(400).json({ error: 'อ่านรายการจาก PDF ไม่ได้ — ฟอร์แมตนี้ยังไม่รองรับ (ตอนนี้รองรับกสิกร K BIZ) ส่งตัวอย่างไฟล์มาเพิ่มได้' });
      }
      const batchId = uuidv4();
      const records = txns.map(t => ({
        txn_date: parseDate(t.date),
        txn_time: t.time,
        description: t.description,
        direction: t.direction,
        amount: t.amount,
        balance: t.balance,
        bank: bankName,
        channel: t.channel || '',
        file_name: req.file.originalname,
        batch_id: batchId,
        uploaded_by: req.user.username
      })).filter(r => r.txn_date);
      await sbInsertRows('bank_statements', records, 300);
      const verifyMsg = okBalance === txns.length
        ? ` ✓ ทุกรายการยืนยันด้วยยอดคงเหลือแล้ว`
        : ` ⚠️ ${txns.length - okBalance} รายการยืนยันด้วยยอดคงเหลือไม่ได้ — ตรวจสอบก่อนใช้`;
      await writeActivityLog(req.user, 'UPLOAD_STATEMENT', 'bank_statements', batchId, 'SUCCESS',
        `อัปโหลด PDF ${req.file.originalname} (${records.length} รายการ)`);
      return res.json({ ok: true, message: `นำเข้า ${records.length} รายการจาก PDF${verifyMsg}`, batchId, count: records.length });
    }

    // ---------- CSV / Excel ----------
    let rows;
    if (/\.(xlsx|xls)$/i.test(req.file.originalname)) {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    } else {
      rows = Papa.parse(req.file.buffer.toString('utf-8').replace(/^﻿/, ''), { skipEmptyLines: 'greedy' }).data;
    }
    if (!rows || rows.length < 2) return res.status(400).json({ error: 'ไฟล์ไม่มีข้อมูล' });

    // หาแถว header (แถวแรกที่มีคำว่า วันที่/date)
    let headerIdx = rows.findIndex(r => r.some(c => /วันที่|date/i.test(String(c || ''))));
    if (headerIdx < 0) headerIdx = 0;
    const headers = rows[headerIdx];

    const cDate = findCol(headers, ['วันที่', 'date']);
    const cTime = findCol(headers, ['เวลา', 'time']);
    const cDesc = findCol(headers, ['รายการ', 'description', 'desc', 'รายละเอียด', 'transaction']);
    const cOut = findCol(headers, ['ถอน', 'withdrawal', 'debit', 'จ่าย', 'ออก']);
    const cIn = findCol(headers, ['ฝาก', 'deposit', 'credit', 'รับ', 'เข้า']);
    const cBal = findCol(headers, ['คงเหลือ', 'balance', 'ยอดคงเหลือ']);
    const cChan = findCol(headers, ['ช่องทาง', 'channel', 'สาขา']);
    const cAmt = findCol(headers, ['จำนวนเงิน', 'amount']);
    if (cDate < 0 || (cOut < 0 && cIn < 0 && cAmt < 0)) {
      return res.status(400).json({ error: 'อ่านคอลัมน์ไม่ได้ — ต้องมีอย่างน้อย วันที่ + ถอน/ฝาก (หรือ จำนวนเงิน) | header ที่เจอ: ' + headers.join(', ') });
    }

    const batchId = uuidv4();
    const records = [];
    for (const r of rows.slice(headerIdx + 1)) {
      const date = parseDate(r[cDate]);
      if (!date) continue;
      const outAmt = cOut >= 0 ? num(r[cOut]) : 0;
      const inAmt = cIn >= 0 ? num(r[cIn]) : 0;
      let direction, amount;
      if (outAmt > 0) { direction = 'OUT'; amount = outAmt; }
      else if (inAmt > 0) { direction = 'IN'; amount = inAmt; }
      else if (cAmt >= 0 && num(r[cAmt]) !== 0) {
        const a = num(r[cAmt]);
        direction = a < 0 ? 'OUT' : 'IN';
        amount = Math.abs(a);
      } else continue;

      records.push({
        txn_date: date,
        txn_time: cTime >= 0 ? String(r[cTime] || '') : '',
        description: cDesc >= 0 ? String(r[cDesc] || '').slice(0, 300) : '',
        direction, amount,
        balance: cBal >= 0 ? num(r[cBal]) : null,
        bank: bankName,
        channel: cChan >= 0 ? String(r[cChan] || '') : '',
        file_name: req.file.originalname,
        batch_id: batchId,
        uploaded_by: req.user.username
      });
    }
    if (!records.length) return res.status(400).json({ error: 'ไม่พบรายการเดินบัญชีในไฟล์' });

    await sbInsertRows('bank_statements', records, 300);
    await writeActivityLog(req.user, 'UPLOAD_STATEMENT', 'bank_statements', batchId, 'SUCCESS',
      `อัปโหลด statement ${req.file.originalname} (${records.length} รายการ)`);
    res.json({ ok: true, message: `นำเข้า ${records.length} รายการจาก ${req.file.originalname}`, batchId, count: records.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bank/accounts — รายชื่อบัญชีที่เคยอัปโหลด
router.get('/accounts', async (req, res) => {
  try {
    const rows = await sbRequest('bank_statements?select=bank&limit=5000', 'get') || [];
    res.json(Array.from(new Set(rows.map(r => r.bank).filter(Boolean))).sort());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bank/transactions?start&end&status&direction&account
router.get('/transactions', async (req, res) => {
  try {
    const { start, end, status, direction, account } = req.query;
    let path = 'bank_statements?select=*&order=txn_date.desc,txn_time.desc&limit=2000';
    if (start) path += '&txn_date=gte.' + start;
    if (end) path += '&txn_date=lte.' + end;
    if (status && status !== 'ALL') path += '&match_status=eq.' + status;
    if (direction && direction !== 'ALL') path += '&direction=eq.' + direction;
    if (account && account !== 'ALL') path += '&bank=eq.' + encodeURIComponent(account);
    const txns = await sbRequest(path, 'get') || [];

    // แนบข้อมูล payable ที่จับคู่ไว้
    const ids = txns.map(t => t.matched_payable_id).filter(Boolean);
    let payables = [];
    if (ids.length) {
      payables = await sbRequest('payables?select=id,vendor,description,net_amount,status,due_date&id=in.(' +
        ids.map(encodeURIComponent).join(',') + ')', 'get') || [];
    }
    const pMap = new Map(payables.map(p => [p.id, p]));
    res.json(txns.map(t => ({ ...t, payable: t.matched_payable_id ? pMap.get(t.matched_payable_id) || null : null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bank/auto-match — จับคู่ขาออกกับบัญชีจ่าย (ยอดตรง ± วันที่ใกล้)
router.post('/auto-match', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const dayTolerance = Number(req.body?.days ?? 7);
    const [txns, payables] = await Promise.all([
      sbRequest("bank_statements?select=id,txn_date,amount,direction&match_status=eq.UNMATCHED&direction=eq.OUT&limit=2000", 'get'),
      sbRequest("payables?select=id,due_date,net_amount,status&status=neq.CANCELLED", 'get')
    ]);
    const used = new Set(
      (await sbRequest("bank_statements?select=matched_payable_id&matched_payable_id=not.is.null", 'get') || [])
        .map(r => r.matched_payable_id)
    );
    let matched = 0;
    for (const t of txns || []) {
      const tDate = new Date(t.txn_date);
      const candidate = (payables || []).find(p =>
        !used.has(p.id) &&
        Math.abs(Number(p.net_amount) - Number(t.amount)) < 0.5 &&
        p.due_date && Math.abs((new Date(p.due_date) - tDate) / 86400000) <= dayTolerance
      );
      if (candidate) {
        used.add(candidate.id);
        await sbRequest('bank_statements?id=eq.' + t.id, 'patch',
          { match_status: 'MATCHED', matched_payable_id: candidate.id }, { Prefer: 'return=minimal' });
        matched++;
      }
    }
    await writeActivityLog(req.user, 'BANK_AUTO_MATCH', 'bank_statements', '', 'SUCCESS', `จับคู่อัตโนมัติ ${matched} รายการ`);
    res.json({ ok: true, message: `จับคู่อัตโนมัติสำเร็จ ${matched} รายการ (ยอดตรง + วันที่ห่างไม่เกิน ${dayTolerance} วัน)`, matched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bank/:id/confirm — ยืนยันคู่ + ตั้ง payable เป็นจ่ายแล้ว
router.post('/:id/confirm', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const rows = await sbRequest('bank_statements?id=eq.' + req.params.id + '&limit=1', 'get');
    if (!rows?.length) return res.status(404).json({ error: 'ไม่พบรายการ' });
    const txn = rows[0];
    await sbRequest('bank_statements?id=eq.' + req.params.id, 'patch', { match_status: 'CONFIRMED' }, { Prefer: 'return=minimal' });
    if (txn.matched_payable_id) {
      await sbRequest('payables?id=eq.' + encodeURIComponent(txn.matched_payable_id), 'patch',
        { status: 'PAID', updated_by: req.user.username, updated_at: new Date().toISOString() }, { Prefer: 'return=minimal' });
    }
    res.json({ ok: true, message: 'ยืนยันแล้ว — ตั้งสถานะบัญชีจ่ายเป็น "จ่ายแล้ว"' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/bank/:id/match — จับคู่มือ { payableId } | unmatch | ignore
router.post('/:id/match', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const { payableId, action } = req.body || {};
    let patch;
    if (action === 'unmatch') patch = { match_status: 'UNMATCHED', matched_payable_id: null };
    else if (action === 'ignore') patch = { match_status: 'IGNORED' };
    else if (payableId) patch = { match_status: 'MATCHED', matched_payable_id: payableId };
    else return res.status(400).json({ error: 'ระบุ payableId หรือ action' });
    await sbRequest('bank_statements?id=eq.' + req.params.id, 'patch', patch, { Prefer: 'return=minimal' });
    res.json({ ok: true, message: 'อัปเดตแล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bank/unmatched-payables?start&end — รายการที่บันทึกว่าจ่ายแล้ว แต่ไม่เจอเงินออกใน statement
router.get('/unmatched-payables', async (req, res) => {
  try {
    const { start, end } = req.query;
    let path = 'payables?select=id,due_date,vendor,description,net_amount,status,note,updated_by&status=eq.PAID&order=due_date.asc';
    if (start) path += '&due_date=gte.' + start;
    if (end) path += '&due_date=lte.' + end;
    const [paid, matched] = await Promise.all([
      sbRequest(path, 'get'),
      sbRequest('bank_statements?select=matched_payable_id&matched_payable_id=not.is.null', 'get')
    ]);
    const matchedIds = new Set((matched || []).map(r => r.matched_payable_id));
    res.json((paid || []).filter(p => !matchedIds.has(p.id)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/bank/batch/:batchId — ลบไฟล์ที่นำเข้าผิด
router.delete('/batch/:batchId', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbDelete('bank_statements?batch_id=eq.' + req.params.batchId);
    res.json({ ok: true, message: 'ลบรายการของไฟล์นี้แล้ว' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
