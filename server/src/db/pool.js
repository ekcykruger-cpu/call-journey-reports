import mysql from 'mysql2/promise';
import { config } from '../config.js';

// One shared connection pool for the whole app. Null when DATABASE_URL isn't set,
// so the server can still start (e.g. to answer /healthz) without a database.
export const pool = config.databaseUrl
  ? mysql.createPool({
      uri: config.databaseUrl,
      connectionLimit: 10,
      // Store and read DATETIME values as plain wall-clock strings; we handle timezones ourselves (Luxon).
      dateStrings: true,
      timezone: 'Z',
      supportBigNumbers: true,
      bigNumberStrings: true,
    })
  : null;

export function requirePool() {
  if (!pool) throw new Error('DATABASE_URL is not set - see .env.example');
  return pool;
}

export async function checkDb() {
  if (!pool) return 'not configured';
  try {
    await pool.query('SELECT 1');
    return 'ok';
  } catch (err) {
    return `error: ${err.code || err.message}`;
  }
}
