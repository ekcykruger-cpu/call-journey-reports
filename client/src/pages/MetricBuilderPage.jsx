import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MetricChart from '../components/MetricChart.jsx';
import ReportControls, { DEFAULT_CONTROLS } from '../components/ReportControls.jsx';
import { FORMAT_LABELS } from '../utils/format.js';
import { loadPref } from '../utils/storage.js';

const BLANK = {
  name: '',
  description: '',
  chartType: 'line',
  xAxis: 'timeline',
  filters: [],
  numerator: '',
  denominator: '',
  format: 'number',
  decimals: 1,
  emptyAs: 'gap',
  profileMode: 'combined',
};
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in'];
const TEXT_OPS = ['=', '!=', 'in', 'not in'];

// The form keeps filter values as typed text; this turns them into the saved definition format.
function toDefinition(draft, fields) {
  const typeOf = (name) => fields.find((f) => f.name === name)?.type;
  return {
    ...draft,
    decimals: Number(draft.decimals),
    filters: draft.filters.map(({ field, op, valueText }) => {
      const isList = op === 'in' || op === 'not in';
      const parts = isList ? String(valueText).split(',').map((s) => s.trim()).filter(Boolean) : [String(valueText).trim()];
      const values = typeOf(field) === 'number' ? parts.map(Number) : parts;
      return { field, op, value: isList ? values : values[0] };
    }),
  };
}

function toDraft(metric) {
  return {
    ...BLANK,
    ...metric,
    filters: (metric.filters ?? []).map((f) => ({
      field: f.field,
      op: f.op,
      valueText: Array.isArray(f.value) ? f.value.join(', ') : String(f.value),
    })),
  };
}

