import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign(
    {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: user.permissions || []
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

export function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
    if (allowed.length && !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ใช้งานส่วนนี้ (ต้องเป็น ' + allowed.join(' หรือ ') + ')' });
    }
    next();
  };
}
