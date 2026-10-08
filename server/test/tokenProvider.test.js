import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CxoneAuthError, missingAuthSettings, OAuthTokenProvider } from '../src/cxone/tokenProvider.js';

describe('missingAuthSettings', () => {
  it('none set = manual on purpose (no warning)', () => {
    expect(missingAuthSettings({ basic: '', username: '', password: '' })).toEqual([]);
  });
  it('some set = names of the missing ones', () => {
    expect(missingAuthSettings({ basic: 'x', username: 'y', password: '' })).toEqual(['CXONE_AUTH_PASSWORD']);
    expect(missingAuthSettings({ basic: '', username: 'y', password: '' })).toEqual(['CXONE_AUTH_BASIC', 'CXONE_AUTH_PASSWORD']);
  });
  it('all set = nothing missing', () => {
    expect(missingAuthSettings({ basic: 'x', username: 'y', password: 'z' })).toEqual([]);
  });
});

// Fake CXone token server: checks the request format and hands out numbered tokens.
const CREDS = { url: 'https://cxone.example.niceincontact.com/auth/token', basic: 'QkFTSUMtS0VZ', username: 'AK-ID-123', password: 'AK-SECRET-456' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('OAuthTokenProvider', () => {
  let clock;
  let requests;
  let logs;

  beforeEach(() => {
    clock = Date.parse('2026-10-09T00:00:00Z');
    requests = [];
    logs = [];
    for (const level of ['log', 'warn', 'error']) {
      vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.join(' ')));
    }
  });
  afterEach(() => vi.restoreAllMocks());

  function provider(responder = () => json(200, { access_token: `token-${requests.length}`, expires_in: 3600 }), creds = CREDS) {
    const fetchImpl = vi.fn(async (url, init) => {
      const isJson = init.headers['Content-Type'] === 'application/json';
      const body = isJson ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
      requests.push({ url, ...init, rawBody: init.body, body });
      return responder(requests.length);
    });
    return new OAuthTokenProvider(creds, { fetchImpl, now: () => clock });
  }

  it('sends the password grant form-encoded by default', async () => {
    const p = provider();
    expect(await p.getToken()).toBe('token-1');
    const [r] = requests;
    expect(r.url).toBe(CREDS.url);
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Basic QkFTSUMtS0VZ');
    expect(r.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(r.rawBody).toBe('grant_type=password&username=AK-ID-123&password=AK-SECRET-456');
  });

  it('form-encodes special characters in the secret correctly', async () => {
    const p = provider(undefined, { ...CREDS, password: 'a+b&c=d/e' });
    await p.getToken();
    expect(requests[0].body.password).toBe('a+b&c=d/e');
  });

  it('can send JSON instead (CXONE_AUTH_BODY_FORMAT=json)', async () => {
    const p = provider(undefined, { ...CREDS, bodyFormat: 'json' });
    await p.getToken();
    expect(requests[0].headers['Content-Type']).toBe('application/json');
    expect(requests[0].body).toEqual({ grant_type: 'password', username: 'AK-ID-123', password: 'AK-SECRET-456' });
  });

  it('reuses the token, then renews it when less than 5 minutes remain', async () => {
    const p = provider();
    await p.getToken();
    clock += 50 * 60 * 1000; // 10 minutes left
    expect(await p.getToken()).toBe('token-1');
    clock += 6 * 60 * 1000; // 4 minutes left
    expect(await p.getToken()).toBe('token-2');
    expect(requests).toHaveLength(2);
  });

  it('makes only one request when several callers need a token at once', async () => {
    const p = provider();
    const tokens = await Promise.all([p.getToken(), p.getToken(), p.getToken()]);
    expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
    expect(requests).toHaveLength(1);
  });

  it('uses the JWT expiry when expires_in is missing', async () => {
    const exp = Math.floor(clock / 1000) + 600;
    const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;
    const p = provider(() => json(200, { access_token: jwt }));
    await p.getToken();
    expect(p.status().expiresAt).toBe(new Date(exp * 1000).toISOString());
  });

  it('invalidate() forces a fresh token on the next call', async () => {
    const p = provider();
    await p.getToken();
    expect(p.invalidate()).toBe(true);
    expect(await p.getToken()).toBe('token-2');
  });

  it('reports refused credentials clearly, without leaking secrets', async () => {
    const p = provider(() => json(400, { error: 'invalid_grant', error_description: 'Invalid credentials' }));
    const err = await p.getToken().catch((e) => e);
    expect(err).toBeInstanceOf(CxoneAuthError);
    expect(err.message).toMatch(/HTTP 400 - invalid_grant: Invalid credentials/);
    expect(p.status().lastError).toMatch(/invalid_grant/);
    const everything = [err.message, p.status().lastError, JSON.stringify(p.status()), JSON.stringify(p), ...logs].join('\n');
    for (const secret of [CREDS.basic, CREDS.username, CREDS.password]) expect(everything).not.toContain(secret);
  });

  it('never logs the minted token', async () => {
    const p = provider(() => json(200, { access_token: 'SUPER-SECRET-TOKEN', expires_in: 3600 }));
    await p.getToken();
    expect(logs.join('\n')).not.toContain('SUPER-SECRET-TOKEN');
    expect(JSON.stringify(p.status())).not.toContain('SUPER-SECRET-TOKEN');
  });

  it('rejects a response without access_token', async () => {
    const p = provider(() => json(200, { token_type: 'bearer' }));
    await expect(p.getToken()).rejects.toThrow(/no access_token/);
  });
});
