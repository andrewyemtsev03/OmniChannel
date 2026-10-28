// Demo data for trying the platform locally: npm run seed
// Creates a rep and a reviewer, a few fictional doctors (some with СОПД), and an approved sample deck.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';
import { migrate } from './migrate.js';
import { saveHtml } from './services/storage.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function upsertUser(email, name, role, password) {
  const existing = (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
  if (existing) return existing.id;
  const hash = await bcrypt.hash(password, 10);
  return (await query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, name, role, hash])).rows[0].id;
}

// Idempotent: safe to run on every start (SEED_DEMO_DATA=true).
export async function seedDemo() {
  await migrate();
  const adminId = await upsertUser(process.env.ADMIN_EMAIL || 'admin@stada.kz', process.env.ADMIN_NAME || 'Platform Admin', 'admin', process.env.ADMIN_PASSWORD || 'ChangeMe123!');
  const repId = await upsertUser('rep@stada.kz', 'Demo Rep', 'rep', 'RepDemo123!');
  await upsertUser('mlr@stada.kz', 'Demo MLR Reviewer', 'reviewer', 'MlrDemo123!');

  // Fictional doctors. consent: 'any' | 'email' (links only) | null (no СОПД)
  const doctors = [
    ['DEMO-001', 'Иванова Анна Сергеевна', 'Кардиолог', 'Городская поликлиника №1', 'Алматы', '77010000001', 'any'],
    ['DEMO-002', 'Ахметов Ерлан Маратович', 'Терапевт', 'Городская больница №4', 'Алматы', '77010000002', 'any'],
    ['DEMO-003', 'Сейткали Динара Болатовна', 'Эндокринолог', 'Медицинский центр «Демо»', 'Астана', '77010000003', null],
    ['DEMO-004', 'Ким Виктор Александрович', 'Невролог', 'Областная больница', 'Шымкент', '77010000004', 'any'],
    ['DEMO-005', 'Нұрланов Асқар Серікұлы', 'Кардиолог', 'Городская больница №7', 'Алматы', '77010000005', 'any'],
    ['DEMO-006', 'Әбенова Гүлназ Ерланқызы', 'Терапевт', 'Поликлиника №12', 'Астана', '77010000006', 'any'],
    ['DEMO-007', 'Петров Сергей Игоревич', 'Кардиолог', 'Кардиоцентр', 'Караганда', '77010000007', 'email'],
    ['DEMO-008', 'Жумабекова Айгерим Канатовна', 'Эндокринолог', 'Городская поликлиника №3', 'Алматы', '77010000008', 'any'],
    ['DEMO-009', 'Ли Ольга Владимировна', 'Невролог', 'Медицинский центр «Демо»', 'Астана', '77010000009', 'any'],
    ['DEMO-010', 'Оспанов Данияр Бауыржанович', 'Терапевт', 'Районная больница', 'Талдыкорган', '77010000010', null],
  ];
  const doctorIds = [];
  for (const [pid, name, spec, inst, city, phone, consent] of doctors) {
    const row = (await query(
      `INSERT INTO doctors (proxima_id, full_name, specialty, institution, city, phone, rep_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() - interval '40 days')
       ON CONFLICT (proxima_id) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id, (xmax = 0) AS inserted`,
      [pid, name, spec, inst, city, phone, repId]
    )).rows[0];
    if (consent) doctorIds.push({ id: row.id, channel: consent === 'email' ? 'link' : 'whatsapp' });
    if (row.inserted && consent) {
      await query(
        `INSERT INTO consents (doctor_id, purpose, channel, method, given_at, evidence_note, recorded_by)
         VALUES ($1, 'Получение научной и рекламной информации о рецептурных препаратах STADA', $2, 'written',
                 now() - interval '35 days', 'Демо: бумажная форма, папка МП', $3)`,
        [row.id, consent, adminId]
      );
    }
  }

  const hasDeck = (await query("SELECT 1 FROM presentations WHERE approval_code = 'DEMO-0001'")).rows[0];
  if (!hasDeck) {
    const html = await fs.readFile(path.join(here, '../sample/sample-deck.html'));
    const deck = async (title, product, status, extra = {}) => (await query(
      `INSERT INTO presentations (title, product, description, status, file_name, original_name, approval_code,
         uploaded_by, approved_by, approved_at, slide_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'sample-deck.html', $6, $7, $8, $9, $10, now() - interval '30 days', now() - $11::interval)
       RETURNING id`,
      [title, product, 'Demo deck for trying the platform', status, await saveHtml(html), extra.code || null,
        adminId, extra.approved ? adminId : null, extra.approved ? new Date(Date.now() - 28 * 864e5) : null,
        extra.approved ? 5 : null, extra.updated || '1 day']
    )).rows[0].id;
    const approvedId = await deck('Демо-презентация', 'Demo product', 'approved', { code: 'DEMO-0001', approved: true, updated: '28 days' });
    await deck('Кардио: ключевые данные (демо)', 'Demo product', 'in_review', { updated: '2 days' });
    await deck('Эндокринология: обзор (демо)', 'Demo product', 'draft', { updated: '5 days' });

    // Demo activity: personal links over the last 4 weeks, most opened, a few still waiting (follow-ups).
    let s = 7;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const slideProfile = [9, 26, 14, 18, 6]; // typical seconds per slide
    for (const [i, { id: docId, channel }] of doctorIds.entries()) {
      const sentDaysAgo = 3 + Math.floor(rand() * 24);
      const token = `demo${i}${Math.floor(rand() * 1e9).toString(36)}`;
      const link = (await query(
        `INSERT INTO links (token, presentation_id, doctor_id, channel, created_by, created_at)
         VALUES ($1, $2, $3, $6, $4, now() - ($5 || ' days')::interval) RETURNING id`,
        [token, approvedId, docId, repId, sentDaysAgo, channel]
      )).rows[0];
      if (i % 4 === 3) continue; // not opened yet
      const sessions = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < sessions; k++) {
        const daysAgo = Math.max(0, sentDaysAgo - 1 - Math.floor(rand() * Math.min(sentDaysAgo, 6)) - k);
        const reached = 2 + Math.floor(rand() * 4); // slides 0..reached-1
        const secs = slideProfile.slice(0, reached).map((v) => Math.max(2, Math.round(v * (0.6 + rand() * 0.9))));
        const total = secs.reduce((a, b) => a + b, 0);
        const vs = (await query(
          `INSERT INTO view_sessions (link_id, session_key, user_agent, total_seconds, started_at, last_seen_at)
           VALUES ($1, $2, 'Demo', $3::int, now() - ($4::text || ' days')::interval - interval '3 hours', now() - ($4::text || ' days')::interval - interval '3 hours' + ($3::text || ' seconds')::interval)
           RETURNING id`,
          [link.id, `${token}-s${k}`, total, daysAgo]
        )).rows[0];
        for (const [idx, sec] of secs.entries()) {
          await query('INSERT INTO slide_views (session_id, slide_index, seconds) VALUES ($1, $2, $3)', [vs.id, idx, sec]);
        }
        await query(`UPDATE links SET first_opened_at = COALESCE(first_opened_at, now() - ($2 || ' days')::interval - interval '3 hours') WHERE id = $1`, [link.id, daysAgo]);
      }
    }
  }

  console.log('[seed] done. Demo logins:');
  console.log('  admin    -> ' + (process.env.ADMIN_EMAIL || 'admin@stada.kz') + ' / ' + (process.env.ADMIN_PASSWORD ? '(from .env)' : 'ChangeMe123!'));
  console.log('  rep      -> rep@stada.kz / RepDemo123!');
  console.log('  reviewer -> mlr@stada.kz / MlrDemo123!');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDemo().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
