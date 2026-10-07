import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkDb, pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { MySqlSessionStore } from './auth/sessionStore.js';
import { checkOrigin, loadUser, requireAuth } from './auth/middleware.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { importsRouter } from './routes/imports.js';
import { cxoneRouter } from './routes/cxone.js';
import { failInterruptedImports } from './import/importService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
// Railway sits in front of the app as a proxy; trust it so secure cookies and rate limiting see the real client.
app.set('trust proxy', 1);
app.use(
  helmet({
    // Upgrading to https breaks plain-http localhost testing, so only do it in production.
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.isProduction ? [] : null } },
  }),
);
app.use(express.json({ limit: '100kb' }));

// Railway (and you) can hit this to check the service is alive.
// Always 200 while the web server runs, so a database hiccup doesn't make Railway restart the app;
// the "db" field shows the database state.
app.get('/healthz', async (req, res) => {
  res.json({ status: 'ok', db: await checkDb(), time: new Date().toISOString() });
});

// --- API ---
const api = express.Router();
api.use(checkOrigin);
api.use(
  session({
    name: 'cjr.sid',
    secret: config.sessionSecret,
    store: pool ? new MySqlSessionStore() : undefined, // in-memory only when there's no database (dev)
    resave: false,
    saveUninitialized: false,
    rolling: true, // stay logged in while active; log out after 8 idle hours
    cookie: { httpOnly: true, secure: config.isProduction, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 },
  }),
);
api.use(loadUser);

api.use('/auth', authRouter);
api.use('/users', usersRouter);
api.use('/imports', importsRouter);
api.use('/cxone', cxoneRouter);
api.get('/hello', requireAuth, (req, res) => {
  res.json({ message: `Hello ${req.user.displayName || req.user.email}` });
});

// Unknown API routes return JSON 404s instead of the React page.
api.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use('/api', api);

// --- React app ---
// Serve the built React app (client/dist) and let React handle page routes.
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built yet. Run: npm run build');
  });
});

// Last-resort error handler: log details on the server, show a safe message to the browser.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err.message);
  res.status(status).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

// Bring the database schema up to date, then start accepting requests.
try {
  await runMigrations();
  if (pool) await failInterruptedImports();
} catch (err) {
  console.error('[startup] migrations failed:', err.message);
  process.exit(1);
}

// Express 5 passes startup errors (e.g. port already in use) to this callback.
app.listen(config.port, (err) => {
  if (err) {
    console.error(`[startup] could not listen on port ${config.port}: ${err.code || err.message}`);
    process.exit(1);
  }
  console.log(`Server listening on port ${config.port} (${config.nodeEnv})`);
});
