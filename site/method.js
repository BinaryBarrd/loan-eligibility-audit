// Method page: numbers counted from the probe logs (audit-data.js).
import { PLATFORMS } from './platforms.js';
import { AUDIT } from './audit-data.js';
import { h, $ } from './common.js';
import { inr, dateList } from './fmt.js';

const T = AUDIT.totals;
const analysed = T.build + T.heldOut + T.persona + T.limit + T.notComparable;
for (const el of document.querySelectorAll('[data-n]')) {
  const k = el.dataset.n;
  el.textContent = k === 'analysed' ? inr(analysed) : k === 'logged' ? inr(T.logged) : k === 'personas' ? String(AUDIT.personas.length) : inr(T[k]);
}
$('ver-body').replaceChildren(...PLATFORMS.map((p) => {
  const c = p.checks;
  const f = (x) => (x[1] ? `${x[0]}/${x[1]}` : '—');
  return h('tr', {},
    h('th', { scope: 'row' }, h('a', { href: p.file }, p.name)),
    h('td', {}, dateList(p.testedOn)),
    h('td', { class: 'num' }, f(c.build)), h('td', { class: 'num' }, f(c.heldOut)), h('td', { class: 'num' }, f(c.persona)),
    h('td', { class: 'num' }, f(c.limit)), h('td', { class: 'num' }, c.notComparable ? String(c.notComparable) : '—'),
    h('td', {}, h('a', { href: `data/${p.id}.csv`, download: true }, `${p.id}.csv`)));
}));
