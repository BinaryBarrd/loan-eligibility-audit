// The two calculator rules, ported from reference/rules.py (the source of truth).
// Pure functions only: no DOM, no network. Used by app.js and by tests/rules.test.js.
//
// Tested on the live sites on 14 November 2026.

/** How much loan a monthly instalment of ₹1 can repay, at a yearly rate over a number of months. */
export function annuityFactor(annualRatePct, months) {
  const r = annualRatePct / 1200;
  return (1 - (1 + r) ** -months) / r;
}

/** Round to 6 decimals (same as Python's round(x, 6)); removes float noise such as 0.55 * 60000. */
function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// Bajaj Finserv
// ---------------------------------------------------------------------------

/** Fixed assumptions of the Bajaj calculator (it has no rate or tenure inputs). */
export const BAJAJ_ASSUMPTIONS = Object.freeze({
  ratePct: 10,          // lowest of the "10% and 30.5% p.a." range on the same page
  advertisedMaxRatePct: 30.5, // page text, checked live 14 Nov 2026: "Interest rates range from 10% and 30.5% p.a."
  months: 60,
  shareOfIncome: 0.75,  // EMIs plus expenses
  incomeMultipleCap: 10,
});

/**
 * Bajaj Finserv personal-loan eligibility calculator.
 * eligible = min(10 × income, annuityFactor(10%, 60) × (0.75 × income − expense)), never below 0.
 */
export function bajaj(monthlyIncome, monthlyExpense) {
  const a = BAJAJ_ASSUMPTIONS;
  const room = a.shareOfIncome * monthlyIncome - monthlyExpense;
  const amount = Math.min(a.incomeMultipleCap * monthlyIncome, annuityFactor(a.ratePct, a.months) * room);
  return Math.max(0, Math.round(amount));
}

/**
 * Input ranges the Bajaj page accepts (checked live, 14 Nov 2026).
 * Outside them the site shows an error under the field and NO amount (onOutside: 'error').
 * Edges (₹25,000, ₹10,00,000) are accepted.
 */
export const BAJAJ_LIMITS = Object.freeze({
  monthlyIncome: {
    min: 25000, max: 1000000, onOutside: 'error',
    siteMessageBelow: 'Minimum allowed value is ₹25,000',
    siteMessageAbove: 'Maximum allowed value is ₹10 Lakhs',
  },
  monthlyExpense: {
    min: 0, max: 1000000, onOutside: 'error',
    siteMessageAbove: 'Maximum allowed value is ₹10 Lakhs',
  },
});

/**
 * Which inputs are outside what the Bajaj page accepts.
 * Returns a list like [{ field, value, min, max, onOutside }]; empty when everything is in range.
 * Any issue here means the site shows an error and no amount.
 */
export function bajajRangeIssues(monthlyIncome, monthlyExpense) {
  return rangeIssues(BAJAJ_LIMITS, { monthlyIncome, monthlyExpense });
}

// ---------------------------------------------------------------------------
// Paisabazaar
// ---------------------------------------------------------------------------

/** Fixed assumptions of the Paisabazaar calculator. */
export const PAISABAZAAR_ASSUMPTIONS = Object.freeze({
  shareOfIncome: 0.55,  // EMIs only
  incomeMultipleCap: 24,
  maxTenureYears: 5,    // the slider goes to 10
  maxAgeAtEnd: 60,
  minAge: 21,           // the age slider starts at 18; found in the live re-check of 14 Nov 2026
});

/** Reason codes for a not-eligible result (wording on the page is chosen in app.js). */
export const NOT_ELIGIBLE = Object.freeze({
  AGE_BELOW_MINIMUM: 'age below minimum',
  AGE_ABOVE_MAXIMUM: 'age above maximum',
  AGE_AT_MATURITY: 'age at maturity',
  DEBTS_TOO_HIGH: 'existing debts too high',
});

/**
 * Paisabazaar personal-loan eligibility calculator.
 * eligible = min(desired, 24 × income, annuityFactor(rate, years) × (0.55 × income − existing EMI))
 * with years = min(chosen tenure, 5, 60 − age). Not eligible below age 21 or above 60.
 *
 * Returns either
 *   { eligible: true, amount, years, emi, numberOfEmis }
 * or
 *   { eligible: false, reason }   (reason is one of NOT_ELIGIBLE)
 */
export function paisabazaar(age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi) {
  const a = PAISABAZAAR_ASSUMPTIONS;
  if (age < a.minAge) return { eligible: false, reason: NOT_ELIGIBLE.AGE_BELOW_MINIMUM };
  if (age > a.maxAgeAtEnd) return { eligible: false, reason: NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM };
  const years = Math.min(tenureYears, a.maxTenureYears, a.maxAgeAtEnd - age);
  if (years <= 0) return { eligible: false, reason: NOT_ELIGIBLE.AGE_AT_MATURITY };
  const room = round6(a.shareOfIncome * monthlyIncome - existingEmi);
  if (room <= 0) return { eligible: false, reason: NOT_ELIGIBLE.DEBTS_TOO_HIGH };
  const factor = annuityFactor(ratePct, years * 12);
  const amount = Math.min(desiredAmount, a.incomeMultipleCap * monthlyIncome, factor * room);
  return {
    eligible: true,
    amount: Math.max(0, Math.round(amount)),
    years,
    emi: Math.round(amount / factor),
    numberOfEmis: years * 12,
  };
}

/**
 * Slider ranges on the Paisabazaar page (checked live, 14 Nov 2026).
 * A typed value outside a slider is changed to the nearest slider end, and the result is
 * calculated with that end value (onOutside: 'snap').
 * existingEmi: the slider stops at 40,000, but typed values above it are kept and used
 * (₹45,000 and ₹90,000 tried). A value above the monthly income was changed to equal the income.
 */
