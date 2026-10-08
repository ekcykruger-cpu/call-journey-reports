import { DateTime } from 'luxon';
import { requirePool } from '../db/pool.js';
import { compileDefinition } from './definition.js';
import { MetricError } from './expression.js';

// Runs a metric over a date range and returns chart-ready data:
//   { labels[], values[], summary: { value, journeys }, ... }
// Journeys are bucketed by their first leg's Sydney start time (start_local).
//   timeline: one point per interval across the whole range (e.g. 2 days at 15 min = 192 points)
//   profile:  all days folded into one 24-hour shape (96 points at 15 min)

export const INTERVALS = [15, 30, 60];
const MAX_DAYS = { timeline: 93, profile: 366 };

function badRequest(message) {
  return new MetricError(message);
}

export function parseSeriesOptions({ from, to, interval, mode, skills }, defaultMode = 'timeline') {
  const start = DateTime.fromISO(String(from ?? ''));
  const end = DateTime.fromISO(String(to ?? ''));
  if (!start.isValid || !end.isValid) throw badRequest('Choose a valid From and To date.');
  if (end < start) throw badRequest('The To date must be on or after the From date.');
  const minutes = Number(interval ?? 60);
  if (!INTERVALS.includes(minutes)) throw badRequest('Interval must be 15, 30 or 60 minutes.');
  const xAxis = mode || defaultMode;
  if (!MAX_DAYS[xAxis]) throw badRequest('Mode must be "timeline" or "profile".');
  const days = Math.round(end.diff(start, 'days').days) + 1;
  if (days > MAX_DAYS[xAxis]) throw badRequest(`Choose at most ${MAX_DAYS[xAxis]} days for the ${xAxis} view.`);
  const skillList = (Array.isArray(skills) ? skills : String(skills ?? '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 200);
  return { start, end, days, interval: minutes, xAxis, skills: skillList };
}

const slotLabel = (slot, interval) => {
  const m = slot * interval;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Pure helper (unit-tested): turns grouped DB rows into a continuous axis, filling empty intervals.
export function buildAxis(rows, { start, days, interval, xAxis }, { emptyAs, profileMode, decimals }) {
  const slotsPerDay = 1440 / interval;
  const byKey = new Map(rows.map((r) => [xAxis === 'timeline' ? `${r.bucket_day} ${Number(r.slot)}` : String(Number(r.slot)), r.value]));
  const empty = emptyAs === 'zero' ? 0 : null;
  const factor = 10 ** decimals;
  const finish = (raw) => {
    if (raw === null || raw === undefined) return empty;
    let v = Number(raw);
    if (xAxis === 'profile' && profileMode === 'dailyAverage') v /= days;
    return Math.round(v * factor) / factor;
  };

  const labels = [];
  const values = [];
  if (xAxis === 'timeline') {
    for (let d = 0; d < days; d++) {
      const day = start.plus({ days: d }).toISODate();
      for (let s = 0; s < slotsPerDay; s++) {
        labels.push(`${day} ${slotLabel(s, interval)}`);
        values.push(finish(byKey.get(`${day} ${s}`)));
      }
    }
  } else {
    for (let s = 0; s < slotsPerDay; s++) {
      labels.push(slotLabel(s, interval));
      values.push(finish(byKey.get(String(s))));
    }
  }
  return { labels, values };
}

export async function runSeries(definitionInput, rawOptions) {
  const { definition, valueSql, valueParams, whereSql, whereParams } = compileDefinition(definitionInput);
  const options = parseSeriesOptions(rawOptions, definition.xAxis);

  const where = ['start_local >= ?', 'start_local < ?', ...whereSql];
  const params = [options.start.toFormat('yyyy-LL-dd 00:00:00'), options.end.plus({ days: 1 }).toFormat('yyyy-LL-dd 00:00:00'), ...whereParams];
  if (options.skills.length) {
    where.push('first_skill_name IN (?)');
    params.push(options.skills);
  }
  const whereClause = where.join(' AND ');
  const slotSql = 'FLOOR((HOUR(start_local) * 60 + MINUTE(start_local)) / ?)';
  const pool = requirePool();

  const groupSql =
    options.xAxis === 'timeline'
      ? `SELECT DATE_FORMAT(start_local, '%Y-%m-%d') AS bucket_day, ${slotSql} AS slot, ${valueSql} AS value
           FROM journeys WHERE ${whereClause} GROUP BY bucket_day, slot`
      : `SELECT ${slotSql} AS slot, ${valueSql} AS value FROM journeys WHERE ${whereClause} GROUP BY slot`;
  const [rows] = await pool.query(groupSql, [options.interval, ...valueParams, ...params]);

  const [[totals]] = await pool.query(
    `SELECT ${valueSql} AS value, COUNT(*) AS journeys FROM journeys WHERE ${whereClause}`,
    [...valueParams, ...params],
  );

  const { labels, values } = buildAxis(rows, options, definition);
  const factor = 10 ** definition.decimals;
  return {
    name: definition.name,
    chartType: definition.chartType,
    format: definition.format,
    xAxis: options.xAxis,
    interval: options.interval,
    from: options.start.toISODate(),
    to: options.end.toISODate(),
    labels,
    values,
    summary: {
      value: totals.value === null ? null : Math.round(Number(totals.value) * factor) / factor,
      journeys: Number(totals.journeys),
    },
  };
}
