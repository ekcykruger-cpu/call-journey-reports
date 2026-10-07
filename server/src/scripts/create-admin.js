// Creates (or promotes) an admin user and prints a one-time "set your password" link.
// No password is ever typed into the terminal or stored in a script.
//
// Usage (PowerShell, from the repo root):
//   npm run create-admin -- you@example.com "Your Name" --base-url https://your-app.up.railway.app

import { pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { createAuthToken, setPasswordLink } from '../auth/tokens.js';
import { config } from '../config.js';

const args = process.argv.slice(2);
const baseUrlIndex = args.indexOf('--base-url');
const baseUrl = baseUrlIndex >= 0 ? args.splice(baseUrlIndex, 2)[1] : config.appBaseUrl;
const [rawEmail, displayName] = args;
const email = (rawEmail || '').trim().toLowerCase();

if (!email || !email.includes('@')) {
  console.error('Usage: npm run create-admin -- you@example.com "Your Name" [--base-url https://your-app.up.railway.app]');
  process.exit(1);
}
if (!pool) {
  console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

try {
  await runMigrations();
  const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [email]);
  let userId;
  if (rows[0]) {
    userId = rows[0].id;
    await pool.query("UPDATE users SET role = 'admin', is_active = 1 WHERE id = ?", [userId]);
    console.log(`Existing user ${email} is now an active admin.`);
  } else {
    const [result] = await pool.query(
      "INSERT INTO users (email, display_name, role) VALUES (?, ?, 'admin')",
      [email, displayName || null],
    );
    userId = result.insertId;
    console.log(`Created admin user ${email}.`);
  }

  const purpose = rows[0]?.password_hash ? 'reset' : 'invite';
  const token = await createAuthToken(userId, purpose);
  console.log(`\nOpen this link to set the password (${purpose === 'invite' ? 'valid 72 hours' : 'valid 30 minutes'}):`);
  console.log(setPasswordLink(token, baseUrl));
} catch (err) {
  console.error('create-admin failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
