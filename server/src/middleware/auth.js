import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export const COOKIE_NAME = 'stada_session';

export function signSession(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 12 * 60 * 60 * 1000,
  });
}

// Loads the user on every request so deactivated users lose access immediately.
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query('SELECT id, email, name, role, active FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Account not available' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission for this action' });
  }
  next();
};
