import { config } from '../config.js';

export function payablesScriptEnabled() {
  return !!(config.payablesScriptUrl && config.payablesScriptToken);
}

async function callPayablesScript(payload) {
  if (!payablesScriptEnabled()) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่า PAYABLES_SCRIPT_URL / PAYABLES_SCRIPT_TOKEN' };
  let url;
  try {
    url = new URL(config.payablesScriptUrl);
  } catch {
    throw new Error('PAYABLES_SCRIPT_URL ไม่ใช่ URL ที่ถูกต้อง ต้องเป็น https://script.google.com/macros/s/.../exec');
  }
  let res;
  try {
    res = await fetch(url.href, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: config.payablesScriptToken,
        tab: config.sheetSyncTab || config.googlePayablesTab,
        ...payload
      })
    });
  } catch (err) {
    throw new Error(`ติดต่อ Apps Script ไม่ได้ (${url.hostname}): ${err.cause?.message || err.message}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Apps Script ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 250)); }
  if (!res.ok || data.error) throw new Error(data.error || ('Apps Script HTTP ' + res.status));
  return data;
}

function scriptFilePayload(file) {
  return file ? {
    name: file.name || 'line-payable-file',
    mimeType: file.mimeType || 'application/octet-stream',
    base64: Buffer.from(file.buffer).toString('base64')
  } : null;
}

export async function sendPayableToScript({ row, file }) {
  return callPayablesScript({
    action: 'createPayable',
    row,
    file: scriptFilePayload(file)
  });
}

export async function uploadPayableFileToScript({ file }) {
  return callPayablesScript({
    action: 'uploadFile',
    file: scriptFilePayload(file)
  });
}

export async function readPayablesFromScript() {
  if (!payablesScriptEnabled()) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่า PAYABLES_SCRIPT_URL / PAYABLES_SCRIPT_TOKEN' };
  let url;
  try {
    url = new URL(config.payablesScriptUrl);
  } catch {
    throw new Error('PAYABLES_SCRIPT_URL ไม่ใช่ URL ที่ถูกต้อง ต้องเป็น https://script.google.com/macros/s/.../exec');
  }
  url.searchParams.set('token', config.payablesScriptToken);
  url.searchParams.set('tab', config.sheetSyncTab || config.googlePayablesTab);
  let res;
  try {
    res = await fetch(url.href, { method: 'GET', redirect: 'follow' });
  } catch (err) {
    throw new Error(`ติดต่อ Apps Script ไม่ได้ (${url.hostname}): ${err.cause?.message || err.message}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Apps Script ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 250)); }
  if (!res.ok || data.error) throw new Error(data.error || ('Apps Script HTTP ' + res.status));
  return data;
}

export async function upsertPayablesToScript(rows) {
  return callPayablesScript({
    action: 'upsert',
    rows
  });
}
