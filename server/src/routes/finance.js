import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sbRpcOne, sbRequest } from '../supabase.js';
import { writeActivityLog } from '../lib/log.js';
import { getProductCostsMaster, getFeeSettingsMaster, getDataSourceMappingsMaster } from '../lib/fast.js';
import { writeUploadRaw, runRefreshRpcs, getLatestBatchRows } from '../lib/uploads.js';
import { cacheClear } from '../cache.js';
import { loadRawOrderItems } from './productsales.js';

const router = Router();
router.use(requireAuth);

const MANUAL_HEADERS = ['Date', 'Entry_Type', 'Platform', 'Section', 'Category', 'Sub_Category', 'Vendor', 'Description', 'Amount', 'Apply_To', 'Source_Mode', 'Created_By', 'Created_At', 'Upload_Batch_ID'];
const FINANCIAL_STATEMENTS_KEY = 'financial_statements';
function makeStatementMonth(month, title, rows) {
  return {
    month,
    title,
    unit: 'บาท',
    lockedSource: true,
    rows: rows.map(r => ({
      section: r[0],
      group: r[1] || '',
      item: r[2],
      amount: r[3],
      total: !!r[4]
    }))
  };
}
const FINANCIAL_STATEMENT_SEED = {
  version: 1,
  source: 'seeded-from-google-sheet',
  months: [
    makeStatementMonth('2026-01', 'งบกำไรขาดทุน มกราคม 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการขายสินค้า', 84087.88],
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 1239190.65],
      ['รายได้', '', 'รวมรายได้สุทธิ', 1323278.53, true],
      ['รายได้', '', 'รวมรายได้', 1323278.53, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 351339.72],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 351339.72],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 351339.72, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและยานพาหนะ', 4000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและที่พัก', 920],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 9064],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 26785.76],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 9522.6],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 104893.46],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Lazada', 178.64],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 33704.64],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 189069.1, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 167357.93],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินประกันสังคม/กองทุนสำรองฯ', -780],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 285000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 90211.81],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Facebook', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 25000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายสำนักงาน', 1370],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าซ่อมแซมและบำรุงรักษา', 15530],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าทำบัญชี', 9000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 30000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 111028.87],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 102598.93],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าภาษีอื่นๆ', 32745.42],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 969062.96, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', 106.57],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', 106.57, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 1509578.35, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', -186299.82, true]
    ]),
    makeStatementMonth('2026-02', 'งบกำไรขาดทุน กุมภาพันธ์ 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการขายสินค้า', 52371.17],
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 1226863.55],
      ['รายได้', 'รายได้สุทธิ', 'ส่วนลดจ่าย', -2936.82],
      ['รายได้', '', 'รวมรายได้สุทธิ', 1276297.9, true],
      ['รายได้', 'รายได้อื่น', 'เงินชดเชยและค่าปรับ', 30],
      ['รายได้', 'รายได้อื่น', 'รายได้อื่นๆ', 1551.79],
      ['รายได้', '', 'รวมรายได้อื่น', 1581.79, true],
      ['รายได้', '', 'รวมรายได้', 1277879.69, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 1841610.26],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 1841610.26],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 1841610.26, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและยานพาหนะ', 6440],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 5016],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 4550.12],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 2600.4],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย-Shopee', 10000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 90120.55],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Lazada', 50.18],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 113352.65],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 232129.9, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 168089.86],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินประกันสังคม/กองทุนสำรองฯ', 1750],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 80000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 217081.34],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Facebook', 39919.95],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 12403.85],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายด้านโฆษณาและการตลาดอื่นๆ', 4400],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าเช่า', 28000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าซ่อมแซมและบำรุงรักษา', 2240],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าทำบัญชี', 30000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 30000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 192468.32],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างแพ็คสินค้า', 44520],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 125421.36],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าธรรมเนียมอื่นๆ', 8521.5],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 1034816.18, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', 173.13],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', 173.13, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 3108729.47, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', -1830849.78, true]
    ]),
    makeStatementMonth('2026-03', 'งบกำไรขาดทุน มีนาคม 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการขายสินค้า', 286.82],
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 7998394.21],
      ['รายได้', '', 'รวมรายได้สุทธิ', 7998681.03, true],
      ['รายได้', '', 'รวมรายได้', 7998681.03, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 277974.27],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 277974.27],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 277974.27, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและยานพาหนะ', 3200],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและที่พัก', 1200],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 52167],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 9569.11],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 1501.5],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย-Shopee', 25000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 358922.4],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 544166.1],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 995726.11, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 291652.4],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินสวัสดิการพนักงาน', 252.34],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 421400],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 639234.5],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Facebook', 52155.6],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 45496],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายด้านโฆษณาและการตลาดอื่นๆ', 5400],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าซ่อมแซมและบำรุงรักษา', 5104.68],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าทำบัญชี', 20000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 75000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 71754.38],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างแพ็คสินค้า', 102705.68],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 67808.16],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าธรรมเนียมอื่นๆ', 6800],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 1854763.74, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'ค่าใช้จ่ายเบ็ดเตล็ด', 185.98],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', 332.11],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', 518.09, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 3128982.21, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', 4869698.82, true]
    ]),
    makeStatementMonth('2026-04', 'งบกำไรขาดทุน เมษายน 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการขายสินค้า', 573.64],
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 4446439.09],
      ['รายได้', '', 'รวมรายได้สุทธิ', 4447012.73, true],
      ['รายได้', '', 'รวมรายได้', 4447012.73, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 625449.11],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 625449.11],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 625449.11, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและยานพาหนะ', 4000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและที่พัก', 2480],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าพาหนะ/ค่าใช้จ่ายเดินทาง/ที่พัก อื่นๆ', 1000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 11233],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 26762.35],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 43785.01],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย-Shopee', 15000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 290403.75],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 554998.94],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 949663.05, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 292912.99],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 290800],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 439506.76],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 19000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 40000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 99500],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างแพ็คสินค้า', 111770],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 95940.15],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 1439429.9, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'ค่าใช้จ่ายเบ็ดเตล็ด', 6330.83],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', 565.68],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', 6896.51, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 3021438.57, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', 1425574.16, true]
    ]),
    makeStatementMonth('2026-05', 'งบกำไรขาดทุน พฤษภาคม 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 1621190.26],
      ['รายได้', '', 'รวมรายได้สุทธิ', 1621190.26, true],
      ['รายได้', '', 'รวมรายได้', 1621190.26, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 133682.42],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 133682.42],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 133682.42, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 5497],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 15132.89],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 79124],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 113848.99],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 87866.08],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 301468.96, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 264988.53],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินประกันสังคม/กองทุนสำรองฯ', -1750],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 111800],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 141786.77],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 59300],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายด้านโฆษณาและการตลาดอื่นๆ', 27493.4],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายสำนักงาน', 1257.94],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าทำบัญชี', 20000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าสอบบัญชี', 37000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 34672.9],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 21189.56],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างแพ็คสินค้า', 21620],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 50573.57],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 839932.67, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'ค่าใช้จ่ายเบ็ดเตล็ด', 2992],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', 2618.79],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', 5610.79, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 1280694.84, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', 340495.42, true]
    ]),
    makeStatementMonth('2026-06', 'งบกำไรขาดทุน มิถุนายน 2026', [
      ['รายได้', 'รายได้สุทธิ', 'รายได้จากการให้บริการ', 2122313.05],
      ['รายได้', '', 'รวมรายได้สุทธิ', 2122313.05, true],
      ['รายได้', 'รายได้อื่น', 'ดอกเบี้ยรับ', 733.89],
      ['รายได้', '', 'รวมรายได้อื่น', 733.89, true],
      ['รายได้', '', 'รวมรายได้', 2123046.94, true],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ต้นทุนขายสินค้าเพื่อขาย', 164035.21],
      ['ค่าใช้จ่าย', 'ต้นทุนขายสุทธิ', 'ส่วนเปลี่ยนแปลงของสินค้าสำเร็จรูป', 164035.21],
      ['ค่าใช้จ่าย', '', 'รวมต้นทุนขายสุทธิ', 164035.21, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและยานพาหนะ', 1044],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าใช้จ่ายเดินทางและที่พัก', 3800],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าขนส่ง', 10961],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่ารับรองลูกค้า', 1104.24],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย', 16126.96],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าส่งเสริมการขาย-Shopee', 5000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Shopee', 110926.17],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการขาย', 'ค่าธรรมเนียมการขาย - Tiktok', 91451.75],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการขาย', 240414.12, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินเดือนและค่าจ้างแรงงาน', 324558.33],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'เงินประกันสังคม/กองทุนสำรองฯ', -875],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายและค่าตอบแทนกรรมการ', 50000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Shopee', 380322.41],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าโฆษณา - Tiktok', 172861.59],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างด้านโฆษณาและการตลาด', 94600],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายด้านโฆษณาและการตลาดอื่นๆ', 4216.95],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าใช้จ่ายสำนักงาน', 6303.74],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าทำบัญชี', 20000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการให้คำแนะนำและปรึกษา', 30000],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าจ้างฟรีแลนซ์', 49426.24],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าบริการอื่นๆ', 55921.23],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายในการบริหาร', 'ค่าธรรมเนียมอื่นๆ', 65420.56],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายในการบริหาร', 1252756.05, true],
      ['ค่าใช้จ่าย', 'ค่าใช้จ่ายอื่น', 'รายจ่ายอื่นๆ', -2001.07],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่ายอื่น', -2001.07, true],
      ['ค่าใช้จ่าย', '', 'รวมค่าใช้จ่าย', 1655204.31, true],
      ['สรุป', '', 'กำไร(ขาดทุน) สุทธิ', 467842.63, true]
    ])
  ]
};

