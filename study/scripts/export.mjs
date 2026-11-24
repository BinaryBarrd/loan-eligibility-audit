// Download every saved answer as CSV. Needs DATABASE_URL in the environment.
// The value is marked "sensitive" in Vercel, so it cannot be pulled from there. Copy the connection string
// yourself from Neon (Vercel > Storage > study-answers > Open in Neon > Connect) into study/.env.local
// as DATABASE_URL=..., which git ignores. Then:
//   cd study && node --env-file=.env.local scripts/export.mjs > responses.csv
import { neon } from '@neondatabase/serverless';
import { toCsv } from '../lib/csv.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See the comment at the top of this file.');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql.query('SELECT day::text AS day, record FROM study_responses ORDER BY day, id');
process.stdout.write(toCsv(rows));
console.error(`${rows.length} responses exported.`);
