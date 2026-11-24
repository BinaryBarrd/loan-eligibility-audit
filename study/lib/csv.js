// Turns saved rows into one flat CSV: one row per participant, one column per answer.
// The random row id is left out, so the file can be published as it is.
import { BACKGROUND, CHOICE, AFTER } from '../public/questions.js';

const ANSWER_COLUMNS = [];
const addQ = (q) => { ANSWER_COLUMNS.push(q.key); if (q.other) ANSWER_COLUMNS.push(`${q.key}_other`); };
BACKGROUND.filter((q) => q.key).forEach(addQ);
ANSWER_COLUMNS.push('q7');
CHOICE.forEach(addQ);
ANSWER_COLUMNS.push('q11', 'q11_lender');
AFTER.forEach(addQ);

const NUMBER_COLUMNS = ['income', 'emis', 'other', 'wanted', 'years', 'rate'];
const LENDER_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`l${n}_shown`, `l${n}_rank`, `l${n}_share`, `l${n}_position`]);
export const COLUMNS = ['day', 'version', ...ANSWER_COLUMNS, ...NUMBER_COLUMNS, 'order', ...LENDER_COLUMNS];

function cell(v) {
  if (v === undefined || v === null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: [{ day, record }] → CSV text with a header line. */
export function toCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const { day, record: r } of rows) {
    const lenders = Object.fromEntries(r.lenders.map((l) => [l.lender, l]));
    const values = {
      day: typeof day === 'string' ? day.slice(0, 10) : new Date(day).toISOString().slice(0, 10),
      version: r.version,
      ...r.answers,
      ...r.numbers,
      order: r.order.join(' '),
    };
    for (let n = 1; n <= 9; n += 1) {
      values[`l${n}_shown`] = lenders[n].shown;
      values[`l${n}_rank`] = lenders[n].rank;
      values[`l${n}_share`] = lenders[n].share;
      values[`l${n}_position`] = r.order.indexOf(n) + 1;
    }
    lines.push(COLUMNS.map((c) => cell(values[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
