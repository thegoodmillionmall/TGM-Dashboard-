import { config } from './config.js';

// พอร์ตจาก supabaseRequest_ / supabaseRpc_ / supabaseInsertRows_ ใน Code.gs
export async function sbRequest(path, method = 'get', payload = null, extraHeaders = {}) {
  const url = config.supabaseUrl + '/rest/v1/' + String(path).replace(/^\/+/, '');
  const headers = {
    apikey: config.supabaseKey,
    Authorization: 'Bearer ' + config.supabaseKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extraHeaders
  };
  const res = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: payload !== null && method.toLowerCase() !== 'get' ? JSON.stringify(payload) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function sbRpc(functionName, payload = {}) {
  return sbRequest('rpc/' + functionName, 'post', payload, { Prefer: 'return=representation' });
}

export async function sbRpcOne(functionName, payload = {}) {
  const result = await sbRpc(functionName, payload);
  return Array.isArray(result) ? result[0] : result;
}

export async function sbInsertRows(table, rows, chunkSize = 300) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await sbRequest(table, 'post', chunk, { Prefer: 'return=minimal' });
    inserted += chunk.length;
  }
  return { inserted };
}

export async function sbDelete(pathWithFilter) {
  return sbRequest(pathWithFilter, 'delete', null, { Prefer: 'return=minimal' });
}

export async function sbUpsert(table, rows, onConflict) {
  const path = table + (onConflict ? `?on_conflict=${onConflict}` : '');
  return sbRequest(path, 'post', rows, { Prefer: 'resolution=merge-duplicates,return=minimal' });
}

// ---------- Supabase Storage ----------
function storageHeaders(extra = {}) {
  return { apikey: config.supabaseKey, Authorization: 'Bearer ' + config.supabaseKey, ...extra };
}

export async function sbStorageUpload(bucket, path, buffer, contentType) {
  const url = `${config.supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true' }),
    body: buffer
  });
  if (!res.ok) throw new Error(`Storage upload HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export async function sbStorageDownload(bucket, path) {
  const url = `${config.supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, { headers: storageHeaders() });
  if (!res.ok) throw new Error(`Storage download HTTP ${res.status}`);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream'
  };
}

export async function sbStorageDelete(bucket, path) {
  const url = `${config.supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, { method: 'DELETE', headers: storageHeaders() });
  if (!res.ok) throw new Error(`Storage delete HTTP ${res.status}`);
  return true;
}
