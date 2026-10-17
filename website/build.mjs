// Build a portable static site. Run from any working directory with Node.js 18+.
//
//   node website/build.mjs [out-dir] [--allow-stale] [--allow-incomplete] [--no-pack]
//
// Produces site-dist/ (or out-dir) with:
//   index.html, styles.css, app.js, assets/   the landing page
//   Prism.html                                the web catalog, carrying the three JSON islands (end of <body>)
//   terminal/                                 the web terminal catalog (live in the browser)
//     engine/                                 the browser-safe prism-term engine + terminal-catalog.json
//     tty-preview/                            HTML previews of the curl pages
//   deck/                                     the Stream Deck page, once website/deck/ exists
//     engine/                                 prism-deck/src + package.json + deck-catalog.json
//   tty, t/, f/                               the curl-able terminal site (ANSI; .txt and .24 variants)
//   themes/<format>/<file>                    terminal color schemes (prism-term/themes/**; listed at /t/themes)
//   dl/prism-term-<version>.tgz, SHA256SUMS   the live player for npx (+ prism-term.tgz, the latest-release alias)
//   sitemap.xml, robots.txt, CNAME, .nojekyll
//
// The build is deterministic and fails loudly: a stale terminal catalog or
// Prism.html island, a missing terminal page, a page that breaks the contract,
// or a broken relative link on the landing/terminal/deck pages stops it. --allow-stale / --allow-incomplete relax that for local work.
import { readFile, writeFile, mkdir, cp, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadCatalogFile } from '../prism-mcp-server/utils/catalog.js';
import { buildTools } from '../prism-mcp-server/tools/index.js';
import { buildCatalog } from '../prism-term/scripts/build-catalog.mjs';
import { embedIsland, extractIsland, islandJson, leanCatalog, ISLAND_ID } from '../prism-term/scripts/embed-island.mjs';
import { writeTtySite } from '../prism-term/scripts/build-tty-site.mjs';
import { pack } from '../prism-term/scripts/pack.mjs';
import { writeBundle, rewireImports, sharedDeps, bundleable } from './scripts/esm-bundle.mjs';

const SITE_URL = 'https://prism.jeremyfhall.com';
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const site = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(site);
const term = path.join(repo, 'prism-term');
const output = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(repo, 'site-dist'));
if (output === repo || output === site || repo.startsWith(output + path.sep)) throw new Error('Output must be a dedicated build directory.');
const fail = (msg, relax) => { if (relax) console.warn(`warning: ${msg}`); else throw new Error(msg); };

// website/assets/ previews, showcase.json and galleries.json are tracked, LF in
// the index, and checked out as CRLF where core.autocrlf=true. Don't touch a file
// whose content only differs in line endings (that's what made git report them
// modified); when the content really changes, keep the file's existing endings.
const lf = (s) => s.replace(/\r\n/g, '\n');
async function writeTracked(file, content) {
  if (existsSync(file)) {
    const current = await readFile(file, 'utf8');
    if (lf(current) === lf(content)) return false;
    if (current.includes('\r\n')) content = lf(content).replace(/\n/g, '\r\n');
  }
  await writeFile(file, content);
  return true;
}

