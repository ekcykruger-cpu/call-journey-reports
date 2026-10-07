// Where the CXone bearer token comes from. Everything else asks `tokenProvider.getToken()`,
// so swapping in automatic token minting later means writing one new class here - nothing else changes.
//
// Future: an OAuthTokenProvider with the same methods, built from the official CXone authentication docs
// (grant type, token endpoint and token lifetime must be checked there - see docs/cxone-api.md).

export class CxoneAuthError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

// If the token is a JWT, read its expiry time (exp claim) without verifying it - display only.
function jwtExpiry(token) {
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
// it is lost when the server restarts or redeploys, by design for now.
class ManualTokenProvider {
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

  status() {
    const expiresAt = this.token ? jwtExpiry(this.token) : null;
    return {
      mode: 'manual',
      isSet: Boolean(this.token),
      setAt: this.setAt?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      expired: expiresAt ? expiresAt <= new Date() : null,
    };
  }

  async getToken() {
    if (!this.token) throw new CxoneAuthError('No CXone bearer token set. Paste one on the Settings page.');
    const { expired } = this.status();
    if (expired) throw new CxoneAuthError('The CXone bearer token has expired. Paste a new one on the Settings page.');
    return this.token;
  }
}

export const tokenProvider = new ManualTokenProvider(process.env.CXONE_BEARER_TOKEN);
