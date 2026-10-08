import { useEffect, useState } from 'react';
import { api } from '../api.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

function describeToken(t) {
  if (!t) return '…';
  if (!t.isSet) return t.mode === 'automatic' ? 'None yet - one is minted when needed' : 'Not set';
  if (t.expired) return 'EXPIRED';
  return 'Valid';
}

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/cxone/status').then(setStatus).catch((err) => setError(err.message));
  }, []);

  async function call(path, method, body, successText) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const d = await api(path, { method, body });
      setStatus((s) => ({ ...s, token: d.token }));
      setMessage(successText);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (await call('/cxone/token', 'PUT', { token }, 'Token saved (in server memory).')) setToken('');
  }

  const t = status?.token;
  const automatic = t?.mode === 'automatic';

  return (
    <>
      <h1>Settings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form className="card" onSubmit={save}>
        <h2>CXone access</h2>
        <dl className="facts">
          <dt>Mode</dt>
          <dd>{t ? (automatic ? 'Automatic - tokens are minted with the CXONE_AUTH_* settings' : 'Manual - paste a bearer token') : '…'}</dd>
          <dt>Token</dt>
          <dd className={t?.expired ? 'text-error' : ''}>{describeToken(t)}</dd>
          <dt>{automatic ? 'Minted' : 'Pasted'}</dt>
          <dd>{when(t?.setAt)}</dd>
          <dt>Expires</dt>
          <dd>{t?.expiresAt ? when(t.expiresAt) : t?.isSet ? 'Unknown (not a readable JWT)' : '—'}</dd>
          {t?.lastError && (
            <>
              <dt>Last error</dt>
              <dd className="text-error">{t.lastError}</dd>
            </>
          )}
          <dt>API</dt>
          <dd className="mono">{status?.apiBase}</dd>
          <dt>Report</dt>
          <dd>{status?.reportId}</dd>
        </dl>

        {automatic ? (
          <>
            <p className="muted small">
              The server gets a new token by itself before the old one expires. Credentials live only in the server's
              settings (Railway Variables / .env) and are never shown here.
            </p>
            <div className="button-row">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => call('/cxone/token/refresh', 'POST', undefined, 'New token minted - the CXone credentials work.')}>
                {busy ? 'Requesting…' : 'Get new token now'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              The token is kept only in the server's memory: it is never shown again, never stored in the database,
              and is lost when the server restarts or redeploys. To have tokens minted automatically instead, set the
              CXONE_AUTH_* variables (see docs/cxone-api.md).
            </p>
            <label>
              New token
              <textarea rows={4} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the bearer token (with or without the word Bearer)" autoComplete="off" spellCheck={false} />
            </label>
            <div className="button-row">
              <button className="btn" type="submit" disabled={busy || token.trim().length < 10}>Save token</button>
              {t?.isSet && (
                <button className="btn-link" type="button" onClick={() => call('/cxone/token', 'DELETE', undefined, 'Token cleared.')}>Clear token</button>
              )}
            </div>
          </>
        )}
      </form>
    </>
  );
}
