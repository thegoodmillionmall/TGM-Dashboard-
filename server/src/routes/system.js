import { Router } from 'express';
import { execSync } from 'node:child_process';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRequest, sbRpcOne } from '../supabase.js';
import { config } from '../config.js';
import { writeActivityLog } from '../lib/log.js';
import { syncFlowAccount } from '../lib/flowaccount.js';

const router = Router();
router.use(requireAuth);

function getGitValue(command) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

router.get('/version', (req, res) => {
  const commit = process.env.APP_VERSION || getGitValue('git rev-parse --short HEAD') || 'unknown';
  const branch = process.env.APP_BRANCH || getGitValue('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const deployedAt = process.env.APP_DEPLOYED_AT || '';
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({ ok: true, commit, branch, deployedAt, time: new Date().toISOString() });
});

// พอร์ตจาก getSystemHealth / getSystemHealthDetailed (Supabase-only)
router.get('/health', async (req, res) => {
  const startedAt = Date.now();
  const checks = [];
  async function check(name, fn) {
    const t = Date.now();
    try {
      const detail = await fn();
      checks.push({ name, status: 'OK', elapsedMs: Date.now() - t, detail });
    } catch (err) {
      checks.push({ name, status: 'ERROR', elapsedMs: Date.now() - t, detail: err.message });
    }
  }

  await check('Supabase connection', async () => {
    const rows = await sbRequest('upload_batches?select=id&limit=1', 'get');
    return Array.isArray(rows) ? 'ตอบสนองปกติ' : 'unexpected';
  });
  await check('Upload batches', async () => {
    const rows = await sbRequest('upload_batches?select=source_sheet,total_rows,status&limit=1000', 'get') || [];
    const bySheet = {};
    rows.forEach(r => {
      const key = r.source_sheet || '?';
      bySheet[key] = (bySheet[key] || 0) + Number(r.total_rows || 0);
    });
    return bySheet;
  });
  await check('RPC get_tiktok_gmv_audit', () => sbRpcOne('get_tiktok_gmv_audit', { p_start: null, p_end: null }).then(d => (d ? 'มีข้อมูล' : 'ว่าง')));
  await check('RPC get_shopee_audit', () => sbRpcOne('get_shopee_audit', { p_start: null, p_end: null }).then(d => (d ? 'มีข้อมูล' : 'ว่าง')));
  await check('RPC get_ads_audit', () => sbRpcOne('get_ads_audit', { p_start: null, p_end: null }).then(d => (d ? 'มีข้อมูล' : 'ว่าง')));
  await check('Users table', async () => {
    const rows = await sbRequest('app_users?select=username&limit=100', 'get');
    return (rows || []).length + ' ผู้ใช้';
  });
  await check('AI assistant', async () => (config.googleAiKey ? 'ตั้งค่าแล้ว (' + config.googleAiModel + ')' : 'ยังไม่ได้ตั้งค่า GOOGLE_AI_KEY'));
  await check('FlowAccount sync', async () => (config.flowAccountUrl ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'));

  res.json({
    ok: checks.every(c => c.status === 'OK'),
    elapsedMs: Date.now() - startedAt,
    checks
  });
});

// ตัวอย่างข้อมูลจากไฟล์ต้นทาง (ใช้ในแผนผัง mapping)
import { cacheGet, cachePut } from '../cache.js';
router.get('/sheet-samples', async (req, res) => {
  try {
    const sheets = String(req.query.sheets || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    const out = {};
    for (const sheet of sheets) {
      const cacheKey = 'sample:' + sheet;
      const cached = cacheGet(cacheKey);
      if (cached) { out[sheet] = cached; continue; }
      try {
        const rows = await sbRequest(
          'raw_upload_rows?select=row_data&source_sheet=eq.' + encodeURIComponent(sheet) + '&order=uploaded_at.desc&limit=3',
          'get'
        );
        const objs = (rows || []).map(r => r.row_data || {});
        const columns = objs.length ? Object.keys(objs[0]).filter(c => String(c).trim()).slice(0, 8) : [];
        const sample = { columns, rows: objs.map(o => columns.map(c => String(o[c] ?? '').slice(0, 40))), totalCols: objs.length ? Object.keys(objs[0]).length : 0 };
        cachePut(cacheKey, sample, 300);
        out[sheet] = sample;
      } catch { out[sheet] = { columns: [], rows: [], totalCols: 0 }; }
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// activity log ล่าสุด
router.get('/activity-log', requireRole('ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const rows = await sbRequest(
      'activity_log_events?select=*&order=created_at.desc&limit=' + limit, 'get'
    );
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// FlowAccount sync ด้วยตนเอง (พอร์ตจาก syncFlowAccount)
router.post('/flowaccount/sync', requireRole('ADMIN'), async (req, res) => {
  try {
    const { start, end } = req.body || {};
    const result = await syncFlowAccount(start, end);
    await writeActivityLog(req.user, 'SYNC_FLOWACCOUNT', 'flowaccount_invoices', '', 'SUCCESS', 'Synced ' + result.count + ' invoices');
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/flowaccount/invoices', async (req, res) => {
  try {
    const rows = await sbRequest('flowaccount_invoices?select=*&order=invoice_date.desc&limit=500', 'get');
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
