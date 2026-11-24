// The study's calculation engine. SERVER ONLY: it runs inside the Vercel function, never in the browser.
// One person's details go into all nine calculators, using the website's tested rules (rules.js,
// copied from site/rules.js) and the same input mapping as the website's Compare page (site/people.js).
// Results are returned under the neutral names "Lender 1" to "Lender 9", with neutral wording only.
import * as R from './rules.js';
import { LENDER_RULES } from './lenders.js';

const rs = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const orList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// What the study's own form accepts (screen 3). Anything else is refused with a plain message.
// ---------------------------------------------------------------------------
export const FORM = Object.freeze({
  age: { min: 18, max: 99, integer: true, label: 'Age' },
  income: { min: 0, max: 100000000, integer: true, label: 'Monthly income' },
  emis: { min: 0, max: 100000000, integer: true, label: 'Monthly EMIs you already pay' },
  other: { min: 0, max: 100000000, integer: true, label: 'Other monthly expenses' },
  wanted: { min: 1, max: 100000000, integer: true, label: 'Loan amount you want' },
  years: { min: 1, max: 10, integer: true, label: 'Tenure in years' },
  rate: { min: 1, max: 40, integer: false, label: 'Yearly interest rate' },
});
export const EMPLOYMENT = Object.freeze(['salaried', 'self']);

