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

function Protected({ children }) {
  return getUser() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="overview" element={<Overview />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="ads" element={<Ads />} />
        <Route path="ads-entry" element={<AdsEntry />} />
        <Route path="spreadsheet-ads" element={<SpreadsheetAds />} />
        <Route path="deepaudit" element={<DeepAudit />} />
        <Route path="reconcile" element={<Reconcile />} />
        <Route path="profit" element={<Profit />} />
        <Route path="upload" element={<Upload />} />
        <Route path="manual" element={<Manual />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="fees" element={<Fees />} />
        <Route path="payables" element={<Payables />} />
        <Route path="liveplanner" element={<McLive />} />
        <Route path="mtledger" element={<MtLedger />} />
        <Route path="bankrecon" element={<BankRecon />} />
        <Route path="uploadlog" element={<UploadLog />} />
        <Route path="health" element={<Health />} />
        <Route path="users" element={<Users />} />
        <Route path="stockupdate" element={<StockUpdate />} />
        <Route path="product-sales" element={<ProductSales />} />
        <Route path="logistics" element={<Logistics />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
