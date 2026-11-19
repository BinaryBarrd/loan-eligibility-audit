// Front page: disclaimer gate, key takeaways and the directory of the nine platforms.
import { PLATFORMS } from './platforms.js';
import { personaSpread, nameOf } from './people.js';
import { AUDIT } from './audit-data.js';
import * as R from './rules.js';
import { h, $, gate } from './common.js';
import { rs, inr } from './fmt.js';

gate();

const spread = personaSpread();
const withRatio = spread.filter((s) => s.ratio);
const minR = Math.min(...withRatio.map((s) => s.ratio));
const maxR = Math.max(...withRatio.map((s) => s.ratio));
const zeroes = spread.filter((s) => s.lo.amount === 0);
const p2 = spread.find((s) => s.per.id === 'P2');
const T = AUDIT.totals;
const analysed = T.build + T.heldOut + T.persona + T.limit + T.notComparable;
const x = (r) => `${(Math.round(r * 10) / 10).toFixed(1)}×`;

const takeaways = [
  ['Same person, very different answers.',
    `For someone earning ₹${inr(p2.per.monthlyIncome)} a month with ₹${inr(p2.per.existingEmi)} of EMIs, the calculators showed from ${rs(p2.lo.amount)} (${nameOf(p2.lo.id)}) to ${rs(p2.hi.amount)} (${nameOf(p2.hi.id)}). Across 12 standard people, the largest answer was ${x(minR)} to ${x(maxR)} the smallest. For ${zeroes.length} of them one calculator said ₹0 while another said several lakh.`],
  ['Fixed formulas, not AI, and not a credit check.',
    'Every calculator follows one fixed formula, run in your browser. Changing the inputs sends nothing to the company. None of the nine asks for a credit score, though most pages say credit score matters.'],
  ['The assumptions are hidden.',
    `Each one assumes a different interest rate (none for Kotak and Axis; ${R.IDFC.ratePct}% IDFC FIRST; ${R.BAJAJ_ASSUMPTIONS.ratePct}% Bajaj; ${R.POONAWALLA.ratePct}% Poonawalla; ${R.FIBE.ratePct}% Fibe; your own choice on SMFG, Paisabazaar and Aditya Birla) and a different share of income for EMIs (from ${Math.round(R.PAISABAZAAR_ASSUMPTIONS.shareOfIncome * 100)}% to ${Math.round(R.BAJAJ_ASSUMPTIONS.shareOfIncome * 100)}%). No result says which.`],
  ['Some boxes change nothing.',
    'Bajaj’s required city, Kotak’s tenure slider, Poonawalla’s qualification and Aditya Birla’s “EMI you can afford” do not change the eligible amount.'],
  ['Some results are odd.',
    'Bajaj says “You are eligible” for ₹0. Fibe and Poonawalla make the result disappear. Aditya Birla can leave an old amount on screen. Poonawalla’s “monthly payable amount” is the loan amount. Kotak can show a monthly EMI larger than your income.'],
  ['Every rule was checked.',
    `${inr(analysed)} checks across the nine calculators; every comparable one matched what the page showed to within ₹1, including ${T.heldOut} held-out checks not used to build the rules.`],
];

$('takeaways').replaceChildren(...takeaways.map(([t, d]) => h('li', {}, h('strong', {}, t), ' ', d)));
$('cards').replaceChildren(...PLATFORMS.map((p) => h('li', {},
  h('a', { class: 'card', href: p.file },
    h('strong', {}, p.name),
    h('span', { class: 'kindline' }, p.kind),
    h('p', { class: 'rule' }, p.behind[0])))));
