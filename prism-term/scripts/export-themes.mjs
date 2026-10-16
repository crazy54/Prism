// Write the terminal emulator color schemes for Prism Night and Prism Day into
// themes/<format>/ — one file per format and theme (src/theme-export.js renders them).
//
//   node scripts/export-themes.mjs            write themes/**
//   node scripts/export-themes.mjs --check    exit 1 if any file is missing or stale
//
// Run it after `npm run sync-themes` whenever the Refraction terminal tokens change.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATS, exportTheme, themeFileName } from '../src/theme-export.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'themes');
const THEMES = ['prism-dark', 'prism-light'];
const check = process.argv.includes('--check');

const want = new Map();
for (const [id, f] of Object.entries(FORMATS)) {
  for (const theme of THEMES) want.set(path.join(OUT, f.dir, themeFileName(id, theme)), exportTheme(id, theme));
}

const stale = [];
for (const [file, body] of want) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (cur === body) continue;
  if (check) { stale.push(path.relative(OUT, file)); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
// Files in themes/ that no format produces any more.
const extra = [];
const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!want.has(p)) extra.push(path.relative(OUT, p)); } };
walk(OUT);

if (check) {
  if (stale.length || extra.length) {
    if (stale.length) console.error(`themes/ is out of date — run \`node scripts/export-themes.mjs\`:\n  ${stale.join('\n  ')}`);
    if (extra.length) console.error(`themes/ has files no format produces:\n  ${extra.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`themes/ up to date (${want.size} files, ${Object.keys(FORMATS).length} formats × ${THEMES.length} themes)`);
} else {
  for (const p of extra) console.warn(`note: themes/${p} is not produced by any format`);
  console.log(`wrote ${want.size} files → themes/ (${Object.keys(FORMATS).length} formats × Prism Night, Prism Day)`);
}
