// Central place for reading environment variables.
// Locally they come from ../.env (loaded by `node --env-file-if-exists`);
// on Railway they come from the service's Variables tab.
import crypto from 'node:crypto';

const isProduction = process.env.NODE_ENV === 'production';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) throw new Error('SESSION_SECRET must be set in production (Railway → Variables)');
  // Dev only: a random secret per start, so you'll be logged out whenever the server restarts.
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] SESSION_SECRET not set - using a temporary one (dev only)');
}

export const config = {
  sessionSecret,
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  timezone: 'Australia/Sydney',
};
