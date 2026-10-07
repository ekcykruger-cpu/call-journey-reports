import { useEffect, useState } from 'react';

// Placeholder page for Phase 1: proves the React app can talk to the Express API.
export default function App() {
  const [health, setHealth] = useState('checking…');

  useEffect(() => {
    fetch('/healthz')
      .then((r) => r.json())
      .then((d) => setHealth(`${d.status} at ${d.time}`))
      .catch(() => setHealth('API not reachable'));
  }, []);

  return (
    <main className="container">
      <h1>Call Journey Reports</h1>
      <p>API health: {health}</p>
    </main>
  );
}
