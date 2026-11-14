// Page logic: disclaimer gate, three tabs, and one independent form per calculator.
// Every number shown comes from rules.js (results, assumptions, limits) or from what you type.
import {
  BAJAJ_ASSUMPTIONS as BA,
  BAJAJ_LIMITS,
  PAISABAZAAR_ASSUMPTIONS as PA,
  PAISABAZAAR_LIMITS as PL,
  NOT_ELIGIBLE,
  bajajDetails,
  bajajRangeIssues,
  paisabazaarDetails,
  snapPaisabazaarInputs,
} from './rules.js';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const inr = (n) => Math.round(n).toLocaleString('en-IN');
const rs = (n) => `₹${inr(n)}`;
/** ₹10 lakh / ₹50 lakh for round lakhs, otherwise Indian digits (₹25,000). */
const rsShort = (n) => (n >= 100000 && n % 100000 === 0 ? `₹${n / 100000} lakh` : rs(n));
const pct = (x) => `${Math.round(x * 1000) / 10}%`; // share of income → "75%"
const num = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const years = (n) => `${num(n)} ${n === 1 ? 'year' : 'years'}`;

/** Tiny element builder. Children may be strings, nodes, or null. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
const q = (text) => h('q', {}, text);

// ---------------------------------------------------------------------------
// Reading the boxes
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

/** Returns a number, or null with a reason. Accepts digits and Indian/Western commas. */
function readField(el) {
  const raw = el.value.trim();
  if (raw === '') return { value: null, error: 'Enter a number.' };
  const cleaned = raw.replace(/[,\s₹%]/g, '');
  const decimal = el.dataset.kind === 'decimal';
  const ok = decimal ? /^\d+(\.\d+)?$/.test(cleaned) : /^\d+$/.test(cleaned);
  if (!ok) return { value: null, error: decimal ? 'Use digits, with a decimal point if needed.' : 'Use whole numbers only.' };
  return { value: Number(cleaned), error: '' };
}

/** Reads the given boxes, marks invalid ones, and returns { key: number|null }. */
function readForm(fields) {
  const values = {};
  for (const [key, id] of Object.entries(fields)) {
    const el = $(id);
    const { value, error } = readField(el);
    values[key] = value;
    el.setAttribute('aria-invalid', error ? 'true' : 'false');
    const err = $(`${id}-err`);
    if (err.textContent !== error) err.textContent = error;
  }
  return values;
}

const BAJAJ_FIELDS = { income: 'bajaj-income', expense: 'bajaj-expense' };
const PB_FIELDS = {
  age: 'pb-age', income: 'pb-income', emi: 'pb-emi', desired: 'pb-desired', rate: 'pb-rate', tenure: 'pb-tenure',
};

// Helper text under each box, built from the limits in rules.js.
function fillHelpText() {
  const range = (l, f) => `${f(l.min)} to ${f(l.max)}`;
  const help = {
    'bajaj-income': `This calculator accepts ${range(BAJAJ_LIMITS.monthlyIncome, rsShort)}.`,
    'bajaj-expense': `Its page calls this “Monthly Expense”. Accepts ${range(BAJAJ_LIMITS.monthlyExpense, rsShort)}.`,
    'pb-age': `Its slider goes from ${PL.age.min} to ${PL.age.max} years.`,
    'pb-income': `Its slider goes from ${range(PL.monthlyIncome, rsShort)}.`,
    'pb-emi': `Instalments on loans you already have. Its slider goes from ${range(PL.existingEmi, rsShort)}; higher typed values are kept.`,
    'pb-desired': `Its slider goes from ${range(PL.desiredAmount, rsShort)}.`,
    'pb-rate': `Its slider goes from ${PL.ratePct.min}% to ${PL.ratePct.max}%.`,
    'pb-tenure': `How many years you repay over. Its slider goes from ${PL.tenureYears.min} to ${PL.tenureYears.max} years.`,
  };
  for (const [name, text] of Object.entries(help)) {
    document.querySelector(`[data-help="${name}"]`).textContent = text;
  }
  $('bajaj-fixed-note').textContent =
    `There are no boxes for age, interest rate or tenure. It always uses ${BA.ratePct}% a year over ${years(BA.months / 12)}.`;
}

// ---------------------------------------------------------------------------
// Filling a tab
// ---------------------------------------------------------------------------
const slot = (tab, name) => tab.querySelector(`[data-slot="${name}"]`);
function fill(tab, name, ...nodes) {
  slot(tab, name).replaceChildren(...nodes.flat().filter(Boolean));
}

