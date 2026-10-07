import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkDb } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
app.use(express.json());

// Railway (and you) can hit this to check the service is alive.
// Always 200 while the web server runs, so a database hiccup doesn't make Railway restart the app;
// the "db" field shows the database state.
app.get('/healthz', async (req, res) => {
  res.json({ status: 'ok', db: await checkDb(), time: new Date().toISOString() });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Call Journey Reports API is running' });
});

// Unknown API routes return JSON 404s instead of the React page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve the built React app (client/dist) and let React handle page routes.
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built yet. Run: npm run build');
  });
});

// Bring the database schema up to date, then start accepting requests.
try {
  await runMigrations();
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
