# Flow ระบบ TGM BI Dashboard

เอกสารนี้อ้างอิงจากโค้ดใน `tgm-local/` เวอร์ชันปัจจุบัน ใช้สำหรับดูภาพรวมระบบ ตรวจ flow งาน และอธิบายให้ทีมเข้าใจตรงกัน

## 1. โครงสร้างหลัก

```mermaid
flowchart LR
  User["ผู้ใช้"] --> Web["React/Vite web :5173"]
  Web --> API["Express API :3001"]
  API --> DB["Supabase"]
  API --> Inbox["inbox CSV watcher"]
  API --> Cron["FlowAccount / Sheet sync cron"]
```

- `web/` คือหน้าใช้งาน
- `server/` คือ API กลางและงานอัตโนมัติ
- `Supabase` เก็บข้อมูลดิบ, master, user, และ summary ผ่าน RPC
- `inbox/` ใช้วาง CSV เพื่อให้ระบบนำเข้าอัตโนมัติ

## 2. Login และสิทธิ์

```mermaid
flowchart TD
  A["Login"] --> B["POST /api/auth/login"]
  B --> C["เช็ค app_users"]
  C --> D{"ACTIVE และรหัสผ่านถูก?"}
  D -- "ไม่ผ่าน" --> E["แจ้ง error"]
  D -- "ผ่าน" --> F["ออก JWT"]
  F --> G["เก็บ token + user ใน localStorage"]
  G --> H["แสดงเมนูตาม permissions"]
  H --> I["กัน URL ตรงด้วย pageKey guard"]
  I --> J["API สำคัญเช็ก role/permission อีกชั้น"]
```

Role หลัก:

- `ADMIN` ใช้ได้ทุกหน้าและจัดการระบบได้
- `UPLOADER` ใช้งาน upload/กรอกข้อมูลบางส่วนได้
- `VIEWER` ดูข้อมูลตาม permission ที่กำหนด

## 3. Upload CSV จากหน้าเว็บ

```mermaid
flowchart TD
  A["เลือกไฟล์ CSV"] --> B["เลือก platform"]
  B --> C["ใส่ adminStart/adminEnd ถ้ามี"]
  C --> D{"ไฟล์หรือเดือนอาจซ้ำ?"}
  D -- "ใช่" --> E["ถามยืนยันก่อนอัปโหลด"]
  D -- "ไม่ใช่/ยืนยันแล้ว" --> F["POST /api/uploads"]
  F --> G["เช็ก ADMIN/UPLOADER"]
  G --> H["อ่าน CSV + ตรวจ header"]
  H --> I{"header ผ่าน?"}
  I -- "ไม่ผ่าน" --> J["แจ้งคอลัมน์ที่ขาด"]
  I -- "ผ่าน" --> K["เขียน upload_batches"]
  K --> L["เขียน raw_upload_rows"]
  L --> M["run refresh RPC ตาม platform"]
  M --> N["ล้าง cache และแสดงผล"]
```

หมายเหตุ:

- Upload ซ้ำได้ แต่ระบบจะเตือนก่อนถ้าเจอชื่อไฟล์เดิมหรือเดือนเดิม
- Rollback ใช้ลบข้อมูลของ `batch_id` นั้นออกจาก `raw_upload_rows`
- Modern Trade ปลายทางคือ `ModernTrade`

## 4. Inbox อัตโนมัติ

```mermaid
flowchart TD
  A["วาง CSV ใน tgm-local/inbox"] --> B["cron scan ทุก 10 นาที"]
  B --> C["อ่าน prefix ชื่อไฟล์เป็น platform"]
  C --> D{"ชื่อไฟล์ถูกไหม?"}
  D -- "ไม่ถูก" --> E["ย้ายไป inbox/error + ไฟล์สาเหตุ"]
  D -- "ถูก" --> F["อ่าน CSV + validate header"]
  F --> G{"ผ่านไหม?"}
  G -- "ไม่ผ่าน" --> E
  G -- "ผ่าน" --> H["writeUploadRaw"]
  H --> I["runRefreshRpcs"]
  I --> J["ย้ายไป inbox/done"]
```

ตัวอย่างชื่อไฟล์:

- `TiktokOrder_2026-06-01_2026-06-30.csv`
- `ShopeeSettlement_2026-06.csv`
- `MetaAds_Jun2026.csv`

## 5. Google Sheet Sync

```mermaid
flowchart TD
  A["กด Sync จากหน้า Upload"] --> B["POST /api/uploads/gsheet-sync"]
  B --> C["เช็ก ADMIN/UPLOADER"]
  C --> D["ดึง CSV จาก Google Sheet ที่ Publish to web"]
  D --> E["เขียน raw_upload_rows แบบ batch"]
  E --> F["refresh RPC ตาม platform"]
  F --> G["แสดงผล sync ราย tab"]
```

Flow นี้ใช้กับ Daily Report Sheet เช่น TikTok Analytics, Shopee Orders, Shopee Affiliate, TikTok Affiliate

