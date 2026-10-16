// Write the Stream Deck catalog island as a Prism.html PART file.
//
//   node scripts/embed-island.mjs                    catalog/deck-catalog.json → aaa-prism-ds/parts/island-prism-deck-catalog.html
//   node scripts/embed-island.mjs --check            exit 1 if the part is missing or stale
//   node scripts/embed-island.mjs --parts <dir>      another parts folder (or env PRISM_PARTS)
//   node scripts/embed-island.mjs --html <file>      embed into a whole HTML file instead (between markers, after the
//                                                    terminal island) — for the website build / pipeline
//
// The part is exactly one element, like island-prism-terminal-catalog.html:
//
//   <script type="application/json" id="prism-deck-catalog">
//   {...minified islandCatalog(catalog)...}
//   </script>
//
// The island is islandCatalog(catalog): the catalog minus every facet's static `preview` SVG
// (~2.6 MB that Prism.html never shows: its Stream Deck page renders live from `sources`). The
// previews stay in catalog/deck-catalog.json and the site's /deck/engine/catalog/deck-catalog.json;
// the MCP server fills them in from there. It belongs in parts/ORDER right after the terminal
// island's block, at the end of <body>
// (island-prism-terminal-catalog → gap-003 → island-prism-deck-catalog). "</script"
// inside the JSON is written "<\/script" and "<!--" as "\u003c!--" (valid JSON,
// parses back unchanged). Line endings follow the terminal part (CRLF today).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ISLAND_ID = 'prism-deck-catalog';
export const ISLAND_OPEN = `<script type="application/json" id="${ISLAND_ID}">`;
export const PART_NAME = `island-${ISLAND_ID}`;
export const MODULE_PREFIX = 'prism-deck/src/';
export const START = '<!-- ===== PRISM DECK CATALOG · AI START HERE ===== -->';
export const END = '<!-- ===== /PRISM DECK CATALOG ===== -->';
const TERMINAL_END = '<!-- ===== /PRISM TERMINAL CATALOG ===== -->';
const WEB_END = '<!-- ===== /PRISM CATALOG ===== -->';

/** JSON text of `catalog` as given, minified; </script and <!-- escaped. (`eol` is accepted for compatibility.) */
export function islandJson(catalog, eol = '\n') {   // eslint-disable-line no-unused-vars
  return JSON.stringify(catalog).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\u003c!--');
}

export const PREVIEWS_NOTE = 'Not in this island (Prism.html renders every facet live from `sources`): each facet\'s static preview { w, h, t, svg } is in prism-deck/catalog/deck-catalog.json and /deck/engine/catalog/deck-catalog.json on the site.';

/** What the Prism.html island carries: the catalog without the facets' static `preview` SVGs (idempotent). */
export function islandCatalog(catalog) {
  const { facets = [], ...rest } = catalog;
  return {
    ...rest,
    _ai: { ...catalog._ai, previews: PREVIEWS_NOTE },
    facets: facets.map(({ preview, ...f }) => f),   // eslint-disable-line no-unused-vars
  };
}

/** The part file's full text (the island form of the catalog). */
export const islandPart = (catalog, eol = '\n') => `${ISLAND_OPEN}${eol}${islandJson(islandCatalog(catalog), eol)}${eol}</script>`;

/** Parse the deck island out of HTML / part text (null when absent). */
export function extractIsland(html) {
  const a = html.indexOf(ISLAND_OPEN);
  if (a < 0) return null;
  const start = a + ISLAND_OPEN.length;
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error('deck-catalog island is not terminated');
  return JSON.parse(html.slice(start, end));
}

/**
 * Schema-2 integrity: every facet's `module` and every relative import of every
 * module in `sources` resolves to a key of `sources`. [] when sound.
 */
export function catalogProblems(catalog) {
  const out = [];
  const sources = catalog.sources && typeof catalog.sources === 'object' ? catalog.sources : null;
  if (!sources) return ['no top-level `sources` object'];
  for (const f of catalog.facets || []) {
    if ('source' in f) out.push(`${f.id}: record carries \`source\` (schema 2 keeps code in \`sources\`)`);
    if (!Object.hasOwn(sources, f.module)) out.push(`${f.id}: module ${f.module} is not a key of sources`);
  }
  for (const [key, code] of Object.entries(sources)) {
    for (const m of code.matchAll(/^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(key), spec));
      if (!Object.hasOwn(sources, dep)) out.push(`${key}: import ${spec} → ${dep} is not in sources`);
    }
  }
  return out;
}

