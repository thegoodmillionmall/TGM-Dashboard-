import React, { useState, useRef, useEffect } from 'react';
import { getUser } from '../api.js';

/* ────────────────────────────────────────────────────
   เนื้อหาคู่มือแต่ละหน้า
──────────────────────────────────────────────────── */
const PAGES = [
  {
    key: 'login',
    icon: '🔐',
    label: 'เข้าสู่ระบบ',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    summary: 'หน้าแรกก่อนเข้าระบบ ใช้ username / password ที่ผู้ดูแลระบบกำหนดให้',
    tips: [
      { h: 'Username & Password', b: 'กรอก username และ password ที่ได้รับจาก admin แล้วกด "เข้าสู่ระบบ"' },
      { h: 'session หมดอายุ', b: 'ระบบตัด session อัตโนมัติหลัง 12 ชั่วโมง หน้าจะกลับมาหน้า login เอง' },
      { h: 'ลืมรหัส', b: 'ติดต่อ admin (หน้าผู้ใช้) ให้ reset รหัสผ่านใหม่ได้' },
    ]
  },
  {
    key: 'overview',
    icon: '📊',
    label: 'ภาพรวมผู้บริหาร',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'หน้าหลักแสดง KPI ยอดขาย กำไร ค่าโฆษณา ของทุกช่องทาง ดูภาพรวมธุรกิจได้ในหน้าเดียว',
    tips: [
      { h: 'เลือกช่วงวันที่', b: 'กล่องวันที่มุมบนขวา — เปลี่ยนได้ตลอด ข้อมูลทั้งหน้าจะอัปเดตตาม' },
      { h: 'KPI การ์ด (แถวบน)', b: 'แสดง GMV รวม, กำไรขั้นต้น (GP%), ค่าโฆษณา, ROAS — คลิกการ์ดเพื่อดูรายละเอียด' },
      { h: 'กราฟรายวัน', b: 'เส้นกราฟยอดขาย TikTok / Shopee รายวัน เปรียบเทียบกับค่าโฆษณา' },
      { h: 'ตารางช่องทาง', b: 'GMV แยก TikTok / Shopee / Modern Trade พร้อม % ค่าธรรมเนียมและ GP' },
    ]
  },
  {
    key: 'profit',
    icon: '💹',
    label: 'กำไร-ขาดทุน',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'งบกำไรขาดทุนรายเดือน แสดงรายได้ ต้นทุน ค่าใช้จ่าย และกำไรสุทธิ',
    tips: [
      { h: 'ตาราง P&L รายเดือน', b: 'แต่ละคอลัมน์คือเดือน แต่ละแถวคือรายการ เช่น GMV, ค่า Platform Fee, COGS, กำไรขั้นต้น' },
      { h: 'แถบกราฟ', b: 'กราฟแท่งด้านล่างแสดงกำไรขั้นต้นแต่ละเดือน เปรียบเทียบง่าย' },
      { h: 'ตัวเลขสีแดง', b: 'หมายถึงค่าใช้จ่ายหรือขาดทุน ตัวเลขสีเขียวคือกำไร' },
    ]
  },
  {
    key: 'product-sales',
    icon: '🛍️',
    label: 'สินค้าขายดี',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'ตารางสินค้าจัดอันดับตามยอดขาย แสดง SKU ยอด GP% และมี 4 แท็บ: ตลาด / สรุปรายอีเดือน / เทรนด์รายเดือน / รายเดือน',
    tips: [
      { h: 'แท็บ "ตลาด/สินค้า" (หลัก)', b: 'รายการ SKU จาก TikTok เรียงตามจำนวนขาย คลิกลูกศรซ้ายขยายดู variant ย่อย' },
      { h: 'แท็บ "สรุปรายอีเดือน"', b: 'ดูยอดขาย / GP แยกเดือนแบบ pivot' },
      { h: 'แท็บ "เทรนด์รายเดือน"', b: 'กราฟเส้นเปรียบเทียบแต่ละ SKU ข้ามเดือน' },
      { h: 'แท็บ "รายเดือน"', b: 'ตารางสรุปยอดรวมทุก SKU แยกเดือน' },
      { h: 'แท็ก SKU (สีต่างๆ)', b: 'แสดงกลุ่มสินค้า เช่น TG-Retox, TG-Karaglow — กรองได้โดยคลิก' },
      { h: 'KPI ด้านบน', b: '"ชิ้นขายได้" = ยอดรวมทุก SKU, "ยอดขายรวม" = GMV, "จำนวนตัวสินค้า" = SKU ที่มีข้อมูล' },
    ]
  },
  {
    key: 'ads',
    icon: '📣',
    label: 'สรุปโฆษณา',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'สรุปค่าโฆษณาและ ROAS ของ TikTok Ads, Shopee Ads, และ Meta Ads แยกรายเดือน',
    tips: [
      { h: 'กราฟเทรนด์รายเดือน (ด้านบน)', b: 'แท่ง = Spend และ Ads GMV, เส้น = ROAS แกนขวา — ดูสัดส่วนโฆษณาต่อยอดขาย' },
      { h: 'ตัวเลขบนกราฟ', b: 'Spend แสดงเป็น K/M, ROAS แสดงเป็น "Xx" — ROAS ≥3 = ดี (เขียว), 1-3 = พอ (เหลือง), <1 = แย่ (แดง)' },
      { h: 'ตารางสรุปรายเดือน', b: 'Month | Spend | Ads GMV | ROAS | Ads/GMV% — ดูรายละเอียดเป็นตัวเลข' },
      { h: 'ตารางช่องทาง (ล่าง)', b: 'Spend แยก TikTok / Shopee / Meta พร้อม GMV และ ROAS ของแต่ละ platform' },
      { h: 'โดนัทชาร์ต', b: 'สัดส่วน Spend ของแต่ละช่องทาง' },
      { h: 'กราฟรายวัน', b: 'เส้นค่าโฆษณาแต่ละวัน เปรียบเทียบช่องทาง' },
    ]
  },
  {
    key: 'stockupdate',
    icon: '📦',
    label: 'อัปเดตสต็อก',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'บันทึกและดูยอดคงเหลือสต็อกสินค้ารายวัน พร้อมต้นทุนรวมและยอดขายวันนี้',
    tips: [
      { h: 'วางข้อความสต็อก', b: 'คัดลอกข้อความนับสต็อกจากโกดัง วางในกล่อง แล้วกด "+ เพิ่มวัน/คำนวน" ระบบจะ parse อัตโนมัติ' },
      { h: 'Import Excel/CSV', b: 'กดปุ่ม "Excel" หรือ "CSV" เพื่อนำเข้าไฟล์ตาราง' },
      { h: 'กดบันทึกรายวัน', b: 'กดปุ่มสีมินต์ "บันทึกรายวัน" เพื่อ save ข้อมูลวันนั้นเข้า Supabase' },
      { h: 'ตารางด้านล่าง', b: 'แสดงคงเหลือรายสินค้า ต้นทุนหน่วย ราคาขาย มูลค่าสต็อก และยอดขายวันนั้น' },
      { h: 'แผง "ลำดับวันที่"', b: 'สรุปสต็อกรวมทุก SKU: คงเหลือ ต้นทุนรวม มูลค่าขาย และ COGS' },
      { h: 'ตั้งค่าต้นทุน/ราคาขาย', b: 'กดแถบ "ตั้งค่าต้นทุน/ราคาขาย" ด้านบน เพื่อกรอก/แก้ไขต้นทุนแต่ละ SKU' },
    ]
  },
  {
    key: 'accounting',
    icon: '💰',
    label: 'ต้นทุนสินค้า (COGS)',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'ตารางต้นทุนสินค้าแต่ละ SKU — ใช้คำนวณ GP ในทุกหน้าของระบบ',
    tips: [
      { h: 'ตารางต้นทุน', b: 'แสดงรหัสสินค้า ชื่อ SKU และต้นทุนต่อหน่วย (บาท)' },
      { h: 'แก้ไขต้นทุน', b: 'คลิกแถวแล้วแก้ไขตัวเลข — กด Save เพื่อบันทึก (ADMIN เท่านั้น)' },
      { h: 'ผลกระทบ', b: 'เมื่อแก้ไขต้นทุน ตัวเลข GP ทุกหน้าจะเปลี่ยนตาม (ข้อมูลคำนวณใหม่อัตโนมัติ)' },
    ]
  },
  {
    key: 'payables',
    icon: '🧾',
    label: 'บัญชีจ่าย',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    summary: 'บันทึกรายการค่าใช้จ่ายที่ต้องชำระ เช่น ค่าจ้าง ค่าเช่า ค่าวัตถุดิบ พร้อมสถานะการชำระ',
    tips: [
      { h: '+ เพิ่มรายการ', b: 'กดปุ่มสีเขียว "+" เพื่อเพิ่มรายการใหม่ — กรอกหัวข้อ จำนวน วันที่ และประเภท' },
      { h: 'สถานะการชำระ', b: '"รอดำเนินการ" = ยังไม่จ่าย, "จ่ายแล้ว" = ชำระเสร็จ — คลิกเพื่อเปลี่ยนสถานะ' },
      { h: 'ปุ่ม AI Draft', b: 'กดปุ่ม AI (มุมล่างขวา) แล้ว describe รายการ AI จะช่วย draft รายการให้อัตโนมัติ' },
      { h: 'ตาราง', b: 'แสดงทุกรายการ สามารถกรอง/เรียง ตามวันที่ ประเภท และสถานะ' },
    ]
  },
  {
    key: 'statements',
    icon: '📋',
    label: 'งบการเงิน',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'งบการเงินสรุปรายเดือนในรูปแบบ Statement — รายได้ ค่าใช้จ่าย และกำไรสุทธิ',
    tips: [
      { h: 'ตาราง Statement', b: 'แต่ละแถวคือหมวดรายได้หรือค่าใช้จ่าย แต่ละคอลัมน์คือเดือน' },
      { h: 'ยอดรวม', b: 'แถวล่างสุดคือกำไร/ขาดทุนสุทธิ ตัวเลขสีแดงคือขาดทุน' },
      { h: 'ส่งออก', b: 'กดปุ่ม Export เพื่อดาวน์โหลดเป็น Excel (ถ้ามี)' },
    ]
  },
  {
    key: 'mtledger',
    icon: '🏪',
    label: 'Modern Trade',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'บัญชีรายได้และ GP ของช่องทาง Modern Trade (ห้างสรรพสินค้า) แยกรายเดือน',
    tips: [
      { h: 'ตาราง GP Ledger', b: 'รายได้จากแต่ละ PO (Purchase Order) พร้อม COGS และ GP แต่ละเดือน' },
      { h: 'กรอกข้อมูล', b: 'หน้า Upload > Modern Trade — วางไฟล์ CSV ของ MT แล้ว refresh ข้อมูลจะปรากฏ' },
      { h: 'หมายเหตุ', b: 'MT ใช้การ append batch — ถ้ากรอก PO เดิมซ้ำอาจนับ 2 ครั้ง ตรวจสอบก่อน upload' },
    ]
  },
  {
    key: 'liveplanner',
    icon: '🎥',
    label: 'MC Live',
    roles: ['ADMIN', 'VIEWER', 'UPLOADER'],
    summary: 'ติดตามผลงาน MC Live: จัดอันดับ MC ตามยอดขาย ดูสรุปแต่ละ session',
    tips: [
      { h: 'อันดับ MC', b: 'ตารางด้านซ้ายเรียง MC ตามยอดขายสะสม มีจำนวน session และยอดเฉลี่ย' },
      { h: 'สรุปรายวัน', b: 'ตารางด้านขวาแสดงแต่ละ session: วันที่ MC ช่องทาง ยอดขาย และค่าคอมฯ' },
      { h: 'เพิ่ม session', b: 'กดปุ่ม "+ บันทึก Live" เพื่อกรอกข้อมูล session ใหม่' },
      { h: 'กรอง', b: 'เลือกช่วงวันที่ด้านบนเพื่อกรองข้อมูล' },
    ]
  },
  {
    key: 'upload',
    icon: '⬆️',
    label: 'อัปโหลดข้อมูล',
    roles: ['ADMIN', 'UPLOADER'],
    summary: 'นำเข้าไฟล์ CSV จาก TikTok / Shopee / Modern Trade — ระบบจะประมวลผลและ refresh ตัวเลขอัตโนมัติ',
    tips: [
      { h: 'ตาราง Coverage', b: 'แสดงสถานะข้อมูลแต่ละแหล่งว่ามีข้อมูลถึงวันไหน — ช่องว่างคือช่วงที่ยังไม่ได้ upload' },
      { h: 'เลือกประเภทไฟล์', b: 'ก่อน drag-drop ต้องเลือกประเภทก่อน เช่น TiktokOrder, ShopeeOrder, TiktokAnalytics' },
      { h: 'วางไฟล์', b: 'ลาก CSV มาวางในกล่อง หรือคลิกเพื่อ browse ไฟล์ ระบบจะ validate header อัตโนมัติ' },
      { h: 'Inbox อัตโนมัติ', b: 'วางไฟล์ไว้ใน folder inbox/ บนเครื่อง server แล้วระบบดูดเข้าเองทุก 10 นาที (ไม่ต้องเปิดหน้านี้)' },
      { h: 'Rollback', b: 'ถ้า upload ผิด ไปที่หน้า "ประวัติอัปโหลด" แล้วกด Rollback batch นั้น' },
    ]
  },
  {
    key: 'uploadlog',
    icon: '📜',
    label: 'ประวัติอัปโหลด',
    roles: ['ADMIN', 'VIEWER'],
    summary: 'ดูประวัติการ upload ทั้งหมด: วันที่ ผู้ upload ประเภทไฟล์ และสถานะ — รองรับ Rollback',
    tips: [
      { h: 'ตารางประวัติ', b: 'แสดงทุก batch: วันที่-เวลา ประเภท ไฟล์ ผู้ upload จำนวนแถว สถานะ' },
      { h: 'กด Rollback', b: 'กดปุ่ม "Rollback" ที่ batch ที่ต้องการลบ ระบบจะลบข้อมูล batch นั้นและ refresh ตัวเลขใหม่' },
      { h: 'สถานะ RECEIVED', b: 'batch ที่ active อยู่ — กด Rollback ได้' },
      { h: 'สถานะ ROLLED_BACK', b: 'batch ที่ถูก rollback แล้ว — ข้อมูลถูกลบออกจากระบบ' },
    ]
  },
  {
    key: 'fees',
    icon: '🗺️',
    label: 'ค่าธรรมเนียม & แมปปิ้ง',
    roles: ['ADMIN'],
    summary: 'แผนภาพแสดงการเชื่อมโยงข้อมูลจากแหล่งต่างๆ ไปยังตัวเลขใน Dashboard — ใช้ตรวจสอบว่าตัวเลขมาจากไหน',
    tips: [
      { h: 'แผนผังความเชื่อมโยง', b: 'กล่องซ้าย = แหล่งข้อมูล (raw files), กลาง = การคำนวณ, ขวา = ผลลัพธ์ใน Dashboard' },
      { h: 'ลากกล่องวางได้', b: 'แต่ละกล่องลากย้ายได้ เพื่อจัดวางให้อ่านง่ายขึ้น' },
      { h: 'คลิกกล่องไฮไลต์', b: 'คลิกกล่องใดกล่องหนึ่งจะไฮไลต์เส้นเชื่อมที่เกี่ยวข้อง' },
      { h: 'ดูตัวอย่างข้อมูล', b: 'กดไอคอน 🔍 ที่กล่อง แหล่งข้อมูล เพื่อดูตัวอย่างแถวข้อมูลจริง' },
    ]
  },
  {
    key: 'health',
    icon: '🏥',
    label: 'สุขภาพระบบ',
    roles: ['ADMIN'],
    summary: 'ตรวจสอบสถานะการเชื่อมต่อ Supabase และ RPC ต่างๆ — ใช้เมื่อสงสัยว่าระบบมีปัญหา',
    tips: [
      { h: 'กดตรวจสอบ', b: 'กดปุ่ม "ตรวจสอบอีกครั้ง" เพื่อ ping ทุก endpoint และดูผลลัพธ์' },
      { h: 'Refresh รายวัน', b: 'กด "Refresh สรุปวันทั้งหมด" เพื่อบังคับรีคำนวณ materialized view ใหม่' },
      { h: 'สีเขียว = ปกติ', b: 'ทุก check ผ่าน, สีแดง = มีปัญหา — แจ้ง admin เพื่อตรวจสอบ server' },
    ]
  },
  {
    key: 'users',
    icon: '👥',
    label: 'ผู้ใช้และสิทธิ์',
    roles: ['ADMIN'],
    summary: 'จัดการบัญชีผู้ใช้งานระบบ: เพิ่ม ลบ แก้ไข Role และ reset รหัสผ่าน (เฉพาะ ADMIN)',
    tips: [
      { h: 'Roles', b: 'ADMIN = เห็นทุกหน้า | VIEWER = เห็น dashboard ทั่วไป | UPLOADER = เข้าได้เฉพาะ upload/payables/mclive' },
      { h: '+ เพิ่มผู้ใช้', b: 'กดปุ่ม "+ เพิ่มผู้ใช้" กรอก username ชื่อแสดง role และรหัสผ่านชั่วคราว' },
      { h: 'แก้ไข', b: 'กดปุ่ม "แก้ไข" เพื่อเปลี่ยน role หรือ reset รหัสผ่านของผู้ใช้นั้น' },
      { h: 'ปิดใช้งาน', b: 'กด "ปิดใช้งาน" เพื่อระงับ account (ไม่ถูกลบ — เปิดใหม่ได้)' },
      { h: 'เข้าระบบล่าสุด', b: 'คอลัมน์ "เข้าระบบล่าสุด" แสดงเวลา login ครั้งล่าสุดของแต่ละ user' },
    ]
  },
];

