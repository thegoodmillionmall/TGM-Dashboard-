import React, { useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession, apiPost } from '../api.js';
import AiPanel from './AiPanel.jsx';

const MENU = [
  { group: 'ภาพรวม', items: [
    { key: 'home',         path: '/',             label: 'หน้าแรก' },
    { key: 'overview',     path: '/overview',     label: 'ยอดรวมทุกช่องทาง' },
    { key: 'dashboard',    path: '/dashboard',    label: 'แยกช่องทาง' },
    { key: 'profit',       path: '/profit',       label: 'กำไร-ขาดทุน' },
    { key: 'product-sales',path: '/product-sales',label: 'สินค้าขายดี' }
  ]},
  { group: 'โฆษณา', items: [
    { key: 'ads',           path: '/ads',            label: 'สรุปโฆษณา' },
    { key: 'ads-entry',     path: '/ads-entry',      label: 'กรอกค่าแอดรายวัน' },
    { key: 'spreadsheet-ads',path: '/spreadsheet-ads',label: 'ค่าแอด (ตาราง)' }
  ]},
  { group: 'สินค้า & ต้นทุน', items: [
    { key: 'products',     path: '/products',     label: 'รายการสินค้า' },
    { key: 'stockupdate',  path: '/stockupdate',  label: 'อัปเดตสต็อก' },
    { key: 'accounting',   path: '/accounting',   label: 'ต้นทุนสินค้า' }
  ]},
  { group: 'การเงิน', items: [
    { key: 'payables',     path: '/payables',     label: 'บัญชีจ่าย' },
    { key: 'mtledger',     path: '/mtledger',     label: 'Modern Trade' },
    { key: 'liveplanner',  path: '/liveplanner',  label: 'แผน MC Live' },
    { key: 'logistics',    path: '/logistics',    label: 'ขนส่ง JST' }
  ]},
  { group: 'จัดการข้อมูล', items: [
    { key: 'upload',       path: '/upload',       label: 'อัปโหลดข้อมูล' },
    { key: 'manual',       path: '/manual',       label: 'กรอกข้อมูลมือ' }
  ]},
  { group: 'ตรวจสอบ', items: [
    { key: 'deepaudit',    path: '/deepaudit',    label: 'Deep Audit' },
    { key: 'reconcile',    path: '/reconcile',    label: 'ชนยอด' },
    { key: 'bankrecon',    path: '/bankrecon',    label: 'กระทบ Statement' },
    { key: 'uploadlog',    path: '/uploadlog',    label: 'ประวัติอัปโหลด' }
  ]},
  { group: 'ตั้งค่า', items: [
    { key: 'fees',         path: '/fees',         label: 'ค่าธรรมเนียม & แมปปิ้ง' },
    { key: 'health',       path: '/health',       label: 'สุขภาพระบบ' },
    { key: 'users',        path: '/users',        label: 'ผู้ใช้' }
  ]}
];

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const perms = user?.permissions || [];
  const can = key => user?.role === 'ADMIN' || perms.includes(key);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  async function logout() {
    try { await apiPost('/auth/logout'); } catch {}
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app">
      {/* Hamburger button (mobile only) */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="เมนู">
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Overlay (mobile) */}
      <div className={'sidebar-overlay' + (sidebarOpen ? ' open' : '')} onClick={closeSidebar} />

      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        {/* Close button inside sidebar (mobile) */}
        <span className="sidebar-close" onClick={closeSidebar}>✕</span>
        <div className="brand">The Good <span>Million</span></div>
        {MENU.map(g => {
          const items = g.items.filter(i => can(i.key));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="group">{g.group}</div>
              {items.map(i => (
                <NavLink key={i.key} to={i.path} end={i.path === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={closeSidebar}>
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
