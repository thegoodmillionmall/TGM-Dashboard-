import React, { useState, useRef, useEffect } from 'react';
import { getUser } from '../api.js';

/* ═══════════════════════════════════════════════════════════════
   เนื้อหาคู่มือแต่ละหน้า (ภาษาทางการ)
═══════════════════════════════════════════════════════════════ */
const PAGES = [
  {
    key: 'login',
    icon: '🔐',
    label: 'การเข้าสู่ระบบ',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    img: '/help/login.jpg',
    summary: 'หน้าแรกของระบบสำหรับยืนยันตัวตนก่อนเข้าใช้งาน ผู้ใช้ต้องระบุ Username และ Password ที่ได้รับจากผู้ดูแลระบบ',
    tips: [
      { h: 'การลงชื่อเข้าใช้', b: 'กรอก Username และ Password ที่ได้รับ แล้วกดปุ่ม "เข้าสู่ระบบ" ระบบจะนำไปยังหน้าภาพรวมโดยอัตโนมัติ' },
      { h: 'Session หมดอายุ', b: 'ระบบจะยุติ Session อัตโนมัติหลังไม่มีการใช้งาน 12 ชั่วโมง และนำกลับมายังหน้าเข้าสู่ระบบ' },
      { h: 'รหัสผ่านสูญหาย', b: 'กรุณาติดต่อผู้ดูแลระบบ (ADMIN) เพื่อดำเนินการรีเซ็ตรหัสผ่านผ่านหน้าจัดการผู้ใช้' },
    ]
  },
  {
    key: 'overview',
    icon: '📊',
    label: 'ภาพรวมผู้บริหาร',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/overview.jpg',
    summary: 'แดชบอร์ดหลักสำหรับผู้บริหาร แสดงตัวชี้วัดสำคัญ (KPI) ของธุรกิจ ได้แก่ ยอดขาย กำไร ค่าโฆษณา และเทรนด์รายวัน ครอบคลุมทุกช่องทางจำหน่าย',
    tips: [
      { h: 'การเลือกช่วงเวลา', b: 'ใช้กล่องวันที่มุมบนขวาเพื่อกำหนดช่วงเวลาที่ต้องการ ข้อมูลทั้งหน้าจะอัปเดตตามช่วงที่เลือก' },
      { h: 'การ์ด KPI (แถวบนสุด)', b: 'แสดงยอดขายรวม (GMV) กำไรขั้นต้น (GP%) ค่าโฆษณา และ ROAS ของช่วงเวลาที่เลือก' },
      { h: 'กราฟยอดขายรายวัน', b: 'แสดงยอดขายแยกตามช่องทาง TikTok / Shopee รายวัน เพื่อดูแนวโน้มและความผันผวน' },
      { h: 'ตารางสรุปช่องทาง', b: 'สรุปยอดขาย ค่าธรรมเนียม และกำไรขั้นต้น แยกตาม TikTok / Shopee / Modern Trade' },
    ]
  },
  {
    key: 'profit',
    icon: '💹',
    label: 'กำไร-ขาดทุน',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/profit.jpg',
    summary: 'รายงานกำไรขาดทุนรายเดือน (P&L Statement) แสดงรายได้ ต้นทุน ค่าธรรมเนียม และกำไรสุทธิ สำหรับวิเคราะห์สุขภาพทางการเงินของธุรกิจ',
    tips: [
      { h: 'การ์ด KPI สรุปช่วงเวลา', b: 'แสดง GMV รวม ค่าธรรมเนียมแพลตฟอร์ม ค่าโฆษณา ต้นทุนสินค้า (COGS) และกำไรสุทธิ' },
      { h: 'กราฟแท่งรายเดือน', b: 'แสดงกำไรขั้นต้นและยอดขาย GMV แยกช่องทาง เปรียบเทียบแต่ละเดือน' },
      { h: 'ตาราง P&L รายเดือน', b: 'แต่ละคอลัมน์คือเดือน แต่ละแถวคือรายการ เช่น GMV ค่า Platform Fee ค่าโฆษณา COGS และกำไรสุทธิ' },
      { h: 'การตีความสี', b: 'ตัวเลขสีแดงหมายถึงค่าใช้จ่ายหรือขาดทุน ตัวเลขสีเขียวหมายถึงรายได้หรือกำไร' },
    ]
  },
  {
    key: 'product-sales',
    icon: '🛍️',
    label: 'สินค้าขายดี',
    roles: ['ADMIN', 'VIEWER'],
    img: null,
    summary: 'ตารางจัดอันดับสินค้าตามยอดขาย แสดงจำนวนชิ้น ยอดขาย และกำไรขั้นต้น แยกตาม SKU และกลุ่มสินค้า มี 4 มุมมองให้เลือก',
    tips: [
      { h: 'แท็บ "ตลาด/สินค้า" (ค่าเริ่มต้น)', b: 'แสดงรายการ SKU จากทุกช่องทาง เรียงตามจำนวนขาย คลิกลูกศรเพื่อขยายดู Variant ย่อย' },
      { h: 'แท็บ "สรุปรายเดือน"', b: 'มุมมอง Pivot แสดงยอดขายและ GP แยกตามเดือน เพื่อวิเคราะห์แนวโน้มรายสินค้า' },
      { h: 'แท็บ "เทรนด์รายเดือน"', b: 'กราฟเส้นแสดงยอดขายของแต่ละ SKU ข้ามเดือน เพื่อเปรียบเทียบแนวโน้ม' },
      { h: 'แท็ก SKU (สีต่างๆ)', b: 'แสดงกลุ่มสินค้า เช่น TG-Retox TG-Karaglow — คลิกเพื่อกรองเฉพาะกลุ่มที่ต้องการ' },
      { h: 'การ์ด KPI ด้านบน', b: '"ชิ้นขายได้" คือยอดรวมทุก SKU, "ยอดขายรวม" คือ GMV, "จำนวน SKU" คือจำนวนสินค้าที่มีข้อมูล' },
    ]
  },
  {
    key: 'ads',
    icon: '📣',
    label: 'สรุปโฆษณา',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/ads.jpg',
    summary: 'วิเคราะห์ประสิทธิภาพโฆษณา แสดงค่าใช้จ่าย (Spend) ยอดขายจากโฆษณา (Ads GMV) และ ROAS แยกตามช่องทาง TikTok Ads / Shopee Ads / Meta Ads รายเดือน',
    tips: [
      { h: 'กราฟเทรนด์รายเดือน (ด้านบน)', b: 'แท่งสีแสดง Spend และ Ads GMV เส้นสีม่วงแสดง ROAS บนแกนขวา ดูสัดส่วนค่าโฆษณาต่อยอดขาย' },
      { h: 'การตีความ ROAS', b: 'ROAS ≥ 3 (สีเขียว) = ประสิทธิภาพดี | ROAS 1–3 (สีเหลือง) = พอใช้ | ROAS < 1 (สีแดง) = ควรทบทวนกลยุทธ์' },
      { h: 'ตารางสรุปรายเดือน', b: 'แสดง Spend / Ads GMV / ROAS / สัดส่วน Ads ต่อ GMV (%) เพื่อติดตามประสิทธิภาพโฆษณาในแต่ละเดือน' },
      { h: 'ตารางแยกช่องทาง', b: 'เปรียบเทียบ Spend และ ROAS ระหว่าง TikTok / Shopee / Meta เพื่อจัดสรรงบประมาณโฆษณาอย่างเหมาะสม' },
      { h: 'แผนภูมิโดนัท', b: 'แสดงสัดส่วนงบโฆษณาของแต่ละแพลตฟอร์มในเชิงภาพ' },
    ]
  },
  {
    key: 'stockupdate',
    icon: '📦',
    label: 'อัปเดตสต็อก',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/stockupdate.jpg',
    summary: 'บันทึกยอดคงเหลือสต็อกสินค้ารายวัน พร้อมคำนวณมูลค่าสต็อก ต้นทุนรวม และยอดขายของวันโดยอัตโนมัติ',
    tips: [
      { h: 'การวางข้อความสต็อก', b: 'คัดลอกข้อความนับสต็อกจากโกดังมาวางในกล่อง แล้วกด "+ เพิ่มวัน/คำนวน" ระบบจะวิเคราะห์ข้อมูลให้อัตโนมัติ' },
      { h: 'การนำเข้าจากไฟล์', b: 'กดปุ่ม "Excel" หรือ "CSV" เพื่อนำเข้าข้อมูลสต็อกจากไฟล์ตาราง' },
      { h: 'การบันทึกข้อมูล', b: 'กดปุ่ม "บันทึกรายวัน" เพื่อบันทึกข้อมูลของวันนั้นเข้าฐานข้อมูล ระบบจะแสดงยืนยัน' },
      { h: 'ตารางรายสินค้า', b: 'แสดงคงเหลือแต่ละ SKU พร้อมต้นทุนหน่วย ราคาขาย มูลค่าสต็อกรวม และยอดขายวันนั้น' },
      { h: 'แผงสรุปวันนี้ (มุมขวา)', b: 'แสดงคงเหลือรวมทุก SKU มูลค่าสต็อก ยอดขายวันนี้ COGS และรายได้จากการขาย' },
      { h: 'การตั้งค่าต้นทุน', b: 'กดแถบ "ตั้งค่าต้นทุน/ราคาขาย" ด้านบนเพื่อแก้ไขต้นทุนต่อหน่วยของแต่ละ SKU' },
    ]
  },
  {
    key: 'accounting',
    icon: '💰',
    label: 'ต้นทุนสินค้า (COGS)',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/accounting.jpg',
    summary: 'จัดการต้นทุนสินค้า (Cost of Goods Sold) ต่อหน่วยของแต่ละ SKU ข้อมูลต้นทุนนี้ถูกใช้ในการคำนวณกำไรขั้นต้นทุกหน้าของระบบ',
    tips: [
      { h: 'ตารางต้นทุน', b: 'แสดงรหัสสินค้า ชื่อ SKU แพลตฟอร์ม และต้นทุนต่อหน่วย (บาท) ของสินค้าทั้งหมด' },
      { h: 'การแก้ไขต้นทุน', b: 'คลิกแก้ไขต้นทุนในแถวที่ต้องการ แล้วกดบันทึก ระบบจะอัปเดตการคำนวณ GP ในทุกหน้าโดยอัตโนมัติ' },
      { h: 'สถานะ "ยังไม่ตั้งค่า"', b: 'SKU ที่ยังไม่มีต้นทุนจะแสดงสีส้ม ควรตั้งค่าให้ครบเพื่อให้ตัวเลขกำไรถูกต้อง' },
      { h: 'การนำเข้าจาก Excel', b: 'กดปุ่ม "Import Excel" เพื่อนำเข้าข้อมูลต้นทุนหลายรายการพร้อมกัน' },
    ]
  },
  {
    key: 'payables',
    icon: '🧾',
    label: 'บัญชีจ่าย (Payables)',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    img: '/help/payables.jpg',
    summary: 'บันทึกและติดตามรายการค่าใช้จ่ายที่ต้องชำระ เช่น ค่าจ้างบุคลากร ค่าเช่า ค่าวัตถุดิบ พร้อมสถานะการชำระเงิน รองรับ AI ช่วยบันทึกรายการ',
    tips: [
      { h: 'AI ช่วยบันทึกรายจ่าย', b: 'พิมพ์รายละเอียดค่าใช้จ่ายในภาษาธรรมชาติ เช่น "จ่ายค่าจ้าง 12,500 บาท" แล้วกด "AI อ่านและจัดทำ" ระบบจะกรอกข้อมูลให้อัตโนมัติ' },
      { h: 'การเพิ่มรายการ', b: 'กดปุ่ม "+ เพิ่มรายการใหม่" เพื่อกรอกรายละเอียดด้วยตนเอง ได้แก่ ประเภท บริษัท รายละเอียด และยอดเงิน' },
      { h: 'การติดตามสถานะ', b: '"รอดำเนินการ" = ยังไม่ชำระ (สีแดง) | "จ่ายแล้ว" = ชำระเสร็จสิ้น (สีเขียว) — คลิกเพื่อเปลี่ยนสถานะ' },
      { h: 'การ์ดสรุปยอด', b: 'แสดงยอดรอจ่าย ยอดจ่ายแล้ว ยอดรวม และเป้าหมายงบประมาณ' },
    ]
  },
  {
    key: 'statements',
    icon: '📋',
    label: 'งบการเงิน',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/statements.jpg',
    summary: 'งบกำไรขาดทุน (Income Statement) แสดงรายได้ ต้นทุน ค่าใช้จ่าย และกำไรสุทธิรายเดือน รูปแบบมาตรฐานทางบัญชี',
    tips: [
      { h: 'การ์ดสรุปภาพรวม', b: 'แสดงรายได้รวม ต้นทุนรวม ค่าใช้จ่ายรวม และกำไรสุทธิของช่วงที่เลือก พร้อม Net Margin %' },
      { h: 'งบรายเดือน', b: 'แสดงกำไรขาดทุนแยกตามเดือน พร้อม % Margin เปรียบเทียบเดือนต่อเดือน' },
      { h: 'รายละเอียดหมวดหมู่', b: 'คลิกดูรายละเอียดหมวดรายได้และค่าใช้จ่าย ได้แก่ ยอดขาย ต้นทุนสินค้า ค่าธรรมเนียม และค่าใช้จ่ายดำเนินงาน' },
      { h: 'การเพิ่มเดือน', b: 'กดปุ่ม "+ เพิ่มเดือนใหม่" เพื่อกรอกข้อมูลการเงินของเดือนที่ยังไม่มีในระบบ' },
    ]
  },
  {
    key: 'mtledger',
    icon: '🏪',
    label: 'Modern Trade',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/mtledger.jpg',
    summary: 'บัญชีรายรับ-รายจ่ายช่องทาง Modern Trade (ห้างสรรพสินค้า) แสดงยอดขาย เงินรับจริง คงเหลือ และ GP รายเดือน',
    tips: [
      { h: 'ตารางสรุปรายเดือน', b: 'แสดงยอดขาย (ก่อน GP) เงินรับจริง รายการจ่าย และคงเหลือแต่ละเดือน' },
      { h: 'การ์ด KPI ด้านบน', b: 'สรุปยอดขายรวม ยอดหลัง GP เงินรับจริง ค่าใช้จ่าย และ GP% โดยรวม' },
      { h: 'การแก้ไขรายการ', b: 'กดไอคอนดินสอ (✏️) ที่แถวเดือนที่ต้องการแก้ไขยอดรับหรือยอดจ่าย' },
      { h: 'หมายเหตุ', b: 'ข้อมูล Modern Trade นำเข้าผ่านหน้า "อัปโหลดข้อมูล" — ตรวจสอบว่า PO ไม่ซ้ำก่อน upload เพื่อป้องกันการนับซ้ำ' },
    ]
  },
  {
    key: 'liveplanner',
    icon: '🎥',
    label: 'MC Live',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    img: '/help/liveplanner.jpg',
    summary: 'ติดตามและวิเคราะห์ผลการ Live ขาย แสดงอันดับ MC ตามยอดขายสะสม จำนวน Session ชั่วโมง และค่าเฉลี่ยต่อ Session',
    tips: [
      { h: 'การ์ดสรุปภาพรวม', b: 'แสดงยอดขายรวม จำนวน Live จำนวนชั่วโมง ยอดออเดอร์ และค่า Ads ของช่วงที่เลือก' },
      { h: 'อันดับ MC (ตารางซ้าย)', b: 'จัดอันดับ MC ตามยอดขายสะสม แสดงจำนวน Session เวลา และยอดเฉลี่ยต่อ Session' },
      { h: 'สรุปรายวัน (ตารางขวา)', b: 'แสดงรายละเอียดแต่ละ Session: วันที่ MC ช่องทาง ยอดขาย จำนวน Order และเวลา Live' },
      { h: 'การบันทึก Session ใหม่', b: 'กดปุ่ม "นำเข้า Excel เก่า" หรือกรอกในตาราง "แก้ไขตาราง" เพื่อเพิ่มข้อมูล Session' },
    ]
  },
  {
    key: 'upload',
    icon: '⬆️',
    label: 'อัปโหลดข้อมูล',
    roles: ['ADMIN', 'UPLOADER'],
    img: '/help/upload.jpg',
    summary: 'นำเข้าไฟล์ข้อมูลดิบจากแพลตฟอร์มต่างๆ ได้แก่ TikTok / Shopee / Modern Trade ระบบจะประมวลผลและอัปเดตตัวเลขในทุกหน้าโดยอัตโนมัติ',
    tips: [
      { h: 'ตาราง Coverage', b: 'แสดงสถานะข้อมูลแต่ละแหล่ง ✓ = มีข้อมูล ⚠ = มีบางส่วน ✗ = ไม่มีข้อมูล — ใช้ระบุว่าเดือนใดยังขาดข้อมูล' },
      { h: 'Sync จาก Google Sheets', b: 'กดปุ่ม "Sync ตอนนี้" เพื่อดึงข้อมูลล่าสุดจาก Google Sheets ที่เชื่อมต่อไว้' },
      { h: 'อัปโหลดไฟล์ CSV', b: 'ลากไฟล์ CSV มาวางในกล่อง "คิวอัปโหลด" หรือกด "เพิ่มไฟล์" เพื่อเลือกไฟล์ ระบบจะตรวจสอบรูปแบบอัตโนมัติ' },
      { h: 'Inbox อัตโนมัติ', b: 'วางไฟล์ใน Folder inbox/ บนเครื่อง Server ระบบจะนำเข้าข้อมูลอัตโนมัติทุก 10 นาทีโดยไม่ต้องเปิดหน้านี้' },
      { h: 'การ Rollback', b: 'หากอัปโหลดข้อมูลผิดพลาด ให้ไปที่หน้า "ประวัติอัปโหลด" และกด Rollback เพื่อยกเลิก Batch นั้น' },
    ]
  },
  {
    key: 'uploadlog',
    icon: '📜',
    label: 'ประวัติอัปโหลด',
    roles: ['ADMIN', 'VIEWER'],
    img: '/help/uploadlog.jpg',
    summary: 'บันทึกประวัติการนำเข้าข้อมูลทั้งหมด แสดงวันที่ ผู้อัปโหลด ประเภทไฟล์ ช่วงข้อมูล และสถานะ รองรับการ Rollback เพื่อยกเลิกข้อมูล',
    tips: [
      { h: 'ตารางประวัติ', b: 'แสดง Batch ทุกรายการ: วันที่-เวลา ผู้อัปโหลด ประเภทแพลตฟอร์ม ชื่อไฟล์ จำนวนแถว ช่วงข้อมูล และสถานะ' },
      { h: 'สถานะ RECEIVED', b: 'Batch ที่ยังใช้งานอยู่ในระบบ — สามารถ Rollback ได้' },
      { h: 'สถานะ ROLLED_BACK', b: 'Batch ที่ถูกยกเลิกแล้ว — ข้อมูลถูกลบออกจากฐานข้อมูล' },
      { h: 'การ Rollback', b: 'กดปุ่ม "Rollback" ที่ Batch ที่ต้องการยกเลิก ระบบจะลบข้อมูล Batch นั้นและคำนวณตัวเลขใหม่ทันที' },
    ]
  },
  {
    key: 'fees',
    icon: '🗺️',
    label: 'ค่าธรรมเนียม & แมปปิ้ง',
    roles: ['ADMIN'],
    img: '/help/fees.jpg',
    summary: 'แผนภาพแสดงความเชื่อมโยงระหว่างแหล่งข้อมูลดิบ สูตรคำนวณ และตัวเลขที่แสดงใน Dashboard ใช้ตรวจสอบที่มาของตัวเลขและแก้ไขปัญหา',
    tips: [
      { h: 'โครงสร้างแผนภาพ', b: 'กล่องซ้าย = แหล่งข้อมูล (raw files) | กล่องกลาง = สูตรคำนวณ | กล่องขวา = ตัวเลขที่แสดงใน Dashboard' },
      { h: 'การลากย้ายกล่อง', b: 'แต่ละกล่องสามารถลากย้ายตำแหน่งได้ เพื่อจัดวางให้อ่านง่ายขึ้นตามความต้องการ' },
      { h: 'การไฮไลต์เส้นเชื่อม', b: 'คลิกที่กล่องใดกล่องหนึ่งเพื่อไฮไลต์เส้นที่เกี่ยวข้อง แสดงว่าข้อมูลไหลไปยังที่ใด' },
      { h: 'การดูข้อมูลตัวอย่าง', b: 'กดไอคอน 🔍 ที่กล่องแหล่งข้อมูล เพื่อดูตัวอย่างแถวข้อมูลจริงจากฐานข้อมูล' },
    ]
  },
  {
    key: 'health',
    icon: '🏥',
    label: 'สุขภาพระบบ',
    roles: ['ADMIN'],
    img: '/help/health.jpg',
    summary: 'ตรวจสอบสถานะการเชื่อมต่อฐานข้อมูล Supabase ประสิทธิภาพ RPC และบริการเสริมของระบบ ใช้เมื่อสงสัยว่ามีปัญหาด้านระบบ',
    tips: [
      { h: 'การตรวจสอบสถานะ', b: 'กดปุ่ม "ตรวจสอบอีกครั้ง" เพื่อ Ping ทุก Endpoint และดูผลลัพธ์การเชื่อมต่อ' },
      { h: 'การตีความสถานะ', b: '"OK" (สีเขียว) = ทำงานปกติ | หากแสดงข้อผิดพลาด ให้แจ้งผู้ดูแลระบบเพื่อตรวจสอบ Server' },
      { h: 'เวลาตอบสนอง', b: 'คอลัมน์ "เวลา (ms)" แสดงความเร็วการตอบสนองของแต่ละบริการ ค่าปกติควรต่ำกว่า 1,000 ms' },
      { h: 'Refresh สรุปรายวัน', b: 'กด "Refresh สรุปวันทั้งหมด" เพื่อบังคับคำนวณ Materialized View ใหม่ทั้งหมด ใช้เมื่อตัวเลขดูผิดปกติ' },
    ]
  },
  {
    key: 'users',
    icon: '👥',
    label: 'จัดการผู้ใช้และสิทธิ์',
    roles: ['ADMIN'],
    img: '/help/users.jpg',
    summary: 'จัดการบัญชีผู้ใช้งานระบบ กำหนด Role และสิทธิ์การเข้าถึง รองรับการเพิ่ม แก้ไข ปิดใช้งาน และ Reset รหัสผ่าน (เฉพาะ ADMIN)',
    tips: [
      { h: 'ประเภท Role', b: 'ADMIN = เข้าถึงทุกหน้า | VIEWER = ดูข้อมูล Dashboard ทั่วไป | UPLOADER = อัปโหลดข้อมูล บัญชีจ่าย และ MC Live เท่านั้น' },
      { h: 'การเพิ่มผู้ใช้ใหม่', b: 'กดปุ่ม "+ เพิ่มผู้ใช้" กรอก Username ชื่อแสดง Role และรหัสผ่านชั่วคราว แล้วแจ้งให้ผู้ใช้เปลี่ยนรหัสเอง' },
      { h: 'การแก้ไขและ Reset รหัสผ่าน', b: 'กดปุ่ม "แก้ไข" ที่แถวผู้ใช้ที่ต้องการ สามารถเปลี่ยน Role หรือกำหนดรหัสผ่านใหม่ได้' },
      { h: 'การปิดใช้งาน', b: 'กด "ปิดใช้งาน" เพื่อระงับ Account ชั่วคราว (ข้อมูลยังคงอยู่ สามารถเปิดใช้งานใหม่ได้ภายหลัง)' },
      { h: 'การตรวจสอบการใช้งาน', b: 'คอลัมน์ "เข้าระบบล่าสุด" แสดงวันเวลา Login ครั้งล่าสุดของแต่ละผู้ใช้' },
    ]
  },
];

