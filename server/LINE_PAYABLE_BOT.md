# LINE Payable Bot

ระบบนี้รับไฟล์จาก LINE Group ผ่าน webhook แล้วทำงานดังนี้:

1. ตรวจลายเซ็น webhook จาก LINE
2. ดาวน์โหลดไฟล์จาก LINE ด้วย message id
3. อัปโหลดไฟล์เข้า Google Drive
4. ให้ Gemini อ่านยอดจากเอกสารเท่าที่เห็นได้
5. สร้างรายการในตาราง `payables`
6. เพิ่มแถวใน Google Sheet พร้อมลิงก์เอกสาร
7. ตอบกลับใน LINE Group ด้วยเลขที่รายการ ยอดสุทธิ และลิงก์เอกสาร

## Webhook URL

ตั้งค่าใน LINE Developers Console:

```text
https://YOUR_DOMAIN/api/line/webhook
```

## Environment Variables

เพิ่มค่าเหล่านี้ใน `server/.env` และใน Environment ของ Render/Production:

```env
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=

GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_PAYABLES_FOLDER_ID=
GOOGLE_DRIVE_PUBLIC_LINK=false
GOOGLE_PAYABLES_SPREADSHEET_ID=
GOOGLE_PAYABLES_TAB=TGM_Payables

GOOGLE_AI_KEY=
GOOGLE_AI_MODEL=gemini-2.0-flash
```

## Google Permission

ต้องแชร์ทั้ง Google Drive folder และ Google Sheet ให้ service account email ก่อน เช่น:

```text
xxxxx@xxxxx.iam.gserviceaccount.com
```

ให้สิทธิ์อย่างน้อย:

- Drive folder: Editor
- Payables spreadsheet: Editor

ถ้าต้องการให้คนใน LINE Group เปิดลิงก์ได้โดยไม่ต้องขอสิทธิ์ ให้ตั้ง:

```env
GOOGLE_DRIVE_PUBLIC_LINK=true
```

## Sheet Columns

ระบบ append เข้าแท็บ payables ตามลำดับคอลัมน์นี้:

```text
id, paid, description, company, gross, wht, net, vendor, accountNo, bank, ref, link, docDate, source
```

ถ้าแท็บเดิมมีหัวตารางต่างกัน ให้ปรับหัวตารางให้ตรง หรือเปลี่ยน mapping ใน `server/src/lib/googleWorkspace.js`
