import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiPost } from '../api.js';

// คำถามแนะนำตามหน้า
const PAGE_TIPS = {
  '/': [
    'ยอดขายรวมเดือนนี้เป็นเท่าไร',
    'เดือนไหนทำได้ดีที่สุดในช่วงนี้',
    'เปรียบเทียบ TikTok vs Shopee vs Modern Trade',
    'GMV เติบโตกี่เปอร์เซ็นต์จากเดือนก่อน',
  ],
  '/dashboard': [
    'ช่องทางไหนมียอดเติบโตเร็วที่สุด',
    'GMV กับยอดจริงต่างกันมากไหม เพราะอะไร',
    'วันไหนยอดขายสูงสุดและต่ำสุด',
  ],
  '/profit': [
    'กำไรสุทธิเดือนนี้เป็นเท่าไร',
    'ต้นทุนรายการอะไรสูงสุด',
    'Net margin เปลี่ยนไปอย่างไรจากเดือนก่อน',
    'ค่าโฆษณาคิดเป็นกี่เปอร์เซ็นต์ของรายได้',
  ],
  '/product-sales': [
    'สินค้าขายดีที่สุด 5 อันดับแรก',
    'สินค้าไหน margin ดีที่สุด',
    'สินค้าไหนยอดตกมากที่สุดเดือนนี้',
  ],
  '/ads': [
    'ROI โฆษณารวมเดือนนี้เป็นอย่างไร',
    'แพลตฟอร์มไหนโฆษณาคุ้มค่ากว่ากัน',
    'ค่าโฆษณาเกินเป้าหรือต่ำกว่าเป้าไหม',
  ],
  '/payables': [
    'รายการค้างจ่ายที่เกินกำหนดมีกี่รายการ ยอดรวมเท่าไร',
    'ยอดรวมที่ต้องจ่ายในสัปดาห์นี้',
    'ผู้รับเงินรายใหญ่ที่สุดคือใคร',
  ],
  '/statements': [
    'รายได้หลักมาจากอะไรบ้าง',
    'ค่าใช้จ่ายรายการใหญ่ที่สุด 3 อันดับ',
    'Net margin และกำไรสุทธิเดือนนี้คือเท่าไร',
  ],
  '/deepaudit': [
    'มีรายการผิดปกติหรือค่าที่ไม่ตรงกันไหม',
    'ยอด GMV กับ order file ต่างกันมากไหม เพราะอะไร',
    'ค่าธรรมเนียมที่หักไปถูกต้องไหม',
  ],
  '/reconcile': [
    'ยอดที่ยังไม่กระทบกันมีเท่าไร',
    'มีรายการที่หายไปหรือนับซ้ำไหม',
  ],
  '/mtledger': [
    'ยอด Modern Trade เดือนนี้รวมเป็นเท่าไร',
    'มีรายการค้างรับชำระอะไรบ้าง',
  ],
  '/accounting': [
    'สินค้าไหนต้นทุนสูงสุด',
    'COGS รวมเดือนนี้เท่าไร',
  ],
};
const DEFAULT_TIPS = [
  'สรุปข้อมูลสำคัญในหน้านี้',
  'มีอะไรผิดปกติหรือน่าสังเกตไหม',
  'แนะนำขั้นตอนถัดไปที่ควรทำ',
];

// render markdown เบื้องต้น: **bold**, - bullet, newlines
function renderAnswer(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) { out.push(<div key={i} style={{ height: 8 }} />); return; }
    const isBullet = /^[-•*]\s/.test(trimmed);
    const content = isBullet ? trimmed.replace(/^[-•*]\s/, '') : trimmed;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    );
    out.push(
      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3, paddingLeft: isBullet ? 4 : 0 }}>
        {isBullet && <span style={{ flexShrink: 0, color: 'var(--mint-dark)' }}>•</span>}
        <span>{parts}</span>
      </div>
    );
  });
  return out;
}

export default function AiPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const tips = PAGE_TIPS[location.pathname] || DEFAULT_TIPS;

  // รีเซ็ต chat เมื่อเปลี่ยนหน้า
  useEffect(() => { setHistory([]); }, [location.pathname]);

  // scroll ลงล่างเมื่อมีคำตอบใหม่
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, open]);

  // focus input เมื่อเปิด panel
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function ask(question) {
    const text = (question || q).trim();
    if (!text || busy) return;
    setQ('');
    setBusy(true);
    setHistory(h => [...h, { q: text, a: null }]);
    try {
      const visibleText = document.querySelector('.main')?.innerText?.slice(0, 14000) || '';
      const res = await apiPost('/ai/ask', {
        pageId: location.pathname,
        question: text,
        pageContext: { pageLabel: document.title, visibleText }
      });
      setHistory(h => h.map((item, i) =>
        i === h.length - 1 ? { ...item, a: res.answer || res.warning || 'ไม่มีคำตอบ' } : item
      ));
    } catch (err) {
      setHistory(h => h.map((item, i) =>
        i === h.length - 1 ? { ...item, a: 'เกิดข้อผิดพลาด: ' + err.message } : item
      ));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(o => !o)}>AI ✦</button>
      {open && (
        <div className="ai-panel">
          {/* Header */}
          <div className="ai-panel-head">
            <div>
              <b>AI ผู้ช่วยวิเคราะห์</b>
              {history.length > 0 && (
                <button className="ai-clear-btn" onClick={() => setHistory([])}>ล้างประวัติ</button>
              )}
            </div>
            <button className="ai-panel-close" onClick={() => setOpen(false)}>×</button>
          </div>

          {/* Chat body */}
          <div className="ai-chat-body">
            {history.length === 0 && (
              <div className="ai-tips">
                <div className="ai-tips-label">💡 ลองถามว่า...</div>
                {tips.map((tip, i) => (
                  <button key={i} className="ai-tip-chip" onClick={() => ask(tip)}>
                    {tip}
                  </button>
                ))}
              </div>
            )}

            {history.map((item, i) => (
              <div key={i} className="ai-turn">
                <div className="ai-bubble ai-bubble-user">{item.q}</div>
                <div className="ai-bubble ai-bubble-ai">
                  {item.a == null
                    ? <span className="ai-thinking">⏳ กำลังวิเคราะห์...</span>
                    : renderAnswer(item.a)
                  }
                </div>
                {i < history.length - 1 && <div className="ai-divider" />}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggested follow-ups when there's history */}
          {history.length > 0 && history[history.length - 1]?.a && !busy && (
            <div className="ai-followups">
              {tips.slice(0, 2).map((tip, i) => (
                <button key={i} className="ai-tip-chip ai-tip-chip-sm" onClick={() => ask(tip)}>
                  {tip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="ai-panel-input">
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
              placeholder="ถามเกี่ยวกับข้อมูลในหน้านี้..."
              disabled={busy}
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !q.trim()} onClick={() => ask()}>ถาม</button>
          </div>
        </div>
      )}
    </>
  );
}
