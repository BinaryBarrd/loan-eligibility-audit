// Every probe the audit extension logged (data/audit/<site>.csv, copied from loan_audit/data/probes),
// checked against the JavaScript port of each rule in site/rules.js. Same logic as loan_audit/audit/verify.py:
// corrections applied (~fix replaces, ~void withdraws, ~err skipped); a shown amount must match within ₹1;
// a message must contain the expected text; Aditya Birla's greyed-out stale results are "not comparable".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';
import * as R from '../site/rules.js';

const load = (site) => parseCsv(readFileSync(fileURLToPath(new URL(`../data/audit/${site}.csv`, import.meta.url)), 'utf8'));

export function effective(rows) {
  const fixes = new Map(); const voided = new Set();
  for (const r of rows) {
    if (r.probe_id.includes('~fix')) fixes.set(r.probe_id.split('~fix')[0], r);
    if (r.probe_id.includes('~void')) voided.add(r.probe_id.split('~void')[0]);
  }
  return rows
    .filter((r) => !/~(err|fix|void)/.test(r.probe_id) && !voided.has(r.probe_id))
    .map((r) => (fixes.has(r.probe_id) ? { ...fixes.get(r.probe_id), probe_id: r.probe_id } : r))
    .map((r) => ({ ...r, inputs: r.inputs_json ? JSON.parse(r.inputs_json) : {} }));
}

const shownAmount = (r) => { const d = (r.shown_amount || '').replace(/[^\d.]/g, ''); return d ? Number(d) : null; };

// Each returns { amount } | { messageHas } | { hidden } | { notComparable } | { rejected }
const PREDICT = {
  bajaj_finserv: (i) => (R.bajajRangeIssues(i.monthly_income, i.monthly_expense).some((x) => x.field === 'monthlyIncome')
    ? { rejected: true, messageHas: 'allowed value' } : { shown: 'amount', amount: R.bajaj(i.monthly_income, i.monthly_expense) }),
  kotak: (i) => R.kotak(i.monthly_income, i.existing_emi),
  idfc_first: (i) => R.idfcFirst({ monthlyIncome: i.monthly_income, otherIncome: i.other_income, rent: i.rent,
    sipInvestments: i.sip_investments, utilitiesOtherExpenses: i.utilities_other_expenses, existingEmi: i.existing_emi, tenureMonths: i.tenure_months }),
  smfg: (i) => (i.employment === 'self_employed'
    ? R.smfgSelfEmployed(i.yearly_profit, i.existing_emi, i.rate_pct, i.tenure_months)
    : R.smfg(i.monthly_income, i.existing_emi, i.rate_pct, i.tenure_months)),
  axis: (i) => R.axis(i.monthly_income, i.monthly_expense),
  fibe: (i) => R.fibe(i.monthly_income, i.monthly_expense),
  poonawalla: (i) => R.poonawalla(i.monthly_income, i.existing_emi, i.tenure_months),
  aditya_birla: (i) => R.adityaBirla({ emiAffordable: i.emi_affordable ?? 0, monthlyIncome: i.monthly_income, variableIncome: i.variable_income,
    monthlyExpense: i.monthly_expense, tenureYears: i.tenure_years, ratePct: i.rate_pct }),
};
const MESSAGE_KEY = { smfg: 'less than your expenses', aditya_birla: 'we will not be able to help you' };

function check(site, row) {
  const p = PREDICT[site](row.inputs);
  const shown = shownAmount(row);
  if (p.shown === 'stale') return 'not comparable';
  if (p.rejected) return shown === null && row.shown_message.toLowerCase().includes(p.messageHas) ? 'ok' : 'miss';
  if (p.shown === 'amount') return shown !== null && Math.abs(shown - p.amount) <= 1 ? 'ok' : 'miss';
  if (p.shown === 'hidden') return shown === null ? 'ok' : 'miss';
  if (p.shown === 'message') return shown === null && row.shown_message.toLowerCase().includes(MESSAGE_KEY[site]) ? 'ok' : 'miss';
  return 'miss';
}

const EXPECTED_COMPARABLE = {};
let total = 0; let notComparable = 0;
for (const site of Object.keys(PREDICT)) {
  test(`${site}: every logged probe matches the ported rule`, () => {
    const rows = effective(load(site));
    const misses = [];
    let ok = 0;
    for (const r of rows) {
      const res = check(site, r);
      if (res === 'not comparable') { notComparable++; continue; }
      if (res === 'ok') ok++; else misses.push(`${r.probe_id} inputs=${r.inputs_json} shown=${r.shown_amount} pred=${JSON.stringify(PREDICT[site](r.inputs))}`);
    }
    total += ok;
    EXPECTED_COMPARABLE[site] = ok;
    assert.ok(rows.length >= 100, `${site}: only ${rows.length} probes`);
    assert.deepEqual(misses.slice(0, 5), [], `${site}: ${misses.length} misses`);
  });
}
test('totals agree with loan_audit/reports/verification.md: 1,512 analysed = 1,472 matched + 40 not comparable', () => {
  assert.equal(total, 1472);
  assert.equal(notComparable, 40);
});
