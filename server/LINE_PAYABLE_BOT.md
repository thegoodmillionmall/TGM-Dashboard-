# LINE Payable Bot

ระบบรับไฟล์จาก LINE Group เพื่อทำรายการทำจ่าย

Flow หลัก:

1. LINE ส่ง webhook มาที่ `/api/line/webhook`
2. Server ตรวจ LINE signature และดาวน์โหลดไฟล์จาก LINE
3. Gemini อ่านข้อมูลยอดจากไฟล์เท่าที่เห็นได้
4. Server ส่งไฟล์ + ข้อมูลรายการไป Google Apps Script
5. Apps Script อัปโหลดไฟล์เข้า Google Drive และ append แถวลง Google Sheet
6. Server สร้างรายการในตาราง `payables`
7. Bot ตอบกลับใน LINE Group พร้อมเลขที่รายการ ยอดสุทธิ และลิงก์ดาวน์โหลด

## LINE Webhook URL

```text
https://YOUR_DOMAIN/api/line/webhook
```

## Render Environment Variables

ตั้งค่าใน Render:

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

PAYABLES_SCRIPT_URL=
PAYABLES_SCRIPT_TOKEN=

GOOGLE_AI_KEY=
GOOGLE_AI_MODEL=gemini-3.6-flash
```

หมายเหตุ: ถ้าใช้ Apps Script ไม่ต้องตั้งค่า service account:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_DRIVE_PAYABLES_FOLDER_ID=
GOOGLE_PAYABLES_SPREADSHEET_ID=
```

## Apps Script Setup แบบใช้สคริปต์เดิม

ถ้ามี Apps Script เดิมของ `TGM Sheet Sync v2` อยู่แล้ว ให้ใช้ไฟล์รวมนี้แทน:

```text
sheet-sync/apps-script-code.gs
```

ไฟล์นี้รองรับทั้ง sync เดิมและ LINE upload action `createPayable`

ถ้าจะสร้าง Apps Script แยกใหม่จริง ๆ ค่อยใช้ไฟล์นี้:

```text
server/apps-script/PayablesLineBot.gs
```

ขั้นตอน:

1. เปิด Google Sheet รายการทำจ่าย
2. ไปที่ Extensions > Apps Script
3. วางโค้ดจาก `sheet-sync/apps-script-code.gs` ทับ/แทนสคริปต์เดิม
4. ไปที่ Project Settings > Script Properties
5. เพิ่มค่า `DRIVE_FOLDER_ID`:

```text
DRIVE_FOLDER_ID = ไอดีโฟลเดอร์ Google Drive ที่เก็บเอกสาร
```

สคริปต์เดิมใช้ token จากตัวแปร `TOKEN` ด้านบนไฟล์ เช่น `TGM2026`

6. กด Deploy > Manage deployments > Edit
7. Type: Web app
8. Execute as: Me
9. Who has access: Anyone
10. กด Deploy เพื่อออก version ใหม่
11. Copy Web app URL ไปใส่ Render เป็น `PAYABLES_SCRIPT_URL`
12. ใส่ token ให้ตรงกับตัวแปร `TOKEN` ใน Apps Script เป็น `PAYABLES_SCRIPT_TOKEN`

## Sheet Columns

แท็บ `TGM_Payables` จะใช้คอลัมน์นี้:

```text
id, paid, description, company, gross, wht, net, vendor, accountNo, bank, ref, link, docDate, source
```

ถ้าแท็บยังไม่มีหัวตาราง Apps Script จะสร้างหัวตารางให้เอง
