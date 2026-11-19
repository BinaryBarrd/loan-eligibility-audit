// Compare page: one person in all nine recreated calculators, and the 12 standard people as seen on the sites.
import { PLATFORMS, run } from './platforms.js';
import { everyone, inputsFor, MAPPING_NOTE, personaSpread, nameOf } from './people.js';
import { AUDIT } from './audit-data.js';
import { h, $, readField } from './common.js';
import { rs, inr } from './fmt.js';

const FIELDS = ['age', 'income', 'emis', 'other', 'years', 'rate'];
function read() {
  const v = {};
  for (const k of FIELDS) {
    const el = $(`c-${k}`);
    const { value, error } = readField(el);
    v[k] = value;
    el.setAttribute('aria-invalid', error ? 'true' : 'false');
    $(`c-${k}-err`).textContent = error;
  }
  v.employment = $('c-employment').value;
  return v;
}

function shown(r) {
  if (r.state === 'incomplete') return h('span', { class: 'muted' }, '—');
  if (r.state === 'out-of-range') return h('span', { class: 'muted' }, 'outside its range');
  const a = r.display.find((d) => d && d.k === 'amount');
  if (a) return h('strong', {}, a.text);
  const m = r.display.find((d) => d && (d.k === 'message' || d.k === 'muted') && d.text !== '—');
  return h('span', {}, m ? m.text : '—');
}

function render() {
  const x = read();
  if (FIELDS.some((k) => x[k] === null)) { $('one-body').replaceChildren(); return; }
  const rows = everyone(x);
  const amounts = rows.filter((r) => r.amount !== null && r.amount > 0).map((r) => r.amount);
  $('one-body').replaceChildren(...rows.map(({ p, result, notes }) => h('tr', {},
    h('th', { scope: 'row', class: 'wrap-cell' }, h('a', { href: p.file }, p.name),
      h('span', { class: 'given' }, [`${MAPPING_NOTE[p.id]}.`, ...notes, ...result.notices].join(' '))),
    h('td', { class: 'num' }, shown(result)))));
  $('one-spread').textContent = amounts.length > 1
    ? `For this person: smallest non-zero amount ${rs(Math.min(...amounts))}, largest ${rs(Math.max(...amounts))}.` : '';
}

for (const k of [...FIELDS, 'employment']) {
  $(`c-${k}`).addEventListener('input', render);
  $(`c-${k}`).addEventListener('change', render);
}
$('compare-form').addEventListener('submit', (e) => e.preventDefault());
render();

// --- 12 standard people, as seen on the sites (19 Nov 2026) ----------------
const SITE_IDS = PLATFORMS.map((p) => p.id).filter((id) => id !== 'paisabazaar');
const spread = Object.fromEntries(personaSpread().map((s) => [s.per.id, s]));
$('people-head').replaceChildren(h('tr', {},
  h('th', { scope: 'col' }, 'Person'),
  ...SITE_IDS.map((id) => h('th', { scope: 'col' }, nameOf(id))),
  h('th', { scope: 'col' }, 'Paisabazaar (rule)'),
  h('th', { scope: 'col' }, 'Largest ÷ smallest')));
const pb = PLATFORMS.find((p) => p.id === 'paisabazaar');
$('people-body').replaceChildren(...AUDIT.personas.map((per) => {
  const x = { age: per.age, income: per.monthlyIncome, emis: per.existingEmi, other: 0, years: AUDIT.personaCommon.tenure_years, rate: AUDIT.personaCommon.rate, employment: per.employment === 'Self-employed' ? 'self' : 'salaried' };
  const pbr = run(pb, inputsFor('paisabazaar', x));
  const s = spread[per.id];
  return h('tr', {},
    h('th', { scope: 'row' }, `${per.id}: age ${per.age}, ${rs(per.monthlyIncome)} income, ${rs(per.existingEmi)} EMIs${per.employment === 'Self-employed' ? ', self-employed' : ''}`),
    ...SITE_IDS.map((id) => {
      const seen = per.seen[id];
      if (!seen) return h('td', {}, '—');
      const adj = seen.adjusted.monthly_income || seen.adjusted.yearly_profit;
      return h('td', { class: 'num' }, seen.amount === null ? h('span', { class: 'muted' }, 'no amount') : rs(seen.amount), adj ? '†' : '');
    }),
    h('td', { class: 'num muted' }, shown(pbr)),
    h('td', { class: 'num' }, s.ratio ? `${(Math.round(s.ratio * 10) / 10).toFixed(1)}×` : `₹0 to ${rs(s.hi.amount)}`));
}));
$('people-note').textContent = `† SMFG’s income box starts at ₹1 lakh, so these people were entered at ₹1 lakh (self-employed: as yearly profit), and SMFG is left out of the ratio for them. `
  + `Every amount shown for the eight sites was seen on the live page on 19 November 2026 and matches the rule. Paisabazaar was not live-tested on these people: its column is what its rule gives (age as listed, ${AUDIT.personaCommon.tenure_years} years, ${AUDIT.personaCommon.rate}%, ₹${inr(AUDIT.personaCommon.desired)} wanted).`;
