// Copy the website's tested rules into the study's server code, so both use the same formulas.
// Run after any change to site/rules.js:  node scripts/sync_study_rules.mjs
// tests/study.test.js fails if the two files differ.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../site/rules.js', import.meta.url));
const to = fileURLToPath(new URL('../study/lib/rules.js', import.meta.url));
copyFileSync(from, to);
console.log('Copied site/rules.js to study/lib/rules.js');
