import { Router } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { sbRequest } from '../supabase.js';
import { appendPayableToSheet, uploadFileToDrive } from '../lib/googleWorkspace.js';
import { writeActivityLog } from '../lib/log.js';

const router = Router();
const BOT_USER = { username: 'line-bot', displayName: 'LINE Payable Bot', role: 'UPLOADER' };

const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const compact = v => String(v || '').replace(/\s+/g, ' ').trim();
const todayKey = () => new Date().toISOString().slice(0, 10);
const safeDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : todayKey();
const extFromMime = mime => ({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
})[mime] || '';

function verifyLineSignature(req) {
  if (!config.lineChannelSecret) return false;
  const signature = req.get('x-line-signature') || '';
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const digest = crypto.createHmac('sha256', config.lineChannelSecret).update(body).digest('base64');
  if (Buffer.byteLength(signature) !== Buffer.byteLength(digest)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

async function replyLine(replyToken, text) {
  if (!replyToken || !config.lineChannelAccessToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.lineChannelAccessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: String(text || '').slice(0, 4800) }]
    })
  });
}

async function getLineContent(messageId) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: 'Bearer ' + config.lineChannelAccessToken }
  });
  if (!res.ok) throw new Error('LINE content HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type') || 'application/octet-stream'
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackDraft(fileName, link) {
  return {
    dueDate: todayKey(),
    status: 'PENDING',
    company: 'TG',
    vendor: '',
    description: compact(fileName || 'เอกสารรายการทำจ่าย'),
    grossAmount: 0,
    whtAmount: 0,
    netAmount: 0,
    bank: '',
    accountNo: '',
    accountName: '',
    ref: '',
    documentLink: link || '',
    docDate: '',
    confidence: 0.25,
    warnings: ['AI อ่านยอดจากเอกสารไม่ได้ครบ กรุณาตรวจในระบบก่อนจ่ายจริง']
  };
}

async function analyzePayableDocument({ buffer, mimeType, fileName, driveLink }) {
  const fallback = fallbackDraft(fileName, driveLink);
  if (!config.googleAiKey) return fallback;
  if (!/^image\//.test(mimeType) && mimeType !== 'application/pdf' && !/^text\//.test(mimeType)) {
    return { ...fallback, warnings: ['ชนิดไฟล์นี้ยังอ่านเนื้อหาอัตโนมัติไม่ได้ ระบบบันทึกลิงก์เอกสารไว้ให้แล้ว'] };
  }
  if (buffer.length > 18 * 1024 * 1024) {
    return { ...fallback, warnings: ['ไฟล์ใหญ่เกินสำหรับ AI อ่านทันที ระบบบันทึกลิงก์เอกสารไว้ให้แล้ว'] };
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(config.googleAiModel) + ':generateContent?key=' + encodeURIComponent(config.googleAiKey);
  const prompt = [
    'อ่านเอกสาร/สลิป/บิล/ใบแจ้งหนี้สำหรับทำจ่าย แล้วตอบเป็น JSON เท่านั้น ห้ามมี markdown',
    'schema: {"dueDate":"YYYY-MM-DD","docDate":"YYYY-MM-DD","status":"PENDING","company":"TG|AZHER","vendor":"","description":"","grossAmount":0,"whtAmount":0,"netAmount":0,"bank":"","accountNo":"","accountName":"","ref":"","confidence":0,"warnings":[]}',
    'ให้ดึงยอดเท่าที่เห็นในเอกสาร ถ้าไม่มั่นใจให้ใส่ 0 และเพิ่มข้อความใน warnings',
    'ถ้าไม่พบวันครบกำหนด ให้ใช้วันนี้: ' + todayKey(),
    'ถ้าไม่พบยอดสุทธิ ให้คำนวณ grossAmount - whtAmount เมื่อทำได้',
    'ชื่อไฟล์: ' + fileName
  ].join('\n');

  const parts = [{ text: prompt }];
  if (/^text\//.test(mimeType)) parts.push({ text: buffer.toString('utf8').slice(0, 12000) });
  else parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 900 }
    })
  });
  if (!res.ok) return fallback;
  const json = await res.json();
  const answer = (json?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  const draft = extractJson(answer) || fallback;
  const gross = num(draft.grossAmount);
  const wht = num(draft.whtAmount);
  const net = draft.netAmount === undefined || draft.netAmount === null || draft.netAmount === ''
    ? Math.max(gross - wht, 0)
    : num(draft.netAmount);

  return {
    ...fallback,
    ...draft,
    dueDate: safeDate(draft.dueDate),
    docDate: safeDate(draft.docDate || draft.dueDate),
    status: 'PENDING',
    company: compact(draft.company || 'TG').toUpperCase() === 'AZHER' ? 'AZHER' : 'TG',
    grossAmount: gross,
    whtAmount: wht,
    netAmount: net,
    documentLink: driveLink,
    confidence: Number(draft.confidence || 0) || fallback.confidence,
    warnings: Array.isArray(draft.warnings) ? draft.warnings.filter(Boolean) : fallback.warnings
  };
}

