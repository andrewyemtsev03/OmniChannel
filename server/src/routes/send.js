import { Router } from 'express';
import { query, audit } from '../db.js';
import { config } from '../config.js';
import { ah, HttpError, int, newToken, ACTIVE_CONSENT_SQL } from '../utils.js';
import { sendPresentationLink, messageText, waMeUrl } from '../services/whatsapp.js';

const router = Router();
const MAX_PER_REQUEST = 200;

/**
 * Creates a personal tracked link per doctor and (for channel "whatsapp") sends it.
 * Body: { presentation_id, doctor_ids: [], channel: "whatsapp" | "link" }
 * Consent rules: "link" needs any active consent, "whatsapp" needs consent for whatsapp or any channel.
 */
router.post('/', ah(async (req, res) => {
  const presentationId = int(req.body?.presentation_id);
  const channel = req.body?.channel === 'whatsapp' ? 'whatsapp' : 'link';
  const doctorIds = [...new Set((req.body?.doctor_ids || []).map(int).filter(Boolean))];
  if (!presentationId) throw new HttpError(400, 'Choose a presentation');
  if (!doctorIds.length) throw new HttpError(400, 'Choose at least one doctor');
  if (doctorIds.length > MAX_PER_REQUEST) throw new HttpError(400, `Send to at most ${MAX_PER_REQUEST} doctors at a time`);

  const p = (await query('SELECT id, title, status FROM presentations WHERE id = $1', [presentationId])).rows[0];
  if (!p) throw new HttpError(404, 'Presentation not found');
  if (p.status !== 'approved') throw new HttpError(409, 'Only MLR-approved presentations can be sent to doctors');

  const channels = channel === 'whatsapp' ? ['whatsapp', 'any'] : ['any', 'whatsapp', 'email', 'portal'];
  const { rows: doctors } = await query(
    `SELECT d.id, d.full_name, d.phone, d.rep_id,
       EXISTS (SELECT 1 FROM consents c WHERE c.doctor_id = d.id AND c.channel = ANY($2::text[]) AND ${ACTIVE_CONSENT_SQL}) AS consent_ok
     FROM doctors d WHERE d.id = ANY($1::int[])`,
    [doctorIds, channels]
  );
  const byId = new Map(doctors.map((d) => [d.id, d]));

  const results = [];
  for (const id of doctorIds) {
    const d = byId.get(id);
    const base = { doctor_id: id, full_name: d?.full_name || null };
    if (!d) { results.push({ ...base, status: 'skipped', error: 'Doctor not found' }); continue; }
    if (req.user.role === 'rep' && d.rep_id !== req.user.id) { results.push({ ...base, status: 'skipped', error: 'Assigned to another rep' }); continue; }
    if (!d.consent_ok) {
      results.push({ ...base, status: 'skipped', error: channel === 'whatsapp' ? 'No active consent (СОПД) for WhatsApp' : 'No active consent (СОПД)' });
      continue;
    }
    if (channel === 'whatsapp' && !d.phone) { results.push({ ...base, status: 'skipped', error: 'No phone number' }); continue; }

    const token = newToken();
    const link = (await query(
      `INSERT INTO links (token, presentation_id, doctor_id, channel, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [token, p.id, d.id, channel, req.user.id]
    )).rows[0];
    const url = `${config.publicBaseUrl}/v/${token}`;

    if (channel === 'link') {
      const text = messageText({ doctorName: d.full_name, title: p.title, url });
      results.push({ ...base, status: 'created', url, wa_me_url: d.phone ? waMeUrl(d.phone, text) : null });
      continue;
    }

    const sent = await sendPresentationLink({ phone: d.phone, doctorName: d.full_name, title: p.title, url });
    await query(
      `INSERT INTO messages (doctor_id, link_id, channel, status, provider_message_id, error, sent_by)
       VALUES ($1, $2, 'whatsapp', $3, $4, $5, $6)`,
      [d.id, link.id, sent.status, sent.providerMessageId || null, sent.error || null, req.user.id]
    );
    results.push({ ...base, status: sent.status, url, wa_me_url: sent.waMeUrl || null, error: sent.error || null });
  }

  const summary = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  await audit(req.user.id, 'presentation.send', 'presentation', p.id, { channel, summary });
  res.json({ channel, summary, results });
}));

export default router;
