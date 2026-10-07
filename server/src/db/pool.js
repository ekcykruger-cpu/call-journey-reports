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
  if (!pool) {
    const err = new Error('Database not configured (DATABASE_URL is not set)');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  return pool;
}

// Runs fn(conn) inside a transaction; commits on success, rolls back on any error.
export async function withTransaction(fn) {
  const conn = await requirePool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
