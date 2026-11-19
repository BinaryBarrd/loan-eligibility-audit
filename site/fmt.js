// Formatting helpers shared by every page. Pure functions: no DOM, no network.
export const inr = (n) => Math.round(n).toLocaleString('en-IN');
export const rs = (n) => `₹${inr(n)}`;
/** ₹10 lakh / ₹1 crore for round amounts, otherwise Indian digits (₹25,000). */
export const rsShort = (n) => {
  if (n >= 10000000 && n % 10000000 === 0) return `₹${n / 10000000} crore`;
  if (n >= 100000 && n % 100000 === 0) return `₹${n / 100000} lakh`;
  return rs(n);
};
export const pct = (x) => `${Math.round(x * 1000) / 10}%`; // share → "75%"
export const num = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const years = (n) => `${num(n)} ${n === 1 ? 'year' : 'years'}`;
export const months = (n) => `${num(n)} ${n === 1 ? 'month' : 'months'}`;

/** "14 November 2026" from "2026-11-14". */
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const name = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
  return `${d} ${name} ${y}`;
}
/** "18–19 November 2026" or "14 and 19 November 2026" from a sorted list of ISO days. */
export function dateList(days) {
  const uniq = [...new Set(days)];
  if (uniq.length === 1) return longDate(uniq[0]);
  const ds = uniq.map((d) => Number(d.slice(8)));
  const tail = longDate(uniq[uniq.length - 1]).replace(/^\d+ /, '');
  const consecutive = ds.every((d, i) => i === 0 || d === ds[i - 1] + 1);
  if (consecutive) return `${ds[0]}–${ds[ds.length - 1]} ${tail}`;
  return `${ds.slice(0, -1).join(', ')} and ${ds[ds.length - 1]} ${tail}`;
}

export function formatValue(unit, v) {
  if (unit === 'money') return rs(v);
  if (unit === 'months') return months(v);
  if (unit === 'years') return years(v);
  if (unit === 'pct') return `${num(v)}%`;
  return num(v);
}
export function formatLimit(unit, v) {
  return unit === 'money' ? rsShort(v) : formatValue(unit, v);
}
