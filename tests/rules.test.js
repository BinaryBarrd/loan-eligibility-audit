import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  annuityFactor,
  bajaj,
  paisabazaar,
  bajajRangeIssues,
  paisabazaarRangeIssues,
  bajajDetails,
  paisabazaarDetails,
  snapPaisabazaarInputs,
  NOT_ELIGIBLE,
} from '../site/rules.js';

const CSV_PATH = fileURLToPath(new URL('../data/checker_probes.csv', import.meta.url));

import { parseCsv } from './csv.js';

test('CSV parser handles quotes', () => {
  const rows = parseCsv('a,b,c\n"x, y","say ""hi""",3\r\n"multi\nline",,\n');
  assert.deepEqual(rows, [
    { a: 'x, y', b: 'say "hi"', c: '3' },
    { a: 'multi\nline', b: '', c: '' },
  ]);
});

test('site/checker_probes.csv (the download copy) is identical to data/checker_probes.csv', () => {
  const sitePath = fileURLToPath(new URL('../site/checker_probes.csv', import.meta.url));
  assert.equal(readFileSync(sitePath, 'utf8'), readFileSync(CSV_PATH, 'utf8'),
    'Copy data/checker_probes.csv to site/ again: cp data/checker_probes.csv site/');
});

// ---------------------------------------------------------------------------
// 1. Every probe in data/checker_probes.csv
// ---------------------------------------------------------------------------
const MESSAGE_TO_REASON = [
  ['age lower than the minimum', NOT_ELIGIBLE.AGE_BELOW_MINIMUM],
  ['age higher than maximum', NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM],
  ['age on maturity', NOT_ELIGIBLE.AGE_AT_MATURITY],
  ['existing debts', NOT_ELIGIBLE.DEBTS_TOO_HIGH],
];

function checkProbe(row) {
  const n = (k) => Number(row[k]);
  const shown = row.shown_eligible_amount;
  if (row.site === 'bajaj_finserv') {
    const pred = bajaj(n('monthly_income'), n('monthly_expense_or_existing_emi'));
    return { ok: shown !== '' && Math.abs(pred - Number(shown)) <= 1, pred };
  }
  if (row.site === 'paisabazaar') {
    const pred = paisabazaar(n('age'), n('desired_amount'), n('rate_pct'), n('tenure_years_chosen'),
      n('monthly_income'), n('monthly_expense_or_existing_emi'));
    if (shown === '') {
      const match = MESSAGE_TO_REASON.find(([text]) => row.shown_message.includes(text));
      return { ok: !!match && !pred.eligible && pred.reason === match[1], pred };
    }
    return { ok: pred.eligible && Math.abs(pred.amount - Number(shown)) <= 1, pred };
  }
  return { ok: false, pred: `unknown site ${row.site}` };
}

test('every probe in checker_probes.csv matches the rules (76 rows, 0 mismatches)', () => {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const checked = rows.filter((r) => r.probe_type !== 'limit');
  const mismatches = [];
  for (const row of checked) {
    const { ok, pred } = checkProbe(row);
    if (!ok) mismatches.push({ row, pred });
  }
  for (const { row, pred } of mismatches) {
    console.log('MISMATCH:', row.site, row.probe_type,
      'shown', row.shown_eligible_amount || row.shown_message, 'rule', JSON.stringify(pred));
  }
  console.log(`checked ${checked.length} probes, ${mismatches.length} mismatches (tolerance: ₹1)`);
  assert.equal(checked.length, 76);
  assert.equal(mismatches.length, 0);
});

// ---------------------------------------------------------------------------
// 2. The table in CLAUDE.md Section 4.3
// ---------------------------------------------------------------------------
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) <= 1, `${label}: got ${actual}, expected ${expected} (±1)`);

test('annuityFactor(10, 60) ≈ 47.0654', () => {
  assert.ok(Math.abs(annuityFactor(10, 60) - 47.0654) < 1e-4);
});

