import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiPost } from '../api.js';

// AI ผู้ช่วยประจำหน้า — ส่งข้อความที่มองเห็นบนหน้าไปให้ Gemini สรุป (พอร์ตจาก askPageAiAssistant)
export default function AiPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  async function ask() {
    if (!q.trim() || busy) return;
    setBusy(true);
    setAnswer('กำลังวิเคราะห์...');
    try {
      const visibleText = document.querySelector('.main')?.innerText?.slice(0, 14000) || '';
      const res = await apiPost('/ai/ask', {
        pageId: location.pathname,
        question: q,
        pageContext: { pageLabel: document.title, visibleText }
      });
      setAnswer(res.answer || res.warning || 'ไม่มีคำตอบ');
    } catch (err) {
      setAnswer('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(o => !o)}>AI ✦</button>
      {open && (
        <div className="ai-panel">
          <b>AI สรุปหน้านี้</b>
          <div className="answer">{answer || 'ถามคำถามเกี่ยวกับข้อมูลบนหน้านี้ได้เลย'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ask()} placeholder="เช่น สรุปยอดขายช่วงนี้" />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={ask}>ถาม</button>
          </div>
        </div>
      )}
    </>
  );
}
