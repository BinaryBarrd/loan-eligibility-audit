// Page logic for "Try it yourself": reads the form, runs the two rules, fills the cards.
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
/** ₹10 lakh / ₹50 lakh for round lakhs, otherwise ₹25,000 style. */
const rsShort = (n) => (n >= 100000 && n % 100000 === 0 ? `₹${n / 100000} lakh` : rs(n));
const pct = (x) => `${Math.round(x * 1000) / 10}%`; // 0.75 → "75%"
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
const leftOver = (emi, room) => (emi === 0
  ? `With no EMIs, all ${rs(room)} a month is left for a new instalment.`
  : `Taking away your EMIs of ${rs(emi)} leaves ${rs(room)} a month for a new instalment.`);

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
const FIELDS = {
  income: { money: true },
  emi: { money: true },
  age: {},
  desired: { money: true },
  rate: { decimal: true },
  tenure: {},
};

const form = document.getElementById('person');
const input = (name) => document.getElementById(name);

/** Returns a number, or null with a reason. Accepts digits and Indian/Western commas. */
function readField(name) {
  const raw = input(name).value.trim();
  if (raw === '') return { value: null, error: 'Enter a number.' };
  const cleaned = raw.replace(/[,\s₹%]/g, '');
  const ok = FIELDS[name].decimal ? /^\d+(\.\d+)?$/.test(cleaned) : /^\d+$/.test(cleaned);
  if (!ok) return { value: null, error: FIELDS[name].decimal ? 'Use digits, with a decimal point if needed.' : 'Use whole numbers only.' };
  return { value: Number(cleaned), error: '' };
}

function readForm() {
  const values = {};
  for (const name of Object.keys(FIELDS)) {
    const { value, error } = readField(name);
    values[name] = value;
    input(name).setAttribute('aria-invalid', error ? 'true' : 'false');
    const err = document.getElementById(`${name}-err`);
    if (err.textContent !== error) err.textContent = error;
  }
  return values;
}

