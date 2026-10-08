import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { parseCsvLenient } from './lenientCsv.js';

// Turns CXone report 540 CSV text into leg objects whose keys match the contact_legs table.
// See docs/data-dictionary.md for the columns.

// CSV header (normalised: lower case, letters/digits only) → our column name and type.
const COLUMNS = {
  contactid: ['contact_id', 'id'],
  mastercontactid: ['master_contact_id', 'id'],
  contactcode: ['contact_code', 'bigint'],
  medianame: ['media_name', 'text'],
  contactname: ['contact_name', 'text'],
  anidialnum: ['ani_dialnum', 'text'],
  skillno: ['skill_no', 'bigint'],
  skillname: ['skill_name', 'text'],
  campaignno: ['campaign_no', 'bigint'],
  campaignname: ['campaign_name', 'text'],
  agentno: ['agent_no', 'bigint'],
  agentname: ['agent_name', 'text'],
  teamno: ['team_no', 'bigint'],
  teamname: ['team_name', 'text'],
  sla: ['sla', 'tinyint'],
  prequeue: ['pre_queue', 'seconds'],
  inqueue: ['in_queue', 'seconds'],
  agenttime: ['agent_time', 'seconds'],
  postqueue: ['post_queue', 'seconds'],
  acwtime: ['acw_time', 'seconds'],
  totaltimeplusdisposition: ['total_time', 'seconds'],
  abandontime: ['abandon_time', 'seconds'],
  routingtime: ['routing_time', 'seconds'],
  abandon: ['abandon', 'yn'],
  callbacktime: ['callback_time', 'seconds'],
  logged: ['logged', 'yn'],
  holdtime: ['hold_time', 'seconds'],
  dispcode: ['disp_code', 'bigint'],
  dispname: ['disp_name', 'text'],
  dispcomments: ['disp_comments', 'text'],
  tags: ['tags', 'text'],
};
const REQUIRED = ['contactid', 'mastercontactid', 'startdate', 'starttime'];
const MAX_ERRORS = 20;

const normalise = (header) => String(header).toLowerCase().replace(/[^a-z0-9]/g, '');

function convert(value, type) {
  const v = value == null ? '' : String(value).trim();
  switch (type) {
    case 'id':
      if (!/^\d+$/.test(v)) throw new Error(`"${v}" is not a valid contact id`);
      return v; // kept as a string: ids can exceed JavaScript's safe integer range
    case 'bigint':
    case 'tinyint':
      return /^-?\d+$/.test(v) ? v : null;
    case 'seconds':
      if (v === '') return 0;
      if (!/^-?\d+(\.\d+)?$/.test(v)) throw new Error(`"${v}" is not a number of seconds`);
      return Math.round(Number(v));
    case 'yn':
      return v.toUpperCase().startsWith('Y') ? 'Y' : v === '' ? null : 'N';
    default:
      return v === '' ? null : v;
  }
}

// Accepts MM/DD/YYYY or YYYY-MM-DD.
function parseDate(value) {
  const v = String(value ?? '').trim();
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { year: +m[3], month: +m[1], day: +m[2] };
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  throw new Error(`"${v}" is not a date (expected MM/DD/YYYY)`);
}

// Accepts "11:32:54", "11:32", "11:32:54 AM" or an Excel day-fraction like 0.48118.
function parseTime(value) {
  const v = String(value ?? '').trim();
  let m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?$/);
  if (m) {
    let hour = +m[1];
    const ampm = m[4]?.toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return { hour, minute: +m[2], second: +(m[3] ?? 0) };
  }
  if (/^0?\.\d+$|^0$/.test(v)) {
    const total = Math.round(Number(v) * 86400);
    return { hour: Math.floor(total / 3600) % 24, minute: Math.floor(total / 60) % 60, second: total % 60 };
  }
  throw new Error(`"${v}" is not a time (expected HH:MM:SS)`);
}

const SQL_FORMAT = 'yyyy-LL-dd HH:mm:ss';

export function toTimestamps(dateValue, timeValue, zone = config.timezone) {
  const local = DateTime.fromObject({ ...parseDate(dateValue), ...parseTime(timeValue) }, { zone });
  if (!local.isValid) throw new Error(`invalid date/time: ${local.invalidExplanation}`);
  return { start_local: local.toFormat(SQL_FORMAT), start_utc: local.toUTC().toFormat(SQL_FORMAT) };
}

// Standard CSV first; if CXone's file has unescaped quotes, fall back to the tolerant reader.
function readCsv(text) {
  try {
    return { records: parse(text, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }), note: null };
  } catch (err) {
    if (!/quote/i.test(err.message)) throw err;
    const where = err.lines ? ` (first one on line ${err.lines})` : '';
    return {
      records: parseCsvLenient(text),
      note: `The file had quotation marks that weren't escaped${where}, so it was read in tolerant mode. Any row that still couldn't be read is listed below.`,
    };
  }
}

// Returns { legs, rowsRead, skipped, errors[] }. Throws only if the file as a whole is unusable.
export function parseReportCsv(text) {
  const { records, note } = readCsv(text);
  if (records.length === 0) throw new Error('The file is empty.');

  const header = records[0].map(normalise);
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}. Is this a report 540 CSV with headers?`);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const legs = new Map(); // by contact_id: a later duplicate row replaces an earlier one
  const errors = [];
  let skipped = 0;
  let rowsRead = 0;

  for (let r = 1; r < records.length; r++) {
    const row = records[r];
    if (row.every((cell) => cell === '')) continue; // blank separator rows
    rowsRead++;
    try {
      const leg = {};
      for (const [csvName, [column, type]] of Object.entries(COLUMNS)) {
        leg[column] = idx[csvName] === undefined ? convert('', type) : convert(row[idx[csvName]], type);
      }
      Object.assign(leg, toTimestamps(row[idx.startdate], row[idx.starttime]));
      legs.set(leg.contact_id, leg);
    } catch (err) {
      skipped++;
      if (errors.length < MAX_ERRORS) errors.push(`Row ${r + 1}: ${err.message}`);
    }
  }
  if (note) errors.unshift(note);
  return { legs: [...legs.values()], rowsRead, skipped, errors };
}
