/* ============================================================================
   F6 (JFH-39) — Theme-pack authoring kit / scaffolder.
   ----------------------------------------------------------------------------
   Turn a design-system PROFILE into all the theme wiring, so a new Phase-2
   system is fill-in-the-blanks. One command:

     node catalog/_scaffold_ds.mjs catalog/profiles/<name>.mjs

   patches, idempotently:

     1. Prism.html THEME_REGISTRY  — adds <dsShort>-dark + <dsShort>-light entries
        (plus their :root token CSS consts). This is the single source of truth the
        shell + Variant-Matrix picker read, so the pack becomes SELECTABLE in both
        color modes with no further edits.
     2. prism-mcp-server/utils/themes.js THEMES[] — adds the mirror entries via
        packTokens(mode, overrides), so the MCP knows the pack's palette.
     3. catalog/systems.json themePack[] — registers the family so the F5 gate
        (_check_ds.mjs) will hold its facets to the 100-facet standard once authored.
     4. catalog/profiles/<dsShort>.mjs — writes a facet-gen config stub (F4) if the
        profile does not already live there, so `node catalog/_gen_system.mjs` can
        author the 100 facets next.

   What it does NOT need to patch (all self-maintaining off the registry now):
     - the MCP tool metadata (builtInThemes / note / palette descriptions) derives
       from THEME_IDS + themesSummary();
     - the variants.test.js theme-count assertions derive from THEME_IDS.
   So "MCP tests updated / theme count reflects the new system" happens for free.

   The scaffolded theme ships with ZERO spectrum facets (an "empty" pack): it is
   selectable and correctly colored immediately; facets are authored afterward via
   the F4 generator. The run prints a checklist of the remaining manual steps.

   Overrides (for staged verification without touching the repo):
     PRISM_HTML         absolute path to an alternate Prism.html
     PRISM_MCP_THEMES   absolute path to an alternate utils/themes.js
     PRISM_SYSTEMS      absolute path to an alternate systems.json
     PRISM_PROFILES_DIR absolute dir for the emitted facet-gen profile stub
   Zero deps, node: builtins only, offline.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packTokens } from '../prism-mcp-server/utils/themes.js';
import { ID_RE } from '../prism-mcp-server/utils/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = process.env.PRISM_HTML ? resolve(process.env.PRISM_HTML) : resolve(HERE, '../Prism.html');
const THEMES_JS = process.env.PRISM_MCP_THEMES ? resolve(process.env.PRISM_MCP_THEMES) : resolve(HERE, '../prism-mcp-server/utils/themes.js');
const SYSTEMS = process.env.PRISM_SYSTEMS ? resolve(process.env.PRISM_SYSTEMS) : resolve(HERE, 'systems.json');
const PROFILES_DIR = process.env.PRISM_PROFILES_DIR ? resolve(process.env.PRISM_PROFILES_DIR) : resolve(HERE, 'profiles');

/* ------------------------------------------------------------------ helpers */
const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const eolOf = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
// dsShort -> a valid JS identifier prefix for the Prism.html CSS consts.
const constPrefix = (ds) => ds.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

// "#58cc02" -> "88,204,2" (the rgb triple sibling token themes carry alongside a hex).
function hexToRgb(hex) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`accent "${hex}" is not a #rrggbb / #rgb hex`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
}

// Serialize a token map to a compact single-line :root{…} block (the shape the
// Prism.html theme consts + themeMatrix() parser expect).
function serializeRoot(tokens) {
  return ':root{' + Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';') + ';}';
}

// Build the sparse per-mode override map. If the profile declares palette.<mode>,
// use it verbatim (author-controlled); otherwise derive a minimal, coherent brand
// tint from `accent` (accent + its rgb sibling, mirrored onto accent2/info like the
// Cloudscape base does). Enough for a correct, selectable starter theme.
function overridesFor(profile, mode) {
  const declared = profile.palette && profile.palette[mode];
  if (declared && Object.keys(declared).length) return { ...declared };
  const accent = profile.accent;
  if (!accent) throw new Error('profile needs either palette.{light,dark} or an `accent` hex to derive one');
  const rgb = hexToRgb(accent);
  return {
    '--accent': accent, '--accent-rgb': rgb, '--accent2': accent,
    '--info': accent, '--info-rgb': rgb,
  };
}

/* --------------------------------------------------------------- load profile */
const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') {
  console.error('Usage: node catalog/_scaffold_ds.mjs <profile.mjs>');
  process.exit(arg ? 0 : 1);
}
const profilePath = resolve(arg);
if (!existsSync(profilePath)) { console.error('No such profile:', profilePath); process.exit(1); }
const profile = (await import(pathToFileURL(profilePath).href)).default;
if (!profile || typeof profile !== 'object') { console.error('Profile must default-export the PROFILE object.'); process.exit(1); }

