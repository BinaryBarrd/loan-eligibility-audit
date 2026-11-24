// Local preview of the study: serves study/public and runs study/api/*.js the way Vercel would.
// No dependencies. Run: node scripts/study_dev.mjs   (http://127.0.0.1:8788)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../study/', import.meta.url));
const pub = join(root, 'public');
const PORT = Number(process.env.PORT || 8788);
const localStore = { saved: [], async save(day, record) { this.saved.push({ day, record }); console.log(`saved locally (${this.saved.length}):`, day, JSON.stringify(record).length, 'bytes'); } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9_-]/gi, '');
    let mod;
    try { mod = await import(join(root, 'api', `${name}.js`)); } catch { res.writeHead(404).end('Not found'); return; }
    // Without a database, answers are kept in this process only and printed, so the flow can be tried locally.
    const run = name === 'submit' && !process.env.DATABASE_URL ? mod.createHandler(localStore) : mod.default;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = raw;
    if ((req.headers['content-type'] || '').includes('application/json')) { try { body = JSON.parse(raw); } catch { body = raw; } }
    const shim = Object.assign(res, {
      status(s) { res.statusCode = s; return shim; },
      json(j) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); return shim; },
    });
    await run({ method: req.method, body, headers: req.headers }, shim);
    return;
  }
  const path = normalize(join(pub, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(pub)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Study preview: http://127.0.0.1:${PORT}`));
