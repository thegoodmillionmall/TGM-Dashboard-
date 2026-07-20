import { Router } from 'express';
import Papa from 'papaparse';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const cacheFile = path.resolve(process.cwd(), '.cache', 'gsheet-overview.json');
const CACHE_SCHEMA = 'detail-tabs-v2';

const clean = value => String(value ?? '').replace(/\uFEFF/g, '').trim();
const norm = value => clean(value).replace(/\s+/g, ' ').toLowerCase();
const toNum = value => {
  if (value == null) return 0;
  const text = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  return parseFloat(text) || 0;
};

async function fetchFirstCsv(urls) {
  const errors = [];
  for (const url of urls.filter(Boolean)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'TGM-Server/1.0' } });
      if (!r.ok) {
        errors.push(`HTTP ${r.status}`);
        continue;
      }
      const csv = await r.text();
      if (csv.includes('<!DOCTYPE') || csv.includes('accounts.google.com')) {
        errors.push('ต้อง Publish หรือเปิดสิทธิ์อ่านชีต');
        continue;
      }
      return csv;
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join(' | ') || 'ไม่สามารถดึงข้อมูล Google Sheet ได้');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
  } catch {}
}

function parseCsvRows(csv) {
  return Papa.parse(csv.replace(/^\uFEFF/, ''), { skipEmptyLines: false }).data;
}

function flattenTabbedRow(row) {
  return (row || []).flatMap(cell => String(cell ?? '').split('\t')).map(clean);
}