const ds = String(profile.ds || '').trim();
const dsShort = kebab(profile.dsShort || '');
if (!ds) { console.error('profile.ds (display name) is required'); process.exit(1); }
if (!dsShort || !ID_RE.test(dsShort)) { console.error(`profile.dsShort must be kebab-case; got "${profile.dsShort}"`); process.exit(1); }
if (dsShort === 'cloudscape') { console.error('"cloudscape" is the built-in base system and cannot be scaffolded.'); process.exit(1); }

const lightOver = overridesFor(profile, 'light');
const darkOver = overridesFor(profile, 'dark');
const lightTokens = packTokens('light', lightOver);
const darkTokens = packTokens('dark', darkOver);
const accentLight = lightTokens['--accent'];
const accentDark = darkTokens['--accent'];

const idDark = `${dsShort}-dark`;
const idLight = `${dsShort}-light`;

console.log(`Scaffolding theme pack "${ds}" (dsShort=${dsShort}) → ${idDark}, ${idLight}`);
const report = { patched: [], skipped: [], wrote: [] };

/* ============================================================ 1) Prism.html */
{
  let html = readFileSync(HTML, 'utf8');
  const EOL = eolOf(html);
  if (html.includes(`id:'${idDark}'`) || html.includes(`id:'${idLight}'`)) {
    report.skipped.push(`Prism.html THEME_REGISTRY (already has ${idDark}/${idLight})`);
  } else {
    const P = constPrefix(dsShort);
    const cDark = `${P}_DARK_CSS`, cLight = `${P}_LIGHT_CSS`;
    const anchor = 'var THEME_REGISTRY=[';
    const arrStart = html.indexOf(anchor);
    if (arrStart < 0) throw new Error('THEME_REGISTRY not found in ' + HTML);

    // (a) CSS consts, inserted right before the registry array.
    const consts =
      `  var ${cDark}=${JSON.stringify(serializeRoot(darkTokens))};${EOL}` +
      `  var ${cLight}=${JSON.stringify(serializeRoot(lightTokens))};${EOL}`;
    html = html.slice(0, arrStart) + consts + html.slice(arrStart);

    // (b) two registry entries appended after the last existing entry (before `];`).
    const arrStart2 = html.indexOf(anchor);
    const closeAt = html.indexOf('];', arrStart2);
    if (closeAt < 0) throw new Error('THEME_REGISTRY closing `];` not found');
    const lastBrace = html.lastIndexOf('}', closeAt); // end of the current last entry
    const entryDark = `    {id:'${idDark}', ds:'${dsShort}', name:'${ds} Dark', mode:'dark', accent:'${accentDark}', builtin:false, css:${cDark}},`;
    const entryLight = `    {id:'${idLight}', ds:'${dsShort}', name:'${ds} Light', mode:'light', accent:'${accentLight}', builtin:false, css:${cLight}}`;
    const before = html.slice(0, lastBrace + 1);
    const after = html.slice(lastBrace + 1); // starts with EOL + '  ];'
    // Function replacement is not needed (we build the string ourselves) — plain concat.
    html = before + ',' + EOL + entryDark + EOL + entryLight + after;

    writeFileSync(HTML, html);
    report.patched.push(`Prism.html THEME_REGISTRY (+${idDark}, +${idLight}, +2 CSS consts)`);
  }
}

/* ==================================================== 2) MCP utils/themes.js */
{
  let src = readFileSync(THEMES_JS, 'utf8');
  const EOL = eolOf(src);
  const marker = '// ▼ scaffolded theme packs (F6)';
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('scaffold marker not found in ' + THEMES_JS + ' (expected "' + marker + '")');
  if (src.includes(`id: '${idDark}'`) || src.includes(`id: '${idLight}'`)) {
    report.skipped.push(`themes.js THEMES[] (already has ${idDark}/${idLight})`);
  } else {
    const jL = JSON.stringify(lightOver), jD = JSON.stringify(darkOver);
    const lineStart = src.lastIndexOf(EOL, at) + EOL.length; // start of the marker line (preserve its indent)
    const indent = src.slice(lineStart, at); // whitespace before the marker
    const entries =
      `${indent}{ id: '${idDark}', ds: '${dsShort}', dsName: '${ds}', name: '${ds} Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', ${jD}) },${EOL}` +
      `${indent}{ id: '${idLight}', ds: '${dsShort}', dsName: '${ds}', name: '${ds} Light', mode: 'light', builtin: false, tokens: packTokens('light', ${jL}) },${EOL}`;
    src = src.slice(0, lineStart) + entries + src.slice(lineStart);
    writeFileSync(THEMES_JS, src);
    report.patched.push(`themes.js THEMES[] (+${idDark}, +${idLight})`);
  }
}

