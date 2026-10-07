import { Router } from 'express';
import { z } from 'zod';
import { requirePool } from '../db/pool.js';
import { requireAdmin } from '../auth/middleware.js';
import { createAuthToken, setPasswordLink } from '../auth/tokens.js';
import { inviteEmail, resetEmail, sendMail } from '../mail/mailer.js';

// Admin-only user management: list, invite, change role, activate/deactivate, resend links.
export const usersRouter = Router();
usersRouter.use(requireAdmin);

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  displayName: z.string().trim().max(100).optional().default(''),
  role: z.enum(['admin', 'viewer']),
});
const updateSchema = z.object({
  role: z.enum(['admin', 'viewer']).optional(),
  isActive: z.boolean().optional(),
});

function toApiUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    hasPassword: Boolean(row.has_password),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

const USER_COLUMNS = `id, email, display_name, role, is_active, (password_hash IS NOT NULL) AS has_password,
                      last_login_at, created_at`;

// Emails the link; if email isn't set up yet, hands the link back so the admin can pass it on.
async function sendLink(user, purpose) {
  const token = await createAuthToken(user.id, purpose);
  const link = setPasswordLink(token);
  const { subject, text } = purpose === 'invite' ? inviteEmail(link) : resetEmail(link);
  const { sent } = await sendMail({ to: user.email, subject, text });
  return { emailSent: sent, link: sent ? undefined : link };
}

usersRouter.get('/', async (req, res) => {
  const [rows] = await requirePool().query(`SELECT ${USER_COLUMNS} FROM users ORDER BY email`);
  res.json({ users: rows.map(toApiUser) });
});

usersRouter.post('/invite', async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and role.' });
  const { email, displayName, role } = parsed.data;
  const pool = requirePool();

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing[0]) return res.status(409).json({ error: 'A user with that email already exists.' });

  const [result] = await pool.query(
    'INSERT INTO users (email, display_name, role) VALUES (?, ?, ?)',
    [email, displayName || null, role],
  );
  const user = { id: result.insertId, email };
  res.status(201).json(await sendLink(user, 'invite'));
});

usersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return res.status(400).json({ error: 'Invalid request.' });
  const { role, isActive } = parsed.data;

  // Stop admins locking themselves out.
  if (id === req.user.id && (role === 'viewer' || isActive === false)) {
    return res.status(400).json({ error: "You can't demote or deactivate your own account." });
  }

  const pool = requirePool();
  if (role !== undefined) await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  if (isActive !== undefined) await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);

  const [rows] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: toApiUser(rows[0]) });
});

// Sends a fresh invite (user has no password yet) or a reset link (user already has one).
usersRouter.post('/:id/send-link', async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await requirePool().query(
    'SELECT id, email, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = ? AND is_active = 1',
    [id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Active user not found.' });
  res.json(await sendLink(rows[0], rows[0].has_password ? 'reset' : 'invite'));
});