const FIELD_LABEL = {
  age: 'age',
  desiredAmount: 'loan amount',
  ratePct: 'interest rate',
  tenureYears: 'tenure',
  monthlyIncome: 'monthly income',
  existingEmi: 'existing EMIs',
};

/** Format a value of a Paisabazaar field the way a person would read it. */
function fmtField(field, v) {
  if (field === 'age' || field === 'tenureYears') return years(v);
  if (field === 'ratePct') return `${num(v)}%`;
  return rs(v);
}

const leftOver = (taken, room, what) => (taken === 0
  ? `With no ${what}, all ${rs(room)} a month is left for a new instalment.`
  : `Taking away your ${what} of ${rs(taken)} leaves ${rs(room)} a month for a new instalment.`);

const showsLabel = () => h('p', { class: 'shows-label' }, 'The page would show');

// --- Bajaj ------------------------------------------------------------------
const bajajTab = $('bajaj');

function renderBajaj(v) {
  const tab = bajajTab;
  fill(tab, 'behind',
    h('li', {}, h('strong', {}, `Always uses ${BA.ratePct}% and ${years(BA.months / 12)}, whatever rate or tenure you would pick.`),
      ' ', `${BA.ratePct}% is the lowest rate in the range the same page advertises: `,
      q(`${BA.ratePct}% and ${BA.advertisedMaxRatePct}% p.a.`)),
    h('li', {}, `Assumes up to ${pct(BA.shareOfIncome)} of your income can go to monthly instalments plus expenses.`),
    h('li', {}, `Never more than ${BA.incomeMultipleCap} × your monthly income.`));
  fill(tab, 'ignores',
    h('li', {}, 'Your credit score.'),
    h('li', {}, 'Your city. The page has a required ', q('Select City'),
      ' box, but any city (even a made-up one) gives the same amount.'),
    h('li', {}, 'Your age. It does not ask for it.'),
    h('li', {}, 'The interest rate and tenure you would choose. It has no boxes for them.'));

  if (v.income === null || v.expense === null) {
    fill(tab, 'shows', h('p', { class: 'muted' }, 'Fill in both boxes to see the result.'));
    fill(tab, 'notices');
    fill(tab, 'steps', h('p', { class: 'muted' }, '—'));
    return 'Fill in both boxes to see the result.';
  }

  const issues = bajajRangeIssues(v.income, v.expense);
  if (issues.length) {
    const msgs = issues.map((i) => {
      const l = BAJAJ_LIMITS[i.field];
      return i.value < l.min ? l.siteMessageBelow : l.siteMessageAbove;
    });
    fill(tab, 'shows', showsLabel(),
      ...msgs.map((m) => h('p', { class: 'site-error' }, m)),
      h('p', { class: 'muted' }, 'and no amount.'));
    fill(tab, 'notices', issues.map((i) => {
      const l = BAJAJ_LIMITS[i.field];
      return h('p', { class: 'notice' }, i.field === 'monthlyIncome'
        ? `This calculator only accepts monthly income from ${rsShort(l.min)} to ${rsShort(l.max)}.`
        : `This calculator only accepts monthly expenses up to ${rsShort(l.max)}.`);
    }));
    fill(tab, 'steps', h('p', {}, 'The calculator stops here: it shows no amount for these inputs.'));
    return `The page would show ${msgs.join('. ')}, and no amount.`;
  }

  const d = bajajDetails(v.income, v.expense);
  fill(tab, 'shows', showsLabel(),
    h('p', { class: 'site-text' }, 'You are eligible for a personal loan upto'),
    h('p', { class: 'amount' }, rs(d.amount)),
    d.amount === 0 ? h('p', { class: 'muted small' }, 'It still says “You are eligible” when the amount is ₹0.') : null);
  fill(tab, 'notices');

  const start = `${pct(BA.shareOfIncome)} of ${rs(v.income)} is ${rs(d.share)}. `;
  let story;
  if (d.limitedBy === 'no room') {
    story = `${start}Your expenses of ${rs(v.expense)} use all of it, so nothing is left for a new instalment.`;
  } else {
    story = `${start}${leftOver(v.expense, d.room, 'expenses')} `
      + `At ${BA.ratePct}% over ${years(BA.months / 12)}, that repays ${rs(d.byInstalment)}. `
      + (d.limitedBy === 'income cap'
        ? `But the cap of ${BA.incomeMultipleCap} × income is ${rs(d.incomeCap)}, so it shows ${rs(d.amount)}.`
        : `That is below the cap of ${BA.incomeMultipleCap} × income (${rs(d.incomeCap)}), so it shows ${rs(d.amount)}.`);
  }
  fill(tab, 'steps', h('p', {}, story));
  return `The page would show: You are eligible for a personal loan upto ${rs(d.amount)}.`;
}

