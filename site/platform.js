// One platform page: the calculator with the site's own boxes, what the page would show, the rule, and the audit findings.
import { byId, PLATFORMS, run, activeFields } from './platforms.js';
import { h, $, external, readField } from './common.js';
import { inr, formatLimit, dateList } from './fmt.js';

const p = byId[document.body.dataset.platform];
const main = $('main');

const fieldId = (f) => `f-${f.key}`;
function fieldNode(f) {
  const id = fieldId(f);
  if (f.type === 'choice') {
    return h('div', { class: 'field choice', 'data-key': f.key },
      h('label', { for: id }, f.label),
      h('select', { id, 'aria-describedby': f.help ? `${id}-help` : null },
        f.options.map(([v, t]) => h('option', { value: v, selected: v === f.def }, t))),
      f.help ? h('p', { class: 'help', id: `${id}-help` }, f.help) : null);
  }
  const range = `Its box goes from ${formatLimit(f.unit, f.min)} to ${formatLimit(f.unit, f.max)}.`;
  const after = { months: 'months', years: 'years', pct: '% a year' }[f.unit];
  return h('div', { class: 'field', 'data-key': f.key },
    h('label', { for: id }, `${f.label}${f.unit === 'money' ? ' (₹)' : ''}`),
    h('div', { class: `input${f.unit === 'money' ? ' money' : ''}` },
      f.unit === 'money' ? h('span', { class: 'affix', 'aria-hidden': 'true' }, '₹') : null,
      h('input', { id, type: 'text', inputmode: f.decimal ? 'decimal' : 'numeric', value: f.unit === 'money' ? inr(f.def) : String(f.def),
        'data-kind': f.decimal ? 'decimal' : f.unit === 'money' ? 'money' : 'int', 'aria-describedby': `${id}-help ${id}-err`, autocomplete: 'off' }),
      after ? h('span', { class: 'affix after', 'aria-hidden': 'true' }, after) : null),
    h('p', { class: 'help', id: `${id}-help` }, [f.help, range].filter(Boolean).join(' ')),
    h('p', { class: 'err', id: `${id}-err`, 'aria-live': 'polite' }));
}

function displayNode(d) {
  if (!d) return null;
  if (d.k === 'label') return h('p', { class: 'shows-label' }, d.text);
  if (d.k === 'site-text') return h('p', { class: 'site-text' }, d.text);
  if (d.k === 'amount') return h('p', { class: 'amount' }, d.text);
  if (d.k === 'message') return h('p', { class: 'site-error' }, d.text);
  if (d.k === 'muted') return h('p', { class: 'muted small' }, d.text);
  return null;
}

function render() {
  const form = $('calc-form');
  const v = {};
  for (const f of p.fields) {
    const el = $(fieldId(f));
    if (f.type === 'choice') { v[f.key] = el.value; continue; }
    const { value, error } = readField(el);
    v[f.key] = value;
    el.setAttribute('aria-invalid', error ? 'true' : 'false');
    $(`${fieldId(f)}-err`).textContent = error;
  }
  const active = new Set(activeFields(p, v).map((f) => f.key));
  for (const node of form.querySelectorAll('[data-key]')) node.hidden = !active.has(node.dataset.key);
  const r = run(p, v);
  const facts = r.display.filter((d) => d && d.k === 'fact');
  $('shows').replaceChildren(...r.display.filter((d) => d && d.k !== 'fact').map(displayNode),
    facts.length ? h('dl', { class: 'site-facts' }, facts.map((f) => h('div', {}, h('dt', {}, f.dt), h('dd', {}, f.dd)))) : '');
  $('notices').replaceChildren(...r.notices.map((n) => h('p', { class: 'notice' }, n)));
  $('steps').replaceChildren(h('p', {}, r.steps || '—'));
  clearTimeout(render.t);
  render.t = setTimeout(() => { $('announce').textContent = r.display.filter((d) => d && d.text).map((d) => d.text).join(' '); }, 700);
}

