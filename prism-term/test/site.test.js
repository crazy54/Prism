// Publishing pipeline — the Prism.html terminal island, the curl-able terminal
// site, and the npx tarball. Runs offline: no network, no npx download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { allFacets, catalogTree } from '../src/facets/index.js';
import { buildTtyPages, WIDTH } from '../src/site/tty.js';
import { stringWidth } from '../src/width.js';
import { buildCatalog } from '../scripts/build-catalog.mjs';
import { embedIsland, stripIsland, extractIsland, islandBlock, islandJson, leanCatalog, catalogProblems, START, END, ISLAND_OPEN, ISLAND_ID, CRUMB_NOTE } from '../scripts/embed-island.mjs';
import { pack } from '../scripts/pack.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRISM_HTML = path.join(ROOT, '..', 'Prism.html');
const MCP_CATALOG = path.join(ROOT, '..', 'prism-mcp-server', 'utils', 'catalog.js');
const MCP_TOOLS = path.join(ROOT, '..', 'prism-mcp-server', 'tools', 'index.js');
const SITE_BUILD = path.join(ROOT, '..', 'website', 'build.mjs');
const SITE = 'https://prism.jeremyfhall.com';
const HOST = 'prism.jeremyfhall.com';
const WEB_END = '<!-- ===== /PRISM CATALOG ===== -->';

const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `prism-term-${tag}-`));
const count = (s, needle) => s.split(needle).length - 1;

// ── island ──────────────────────────────────────────────────────────────────

const CAT = {
  _ai: { note: 'fixture', schema: 2 },
  engine: { package: 'prism-term', version: '0.0.0' },
  galleries: [{ id: 'fx', title: 'FX' }],
  facets: [
    { id: 'a', title: 'Has a script tag </script>', module: 'prism-term/src/facets/fx/a.js', imports: ['./_kit.js'] },
    { id: 'b', title: 'Unicode é ✓ ⣿ 🙂', tags: ['x'], module: 'prism-term/src/facets/fx/a.js', imports: ['./_kit.js'] },
  ],
  sources: {
    'prism-term/src/facets/fx/_kit.js': 'export const k = "<!--<script>";\n',
    'prism-term/src/facets/fx/a.js': 'import { k } from \'./_kit.js\';\nconst s = "</script>";\nconst t = "</SCRIPT >";\nexport default [s, t, k];\n',
  },
};

const fixture = (eol, { web = true } = {}) => [
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><title>Prism</title>',
  '<!-- ✦ AI-READABLE: the catalog is in <script id="prism-catalog">. -->',
  ...(web ? ['<!-- ===== PRISM CATALOG · AI START HERE ===== -->', '<script type="application/json" id="prism-catalog">{"effects":[]}</script>', WEB_END] : []),
  '<style>body{margin:0}</style></head><body></body></html>',
  '',
].join(eol);

test('island: CRLF file — exact diff, placement, line endings, round-trip', () => {
  const html = fixture('\r\n');
  const { html: next, changed } = embedIsland(html, CAT);
  assert.ok(changed);
  // The only differences: the block right after the web island's end-marker line, and one breadcrumb sentence.
  const expected = html
    .replace(WEB_END + '\r\n', WEB_END + '\r\n' + islandBlock(CAT, '\r\n'))
    .replace('="prism-catalog">. -->', `="prism-catalog">.${CRUMB_NOTE} -->`);
  assert.equal(next, expected);
  assert.equal(stripIsland(next), html);
  assert.equal(count(next, '\n'), count(next, '\r\n'), 'no bare LF introduced');
  const block = next.slice(next.indexOf(START), next.indexOf(END) + END.length);
  assert.deepEqual(block.split('\r\n').slice(0, 2), [START, ISLAND_OPEN]);
  assert.equal(count(block.toLowerCase(), '</script'), 1, '"</script" inside the JSON is neutralized');
  assert.equal(count(block, '<!--'), 2, '"<!--" inside the JSON is neutralized (only the two markers remain)');
  assert.deepEqual(extractIsland(next), CAT);
  assert.deepEqual(JSON.parse(islandJson(CAT)), CAT);
});

