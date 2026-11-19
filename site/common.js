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

/** Disclaimer gate (front page only). Nothing is stored: it shows on every visit. */
export function gate() {
  const d = $('disclaimer'); const app = $('app');
  if (!d || !app) return;
  $('continue').addEventListener('click', () => {
    d.hidden = true; app.hidden = false; window.scrollTo(0, 0);
    app.querySelector('h1, h2')?.focus({ preventScroll: true });
  });
}
