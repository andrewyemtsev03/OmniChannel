import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';

// Presentation HTML lives in the presentation_files table (migration 002).
// Files saved to UPLOAD_DIR by earlier versions are still read from disk as a fallback.
const legacyDir = () => path.join(config.uploadDir, 'presentations');

export function validateHtmlUpload(file) {
  if (!file) return 'Attach an .html file';
  if (!/\.html?$/i.test(file.originalname)) return 'Only .html files are supported (export the Claude presentation as HTML)';
  const head = file.buffer.subarray(0, 4096).toString('utf8').toLowerCase();
  if (!/<(!doctype html|html|head|body|div|section|svg|style|script)/.test(head)) return 'This file does not look like an HTML page';
  return null;
}

export async function saveHtml(buffer) {
  const name = `${crypto.randomUUID()}.html`;
  await query('INSERT INTO presentation_files (name, html) VALUES ($1, $2)', [name, buffer.toString('utf8')]);
  return name;
}

export async function readHtml(name) {
  const { rows } = await query('SELECT html FROM presentation_files WHERE name = $1', [name]);
  if (rows[0]) return rows[0].html;
  try {
    return await fs.readFile(path.join(legacyDir(), path.basename(name)), 'utf8');
  } catch {
    throw Object.assign(new Error('The presentation file is missing'), { status: 404 });
  }
}

export async function removeHtml(name) {
  await query('DELETE FROM presentation_files WHERE name = $1', [name]);
  await fs.rm(path.join(legacyDir(), path.basename(name)), { force: true });
}
