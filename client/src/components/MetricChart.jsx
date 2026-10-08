import { useEffect, useMemo, useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { api } from '../api.js';
import { formatValue } from '../utils/format.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Follows the operating system's light/dark setting so chart colours switch with the page.
const DARK_QUERY = '(prefers-color-scheme: dark)';
function useColorScheme() {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e) => setDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

// Loads and draws one metric. Pass `metricId` for a saved metric, or `definition` to preview an unsaved one.
// `options` = { from, to, interval, mode, skills[] }; `chartType` overrides the metric's default.
export default function MetricChart({ metricId, definition, options, chartType, onData }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const dark = useColorScheme();

  const requestKey = JSON.stringify({ metricId, definition, options });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      from: options.from,
      to: options.to,
      interval: String(options.interval),
      ...(options.mode ? { mode: options.mode } : {}),
      ...(options.skills?.length ? { skills: options.skills.join(',') } : {}),
    });
    const request = definition
      ? api('/metrics/preview', { method: 'POST', body: { definition, ...options } })
      : api(`/metrics/${metricId}/series?${params}`);
    request
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onData?.(d);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // requestKey captures every input that should trigger a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const type = chartType || data?.chartType || 'line';
  const chart = useMemo(() => {
    if (!data) return null;
    const color = cssVar('--series-1');
    const fmt = (v) => formatValue(v, data.format, 1);
    const isLine = type === 'line';
    return {
      data: {
        labels: data.labels,
        datasets: [
          {
            label: data.name,
            data: data.values,
            borderColor: color,
            backgroundColor: isLine ? `${color}22` : color,
            borderWidth: isLine ? 2 : 0,
            borderRadius: isLine ? 0 : { topLeft: 4, topRight: 4 },
            borderSkipped: 'start',
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 12,
            fill: isLine,
            spanGaps: false,
            tension: 0.25,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false }, // one series: the card title names it
          tooltip: { callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y)}` } },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: cssVar('--muted'), autoSkip: true, maxTicksLimit: 12, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: cssVar('--grid') },
            border: { display: false },
            ticks: { color: cssVar('--muted'), callback: (v) => fmt(v), maxTicksLimit: 6 },
          },
        },
      },
    };
    // `dark` re-reads the CSS colours when the theme changes
  }, [data, type, dark]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!chart) return <div className="chart-box chart-placeholder muted">Loading…</div>;
  const ChartType = type === 'bar' ? Bar : Line;
  const empty = data.summary.journeys === 0;
  return (
    <div className={`chart-box${loading ? ' is-loading' : ''}`}>
      {empty && <div className="chart-empty muted">No journeys in this period</div>}
      <ChartType data={chart.data} options={chart.options} aria-label={`${data.name} chart`} role="img" />
    </div>
  );
}
