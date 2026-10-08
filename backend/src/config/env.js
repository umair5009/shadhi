const path = require('node:path');
const { z } = require('zod');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z.stringbool().default(false),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),

  EMAIL_PROVIDER: z.enum(['console', 'resend', 'none']).default('console'),
  EMAIL_FROM: z.string().default('Shadi Hall <no-reply@example.com>'),
  RESEND_API_KEY: z.string().optional(),

  SCHEDULER_ENABLED: z.stringbool().default(true),
  LOG_REQUESTS: z.stringbool().default(true),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('Copy backend/.env.example to backend/.env and fill in the values.');
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  if (!env.COOKIE_SECURE) console.warn('[env] COOKIE_SECURE is false in production — cookies will be sent over plain HTTP.');
  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    process.exit(1);
  }
}

env.corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
env.uploadDir = path.resolve(__dirname, '../..', env.UPLOAD_DIR);
env.isProduction = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';

module.exports = env;
