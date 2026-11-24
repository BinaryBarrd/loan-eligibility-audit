// POST /api/results: one person's details in, nine neutral result cards out (in a random order).
// The inputs are used for this calculation only: nothing here is logged or stored.
import { randomInt } from 'node:crypto';
import { validate, computeAll, shuffled } from '../lib/engine.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ errors: ['Use POST.'] });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ errors: ['The values could not be read.'] }); }
  }
  const { values, errors } = validate(body);
  if (errors.length) return res.status(400).json({ errors });
  const cards = shuffled(computeAll(values), randomInt);
  return res.status(200).json({ cards, order: cards.map((c) => c.lender) });
}
