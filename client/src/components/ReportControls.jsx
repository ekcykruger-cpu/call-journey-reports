import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { sydneyDate } from '../utils/format.js';

export const DEFAULT_CONTROLS = { from: sydneyDate(-1), to: sydneyDate(-1), interval: 30, skills: [] };

// Date range, interval and entry-skill filter - one row above the charts.
export default function ReportControls({ value, onChange, children }) {
  const [skills, setSkills] = useState([]);

  useEffect(() => {
    api('/metrics/skills').then((d) => setSkills(d.skills)).catch(() => setSkills([]));
  }, []);

  const set = (patch) => onChange({ ...value, ...patch });
  const toggleSkill = (name) =>
    set({ skills: value.skills.includes(name) ? value.skills.filter((s) => s !== name) : [...value.skills, name] });

  return (
    <div className="card controls">
      <label>
        From
        <input type="date" value={value.from} max={value.to} onChange={(e) => set({ from: e.target.value })} />
      </label>
      <label>
        To
        <input type="date" value={value.to} min={value.from} onChange={(e) => set({ to: e.target.value })} />
      </label>
      <label>
        Interval
        <select value={value.interval} onChange={(e) => set({ interval: Number(e.target.value) })}>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
        </select>
      </label>
      <div className="control">
        <span className="control-label">Skills (entry)</span>
        <details className="dropdown">
          <summary>{value.skills.length ? `${value.skills.length} selected` : 'All skills'}</summary>
          <div className="dropdown-panel">
            {skills.length === 0 && <p className="muted small">No skills in the data yet.</p>}
            {value.skills.length > 0 && (
              <button type="button" className="btn-link small" onClick={() => set({ skills: [] })}>Clear selection</button>
            )}
            {skills.map((s) => (
              <label key={s.name} className="check">
                <input type="checkbox" checked={value.skills.includes(s.name)} onChange={() => toggleSkill(s.name)} />
                <span>{s.name}</span>
                <span className="muted small">{s.journeys.toLocaleString()}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      {children}
    </div>
  );
}
