/**
 * Centralised, validated access to `process.env`.
 *
 * Everything the app needs at runtime is resolved exactly once, here, so the
 * rest of the codebase never touches `process.env` directly. Missing required
 * configuration fails fast with a human-readable message instead of a cryptic
 * crash later on.
 */
import dotenv from 'dotenv';

dotenv.config();

/** Parse a loosely typed env flag ("true", "1", "yes", "on") into a boolean. */
const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

/** Split a comma separated env list into a trimmed array (trailing "/" removed). */
const toList = (value, fallback = []) => {
  if (!value) return fallback;
  const items = String(value)
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return items.length ? items : fallback;
};

/** Print a clear configuration error and stop the process. */
const fail = (message) => {
  // eslint-disable-next-line no-console
  console.error(`\n[config] ${message}\n`);
  process.exit(1);
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Required configuration
// ---------------------------------------------------------------------------

// MONGO_URI has no safe default: the server must never silently connect to
// "something" instead of the database the operator intended.
if (!process.env.MONGO_URI) {
  fail(
    'MONGO_URI is not set.\n' +
      '  Add it to your .env file (copy .env.example) or set it as an environment\n' +
      '  variable. Locally: mongodb://127.0.0.1:27017/doctor-tracker\n' +
      '  Atlas:   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/doctor-tracker',
  );
}

if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URI)) {
  fail('MONGO_URI must start with "mongodb://" or "mongodb+srv://".');
}

// In production the JWT secret is a hard requirement - a weak or example
// secret would let anyone mint valid session tokens.
if (isProd) {
  const problems = [];
  if (!process.env.JWT_SECRET) {
    problems.push('JWT_SECRET is required in production');
  } else if (process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters long in production');
  } else if (process.env.JWT_SECRET.includes('change_me')) {
    problems.push('JWT_SECRET still uses the example value from .env.example');
  }
  if (problems.length) {
    fail(`Invalid production configuration:\n - ${problems.join('\n - ')}`);
  }
}

// ---------------------------------------------------------------------------
// Cookie policy
// ---------------------------------------------------------------------------
// Production (SPA on a different domain than the API):
//   httpOnly + secure + sameSite="none"  -> sent cross-site, only over HTTPS
// Development (http://localhost):
//   httpOnly + secure=false + sameSite="lax"
//     -> works over plain HTTP and the browser will not silently drop it.
const cookiePolicy = isProd
  ? { httpOnly: true, secure: true, sameSite: 'none' }
  : { httpOnly: true, secure: false, sameSite: 'lax' };

export const env = {
  NODE_ENV,
  isProd,

  /** Port provided by Render / the platform. */
  PORT: Number(process.env.PORT) || 5000,
  /** Always bind on all interfaces so the platform can reach the container. */
  HOST: '0.0.0.0',

  MONGO_URI: process.env.MONGO_URI,

  JWT_SECRET: process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  /**
   * Allowed browser origins for CORS (credentials mode needs explicit values).
   * The defaults cover both common local setups:
   *   - Vite / other SPA dev servers  -> http://localhost:5173
   *   - Next.js dev server            -> http://localhost:3000
   */
  CLIENT_URLS: toList(process.env.CLIENT_URL, [
    'http://localhost:5173',
    'http://localhost:3000',
  ]),

  LOG_FORMAT: process.env.LOG_FORMAT || (isProd ? 'combined' : 'dev'),

  /** Global API rate limiter master switch. */
  RATE_LIMIT_ENABLED: toBool(process.env.RATE_LIMIT_ENABLED, true),

  cookie: {
    name: process.env.COOKIE_NAME || 'dt_token',
    ...cookiePolicy,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  },
};

export default env;
