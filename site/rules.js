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

// ===========================================================================
// Seven more calculators, from the audit extension (tested 18–19 November 2026).
// Ported from loan_audit/rules/*.py (the source of truth for these). Every rule below
// reproduced every comparable probe within ₹1, including held-out probes.
// Each function returns one of
//   { shown: 'amount', amount }                       the page shows an amount
//   { shown: 'message', message }                     the page shows a message instead
//   { shown: 'hidden' }                               the result disappears, with no message
//   { shown: 'stale' }                                a warning, and an OLD amount stays greyed out
// ===========================================================================

const amountResult = (amount) => ({ shown: 'amount', amount: Math.max(0, Math.round(amount)) });

// --- Kotak Mahindra Bank ----------------------------------------------------
export const KOTAK = Object.freeze({
  incomeMultiple: 20,
  emiDisplayRatePct: 8.5,          // rate behind the "Monthly EMI" shown next to the amount
  limits: { monthlyIncome: { min: 20000, max: 500000 }, existingEmi: { min: 0, max: 200000 }, tenureMonths: { min: 1, max: 200 } },
});
/** eligible = max(0, 20 × (income − existing EMIs)); the tenure slider has no effect. */
export function kotak(monthlyIncome, existingEmi) {
  return amountResult(KOTAK.incomeMultiple * (monthlyIncome - existingEmi));
}
/** The EMI Kotak shows next to the amount: the amount repaid at 8.5% over the slider tenure (months), rounded down. */
export function kotakEmi(amount, tenureMonths) {
  return Math.floor(amount / annuityFactor(KOTAK.emiDisplayRatePct, tenureMonths));
}

// --- IDFC FIRST Bank --------------------------------------------------------
export const IDFC = Object.freeze({
  ratePct: 9.99,
  share: 0.7,
  cap: 1500000,
  limits: { money: { min: 0, max: 10000000 }, tenureMonths: { min: 6, max: 60 } },
});
/**
 * room   = 0.7 × (income + other income − rent − SIPs − utilities − EMIs) − EMIs
 * amount = min(15,00,000, annuityFactor(9.99%, tenure) × room), never below 0
 */
export function idfcFirst({ monthlyIncome, otherIncome, rent, sipInvestments, utilitiesOtherExpenses, existingEmi, tenureMonths }) {
  const room = IDFC.share * (monthlyIncome + otherIncome - rent - sipInvestments - utilitiesOtherExpenses - existingEmi) - existingEmi;
  return amountResult(Math.min(IDFC.cap, annuityFactor(IDFC.ratePct, tenureMonths) * room));
}
export function idfcRoom(v) {
  return IDFC.share * (v.monthlyIncome + v.otherIncome - v.rent - v.sipInvestments - v.utilitiesOtherExpenses - v.existingEmi) - v.existingEmi;
}

// --- SMFG India Credit ------------------------------------------------------
export const SMFG = Object.freeze({
  salariedShare: 0.7,
  selfEmployedShare: 0.65,
  message: 'Your monthly income seems to be less than your expenses. Please reenter values',
  limits: {
    monthlyIncome: { min: 100000, max: 1000000 },
    existingEmi: { min: 0, max: 1000000 },
    ratePct: { min: 12.5, max: 30 },
    tenureMonths: { min: 12, max: 60 },
    selfTenureMonths: { min: 12, max: 48 },
  },
});
/** Salaried tab: annuityFactor(rate, tenure) × 0.70 × (income − EMIs); no cap. */
export function smfg(monthlyIncome, existingEmi, ratePct, tenureMonths) {
  if (existingEmi >= monthlyIncome) return { shown: 'message', message: SMFG.message };
  return amountResult(annuityFactor(ratePct, tenureMonths) * SMFG.salariedShare * (monthlyIncome - existingEmi));
}
/** Self-employed tab: annuityFactor(rate, tenure ≤ 48) × 0.65 × (yearly profit ÷ 12 − EMIs). */
export function smfgSelfEmployed(yearlyProfit, existingEmi, ratePct, tenureMonths) {
  const monthly = yearlyProfit / 12;
  if (existingEmi >= monthly) return { shown: 'message', message: SMFG.message };
  return amountResult(annuityFactor(ratePct, tenureMonths) * SMFG.selfEmployedShare * (monthly - existingEmi));
}

// --- Axis Bank --------------------------------------------------------------
export const AXIS = Object.freeze({
  highMultiple: 15,
  lowMultiple: 10,
  band1: 0.6,      // true edge is between 60% and 62.5% (₹1,000 slider steps)
  band2: 0.7,      // true edge is between 70% and 72.5%
  cap: 1500000,
  limits: { monthlyIncome: { min: 10000, max: 500000 }, monthlyExpense: { min: 0, max: 500000 } },
});
/** 15 × income if expenses ≤ 60% of income, 10 × if ≤ 70%, else 0; never more than ₹15 lakh. */
export function axis(monthlyIncome, monthlyExpense) {
  const m = monthlyExpense <= AXIS.band1 * monthlyIncome ? AXIS.highMultiple
    : monthlyExpense <= AXIS.band2 * monthlyIncome ? AXIS.lowMultiple : 0;
  return amountResult(Math.min(AXIS.cap, m * monthlyIncome));
}

