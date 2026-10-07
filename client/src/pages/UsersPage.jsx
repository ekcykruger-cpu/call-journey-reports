import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

function formatDate(value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`).toLocaleString() : '—';
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { text, link? }
  const [form, setForm] = useState({ email: '', displayName: '', role: 'viewer' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/users').then((d) => setUsers(d.users)).catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  function showLinkResult(result, who) {
    setNotice(
      result.emailSent
        ? { text: `Email sent to ${who}.` }
        : { text: `Email sending isn't set up yet. Send this link to ${who} yourself:`, link: result.link },
    );
  }

  async function handleInvite(e) {
    e.preventDefault();
    setError('');
    setNotice(null);
    setBusy(true);
    try {
      const result = await api('/users/invite', { method: 'POST', body: form });
      showLinkResult(result, form.email);
      setForm({ email: '', displayName: '', role: 'viewer' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(u, changes) {
    setError('');
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: changes });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendLink(u) {
    setError('');
    setNotice(null);
    try {
      showLinkResult(await api(`/users/${u.id}/send-link`, { method: 'POST' }), u.email);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h1>Users</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert alert-success">
          {notice.text}
          {notice.link && <input className="link-box" readOnly value={notice.link} onFocus={(e) => e.target.select()} />}
        </div>
      )}

      <form className="card inline-form" onSubmit={handleInvite}>
        <h2>Invite a user</h2>
        <div className="form-row">
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Name (optional)
            <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</button>
        </div>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr key={u.id} className={u.isActive ? '' : 'inactive'}>
                  <td>{u.email}</td>
                  <td>{u.displayName || '—'}</td>
                  <td>
                    <select value={u.role} disabled={isMe} onChange={(e) => update(u, { role: e.target.value })}>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{!u.isActive ? 'Deactivated' : u.hasPassword ? 'Active' : 'Invited'}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td className="actions">
                    {u.isActive && (
                      <button className="btn-link" onClick={() => sendLink(u)}>
                        {u.hasPassword ? 'Send reset link' : 'Resend invite'}
                      </button>
                    )}
                    {!isMe && (
                      <button className="btn-link" onClick={() => update(u, { isActive: !u.isActive })}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
