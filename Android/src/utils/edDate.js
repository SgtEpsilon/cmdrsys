const ED_OFFSET = 1286;
const ED_MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export function edDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  const D = String(d.getUTCDate()).padStart(2, '0');
  const M = ED_MON[d.getUTCMonth()];
  const Y = d.getUTCFullYear() + ED_OFFSET;
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${D} ${M} ${Y} — ${h}:${m}:${s}`;
}

export function edDateShort(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${String(d.getUTCDate()).padStart(2, '0')} ${ED_MON[d.getUTCMonth()]} ${d.getUTCFullYear() + ED_OFFSET}`;
}

export function edNow() {
  return edDate(Date.now());
}
