// What each platform page shows: the calculator's own boxes, what it would display for any inputs,
// the rule behind it, and what the audit found. Pure data and functions: no DOM, no network.
// Every number comes from rules.js, audit-data.js (counted from the probe logs) or a quote of the page.
import * as R from './rules.js';
import { AUDIT } from './audit-data.js';
import { rs, rsShort, pct, num, years, months, formatValue, formatLimit } from './fmt.js';

const S = AUDIT.sites;

/** A verbatim fragment of page text captured on 19 November 2026 (data/cues.csv). Throws if it is not verbatim. */
export function quote(cueId, fragment) {
  const text = AUDIT.quotes[cueId];
  if (!text || !text.includes(fragment)) throw new Error(`not a verbatim quote: ${cueId}: ${fragment}`);
  return `“${fragment}”`;
}

const label = (t) => ({ k: 'label', text: t });
const siteText = (t) => ({ k: 'site-text', text: t });
const amount = (n) => ({ k: 'amount', text: rs(n) });
const fact = (dt, dd) => ({ k: 'fact', dt, dd });
const message = (t) => ({ k: 'message', text: t });
const muted = (t) => ({ k: 'muted', text: t });
const SHOWS = label('The page would show');

const money = (key, labelText, limits, def, help) => ({ key, label: labelText, unit: 'money', min: limits.min, max: limits.max, def, help });

// ---------------------------------------------------------------------------
// Bajaj Finserv (tested 14 Nov 2026, re-tested 19 Nov 2026)
// ---------------------------------------------------------------------------
const BA = R.BAJAJ_ASSUMPTIONS;
const BL = R.BAJAJ_LIMITS;
const bajaj = {
  id: 'bajaj_finserv', file: 'bajaj-finserv.html', name: 'Bajaj Finserv', kind: 'A lender (non-bank)',
  customRanges: true,
  fields: [
    money('income', 'Monthly income', BL.monthlyIncome, 40000),
    money('expense', 'Monthly expense', BL.monthlyExpense, 10000, 'The page calls this “Monthly Expense”.'),
  ],
  fixedNote: `There are no boxes for age, interest rate or tenure. It always uses ${BA.ratePct}% a year over ${years(BA.months / 12)}. It also asks for a city, which changes nothing.`,
  evaluate(v) {
    const issues = R.bajajRangeIssues(v.income, v.expense);
    if (issues.length) {
      const msgs = issues.map((i) => { const l = BL[i.field]; return i.value < l.min ? l.siteMessageBelow : l.siteMessageAbove; });
      return {
        display: [SHOWS, ...msgs.map(message), muted('and no amount.')],
        notices: issues.map((i) => (i.field === 'monthlyIncome'
          ? `This calculator only accepts monthly income from ${rsShort(BL.monthlyIncome.min)} to ${rsShort(BL.monthlyIncome.max)}.`
          : `This calculator only accepts monthly expenses up to ${rsShort(BL.monthlyExpense.max)}.`)),
        steps: 'The calculator stops here: it shows no amount for these inputs.',
      };
    }
    const d = R.bajajDetails(v.income, v.expense);
    const start = `${pct(BA.shareOfIncome)} of ${rs(v.income)} is ${rs(d.share)}. `;
    const steps = d.limitedBy === 'no room'
      ? `${start}Your expenses of ${rs(v.expense)} use all of it, so nothing is left for a new instalment.`
      : `${start}Taking away ${rs(v.expense)} of expenses leaves ${rs(d.room)} a month. At ${BA.ratePct}% over ${years(BA.months / 12)}, that repays ${rs(d.byInstalment)}. `
        + (d.limitedBy === 'income cap'
          ? `But the cap of ${BA.incomeMultipleCap} × income is ${rs(d.incomeCap)}, so it shows ${rs(d.amount)}.`
          : `That is below the cap of ${BA.incomeMultipleCap} × income (${rs(d.incomeCap)}), so it shows ${rs(d.amount)}.`);
    return {
      display: [SHOWS, siteText('You are eligible for a personal loan upto'), amount(d.amount),
        d.amount === 0 ? muted('It still says “You are eligible” when the amount is ₹0.') : null],
      notices: [], steps,
    };
  },
  formula: `amount = min( ${BA.incomeMultipleCap} × income,  A(${BA.ratePct}%, ${BA.months} months) × (${pct(BA.shareOfIncome)} × income − expense) ),  never below ₹0`,
  behind: [
    `Always uses ${BA.ratePct}% a year over ${years(BA.months / 12)}, whatever rate or tenure you would pick. The same page advertises rates from ${BA.ratePct}% to ${BA.advertisedMaxRatePct}%.`,
    `Assumes up to ${pct(BA.shareOfIncome)} of your income can go to monthly instalments plus expenses.`,
    `Never more than ${BA.incomeMultipleCap} × your monthly income.`,
  ],
  ignores: [
    'Your credit score. The calculator does not ask for it.',
    'Your city. The page has a required “Select City” box, but any city, even a made-up one, gives the same amount.',
    `Your age, although the page says the calculator estimates your amount based on your ${quote('bajaj_finserv-03', 'income, expenses, age and repayment capacity')}.`,
  ],
  findings: [
    ['One rate, one tenure', `The amount is always worked out at ${BA.ratePct}% over ${years(BA.months / 12)}, the lowest rate in the page’s advertised range. The result does not say so.`],
    ['City makes no difference', 'A city is required, but every city tried, including a made-up one, gave the same amount.'],
    ['“Eligible” for ₹0', `Once expenses reach ${pct(BA.shareOfIncome)} of income, it says “You are eligible for a personal loan upto ₹0”.`],
    ['Income limits', `Income below ${rsShort(BL.monthlyIncome.min)} or above ${rsShort(BL.monthlyIncome.max)} shows an error message and no amount.`],
  ],
};