/* ═══════════════════════════════════════════════════════════════
   Component หลัก
═══════════════════════════════════════════════════════════════ */
export default function HelpModal({ onClose }) {
  const user = getUser();
  const role = user?.role || 'VIEWER';

  const visiblePages = PAGES.filter(p => p.roles.includes(role));
  const [activeKey, setActiveKey] = useState(visiblePages[0]?.key || 'overview');
  const activePage = visiblePages.find(p => p.key === activeKey) || visiblePages[0];

  /* ── Draggable ── */
  const modalRef = useRef(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 });

  useEffect(() => {
    function onMove(e) {
      if (!drag.current.active) return;
      const nx = e.clientX - drag.current.startX;
      const ny = e.clientY - drag.current.startY;
      drag.current.dx = nx; drag.current.dy = ny;
      if (modalRef.current) modalRef.current.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    }
    function onUp() { drag.current.active = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  function onHeaderDown(e) {
    drag.current.active = true;
    drag.current.startX = e.clientX - drag.current.dx;
    drag.current.startY = e.clientY - drag.current.dy;
    e.preventDefault();
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(10,20,30,0.55)', zIndex:9998, backdropFilter:'blur(2px)' }} />

      <div ref={modalRef} style={{
        position:'fixed', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        zIndex:9999, width:900, maxWidth:'96vw',
        height:580, maxHeight:'92vh',
        display:'flex', flexDirection:'column',
        background:'#ffffff', borderRadius:16,
        boxShadow:'0 24px 80px rgba(0,0,0,0.35)',
        overflow:'hidden', fontFamily:'Kanit, sans-serif',
        border:'1px solid rgba(178,216,216,0.3)',
      }}>

        {/* ── Header ── */}
        <div onMouseDown={onHeaderDown} style={{
          cursor:'grab', flexShrink:0, userSelect:'none',
          background:'linear-gradient(135deg, #1a2a3a 0%, #243b4a 100%)',
          padding:'14px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          borderBottom:'2px solid #7DB9B9',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:38, height:38, borderRadius:10,
              background:'rgba(178,216,216,0.2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20,
            }}>📖</div>
            <div>
              <div style={{ color:'#ffffff', fontWeight:700, fontSize:15, letterSpacing:0.3 }}>
                คู่มือการใช้งานระบบ TGM BI Dashboard
              </div>
              <div style={{ color:'#7DB9B9', fontSize:11, marginTop:2 }}>
                The Good Million · ระดับสิทธิ์: <span style={{ color:'#B2D8D8', fontWeight:600 }}>{role}</span>
                <span style={{ marginLeft:12, opacity:0.6 }}>ลากส่วนหัวเพื่อเลื่อน</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)',
            borderRadius:8, color:'#B2D8D8', fontSize:20, width:34, height:34,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all .15s',
          }}>×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width:200, flexShrink:0,
            background:'#f8fafa', borderRight:'1px solid #e2e8f0',
            overflowY:'auto', padding:'8px 0',
          }}>
            {visiblePages.map(p => (
              <button key={p.key} onClick={() => setActiveKey(p.key)} style={{
                display:'flex', alignItems:'center', gap:8,
                width:'100%', textAlign:'left', padding:'9px 14px',
                border:'none', cursor:'pointer',
                background: activeKey === p.key ? '#e8f5f5' : 'transparent',
                color: activeKey === p.key ? '#1a2a3a' : '#4b5563',
                fontFamily:'Kanit, sans-serif', fontSize:13,
                fontWeight: activeKey === p.key ? 700 : 400,
                borderLeft: activeKey === p.key ? '3px solid #5a9a9a' : '3px solid transparent',
                transition:'all .12s',
              }}>
                <span style={{ fontSize:15, flexShrink:0 }}>{p.icon}</span>
                <span style={{ lineHeight:1.3 }}>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:'auto', padding:'0' }}>
            {activePage && (
              <>
                {/* Screenshot */}
                {activePage.img ? (
                  <div style={{ position:'relative', background:'#1a2a3a', borderBottom:'1px solid #e2e8f0' }}>
                    <img
                      src={activePage.img}
                      alt={`หน้า${activePage.label}`}
                      style={{ width:'100%', display:'block', maxHeight:240, objectFit:'cover', objectPosition:'top', opacity:0.95 }}
                      onError={e => { e.target.style.display='none'; e.target.parentNode.style.display='none'; }}
                    />
                    <div style={{
                      position:'absolute', bottom:0, left:0, right:0,
                      background:'linear-gradient(transparent, rgba(26,42,58,0.85))',
                      padding:'24px 20px 12px',
                    }}>
                      <div style={{ color:'#B2D8D8', fontSize:11, fontWeight:600, letterSpacing:1, textTransform:'uppercase' }}>
                        ภาพหน้าจอระบบ
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    height:80, background:'linear-gradient(135deg,#1a2a3a,#243b4a)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    borderBottom:'1px solid #e2e8f0',
                  }}>
                    <span style={{ fontSize:32 }}>{activePage.icon}</span>
                  </div>
                )}

                {/* Text content */}
                <div style={{ padding:'20px 24px' }}>
                  {/* Title */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:24 }}>{activePage.icon}</span>
                    <h2 style={{ margin:0, fontSize:19, color:'#1a2a3a', fontWeight:700 }}>{activePage.label}</h2>
                  </div>

                  {/* Summary */}
                  <p style={{
                    margin:'0 0 18px', padding:'11px 14px',
                    background:'#f0f9f9', border:'1px solid #B2D8D8',
                    borderRadius:8, fontSize:13.5, color:'#374151', lineHeight:1.7,
                  }}>
                    {activePage.summary}
                  </p>

                  {/* Tips */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {activePage.tips.map((tip, i) => (
                      <div key={i} style={{
                        display:'flex', gap:12,
                        padding:'11px 14px', borderRadius:10,
                        background:'#fafbfc', border:'1px solid #e9ecef',
                        borderLeft:'4px solid #7DB9B9',
                      }}>
                        <div style={{
                          flexShrink:0, width:22, height:22, borderRadius:11,
                          background:'#1a2a3a', color:'#B2D8D8',
                          fontSize:11, fontWeight:700,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          marginTop:1,
                        }}>{i+1}</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color:'#1a2a3a', marginBottom:3 }}>{tip.h}</div>
                          <div style={{ fontSize:13, color:'#4b5563', lineHeight:1.65 }}>{tip.b}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Role badges */}
                  <div style={{ marginTop:18, paddingTop:14, borderTop:'1px solid #e9ecef', display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, color:'#9ca3af', marginRight:4 }}>สิทธิ์ที่เข้าถึงได้:</span>
                    {activePage.roles.map(r => (
                      <span key={r} style={{
                        padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                        background: r==='ADMIN'?'#fee2e2': r==='UPLOADER'?'#fef3c7':'#d1fae5',
                        color: r==='ADMIN'?'#991b1b': r==='UPLOADER'?'#92400e':'#065f46',
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          flexShrink:0, padding:'9px 20px',
          borderTop:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'#f8fafa', fontSize:11, color:'#9ca3af',
        }}>
          <span>© The Good Million · BI Dashboard · เวอร์ชันคู่มือ สิงหาคม 2569</span>
          <span style={{ color:'#7DB9B9' }}>nalatikan.a@gmail.com</span>
        </div>
      </div>
    </>
  );
}
