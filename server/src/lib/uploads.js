import { v4 as uuidv4 } from 'uuid';
import { sbInsertRows, sbRpc, sbRequest, sbDelete } from '../supabase.js';
import { cacheClear } from '../cache.js';

// config แพลตฟอร์ม (พอร์ตจาก uploadDataFromWeb)
export const PLATFORM_CONFIG = {
  TiktokAnalytics: { sheet: 'TT_Analytics' },
  TiktokOrder: { sheet: 'TT_Sales' },
  TiktokSettlement: { sheet: 'TT_Settlement' },
  ShopeeOrder: { sheet: 'Shopee_Orders' },
  ShopeeSettlement: { sheet: 'Shopee_Settlement' },
  TiktokLive: { sheet: 'TT_Live' },
  TiktokAffiliate: { sheet: 'TT_Affiliate' },
  TiktokAdsManager: { sheet: 'TT_Ads_Manager' },
  TiktokAdsGMV: { sheet: 'TT_Ads_GMV' },
  TiktokAdsGMVLive: { sheet: 'TT_Ads_GMV_Live' },
  ShopeeAds: { sheet: 'Shopee_Ads' },
  ShopeeAdsLive: { sheet: 'Shopee_Ads_Live' },
  MetaAds: { sheet: 'Meta_Ads' },
  ShopeeAffiliate: { sheet: 'Shopee_Affiliate' },
  ModernTrade: { sheet: 'ModernTrade' },
  ManualFinance: { sheet: 'Manual_Finance' },
  Logistics: { sheet: 'Logistics' }
};

// RPC refresh ที่ต้องเรียกหลังอัปโหลดแต่ละแพลตฟอร์ม
export function refreshRpcsForPlatform(platform) {
  const p = String(platform || '');
  if (p === 'ModernTrade') return ['refresh_moderntrade_daily', 'refresh_reconciliation_audit'];
  if (p === 'ManualFinance') return ['refresh_manual_finance_daily'];
  if (p.startsWith('Tiktok')) {
    const set = ['refresh_ads_audit_daily'];
    if (['TiktokAnalytics', 'TiktokOrder', 'TiktokSettlement'].includes(p)) {
      set.push('refresh_tiktok_gmv_audit_daily', 'refresh_product_sales_daily', 'refresh_reconciliation_audit');
    }
    return set;
  }
  if (p.startsWith('Shopee')) {
    const set = ['refresh_ads_audit_daily'];
    if (['ShopeeOrder', 'ShopeeSettlement'].includes(p)) {
      set.push('refresh_shopee_audit_daily', 'refresh_product_sales_daily', 'refresh_reconciliation_audit');
    }
    return set;
  }
  if (p === 'MetaAds') return ['refresh_ads_audit_daily'];
  return [];
}

export async function runRefreshRpcs(platform) {
  const results = {};
  for (const fn of refreshRpcsForPlatform(platform)) {
    try { results[fn] = await sbRpc(fn, {}); } catch (err) { results[fn] = 'ERROR: ' + err.message; }
  }
  cacheClear();
  return results;
}