async function savePayable(draft) {
  const id = 'AP-' + uuidv4();
  const now = new Date().toISOString();
  const record = {
    id,
    due_date: safeDate(draft.dueDate),
    status: 'PENDING',
    company: draft.company || 'TG',
    vendor: draft.vendor || '',
    description: draft.description || 'เอกสารจาก LINE',
    gross_amount: num(draft.grossAmount),
    wht_amount: num(draft.whtAmount),
    net_amount: num(draft.netAmount),
    bank: draft.bank || '',
    account_no: draft.accountNo || '',
    account_name: draft.accountName || draft.vendor || '',
    ref: draft.ref || '',
    document_link: draft.documentLink || '',
    need_receipt: false,
    receipt_status: 'MISSING',
    need_tax_invoice: false,
    tax_invoice_status: 'NOT_REQUIRED',
    need_wht_issue: false,
    wht_issue_status: 'NOT_REQUIRED',
    need_original: false,
    original_status: 'MISSING',
    note: ['นำเข้าจาก LINE Bot', ...(draft.warnings || [])].join(' | '),
    created_at: now,
    updated_at: now,
    updated_by: 'line-bot'
  };
  await sbRequest('payables', 'post', [record], { Prefer: 'return=minimal' });
  let sheetWarning = '';
  try {
    const sheetResult = await appendPayableToSheet({
      id,
      paid: false,
      description: record.description,
      company: record.company,
      grossAmount: record.gross_amount,
      whtAmount: record.wht_amount,
      netAmount: record.net_amount,
      vendor: record.vendor,
      accountNo: record.account_no,
      bank: record.bank,
      ref: record.ref,
      documentLink: record.document_link,
      docDate: draft.docDate || '',
      source: 'LINE'
    });
    if (sheetResult?.skipped) sheetWarning = sheetResult.reason || 'ยังไม่ได้ตั้งค่า Google Sheet ปลายทาง';
  } catch (err) {
    sheetWarning = 'บันทึกลง Google Sheet ไม่สำเร็จ: ' + err.message.slice(0, 180);
  }
  return { id, sheetWarning };
}

async function handleMessageEvent(event) {
  const msg = event.message || {};
  if (!['file', 'image'].includes(msg.type)) {
    if (msg.type === 'text' && /ทำจ่าย|รายจ่าย|จ่าย|โอน/i.test(msg.text || '')) {
      const draft = await analyzePayableDocument({
        buffer: Buffer.from(msg.text || '', 'utf8'),
        mimeType: 'text/plain',
        fileName: 'LINE text payable',
        driveLink: ''
      });
      const saved = await savePayable(draft);
      await replyLine(event.replyToken, `บันทึกรายการทำจ่ายจากข้อความแล้ว\nเลขที่: ${saved.id}\nยอดสุทธิ: ${num(draft.netAmount).toLocaleString('th-TH')} บาท${saved.sheetWarning ? '\nเช็คเพิ่ม: ' + saved.sheetWarning : ''}`);
    }
    return;
  }

  const { buffer, mimeType } = await getLineContent(msg.id);
  const fileName = msg.fileName || `line-${msg.type}-${msg.id}${extFromMime(mimeType)}`;
  const driveFile = await uploadFileToDrive({ fileName, mimeType, buffer });
  const draft = await analyzePayableDocument({ buffer, mimeType, fileName, driveLink: driveFile.webViewLink });
  const saved = await savePayable(draft);

  const warnings = (draft.warnings || []).filter(Boolean);
  if (saved.sheetWarning) warnings.unshift(saved.sheetWarning);
  const reply = [
    'รับไฟล์และบันทึกรายการทำจ่ายแล้ว',
    `เลขที่: ${saved.id}`,
    `ผู้รับ: ${draft.vendor || '-'}`,
    `รายละเอียด: ${draft.description || '-'}`,
    `ยอดสุทธิ: ${num(draft.netAmount).toLocaleString('th-TH')} บาท`,
    `ลิงก์ดาวน์โหลด: ${driveFile.webContentLink || driveFile.webViewLink}`,
    warnings.length ? 'เช็คเพิ่ม: ' + warnings.slice(0, 3).join(' / ') : 'AI ไม่พบจุดผิดปกติหลัก'
  ].join('\n');
  await writeActivityLog(BOT_USER, 'LINE_PAYABLE_UPLOAD', 'payables', saved.id, 'SUCCESS', fileName, { driveFileId: driveFile.id, confidence: draft.confidence, sheetWarning: saved.sheetWarning });
  await replyLine(event.replyToken, reply);
}

router.post('/webhook', (req, res) => {
  if (!config.lineChannelSecret || !config.lineChannelAccessToken) {
    return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN' });
  }
  if (!verifyLineSignature(req)) return res.status(401).json({ error: 'Invalid LINE signature' });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  res.json({ ok: true });
  for (const event of events) {
    if (event.type === 'message') {
      handleMessageEvent(event).catch(async err => {
        console.warn('[line-payables]', err.message);
        await writeActivityLog(BOT_USER, 'LINE_PAYABLE_UPLOAD', 'payables', '', 'FAILED', err.message).catch(() => {});
        await replyLine(event.replyToken, 'รับไฟล์แล้ว แต่บันทึกไม่สำเร็จ: ' + err.message.slice(0, 300)).catch(() => {});
      });
    }
  }
});

export default router;
