// The study's six screens. The nine amounts come from the server (/api/results);
// this page holds no formulas. Nothing is stored in the browser except, at the end, an "answered" flag.
import { BACKGROUND, NUMBERS, CHOICE, AFTER, PNTS, SELF_EMPLOYED, TEXT_LIMIT, TEXT_HELP } from './questions.js';
import { buildRecord } from './record.js';

const $ = (id) => document.getElementById(id);
const rs = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

const state = { screen: 1, numbers: null, cards: null, answers: {}, finished: false };

// ---------------------------------------------------------------------------
// Moving between screens
// ---------------------------------------------------------------------------
function show(n) {
  for (const s of document.querySelectorAll('[data-screen]')) s.hidden = Number(s.dataset.screen) !== n;
  state.screen = n;
  window.scrollTo(0, 0);
  $(`h1-s${n}`).focus();
}
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show(Number(b.dataset.back)));

// A five-part bar under each "Step N of 5", filled up to N. The words stay for screen readers.
for (const p of document.querySelectorAll('.step')) {
  const [, n, of] = p.textContent.match(/Step (\d+) of (\d+)/).map(Number);
  p.after(h('div', { class: 'bar', 'aria-hidden': 'true' },
    Array.from({ length: of }, (_, i) => h('span', { class: i < n ? 'on' : null }))));
}

window.addEventListener('beforeunload', (e) => {
  if (state.screen > 1 && !state.finished) { e.preventDefault(); e.returnValue = ''; }
});

// ---------------------------------------------------------------------------
// Drawing questions from questions.js
// ---------------------------------------------------------------------------
function optionLabel(type, name, value, label, extra) {
  return h('label', { class: 'option' }, h('input', { type, name, value }), h('span', { text: label }), extra || null);
}

function otherBox(q) {
  const id = `${q.key}_other`;
  return h('div', { class: 'other-text', id: `w-${id}`, hidden: true },
    h('label', { class: 'sr-only', for: id, text: `${q.text}: other, in your own words` }),
    h('input', { class: 'text', type: 'text', id, name: id, maxlength: TEXT_LIMIT, autocomplete: 'off', placeholder: 'In your own words (optional)' }),
    h('p', { class: 'q-help', text: TEXT_HELP }));
}

function question(q) {
  if (q.group) return [h('h2', { text: q.group }), ...(q.help ? [h('p', { class: 'muted', text: q.help })] : [])];
  const legend = h('legend', {}, q.statement ? h('span', { class: 'statement', text: `“${q.text}”` }) : q.text);
  const fs = h('fieldset', { id: `f-${q.key}`, 'aria-describedby': `e-${q.key}` }, legend);
  // "Prefer not to say" is a full answer like any other, drawn with a dashed edge so it reads as the way to skip.
  const skip = (type) => { const l = optionLabel(type, q.key, PNTS, PNTS); l.classList.add('skip'); return l; };
  if (q.kind === 'scale') {
    fs.append(
      h('div', { class: 'scale' }, [1, 2, 3, 4, 5].map((v) => optionLabel('radio', q.key, String(v), String(v)))),
      h('p', { class: 'scale-ends', 'aria-hidden': 'true' }, h('span', { text: `1 = ${q.ends[0]}` }), h('span', { text: `5 = ${q.ends[1]}` })),
      h('p', { class: 'sr-only', text: `1 means ${q.ends[0]}, 5 means ${q.ends[1]}.` }));
    if (q.pnts) fs.append(h('div', { class: 'options skip-row' }, skip('radio')));
  } else {
    const type = q.kind === 'checks' ? 'checkbox' : 'radio';
    if (type === 'radio' && q.options.every((o) => o.length <= 12)) {
      // Short answers (Yes, No, Not sure) share one row, "Prefer not to say" included where it fits.
      fs.append(h('div', { class: 'options row' }, q.options.map((o) => optionLabel(type, q.key, o, o)), q.pnts ? skip(type) : null));
    } else {
      const cls = q.options.length > 4 ? 'options long' : 'options';
      fs.append(h('div', { class: cls }, q.options.map((o) => optionLabel(type, q.key, o, o)), q.pnts ? skip(type) : null));
    }
    if (q.other) fs.append(otherBox(q));
  }
  fs.append(h('p', { class: 'q-error', id: `e-${q.key}` }));
  if (q.other) fs.addEventListener('change', () => { $(`w-${q.key}_other`).hidden = !checked(fs, q.key).includes('Other'); });
  return fs;
}

