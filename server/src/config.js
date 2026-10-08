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

  // CXone - see docs/cxone-api.md. Items marked (verify) there are settings so they can be corrected without code changes.
  cxone: {
    apiBase: (process.env.CXONE_API_BASE || 'https://api-na1.niceincontact.com/incontactapi/services/v34.0').replace(/\/$/, ''),
    reportId: process.env.CXONE_REPORT_ID || '540',
    reportJobMethod: (process.env.CXONE_REPORT_JOB_METHOD || 'POST').toUpperCase(),
    fileFolder: process.env.CXONE_FILE_FOLDER ?? 'Reports\\\\', // literal Reports\\ as in the owner's working URL
    fileNamePrefix: process.env.CXONE_FILE_PREFIX || 'CJR_540_',
    maxDaysPerFetch: Number(process.env.CXONE_MAX_DAYS_PER_FETCH) || 31,
    // Automatic token minting (OAuth password grant). Used only when basic + username + password are all set.
    auth: {
      url: process.env.CXONE_AUTH_URL || 'https://cxone.niceincontact.com/auth/token',
      basic: process.env.CXONE_AUTH_BASIC || '', // ready-made value that goes after "Basic " in the header
      username: process.env.CXONE_AUTH_USERNAME || '', // Access Key ID
      password: process.env.CXONE_AUTH_PASSWORD || '', // Access Key Secret
    },
  },
};