/* ────────────────────────────────────────────────────
   Component
──────────────────────────────────────────────────── */
export default function HelpModal({ onClose }) {
  const user = getUser();
  const role = user?.role || 'VIEWER';

  // กรองหน้าตาม role
  const visiblePages = PAGES.filter(p => p.roles.includes(role));
  const [activeKey, setActiveKey] = useState(visiblePages[0]?.key || 'overview');
  const activePage = visiblePages.find(p => p.key === activeKey) || visiblePages[0];

  // ── Draggable ──
  const modalRef = useRef(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 });

  useEffect(() => {
    function onMove(e) {
      if (!drag.current.active) return;
      const nx = e.clientX - drag.current.startX;
      const ny = e.clientY - drag.current.startY;
      drag.current.dx = nx;
      drag.current.dy = ny;
      if (modalRef.current) {
        modalRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
      }
    }
    function onUp() { drag.current.active = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  function onHeaderMouseDown(e) {
    drag.current.active = true;
    drag.current.startX = e.clientX - drag.current.dx;
    drag.current.startY = e.clientY - drag.current.dy;
    e.preventDefault();
  }

  return (
    <>
      {/* Backdrop (กึ่งโปร่งใส — ยังคลิก background ได้) */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9998
      }} />

      {/* Modal */}
      <div ref={modalRef} style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        width: 780, maxWidth: '95vw',
        height: 540, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        fontFamily: 'Kanit, sans-serif',
      }}>

        {/* Header (draggable) */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            cursor: 'grab',
            background: 'linear-gradient(135deg, #1a2a3a 0%, #2d4a5a 100%)',
            padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            userSelect: 'none', flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📖</span>
            <div>
              <div style={{ color: '#B2D8D8', fontWeight: 700, fontSize: 16 }}>คู่มือการใช้งาน TGM Dashboard</div>
              <div style={{ color: '#7DB9B9', fontSize: 11 }}>The Good Million · BI System · {role}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 18, width: 32, height: 32,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar nav */}
          <div style={{
            width: 195, flexShrink: 0,
            background: '#f4f7f9',
            borderRight: '1px solid #e2e8f0',
            overflowY: 'auto',
            padding: '10px 0',
          }}>
            {visiblePages.map(p => (
              <button
                key={p.key}
                onClick={() => setActiveKey(p.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left',
                  padding: '8px 16px',
                  border: 'none',
                  background: activeKey === p.key ? '#B2D8D8' : 'transparent',
                  color: activeKey === p.key ? '#1a2a3a' : '#374151',
                  fontFamily: 'Kanit, sans-serif',
                  fontSize: 13.5, fontWeight: activeKey === p.key ? 700 : 400,
                  cursor: 'pointer',
                  borderLeft: activeKey === p.key ? '4px solid #5a9a9a' : '4px solid transparent',
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{p.icon}</span>
                <span style={{ lineHeight: 1.3 }}>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
            {activePage && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 28 }}>{activePage.icon}</span>
                  <h2 style={{ margin: 0, fontSize: 20, color: '#1a2a3a', fontWeight: 700 }}>{activePage.label}</h2>
                </div>

                <p style={{
                  margin: '0 0 20px', padding: '10px 14px',
                  background: '#f0f9f9', border: '1px solid #B2D8D8',
                  borderRadius: 8, fontSize: 14, color: '#374151', lineHeight: 1.6,
                }}>
                  {activePage.summary}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {activePage.tips.map((tip, i) => (
                    <div key={i} style={{
                      padding: '12px 16px',
                      background: '#fafafa',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      borderLeft: '4px solid #7DB9B9',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1a2a3a', marginBottom: 4 }}>
                        {tip.h}
                      </div>
                      <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.6 }}>
                        {tip.b}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Role badge */}
                <div style={{ marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {activePage.roles.map(r => (
                    <span key={r} style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: 11,
                      background: r === 'ADMIN' ? '#fee2e2' : r === 'UPLOADER' ? '#fef3c7' : '#d1fae5',
                      color: r === 'ADMIN' ? '#991b1b' : r === 'UPLOADER' ? '#92400e' : '#065f46',
                      fontWeight: 600,
                    }}>
                      {r}
                    </span>
                  ))}
                  <span style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'center' }}>สิทธิ์ที่เข้าถึงหน้านี้ได้</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: '10px 20px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#fafafa', fontSize: 12, color: '#9ca3af',
        }}>
          <span>💡 ลากหัวกล่องเพื่อเลื่อน · กด × หรือคลิกด้านนอกเพื่อปิด</span>
          <span>TGM BI Dashboard · nalatikan.a@gmail.com</span>
        </div>
      </div>
    </>
  );
}
