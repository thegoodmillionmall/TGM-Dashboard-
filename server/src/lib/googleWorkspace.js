import crypto from 'node:crypto';
import { config } from '../config.js';

const tokenCache = { value: '', expiresAt: 0 };

const b64url = input => Buffer.from(input)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

export function googleWorkspaceEnabled() {
  return !!(config.googleServiceAccountEmail && config.googleServiceAccountPrivateKey);
}

async function getGoogleAccessToken(scopes) {
  if (!googleWorkspaceEnabled()) throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  const scope = scopes.join(' ');
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.scope === scope && tokenCache.expiresAt - 60 > now) return tokenCache.value;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: config.googleServiceAccountEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), config.googleServiceAccountPrivateKey);
  const assertion = unsigned + '.' + b64url(signature);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await res.text();
  if (!res.ok) throw new Error('Google token HTTP ' + res.status + ': ' + body.slice(0, 250));
  const json = JSON.parse(body);
  tokenCache.value = json.access_token;
  tokenCache.scope = scope;
  tokenCache.expiresAt = now + Number(json.expires_in || 3600);
  return tokenCache.value;
}

function sanitizeFileName(name) {
  const fallback = 'line-payable-' + new Date().toISOString().replace(/[:.]/g, '-') + '.bin';
  return String(name || fallback).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || fallback;
}

export async function uploadFileToDrive({ fileName, mimeType, buffer }) {
  if (!config.googleDriveFolderId) throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_DRIVE_PAYABLES_FOLDER_ID');
  const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/drive']);
  const boundary = 'tgm_' + crypto.randomBytes(12).toString('hex');
  const metadata = {
    name: sanitizeFileName(fileName),
    parents: [config.googleDriveFolderId]
  };
  const head = Buffer.from(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: Buffer.concat([head, Buffer.from(buffer), tail])
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Drive upload HTTP ' + res.status + ': ' + text.slice(0, 250));
  const file = JSON.parse(text);

  if (config.googleDrivePublicLink) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/permissions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
  }

  return {
    id: file.id,
    name: file.name,
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    webContentLink: file.webContentLink || `https://drive.google.com/uc?id=${file.id}&export=download`
  };
}

export async function appendPayableToSheet(row) {
  if (!config.googlePayablesSpreadsheetId) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่า GOOGLE_PAYABLES_SPREADSHEET_ID' };
  const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const range = `${config.googlePayablesTab}!A:N`;
  const values = [[
    row.id || '',
    row.paid === true,
    row.description || '',
    row.company || 'TG',
    Number(row.grossAmount || 0),
    Number(row.whtAmount || 0),
    Number(row.netAmount || 0),
    row.vendor || '',
    row.accountNo || '',
    row.bank || '',
    row.ref || '',
    row.documentLink || '',
    row.docDate || '',
    row.source || 'LINE'
  ]];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.googlePayablesSpreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Sheets append HTTP ' + res.status + ': ' + text.slice(0, 250));
  return JSON.parse(text);
}