function build() {
  document.title = `${p.name}: loan eligibility calculator audit`;
  const c = p.checks;
  const i = PLATFORMS.indexOf(p);
  const prev = PLATFORMS[i - 1]; const next = PLATFORMS[i + 1];
  const comparable = c.checked[1];
  main.append(
    h('div', { class: 'tab-head' },
      h('h1', { tabindex: '-1' }, p.name),
      h('p', { class: 'kind' }, `${p.kind}. Tested on ${dateList(p.testedOn)}. `, external(p.url, 'Open the original calculator')),
      p.notRetested ? h('p', { class: 'notice' }, p.notRetested) : null),

    h('section', { class: 'calc', 'aria-label': 'Recreated calculator' },
      h('form', { class: 'inputs', id: 'calc-form', novalidate: true, autocomplete: 'off' },
        h('fieldset', {}, h('legend', {}, 'What this calculator asks for'),
          h('div', { class: 'field-grid' }, p.fields.map(fieldNode)),
          p.fixedNote ? h('p', { class: 'note small' }, p.fixedNote) : null)),
      h('div', { class: 'result' }, h('div', { class: 'shows', id: 'shows' }), h('div', { class: 'notices', id: 'notices' }))),
    h('div', { class: 'sr-only', id: 'announce', 'aria-live': 'polite', 'aria-atomic': 'true' }),

    h('div', { class: 'explain' },
      h('div', { class: 'explain-block' }, h('h2', { class: 'h3' }, 'How it got this number'), h('div', { id: 'steps' })),
      h('div', { class: 'explain-block' }, h('h2', { class: 'h3' }, 'What’s behind this number'), h('ul', {}, p.behind.map((t) => h('li', {}, t)))),
      h('div', { class: 'explain-block' }, h('h2', { class: 'h3' }, 'What it ignores'), h('ul', {}, p.ignores.map((t) => h('li', {}, t))))),

    h('section', { class: 'section', 'aria-labelledby': 'rule-h' },
      h('h3', { id: 'rule-h' }, 'The rule behind it'),
      h('p', { class: 'formula' }, p.formula),
      h('p', { class: 'small muted' }, 'A(rate, months) is the annuity factor: how many rupees of loan one rupee of monthly EMI repays at that yearly rate over that many months. Monthly figures throughout.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'parts' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Part of the rule'), h('th', { scope: 'col' }, 'How sure'), h('th', { scope: 'col' }, 'Evidence'))),
        h('tbody', {}, p.parts.map((x) => h('tr', {}, h('td', {}, x.what), h('td', {}, h('span', { class: `tag ${x.label}` }, x.label)), h('td', { class: 'muted' }, x.evidence)))))),
      h('p', { class: 'small muted' }, 'seen: observed directly in the probes. inferred: consistent with every probe, but the exact value was not pinned down. unknown: not tested.')),

    h('section', { class: 'section', 'aria-labelledby': 'find-h' },
      h('h3', { id: 'find-h' }, 'What the audit found'),
      h('ul', { class: 'findings' }, p.findings.map(([t, d]) => h('li', {}, h('strong', {}, `${t}. `), d)))),

    h('section', { class: 'section', 'aria-labelledby': 'stats-h' },
      h('h3', { id: 'stats-h' }, 'How well the rule matches'),
      h('p', {}, `Every one of the ${comparable} comparable checks matched what the page showed, to within ₹1.`),
      h('dl', { class: 'stats' },
        h('div', {}, h('dt', {}, 'Rule-building checks'), h('dd', {}, `${c.build[0]}/${c.build[1]}`)),
        h('div', {}, h('dt', {}, 'Held-out checks'), h('dd', {}, `${c.heldOut[0]}/${c.heldOut[1]}`)),
        h('div', {}, h('dt', {}, 'Standard people'), h('dd', {}, c.persona[1] ? `${c.persona[0]}/${c.persona[1]}` : 'not run')),
        h('div', {}, h('dt', {}, 'Not comparable'), h('dd', {}, String(c.notComparable)))),
      c.notComparable ? h('p', { class: 'small muted' }, 'Not comparable: the page showed a warning and kept an old, greyed-out amount, so there was no current answer to compare.') : null,
      h('p', { class: 'small' }, h('a', { href: `data/${p.id}.csv`, download: true }, `Download every check for ${p.name} (CSV)`))),

    h('nav', { class: 'pager', 'aria-label': 'Platforms' },
      prev ? h('a', { href: prev.file }, `← ${prev.name}`) : h('a', { href: 'index.html' }, '← Overview'),
      next ? h('a', { href: next.file }, `${next.name} →`) : h('a', { href: 'compare.html' }, 'Compare all nine →')));

  const form = $('calc-form');
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('focusout', (e) => {
    if (e.target.dataset?.kind !== 'money') return;
    const { value } = readField(e.target);
    if (value !== null) e.target.value = inr(value);
  });
  render();
}

build();
