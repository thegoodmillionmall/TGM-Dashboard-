import { sbRequest } from '../supabase.js';
import { writeActivityLog } from './log.js';

const SYNC_USER = { username: 'sheet-sync', displayName: 'Google Sheet Sync', role: 'UPLOADER' };

const cfg = () => ({
  url:     process.env.SHEET_SYNC_URL   || '',
  token:   process.env.SHEET_SYNC_TOKEN || '',
  tab:     process.env.SHEET_SYNC_TAB   || 'TGM_Payables',
  enabled: !!(process.env.SHEET_SYNC_URL && process.env.SHEET_SYNC_TOKEN)
});

async function callSheet(method, payload) {
  const c = cfg();
  const target = method === 'GET'
    ? c.url + (c.url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(c.token) + '&tab=' + encodeURIComponent(c.tab)
    : c.url;
  const res = await fetch(target, {
    method,
    redirect: 'follow',
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
    body: method === 'POST' ? JSON.stringify({ token: c.token, tab: c.tab, ...payload }) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Sheet ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 200)); }
  if (data.error) throw new Error('Sheet: ' + data.error);
  return data;
}

// ---------- ทดสอบการเชื่อมต่อ ----------
export async function testSheetConnection() {
  if (!cfg().enabled) return { ok: false, reason: 'ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env' };
  try {
    const data = await callSheet('GET');
    return { ok: true, tab: data.tab, totalRows: (data.rows || []).length };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ---------- สร้าง tab ใหม่ในชีต ----------
export async function setupSheetTab() {
  if (!cfg().enabled) throw new Error('ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN');
  return callSheet('POST', { action: 'setupTab' });
}

// ---------- TGM → ชีต ----------
export async function pushToSheet(records) {
  if (!cfg().enabled || !records?.length) return { skipped: true };
  const rows = records
    .filter(r => r.status !== 'CANCELLED')
    .map(r => ({
      id: r.id, dueDate: r.due_date || '', paid: r.status === 'PAID',
      description: r.description || '', company: r.company || 'TG',
      gross: Number(r.gross_amount || 0), wht: Number(r.wht_amount || 0), net: Number(r.net_amount || 0),
      vendor: r.vendor || '', accountNo: r.account_no || '', bank: r.bank || '',
      ref: r.ref || '', link: r.document_link || '', docDate: ''
    }));
  if (!rows.length) return { pushed: 0 };
  const out = await callSheet('POST', { action: 'upsert', rows });
  return { pushed: rows.length, updated: out.updated || 0, added: out.added || 0 };
}

// ---------- ชีต → TGM (อ่าน paid checkbox) ----------
export async function pullFromSheet() {
  if (!cfg().enabled) return { skipped: true };
  const data = await callSheet('GET');
  const sheetRows = data.rows || [];
  if (!sheetRows.length) return { pulled: 0, tab: data.tab, totalRows: 0 };

  const existing = await sbRequest('payables?select=id,due_date,vendor,net_amount,status', 'get') || [];
  const byId = new Map(existing.map(r => [r.id, r]));
  const statusUpdates = [];
  const idAssignments = [];
  const assignedIds = new Set();

  for (const r of sheetRows) {
    if (!r.id) {
      const match = existing.find(x =>
        !assignedIds.has(x.id) &&
        (x.due_date || '') === (r.dueDate || '') &&
        (x.vendor || '').trim() === (r.vendor || '').trim() &&
        Math.abs(Number(x.net_amount) - Number(r.net || 0)) < 0.01
      );
      if (match) {
        assignedIds.add(match.id);
        idAssignments.push({ row: r.row, id: match.id });
        if (r.paid && match.status !== 'PAID') statusUpdates.push({ id: match.id, status: 'PAID' });
      }
      continue;
    }
    const current = byId.get(r.id);
    if (!current) continue;
    let newStatus = r.paid ? 'PAID' : (['APPROVED','CANCELLED'].includes(current.status) ? current.status : 'PENDING');
    if (newStatus !== current.status) statusUpdates.push({ id: r.id, status: newStatus });
  }

  const now = new Date().toISOString();
  for (const upd of statusUpdates) {
    await sbRequest(`payables?id=eq.${upd.id}`, 'patch',
      { status: upd.status, updated_at: now, updated_by: 'sheet-sync' },
      { Prefer: 'return=minimal' });
  }
  if (idAssignments.length) await callSheet('POST', { action: 'assignIds', assignments: idAssignments });

  return { pulled: statusUpdates.length, newIds: idAssignments.length, tab: data.tab, totalRows: sheetRows.length };
}

// ---------- แปลงวันที่จากชีตเป็น ISO yyyy-mm-dd ----------
function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                          // ISO แล้ว
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);        // D/M/YYYY
  if (m) return `${m[3]}-${('0'+m[2]).slice(-2)}-${('0'+m[1]).slice(-2)}`;
  return null;
}

