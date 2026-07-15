import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbUpsert, sbInsertRows } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';

const router = Router();
router.use(requireAuth);

const n = v => { const x = Number(v ?? 0); return isNaN(x) ? 0 : x; };
const fmt = v => v !== undefined && v !== null ? String(Number(v).toFixed(2)) : '0.00';

// ชื่อ field ภาษาไทย → ใช้ใน log
const FIELD_LABELS = {
  tt_gmvmax_revenue:  'TikTok GMV MAX ยอดขาย',
  tt_gmvmax_spend:    'TikTok GMV MAX ค่าแอด',
  tt_gmvlive_revenue: 'TikTok GMV LIVE ยอดขาย',
  tt_gmvlive_spend:   'TikTok GMV LIVE ค่าแอด',
  tt_specific_spend:  'TikTok Ads เฉพาะ ค่าแอด',
  tt_specific_count:  'TikTok Ads เฉพาะ จำนวนรายการ',
  tt_backend_spend:   'TikTok Ads หลังบ้าน',
  shopee_spend:       'Shopee Ads',
  shopee_live_spend:  'Shopee Live Ads',
  meta_spend:         'Meta Ads',
  notes:              'หมายเหตุ',
  reporter:           'ผู้รายงาน'
};

const NUMERIC_FIELDS = [
  'tt_gmvmax_revenue','tt_gmvmax_spend',
  'tt_gmvlive_revenue','tt_gmvlive_spend',
  'tt_specific_spend','tt_specific_count',
  'tt_backend_spend',
  'shopee_spend','shopee_live_spend',
  'meta_spend'
];

// เขียน diff log ทุก field ที่เปลี่ยน
async function writeDiffLog(oldRow, newRow, date, username, source = 'MANUAL', sourceFile = null) {
  const logs = [];
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = oldRow ? String(oldRow[field] ?? '') : null;
    const newVal = String(newRow[field] ?? '');
    if (oldVal === null || oldVal !== newVal) {
      logs.push({
        entity_table: 'tiktok_ads_manual',
        entity_date:  date,
        action:       oldRow ? 'UPDATE' : 'CREATE',
        field_name:   label,
        old_value:    oldVal,
        new_value:    newVal,
        changed_by:   username,
        source,
        source_file:  sourceFile
      });
    }
  }
  if (logs.length > 0) {
    await sbInsertRows('daily_data_log', logs).catch(err =>
      console.warn('[adsmanual] log write failed:', err.message)
    );
  }
  return logs.length;
}

function mapRow(r) {
  const ttSpend    = n(r.tt_gmvmax_spend) + n(r.tt_gmvlive_spend) + n(r.tt_specific_spend) + n(r.tt_backend_spend);
  const ttRevenue  = n(r.tt_gmvmax_revenue) + n(r.tt_gmvlive_revenue);
  const shopeeTotal = n(r.shopee_spend) + n(r.shopee_live_spend);
  const totalSpend = ttSpend + shopeeTotal + n(r.meta_spend);
  return {
    id: r.id,
    date: r.entry_date,
    ttGmvmaxRevenue:  n(r.tt_gmvmax_revenue),
    ttGmvmaxSpend:    n(r.tt_gmvmax_spend),
    ttGmvliveRevenue: n(r.tt_gmvlive_revenue),
    ttGmvliveSpend:   n(r.tt_gmvlive_spend),
    ttSpecificSpend:  n(r.tt_specific_spend),
    ttSpecificCount:  n(r.tt_specific_count),
    ttBackendSpend:   n(r.tt_backend_spend),
    shopeeSpend:      n(r.shopee_spend),
    shopeeLiveSpend:  n(r.shopee_live_spend),
    metaSpend:        n(r.meta_spend),
    ttTotalRevenue:   ttRevenue,
    ttTotalSpend:     ttSpend,
    ttRoas:           ttSpend > 0 ? +(ttRevenue / ttSpend).toFixed(2) : 0,
    shopeeTotal,
    totalSpend,
    notes:    r.notes    || '',
    reporter: r.reporter || '',
    createdBy: r.created_by || '',
    updatedAt: r.updated_at || ''
  };
}

// GET /api/ads-manual?start=&end=
router.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;
    let path = 'tiktok_ads_manual?select=*&order=entry_date.desc&limit=200';
    if (start) path += '&entry_date=gte.' + start;
    if (end)   path += '&entry_date=lte.' + end;
    const rows = await sbRequest(path, 'get') || [];
    res.json(rows.map(mapRow));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ads-manual/mtd?year=2026&month=7