// ---------------------------------------------------------------------------
// Paisabazaar (tested 14 Nov 2026 only)
// ---------------------------------------------------------------------------
const PA = R.PAISABAZAAR_ASSUMPTIONS;
const PL = R.PAISABAZAAR_LIMITS;
const PB_FIELD = { age: 'age', desiredAmount: 'loan amount', ratePct: 'interest rate', tenureYears: 'tenure', monthlyIncome: 'monthly income', existingEmi: 'existing EMIs' };
const PB_UNIT = { age: 'years', desiredAmount: 'money', ratePct: 'pct', tenureYears: 'years', monthlyIncome: 'money', existingEmi: 'money' };
const PB_REASON = {
  [R.NOT_ELIGIBLE.AGE_BELOW_MINIMUM]: 'your age is lower than the minimum age required',
  [R.NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM]: 'your age is higher than the maximum age allowed',
  [R.NOT_ELIGIBLE.AGE_AT_MATURITY]: 'you would exceed the maximum permissible age on maturity',
  [R.NOT_ELIGIBLE.DEBTS_TOO_HIGH]: 'your existing debts on your current income are higher than the permissible limit',
};
const paisabazaar = {
  id: 'paisabazaar', file: 'paisabazaar.html', name: 'Paisabazaar', kind: 'A loan marketplace',
  customRanges: true,
  fields: [
    { key: 'age', label: 'Age', unit: 'years', min: PL.age.min, max: PL.age.max, def: 29 },
    money('income', 'Monthly income', PL.monthlyIncome, 40000),
    money('emi', 'Monthly EMIs you already pay', PL.existingEmi, 10000),
    money('desired', 'Loan amount you want', PL.desiredAmount, 2000000),
    { key: 'rate', label: 'Yearly interest rate', unit: 'pct', min: PL.ratePct.min, max: PL.ratePct.max, def: 10, decimal: true },
    { key: 'tenure', label: 'Loan tenure', unit: 'years', min: PL.tenureYears.min, max: PL.tenureYears.max, def: 5 },
  ],
  evaluate(v) {
    const typed = { age: v.age, desiredAmount: v.desired, ratePct: v.rate, tenureYears: v.tenure, monthlyIncome: v.income, existingEmi: v.emi };
    const { values: s, changes, kept } = R.snapPaisabazaarInputs(typed);
    const f = (field, x) => formatValue(PB_UNIT[field], x);
    const notices = [
      ...changes.map((c) => (c.why === 'above income'
        ? `This calculator changes existing EMIs above your monthly income to equal your income, so this result uses ${f(c.field, c.to)}.`
        : `This calculator’s ${PB_FIELD[c.field]} slider goes from ${f(c.field, PL[c.field].min)} to ${f(c.field, PL[c.field].max)}. It changes ${f(c.field, c.from)} to ${f(c.field, c.to)}, so this result uses ${f(c.field, c.to)}.`)),
      ...kept.map((k) => `This calculator’s ${PB_FIELD[k.field]} slider stops at ${rs(k.max)}, but it keeps higher typed values, so this result uses ${rs(k.value)}.`),
    ];
    const d = R.paisabazaarDetails(s.age, s.desiredAmount, s.ratePct, s.tenureYears, s.monthlyIncome, s.existingEmi);
    if (!d.eligible) {
      const text = `Unfortunately, you may not be eligible for most loan offers, as ${PB_REASON[d.reason]}.`;
      const steps = d.reason === R.NOT_ELIGIBLE.AGE_BELOW_MINIMUM ? `Its minimum age is ${PA.minAge}.`
        : d.reason === R.NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM ? `The loan must end by age ${PA.maxAgeAtEnd}, and you are above it.`
          : d.reason === R.NOT_ELIGIBLE.AGE_AT_MATURITY ? `The loan must end by age ${PA.maxAgeAtEnd}, which leaves no time to repay.`
            : `${pct(PA.shareOfIncome)} of ${rs(s.monthlyIncome)} is ${rs(d.share)}. Your EMIs of ${rs(s.existingEmi)} use all of it, so nothing is left for a new instalment.`;
      return { display: [SHOWS, message(text)], notices, steps };
    }
    let tenure = '';
    if (d.tenureLimitedBy === '5-year cap') tenure = `You picked ${years(d.chosenYears)}, but it uses ${years(d.years)} (its ${PA.maxTenureYears}-year cap). `;
    else if (d.tenureLimitedBy === 'age 60') tenure = `You picked ${years(d.chosenYears)}, but it uses ${years(d.years)}, because the loan must end by age ${PA.maxAgeAtEnd}. `;
    const limits = [
      ['instalment', `${rs(d.byInstalment)} (what the instalment repays)`],
      ['income cap', `${rs(d.incomeCap)} (${PA.incomeMultipleCap} × income)`],
      ['desired', `${rs(d.desired)} (what you asked for)`],
    ];
    const others = limits.filter(([k]) => k !== d.limitedBy).map(([, t]) => t).join(' and ');
    const steps = `${pct(PA.shareOfIncome)} of ${rs(s.monthlyIncome)} is ${rs(d.share)}. Taking away ${rs(s.existingEmi)} of EMIs leaves ${rs(d.room)} a month. ${tenure}`
      + `At ${num(s.ratePct)}% over ${years(d.years)}, that repays ${rs(d.byInstalment)}. `
      + (d.limitedBy === 'instalment' ? `The other limits are ${others}, so it shows the lowest: ${rs(d.amount)}.`
        : `But ${limits.find(([k]) => k === d.limitedBy)[1]} is lower, so it shows ${rs(d.amount)}.`);
    return {
      display: [SHOWS, siteText('You are eligible for'), amount(d.amount),
        fact('Estimated EMI', rs(d.emi)), fact('Number of EMI', String(d.numberOfEmis)), fact('Eligible Tenure', `${d.years} ${d.years === 1 ? 'Year' : 'Years'}`)],
      notices, steps,
    };
  },
  formula: `amount = min( A(your rate, years) × (${pct(PA.shareOfIncome)} × income − EMIs),  ${PA.incomeMultipleCap} × income,  amount you want );  years = min(your tenure, ${PA.maxTenureYears}, ${PA.maxAgeAtEnd} − age)`,
  behind: [
    `Assumes up to ${pct(PA.shareOfIncome)} of your income can go to monthly instalments, counting the ones you already pay.`,
    `Never more than ${PA.incomeMultipleCap} × your monthly income, and never more than the amount you asked for.`,
    `Repays over at most ${years(PA.maxTenureYears)}, even though its tenure slider goes up to ${years(PL.tenureYears.max)}.`,
    `The loan must end by age ${PA.maxAgeAtEnd}. Minimum age ${PA.minAge}, although its age slider starts at ${PL.age.min}.`,
    'Uses the interest rate you pick.',
  ],
  ignores: [
    'Your credit score.',
    'Your employment type and monthly expenses. The page says it estimates “based on your income, employment type, monthly expenses and more”, but it does not ask for either.',
  ],
  findings: [
    ['Tenure silently capped', `The tenure slider goes to ${years(PL.tenureYears.max)}, but it never uses more than ${PA.maxTenureYears}. Choose 6 or 7 and it shows “Eligible Tenure 5 Years”.`],
    ['The page names inputs it doesn’t ask for', 'Its page mentions employment type and monthly expenses. The calculator asks for neither.'],
    ['“Eligible” for very little', 'It says “You are eligible” even when only ₹1 a month of room is left (₹47).'],
    ['Age limits', `The loan must end by age ${PA.maxAgeAtEnd}, so older users get a shorter tenure and a smaller amount.`],
  ],
};

