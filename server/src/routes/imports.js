import express, { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { clearCallData, importReportCsv, listImports } from '../import/importService.js';
import { isFetchRunning } from '../cxone/fetchJob.js';

// Admin-only: manual CSV upload (for testing before / alongside the CXone API), import history, clearing data.
export const importsRouter = Router();
importsRouter.use(requireAdmin);

// The browser sends the file's text as the request body; the name comes in ?fileName=.
importsRouter.post(
  '/upload',
  express.text({ type: ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'], limit: '50mb' }),
  async (req, res) => {
    if (typeof req.body !== 'string' || !req.body.trim()) {
      return res.status(400).json({ error: 'No file content received. Choose a .csv file.' });
    }
    const fileName = typeof req.query.fileName === 'string' ? req.query.fileName.slice(0, 255) : null;
    const summary = await importReportCsv(req.body, { source: 'upload', fileName, requestedBy: req.user.id });
    res.json(summary);
  },
);

importsRouter.get('/', async (req, res) => {
  res.json({ imports: await listImports() });
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clearSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('all'), confirm: z.literal('DELETE') }),
  z.object({ scope: z.literal('range'), from: isoDate, to: isoDate, confirm: z.literal('DELETE') }),
]);

importsRouter.post('/clear', async (req, res) => {
  const parsed = clearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose what to clear and type DELETE to confirm.' });
  if (parsed.data.scope === 'range' && parsed.data.to < parsed.data.from) {
    return res.status(400).json({ error: 'The To date must be on or after the From date.' });
  }
  if (isFetchRunning()) return res.status(409).json({ error: 'A CXone fetch is running. Wait for it to finish first.' });

  const deleted = await clearCallData(parsed.data);
  console.log(`[data] ${req.user.email} cleared call data (${parsed.data.scope}${parsed.data.scope === 'range' ? ` ${parsed.data.from}..${parsed.data.to}` : ''}): ${JSON.stringify(deleted)}`);
  res.json({ deleted });
});
