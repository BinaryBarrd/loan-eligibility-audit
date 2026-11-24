// What gets saved for one participant: only the fields in the study plan's privacy table.
// Exact money figures, exact age and the nine exact amounts are never part of the record.
// Pure functions, no DOM: also used by tests/study.test.js.

export const RECORD_VERSION = 1;

export const BANDS = Object.freeze({
  income: [20000, 30000, 50000, 75000, 100000, 150000, 250000, 500000],
  emis: [1, 5000, 10000, 20000, 40000, 100000],
  other: [1, 5000, 10000, 20000, 40000, 100000],
  wanted: [100000, 300000, 500000, 1000000, 2000000, 5000000],
});

/** The range a value falls in, as text: "0", "1-4999", "20000-29999", "500000+". */
export function band(value, edges) {
  const i = edges.filter((e) => e <= value).length;
  const lower = i === 0 ? 0 : edges[i - 1];
  if (i === edges.length) return `${lower}+`;
  const upper = edges[i] - 1;
  return lower === upper ? String(lower) : `${lower}-${upper}`;
}

/**
 * For each lender: whether an amount showed, its rank among the shown amounts (1 = largest, ties share a rank)
 * and its size against the largest, rounded to the nearest 5%.
 */
export function lenderSummary(cards) {
  const shown = cards.filter((c) => c.amount !== null).map((c) => c.amount);
  const max = shown.length ? Math.max(...shown) : 0;
  return [...cards].sort((a, b) => a.lender - b.lender).map((c) => {
    if (c.amount === null) return { lender: c.lender, shown: false, rank: null, share: null };
    return {
      lender: c.lender,
      shown: true,
      rank: 1 + shown.filter((a) => a > c.amount).length,
      share: max > 0 ? Math.round((c.amount / max) * 20) / 20 : null,
    };
  });
}

/**
 * numbers: the exact values typed on screen 3; cards: as returned by /api/results;
 * answers: { key: value } for every question answered.
 */
export function buildRecord({ numbers, cards, answers }) {
  return {
    version: RECORD_VERSION,
    answers: { ...answers },
    numbers: {
      income: band(numbers.income, BANDS.income),
      emis: band(numbers.emis, BANDS.emis),
      other: band(numbers.other, BANDS.other),
      wanted: band(numbers.wanted, BANDS.wanted),
      years: numbers.years,
      rate: numbers.rate,
    },
    order: cards.map((c) => c.lender),
    lenders: lenderSummary(cards),
  };
}
