import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession, apiPost } from '../api.js';
import AiPanel from './AiPanel.jsx';

const MENU = [
  { group: 'ภาพรวมธุรกิจ', items: [
    { key: 'home', path: '/', label: 'หน้าแรก' },
    { key: 'overview', path: '/overview', label: 'ภาพรวมธุรกิจ' },
    { key: 'dashboard', path: '/dashboard', label: 'รายช่องทาง' },
    { key: 'profit', path: '/profit', label: 'กำไร' }
  ]},
  { group: 'ปฏิบัติการ', items: [
    { key: 'upload', path: '/upload', label: 'นำเข้าข้อมูล' },
    { key: 'manual', path: '/manual', label: 'กรอกข้อมูล Manual' },
    { key: 'stockupdate', path: '/stockupdate', label: 'อัปเดตสต็อก' },
    { key: 'product-sales', path: '/product-sales', label: '🏆 สินค้าขายดี' },
    { key: 'products', path: '/products', label: 'สินค้า' },
    { key: 'ads', path: '/ads', label: 'โฆษณา (สรุป)' },
    { key: 'ads-entry', path: '/ads-entry', label: '📝 กรอกค่าแอดรายวัน' },
    { key: 'spreadsheet-ads', path: '/spreadsheet-ads', label: '📊 ค่าแอด Spreadsheet' },
    { key: 'accounting', path: '/accounting', label: 'ต้นทุนสินค้า (COGS)' },
    { key: 'payables', path: '/payables', label: 'บัญชีจ่าย' },
    { key: 'mtledger', path: '/mtledger', label: 'Modern Trade (GP)' },
    { key: 'liveplanner', path: '/liveplanner', label: 'MC Live Planner' }
  ]},
  { group: 'ตรวจสอบ', items: [
    { key: 'deepaudit', path: '/deepaudit', label: 'ตรวจสอบแพลตฟอร์ม' },
    { key: 'reconcile', path: '/reconcile', label: 'ตรวจสอบชนยอด' },
    { key: 'bankrecon', path: '/bankrecon', label: 'กระทบยอด Statement' },
    { key: 'uploadlog', path: '/uploadlog', label: 'ประวัติการอัปโหลด' }
  ]},
  { group: 'ตั้งค่าระบบ', items: [
    { key: 'fees', path: '/fees', label: 'ตั้งค่า Mapping / Fee' },
    { key: 'health', path: '/health', label: 'สุขภาพระบบ' },
    { key: 'users', path: '/users', label: 'ผู้ใช้และสิทธิ์' }
  ]}
];

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const perms = user?.permissions || [];
  const can = key => user?.role === 'ADMIN' || perms.includes(key);

  async function logout() {
    try { await apiPost('/auth/logout'); } catch {}
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">The Good <span>Million</span></div>
        {MENU.map(g => {
          const items = g.items.filter(i => can(i.key));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="group">{g.group}</div>
              {items.map(i => (
                <NavLink key={i.key} to={i.path} end={i.path === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="userbox">
          <div><b>{user?.displayName}</b></div>
          <div style={{ color: '#9ca3af' }}>{user?.role}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {can('ai') && <AiPanel />}
    </div>
  );
}
