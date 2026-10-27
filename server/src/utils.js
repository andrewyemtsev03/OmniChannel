import crypto from 'node:crypto';

// Wraps async route handlers so thrown errors reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Normalises Kazakh phone numbers to digits in international format: 87011234567 -> 77011234567
export function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  return digits.length >= 10 ? digits : null;
}

export const newToken = () => crypto.randomBytes(18).toString('base64url');

export const int = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

// SQL fragment: is there an active consent for this doctor (optionally for a channel)?
export const ACTIVE_CONSENT_SQL = `
  withdrawn_at IS NULL AND given_at <= now() AND (expires_at IS NULL OR expires_at > now())`;
