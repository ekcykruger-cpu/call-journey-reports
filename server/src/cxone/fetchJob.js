import { DateTime } from 'luxon';
import { config } from '../config.js';
import {
  completeImportWithoutData,
  createImport,
  failImport,
  markImportRunning,
  processImport,
  setImportFileName,
} from '../import/importService.js';
import { downloadReport } from './reportClient.js';
import { CxoneAuthError, tokenProvider } from './tokenProvider.js';

// Fetches a date range from CXone one day at a time (startDate = day, endDate = next day), in the
// background. Each day is its own row in the import history. Re-fetching overlapping days is safe
// because imports update rows instead of duplicating them.

let running = false;

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

export function isFetchRunning() {
  return running;
}

// Validates the request, queues one import row per day, starts the work and returns straight away.
export async function startCxoneFetch({ from, to, requestedBy }) {
  const start = DateTime.fromISO(from ?? '', { zone: config.timezone });
  const end = DateTime.fromISO(to ?? '', { zone: config.timezone });
  if (!start.isValid || !end.isValid) throw badRequest('Choose a valid From and To date.');
  if (end < start) throw badRequest('The To date must be on or after the From date.');
  const days = Math.round(end.diff(start, 'days').days) + 1;
  if (days > config.cxone.maxDaysPerFetch) throw badRequest(`Fetch at most ${config.cxone.maxDaysPerFetch} days at a time.`);
  if (running) throw Object.assign(new Error('A CXone fetch is already running. Wait for it to finish.'), { status: 409, expose: true });
  await tokenProvider.getToken(); // fail fast if there's no usable token

  running = true;
  const jobs = [];
  try {
    for (let d = 0; d < days; d++) {
      const day = start.plus({ days: d });
      const startDate = day.toISODate();
      const endDate = day.plus({ days: 1 }).toISODate();
      const importId = await createImport({ source: 'cxone', rangeStart: startDate, rangeEnd: endDate, requestedBy, status: 'queued' });
      jobs.push({ importId, startDate, endDate });
    }
  } catch (err) {
    running = false;
    throw err;
  }

  runJobs(jobs).finally(() => {
    running = false;
  });
  return { queued: jobs.map((j) => j.importId) };
}

async function runJobs(jobs) {
  for (let i = 0; i < jobs.length; i++) {
    const { importId, startDate, endDate } = jobs[i];
    // CXone needs a unique file name per call: import number + UTC timestamp can't repeat.
    const fileName = `${config.cxone.fileNamePrefix}${importId}_${DateTime.utc().toFormat("yyyyLLdd'T'HHmmss")}.csv`;
    try {
      await markImportRunning(importId);
      await setImportFileName(importId, fileName);
      const result = await downloadReport({ fileName, startDate, endDate });
      if (result.noData) {
        await completeImportWithoutData(importId, fileName, 'CXone returned no data for this period (HTTP 204).');
        console.log(`[cxone] import ${importId} (${startDate}) done: no data`);
        continue;
      }
      await processImport(importId, result.csv);
      console.log(`[cxone] import ${importId} (${startDate}) done`);
    } catch (err) {
      console.error(`[cxone] import ${importId} (${startDate}) failed: ${err.message}`);
      // processImport records its own failures; record the rest here.
      if (!err.message.startsWith('Import failed:')) await failImport(importId, err.message).catch(() => {});
      // Without a working token every remaining day would fail the same way - stop now.
      if (err instanceof CxoneAuthError) {
        for (const rest of jobs.slice(i + 1)) {
          await failImport(rest.importId, 'Skipped: CXone token problem on an earlier day.').catch(() => {});
        }
        return;
      }
    }
  }
}
