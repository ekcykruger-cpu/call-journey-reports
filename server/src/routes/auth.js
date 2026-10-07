import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requirePool, withTransaction } from '../db/pool.js';
import { requireAuth } from '../auth/middleware.js';
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from '../auth/passwords.js';
import { consumeAuthToken, createAuthToken, findValidToken, setPasswordLink } from '../auth/tokens.js';
import { resetEmail, sendMail } from '../mail/mailer.js';

export const authRouter = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_LOGIN = 'Invalid email or password.';
const BAD_LINK = 'This link is invalid, already used or expired. Ask for a new one.';

const emailField = z.string().trim().toLowerCase().max(255).pipe(z.email());
const loginSchema = z.object({ email: emailField, password: z.string().min(1).max(200) });
const forgotSchema = z.object({ email: emailField });
const setPasswordSchema = z.object({ token: z.string().min(20).max(200), password: z.string().max(200) });

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: 'Too many attempts. Try again later.' } });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, message: { error: 'Too many requests. Try again later.' } });

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' });
  const { email, password } = parsed.data;
  const pool = requirePool();

  const [rows] = await pool.query(
    `SELECT id, email, display_name, role, is_active, password_hash,
            (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()) AS locked
       FROM users WHERE email = ?`,
    [email],
  );
  const user = rows[0];
  if (!user || !user.password_hash || !user.is_active) {
    await dummyVerify(password);
    return res.status(401).json({ error: INVALID_LOGIN });
  }
  if (Number(user.locked)) {
    return res.status(423).json({ error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes, or reset your password.` });
  }

  if (!(await verifyPassword(user.password_hash, password))) {
    await pool.query('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?', [user.id]);
    await pool.query(
      `UPDATE users SET locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), failed_logins = 0
        WHERE id = ? AND failed_logins >= ?`,
      [LOCK_MINUTES, user.id, MAX_FAILED_LOGINS],
    );
    return res.status(401).json({ error: INVALID_LOGIN });
  }

  await pool.query(
    'UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
    [user.id],
  );
  // New session id at login, so a session id planted before login can't be reused.
  await regenerateSession(req);
  req.session.userId = user.id;
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cjr.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Always gives the same answer, whether or not the email has an account.
authRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });

  const [rows] = await requirePool().query('SELECT id, email FROM users WHERE email = ? AND is_active = 1', [parsed.data.email]);
  if (rows[0]) {
    const token = await createAuthToken(rows[0].id, 'reset');
    const { subject, text } = resetEmail(setPasswordLink(token));
    await sendMail({ to: rows[0].email, subject, text });
  }
  res.json({ ok: true, message: 'If that email has an account, a reset link has been sent.' });
});

// Lets the Set Password page show who the link is for, and say early if it has expired.
authRouter.get('/token-info', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const info = token.length >= 20 ? await findValidToken(token) : null;
  if (!info) return res.status(400).json({ error: BAD_LINK });
  res.json({ email: info.email, purpose: info.purpose });
});

// Used by both invite links and reset links.
authRouter.post('/set-password', forgotLimiter, async (req, res) => {
  const parsed = setPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: BAD_LINK });
  const { token, password } = parsed.data;

  const info = await findValidToken(token);
  if (!info) return res.status(400).json({ error: BAD_LINK });
  const problem = passwordProblem(password, info.email);
  if (problem) return res.status(400).json({ error: problem });

  const passwordHash = await hashPassword(password);
  const ok = await withTransaction(async (conn) => {
    if (!(await consumeAuthToken(conn, token))) return false;
    await conn.query(
      'UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?',
      [passwordHash, info.userId],
    );
    return true;
  });
  if (!ok) return res.status(400).json({ error: BAD_LINK });
  res.json({ ok: true });
});
