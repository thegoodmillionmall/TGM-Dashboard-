import { config } from '../config.js';

export function payablesScriptEnabled() {
  return !!(config.payablesScriptUrl && config.payablesScriptToken);
}

export async function sendPayableToScript({ row, file }) {
  if (!payablesScriptEnabled()) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่า PAYABLES_SCRIPT_URL / PAYABLES_SCRIPT_TOKEN' };
  const res = await fetch(config.payablesScriptUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: config.payablesScriptToken,
      action: 'createPayable',
      row,
      file: file ? {
        name: file.name || 'line-payable-file',
        mimeType: file.mimeType || 'application/octet-stream',
        base64: Buffer.from(file.buffer).toString('base64')
      } : null
    })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Apps Script ตอบกลับไม่ใช่ JSON: ' + text.slice(0, 250)); }
  if (!res.ok || data.error) throw new Error(data.error || ('Apps Script HTTP ' + res.status));
  return data;
}
