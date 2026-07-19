import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getUser } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Overview from './pages/Overview.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Ads from './pages/Ads.jsx';
import AdsEntry from './pages/AdsEntry.jsx';
import SpreadsheetAds from './pages/SpreadsheetAds.jsx';
import DeepAudit from './pages/DeepAudit.jsx';
import Reconcile from './pages/Reconcile.jsx';
import Profit from './pages/Profit.jsx';
import Upload from './pages/Upload.jsx';
import Manual from './pages/Manual.jsx';
import Accounting from './pages/Accounting.jsx';
import Fees from './pages/Fees.jsx';
import Payables from './pages/Payables.jsx';
import McLive from './pages/McLive.jsx';
import MtLedger from './pages/MtLedger.jsx';
import BankRecon from './pages/BankRecon.jsx';
import UploadLog from './pages/UploadLog.jsx';
import Health from './pages/Health.jsx';
import Users from './pages/Users.jsx';
import StockUpdate from './pages/StockUpdate.jsx';
import ProductSales from './pages/ProductSales.jsx';
import Logistics from './pages/Logistics.jsx';

const PAGE_PATHS = {
  overview: '/overview',
  dashboard: '/dashboard',
  profit: '/profit',
  'product-sales': '/product-sales',
  ads: '/ads',
  'ads-entry': '/ads-entry',
  'spreadsheet-ads': '/spreadsheet-ads',
  products: '/products',
  stockupdate: '/stockupdate',
  accounting: '/accounting',
  payables: '/payables',
  mtledger: '/mtledger',
  liveplanner: '/liveplanner',
  logistics: '/logistics',
  upload: '/upload',
  manual: '/manual',
  deepaudit: '/deepaudit',
  reconcile: '/reconcile',
  bankrecon: '/bankrecon',
  uploadlog: '/uploadlog',
  fees: '/fees',
  health: '/health',
  users: '/users'
};

function firstAllowedPath(user) {
  if (user?.role === 'ADMIN') return '/overview';
  const perms = user?.permissions || [];
  const hit = perms.find(p => PAGE_PATHS[p] && p !== 'home');
  return hit ? PAGE_PATHS[hit] : '/login';
}

function Protected({ children, pageKey }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (pageKey && user.role !== 'ADMIN' && !(user.permissions || []).includes(pageKey)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Protected pageKey="overview"><Overview /></Protected>} />
        <Route path="overview" element={<Protected pageKey="overview"><Overview /></Protected>} />
        <Route path="dashboard" element={<Protected pageKey="dashboard"><Dashboard /></Protected>} />
        <Route path="products" element={<Protected pageKey="products"><Products /></Protected>} />
        <Route path="ads" element={<Protected pageKey="ads"><Ads /></Protected>} />
        <Route path="ads-entry" element={<Protected pageKey="ads-entry"><AdsEntry /></Protected>} />
        <Route path="spreadsheet-ads" element={<Protected pageKey="spreadsheet-ads"><SpreadsheetAds /></Protected>} />
        <Route path="deepaudit" element={<Protected pageKey="deepaudit"><DeepAudit /></Protected>} />
        <Route path="reconcile" element={<Protected pageKey="reconcile"><Reconcile /></Protected>} />
        <Route path="profit" element={<Protected pageKey="profit"><Profit /></Protected>} />
        <Route path="upload" element={<Protected pageKey="upload"><Upload /></Protected>} />
        <Route path="manual" element={<Protected pageKey="manual"><Manual /></Protected>} />
        <Route path="accounting" element={<Protected pageKey="accounting"><Accounting /></Protected>} />
        <Route path="fees" element={<Protected pageKey="fees"><Fees /></Protected>} />
        <Route path="payables" element={<Protected pageKey="payables"><Payables /></Protected>} />
        <Route path="liveplanner" element={<Protected pageKey="liveplanner"><McLive /></Protected>} />
        <Route path="mtledger" element={<Protected pageKey="mtledger"><MtLedger /></Protected>} />
        <Route path="bankrecon" element={<Protected pageKey="bankrecon"><BankRecon /></Protected>} />
        <Route path="uploadlog" element={<Protected pageKey="uploadlog"><UploadLog /></Protected>} />
        <Route path="health" element={<Protected pageKey="health"><Health /></Protected>} />
        <Route path="users" element={<Protected pageKey="users"><Users /></Protected>} />
        <Route path="stockupdate" element={<Protected pageKey="stockupdate"><StockUpdate /></Protected>} />
        <Route path="product-sales" element={<Protected pageKey="product-sales"><ProductSales /></Protected>} />
        <Route path="logistics" element={<Protected pageKey="logistics"><Logistics /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
