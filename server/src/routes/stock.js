import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbUpsert } from '../supabase.js';

const router = Router();
router.use(requireAuth);

// D/M/YYYY ↔ YYYY-MM-DD
function toISO(s) {
  if (!s) return null;
  const [d, m, y] = String(s).split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function fromISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  return `${d}/${m}/${y}`;
}

// ── GET /api/stock/history ── โหลดทุกวัน ──────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const rows = await sbRequest('stock_daily?select=*&order=stock_date.asc') || [];
    res.json(rows.map(r => ({
      date:    fromISO(r.stock_date),
      cmpDate: fromISO(r.cmp_date),
      items:   r.items || [],
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stock/history ── upsert 1 วัน (ทับได้) ─────────────────────
router.post('/history', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const { date, cmpDate, items } = req.body;
    if (!date || !Array.isArray(items)) return res.status(400).json({ error: 'date and items required' });
    const isoDate = toISO(date);
    if (!isoDate) return res.status(400).json({ error: 'invalid date format (ต้องเป็น D/M/YYYY)' });
    await sbUpsert('stock_daily', [{
      stock_date: isoDate,
      cmp_date:   toISO(cmpDate),
      items,
      updated_at: new Date().toISOString(),
    }], 'stock_date');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stock/history/:date ── ลบ 1 วัน ───────────────────────────
router.delete('/history/:date(*)', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const isoDate = toISO(req.params.date);
    if (!isoDate) return res.status(400).json({ error: 'invalid date' });
    await sbRequest(`stock_daily?stock_date=eq.${isoDate}`, 'delete', null, { Prefer: 'return=minimal' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stock/history ── ล้างทั้งหมด ──────────────────────────────
router.delete('/history', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('stock_daily?created_at=gte.2000-01-01T00:00:00Z', 'delete', null, { Prefer: 'return=minimal' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stock/prices ── โหลดประวัติราคาทั้งหมด ──────────────────────
router.get('/prices', async (req, res) => {
  try {
    const rows = await sbRequest('stock_price_config?select=*&order=effective_from.asc') || [];
    res.json(rows.map(r => ({
      id:           r.id,
      product_key:  r.product_key,
      product_label: r.product_label,
      cost:          parseFloat(r.cost),
      price:         parseFloat(r.price),
      effective_from: fromISO(r.effective_from),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stock/prices ── เพิ่มรายการราคาใหม่ ─────────────────────────
router.post('/prices', requireRole('ADMIN'), async (req, res) => {
  try {
    const { product_key, product_label, cost, price, effective_from } = req.body;
    if (!product_key || !effective_from) return res.status(400).json({ error: 'product_key and effective_from required' });
    const isoFrom = toISO(effective_from);
    if (!isoFrom) return res.status(400).json({ error: 'invalid effective_from (ต้องเป็น D/M/YYYY)' });
    await sbRequest('stock_price_config', 'post', [{
      product_key, product_label, cost: parseFloat(cost), price: parseFloat(price), effective_from: isoFrom,
    }], { Prefer: 'return=minimal' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
