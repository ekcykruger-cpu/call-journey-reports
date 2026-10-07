import { requirePool, withTransaction } from '../db/pool.js';
import { parseReportCsv } from './parseReport.js';
import { stitchJourneys } from './stitch.js';

// CSV text → contact_legs (upsert by contact_id) → rebuilt journeys, all in one transaction.

const LEG_COLUMNS = [
  'contact_id', 'master_contact_id', 'contact_code', 'media_name', 'contact_name', 'ani_dialnum',
  'skill_no', 'skill_name', 'campaign_no', 'campaign_name', 'agent_no', 'agent_name', 'team_no', 'team_name',
  'sla', 'start_local', 'start_utc', 'pre_queue', 'in_queue', 'agent_time', 'post_queue', 'acw_time',
  'total_time', 'abandon_time', 'routing_time', 'abandon', 'callback_time', 'logged', 'hold_time',
  'disp_code', 'disp_name', 'disp_comments', 'tags', 'journey_id', 'leg_seq', 'has_next_leg', 'import_id',
];
const JOURNEY_COLUMNS = [
  'journey_id', 'start_local', 'start_utc', 'leg_count', 'transfer_count', 'sum_pre_queue', 'sum_in_queue',
  'sum_agent_time', 'sum_post_queue', 'sum_post_queue_excl_transfer', 'sum_acw', 'sum_hold', 'sum_abandon_time',
  'sum_routing_time', 'sum_total', 'abandoned_final', 'abandoned_any', 'first_skill_no', 'first_skill_name',
  'last_skill_name', 'last_agent_name', 'final_disp_name', 'first_sla',
];
const BATCH = 500;

function chunks(items, size = BATCH) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectLegsWhereIn(conn, column, ids) {
  const rows = [];
  for (const batch of chunks(ids)) {
    const [result] = await conn.query(`SELECT * FROM contact_legs WHERE ${column} IN (?)`, [batch]);
    rows.push(...result);
  }
  return rows;
}

// Pulls in stored legs that belong to the same journeys as the new legs: parents (walking up)
// and children (walking down), repeating until nothing new is found.
async function loadConnectedLegs(conn, newLegs) {
  const legs = new Map(newLegs.map((leg) => [leg.contact_id, leg]));
  let frontier = [...legs.keys()];
  while (frontier.length) {
    const missingParents = [...new Set(frontier.map((id) => legs.get(id).master_contact_id))].filter((id) => !legs.has(id));
    const found = [
      ...(await selectLegsWhereIn(conn, 'contact_id', missingParents)),
      ...(await selectLegsWhereIn(conn, 'master_contact_id', frontier)),
    ];
    frontier = [];
    for (const row of found) {
      if (legs.has(row.contact_id)) continue;
      legs.set(row.contact_id, row);
      frontier.push(row.contact_id);
    }
  }
  return [...legs.values()];
}

