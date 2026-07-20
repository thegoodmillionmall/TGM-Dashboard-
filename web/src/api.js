const BASE = '/api';

export function getToken() { return localStorage.getItem('tgm_token') || ''; }
export function setSession(token, user) {
  localStorage.setItem('tgm_token', token);
  localStorage.setItem('tgm_user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('tgm_token');
  localStorage.removeItem('tgm_user');
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('tgm_user') || 'null'); } catch { return null; }
}

async function handle(res) {
  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('เซสชันหมดอายุ');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

export async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const url = BASE + path + (qs.toString() ? '?' + qs.toString() : '');
  return handle(await fetch(url, { cache: 'no-store', headers: { Authorization: 'Bearer ' + getToken() } }));
}

export async function apiPost(path, body = {}) {
  return handle(await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify(body)
  }));
}

export async function apiPatch(path, body = {}) {
  return handle(await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify(body)
  }));
}

export async function apiDelete(path) {
  return handle(await fetch(BASE + path, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + getToken() }
  }));
}

export async function apiUpload(path, formData) {
  return handle(await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken() },
    body: formData
  }));
}

export const fmt = (v, digits = 0) =>
  Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtMoney = v => '฿' + fmt(v, 2);
export const fmtPct = v => fmt(v, 2) + '%';
