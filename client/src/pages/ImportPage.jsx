import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const MAX_MB = 50;

function formatDate(value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`).toLocaleString() : '—';
}

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(() => {
    api('/imports').then((d) => setHistory(d.imports)).catch((err) => setError(err.message));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  async function handleUpload(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) return setError(`File is larger than ${MAX_MB} MB.`);
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/upload?fileName=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'text/csv' },
        body: await file.text(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      loadHistory();
    }
  }

  return (
    <>
      <h1>Data</h1>

      <form className="card" onSubmit={handleUpload}>
        <h2>Upload a report 540 CSV</h2>
        <p className="muted small">
          Re-uploading the same data is safe: rows are matched on Contact_ID and updated, never duplicated.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {result && (
          <div className="alert alert-success">
            Imported {result.rowsUpserted} of {result.rowsRead} rows; {result.journeysRebuilt} journeys rebuilt.
            {result.skipped > 0 && ` ${result.skipped} rows skipped:`}
            {result.errors?.length > 0 && (
              <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        )}
        <div className="form-row">
          <label>
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          <button className="btn" type="submit" disabled={!file || busy}>{busy ? 'Importing…' : 'Import'}</button>
        </div>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>When</th><th>Source</th><th>File</th><th>Status</th><th>Rows</th><th>Journeys</th><th>By</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={9} className="muted">No imports yet.</td></tr>
            )}
            {history.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{formatDate(i.created_at)}</td>
                <td>{i.source === 'cxone' ? 'CXone' : 'Upload'}</td>
                <td>{i.file_name || '—'}</td>
                <td><span className={`status status-${i.status}`}>{i.status}</span></td>
                <td>{i.rows_upserted} / {i.rows_read}</td>
                <td>{i.journeys_rebuilt}</td>
                <td>{i.requested_by || '—'}</td>
                <td className="notes" title={i.error_text || ''}>{i.error_text ? i.error_text.split('\n')[0] : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
