import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db.js';
import { config } from '../config.js';
import { ah } from '../utils.js';
import { readHtml } from '../services/storage.js';
import { DECK_CSP, injectReporter, messagePage, wrapperPage } from '../services/viewer.js';

// Public routes: what doctors open from WhatsApp. No login.
export const viewerRouter = Router();
export const trackRouter = Router();

async function findLink(token) {
  if (!token || token.length > 64) return { error: 'missing' };
  const { rows } = await query(
    `SELECT l.*, p.title, p.status, p.file_name, p.approval_code
     FROM links l JOIN presentations p ON p.id = l.presentation_id WHERE l.token = $1`,
    [token]
  );
  const link = rows[0];
  if (!link) return { error: 'missing' };
  if (link.status !== 'approved') return { error: 'withdrawn' };
  if (link.expires_at && new Date(link.expires_at) < new Date()) return { error: 'expired' };
  return { link };
}

const ERRORS = {
  missing: [404, 'Ссылка не найдена', 'Проверьте ссылку или обратитесь к вашему медицинскому представителю.'],
  withdrawn: [410, 'Материал недоступен', 'Этот материал больше не доступен. Обратитесь к вашему медицинскому представителю.'],
  expired: [410, 'Срок действия ссылки истёк', 'Попросите медицинского представителя прислать новую ссылку.'],
};

const noIndex = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

viewerRouter.get('/:token', ah(async (req, res) => {
  const { link, error } = await findLink(req.params.token);
  if (error) {
    const [status, title, text] = ERRORS[error];
    return res.status(status).set(noIndex).send(messagePage(title, text));
  }
  res.set({ ...noIndex, 'Cache-Control': 'no-store' }).send(
    wrapperPage({ token: link.token, title: link.title, approvalCode: link.approval_code, hcpGate: config.hcpGate })
  );
}));

viewerRouter.get('/:token/deck', ah(async (req, res) => {
  const { link, error } = await findLink(req.params.token);
  if (error) return res.status(ERRORS[error][0]).set(noIndex).send(messagePage(ERRORS[error][1], ERRORS[error][2]));
  const html = injectReporter(await readHtml(link.file_name));
  res.set({
    ...noIndex,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': DECK_CSP,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(html);
}));

// Receives slide timings from the wrapper page. sendBeacon posts text/plain, fetch posts JSON.
const trackLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

trackRouter.post('/', trackLimiter, express.text({ type: 'text/plain', limit: '8kb' }), ah(async (req, res) => {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }
  const { token, session, slides, total } = body || {};
  if (typeof session !== 'string' || session.length < 8 || session.length > 64) return res.status(400).end();
  if (!slides || typeof slides !== 'object') return res.status(400).end();

  const { link, error } = await findLink(String(token || ''));
  if (error) return res.status(error === 'missing' ? 404 : 410).end();

  // The wrapper flushes every 10 seconds, so one ping never legitimately carries more than
  // that. Cap at MAX_PING_SECONDS and scale slides down proportionally so a tampered request
  // cannot inflate stats, and per-slide time always adds up to the session total.
  const MAX_PING_SECONDS = 30;
  let entries = Object.entries(slides)
    .map(([k, v]) => [Number.parseInt(k, 10), Math.max(Number.parseInt(v, 10) || 0, 0)])
    .filter(([k, v]) => Number.isInteger(k) && k >= 0 && k < 500 && v > 0)
    .slice(0, 50);
  const raw = entries.reduce((a, [, v]) => a + v, 0);
  if (raw > MAX_PING_SECONDS) {
    entries = entries.map(([k, v]) => [k, Math.floor((v * MAX_PING_SECONDS) / raw)]).filter(([, v]) => v > 0);
  }
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (!entries.length) return res.status(204).end();

  await tx(async (c) => {
    const s = (await c.query(
      `INSERT INTO view_sessions (link_id, session_key, user_agent) VALUES ($1, $2, $3)
       ON CONFLICT (session_key) DO UPDATE SET last_seen_at = now()
       RETURNING id, link_id`,
      [link.id, session, String(req.get('user-agent') || '').slice(0, 300)]
    )).rows[0];
    if (s.link_id !== link.id) throw Object.assign(new Error('Session belongs to another link'), { status: 400 });
    for (const [idx, secs] of entries) {
      await c.query(
        `INSERT INTO slide_views (session_id, slide_index, seconds) VALUES ($1, $2, $3)
         ON CONFLICT (session_id, slide_index) DO UPDATE SET seconds = slide_views.seconds + EXCLUDED.seconds`,
        [s.id, idx, secs]
      );
    }
    await c.query('UPDATE view_sessions SET total_seconds = total_seconds + $2, last_seen_at = now() WHERE id = $1', [s.id, sum]);
    await c.query('UPDATE links SET first_opened_at = COALESCE(first_opened_at, now()) WHERE id = $1', [link.id]);
    const t = Number.parseInt(total, 10);
    if (Number.isInteger(t) && t > 0 && t < 500) {
      await c.query('UPDATE presentations SET slide_count = GREATEST(COALESCE(slide_count, 0), $2) WHERE id = $1', [link.presentation_id, t]);
    }
  });
  res.status(204).end();
}));