// ---------------------------------------------------------------------------
// Kotak Mahindra Bank
// ---------------------------------------------------------------------------
const KL = R.KOTAK.limits;
const kotakTenureExample = R.kotakEmi(R.kotak(40000, 10000).amount, 1);
const kotak = {
  id: 'kotak', file: 'kotak.html', name: 'Kotak Mahindra Bank', kind: 'A bank',
  fields: [
    money('income', 'Monthly income', KL.monthlyIncome, 40000),
    money('emi', 'Existing obligations / EMI', KL.existingEmi, 10000),
    { key: 'tenure', label: 'Tenure (slider)', unit: 'months', min: KL.tenureMonths.min, max: KL.tenureMonths.max, def: 60, help: 'The slider changes the EMI shown, not the eligible amount.' },
  ],
  evaluate(v) {
    const r = R.kotak(v.income, v.emi);
    const emi = R.kotakEmi(r.amount, v.tenure);
    return {
      display: [SHOWS, siteText('Loan Eligible Amount'), amount(r.amount), fact('Check Monthly EMI Amount', rs(emi)), fact('Principal Amount', rs(r.amount))],
      notices: [],
      steps: `${R.KOTAK.incomeMultiple} × (${rs(v.income)} − ${rs(v.emi)}) = ${rs(Math.max(0, R.KOTAK.incomeMultiple * (v.income - v.emi)))}${v.emi >= v.income ? ', shown as ₹0' : ''}. `
        + `The tenure does not enter. The EMI next to it is that amount repaid at ${R.KOTAK.emiDisplayRatePct}% over ${months(v.tenure)}: ${rs(emi)} a month.`,
    };
  },
  formula: `amount = ${R.KOTAK.incomeMultiple} × (income − existing EMIs),  never below ₹0;   EMI shown = amount ÷ A(${R.KOTAK.emiDisplayRatePct}%, tenure)`,
  behind: [
    `A plain multiple: ${R.KOTAK.incomeMultiple} times what is left of your income after existing EMIs.`,
    'No interest rate and no tenure enter the eligible amount.',
    `The “Monthly EMI” next to the amount uses ${R.KOTAK.emiDisplayRatePct}% a year. Elsewhere the page mentions rates ${quote('kotak-04', 'as low as 10.99% p.a.')}`,
  ],
  ignores: [
    'The tenure slider (for the eligible amount).',
    `Your credit score and age, though the page says eligibility considers ${quote('kotak-07', 'factors like credit score, income, and existing obligations')}.`,
  ],
  findings: [
    ['Tenure changes nothing', 'Moving the tenure slider from its lowest to its highest value left the eligible amount the same at every point tested.'],
    ['An EMI that can exceed your income', `At a 1-month tenure, a person earning ₹40,000 with ₹10,000 of EMIs is shown a “Monthly EMI” of ${rs(kotakTenureExample)}.`],
    ['No cap found', `Up to the slider maximum of ${rsShort(KL.monthlyIncome.max)} income, the amount kept growing at ${R.KOTAK.incomeMultiple} × (income − EMIs).`],
    ['Two rates on one page', `The EMI is worked out at ${R.KOTAK.emiDisplayRatePct}%, below the advertised starting rate.`],
  ],
};

