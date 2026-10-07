// Central place for reading environment variables.
// Locally they come from ../.env (loaded by `node --env-file-if-exists`);
// on Railway they come from the service's Variables tab.

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
  timezone: 'Australia/Sydney',
};
