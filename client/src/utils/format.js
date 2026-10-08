// Today's date in Sydney as YYYY-MM-DD (the 'en-CA' locale formats dates that way).
export function sydneyDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

// Formats a metric value for axis ticks, tooltips and summary tiles.
export function formatValue(value, format, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(decimals)}%`;
  if (format === 'seconds') {
    const total = Math.round(value);
    if (Math.abs(total) < 60) return `${value.toFixed(value % 1 ? Math.min(decimals, 1) : 0)}s`;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export const FORMAT_LABELS = { number: 'Number', seconds: 'Seconds (shown as m:ss)', percent: 'Percent' };
