import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../api.js';

const CARDS = [
  { key: 'overview', path: '/overview', t: 'ภาพรวมธุรกิจ', d: 'ยอดขาย กำไร ROAS ทุกแพลตฟอร์ม' },
  { key: 'dashboard', path: '/dashboard', t: 'รายช่องทาง', d: 'เจาะราย TikTok / Shopee / Modern Trade' },
  { key: 'products', path: '/products', t: 'สินค้า', d: 'ยอดขายและกำไรต่อสินค้า' },
  { key: 'ads', path: '/ads', t: 'โฆษณา', d: 'ค่าโฆษณาและ ROAS แยกช่องทาง' },
  { key: 'deepaudit', path: '/deepaudit', t: 'ตรวจสอบแพลตฟอร์ม', d: 'GMV audit เทียบหลายแหล่งข้อมูล' },
  { key: 'reconcile', path: '/reconcile', t: 'ตรวจสอบชนยอด', d: 'กระทบยอดโอนกับยอดขาย' },
  { key: 'profit', path: '/profit', t: 'กำไร', d: 'กำไรต่อแพลตฟอร์ม / สินค้า' },
  { key: 'upload', path: '/upload', t: 'นำเข้าข้อมูล', d: 'อัปโหลดไฟล์ CSV จากแพลตฟอร์ม' },
  { key: 'manual', path: '/manual', t: 'กรอกข้อมูล Manual', d: 'รายรับรายจ่าย / Modern Trade' },
  { key: 'payables', path: '/payables', t: 'บัญชีจ่าย', d: 'ติดตามหนี้ที่ต้องจ่ายและเอกสาร' },
  { key: 'liveplanner', path: '/liveplanner', t: 'MC Live Planner', d: 'วางแผนและติดตามผลไลฟ์' },
  { key: 'uploadlog', path: '/uploadlog', t: 'ประวัติการอัปโหลด', d: 'ดู log และ rollback' },
  { key: 'health', path: '/health', t: 'สุขภาพระบบ', d: 'สถานะ Supabase และ RPC' },
  { key: 'users', path: '/users', t: 'ผู้ใช้และสิทธิ์', d: 'จัดการบัญชีผู้ใช้' }
];

export default function Home() {
  const user = getUser();
  const navigate = useNavigate();
  const can = key => user?.role === 'ADMIN' || (user?.permissions || []).includes(key);
  return (
    <div>
      <div className="page-title">สวัสดี {user?.displayName}</div>
      <div className="page-sub">The Good Million — BI Dashboard (Local Edition)</div>
      <div className="home-cards">
        {CARDS.filter(c => can(c.key)).map(c => (
          <div key={c.key} className="home-card" onClick={() => navigate(c.path)}>
            <div className="t">{c.t}</div>
            <div className="d">{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
