#!/usr/bin/env node
// Build the Elgato exports of the Prism Deck catalog:
//   plugin/dist/iconpacks/com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack   one per deck theme
//   plugin/dist/profiles/Prism - <device>.streamDeckProfile                         Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo, + XL
// Every pack and profile is checked after it is written (format rules from formats.md §4–5).
//
//   node scripts/build-iconpacks.mjs [--theme prism,neon] [--svg-only] [--no-profiles] [--out <dir>]
//
// Animated glyphs become GIF (+ a PNG twin) through src/raster; --svg-only (or a missing
// raster module) writes static SVG packs. Nothing is installed: double-click the files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIconPack, checkIconPack, loadRaster } from '../src/export/iconpack.js';
import { sampleProfiles, checkProfile } from '../src/export/profile.js';
import { THEME_IDS } from '../src/themes/_registry.js';
import { PLUGIN_VERSION } from '../src/plugin/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const has = (name) => args.includes(name);

async function main() {
  const t0 = Date.now();
  const out = path.resolve(opt('--out', path.join(ROOT, 'plugin', 'dist')));
  const themes = (opt('--theme') || THEME_IDS().join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const raster = has('--svg-only') ? null : await loadRaster();
  const packVersion = PLUGIN_VERSION.split('.').slice(0, 3).join('.');
  if (!raster && !has('--svg-only')) console.warn('src/raster not available: writing static SVG-only packs');
  fs.mkdirSync(path.join(out, 'iconpacks'), { recursive: true });
  let failed = 0;
  for (const theme of themes) {
    const t = Date.now();
    const pack = await buildIconPack({ theme, version: packVersion, raster });
    const file = path.join(out, 'iconpacks', `${pack.id}.streamDeckIconPack`);
    fs.writeFileSync(file, pack.zip);
    const problems = [...checkIconPack(pack.zip), ...pack.stats.invalid];
    if (problems.length) { failed++; console.error(`${theme}: ${problems.length} problem(s)\n  ${problems.slice(0, 20).join('\n  ')}`); }
    console.log(`${pack.manifest.Name}: ${pack.icons.length} icons (${pack.stats.gif} GIF + PNG twins, ${pack.stats.svg} SVG), ${(pack.zip.length / 1048576).toFixed(2)} MB, ${((Date.now() - t) / 1000).toFixed(1)} s → ${path.relative(ROOT, file)}`);
  }
  if (!has('--no-profiles')) {
    fs.mkdirSync(path.join(out, 'profiles'), { recursive: true });
    for (const p of sampleProfiles({ pluginVersion: PLUGIN_VERSION })) {
      const file = path.join(out, 'profiles', `${p.file}.streamDeckProfile`);
      fs.writeFileSync(file, p.zip);
      const problems = checkProfile(p.zip);
      if (problems.length) { failed++; console.error(`${p.name}: ${problems.join('; ')}`); }
      console.log(`${p.name}: ${p.pages.length} page(s), Device.Model ${p.package.DeviceModel}${p.dropped.length ? `, dropped ${p.dropped.length}` : ''} → ${path.relative(ROOT, file)}`);
    }
  }
  if (failed) process.exitCode = 1;
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

await main();
