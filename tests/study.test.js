// The study's server engine (study/lib) must give exactly the website's amounts, under neutral names only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAll, validate, shuffled, FORM } from '../study/lib/engine.js';
import { LENDER_RULES } from '../study/lib/lenders.js';
import handler from '../study/api/results.js';
import { everyone } from '../site/people.js';
import { AUDIT } from '../site/audit-data.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const BRANDS = ['bajaj', 'paisabazaar', 'kotak', 'idfc', 'smfg', 'sumitomo', 'axis', 'fibe', 'poonawalla', 'birla', 'finserv', 'fincorp'];

test('study/lib/rules.js is an exact copy of site/rules.js', () => {
  assert.equal(readFileSync(join(root, 'study/lib/rules.js'), 'utf8'), readFileSync(join(root, 'site/rules.js'), 'utf8'),
    'run: node scripts/sync_study_rules.mjs');
});

test('the lender numbers match the private key in the study plan', () => {
  assert.deepEqual({ ...LENDER_RULES }, {
    1: 'kotak', 2: 'aditya_birla', 3: 'axis', 4: 'paisabazaar', 5: 'smfg',
    6: 'bajaj_finserv', 7: 'poonawalla', 8: 'idfc_first', 9: 'fibe',
  });
});

test('every amount matches the website Compare page for the same person', () => {
  const ruleOf = Object.fromEntries(Object.entries(LENDER_RULES).map(([n, id]) => [id, Number(n)]));
  let checked = 0;
  // A wider grid (10 ages × 11 incomes × 5 EMIs × 3 expenses × 6 tenures × 6 rates × 2 = 1,069,200 results)
  // also passed on 25 Nov 2026; this smaller one keeps the test suite quick.
  for (const age of [18, 21, 29, 59, 60, 75])
    for (const income of [0, 9000, 15000, 22000, 27000, 40000, 85000, 120000, 160000, 400000, 2000000])
      for (const emis of [0, 10000, 35000, 120000])
        for (const other of [0, 8000, 60000])
          for (const years of [1, 3, 5, 10])
            for (const rate of [8, 12, 24, 35])
              for (const employment of ['salaried', 'self']) {
                const x = { age, income, emis, other, years, rate, employment };
                const study = computeAll({ ...x, wanted: AUDIT.personaCommon.desired });
                for (const row of everyone(x)) {
                  const s = study.find((c) => c.lender === ruleOf[row.p.id]);
                  const site = row.result.state === 'result' ? row.amount : null;
                  assert.equal(s.amount, site, `${row.p.id} ${JSON.stringify(x)}`);
                  checked += 1;
                }
              }
  console.log(`study engine vs website: ${checked} lender results compared, 0 mismatches`);
});

test('the default person gives the values the brief checks (Section 4.3)', () => {
  const x = { age: 29, income: 40000, emis: 10000, other: 0, wanted: 2000000, years: 5, rate: 10, employment: 'salaried' };
  const r = Object.fromEntries(computeAll(x).map((c) => [LENDER_RULES[c.lender], c.amount]));
  assert.equal(r.bajaj_finserv, 400000);
  assert.equal(r.paisabazaar, 564784);
});

test('rates are reported as the plan says: yours for 2, 4, 5; fixed for 6 to 9; none for 1 and 3', () => {
  const x = { age: 30, income: 150000, emis: 10000, other: 5000, wanted: 1000000, years: 4, rate: 13, employment: 'salaried' };
  const rate = Object.fromEntries(computeAll(x).map((c) => [c.lender, c.rate]));
  for (const n of [2, 4, 5]) assert.equal(rate[n].kind, 'yours', `lender ${n}`);
  assert.deepEqual([6, 7, 8, 9].map((n) => rate[n]), [10, 14, 9.99, 24].map((p) => ({ kind: 'fixed', pct: p })));
  for (const n of [1, 3]) assert.deepEqual(rate[n], { kind: 'none' });
});

