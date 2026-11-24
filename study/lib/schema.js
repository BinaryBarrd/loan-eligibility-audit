// Strict check of a participant's record before it is saved. Anything not in the study plan's privacy
// table is refused: unknown keys, free text over 100 characters, exact money figures, values not offered.
import { BACKGROUND, CHOICE, AFTER, PNTS, TEXT_LIMIT } from '../public/questions.js';
import { BANDS, RECORD_VERSION } from '../public/record.js';

const LENDERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const Q11 = ['Same lender', 'A different lender', 'None of them'];
const MAX_BYTES = 8000;

/** Every range label band() can produce for a list of edges. */
function bandLabels(edges) {
  const labels = [];
  let lower = 0;
  for (const e of edges) {
    labels.push(lower === e - 1 ? String(lower) : `${lower}-${e - 1}`);
    lower = e;
  }
  labels.push(`${lower}+`);
  return new Set(labels);
}
const BAND_LABELS = Object.fromEntries(Object.entries(BANDS).map(([k, edges]) => [k, bandLabels(edges)]));

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isScale = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
const isText = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= TEXT_LIMIT;
const isLender = (v) => LENDERS.includes(v);

/** The rules for each answer key: { ok(value, answers), required(answers) }. */
function answerRules() {
  const rules = {};
  const add = (q, when = () => true) => {
    const opts = q.kind === 'scale' ? null : [...q.options, ...(q.pnts ? [PNTS] : [])];
    rules[q.key] = {
      required: when,
      ok: q.kind === 'scale' ? (v) => isScale(v) || (q.pnts && v === PNTS)
        : q.kind === 'checks' ? (v) => Array.isArray(v) && v.length > 0 && v.length === new Set(v).size && v.every((x) => opts.includes(x))
          : (v) => opts.includes(v),
    };
    if (q.other) {
      rules[`${q.key}_other`] = {
        required: () => false,
        ok: (v, a) => isText(v) && (Array.isArray(a[q.key]) ? a[q.key].includes('Other') : a[q.key] === 'Other'),
      };
    }
  };
  for (const q of BACKGROUND) if (q.key) add(q);
  rules.q7 = { required: () => true, ok: (v) => isLender(v) || v === 'none' };
  for (const q of CHOICE) {
    if (q.when === 'lender') add(q, (a) => isLender(a.q7));
    else if (q.when === 'none') add(q, (a) => a.q7 === 'none');
    else add(q);
  }
  rules.q11 = { required: () => true, ok: (v) => Q11.includes(v) };
  rules.q11_lender = { required: (a) => a.q11 === 'A different lender', ok: (v) => isLender(v) };
  for (const q of AFTER) add(q);
  return rules;
}
const RULES = answerRules();

/** Returns a list of problems; empty when the record can be saved. */
export function checkRecord(rec) {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  if (!isObj(rec)) return ['The record is not an object.'];
  if (JSON.stringify(rec).length > MAX_BYTES) return ['The record is too large.'];
  const keys = Object.keys(rec).sort().join(',');
  if (keys !== 'answers,lenders,numbers,order,version') bad(`Unexpected fields: ${keys}`);
  if (rec.version !== RECORD_VERSION) bad('Unknown record version.');

  // Answers: only known keys, valid values, every required one present, conditional ones only when they apply.
  const a = isObj(rec.answers) ? rec.answers : (bad('answers missing'), {});
  for (const [k, v] of Object.entries(a)) {
    const rule = RULES[k];
    if (!rule) { bad(`Unknown answer: ${k}`); continue; }
    if (!rule.required(a) && !k.endsWith('_other')) { bad(`Answer not expected: ${k}`); continue; }
    if (!rule.ok(v, a)) bad(`Invalid answer: ${k}`);
  }
  for (const [k, rule] of Object.entries(RULES)) if (rule.required(a) && !(k in a)) bad(`Missing answer: ${k}`);

  // Numbers: ranges only, plus the chosen tenure and rate.
  const n = isObj(rec.numbers) ? rec.numbers : (bad('numbers missing'), {});
  if (Object.keys(n).sort().join(',') !== 'emis,income,other,rate,wanted,years') bad('Unexpected number fields.');
  for (const k of Object.keys(BANDS)) if (!BAND_LABELS[k].has(n[k])) bad(`Invalid range: ${k}`);
  if (!(Number.isInteger(n.years) && n.years >= 1 && n.years <= 10)) bad('Invalid tenure.');
  if (!(typeof n.rate === 'number' && n.rate >= 1 && n.rate <= 40 && Math.round(n.rate * 100) === n.rate * 100)) bad('Invalid rate.');

  // Card order: each lender once.
  if (!(Array.isArray(rec.order) && rec.order.length === 9 && [...rec.order].sort((x, y) => x - y).every((v, i) => v === i + 1))) bad('Invalid order.');

  // Lender summary: shown, rank among shown amounts, size against the largest (to 5%).
  const L = rec.lenders;
  if (!(Array.isArray(L) && L.length === 9)) bad('Invalid lenders.');
  else {
    L.forEach((l, i) => {
      if (!isObj(l) || Object.keys(l).sort().join(',') !== 'lender,rank,share,shown' || l.lender !== i + 1) { bad(`Invalid lender ${i + 1}.`); return; }
      if (l.shown === false) { if (l.rank !== null || l.share !== null) bad(`Lender ${i + 1}: no amount, but a rank.`); return; }
      if (l.shown !== true) { bad(`Lender ${i + 1}: shown must be true or false.`); return; }
      if (!(Number.isInteger(l.rank) && l.rank >= 1 && l.rank <= 9)) bad(`Lender ${i + 1}: invalid rank.`);
      if (!(l.share === null || (typeof l.share === 'number' && l.share >= 0 && l.share <= 1 && Number.isInteger(Math.round(l.share * 20 * 1e6) / 1e6)))) bad(`Lender ${i + 1}: invalid share.`);
    });
  }
  return problems;
}

/** Today's date in India, day only (no time), for the saved row. */
export function indiaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
