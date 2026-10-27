import { Router } from 'express';
import { query } from '../db.js';
import { whatsappConfigured } from '../config.js';
import { ah, int } from '../utils.js';
import { requireRole } from '../middleware/auth.js';
import { overviewStats } from '../services/stats.js';

const router = Router();

router.get('/overview', ah(async (req, res) => {
  const stats = await overviewStats(req.user.role === 'rep' ? req.user.id : null);
  res.json({ ...stats, whatsapp_mode: whatsappConfigured() ? 'live' : 'dry_run' });
}));

router.get('/audit', requireRole('admin'), ah(async (req, res) => {
  const limit = Math.min(int(req.query.limit) || 200, 1000);
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
}));

export default router;