test('Section 4.3: Bajaj', () => {
  near(bajaj(40000, 10000), 400000, 'bajaj(40000, 10000)');
  near(bajaj(60000, 35000), 470654, 'bajaj(60000, 35000)');
  near(bajaj(100000, 75000), 0, 'bajaj(100000, 75000)');
});

test('Section 4.3: Paisabazaar eligible cases', () => {
  let r = paisabazaar(29, 2000000, 10, 5, 40000, 10000);
  assert.equal(r.eligible, true);
  near(r.amount, 564784, 'amount');
  assert.equal(r.years, 5);

  r = paisabazaar(29, 200000, 10, 3, 40000, 10000);
  assert.equal(r.eligible, true);
  near(r.amount, 200000, 'amount');
  near(r.emi, 6453, 'emi');
  assert.equal(r.numberOfEmis, 36);

  r = paisabazaar(26, 4000000, 12, 6, 120000, 30000);
  assert.equal(r.eligible, true);
  near(r.amount, 1618381, 'amount');
  assert.equal(r.years, 5, 'tenure capped at 5 years');

  r = paisabazaar(59, 2000000, 10, 5, 80000, 0);
  assert.equal(r.eligible, true);
  near(r.amount, 500478, 'amount');
  assert.equal(r.years, 1);

  r = paisabazaar(35, 2000000, 10, 5, 60000, 32999);
  assert.equal(r.eligible, true, 'still "eligible" at ₹47');
  near(r.amount, 47, 'amount');
});

test('Section 4.3: Paisabazaar not-eligible cases', () => {
  assert.deepEqual(paisabazaar(35, 2000000, 10, 5, 60000, 33000),
    { eligible: false, reason: NOT_ELIGIBLE.DEBTS_TOO_HIGH });
  assert.deepEqual(paisabazaar(60, 2000000, 10, 5, 80000, 0),
    { eligible: false, reason: NOT_ELIGIBLE.AGE_AT_MATURITY });
  assert.deepEqual(paisabazaar(61, 2000000, 10, 5, 80000, 0),
    { eligible: false, reason: NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM });
});

test('minimum age 21 (seen on the live site, 14 Nov 2026)', () => {
  for (const age of [18, 19, 20]) {
    assert.deepEqual(paisabazaar(age, 2000000, 10, 5, 40000, 10000),
      { eligible: false, reason: NOT_ELIGIBLE.AGE_BELOW_MINIMUM }, `age ${age}`);
  }
  near(paisabazaar(21, 2000000, 10, 5, 40000, 10000).amount, 564784, 'age 21');
  // The site checks age before debts: age 20 with ₹39,000 EMIs on ₹40,000 shows the age message.
  assert.equal(paisabazaar(20, 2000000, 10, 5, 40000, 39000).reason, NOT_ELIGIBLE.AGE_BELOW_MINIMUM);
  assert.equal(paisabazaar(21, 2000000, 10, 5, 40000, 39000).reason, NOT_ELIGIBLE.DEBTS_TOO_HIGH);
});

// ---------------------------------------------------------------------------
// 3. Range warnings
// ---------------------------------------------------------------------------
test('Bajaj range warnings', () => {
  assert.deepEqual(bajajRangeIssues(40000, 10000), []);
  assert.deepEqual(bajajRangeIssues(25000, 0), [], 'lower edge is allowed');
  assert.deepEqual(bajajRangeIssues(1000000, 1000000), [], 'upper edges are allowed');
  assert.deepEqual(bajajRangeIssues(20000, 0),
    [{ field: 'monthlyIncome', value: 20000, min: 25000, max: 1000000, onOutside: 'error' }]);
  assert.deepEqual(bajajRangeIssues(2000000, 0),
    [{ field: 'monthlyIncome', value: 2000000, min: 25000, max: 1000000, onOutside: 'error' }]);
  assert.deepEqual(bajajRangeIssues(40000, 1000001).map((i) => i.field), ['monthlyExpense']);
});

