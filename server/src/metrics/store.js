import { requirePool } from '../db/pool.js';
import { compileDefinition } from './definition.js';

// Saved metrics live in the `metrics` table; `definition` holds the full JSON from the Metric Builder.

function toApi(row) {
  const definition = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
  return { id: row.id, ...definition, name: row.name, chartType: row.chart_type, updatedAt: row.updated_at };
}

export async function listMetrics() {
  const [rows] = await requirePool().query('SELECT id, name, definition, chart_type, updated_at FROM metrics WHERE is_active = 1 ORDER BY name');
  return rows.map(toApi);
}

export async function getMetric(id) {
  const [rows] = await requirePool().query('SELECT id, name, definition, chart_type, updated_at FROM metrics WHERE id = ? AND is_active = 1', [id]);
  return rows[0] ? toApi(rows[0]) : null;
}

function nameTaken(err) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  return Object.assign(new Error('A metric with that name already exists.'), { status: 409, expose: true });
}

export async function createMetric(input, userId) {
  const { definition } = compileDefinition(input); // validates; throws a readable error if invalid
  try {
    const [result] = await requirePool().query(
      'INSERT INTO metrics (name, description, definition, chart_type, created_by) VALUES (?, ?, ?, ?, ?)',
      [definition.name, definition.description, JSON.stringify(definition), definition.chartType, userId],
    );
    return getMetric(result.insertId);
  } catch (err) {
    throw nameTaken(err);
  }
}

export async function updateMetric(id, input) {
  const { definition } = compileDefinition(input);
  try {
    const [result] = await requirePool().query(
      'UPDATE metrics SET name = ?, description = ?, definition = ?, chart_type = ? WHERE id = ? AND is_active = 1',
      [definition.name, definition.description, JSON.stringify(definition), definition.chartType, id],
    );
    return result.affectedRows ? getMetric(id) : null;
  } catch (err) {
    throw nameTaken(err);
  }
}

export async function deleteMetric(id) {
  const [result] = await requirePool().query('DELETE FROM metrics WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Entry skills seen in the data, for the dashboard's skill filter.
export async function listSkills() {
  const [rows] = await requirePool().query(
    'SELECT first_skill_name AS name, COUNT(*) AS journeys FROM journeys WHERE first_skill_name IS NOT NULL GROUP BY first_skill_name ORDER BY first_skill_name',
  );
  return rows.map((r) => ({ name: r.name, journeys: Number(r.journeys) }));
}
