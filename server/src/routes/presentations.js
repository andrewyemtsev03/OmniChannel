import { Router } from 'express';
import multer from 'multer';
import { query, audit } from '../db.js';
import { ah, HttpError, int } from '../utils.js';
import { requireRole } from '../middleware/auth.js';
import { readHtml, removeHtml, saveHtml, validateHtmlUpload } from '../services/storage.js';
import { DECK_CSP } from '../services/viewer.js';
import { presentationStats } from '../services/stats.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const SELECT = `
  SELECT p.*, ub.name AS uploaded_by_name, ab.name AS approved_by_name,
    (SELECT count(*) FROM links l WHERE l.presentation_id = p.id)::int AS links_count,
    (SELECT count(*) FROM links l WHERE l.presentation_id = p.id AND l.first_opened_at IS NOT NULL)::int AS opened_count
  FROM presentations p
  LEFT JOIN users ub ON ub.id = p.uploaded_by
  LEFT JOIN users ab ON ab.id = p.approved_by`;

async function loadPresentation(id, user) {
  const { rows } = await query(`${SELECT} WHERE p.id = $1`, [id]);
  const p = rows[0];
  if (!p) throw new HttpError(404, 'Presentation not found');
  if (user.role === 'rep' && p.status !== 'approved') throw new HttpError(403, 'This presentation is not approved yet');
  return p;
}

router.get('/', ah(async (req, res) => {
  const onlyApproved = req.user.role === 'rep' || req.query.status === 'approved';
  const { rows } = await query(
    `${SELECT} WHERE ($1::boolean = false OR p.status = 'approved') ORDER BY p.updated_at DESC`,
    [onlyApproved]
  );
  res.json(rows);
}));

router.post('/', requireRole('admin', 'reviewer'), upload.single('file'), ah(async (req, res) => {
  const problem = validateHtmlUpload(req.file);
  if (problem) throw new HttpError(400, problem);
  const title = String(req.body?.title || '').trim();
  if (!title) throw new HttpError(400, 'Title is required');
  const fileName = await saveHtml(req.file.buffer);
  const { rows } = await query(
    `INSERT INTO presentations (title, product, description, file_name, original_name, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, req.body.product || null, req.body.description || null, fileName, req.file.originalname, req.user.id]
  );
  await audit(req.user.id, 'presentation.upload', 'presentation', rows[0].id, { file: req.file.originalname });
  res.status(201).json(await loadPresentation(rows[0].id, req.user));
}));

router.get('/:id', ah(async (req, res) => {
  const p = await loadPresentation(int(req.params.id), req.user);
  const stats = await presentationStats(p.id, req.user.role === 'rep' ? req.user.id : null);
  res.json({ ...p, stats });
}));

router.patch('/:id', requireRole('admin', 'reviewer'), ah(async (req, res) => {
  const p = await loadPresentation(int(req.params.id), req.user);
  const { title, product, description } = req.body || {};
  if (title !== undefined && !String(title).trim()) throw new HttpError(400, 'Title cannot be empty');
  await query(
    `UPDATE presentations SET title = COALESCE($2, title), product = COALESCE($3, product),
       description = COALESCE($4, description), updated_at = now() WHERE id = $1`,
    [p.id, title?.trim() ?? null, product ?? null, description ?? null]
  );
  res.json(await loadPresentation(p.id, req.user));
}));

// Replacing the file is only allowed before approval. To change an approved deck, upload a new one.
router.post('/:id/file', requireRole('admin', 'reviewer'), upload.single('file'), ah(async (req, res) => {
  const p = await loadPresentation(int(req.params.id), req.user);
  if (p.status === 'approved' || p.status === 'archived') {
    throw new HttpError(409, 'Approved materials cannot be changed. Upload a new presentation instead.');
  }
  const problem = validateHtmlUpload(req.file);
  if (problem) throw new HttpError(400, problem);
  const fileName = await saveHtml(req.file.buffer);
  await query(
    `UPDATE presentations SET file_name = $2, original_name = $3, version = version + 1, status = 'draft',
       slide_count = NULL, updated_at = now() WHERE id = $1`,
    [p.id, fileName, req.file.originalname]
  );
  await removeHtml(p.file_name);
  await audit(req.user.id, 'presentation.replace_file', 'presentation', p.id, { file: req.file.originalname });
  res.json(await loadPresentation(p.id, req.user));
}));

// ---------- MLR approval workflow: draft -> in_review -> approved -> archived ----------

async function transition(req, res, { from, to, extraSql = '', params = [], action }) {
  const id = int(req.params.id);
  const { rows } = await query(
    `UPDATE presentations SET status = $2, updated_at = now() ${extraSql}
     WHERE id = $1 AND status = ANY($3::text[]) RETURNING id`,
    [id, to, from, ...params]
  );
  if (!rows[0]) {
    const exists = (await query('SELECT status FROM presentations WHERE id = $1', [id])).rows[0];
    if (!exists) throw new HttpError(404, 'Presentation not found');
    throw new HttpError(409, `Cannot do this while the presentation is "${exists.status}"`);
  }
  await audit(req.user.id, action, 'presentation', id, req.body && Object.keys(req.body).length ? req.body : null);
  res.json(await loadPresentation(id, req.user));
}

router.post('/:id/submit', requireRole('admin', 'reviewer'), ah((req, res) =>
  transition(req, res, { from: ['draft'], to: 'in_review', extraSql: ', review_comment = NULL', action: 'presentation.submit' })));

router.post('/:id/approve', requireRole('admin', 'reviewer'), ah((req, res) => {
  const code = String(req.body?.approval_code || '').trim();
  if (!code) throw new HttpError(400, 'Enter the MLR approval code');
  return transition(req, res, {
    from: ['in_review'], to: 'approved',
    extraSql: ', approval_code = $4, approved_by = $5, approved_at = now()',
    params: [code, req.user.id], action: 'presentation.approve',
  });
}));

router.post('/:id/reject', requireRole('admin', 'reviewer'), ah((req, res) => {
  const comment = String(req.body?.comment || '').trim();
  if (!comment) throw new HttpError(400, 'Add a comment explaining what needs to change');
  return transition(req, res, {
    from: ['in_review'], to: 'draft', extraSql: ', review_comment = $4', params: [comment], action: 'presentation.reject',
  });
}));

router.post('/:id/archive', requireRole('admin'), ah((req, res) =>
  transition(req, res, { from: ['draft', 'in_review', 'approved'], to: 'archived', action: 'presentation.archive' })));

router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const p = await loadPresentation(int(req.params.id), req.user);
  if (p.links_count > 0) throw new HttpError(409, 'This presentation has been sent to doctors. Archive it instead.');
  await query('DELETE FROM presentations WHERE id = $1', [p.id]);
  await removeHtml(p.file_name);
  await audit(req.user.id, 'presentation.delete', 'presentation', p.id);
  res.json({ ok: true });
}));

// Raw deck for the in-app preview. Sandboxed by CSP so it cannot act as the signed-in user.
router.get('/:id/file', ah(async (req, res) => {
  const p = await loadPresentation(int(req.params.id), req.user);
  const html = await readHtml(p.file_name);
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': DECK_CSP,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(html);
}));

export default router;
