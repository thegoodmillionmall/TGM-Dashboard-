import { Router } from 'express';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { sbRequest } from '../supabase.js';
import { appendPayableToSheet, uploadFileToDrive } from '../lib/googleWorkspace.js';
import { writeActivityLog } from '../lib/log.js';
import { payablesScriptEnabled, sendPayableToScript } from '../lib/payablesScript.js';

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
const mimeFromName = fileName => {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.txt')) return 'text/plain';
  return '';
};
const normalizeMimeType = (mimeType, fileName) => {
  const raw = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (!raw || raw === 'application/octet-stream' || raw === 'binary/octet-stream') {
    return mimeFromName(fileName) || raw || 'application/octet-stream';
  }
  return raw;
};

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
  mimeType = normalizeMimeType(mimeType, fileName);
  const fallback = fallbackDraft(fileName, driveLink);
  if (!config.googleAiKey) {
    return { ...fallback, warnings: ['ยังไม่ได้ตั้งค่า GOOGLE_AI_KEY ระบบจึงบันทึกไฟล์ได้ แต่ยังอ่านยอดจากเอกสารไม่ได้'] };
  }
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
    'ต้องพยายามอ่านฟิลด์สำคัญให้ครบ: vendor ผู้รับเงิน/บริษัท, description รายละเอียดเอกสาร, grossAmount ยอดรวม, whtAmount หัก ณ ที่จ่าย, netAmount ยอดสุทธิ/ยอดโอน, bank ธนาคาร, accountNo เลขบัญชี, ref เลขที่เอกสารหรือเลขอ้างอิง',
    'ถ้าเอกสารมีหลายยอด ให้เลือกยอดที่เป็นยอดชำระจริง/ยอดโอน/ยอดสุทธิเป็น netAmount และใส่ยอดก่อนหักเป็น grossAmount ถ้ามี',
    'ถ้าเห็นเลขบัญชีให้เก็บเฉพาะตัวเลขและขีด ถ้าเห็นธนาคารให้ใช้ชื่อธนาคารภาษาไทยหรืออังกฤษตามเอกสาร',
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
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ...fallback, warnings: ['AI API อ่านเอกสารไม่สำเร็จ: HTTP ' + res.status + ' ' + body.slice(0, 180)] };
  }
  const json = await res.json();
  const answer = (json?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  const parsed = extractJson(answer);
  if (!parsed) {
    return {
      ...fallback,
      warnings: ['AI ตอบกลับไม่เป็น JSON จึงยังอ่านยอดไม่ได้: ' + compact(answer).slice(0, 180)]
    };
  }
  const draft = parsed;
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

function buildPayableRow(id, draft) {
  const now = new Date().toISOString();
  return {
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
}

function toSheetRow(id, record, draft) {
  return {
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
  };
}

async function savePayable(draft, options = {}) {
  const id = options.id || 'AP-' + uuidv4();
  const record = buildPayableRow(id, draft);
  await sbRequest('payables', 'post', [record], { Prefer: 'return=minimal' });
  let sheetWarning = '';
  if (!options.skipSheet) {
    try {
      const sheetResult = await appendPayableToSheet(toSheetRow(id, record, draft));
      if (sheetResult?.skipped) sheetWarning = sheetResult.reason || 'ยังไม่ได้ตั้งค่า Google Sheet ปลายทาง';
    } catch (err) {
      sheetWarning = 'บันทึกลง Google Sheet ไม่สำเร็จ: ' + err.message.slice(0, 180);
    }
  }
  return { id, sheetWarning };
}

async function createPayableViaScriptOrGoogle({ draft, file }) {
  const id = 'AP-' + uuidv4();
  if (payablesScriptEnabled()) {
    const previewRecord = buildPayableRow(id, draft);
    const scriptResult = await sendPayableToScript({
      row: toSheetRow(id, previewRecord, draft),
      file
    });
    const documentLink = scriptResult.webViewLink || scriptResult.downloadLink || scriptResult.fileUrl || draft.documentLink || '';
    const saved = await savePayable({ ...draft, documentLink }, { id, skipSheet: true });
    return {
      ...saved,
      sheetRow: scriptResult.row || '',
      driveFile: {
        id: scriptResult.fileId || '',
        webViewLink: documentLink,
        webContentLink: scriptResult.downloadLink || documentLink
      }
    };
  }

  let driveFile = { id: '', webViewLink: draft.documentLink || '', webContentLink: draft.documentLink || '' };
  if (file) {
    driveFile = await uploadFileToDrive({ fileName: file.name, mimeType: file.mimeType, buffer: file.buffer });
    draft = { ...draft, documentLink: driveFile.webViewLink };
  }
  const saved = await savePayable(draft, { id });
  return { ...saved, sheetRow: '', driveFile };
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
      const saved = await createPayableViaScriptOrGoogle({ draft, file: null });
      await replyLine(event.replyToken, `บันทึกรายการทำจ่ายจากข้อความแล้ว\nเลขที่: ${saved.id}${saved.sheetRow ? '\nแถวชีต: ' + saved.sheetRow : ''}\nยอดสุทธิ: ${num(draft.netAmount).toLocaleString('th-TH')} บาท${saved.sheetWarning ? '\nเช็คเพิ่ม: ' + saved.sheetWarning : ''}`);
    }
    return;
  }

  const { buffer, mimeType } = await getLineContent(msg.id);
  const fileName = msg.fileName || `line-${msg.type}-${msg.id}${extFromMime(mimeType)}`;
  const draft = await analyzePayableDocument({ buffer, mimeType, fileName, driveLink: '' });
  const saved = await createPayableViaScriptOrGoogle({
    draft,
    file: { name: fileName, mimeType, buffer }
  });
  const driveFile = saved.driveFile || {};

  const warnings = (draft.warnings || []).filter(Boolean);
  if (saved.sheetWarning) warnings.unshift(saved.sheetWarning);
  const reply = [
    'รับไฟล์และบันทึกรายการทำจ่ายแล้ว',
    `เลขที่: ${saved.id}`,
    `ผู้รับ: ${draft.vendor || '-'}`,
    `รายละเอียด: ${draft.description || '-'}`,
    `ยอดสุทธิ: ${num(draft.netAmount).toLocaleString('th-TH')} บาท`,
    ...(saved.sheetRow ? [`แถวชีต: ${saved.sheetRow}`] : []),
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
