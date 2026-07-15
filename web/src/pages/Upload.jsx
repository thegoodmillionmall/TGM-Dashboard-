import React, { useState } from 'react';
import { apiUpload } from '../api.js';
import { Alert } from '../components/ui.jsx';

const PLATFORMS = [
  ['TiktokAnalytics', 'TikTok Analytics'],
  ['TiktokOrder', 'TikTok Order'],
  ['TiktokSettlement', 'TikTok Settlement'],
  ['TiktokLive', 'TikTok Live'],
  ['TiktokAffiliate', 'TikTok Affiliate'],
  ['TiktokAdsManager', 'TikTok Ads Manager'],
  ['TiktokAdsGMV', 'TikTok Ads GMV'],
  ['TiktokAdsGMVLive', 'TikTok Ads GMV Live'],
  ['ShopeeOrder', 'Shopee Order'],
  ['ShopeeSettlement', 'Shopee Settlement'],
  ['ShopeeAds', 'Shopee Ads'],
  ['ShopeeAdsLive', 'Shopee Ads Live'],
  ['ShopeeAffiliate', 'Shopee Affiliate'],
  ['MetaAds', 'Meta Ads'],
  ['ModernTrade', 'Modern Trade'],
  ['ManualFinance', 'Manual Finance']
];

export default function Upload() {
  const [platform, setPlatform] = useState('TiktokOrder');
  const [file, setFile] = useState(null);
  const [adminStart, setAdminStart] = useState('');
  const [adminEnd, setAdminEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!file) { setMsg({ type: 'error', text: 'กรุณาเลือกไฟล์ CSV' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('platform', platform);
      if (adminStart) fd.append('adminStart', adminStart);
      if (adminEnd) fd.append('adminEnd', adminEnd);
      const res = await apiUpload('/uploads', fd);
      setMsg({ type: 'success', text: res.message + ' (batch: ' + res.batchId.slice(0, 8) + '..., refresh: ' + res.refresh.join(', ') + ')' });
      setFile(null);
      e.target.reset?.();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-title">นำเข้าข้อมูล</div>
      <div className="page-sub">อัปโหลดไฟล์ CSV → เก็บ raw ใน Supabase → refresh สรุปรายวันอัตโนมัติ</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}
      <form className="card" style={{ maxWidth: 560 }} onSubmit={submit}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>แพลตฟอร์ม / ประเภทไฟล์
            <select style={{ width: '100%', marginTop: 4 }} value={platform} onChange={e => setPlatform(e.target.value)}>
              {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>ไฟล์ CSV
            <input type="file" accept=".csv,text/csv" style={{ width: '100%', marginTop: 4 }}
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>ช่วงข้อมูลเริ่ม (Admin)
              <input type="date" style={{ width: '100%', marginTop: 4 }} value={adminStart} onChange={e => setAdminStart(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>ถึง
              <input type="date" style={{ width: '100%', marginTop: 4 }} value={adminEnd} onChange={e => setAdminEnd(e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
          </button>
        </div>
      </form>
      <div className="alert info">
        ระบบจะตรวจคอลัมน์สำคัญของแต่ละแพลตฟอร์มก่อนบันทึก ถ้าไฟล์ขาดคอลัมน์จะแจ้งเตือนและไม่บันทึก
        อัปโหลดซ้ำได้ — ย้อนกลับ (rollback) ได้จากหน้าประวัติการอัปโหลด
      </div>
    </div>
  );
}
