import 'dotenv/config';
import path from 'node:path';

const nodeEnv = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 4000);

if (nodeEnv === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production')) {
  throw new Error('JWT_SECRET must be set to a strong random value in production.');
}

export const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port,
  // Render sets RENDER_EXTERNAL_URL automatically
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'postgres://stada:stada@localhost:5432/stada_omni',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  hcpGate: (process.env.HCP_GATE || 'true') !== 'false',
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@stada.kz',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
    name: process.env.ADMIN_NAME || 'Platform Admin',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'presentation_share',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'ru',
  },
};

export const whatsappConfigured = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
