import { useEffect, useState } from 'react';
import { api } from '../api.js';

function describeToken(t) {
  if (!t) return '…';
  if (!t.isSet) return 'Not set';
  if (t.expired) return 'Set, but EXPIRED';
  return 'Set';
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

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const d = await api('/cxone/token', { method: 'PUT', body: { token } });
      setStatus((s) => ({ ...s, token: d.token }));
      setToken('');
      setMessage('Token saved (in server memory).');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setError('');
    setMessage('');
    const d = await api('/cxone/token', { method: 'DELETE' }).catch((err) => setError(err.message));
    if (d) {
      setStatus((s) => ({ ...s, token: d.token }));
      setMessage('Token cleared.');
    }
  }

  const t = status?.token;
  return (
    <>
      <h1>Settings</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <form className="card" onSubmit={save}>
        <h2>CXone bearer token</h2>
        <dl className="facts">
          <dt>Status</dt>
          <dd className={t?.expired ? 'text-error' : ''}>{describeToken(t)}</dd>
          <dt>Pasted</dt>
          <dd>{t?.setAt ? new Date(t.setAt).toLocaleString() : '—'}</dd>
          <dt>Expires</dt>
          <dd>{t?.expiresAt ? new Date(t.expiresAt).toLocaleString() : t?.isSet ? 'Unknown (not a readable JWT)' : '—'}</dd>
          <dt>API</dt>
          <dd className="mono">{status?.apiBase}</dd>
          <dt>Report</dt>
          <dd>{status?.reportId}</dd>
        </dl>
        <p className="muted small">
          The token is kept only in the server's memory: it is never shown again, never stored in the database,
          and is lost when the server restarts or redeploys. Paste a fresh one when that happens or when it expires.
        </p>
        <label>
          New token
          <textarea rows={4} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the bearer token (with or without the word Bearer)" autoComplete="off" spellCheck={false} />
        </label>
        <div className="button-row">
          <button className="btn" type="submit" disabled={busy || token.trim().length < 10}>Save token</button>
          {t?.isSet && <button className="btn-link" type="button" onClick={clear}>Clear token</button>}
        </div>
      </form>
    </>
  );
}
