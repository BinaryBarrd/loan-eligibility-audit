// POST /api/submit: saves one participant's checked record. Nothing else about the request is kept:
// no IP address, no browser details, no time of day.
import { checkRecord, indiaDay } from '../lib/schema.js';
import { neonStore } from '../lib/store.js';

export function createHandler(store) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ errors: ['Use POST.'] });
    }
    let record = req.body;
    if (typeof record === 'string') {
      try { record = JSON.parse(record); } catch { return res.status(400).json({ errors: ['The answers could not be read.'] }); }
    }
    const problems = checkRecord(record);
    if (problems.length) return res.status(400).json({ errors: problems.slice(0, 5) });
    try {
      await store.save(indiaDay(), record);
    } catch (e) {
      console.error('save failed:', e.message); // the message only: never the answers
      return res.status(503).json({ errors: ['The answers could not be saved just now.'] });
    }
    return res.status(201).json({ saved: true });
  };
}

export default createHandler(neonStore);
