import { Router } from 'express';
import Papa from 'papaparse';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const cacheFile = path.resolve(process.cwd(), '.cache', 'gsheet-overview.json');

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
  return [
    pubId ? `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&sheet=${encodeURIComponent(sheet)}` : '',
    sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}` : ''
  ];
}

async function fetchSheetRows(sheet, pubId, sheetId) {
  const urls = [
    sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}` : '',
    pubId ? `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&sheet=${encodeURIComponent(sheet)}` : ''
  ];
  const csv = await fetchFirstCsv(urls);
  return parseCsvRows(csv);
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

function parseDetailDaily(tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows) {
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
  parseSimple(tiktokAdsRows, {
    value: value => value.includes('ค่าโฆษณา') && value.includes('tiktok'),
    target: 'tiktokAds'
  });

  if (shopeeAdsRows?.length) {
    const header = flattenTabbedRow(shopeeAdsRows[0]);
    const colAdsDate = findCol(header, value => value.includes('shopee ads date'));
    const colAdsSpend = findCol(header, value => value === 'spend', { after: colAdsDate });
    const colLiveDate = findCol(header, value => value.includes('shopee live ads date'));
    const colLiveSpend = findCol(header, value => value === 'spend', { after: colLiveDate });
    shopeeAdsRows.slice(1).forEach(rawRow => {
      const row = flattenTabbedRow(rawRow);
      addDaily(dailyMap, get(row, colAdsDate), { shopeeAds: toNum(get(row, colAdsSpend)) });
      addDaily(dailyMap, get(row, colLiveDate), { shopeeAds: toNum(get(row, colLiveSpend)) });
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

// GET /api/gsheet/overview - read Dashboard tab from Google Sheet as monthly + daily rows.
router.get('/overview', async (req, res) => {
  try {
    const pubId = process.env.GSHEET_PUBLISHED_ID;
    const sheetId = process.env.GSHEET_DAILY_ID;
    const sheet = 'Dashboard';

    const csv = await fetchFirstCsv(makeSheetUrls(sheet, pubId, sheetId));
    const rows = parseCsvRows(csv);

    const { row: mHdrRow } = findHeaderCell(rows, 'เดือน', 0);
    const monthly = [];
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
      const colTotal = findCol(header, value => value.includes('ยอดขายรวม'), { from: dHdrCol });
      const colShopeeAds = findCol(header, value => value.includes('ค่าโฆษณา') && value.includes('shopee'), { from: dHdrCol });
      const colTiktokAds = findCol(header, value => (value === 'tiktok' || value.includes('ค่าโฆษณา tiktok')), { after: colShopeeAds });
      const colRoi = findCol(header, 'roi', { from: dHdrCol });

      for (let i = dHdrRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const date = clean(get(row, colDate));
        if (!date || date === '0' || date === '0.00') continue;

        const shopee = toNum(get(row, colShopee));
        const tiktok = toNum(get(row, colTiktok));
        const total = toNum(get(row, colTotal)) || shopee + tiktok;
        if (total === 0 && shopee === 0 && tiktok === 0) continue;

        const shopeeAds = toNum(get(row, colShopeeAds));
        const tiktokAds = toNum(get(row, colTiktokAds));
        dashboardDaily.push({
          date,
          shopee,
          tiktok,
          facebook: 0,
          total,
          shopeeAds,
          tiktokAds,
          metaAds: 0,
          totalAds: shopeeAds + tiktokAds,
          roi: toNum(get(row, colRoi))
        });
      }
    }

    let daily = dashboardDaily;
    try {
      const [tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows] = await Promise.all([
        fetchSheetRows('Tiktok', pubId, sheetId),
        fetchSheetRows('Shopee', pubId, sheetId),
        fetchSheetRows('Tiktok Ads (รายวัน)', pubId, sheetId),
        fetchSheetRows('Shopee Ads (รายวัน)', pubId, sheetId)
      ]);
      const detailDaily = parseDetailDaily(tiktokRows, shopeeRows, tiktokAdsRows, shopeeAdsRows);
      if (detailDaily.length) daily = reconcileDailyWithMonthly(detailDaily, monthly);
    } catch (err) {
      // Keep Dashboard daily if a detail tab is not published yet.
      daily = dashboardDaily;
    }

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

    const payload = { ok: true, monthly, daily, totals, fetchedAt: new Date().toISOString(), source: 'Google Sheet Dashboard + detail daily tabs' };
    writeCache(payload);
    res.json(payload);
  } catch (err) {
    const cached = readCache();
    if (cached) {
      return res.json({ ...cached, stale: true, warning: `ใช้ข้อมูล cache ล่าสุด เพราะดึง Google Sheet ไม่ได้: ${err.message}` });
    }
    res.status(502).json({ error: `ดึงข้อมูล Google Sheet ไม่ได้ (${err.message})` });
  }
});

export default router;
