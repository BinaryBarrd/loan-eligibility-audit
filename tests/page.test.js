// Checks on the pages themselves (CLAUDE.md Sections 5, 6 and 10): unlisted settings, wording rules,
// no names, no external requests, the disclaimer gate, the menu, and that every number written in the
// platform pages comes from rules.js, audit-data.js (counted from the probe logs) or a probe CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as rules from '../site/rules.js';
import { AUDIT } from '../site/audit-data.js';
import { PLATFORMS, run, defaults } from '../site/platforms.js';
import { personaSpread } from '../site/people.js';
import { parseCsv } from './csv.js';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(path(rel), 'utf8');
const SITE_FILES = readdirSync(path('../site')).filter((f) => /\.(html|js|css)$/.test(f));
const HTML_FILES = SITE_FILES.filter((f) => f.endsWith('.html'));
const html = (f) => read(`../site/${f}`);

function visibleText(s) {
  return s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
test('twelve pages: overview, nine platforms, compare, method', () => {
  assert.deepEqual([...HTML_FILES].sort(), ['index.html', 'compare.html', 'method.html', ...PLATFORMS.map((p) => p.file)].sort());
});

test('every page is unlisted, has no external resources, and has the footer', () => {
  for (const f of HTML_FILES) {
    const s = html(f);
    assert.match(s, /<meta name="robots" content="noindex, nofollow">/, f);
    assert.ok(s.includes('<link rel="icon" href="data:,">'), `${f}: inline icon`);
    for (const [, url] of s.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
      assert.ok(!/^https?:|^\/\//.test(url), `${f}: external resource ${url}`);
    }
    const text = visibleText(s);
    assert.ok(!text.includes('Contact:'), `${f}: no contact placeholder`);
    for (const line of ['Not financial advice.', 'Nothing you type here leaves your browser.']) {
      assert.ok(text.includes(line), `${f}: ${line}`);
    }
  }
  assert.equal(read('../site/robots.txt').trim(), 'User-agent: *\nDisallow: /');
  const headers = JSON.parse(read('../site/vercel.json')).headers.flatMap((h) => h.headers);
  assert.ok(headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'));
  assert.ok(headers.some((h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer'));
  assert.doesNotMatch(read('../site/styles.css'), /@import|url\(\s*['"]?https?:/);
});

test('scripts make no network requests and use no storage or cookies', () => {
  for (const f of SITE_FILES.filter((x) => x.endsWith('.js'))) {
    const s = read(`../site/${f}`);
    assert.doesNotMatch(s, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie|indexedDB/, f);
    for (const [, url] of s.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)) assert.ok(url.startsWith('./'), `${f}: import ${url}`);
  }
});

test('none of the banned words appear (CLAUDE.md 5.9)', () => {
  const banned = /mislead|shady|fishy|scam|trick|fraud|predator|\blies?\b|\blied\b|cheat|dark pattern/i;
  for (const f of SITE_FILES) {
    const hit = read(`../site/${f}`).match(banned);
    assert.equal(hit, null, `${f}: "${hit?.[0]}"`);
  }
});

test('no names or affiliations (the company “Aditya Birla Capital” is the only “Aditya” allowed)', () => {
  const names = /bansal|\bbits\b|pilani|professor|university|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]/i;
  const firstName = /aditya(?![\s_-]?birla)/i;
  for (const f of SITE_FILES) {
    const s = read(`../site/${f}`);
    assert.equal(s.match(names), null, `${f}: "${s.match(names)?.[0]}"`);
    assert.equal(s.match(firstName), null, `${f}: "${s.match(firstName)?.[0]}"`);
  }
});

test('overview: disclaimer first, with a continue button; the rest starts hidden', () => {
  const s = html('index.html');
  const d = s.indexOf('id="disclaimer"'); const app = s.indexOf('<div id="app" hidden>');
  assert.ok(d > 0 && app > d);
  assert.match(s, /<button type="button" class="primary" id="continue">/);
  const text = visibleText(s.slice(d, app));
  for (const line of ['Not financial advice.', '“indicative”', 'November 2026', 'Nothing you type here leaves your browser.', 'Not connected to any of these companies.']) {
    assert.ok(text.includes(line), line);
  }
});

test('every page links every page, and marks itself as current', () => {
  for (const f of HTML_FILES) {
    const s = html(f);
    for (const g of HTML_FILES) assert.match(s, new RegExp(`<a href="${g}(#overview)?"`), `${f} links ${g}`);
    assert.match(s, new RegExp(`<a href="${f}(#overview)?" aria-current="page">`), `${f} marks itself`);
    if (f !== 'index.html') assert.match(visibleText(s), /Not financial advice\. Calculators, not loan offers\./, `${f}: strip`);
  }
});

test('every page preloads every module it uses, so they download in parallel', () => {
  const imports = (f) => [...read(`../site/${f}`).matchAll(/^import[^;]*?from\s+'\.\/([^']+)'/gm)].map((m) => m[1]);
  for (const f of HTML_FILES) {
    const s = html(f);
    const m = s.match(/<script type="module" src="([^"]+)">/);
    if (!m) continue; // a page with no script (method.html)
    const entry = m[1];
    const need = new Set([entry]); const todo = [entry];
    while (todo.length) for (const m of imports(todo.pop())) if (!need.has(m)) { need.add(m); todo.push(m); }
    for (const m of need) assert.ok(s.includes(`<link rel="modulepreload" href="${m}">`), `${f}: preload ${m}`);
  }
});

test('each platform page names its platform, and its download is an exact copy', () => {
  for (const p of PLATFORMS) {
    assert.match(html(p.file), new RegExp(`<body data-platform="${p.id}">`), p.file);
    assert.equal(read(`../site/data/${p.id}.csv`), read(`../data/audit/${p.id}.csv`), `${p.id}: download copy`);
  }
  assert.ok(existsSync(path('../site/data/personas.csv')));
});

test('overview and method content is written into the page, not built by a script', () => {
  assert.equal((html('index.html').match(/<a class="card" href=/g) || []).length, PLATFORMS.length);
  assert.ok((html('index.html').match(/<ol class="takeaways" id="takeaways">([\s\S]*?)<\/ol>/)[1].match(/<li>/g) || []).length >= 5);
  assert.equal((html('method.html').match(/<tr><th scope="row">/g) || []).length, PLATFORMS.length);
  assert.doesNotMatch(html('method.html'), /<script/);
});

test('Method and Limits are marked [DRAFT]', () => {
  const text = visibleText(html('method.html'));
  assert.match(text, /Method \[DRAFT\]/);
  assert.match(text, /Limits \[DRAFT\]/);
  assert.match(text, /a script opened each of the other seven calculators/);
});

test('every platform shows a result for its default inputs', () => {
  for (const p of PLATFORMS) {
    const r = run(p, defaults(p));
    assert.equal(r.state, 'result', p.id);
    assert.ok(r.display.some((d) => d && (d.k === 'amount' || d.k === 'message')), p.id);
  }
});

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
const allowed = new Map();
const allow = (n, why) => { if (Number.isFinite(n) && !allowed.has(n)) allowed.set(n, why); };
const numbersIn = (s) => [...String(s).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(([m]) => Number(m.replace(/,/g, '')));
function allowDerived(x, why) {
  allow(x, why);
  if (x > 0 && x < 1) { allow(Math.round(x * 1000) / 10, `${why} as %`); allow(Math.round((1 - x) * 1000) / 10, `${why}: 100% minus`); }
  if (x >= 100000) allow(x / 100000, `${why} in lakh`);
  if (x >= 10000000) allow(x / 10000000, `${why} in crore`);
  if (x >= 12 && x % 12 === 0) allow(x / 12, `${why} in years`);
}
function walk(x, why) {
  if (typeof x === 'number') allowDerived(x, why);
  else if (typeof x === 'string') for (const n of numbersIn(x)) allowDerived(n, `${why} (text)`);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, `${why}.${k}`);
}
for (const [name, value] of Object.entries(rules)) if (typeof value === 'object') walk(value, name);
walk(AUDIT, 'AUDIT');
for (const f of readdirSync(path('../data/audit'))) {
  for (const row of parseCsv(read(`../data/audit/${f}`))) for (const v of Object.values(row)) for (const n of numbersIn(v)) allowDerived(n, f);
}
for (const row of parseCsv(read('../data/checker_probes.csv'))) for (const v of Object.values(row)) for (const n of numbersIn(v)) allowDerived(n, 'checker_probes.csv');
// Worked examples on the pages, each recomputed here from the rules.
const examples = [
  rules.kotakEmi(rules.kotak(40000, 10000).amount, 1),
  rules.smfg(1000000, 10000, 12.5, 60).amount,
  ...[24000, 25000, 29000].map((e) => rules.axis(40000, e).amount),
  rules.fibe(20000, 20000).amount,
  ...[50000, 51000].map((i) => rules.poonawalla(i, 0, 60).amount),
  1 + rules.IDFC.share,
];
for (const n of examples) allowDerived(n, 'worked example');
for (let i = 0; i <= 12; i++) allow(i, 'small count');
for (const s of personaSpread()) if (s.ratio) allow(Math.round(s.ratio * 10) / 10, 'persona spread ratio');

test('every number in the platform texts and pages comes from the rules, the audit data or a probe CSV', () => {
  const unknown = [];
  for (const p of PLATFORMS) {
    const texts = [p.fixedNote, p.notRetested, p.formula, ...p.behind, ...p.ignores, ...p.findings.flat(),
      ...p.fields.flatMap((f) => [f.label, f.help])].filter(Boolean);
    for (const t of texts) for (const n of numbersIn(t)) if (!allowed.has(n)) unknown.push(`${p.id}: ${n} in “${t.slice(0, 80)}”`);
  }
  for (const f of HTML_FILES) {
    for (const n of numbersIn(visibleText(html(f)))) if (!allowed.has(n)) unknown.push(`${f}: ${n}`);
  }
  assert.deepEqual(unknown, []);
});