// --- Paisabazaar --------------------------------------------------------------
const pbTab = $('paisabazaar');

const PB_REASON = {
  [NOT_ELIGIBLE.AGE_BELOW_MINIMUM]: 'your age is lower than the minimum age required',
  [NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM]: 'your age is higher than the maximum age allowed',
  [NOT_ELIGIBLE.AGE_AT_MATURITY]: 'you would exceed the maximum permissible age on maturity',
  [NOT_ELIGIBLE.DEBTS_TOO_HIGH]: 'your existing debts on your current income are higher than the permissible limit',
};

function renderPaisabazaar(v) {
  const tab = pbTab;
  fill(tab, 'behind',
    h('li', {}, `Assumes up to ${pct(PA.shareOfIncome)} of your income can go to monthly instalments, counting the ones you already pay.`),
    h('li', {}, `Never more than ${PA.incomeMultipleCap} × your monthly income, and never more than the amount you asked for.`),
    h('li', {}, h('strong', {}, `Repays over at most ${years(PA.maxTenureYears)},`),
      ` even though its tenure slider goes up to ${years(PL.tenureYears.max)}.`),
    h('li', {}, `The loan must end by age ${PA.maxAgeAtEnd}.`),
    h('li', {}, `Minimum age ${PA.minAge}, although its age slider starts at ${PL.age.min}.`),
    h('li', {}, 'Uses the interest rate you pick.'));
  fill(tab, 'ignores',
    h('li', {}, 'Your credit score.'),
    h('li', {}, 'Your employment type and monthly expenses. The page says it estimates ',
      q('based on your income, employment type, monthly expenses and more'),
      ', but it does not ask for either.'));

  if (Object.values(v).some((x) => x === null)) {
    fill(tab, 'shows', h('p', { class: 'muted' }, 'Fill in all six boxes to see the result.'));
    fill(tab, 'notices');
    fill(tab, 'steps', h('p', { class: 'muted' }, '—'));
    return 'Fill in all six boxes to see the result.';
  }

  const typed = {
    age: v.age, desiredAmount: v.desired, ratePct: v.rate, tenureYears: v.tenure,
    monthlyIncome: v.income, existingEmi: v.emi,
  };
  const { values: s, changes, kept } = snapPaisabazaarInputs(typed);

  fill(tab, 'notices',
    ...changes.map((c) => {
      if (c.why === 'above income') {
        return h('p', { class: 'notice' },
          `This calculator changes existing EMIs above your monthly income to equal your income, so this result uses ${fmtField(c.field, c.to)}.`);
      }
      const l = PL[c.field];
      return h('p', { class: 'notice' },
        `This calculator’s ${FIELD_LABEL[c.field]} slider goes from ${fmtField(c.field, l.min)} to ${fmtField(c.field, l.max)}. `
        + `It changes ${fmtField(c.field, c.from)} to ${fmtField(c.field, c.to)}, so this result uses ${fmtField(c.field, c.to)}.`);
    }),
    ...kept.map((k) => h('p', { class: 'notice' },
      `This calculator’s ${FIELD_LABEL[k.field]} slider stops at ${rs(k.max)}, but it keeps higher typed values, so this result uses ${rs(k.value)}.`)));

  const d = paisabazaarDetails(s.age, s.desiredAmount, s.ratePct, s.tenureYears, s.monthlyIncome, s.existingEmi);

  if (!d.eligible) {
    const text = `Unfortunately, you may not be eligible for most loan offers, as ${PB_REASON[d.reason]}.`;
    fill(tab, 'shows', showsLabel(), h('p', { class: 'site-text' }, text));
    let story;
    if (d.reason === NOT_ELIGIBLE.AGE_BELOW_MINIMUM) story = `Its minimum age is ${PA.minAge}.`;
    else if (d.reason === NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM) story = `The loan must end by age ${PA.maxAgeAtEnd}, and you are above it.`;
    else if (d.reason === NOT_ELIGIBLE.AGE_AT_MATURITY) story = `The loan must end by age ${PA.maxAgeAtEnd}, which leaves no time to repay.`;
    else story = `${pct(PA.shareOfIncome)} of ${rs(s.monthlyIncome)} is ${rs(d.share)}. Your EMIs of ${rs(s.existingEmi)} use all of it, so nothing is left for a new instalment.`;
    fill(tab, 'steps', h('p', {}, story));
    return `The page would show: ${text}`;
  }

  fill(tab, 'shows', showsLabel(),
    h('p', { class: 'site-text' }, 'You are eligible for'),
    h('p', { class: 'amount' }, rs(d.amount)),
    h('dl', { class: 'site-facts' },
      h('div', {}, h('dt', {}, 'Estimated EMI'), h('dd', {}, rs(d.emi))),
      h('div', {}, h('dt', {}, 'Number of EMI'), h('dd', {}, String(d.numberOfEmis))),
      h('div', {}, h('dt', {}, 'Eligible Tenure'), h('dd', {}, `${d.years} ${d.years === 1 ? 'Year' : 'Years'}`))));

  let tenure = '';
  if (d.tenureLimitedBy === '5-year cap') {
    tenure = `You picked ${years(d.chosenYears)}, but it uses ${years(d.years)} (its ${PA.maxTenureYears}-year cap). `;
  } else if (d.tenureLimitedBy === 'age 60') {
    tenure = `You picked ${years(d.chosenYears)}, but it uses ${years(d.years)}, because the loan must end by age ${PA.maxAgeAtEnd}. `;
  }
  const limits = [
    ['instalment', `${rs(d.byInstalment)} (what the instalment repays)`],
    ['income cap', `${rs(d.incomeCap)} (${PA.incomeMultipleCap} × income)`],
    ['desired', `${rs(d.desired)} (what you asked for)`],
  ];
  const others = limits.filter(([k]) => k !== d.limitedBy).map(([, t]) => t).join(' and ');
  const story = `${pct(PA.shareOfIncome)} of ${rs(s.monthlyIncome)} is ${rs(d.share)}. `
    + `${leftOver(s.existingEmi, d.room, 'EMIs')} `
    + tenure
    + `At ${num(s.ratePct)}% over ${years(d.years)}, that repays ${rs(d.byInstalment)}. `
    + (d.limitedBy === 'instalment'
      ? `The other limits are ${others}, so it shows the lowest: ${rs(d.amount)}.`
      : `But ${limits.find(([k]) => k === d.limitedBy)[1]} is lower, so it shows ${rs(d.amount)}.`);
  fill(tab, 'steps', h('p', {}, story));
  return `The page would show: You are eligible for ${rs(d.amount)}.`;
}

