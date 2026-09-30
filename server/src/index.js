import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import uploadRoutes from './routes/uploads.js';
import financeRoutes from './routes/finance.js';
import opsRoutes from './routes/ops.js';
import mtRoutes from './routes/mt.js';
import bankRoutes from './routes/bank.js';
import systemRoutes from './routes/system.js';
import aiRoutes from './routes/ai.js';
import stockRoutes from './routes/stock.js';
import adsManualRoutes from './routes/adsmanual.js';
import allLiteRoutes from './routes/alllite.js';
import productSalesRoutes from './routes/productsales.js';
import logisticsRoutes from './routes/logistics.js';
import gsheetRoutes from './routes/gsheet.js';
import linePayablesRoutes from './routes/linePayables.js';
import { scanInbox, writeInboxReadme } from './lib/inbox.js';
import { runSheetSync, sheetSyncEnabled } from './lib/sheetSync.js';
import { sbRpc } from './lib/supabase.js';

const app = express();
app.use(cors());
app.use(express.json({
  limit: '25mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

app.get('/api/ping', (req, res) => res.json({ ok: true, name: 'TGM Local API', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/mt', mtRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/ads-manual', adsManualRoutes);
app.use('/api/alllite', allLiteRoutes);
app.use('/api/product-sales', productSalesRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/gsheet', gsheetRoutes);
app.use('/api/line', linePayablesRoutes);

// เสิร์ฟ React build (production): copy web/dist มาไว้ที่ server/public หรือรัน npm run build ใน web
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Inbox อัตโนมัติ: วางไฟล์ CSV ใน tgm-local/inbox แล้วระบบดูดเข้าเอง
const inboxDir = process.env.INBOX_DIR || path.resolve(__dirname, '../../inbox');
const inboxCron = process.env.INBOX_CRON || '*/10 * * * *';
try {
  writeInboxReadme(inboxDir);
  cron.schedule(inboxCron, () => scanInbox(inboxDir).catch(err => console.warn('[inbox]', err.message)));
  setTimeout(() => scanInbox(inboxDir).catch(err => console.warn('[inbox]', err.message)), 5000);
  console.log(`[inbox] เฝ้าโฟลเดอร์ ${inboxDir} (ทุก ${inboxCron})`);
} catch (err) {
  console.warn('[inbox] เปิดใช้งานไม่สำเร็จ:', err.message);
}

// Auto-refresh product_sales_daily ทุก 15 นาที (ต้นทุนสินค้าอัปเดตอัตโนมัติหลังอัปโหลดไฟล์)
cron.schedule('*/15 * * * *', async () => {
  try {
    await sbRpc('refresh_product_sales_daily', {});
    console.log('[auto-refresh] refresh_product_sales_daily สำเร็จ');
  } catch (err) {
    console.warn('[auto-refresh] refresh_product_sales_daily ล้มเหลว:', err.message);
  }
});
// Startup trigger: refresh ทันทีเมื่อ server เริ่มใหม่ (ไม่ต้องรอ 15 นาที)
setTimeout(async () => {
  try {
    await sbRpc('refresh_product_sales_daily', {});
    console.log('[startup] refresh_product_sales_daily สำเร็จ');
  } catch (err) {
    console.warn('[startup] refresh_product_sales_daily ล้มเหลว:', err.message);
  }
}, 10000);

// Sync บัญชีจ่ายกับ Google Sheet ทุก 5 นาที (ถ้าตั้งค่าไว้)
if (sheetSyncEnabled()) {
  const sheetCron = process.env.SHEET_SYNC_CRON || '*/5 * * * *';
  cron.schedule(sheetCron, () => runSheetSync());
  setTimeout(() => runSheetSync(), 8000);
  console.log('[sheet-sync] เปิดใช้งาน sync กับ Google Sheet (ทุก ' + sheetCron + ')');
}

app.listen(config.port, () => {
  console.log(`TGM Local API รันที่ http://localhost:${config.port}`);
});
