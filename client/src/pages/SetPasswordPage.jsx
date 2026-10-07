import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

// Used for both invite links and password-reset links: /set-password?token=...
export default function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [info, setInfo] = useState(null);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/auth/token-info?token=${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setLinkError(err.message));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await api('/auth/set-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (done) {
    body = <div className="alert alert-success">Your password has been set. You can now log in.</div>;
  } else if (linkError) {
    body = <div className="alert alert-error">{linkError}</div>;
  } else if (!info) {
    body = <p className="muted">Checking link…</p>;
  } else {
    body = (
      <>
        <p className="muted">
          {info.purpose === 'invite' ? 'Welcome! Choose a password for ' : 'Choose a new password for '}
          <strong>{info.email}</strong>.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          New password (at least 12 characters)
          <input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </label>
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
      </>
    );
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Set password</h1>
        {body}
        <Link to="/login" className="small">Go to log in</Link>
      </form>
    </div>
  );
}
