import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { query, audit, tx } from '../db.js';
import { ah, HttpError, int, normalizePhone, ACTIVE_CONSENT_SQL } from '../utils.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const CONSENT_CHANNELS = ['any', 'whatsapp', 'email', 'portal'];
const CONSENT_METHODS = ['written', 'egov', 'digital', 'other'];

// Reps only see doctors assigned to them; admins and reviewers see everyone.
const repScope = (user) => (user.role === 'rep' ? user.id : null);

export async function loadDoctorForUser(id, user) {
  const { rows } = await query('SELECT * FROM doctors WHERE id = $1', [id]);
  const doctor = rows[0];
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  if (user.role === 'rep' && doctor.rep_id !== user.id) throw new HttpError(403, 'This doctor is assigned to another rep');
  return doctor;
}

router.get('/', ah(async (req, res) => {
  const search = req.query.search ? `%${String(req.query.search).trim()}%` : null;
  const consent = ['active', 'none'].includes(req.query.consent) ? req.query.consent : 'all';
  const { rows } = await query(
    `SELECT * FROM (
       SELECT d.*, u.name AS rep_name,
         EXISTS (SELECT 1 FROM consents c WHERE c.doctor_id = d.id AND ${ACTIVE_CONSENT_SQL}) AS has_consent,
         EXISTS (SELECT 1 FROM consents c WHERE c.doctor_id = d.id AND c.channel IN ('whatsapp', 'any') AND ${ACTIVE_CONSENT_SQL}) AS whatsapp_consent,
         (SELECT max(vs.last_seen_at) FROM view_sessions vs JOIN links l ON l.id = vs.link_id WHERE l.doctor_id = d.id) AS last_viewed_at
       FROM doctors d LEFT JOIN users u ON u.id = d.rep_id
       WHERE ($1::text IS NULL OR d.full_name ILIKE $1 OR d.city ILIKE $1 OR d.specialty ILIKE $1
              OR d.institution ILIKE $1 OR d.proxima_id ILIKE $1 OR d.phone ILIKE $1)
         AND ($2::int IS NULL OR d.rep_id = $2)
     ) t
     WHERE $3 = 'all' OR ($3 = 'active' AND has_consent) OR ($3 = 'none' AND NOT has_consent)
     ORDER BY full_name
     LIMIT 1000`,
    [search, repScope(req.user), consent]
  );
  res.json(rows);
}));

function doctorFields(body) {
  const f = {
    proxima_id: body.proxima_id ? String(body.proxima_id).trim() : null,
    full_name: body.full_name ? String(body.full_name).trim() : '',
    specialty: body.specialty || null,
    institution: body.institution || null,
    city: body.city || null,
    phone: normalizePhone(body.phone),
    email: body.email ? String(body.email).trim().toLowerCase() : null,
    rep_id: int(body.rep_id),
  };
  if (body.phone && !f.phone) throw new HttpError(400, `Phone number "${body.phone}" is not valid`);
  return f;
}