router.get('/mtd', async (req, res) => {
  try {
    const year  = n(req.query.year)  || new Date().getFullYear();
    const month = n(req.query.month) || (new Date().getMonth() + 1);
    const mm    = String(month).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end   = `${year}-${mm}-31`;

    const rows = await sbRequest(
      `tiktok_ads_manual?select=*&entry_date=gte.${start}&entry_date=lte.${end}&order=entry_date.asc`,
      'get'
    ) || [];

    const mapped     = rows.map(mapRow);
    const sum        = f => mapped.reduce((a, r) => a + (r[f] || 0), 0);
    const ttRevenue  = sum('ttTotalRevenue');
    const ttSpend    = sum('ttTotalSpend');
    const shopeeSpend = sum('shopeeTotal');
    const metaSpend  = sum('metaSpend');
    const totalSpend = ttSpend + shopeeSpend + metaSpend;

    res.json({ month: `${year}-${mm}`, days: mapped.length, ttRevenue, ttSpend, shopeeSpend, metaSpend, totalSpend,
      roas: totalSpend > 0 ? +(ttRevenue / totalSpend).toFixed(2) : 0, daily: mapped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ads-manual/log?start=&end=&limit=200
router.get('/log', async (req, res) => {
  try {
    const { start, end, limit = 200 } = req.query;
    let path = `daily_data_log?entity_table=eq.tiktok_ads_manual&order=changed_at.desc&limit=${limit}`;
    if (start) path += '&entity_date=gte.' + start;
    if (end)   path += '&entity_date=lte.' + end;
    const rows = await sbRequest(path, 'get') || [];
    res.json(rows.map(r => ({
      id:         r.id,
      entityDate: r.entity_date,
      action:     r.action,
      fieldName:  r.field_name,
      oldValue:   r.old_value,
      newValue:   r.new_value,
      changedBy:  r.changed_by,
      changedAt:  r.changed_at,
      source:     r.source,
      sourceFile: r.source_file
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ads-manual — upsert รายวัน + diff log
router.post('/', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.date) return res.status(400).json({ error: 'กรุณาระบุวันที่' });

    // ดึงค่าปัจจุบันก่อน (เพื่อ diff)
    const existing = await sbRequest(
      `tiktok_ads_manual?entry_date=eq.${b.date}&select=*&limit=1`, 'get'
    ).then(r => r?.[0] || null);

    const row = {
      entry_date:          b.date,
      tt_gmvmax_revenue:   n(b.ttGmvmaxRevenue),
      tt_gmvmax_spend:     n(b.ttGmvmaxSpend),
      tt_gmvlive_revenue:  n(b.ttGmvliveRevenue),
      tt_gmvlive_spend:    n(b.ttGmvliveSpend),
      tt_specific_spend:   n(b.ttSpecificSpend),
      tt_specific_count:   n(b.ttSpecificCount),
      tt_backend_spend:    n(b.ttBackendSpend),
      shopee_spend:        n(b.shopeeSpend),
      shopee_live_spend:   n(b.shopeeLiveSpend),
      meta_spend:          n(b.metaSpend),
      notes:    String(b.notes    || '').slice(0, 500),
      reporter: String(b.reporter || '').slice(0, 100),
      created_by: req.user.username,
      updated_at: new Date().toISOString()
    };

    await sbUpsert('tiktok_ads_manual', row, 'entry_date');
    const diffCount = await writeDiffLog(existing, row, b.date, req.user.username, b.source || 'MANUAL', b.sourceFile || null);

    await writeActivityLog(req.user, 'SAVE_ADS_MANUAL', 'tiktok_ads_manual', b.date, 'SUCCESS',
      `บันทึกค่าแอด ${b.date} (เปลี่ยน ${diffCount} field)`);
    res.json({ ok: true, message: 'บันทึกสำเร็จ', changed: diffCount });
  } catch (err) {
    await writeActivityLog(req.user, 'SAVE_ADS_MANUAL', '', req.body?.date || '', 'FAILED', err.message).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ads-manual/bulk — อัปโหลดหลายวันพร้อมกัน (from file)
router.post('/bulk', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const rows = req.body?.rows;
    const sourceFile = req.body?.sourceFile || '';
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'ไม่มีข้อมูล' });

    let totalChanged = 0;
    const results = [];

    for (const b of rows) {
      if (!b.date) continue;

      const existing = await sbRequest(
        `tiktok_ads_manual?entry_date=eq.${b.date}&select=*&limit=1`, 'get'
      ).then(r => r?.[0] || null);

      const row = {
        entry_date:         b.date,
        tt_gmvmax_revenue:  n(b.ttGmvmaxRevenue),
        tt_gmvmax_spend:    n(b.ttGmvmaxSpend),
        tt_gmvlive_revenue: n(b.ttGmvliveRevenue),
        tt_gmvlive_spend:   n(b.ttGmvliveSpend),
        tt_specific_spend:  n(b.ttSpecificSpend),
        tt_specific_count:  n(b.ttSpecificCount),
        tt_backend_spend:   n(b.ttBackendSpend),
        shopee_spend:       n(b.shopeeSpend),
        shopee_live_spend:  n(b.shopeeLiveSpend),
        meta_spend:         n(b.metaSpend),
        notes:    String(b.notes    || '').slice(0, 500),
        reporter: String(b.reporter || '').slice(0, 100),
        created_by: req.user.username,
        updated_at: new Date().toISOString()
      };

      await sbUpsert('tiktok_ads_manual', row, 'entry_date');
      const diffCount = await writeDiffLog(existing, row, b.date, req.user.username, 'FILE_UPLOAD', sourceFile);
      totalChanged += diffCount;
      results.push({ date: b.date, changed: diffCount });
    }

    await writeActivityLog(req.user, 'BULK_ADS_MANUAL', 'tiktok_ads_manual', '', 'SUCCESS',
      `Bulk import ${rows.length} วัน จาก ${sourceFile}`);
    res.json({ ok: true, rowsProcessed: rows.length, totalChanged, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ads-manual/:date
router.delete('/:date', requireRole('ADMIN'), async (req, res) => {
  try {
    const date = req.params.date;
    // log ก่อนลบ
    await sbInsertRows('daily_data_log', [{
      entity_table: 'tiktok_ads_manual',
      entity_date:  date,
      action:       'DELETE',
      field_name:   null,
      old_value:    null,
      new_value:    null,
      changed_by:   req.user.username,
      source:       'MANUAL'
    }]).catch(() => {});
    await sbRequest(`tiktok_ads_manual?entry_date=eq.${date}`, 'delete', null, { Prefer: 'return=minimal' });
    await writeActivityLog(req.user, 'DELETE_ADS_MANUAL', 'tiktok_ads_manual', date, 'SUCCESS', `ลบค่าแอดวันที่ ${date}`);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
