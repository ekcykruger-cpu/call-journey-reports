import { config } from '../config.js';
import { CxoneAuthError, tokenProvider } from './tokenProvider.js';

// Calls the two CXone endpoints the owner provided (docs/cxone-api.md):
//   1. report-jobs/datadownload/{reportId}  - runs the report and saves it as a file in CXone
//   2. files?fileName=Reports\\<name>       - returns that file, base64-encoded
// Unverified details (HTTP method, response shape) are settings or detected at runtime, and the
// response *structure* (never the data) is logged so it can be checked against the docs.

const REQUEST_TIMEOUT_MS = 120_000;
const FILE_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class CxoneError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.httpStatus = status;
    this.retryable = retryable;
  }
}

// Field names and types only, e.g. { files: { fileName: 'string', file: 'string(51234 chars)' } }.
export function describeShape(value, depth = 0) {
  if (depth > 4) return '…';
  if (Array.isArray(value)) return value.length ? [describeShape(value[0], depth + 1), `(${value.length} items)`] : [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describeShape(v, depth + 1)]));
  }
  if (typeof value === 'string') return `string(${value.length} chars)`;
  return typeof value;
}

// Finds the base64 file content in a JSON response: prefers a field called "file", otherwise the
// longest string that looks like base64.
export function findBase64(value) {
  let best = null;
  const visit = (v, key) => {
    if (typeof v === 'string') {
      const looksBase64 = v.length >= 8 && /^[A-Za-z0-9+/=\r\n]+$/.test(v);
      if (!looksBase64) return;
      const score = (key?.toLowerCase() === 'file' ? 1e12 : 0) + v.length;
      if (!best || score > best.score) best = { value: v, score };
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) visit(child, k);
    }
  };
  visit(value);
  return best?.value ?? null;
}

async function cxoneRequest(method, pathAndQuery, label) {
  const token = await tokenProvider.getToken();
  let res;
  try {
    res = await fetch(`${config.cxone.apiBase}/${pathAndQuery}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CxoneError(`${label}: could not reach CXone (${err.name === 'TimeoutError' ? 'timed out' : err.message})`, { retryable: true });
  }

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (e.g. the CSV itself) - handled by the caller
  }
  console.log(`[cxone] ${label}: HTTP ${res.status}; response shape: ${JSON.stringify(body ? describeShape(body) : `text(${text.length} chars)`)}`);

  if (res.status === 401 || res.status === 403) {
    throw new CxoneAuthError(`${label}: CXone rejected the bearer token (HTTP ${res.status}). Paste a new token on the Settings page.`);
  }
  if (res.status === 405) {
    throw new CxoneError(`${label}: CXone says the HTTP method is not allowed (405). Try setting CXONE_REPORT_JOB_METHOD to ${method === 'POST' ? 'GET' : 'POST'}.`, { status: 405 });
  }
  if (!res.ok) {
    const detail = text.slice(0, 300).replace(/\s+/g, ' ');
    throw new CxoneError(`${label}: CXone returned HTTP ${res.status}. ${detail}`, { status: res.status, retryable: res.status === 404 || res.status >= 500 });
  }
  return { body, text };
}

export async function runReportJob({ fileName, startDate, endDate }) {
  const query = new URLSearchParams({ fileName, startDate, endDate, saveAsFile: 'true', includeHeaders: 'true' });
  await cxoneRequest(config.cxone.reportJobMethod, `report-jobs/datadownload/${encodeURIComponent(config.cxone.reportId)}?${query}`, 'Run report');
}

// Fetches the saved file, retrying for a while in case CXone hasn't finished writing it yet.
export async function fetchReportFile(fileName) {
  const path = `files?fileName=${encodeURIComponent(config.cxone.fileFolder + fileName)}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const { body, text } = await cxoneRequest('GET', path, 'Fetch file');
      if (!body) return text; // the API returned the file itself rather than JSON
      const base64 = findBase64(body);
      if (!base64) throw new CxoneError('Fetch file: no base64 file content found in the CXone response (see server log for its shape).');
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch (err) {
      if (!(err instanceof CxoneError) || !err.retryable || attempt >= FILE_RETRY_DELAYS_MS.length) throw err;
      await sleep(FILE_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export async function downloadReport({ fileName, startDate, endDate }) {
  await runReportJob({ fileName, startDate, endDate });
  return fetchReportFile(fileName);
}