test('Bajaj range warnings fire on the two "limit" rows the site rejected', () => {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8')).filter((r) => r.probe_type === 'limit');
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const issues = bajajRangeIssues(Number(row.monthly_income), Number(row.monthly_expense_or_existing_emi));
    assert.deepEqual(issues.map((i) => i.field), ['monthlyIncome'], row.shown_message);
  }
});

test('Paisabazaar range warnings', () => {
  const defaults = { age: 29, desiredAmount: 2000000, ratePct: 10, tenureYears: 5, monthlyIncome: 40000, existingEmi: 10000 };
  assert.deepEqual(paisabazaarRangeIssues(defaults), []);
  const fields = (over) => paisabazaarRangeIssues({ ...defaults, ...over }).map((i) => i.field);
  assert.deepEqual(fields({ age: 17 }), ['age']);
  assert.deepEqual(fields({ age: 71 }), ['age']);
  assert.deepEqual(fields({ desiredAmount: 49999 }), ['desiredAmount']);
  assert.deepEqual(fields({ desiredAmount: 5000001 }), ['desiredAmount']);
  assert.deepEqual(fields({ ratePct: 7 }), ['ratePct']);
  assert.deepEqual(fields({ ratePct: 31 }), ['ratePct']);
  assert.deepEqual(fields({ tenureYears: 11 }), ['tenureYears']);
  assert.deepEqual(fields({ monthlyIncome: 19999 }), ['monthlyIncome']);
  assert.deepEqual(fields({ monthlyIncome: 1000001 }), ['monthlyIncome']);

  const emi = paisabazaarRangeIssues({ ...defaults, existingEmi: 50000 });
  assert.deepEqual(emi, [{ field: 'existingEmi', value: 50000, min: 0, max: 40000, onOutside: 'snap', typedHigherAccepted: true }]);
});

// ---------------------------------------------------------------------------
// 4. Live re-check of 14 Nov 2026 (data/live_check_2026-11-14.csv)
// ---------------------------------------------------------------------------
const LIVE_PATH = fileURLToPath(new URL('../data/live_check_2026-11-14.csv', import.meta.url));
const parseInputs = (s) => Object.fromEntries(s.split('; ').map((kv) => kv.split('=')).map(([k, v]) => [k, Number(v)]));
const rupees = (s) => Number(s.replace(/[^\d]/g, ''));

test('live re-check: rules.js agrees with every live observation (53 rows)', () => {
  const rows = parseCsv(readFileSync(LIVE_PATH, 'utf8'));
  let checked = 0;
  for (const row of rows) {
    const v = parseInputs(row.field_values_after);
    if (row.site === 'bajaj_finserv') {
      const issues = bajajRangeIssues(v.income, v.expense);
      if (/allowed value/.test(row.shown_on_site)) {
        assert.ok(issues.length > 0, `range notice expected for ${row.field_values_after}`);
      } else {
        assert.deepEqual(issues, [], row.field_values_after);
        const shown = rupees(row.shown_on_site.split('upto')[1]);
        near(bajaj(v.income, v.expense), shown, row.field_values_after);
      }
      checked++;
      continue;
    }
    const r = paisabazaar(v.age, v.desired, v.rate, v.tenure, v.income, v.existing_emi);
    const m = row.shown_on_site.match(/eligible for ₹([\d,]+); Estimated EMI ₹([\d,]+); Number of EMI (\d+); Eligible Tenure (\d+)/);
    if (m) {
      assert.equal(r.eligible, true, row.field_values_after);
      near(r.amount, rupees(m[1]), `amount ${row.field_values_after}`);
      near(r.emi, rupees(m[2]), `emi ${row.field_values_after}`);
      assert.equal(r.numberOfEmis, Number(m[3]));
      assert.equal(r.years, Number(m[4]));
    } else {
      const msg = row.shown_on_site
        .replace('age is higher than the maximum age allowed', 'age higher than maximum')
        .replace('age is lower than the minimum age required', 'age lower than the minimum')
        .replace('maximum permissible age on maturity', 'age on maturity');
      const match = MESSAGE_TO_REASON.find(([text]) => msg.includes(text));
      assert.ok(match, `unrecognised message: ${row.shown_on_site}`);
      assert.deepEqual(r, { eligible: false, reason: match[1] }, row.field_values_after);
    }
    checked++;
  }
  console.log(`live re-check: ${checked} of ${rows.length} observations agree`);
  assert.equal(rows.length, 53);
  assert.equal(checked, rows.length);
});