// พอร์ตจาก validateUploadHeaders_
export function validateUploadHeaders(platform, headers) {
  const normalized = headers.map(h => String(h || '').replace(/\s/g, '').toLowerCase());
  const has = kw => normalized.some(h => h.includes(String(kw).replace(/\s/g, '').toLowerCase()));

  if (platform === 'TiktokSettlement') {
    const hasOrder = has('orderid') || has('หมายเลขคำสั่งซื้อ');
    const hasFee = ['platformfee', 'settlementfee', 'transactionfee', 'commissionfee', 'gmvads', 'gmvadspayment', 'ค่าธรรมเนียมแพลตฟอร์ม', 'ค่าธรรมเนียมจริง', 'ค่าคอมมิชชั่น', 'การชำระเงินด้วยgmv'].some(has);
    const hasType = has('transactiontype') || has('ประเภทธุรกรรม');
    const hasAmount = normalized.some(h =>
      !h.includes('time') && !h.includes('date') && !h.includes('เวลา') && !h.includes('วันที่') &&
      ['amount', 'total', 'income', 'payment', 'จำนวนเงิน', 'ยอดเงิน', 'ยอดรวม', 'มูลค่า', 'รายได้', 'สุทธิ'].some(k => h.includes(k))
    );
    const ok = hasOrder && (hasFee || (hasType && hasAmount));
    return { ok, missing: ok ? [] : ['หมายเลขคำสั่งซื้อ และ ค่าธรรมเนียม หรือ ประเภทธุรกรรม+ยอดเงิน'] };
  }

  if (platform === 'ManualFinance') {
    const ok = (has('date') || has('วันที่')) && (has('entrytype') || has('entry_type') || has('type') || has('ประเภท')) &&
      (has('amount') || has('จำนวนเงิน') || has('ยอดเงิน')) && (has('applyto') || has('apply_to') || has('ลงส่วนไหน'));
    return { ok, missing: ok ? [] : ['Date', 'Entry_Type', 'Amount', 'Apply_To'] };
  }

  if (platform === 'ShopeeSettlement') {
    const hasSummary = has('period_start') && (has('net_settlement') || has('netsettlement'));
    const hasRaw = (has('orderid') || has('หมายเลขคำสั่งซื้อ')) &&
      (has('settlementdate') || has('วันที่โอนชำระเงินสำเร็จ')) &&
      (has('netsettlement') || has('settlementamount') || has('จำนวนเงินทั้งหมดที่โอนแล้ว'));
    return { ok: hasSummary || hasRaw, missing: (hasSummary || hasRaw) ? [] : ['Shopee Settlement raw columns หรือ summary columns'] };
  }

  const requiredMap = {
    TiktokOrder: [
      ['หมายเลขคำสั่งซื้อ', 'orderid'],
      ['สถานะคำสั่งซื้อ', 'สถานะ'],
      ['ยอดรวมย่อยของskuหลังหักส่วนลด', 'skusubtotalafterdiscount'],
      ['ชื่อสินค้า', 'productname'],
      ['เวลาที่สร้าง', 'createdtime']
    ],
    TiktokAffiliate: [
      ['หมายเลขคำสั่งซื้อ', 'orderid'],
      ['paymentamount', 'ยอดชำระ'],
      ['ค่าคอมมิชชั่นที่ต้องชำระจริง'],
      ['การจ่ายค่าคอมมิชชั่นโฆษณาร้านค้าที่ต้องชำระจริง']
    ],
    TiktokAdsGMV: [
      ['ประเภทชิ้นงานโฆษณา'],
      ['gmv', 'ยอดขาย', 'รายได้'],
      ['cost', 'ต้นทุน', 'ค่าโฆษณา'],
      ['date', 'วันที่', 'เริ่มการรายงาน']
    ],
    ShopeeAffiliate: [
      ['ยอดขาย', 'gmv'],
      ['ค่าคอมมิชชั่น', 'commission'],
      ['พาร์ทเนอร์', 'partner']
    ],
    Logistics: [
      ['หมายเลขออเดอร์ภายใน'],
      ['แพลตฟอร์ม'],
      ['วันที่จัดส่ง', 'วันที่สั่งซื้อ'],
      ['สถานะคำสั่งซื้อ']
    ]
  };
  const required = requiredMap[platform];
  if (!required) return { ok: true, missing: [] };
  const missing = [];
  required.forEach(group => {
    if (!group.some(has)) missing.push(group[0]);
  });
  return { ok: missing.length === 0, missing };
}

// พอร์ตจาก rowsToRawSupabaseRecords_ + writeUploadRawToSupabase_
export function rowsToRawRecords(platform, sheetName, rows, batchId, fileName, adminStart, adminEnd, username) {
  if (!rows || rows.length <= 1) return [];
  const headers = rows[0].map((h, i) => String(h || 'col_' + (i + 1)).trim() || 'col_' + (i + 1));
  return rows.slice(1).map((row, idx) => {
    const obj = {};
    headers.forEach((h, colIdx) => { obj[h] = row[colIdx] !== undefined ? row[colIdx] : ''; });
    return {
      batch_id: batchId,
      platform,
      source_sheet: sheetName || '',
      file_name: fileName || '',
      admin_start_date: adminStart || null,
      admin_end_date: adminEnd || null,
      row_index: idx + 2,
      row_data: obj,
      uploaded_by: username || '',
      uploaded_at: new Date().toISOString()
    };
  }).filter(r => Object.keys(r.row_data).some(k => String(r.row_data[k] || '').trim() !== ''));
}

export async function writeUploadRaw(platform, sheetName, rows, fileName, adminStart, adminEnd, username) {
  const batchId = uuidv4();
  const totalRows = Math.max((rows || []).length - 1, 0);
  await sbInsertRows('upload_batches', [{
    id: batchId,
    platform,
    source_sheet: sheetName || '',
    file_name: fileName || '',
    admin_start_date: adminStart || null,
    admin_end_date: adminEnd || null,
    total_rows: totalRows,
    uploaded_by: username || '',
    status: 'RECEIVED'
  }], 1);
  const records = rowsToRawRecords(platform, sheetName, rows, batchId, fileName, adminStart, adminEnd, username);
  const result = await sbInsertRows('raw_upload_rows', records, 300);
  return { batchId, inserted: result.inserted, totalRows };
}

export async function rollbackBatch(batchId) {
  await sbDelete('raw_upload_rows?batch_id=eq.' + encodeURIComponent(batchId));
  await sbRequest('upload_batches?id=eq.' + encodeURIComponent(batchId), 'patch', { status: 'ROLLED_BACK' }, { Prefer: 'return=minimal' });
  cacheClear();
}

// อ่าน batch ล่าสุดของ source_sheet (ใช้กับ Manual_Finance editor)
export async function getLatestBatchRows(sourceSheet) {
  const batches = await sbRequest(
    'upload_batches?select=id,created_at&source_sheet=eq.' + encodeURIComponent(sourceSheet) + '&status=eq.RECEIVED&order=created_at.desc&limit=1',
    'get'
  );
  if (!Array.isArray(batches) || !batches.length) return [];
  const rows = await sbRequest(
    'raw_upload_rows?select=row_index,row_data&batch_id=eq.' + encodeURIComponent(batches[0].id) + '&order=row_index.asc&limit=10000',
    'get'
  );
  return (rows || []).map(r => r.row_data || {});
}
