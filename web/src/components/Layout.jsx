import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession, apiGet, apiPost } from '../api.js';
import AiPanel from './AiPanel.jsx';

const MENU = [
  { group: 'เธ เธฒเธเธฃเธงเธก', items: [
    { key: 'overview',     path: '/',             label: 'เธ เธฒเธเธฃเธงเธกเธเธนเนเธเธฃเธดเธซเธฒเธฃ' },
    { key: 'dashboard',    path: '/dashboard',    label: 'เนเธขเธเธเนเธญเธเธ—เธฒเธ' },
    { key: 'profit',       path: '/profit',       label: 'เธเธณเนเธฃ-เธเธฒเธ”เธ—เธธเธ' },
    { key: 'product-sales',path: '/product-sales',label: 'เธชเธดเธเธเนเธฒเธเธฒเธขเธ”เธต' }
  ]},
  { group: 'เนเธเธฉเธ“เธฒ', items: [
    { key: 'ads',           path: '/ads',            label: 'เธชเธฃเธธเธเนเธเธฉเธ“เธฒ' },
  ]},
  { group: 'เธชเธดเธเธเนเธฒ & เธ•เนเธเธ—เธธเธ', items: [
    { key: 'products',     path: '/products',     label: 'เธฃเธฒเธขเธเธฒเธฃเธชเธดเธเธเนเธฒ' },
    { key: 'stockupdate',  path: '/stockupdate',  label: 'เธญเธฑเธเน€เธ”เธ•เธชเธ•เนเธญเธ' },
    { key: 'accounting',   path: '/accounting',   label: 'เธ•เนเธเธ—เธธเธเธชเธดเธเธเนเธฒ' }
  ]},
  { group: 'เธเธฒเธฃเน€เธเธดเธ', items: [
    { key: 'payables',     path: '/payables',     label: 'เธเธฑเธเธเธตเธเนเธฒเธข' },
    { key: 'statements',   path: '/statements',   label: 'เธเธเธเธฒเธฃเน€เธเธดเธ' },
    { key: 'mtledger',     path: '/mtledger',     label: 'Modern Trade' },
    { key: 'liveplanner',  path: '/liveplanner',  label: 'เนเธเธ MC Live' },
    { key: 'logistics',    path: '/logistics',    label: 'เธเธเธชเนเธ JST' }
  ]},
  { group: 'เธเธฑเธ”เธเธฒเธฃเธเนเธญเธกเธนเธฅ', items: [
    { key: 'upload',       path: '/upload',       label: 'เธญเธฑเธเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅ' },
    { key: 'manual',       path: '/manual',       label: 'เธเธฃเธญเธเธเนเธญเธกเธนเธฅเธกเธทเธญ' }
  ]},
  { group: 'เธ•เธฃเธงเธเธชเธญเธ', items: [
    { key: 'deepaudit',    path: '/deepaudit',    label: 'Deep Audit' },
    { key: 'reconcile',    path: '/reconcile',    label: 'เธเธเธขเธญเธ”' },
    { key: 'bankrecon',    path: '/bankrecon',    label: 'เธเธฃเธฐเธ—เธ Statement' },
    { key: 'uploadlog',    path: '/uploadlog',    label: 'เธเธฃเธฐเธงเธฑเธ•เธดเธญเธฑเธเนเธซเธฅเธ”' }
  ]},
  { group: 'เธ•เธฑเนเธเธเนเธฒ', items: [
    { key: 'fees',         path: '/fees',         label: 'เธเนเธฒเธเธฃเธฃเธกเน€เธเธตเธขเธก & เนเธกเธเธเธดเนเธ' },
    { key: 'health',       path: '/health',       label: 'เธชเธธเธเธ เธฒเธเธฃเธฐเธเธ' },
    { key: 'users',        path: '/users',        label: 'เธเธนเนเนเธเน' }
  ]}
];

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      {/* Hamburger button (mobile only) */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="เน€เธกเธเธน">
        {sidebarOpen ? 'โ•' : 'โฐ'}
      </button>

      {/* Overlay (mobile) */}
      <div className={'sidebar-overlay' + (sidebarOpen ? ' open' : '')} onClick={closeSidebar} />

      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        {/* Close button inside sidebar (mobile) */}
        <span className="sidebar-close" onClick={closeSidebar}>โ•</span>
        <div className="brand">The Good <span>Million</span></div>
        {MENU.map(g => {
          const items = g.items.filter(i => can(i.key));
          if (!items.length) return null;
          return (
            <div key={g.group} className="nav-section">
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
          {version?.commit && (
            <div className="version-badge" title={`branch: ${version.branch || '-'} | loaded: ${version.time || '-'}`}>
              Version {version.commit}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={logout}>
            เธญเธญเธเธเธฒเธเธฃเธฐเธเธ
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
