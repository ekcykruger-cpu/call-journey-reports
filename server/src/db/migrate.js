import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

// Applies every *.sql file in ./migrations that hasn't been applied yet, in filename order.
// Rule: never edit a migration that has already run anywhere - add a new numbered file instead.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export async function runMigrations() {
  if (!config.databaseUrl) {
    console.warn('[migrate] DATABASE_URL not set - skipping migrations');
    return [];
  }

  // A dedicated connection that allows several SQL statements per file.
  const conn = await mysql.createConnection({ uri: config.databaseUrl, multipleStatements: true });
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);

    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    const ran = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] applying ${file}`);
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      ran.push(file);
    }
    console.log(ran.length ? `[migrate] applied ${ran.length} migration(s)` : '[migrate] database is up to date');
    return ran;
  } finally {
    await conn.end();
  }
}

// Allow running directly: npm run migrate
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] failed:', err.message);
      process.exit(1);
    });
}
