import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, audit } from '../db.js';
import { ah, HttpError, int } from '../utils.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const ROLES = ['admin', 'reviewer', 'rep'];

// Everyone signed in can list users (needed to assign reps); only admins change them.
router.get('/', ah(async (req, res) => {
  const { rows } = await query('SELECT id, email, name, role, active, created_at FROM users ORDER BY name');
  res.json(rows);
}));

router.post('/', requireRole('admin'), ah(async (req, res) => {
  const { email, name, role = 'rep', password } = req.body || {};
  if (!email || !name || !password) throw new HttpError(400, 'Email, name and password are required');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role');
  if (String(password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, active, created_at',
      [String(email).trim().toLowerCase(), name, role, hash]
    );
    await audit(req.user.id, 'user.create', 'user', rows[0].id, { role });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A user with this email already exists');
    throw err;
  }
}));

router.patch('/:id', requireRole('admin'), ah(async (req, res) => {
  const id = int(req.params.id);
  const { name, role, active, password } = req.body || {};
  if (role && !ROLES.includes(role)) throw new HttpError(400, 'Unknown role');
  if (id === req.user.id && (active === false || (role && role !== 'admin'))) {
    throw new HttpError(400, 'You cannot deactivate or demote your own account');
  }
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const { rows } = await query(
    `UPDATE users SET
       name = COALESCE($2, name), role = COALESCE($3, role),
       active = COALESCE($4, active), password_hash = COALESCE($5, password_hash)
     WHERE id = $1 RETURNING id, email, name, role, active, created_at`,
    [id, name ?? null, role ?? null, typeof active === 'boolean' ? active : null, hash]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  await audit(req.user.id, 'user.update', 'user', id, { role, active, passwordChanged: Boolean(password) });
  res.json(rows[0]);
}));

export default router;
