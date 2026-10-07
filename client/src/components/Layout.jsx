import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Call Journey Reports</span>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            {user.role === 'admin' && <NavLink to="/users">Users</NavLink>}
          </nav>
          <div className="topbar-user">
            <span className="muted">{user.displayName || user.email}</span>
            <button className="btn-link" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