async function upsertRows(conn, table, columns, rows) {
  const updates = columns.slice(1).map((c) => `${c} = new.${c}`).join(', ');
  for (const batch of chunks(rows)) {
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await conn.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders} AS new ON DUPLICATE KEY UPDATE ${updates}`,
      batch.flatMap((row) => columns.map((c) => row[c] ?? null)),
    );
  }
}

// Creates the history row for an import. Status starts 'queued' (CXone fetches) or 'running' (uploads).
export async function createImport({ source, fileName = null, requestedBy = null, rangeStart = null, rangeEnd = null, status = 'running' }) {
  const [created] = await requirePool().query(
    `INSERT INTO imports (source, file_name, range_start, range_end, requested_by, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?, IF(? = 'running', UTC_TIMESTAMP(), NULL))`,
    [source, fileName, rangeStart, rangeEnd, requestedBy, status, status],
  );
  return created.insertId;
}

// At startup nothing can still be in progress: anything queued/running was cut off by a restart.
export async function failInterruptedImports() {
  const [result] = await requirePool().query(
    `UPDATE imports SET status = 'failed', error_text = 'Interrupted by a server restart - fetch this day again.',
            finished_at = UTC_TIMESTAMP()
      WHERE status IN ('queued', 'running')`,
  );
  if (result.affectedRows) console.warn(`[import] marked ${result.affectedRows} interrupted import(s) as failed`);
}

export async function markImportRunning(importId) {
  await requirePool().query("UPDATE imports SET status = 'running', started_at = UTC_TIMESTAMP() WHERE id = ?", [importId]);
}

export async function setImportFileName(importId, fileName) {
  await requirePool().query('UPDATE imports SET file_name = ? WHERE id = ?', [fileName, importId]);
}

// A successful fetch that had nothing to import (e.g. CXone answered 204 No Content).
export async function completeImportWithoutData(importId, fileName, note) {
  await requirePool().query(
    `UPDATE imports SET status = 'done', file_name = ?, rows_read = 0, rows_upserted = 0, journeys_rebuilt = 0,
            error_text = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?`,
    [fileName, note, importId],
  );
}

export async function failImport(importId, message) {
  await requirePool().query(
    "UPDATE imports SET status = 'failed', error_text = ?, finished_at = UTC_TIMESTAMP() WHERE id = ?",
    [message, importId],
  );
}

// Manual upload: create the history row and process the file straight away.
export async function importReportCsv(text, options) {
  const importId = await createImport({ ...options, status: 'running' });
  return processImport(importId, text);
}

// Parses and saves CSV text for an existing import row.
// Returns a summary: { importId, rowsRead, rowsUpserted, skipped, journeysRebuilt, errors[] }.
export async function processImport(importId, text) {
  const pool = requirePool();
  try {
    const parsed = parseReportCsv(text);
    for (const leg of parsed.legs) leg.import_id = importId;

    const journeysRebuilt = await withTransaction(async (conn) => {
      const legs = await loadConnectedLegs(conn, parsed.legs);
      const allIds = legs.map((leg) => leg.contact_id);

      // Journeys these legs belonged to before (some may disappear when an orphan leg gets its parent).
      const oldJourneyIds = new Set();
      for (const batch of chunks(allIds)) {
        const [rows] = await conn.query('SELECT journey_id FROM contact_legs WHERE contact_id IN (?) AND journey_id IS NOT NULL', [batch]);
        rows.forEach((r) => oldJourneyIds.add(r.journey_id));
      }

      const journeys = stitchJourneys(legs);
      await upsertRows(conn, 'contact_legs', LEG_COLUMNS, legs);
      await upsertRows(conn, 'journeys', JOURNEY_COLUMNS, journeys);

      const newJourneyIds = new Set(journeys.map((j) => j.journey_id));
      const stale = [...oldJourneyIds].filter((id) => !newJourneyIds.has(id));
      for (const batch of chunks(stale)) await conn.query('DELETE FROM journeys WHERE journey_id IN (?)', [batch]);
      return journeys.length;
    });

    const summary = {
      importId,
      rowsRead: parsed.rowsRead,
      rowsUpserted: parsed.legs.length,
      skipped: parsed.skipped,
      journeysRebuilt,
      errors: parsed.errors,
    };
    await pool.query(
      `UPDATE imports SET status = 'done', rows_read = ?, rows_upserted = ?, journeys_rebuilt = ?, error_text = ?,
              finished_at = UTC_TIMESTAMP() WHERE id = ?`,
      [summary.rowsRead, summary.rowsUpserted, journeysRebuilt, parsed.errors.length ? parsed.errors.join('\n') : null, importId],
    );
    return summary;
  } catch (err) {
    await failImport(importId, err.message);
    err.status = 400;
    err.expose = true;
    err.message = `Import failed: ${err.message}`;
    throw err;
  }
}

export async function listImports(limit = 50) {
  const [rows] = await requirePool().query(
    `SELECT i.id, i.source, i.file_name, i.range_start, i.range_end, i.status, i.rows_read, i.rows_upserted,
            i.journeys_rebuilt, i.error_text, i.created_at, i.finished_at, u.email AS requested_by
       FROM imports i LEFT JOIN users u ON u.id = i.requested_by
      ORDER BY i.id DESC LIMIT ?`,
    [limit],
  );
  return rows;
}
