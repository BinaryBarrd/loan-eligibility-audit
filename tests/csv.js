// Shared by the test files (not itself a test).
// ---------------------------------------------------------------------------
// Tiny CSV parser: handles quoted fields, "" escapes, commas and newlines inside quotes.
// ---------------------------------------------------------------------------
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const [header, ...body] = nonEmpty;
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}