export default function MetricBuilderPage() {
  const [metrics, setMetrics] = useState([]);
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null); // null = new metric
  const [draft, setDraft] = useState(BLANK);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }
  const [preview, setPreview] = useState(null);
  const [controls, setControls] = useState(() => ({ ...DEFAULT_CONTROLS, ...loadPref('controls', {}) }));
  const lastFormula = useRef('numerator');

  const loadMetrics = () => api('/metrics').then((d) => setMetrics(d.metrics));
  useEffect(() => {
    loadMetrics();
    api('/metrics/fields').then((d) => setFields(d.fields));
  }, []);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setFilter = (i, patch) => set({ filters: draft.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  function select(metric) {
    setSelectedId(metric?.id ?? null);
    setDraft(metric ? toDraft(metric) : BLANK);
    setMessage(null);
    setPreview(null);
  }

  function insertField(name) {
    const key = lastFormula.current;
    set({ [key]: `${draft[key]}${draft[key] && !/[\s(]$/.test(draft[key]) ? ' ' : ''}${name}` });
  }

  async function run(action) {
    setMessage(null);
    const definition = toDefinition(draft, fields);
    try {
      if (action === 'check') {
        await api('/metrics/validate', { method: 'POST', body: { definition } });
        setMessage({ type: 'success', text: 'Looks good - the formula and filters are valid.' });
      } else if (action === 'preview') {
        await api('/metrics/validate', { method: 'POST', body: { definition } });
        setPreview(definition);
      } else if (action === 'save') {
        const d = selectedId
          ? await api(`/metrics/${selectedId}`, { method: 'PUT', body: { definition } })
          : await api('/metrics', { method: 'POST', body: { definition } });
        await loadMetrics();
        setSelectedId(d.metric.id);
        setMessage({ type: 'success', text: `Saved “${d.metric.name}”. It's now available on the dashboard.` });
      } else if (action === 'delete') {
        if (!window.confirm(`Delete the metric “${draft.name}”? Its chart disappears from everyone's dashboard.`)) return;
        await api(`/metrics/${selectedId}`, { method: 'DELETE' });
        await loadMetrics();
        select(null);
        setMessage({ type: 'success', text: 'Metric deleted.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const textFields = fields.filter((f) => f.type === 'text');
  const numberFields = fields.filter((f) => f.type === 'number');

  return (
    <>
      <h1>Metrics</h1>
      <div className="builder">
        <aside className="card builder-list">
          <button type="button" className={`list-item${selectedId === null ? ' active' : ''}`} onClick={() => select(null)}>
            + New metric
          </button>
          {metrics.map((m) => (
            <button key={m.id} type="button" className={`list-item${m.id === selectedId ? ' active' : ''}`} onClick={() => select(m)}>
              {m.name}
            </button>
          ))}
        </aside>

        <div>
          <form className="card builder-form" onSubmit={(e) => { e.preventDefault(); run('save'); }}>
            {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

            <div className="form-row">
              <label>
                Name
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={150} />
              </label>
              <label>
                Shown as
                <select value={draft.format} onChange={(e) => set({ format: e.target.value })}>
                  {Object.entries(FORMAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="narrow">
                Decimals
                <input type="number" min={0} max={4} value={draft.decimals} onChange={(e) => set({ decimals: e.target.value })} />
              </label>
            </div>
            <label>
              Description (optional)
              <input value={draft.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
            </label>

            <h3>Which journeys? (filters, all must match)</h3>
            {draft.filters.length === 0 && <p className="muted small">No filters - every journey counts.</p>}
            {draft.filters.map((f, i) => {
              const isText = textFields.some((t) => t.name === f.field);
              return (
                <div className="form-row filter-row" key={i}>
                  <select value={f.field} onChange={(e) => setFilter(i, { field: e.target.value })} aria-label="Field">
                    {fields.map((fd) => <option key={fd.name} value={fd.name}>{fd.label}</option>)}
                  </select>
                  <select value={f.op} onChange={(e) => setFilter(i, { op: e.target.value })} aria-label="Operator">
                    {(isText ? TEXT_OPS : OPS).map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input
                    value={f.valueText}
                    onChange={(e) => setFilter(i, { valueText: e.target.value })}
                    placeholder={f.op.includes('in') ? 'value 1, value 2, …' : isText ? 'e.g. Y' : 'e.g. 60'}
                    aria-label="Value"
                  />
                  <button type="button" className="btn-link" onClick={() => set({ filters: draft.filters.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              );
            })}
            <button
              type="button"
              className="btn-link"
              onClick={() => set({ filters: [...draft.filters, { field: 'abandoned_final', op: '=', valueText: 'Y' }] })}
            >
              + Add filter
            </button>

            <h3>Calculation (value = numerator ÷ denominator)</h3>
            <label>
              Numerator
              <textarea rows={2} value={draft.numerator} onFocus={() => (lastFormula.current = 'numerator')} onChange={(e) => set({ numerator: e.target.value })} placeholder="e.g. sum(sum_pre_queue + sum_in_queue)" required />
            </label>
            <label>
              Denominator (optional)
              <textarea rows={1} value={draft.denominator} onFocus={() => (lastFormula.current = 'denominator')} onChange={(e) => set({ denominator: e.target.value })} placeholder="e.g. count()" />
            </label>
            <details className="field-help">
              <summary>Fields and functions</summary>
              <p className="small muted">
                Functions: <code>sum(x)</code> <code>avg(x)</code> <code>min(x)</code> <code>max(x)</code> <code>count()</code>{' '}
                <code>countif(condition)</code>. Fields go inside a function. Text in quotes, e.g.{' '}
                <code>countif(abandoned_final = 'Y')</code>. Click a field to add it to the formula you last clicked in.
              </p>
              <div className="chips">
                {numberFields.map((f) => <button type="button" key={f.name} className="chip" title={f.label} onClick={() => insertField(f.name)}>{f.name}</button>)}
              </div>
              <p className="small muted">Text fields (for filters and countif):</p>
              <div className="chips">
                {textFields.map((f) => <button type="button" key={f.name} className="chip" title={f.label} onClick={() => insertField(f.name)}>{f.name}</button>)}
              </div>
            </details>

            <h3>Chart defaults</h3>
            <div className="form-row">
              <label>
                Chart type
                <select value={draft.chartType} onChange={(e) => set({ chartType: e.target.value })}>
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                </select>
              </label>
              <label>
                X axis
                <select value={draft.xAxis} onChange={(e) => set({ xAxis: e.target.value })}>
                  <option value="timeline">Timeline</option>
                  <option value="profile">24h profile</option>
                </select>
              </label>
              <label>
                Empty intervals
                <select value={draft.emptyAs} onChange={(e) => set({ emptyAs: e.target.value })}>
                  <option value="gap">Gap (averages, rates)</option>
                  <option value="zero">Zero (counts)</option>
                </select>
              </label>
              <label>
                24h profile shows
                <select value={draft.profileMode} onChange={(e) => set({ profileMode: e.target.value })}>
                  <option value="combined">All days combined</option>
                  <option value="dailyAverage">Average per day (counts)</option>
                </select>
              </label>
            </div>

            <div className="button-row">
              <button type="submit" className="btn">{selectedId ? 'Save changes' : 'Create metric'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => run('check')}>Check</button>
              <button type="button" className="btn btn-secondary" onClick={() => run('preview')}>Preview</button>
              {selectedId && <button type="button" className="btn-link danger" onClick={() => run('delete')}>Delete metric</button>}
            </div>
          </form>

          {preview && (
            <section className="card chart-card">
              <h2>Preview: {preview.name || 'unsaved metric'}</h2>
              <ReportControls value={controls} onChange={setControls} />
              <MetricChart definition={preview} options={{ ...controls, mode: preview.xAxis }} chartType={preview.chartType} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
