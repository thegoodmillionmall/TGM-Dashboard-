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
      'คุณคือ AI ผู้ช่วยวิเคราะห์ The Good Million BI Dashboard — บริษัทขายสินค้า e-commerce ผ่าน TikTok Shop, Shopee, และ Modern Trade',
      'ตอบเป็นภาษาไทย ละเอียด ชัดเจน และให้ประโยชน์สูงสุดต่อผู้บริหาร/ทีมบัญชี',
      '',
      'กฎการตอบ:',
      '- ใช้ตัวเลขจากบริบทที่ให้มาเท่านั้น ห้ามเดาหรือสร้างตัวเลขใหม่',
      '- ถ้าข้อมูลไม่พอ ให้บอกชัดเจนว่าขาดข้อมูลอะไร และแนะนำให้ไปดูที่หน้าหรือแท็บใด',
      '- ตอบให้ครบทั้ง 3 ส่วนเมื่อเหมาะสม: **สรุป** / **จุดที่ควรระวัง** / **ขั้นตอนถัดไปที่แนะนำ**',
      '- ถ้าถามเรื่องตัวเลข ให้อ้างค่าที่เห็นในหน้าพร้อมบอกบริบท (เช่น เดือน, ช่องทาง, เงื่อนไข filter)',
      '- ถ้าถามเรื่อง trend ให้เปรียบเทียบกับช่วงก่อนหน้าถ้ามีข้อมูล',
      '- ถ้าถามเรื่องปัญหา ให้ระบุสาเหตุที่เป็นไปได้และวิธีแก้',
      '- ใช้ **ตัวหนา** สำหรับตัวเลขสำคัญและหัวข้อ',
      '- ใช้ - นำหน้าสำหรับรายการย่อย',
      '- ตอบยาวพอที่จะเป็นประโยชน์จริง ไม่ตัดข้อมูลสำคัญออก',
    ].join('\n');

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(config.googleAiModel) + ':generateContent?key=' + encodeURIComponent(config.googleAiKey);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: 'คำถาม: ' + q + '\n\nบริบทจากหน้าเว็บ:\n' + contextText }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1800 }
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
