import { useState } from 'react';
import { api } from '../api.js';
import { sydneyDate } from '../utils/format.js';

// Deletes call data (journeys, legs, import history). Users and metric definitions are kept.
export default function ClearDataCard({ onCleared }) {
  const [scope, setScope] = useState('range');
  const [from, setFrom] = useState(sydneyDate(-1));
  const [to, setTo] = useState(sydneyDate(-1));
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleClear(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const body = scope === 'all' ? { scope, confirm } : { scope, from, to, confirm };
      const { deleted } = await api('/imports/clear', { method: 'POST', body });
      setMessage(
        `Deleted ${deleted.journeys.toLocaleString()} journeys and ${deleted.legs.toLocaleString()} legs` +
          (scope === 'all' ? ` and ${deleted.imports.toLocaleString()} import history rows.` : '.'),
      );
      setConfirm('');
      onCleared();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card danger-zone" onSubmit={handleClear}>
      <h2>Clear call data</h2>
      <p className="muted small">
        Permanently deletes imported calls so you can start fresh or re-fetch. Users, logins and metric definitions are kept.
        This can't be undone - but data can always be fetched from CXone again.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="form-row">
        <label>
          What to delete
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="range">Journeys that started in a date range</option>
            <option value="all">ALL call data and import history</option>
          </select>
        </label>
        {scope === 'range' && (
          <>
            <label>
              From
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label>
              To
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </>
        )}
        <label>
          Type DELETE to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn-danger" type="submit" disabled={busy || confirm !== 'DELETE'}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </form>
  );
}