router.post('/', ah(async (req, res) => {
  const f = doctorFields(req.body || {});
  if (!f.full_name) throw new HttpError(400, 'Full name is required');
  if (req.user.role === 'rep') f.rep_id = req.user.id;
  try {
    const { rows } = await query(
      `INSERT INTO doctors (proxima_id, full_name, specialty, institution, city, phone, email, rep_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [f.proxima_id, f.full_name, f.specialty, f.institution, f.city, f.phone, f.email, f.rep_id]
    );
    await audit(req.user.id, 'doctor.create', 'doctor', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A doctor with this Proxima ID already exists');
    throw err;
  }
}));

router.get('/:id', ah(async (req, res) => {
  const doctor = await loadDoctorForUser(int(req.params.id), req.user);
  const [consents, links, messages, rep] = await Promise.all([
    query(
      `SELECT c.*, u.name AS recorded_by_name,
         (${ACTIVE_CONSENT_SQL}) AS active
       FROM consents c LEFT JOIN users u ON u.id = c.recorded_by
       WHERE c.doctor_id = $1 ORDER BY c.given_at DESC`, [doctor.id]),
    query(
      `SELECT l.id, l.token, l.channel, l.created_at, l.first_opened_at, p.id AS presentation_id, p.title,
         COUNT(vs.id)::int AS sessions, COALESCE(SUM(vs.total_seconds), 0)::int AS total_seconds,
         MAX(vs.last_seen_at) AS last_viewed_at
       FROM links l JOIN presentations p ON p.id = l.presentation_id
       LEFT JOIN view_sessions vs ON vs.link_id = l.id
       WHERE l.doctor_id = $1 GROUP BY l.id, p.id ORDER BY l.created_at DESC`, [doctor.id]),
    query(
      `SELECT m.*, u.name AS sent_by_name FROM messages m LEFT JOIN users u ON u.id = m.sent_by
       WHERE m.doctor_id = $1 ORDER BY m.created_at DESC LIMIT 100`, [doctor.id]),
    doctor.rep_id ? query('SELECT id, name FROM users WHERE id = $1', [doctor.rep_id]) : { rows: [] },
  ]);
  res.json({ ...doctor, rep: rep.rows[0] || null, consents: consents.rows, links: links.rows, messages: messages.rows });
}));

router.patch('/:id', ah(async (req, res) => {
  const doctor = await loadDoctorForUser(int(req.params.id), req.user);
  const f = doctorFields({ ...doctor, ...req.body });
  if (!f.full_name) throw new HttpError(400, 'Full name is required');
  if (req.user.role === 'rep') f.rep_id = doctor.rep_id;
  const { rows } = await query(
    `UPDATE doctors SET proxima_id = $2, full_name = $3, specialty = $4, institution = $5, city = $6,
       phone = $7, email = $8, rep_id = $9, updated_at = now() WHERE id = $1 RETURNING *`,
    [doctor.id, f.proxima_id, f.full_name, f.specialty, f.institution, f.city, f.phone, f.email, f.rep_id]
  );
  await audit(req.user.id, 'doctor.update', 'doctor', doctor.id);
  res.json(rows[0]);
}));

// Permanently removes a doctor and everything linked to them (data subject erasure request).
router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const id = int(req.params.id);
  const { rowCount } = await query('DELETE FROM doctors WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Doctor not found');
  await audit(req.user.id, 'doctor.delete', 'doctor', id);
  res.json({ ok: true });
}));

// ---------- Consents (СОПД) ----------

router.post('/:id/consents', ah(async (req, res) => {
  const doctor = await loadDoctorForUser(int(req.params.id), req.user);
  const { purpose, channel = 'any', method, given_at, expires_at, evidence_note } = req.body || {};
  if (!purpose || !String(purpose).trim()) throw new HttpError(400, 'Purpose of processing is required');
  if (!CONSENT_CHANNELS.includes(channel)) throw new HttpError(400, 'Unknown channel');
  if (!CONSENT_METHODS.includes(method)) throw new HttpError(400, 'Choose how the consent was obtained');
  const given = given_at ? new Date(given_at) : new Date();
  if (Number.isNaN(given.getTime()) || given > new Date()) throw new HttpError(400, 'Consent date cannot be in the future');
  const expires = expires_at ? new Date(expires_at) : null;
  if (expires && (Number.isNaN(expires.getTime()) || expires <= given)) throw new HttpError(400, 'Expiry must be after the consent date');
  const { rows } = await query(
    `INSERT INTO consents (doctor_id, purpose, channel, method, given_at, expires_at, evidence_note, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [doctor.id, String(purpose).trim(), channel, method, given, expires, evidence_note || null, req.user.id]
  );
  await audit(req.user.id, 'consent.create', 'consent', rows[0].id, { doctor_id: doctor.id, channel, method });
  res.status(201).json(rows[0]);
}));

router.post('/:id/consents/:consentId/withdraw', ah(async (req, res) => {
  const doctor = await loadDoctorForUser(int(req.params.id), req.user);
  const { rows } = await query(
    `UPDATE consents SET withdrawn_at = now() WHERE id = $1 AND doctor_id = $2 AND withdrawn_at IS NULL RETURNING *`,
    [int(req.params.consentId), doctor.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Active consent not found');
  await audit(req.user.id, 'consent.withdraw', 'consent', rows[0].id, { doctor_id: doctor.id });
  res.json(rows[0]);
}));

// ---------- CSV import (e.g. export from Proxima) ----------

const HEADER_ALIASES = {
  proxima_id: ['proxima_id', 'proxima id', 'id', 'код', 'id proxima', 'onekey'],
  full_name: ['full_name', 'name', 'фио', 'врач', 'full name'],
  specialty: ['specialty', 'speciality', 'специальность'],
  institution: ['institution', 'lpu', 'лпу', 'учреждение', 'организация', 'клиника'],
  city: ['city', 'город'],
  phone: ['phone', 'mobile', 'телефон', 'мобильный', 'whatsapp'],
  email: ['email', 'e-mail', 'почта'],
  rep_email: ['rep_email', 'rep', 'мп', 'представитель'],
};

function mapHeader(h) {
  const key = String(h || '').trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(key)) return field;
  return null;
}

router.post('/import', requireRole('admin'), upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a CSV file');
  const text = req.file.buffer.toString('utf8');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  let records;
  try {
    records = parse(text, {
      delimiter, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true,
      columns: (headers) => headers.map((h) => mapHeader(h) || `_ignored_${h}`),
    });
  } catch (err) {
    throw new HttpError(400, `Could not read the CSV: ${err.message}`);
  }
  if (!records.length) throw new HttpError(400, 'The file has no rows');
  if (!('full_name' in records[0])) throw new HttpError(400, 'The file needs a full_name (or ФИО) column');

  const reps = new Map((await query('SELECT id, lower(email) AS email FROM users')).rows.map((u) => [u.email, u.id]));
  const result = { created: 0, updated: 0, skipped: 0, errors: [] };

  await tx(async (client) => {
    for (const [i, r] of records.entries()) {
      const line = i + 2;
      if (Object.values(r).every((v) => !String(v ?? '').trim())) continue; // blank row like ";;;;"
      await client.query('SAVEPOINT import_row');
      try {
        const f = doctorFields(r);
        if (!f.full_name) { result.skipped++; result.errors.push(`Row ${line}: missing name`); continue; }
        f.rep_id = r.rep_email ? reps.get(String(r.rep_email).trim().toLowerCase()) ?? null : null;
        let existing = null;
        if (f.proxima_id) existing = (await client.query('SELECT id FROM doctors WHERE proxima_id = $1', [f.proxima_id])).rows[0];
        else if (f.phone) existing = (await client.query('SELECT id FROM doctors WHERE phone = $1 LIMIT 1', [f.phone])).rows[0];
        if (existing) {
          await client.query(
            `UPDATE doctors SET proxima_id = COALESCE($2, proxima_id), full_name = $3,
               specialty = COALESCE($4, specialty), institution = COALESCE($5, institution), city = COALESCE($6, city),
               phone = COALESCE($7, phone), email = COALESCE($8, email), rep_id = COALESCE($9, rep_id), updated_at = now()
             WHERE id = $1`,
            [existing.id, f.proxima_id, f.full_name, f.specialty, f.institution, f.city, f.phone, f.email, f.rep_id]
          );
          result.updated++;
        } else {
          await client.query(
            `INSERT INTO doctors (proxima_id, full_name, specialty, institution, city, phone, email, rep_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [f.proxima_id, f.full_name, f.specialty, f.institution, f.city, f.phone, f.email, f.rep_id]
          );
          result.created++;
        }
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        result.skipped++;
        result.errors.push(`Row ${line}: ${err.message}`);
      }
    }
  });
  await audit(req.user.id, 'doctor.import', 'doctor', null, { ...result, errors: result.errors.length });
  res.json({ ...result, errors: result.errors.slice(0, 50) });
}));

export default router;