// ---------------------------------------------------------------------------
// IDFC FIRST Bank
// ---------------------------------------------------------------------------
const IL = R.IDFC.limits;
const idfcInputs = (v) => ({ monthlyIncome: v.income, otherIncome: v.other, rent: v.rent, sipInvestments: v.sip, utilitiesOtherExpenses: v.utilities, existingEmi: v.emi, tenureMonths: v.tenure });
const idfcZero = AUDIT.personas.filter((p) => p.seen.idfc_first && p.seen.idfc_first.amount === 0).map((p) => p.id);
const idfc = {
  id: 'idfc_first', file: 'idfc-first.html', name: 'IDFC FIRST Bank', kind: 'A bank',
  fields: [
    money('income', 'Monthly take-home income', IL.money, 40000),
    money('other', 'Other monthly income', IL.money, 0),
    money('rent', 'Rent', IL.money, 0),
    money('emi', 'Existing loan EMIs', IL.money, 10000),
    money('sip', 'SIP investments', IL.money, 0),
    money('utilities', 'Utilities and other expenses', IL.money, 10000),
    { key: 'tenure', label: 'Tenure', unit: 'months', min: IL.tenureMonths.min, max: IL.tenureMonths.max, def: 60 },
  ],
  evaluate(v) {
    const inp = idfcInputs(v);
    const r = R.idfcFirst(inp);
    const room = R.idfcRoom(inp);
    const after = v.income + v.other - v.rent - v.sip - v.utilities - v.emi;
    const commitments = v.rent + v.sip + v.utilities + v.emi;
    const byInstalment = R.annuityFactor(R.IDFC.ratePct, v.tenure) * room;
    return {
      display: [SHOWS, siteText('You are eligible for'), amount(r.amount), fact('Commitments', rs(commitments)), fact(`EMI on ${rs(r.amount)}`, rs(Math.max(0, room)))],
      notices: [],
      steps: `Income after all commitments: ${rs(after)}. ${pct(R.IDFC.share)} of that is ${rs(R.IDFC.share * after)}. `
        + `Then your EMIs of ${rs(v.emi)} are taken away again, leaving ${rs(room)} a month. `
        + (room <= 0 ? 'Nothing is left, so it shows ₹0.'
          : `At ${R.IDFC.ratePct}% over ${months(v.tenure)}, that repays ${rs(byInstalment)}`
            + (byInstalment > R.IDFC.cap ? `, above the cap of ${rsShort(R.IDFC.cap)}, so it shows ${rs(r.amount)}.` : '.')),
    };
  },
  formula: `room = ${pct(R.IDFC.share)} × (income + other income − rent − SIPs − utilities − EMIs) − EMIs;   amount = min( ${rsShort(R.IDFC.cap)},  A(${R.IDFC.ratePct}%, tenure) × room ),  never below ₹0`,
  behind: [
    `Assumes ${pct(R.IDFC.share)} of the income left after all your commitments can go to a new EMI.`,
    `Existing EMIs are taken away twice: once with the other commitments and once more at the end. In effect each rupee of EMI counts ${num(1 + R.IDFC.share)} times.`,
    `Uses ${R.IDFC.ratePct}% a year, the same as the page’s ${quote('idfc_first-06', 'starting from 9.99% p.a.')}`,
    `Never more than ${rsShort(R.IDFC.cap)}.`,
  ],
  ignores: [
    `Your credit score and age. The page lists ${quote('idfc_first-05', 'CIBIL Score of 710+ for salaried')}, but the calculator does not ask for it.`,
  ],
  findings: [
    ['EMIs count extra', `Because existing EMIs are subtracted twice, people with existing loans get much less here than elsewhere. In the 12 standard people, IDFC FIRST showed ₹0 for ${idfcZero.join(', ')}, where other calculators showed lakhs.`],
    ['The lowest advertised rate', `The amount assumes ${R.IDFC.ratePct}%, the lowest rate the page advertises.`],
    ['“EMI on” is the room', 'The EMI shown under the amount is exactly the room left for a new instalment.'],
    ['Cap', `Never more than ${rsShort(R.IDFC.cap)}.`],
  ],
};

