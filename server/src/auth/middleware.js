import { pool } from '../db/pool.js';
import { config } from '../config.js';

// Loads the logged-in user (fresh from the database on every request, so deactivating a user
// or changing their role takes effect immediately).
export async function loadUser(req, res, next) {
  req.user = null;
  const userId = req.session?.userId;
  if (!userId || !pool) return next();

  const [rows] = await pool.query(
    'SELECT id, email, display_name, role FROM users WHERE id = ? AND is_active = 1',
    [userId],
  );
  if (rows[0]) {
    req.user = { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role };
  } else {
    req.session.userId = undefined;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

// Blocks state-changing requests that come from another website (defence against CSRF,
// on top of SameSite=Strict cookies).
export function checkOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Bad origin.' });
  }
  const allowed = [req.get('host'), new URL(config.appBaseUrl).host];
  if (!allowed.includes(originHost)) return res.status(403).json({ error: 'Bad origin.' });
  next();
}
