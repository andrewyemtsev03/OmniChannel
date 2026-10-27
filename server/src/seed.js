// Demo data for trying the platform locally: npm run seed
// Creates a rep and a reviewer, a few fictional doctors (some with СОПД), and an approved sample deck.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

async function main() {
  await migrate();
  const adminId = await upsertUser(process.env.ADMIN_EMAIL || 'admin@stada.kz', process.env.ADMIN_NAME || 'Platform Admin', 'admin', process.env.ADMIN_PASSWORD || 'ChangeMe123!');
  const repId = await upsertUser('rep@stada.kz', 'Demo Rep', 'rep', 'RepDemo123!');
  await upsertUser('mlr@stada.kz', 'Demo MLR Reviewer', 'reviewer', 'MlrDemo123!');

  const doctors = [
    ['DEMO-001', 'Иванова Анна Сергеевна', 'Кардиолог', 'Городская поликлиника №1', 'Алматы', '77010000001', true],
    ['DEMO-002', 'Ахметов Ерлан Маратович', 'Терапевт', 'Городская больница №4', 'Алматы', '77010000002', true],
    ['DEMO-003', 'Сейткали Динара Болатовна', 'Эндокринолог', 'Медицинский центр «Демо»', 'Астана', '77010000003', false],
    ['DEMO-004', 'Ким Виктор Александрович', 'Невролог', 'Областная больница', 'Шымкент', '77010000004', true],
  ];
  for (const [pid, name, spec, inst, city, phone, consent] of doctors) {
    const row = (await query(
      `INSERT INTO doctors (proxima_id, full_name, specialty, institution, city, phone, rep_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (proxima_id) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id, (xmax = 0) AS inserted`,
      [pid, name, spec, inst, city, phone, repId]
    )).rows[0];
    if (row.inserted && consent) {
      await query(
        `INSERT INTO consents (doctor_id, purpose, channel, method, given_at, evidence_note, recorded_by)
         VALUES ($1, 'Получение научной и промо-информации о препаратах Stada', 'any', 'written', now() - interval '10 days', 'Демо: бумажная форма, папка МП', $2)`,
        [row.id, adminId]
      );
    }
  }

  const hasDeck = (await query("SELECT 1 FROM presentations WHERE approval_code = 'DEMO-0001'")).rows[0];
  if (!hasDeck) {
    const html = await fs.readFile(path.join(here, '../sample/sample-deck.html'));
    const fileName = await saveHtml(html);
    await query(
      `INSERT INTO presentations (title, product, description, status, file_name, original_name, approval_code, uploaded_by, approved_by, approved_at)
       VALUES ('Демо-презентация', 'Demo product', 'Sample deck to test sending and tracking', 'approved', $1, 'sample-deck.html', 'DEMO-0001', $2, $2, now())`,
      [fileName, adminId]
    );
  }

  console.log('[seed] done. Demo logins:');
  console.log('  admin    -> ' + (process.env.ADMIN_EMAIL || 'admin@stada.kz') + ' / ' + (process.env.ADMIN_PASSWORD ? '(from .env)' : 'ChangeMe123!'));
  console.log('  rep      -> rep@stada.kz / RepDemo123!');
  console.log('  reviewer -> mlr@stada.kz / MlrDemo123!');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
