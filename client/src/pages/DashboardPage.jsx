import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import MetricChart from '../components/MetricChart.jsx';
import ReportControls, { DEFAULT_CONTROLS } from '../components/ReportControls.jsx';
import { formatValue } from '../utils/format.js';
import { loadPref, savePref } from '../utils/storage.js';

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className={v === value ? 'active' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ metric, controls, view, onViewChange }) {
  const [summary, setSummary] = useState(null);
  const chartType = view.chartType ?? metric.chartType;
  const mode = view.mode ?? metric.xAxis ?? 'timeline';

  return (
    <section className="card chart-card">
      <header className="chart-head">
        <div>
          <h2>{metric.name}</h2>
          {metric.description && <p className="muted small">{metric.description}</p>}
        </div>
        <div className="chart-summary" title="Value over the whole selected period">
          <span className="summary-value">{summary ? formatValue(summary.value, metric.format, metric.decimals) : '…'}</span>
          <span className="muted small">{summary ? `${summary.journeys.toLocaleString()} journeys` : ''}</span>
        </div>
      </header>
      <div className="chart-toolbar">
        <Segmented label="Chart type" value={chartType} options={[['line', 'Line'], ['bar', 'Bar']]} onChange={(v) => onViewChange({ ...view, chartType: v })} />
        <Segmented label="X axis" value={mode} options={[['timeline', 'Timeline'], ['profile', '24h profile']]} onChange={(v) => onViewChange({ ...view, mode: v })} />
      </div>
      <MetricChart
        metricId={metric.id}
        options={{ ...controls, mode }}
        chartType={chartType}
        onData={(d) => setSummary(d.summary)}
      />
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [controls, setControls] = useState(() => ({ ...DEFAULT_CONTROLS, ...loadPref('controls', {}) }));
  const [hidden, setHidden] = useState(() => loadPref('hiddenMetrics', []));
  const [views, setViews] = useState(() => loadPref('chartViews', {}));

  useEffect(() => {
    api('/metrics').then((d) => setMetrics(d.metrics)).catch((err) => setError(err.message));
  }, []);

  const update = (setter, key) => (value) => {
    setter(value);
    savePref(key, value);
  };
  const setControlsPref = update(setControls, 'controls');
  const setHiddenPref = update(setHidden, 'hiddenMetrics');
  const setViewsPref = update(setViews, 'chartViews');

  const visible = (metrics ?? []).filter((m) => !hidden.includes(m.id));
  const toggleMetric = (id) => setHiddenPref(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);

  return (
    <>
      <h1>Dashboard</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <ReportControls value={controls} onChange={setControlsPref}>
        <div className="control">
          <span className="control-label">Charts</span>
          <details className="dropdown">
            <summary>{metrics ? `${visible.length} of ${metrics.length} shown` : '…'}</summary>
            <div className="dropdown-panel">
              {(metrics ?? []).map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={!hidden.includes(m.id)} onChange={() => toggleMetric(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
              {user.role === 'admin' && <Link to="/metrics" className="small">Create or edit metrics →</Link>}
            </div>
          </details>
        </div>
      </ReportControls>

      {metrics && visible.length === 0 && (
        <p className="muted">No charts selected. Use “Charts” above{user.role === 'admin' ? ', or create one in Metrics' : ''}.</p>
      )}

      <div className="chart-grid">
        {visible.map((m) => (
          <ChartCard
            key={m.id}
            metric={m}
            controls={controls}
            view={views[m.id] ?? {}}
            onViewChange={(view) => setViewsPref({ ...views, [m.id]: view })}
          />
        ))}
      </div>
    </>
  );
}
