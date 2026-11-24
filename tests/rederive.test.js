// The independent re-derivation (analysis/rederive.py) must recover every rule from the CSVs alone
// and match every probe. Needs python3 on the machine; it uses only Python's standard library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../analysis/rederive.py', import.meta.url));

test('re-deriving all nine rules from the probe logs gives zero misses', () => {
  const r = spawnSync('python3', [script], { encoding: 'utf8' });
  assert.equal(r.error, undefined, 'python3 must be installed');
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr);
  assert.match(r.stdout, /Total misses: 0\./);
  for (const site of ['bajaj_finserv', 'paisabazaar', 'kotak', 'idfc_first', 'smfg', 'axis', 'fibe', 'poonawalla', 'aditya_birla']) {
    assert.match(r.stdout, new RegExp(`\\| ${site} \\|[^\\n]*\\| 0 \\|`), site);
  }
});
