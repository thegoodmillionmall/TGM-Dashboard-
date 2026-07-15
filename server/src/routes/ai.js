import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { writeActivityLog } from '../lib/log.js';

const router = Router();
router.use(requireAuth);

// พอร์ตจาก askPageAiAssistant (Gemini / Google AI Studio)
router.post('/ask', async (req, res) => {
  try {
    const { pageId, question, pageContext } = req.body || {};
    const q = String(question || '').trim();
    if (!q) return res.status(400).json({ error: 'กรุณาพิมพ์คำถามก่อน' });

    const context = pageContext || {};
    const pageLabel = String(context.pageLabel || pageId || 'Dashboard');
    const contextText = [
      'Page: ' + pageLabel,
      'Page ID: ' + String(pageId || ''),
      'User role: ' + String(req.user.role || ''),
      'Captured at: ' + new Date().toISOString(),
      '',
      'Filters / Inputs:',
      String(context.filters || '').slice(0, 2500),
      '',
      'Visible page text:',
      String(context.visibleText || '').slice(0, 14000)
    ].join('\n');

    if (!config.googleAiKey) {
      await writeActivityLog(req.user, 'ASK_AI_ASSISTANT', 'AI', String(pageId || ''), 'SKIPPED', 'AI key not configured');
      return res.json({
        ok: false,
        warning: 'ยังไม่ได้ตั้งค่า Google AI Studio API key',
        answer: 'ยังไม่ได้ตั้งค่า GOOGLE_AI_KEY ใน .env ของ server ครับ ให้ ADMIN เพิ่ม key แล้ว restart server จากนั้นถามใหม่อีกครั้ง'
      });
    }

    const systemPrompt = [
      'คุณคือ AI ผู้ช่วยวิเคราะห์ The Good Million BI Dashboard สำหรับ ecommerce, audit, finance, reconciliation และ internal control.',
      'ตอบเป็นภาษาไทย กระชับ ชัดเจน และอิงเฉพาะข้อมูลที่ให้มาในบริบทหน้าเว็บเท่านั้น',
      'ถ้าข้อมูลไม่พอ ให้บอกว่าข้อมูลไม่พอและแนะนำว่าต้องดูไฟล์/หน้าหรือคอลัมน์อะไรเพิ่ม',
      'ให้แยกคำตอบเป็น: สรุป, จุดที่ควรระวัง, สิ่งที่ควรทำต่อ เมื่อเหมาะสม',
      'อย่าเดาตัวเลขใหม่เอง ถ้าต้องคำนวณให้ใช้ตัวเลขที่ปรากฏในบริบทเท่านั้น'
    ].join('\n');

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(config.googleAiModel) + ':generateContent?key=' + encodeURIComponent(config.googleAiKey);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: 'คำถาม: ' + q + '\n\nบริบทจากหน้าเว็บ:\n' + contextText }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
      })
    });
    const body = await response.text();
    if (!response.ok) {
      await writeActivityLog(req.user, 'ASK_AI_ASSISTANT', 'AI', String(pageId || ''), 'FAILED', 'Google AI HTTP ' + response.status);
      return res.status(502).json({ error: 'AI API error HTTP ' + response.status + ': ' + body.slice(0, 300) });
    }
    const json = JSON.parse(body);
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const answer = parts.map(p => p.text || '').join('\n').trim();
    await writeActivityLog(req.user, 'ASK_AI_ASSISTANT', 'AI', String(pageId || ''), 'SUCCESS', 'Answered AI question on page ' + pageLabel);
    res.json({ ok: true, answer: answer || 'AI ไม่ได้ส่งคำตอบกลับมา กรุณาลองถามใหม่อีกครั้ง' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
