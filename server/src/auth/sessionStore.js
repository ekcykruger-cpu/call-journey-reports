import session from 'express-session';
import { requirePool } from '../db/pool.js';

// Keeps login sessions in the MySQL `sessions` table so users stay logged in across restarts/deploys.
// (Written in-house instead of express-mysql-session, which pins a vulnerable mysql2 version.)

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

function run(promiseFn, cb) {
  try {
    promiseFn().then((value) => cb(null, value), (err) => cb(err));
  } catch (err) {
    cb(err);
  }
}

export class MySqlSessionStore extends session.Store {
  constructor({ cleanupIntervalMs = 15 * 60 * 1000 } = {}) {
    super();
    const timer = setInterval(() => {
      this.cleanup().catch((err) => console.error('[sessions] cleanup failed:', err.message));
    }, cleanupIntervalMs);
    timer.unref();
  }

  ttlSeconds(sess) {
    const maxAge = sess?.cookie?.maxAge;
    return maxAge ? Math.ceil(maxAge / 1000) : DEFAULT_TTL_SECONDS;
  }

  get(sid, cb) {
    run(async () => {
      const [rows] = await requirePool().query(
        'SELECT data FROM sessions WHERE sid = ? AND expires_at > UTC_TIMESTAMP()',
        [sid],
      );
      return rows.length ? JSON.parse(rows[0].data) : null;
    }, cb);
  }

  set(sid, sess, cb = () => {}) {
    run(async () => {
      await requirePool().query(
        `INSERT INTO sessions (sid, expires_at, data)
         VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), ?) AS new
         ON DUPLICATE KEY UPDATE expires_at = new.expires_at, data = new.data`,
        [sid, this.ttlSeconds(sess), JSON.stringify(sess)],
      );
    }, cb);
  }

  touch(sid, sess, cb = () => {}) {
    run(async () => {
      await requirePool().query(
        'UPDATE sessions SET expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE sid = ?',
        [this.ttlSeconds(sess), sid],
      );
    }, cb);
  }

  destroy(sid, cb = () => {}) {
    run(async () => {
      await requirePool().query('DELETE FROM sessions WHERE sid = ?', [sid]);
    }, cb);
  }

  async cleanup() {
    await requirePool().query('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
  }
}
