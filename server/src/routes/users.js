import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sbRequest, sbUpsert } from '../supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeActivityLog } from '../lib/log.js';
import { normalizeRole, normalizePermissions } from '../permissions.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// พอร์ตจาก getUsers
router.get('/', async (req, res) => {
  try {
    const rows = await sbRequest('app_users?select=username,display_name,role,status,permissions,created_at,last_login&order=username.asc', 'get');
    res.json((rows || []).map(r => ({
      username: r.username,
      displayName: r.display_name || '',
      role: normalizeRole(r.role),
      status: r.status,
      permissions: normalizePermissions(r.permissions, r.role),
      createdAt: r.created_at || '',
      lastLogin: r.last_login || ''
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก saveUser
router.post('/', async (req, res) => {
  try {
    const u = req.body || {};
    const username = String(u.username || '').trim();
    if (!username) return res.status(400).json({ error: 'กรุณาระบุ Username' });
    const role = normalizeRole(u.role);
    const status = ['ACTIVE', 'INACTIVE'].includes(String(u.status || 'ACTIVE').toUpperCase())
      ? String(u.status || 'ACTIVE').toUpperCase() : 'ACTIVE';
    const permissions = normalizePermissions(u.permissions, role);

    const existing = await sbRequest('app_users?username=eq.' + encodeURIComponent(username) + '&limit=1', 'get');
    const isNew = !existing || !existing.length;
    if (isNew && !u.password) return res.status(400).json({ error: 'ผู้ใช้ใหม่ต้องระบุ Password' });

    const record = {
      username,
      display_name: String(u.displayName || username).trim(),
      role, status,
      permissions
    };
    if (u.password) record.password_hash = await bcrypt.hash(String(u.password), 10);

    if (isNew) await sbRequest('app_users', 'post', [record], { Prefer: 'return=minimal' });
    else await sbRequest('app_users?username=eq.' + encodeURIComponent(username), 'patch', record, { Prefer: 'return=minimal' });

    await writeActivityLog(req.user, isNew ? 'CREATE_USER' : 'UPDATE_USER', 'app_users', username, 'SUCCESS', (isNew ? 'เพิ่ม' : 'อัปเดต') + 'ผู้ใช้: ' + username);
    res.json({ ok: true, message: (isNew ? 'เพิ่มผู้ใช้ใหม่สำเร็จ: ' : 'อัปเดตผู้ใช้สำเร็จ: ') + username });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// พอร์ตจาก updateUserStatus
router.patch('/:username/status', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ error: 'Status ไม่ถูกต้อง' });
    await sbRequest('app_users?username=eq.' + encodeURIComponent(req.params.username), 'patch', { status }, { Prefer: 'return=minimal' });
    await writeActivityLog(req.user, 'UPDATE_USER_STATUS', 'app_users', req.params.username, 'SUCCESS', 'เปลี่ยนสถานะเป็น ' + status);
    res.json({ ok: true, message: 'เปลี่ยนสถานะผู้ใช้สำเร็จ' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
