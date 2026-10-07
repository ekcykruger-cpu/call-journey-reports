import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeShape, downloadReport, findBase64, isTrustedCxoneUrl } from '../src/cxone/reportClient.js';
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

  // Response shapes below are the ones CXone returned on the owner's tenant (see docs/cxone-api.md).
  const FILE_URI = 'https://api-b32.nice-incontact.com/inContactAPI/services/V35.0/files?fileName=Reports%5CCJR_540_7.csv';
  const runOk = (uri = FILE_URI) => json(200, { errorMessage: '', fileName: 'Reports\\CJR_540_7.csv', file: '', URI: uri });
  const fileOk = () => json(200, { files: { file: B64, fileName: 'CJR_540_7.csv' } });
  const args = { fileName: 'CJR_540_7.csv', startDate: '2026-10-04', endDate: '2026-10-05' };

  it('runs the report (POST), then fetches the file from the URI CXone returned and decodes it', async () => {
    fakeCxone((url) => (url.includes('report-jobs') ? runOk() : fileOk()));
    const result = await downloadReport(args);

    expect(result).toEqual({ noData: false, csv: CSV });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('report-jobs/datadownload/540?fileName=CJR_540_7.csv&startDate=2026-10-04&endDate=2026-10-05&saveAsFile=true&includeHeaders=true');
    expect(calls[1].url).toBe(FILE_URI);
    expect(calls[1].auth).toBe('Bearer test-token-1234567890');
  });

  it('does not send the token to a non-CXone URI; falls back to the configured API base', async () => {
    fakeCxone((url) => (url.includes('report-jobs') ? runOk('https://evil.example.com/files?x=1') : fileOk()));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await downloadReport(args);
    expect(calls[1].url).toContain('api-na1.niceincontact.com');
    expect(calls[1].url).toContain('files?fileName=Reports%5C%5CCJR_540_7.csv'); // the owner's original working format
  });

  it('treats 204 No Content as "no data" and skips the file fetch', async () => {
    fakeCxone(() => new Response(null, { status: 204 }));
    expect(await downloadReport(args)).toEqual({ noData: true });
    expect(calls).toHaveLength(1);
  });

  it('stops with CXone\'s errorMessage when it is filled in', async () => {
    fakeCxone(() => json(200, { errorMessage: 'Report not found', fileName: '', file: '', URI: '' }));
    await expect(downloadReport(args)).rejects.toThrow(/Report not found/);
    expect(calls).toHaveLength(1);
  });

  it('retries while the file is not ready yet (404)', async () => {
    vi.useFakeTimers();
    fakeCxone((url, n) => (url.includes('report-jobs') ? runOk() : n < 4 ? json(404, { error: 'not found' }) : fileOk()));
    const pending = downloadReport(args);
    await vi.runAllTimersAsync();
    expect((await pending).csv).toBe(CSV);
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

describe('isTrustedCxoneUrl', () => {
  it('accepts https CXone hosts only', () => {
    expect(isTrustedCxoneUrl('https://api-b32.nice-incontact.com/x')).toBe(true);
    expect(isTrustedCxoneUrl('https://api-na1.niceincontact.com/x')).toBe(true);
    expect(isTrustedCxoneUrl('http://api-b32.nice-incontact.com/x')).toBe(false);
    expect(isTrustedCxoneUrl('https://nice-incontact.com.evil.com/x')).toBe(false);
    expect(isTrustedCxoneUrl('https://evilnice-incontact.com/x')).toBe(false);
    expect(isTrustedCxoneUrl('not a url')).toBe(false);
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