// Helper text under each box, built from the limits in rules.js.
function fillHelpText() {
  const range = (l, f) => `${f(l.min)} to ${f(l.max)}`;
  const help = {
    income: `Bajaj Finserv accepts ${range(BAJAJ_LIMITS.monthlyIncome, rsShort)}. Paisabazaar’s slider goes from ${range(PL.monthlyIncome, rsShort)}.`,
    emi: `Monthly instalments on loans you already have. Paisabazaar’s slider goes from ${range(PL.existingEmi, rsShort)}; higher typed values are kept.`,
    age: `Paisabazaar’s slider goes from ${PL.age.min} to ${PL.age.max} years.`,
    desired: `Paisabazaar’s slider goes from ${range(PL.desiredAmount, rsShort)}.`,
    rate: `The yearly interest rate. Paisabazaar’s slider goes from ${PL.ratePct.min}% to ${PL.ratePct.max}%.`,
    tenure: `How many years you repay over. Paisabazaar’s slider goes from ${PL.tenureYears.min} to ${PL.tenureYears.max} years.`,
  };
  for (const [name, text] of Object.entries(help)) {
    document.querySelector(`[data-help="${name}"]`).textContent = text;
  }
  document.getElementById('bajaj-fixed-note').textContent =
    `Bajaj Finserv has no boxes for these. It always uses ${BA.ratePct}% and ${years(BA.months / 12)}.`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
const slot = (card, name) => card.querySelector(`[data-slot="${name}"]`);
function fill(card, name, ...nodes) {
  slot(card, name).replaceChildren(...nodes.flat().filter(Boolean));
}

const FIELD_LABEL = {
  monthlyIncome: 'monthly income',
  monthlyExpense: 'monthly expenses',
  age: 'age',
  desiredAmount: 'loan amount',
  ratePct: 'interest rate',
  tenureYears: 'tenure',
  existingEmi: 'existing EMIs',
};

/** Format a value of a Paisabazaar field the way a person would read it. */
function fmtField(field, v) {
  if (field === 'age') return years(v);
  if (field === 'tenureYears') return years(v);
  if (field === 'ratePct') return `${num(v)}%`;
  return rs(v);
}

// --- Bajaj ------------------------------------------------------------------
const bajajCard = document.getElementById('card-bajaj');

function renderBajaj(v) {
  const card = bajajCard;
  const behind = [
    h('li', {}, h('strong', {}, `Always uses ${BA.ratePct}% and ${years(BA.months / 12)}, whatever rate or tenure you pick.`),
      ' ', `${BA.ratePct}% is the lowest rate in the range the same page advertises: `,
      q(`${BA.ratePct}% and ${BA.advertisedMaxRatePct}% p.a.`)),
    h('li', {}, `Assumes up to ${pct(BA.shareOfIncome)} of your income can go to monthly instalments plus expenses.`),
    h('li', {}, `Never more than ${BA.incomeMultipleCap} × your monthly income.`),
  ];
  const ignores = [
    h('li', {}, 'Your credit score.'),
    h('li', {}, 'Your city. The page has a required ', q('Select City'),
      ' box, but any city (even a made-up one) gives the same amount.'),
    h('li', {}, 'Your age. It does not ask for it.'),
    h('li', {}, 'The interest rate and tenure you would choose. It has no boxes for them.'),
  ];
  fill(card, 'behind', behind);
  fill(card, 'ignores', ignores);

  if (v.income === null || v.emi === null) {
    fill(card, 'shows', h('p', { class: 'muted' }, 'Fill in monthly income and EMIs to see this result.'));
    fill(card, 'notices');
    fill(card, 'steps');
    return { state: 'missing' };
  }

  const issues = bajajRangeIssues(v.income, v.emi);
  if (issues.length) {
    const notices = issues.map((i) => {
      const l = BAJAJ_LIMITS[i.field];
      const text = i.field === 'monthlyIncome'
        ? `This calculator only accepts monthly income from ${rsShort(l.min)} to ${rsShort(l.max)}.`
        : `This calculator only accepts monthly expenses up to ${rsShort(l.max)}.`;
      return h('p', { class: 'notice' }, text);
    });
    const msgs = issues.map((i) => {
      const l = BAJAJ_LIMITS[i.field];
      return i.value < l.min ? l.siteMessageBelow : l.siteMessageAbove;
    });
    fill(card, 'shows',
      h('p', { class: 'shows-label' }, 'The page would show'),
      ...msgs.map((m) => h('p', { class: 'site-error' }, m)),
      h('p', { class: 'muted' }, 'and no amount.'));
    fill(card, 'notices', notices);
    fill(card, 'steps');
    return { state: 'rejected', say: `${msgs.join('. ')}, and no amount` };
  }

  const d = bajajDetails(v.income, v.emi);
  fill(card, 'shows',
    h('p', { class: 'shows-label' }, 'The page would show'),
    h('p', { class: 'site-text' }, 'You are eligible for a personal loan upto'),
    h('p', { class: 'amount' }, rs(d.amount)),
    d.amount === 0 ? h('p', { class: 'muted small' }, 'It still says “You are eligible” when the amount is ₹0.') : null);
  fill(card, 'notices');

  const start = `${pct(BA.shareOfIncome)} of ${rs(v.income)} is ${rs(d.share)}. `;
  let story;
  if (d.limitedBy === 'no room') {
    story = `${start}Your EMIs of ${rs(v.emi)} use all of it, so nothing is left for a new instalment.`;
  } else {
    story = `${start}${leftOver(v.emi, d.room)} `
      + `At ${BA.ratePct}% over ${years(BA.months / 12)}, that repays ${rs(d.byInstalment)}. `
      + (d.limitedBy === 'income cap'
        ? `But the cap of ${BA.incomeMultipleCap} × income is ${rs(d.incomeCap)}, so it shows ${rs(d.amount)}.`
        : `That is below the cap of ${BA.incomeMultipleCap} × income (${rs(d.incomeCap)}), so it shows ${rs(d.amount)}.`);
  }
  fill(card, 'steps', h('p', { class: 'steps-label' }, 'For your numbers'), h('p', {}, story));
  return { state: 'eligible', amount: d.amount, say: `You are eligible for a personal loan upto ${rs(d.amount)}` };
}

// --- Paisabazaar --------------------------------------------------------------
const pbCard = document.getElementById('card-pb');

const PB_REASON = {
  [NOT_ELIGIBLE.AGE_BELOW_MINIMUM]: 'your age is lower than the minimum age required',
  [NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM]: 'your age is higher than the maximum age allowed',
  [NOT_ELIGIBLE.AGE_AT_MATURITY]: 'you would exceed the maximum permissible age on maturity',
  [NOT_ELIGIBLE.DEBTS_TOO_HIGH]: 'your existing debts on your current income are higher than the permissible limit',
};

function renderPaisabazaar(v) {
  const card = pbCard;
  const behind = [
    h('li', {}, `Assumes up to ${pct(PA.shareOfIncome)} of your income can go to monthly instalments, counting the ones you already pay.`),
    h('li', {}, `Never more than ${PA.incomeMultipleCap} × your monthly income, and never more than the amount you asked for.`),
    h('li', {}, h('strong', {}, `Repays over at most ${years(PA.maxTenureYears)},`),
      ` even though its tenure slider goes up to ${years(PL.tenureYears.max)}.`),
    h('li', {}, `The loan must end by age ${PA.maxAgeAtEnd}.`),
    h('li', {}, `Minimum age ${PA.minAge}, although its age slider starts at ${PL.age.min}.`),
    h('li', {}, 'Uses the interest rate you pick.'),
  ];
  const ignores = [
    h('li', {}, 'Your credit score.'),
    h('li', {}, 'Your employment type and monthly expenses. The page says it estimates ',
      q('based on your income, employment type, monthly expenses and more'),
      ', but it does not ask for either.'),
  ];
  fill(card, 'behind', behind);
  fill(card, 'ignores', ignores);

  if (Object.values(v).some((x) => x === null)) {
    fill(card, 'shows', h('p', { class: 'muted' }, 'Fill in all six boxes to see this result.'));
    fill(card, 'notices');
    fill(card, 'steps');
    return { state: 'missing' };
  }

  const typed = {
    age: v.age, desiredAmount: v.desired, ratePct: v.rate, tenureYears: v.tenure,
    monthlyIncome: v.income, existingEmi: v.emi,
  };
  const { values: s, changes, kept } = snapPaisabazaarInputs(typed);

  const notices = [
    ...changes.map((c) => {
      const label = FIELD_LABEL[c.field];
      if (c.why === 'above income') {
        return h('p', { class: 'notice' },
          `This calculator changes existing EMIs above your monthly income to equal your income, so this result uses ${fmtField(c.field, c.to)}.`);
      }
      const l = PL[c.field];
      return h('p', { class: 'notice' },
        `This calculator’s ${label} slider goes from ${fmtField(c.field, l.min)} to ${fmtField(c.field, l.max)}. `
        + `It changes ${fmtField(c.field, c.from)} to ${fmtField(c.field, c.to)}, so this result uses ${fmtField(c.field, c.to)}.`);
    }),
    ...kept.map((k) => h('p', { class: 'notice' },
      `This calculator’s ${FIELD_LABEL[k.field]} slider stops at ${rs(k.max)}, but it keeps higher typed values, so this result uses ${rs(k.value)}.`)),
  ];
  fill(card, 'notices', notices);

  const d = paisabazaarDetails(s.age, s.desiredAmount, s.ratePct, s.tenureYears, s.monthlyIncome, s.existingEmi);

  if (!d.eligible) {
    fill(card, 'shows',
      h('p', { class: 'shows-label' }, 'The page would show'),
      h('p', { class: 'site-text' }, `Unfortunately, you may not be eligible for most loan offers, as ${PB_REASON[d.reason]}.`));
    let story;
    if (d.reason === NOT_ELIGIBLE.AGE_BELOW_MINIMUM) story = `Its minimum age is ${PA.minAge}.`;
    else if (d.reason === NOT_ELIGIBLE.AGE_ABOVE_MAXIMUM) story = `The loan must end by age ${PA.maxAgeAtEnd}, and you are above it.`;
    else if (d.reason === NOT_ELIGIBLE.AGE_AT_MATURITY) story = `The loan must end by age ${PA.maxAgeAtEnd}, which leaves no time to repay.`;
    else story = `${pct(PA.shareOfIncome)} of ${rs(s.monthlyIncome)} is ${rs(d.share)}. Your EMIs of ${rs(s.existingEmi)} use all of it, so nothing is left for a new instalment.`;
    fill(card, 'steps', h('p', { class: 'steps-label' }, 'For your numbers'), h('p', {}, story));
    return { state: 'not eligible', say: `may not be eligible for most loan offers, as ${PB_REASON[d.reason]}` };
  }

  fill(card, 'shows',
    h('p', { class: 'shows-label' }, 'The page would show'),
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
    + `${leftOver(s.existingEmi, d.room)} `
    + tenure
    + `At ${num(s.ratePct)}% over ${years(d.years)}, that repays ${rs(d.byInstalment)}. `
    + (d.limitedBy === 'instalment'
      ? `The other limits are ${others}, so it shows the lowest: ${rs(d.amount)}.`
      : `But ${limits.find(([k]) => k === d.limitedBy)[1]} is lower, so it shows ${rs(d.amount)}.`);
  fill(card, 'steps', h('p', { class: 'steps-label' }, 'For your numbers'), h('p', {}, story));
  return { state: 'eligible', amount: d.amount, say: `You are eligible for ${rs(d.amount)}` };
}

// --- Difference ---------------------------------------------------------------
function renderDifference(b, p) {
  const el = document.getElementById('difference');
  let text;
  if (b.state === 'missing' || p.state === 'missing') {
    text = 'Fill in the boxes above to compare the two.';
  } else if (b.state === 'rejected') {
    text = 'Bajaj Finserv shows no amount for these inputs, so there is nothing to compare.';
  } else if (b.state === 'eligible' && p.state === 'eligible') {
    const diff = Math.abs(b.amount - p.amount);
    if (diff === 0) text = 'Difference between the two: ₹0. Both show the same amount.';
    else {
      const higher = b.amount > p.amount ? 'Bajaj Finserv' : 'Paisabazaar';
      text = `Difference between the two: ${rs(diff)}. ${higher} shows more.`;
    }
  } else {
    text = 'One says “You are eligible”, the other says not eligible.';
  }
  el.textContent = text;
  return text;
}

// --- Screen-reader summary (debounced so it is not read on every key press) ---
let announceTimer;
function announce(b, p, diff) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    const parts = b.say && p.say ? [`Bajaj Finserv: ${b.say}.`, `Paisabazaar: ${p.say}.`] : [];
    document.getElementById('announce').textContent = [...parts, diff].join(' ');
  }, 700);
}

// ---------------------------------------------------------------------------
function update() {
  const v = readForm();
  const b = renderBajaj(v);
  const p = renderPaisabazaar(v);
  announce(b, p, renderDifference(b, p));
}

form.addEventListener('input', update);
form.addEventListener('submit', (e) => e.preventDefault());
// Tidy money boxes into Indian format (20,00,000) when you leave them.
form.addEventListener('focusout', (e) => {
  const name = e.target.id;
  if (!FIELDS[name]?.money) return;
  const { value } = readField(name);
  if (value !== null) e.target.value = inr(value);
});

fillHelpText();
update();
