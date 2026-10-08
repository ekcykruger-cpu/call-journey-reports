import { config } from '../config.js';

// Where the CXone bearer token comes from. Everything else asks `tokenProvider.getToken()`.
//   - OAuthTokenProvider ("automatic"): mints tokens itself when CXONE_AUTH_BASIC/USERNAME/PASSWORD are set.
//   - ManualTokenProvider ("manual"): a token pasted on the Settings page (fallback).
// Credentials and tokens are never logged, stored in the database or sent to the browser.

export class CxoneAuthError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

// If the token is a JWT, read its expiry time (exp claim) without verifying it.
export function jwtExpiry(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

// Token pasted on the Settings page (or CXONE_BEARER_TOKEN at startup). Held in memory only:
// it is lost when the server restarts or redeploys.
export class ManualTokenProvider {
  mode = 'manual';

  constructor(initialToken) {
    this.token = null;
    this.setAt = null;
    if (initialToken) this.set(initialToken);
  }

  set(token) {
    this.token = token.trim().replace(/^Bearer\s+/i, '');
    this.setAt = new Date();
  }

  clear() {
    this.token = null;
    this.setAt = null;
  }

  invalidate() {
    // A pasted token can't be renewed - the caller reports the 401 so the user can paste a new one.
    return false;
  }

  status() {
    const expiresAt = this.token ? jwtExpiry(this.token) : null;
    return {
      mode: this.mode,
      isSet: Boolean(this.token),
      setAt: this.setAt?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      expired: expiresAt ? expiresAt <= new Date() : null,
      lastError: null,
      configWarning: this.configWarning ?? null,
    };
  }

  async getToken() {
    if (!this.token) throw new CxoneAuthError('No CXone bearer token set. Paste one on the Settings page.');
    if (this.status().expired) throw new CxoneAuthError('The CXone bearer token has expired. Paste a new one on the Settings page.');
    return this.token;
  }
}

const RENEW_BEFORE_MS = 5 * 60 * 1000; // get a new token when less than 5 minutes remain
const UNKNOWN_LIFETIME_MS = 30 * 60 * 1000; // if CXone gives no expiry, renew every 30 minutes to be safe
const MINT_TIMEOUT_MS = 30_000;

// Mints tokens with the OAuth password grant:
//   POST {url}  Authorization: Basic <key>  body: grant_type=password, username, password
// Body format: form-encoded by default (a JSON body was rejected by CXone with "Missing required body
// parameters", 2026-10-09); CXONE_AUTH_BODY_FORMAT=json switches back.
export class OAuthTokenProvider {
  mode = 'automatic';

  constructor({ url, basic, username, password, bodyFormat = 'form' }, { fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
    this.url = url;
    this.contentType = bodyFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
    // Kept off `this` as plain fields so they can't end up in a JSON dump of the provider.
    const secrets = { basic, username, password };
    this.requestBody = () => {
      const fields = { grant_type: 'password', username: secrets.username, password: secrets.password };
      return bodyFormat === 'json' ? JSON.stringify(fields) : new URLSearchParams(fields).toString();
    };
    this.authHeader = () => `Basic ${secrets.basic}`;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.token = null;
    this.mintedAt = null;
    this.expiresAt = null;
    this.lastError = null;
    this.inflight = null;
  }

  status() {
    return {
      mode: this.mode,
      isSet: Boolean(this.token),
      setAt: this.mintedAt ? new Date(this.mintedAt).toISOString() : null,
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
      expired: this.expiresAt ? this.expiresAt <= this.now() : null,
      lastError: this.lastError,
    };
  }

  async getToken() {
    if (this.token && this.expiresAt - this.now() > RENEW_BEFORE_MS) return this.token;
    return this.refresh();
  }

  // Forces a new token. Parallel callers share one request.
  refresh() {
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  // Called after CXone rejects the current token (401): drop it so the next call mints a fresh one.
  invalidate() {
    this.token = null;
    this.expiresAt = null;
    return true;
  }

  async mint() {
    let res;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: this.authHeader(), 'Content-Type': this.contentType, Accept: 'application/json' },
        body: this.requestBody(),
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
    } catch (err) {
      throw this.fail(`could not reach the CXone token service (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Only CXone's error code/description are shown - never the request.
      const detail = [body?.error, body?.error_description].filter((v) => typeof v === 'string').join(': ').slice(0, 200);
      throw this.fail(`CXone refused the token request (HTTP ${res.status}${detail ? ` - ${detail}` : ''}). Check the CXONE_AUTH_* settings.`);
    }
    if (typeof body?.access_token !== 'string' || !body.access_token) {
      throw this.fail('the CXone token response had no access_token.');
    }

    const now = this.now();
    let expiresAt = null;
    if (typeof body.expires_in === 'number' && body.expires_in > 0) expiresAt = now + body.expires_in * 1000;
    expiresAt ??= jwtExpiry(body.access_token)?.getTime() ?? null;
    expiresAt ??= now + UNKNOWN_LIFETIME_MS + RENEW_BEFORE_MS;

    this.token = body.access_token;
    this.mintedAt = now;
    this.expiresAt = expiresAt;
    this.lastError = null;
    console.log(`[cxone] minted a new bearer token, valid until ${new Date(expiresAt).toISOString()}`);
    return this.token;
  }

  fail(reason) {
    this.lastError = `${new Date(this.now()).toISOString()}: ${reason}`;
    console.error(`[cxone] token request failed: ${reason}`);
    return new CxoneAuthError(`Could not get a CXone token: ${reason}`);
  }
}

// Automatic mode needs all three settings. If only some are set (e.g. a typo in a variable name),
// say which are missing - names only, never values - instead of silently staying in manual mode.
export function missingAuthSettings(auth) {
  const settings = { CXONE_AUTH_BASIC: auth.basic, CXONE_AUTH_USERNAME: auth.username, CXONE_AUTH_PASSWORD: auth.password };
  const missing = Object.keys(settings).filter((name) => !settings[name]);
  return missing.length === Object.keys(settings).length ? [] : missing; // none set = manual mode on purpose
}

function createTokenProvider(auth) {
  const missing = missingAuthSettings(auth);
  if (auth.basic && auth.username && auth.password) return new OAuthTokenProvider(auth);

  const manual = new ManualTokenProvider(process.env.CXONE_BEARER_TOKEN);
  if (missing.length) {
    manual.configWarning = `Automatic token minting is OFF: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`;
    console.warn(`[cxone] ${manual.configWarning}`);
  }
  return manual;
}

export const tokenProvider = createTokenProvider(config.cxone.auth);
