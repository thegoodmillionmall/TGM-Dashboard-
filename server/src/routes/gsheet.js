import { Router } from 'express';
import Papa from 'papaparse';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const toNum = v => {
  if (v == null) return 0;
  return parseFloat(String(v).replace(/,/g, '').trim()) || 0;
};

// GET /api/gsheet/overview — อ่าน Dashboard tab จาก Google Sheet แล้วส่งกลับ monthly + daily
router.get('/overview', async (req, res) => {
  try {
    const pubId = process.env.GSHEET_PUBLISHED_ID;
    const sheetId = process.env.GSHEET_DAILY_ID;
    const sheet = 'Dashboard';

    const url = pubId
      ? `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv&sheet=${encodeURIComponent(sheet)}`
      : `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

    const r = await fetch(url, { headers: { 'User-Agent': 'TGM-Server/1.0' } });
    if (!r.ok) return res.status(502).json({ error: `ดึงข้อมูล Google Sheet ไม่ได้ (HTTP ${r.status})` });

    const csv = await r.text();
    if (csv.includes('<!DOCTYPE') || csv.includes('accounts.google.com')) {
      return res.status(502).json({ error: 'กรุณา Publish ชีท Dashboard ก่อน (File → Share → Publish to web → ชีท Dashboard → CSV)' });
    }

    const { data: rows } = Papa.parse(csv.replace(/^﻿/, ''), { skipEmptyLines: false });

    // หาแถว header รายเดือน (col A = "เดือน")
    let mHdrRow = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.[0]?.trim() === 'เดือน') { mHdrRow = i; break; }
    }

    // หา col ของ "วันที่" (ส่วนรายวัน อยู่ทางขวา col J+)
    let dHdrRow = -1, dHdrCol = -1;
    outer: for (let i = 0; i < Math.min(rows.length, 12); i++) {
      for (let j = 5; j < (rows[i]?.length ?? 0); j++) {
        if (rows[i][j]?.trim() === 'วันที่') { dHdrRow = i; dHdrCol = j; break outer; }
      }
    }

    // Parse ข้อมูลรายเดือน
    // A=เดือน | B=Shopee | C=TikTok | D=รวม | E=Shopee Ads | F=TikTok Ads | G=รวม Ads | H=ROI
    const monthly = [];
    if (mHdrRow >= 0) {
      for (let i = mHdrRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const month = row[0]?.trim() ?? '';
        if (!month || month.startsWith('*') || month.startsWith('หมาย') || !month.match(/\d{4}/)) break;
        monthly.push({
          month,
          shopee:    toNum(row[1]),
          tiktok:    toNum(row[2]),
          total:     toNum(row[3]),
          shopeeAds: toNum(row[4]),
          tiktokAds: toNum(row[5]),
          totalAds:  toNum(row[6]),
          roi:       toNum(row[7]),
        });
      }
    }

    // Parse ข้อมูลรายวัน
    // offset: +0=วันที่ | +1=Shopee | +2=TikTok | +3=รวม | +4=ShopeeAds | +5=TikTokAds | +6=ROI
    const daily = [];
    if (dHdrCol >= 0 && dHdrRow >= 0) {
      for (let i = dHdrRow + 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const date = row[dHdrCol]?.trim() ?? '';
        if (!date || date === '' || date === '0' || date === '0.00') continue;
        const shopee = toNum(row[dHdrCol + 1]);
        const tiktok = toNum(row[dHdrCol + 2]);
        const total  = toNum(row[dHdrCol + 3]);
        if (total === 0 && shopee === 0 && tiktok === 0) continue; // ข้ามวันที่ยังไม่มีข้อมูล
        daily.push({
          date,
          shopee,
          tiktok,
          total,
          shopeeAds: toNum(row[dHdrCol + 4]),
          tiktokAds: toNum(row[dHdrCol + 5]),
          totalAds: toNum(row[dHdrCol + 4]) + toNum(row[dHdrCol + 5]),
          roi: toNum(row[dHdrCol + 6]),
        });
      }
    }

    // คำนวณ totals รวมทั้งหมด
    const totals = monthly.reduce(
      (acc, m) => ({
        shopee:    acc.shopee    + m.shopee,
        tiktok:    acc.tiktok   + m.tiktok,
        total:     acc.total    + m.total,
        shopeeAds: acc.shopeeAds + m.shopeeAds,
        tiktokAds: acc.tiktokAds + m.tiktokAds,
        totalAds:  acc.totalAds  + m.totalAds,
      }),
      { shopee: 0, tiktok: 0, total: 0, shopeeAds: 0, tiktokAds: 0, totalAds: 0 }
    );
    totals.roi = totals.totalAds > 0 ? +(totals.total / totals.totalAds).toFixed(2) : 0;

    res.json({ ok: true, monthly, daily, totals, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