function cleanFinancialStatements(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const months = Array.isArray(src.months) ? src.months : [];
  return {
    version: 1,
    source: src.source || 'system',
    months: months.map(m => ({
      month: String(m.month || '').slice(0, 7),
      title: String(m.title || '').trim(),
      unit: m.unit || 'บาท',
      lockedSource: !!m.lockedSource,
      rows: Array.isArray(m.rows) ? m.rows.map(r => ({
        section: String(r.section || '').trim(),
        group: String(r.group || '').trim(),
        item: String(r.item || '').trim(),
        amount: Number(r.amount || 0) || 0,
        total: !!r.total
      })).filter(r => r.item) : []
    })).filter(m => m.month && m.rows.length)
  };
}

function mergeWithSeedFinancialStatements(raw) {
  const current = cleanFinancialStatements(raw || {});
  const byMonth = new Map(FINANCIAL_STATEMENT_SEED.months.map(m => [m.month, m]));
  for (const month of current.months) byMonth.set(month.month, month);
  return cleanFinancialStatements({ ...current, source: current.source || 'system', months: [...byMonth.values()] });
}

function financialSummary(month) {
  const rows = month?.rows || [];
  const valueOf = label => rows.find(r => r.item === label)?.amount || 0;
  const revenue = valueOf('รวมรายได้') || valueOf('รวมรายได้สุทธิ') || rows.filter(r => r.section === 'รายได้' && !r.total).reduce((s, r) => s + r.amount, 0);
  const cogs = valueOf('รวมต้นทุนขายสุทธิ');
  const selling = valueOf('รวมค่าใช้จ่ายในการขาย');
  const admin = valueOf('รวมค่าใช้จ่ายในการบริหาร');
  const other = valueOf('รวมค่าใช้จ่ายอื่น');
  const expenses = valueOf('รวมค่าใช้จ่าย') || (cogs + selling + admin + other);
  const net = valueOf('กำไร(ขาดทุน) สุทธิ') || (revenue - expenses);
  return { revenue, cogs, selling, admin, other, expenses, net, margin: revenue ? (net / revenue) * 100 : 0 };
}