// ---------------------------------------------------------------------------
// 5. Explanations and input snapping used by the page
// ---------------------------------------------------------------------------
test('snapPaisabazaarInputs reproduces what the live site did to every typed value', () => {
  const rows = parseCsv(readFileSync(LIVE_PATH, 'utf8')).filter((r) => r.site === 'paisabazaar');
  const toInput = (v) => ({ age: v.age, desiredAmount: v.desired, ratePct: v.rate, tenureYears: v.tenure,
    monthlyIncome: v.income, existingEmi: v.existing_emi });
  for (const row of rows) {
    const { values } = snapPaisabazaarInputs(toInput(parseInputs(row.typed)));
    assert.deepEqual(values, toInput(parseInputs(row.field_values_after)), row.typed);
  }
  const { kept } = snapPaisabazaarInputs({ age: 35, desiredAmount: 2000000, ratePct: 10, tenureYears: 5,
    monthlyIncome: 100000, existingEmi: 45000 });
  assert.deepEqual(kept, [{ field: 'existingEmi', value: 45000, max: 40000 }]);
});

test('details give the same amount as the rules, on every probe', () => {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8')).filter((r) => r.probe_type !== 'limit');
  for (const row of rows) {
    const n = (k) => Number(row[k]);
    if (row.site === 'bajaj_finserv') {
      const d = bajajDetails(n('monthly_income'), n('monthly_expense_or_existing_emi'));
      assert.equal(d.amount, bajaj(n('monthly_income'), n('monthly_expense_or_existing_emi')));
      const shown = { 'income cap': d.incomeCap, instalment: d.byInstalment, 'no room': 0 }[d.limitedBy];
      near(shown, d.amount, `bajaj ${row.monthly_income}/${row.monthly_expense_or_existing_emi} limitedBy`);
    } else {
      const args = ['age', 'desired_amount', 'rate_pct', 'tenure_years_chosen', 'monthly_income',
        'monthly_expense_or_existing_emi'].map(n);
      const d = paisabazaarDetails(...args);
      assert.deepEqual({ eligible: d.eligible, amount: d.amount, reason: d.reason },
        (({ eligible, amount, reason }) => ({ eligible, amount, reason }))(paisabazaar(...args)));
      if (d.eligible) {
        const shown = { desired: d.desired, 'income cap': d.incomeCap, instalment: d.byInstalment }[d.limitedBy];
        near(shown, d.amount, `paisabazaar ${args.join('/')} limitedBy`);
      }
    }
  }
  assert.equal(paisabazaarDetails(26, 4000000, 12, 6, 120000, 30000).tenureLimitedBy, '5-year cap');
  assert.equal(paisabazaarDetails(59, 2000000, 10, 5, 80000, 0).tenureLimitedBy, 'age 60');
  assert.equal(paisabazaarDetails(29, 2000000, 10, 5, 40000, 10000).tenureLimitedBy, null);
  assert.equal(bajajDetails(40000, 10000).limitedBy, 'income cap');
  assert.equal(bajajDetails(60000, 35000).limitedBy, 'instalment');
  assert.equal(bajajDetails(100000, 75000).limitedBy, 'no room');
});
