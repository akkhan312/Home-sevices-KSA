require('dotenv').config({ quiet: true });

// ─── Centralised, validated runtime configuration ────────────────────────────
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')} (see backend/.env.example)`);
  process.exit(1);
}

if (isProduction && process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;

// Public base URL of this API, used to build absolute URLs for uploaded files.
const API_HOST = (process.env.API_HOST || `http://localhost:${PORT}`).replace(/\/+$/, '');

// Comma-separated list of allowed browser origins. Native apps send no Origin header and are always allowed.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const COMMISSION_RATE = 0.15;

function toPublicUrl(p) {
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_HOST}${p.startsWith('/') ? '' : '/'}${p}`;
}

function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return cb(null, true);
  if (!isProduction && CORS_ORIGINS.length === 0) return cb(null, true);
  return cb(null, false);
}

module.exports = {
  NODE_ENV,
  isProduction,
  PORT,
  API_HOST,
  CORS_ORIGINS,
  COMMISSION_RATE,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_CURRENCY: (process.env.STRIPE_CURRENCY || 'sar').toLowerCase(),
  toPublicUrl,
  corsOrigin,
};