// ---------- ต้นทุนสินค้า (Accounting / COGS) ----------
router.get('/product-costs', async (req, res) => {
  try { res.json(await getProductCostsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก saveAccountingData → replace_product_costs_master
router.post('/product-costs', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || [])
      .map(r => ({
        platform: r.platform || '',
        productName: String(r.productName || r.name || '').trim(),
        costType: r.costType || 'THB',
        costValue: Number(r.costValue || 0)
      }))
      .filter(r => r.productName);
    const result = await sbRpcOne('replace_product_costs_master', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_PRODUCT_COSTS', 'product_costs', '', 'SUCCESS', 'บันทึกต้นทุนสินค้า ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึกต้นทุนสินค้าสำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก syncAccountingProducts — ดึงชื่อสินค้าที่มียอดขายมาเติมตาราง
router.post('/product-costs/sync', requireRole('ADMIN'), async (req, res) => {
  try {
    const start = req.body?.start || null;
    const end = req.body?.end || null;
    const orderItems = await loadRawOrderItems({ start, end });
    const candidateMap = new Map();

    for (const item of orderItems) {
      const name = String(item.productName || '').trim();
      if (!name) continue;
      const platform = item.platform || '';
      const key = `${platform}|${name}`.toLowerCase();
      if (!candidateMap.has(key)) {
        candidateMap.set(key, {
          name,
          platform,
          units: 0,
          orders: new Set(),
        });
      }
      const slot = candidateMap.get(key);
      slot.units += Number(item.qty || 0);
      if (item.orderId) slot.orders.add(item.orderId);
    }

    let source = 'raw_order_detail';
    let candidates = [...candidateMap.values()]
      .sort((a, b) => (b.units - a.units) || a.name.localeCompare(b.name, 'th'))
      .map(c => ({ name: c.name, platform: c.platform || '', units: c.units, orders: c.orders.size }));

    if (!candidates.length) {
      const data = await sbRpcOne('get_product_sales', { p_start: null, p_end: null, p_platform: 'All' });
      candidates = (data?.topProducts || []).map(p => ({ name: p.name, platform: p.platform || '' }));
      source = 'product_sales_summary';
    }

    const existing = await getProductCostsMaster();
    const existingKeys = new Set(existing.map(r =>
      `${String(r.platform || '').trim()}|${String(r.productName || r.name || '').trim()}`.toLowerCase()
    ));
    const existingAllNames = new Set(existing
      .filter(r => !String(r.platform || '').trim())
      .map(r => String(r.productName || r.name || '').trim().toLowerCase())
    );
    const merged = existing.concat(
      candidates.filter(c => {
        const name = String(c.name || '').trim();
        const platform = String(c.platform || '').trim();
        if (!name) return false;
        if (existingAllNames.has(name.toLowerCase())) return false;
        return !existingKeys.has(`${platform}|${name}`.toLowerCase());
      })
        .map(c => ({ platform: c.platform, productName: c.name, costType: 'THB', costValue: 0 }))
    );
    res.json({
      ok: true,
      rows: merged,
      added: merged.length - existing.length,
      source,
      orderProducts: candidates.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Fee settings ----------
router.get('/fees', async (req, res) => {
  try { res.json(await getFeeSettingsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/fees', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || []).filter(r => r && r.name);
    const result = await sbRpcOne('replace_fee_settings_master', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_FEE_SETTINGS', 'fee_settings', '', 'SUCCESS', 'บันทึกค่าธรรมเนียม ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึกค่าธรรมเนียมสำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Data source mappings ----------
router.get('/mappings', requireRole('ADMIN'), async (req, res) => {
  try { res.json(await getDataSourceMappingsMaster()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mappings', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = (req.body?.rows || []).filter(r => r && r.platform && r.metricKey);
    const result = await sbRpcOne('replace_data_source_mappings', { p_rows: rows, p_user: req.user.username });
    cacheClear();
    await writeActivityLog(req.user, 'SAVE_DATA_SOURCE_MAPPING', 'data_source_mappings', '', 'SUCCESS', 'บันทึก mapping ' + rows.length + ' รายการ');
    res.json({ ok: true, message: 'บันทึก Data Source Mapping สำเร็จ: ' + rows.length + ' รายการ', result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Manual Finance ----------
// อ่านรายการปัจจุบัน (จาก batch ล่าสุดใน raw_upload_rows)
router.get('/manual-finance', async (req, res) => {
  try {
    const objs = await getLatestBatchRows('Manual_Finance');
    const pick = (o, keys, dflt = '') => {
      for (const k of keys) {
        const hit = Object.keys(o).find(h => h.replace(/\s/g, '').toLowerCase() === k);
        if (hit !== undefined && o[hit] !== undefined && o[hit] !== '') return o[hit];
      }
      return dflt;
    };
    res.json(objs.map(o => ({
      date: pick(o, ['date', 'วันที่']),
      entryType: String(pick(o, ['entry_type', 'entrytype', 'type', 'ประเภท'], 'EXPENSE')).toUpperCase(),
      platform: pick(o, ['platform', 'แพลตฟอร์ม'], 'All') || 'All',
      section: pick(o, ['section']),
      category: pick(o, ['category', 'หมวด']),
      subCategory: pick(o, ['sub_category', 'subcategory']),
      vendor: pick(o, ['vendor']),
      description: pick(o, ['description', 'รายละเอียด']),
      amount: Number(String(pick(o, ['amount', 'จำนวนเงิน'], 0)).replace(/[^0-9.-]/g, '')) || 0,
      applyTo: String(pick(o, ['apply_to', 'applyto'], 'DEDUCTION')).toUpperCase(),
      sourceMode: String(pick(o, ['source_mode', 'sourcemode'], 'MANUAL')).toUpperCase()
    })).filter(r => r.date && r.amount));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก saveManualFinanceEntries — replace ทั้งชุดเป็น batch ใหม่ + refresh
router.post('/manual-finance', requireRole('ADMIN'), async (req, res) => {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entries = (req.body?.rows || [])
      .map(r => {
        const amount = Number(String(r.amount || 0).toString().replace(/[^0-9.-]/g, '')) || 0;
        if (!r.date || !amount) return null;
        return [
          r.date,
          String(r.entryType || 'EXPENSE').toUpperCase(),
          r.platform || 'All',
          r.section || '', r.category || '', r.subCategory || '', r.vendor || '', r.description || '',
          amount,
          String(r.applyTo || 'DEDUCTION').toUpperCase(),
          String(r.sourceMode || 'MANUAL').toUpperCase(),
          req.user.username, now, ''
        ];
      })
      .filter(Boolean);
    const rows = [MANUAL_HEADERS, ...entries];
    const result = await writeUploadRaw('ManualFinance', 'Manual_Finance', rows, 'manual-editor', null, null, req.user.username);
    const refresh = await runRefreshRpcs('ManualFinance');
    await writeActivityLog(req.user, 'SAVE_MANUAL_FINANCE', 'Manual_Finance', result.batchId, 'SUCCESS', 'Updated manual income/expense table', { rows: entries.length });
    res.json({ ok: true, message: 'บันทึกรายได้/รายจ่าย Manual สำเร็จ: ' + entries.length + ' รายการ', batchId: result.batchId, refresh: Object.keys(refresh) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Modern Trade (กรอกมือ) ----------
const MT_HEADERS = ['วันที่รับ PO', 'PO number', 'Sales platform', 'Branch', 'Product', 'Amount', 'ราคาสินค้า', 'GP', 'Price', 'ยอด GP', 'Net Profit', 'ETD', 'ETA', 'Ship via', 'Order number', 'Status', 'Notes', 'Received'];

router.post('/modern-trade', requireRole('ADMIN', 'UPLOADER'), async (req, res) => {
  try {
    const dataRows = (req.body?.rows || []).filter(r => Array.isArray(r) && String(r[1] || '').trim());
    if (!dataRows.length) return res.status(400).json({ error: 'ไม่มีรายการที่มี PO number' });
    const rows = [MT_HEADERS, ...dataRows.map(r => {
      const nr = [...r];
      while (nr.length < MT_HEADERS.length) nr.push('');
      return nr.slice(0, MT_HEADERS.length);
    })];
    const result = await writeUploadRaw('ModernTrade', 'ModernTrade', rows, 'manual-mt-editor', null, null, req.user.username);
    const refresh = await runRefreshRpcs('ModernTrade');
    await writeActivityLog(req.user, 'SAVE_MODERN_TRADE', 'ModernTrade', result.batchId, 'SUCCESS', 'บันทึก Modern Trade ' + dataRows.length + ' รายการ');
    res.json({ ok: true, message: `บันทึกข้อมูล Modern Trade เรียบร้อย: ${dataRows.length} รายการ`, batchId: result.batchId, refresh: Object.keys(refresh) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Overview display config (app_settings) ----------
router.get('/overview-config', async (req, res) => {
  try {
    const rows = await sbRequest("app_settings?key=eq.overview_display&limit=1", 'get');
    res.json(rows && rows.length ? rows[0].value : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/overview-config', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'overview_display', value: req.body || {}, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: 'บันทึกการตั้งค่าหน้า Overview สำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Financial statements (read-only imported budget/P&L workbook) ----------
router.get('/statements', async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const data = mergeWithSeedFinancialStatements(rows && rows.length ? rows[0].value : FINANCIAL_STATEMENT_SEED);
    const months = data.months.map(m => ({ ...m, summary: financialSummary(m) }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const templateRows = months[0]?.rows || FINANCIAL_STATEMENT_SEED.months[0].rows;
    res.json({ ...data, months, templateRows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/statements/seed', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const value = mergeWithSeedFinancialStatements(rows && rows.length ? rows[0].value : {});
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: FINANCIAL_STATEMENTS_KEY, value, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await writeActivityLog(req.user, 'SEED_FINANCIAL_STATEMENTS', 'app_settings', FINANCIAL_STATEMENTS_KEY, 'SUCCESS', 'Seeded financial statements');
    res.json({ ok: true, message: 'นำงบเดือนเริ่มต้นเข้าระบบแล้ว', months: value.months.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/statements/month', requireRole('ADMIN'), async (req, res) => {
  try {
    const rows = await sbRequest(`app_settings?key=eq.${FINANCIAL_STATEMENTS_KEY}&limit=1`, 'get');
    const current = mergeWithSeedFinancialStatements(rows && rows.length ? rows[0].value : FINANCIAL_STATEMENT_SEED);
    const month = cleanFinancialStatements({ months: [req.body || {}] }).months[0];
    if (!month) return res.status(400).json({ error: 'ข้อมูลเดือนนี้ไม่ครบ' });
    const byMonth = new Map(current.months.map(m => [m.month, m]));
    byMonth.set(month.month, month);
    const value = cleanFinancialStatements({ ...current, source: 'system', months: [...byMonth.values()] });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: FINANCIAL_STATEMENTS_KEY, value, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await writeActivityLog(req.user, 'SAVE_FINANCIAL_STATEMENT_MONTH', 'app_settings', FINANCIAL_STATEMENTS_KEY, 'SUCCESS', 'Saved financial statement ' + month.month);
    res.json({ ok: true, message: 'บันทึกงบเดือน ' + month.month + ' แล้ว', month: { ...month, summary: financialSummary(month) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Product Master ----------
router.get('/product-master', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_master&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || []) : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/product-master', requireRole('ADMIN'), async (req, res) => {
  try {
    const items = Array.isArray(req.body)
      ? req.body.map(p => ({ sku: String(p.sku||'').trim(), name: String(p.name||'').trim(), category: String(p.category||'').trim(), cost: Number(p.cost||0) })).filter(p => p.sku)
      : [];
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_master', value: items, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `บันทึก ${items.length} รายการ` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Seed product master ----------
router.post('/seed-product-master', requireRole('ADMIN'), async (req, res) => {
  try {
    const seedPath = path.resolve(__dirname, '../../../seeds/product-master.json');
    const raw = await readFile(seedPath, 'utf-8');
    const { productMaster, productCostsMeta, skuCosts } = JSON.parse(raw);
    const now = new Date().toISOString();
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_master', value: productMaster, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_costs_meta', value: productCostsMeta, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'sku_costs_reference', value: skuCosts, updated_by: req.user.username, updated_at: now }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `นำเข้าสำเร็จ: ${productMaster.length} สินค้า, ${Object.keys(productCostsMeta).length} auto-linked` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Categories ----------
router.get('/categories', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_categories&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || []) : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', requireRole('ADMIN'), async (req, res) => {
  try {
    const cats = Array.isArray(req.body) ? req.body.map(s => String(s).trim()).filter(Boolean) : [];
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_categories', value: cats, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: `บันทึกหมวดหมู่ ${cats.length} รายการ` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Product costs metadata ----------
router.get('/product-costs-meta', async (req, res) => {
  try {
    const rows = await sbRequest('app_settings?key=eq.product_costs_meta&limit=1', 'get');
    res.json(rows && rows.length ? (rows[0].value || {}) : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/product-costs-meta', requireRole('ADMIN'), async (req, res) => {
  try {
    await sbRequest('app_settings?on_conflict=key', 'post',
      [{ key: 'product_costs_meta', value: req.body || {}, updated_by: req.user.username, updated_at: new Date().toISOString() }],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    res.json({ ok: true, message: 'บันทึก metadata สำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
