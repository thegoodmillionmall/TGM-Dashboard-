import { sbRpcOne, sbRequest } from '../supabase.js';
import { cacheGet, cachePut } from '../cache.js';

const n = v => Number(v || 0);

// ---------- RPC getters (พอร์ตจาก getFast*FromSupabase_) ----------
export async function getFastTikTokGmvAudit(startDate, endDate) {
  try {
    const data = await sbRpcOne('get_tiktok_gmv_audit', { p_start: startDate || null, p_end: endDate || null });
    if (!data || !data.analytics) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

export async function getFastShopeeAudit(startDate, endDate) {
  try {
    const data = await sbRpcOne('get_shopee_audit', { p_start: startDate || null, p_end: endDate || null });
    if (!data || !data.orders) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

export async function getFastAdsAudit(startDate, endDate) {
  try {
    const data = await sbRpcOne('get_ads_audit', { p_start: startDate || null, p_end: endDate || null });
    if (!data || !data.platforms) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

export async function getFastModernTrade(startDate, endDate, subPlatformFilter) {
  try {
    const data = await sbRpcOne('get_moderntrade_audit', {
      p_start: startDate || null, p_end: endDate || null, p_channel: subPlatformFilter || 'All'
    });
    if (!data || !data.summary) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

// Modern Trade จากตาราง MT Ledger (mt_sales): ยอดก่อนหัก GP = ยอดขาย, GP% = ค่าธรรมเนียม
const MT_CHANNEL_MAP = { EVE: 'EVEANDBOY', WATSON: 'WATSONS', KONVY: 'KONVY', GDT: 'OTHER' };

export async function getMtFromLedger(startDate, endDate, subPlatformFilter) {
  try {
    const start = (startDate || '2000-01-01').slice(0, 7) + '-01';
    const end = endDate || '2100-01-01';
    const [rows, gpRows] = await Promise.all([
      sbRequest(`mt_sales?select=month,channel,product,units,revenue&month=gte.${start}&month=lte.${end}`, 'get'),
      sbRequest('app_settings?key=eq.mt_gp&limit=1', 'get')
    ]);
    if (!rows || !rows.length) return null;
    const gp = gpRows?.[0]?.value || { EVE: 45, KONVY: 40, WATSON: 40 };
    const want = String(subPlatformFilter || 'All');
    const channels = {};
    const dailyMap = {};
    const summary = { revenue: 0, deductions: 0, orders: 0, rows: rows.length };
    rows.forEach(r => {
      const chKey = MT_CHANNEL_MAP[String(r.channel || '').toUpperCase()] || 'OTHER';
      if (want !== 'All' && chKey !== want) return;
      const rev = Number(r.revenue || 0);
      const units = Number(r.units || 0);
      const fee = rev * (Number(gp[r.channel] || 0) / 100);
      summary.revenue += rev;
      summary.deductions += fee;
      summary.orders += units;
      channels[chKey] = channels[chKey] || { revenue: 0 };
      channels[chKey].revenue += rev;
      const date = String(r.month).slice(0, 10);
      dailyMap[date] = dailyMap[date] || { date, revenue: 0, deductions: 0, orders: 0 };
      dailyMap[date].revenue += rev;
      dailyMap[date].deductions += fee;
      dailyMap[date].orders += units;
    });
    if (!summary.revenue && !summary.orders) return null;
    return {
      summary,
      channels,
      daily: Object.values(dailyMap).sort((a, b) => (a.date < b.date ? -1 : 1)),
      source: 'MT Ledger (mt_sales ก่อนหัก GP)'
    };
  } catch { return null; }
}

// ใช้ MT Ledger ก่อน ถ้าไม่มีข้อมูลค่อยถอยไปใช้ RPC เดิม (ไฟล์ PO)
export async function getMtCombined(startDate, endDate, subPlatformFilter) {
  const ledger = await getMtFromLedger(startDate, endDate, subPlatformFilter);
  if (ledger) return ledger;
  return getFastModernTrade(startDate, endDate, subPlatformFilter);
}

export async function getFastManualFinance(startDate, endDate) {
  try {
    const data = await sbRpcOne('get_manual_finance_audit', { p_start: startDate || null, p_end: endDate || null });
    if (!data || !data.summary) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

export async function getFastReconciliationAudit(startDate, endDate) {
  try {
    const data = await sbRpcOne('get_reconciliation_audit', { p_start: startDate || null, p_end: endDate || null });
    if (!data || !data.summary) return null;
    data.source = 'Supabase RPC';
    return data;
  } catch { return null; }
}

export async function getProductCostsMaster() {
  try {
    const data = await sbRpcOne('get_product_costs_master', {});
    if (!data || !Array.isArray(data.rows)) return [];
    return data.rows;
  } catch { return []; }
}

export async function getFeeSettingsMaster() {
  try {
    const data = await sbRpcOne('get_fee_settings_master', {});
    if (!data || !Array.isArray(data.rows)) return [];
    return data.rows;
  } catch { return []; }
}

export async function getDataSourceMappingsMaster() {
  try {
    const data = await sbRpcOne('get_data_source_mappings', {});
    if (!data || !Array.isArray(data.rows)) return [];
    return data.rows;
  } catch { return []; }
}

// ---------- Dashboard builder (พอร์ต 1:1 จาก getDashboardFastFromSupabase_) ----------
export async function buildDashboardFast(startDate, endDate, platformFilter, subPlatformFilter) {
  const platform = String(platformFilter || 'All');
  const subPlatform = String(subPlatformFilter || 'All');
  if (subPlatform !== 'All' && platform !== 'ModernTrade') {
    throw new Error('Sub-platform filter ใช้ได้เฉพาะ ModernTrade');
  }

  const cacheKey = ['dashboardFastV2', startDate || '', endDate || '', platform, subPlatform].join(':');
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cache: { hit: true, source: 'dashboardFast' } };

  const wantsTt = platform === 'All' || platform === 'TikTok';
  const wantsSh = platform === 'All' || platform === 'Shopee';
  const wantsMt = platform === 'All' || platform === 'ModernTrade';

  const [tt, sh, mt, manual, ads, productsData] = await Promise.all([
    wantsTt ? getFastTikTokGmvAudit(startDate, endDate) : null,
    wantsSh ? getFastShopeeAudit(startDate, endDate) : null,
    wantsMt ? getMtCombined(startDate, endDate, subPlatform) : null,
    getFastManualFinance(startDate, endDate),
    getFastAdsAudit(startDate, endDate),
    buildProductsFast(startDate, endDate, platform).catch(() => null)
  ]);

  if ((wantsTt && !tt) || (wantsSh && !sh) || (wantsMt && !mt)) {
    throw new Error('Supabase RPC ไม่ตอบกลับข้อมูล (ตรวจสอบว่า refresh_* daily ทำงานแล้ว)');
  }

  const monthKey = t => { const s = String(t || ''); return s.length >= 7 ? s.slice(0, 7) : ''; };
  const dayLabel = t => {
    const s = String(t || '');
    return s.length >= 10 ? Number(s.slice(8, 10)) + '/' + Number(s.slice(5, 7)) + '/' + s.slice(0, 4) : s;
  };
  const blank = () => ({ rev: 0, ttRev: 0, shRev: 0, mtRev: 0, deductions: 0, ads: 0, orders: 0, cancels: 0 });
  const ensure = (map, key) => { if (!key) key = 'unknown'; if (!map[key]) map[key] = blank(); return map[key]; };

  const summary = { revenue: 0, deductions: 0, ads: 0, profit: 0, cogs: 0, netIncome: 0, totalOrders: 0, cancelOrders: 0, roas: 0, cancelRate: 0, views: 0, netMargin: 0, aov: 0, adsRate: 0, affiliateRate: 0, platformFeeRate: 0, manualIncome: 0, manualExpense: 0 };
  const audit = {
    rev: { tt: 0, sh: 0, mt: 0 },
    deduct: { ttFees: 0, ttAff: 0, shFees: 0, shAff: 0, mtGp: 0 },
    ads: { ttManager: 0, ttGmv: 0, ttLive: 0, shAds: 0, shLive: 0, meta: 0 },
    adsGmv: { ttGmv: 0, ttLive: 0, shAds: 0, shLive: 0 },
    adsViews: { ttManager: 0, ttGmv: 0, ttLive: 0, shAds: 0, shLive: 0, meta: 0 },
    adsMetrics: {
      ttManager: { imp: 0, reach: 0 }, ttGmv: { imp: 0, reach: 0 }, ttLive: { imp: 0, reach: 0 },
      shAds: { imp: 0, reach: 0 }, shLive: { imp: 0, reach: 0 }, meta: { imp: 0, reach: 0 }
    },
    manual: { income: 0, expense: 0, ads: 0, deduction: 0, cogs: 0 },
    cogs: 0
  };
  const dailyData = {};
  const monthlyData = {};
  const platformBreakdown = { tiktok: 0, shopee: 0, modernTrade: 0 };
  const mtBreakdown = { EVEANDBOY: 0, WATSONS: 0, KONVY: 0, OTHER: 0 };
  const ttBreakdown = { live: 0, affiliate: 0, ads: 0, adsLive: 0 };
  const ttAdsBreakdown = { video: 0, card: 0 };
  const shBreakdown = { ads: 0, affiliate: 0 };

  if (tt) {
    const a = tt.analytics || {};
    const s = tt.sales || {};
    const ttRevenue = n(a.gmv);
    audit.rev.tt = ttRevenue;
    summary.revenue += ttRevenue;
    summary.totalOrders += n(s.orders || a.orders);
    summary.cancelOrders += n(s.cancelledOrders);
    platformBreakdown.tiktok = ttRevenue;
    (tt.daily || []).forEach(row => {
      const date = String(row.date || '');
      const rev = n(row.analyticsGmv);
      const orders = n(row.saleOrderOrders || row.analyticsOrders);
      const d = ensure(dailyData, date);
      const m = ensure(monthlyData, monthKey(date));
      d.rev += rev; d.ttRev += rev; d.orders += orders;
      m.rev += rev; m.ttRev += rev; m.orders += orders;
    });
  }

  if (sh) {
    const o = sh.orders || {};
    const st = sh.settlement || {};
    const shRevenue = n(o.gmv);
    const shFees = n(st.platformFee);
    audit.rev.sh = shRevenue;
    audit.deduct.shFees = shFees;
    summary.revenue += shRevenue;
    summary.deductions += shFees;
    summary.totalOrders += n(o.orders);
    summary.cancelOrders += n(o.cancelledOrders);
    platformBreakdown.shopee = shRevenue;
    (sh.daily || []).forEach(row => {
      const date = String(row.date || '');
      const rev = n(row.orderGmv);
      const fee = n(row.platformFee);
      const orders = n(row.orders);
      const d = ensure(dailyData, date);
      const m = ensure(monthlyData, monthKey(date));
      d.rev += rev; d.shRev += rev; d.deductions += fee; d.orders += orders;
      m.rev += rev; m.shRev += rev; m.deductions += fee; m.orders += orders;
    });
  }

  if (mt) {
    const ms = mt.summary || {};
    const mtRevenue = n(ms.revenue);
    const mtDeductions = n(ms.deductions);
    audit.rev.mt = mtRevenue;
    audit.deduct.mtGp = mtDeductions;
    summary.revenue += mtRevenue;
    summary.deductions += mtDeductions;
    summary.totalOrders += n(ms.orders);
    platformBreakdown.modernTrade = mtRevenue;
    Object.keys(mt.channels || {}).forEach(channel => {
      if (mtBreakdown[channel] !== undefined) mtBreakdown[channel] += n(mt.channels[channel].revenue);
      else mtBreakdown.OTHER += n(mt.channels[channel].revenue);
    });
    (mt.daily || []).forEach(row => {
      const date = String(row.date || '');
      const rev = n(row.revenue);
      const deductions = n(row.deductions);
      const orders = n(row.orders);
      const d = ensure(dailyData, date);
      const m = ensure(monthlyData, monthKey(date));
      d.rev += rev; d.mtRev += rev; d.deductions += deductions; d.orders += orders;
      m.rev += rev; m.mtRev += rev; m.deductions += deductions; m.orders += orders;
    });
  }

  if (ads && (ads.channels || ads.platforms)) {
    const ch = ads.channels || {};
    const platformRows = ads.platforms || {};
    const channelData = name => ch[name] || platformRows[name] || {};
    const includeAdPlatform = adPlatform => platform === 'All' || adPlatform === platform;
    const channelPlatform = name => {
      const key = String(name || '').toUpperCase();
      if (key.indexOf('TT_') === 0 || key.indexOf('TIKTOK') !== -1) return 'TikTok';
      if (key.indexOf('SHOPEE') !== -1 || key.indexOf('SH_') === 0) return 'Shopee';
      return 'All';
    };
    const ttManager = channelData('TT_ADS_MANAGER'), ttGmv = channelData('TT_ADS_GMV'), ttLive = channelData('TT_ADS_LIVE');
    const shAds = channelData('SHOPEE_ADS'), shLive = channelData('SHOPEE_ADS_LIVE'), shAff = channelData('SHOPEE_AFFILIATE'), ttAff = channelData('TT_AFFILIATE'), meta = channelData('META_ADS');

    if (includeAdPlatform('TikTok')) {
      audit.ads.ttManager = n(ttManager.spend); audit.ads.ttGmv = n(ttGmv.spend); audit.ads.ttLive = n(ttLive.spend);
      audit.deduct.ttAff = n(ttAff.spend);
      audit.adsGmv.ttGmv = n(ttGmv.gmv); audit.adsGmv.ttLive = n(ttLive.gmv);
      audit.adsViews.ttManager = n(ttManager.impressions); audit.adsViews.ttGmv = n(ttGmv.impressions); audit.adsViews.ttLive = n(ttLive.impressions);
      audit.adsMetrics.ttManager = { imp: n(ttManager.impressions), reach: n(ttManager.reach) || n(ttManager.clicks) };
      audit.adsMetrics.ttGmv = { imp: n(ttGmv.impressions), reach: n(ttGmv.reach) || n(ttGmv.clicks) };
      audit.adsMetrics.ttLive = { imp: n(ttLive.impressions), reach: n(ttLive.reach) || n(ttLive.clicks) };
      summary.ads += audit.ads.ttManager + audit.ads.ttGmv + audit.ads.ttLive;
      summary.deductions += audit.deduct.ttAff;
      ttBreakdown.affiliate = n(ttAff.gmv); ttBreakdown.ads = n(ttGmv.gmv); ttBreakdown.adsLive = n(ttLive.gmv);
    }
    if (includeAdPlatform('Shopee')) {
      audit.ads.shAds = n(shAds.spend); audit.ads.shLive = n(shLive.spend);
      audit.deduct.shAff = n(shAff.spend);
      audit.adsGmv.shAds = n(shAds.gmv); audit.adsGmv.shLive = n(shLive.gmv);
      audit.adsViews.shAds = n(shAds.impressions); audit.adsViews.shLive = n(shLive.impressions);
      audit.adsMetrics.shAds = { imp: n(shAds.impressions), reach: n(shAds.reach) || n(shAds.clicks) };
      audit.adsMetrics.shLive = { imp: n(shLive.impressions), reach: n(shLive.reach) || n(shLive.clicks) };
      summary.ads += audit.ads.shAds + audit.ads.shLive;
      summary.deductions += audit.deduct.shAff;
      shBreakdown.ads = n(shAds.gmv) + n(shLive.gmv); shBreakdown.affiliate = n(shAff.gmv);
    }
    if (platform === 'All') {
      audit.ads.meta = n(meta.spend);
      audit.adsViews.meta = n(meta.impressions);
      audit.adsMetrics.meta = { imp: n(meta.impressions), reach: n(meta.reach) || n(meta.clicks) };
      summary.ads += audit.ads.meta;
    }
    (ads.daily || []).forEach(row => {
      const rowChannel = row.channel || row.platform || row.source || row.sourceSheet || row.source_sheet || '';
      const rowPlatform = channelPlatform(rowChannel);
      if (platform !== 'All' && rowPlatform !== platform) return;
      const date = String(row.date || row.day || row.month || '');
      const spend = n(row.spend);
      const d = ensure(dailyData, date);
      const m = ensure(monthlyData, monthKey(date));
      d.ads += spend; m.ads += spend;
    });
  }

  if (manual && manual.daily) {
    (manual.daily || []).forEach(row => {
      const rowPlatform = String(row.platform || 'All');
      if (platform !== 'All' && rowPlatform !== 'All' && rowPlatform !== platform) return;
      const date = String(row.date || '');
      const amount = Math.abs(n(row.amount));
      if (!amount) return;
      const kind = String(row.entryType || '').toUpperCase();
      const applyTo = String(row.applyTo || '').toUpperCase();
      const d = ensure(dailyData, date);
      const m = ensure(monthlyData, monthKey(date));

      if (kind === 'INCOME') {
        summary.revenue += amount;
        summary.manualIncome += amount;
        audit.manual.income += amount;
        d.rev += amount; m.rev += amount;
        if (rowPlatform === 'TikTok') { audit.rev.tt += amount; platformBreakdown.tiktok += amount; d.ttRev += amount; m.ttRev += amount; }
        else if (rowPlatform === 'Shopee') { audit.rev.sh += amount; platformBreakdown.shopee += amount; d.shRev += amount; m.shRev += amount; }
        else if (rowPlatform === 'ModernTrade') { audit.rev.mt += amount; platformBreakdown.modernTrade += amount; d.mtRev += amount; m.mtRev += amount; }
        return;
      }

      summary.manualExpense += amount;
      audit.manual.expense += amount;
      if (applyTo === 'ADS') {
        summary.ads += amount;
        audit.manual.ads += amount;
        d.ads += amount; m.ads += amount;
        if (rowPlatform === 'TikTok') audit.ads.ttManager += amount;
        else if (rowPlatform === 'Shopee') audit.ads.shAds += amount;
        else audit.ads.meta += amount;
      } else if (applyTo === 'COGS') {
        summary.cogs += amount;
        audit.manual.cogs += amount;
      } else {
        summary.deductions += amount;
        audit.manual.deduction += amount;
        d.deductions += amount; m.deductions += amount;
        if (rowPlatform === 'TikTok') audit.deduct.ttFees += amount;
        else if (rowPlatform === 'Shopee') audit.deduct.shFees += amount;
        else if (rowPlatform === 'ModernTrade') audit.deduct.mtGp += amount;
      }
    });
  }

  // COGS จากระบบ (product_costs_meta) — ใช้ถ้ายังไม่มีค่าจาก Manual
  if (productsData && summary.cogs === 0) {
    const systemCogs = (productsData.topProducts || []).reduce((sum, p) => sum + n(p.cost), 0);
    if (systemCogs > 0) {
      summary.cogs = systemCogs;
      audit.cogs = systemCogs;
    }
  }

  summary.profit = summary.revenue - summary.deductions - summary.ads;
  summary.netIncome = summary.profit - summary.cogs;
  summary.cancelRate = summary.totalOrders > 0 ? (summary.cancelOrders / summary.totalOrders) * 100 : 0;
  summary.roas = summary.ads > 0 ? summary.revenue / summary.ads : 0;
  summary.netMargin = summary.revenue > 0 ? (summary.netIncome / summary.revenue) * 100 : 0;
  summary.aov = summary.totalOrders > 0 ? summary.revenue / summary.totalOrders : 0;
  summary.adsRate = summary.revenue > 0 ? (summary.ads / summary.revenue) * 100 : 0;
  const affiliateCost = audit.deduct.ttAff + audit.deduct.shAff;
  const platformFee = audit.deduct.ttFees + audit.deduct.shFees + audit.deduct.mtGp;
  summary.affiliateRate = summary.revenue > 0 ? (affiliateCost / summary.revenue) * 100 : 0;
  summary.platformFeeRate = summary.revenue > 0 ? (platformFee / summary.revenue) * 100 : 0;

  const chartLabels = [], ttRevArr = [], shRevArr = [], mtRevArr = [], chartAds = [];
  Object.keys(monthlyData).filter(k => k !== 'unknown').sort().forEach(k => {
    const d = monthlyData[k], parts = k.split('-');
    chartLabels.push(Number(parts[1]) + '/' + parts[0]);
    ttRevArr.push(d.ttRev); shRevArr.push(d.shRev); mtRevArr.push(d.mtRev); chartAds.push(d.ads);
  });
  const dLabels = [], dTtRev = [], dShRev = [], dMtRev = [], dAds = [], tableRows = [];
  Object.keys(dailyData).filter(k => k !== 'unknown').sort((a, b) => new Date(b) - new Date(a)).forEach(k => {
    const d = dailyData[k];
    tableRows.push({ month: dayLabel(k), rev: d.rev, deductions: d.deductions, ads: d.ads, profit: d.rev - d.deductions - d.ads, orders: d.orders, cancelRate: d.orders > 0 ? (d.cancels / d.orders) * 100 : 0 });
  });
  Object.keys(dailyData).filter(k => k !== 'unknown').sort((a, b) => new Date(a) - new Date(b)).forEach(k => {
    const d = dailyData[k];
    dLabels.push(dayLabel(k).replace(/\/\d{4}$/, ''));
    dTtRev.push(d.ttRev); dShRev.push(d.shRev); dMtRev.push(d.mtRev); dAds.push(d.ads);
  });

  const out = {
    summary, audit,
    charts: { labels: chartLabels, ttRev: ttRevArr, shRev: shRevArr, mtRev: mtRevArr, ads: chartAds },
    dailyCharts: { labels: dLabels, ttRev: dTtRev, shRev: dShRev, mtRev: dMtRev, ads: dAds },
    table: tableRows, mtBreakdown, ttBreakdown, ttAdsBreakdown, shBreakdown, platformBreakdown,
    topProducts: [],
    source: 'Supabase Dashboard Fast',
    cache: { hit: false }
  };
  cachePut(cacheKey, out, 300);
  return out;
}

// ---------- Products (พอร์ตจาก getProductsFastData) ----------
export async function buildProductsFast(startDate, endDate, platformFilter) {
  const platform = String(platformFilter || 'All');
  const cacheKey = ['productsFast', startDate || '', endDate || '', platform].join(':');
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cache: { hit: true, source: 'productsFast' } };

  const [data, costRows, metaRows] = await Promise.all([
    sbRpcOne('get_product_sales', { p_start: startDate || null, p_end: endDate || null, p_platform: platform }),
    getProductCostsMaster(),
    sbRequest('app_settings?key=eq.product_costs_meta&limit=1', 'get').catch(() => [])
  ]);
  if (!data || !data.topProducts) throw new Error('Supabase product summary returned no data');

  const costsMeta = metaRows && metaRows.length ? (metaRows[0].value || {}) : {};
  const costs = {};
  costRows.forEach(r => {
    const name = String(r.productName || r.name || '').trim();
    if (name) costs[name] = { platform: String(r.platform || ''), type: String(r.costType || '%'), val: n(r.costValue) };
  });
  // product_costs_meta (จากหน้า COGS) มีลำดับความสำคัญสูงกว่า
  Object.entries(costsMeta).forEach(([platformName, meta]) => {
    if (meta && meta.costValue !== undefined) {
      costs[platformName] = { platform: meta.platform || '', type: String(meta.costType || '%'), val: n(meta.costValue) };
    }
  });

  const topProducts = (data.topProducts || []).map(p => {
    const rev = n(p.rev || p.revenue);
    const orders = n(p.orders);
    const c = costs[p.name] || null;
    let cost = 0;
    if (c && c.val > 0) cost = (c.type === '%' || String(c.type).toUpperCase() === 'PERCENT') ? rev * (c.val / 100) : c.val * orders;
    const profit = rev - cost;
    return { name: p.name, platform: p.platform || '', rev, orders, cost, profit, margin: rev > 0 ? (profit / rev) * 100 : 0 };
  });

  const out = {
    summary: {
      revenue: n(data.summary?.revenue),
      totalOrders: n(data.summary?.totalOrders),
      productCount: n(data.summary?.productCount) || topProducts.length
    },
    topProducts,
    source: 'Supabase Products Fast',
    cache: { hit: false }
  };
  cachePut(cacheKey, out, 300);
  return out;
}

// ---------- Ads detail (พอร์ตจาก getAdsDetailFastData) ----------
export async function buildAdsDetail(startDate, endDate) {
  const fastAds = await getFastAdsAudit(startDate, endDate);
  if (!fastAds || !(fastAds.channels || fastAds.platforms)) {
    throw new Error('Supabase ads audit returned no data');
  }
  const ch = fastAds.channels || {};
  const c = name => ch[name] || (fastAds.platforms || {})[name] || {};
  const ttManager = c('TT_ADS_MANAGER'), ttGmv = c('TT_ADS_GMV'), ttLive = c('TT_ADS_LIVE');
  const shAds = c('SHOPEE_ADS'), shLive = c('SHOPEE_ADS_LIVE'), meta = c('META_ADS');
  const totalSpend = n(ttManager.spend) + n(ttGmv.spend) + n(ttLive.spend) + n(shAds.spend) + n(shLive.spend) + n(meta.spend);
  const totalGmv = n(ttGmv.gmv) + n(ttLive.gmv) + n(shAds.gmv) + n(shLive.gmv);
  const totalViews = n(ttManager.impressions) + n(ttGmv.impressions) + n(ttLive.impressions) + n(shAds.impressions) + n(shLive.impressions) + n(meta.impressions);
  return {
    summary: { ads: totalSpend, roas: totalSpend ? totalGmv / totalSpend : 0, views: totalViews },
    audit: {
      ads: { ttManager: n(ttManager.spend), ttGmv: n(ttGmv.spend), ttLive: n(ttLive.spend), shAds: n(shAds.spend), shLive: n(shLive.spend), meta: n(meta.spend) },
      adsGmv: { ttGmv: n(ttGmv.gmv), ttLive: n(ttLive.gmv), shAds: n(shAds.gmv), shLive: n(shLive.gmv) },
      adsMetrics: {
        ttManager: { imp: n(ttManager.impressions), reach: n(ttManager.reach) || n(ttManager.clicks) },
        ttGmv: { imp: n(ttGmv.impressions), reach: n(ttGmv.reach) || n(ttGmv.clicks) },
        ttLive: { imp: n(ttLive.impressions), reach: n(ttLive.reach) || n(ttLive.clicks) },
        shAds: { imp: n(shAds.impressions), reach: n(shAds.reach) || n(shAds.clicks) },
        shLive: { imp: n(shLive.impressions), reach: n(shLive.reach) || n(shLive.clicks) },
        meta: { imp: n(meta.impressions), reach: n(meta.reach) || n(meta.clicks) }
      }
    },
    daily: fastAds.daily || [],
    source: 'Supabase RPC'
  };
}

// ---------- Deep audit (พอร์ตจากส่วน fast ของ getPlatformDeepAuditData) ----------
export async function buildDeepAudit(startDate, endDate, platformFilter) {
  const selectedPlatform = String(platformFilter || 'All').trim();
  const wantsTikTok = selectedPlatform === 'All' || selectedPlatform.toLowerCase() === 'tiktok';
  const wantsShopee = selectedPlatform === 'All' || selectedPlatform.toLowerCase() === 'shopee';
  const [fastTt, fastSh] = await Promise.all([
    wantsTikTok ? getFastTikTokGmvAudit(startDate, endDate) : null,
    wantsShopee ? getFastShopeeAudit(startDate, endDate) : null
  ]);
  const fastAds = (fastTt || fastSh) ? await getFastAdsAudit(startDate, endDate) : null;
  if (!fastTt && !fastSh) throw new Error('Supabase deep audit returned no data');

  const platforms = [];
  if (fastTt) {
    const a = fastTt.analytics || {}, s = fastTt.sales || {}, v = fastTt.variance || {};
    const ads = fastAds?.platforms?.TikTok || {};
    const revenue = n(a.gmv), adsCost = n(ads.spend), adsGmv = n(ads.gmv);
    platforms.push({
      key: 'TikTok', label: 'TikTok Shop', color: '#111827',
      revenue, orders: n(s.orders || a.orders), deductions: 0, platformFee: 0, affiliateCost: 0, adsCost,
      grossProfit: revenue - adsCost,
      roas: adsCost ? adsGmv / adsCost : 0,
      netMargin: revenue ? ((revenue - adsCost) / revenue) * 100 : 0,
      gmvAudit: fastTt,
      variance: v,
      sources: [
        { label: 'TikTok Analytics GMV', value: n(a.gmv), pct: 100, note: 'GMV จาก TT_Analytics ใน Supabase' },
        { label: 'TikTok Sale Order GMV', value: n(s.gmv), pct: revenue ? (n(s.gmv) / revenue) * 100 : 0, note: 'ยอดรวมจาก TT_Sales ใน Supabase' },
        { label: 'Variance', value: n(v.amount), pct: revenue ? (n(v.amount) / revenue) * 100 : 0, note: 'ส่วนต่างระหว่าง Analytics GMV กับ Sale Order' }
      ],
      layers: [
        { name: 'Analytics / Sales View', sheet: 'TT_Analytics', rows: n(a.rows), status: n(a.rows) ? 'READY' : 'MISSING', purpose: 'ยอด GMV รายวันจาก TikTok Shop Analytics' },
        { name: 'Order Detail', sheet: 'TT_Sales', rows: n(s.rows), status: n(s.rows) ? 'READY' : 'MISSING', purpose: 'รายการคำสั่งซื้อจริงสำหรับเทียบ GMV และจำนวนออเดอร์' },
        { name: 'Settlement / Finance', sheet: 'TT_Settlement', rows: 0, status: 'PENDING', purpose: 'ค่าธรรมเนียมจริง เงินโอน Refund Adjustment และ Ads TT' }
      ]
    });
  }
  if (fastSh) {
    const o = fastSh.orders || {}, st = fastSh.settlement || {}, v = fastSh.variance || {};
    const ads = fastAds?.platforms?.Shopee || {};
    const revenue = n(o.gmv), fee = n(st.platformFee), adsCost = n(ads.spend), adsGmv = n(ads.gmv);
    platforms.push({
      key: 'Shopee', label: 'Shopee', color: '#f4511e',
      revenue, orders: n(o.orders), deductions: fee, platformFee: fee, affiliateCost: 0, adsCost,
      grossProfit: revenue - fee - adsCost,
      roas: adsCost ? adsGmv / adsCost : 0,
      netMargin: revenue ? ((revenue - fee - adsCost) / revenue) * 100 : 0,
      gmvAudit: fastSh,
      variance: v,
      sources: [
        { label: 'Shopee Orders GMV', value: n(o.gmv), pct: 100, note: 'ยอดขายจาก Shopee_Orders ใน Supabase' },
        { label: 'Shopee Settlement', value: n(st.netSettlement), pct: revenue ? (n(st.netSettlement) / revenue) * 100 : 0, note: 'ยอดโอนจริงจาก Shopee_Settlement' },
        { label: 'Platform Fee', value: fee, pct: revenue ? (fee / revenue) * 100 : 0, note: 'ค่าธรรมเนียมจาก Settlement' }
      ],
      layers: [
        { name: 'Order Detail', sheet: 'Shopee_Orders', rows: n(o.rows), status: n(o.rows) ? 'READY' : 'MISSING', purpose: 'รายการคำสั่งซื้อจริง' },
        { name: 'Settlement / Finance', sheet: 'Shopee_Settlement', rows: n(st.rows), status: n(st.rows) ? 'READY' : 'MISSING', purpose: 'ยอดโอนและค่าธรรมเนียมจริง' }
      ]
    });
  }
  return { platforms, source: 'Supabase RPC', cache: { hit: false } };
}

// ---------- Profit builders (พอร์ตจาก buildProfitByPlatformRows_ / getProfitByProduct) ----------
export function buildProfitByPlatformRows(data) {
  const a = data.audit || {};
  const deduct = a.deduct || {};
  const ads = a.ads || {};
  const p = data.platformBreakdown || {};
  const summary = data.summary || {};
  const totalRev = n(summary.revenue);
  const allocatedCogs = rev => (totalRev > 0 ? n(summary.cogs) * (rev / totalRev) : 0);
  const rows = [
    { platform: 'TikTok', revenue: n(p.tiktok), deductions: n(deduct.ttFees) + n(deduct.ttAff), ads: n(ads.ttManager) + n(ads.ttGmv) + n(ads.ttLive) },
    { platform: 'Shopee', revenue: n(p.shopee), deductions: n(deduct.shFees) + n(deduct.shAff), ads: n(ads.shAds) + n(ads.shLive) },
    { platform: 'ModernTrade', revenue: n(p.modernTrade), deductions: n(deduct.mtGp), ads: 0 }
  ];
  return rows.map(r => {
    const cogs = allocatedCogs(r.revenue);
    const net = r.revenue - r.deductions - r.ads - cogs;
    return { ...r, cogs, netIncome: net, margin: r.revenue > 0 ? (net / r.revenue) * 100 : 0 };
  });
}
