// Embed the terminal catalog into Prism.html as a second JSON island.
//
//   node scripts/embed-island.mjs                  embed catalog/terminal-catalog.json into ../Prism.html
//   node scripts/embed-island.mjs --check          exit 1 if Prism.html's island is stale or missing
//   node scripts/embed-island.mjs --html <file> --catalog <file>
//   node scripts/embed-island.mjs --part <parts/island-prism-terminal-catalog.html> [--check]
//                                                  parts workflow: rewrite only the island part
//
// The island sits right after the web catalog island:
//
//   <!-- ===== /PRISM CATALOG ===== -->
//   <!-- ===== PRISM TERMINAL CATALOG · AI START HERE ===== -->
//   <script type="application/json" id="prism-terminal-catalog">
//   {…header…,"facets":[
//   {…one facet per line…},
//   …
//   ],"sources":{
//   "prism-term/src/facets/…":"…one module per line…",
//   …
//   }}
//   </script>
//   <!-- ===== /PRISM TERMINAL CATALOG ===== -->
//
// Re-running replaces only that block (idempotent). "</script" inside the JSON
// is written as "<\/script" and "<!--" as "\u003c!--" (valid JSON, parses back
// unchanged with a plain JSON.parse of the element's text). The file's own
// line endings are kept, and nothing outside the block — except one sentence
// appended to the AI-READABLE breadcrumb comment — is ever modified; every run
// verifies that before writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ISLAND_ID = 'prism-terminal-catalog';
export const ISLAND_OPEN = `<script type="application/json" id="${ISLAND_ID}">`;
export const START = '<!-- ===== PRISM TERMINAL CATALOG · AI START HERE ===== -->';
export const END = '<!-- ===== /PRISM TERMINAL CATALOG ===== -->';
const WEB_END = '<!-- ===== /PRISM CATALOG ===== -->';
const CRUMB_OPEN = '<!-- ✦ AI-READABLE:';
// No tag text in it: a "<script" inside the breadcrumb comment would cut it in the parts tokenizer. The
// 2026-10-16 breadcrumb names all three islands (end of <body>) itself, so this note is only ever added
// to an older breadcrumb that does not mention the terminal island.
export const CRUMB_NOTE = ' Terminal facets (prism-term) are in the JSON island id="prism-terminal-catalog" right after it — same "_ai" convention.';

/**
 * JSON text for the island: header compact, then one facet per line and one
 * `sources` entry per line (diff-friendly), keeping the catalog's key order
 * (header…, facets, sources). "</script" (any case) would end the element and
 * "<!--" can stop a later "</script>" from ending it, so both are escaped; "<"
 * only occurs inside JSON strings, where "<\/" and "<" parse back unchanged.
 */
export function islandJson(catalog, eol = '\n') {
  const { facets = [], sources, ...head } = catalog;
  const headJson = JSON.stringify(head);
  const parts = [`"facets":[${eol}${facets.map((f) => JSON.stringify(f)).join(`,${eol}`)}${eol}]`];
  if (sources) parts.push(`"sources":{${eol}${Object.entries(sources).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(`,${eol}`)}${eol}}`);
  const json = `${headJson === '{}' ? '{' : headJson.slice(0, -1) + ','}${parts.join(',')}}`;
  return json.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '\\u003c!--');
}

/**
 * Schema-2 integrity: every facet's `module`, and every "_" gallery helper in
 * its `imports`, must have its code in the top-level `sources`; and the browser
 * engine closure must be complete — every prism-term/src/ module a facet imports,
 * and every module those import statically, is in `sources` too (Node-only
 * screen.js / loop.js excepted). [] when sound.
 */
const NODE_ONLY_ENGINE = new Set(['prism-term/src/screen.js', 'prism-term/src/loop.js']);
const STATIC_SPEC = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
const isEngineKey = (k) => k.startsWith('prism-term/src/') && !k.startsWith('prism-term/src/facets/');
export function catalogProblems(catalog) {
  const out = [];
  const sources = catalog.sources && typeof catalog.sources === 'object' ? catalog.sources : null;
  if (!sources) return ['no top-level `sources` object'];
  const engineNeeded = new Map();   // engine key -> first importer
  const need = (key, by) => { if (isEngineKey(key) && !NODE_ONLY_ENGINE.has(key) && !engineNeeded.has(key)) engineNeeded.set(key, by); };
  for (const f of catalog.facets || []) {
    if ('source' in f) out.push(`${f.id}: record still carries \`source\` (schema 2 keeps code in \`sources\`)`);
    if (!Object.hasOwn(sources, f.module)) out.push(`${f.id}: module ${f.module} is not a key of sources`);
    for (const spec of f.imports || []) {
      if (!spec.startsWith('.')) continue;
      const key = path.posix.normalize(path.posix.join(path.posix.dirname(f.module), spec));
      if (key.startsWith('prism-term/src/facets/') && /\/_[^/]*\.js$/.test(key) && !Object.hasOwn(sources, key)) out.push(`${f.id}: helper ${key} (imported as ${spec}) is not in sources`);
      need(key, f.module);
    }
  }
  // engine modules already in the island must have their own static imports there too
  for (const [k, code] of Object.entries(sources)) {
    if (!isEngineKey(k) || typeof code !== 'string') continue;
    for (const [, spec] of code.matchAll(STATIC_SPEC)) if (spec.startsWith('.')) need(path.posix.normalize(path.posix.join(path.posix.dirname(k), spec)), k);
  }
  for (const [k, by] of engineNeeded) if (!Object.hasOwn(sources, k)) out.push(`engine module ${k} (imported by ${by}) is not in sources`);
  return out;
}

