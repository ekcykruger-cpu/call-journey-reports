import crypto from 'node:crypto';
import { requirePool } from '../db/pool.js';
import { config } from '../config.js';

// Invite and password-reset links. The raw token only ever exists in the emailed link;
// the database stores its SHA-256 hash, so a database leak can't be used to reset passwords.

const TTL_MINUTES = { reset: 30, invite: 72 * 60 };

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function createAuthToken(userId, purpose) {
  const token = crypto.randomBytes(32).toString('base64url');
  const pool = requirePool();
  // Only the newest link works: retire any earlier unused links for the same purpose.
  await pool.query(
    'UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
    [userId, purpose],
  );
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
    [userId, sha256(token), purpose, TTL_MINUTES[purpose]],
  );
  return token;
}

// Looks up a still-valid token without using it up (to show "Set password for x@y" on the page).
export async function findValidToken(token) {
  const [rows] = await requirePool().query(
    `SELECT t.user_id, t.purpose, u.email
       FROM auth_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP() AND u.is_active = 1`,
    [sha256(token)],
  );
  return rows[0] ? { userId: rows[0].user_id, purpose: rows[0].purpose, email: rows[0].email } : null;
}

// Marks the token used, atomically, inside the caller's transaction. Returns false if it was
// already used or expired (e.g. the link was clicked twice).
export async function consumeAuthToken(conn, token) {
  const [result] = await conn.query(
    `UPDATE auth_tokens SET used_at = UTC_TIMESTAMP()
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
    [sha256(token)],
  );
  return result.affectedRows === 1;
}

export function setPasswordLink(token, baseUrl = config.appBaseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;
}