test('island: idempotent, replaces in place, strips cleanly', () => {
  const html = fixture('\r\n');
  const once = embedIsland(html, CAT).html;
  const twice = embedIsland(once, CAT);
  assert.equal(twice.changed, false);
  assert.equal(twice.html, once);
  const cat2 = { ...CAT, facets: [...CAT.facets, { id: 'c', title: 'Added' }] };
  const updated = embedIsland(once, cat2).html;
  assert.equal(count(updated, START), 1);
  assert.equal(count(updated, CRUMB_NOTE), 1);
  assert.deepEqual(extractIsland(updated), cat2);
  assert.equal(stripIsland(updated), html);
});

test('island: LF file without a web island goes after </title>; bad input refuses', () => {
  const html = fixture('\n', { web: false });
  const next = embedIsland(html, CAT).html;
  assert.ok(next.includes('</title>\n' + START + '\n'));
  assert.ok(!next.includes('\r'));
  assert.equal(stripIsland(next), html);
  assert.equal(extractIsland(html), null);
  assert.throws(() => embedIsland('<html><body></body></html>', CAT), /refusing to guess/);
  assert.throws(() => embedIsland(fixture('\n') + START + '\n', CAT), /without an end marker/);
});

test('island: breadcrumb that already carries the note (as _embed-catalog.mjs writes it) is left alone', () => {
  for (const eol of ['\r\n', '\n']) {
    // Exactly what catalog/_embed-catalog.mjs now writes, and a hand-edited variant that mentions the island differently.
    const native = fixture(eol).replace('="prism-catalog">. -->', `="prism-catalog">.${CRUMB_NOTE} -->`);
    const reworded = fixture(eol).replace('="prism-catalog">. -->', `="prism-catalog">.${eol}  Terminal: #${ISLAND_ID}.${eol}-->`);
    for (const html of [native, reworded]) {
      const { html: next } = embedIsland(html, CAT);
      const block = islandBlock(CAT, eol);
      assert.equal(count(next, ISLAND_ID), count(html, ISLAND_ID) + count(block, ISLAND_ID), 'no second note');
      assert.equal(next.replace(block, ''), html, 'byte-identical outside the block');
      assert.equal(embedIsland(next, CAT).html, next, 'idempotent');
      assert.equal(embedIsland(embedIsland(next, { ...CAT, facets: [] }).html, CAT).html, next, 'replace keeps the breadcrumb as it was');
    }
  }
});

// ── catalog schema 2 ────────────────────────────────────────────────────────

let FULL;
const full = () => (FULL ??= buildCatalog());
const SPECS = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
const resolveKey = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
const isHelper = (key) => key.startsWith('prism-term/src/facets/') && /\/_[^/]*\.js$/.test(key);

