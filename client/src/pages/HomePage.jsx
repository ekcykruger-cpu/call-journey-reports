import { useAuth } from '../auth.jsx';

// Placeholder until the dashboard is built (Phase 7).
export default function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <h1>Dashboard</h1>
      <p>Welcome, {user.displayName || user.email}. Charts will appear here once data import and metrics are built.</p>
    </>
  );
}
