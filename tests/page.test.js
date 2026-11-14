// Checks on site/index.html itself: the example table, the numbers on the page,
// the wording rules and the "unlisted" settings (CLAUDE.md Sections 5, 6 and 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as rules from '../site/rules.js';
import { parseCsv } from './csv.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const HTML = read('../site/index.html');
const PROBES = parseCsv(read('../data/checker_probes.csv'));

/** Visible text of the HTML: no tags, scripts, styles or attribute values. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}
const rupees = (s) => Number(s.replace(/[^\d]/g, ''));

// ---------------------------------------------------------------------------
test('example table: every cell matches the rules, and every seen cell is in the CSV', () => {
  const cells = [...HTML.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(([, attrs, body]) => ({
    check: attrs.match(/data-check="([^"]+)"/)?.[1],
    isRule: /data-rule="true"/.test(attrs),
    text: visibleText(body).trim(),
  }));
  assert.equal(cells.length, 12, 'four people × three columns');
  assert.equal(cells.filter((c) => c.isRule).length, 1, 'exactly one cell is marked rule');
  assert.ok(cells.find((c) => c.isRule).text.includes('rule'), 'the rule cell keeps its "rule" label');

  for (const cell of cells) {
    const [site, ...args] = cell.check.split(' ');
    const nums = args.map(Number);
    const amountText = cell.text.match(/₹[\d,]+/)?.[0];

    if (site === 'bajaj') {
      const expected = rules.bajaj(...nums);
      assert.equal(rupees(amountText), expected, cell.check);
      const seen = PROBES.find((r) => r.site === 'bajaj_finserv' && r.probe_type !== 'limit'
        && Number(r.monthly_income) === nums[0] && Number(r.monthly_expense_or_existing_emi) === nums[1]);
      assert.ok(seen && Number(seen.shown_eligible_amount) === expected, `seen on site: ${cell.check}`);
      continue;
    }

    const r = rules.paisabazaar(...nums);
    if (/not eligible/.test(cell.text)) {
      assert.equal(r.eligible, false, cell.check);
      if (/debts/.test(cell.text)) assert.equal(r.reason, rules.NOT_ELIGIBLE.DEBTS_TOO_HIGH);
    } else {
      assert.equal(rupees(amountText), r.amount, cell.check);
      const yearsMatch = cell.text.match(/tenure cut to (\d+) year/);
      if (yearsMatch) assert.equal(r.years, Number(yearsMatch[1]), cell.check);
    }
    if (cell.isRule) continue; // the one predicted cell is not in the CSV, by design
    const [age, desired, rate, tenure, income, emi] = nums;
    const seen = PROBES.find((p) => p.site === 'paisabazaar' && Number(p.age) === age
      && Number(p.desired_amount) === desired && Number(p.rate_pct) === rate
      && Number(p.tenure_years_chosen) === tenure && Number(p.monthly_income) === income
      && Number(p.monthly_expense_or_existing_emi) === emi);
    assert.ok(seen, `seen on site: ${cell.check}`);
    if (r.eligible) assert.equal(Number(seen.shown_eligible_amount), r.amount, cell.check);
    else assert.match(seen.shown_message, /not eligible/, cell.check);
  }
});

// ---------------------------------------------------------------------------
test('every number written in the page comes from rules.js or the CSV', () => {
  const allowed = new Map();
  const allow = (n, why) => { if (!allowed.has(n)) allowed.set(n, why); };

  for (const row of PROBES) {
    for (const v of Object.values(row)) if (v !== '' && !Number.isNaN(Number(v))) allow(Number(v), 'CSV');
  }
  allow(PROBES.filter((r) => r.probe_type !== 'limit').length, 'CSV: number of checked probes');

  const walk = (x, path) => {
    if (typeof x === 'number') {
      allow(x, path);
      if (x > 0 && x < 1) allow(Math.round(x * 100), `${path} as %`);
      if (x >= 100000 && x % 100000 === 0) allow(x / 100000, `${path} in lakh`);
    } else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) walk(v, `${path}.${k}`);
    }
  };
  for (const [name, value] of Object.entries(rules)) if (typeof value === 'object') walk(value, name);
  allow(rules.BAJAJ_ASSUMPTIONS.months / 12, 'BAJAJ_ASSUMPTIONS.months in years');

  // Not claims about the calculators: the test date and the ₹1 rounding tolerance / ₹1 of room.
  allow(14, 'test date'); allow(2026, 'test year'); allow(1, 'rounding tolerance');

  const text = visibleText(HTML);
  const found = [...text.matchAll(/\d[\d,]*(?:\.\d+)?k?/g)].map(([m]) => {
    const n = Number(m.replace(/,/g, '').replace(/k$/, ''));
    return { raw: m, value: m.endsWith('k') ? n * 1000 : n };
  });
  assert.ok(found.length > 30, 'the page has numbers to check');
  const unknown = found.filter((f) => !allowed.has(f.value));
  assert.deepEqual(unknown, [], `numbers on the page with no source: ${unknown.map((u) => u.raw).join(', ')}`);
});

// ---------------------------------------------------------------------------
test('none of the banned words appear (CLAUDE.md 5.9)', () => {
  const banned = /mislead|shady|fishy|scam|trick|fraud|predator|\blies?\b|\blied\b|cheat|dark pattern/i;
  for (const file of ['../site/index.html', '../site/app.js', '../site/styles.css', '../site/rules.js']) {
    const hit = read(file).match(banned);
    assert.equal(hit, null, `${file}: "${hit?.[0]}"`);
  }
});

test('unlisted: noindex meta tag, robots.txt and the Vercel noindex header', () => {
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal(read('../site/robots.txt').trim(), 'User-agent: *\nDisallow: /');
  const headers = JSON.parse(read('../site/vercel.json')).headers.flatMap((h) => h.headers);
  assert.ok(headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'));
  assert.ok(headers.some((h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer'));
});

test('page has the date stamp, both links, the DRAFT markers and the footer', () => {
  const text = visibleText(HTML);
  assert.match(text, /Tested on 14 November 2026\. The sites may have changed since\./);
  assert.ok(HTML.includes('href="https://www.bajajfinserv.in/personal-loan-eligibility-calculator"'));
  assert.ok(HTML.includes('href="https://www.paisabazaar.com/personal-loan/eligibility-calculator/"'));
  assert.match(text, /How we tested \[DRAFT\]/);
  assert.match(text, /Limits \[DRAFT\]/);
  assert.ok(HTML.includes('href="checker_probes.csv" download'));
  for (const line of ['Not financial advice.', 'Nothing you type here leaves your browser.', 'Contact: [to be added]']) {
    assert.ok(text.includes(line), line);
  }
});

test('no external scripts, styles or fonts', () => {
  for (const [, url] of HTML.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^https?:|^\/\//.test(url), `external resource: ${url}`);
  }
  assert.doesNotMatch(read('../site/styles.css'), /@import|url\(\s*['"]?https?:/);
  // An inline empty icon stops the browser from asking the server for /favicon.ico.
  assert.ok(HTML.includes('<link rel="icon" href="data:,">'));
});

test('no names or affiliations on the page', () => {
  const names = /aditya|bansal|bits|pilani|professor|university|@[a-z0-9-]+\./i;
  for (const file of ['../site/index.html', '../site/app.js', '../site/rules.js']) {
    const hit = read(file).match(names);
    assert.equal(hit, null, `${file}: "${hit?.[0]}"`);
  }
});