// ---------------------------------------------------------------------------
// SMFG India Credit
// ---------------------------------------------------------------------------
const SL = R.SMFG.limits;
const smfgRaised = AUDIT.personas.filter((p) => p.seen.smfg && p.seen.smfg.adjusted.monthly_income).map((p) => p.id);
const smfgTop = R.smfg(SL.monthlyIncome.max, 10000, SL.ratePct.min, SL.tenureMonths.max).amount;
const smfg = {
  id: 'smfg', file: 'smfg.html', name: 'SMFG India Credit', kind: 'A lender (non-bank)',
  fields: [
    { key: 'employment', label: 'You are', type: 'choice', options: [['salaried', 'Salaried'], ['self', 'Self-employed']], def: 'salaried' },
    money('income', 'Net monthly income', SL.monthlyIncome, 100000),
    { ...money('profit', 'Yearly profit', { min: 0, max: 100000000 }, 600000), showIf: { employment: 'self' } },
    money('emi', 'Monthly obligations (EMIs)', SL.existingEmi, 10000, 'The page keeps ₹10,000 if you try to clear this box to ₹0.'),
    { key: 'rate', label: 'Interest rate', unit: 'pct', min: SL.ratePct.min, max: SL.ratePct.max, def: SL.ratePct.min, decimal: true },
    { key: 'tenure', label: 'Tenure', unit: 'months', min: SL.tenureMonths.min, max: SL.tenureMonths.max, def: 60 },
  ],
  activeFields(v) {
    return v.employment === 'self' ? ['employment', 'profit', 'emi', 'rate', 'tenure'] : ['employment', 'income', 'emi', 'rate', 'tenure'];
  },
  evaluate(v) {
    const self = v.employment === 'self';
    const tenure = self ? Math.min(v.tenure, SL.selfTenureMonths.max) : v.tenure;
    const notices = self && v.tenure > SL.selfTenureMonths.max
      ? [`On the self-employed tab the tenure box stops at ${months(SL.selfTenureMonths.max)}, so this result uses ${months(SL.selfTenureMonths.max)}.`] : [];
    const r = self ? R.smfgSelfEmployed(v.profit, v.emi, v.rate, tenure) : R.smfg(v.income, v.emi, v.rate, tenure);
    if (r.shown === 'message') {
      return { display: [SHOWS, message(r.message)], notices, steps: `Your EMIs are at or above your monthly ${self ? 'profit' : 'income'}, so it shows this message instead of an amount.` };
    }
    const monthly = self ? v.profit / 12 : v.income;
    const share = self ? R.SMFG.selfEmployedShare : R.SMFG.salariedShare;
    const emi = share * (monthly - v.emi);
    return {
      display: [SHOWS, siteText('You may be eligible for a personal loan of'), amount(r.amount), fact('Estimated EMI', rs(emi)),
        muted('After you change any box, the sentence becomes “You may be eligible for an amount of upto”.')],
      notices,
      steps: `${self ? `Yearly profit ÷ 12 is ${rs(monthly)}. ` : ''}${rs(monthly)} − ${rs(v.emi)} of EMIs leaves ${rs(monthly - v.emi)}. ${pct(share)} of that, ${rs(emi)}, is the EMI it assumes you can pay. `
        + `At ${num(v.rate)}% over ${months(tenure)}, that repays ${rs(r.amount)}. There is no cap.`,
    };
  },
  formula: `salaried: amount = A(your rate, tenure) × ${pct(R.SMFG.salariedShare)} × (income − EMIs);   self-employed: A(your rate, tenure ≤ ${SL.selfTenureMonths.max}) × ${pct(R.SMFG.selfEmployedShare)} × (yearly profit ÷ 12 − EMIs);   no cap`,
  behind: [
    `Assumes ${pct(R.SMFG.salariedShare)} of what is left after EMIs (${pct(R.SMFG.selfEmployedShare)} if self-employed) can go to the new EMI.`,
    'Uses the interest rate and tenure you choose.',
    'No upper limit on the amount.',
  ],
  ignores: [
    `Your credit score. The page lists ${quote('smfg-10', 'Credit score of 700 or above.')}`,
    'Your age: it enters only through a Date of Birth box, which the audit never changed, so its effect is unknown.',
  ],
  findings: [
    ['Income starts at ₹1 lakh', `The income box does not go below ${rsShort(SL.monthlyIncome.min)}. ${smfgRaised.length} of the 12 standard people earn less and had to be entered at ${rsShort(SL.monthlyIncome.min)}, so their results are not like-for-like.`],
    ['No cap', `At the top of the income box and the lowest rate, it shows ${rs(smfgTop)}.`],
    ['Wording changes', 'The first result says “a personal loan of”; after any change it says “an amount of upto”.'],
    ['EMIs cannot be ₹0', 'The obligations box keeps ₹10,000 when cleared, so a person with no EMIs cannot be entered exactly.'],
  ],
};

// ---------------------------------------------------------------------------
// Axis Bank
// ---------------------------------------------------------------------------
const AL = R.AXIS.limits;
const axisStep = [24000, 25000, 29000].map((e) => [e, R.axis(40000, e).amount]);
const axis = {
  id: 'axis', file: 'axis.html', name: 'Axis Bank', kind: 'A bank',
  fields: [
    money('income', 'Net monthly income', AL.monthlyIncome, 40000),
    money('expense', 'Monthly expenses, including other EMIs', AL.monthlyExpense, 10000),
  ],
  fixedNote: 'The page also has a Date of Birth box. A result shows without it, and the audit never filled it, so its effect is unknown.',
  evaluate(v) {
    const r = R.axis(v.income, v.expense);
    const share = v.income > 0 ? v.expense / v.income : 0;
    const m = share <= R.AXIS.band1 ? R.AXIS.highMultiple : share <= R.AXIS.band2 ? R.AXIS.lowMultiple : 0;
    return {
      display: [SHOWS, siteText('You are eligible for up to'), amount(r.amount)],
      notices: [],
      steps: `Your expenses are ${pct(share)} of your income. `
        + (m === 0 ? `That is above about ${pct(R.AXIS.band2)}, so it shows ₹0.`
          : `That is ${m === R.AXIS.highMultiple ? `at or below about ${pct(R.AXIS.band1)}` : `between about ${pct(R.AXIS.band1)} and ${pct(R.AXIS.band2)}`}, so it uses ${m} × income = ${rs(m * v.income)}`
            + (m * v.income > R.AXIS.cap ? `, above the cap of ${rsShort(R.AXIS.cap)}, so it shows ${rs(r.amount)}.` : '.')),
    };
  },
  formula: `amount = min( ${rsShort(R.AXIS.cap)},  m × income ),  m = ${R.AXIS.highMultiple} if expenses ≤ ~${pct(R.AXIS.band1)} of income, ${R.AXIS.lowMultiple} if ≤ ~${pct(R.AXIS.band2)}, else 0`,
  behind: [
    `A step rule: ${R.AXIS.highMultiple} × income, ${R.AXIS.lowMultiple} × income or nothing, depending on what share of income your expenses take.`,
    'No interest rate and no tenure.',
    `The band edges are near ${pct(R.AXIS.band1)} and ${pct(R.AXIS.band2)}. The sliders move in ₹1,000 steps, so the exact edges are not known.`,
    `Never more than ${rsShort(R.AXIS.cap)}.`,
  ],
  ignores: [
    `Your credit score and city, though the page says eligibility is assessed on ${quote('axis-03', 'age, location, credit score, and other criteria')}.`,
  ],
  findings: [
    ['Cliffs, not slopes', `For a person earning ₹40,000: expenses of ${rs(axisStep[0][0])} give ${rs(axisStep[0][1])}; ${rs(axisStep[1][0])} gives ${rs(axisStep[1][1])}; ${rs(axisStep[2][0])} gives ${rs(axisStep[2][1])}.`],
    ['Expenses below the first band change nothing', `Up to about ${pct(R.AXIS.band1)} of income, more or less expense gives the same amount.`],
    ['Date of Birth: unknown', 'The audit never typed a date of birth, so whether age changes the result is not known.'],
  ],
};

