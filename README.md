# TGM Local — The Good Million BI Dashboard (ฉบับรันบนเครื่องตัวเอง)

ระบบเดิม (Google Apps Script + Google Sheets) ถูกพอร์ตมาเป็น:

| ส่วน | เดิม | ใหม่ |
|---|---|---|
| Backend | Code.gs บน Apps Script | Node.js + Express (`server/`) |
| Frontend | Index.html บน Apps Script | React + Vite (`web/`) |
| ฐานข้อมูล | Google Sheets + Supabase (fast mode) | **Supabase อย่างเดียว** (ใช้ project เดิม ข้อมูลเดิมใช้ต่อได้ทันที) |
| Login | ชีต User_DB (รหัสผ่าน plain text) | ตาราง `app_users` + bcrypt + JWT |
| Trigger รายวัน | Apps Script trigger | node-cron ใน server |

RPC เดิมใน Supabase (`get_*`, `refresh_*`, `replace_*`) และตาราง `upload_batches` / `raw_upload_rows` / `activity_log_events` **ใช้ของเดิมทั้งหมด ไม่ต้องแก้**

---

## ขั้นตอนติดตั้ง (ทำครั้งเดียว)

### 1. ติดตั้ง Node.js
ดาวน์โหลด Node.js LTS (เวอร์ชัน 20+) จาก https://nodejs.org แล้วติดตั้ง

### 2. สร้างตารางใหม่ใน Supabase
เปิด Supabase → SQL Editor → วางเนื้อหาไฟล์ `supabase/migrations.sql` → Run

จะได้ตาราง `app_users`, `app_settings`, `payables`, `mc_live_planner`, `flowaccount_invoices`
และผู้ใช้เริ่มต้น **admin / admin1234** (เข้าระบบแล้วเปลี่ยนรหัสทันที)

ถ้าต้องการย้ายผู้ใช้เดิมจากชีต User_DB ให้ insert เพิ่มตามตัวอย่างท้ายไฟล์ SQL

### 3. ตั้งค่า server
```
cd server
copy .env.example .env
```
แก้ไฟล์ `.env`:
- `SUPABASE_URL` และ `SUPABASE_SERVICE_KEY` — ค่าเดียวกับที่เคยตั้งใน Apps Script (Script Properties)
- `JWT_SECRET` — ตั้งเป็นข้อความสุ่มยาวๆ
- `GOOGLE_AI_KEY` — (ไม่บังคับ) สำหรับ AI ผู้ช่วย

### 4. ติดตั้ง dependencies
```
cd server
npm install

cd ..\web
npm install
```

---

## การใช้งานประจำวัน (โหมดพัฒนา / แก้โค้ด)

เปิด 2 terminal ใน VS Code:

```
# terminal 1 — API
cd server
npm run dev

# terminal 2 — หน้าเว็บ
cd web
npm run dev
```

เปิด http://localhost:5173 → login ด้วย admin

แก้โค้ดได้เลย ทั้งสองฝั่ง reload อัตโนมัติ

## โหมดใช้งานจริง (รันตัวเดียว)

```
cd web
npm run build

cd ..\server
npm start
```

เปิด http://localhost:3001 — server จะเสิร์ฟหน้าเว็บที่ build แล้วเอง

---

## โครงสร้างโปรเจค

```
tgm-local/
├─ supabase/migrations.sql   ตารางใหม่ + seed admin
├─ server/                   Express API
│  └─ src/
│     ├─ index.js            entry + cron FlowAccount
│     ├─ supabase.js         REST/RPC client
│     ├─ permissions.js      สิทธิ์รายหน้า (พอร์ตจาก getPermissionPages_)
│     ├─ lib/fast.js         ★ ตัวคำนวณ dashboard (พอร์ตจาก getDashboardFastFromSupabase_)
│     ├─ lib/uploads.js      ตรวจ header + เขียน raw + refresh RPC + rollback
│     └─ routes/             auth, users, dashboard, uploads, finance, ops, system, ai
└─ web/                      React SPA
   └─ src/pages/             ครบทุกหน้า: Overview, Dashboard, Products, Ads, DeepAudit,
                             Reconcile, Profit, Upload, Manual, Accounting, Fees,
                             Payables, McLive, UploadLog, Health, Users
```

## จุดที่ต่างจากระบบเดิม

1. **ไม่เขียน Google Sheets อีกต่อไป** — ทุกอย่างลง Supabase (raw_upload_rows + RPC refresh)
2. **Manual Finance / Modern Trade** บันทึกเป็น batch ใหม่ใน raw_upload_rows แล้วเรียก refresh RPC (พฤติกรรมเดียวกับปุ่ม sync เดิม)
3. **รหัสผ่านเข้ารหัส bcrypt** — รหัสเดิมในชีตเป็น plain text ต้อง insert ใหม่ผ่าน SQL หรือหน้า "ผู้ใช้และสิทธิ์"
4. **Drive archive ถูกตัดออก** — ไฟล์ดิบเก็บใน raw_upload_rows อย่างเดียว (เหมือนเปิด `SUPABASE_SKIP_RAW_ARCHIVE` เดิม)
5. FlowAccount sync ตั้งเวลาใน `.env` (`FLOWACCOUNT_CRON`) แทน trigger ของ Apps Script

## หมายเหตุ

- ถ้าหน้า dashboard ฟ้องว่า RPC ไม่ตอบ ให้ไปหน้า "สุขภาพระบบ" → กด "Refresh สรุปรายวันทั้งหมด"
- ระบบเดิมบน Apps Script ยังใช้ต่อได้ควบคู่กันระหว่างช่วงเปลี่ยนผ่าน เพราะอ่าน/เขียน Supabase ชุดเดียวกัน