/**
 * The catalog for pages that import modules on demand and render tiles live
 * (website/terminal/): no top-level `sources` and no facet `preview`.
 * Prism.html and terminal-catalog.json keep the full catalog.
 */
export function leanCatalog(catalog) {
  const { sources, ...rest } = catalog;
  return {
    ...rest,
    _ai: {
      ...catalog._ai,
      lean: true,
      leanNote: 'Lean copy: no top-level `sources` and no facet `preview`; everything else is as in the full catalog. The full catalog (with both) is the #prism-terminal-catalog island of /Prism.html and /terminal/engine/catalog/terminal-catalog.json; each module file is also at /terminal/engine/<module without the "prism-term/" prefix>.',
    },
    facets: catalog.facets.map(({ source, preview, ...f }) => f),
  };
}

export function islandBlock(catalog, eol = '\n') {
  return `${START}${eol}${ISLAND_OPEN}${eol}${islandJson(catalog, eol)}${eol}</script>${eol}${END}${eol}`;
}

/** Locate an existing block: [start, endExclusive] including its trailing line ending, or null. */
function findBlock(html) {
  const a = html.indexOf(START);
  if (a < 0) return null;
  const e = html.indexOf(END, a);
  if (e < 0) throw new Error('Prism.html has a terminal-catalog start marker without an end marker');
  let b = e + END.length;
  if (html.startsWith('\r\n', b)) b += 2;
  else if (html[b] === '\n') b += 1;
  return [a, b];
}

/** Where a fresh block goes: after the web island's end marker (and its line ending), else after </title>. */
function insertionPoint(html) {
  for (const marker of [WEB_END, '</title>']) {
    const i = html.indexOf(marker);
    if (i < 0) continue;
    let j = i + marker.length;
    if (html.startsWith('\r\n', j)) j += 2;
    else if (html[j] === '\n') j += 1;
    return j;
  }
  throw new Error('Prism.html has neither the #prism-catalog island end marker nor </title> — refusing to guess where to embed');
}

/** [start of "<!-- ✦ AI-READABLE:", index of its "-->"], or null. */
function findCrumb(html) {
  const i = html.indexOf(CRUMB_OPEN);
  const j = i < 0 ? -1 : html.indexOf('-->', i);
  return j < 0 ? null : [i, j];
}

/** Append CRUMB_NOTE unless the breadcrumb already mentions the island (as _embed-catalog.mjs now writes it). */
function withCrumbNote(html) {
  const c = findCrumb(html);
  if (!c) return html;
  const crumb = html.slice(c[0], c[1]);
  if (crumb.includes(ISLAND_ID)) return html;
  return html.slice(0, c[0]) + crumb.replace(/\s+$/, '') + CRUMB_NOTE + ' ' + html.slice(c[1]);
}

function withoutCrumbNote(html) {
  const c = findCrumb(html);
  if (!c || !html.startsWith(CRUMB_NOTE + ' ', c[1] - CRUMB_NOTE.length - 1)) return html;
  return html.slice(0, c[1] - CRUMB_NOTE.length - 1) + ' ' + html.slice(c[1]);
}

/**
 * Remove our block and the breadcrumb note — the inverse of embedIsland. The
 * note goes even when catalog/_embed-catalog.mjs wrote it (it points at the
 * block); embedIsland puts it back byte-for-byte, so a file that already has
 * the note comes out unchanged outside the block.
 */
export function stripIsland(html) {
  const blk = findBlock(html);
  const out = blk ? html.slice(0, blk[0]) + html.slice(blk[1]) : html;
  return withoutCrumbNote(out);
}

/**
 * Embed (or replace) the island. Returns { html, changed }. Throws if anything
 * other than the block and the breadcrumb note would change.
 */
export function embedIsland(html, catalog) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = islandBlock(catalog, eol);
  const base = stripIsland(html);
  const at = insertionPoint(base);
  const next = withCrumbNote(base.slice(0, at) + block + base.slice(at));
  // Self-check: removing what we added must give back the input minus our old block.
  if (stripIsland(next) !== base) throw new Error('embed self-check failed: content outside the island block would change');
  if (JSON.stringify(extractIsland(next)) !== JSON.stringify(catalog)) throw new Error('embed self-check failed: island does not round-trip');
  return { html: next, changed: next !== html };
}