// ---------------------------------------------------------------------------
// Fibe
// ---------------------------------------------------------------------------
const FL = R.FIBE.limits;
const fibeLow = R.fibe(20000, 20000).amount;
const fibe = {
  id: 'fibe', file: 'fibe.html', name: 'Fibe', kind: 'A digital lending platform',
  fields: [
    money('income', 'Monthly income', FL.monthlyIncome, 40000),
    money('expense', 'Monthly expense', FL.monthlyExpense, 10000),
  ],
  evaluate(v) {
    const r = R.fibe(v.income, v.expense);
    if (r.shown === 'hidden') {
      return { display: [SHOWS, muted('No result: the result panel disappears, with no message.')], notices: [], steps: 'Your expenses are above your income, so the page shows nothing.' };
    }
    const tier = R.fibeTenure(v.income);
    const room = Math.min(R.FIBE.emiShare * v.income, R.FIBE.affordShare * v.income - v.expense);
    const fallback = tier === 6 || room <= 0;
    return {
      display: [SHOWS, siteText('You are eligible for a loan of up to'), amount(r.amount), fact('Tenure', `${r.months} Months`),
        muted(`It also shows an “EMI amount”. We could reproduce it in ${S.fibe.emiMatched[0]} of ${S.fibe.emiMatched[1]} checks only, so it is not recreated here.`)],
      notices: [],
      steps: fallback
        ? `${tier === 6 ? `Income up to ${rs(R.FIBE.tiers[0].upTo)} gets a ${months(6)} tenure` : 'Nothing is left for an instalment'}, so it shows ${num(R.FIBE.fallbackMultiple)} × income = ${rs(r.amount)} over ${months(6)}.`
        : `Your income sets the tenure: ${months(tier)}. The EMI room is the smaller of ${pct(R.FIBE.emiShare)} of income (${rs(R.FIBE.emiShare * v.income)}) and ${pct(R.FIBE.affordShare)} of income minus expenses (${rs(R.FIBE.affordShare * v.income - v.expense)}): ${rs(room)}. `
          + `At ${R.FIBE.ratePct}% over ${months(tier)} that repays ${rs(R.annuityFactor(R.FIBE.ratePct, tier) * room)}, rounded up to the next ₹${R.FIBE.roundTo}`
          + (r.amount >= R.FIBE.cap ? `, and capped at ${rsShort(R.FIBE.cap)}.` : `: ${rs(r.amount)}.`),
    };
  },
  formula: `tenure T by income: ≤ ₹20,000 → 6, ≤ ₹30,000 → 12, ≤ ₹50,000 → 24, else 36 months;   room = min(${pct(R.FIBE.emiShare)} × income, ${pct(R.FIBE.affordShare)} × income − expense);   amount = min( ${rsShort(R.FIBE.cap)}, A(${R.FIBE.ratePct}%, T) × room rounded up to ₹${R.FIBE.roundTo} );   6-month tier or no room: ${num(R.FIBE.fallbackMultiple)} × income`,
  behind: [
    `Assumes ${R.FIBE.ratePct}% a year.`,
    'Picks the tenure from your income. You cannot choose it.',
    `Assumes at most ${pct(R.FIBE.emiShare)} of income can go to the new EMI, and less if expenses take more than ${pct(1 - R.FIBE.affordShare)}.`,
    `Rounds up to the next ₹${R.FIBE.roundTo}. Never more than ${rsShort(R.FIBE.cap)}.`,
  ],
  ignores: [
    `Your credit score. The page says ${quote('fibe-05', 'Enter your income, monthly expenses and credit score')}, but there is no credit-score box.`,
  ],
  findings: [
    ['Tenure is chosen for you', 'The tenure jumps from 6 to 12, 24 and 36 months as income rises, so a small rise in income can change the amount sharply.'],
    ['Low incomes ignore expenses', `Up to ₹20,000 of income the answer is ${num(R.FIBE.fallbackMultiple)} × income whatever the expenses: ₹20,000 income and ₹20,000 expenses still shows ${rs(fibeLow)}.`],
    ['The result can vanish', 'When expenses are above income, the result panel disappears with no message.'],
    ['Accuracy claim', `The page calls its results ${quote('fibe-07', 'accurate results based on our extensive database of lender eligibility criteria')}. The calculation is a fixed formula run in the browser.`],
  ],
};