// ── landing page (web catalog previews) ─────────────────────────────────────
const catalog = await loadCatalogFile(path.join(repo, 'Prism.html'));
const ids = ['ai-processing-orb', 'charts-kpi-sparkline', 'fx-aurora', 'objects-atom', 'text-gradient-flow-staple', 'lab-scale-in-bounce'];
const legacy = ':root{--gray:#72869f;--orange:var(--accent);--red:#f85149;--blue:var(--info);--green:var(--pos);--purple:var(--crit)}';
const base = ':root{color-scheme:dark;--preview-bg:#0a0c12}*{box-sizing:border-box}html,body{background:var(--preview-bg)}body{margin:0;min-height:220px;display:flex;align-items:center;justify-content:center;padding:22px;font-family:system-ui,sans-serif;color:var(--ink)}.panel{min-width:215px}.ptitle{padding-left:0!important}.atom{width:145px;height:145px}';
const motion = '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition:none!important}}';
await mkdir(path.join(site, 'assets', 'previews'), { recursive: true });
const showcase = [];
for (const id of ids) {
  const effect = catalog.effects.find((item) => item.id === id);
  if (!effect || effect.needsJs) throw new Error(`Preview requires an available CSS-only facet: ${id}`);
  const html = effect.html.replace(/<button\b[^>]*class="pr-playbtn"[\s\S]*?<\/button>/g, '');
  const css = catalog.tokens.css + legacy + base + effect.css + motion;
  const title = effect.name.replace(/[<>]/g, '');
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body>${html}</body></html>`;
  await writeTracked(path.join(site, 'assets', 'previews', id + '.html'), doc);
  showcase.push({ id, name: effect.name.replace(/ ★.*/, ''), gallery: effect.gallery, galleryTitle: effect.galleryTitle, snippet: `<style>\n${catalog.tokens.css}\n${legacy}\n${effect.css}\n</style>\n${html}` });
}
await writeTracked(path.join(site, 'assets', 'showcase.json'), JSON.stringify(showcase, null, 2) + '\n');
await writeTracked(path.join(site, 'assets', 'galleries.json'), JSON.stringify(catalog.galleries, null, 2) + '\n');

// ── terminal catalog (the second island) ────────────────────────────────────
const terminal = buildCatalog();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const committedFile = path.join(term, 'catalog', 'terminal-catalog.json');
const committed = existsSync(committedFile) ? JSON.parse(await readFile(committedFile, 'utf8')) : null;
if (!same(committed, terminal)) fail('prism-term/catalog/terminal-catalog.json is stale — run `npm run catalog` in prism-term/', flag('--allow-stale'));
const prismHtml = await readFile(path.join(repo, 'Prism.html'), 'utf8');
if (!same(extractIsland(prismHtml), terminal)) fail(`Prism.html's #${ISLAND_ID} island is missing or stale — run \`npm run island\` in prism-term/ (parts workflow: \`node tools/term-island-sync.mjs --write\` in aaa-prism-ds, then join)`, flag('--allow-stale'));

// ── Stream Deck catalog (the third island) — engaged once the deck ships ─────
// Active when website/deck/ exists or Prism.html carries #prism-deck-catalog; until then
// nothing here runs and the site builds exactly as before. Same contract as the terminal:
// the island is DERIVED (prism-deck/scripts/build-catalog.mjs) and both the committed
// deck-catalog.json and the Prism.html island must equal a fresh build.
const deckRepo = path.join(repo, 'prism-deck');
const deckSrc = path.join(site, 'deck');
let deck = null, deckIsland = null;
if (existsSync(deckSrc) || prismHtml.includes('<script type="application/json" id="prism-deck-catalog">')) {
  if (!existsSync(path.join(deckRepo, 'scripts', 'build-catalog.mjs'))) fail('a deck page or island exists but prism-deck/scripts/build-catalog.mjs does not', flag('--allow-incomplete'));
  else {
    try {
      deckIsland = await import(pathToFileURL(path.join(deckRepo, 'scripts', 'embed-island.mjs')).href);
      deck = (await import(pathToFileURL(path.join(deckRepo, 'scripts', 'build-catalog.mjs')).href)).buildCatalog();
    } catch (e) { deck = null; fail(`the deck catalog does not build (prism-deck mid-edit?): ${String(e && e.message || e).split('\n')[0]}`, flag('--allow-incomplete')); }
  }
  if (deck) {
    const deckFile = path.join(deckRepo, 'catalog', 'deck-catalog.json');
    const deckCommitted = existsSync(deckFile) ? JSON.parse(await readFile(deckFile, 'utf8')) : null;
    if (!same(deckCommitted, deck)) fail('prism-deck/catalog/deck-catalog.json is stale — run `npm run catalog` in prism-deck/', flag('--allow-stale'));
    // the island is the catalog minus the facets' static previews (embed-island.mjs islandCatalog); the site's
    // engine/catalog/deck-catalog.json below keeps them
    if (!same(deckIsland.extractIsland(prismHtml), deckIsland.islandCatalog ? deckIsland.islandCatalog(deck) : deck)) fail(`Prism.html's #${deckIsland.ISLAND_ID} island is missing or stale — run \`node scripts/embed-island.mjs\` in prism-deck/ (writes the island part), then join the parts`, flag('--allow-stale'));
  }
}

// Live numbers for annotated text — the element's whole text is replaced:
//   <… data-web-stat="facets|galleries|gallery:<id>">   the #prism-catalog island (ids as in assets/galleries.json)
//   <… data-terminal-stat="facets|galleries">           the terminal catalog
//   <… data-deck-stat="facets|galleries">               the deck catalog (only once it ships)
//   <… data-mcp-tools>  <… data-prism-size>             MCP tool count; built Prism.html size (filled once it's written)
// An unknown key fails the build.
const fmt = (n) => n.toLocaleString('en-US');
const stats = {
  'data-web-stat="facets"': fmt(catalog.effects.length),
  'data-web-stat="galleries"': fmt(catalog.galleries.length),
  ...Object.fromEntries(catalog.galleries.map((g) => [`data-web-stat="gallery:${g.id}"`, fmt(g.count)])),
  'data-terminal-stat="facets"': fmt(terminal.facets.length),
  'data-terminal-stat="galleries"': fmt(terminal.galleries.length),
  'data-mcp-tools': fmt(buildTools().length),
  ...(deck ? { 'data-deck-stat="facets"': fmt(deck.facets.length), 'data-deck-stat="galleries"': fmt((deck.galleries || []).length) } : {}),
};
const STAT_ATTR = /\s(data-web-stat="[^"]*"|data-terminal-stat="[^"]*"|data-deck-stat="[^"]*"|data-mcp-tools|data-prism-size)(?=[\s>=])/i;
function withStats(html, name) {
  let filled = 0;
  const out = html.replace(/(<[a-z][a-z0-9-]*\b[^>]*>)([^<]*)(?=<\/)/gi, (all, open) => {
    const key = open.match(STAT_ATTR)?.[1];
    if (!key) return all;
    if (!(key in stats)) throw new Error(`${name}: no value to fill ${key}`);
    filled++;
    return open + stats[key];
  });
  // Each annotated element must hold plain text only, or the fill above can't reach it.
  const marked = (html.match(new RegExp(STAT_ATTR.source, 'gi')) || []).length;
  if (filled !== marked) throw new Error(`${name}: ${marked - filled} data-web-stat/data-terminal-stat/data-deck-stat/data-mcp-tools/data-prism-size element(s) contain markup — they must hold plain text`);
  return out;
}

// ── output ──────────────────────────────────────────────────────────────────
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'assets']) await cp(path.join(site, file), path.join(output, file), { recursive: true });
// Site monitoring (Traceway + web-vitals, loaded by assets/telemetry.js) runs on every HTML page.
// The landing and terminal pages carry the tags in source; the hosted Prism.html gets a loader
// that only fires on the site's own host, so a downloaded copy stays offline and silent.
const MONITORING = ['assets/vendor/traceway-1.2.1.js', 'assets/vendor/web-vitals-6.2.3.js', 'assets/telemetry.js'];
const HOST = new URL(SITE_URL).hostname;
const prismLoader = `<script>/* Site monitoring, hosted copy only: offline or on any other host this does nothing. */(function(){if(location.hostname!==${JSON.stringify(HOST)})return;${JSON.stringify(MONITORING)}.forEach(function(s){var e=document.createElement('script');e.src=s;e.async=false;document.head.appendChild(e);});})();</script>`;
function withMonitoring(html) {
  const charset = /<meta charset="[^"]*">(\r?\n)/i.exec(html);
  if (!charset) throw new Error('Prism.html: no <meta charset> to anchor the monitoring loader after');
  const at = charset.index + charset[0].length;
  return html.slice(0, at) + prismLoader + charset[1] + html.slice(at);
}
const builtPrism = withMonitoring(embedIsland(prismHtml, terminal).html);
await writeFile(path.join(output, 'Prism.html'), builtPrism);
stats['data-prism-size'] = `${(Buffer.byteLength(builtPrism) / 1048576).toFixed(1)} MB`;
const landing = withStats(await readFile(path.join(output, 'index.html'), 'utf8'), 'index.html');
await writeFile(path.join(output, 'index.html'), landing);
// The built landing page lists every web gallery, and its counts add up to the catalog
// (the data-web-stat="gallery:<id>" hooks fill them, so the source numbers are only fallbacks).
const counts = [...landing.matchAll(/class="gallery-count">([\d,]+)/g)].map((match) => Number(match[1].replaceAll(',', '')));
const hooked = new Set([...landing.matchAll(/data-web-stat="gallery:([^"]+)"/g)].map((m) => m[1]));
const unlisted = catalog.galleries.filter((g) => !hooked.has(g.id)).map((g) => g.id);
if (unlisted.length || counts.length !== catalog.galleries.length || counts.reduce((sum, count) => sum + count, 0) !== catalog.effects.length) {
  throw new Error(`Landing-page gallery list doesn't match the web catalog: ${counts.length} gallery counts summing to ${counts.reduce((s, c) => s + c, 0)} vs ${catalog.galleries.length} galleries / ${catalog.effects.length} facets${unlisted.length ? `; no data-web-stat="gallery:<id>" hook for ${unlisted.join(', ')}` : ''}`);
}

// Web terminal catalog: page(s) + engine. Contract (website/terminal/*.html):
//   <meta name="prism-engine" content="../../prism-term/">  → rewritten to "./engine/"
//   href/src="../../prism-term/…" (e.g. catalog/terminal-catalog.json)  → "./engine/…"
//   <script type="application/json" id="prism-terminal-catalog"></script>  → filled with the LEAN island
//     (no `source` or `preview`: the page imports modules from ./engine/ and renders tiles live).
//     Prism.html and engine/catalog/terminal-catalog.json keep the full records.
const termSrc = path.join(site, 'terminal');
const termOut = path.join(output, 'terminal');
const termPages = [];
if (!existsSync(path.join(termSrc, 'index.html'))) fail('website/terminal/index.html is missing (the web terminal catalog page)', flag('--allow-incomplete'));
else {
  await cp(termSrc, termOut, { recursive: true });
  for (const file of await walk(termOut)) {
    if (!file.endsWith('.html')) continue;
    const rel = path.relative(termOut, file).split(path.sep).join('/');
    let html = withStats(await readFile(file, 'utf8'), `terminal/${rel}`);
    const hasIsland = new RegExp(`<script type="application/json" id="${ISLAND_ID}">\\s*</script>`).test(html);
    if (rel === 'index.html' && !hasIsland) fail(`website/terminal/index.html must contain an empty <script type="application/json" id="${ISLAND_ID}"></script> placeholder`);
    html = html.replace(new RegExp(`<script type="application/json" id="${ISLAND_ID}">\\s*</script>`), () => `<script type="application/json" id="${ISLAND_ID}">\n${islandJson(leanCatalog(terminal))}\n</script>`);
    html = html.replace(/(<meta\s+name="prism-engine"\s+content=")[^"]*(")/, '$1./engine/$2');
    html = html.replace(/(\s(?:href|src)=")\.\.\/\.\.\/prism-term\//g, '$1./engine/');
    html = preloadBundles(html, ['./engine/web.bundle.js']);
    await writeFile(file, html);
    termPages.push(rel);
  }
}
const engineOut = path.join(termOut, 'engine');
await cp(path.join(term, 'src'), path.join(engineOut, 'src'), { recursive: true });
await cp(path.join(term, 'package.json'), path.join(engineOut, 'package.json'));
await mkdir(path.join(engineOut, 'catalog'), { recursive: true });
await writeFile(path.join(engineOut, 'catalog', 'terminal-catalog.json'), JSON.stringify(terminal, null, 1) + '\n');
// The engine modules the pages import at load ship as one bundle (website/scripts/esm-bundle.mjs): ~300 module
// requests become a handful. Helpers that ten or more facet modules share ride along; the facets themselves stay
// separate files the page imports on demand (they read the bundle directly).
const termFacetModules = [...new Set(terminal.facets.map((f) => String(f.module).replace(/^prism-term\//, '')))];
const termShared = [...sharedDeps(term, termFacetModules)].filter(([p, n]) => n >= 10 && !termFacetModules.includes(p) && bundleable(term, p)).map(([p]) => p).sort();
const termBundles = await bundleEngine(term, engineOut, [{ file: 'web.bundle.js', entries: ['src/web/index.js', 'src/palettes.js', 'src/facets/galleries.js', 'src/facets/objects/prism-logo.js', ...termShared] }]);

// Stream Deck page(s) + engine, when website/deck/ exists. Same contract as terminal/:
//   <meta name="prism-engine" content="../../prism-deck/">  → "./engine/"
//   href/src="../../prism-deck/…"                           → "./engine/…"
//   <script type="application/json" id="prism-deck-catalog"></script>  → filled with the LEAN deck island
//     (optional here; Prism.html and engine/catalog/deck-catalog.json keep the full catalog).
const deckOut = path.join(output, 'deck');
const deckPages = [];
let deckBundles = null;
if (existsSync(deckSrc)) {
  if (!existsSync(path.join(deckSrc, 'index.html'))) fail('website/deck/ exists but has no index.html', flag('--allow-incomplete'));
  await cp(deckSrc, deckOut, { recursive: true });
  // Downloads linked from /deck/ (plugin, icon packs, profiles) are build outputs of prism-deck,
  // not committed: build them first with `npm run plugin:build && npm run iconpacks:build`.
  const deckDist = path.join(deckRepo, 'plugin', 'dist');
  if (existsSync(deckDist)) await cp(deckDist, path.join(deckOut, 'dl'), { recursive: true });
  else fail('prism-deck/plugin/dist is missing — run `npm run plugin:build && npm run iconpacks:build` in prism-deck/ (the /deck/ page links to its files)', flag('--allow-incomplete'));
  const placeholder = deckIsland && new RegExp(`<script type="application/json" id="${deckIsland.ISLAND_ID}">\\s*</script>`);
  for (const file of await walk(deckOut)) {
    if (!file.endsWith('.html')) continue;
    const rel = path.relative(deckOut, file).split(path.sep).join('/');
    let html = withStats(await readFile(file, 'utf8'), `deck/${rel}`);
    if (deck && placeholder.test(html)) html = html.replace(placeholder, () => `<script type="application/json" id="${deckIsland.ISLAND_ID}">\n${deckIsland.islandJson(deckIsland.leanCatalog(deck))}\n</script>`);
    html = html.replace(/(<meta\s+name="prism-engine"\s+content=")[^"]*(")/, '$1./engine/$2');
    html = html.replace(/(\s(?:href|src)=")\.\.\/\.\.\/prism-deck\//g, '$1./engine/');
    if (deck) html = preloadBundles(html, ['./engine/core.bundle.js', './engine/facets.bundle.js']);
    await writeFile(file, html);
    deckPages.push(rel);
  }
  if (deck) {
    const deckEngine = path.join(deckOut, 'engine');
    await cp(path.join(deckRepo, 'src'), path.join(deckEngine, 'src'), { recursive: true });
    await cp(path.join(deckRepo, 'package.json'), path.join(deckEngine, 'package.json'));
    await mkdir(path.join(deckEngine, 'catalog'), { recursive: true });
    await writeFile(path.join(deckEngine, 'catalog', 'deck-catalog.json'), JSON.stringify(deck, null, 1) + '\n');
    // Two bundles: what one live device needs (the landing's preview loads only this one), then every facet.
    deckBundles = await bundleEngine(deckRepo, deckEngine, [
      { file: 'core.bundle.js', entries: ['src/web/index.js', 'src/devices.js', 'src/themes/_registry.js', 'src/facets/schema.js', 'src/facets/themes/prism.js'] },
      { file: 'facets.bundle.js', entries: ['src/facets/index.js'] },
    ]);
  }
}

// Curl-able terminal site + HTML previews of its pages.
const tty = writeTtySite(output, { site: SITE_URL, html: true });
// Terminal color schemes, as committed (the curl page t/themes links each file).
await cp(path.join(term, 'themes'), path.join(output, 'themes'), { recursive: true });

// Live player tarball.
let packed = null;
if (!flag('--no-pack')) packed = pack(path.join(output, 'dl'));

// Sitemap (HTML pages only — the ANSI pages aren't for crawlers), robots, Pages files.
const htmlPages = ['', 'Prism.html', ...termPages.map((p) => `terminal/${p}`.replace(/(^|\/)index\.html$/, '$1')), ...deckPages.map((p) => `deck/${p}`.replace(/(^|\/)index\.html$/, '$1'))];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(htmlPages)].map((p) => `  <url><loc>${SITE_URL}/${p}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(output, 'sitemap.xml'), sitemap);
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
await writeFile(path.join(output, 'CNAME'), SITE_URL.replace(/^https?:\/\//, '') + '\n');
await writeFile(path.join(output, '.nojekyll'), '');

// Every relative href/src on the landing, terminal and deck pages must resolve to a built file.
const broken = [];
const deckHtml = deckPages.map((p) => path.join(deckOut, ...p.split('/')));
for (const file of [path.join(output, 'index.html'), ...(await walk(termOut)).filter((f) => f.endsWith('.html')), ...deckHtml]) {
  const html = await readFile(file, 'utf8');
  for (const [, ref] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    if (!ref || /^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue;
    const clean = decodeURIComponent(ref.replace(/[?#].*$/, ''));
    let target = clean.startsWith('/') ? path.join(output, clean) : path.resolve(path.dirname(file), clean);
    if (clean.endsWith('/') || (existsSync(target) && (await stat(target)).isDirectory())) target = path.join(target, 'index.html');
    if (!existsSync(target)) broken.push(`${path.relative(output, file).split(path.sep).join('/')} → ${ref}`);
  }
}
if (broken.length) fail(`broken links:\n  ${[...new Set(broken)].join('\n  ')}`, flag('--allow-incomplete'));

// Every HTML page ships with site monitoring, and its scripts are in the build. Not relaxable.
const unmonitored = [];
for (const s of MONITORING) if (!existsSync(path.join(output, s))) unmonitored.push(`missing ${s}`);
for (const page of ['index.html', 'Prism.html', ...termPages.map((p) => `terminal/${p}`), ...deckPages.map((p) => `deck/${p}`)]) {
  const html = await readFile(path.join(output, page), 'utf8');
  const lacking = MONITORING.filter((s) => !html.includes(s));
  if (lacking.length) unmonitored.push(`${page} doesn't load ${lacking.join(', ')}`);
}
if (unmonitored.length) throw new Error(`site monitoring incomplete:\n  ${unmonitored.join('\n  ')}`);

console.log(`Built ${catalog.effects.length} facets, ${catalog.galleries.length} gallery links, and ${showcase.length} previews into ${output}`);
console.log(`Terminal: ${terminal.facets.length} facets in ${terminal.galleries.length} galleries · web pages: ${termPages.length ? termPages.join(', ') : 'none'} · curl site: ${tty.pages.size} pages / ${tty.files} files (${(tty.bytes / 1048576).toFixed(1)} MB)${packed ? ` · dl/prism-term.tgz ${packed.version}` : ''}`);
const bundleNote = (b) => (b ? b.files.map((f) => `${f.file} ${f.modules} modules / ${f.kb} KB`).join(' + ') : 'none');
console.log(`Engine bundles: terminal ${bundleNote(termBundles)} (${termBundles.rewired} on-demand modules rewired) · deck ${bundleNote(deckBundles)}`);
if (deck || deckPages.length) console.log(`Deck: ${deck ? `${deck.facets.length} facets in ${(deck.galleries || []).length} galleries` : 'no catalog yet'} · web pages: ${deckPages.length ? deckPages.join(', ') : 'none'}`);

// Engine bundles (website/scripts/esm-bundle.mjs). The bundled copies under <outRoot>/src become facades that
// re-export from the bundle, modules left out read the bundle directly, and the result is checked here: each bundle
// parses, and every bundled module that Node can load exports exactly the names of the original.
async function bundleEngine(root, outRoot, groups) {
  const name = path.basename(root);
  const banner = `// ${name} browser engine, bundled by website/build.mjs (the modules are in the repository under ${name}/src).\n`;
  const written = writeBundle({ root, outRoot, groups, banner });
  const ids = new Map(written.flatMap((g, rank) => g.modules.map((m) => [m.path, { id: m.id, file: g.file, rank }])));
  let rewired = 0;
  for (const file of await walk(path.join(outRoot, 'src'))) {
    const rel = path.relative(outRoot, file).split(path.sep).join('/');
    if (!rel.endsWith('.js') || ids.has(rel)) continue;
    const next = rewireImports(await readFile(file, 'utf8'), rel, (p) => ids.get(p) || null);
    if (next) { await writeFile(file, next); rewired++; }
  }
  const mismatch = [];
  for (const g of written) {
    await import(pathToFileURL(path.join(outRoot, g.file)).href);
    for (const m of g.modules) {
      let original;
      try { original = Object.keys(await import(pathToFileURL(path.join(root, m.path)).href)).sort().join(); } catch { continue; }
      const bundled = Object.keys(await import(pathToFileURL(path.join(outRoot, m.path)).href)).sort().join();
      if (original !== bundled) mismatch.push(`${m.path}: [${original}] vs bundled [${bundled}]`);
    }
  }
  if (mismatch.length) throw new Error(`engine bundle does not match its modules:\n  ${mismatch.join('\n  ')}`);
  return { files: written.map((g) => ({ file: g.file, modules: g.modules.length, kb: Math.round(g.bytes / 1024) })), rewired };
}
// <link rel="modulepreload"> for a page's engine bundles, next to its prism-engine meta (fetched while the page parses).
function preloadBundles(html, hrefs) {
  return html.replace(/<meta\s+name="prism-engine"[^>]*>/, (m) => m + hrefs.map((h) => `\n  <link rel="modulepreload" href="${h}">`).join(''));
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out.sort();
}