// --- Fibe -------------------------------------------------------------------
export const FIBE = Object.freeze({
  ratePct: 24,
  emiShare: 0.3,
  affordShare: 0.7,
  roundTo: 500,
  cap: 1000000,
  fallbackMultiple: 1.5,
  tiers: [{ upTo: 20000, months: 6 }, { upTo: 30000, months: 12 }, { upTo: 50000, months: 24 }, { upTo: Infinity, months: 36 }],
  limits: { monthlyIncome: { min: 20000, max: 300000 }, monthlyExpense: { min: 0, max: 300000 } },
});
export function fibeTenure(monthlyIncome) {
  return FIBE.tiers.find((t) => monthlyIncome <= t.upTo).months;
}
/**
 * tenure set by income (6 / 12 / 24 / 36 months); room = min(30% of income, 70% of income − expenses);
 * amount = min(10 lakh, annuityFactor(24%, tenure) × room, rounded UP to ₹500);
 * 6-month tier, or no room: 1.5 × income over 6 months; expenses above income: no result shown.
 */
export function fibe(monthlyIncome, monthlyExpense) {
  if (monthlyExpense > monthlyIncome) return { shown: 'hidden' };
  const months = fibeTenure(monthlyIncome);
  const room = Math.min(FIBE.emiShare * monthlyIncome, FIBE.affordShare * monthlyIncome - monthlyExpense);
  if (months === 6 || room <= 0) return { ...amountResult(FIBE.fallbackMultiple * monthlyIncome), months: 6 };
  const amount = Math.min(FIBE.cap, Math.ceil(annuityFactor(FIBE.ratePct, months) * room / FIBE.roundTo) * FIBE.roundTo);
  return { ...amountResult(amount), months };
}

// --- Poonawalla Fincorp -----------------------------------------------------
export const POONAWALLA = Object.freeze({
  ratePct: 14,
  bands: [{ upTo: 50000, share: 0.55 }, { upTo: 100000, share: 0.65 }, { upTo: Infinity, share: 0.75 }],
  cap: 2000000,
  minShown: 100000,   // inferred: shown at ₹1,28,931, hidden at ₹85,954
  limits: { monthlyIncome: { min: 30000, max: 5000000 }, existingEmi: { min: 0, max: 1000000 }, tenureMonths: { min: 12, max: 84 } },
});
export function poonawallaShare(monthlyIncome) {
  return POONAWALLA.bands.find((b) => monthlyIncome <= b.upTo).share;
}
/** annuityFactor(14%, tenure) × (share × income − EMIs), share 55% / 65% / 75%; cap ₹20 lakh; hidden below ₹1 lakh. */
export function poonawalla(monthlyIncome, existingEmi, tenureMonths) {
  const a = annuityFactor(POONAWALLA.ratePct, tenureMonths) * (poonawallaShare(monthlyIncome) * monthlyIncome - existingEmi);
  if (a < POONAWALLA.minShown) return { shown: 'hidden' };
  return amountResult(Math.min(POONAWALLA.cap, a));
}

// --- Aditya Birla Capital ---------------------------------------------------
export const BIRLA = Object.freeze({
  multipliers: { 1: 4, 2: 8, 3: 11, 4: 14, 5: 17, 6: 20, 7: 23 },
  bands: [{ below: 75000, share: 0.65 }, { below: 150000, share: 0.7 }, { below: Infinity, share: 0.75 }],
  cap: 5000000,
  minShown: 100000,   // inferred: ₹1,03,544 shown, ₹98,837 replaced by the message
  message: "We're sorry! we will not be able to help you with financing due to certain constraints.",
  limits: {
    emiAffordable: { min: 1000, max: 500000 }, monthlyIncome: { min: 25000, max: 500000 }, variableIncome: { min: 0, max: 500000 },
    monthlyExpense: { min: 0, max: 500000 }, tenureYears: { min: 1, max: 7 }, ratePct: { min: 9, max: 13 },
  },
});
export function birlaShare(totalIncome) {
  return BIRLA.bands.find((b) => totalIncome < b.below).share;
}
/**
 * net = fixed + variable income − expenses
 * amount = min(50 lakh, multiplier(years) × net, annuityFactor(rate, years × 12) × (share × income − expenses))
 * Below ₹1 lakh: the "We're sorry" message. Invalid inputs: warning and a greyed-out old amount.
 */
export function adityaBirla({ emiAffordable, monthlyIncome, variableIncome, monthlyExpense, tenureYears, ratePct }) {
  const income = monthlyIncome + variableIncome;
  const net = income - monthlyExpense;
  if (monthlyExpense > income || emiAffordable > net) return { shown: 'stale' };
  const limit1 = BIRLA.multipliers[tenureYears] * net;
  const limit2 = annuityFactor(ratePct, tenureYears * 12) * (birlaShare(income) * income - monthlyExpense);
  const amount = Math.min(BIRLA.cap, limit1, limit2);
  if (amount < BIRLA.minShown) return { shown: 'message', message: BIRLA.message };
  return { ...amountResult(amount), limit1: Math.round(limit1), limit2: Math.round(limit2) };
}
