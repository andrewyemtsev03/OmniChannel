import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config, whatsappConfigured } from './config.js';
import { query } from './db.js';
import { migrate } from './migrate.js';
import { seedDemo } from './seed.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import doctorRoutes from './routes/doctors.js';
import presentationRoutes from './routes/presentations.js';
import sendRoutes from './routes/send.js';
import statsRoutes from './routes/stats.js';
import { viewerRouter, trackRouter } from './routes/viewer.js';

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public
const here = path.dirname(fileURLToPath(import.meta.url));
app.use('/brand', express.static(path.resolve(here, '../public/brand'), { maxAge: '7d', fallthrough: false }));
app.use('/api/auth', authRoutes);
app.use('/api/track', trackRouter);
app.use('/v', viewerRouter);

// Signed-in users
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/doctors', requireAuth, doctorRoutes);
app.use('/api/presentations', requireAuth, presentationRoutes);
app.use('/api/send', requireAuth, sendRoutes);
app.use('/api/stats', requireAuth, statsRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app in production (npm run build)
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Errors
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

async function ensureAdmin() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const hash = await bcrypt.hash(config.admin.password, 10);
  await query("INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, 'admin', $3)",
    [config.admin.email.toLowerCase(), config.admin.name, hash]);
  console.log(`[init] created admin user ${config.admin.email} — change the password after first login`);
}

async function main() {
  if (process.env.AUTO_MIGRATE !== 'false') await migrate();
  // Demo data on start, for hosted demos without shell access (e.g. Render free tier). Never with real data.
  if (process.env.SEED_DEMO_DATA === 'true') await seedDemo();
  await ensureAdmin();
  app.listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}  (public links: ${config.publicBaseUrl})`);
    console.log(`[server] WhatsApp: ${whatsappConfigured() ? 'live (Cloud API)' : 'dry-run (no credentials set)'}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