// ---------------------------------------------------------------------------
// Poonawalla Fincorp
// ---------------------------------------------------------------------------
const PoL = R.POONAWALLA.limits;
const poonJump = [50000, 51000].map((i) => [i, R.poonawalla(i, 0, 60).amount]);
const poonawalla = {
  id: 'poonawalla', file: 'poonawalla.html', name: 'Poonawalla Fincorp', kind: 'A lender (non-bank)',
  fields: [
    { key: 'qualification', label: 'Select qualification', type: 'choice', options: [['ca', 'CA/CS/Doctor'], ['others', 'Others']], def: 'others', help: 'Changes nothing in the result.' },
    { key: 'tenure', label: 'Loan tenure', unit: 'months', min: PoL.tenureMonths.min, max: PoL.tenureMonths.max, def: 60 },
    money('income', 'Net monthly salary', PoL.monthlyIncome, 40000),
    money('emi', 'Other monthly EMIs', PoL.existingEmi, 10000),
  ],
  evaluate(v) {
    const r = R.poonawalla(v.income, v.emi, v.tenure);
    const share = R.poonawallaShare(v.income);
    const raw = R.annuityFactor(R.POONAWALLA.ratePct, v.tenure) * (share * v.income - v.emi);
    const steps = `For this income it assumes ${pct(share)} can go to EMIs: ${rs(share * v.income)}. Minus your EMIs of ${rs(v.emi)} leaves ${rs(share * v.income - v.emi)}. `
      + `At ${R.POONAWALLA.ratePct}% over ${months(v.tenure)} that repays ${rs(Math.max(0, raw))}. `;
    if (r.shown === 'hidden') {
      return {
        display: [SHOWS, muted('No “You are eligible” sentence.'), fact('MONTHLY PAYABLE AMOUNT', '₹ 0')],
        notices: [], steps: steps + 'Below about ₹1 lakh the sentence disappears and the box shows ₹0.',
      };
    }
    return {
      display: [SHOWS, siteText('You are eligible for a Personal Loan of up to'), amount(r.amount), fact('MONTHLY PAYABLE AMOUNT', rs(r.amount)),
        muted('The “monthly payable amount” is the loan amount itself, not a monthly payment.')],
      notices: [], steps: steps + (raw > R.POONAWALLA.cap ? `That is above the cap, so it shows ${rsShort(R.POONAWALLA.cap)}.` : ''),
    };
  },
  formula: `share = 55% if income ≤ ₹50,000, 65% if ≤ ₹1 lakh, else 75%;   amount = min( ${rsShort(R.POONAWALLA.cap)},  A(${R.POONAWALLA.ratePct}%, tenure) × (share × income − EMIs) );   hidden below about ${rsShort(R.POONAWALLA.minShown)}`,
  behind: [
    `Assumes ${R.POONAWALLA.ratePct}% a year. The page header says ${quote('poonawalla-04', 'Interest Rate Starting at 9.99%* p.a.')}`,
    `Assumes ${R.POONAWALLA.bands.map((b) => pct(b.share)).join(', ')} of income can go to EMIs, rising with income.`,
    `Never more than ${rsShort(R.POONAWALLA.cap)}, though the header says ${quote('poonawalla-04', 'Loan Amount Up to ₹50 Lakh')}.`,
    'Uses the tenure you choose.',
  ],
  ignores: [
    'The qualification you select (CA/CS/Doctor or Others).',
    `Your age, employment type and credit score, though the page says ${quote('poonawalla-05', 'age, employment type, income, and credit score play a key role')}.`,
  ],
  findings: [
    ['“Monthly payable” is the loan amount', `The box labelled “MONTHLY PAYABLE AMOUNT” equalled the eligible loan amount in ${S.poonawalla.payableEqualsAmount[0]} of ${S.poonawalla.payableEqualsAmount[1]} checks. It is not a monthly payment.`],
    ['A jump at ₹50,000', `Income of ${rs(poonJump[0][0])} gives ${rs(poonJump[0][1])}; ${rs(poonJump[1][0])} gives ${rs(poonJump[1][1])} (60 months, no EMIs), because the share jumps.`],
    ['Qualification ignored', 'Choosing “Others” instead of “CA/CS/Doctor” gave the same amount in every check.'],
    ['Small results disappear', 'Below about ₹1 lakh the “You are eligible” sentence vanishes and the payable box shows ₹0.'],
  ],
};

