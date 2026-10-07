import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setMessage(d.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Reset password</h1>
        {message ? (
          <div className="alert alert-success">{message}</div>
        ) : (
          <>
            <p className="muted">Enter your email and we'll send you a link to choose a new password.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <label>
              Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <Link to="/login" className="small">Back to log in</Link>
      </form>
    </div>
  );
}