/** Parse the terminal island out of an HTML document (null when absent). */
export function extractIsland(html) {
  const a = html.indexOf(ISLAND_OPEN);
  if (a < 0) return null;
  const start = a + ISLAND_OPEN.length;
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error('terminal-catalog island is not terminated');
  return JSON.parse(html.slice(start, end));
}

/**
 * Parts workflow (Prism.html edited as aaa-prism-ds/parts/): the island element is its
 * own part file, `<script type="application/json" id="prism-terminal-catalog">…</script>`,
 * with the START/END marker comments living in the neighbouring gap parts. Rewrite only
 * the element's JSON, keeping the part's line endings. Returns { text, changed }.
 */
export function embedIntoPart(partText, catalog) {
  const a = partText.indexOf(ISLAND_OPEN);
  if (a !== 0 || !partText.trimEnd().endsWith('</script>')) throw new Error(`not a ${ISLAND_ID} island part (expected it to start with ${ISLAND_OPEN} and end with </script>)`);
  const eol = partText.includes('\r\n') ? '\r\n' : '\n';
  const tail = partText.slice(partText.lastIndexOf('</script>'));
  const text = `${ISLAND_OPEN}${eol}${islandJson(catalog, eol)}${eol}${tail}`;
  if (JSON.stringify(extractIsland(text)) !== JSON.stringify(catalog)) throw new Error('embed self-check failed: island part does not round-trip');
  return { text, changed: text !== partText };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? path.resolve(args[i + 1]) : d; };
  // --part <aaa-prism-ds/parts/island-prism-terminal-catalog.html>: write the island PART
  // (a join then carries it into Prism.html). Writing Prism.html directly while the team
  // edits parts would be overwritten by the next `parts.mjs join`.
  const partFile = opt('--part', null);
  if (partFile) {
    const catFile = opt('--catalog', path.resolve(HERE, '..', 'catalog', 'terminal-catalog.json'));
    const catalog = JSON.parse(fs.readFileSync(catFile, 'utf8'));
    const problems = catalogProblems(catalog);
    if (problems.length) { console.error(`${path.basename(catFile)} is inconsistent:\n  ${problems.join('\n  ')}`); process.exit(1); }
    const cur = fs.readFileSync(partFile, 'utf8');
    if (args.includes('--check')) {
      if (JSON.stringify(extractIsland(cur)) !== JSON.stringify(catalog)) { console.error(`${path.basename(partFile)} is stale — run embed-island.mjs --part`); process.exit(1); }
      console.log(`${path.basename(partFile)} up to date (${catalog.facets.length} facets)`); process.exit(0);
    }
    const { text, changed } = embedIntoPart(cur, catalog);
    if (changed) { const tmp = partFile + '.tmp-' + process.pid; fs.writeFileSync(tmp, text); fs.renameSync(tmp, partFile); }
    console.log(`${changed ? 'embedded' : 'unchanged'}: #${ISLAND_ID} in ${path.basename(partFile)} (${catalog.facets.length} facets)`);
    process.exit(0);
  }
  const htmlFile = opt('--html', path.resolve(HERE, '..', '..', 'Prism.html'));
  const catFile = opt('--catalog', path.resolve(HERE, '..', 'catalog', 'terminal-catalog.json'));
  if (!fs.existsSync(catFile)) { console.error(`${catFile} not found — run \`npm run catalog\` first`); process.exit(1); }
  const catalog = JSON.parse(fs.readFileSync(catFile, 'utf8'));
  const html = fs.readFileSync(htmlFile, 'utf8');
  const refuse = (what, problems) => { console.error(`${what} is inconsistent:\n  ${problems.join('\n  ')}`); process.exit(1); };
  if (args.includes('--check')) {
    const cur = extractIsland(html);
    if (!cur) { console.error(`${path.basename(htmlFile)} has no #${ISLAND_ID} island — run \`npm run island\``); process.exit(1); }
    const problems = catalogProblems(cur);
    if (problems.length) refuse(`${path.basename(htmlFile)}'s terminal island`, problems);
    if (JSON.stringify(cur) !== JSON.stringify(catalog)) { console.error(`${path.basename(htmlFile)}'s terminal island is stale — run \`npm run island\``); process.exit(1); }
    console.log(`${path.basename(htmlFile)} terminal island up to date (${catalog.facets.length} facets, ${Object.keys(cur.sources).length} sources)`);
  } else {
    const problems = catalogProblems(catalog);
    if (problems.length) refuse(path.basename(catFile), problems);
    const { html: next, changed } = embedIsland(html, catalog);
    if (changed) fs.writeFileSync(htmlFile, next);
    const size = Buffer.byteLength(islandBlock(catalog, html.includes('\r\n') ? '\r\n' : '\n'));
    console.log(`${changed ? 'embedded' : 'unchanged'}: #${ISLAND_ID} in ${path.basename(htmlFile)} (${catalog.facets.length} facets, ${(size / 1024).toFixed(0)} KB)`);
  }
}
