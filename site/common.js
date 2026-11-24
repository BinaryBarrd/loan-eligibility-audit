// DOM helpers shared by every page. No network, no storage.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
export const $ = (id) => document.getElementById(id);
export const external = (href, text) => h('a', { href, rel: 'noopener noreferrer', target: '_blank' }, text, h('span', { class: 'sr-only' }, ' (opens in a new tab)'));

/** Returns { value, error }. Accepts digits with Indian or Western commas. */
export function readField(el) {
  const raw = el.value.trim();
  if (raw === '') return { value: null, error: 'Enter a number.' };
  const cleaned = raw.replace(/[,\s₹%]/g, '');
  const decimal = el.dataset.kind === 'decimal';
  const ok = decimal ? /^\d+(\.\d+)?$/.test(cleaned) : /^\d+$/.test(cleaned);
  if (!ok) return { value: null, error: decimal ? 'Use digits, with a decimal point if needed.' : 'Use whole numbers only.' };
  return { value: Number(cleaned), error: '' };
}

/** Calculators menu: close it on Escape, or when you click or tab outside it. It also works without this. */
export function menu() {
  const m = document.querySelector('.menu');
  if (!m) return;
  const close = () => { m.open = false; };
  document.addEventListener('click', (e) => { if (m.open && !m.contains(e.target)) close(); });
  document.addEventListener('focusin', (e) => { if (m.open && !m.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && m.open) { close(); m.querySelector('summary').focus(); }
  });
}
menu();

/** Disclaimer gate (front page only). Nothing is stored: it shows on every arrival from outside; the menu links (#overview) skip it. */
export function gate() {
  const d = $('disclaimer'); const app = $('app');
  if (!d || !app) return;
  if (location.hash === '#overview') { d.hidden = true; app.hidden = false; return; } // coming from another page of this site
  $('continue').addEventListener('click', () => {
    d.hidden = true; app.hidden = false; window.scrollTo(0, 0);
    app.querySelector('h1, h2')?.focus({ preventScroll: true });
  });
}

/** Highlights the key figures in a sentence (₹ amounts, percentages, “N ×”, years and months). */
const FIGURE = /(₹[\d,]+(?:\.\d+)?(?: lakh)?|\d+(?:\.\d+)?%|\d+(?:\.\d+)? ×|\b\d+(?:\.\d+)? (?:years?|months?)\b)/g;
export function markFigures(text) {
  return String(text).split(FIGURE).map((part, i) => (i % 2 ? h('mark', {}, part) : part)).filter((x) => x !== '');
}
