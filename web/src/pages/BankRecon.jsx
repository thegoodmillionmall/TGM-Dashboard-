import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiUpload, apiDelete, fmt, fmtMoney, getToken } from '../api.js';
import { Alert, Loading, Kpi } from '../components/ui.jsx';

// ตั้งชื่อบัญชีให้จำง่าย เช่น "กสิกร-TG x1234" — พิมพ์ใหม่หรือเลือกจากที่เคยใช้
const DEFAULT_ACCOUNTS = ['กสิกร (Kbank)', 'ไทยพาณิชย์ (SCB)', 'กรุงไทย (KTB)', 'กรุงเทพ (BBL)'];
const STATUS_LABEL = { UNMATCHED: 'ยังไม่จับคู่', MATCHED: 'จับคู่แล้ว (รอยืนยัน)', CONFIRMED: 'ยืนยันแล้ว', IGNORED: 'ข้าม' };
const STATUS_BADGE = { UNMATCHED: 'err', MATCHED: 'warn', CONFIRMED: 'ok', IGNORED: '' };

export default function BankRecon() {
  const [txns, setTxns] = useState(null);
  const [start, setStart] = useState('2026-01-01');
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('ALL');
  const [direction, setDirection] = useState('ALL');
  const [bank, setBank] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState('ALL');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [ghostPaid, setGhostPaid] = useState([]);

  async function load() {
    try {
      const [t, g, a] = await Promise.all([
        apiGet('/bank/transactions', { start, end, status, direction, account }),
        apiGet('/bank/unmatched-payables', { start, end }).catch(() => []),
        apiGet('/bank/accounts').catch(() => [])
      ]);
      setTxns(t); setGhostPaid(g); setAccounts(a);
      if (!bank && a.length) setBank(a[0]);
    } catch (err) { setMsg({ type: 'error', text: err.message }); setTxns([]); }
  }
  useEffect(() => { load(); }, [status, direction, account]);

  async function uploadStatement() {
    if (!file) { setMsg({ type: 'error', text: 'เลือกไฟล์ statement ก่อน (CSV หรือ Excel)' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bank', bank);
      const res = await apiUpload('/bank/upload', fd);
      setMsg({ type: 'success', text: res.message });
      setFile(null);
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function autoMatch() {
    setBusy(true); setMsg(null);
    try {
      const res = await apiPost('/bank/auto-match', { days: 7 });
      setMsg({ type: 'success', text: res.message });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  }

  async function act(txn, action, payableId) {
    try {
      if (action === 'confirm') await apiPost('/bank/' + txn.id + '/confirm');
      else await apiPost('/bank/' + txn.id + '/match', { action, payableId });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  }

  const rows = txns || [];
  const out = rows.filter(t => t.direction === 'OUT');
  const sumBy = arr => arr.reduce((s, t) => s + Number(t.amount || 0), 0);
  const unmatchedOut = out.filter(t => t.match_status === 'UNMATCHED');
  const matchedOut = out.filter(t => ['MATCHED', 'CONFIRMED'].includes(t.match_status));

  return (
    <div>
      <div className="page-title">กระทบยอด Statement</div>
      <div className="page-sub">โยนไฟล์เดินบัญชีจากธนาคาร → จับคู่กับบัญชีจ่ายอัตโนมัติ</div>
      {msg && <Alert type={msg.type === 'error' ? 'error' : 'success'}>{msg.text}</Alert>}

      {/* ---------- อัปโหลด ---------- */}
      <div className="card">
        <h3>นำเข้า Statement (PDF / CSV / Excel จากแอปธนาคาร)</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--grey-light)' }}>
            บัญชี (พิมพ์ชื่อบัญชีให้จำง่าย เช่น กสิกร-TG x1234)
            <input list="account-list" value={bank} onChange={e => setBank(e.target.value)}
              placeholder="เลือกหรือพิมพ์บัญชีใหม่" style={{ minWidth: 220 }} />
            <datalist id="account-list">
              {[...new Set([...accounts, ...DEFAULT_ACCOUNTS])].map(a => <option key={a} value={a} />)}
            </datalist>
          </label>
          <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button className="btn btn-primary" disabled={busy} onClick={uploadStatement}>{busy ? 'กำลังนำเข้า...' : 'นำเข้า'}</button>
          <button className="btn btn-green" disabled={busy} onClick={autoMatch}>⚡ จับคู่อัตโนมัติ</button>
        </div>
        <div className="alert info" style={{ marginTop: 10 }}>
          ระบบอ่านคอลัมน์ วันที่ / รายการ / ถอน / ฝาก / คงเหลือ อัตโนมัติ (รองรับ KBank, SCB, KTB, BBL) —
          จับคู่ขาออก (ถอน) กับบัญชีจ่ายที่ยอดเท่ากันและวันที่ห่างไม่เกิน 7 วัน
        </div>
      </div>

      {/* ---------- สรุปแยกรายบัญชี ---------- */}
      {accounts.length > 1 && account === 'ALL' && (
        <div className="card table-scroll">
          <h3>สรุปแยกรายบัญชี</h3>
          <table className="data">
            <thead><tr>
              <th>บัญชี</th><th className="num">เงินออก</th><th className="num">จับคู่ได้</th>
              <th className="num">ไม่มีบันทึก</th><th className="num">เงินเข้า</th><th></th>
            </tr></thead>
            <tbody>
              {accounts.map(acc => {
                const mine = rows.filter(t => t.bank === acc);
                const mOut = mine.filter(t => t.direction === 'OUT');
                const mMatched = mOut.filter(t => ['MATCHED', 'CONFIRMED'].includes(t.match_status));
                const mUn = mOut.filter(t => t.match_status === 'UNMATCHED');
                return (
                  <tr key={acc}>
                    <td style={{ fontWeight: 600 }}>{acc}</td>
                    <td className="num">{fmtMoney(sumBy(mOut))}</td>
                    <td className="num" style={{ color: 'var(--success)' }}>{fmtMoney(sumBy(mMatched))}</td>
                    <td className="num" style={{ color: mUn.length ? 'var(--danger)' : 'var(--grey-light)' }}>{fmtMoney(sumBy(mUn))} ({fmt(mUn.length)})</td>
                    <td className="num">{fmtMoney(sumBy(mine.filter(t => t.direction === 'IN')))}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setAccount(acc)}>ดูเฉพาะบัญชีนี้</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="kpis">
        <Kpi label={`เงินออกทั้งหมด (${fmt(out.length)} รายการ)`} value={sumBy(out)} tone="red" />
        <Kpi label={`จับคู่ได้ (${fmt(matchedOut.length)} รายการ)`} value={sumBy(matchedOut)} tone="green" />
        <Kpi label={`เงินออกที่ไม่มีบันทึก (${fmt(unmatchedOut.length)})`} value={sumBy(unmatchedOut)} tone="red" />
        <Kpi label={`บันทึกจ่ายแล้วแต่ไม่เจอเงินออก (${fmt(ghostPaid.length)})`} value={ghostPaid.reduce((s, p) => s + Number(p.net_amount || 0), 0)} tone="red" />
        <Kpi label="เงินเข้า" value={sumBy(rows.filter(t => t.direction === 'IN'))} tone="blue" />
      </div>

      {/* ---------- บันทึกว่าจ่ายแล้ว แต่ไม่เจอใน statement ---------- */}
      {ghostPaid.length > 0 && (
        <div className="card table-scroll" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h3>⚠️ บันทึกว่า "จ่ายแล้ว" แต่ยังไม่เจอเงินออกใน statement ({fmt(ghostPaid.length)} รายการ)</h3>
          <table className="data" style={{ fontSize: 12.5 }}>
            <thead><tr><th>รอบจ่าย</th><th>ผู้รับเงิน</th><th>รายละเอียด</th><th className="num">ยอด</th><th>ที่มา</th></tr></thead>
            <tbody>
              {ghostPaid.map(p => (
                <tr key={p.id}>
                  <td>{p.due_date}</td>
                  <td>{p.vendor}</td>
                  <td>{p.description}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(p.net_amount)}</td>
                  <td style={{ fontSize: 11, color: 'var(--grey-light)' }}>
                    {p.updated_by === 'flowaccount-import' ? 'FlowAccount' : p.updated_by === 'excel-import' ? 'ชีต Excel' : p.updated_by === 'sheet-sync' ? 'Google Sheet' : 'กรอกมือ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alert info" style={{ marginTop: 10 }}>
            สาเหตุที่พบบ่อย: จ่ายจากบัญชีธนาคารอื่นที่ยังไม่ได้อัปโหลด statement · จ่ายเช็คที่ยังไม่ขึ้นเงิน · ยอดโอนไม่เท่ายอดบันทึก (เช่นหัก ณ ที่จ่าย) · หรือบันทึกผิด
          </div>
        </div>
      )}

      {/* ---------- ตัวกรอง ---------- */}
      <div className="toolbar">
        <label>บัญชี
          <select value={account} onChange={e => setAccount(e.target.value)}>
            <option value="ALL">ทุกบัญชี</option>
            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>ตั้งแต่<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>ถึง<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>สถานะ
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="ALL">ทั้งหมด</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>ทิศทาง
          <select value={direction} onChange={e => setDirection(e.target.value)}>
            <option value="ALL">เข้า+ออก</option>
            <option value="OUT">ออก (จ่าย)</option>
            <option value="IN">เข้า (รับ)</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={load}>แสดงข้อมูล</button>
      </div>

      {/* ---------- ตาราง ---------- */}
      {!txns ? <Loading /> : (
        <div className="card table-scroll">
          <table className="data" style={{ fontSize: 12.5 }}>
            <thead><tr>
              <th>วันที่</th><th>ทิศทาง</th><th>รายการในไฟล์</th><th className="num">จำนวนเงิน</th>
              <th>สถานะ</th><th>จับคู่กับ (บัญชีจ่าย)</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} style={t.match_status === 'IGNORED' ? { opacity: .45 } : {}}>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.txn_date} {t.txn_time && <span style={{ color: 'var(--grey-light)', fontSize: 11 }}>{t.txn_time}</span>}</td>
                  <td><span className={'badge ' + (t.direction === 'OUT' ? 'err' : 'ok')}>{t.direction === 'OUT' ? 'ออก' : 'เข้า'}</span></td>
                  <td>{t.description}<div style={{ fontSize: 10.5, color: 'var(--grey-light)' }}>{t.bank} {t.channel}</div></td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(t.amount)}</td>
                  <td><span className={'badge ' + (STATUS_BADGE[t.match_status] || '')}>{STATUS_LABEL[t.match_status]}</span></td>
                  <td>
                    {t.payable ? (
                      <>
                        {t.payable.vendor} <span style={{ color: 'var(--grey-light)' }}>({t.payable.description})</span>
                        <div style={{ fontSize: 10.5, color: 'var(--grey-light)' }}>
                          รอบจ่าย {t.payable.due_date} · {fmtMoney(t.payable.net_amount)} · สถานะ {t.payable.status}
                        </div>
                      </>
                    ) : '-'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {t.match_status === 'MATCHED' && (
                      <button className="btn btn-green btn-sm" onClick={() => act(t, 'confirm')}>✓ ยืนยัน+จ่ายแล้ว</button>
                    )}{' '}
                    {['MATCHED', 'CONFIRMED'].includes(t.match_status) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => act(t, 'unmatch')}>ยกเลิกคู่</button>
                    )}
                    {t.match_status === 'UNMATCHED' && t.direction === 'OUT' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => act(t, 'ignore')}>ข้าม</button>
                    )}
                    {t.match_status === 'IGNORED' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => act(t, 'unmatch')}>เอากลับ</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
