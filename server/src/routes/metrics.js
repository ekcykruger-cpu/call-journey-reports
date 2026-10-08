import { Router } from 'express';
import { requireAdmin } from '../auth/middleware.js';
import { listFields } from '../metrics/fields.js';
import { compileDefinition } from '../metrics/definition.js';
import { runSeries } from '../metrics/engine.js';
import { createMetric, deleteMetric, getMetric, listMetrics, listSkills, updateMetric } from '../metrics/store.js';

// Reading metrics and their chart data: any logged-in user. Creating/changing them: admins.
// (requireAuth is applied where this router is mounted.)
export const metricsRouter = Router();

const seriesOptions = (src) => ({ from: src.from, to: src.to, interval: src.interval, mode: src.mode, skills: src.skills });

metricsRouter.get('/', async (req, res) => {
  res.json({ metrics: await listMetrics() });
});

metricsRouter.get('/fields', (req, res) => {
  res.json({ fields: listFields() });
});

metricsRouter.get('/skills', async (req, res) => {
  res.json({ skills: await listSkills() });
});

metricsRouter.get('/:id/series', async (req, res) => {
  const metric = await getMetric(Number(req.params.id));
  if (!metric) return res.status(404).json({ error: 'Metric not found.' });
  res.json(await runSeries(metric, seriesOptions(req.query)));
});

// Metric Builder: check a definition without saving it.
metricsRouter.post('/validate', requireAdmin, (req, res) => {
  compileDefinition(req.body?.definition);
  res.json({ ok: true });
});

// Metric Builder: run an unsaved definition to preview the chart.
metricsRouter.post('/preview', requireAdmin, async (req, res) => {
  res.json(await runSeries(req.body?.definition, seriesOptions(req.body ?? {})));
});

metricsRouter.post('/', requireAdmin, async (req, res) => {
  res.status(201).json({ metric: await createMetric(req.body?.definition, req.user.id) });
});

metricsRouter.put('/:id', requireAdmin, async (req, res) => {
  const metric = await updateMetric(Number(req.params.id), req.body?.definition);
  if (!metric) return res.status(404).json({ error: 'Metric not found.' });
  res.json({ metric });
});

metricsRouter.delete('/:id', requireAdmin, async (req, res) => {
  if (!(await deleteMetric(Number(req.params.id)))) return res.status(404).json({ error: 'Metric not found.' });
  res.json({ ok: true });
});