/** Lean copy for pages that import modules over HTTP (website /deck/): no `sources`, no previews. */
export function leanCatalog(catalog) {
  const { sources, ...rest } = catalog;
  return {
    ...rest,
    _ai: { ...catalog._ai, lean: true, leanNote: 'Lean copy: no top-level `sources` and no facet `preview`. The full catalog is /deck/engine/catalog/deck-catalog.json (the #prism-deck-catalog island of /Prism.html has the sources, not the previews); each module is at /deck/engine/<module without the "prism-deck/" prefix>.' },
    facets: catalog.facets.map(({ preview, ...f }) => f),
  };
}

/** Embed (or replace) a marked block in a whole HTML document, after the terminal island (or the web island, or </title>). */
export function embedInHtml(html, catalog) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = `${START}${eol}${islandPart(catalog, eol)}${eol}${END}${eol}`;
  let base = html;
  const a = base.indexOf(START);
  if (a >= 0) {
    const e = base.indexOf(END, a);
    if (e < 0) throw new Error('deck-catalog start marker without an end marker');
    let b = e + END.length;
    if (base.startsWith('\r\n', b)) b += 2; else if (base[b] === '\n') b += 1;
    base = base.slice(0, a) + base.slice(b);
  }
  let at = -1;
  for (const marker of [TERMINAL_END, WEB_END, '</title>']) {
    const i = base.indexOf(marker);
    if (i < 0) continue;
    at = i + marker.length;
    if (base.startsWith('\r\n', at)) at += 2; else if (base[at] === '\n') at += 1;
    break;
  }
  if (at < 0) throw new Error('no terminal/web island end marker or </title> — refusing to guess where to embed');
  const next = base.slice(0, at) + block + base.slice(at);
  if (JSON.stringify(extractIsland(next)) !== JSON.stringify(islandCatalog(catalog))) throw new Error('embed self-check failed: island does not round-trip');
  return { html: next, changed: next !== html };
}

export function partsDir(args = process.argv.slice(2)) {
  const i = args.indexOf('--parts');
  if (i >= 0) return path.resolve(args[i + 1]);
  return process.env.PRISM_PARTS || path.resolve(HERE, '..', '..', '..', 'aaa-prism-ds', 'parts');
}

/** EOL to use: whatever the terminal island part uses (the parts are slices of one CRLF file). */
export function partsEol(dir) {
  const term = path.join(dir, 'island-prism-terminal-catalog.html');
  if (!fs.existsSync(term)) return '\n';
  const fd = fs.openSync(term, 'r');
  const buf = Buffer.alloc(4096);
  const n = fs.readSync(fd, buf, 0, 4096, 0);
  fs.closeSync(fd);
  return buf.subarray(0, n).includes('\r\n') ? '\r\n' : '\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? path.resolve(args[i + 1]) : d; };
  const catFile = opt('--catalog', path.resolve(HERE, '..', 'catalog', 'deck-catalog.json'));
  if (!fs.existsSync(catFile)) { console.error(`${catFile} not found — run \`npm run catalog\` first`); process.exit(1); }
  const catalog = JSON.parse(fs.readFileSync(catFile, 'utf8'));
  const problems = catalogProblems(catalog);
  if (problems.length) { console.error(`${path.basename(catFile)} is inconsistent:\n  ${problems.join('\n  ')}`); process.exit(1); }
  const htmlFile = opt('--html', null);
  if (htmlFile) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    if (args.includes('--check')) {
      const cur = extractIsland(html);
      if (!cur || JSON.stringify(cur) !== JSON.stringify(islandCatalog(catalog))) { console.error(`${path.basename(htmlFile)}'s #${ISLAND_ID} island is missing or stale`); process.exit(1); }
      console.log(`${path.basename(htmlFile)} deck island up to date`);
    } else {
      const { html: next, changed } = embedInHtml(html, catalog);
      if (changed) fs.writeFileSync(htmlFile, next);
      console.log(`${changed ? 'embedded' : 'unchanged'}: #${ISLAND_ID} in ${path.basename(htmlFile)} (${catalog.facets.length} facets)`);
    }
  } else {
    const dir = partsDir(args);
    const file = path.join(dir, `${PART_NAME}.html`);
    const text = islandPart(catalog, partsEol(dir));
    if (args.includes('--check')) {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (cur === null) { console.error(`${file} is missing — run \`npm run island\``); process.exit(1); }
      if (cur !== text) { console.error(`${path.basename(file)} is stale — run \`npm run island\``); process.exit(1); }
      console.log(`${path.basename(file)} up to date (${catalog.facets.length} facets, ${Object.keys(catalog.sources).length} sources)`);
    } else {
      if (!fs.existsSync(dir)) { console.error(`parts folder ${dir} not found (use --parts <dir>)`); process.exit(1); }
      const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (cur !== text) fs.writeFileSync(file, text);
      console.log(`${cur === text ? 'unchanged' : 'wrote'}: ${file} (${catalog.facets.length} facets, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB)`);
    }
  }
}
