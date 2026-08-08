import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession, apiGet, apiPost } from '../api.js';
import AiPanel from './AiPanel.jsx';
import HelpModal from './HelpModal.jsx';

const MENU = [
  { group: 'ภาพรวม', items: [
    { key: 'overview', path: '/', label: 'ภาพรวมผู้บริหาร' },
    { key: 'profit', path: '/profit', label: 'กำไร-ขาดทุน' },
    { key: 'product-sales', path: '/product-sales', label: 'สินค้าขายดี' }
  ]},
  { group: 'โฆษณา', items: [
    { key: 'ads', path: '/ads', label: 'สรุปโฆษณา' }
  ]},
  { group: 'สินค้า & ต้นทุน', items: [
    { key: 'stockupdate', path: '/stockupdate', label: 'อัปเดตสต็อก' },
    { key: 'accounting', path: '/accounting', label: 'ต้นทุนสินค้า' }
  ]},
  { group: 'การเงิน', items: [
    { key: 'payables', path: '/payables', label: 'บัญชีจ่าย' },
    { key: 'statements', path: '/statements', label: 'งบการเงิน' },
    { key: 'mtledger', path: '/mtledger', label: 'Modern Trade' },
  ]},
  { group: 'MC Live', items: [
    { key: 'liveplanner', path: '/liveplanner', label: 'MC Live' }
  ]},
  { group: 'จัดการข้อมูล', items: [
    { key: 'upload', path: '/upload', label: 'อัปโหลดข้อมูล' }
  ]},
  { group: 'ตรวจสอบ', items: [
    { key: 'uploadlog', path: '/uploadlog', label: 'ประวัติอัปโหลด' }
  ]},
  { group: 'ตั้งค่า', items: [
    { key: 'fees', path: '/fees', label: 'ค่าธรรมเนียม & แมปปิ้ง' },
    { key: 'health', path: '/health', label: 'สุขภาพระบบ' },
    { key: 'users', path: '/users', label: 'ผู้ใช้' }
  ]}
];

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [version, setVersion] = useState(null);
  const perms = user?.permissions || [];
  const can = key => user?.role === 'ADMIN' || perms.includes(key);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    apiGet('/system/version').then(setVersion).catch(() => {});
  }, []);

  async function logout() {
    try { await apiPost('/auth/logout'); } catch {}
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app">
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="เมนู">
        {sidebarOpen ? 'x' : '='}
      </button>

      <div className={'sidebar-overlay' + (sidebarOpen ? ' open' : '')} onClick={closeSidebar} />

      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        <span className="sidebar-close" onClick={closeSidebar}>x</span>
        <div className="brand">The Good <span>Million</span></div>
        {MENU.map(g => {
          const items = g.items.filter(i => can(i.key));
          if (!items.length) return null;
          return (
            <div key={g.group} className="nav-section">
              <div className="group">{g.group}</div>
              {items.map(i => (
                <NavLink
                  key={i.key}
                  to={i.path}
                  end={i.path === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={closeSidebar}
                >
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="userbox">
          <div><b>{user?.displayName}</b></div>
          <div style={{ color: '#9ca3af' }}>{user?.role}</div>
          {version?.commit && (
            <div className="version-badge" title={`branch: ${version.branch || '-'} | loaded: ${version.time || '-'}`}>
              Version {version.commit}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={logout}>
            ออกจากระบบ
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            style={{
              marginTop: 6, width: '100%',
              background: 'rgba(178,216,216,0.18)',
              border: '1px solid rgba(178,216,216,0.4)',
              borderRadius: 6, color: '#B2D8D8',
              fontSize: 12, padding: '5px 0',
              cursor: 'pointer', fontFamily: 'Kanit, sans-serif',
            }}
          >
            ? คู่มือการใช้งาน
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {can('ai') && <AiPanel />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