const checked = (root, name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

/** Reads and checks the questions; returns true when all required ones are answered. */
function collect(form, questions, errorId) {
  let first = null;
  for (const q of questions) {
    if (!q.key) continue;
    const fs = $(`f-${q.key}`);
    if (!fs || fs.hidden) { delete state.answers[q.key]; delete state.answers[`${q.key}_other`]; continue; }
    const values = checked(form, q.key);
    const missing = values.length === 0;
    $(`e-${q.key}`).textContent = missing ? (q.kind === 'checks' ? 'Please pick at least one.' : 'Please pick one.') : '';
    fs.querySelectorAll('input').forEach((i) => i.setAttribute('aria-invalid', missing ? 'true' : 'false'));
    if (missing && !first) first = fs;
    state.answers[q.key] = q.kind === 'checks' ? values : (q.kind === 'scale' && values[0] !== PNTS ? Number(values[0]) : values[0]);
    if (q.other) {
      const text = values.includes('Other') ? form.elements[`${q.key}_other`].value.trim().slice(0, TEXT_LIMIT) : '';
      if (text) state.answers[`${q.key}_other`] = text; else delete state.answers[`${q.key}_other`];
    }
  }
  $(errorId).textContent = first ? 'Some questions still need an answer. They are marked below each question.' : '';
  if (first) { first.scrollIntoView({ block: 'center' }); first.querySelector('input').focus({ preventScroll: true }); }
  return !first;
}

// ---------------------------------------------------------------------------
// Screen 1: consent
// ---------------------------------------------------------------------------
$('f1').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const ok = f.elements.adult.checked && f.elements.agree.checked;
  $('e-consent').textContent = ok ? '' : 'Please tick both boxes to take part.';
  if (ok) show(2); else f.elements[f.elements.adult.checked ? 'agree' : 'adult'].focus();
});

// ---------------------------------------------------------------------------
// Screen 2: about you
// ---------------------------------------------------------------------------
/** Screen 2's questions in their groups (Background, Your experience, …), each a section of its own. */
function groups(list) {
  const out = [];
  for (const q of list) if (q.group) out.push({ ...q, items: [] }); else out[out.length - 1].items.push(q);
  return out;
}
$('q-background').append(...groups(BACKGROUND).map((g, i) => h('section', { class: 'qgroup', 'aria-labelledby': `g-${i}` },
  h('div', { class: 'qgroup-head' },
    h('h2', { id: `g-${i}` }, h('span', { text: g.group })),
    h('p', { class: 'qgroup-count', text: `${g.items.length} questions` })),
  g.help ? h('p', { class: 'qgroup-help', text: g.help }) : null,
  ...g.items.map(question))));
$('f2').addEventListener('submit', (e) => {
  e.preventDefault();
  if (collect(e.currentTarget, BACKGROUND, 'e-f2')) show(3);
});

// ---------------------------------------------------------------------------
// Screen 3: numbers
// ---------------------------------------------------------------------------
const RULES = {
  income: { min: 0, max: 100000000 }, emis: { min: 0, max: 100000000 }, other: { min: 0, max: 100000000 },
  wanted: { min: 1, max: 100000000 }, age: { min: 18, max: 99 }, years: { min: 1, max: 10 }, rate: { min: 1, max: 40, decimal: true },
};
$('q-numbers').append(...NUMBERS.map((f) => {
  const id = `n-${f.key}`;
  const money = f.unit === '₹';
  const input = h('input', {
    id, name: f.key, type: 'text', inputmode: f.decimal ? 'decimal' : 'numeric', autocomplete: 'off',
    'aria-describedby': `${f.help ? `${id}-help ` : ''}${id}-err`,
  });
  if (f.def !== undefined) input.value = String(f.def);
  if (money) input.addEventListener('blur', () => { const v = parse(input.value); if (v !== null && Number.isInteger(v)) input.value = v.toLocaleString('en-IN'); });
  const box = h('div', { class: 'input' }, money ? h('span', { 'aria-hidden': 'true', text: '₹' }) : null, input, money ? null : h('span', { 'aria-hidden': 'true', text: f.unit }));
  return h('div', { class: 'field' },
    h('label', { for: id, text: f.label }),
    f.help ? h('p', { class: 'q-help', id: `${id}-help`, text: f.help }) : null,
    box,
    h('p', { class: 'q-error', id: `${id}-err` }));
}));

