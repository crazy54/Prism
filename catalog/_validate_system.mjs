/* ============================================================================
   F4 (JFH-37) — Offline validation gate for a generated design system.
   ----------------------------------------------------------------------------
   Runs a generated system's per-facet projection through the SAME validateFacet
   the MCP server uses (prism-mcp-server/utils/validate.js — no fork, no
   re-implementation), plus the coverage gate (exactly 100 facets, unique ids,
   every facet tagged with the family spectrum + a component type + an
   always-running animation).

   Usage:
     node catalog/_validate_system.mjs <profile.mjs>
     node catalog/_validate_system.mjs --json <generated.json>   (validate an emitted additions file)

   Exit 0 = all gates pass; 1 = failure. Zero deps, offline.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFacet } from '../prism-mcp-server/utils/validate.js';
import { generateSystem } from './_gen_system.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KNOWN_GALLERIES = new Set([
  'charts', 'fx', 'lab', 'ai', 'objects', 'input', 'text', 'shapes',
  'maps', 'notify', 'arch', 'callouts', 'obsidian', 'menus', 'spectrums',
]);
const TARGET = 100;

async function loadSystem() {
  const arg = process.argv[2];
  if (arg === '--json') {
    const file = process.argv[3];
    if (!file) throw new Error('--json requires a path to a generated additions file');
    const out = JSON.parse(readFileSync(resolve(file), 'utf8'));
    if (!Array.isArray(out.facets)) throw new Error('additions file has no facets[] projection — regenerate with the current _gen_system.mjs');
    return out;
  }
  if (!arg) throw new Error('Usage: node catalog/_validate_system.mjs <profile.mjs>  |  --json <generated.json>');
  const mod = await import(pathToFileURL(resolve(arg)).href);
  const profile = mod.default || mod.PROFILE;
  if (!profile) throw new Error('Profile module must default-export the PROFILE object');
  return generateSystem(profile);
}

const out = await loadSystem();
const facets = out.facets || [];
const failures = [];
const warnCounts = new Map();

// --- coverage / integrity gates -------------------------------------------
if (facets.length !== TARGET) failures.push(`coverage: ${facets.length} facets, expected exactly ${TARGET}`);

const ids = facets.map((f) => f.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) failures.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);

const spectra = new Set(facets.map((f) => f.spectrum).filter(Boolean));
if (spectra.size !== 1) failures.push(`facets span ${spectra.size} spectrums (expected 1 family): ${[...spectra].join(', ')}`);
const family = [...spectra][0];
const untaggedSpectrum = facets.filter((f) => f.spectrum !== family).length;
if (untaggedSpectrum) failures.push(`${untaggedSpectrum} facets not tagged data-spectrum="${family}"`);

const untaggedCtype = facets.filter((f) => !f.componentType).length;
if (untaggedCtype) failures.push(`${untaggedCtype} facets missing a componentType`);

// Every facet must carry an always-running animation (so it passes _find_broken's
// no-animation inspector). We check the css declares @keyframes AND runs it.
const noAnim = facets.filter((f) => !/@keyframes/.test(f.css || '') || !/animation:/.test(f.css || '')).length;
if (noAnim) failures.push(`${noAnim} facets have no running animation (would flag as broken)`);

const noReducedMotion = facets.filter((f) => !/prefers-reduced-motion/.test(f.css || '')).length;
if (noReducedMotion) failures.push(`${noReducedMotion} facets missing a prefers-reduced-motion block`);

// --- per-facet MCP validateFacet -------------------------------------------
const existingIds = new Set();
let validCount = 0;
for (const f of facets) {
  const res = validateFacet(f, { existingIds, knownGalleries: KNOWN_GALLERIES });
  if (res.valid) validCount++;
  else failures.push(`validateFacet(${f.id}): ${res.errors.join('; ')}`);
  for (const w of res.warnings) {
    // Roll up warnings by shape (strip the specific token/id) so output stays readable.
    const key = w.replace(/token --[a-zA-Z0-9_-]+/, 'token --X').replace(/"[^"]*"/g, '"…"');
    warnCounts.set(key, (warnCounts.get(key) || 0) + 1);
  }
  existingIds.add(f.id); // catch intra-batch duplicate ids via the validator too
}

// --- report -----------------------------------------------------------------
console.log(`family="${family}"  facets=${facets.length}  validateFacet-passed=${validCount}/${facets.length}`);
const ctypes = {};
facets.forEach((f) => { ctypes[f.componentType] = (ctypes[f.componentType] || 0) + 1; });
console.log('componentType spread:', JSON.stringify(ctypes));
if (warnCounts.size) {
  console.log('warnings (rolled up, non-fatal):');
  for (const [w, n] of warnCounts) console.log(`  ${n}×  ${w}`);
}

if (failures.length) {
  console.error(`\nVALIDATION FAILED (${failures.length}):`);
  failures.slice(0, 40).forEach((f) => console.error('  ✗ ' + f));
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`\n✓ ALL GATES PASS: ${TARGET} facets, unique ids, single family "${family}", every facet animated + reduced-motion + validateFacet-valid.`);