/* ==================================================== 3) catalog/systems.json */
{
  const reg = JSON.parse(readFileSync(SYSTEMS, 'utf8'));
  reg.themePack = reg.themePack || [];
  const has = reg.themePack.some((s) => s.dsShort === dsShort) || (reg.legacy || []).some((s) => s.dsShort === dsShort);
  if (has) {
    report.skipped.push(`systems.json themePack[] (already lists ${dsShort})`);
  } else {
    const entry = { dsShort, name: ds };
    if (profile.ticket) entry.ticket = profile.ticket;
    reg.themePack.push(entry);
    const EOL = eolOf(readFileSync(SYSTEMS, 'utf8'));
    writeFileSync(SYSTEMS, JSON.stringify(reg, null, 2).replace(/\n/g, EOL) + EOL);
    report.patched.push(`systems.json themePack[] (+${dsShort})`);
  }
}

/* ============================================= 4) facet-gen profile stub (F4) */
{
  const target = resolve(PROFILES_DIR, dsShort + '.mjs');
  if (resolve(profilePath) === target) {
    report.skipped.push(`profiles/${dsShort}.mjs (input profile already lives there)`);
  } else if (existsSync(target)) {
    report.skipped.push(`profiles/${dsShort}.mjs (already exists)`);
  } else {
    const tp = profile.tokenProfile || { radius: '14px', font: 'inherit' };
    const stub =
      `/* Facet-gen profile for ${ds} (dsShort="${dsShort}") — scaffolded by _scaffold_ds.mjs (F6).\n` +
      `   Feed to the F4 generator to author the 100 spectrum facets:\n` +
      `     node catalog/_gen_system.mjs catalog/profiles/${dsShort}.mjs\n` +
      `   tokenProfile keys become .${dsShort}-root custom props (radius -> --${dsShort}-radius). */\n` +
      `export default {\n` +
      `  ds: ${JSON.stringify(ds)},\n` +
      `  dsShort: ${JSON.stringify(dsShort)},\n` +
      (profile.homeUrl ? `  homeUrl: ${JSON.stringify(profile.homeUrl)},\n` : '') +
      (profile.ticket ? `  ticket: ${JSON.stringify(profile.ticket)},\n` : '') +
      `  accent: ${JSON.stringify(profile.accent || accentDark)},\n` +
      `  tokenProfile: ${JSON.stringify(tp, null, 4).replace(/\n/g, '\n  ')},\n` +
      `};\n`;
    writeFileSync(target, stub);
    report.wrote.push(`profiles/${dsShort}.mjs (facet-gen stub)`);
  }
}

/* ------------------------------------------------------------------- report */
const line = (arr) => (arr.length ? arr.map((s) => '  • ' + s).join('\n') : '  (none)');
console.log('\nPatched:\n' + line(report.patched));
if (report.wrote.length) console.log('Wrote:\n' + line(report.wrote));
console.log('Skipped (idempotent):\n' + line(report.skipped));

console.log('\nAuto-maintained (no edit needed — derived from the theme registry):');
console.log('  • MCP get_theme_variants.builtInThemes / .note  (utils/themes.js → themesSummary)');
console.log('  • MCP get_theme_palette description + THEME_IDS enum');
console.log('  • variants.test.js theme-count assertions (derive from THEME_IDS)');

console.log('\nRemaining manual steps to finish the pack:');
console.log(`  1. Author facets:  node catalog/_gen_system.mjs catalog/profiles/${dsShort}.mjs`);
console.log(`  2. Merge + re-embed the island:  node catalog/_merge_spectrum.mjs …  then  node catalog/extract-from-prism.mjs && node catalog/_embed-catalog.mjs`);
console.log(`  3. Gate coverage:  node catalog/_check_ds.mjs --only ${dsShort}`);
console.log('  4. MCP suite:  (cd prism-mcp-server && node --test)');
console.log(`  5. F7 Showcase: the pack is already selectable via the registry; the Showcase page (JFH-40) reads THEME_REGISTRY, so it lists automatically once that page ships.`);
console.log('\n✓ Scaffold complete — the theme is selectable in both modes now (facets come next via F4).');
