import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { config } from '../config.js';
import { tokenProvider } from '../cxone/tokenProvider.js';
import { isFetchRunning, startCxoneFetch } from '../cxone/fetchJob.js';

// Admin-only: CXone token management and fetching report data.
export const cxoneRouter = Router();
cxoneRouter.use(requireAdmin);

const tokenSchema = z.object({ token: z.string().trim().min(10).max(10_000) });
const fetchSchema = z.object({ from: z.string().max(10), to: z.string().max(10) });

// Never returns the token itself - only whether one is set and when it expires.
cxoneRouter.get('/status', (req, res) => {
  res.json({
    token: tokenProvider.status(),
    fetchRunning: isFetchRunning(),
    apiBase: config.cxone.apiBase,
    reportId: config.cxone.reportId,
    maxDaysPerFetch: config.cxone.maxDaysPerFetch,
  });
});

cxoneRouter.put('/token', (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paste the bearer token.' });
  tokenProvider.set(parsed.data.token);
  console.log(`[cxone] bearer token updated by ${req.user.email}`);
  res.json({ token: tokenProvider.status() });
});

cxoneRouter.delete('/token', (req, res) => {
  tokenProvider.clear();
  res.json({ token: tokenProvider.status() });
});

cxoneRouter.post('/fetch', async (req, res) => {
  const parsed = fetchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a From and To date.' });
  const result = await startCxoneFetch({ ...parsed.data, requestedBy: req.user.id });
  res.status(202).json(result);
});