test('catalog: schema 2 — records carry no source; `sources` holds every module and helper once, sorted', () => {
  const c = full();
  assert.equal(c._ai.schema, 2);
  assert.ok(!('source' in c._ai.fields), '_ai.fields.source removed');
  assert.equal(c._ai.fields.module, "repo path of the facet's ES module; also the key into top-level `sources` for its code");
  assert.match(c._ai.sources, /helper/);
  assert.match(c._ai.howToUse, /sources\[facet\.module\]/);
  assert.deepEqual(Object.keys(c).slice(-2), ['facets', 'sources']);
  assert.ok(c.facets.every((f) => !('source' in f)), 'no per-facet source');
  assert.deepEqual(catalogProblems(c), []);
  const keys = Object.keys(c.sources);
  assert.deepEqual(keys, [...keys].sort(), 'sorted by path');
  for (const f of c.facets) assert.ok(Object.hasOwn(c.sources, f.module), `${f.id}: ${f.module}`);
  // Browser engine closure: web/index.js, palettes.js and every engine module they or a facet
  // import statically are in `sources`; Node-only terminal I/O never is.
  const engine = keys.filter((k) => !k.startsWith('prism-term/src/facets/'));
  for (const k of ['prism-term/src/web/index.js', 'prism-term/src/palettes.js', 'prism-term/src/color.js', 'prism-term/src/widgets/index.js']) assert.ok(engine.includes(k), `engine closure carries ${k}`);
  for (const k of ['prism-term/src/screen.js', 'prism-term/src/loop.js']) assert.ok(!engine.includes(k), `${k} (Node-only) stays out`);
  for (const k of engine) {
    for (const [, spec] of c.sources[k].matchAll(SPECS)) {
      const dep = spec.startsWith('.') ? resolveKey(k, spec) : null;
      if (dep && !/\/(screen|loop)\.js$/.test(dep)) assert.ok(Object.hasOwn(c.sources, dep), `engine closure: ${k} needs ${dep}`);
    }
  }
  // Closed over helpers: every "_" file any module (or helper, via export … from) imports is present.
  for (const k of keys) {
    for (const [, spec] of c.sources[k].matchAll(SPECS)) {
      const dep = spec.startsWith('.') ? resolveKey(k, spec) : null;
      if (dep && isHelper(dep) && fs.existsSync(path.join(ROOT, dep.replace(/^prism-term\//, '')))) assert.ok(Object.hasOwn(c.sources, dep), `${k} needs ${dep}`);
    }
  }
  // Nothing extra: every facets/ key is a facet module or a helper something reaches.
  const modules = new Set(c.facets.map((f) => f.module));
  assert.ok(keys.every((k) => modules.has(k) || isHelper(k) || engine.includes(k)));
  assert.ok(keys.length < c.facets.length, 'modules hosting several facets are stored once');
});

test('catalog: rebuilding modules from `sources` (through the island) byte-matches the files and runs', async () => {
  const c = full();
  const island = extractIsland(embedIsland(fixture('\r\n'), c).html);
  for (const [k, code] of Object.entries(island.sources)) {
    // sources are LF-normalized (a core.autocrlf checkout has CRLF files on disk)
    assert.equal(code, fs.readFileSync(path.join(ROOT, k.replace(/^prism-term\//, '')), 'utf8').replace(/\r\n/g, '\n'), `${k} matches disk`);
  }
  // Rebuild a tree from the island alone (plus the Node-side engine, e.g. render.js) and load facets from it.
  const dir = tmpDir('rebuild');
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true, filter: (p) => !path.relative(path.join(ROOT, 'src'), p).startsWith('facets') });
    for (const [k, code] of Object.entries(island.sources)) {
      const file = path.join(dir, k.replace(/^prism-term\//, ''));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, code);
    }
    const byModule = new Map();
    for (const f of island.facets) byModule.set(f.module, [...(byModule.get(f.module) || []), f]);
    const shared = [...byModule].sort((a, b) => b[1].length - a[1].length)[0]; // the module hosting the most facets
    const withHelper = island.facets.find((f) => f.imports.some((s) => isHelper(resolveKey(f.module, s))) && f.module !== shared[0]);
    for (const [mod, recs] of [shared, [withHelper.module, byModule.get(withHelper.module)]]) {
      const m = await import(pathToFileURL(path.join(dir, mod.replace(/^prism-term\//, ''))).href);
      const exported = [m.default ?? m.facets].flat().filter(Boolean);
      // Ids default to the file name, so match records by title (and count).
      assert.equal(exported.length, recs.length, `${mod} exports ${recs.length} facets`);
      for (const r of recs) assert.ok(exported.some((x) => x.title === r.title && typeof x.setup === 'function'), `${r.id} loads from the rebuilt ${mod}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('catalog: integrity check flags a missing module, a missing helper and a leftover source', () => {
  const c = CAT;
  assert.deepEqual(catalogProblems(c), []);
  const noModule = { ...c, sources: { 'prism-term/src/facets/fx/_kit.js': c.sources['prism-term/src/facets/fx/_kit.js'] } };
  assert.match(catalogProblems(noModule).join('\n'), /module prism-term\/src\/facets\/fx\/a\.js is not a key of sources/);
  const noHelper = { ...c, sources: { 'prism-term/src/facets/fx/a.js': c.sources['prism-term/src/facets/fx/a.js'] } };
  assert.match(catalogProblems(noHelper).join('\n'), /helper prism-term\/src\/facets\/fx\/_kit\.js \(imported as \.\/_kit\.js\) is not in sources/);
  const leftover = { ...c, facets: [{ ...c.facets[0], source: 'x' }] };
  assert.match(catalogProblems(leftover).join('\n'), /still carries `source`/);
  assert.deepEqual(catalogProblems({ ...c, sources: undefined }), ['no top-level `sources` object']);
});

test('catalog: lean copy (/terminal/) drops `sources` and every `preview`, nothing else', () => {
  const c = full();
  const lean = leanCatalog(c);
  assert.ok(!('sources' in lean));
  assert.ok(c.facets.every((f) => typeof f.preview?.text === 'string'), 'full records keep preview');
  assert.ok(lean.facets.every((f) => !('preview' in f) && !('source' in f)));
  assert.deepEqual(lean.facets, c.facets.map(({ preview, ...f }) => f));
  assert.equal(lean._ai.lean, true);
  for (const re of [/`sources`/, /`preview`/, /Prism\.html/, /terminal\/engine\/catalog\/terminal-catalog\.json/]) assert.match(lean._ai.leanNote, re);
  const { _ai: a, facets: fa, sources, ...restFull } = c;
  const { _ai: b, facets: fb, ...restLean } = lean;
  assert.deepEqual(restLean, restFull);
  assert.deepEqual({ ...b, lean: undefined, leanNote: undefined }, { ...a, lean: undefined, leanNote: undefined });
  assert.deepEqual(JSON.parse(islandJson(lean)), lean);
});

test('island: real Prism.html — only the block and breadcrumb change; web island still loads', { skip: !fs.existsSync(PRISM_HTML) && 'no ../Prism.html' }, async () => {
  const catalog = full();
  const orig = fs.readFileSync(PRISM_HTML, 'utf8');
  const base = stripIsland(orig); // the lead may already have embedded an older island
  const eol = orig.includes('\r\n') ? '\r\n' : '\n';
  const { html: next } = embedIsland(orig, catalog);
  // Independent byte diff: cut out exactly what we add and compare with the original.
  const block = islandBlock(catalog, eol);
  const at = next.indexOf(block);
  assert.ok(at > 0, 'block present verbatim');
  assert.equal(next.slice(at - WEB_END.length - eol.length, at), WEB_END + eol, 'block sits right after the web island');
  // The breadcrumb names the terminal island exactly once: in its own words (the 2026-10-16 breadcrumb lists
  // all three islands, which now sit at the end of <body>) or through the note embedIsland appends to an
  // older breadcrumb that does not.
  const crumbAt = next.indexOf('<!-- ✦ AI-READABLE:'), crumb = next.slice(crumbAt, next.indexOf('-->', crumbAt));
  assert.ok(crumbAt >= 0 && crumb.includes(ISLAND_ID), 'the breadcrumb points at the terminal island');
  assert.equal(count(next, CRUMB_NOTE), count(base.slice(crumbAt, base.indexOf('-->', crumbAt)), ISLAND_ID) ? 0 : 1, 'a note only when the breadcrumb does not name the island');
  assert.ok(!/<(script|style)\b/i.test(crumb), 'no tag text inside the breadcrumb (the parts tokenizer would cut there)');
  assert.equal((next.slice(0, at) + next.slice(at + block.length)).replace(CRUMB_NOTE + ' -->', ' -->'), base);
  assert.equal(embedIsland(next, catalog).html, next, 'idempotent');
  assert.deepEqual(extractIsland(next), catalog);

  const dir = tmpDir('island');
  try {
    const copy = path.join(dir, 'Prism.html');
    fs.writeFileSync(copy, next);
    const { loadCatalogFile } = await import(pathToFileURL(MCP_CATALOG).href);
    const before = await loadCatalogFile(PRISM_HTML);
    const after = await loadCatalogFile(copy);
    assert.equal(after.effects.length, before.effects.length);
    assert.ok(after.effects.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── curl site ───────────────────────────────────────────────────────────────

const facets = allFacets();
const galleries = catalogTree();
const pages = buildTtyPages({ site: SITE, version: '0.0.0-test', galleries, facets });
const SGR = /\x1b\[[0-9;]*m/g;
const lines = (s) => s.replace(/\n$/, '').split('\n');

test('tty: one page per facet and per gallery, plus home, help and all', () => {
  for (const p of ['tty', 't/help', 't/all', 't/themes']) assert.ok(pages.has(p), p);
  for (const g of galleries) assert.ok(pages.has(`t/${g.id}`), `t/${g.id}`);
  for (const f of facets) assert.ok(pages.has(`f/${f.id}`), `f/${f.id}`);
  assert.equal(pages.size, 4 + galleries.length + facets.length);
});

test('tty: every variant is ≤ 80 columns, LF only, and contains nothing but text and SGR', () => {
  const bad = [];
  for (const [rel, page] of pages) {
    for (const v of ['256', '24', 'txt']) {
      const s = page[v];
      const name = `${rel}${v === '256' ? '' : '.' + v}`;
      if (s.includes('\r')) bad.push(`${name}: CR`);
      if (!s.endsWith('\n')) bad.push(`${name}: no trailing newline`);
      const text = s.replace(SGR, '');
      if (/\x1b/.test(text)) bad.push(`${name}: non-SGR escape ${JSON.stringify(text.slice(text.indexOf('\x1b'), text.indexOf('\x1b') + 8))}`);
      if (/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(text)) bad.push(`${name}: control character`);
      lines(text).forEach((l, i) => { if (stringWidth(l) > WIDTH) bad.push(`${name}:${i + 1}: ${stringWidth(l)} columns`); });
      if (v === 'txt') {
        if (/[^\x20-\x7e\n]/.test(s)) bad.push(`${name}: non-ASCII or escape`);
      } else {
        if (!s.endsWith('\x1b[0m\n')) bad.push(`${name}: does not end with reset + newline`);
        if (v === '256' && /\x1b\[[0-9;]*[34]8;2;/.test(s)) bad.push(`${name}: truecolor in the 256 variant`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});

test('tty: home fits one 80×24 screen and links every gallery, help, .txt and npx', () => {
  for (const v of ['256', '24', 'txt']) {
    const home = pages.get('tty')[v].replace(SGR, '');
    assert.ok(lines(home).length <= 23, `home.${v} is ${lines(home).length} lines (the prompt needs the 24th)`);
    for (const g of galleries) assert.ok(home.includes(`curl -sL ${HOST}/t/${g.id} `), `home lists ${g.id}`);
    assert.ok(home.includes('/t/help') && home.includes('.txt'));
    assert.ok(home.includes(`npx -y --package=${SITE}/dl/prism-term.tgz prism-term`));
  }
});

test('tty: nothing is cut to fit 80 columns except list descriptions', () => {
  const cut = [...pages].flatMap(([rel, page]) => page.overflow.map((l) => `${rel}: ${l}`));
  assert.deepEqual(cut.slice(0, 20), [], `${cut.length} lines cut`);
});

test('tty: a long tag list wraps at commas, continuation under the first tag, nothing cut', () => {
  const base = facets.find((f) => f.id === 'plasma') || facets[0];
  const tags = ['easing', 'spacing chart', 'timing', 'race', 'ease in', 'ease out', 'animation principles', 'cubic-bezier', 'overshoot', 'anticipation', 'follow through', 'slow in and slow out', 'stagger', 'squash and stretch'];
  const f = { ...base, id: 'long-tags-fixture', tags };
  const g = galleries.find((x) => x.id === base.gallery);
  const one = buildTtyPages({ site: SITE, version: '0.0.0-test', galleries: [{ ...g, count: 1, categories: [{ name: base.category, facets: [f] }] }], facets: [f] });
  const page = one.get(`f/${f.id}`);
  assert.deepEqual(page.overflow, []);
  for (const v of ['txt', '256']) {
    const ls = lines(page[v].replace(SGR, ''));
    const at = ls.findIndex((l) => l.startsWith('tags: '));
    let end = at + 1;
    while (ls[end]?.startsWith('      ') && /^ {6}\S/.test(ls[end])) end++;
    const rows = ls.slice(at, end);
    assert.ok(rows.length > 1, 'wrapped onto more than one line');
    for (const r of rows) assert.ok(stringWidth(r) <= WIDTH, `≤ 80: ${r}`);
    for (const r of rows.slice(0, -1)) assert.ok(r.endsWith(','), `breaks after a comma: ${r}`);
    assert.deepEqual(rows.map((r) => r.slice(6)).join(' ').split(', '), tags, 'every tag, in order, none split');
  }
});

test('tty: every .txt line is ≤ 80 columns and every command is whole on its line', () => {
  const bad = [];
  const url = String.raw`prism\.jeremyfhall\.com/(?:tty|Prism\.html|terminal/\S*|t/(?:<gallery>|[a-z0-9-]+)|f/(?:<facet>|<id>|[a-z0-9-]+)|themes/[a-z0-9-]+/[A-Za-z0-9.-]+|dl/SHA256SUMS)(?:\.txt|\.24)?`;
  const curl = new RegExp(String.raw`^curl -sL ${url}(?: \| (?:less -R|grep -i \S+|sh|sha256sum -c --ignore-missing))?$`);
  // the latest-release alias, or this release's pinned tarball (remote or downloaded)
  const ver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
  const tgz = String.raw`(?:https://prism\.jeremyfhall\.com/dl/prism-term(?:-${ver})?|\./prism-term-${ver})\.tgz`;
  for (const [rel, page] of pages) {
    const ls = lines(page.txt);
    ls.forEach((l, i) => {
      const at = `${rel}.txt:${i + 1}`;
      if (l.length > WIDTH) bad.push(`${at}: ${l.length} columns`);
      // A command runs from where it starts to a column gap (two spaces) or the end of the line.
      const c = l.match(/(?:curl -sL |npx |npm i -g |prism-term (?:play|snapshot|list)\b)(?:(?! {2}).)*/)?.[0];
      if (!c) return;
      if (/(\.\.\.|…)$/.test(c)) bad.push(`${at}: cut: ${c}`);
      if (c.startsWith('curl ') && !curl.test(c)) bad.push(`${at}: incomplete curl: ${c}`);
      if (c.startsWith('npm i -g ') && !new RegExp(`^npm i -g ${tgz}$`).test(c)) bad.push(`${at}: incomplete npm: ${c}`);
      if (c.startsWith('npx ')) {
        const whole = c.endsWith(' \\') ? c.slice(0, -1) + (ls[i + 1] || '').trim() : c;
        if (!new RegExp(String.raw`^npx -y --package=${tgz} prism-term(?: (?:play|snapshot|list) [a-z0-9-]+)?$`).test(whole)) bad.push(`${at}: incomplete npx: ${whole}`);
      }
    });
    // Prose never ends a line with the start of a command (a para() that wrapped one).
    ls.forEach((l, i) => { if (/(?:\bcurl(?:\.exe)? -sL|\bnpx(?: -y)?|\bnpm i(?: -g)?|--package=)$/.test(l.trimEnd())) bad.push(`${rel}.txt:${i + 1}: command split at line end`); });
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} problems`);
});

test('tty: /t/all lists every facet at the start of a line (grep-able)', () => {
  const all = lines(pages.get('t/all').txt);
  for (const f of facets) assert.ok(all.some((l) => l.startsWith(f.id + ' ')), f.id);
  assert.ok(all.filter((l) => /spinner/i.test(l)).length > 0, '| grep -i spinner finds something');
});

test('tty: gallery pages list their facets; facet pages carry commands and a footer', () => {
  for (const g of galleries) {
    const txt = pages.get(`t/${g.id}`).txt;
    for (const c of g.categories) for (const f of c.facets) assert.ok(txt.includes(`  ${f.id} `), `t/${g.id} lists ${f.id}`);
    assert.ok(txt.includes(`curl -sL ${HOST}/t/${g.id} | less -R`));
  }
  for (const f of facets) {
    const txt = pages.get(`f/${f.id}`).txt;
    const want = [`prism-term play ${f.id}`, `prism-term snapshot ${f.id}`, `findFacet('${f.id}')`, `curl -sL ${HOST}/t/${f.gallery}`, `curl -sL ${HOST}/tty`];
    for (const w of want) assert.ok(txt.includes(w), `f/${f.id} has "${w}"`);
  }
});

// ── tarball ─────────────────────────────────────────────────────────────────

/** Minimal .tgz extractor (regular files + pax paths) so the test needs no tar binary. */
function untgz(file, dest) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  let pax = null;
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const field = (a, b) => h.toString('utf8', a, b).replace(/\0[\s\S]*$/, '');
    const size = parseInt(field(124, 136).trim() || '0', 8);
    const type = h[156] ? String.fromCharCode(h[156]) : '0';
    const prefix = field(257, 263).startsWith('ustar') ? field(345, 500) : '';
    const name = pax?.path ?? (prefix ? `${prefix}/` : '') + field(0, 100);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      pax = {};
      for (const rec of body.toString('utf8').split('\n').filter(Boolean)) {
        const kv = rec.slice(rec.indexOf(' ') + 1);
        pax[kv.slice(0, kv.indexOf('='))] = kv.slice(kv.indexOf('=') + 1);
      }
      continue;
    }
    pax = null;
    if (type !== '0') continue;
    const out = path.resolve(dest, name);
    if (!out.startsWith(path.resolve(dest) + path.sep)) throw new Error(`unsafe path in tarball: ${name}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
  }
}

test('pack: tarball carries the engine and every facet module, and the CLI and API run from it', async () => {
  const dir = tmpDir('pack');
  try {
    const r = pack(path.join(dir, 'dl'));
    assert.ok(fs.existsSync(r.stable) && fs.existsSync(r.versioned));
    assert.deepEqual(fs.readFileSync(r.stable), fs.readFileSync(r.versioned));
    const files = new Set(r.files);
    for (const f of ['package.json', 'cli.js', 'index.js', 'src/facets/index.js', 'src/facets/manifest.js']) assert.ok(files.has(f), f);
    for (const f of facets) assert.ok(files.has(`src/facets/${f.file}`), `src/facets/${f.file}`);
    assert.ok(![...files].some((f) => /^(test|scripts|catalog)\//.test(f)), 'no dev-only files');

    untgz(r.stable, path.join(dir, 'x'));
    const cli = path.join(dir, 'x', 'package', 'cli.js');
    const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
    const list = execFileSync(process.execPath, [cli, 'list'], { cwd: dir, env, encoding: 'utf8' });
    for (const f of facets) assert.ok(list.includes(f.id), `list shows ${f.id}`);
    const snap = execFileSync(process.execPath, [cli, 'snapshot', 'plasma', '--size', '40x8'], { cwd: dir, env, encoding: 'utf8' });
    assert.ok(lines(snap.replace(SGR, '')).length >= 8, 'snapshot prints a frame');
    // What the facet pages tell people to write: import { play, findFacet } from 'prism-term'.
    const api = await import(pathToFileURL(path.join(dir, 'x', 'package', 'index.js')).href);
    assert.equal(typeof api.play, 'function', 'prism-term exports play');
    assert.equal(typeof api.findFacet, 'function', 'prism-term exports findFacet');
    assert.equal(api.findFacet('plasma')?.id, 'plasma');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── site build (website/build.mjs, without the tarball) ─────────────────────

const islandIn = (html) => {
  const a = html.indexOf(ISLAND_OPEN);
  return a < 0 ? null : JSON.parse(html.slice(a + ISLAND_OPEN.length, html.indexOf('</script>', a)));
};
/** An element carrying a build-filled stat hook: [, key, text]. */
const HOOK = /<[a-z][a-z0-9-]*\b[^>]*\s(data-web-stat="[^"]*"|data-terminal-stat="[^"]*"|data-mcp-tools|data-prism-size)(?=[\s>=])[^>]*>([^<]*)</gi;

test('build: full island in Prism.html, lean island on /terminal/, live numbers filled', { skip: !fs.existsSync(SITE_BUILD) && 'no website/build.mjs', timeout: 240000 }, async () => {
  const out = tmpDir('site');
  // The build regenerates tracked files in website/assets/; it must not touch them when only line endings would differ.
  const assets = path.join(path.dirname(SITE_BUILD), 'assets');
  const tracked = [path.join(assets, 'showcase.json'), path.join(assets, 'galleries.json'), ...(fs.existsSync(path.join(assets, 'previews')) ? fs.readdirSync(path.join(assets, 'previews')).filter((f) => f.endsWith('.html')).map((f) => path.join(assets, 'previews', f)) : [])].filter((f) => fs.existsSync(f));
  const before = new Map(tracked.map((f) => [f, { bytes: fs.readFileSync(f), mtime: fs.statSync(f).mtimeMs }]));
  try {
    execFileSync(process.execPath, [SITE_BUILD, out, '--allow-stale', '--allow-incomplete', '--no-pack'], { cwd: path.dirname(SITE_BUILD), stdio: 'pipe' });
    const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
    for (const [f, b] of before) {
      const now = fs.readFileSync(f);
      if (now.equals(b.bytes)) assert.equal(fs.statSync(f).mtimeMs, b.mtime, `${path.basename(f)} rewritten with identical content`);
      else assert.notEqual(lf(now), lf(b.bytes), `${path.basename(f)} rewritten with only line-ending changes`);
    }
    // Compare within the build's own output: facet teams may add modules while this runs.
    const full = JSON.parse(fs.readFileSync(path.join(out, 'terminal', 'engine', 'catalog', 'terminal-catalog.json'), 'utf8'));
    const prism = fs.readFileSync(path.join(out, 'Prism.html'), 'utf8');
    assert.deepEqual(extractIsland(prism), full, 'Prism.html carries the full records');
    assert.ok(full.facets.length > 0 && full.facets.every((f) => !('source' in f) && f.preview), 'schema 2 records, previews included');
    assert.deepEqual(catalogProblems(full), [], 'every module and helper is in sources');

    const termPage = path.join(out, 'terminal', 'index.html');
    if (fs.existsSync(termPage)) {
      const html = fs.readFileSync(termPage, 'utf8');
      assert.deepEqual(islandIn(html), leanCatalog(full), '/terminal/ carries the lean island');
      assert.match(html, /<meta name="prism-engine" content="\.\/engine\/">/);
      assert.ok(!/\s(?:href|src)="\.\.\/\.\.\/prism-term\//.test(html), 'dev paths rewritten');
    }

    // Site monitoring on every HTML page: static tags on the site pages, a host-gated loader in the hosted Prism.html
    // (a downloaded copy must stay offline), and the repo's Prism.html itself untouched.
    const MON = ['assets/vendor/traceway-1.2.1.js', 'assets/vendor/web-vitals-6.2.3.js', 'assets/telemetry.js'];
    for (const s of MON) assert.ok(fs.existsSync(path.join(out, ...s.split('/'))), `built ${s}`);
    for (const [page, prefix] of [['index.html', ''], ['terminal/index.html', '../'], ['terminal/tty.html', '../']]) {
      const file = path.join(out, ...page.split('/'));
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8');
      for (const s of MON) assert.ok(html.includes(`<script src="${prefix}${s}" defer></script>`), `${page} loads ${s}`);
    }
    const loader = prism.match(/<script>\/\* Site monitoring[^<]*<\/script>/)?.[0];
    const at = prism.indexOf(loader);
    assert.ok(loader && at > prism.indexOf('<head>') && at < prism.indexOf('<script type="application/json" id="prism-catalog">'), 'hosted Prism.html: loader in <head>, before the islands');
    assert.match(loader, /if\(location\.hostname!=="prism\.jeremyfhall\.com"\)return;/);
    for (const s of MON) assert.ok(loader.includes(JSON.stringify(s)), `loader loads ${s}`);
    if (fs.existsSync(PRISM_HTML)) assert.ok(!fs.readFileSync(PRISM_HTML, 'utf8').includes('traceway'), 'repo Prism.html stays monitoring-free');

    // The curl site lives at the site root — /terminal/tty.html fetches ../tty, ../t/<g>, ../f/plasma (+ .24/.txt).
    for (const rel of ['tty', 'f/plasma', ...full.galleries.filter((g) => full.facets.some((f) => f.gallery === g.id)).map((g) => `t/${g.id}`)]) {
      for (const v of ['', '.24', '.txt']) assert.ok(fs.existsSync(path.join(out, ...`${rel}${v}`.split('/'))), `/${rel}${v}`);
    }

    const { buildTools } = await import(pathToFileURL(MCP_TOOLS).href);
    const { loadCatalogFile } = await import(pathToFileURL(MCP_CATALOG).href);
    const web = await loadCatalogFile(path.join(out, 'Prism.html'));
    const landing = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const n = (x) => x.toLocaleString('en-US');
    const want = {
      'data-web-stat="facets"': n(web.effects.length),
      'data-web-stat="galleries"': n(web.galleries.length),
      ...Object.fromEntries(web.galleries.map((g) => [`data-web-stat="gallery:${g.id}"`, n(g.count)])),
      'data-terminal-stat="facets"': n(full.facets.length),
      'data-terminal-stat="galleries"': n(full.galleries.length),
      'data-mcp-tools': n(buildTools().length),
      'data-prism-size': `${(Buffer.byteLength(prism) / 1048576).toFixed(1)} MB`,
    };
    // Every hook on the built landing page holds its computed value…
    const hooks = [...landing.matchAll(HOOK)];
    for (const [, key, text] of hooks) assert.equal(text, want[key], `${key} → ${want[key]}`);
    // …every stat it should carry is hooked (terminal galleries is optional there)…
    for (const key of Object.keys(want).filter((k) => k !== 'data-terminal-stat="galleries"')) assert.ok(hooks.some((h) => h[1] === key), `landing page has ${key}`);
    // …and the gallery counts still add up to the web catalog.
    const counts = [...landing.matchAll(/class="gallery-count">([\d,]+)/g)].map((m) => Number(m[1].replaceAll(',', '')));
    assert.equal(counts.length, web.galleries.length);
    assert.equal(counts.reduce((a, b) => a + b, 0), web.effects.length);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
