import express, { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { importReportCsv, listImports } from '../import/importService.js';

// Admin-only: manual CSV upload (for testing before / alongside the CXone API) and import history.
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
