// One person, entered into all nine recreated calculators. Pure functions: no DOM.
import { PLATFORMS, byId, run } from './platforms.js';
import { AUDIT } from './audit-data.js';
import { formatValue } from './fmt.js';

/**
 * How one person's details go into each calculator's own boxes.
 * person = { age, income, emis, other, years, rate, employment: 'salaried' | 'self' }
 * Single "expenses" boxes get EMIs + other expenses; EMI-only boxes get EMIs.
 */
export function inputsFor(id, x) {
  const exp = x.emis + x.other;
  switch (id) {
    case 'bajaj_finserv': return { income: x.income, expense: exp };
    case 'paisabazaar': return { age: x.age, income: x.income, emi: x.emis, desired: AUDIT.personaCommon.desired, rate: x.rate, tenure: x.years };
    case 'kotak': return { income: x.income, emi: x.emis, tenure: x.years * 12 };
    case 'idfc_first': return { income: x.income, other: 0, rent: 0, emi: x.emis, sip: 0, utilities: x.other, tenure: x.years * 12 };
    case 'smfg': return { employment: x.employment, income: x.income, profit: x.income * 12, emi: x.emis, rate: x.rate, tenure: x.years * 12 };
    case 'axis': return { income: x.income, expense: exp };
    case 'fibe': return { income: x.income, expense: exp };
    case 'poonawalla': return { qualification: 'others', tenure: x.years * 12, income: x.income, emi: x.emis };
    case 'aditya_birla': return { emiAfford: 1000, income: x.income, variable: 0, expense: exp, tenure: x.years, rate: x.rate };
    default: throw new Error(id);
  }
}
export const MAPPING_NOTE = {
  bajaj_finserv: 'EMIs + other expenses as “Monthly Expense”',
  paisabazaar: `EMIs only; loan wanted ₹${(AUDIT.personaCommon.desired / 100000)} lakh`,
  kotak: 'EMIs only',
  idfc_first: 'EMIs as EMIs, other expenses as utilities',
  smfg: 'EMIs only; self-employed: profit = 12 × income',
  axis: 'EMIs + other expenses',
  fibe: 'EMIs + other expenses',
  poonawalla: 'EMIs only; qualification “Others”',
  aditya_birla: 'EMIs + other expenses; EMI you can afford ₹1,000',
};

/** Rate and tenure are chosen by the person, so they are moved into each calculator's own range (and noted). */
export function fitted(p, x) {
  const v = inputsFor(p.id, x);
  const notes = [];
  for (const f of p.fields) {
    if (!['rate', 'tenure'].includes(f.key) || v[f.key] === undefined || v[f.key] === null) continue;
    const to = Math.min(f.max, Math.max(f.min, v[f.key]));
    if (to !== v[f.key]) { notes.push(`${f.label} set to ${formatValue(f.unit, to)}, the nearest its box allows.`); v[f.key] = to; }
  }
  return { v, notes };
}

/** [{ p, result, notes, amount | null }] for every platform. */
export function everyone(x) {
  return PLATFORMS.map((p) => {
    const { v, notes } = fitted(p, x);
    const result = run(p, v);
    const a = result.display.find((d) => d && d.k === 'amount');
    return { p, result, notes, amount: a ? Number(a.text.replace(/[^\d]/g, '')) : null };
  });
}

/** Seen persona results, with smallest and largest among sites that took the persona's own income. */
export function personaSpread() {
  return AUDIT.personas.map((per) => {
    const vals = Object.entries(per.seen)
      .filter(([, s]) => s.amount !== null && !s.adjusted.monthly_income && !s.adjusted.yearly_profit)
      .map(([id, s]) => ({ id, amount: s.amount }));
    const lo = vals.reduce((m, v) => (v.amount < m.amount ? v : m));
    const hi = vals.reduce((m, v) => (v.amount > m.amount ? v : m));
    return { per, n: vals.length, lo, hi, ratio: lo.amount > 0 ? hi.amount / lo.amount : null };
  });
}
export const nameOf = (id) => byId[id].name;