test('no card ever names a lender or uses its own wording', () => {
  const people = [
    { age: 29, income: 40000, emis: 10000, other: 0, wanted: 2000000, years: 5, rate: 10, employment: 'salaried' },
    { age: 19, income: 9000, emis: 50000, other: 90000, wanted: 1, years: 10, rate: 40, employment: 'self' },
    { age: 62, income: 3000000, emis: 0, other: 0, wanted: 100000000, years: 1, rate: 1, employment: 'salaried' },
  ];
  for (const x of people) {
    const text = JSON.stringify(computeAll(x)).toLowerCase();
    for (const b of BRANDS) assert.ok(!text.includes(b), `"${b}" in ${text.slice(0, 200)}`);
    for (const phrase of ['you are eligible', 'upto', "we're sorry", 'unfortunately']) assert.ok(!text.includes(phrase), phrase);
  }
});

test('nothing the browser can download names a lender', () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(join(root, 'study/public'));
  for (const f of files) {
    const text = readFileSync(f, 'utf8').toLowerCase();
    for (const b of BRANDS) assert.ok(!text.includes(b), `"${b}" in ${f}`);
  }
});

test('the form refuses missing, non-whole and out-of-range values', () => {
  const ok = { age: 29, income: 40000, emis: 10000, other: 0, wanted: 2000000, years: 5, rate: 10.25, employment: 'salaried' };
  assert.deepEqual(validate(ok).errors, []);
  assert.equal(validate({ ...ok, age: 17 }).errors.length, 1);
  assert.equal(validate({ ...ok, years: 2.5 }).errors.length, 1);
  assert.equal(validate({ ...ok, income: '40000' }).errors.length, 1);
  assert.equal(validate({ ...ok, rate: FORM.rate.max + 1 }).errors.length, 1);
  assert.equal(validate({ ...ok, employment: 'pirate' }).values.employment, 'salaried');
});

test('shuffled keeps every lender exactly once', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 48271) % 2147483647; return seed % n; };
  const order = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
  assert.deepEqual([...order].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

/** A minimal stand-in for Vercel's request and response objects. */
function call(method, body) {
  const out = { status: 0, headers: {}, json: null };
  const res = {
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(s) { out.status = s; return this; },
    json(j) { out.json = j; return this; },
  };
  handler({ method, body }, res);
  return out;
}

test('POST /api/results returns nine cards in a random order, never cached', () => {
  const r = call('POST', { age: 29, income: 40000, emis: 10000, other: 0, wanted: 2000000, years: 5, rate: 10, employment: 'salaried' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.json.cards.length, 9);
  assert.deepEqual([...r.json.order].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(r.json.order, r.json.cards.map((c) => c.lender));
});

test('/api/results refuses other methods and bad values', () => {
  assert.equal(call('GET').status, 405);
  assert.equal(call('POST', 'not json').status, 400);
  assert.equal(call('POST', { age: 29 }).status, 400);
});

test('the saved record keeps ranges, ranks and answers, never an exact figure or age', async () => {
  const { buildRecord, band, BANDS } = await import('../study/public/record.js');
  assert.equal(band(0, BANDS.emis), '0');
  assert.equal(band(4999, BANDS.emis), '1-4999');
  assert.equal(band(40000, BANDS.income), '30000-49999');
  assert.equal(band(900000, BANDS.income), '500000+');
  const numbers = { income: 41234, emis: 10789, other: 0, wanted: 2000011, age: 29, years: 5, rate: 10 };
  const cards = computeAll({ ...numbers, employment: 'salaried' });
  const rec = buildRecord({ numbers, cards, answers: { q1: '25–29', q7: 4 } });
  const text = JSON.stringify(rec);
  for (const exact of ['41234', '10789', '2000011']) assert.ok(!text.includes(exact), exact);
  for (const c of cards) if (c.amount) assert.ok(!text.includes(String(c.amount)), `amount ${c.amount}`);
  assert.ok(!('age' in rec.numbers));
  assert.deepEqual(Object.keys(rec).sort(), ['answers', 'lenders', 'numbers', 'order', 'version']);
  assert.deepEqual(rec.lenders.map((l) => l.lender), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(Math.min(...rec.lenders.filter((l) => l.shown).map((l) => l.rank)), 1);
});
