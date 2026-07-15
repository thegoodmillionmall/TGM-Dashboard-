import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sbRequest } from '../supabase.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { writeActivityLog } from '../lib/log.js';
import { normalizeRole, normalizePermissions, getPermissionPages } from '../permissions.js';

const router = Router();

async function findUser(username) {
  const rows = await sbRequest(
    'app_users?username=ilike.' + encodeURIComponent(String(username || '').trim()) + '&limit=1',
    'get'
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function toUser(row) {
  return {
    username: row.username,
    displayName: row.display_name || row.username,
    role: normalizeRole(row.role),
    status: row.status,
    permissions: normalizePermissions(row.permissions, row.role)
  };
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
    const row = await findUser(username);
    if (!row) {
      await writeActivityLog({ username }, 'LOGIN', 'AUTH', '', 'FAILED', 'User not found');
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }
    if (String(row.status).toUpperCase() !== 'ACTIVE') {
      await writeActivityLog(toUser(row), 'LOGIN', 'AUTH', '', 'FAILED', 'Inactive user');
      return res.status(403).json({ error: 'บัญชีนี้ถูกปิดการใช้งาน' });
    }
    const ok = await bcrypt.compare(String(password), String(row.password_hash || ''));
    if (!ok) {
      await writeActivityLog(toUser(row), 'LOGIN', 'AUTH', '', 'FAILED', 'Wrong password');
      return res.status(401).json({ error: 'Username หรือ Password ไม่ถูกต้อง' });
    }
    await sbRequest('app_users?username=eq.' + encodeURIComponent(row.username), 'patch',
      { last_login: new Date().toISOString() }, { Prefer: 'return=minimal' });
    const user = toUser(row);
    await writeActivityLog(user, 'LOGIN', 'AUTH', '', 'SUCCESS', 'Login success');
    res.json({ ok: true, token: signToken(user), user, pages: getPermissionPages() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  await writeActivityLog(req.user, 'LOGOUT', 'AUTH', '', 'SUCCESS', 'Logout');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, pages: getPermissionPages() });
});

// พอร์ตจาก changeOwnPassword
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร' });
    }
    const row = await findUser(req.user.username);
    if (!row) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const ok = await bcrypt.compare(String(oldPassword || ''), String(row.password_hash || ''));
    if (!ok) return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    const hash = await bcrypt.hash(String(newPassword), 10);
    await sbRequest('app_users?username=eq.' + encodeURIComponent(row.username), 'patch',
      { password_hash: hash }, { Prefer: 'return=minimal' });
    await writeActivityLog(req.user, 'CHANGE_PASSWORD', 'AUTH', '', 'SUCCESS', 'Changed own password');
    res.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
