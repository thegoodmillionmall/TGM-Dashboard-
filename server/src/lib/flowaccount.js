import { config } from '../config.js';
import { sbUpsert } from '../supabase.js';

// พอร์ตจาก fetchJsonFromConfiguredApi_ + normalizeFlowAccountInvoice_ + syncFlowAccount
export async function syncFlowAccount(startDate, endDate) {
  if (!config.flowAccountUrl) throw new Error('ยังไม่ได้ตั้งค่า FLOWACCOUNT_API_URL ใน .env');
  const sep = config.flowAccountUrl.includes('?') ? '&' : '?';
  const url = config.flowAccountUrl + sep +
    'startDate=' + encodeURIComponent(startDate || '') + '&endDate=' + encodeURIComponent(endDate || '');
  const res = await fetch(url, {
    headers: config.flowAccountToken ? { Authorization: 'Bearer ' + config.flowAccountToken } : {}
  });
  if (!res.ok) throw new Error('FlowAccount API error: HTTP ' + res.status);
  const parsed = await res.json();
  const items = Array.isArray(parsed) ? parsed : parsed.data || parsed.orders || parsed.invoices || parsed.items || [];

  const records = items.map(item => ({
    invoice_id: String(item.documentId || item.invoiceId || item.id || item.documentSerial || '').trim(),
    invoice_date: String(item.documentDate || item.issuedDate || item.date || '').slice(0, 10) || null,
    customer: String(item.customerName || item.contactName || item.customer || ''),
    total: Number(item.grandTotal || item.total || item.amount || 0),
    status: String(item.status || item.documentStatus || ''),
    raw: item,
    synced_at: new Date().toISOString()
  })).filter(r => r.invoice_id);

  if (records.length) await sbUpsert('flowaccount_invoices', records, 'invoice_id');
  return { count: records.length };
}