function makeSheetUrls(sheet, pubId, sheetId) {
  const bust = Date.now();
  return [
    sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&_=${bust}` : '',
    pubId ? `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&sheet=${encodeURIComponent(sheet)}&_=${bust}` : ''
  ];
}

async function fetchSheetRows(sheet, pubId, sheetId) {
  const urls = makeSheetUrls(sheet, pubId, sheetId);
  const csv = await fetchFirstCsv(urls);
  return parseCsvRows(csv);
}

function isValidOverviewCache(cached) {
  if (!cached || cached.schemaVersion !== CACHE_SCHEMA || cached.source !== 'Google Sheet detail tabs only') return false;
  return !((cached.daily || []).some(row => Number(row.facebook || 0) < 0 || Number(row.total || 0) < -0.01));
}

function findHeaderCell(rows, label, minCol = 0, maxRows = rows.length) {
  const target = norm(label);
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    for (let j = minCol; j < (rows[i]?.length ?? 0); j++) {
      if (norm(rows[i][j]) === target) return { row: i, col: j };
    }
  }
  return { row: -1, col: -1 };
}

function findCol(header, matchers, options = {}) {
  const { from = 0, after = -1 } = options;
  const tests = Array.isArray(matchers) ? matchers : [matchers];
  for (let i = Math.max(from, after + 1); i < header.length; i++) {
    const value = norm(header[i]);
    if (tests.some(test => typeof test === 'function' ? test(value, i) : value.includes(norm(test)))) return i;
  }
  return -1;
}

const get = (row, index) => index >= 0 ? row[index] : undefined;

const toIsoDate = value => {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return text;
};

function nextIsoDate(value) {
  const base = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + 1);
  return isoDate(base);
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaily(map, date, patch) {
  const key = toIsoDate(date);
  if (!key || key === '0' || key === '0.00') return;
  const row = map.get(key) || {
    date: key,
    shopee: 0,
    tiktok: 0,
    facebook: 0,
    total: 0,
    shopeeAds: 0,
    tiktokAds: 0,
    metaAds: 0,
    totalAds: 0,
    tiktokOrders: 0,
    shopeeOrders: 0,
    orders: 0
  };
  Object.entries(patch).forEach(([field, value]) => {
    if (!field) return;
    row[field] = Number(row[field] || 0) + Number(value || 0);
  });
  map.set(key, row);
}

function parseDetailDaily(tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows, facebookAdsRows) {
  const dailyMap = new Map();

  const parseSimple = (rows, config) => {
    if (!rows?.length) return;
    const header = rows[0] || [];
    const colDate = findCol(header, config.date || 'วันที่');
    const colValue = findCol(header, config.value);
    const colOrders = config.orders ? findCol(header, config.orders) : -1;
    if (colDate < 0 || colValue < 0) return;
    rows.slice(1).forEach(row => {
      const value = toNum(get(row, colValue));
      const orders = toNum(get(row, colOrders));
      if (!value && !orders) return;
      addDaily(dailyMap, get(row, colDate), { [config.target]: value, ...(config.orderTarget ? { [config.orderTarget]: orders } : {}) });
    });
  };

  parseSimple(tiktokRows, {
    value: value => value === 'gmv',
    orders: value => value === 'คำสั่งซื้อ',
    target: 'tiktok',
    orderTarget: 'tiktokOrders'
  });
  parseSimple(shopeeRows, {
    value: value => value.includes('ยอดขายทั้งหมด'),
    orders: value => value.includes('คำสั่งซื้อทั้งหมด'),
    target: 'shopee',
    orderTarget: 'shopeeOrders'
  });
  if (tiktokAdsRows?.length) {
    let cursorDate = '';
    let skippedSpacerRow = false;
    tiktokAdsRows.forEach(row => {
      const rawDate = clean(get(row, 0)).replace(/^D1(?=\d{4}-\d{2}-\d{2}$)/, '');
      const spend = toNum(get(row, 1)) + toNum(get(row, 5)) + toNum(get(row, 6));
      const gmv = toNum(get(row, 2));
      let date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
      if (!date && cursorDate) {
        if (!skippedSpacerRow && !spend && !gmv) {
          skippedSpacerRow = true;
          return;
        }
        date = nextIsoDate(cursorDate);
      }
      if (date) cursorDate = date;
      if (date && spend) addDaily(dailyMap, date, { tiktokAds: spend });
    });
  }

  if (facebookAdsRows?.length) {
    facebookAdsRows.slice(1).forEach(row => {
      addDaily(dailyMap, get(row, 0), { metaAds: toNum(get(row, 3)) });
    });
  }

  if (shopeeAdsRows?.length) {
    shopeeAdsRows.forEach(rawRow => {
      addDaily(dailyMap, get(rawRow, 0), { shopeeAds: toNum(get(rawRow, 3)) });
      addDaily(dailyMap, get(rawRow, 9), { shopeeAds: toNum(get(rawRow, 12)) });
    });
  }

  return Array.from(dailyMap.values())
    .map(row => {
      const total = row.shopee + row.tiktok + row.facebook;
      const totalAds = row.shopeeAds + row.tiktokAds + row.metaAds;
      const orders = row.tiktokOrders + row.shopeeOrders;
      return {
        ...row,
        total,
        totalAds,
        orders,
        roi: totalAds > 0 ? +(total / totalAds).toFixed(2) : 0
      };
    })
    .filter(row => row.total || row.totalAds || row.orders)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function monthKeyFromThaiLabel(label) {
  const text = clean(label);
  const months = {
    มกราคม: '01', กุมภาพันธ์: '02', มีนาคม: '03', เมษายน: '04',
    พฤษภาคม: '05', มิถุนายน: '06', กรกฎาคม: '07', สิงหาคม: '08',
    กันยายน: '09', ตุลาคม: '10', พฤศจิกายน: '11', ธันวาคม: '12'
  };
  const hit = text.match(/^(.+?)\s+(\d{4})$/);
  const mm = hit ? months[clean(hit[1])] : '';
  return hit && mm ? `${hit[2]}-${mm}` : '';
}

function reconcileDailyWithMonthly(daily, monthly) {
  const monthlyMap = new Map((monthly || []).map(row => [monthKeyFromThaiLabel(row.month), row]).filter(([key]) => key));
  const byMonth = new Map();
  daily.forEach(row => {
    const key = String(row.date || '').slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  });

  byMonth.forEach((rows, key) => {
    const m = monthlyMap.get(key);
    if (!m || !rows.length) return;
    const last = rows[rows.length - 1];
    const revenueDiff = Number(m.total || 0) - rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const adsDiff = Number(m.totalAds || 0) - rows.reduce((sum, row) => sum + Number(row.totalAds || 0), 0);
    if (Math.abs(revenueDiff) > 0.01) {
      last.facebook = Number(last.facebook || 0) + revenueDiff;
      last.total = Number(last.total || 0) + revenueDiff;
    }
    if (Math.abs(adsDiff) > 0.01) {
      last.metaAds = Number(last.metaAds || 0) + adsDiff;
      last.totalAds = Number(last.totalAds || 0) + adsDiff;
    }
    last.roi = last.totalAds > 0 ? +(last.total / last.totalAds).toFixed(2) : 0;
  });

  return daily;
}

function parseDashboardFixedRows(rows) {
  const monthly = [];
  const daily = [];

  for (const row of rows || []) {
    const month = clean(row?.[0]);
    if (month && /\d{4}/.test(month)) {
      monthly.push({
        month,
        shopee: toNum(row[1]),
        tiktok: toNum(row[2]),
        facebook: toNum(row[3]),
        total: toNum(row[4]) || toNum(row[1]) + toNum(row[2]) + toNum(row[3]),
        shopeeAds: toNum(row[5]),
        tiktokAds: toNum(row[6]),
        metaAds: toNum(row[7]),
        totalAds: toNum(row[8]) || toNum(row[5]) + toNum(row[6]) + toNum(row[7]),
        roi: toNum(row[9])
      });
    }

    const date = clean(row?.[11]);
    if (date && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(date)) {
      const shopee = toNum(row[12]);
      const tiktok = toNum(row[13]);
      const total = toNum(row[14]) || shopee + tiktok;
      const shopeeAds = toNum(row[15]);
      const tiktokAds = toNum(row[16]);
      const metaAds = toNum(row[17]);
      if (total || shopeeAds || tiktokAds || metaAds) {
        daily.push({
          date: toIsoDate(date),
          shopee,
          tiktok,
          facebook: 0,
          total,
          shopeeAds,
          tiktokAds,
          metaAds,
          totalAds: shopeeAds + tiktokAds + metaAds,
          roi: toNum(row[18])
        });
      }
    }
  }

  return { monthly, daily };
}

function thaiMonthLabel(monthKey) {
  const names = {
    '01': 'มกราคม', '02': 'กุมภาพันธ์', '03': 'มีนาคม', '04': 'เมษายน',
    '05': 'พฤษภาคม', '06': 'มิถุนายน', '07': 'กรกฎาคม', '08': 'สิงหาคม',
    '09': 'กันยายน', '10': 'ตุลาคม', '11': 'พฤศจิกายน', '12': 'ธันวาคม'
  };
  const [year, month] = String(monthKey || '').split('-');
  return `${names[month] || month} ${year}`;
}

function buildMonthlyFromDaily(daily) {
  const byMonth = new Map();
  for (const row of daily || []) {
    const key = String(row.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const m = byMonth.get(key) || {
      month: thaiMonthLabel(key),
      shopee: 0,
      tiktok: 0,
      facebook: 0,
      total: 0,
      shopeeAds: 0,
      tiktokAds: 0,
      metaAds: 0,
      totalAds: 0,
      roi: 0
    };
    m.shopee += Number(row.shopee || 0);
    m.tiktok += Number(row.tiktok || 0);
    m.facebook += Number(row.facebook || 0);
    m.total += Number(row.total || 0);
    m.shopeeAds += Number(row.shopeeAds || 0);
    m.tiktokAds += Number(row.tiktokAds || 0);
    m.metaAds += Number(row.metaAds || 0);
    m.totalAds += Number(row.totalAds || 0);
    m.roi = m.totalAds > 0 ? +(m.total / m.totalAds).toFixed(2) : 0;
    byMonth.set(key, m);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, row]) => row);
}

// GET /api/gsheet/overview - read Dashboard tab from Google Sheet as monthly + daily rows.
router.get('/overview', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  try {
    const pubId = process.env.GSHEET_PUBLISHED_ID;
    const sheetId = process.env.GSHEET_DAILY_ID;
    const sheet = 'Dashboard';

    const csv = await fetchFirstCsv(makeSheetUrls(sheet, pubId, sheetId));
    const rows = parseCsvRows(csv);

    const { row: mHdrRow } = findHeaderCell(rows, 'เดือน', 0);
    let monthly = [];
    if (mHdrRow >= 0) {
      const header = rows[mHdrRow] ?? [];
      const colMonth = findCol(header, 'เดือน');
      const colShopee = findCol(header, value => value.includes('ยอดขาย') && value.includes('shopee'));
      const colTiktok = findCol(header, value => value.includes('ยอดขาย') && (value.includes('tiktok') || value.includes('tik tok')));
      const colFacebook = findCol(header, value => value.includes('ยอดขาย') && value.includes('facebook'));
      const colTotal = findCol(header, value => value.includes('ยอดขายรวม'));
      const colShopeeAds = findCol(header, value => value.includes('ค่าโฆษณา') && value.includes('shopee'));
      const colTiktokAds = findCol(header, value => value.includes('ค่าโฆษณา') && (value.includes('tiktok') || value.includes('tik tok')));
      const colMetaAds = findCol(header, value => value.includes('meta') || value.includes('facebook ads'));
      const colTotalAds = findCol(header, value => value.includes('ค่าโฆษณารวม'));
      const colRoi = findCol(header, 'roi');

      for (let i = mHdrRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const month = clean(get(row, colMonth >= 0 ? colMonth : 0));
        if (!month || month.startsWith('*') || month.startsWith('หมาย') || !/\d{4}/.test(month)) break;

        const shopee = toNum(get(row, colShopee));
        const tiktok = toNum(get(row, colTiktok));
        const facebook = toNum(get(row, colFacebook));
        const shopeeAds = toNum(get(row, colShopeeAds));
        const tiktokAds = toNum(get(row, colTiktokAds));
        const metaAds = toNum(get(row, colMetaAds));
        const computedTotal = shopee + tiktok + facebook;
        const computedAds = shopeeAds + tiktokAds + metaAds;

        monthly.push({
          month,
          shopee,
          tiktok,
          facebook,
          total: toNum(get(row, colTotal)) || computedTotal,
          shopeeAds,
          tiktokAds,
          metaAds,
          totalAds: toNum(get(row, colTotalAds)) || computedAds,
          roi: toNum(get(row, colRoi))
        });
      }
    }

    const { row: dHdrRow, col: dHdrCol } = findHeaderCell(rows, 'วันที่', 5, 12);
    let dashboardDaily = [];
    if (dHdrCol >= 0 && dHdrRow >= 0) {
      const header = rows[dHdrRow] ?? [];
      const colDate = dHdrCol;
      const colShopee = findCol(header, value => value.includes('ยอดขาย') && value.includes('shopee'), { from: dHdrCol });
      const colTiktok = findCol(header, value => value.includes('ยอดขาย') && (value.includes('tiktok') || value.includes('tik tok')), { from: dHdrCol });
      const colFacebook = findCol(header, value => value.includes('facebook'), { from: dHdrCol });
      const colTotal = findCol(header, value => value.includes('ยอดขายรวม'), { from: dHdrCol });
      const colShopeeAds = findCol(header, value => value.includes('ค่าโฆษณา') && value.includes('shopee'), { from: dHdrCol });
      const colTiktokAds = findCol(header, value => (value === 'tiktok' || value.includes('ค่าโฆษณา tiktok')), { after: colShopeeAds });
      const colMetaAds = findCol(header, value => value.includes('facebook') || value.includes('meta'), { after: colTiktokAds });
      const colRoi = findCol(header, 'roi', { from: dHdrCol });

      for (let i = dHdrRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const date = clean(get(row, colDate));
        if (!date || date === '0' || date === '0.00') continue;

        const shopee = toNum(get(row, colShopee));
        const tiktok = toNum(get(row, colTiktok));
        const facebook = toNum(get(row, colFacebook));
        const total = toNum(get(row, colTotal)) || shopee + tiktok + facebook;
        if (total === 0 && shopee === 0 && tiktok === 0 && facebook === 0) continue;

        const shopeeAds = toNum(get(row, colShopeeAds));
        const tiktokAds = toNum(get(row, colTiktokAds));
        const metaAds = toNum(get(row, colMetaAds));
        dashboardDaily.push({
          date,
          shopee,
          tiktok,
          facebook,
          total,
          shopeeAds,
          tiktokAds,
          metaAds,
          totalAds: shopeeAds + tiktokAds + metaAds,
          roi: toNum(get(row, colRoi))
        });
      }
    }

    const fixedDashboard = parseDashboardFixedRows(rows);
    if (!monthly.length && fixedDashboard.monthly.length) monthly = fixedDashboard.monthly;
    if (!dashboardDaily.length && fixedDashboard.daily.length) dashboardDaily = fixedDashboard.daily;

    const [tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows, facebookAdsRows] = await Promise.all([
      fetchSheetRows('Tiktok', pubId, sheetId),
      fetchSheetRows('Shopee', pubId, sheetId),
      fetchSheetRows('Tiktok Ads (รายวัน)', pubId, sheetId),
      fetchSheetRows('Shopee Ads (รายวัน)', pubId, sheetId),
      fetchSheetRows('Facebook Ads (รายวัน)', pubId, sheetId)
    ]);
    const daily = parseDetailDaily(tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows, facebookAdsRows);
    if (!daily.length) throw new Error('ไม่พบข้อมูลรายวันจากชีทย่อย');
    monthly = buildMonthlyFromDaily(daily);

    const totals = monthly.reduce(
      (acc, m) => ({
        shopee: acc.shopee + m.shopee,
        tiktok: acc.tiktok + m.tiktok,
        facebook: acc.facebook + m.facebook,
        total: acc.total + m.total,
        shopeeAds: acc.shopeeAds + m.shopeeAds,
        tiktokAds: acc.tiktokAds + m.tiktokAds,
        metaAds: acc.metaAds + m.metaAds,
        totalAds: acc.totalAds + m.totalAds
      }),
      { shopee: 0, tiktok: 0, facebook: 0, total: 0, shopeeAds: 0, tiktokAds: 0, metaAds: 0, totalAds: 0 }
    );
    totals.roi = totals.totalAds > 0 ? +(totals.total / totals.totalAds).toFixed(2) : 0;

    const payload = { ok: true, schemaVersion: CACHE_SCHEMA, monthly, daily, totals, fetchedAt: new Date().toISOString(), source: 'Google Sheet detail tabs only' };
    writeCache(payload);
    res.json(payload);
  } catch (err) {
    const cached = readCache();
    if (isValidOverviewCache(cached)) {
      return res.json({ ...cached, stale: true, warning: `ใช้ข้อมูล cache ล่าสุด เพราะดึง Google Sheet ไม่ได้: ${err.message}` });
    }
    res.status(502).json({ error: `ดึงข้อมูล Google Sheet ไม่ได้ (${err.message})` });
  }
});

export default router;