// ---------------------------------------------------------------------------
// Aditya Birla Capital
// ---------------------------------------------------------------------------
const ADL = R.BIRLA.limits;
const birlaInputs = (v) => ({ emiAffordable: v.emiAfford, monthlyIncome: v.income, variableIncome: v.variable, monthlyExpense: v.expense, tenureYears: v.tenure, ratePct: v.rate });
const birla = {
  id: 'aditya_birla', file: 'aditya-birla-capital.html', name: 'Aditya Birla Capital', kind: 'A lender (non-bank)',
  fields: [
    money('emiAfford', 'EMI you can afford', ADL.emiAffordable, 25000, 'Only checked against your income; it does not change the eligible amount.'),
    money('income', 'Monthly fixed income', ADL.monthlyIncome, 40000),
    money('variable', 'Monthly variable income', ADL.variableIncome, 0),
    money('expense', 'Monthly expenses', ADL.monthlyExpense, 10000),
    { key: 'tenure', label: 'Tenure', unit: 'years', min: ADL.tenureYears.min, max: ADL.tenureYears.max, def: 5 },
    { key: 'rate', label: 'Rate of interest', unit: 'pct', min: ADL.ratePct.min, max: ADL.ratePct.max, def: 10, decimal: true },
  ],
  evaluate(v) {
    if (!Number.isInteger(v.tenure)) return { display: [SHOWS, muted('—')], notices: ['The tenure box takes whole years.'], steps: '' };
    const r = R.adityaBirla(birlaInputs(v));
    const income = v.income + v.variable;
    const net = income - v.expense;
    if (r.shown === 'stale') {
      const warn = v.expense > income ? 'Expenses cannot be more than the entered income. Please check' : 'You cannot pay emi';
      return {
        display: [SHOWS, message(warn), muted('The result panel is greyed out, but the amount from your previous inputs stays on screen.')],
        notices: [], steps: v.expense > income ? 'Your expenses are above your income.' : `The EMI you can afford (${rs(v.emiAfford)}) is more than your income minus expenses (${rs(net)}).`,
      };
    }
    const mult = R.BIRLA.multipliers[v.tenure];
    const share = R.birlaShare(income);
    const lead = `Limit 1: ${mult} × (income − expenses) = ${mult} × ${rs(net)} = ${rs(mult * net)}. `
      + `Limit 2: ${pct(share)} of income minus expenses is ${rs(share * income - v.expense)} a month; at ${num(v.rate)}% over ${years(v.tenure)} that repays ${rs(Math.max(0, R.annuityFactor(v.rate, v.tenure * 12) * (share * income - v.expense)))}. `;
    if (r.shown === 'message') return { display: [SHOWS, message(r.message)], notices: [], steps: `${lead}The smaller is below about ₹1 lakh, so it shows this message.` };
    return {
      display: [SHOWS, siteText('Eligible Loan Amount'), amount(r.amount), fact('Loan Amount based on given EMI', rs(v.emiAfford * R.annuityFactor(v.rate, v.tenure * 12)))],
      notices: [],
      steps: `${lead}It shows the smaller${Math.min(r.limit1, r.limit2) > R.BIRLA.cap ? `, capped at ${rsShort(R.BIRLA.cap)}` : ''}: ${rs(r.amount)}.`,
    };
  },
  formula: `amount = min( ${rsShort(R.BIRLA.cap)},  k(years) × (income − expenses),  A(your rate, years × 12) × (share × income − expenses) );   k = ${Object.values(R.BIRLA.multipliers).join(', ')} for 1–7 years;   share = 65% below ₹75,000, 70% below ₹1.5 lakh, else 75%`,
  behind: [
    `Two limits, and the smaller wins: a multiple of what is left after expenses (${Object.values(R.BIRLA.multipliers).join(', ')} for 1 to 7 years), and what an EMI of ${R.BIRLA.bands.map((b) => pct(b.share)).join(' / ')} of income would repay.`,
    'The interest rate you pick matters only when the second limit is the smaller one.',
    `Never more than ${rsShort(R.BIRLA.cap)}. Below about ${rsShort(R.BIRLA.minShown)} it shows a message instead.`,
  ],
  ignores: [
    'The “EMI you can afford” box (it is only checked against your income). The “You know your loan amount” mode gives the same amount.',
    `Your age and work experience, though the page lists ${quote('aditya_birla-10', 'Age - 23-60 years')}.`,
  ],
  findings: [
    ['An old number can stay on screen', 'With invalid inputs it shows a warning, greys the panel out, and keeps the amount from the previous inputs visible.'],
    ['The rate often changes nothing', 'Unless expenses take a large share of income, the multiple limit is the smaller one, so moving the rate slider leaves the amount unchanged.'],
    ['“We’re sorry” below ₹1 lakh', `Small amounts are replaced by ${quote('aditya_birla-07', 'We\'re sorry! we will not be able to help you with financing due to certain constraints.')}`],
    ['Two rates on one page', `The rate box runs from ${ADL.ratePct.min}% to ${ADL.ratePct.max}%, while the page also says ${quote('aditya_birla-08', 'Loans starting from just 8.60% p.a.')}`],
  ],
};

export const PLATFORMS = [bajaj, paisabazaar, kotak, idfc, smfg, axis, fibe, poonawalla, birla].map((p) => {
  const audit = S[p.id];
  return Object.freeze({ ...p, url: audit.url, testedOn: audit.testedOn, checks: audit.checks, parts: audit.parts });
});
export const byId = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

/** Fields shown for these values (SMFG switches between its two tabs). */
export function activeFields(p, v) {
  const keys = p.activeFields ? p.activeFields(v) : p.fields.map((f) => f.key);
  return p.fields.filter((f) => keys.includes(f.key));
}

/**
 * What the page would show for the given values ({ key: number | string | null }).
 * Returns { state: 'incomplete' | 'out-of-range' | 'result', display, notices, steps }.
 */
export function run(p, v) {
  const fields = activeFields(p, v);
  if (fields.some((f) => f.type !== 'choice' && v[f.key] === null)) {
    return { state: 'incomplete', display: [muted('Fill in every box to see the result.')], notices: [], steps: '' };
  }
  if (!p.customRanges) {
    const out = fields.filter((f) => f.type !== 'choice' && (v[f.key] < f.min || v[f.key] > f.max));
    if (out.length) {
      return {
        state: 'out-of-range',
        display: [muted('No result recreated.')],
        notices: out.map((f) => `This calculator’s ${f.label.toLowerCase()} box goes from ${formatLimit(f.unit, f.min)} to ${formatLimit(f.unit, f.max)}. It does not accept ${formatValue(f.unit, v[f.key])}, so there is no result to recreate.`),
        steps: '',
      };
    }
  }
  return { state: 'result', ...p.evaluate(v) };
}

export const defaults = (p) => Object.fromEntries(p.fields.map((f) => [f.key, f.def]));
