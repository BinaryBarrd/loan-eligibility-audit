// Prints, as JSON, the HTML for the parts of the overview and method pages that are worked out from
// the rules and the audit data. build_pages.py writes it straight into the pages, so they show at once.
import { PLATFORMS } from '../site/platforms.js';
import { personaSpread, nameOf } from '../site/people.js';
import { AUDIT } from '../site/audit-data.js';
import * as R from '../site/rules.js';
import { rs, inr, dateList } from '../site/fmt.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    `For someone earning ₹${inr(p2.per.monthlyIncome)} a month with ₹${inr(p2.per.existingEmi)} of EMIs, the calculators showed from ${rs(p2.lo.amount)} (${nameOf(p2.lo.id)}) to ${rs(p2.hi.amount)} (${nameOf(p2.hi.id)}). Across ${AUDIT.personas.length} standard people, the largest answer was ${x(minR)} to ${x(maxR)} the smallest. For ${zeroes.length} of them one calculator said ₹0 while another said several lakh.`],
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

const f = (v) => (v[1] ? `${v[0]}/${v[1]}` : '—');
const out = {
  takeaways: takeaways.map(([t, d]) => `<li><strong>${esc(t)}</strong> ${esc(d)}</li>`).join('\n          '),
  cards: PLATFORMS.map((p) => `<li><a class="card" href="${p.file}"><strong>${esc(p.name)}</strong><span class="kindline">${esc(p.kind)}</span><p class="rule">${esc(p.behind[0])}</p></a></li>`).join('\n          '),
  verification: PLATFORMS.map((p) => {
    const c = p.checks;
    return `<tr><th scope="row"><a href="${p.file}">${esc(p.name)}</a></th><td>${esc(dateList(p.testedOn))}</td>`
      + `<td class="num">${f(c.build)}</td><td class="num">${f(c.heldOut)}</td><td class="num">${f(c.persona)}</td><td class="num">${f(c.limit)}</td>`
      + `<td class="num">${c.notComparable || '—'}</td><td><a href="data/${p.id}.csv" download>${p.id}.csv</a></td></tr>`;
  }).join('\n            '),
  n: { analysed: inr(analysed), build: inr(T.build), heldOut: inr(T.heldOut), persona: inr(T.persona), notComparable: inr(T.notComparable) },
};
process.stdout.write(JSON.stringify(out));