function parse(text) {
  const t = String(text).replace(/[₹,\s]/g, '');
  if (t === '' || !/^\d*\.?\d+$/.test(t)) return null;
  return Number(t);
}

/** Exact age outside the age group chosen on screen 2: a gentle note, not an error. */
function ageNote(age) {
  const g = state.answers.q1;
  if (!g) return '';
  const [lo, hi] = g === 'Over 60' ? [61, 200] : g.split('–').map(Number);
  return age < lo || age > hi ? `This is outside the age group you chose (${g}). You can change either.` : '';
}

$('f3').addEventListener('submit', async (e) => {
  e.preventDefault();
  const numbers = {};
  let first = null;
  for (const f of NUMBERS) {
    const el = $(`n-${f.key}`);
    const v = parse(el.value);
    const r = RULES[f.key];
    let err = '';
    if (v === null) err = 'Please type a number.';
    else if (!r.decimal && !Number.isInteger(v)) err = 'Please type a whole number.';
    else if (v < r.min || v > r.max) err = f.unit === '₹' ? `Please type an amount from ${rs(r.min)} to ${rs(r.max)}.` : `Please type a number from ${r.min} to ${r.max}.`;
    $(`n-${f.key}-err`).textContent = err;
    el.setAttribute('aria-invalid', err ? 'true' : 'false');
    if (err && !first) first = el;
    numbers[f.key] = v;
  }
  if (first) { $('e-f3').textContent = 'Some figures need a change. They are marked below each box.'; first.focus(); return; }
  const note = ageNote(numbers.age);
  if (note && $('n-age-err').dataset.warned !== String(numbers.age)) {
    $('n-age-err').textContent = note;
    $('n-age-err').dataset.warned = String(numbers.age);
    $('e-f3').textContent = 'Please check your age, then press “See the results” again.';
    $('n-age').focus();
    return;
  }
  $('e-f3').textContent = 'Working out the nine results…';
  $('b-results').disabled = true;
  try {
    const employment = SELF_EMPLOYED.includes(state.answers.q2) ? 'self' : 'salaried';
    const res = await fetch('api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...numbers, employment }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.errors || []).join(' ') || 'The results could not be worked out.');
    state.numbers = numbers;
    state.cards = data.cards;
    $('e-f3').textContent = '';
    drawResults();
    show(4);
  } catch (err) {
    $('e-f3').textContent = `${err.message || 'The results could not be worked out.'} Please try again.`;
  } finally {
    $('b-results').disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Screens 4 and 6: the cards (identical for every lender)
// ---------------------------------------------------------------------------
function rateLine(c) {
  if (c.rate.kind !== 'yours' || c.amount === null) return null;
  const typed = state.numbers.rate;
  return h('p', { class: 'rate', text: c.rate.pct === typed ? `At your interest rate of ${typed}%.` : `At ${c.rate.pct}% a year, the nearest it allows to your ${typed}%.` });
}

/** One row of the results list: the lender, its amount on the right, any note underneath. Same look for all nine. */
function card(c, { behind }) {
  const amount = c.amount !== null
    ? h('p', { class: 'rc-amt' }, h('span', { class: 'sr-only', text: 'Estimated amount: ' }), rs(c.amount))
    : h('p', { class: 'rc-amt none', text: 'No amount shown' });
  const notes = [
    c.amount === null ? h('p', { class: 'rc-note', text: c.reason }) : null,
    behind ? null : rateLine(c),
    behind ? h('div', { class: 'rc-behind' },
      h('p', { class: 'rc-behind-label', text: 'Behind this number' }),
      h('ul', {}, [...c.assumptions, ...c.adjusted].map((t) => h('li', { text: t })))) : null,
  ];
  return h('li', {}, h('article', { class: 'rc', 'aria-label': `Lender ${c.lender}` },
    h('div', { class: 'rc-head' }, h('h3', { text: `Lender ${c.lender}` }), amount), ...notes));
}

function drawResults() {
  $('cards-s4').replaceChildren(...state.cards.map((c) => card(c, { behind: false })));
  $('cards-s6').replaceChildren(...state.cards.map((c) => card(c, { behind: true })));
  drawChoice();
  drawAfter();
}

// ---------------------------------------------------------------------------
// Screen 5: the choice
// ---------------------------------------------------------------------------
const lenderOptions = (name) => [
  ...state.cards.map((c) => optionLabel('radio', name, String(c.lender), `Lender ${c.lender}`,
    h('span', { class: 'amt', text: c.amount !== null ? rs(c.amount) : 'No amount' }))),
];

function drawChoice() {
  const q7 = h('fieldset', { id: 'f-q7', 'aria-describedby': 'e-q7' },
    h('legend', { text: 'Based on these results, from which lender would you most likely take a loan?' }),
    h('div', { class: 'options' }, lenderOptions('q7'), optionLabel('radio', 'q7', 'none', 'None of them')),
    h('p', { class: 'q-error', id: 'e-q7' }));
  $('q-choice').replaceChildren(q7, ...CHOICE.map(question));
  const sync = () => {
    const v = checked($('f5'), 'q7')[0];
    $('f-q8').hidden = !v || v === 'none';
    $('f-q8a').hidden = v !== 'none';
  };
  q7.addEventListener('change', sync);
  sync();
}
$('b-to-5').addEventListener('click', () => show(5));
$('f5').addEventListener('submit', (e) => {
  e.preventDefault();
  const qs = [{ key: 'q7', kind: 'radio' }, ...CHOICE];
  if (!collect(e.currentTarget, qs, 'e-f5')) return;
  state.answers.q7 = state.answers.q7 === 'none' ? 'none' : Number(state.answers.q7);
  show(6);
});

// ---------------------------------------------------------------------------
// Screen 6: after the assumptions are shown
// ---------------------------------------------------------------------------
function drawAfter() {
  const q11 = h('fieldset', { id: 'f-q11', 'aria-describedby': 'e-q11' },
    h('legend', { text: 'Now that you have seen this, would you choose differently?' }),
    h('div', { class: 'options' }, ['Same lender', 'A different lender', 'None of them'].map((o) => optionLabel('radio', 'q11', o, o))),
    h('p', { class: 'q-error', id: 'e-q11' }));
  const q11b = h('fieldset', { id: 'f-q11_lender', 'aria-describedby': 'e-q11_lender', hidden: true },
    h('legend', { text: 'Which lender would you choose now?' }),
    h('div', { class: 'options' }, lenderOptions('q11_lender')),
    h('p', { class: 'q-error', id: 'e-q11_lender' }));
  $('q-after').replaceChildren(q11, q11b, ...AFTER.map(question));
  q11.addEventListener('change', () => { q11b.hidden = checked($('f6'), 'q11')[0] !== 'A different lender'; });
}

$('f6').addEventListener('submit', async (e) => {
  e.preventDefault();
  const qs = [{ key: 'q11', kind: 'radio' }, { key: 'q11_lender', kind: 'radio' }, ...AFTER];
  if (!collect(e.currentTarget, qs, 'e-f6')) return;
  if (state.answers.q11_lender !== undefined) state.answers.q11_lender = Number(state.answers.q11_lender);
  const record = buildRecord(state);
  $('b-submit').disabled = true;
  try {
    await save(record);
    state.finished = true;
    show(7);
  } catch (err) {
    $('e-f6').textContent = `Your answers could not be sent (${err.message}). Please try again.`;
  } finally {
    $('b-submit').disabled = false;
  }
});

/** Sends the record (ranges, ranks and answers only) to the server, then remembers in this browser that it was sent. */
async function save(record) {
  const res = await fetch('api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
  if (!res.ok) {
    let msg = `error ${res.status}`;
    try { msg = (await res.json()).errors.join(' '); } catch { /* keep the status */ }
    throw new Error(msg);
  }
  try { localStorage.setItem(ANSWERED, new Date().toISOString().slice(0, 10)); } catch { /* private mode: fine */ }
  $('saved-line').textContent = 'Thank you for taking part. Your answers have been saved.';
}

// "Already answered" is remembered in this browser only (no cookie), so one person is not counted twice by accident.
const ANSWERED = 'study-answered';
try {
  if (localStorage.getItem(ANSWERED)) {
    $('already').hidden = false;
    $('f1').hidden = true;
  }
} catch { /* storage blocked: the study still works */ }
$('again').addEventListener('click', () => { $('already').hidden = true; $('f1').hidden = false; $('f1').elements.adult.focus(); });
