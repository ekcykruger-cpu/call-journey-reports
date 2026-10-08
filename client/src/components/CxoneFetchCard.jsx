import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { sydneyDate } from '../utils/format.js';

export default function CxoneFetchCard({ onQueued, busyElsewhere }) {
  const [status, setStatus] = useState(null);
  const [from, setFrom] = useState(sydneyDate(-1));
  const [to, setTo] = useState(sydneyDate(-1));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/cxone/status').then(setStatus).catch((err) => setError(err.message));
  }, [busyElsewhere]);

  async function handleFetch(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const d = await api('/cxone/fetch', { method: 'POST', body: { from, to } });
      setMessage(`Queued ${d.queued.length} day(s). Progress shows in the history below.`);
      onQueued();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const token = status?.token;
  const tokenProblem = token && (!token.isSet ? 'No CXone token set.' : token.expired ? 'The CXone token has expired.' : '');

  return (
    <form className="card" onSubmit={handleFetch}>
      <h2>Fetch from CXone</h2>
      <p className="muted small">
        Runs report {status?.reportId ?? '…'} for each day in the range (Sydney dates, both ends included).
        Fetching the same days again is safe.
      </p>
      {tokenProblem && (
        <div className="alert alert-error">
          {tokenProblem} <Link to="/settings">Paste a token in Settings</Link>.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="form-row">
        <label>
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          To
          <input type="date" value={to} min={from} max={sydneyDate()} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={busy || busyElsewhere || Boolean(tokenProblem)}>
          {busyElsewhere ? 'Fetch running…' : busy ? 'Starting…' : 'Fetch data'}
        </button>
      </div>
    </form>
  );
}