export const PAISABAZAAR_LIMITS = Object.freeze({
  age: { min: 18, max: 70, onOutside: 'snap' },
  desiredAmount: { min: 50000, max: 5000000, onOutside: 'snap' },
  ratePct: { min: 8, max: 30, onOutside: 'snap' },
  tenureYears: { min: 1, max: 10, onOutside: 'snap' },
  monthlyIncome: { min: 20000, max: 1000000, onOutside: 'snap' },
  existingEmi: { min: 0, max: 40000, onOutside: 'snap', typedHigherAccepted: true },
});

/**
 * Which inputs are outside the Paisabazaar slider ranges.
 * Returns a list like [{ field, value, min, max, onOutside, typedHigherAccepted? }]; empty when all in range.
 */
export function paisabazaarRangeIssues({ age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi }) {
  return rangeIssues(PAISABAZAAR_LIMITS, { age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi });
}

// ---------------------------------------------------------------------------

function rangeIssues(limits, values) {
  const issues = [];
  for (const [field, limit] of Object.entries(limits)) {
    const value = values[field];
    if (value < limit.min || value > limit.max) {
      const issue = { field, value, min: limit.min, max: limit.max, onOutside: limit.onOutside };
      if (limit.typedHigherAccepted && value > limit.max) issue.typedHigherAccepted = true;
      issues.push(issue);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Explanations and site input behaviour (used by the page to say *why* a number appears).
// These only re-use the rules above; they never change a result.
// ---------------------------------------------------------------------------

/**
 * The steps behind a Bajaj result.
 * limitedBy: 'income cap' | 'instalment' | 'no room'
 */
export function bajajDetails(monthlyIncome, monthlyExpense) {
  const a = BAJAJ_ASSUMPTIONS;
  const share = a.shareOfIncome * monthlyIncome;
  const room = share - monthlyExpense;
  const byInstalment = annuityFactor(a.ratePct, a.months) * room;
  const incomeCap = a.incomeMultipleCap * monthlyIncome;
  const amount = bajaj(monthlyIncome, monthlyExpense);
  let limitedBy;
  if (room <= 0) limitedBy = 'no room';
  else if (incomeCap <= byInstalment) limitedBy = 'income cap';
  else limitedBy = 'instalment';
  return {
    amount,
    share: Math.round(share),
    room: Math.round(room),
    byInstalment: Math.max(0, Math.round(byInstalment)),
    incomeCap,
    limitedBy,
  };
}

/**
 * The steps behind a Paisabazaar result: the rule's result plus
 *   share, room           – 55% of income, and what is left after existing EMIs
 *   chosenYears, years    – tenure picked vs tenure used
 *   tenureLimitedBy       – null | '5-year cap' | 'age 60'
 *   byInstalment, incomeCap, desired, limitedBy ('desired' | 'income cap' | 'instalment')
 */
export function paisabazaarDetails(age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi) {
  const a = PAISABAZAAR_ASSUMPTIONS;
  const result = paisabazaar(age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi);
  const share = a.shareOfIncome * monthlyIncome;
  const details = {
    ...result,
    share: Math.round(share),
    room: Math.round(share - existingEmi),
    chosenYears: tenureYears,
  };
  if (!result.eligible) return details;
  let tenureLimitedBy = null;
  if (result.years < tenureYears) {
    tenureLimitedBy = a.maxAgeAtEnd - age < Math.min(tenureYears, a.maxTenureYears) ? 'age 60' : '5-year cap';
  }
  const byInstalment = Math.round(annuityFactor(ratePct, result.years * 12) * round6(share - existingEmi));
  const incomeCap = a.incomeMultipleCap * monthlyIncome;
  const smallest = Math.min(desiredAmount, incomeCap, byInstalment);
  const limitedBy = smallest === byInstalment ? 'instalment' : smallest === incomeCap ? 'income cap' : 'desired';
  return { ...details, tenureLimitedBy, byInstalment, incomeCap, desired: desiredAmount, limitedBy };
}

/**
 * What the Paisabazaar page does with typed values (checked live, 14 Nov 2026):
 * - outside a slider → changed to the nearest slider end;
 * - existing EMI above the slider's ₹40,000 → kept;
 * - existing EMI above the monthly income → changed to the monthly income.
 * Returns { values, changes: [{ field, from, to, why }], kept: [{ field, value, max }] }
 * where why is 'below slider' | 'above slider' | 'above income'.
 */
export function snapPaisabazaarInputs(input) {
  const values = { ...input };
  const changes = [];
  const kept = [];
  for (const [field, limit] of Object.entries(PAISABAZAAR_LIMITS)) {
    const v = values[field];
    if (v < limit.min) {
      changes.push({ field, from: v, to: limit.min, why: 'below slider' });
      values[field] = limit.min;
    } else if (v > limit.max) {
      if (limit.typedHigherAccepted) {
        kept.push({ field, value: v, max: limit.max });
      } else {
        changes.push({ field, from: v, to: limit.max, why: 'above slider' });
        values[field] = limit.max;
      }
    }
  }
  if (values.existingEmi > values.monthlyIncome) {
    changes.push({ field: 'existingEmi', from: values.existingEmi, to: values.monthlyIncome, why: 'above income' });
    const i = kept.findIndex((k) => k.field === 'existingEmi');
    if (i >= 0) kept.splice(i, 1);
    values.existingEmi = values.monthlyIncome;
  }
  return { values, changes, kept };
}