## 6. Dashboard

```mermaid
flowchart TD
  A["เลือกวันที่/ช่องทาง"] --> B["GET /api/dashboard"]
  B --> C["เช็ก permission overview/dashboard"]
  C --> D["buildDashboardFast"]
  D --> E["เรียก RPC TikTok/Shopee/Ads/Manual/MT"]
  E --> F["รวม revenue, fee, ads, manual, cogs"]
  F --> G["คำนวณ KPI"]
  G --> H["ส่ง summary/charts/table กลับหน้าเว็บ"]
```

สูตรหลัก:

- `Profit = Revenue - Deductions - Ads`
- `Net Income = Profit - COGS`
- `ROAS = Revenue / Ads`
- `Net Margin = Net Income / Revenue`

## 7. Deep Audit และ Reconcile

```mermaid
flowchart TD
  A["เลือกช่วงวันที่"] --> B["เรียก audit/reconcile API"]
  B --> C["เช็ก permission"]
  C --> D["ดึง RPC audit"]
  D --> E["เทียบ Analytics / Orders / Settlement / Ads"]
  E --> F["แสดง variance และแหล่งที่มา"]
```

TikTok Analytics GMV กับ Order GMV ไม่จำเป็นต้องเท่ากัน เพราะนิยามยอด, refund, cancel และเวลานับต่างกัน

## 8. Upload Log และ Rollback

```mermaid
flowchart TD
  A["หน้า Upload Log"] --> B["GET /api/uploads/logs"]
  B --> C["เลือก batch"]
  C --> D["POST /api/uploads/rollback"]
  D --> E["เช็ก ADMIN"]
  E --> F["ลบ raw_upload_rows ของ batch"]
  F --> G["เปลี่ยน upload_batches เป็น ROLLED_BACK"]
  G --> H["refresh RPC และ clear cache"]
```

## 9. Manual Finance

```mermaid
flowchart TD
  A["กรอก Manual Finance"] --> B["POST /api/finance/manual-finance"]
  B --> C["สร้าง batch ManualFinance"]
  C --> D["เขียน source_sheet Manual_Finance"]
  D --> E["refresh_manual_finance_daily"]
  E --> F["ตัวเลขเข้า Dashboard"]
```

เงื่อนไข `Apply_To`:

- `ADS` เพิ่มเป็นค่าโฆษณา
- `COGS` เพิ่มเป็นต้นทุน
- ค่าอื่นนับเป็น deduction
- `INCOME` เพิ่มเข้า revenue

## 10. Modern Trade

```mermaid
flowchart TD
  A["MT Ledger"] --> B["mt_sales / mt_receipts / mt_payments"]
  C["ModernTrade upload/manual"] --> D["raw_upload_rows source_sheet ModernTrade"]
  B --> E["Dashboard ใช้ MT Ledger ก่อน"]
  D --> F["ถ้าไม่มี ledger จึง fallback ไป RPC เดิม"]
```

ข้อควรระวัง:

- Batch แบบ ModernTrade อาจนับซ้ำถ้า PO เดิมถูกนำเข้าซ้ำ
- MT Ledger เหมาะกับงานที่ต้องแก้รายเดือน เพราะใช้ upsert

## 11. Payables และ Bank Reconcile

```mermaid
flowchart TD
  A["บันทึก Payables"] --> B["ตาราง payables"]
  C["Upload bank statement"] --> D["ตาราง bank_statements"]
  D --> E["Auto match"]
  E --> F["จับคู่ยอดเงินออกกับ payable"]
  F --> G["Confirm"]
  G --> H["ตั้ง payable เป็น PAID"]
```

Auto match ใช้เงื่อนไขยอดใกล้กันไม่เกินประมาณ 0.5 บาท และวันที่ใกล้ due date ตามจำนวนวันที่กำหนด

## 12. Stock Update

```mermaid
flowchart TD
  A["วางข้อความสต็อก"] --> B["parse วันที่/สินค้า"]
  B --> C["คำนวณ stock, COGS, มูลค่าขาย"]
  C --> D["POST /api/stock/history"]
  D --> E["เช็ก ADMIN/UPLOADER"]
  E --> F["upsert stock_daily"]
```

สิทธิ์:

- บันทึก/ลบรายวัน: `ADMIN`, `UPLOADER`
- ล้างทั้งหมด/เพิ่มราคาทุน: `ADMIN`

## 13. จุดตรวจเมื่อผิดปกติ

- Login ไม่ได้: เช็ก `app_users`, status, password, JWT
- Upload ไม่เข้า: เช็ก platform, header, upload log, `inbox/error`
- Dashboard ไม่เปลี่ยน: เช็ก batch, refresh RPC, cache, date range
- สิทธิ์ไม่ขึ้น: แก้ permissions แล้ว logout/login ใหม่
- ยอดไม่ตรง: เปิด Deep Audit และดู source แยก platform

