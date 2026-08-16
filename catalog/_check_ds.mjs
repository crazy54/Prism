/* ============================================================================
   F5 (JFH-38) — Coverage & integrity gate for design-system families.
   ----------------------------------------------------------------------------
   Reads the live #prism-catalog island (facet inventory) + the pg-spectrums
   <style id="spectrums-styles"> block (the family CSS) from Prism.html, and for
   each THEME-PACK design system asserts the epic's standard:

     • exactly 100 facets tagged data-spectrum=<dsShort>   (JFH-33 coverage)
     • id uniqueness, kebab-case                            (reuses validate.js ID_RE)
     • token-only / OFFLINE CSS: no url() / @import / @font-face / http(s)://,
       and no raw BRAND hex (chromatic #rrggbb) — achromatic #fff/#000/greys ok
     • a prefers-reduced-motion block covering the family where it animates

   Two tiers (catalog/systems.json):
     - legacy families (the original 9 spectrums) predate the standard, hardcode
       their brand palette on purpose, and ship one shared reduced-motion block.
       They are reported for information but do NOT gate. (We do not re-author the
       ~1,668 existing facets — see design-system-epic / JFH-33.)
     - themePack families ARE gated. Any family present in the island that is not
       legacy is treated as a theme-pack (so a freshly-staged system is gated even
       before it is added to the registry). Registry themePack entries that are
       ABSENT from the island fail (declared-vs-live parity).

   Exit non-zero on any failure so it can gate PRs / CI.

   Usage:
     node catalog/_check_ds.mjs              # validate live Prism.html
     PRISM_HTML=/path/to/copy.html node catalog/_check_ds.mjs   # a staged temp copy
     node catalog/_check_ds.mjs --only duolingo,monzo           # subset of families
   Zero deps, offline.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID_RE } from '../prism-mcp-server/utils/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = process.env.PRISM_HTML ? resolve(process.env.PRISM_HTML) : resolve(HERE, '../Prism.html');
const REG = resolve(HERE, 'systems.json');

// --only <a,b,c> restricts which families are checked (still reports the rest).
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx !== -1 && process.argv[onlyIdx + 1]
  ? new Set(process.argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;

const registry = JSON.parse(readFileSync(REG, 'utf8'));
const TARGET = registry.standard?.facetsPerSystem ?? 100;
const LEGACY = new Set((registry.legacy || []).map((s) => s.dsShort));
const THEMEPACK = new Map((registry.themePack || []).map((s) => [s.dsShort, s]));

const html = readFileSync(HTML, 'utf8');

// ---- 1) parse the island (facet inventory) --------------------------------
function readIsland() {
  const openTag = '<script type="application/json" id="prism-catalog">';
  const start = html.indexOf(openTag);
  if (start < 0) throw new Error('no #prism-catalog island in ' + HTML);
  const afterOpen = start + openTag.length;
  const end = html.indexOf('</script', afterOpen);
  const raw = html.slice(afterOpen, end).split('<\\/script').join('</script');
  return JSON.parse(raw);
}
const island = readIsland();
const effects = Array.isArray(island.effects) ? island.effects : [];

// ---- 2) extract the family CSS block (for reduced-motion / offline-in-CSS) --
// The extractor drops @media rules from per-facet css, so the authoritative CSS
// for reduced-motion + offline checks is the shared spectrums-styles block.
function readSpectrumStyles() {
  const tplAt = html.indexOf('<script type="text/html" id="pg-spectrums">');
  if (tplAt < 0) return '';
  const tplEnd = html.indexOf('</script>', tplAt);
  const slice = html.slice(tplAt, tplEnd === -1 ? undefined : tplEnd);
  const sAt = slice.indexOf('<style id="spectrums-styles">');
  if (sAt < 0) return '';
  const sEnd = slice.indexOf('</style>', sAt);
  return slice.slice(sAt, sEnd === -1 ? undefined : sEnd);
}
const familyCss = readSpectrumStyles();

// ---- helpers ---------------------------------------------------------------
// Brand hex = a chromatic color literal. Achromatic (#fff/#000/greys, r==g==b)
// is allowed because it is theme-neutral (text/mask/shadow), not brand identity.
function chromaticHexes(css) {
  const out = [];
  const re = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (!(r === g && g === b)) out.push('#' + m[1]);
  }
  return out;
}
const OFFLINE_RE = [
  [/url\(\s*(?!["']?#)/i, 'url() reference'], // allow url(#svgFilter) fragment refs; flag external/data resource urls
  [/@import\b/i, '@import'],
  [/@font-face\b/i, '@font-face'],
  [/https?:\/\//i, 'http(s):// URL'],
];
function offlineViolations(css) {
  return OFFLINE_RE.filter(([re]) => re.test(css)).map(([, label]) => label);
}

// Slice the reduced-motion @media blocks out of the family CSS so we can (a) ask
// whether a namespace is covered by one, and (b) exclude them from the brand-hex
// scan (a reduced-motion block legitimately references nothing colorful anyway).
function reducedMotionBlocks(css) {
  const blocks = [];
  const re = /@media[^{]*prefers-reduced-motion[^{]*\{/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    // brace-match from the opening { of the @media
    let i = m.index + m[0].length - 1, depth = 0;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    blocks.push(css.slice(m.index, i));
  }
  return blocks;
}
const RM_BLOCKS = reducedMotionBlocks(familyCss);
const familyCssNoRM = RM_BLOCKS.reduce((acc, b) => acc.replace(b, ''), familyCss);

// ---- 3) group island facets by family -------------------------------------
const byFamily = new Map();
for (const e of effects) {
  if (!e.spectrum) continue;
  if (!byFamily.has(e.spectrum)) byFamily.set(e.spectrum, []);
  byFamily.get(e.spectrum).push(e);
}

// Families to consider: everything present in the island + every declared theme-pack.
const allFamilies = new Set([...byFamily.keys(), ...THEMEPACK.keys()]);

// ---- 4) validate -----------------------------------------------------------
const results = [];
for (const fam of [...allFamilies].sort()) {
  if (ONLY && !ONLY.has(fam)) continue;
  const isLegacy = LEGACY.has(fam);
  const facets = byFamily.get(fam) || [];
  const errors = [];
  const warnings = [];

  // ids: kebab + unique — this integrity check is universal (cheap, always valid).
  const ids = facets.map((f) => f.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) errors.push(`duplicate ids: ${dupes.slice(0, 6).join(', ')}${dupes.length > 6 ? '…' : ''}`);
  const badIds = ids.filter((id) => !ID_RE.test(id));
  if (badIds.length) errors.push(`non-kebab ids: ${badIds.slice(0, 6).join(', ')}${badIds.length > 6 ? '…' : ''}`);

  // offline: scan each facet's css. Always an ERROR — an external resource breaks
  // the offline guarantee for legacy families too (and today all 266 are clean).
  const offImpacted = new Set();
  for (const f of facets) offlineViolations(f.css || '').forEach((v) => offImpacted.add(v));
  if (offImpacted.size) errors.push(`offline: facet CSS contains ${[...offImpacted].join(', ')}`);

  // The remaining checks assume the theme-pack authoring conventions (dsShort ===
  // CSS namespace, token-only palette, per-namespace reduced-motion). Legacy
  // families predate those (e.g. material-ui uses .mat-* classes and hardcodes M3
  // brand hex on purpose — the palette IS the identity), so they are grandfathered
  // OUT of these. See catalog/systems.json + design-system-epic (JFH-33).
  if (!isLegacy) {
    // coverage
    if (facets.length !== TARGET) {
      errors.push(`coverage: ${facets.length} facets, expected exactly ${TARGET}`);
    }
    if (facets.length === 0 && THEMEPACK.has(fam)) {
      errors.push(`declared theme-pack "${fam}" is absent from the catalog island`);
    }

    // token-only: chromatic hex in facet css is a violation (achromatic #fff/#000 ok)
    const hexHits = new Map();
    for (const f of facets) {
      for (const h of chromaticHexes(f.css || '')) hexHits.set(h, (hexHits.get(h) || 0) + 1);
    }
    if (hexHits.size) {
      errors.push(`token-only: raw brand hex in facet CSS (${[...hexHits.entries()].map(([h, n]) => `${h}×${n}`).slice(0, 6).join(', ')})`);
    }

    // reduced-motion: a theme-pack namespaces its classes AND keyframes as
    // <dsShort>-*, so a prefers-reduced-motion block must reference ".<dsShort>".
    const nsToken = '.' + fam;
    const nsAnimates = familyCssNoRM.includes(`@keyframes ${fam}`)
      || new RegExp(`\\.${fam}[\\w-]*[^{}]*\\{[^{}]*animation`, 'i').test(familyCssNoRM)
      || facets.some((f) => /@keyframes|animation:/.test(f.css || ''));
    const nsHasRM = RM_BLOCKS.some((b) => b.includes(nsToken));
    if (nsAnimates && !nsHasRM) {
      errors.push('reduced-motion: family animates but no prefers-reduced-motion block references its namespace');
    }
  }

  results.push({ fam, isLegacy, count: facets.length, errors, warnings });
}

// ---- report ----------------------------------------------------------------
let failed = 0;
console.log(`catalog: ${effects.length} effects · target ${TARGET}/theme-pack system · source ${HTML}`);
console.log('');
for (const r of results) {
  const tag = r.isLegacy ? 'legacy ' : 'PACK   ';
  const mark = r.errors.length ? '✗' : (r.warnings.length ? '!' : '✓');
  console.log(`${mark} [${tag}] ${r.fam}  (${r.count} facets)`);
  r.errors.forEach((e) => console.log(`    ERROR  ${e}`));
  r.warnings.forEach((w) => console.log(`    warn   ${w}`));
  if (r.errors.length) failed++;
}
const packs = results.filter((r) => !r.isLegacy);
console.log('');
console.log(`theme-pack systems checked: ${packs.length}  ·  passing: ${packs.filter((r) => !r.errors.length).length}  ·  failing: ${failed}`);
if (failed) { console.error(`\nGATE FAILED: ${failed} system(s) do not meet the standard.`); process.exit(1); }
console.log('\n✓ GATE PASS: all theme-pack systems meet the coverage & integrity standard.');
