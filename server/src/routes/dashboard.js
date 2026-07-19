import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  buildDashboardFast, buildProductsFast, buildAdsDetail, buildDeepAudit,
  getFastReconciliationAudit, buildProfitByPlatformRows
} from '../lib/fast.js';

const router = Router();
router.use(requireAuth);

function dateStr(d) { return d.toISOString().slice(0, 10); }

// GET /api/dashboard?start=&end=&platform=&subPlatform=
router.get('/', requirePermission('overview', 'dashboard'), async (req, res) => {
  try {
    const { start, end, platform, subPlatform } = req.query;
    const out = await buildDashboardFast(start, end, platform || 'All', subPlatform || 'All');
    console.log(`[dashboard] ${start} → ${end} platform=${platform || 'All'} | revenue=${out.summary.revenue} orders=${out.summary.totalOrders} cache=${out.cache?.hit ? 'HIT' : 'MISS'}`);
    res.json(out);
  } catch (err) {
    console.error(`[dashboard] ${req.query.start} → ${req.query.end} ERROR: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

// พอร์ตจาก getDateRangeCompareData
router.get('/compare', requirePermission('overview', 'dashboard'), async (req, res) => {
  try {
    const { start, end, platform, subPlatform } = req.query;
    const s = new Date(start), e = new Date(end);
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - days + 1);
    const [current, previous] = await Promise.all([
      buildDashboardFast(start, end, platform || 'All', subPlatform || 'All'),
      buildDashboardFast(dateStr(prevStart), dateStr(prevEnd), platform || 'All', subPlatform || 'All')
    ]);
    const pct = (now, prev) => (prev ? ((now - prev) / prev) * 100 : 0);
    res.json({
      current: current.summary,
      previous: previous.summary,
      delta: {
        revenue: pct(current.summary.revenue, previous.summary.revenue),
        netIncome: pct(current.summary.netIncome, previous.summary.netIncome),
        orders: pct(current.summary.totalOrders, previous.summary.totalOrders),
        roas: pct(current.summary.roas, previous.summary.roas),
        margin: (current.summary.netMargin || 0) - (previous.summary.netMargin || 0)
      }
    });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// พอร์ตจาก getAdvancedDashboardData
router.get('/advanced', requirePermission('dashboard'), async (req, res) => {
  try {
    const { start, end, platform, subPlatform } = req.query;
    const base = await buildDashboardFast(start, end, platform || 'All', subPlatform || 'All');
    const trend = (base.dailyCharts.labels || []).map((label, i) => {
      const rev = (base.dailyCharts.ttRev[i] || 0) + (base.dailyCharts.shRev[i] || 0) + (base.dailyCharts.mtRev[i] || 0);
      const ads = base.dailyCharts.ads[i] || 0;
      const profit = rev - ads;
      return { label, revenue: rev, netIncome: profit, margin: rev > 0 ? (profit / rev) * 100 : 0 };
    });
    res.json({ base, trend });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.get('/products', requirePermission('products'), async (req, res) => {
  try {
    const { start, end, platform } = req.query;
    res.json(await buildProductsFast(start, end, platform || 'All'));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// สินค้าแบบรายเดือน: เรียก get_product_sales ทีละเดือนแล้วประกอบเป็นตาราง สินค้า × เดือน
router.get('/products-monthly', requirePermission('products'), async (req, res) => {
  try {
    const { start, end, platform } = req.query;
    const s = new Date(start || '2026-01-01');
    const e = new Date(end || new Date().toISOString().slice(0, 10));
    const months = [];
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e && months.length < 24) {
      const mStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      months.push({
        key: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        start: dateStr(mStart),
        end: dateStr(mEnd < e ? mEnd : e)
      });
      cur.setMonth(cur.getMonth() + 1);
    }

    const products = {};
    for (const m of months) {
      const data = await buildProductsFast(m.start, m.end, platform || 'All');
      (data.topProducts || []).forEach(p => {
        if (!products[p.name]) {
          products[p.name] = { name: p.name, platform: p.platform || '', months: {}, totalRev: 0, totalOrders: 0, totalCost: 0, totalProfit: 0 };
        }
        const row = products[p.name];
        row.months[m.key] = { rev: p.rev, orders: p.orders, cost: p.cost, profit: p.profit };
        row.totalRev += p.rev;
        row.totalOrders += p.orders;
        row.totalCost += p.cost;
        row.totalProfit += p.profit;
        if (!row.platform && p.platform) row.platform = p.platform;
      });
    }

    const rows = Object.values(products).sort((a, b) => b.totalRev - a.totalRev);
    res.json({ months: months.map(m => m.key), rows, source: 'get_product_sales รายเดือน' });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.get('/ads', requirePermission('ads'), async (req, res) => {
  try {
    const { start, end } = req.query;
    res.json(await buildAdsDetail(start, end));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.get('/deep-audit', requirePermission('deepaudit'), async (req, res) => {
  try {
    const { start, end, platform } = req.query;
    res.json(await buildDeepAudit(start, end, platform || 'All'));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// พอร์ตจาก getReconciliationData (fast)
router.get('/reconcile', requirePermission('reconcile'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const data = await getFastReconciliationAudit(start, end);
    if (!data) return res.status(502).json({ error: 'Supabase reconciliation returned no data' });
    res.json(data);
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// พอร์ตจาก getProfitByProduct + getProfitByPlatform
router.get('/profit', requirePermission('profit'), async (req, res) => {
  try {
    const { start, end, platform } = req.query;
    const [productData, dashData] = await Promise.all([
      buildProductsFast(start, end, platform || 'All'),
      buildDashboardFast(start, end, 'All', 'All')
    ]);
    const products = (productData.topProducts || []).map(p => ({
      name: p.name,
      revenue: p.rev,
      orders: p.orders,
      cost: p.cost,
      profit: p.profit,
      margin: p.margin
    }));
    res.json({
      byPlatform: buildProfitByPlatformRows(dashData),
      topProfit: products.slice().sort((a, b) => b.profit - a.profit).slice(0, 30),
      lowMargin: products.filter(p => p.revenue > 0).sort((a, b) => a.margin - b.margin).slice(0, 30),
      summary: dashData.summary
    });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

export default router;