/** Checks the form values. Returns { values, errors }; errors is a list of plain sentences. */
export function validate(body) {
  const errors = [];
  const values = {};
  if (!body || typeof body !== 'object') return { values, errors: ['No values were sent.'] };
  for (const [key, f] of Object.entries(FORM)) {
    const v = body[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${f.label} is missing.`); continue; }
    if (f.integer && !Number.isInteger(v)) { errors.push(`${f.label} must be a whole number.`); continue; }
    if (v < f.min || v > f.max) { errors.push(`${f.label} must be between ${f.min} and ${f.max}.`); continue; }
    values[key] = f.integer ? v : Math.round(v * 100) / 100;
  }
  values.employment = EMPLOYMENT.includes(body.employment) ? body.employment : 'salaried';
  return { values, errors };
}

// ---------------------------------------------------------------------------
// Neutral wording shared by all lenders
// ---------------------------------------------------------------------------
const outside = (what, min, max) => `This lender’s calculator only accepts ${what} from ${rs(min)} to ${rs(max)}, so it shows no amount.`;
const moved = (what, to, unit) => `Your ${what} was changed to ${unit(to)}, the nearest this lender’s calculator allows.`;
const yearsUnit = (n) => plural(n, 'year');
const monthsUnit = (n) => plural(n, 'month');
const pctUnit = (n) => `${n}%`;
const NO_CREDIT_SCORE = 'Does not use a credit score.';

const amount = (n) => ({ shown: 'amount', amount: n, reason: null });
const none = (reason) => ({ shown: 'none', amount: null, reason });

/** Clamp a chosen value into a calculator's range, noting the change. */
function fit(value, min, max, what, unit, adjusted) {
  const to = Math.min(max, Math.max(min, value));
  if (to !== value) adjusted.push(moved(what, to, unit));
  return to;
}

/** First money field outside its range, as a neutral reason; or null. */
function firstOutside(checks) {
  for (const [what, value, lim] of checks) if (value < lim.min || value > lim.max) return outside(what, lim.min, lim.max);
  return null;
}

// ---------------------------------------------------------------------------
// The nine calculators. Each returns { shown, amount, reason, rate, adjusted, assumptions }.
// rate: { kind: 'yours', pct } | { kind: 'fixed', pct } | { kind: 'none' }
// ---------------------------------------------------------------------------
const CALCULATORS = {
  bajaj_finserv(x) {
    const A = R.BAJAJ_ASSUMPTIONS;
    const L = R.BAJAJ_LIMITS;
    const exp = x.emis + x.other;
    const out = firstOutside([['monthly income', x.income, L.monthlyIncome], ['EMIs plus other expenses', exp, L.monthlyExpense]]);
    return {
      ...(out ? none(out) : amount(R.bajaj(x.income, exp))),
      rate: { kind: 'fixed', pct: A.ratePct },
      adjusted: [],
      assumptions: [
        `Assumes ${A.ratePct}% a year over ${yearsUnit(A.months / 12)}, whatever rate or tenure you chose.`,
        `Allows up to ${pct(A.shareOfIncome)} of your income for EMIs and other expenses together.`,
        `Never more than ${A.incomeMultipleCap} × your monthly income.`,
      ],
    };
  },

  paisabazaar(x) {
    const A = R.PAISABAZAAR_ASSUMPTIONS;
    const typed = { age: x.age, desiredAmount: x.wanted, ratePct: x.rate, tenureYears: x.years, monthlyIncome: x.income, existingEmi: x.emis };
    const { values: s, changes } = R.snapPaisabazaarInputs(typed);
    const WHAT = { age: ['age', yearsUnit], desiredAmount: ['loan amount', rs], ratePct: ['interest rate', pctUnit], tenureYears: ['tenure', yearsUnit], monthlyIncome: ['monthly income', rs], existingEmi: ['monthly EMIs', rs] };
    const adjusted = changes.map((c) => moved(WHAT[c.field][0], c.to, WHAT[c.field][1]));
    const r = R.paisabazaar(s.age, s.desiredAmount, s.ratePct, s.tenureYears, s.monthlyIncome, s.existingEmi);
    const REASON = {
      [R.NOT_ELIGIBLE.AGE_BELOW_MINIMUM]: `Your age is below this lender’s minimum of ${A.minAge}.`,
      [R.NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM]: `Your age is above this lender’s maximum of ${A.maxAgeAtEnd}.`,
      [R.NOT_ELIGIBLE.AGE_AT_MATURITY]: `The loan would have to end by age ${A.maxAgeAtEnd}, which leaves no time to repay.`,
      [R.NOT_ELIGIBLE.DEBTS_TOO_HIGH]: 'Your existing EMIs are too high for your income.',
    };
    if (r.eligible && r.years < s.tenureYears) adjusted.push(`It used ${yearsUnit(r.years)} instead of the ${yearsUnit(s.tenureYears)} you chose.`);
    return {
      ...(r.eligible ? amount(r.amount) : none(REASON[r.reason])),
      rate: { kind: 'yours', pct: s.ratePct },
      adjusted,
      assumptions: [
        'Uses the interest rate you chose.',
        `Uses at most ${yearsUnit(A.maxTenureYears)}, even if you choose more, and the loan must end by age ${A.maxAgeAtEnd}.`,
        `Gives no amount under age ${A.minAge}.`,
        `Allows ${pct(A.shareOfIncome)} of your income for EMIs, and ignores your other expenses.`,
        `Never more than ${A.incomeMultipleCap} × your monthly income, or the amount you want.`,
      ],
    };
  },

  kotak(x) {
    const K = R.KOTAK;
    const out = firstOutside([['monthly income', x.income, K.limits.monthlyIncome], ['monthly EMIs', x.emis, K.limits.existingEmi]]);
    return {
      ...(out ? none(out) : amount(R.kotak(x.income, x.emis).amount)),
      rate: { kind: 'none' },
      adjusted: [],
      assumptions: [
        'No interest rate and no tenure enter the amount.',
        `The amount is ${K.incomeMultiple} × (your income minus your EMIs).`,
        'Ignores your other expenses.',
      ],
    };
  },

  idfc_first(x) {
    const I = R.IDFC;
    const adjusted = [];
    const tenureMonths = fit(x.years * 12, I.limits.tenureMonths.min, I.limits.tenureMonths.max, 'tenure', monthsUnit, adjusted);
    const out = firstOutside([['monthly income', x.income, I.limits.money], ['monthly EMIs', x.emis, I.limits.money], ['other monthly expenses', x.other, I.limits.money]]);
    const r = R.idfcFirst({ monthlyIncome: x.income, otherIncome: 0, rent: 0, sipInvestments: 0, utilitiesOtherExpenses: x.other, existingEmi: x.emis, tenureMonths });
    return {
      ...(out ? none(out) : amount(r.amount)),
      rate: { kind: 'fixed', pct: I.ratePct },
      adjusted,
      assumptions: [
        `Assumes ${I.ratePct}% a year over your tenure, whatever rate you chose.`,
        `Allows ${pct(I.share)} of what is left after expenses and EMIs, then takes your EMIs off a second time.`,
        `Never more than ${rs(I.cap)}.`,
      ],
    };
  },

  smfg(x) {
    const S = R.SMFG;
    const self = x.employment === 'self';
    const adjusted = [];
    const ratePct = fit(x.rate, S.limits.ratePct.min, S.limits.ratePct.max, 'interest rate', pctUnit, adjusted);
    const tLim = self ? S.limits.selfTenureMonths : S.limits.tenureMonths;
    const tenureMonths = fit(x.years * 12, tLim.min, tLim.max, 'tenure', monthsUnit, adjusted);
    const profit = x.income * 12;
    const out = self
      ? firstOutside([['yearly profit (12 × monthly income)', profit, { min: 0, max: 100000000 }], ['monthly EMIs', x.emis, S.limits.existingEmi]])
      : firstOutside([['monthly income', x.income, S.limits.monthlyIncome], ['monthly EMIs', x.emis, S.limits.existingEmi]]);
    let result;
    if (out) result = none(out);
    else {
      const r = self ? R.smfgSelfEmployed(profit, x.emis, ratePct, tenureMonths) : R.smfg(x.income, x.emis, ratePct, tenureMonths);
      result = r.shown === 'amount' ? amount(r.amount) : none(`Your EMIs are at or above your ${self ? 'monthly profit' : 'income'}.`);
    }
    return {
      ...result,
      rate: { kind: 'yours', pct: ratePct },
      adjusted,
      assumptions: [
        `Uses the interest rate and tenure you chose, within ${S.limits.ratePct.min}% to ${S.limits.ratePct.max}% and ${tLim.min} to ${tLim.max} months.`,
        `Allows ${pct(S.salariedShare)} of your income after EMIs (self-employed: ${pct(S.selfEmployedShare)} of monthly profit after EMIs).`,
        'Ignores your other expenses.',
        'Has no upper limit on the amount.',
      ],
    };
  },

  axis(x) {
    const X = R.AXIS;
    const exp = x.emis + x.other;
    const out = firstOutside([['monthly income', x.income, X.limits.monthlyIncome], ['EMIs plus other expenses', exp, X.limits.monthlyExpense]]);
    return {
      ...(out ? none(out) : amount(R.axis(x.income, exp).amount)),
      rate: { kind: 'none' },
      adjusted: [],
      assumptions: [
        'No interest rate and no tenure enter the amount.',
        `${X.highMultiple} × your income if your EMIs and expenses are up to about ${pct(X.band1)} of income, ${X.lowMultiple} × if up to about ${pct(X.band2)}, otherwise nothing.`,
        `Never more than ${rs(X.cap)}.`,
      ],
    };
  },

  fibe(x) {
    const F = R.FIBE;
    const exp = x.emis + x.other;
    const out = firstOutside([['monthly income', x.income, F.limits.monthlyIncome], ['EMIs plus other expenses', exp, F.limits.monthlyExpense]]);
    let result;
    if (out) result = none(out);
    else {
      const r = R.fibe(x.income, exp);
      result = r.shown === 'amount' ? amount(r.amount) : none('Your EMIs and other expenses are above your income.');
    }
    const tierMonths = F.tiers.map((t) => t.months);
    return {
      ...result,
      rate: { kind: 'fixed', pct: F.ratePct },
      adjusted: [],
      assumptions: [
        `Assumes ${F.ratePct}% a year, whatever rate you chose.`,
        `Sets the tenure from your income (${Math.min(...tierMonths)} to ${Math.max(...tierMonths)} months), not from your choice.`,
        `Allows the smaller of ${pct(F.emiShare)} of your income, or ${pct(F.affordShare)} of your income minus your EMIs and expenses.`,
        `Never more than ${rs(F.cap)}.`,
      ],
    };
  },

  poonawalla(x) {
    const P = R.POONAWALLA;
    const adjusted = [];
    const tenureMonths = fit(x.years * 12, P.limits.tenureMonths.min, P.limits.tenureMonths.max, 'tenure', monthsUnit, adjusted);
    const out = firstOutside([['monthly income', x.income, P.limits.monthlyIncome], ['monthly EMIs', x.emis, P.limits.existingEmi]]);
    let result;
    if (out) result = none(out);
    else {
      const r = R.poonawalla(x.income, x.emis, tenureMonths);
      result = r.shown === 'amount' ? amount(r.amount) : none(`The amount would be below about ${rs(P.minShown)}, so it shows none.`);
    }
    return {
      ...result,
      rate: { kind: 'fixed', pct: P.ratePct },
      adjusted,
      assumptions: [
        `Assumes ${P.ratePct}% a year over your tenure, whatever rate you chose.`,
        `Allows ${orList(P.bands.map((b) => pct(b.share)))} of your income for EMIs, rising with income.`,
        'Ignores your other expenses.',
        `Never more than ${rs(P.cap)}, and shows nothing below about ${rs(P.minShown)}.`,
      ],
    };
  },

  aditya_birla(x) {
    const B = R.BIRLA;
    const adjusted = [];
    const tenureYears = fit(x.years, B.limits.tenureYears.min, B.limits.tenureYears.max, 'tenure', yearsUnit, adjusted);
    const ratePct = fit(x.rate, B.limits.ratePct.min, B.limits.ratePct.max, 'interest rate', pctUnit, adjusted);
    const exp = x.emis + x.other;
    const out = firstOutside([['monthly income', x.income, B.limits.monthlyIncome], ['EMIs plus other expenses', exp, B.limits.monthlyExpense]]);
    let result;
    if (out) result = none(out);
    else {
      const r = R.adityaBirla({ emiAffordable: B.limits.emiAffordable.min, monthlyIncome: x.income, variableIncome: 0, monthlyExpense: exp, tenureYears, ratePct });
      if (r.shown === 'amount') result = amount(r.amount);
      else if (r.shown === 'message') result = none(`The amount would be below about ${rs(B.minShown)}, so it shows none.`);
      else result = none('Your EMIs and other expenses leave too little of your income.');
    }
    const k = Object.values(B.multipliers);
    return {
      ...result,
      rate: { kind: 'yours', pct: ratePct },
      adjusted,
      assumptions: [
        `Uses the interest rate you chose (${B.limits.ratePct.min}% to ${B.limits.ratePct.max}%), but it only matters when the second limit below is the smaller one.`,
        `First limit: ${k[0]} × to ${k[k.length - 1]} × your income minus expenses, growing with tenure.`,
        `Second limit: what ${orList(B.bands.map((b) => pct(b.share)))} of your income minus expenses repays, rising with income.`,
        `Never more than ${rs(B.cap)}, and shows nothing below about ${rs(B.minShown)}.`,
      ],
    };
  },
};

/** Results for all nine lenders, in lender order 1 to 9. x must have passed validate(). */
export function computeAll(x) {
  return Object.entries(LENDER_RULES).map(([n, ruleId]) => {
    const r = CALCULATORS[ruleId](x);
    return { lender: Number(n), ...r, assumptions: [...r.assumptions, NO_CREDIT_SCORE] };
  });
}

/** Fisher–Yates shuffle with a supplied random-integer function (crypto.randomInt on the server). */
export function shuffled(list, randomInt) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
