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

// --- Phase 3: saving ----------------------------------------------------------
const { checkRecord, indiaDay } = await import('../study/lib/schema.js');
const { createHandler } = await import('../study/api/submit.js');
const { toCsv, COLUMNS } = await import('../study/lib/csv.js');
const { buildRecord } = await import('../study/public/record.js');

const FULL = {
  q1: '25–29', q2: 'Other', q2_other: 'Freelance, writer', q3: 'Science', q4: 'Doctorate',
  q5: 'No', q6: 'Prefer not to say', q6c: 'Not sure', q6d: 'No', q6e: 'Yes', q6f: 'I’m not sure what that is',
  q6a: 4, q6g: 'Prefer not to say', q6b_1: 2, q6b_2: 3, q6b_3: 5, q6h: 1,
  q7: 4, q8: ['The largest amount', 'Other'], q8_other: 'It said "close"', q9: 2, q10: 5,
  q11: 'A different lender', q11_lender: 8, q12: 1, q13: 'The interest rate it assumed',
};
function validRecord(answers = FULL) {
  const numbers = { income: 40000, emis: 10000, other: 0, wanted: 2000000, age: 29, years: 5, rate: 10.5 };
  return buildRecord({ numbers, cards: computeAll({ ...numbers, employment: 'salaried' }), answers });
}
const without = (o, k) => { const c = { ...o }; delete c[k]; return c; };

test('a complete record passes the server check', () => {
  assert.deepEqual(checkRecord(validRecord()), []);
  const none = { ...without(without(without(FULL, 'q8'), 'q8_other'), 'q11_lender'), q7: 'none', q8a: ['I don’t need a loan'], q11: 'Same lender' };
  assert.deepEqual(checkRecord(validRecord(none)), []);
});

test('the server check refuses anything outside the privacy table', () => {
  const r = validRecord();
  const cases = {
    'extra top-level field': { ...r, ip: '1.2.3.4' },
    'exact income': { ...r, numbers: { ...r.numbers, income: 40000 } },
    'exact age': { ...r, numbers: { ...r.numbers, age: 29 } },
    'missing required answer': { ...r, answers: without(r.answers, 'q1') },
    'prefer not to say on q1': { ...r, answers: { ...r.answers, q1: 'Prefer not to say' } },
    'unknown answer key': { ...r, answers: { ...r.answers, name: 'A' } },
    'reason for none when a lender was chosen': { ...r, answers: { ...r.answers, q8a: ['I don’t need a loan'] } },
    'other text without Other': { ...r, answers: { ...r.answers, q3_other: 'x' } },
    'text over 100 characters': { ...r, answers: { ...r.answers, q2_other: 'x'.repeat(101) } },
    'scale out of range': { ...r, answers: { ...r.answers, q9: 6 } },
    'lender out of range': { ...r, answers: { ...r.answers, q7: 10 } },
    'order not a permutation': { ...r, order: [1, 1, 2, 3, 4, 5, 6, 7, 8] },
    'share not a 5% step': { ...r, lenders: r.lenders.map((l, i) => (i === 0 ? { ...l, share: 0.123 } : l)) },
    'exact amount in lenders': { ...r, lenders: r.lenders.map((l, i) => (i === 0 ? { ...l, amount: 600000 } : l)) },
    'wrong version': { ...r, version: 2 },
  };
  for (const [name, rec] of Object.entries(cases)) assert.ok(checkRecord(rec).length > 0, name);
  assert.ok(checkRecord({ ...r, answers: { ...r.answers, q2_other: 'y'.repeat(9000) } }).length > 0, 'oversized');
});

test('POST /api/submit saves a checked record with the day only', async () => {
  const saved = [];
  const store = { async save(day, record) { saved.push({ day, record }); } };
  const send = async (method, body, s = store) => {
    const out = { status: 0, json: null };
    const res = { setHeader() {}, status(x) { out.status = x; return this; }, json(j) { out.json = j; return this; } };
    await createHandler(s)({ method, body }, res);
    return out;
  };
  assert.equal((await send('POST', validRecord())).status, 201);
  assert.equal(saved.length, 1);
  assert.match(saved[0].day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved[0].record).sort(), ['answers', 'lenders', 'numbers', 'order', 'version']);
  assert.equal((await send('POST', { ...validRecord(), ip: 'x' })).status, 400);
  assert.equal((await send('POST', 'not json')).status, 400);
  assert.equal((await send('GET')).status, 405);
  const failing = { async save() { throw new Error('down'); } };
  assert.equal((await send('POST', validRecord(), failing)).status, 503);
  assert.equal(saved.length, 1);
});

test('India date is used for the saved day', () => {
  assert.equal(indiaDay(new Date('2026-11-25T20:00:00Z')), '2026-11-26');
  assert.equal(indiaDay(new Date('2026-11-25T10:00:00Z')), '2026-11-25');
});

test('the CSV export has one flat row per participant and no row id', () => {
  const csv = toCsv([{ day: '2026-11-26', record: validRecord() }]);
  const [head, row] = csv.trim().split('\n');
  assert.equal(head, COLUMNS.join(','));
  assert.ok(!head.includes('id,') && head.startsWith('day,version,q1,'));
  assert.ok(row.startsWith('2026-11-26,1,25–29,Other,"Freelance, writer",Science,,Doctorate,'));
  assert.ok(row.includes('"It said ""close"""'));
  assert.ok(row.includes('The largest amount; Other'));
});

test('question 6b is the published trusting stance–general technology scale, word for word', async () => {
  const { BACKGROUND } = await import('../study/public/questions.js');
  const items = BACKGROUND.filter((q) => q.key?.startsWith('q6b_'));
  // McKnight, Carter, Thatcher & Clay (2011), ACM TMIS 2(2), Article 12, Appendix B.
  assert.deepEqual(items.map((q) => q.text), [
    'My typical approach is to trust new technologies until they prove to me that I shouldn’t trust them.',
    'I usually trust a technology until it gives me a reason not to trust it.',
    'I generally give a technology the benefit of the doubt when I first use it.',
  ]);
  for (const q of items) assert.deepEqual([q.kind, ...q.ends], ['scale', 'Strongly disagree', 'Strongly agree']);
});