// ---------- Import all rows from sheet → new Supabase records ----------
// ใช้ครั้งแรก หรือกด re-run เพื่อดึงแถวใหม่จากชีต + แก้ due_date=null
export async function importFromSheet() {
  if (!cfg().enabled) throw new Error('ยังไม่ได้ตั้งค่า SHEET_SYNC_URL / SHEET_SYNC_TOKEN ใน .env');
  const data = await callSheet('GET');
  const sheetRows = data.rows || [];
  if (!sheetRows.length) return { created: 0, skipped: 0, dateFixed: 0, tab: data.tab, totalRows: 0 };

  // โหลด records ที่มีอยู่แล้วใน Supabase
  const existing = await sbRequest('payables?select=id,due_date,vendor,net_amount', 'get') || [];
  const byId     = new Map(existing.map(r => [r.id, r]));
  const existingIds = new Set(byId.keys());

  const toCreate    = [];
  const skippedRows = [];
  let   dateFixed   = 0;
  const now = new Date().toISOString();

  for (const r of sheetRows) {
    const isoDate = normalizeDate(r.dueDate);

    // ---- แถวที่มี AP ID ----
    if (r.id) {
      if (existingIds.has(r.id)) {
        const ex = byId.get(r.id);
        // ถ้า Supabase เก็บวันที่ไว้ null แต่ชีตมีวันที่ → patch แก้
        if (!ex.due_date && isoDate) {
          await sbRequest(`payables?id=eq.${encodeURIComponent(r.id)}`, 'patch',
            { due_date: isoDate, updated_at: now, updated_by: 'sheet-import-fix' },
            { Prefer: 'return=minimal' });
          dateFixed++;
        }
        skippedRows.push(r.id);
        continue;
      }
    }

    // ---- แถวไม่มี AP ID: ตรวจซ้ำด้วย date+vendor+net ----
    if (!r.id) {
      const dup = existing.find(x =>
        x.due_date && isoDate && x.due_date === isoDate &&
        (x.vendor || '').trim() === (r.vendor || '').trim() &&
        Math.abs(Number(x.net_amount) - Number(r.net || 0)) < 0.01
      );
      if (dup) { skippedRows.push('dup:' + dup.id); continue; }
    }

    const gross = Number(r.gross || 0);
    const wht   = Number(r.wht   || 0);
    const net   = Number(r.net   || gross - wht);

    toCreate.push({
      id:            r.id || undefined,
      due_date:      isoDate,
      status:        r.paid ? 'PAID' : 'PENDING',
      company:       r.company     || 'TG',
      vendor:        r.vendor      || '',
      description:   r.description || '',
      gross_amount:  gross,
      wht_amount:    wht,
      net_amount:    net,
      bank:          r.bank        || '',
      account_no:    r.accountNo   || '',
      account_name:  r.vendor      || '',
      ref:           r.ref         || '',
      document_link: r.link        || '',
      need_receipt: false, receipt_status: 'MISSING',
      need_tax_invoice: false, tax_invoice_status: 'NOT_REQUIRED',
      need_wht_issue: false, wht_issue_status: 'NOT_REQUIRED',
      need_original: false, original_status: 'MISSING',
      created_at: now, updated_at: now, updated_by: 'sheet-import',
    });
  }

  // Batch insert ทีละ 200 แถว
  const BATCH = 200;
  let totalCreated = 0;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    await sbRequest('payables', 'post', chunk, { Prefer: 'return=minimal' });
    totalCreated += chunk.length;
  }

  return { created: totalCreated, skipped: skippedRows.length, dateFixed, tab: data.tab, totalRows: sheetRows.length };
}

// ---------- Pull only (ปลอดภัย — ใช้ cron) ----------
export async function runSheetSync() {
  try {
    const r = await pullFromSheet();
    if (r.skipped) return r;
    if (r.pulled || r.newIds) {
      console.log(`[sheet-sync] pull: ${r.pulled} status, ${r.newIds} IDs (${r.totalRows} rows, tab="${r.tab}")`);
      await writeActivityLog(SYNC_USER, 'SHEET_SYNC_PULL', 'payables', '', 'SUCCESS', `Pull: status ${r.pulled}`, r);
    }
    return r;
  } catch (err) {
    console.warn('[sheet-sync]', err.message);
    return { error: err.message };
  }
}

// ---------- Full Sync 2 ทาง: Push → Pull ----------
export async function runFullSync() {
  try {
    const allRecords = await sbRequest('payables?select=*&order=due_date.asc', 'get') || [];
    const pushResult = await pushToSheet(allRecords);
    const pullResult = await pullFromSheet();
    const result = {
      pulled: pullResult.pulled || 0, newIds: pullResult.newIds || 0,
      pushed: pushResult.pushed || 0, sheetUpdated: pushResult.updated || 0, sheetAdded: pushResult.added || 0,
      tab: pullResult.tab, totalRows: pullResult.totalRows
    };
    console.log(`[sheet-sync] FULL: push ${result.sheetUpdated}upd/${result.sheetAdded}add | pull ${result.pulled}status`);
    await writeActivityLog(SYNC_USER, 'SHEET_SYNC_FULL', 'payables', '', 'SUCCESS', 'Full sync', result);
    return result;
  } catch (err) {
    console.warn('[sheet-sync]', err.message);
    return { error: err.message };
  }
}

export const sheetSyncEnabled = () => cfg().enabled;
export const sheetSyncTab = () => cfg().tab;
