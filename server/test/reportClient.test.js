import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeShape, downloadReport, findBase64 } from '../src/cxone/reportClient.js';
import { CxoneAuthError, tokenProvider } from '../src/cxone/tokenProvider.js';

// These tests use a fake CXone (a stubbed fetch); they check our handling, not CXone's real behaviour.

const CSV = 'Contact_ID,Master_Contact_ID\n1,1\n';
const B64 = Buffer.from(CSV).toString('base64');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('response helpers', () => {
  it('findBase64 prefers a field called "file"', () => {
    expect(findBase64({ files: { fileName: 'Reports\\x.csv', file: B64 } })).toBe(B64);
  });
  it('findBase64 falls back to the longest base64-looking string', () => {
    expect(findBase64({ result: { data: B64, id: 'abc' } })).toBe(B64);
  });
  it('describeShape shows field names and types only, never values', () => {
    const shape = JSON.stringify(describeShape({ files: { file: B64, size: 3 } }));
    expect(shape).toContain('"file":"string(');
    expect(shape).not.toContain(B64);
  });
});

describe('downloadReport against a fake CXone', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    tokenProvider.set('test-token-1234567890');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    tokenProvider.clear();
  });

  function fakeCxone(responder) {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url: String(url), method: init.method, auth: init.headers.Authorization });
      return responder(String(url), calls.length);
    }));
  }

  it('runs the report, then fetches and decodes the file', async () => {
    fakeCxone((url) => (url.includes('report-jobs') ? json(202, { jobId: 1 }) : json(200, { files: { file: B64 } })));
    const csv = await downloadReport({ fileName: 'CJR_540_7.csv', startDate: '2026-10-04', endDate: '2026-10-05' });

    expect(csv).toBe(CSV);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('report-jobs/datadownload/540?fileName=CJR_540_7.csv&startDate=2026-10-04&endDate=2026-10-05&saveAsFile=true&includeHeaders=true');
    expect(calls[1].url).toContain('files?fileName=Reports%5C%5CCJR_540_7.csv'); // same encoding as the owner's working URL
    expect(calls[1].auth).toBe('Bearer test-token-1234567890');
  });

  it('retries while the file is not ready yet (404)', async () => {
    vi.useFakeTimers();
    fakeCxone((url, n) => (url.includes('report-jobs') ? json(202, {}) : n < 4 ? json(404, { error: 'not found' }) : json(200, { file: B64 })));
    const pending = downloadReport({ fileName: 'a.csv', startDate: '2026-10-04', endDate: '2026-10-05' });
    await vi.runAllTimersAsync();
    expect(await pending).toBe(CSV);
    expect(calls).toHaveLength(4); // 1 run + 2 not-ready + 1 success
  });

  it('turns 401 into a clear token error', async () => {
    fakeCxone(() => json(401, { error: 'invalid_token' }));
    await expect(downloadReport({ fileName: 'a.csv', startDate: '2026-10-04', endDate: '2026-10-05' })).rejects.toBeInstanceOf(CxoneAuthError);
  });

  it('explains a 405 (wrong HTTP method)', async () => {
    fakeCxone(() => json(405, {}));
    await expect(downloadReport({ fileName: 'a.csv', startDate: '2026-10-04', endDate: '2026-10-05' })).rejects.toThrow(/CXONE_REPORT_JOB_METHOD to GET/);
  });

  it('refuses to call CXone without a token', async () => {
    tokenProvider.clear();
    fakeCxone(() => json(200, {}));
    await expect(downloadReport({ fileName: 'a.csv', startDate: '2026-10-04', endDate: '2026-10-05' })).rejects.toThrow(/No CXone bearer token/);
    expect(calls).toHaveLength(0);
  });
});

describe('tokenProvider', () => {
  afterEach(() => tokenProvider.clear());

  it('strips a leading "Bearer " and reads JWT expiry', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
    tokenProvider.set(`Bearer aaa.${payload}.bbb`);
    expect(tokenProvider.token).toBe(`aaa.${payload}.bbb`);
    expect(tokenProvider.status()).toMatchObject({ isSet: true, expired: true });
  });
});
