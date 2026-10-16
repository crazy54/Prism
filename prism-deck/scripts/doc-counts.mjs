#!/usr/bin/env node
// Keep the numbers in the docs true: README.md and docs/plugin.md carry counts and versions between
// markers, <!--n:facets-->210<!--/n-->, and this script rewrites them from the package itself.
// scripts/build-plugin.mjs runs it on every build; `--check` exits 1 when a doc is stale.
//
//   node scripts/doc-counts.mjs [--check]
//
// Keys: facets galleries themes glyphs devices profiles packs packStates version pluginVersion

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFacets } from '../src/facets/index.js';
import { GALLERIES } from '../src/facets/galleries.js';
import { THEME_IDS } from '../src/themes/_registry.js';
import { allGlyphs } from '../src/glyphs/_registry.js';
import { DEVICE_IDS } from '../src/devices.js';
import { PLUGIN_VERSION } from '../src/plugin/index.js';
import { SAMPLE_LAYOUTS } from '../src/export/profile.js';
import { packPlan } from '../src/export/iconpack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS = ['README.md', 'docs/plugin.md'];

/** The numbers, from the package. packStates = glyph × state × mode icons per pack (before the still / animated split). */
export function docCounts() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return {
    facets: allFacets().length,
    galleries: GALLERIES.length,
    themes: THEME_IDS().length,
    glyphs: allGlyphs().length,
    devices: DEVICE_IDS.length,
    profiles: Object.keys(SAMPLE_LAYOUTS).length,
    packs: THEME_IDS().length,
    packStates: packPlan('prism').list.length,
    version: pkg.version,
    pluginVersion: PLUGIN_VERSION,
  };
}

const MARK = /<!--n:([a-zA-Z]+)-->([^<]*)<!--\/n-->/g;

/** Rewrite (or, with check, just compare) every marker. → [{ file, key, was, now }] of stale ones. */
export function syncDocs({ check = false, counts = docCounts() } = {}) {
  const stale = [];
  for (const rel of DOCS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const next = text.replace(MARK, (m, key, was) => {
      if (!(key in counts)) { stale.push({ file: rel, key, was, now: '(unknown key)' }); return m; }
      const now = String(counts[key]);
      if (now !== was) stale.push({ file: rel, key, was, now });
      return `<!--n:${key}-->${now}<!--/n-->`;
    });
    if (!check && next !== text) fs.writeFileSync(file, next);
  }
  return stale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = syncDocs({ check });
  for (const s of stale) console.log(`${check ? 'stale' : 'updated'} ${s.file}: ${s.key} ${s.was} → ${s.now}`);
  if (check && stale.length) process.exitCode = 1;
  else console.log(`docs: counts ${check ? 'current' : 'written'} (${JSON.stringify(docCounts())})`);
}