// --- Screen-reader summary per tab (debounced so it is not read on every key press) ---
const timers = new WeakMap();
function announce(tab, text) {
  clearTimeout(timers.get(tab));
  timers.set(tab, setTimeout(() => { slot(tab, 'announce').textContent = text; }, 700));
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
function updateBajaj() { announce(bajajTab, renderBajaj(readForm(BAJAJ_FIELDS))); }
function updatePaisabazaar() { announce(pbTab, renderPaisabazaar(readForm(PB_FIELDS))); }

for (const [formId, update] of [['form-bajaj', updateBajaj], ['form-pb', updatePaisabazaar]]) {
  const form = $(formId);
  form.addEventListener('input', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  // Tidy money boxes into Indian format (20,00,000) when you leave them.
  form.addEventListener('focusout', (e) => {
    if (e.target.dataset?.kind !== 'money') return;
    const { value } = readField(e.target);
    if (value !== null) e.target.value = inr(value);
  });
}

// ---------------------------------------------------------------------------
// Disclaimer gate and tabs. Nothing is stored: the disclaimer shows on every visit.
// ---------------------------------------------------------------------------
const TABS = ['bajaj', 'paisabazaar', 'compare'];
const app = $('app');
const disclaimer = $('disclaimer');

function showTab(id, { focus = false } = {}) {
  const current = TABS.includes(id) ? id : TABS[0];
  for (const t of TABS) $(t).hidden = t !== current;
  for (const link of document.querySelectorAll('[data-tab]')) {
    if (link.dataset.tab === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (focus) {
    window.scrollTo(0, 0);
    $(current).querySelector('h2').focus({ preventScroll: true });
  }
}

$('continue').addEventListener('click', () => {
  disclaimer.hidden = true;
  app.hidden = false;
  showTab(location.hash.slice(1), { focus: true });
});

window.addEventListener('hashchange', () => {
  if (app.hidden) return; // still on the disclaimer
  showTab(location.hash.slice(1), { focus: true });
});

fillHelpText();
updateBajaj();
updatePaisabazaar();
