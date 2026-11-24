// Where answers are kept: one Postgres table on Neon. SERVER ONLY.
// The connection string comes from the DATABASE_URL environment variable, which the Neon integration
// sets in the Vercel project. It is never written into the code or sent to the browser.
//
// Table: one row per participant. No IP address, no device details, no time of day.
//   id      random UUID made by the database (not linked to the device)
//   day     date the answers arrived (India time), day only
//   record  the checked record as JSON (study/public/record.js, study/lib/schema.js)

const CREATE = `CREATE TABLE IF NOT EXISTS study_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  record jsonb NOT NULL
)`;

let sqlPromise = null;

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  await sql.query(CREATE);
  return sql;
}

/** The real store, used by /api/submit on Vercel. */
export const neonStore = {
  async save(day, record) {
    sqlPromise ??= connect().catch((e) => { sqlPromise = null; throw e; });
    const sql = await sqlPromise;
    await sql.query('INSERT INTO study_responses (day, record) VALUES ($1, $2)', [day, JSON.stringify(record)]);
  },
};
