// Build the terminal catalog — the data behind the terminal JSON island.
//
//   node scripts/build-catalog.mjs            → prism-term/catalog/terminal-catalog.json
//   node scripts/build-catalog.mjs --check    exit 1 if the committed file is stale
//
// The island is DERIVED from src/facets/** (never hand-edited), exactly like
// Prism.html's #prism-catalog island is derived from the galleries. Embedding
// it (into Prism.html as <script type="application/json" id="prism-terminal-catalog">
// and into the web terminal catalog page) is done by the site build.
//
// Schema 2: module code lives once, in the top-level `sources` object (keyed by
// `facet.module`), with the "_" gallery helpers those modules import; facet
// records carry no source of their own.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFacets, catalogTree } from '../src/facets/index.js';
import { renderScene } from '../src/render.js';
import { catalogProblems } from './embed-island.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FACETS = path.join(ROOT, 'src', 'facets');
const OUT = path.join(ROOT, 'catalog', 'terminal-catalog.json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const SITE = 'https://prism.jeremyfhall.com';
const MODULE_PREFIX = 'prism-term/src/facets/';

const read = (rel) => fs.readFileSync(path.join(FACETS, ...rel.split('/')), 'utf8');

/** Engine modules a facet's source imports (relative to the facet file). */
function importsOf(source) {
  return [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

/**
 * `sources`: every facet module plus the "_" helpers they import, directly or
 * through other helpers (helpers re-export with `export * from`), sorted by
 * path. Engine modules (src/*.js) are left out.
 */
function collectSources(facets) {
  const files = new Set(facets.map((f) => f.file));
  const queue = [...files];
  while (queue.length) {
    const rel = queue.pop();
    for (const [, spec] of read(rel).matchAll(/^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm)) {
      if (!spec.startsWith('.')) continue;
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      if (dep.startsWith('../') || !/(^|\/)_[^/]*\.js$/.test(dep)) continue; // engine module, or not a helper
      if (!fs.existsSync(path.join(FACETS, ...dep.split('/')))) continue; // an import line inside a code sample
      if (!files.has(dep)) { files.add(dep); queue.push(dep); }
    }
  }
  return Object.fromEntries([...files].sort().map((rel) => [MODULE_PREFIX + rel, read(rel)]));
}

/**
 * A small plain-text frame for search results and agents (no color codes).
 * Rendered in ASCII mode so pixel art becomes a luminance ramp (.:-=+*#%@)
 * rather than a wall of half-blocks that only color could explain.
 */
function preview(f) {
  const w = Math.min(f.size.w, 60), h = Math.min(f.size.h, 16);
  const b = renderScene(f, { width: w, height: h, t: f.animated ? Math.min(f.loop * 0.4, 3) : 0, fps: 15, mode: 'ascii', caps: { unicode: false, braille: false, sextant: false } });
  return { w, h, text: b.toString() };
}

export function buildCatalog() {
  const facets = allFacets({ strict: true });
  const tree = catalogTree();
  const sources = collectSources(facets);
  const records = facets.map((f) => {
    const source = sources[MODULE_PREFIX + f.file];
    return {
      id: f.id,
      title: f.title,
      gallery: f.gallery,
      galleryTitle: tree.find((g) => g.id === f.gallery).title,
      category: f.category,
      description: f.description,
      tags: f.tags,
      kind: f.kind,
      size: f.size,
      minSize: f.minSize,
      animated: f.animated,
      loop: f.loop,
      glyphs: f.glyphs,
      color: f.color,
      canvas: f.canvas || null,
      palette: f.palette || null,
      params: f.params,
      since: f.since,
      credits: f.credits || null,
      module: MODULE_PREFIX + f.file,
      imports: importsOf(source),
      usage: {
        cli: `prism-term play ${f.id}`,
        npx: `npx -y --package=${SITE}/dl/prism-term.tgz prism-term play ${f.id}`,
        snapshot: `prism-term snapshot ${f.id} --size ${f.size.w}x${f.size.h}`,
        code: `import { play, findFacet } from 'prism-term';\nawait play(findFacet('${f.id}'));`,
        curl: `curl -sL ${SITE}/f/${f.id}`,
      },
      preview: preview(f),
    };
  });
  const catalog = {
    _ai: {
      schema: 2,
      what: 'Prism terminal catalog: animated and static terminal facets (scenes, widgets, spinners, progress, charts, text, TUI, diagrams, ops) rendered with the zero-dependency prism-term engine.',
      howToUse: 'Pick a facet by gallery/category/tags. Run it with `usage.cli` (or `usage.npx` without installing), or import `prism-term` and call play(findFacet(id)). To read or rebuild a facet, take its code from `sources[facet.module]`; the modules in its `imports` are relative to `module`, and the "_" gallery helpers among them are in `sources` too (same "prism-term/src/facets/…" keys). Engine modules (prism-term/src/*.js) are not in the island: get them from the package. Facets are deterministic for a seed and accept `params` via --set key=value.',
      fields: {
        id: 'stable unique id', gallery: 'gallery id (see galleries[])', category: 'category within the gallery', kind: 'scene|widget|spinner|progress|text|chart|tui|diagram|art',
        size: 'preferred size in terminal cells {w,h}', minSize: 'smallest size it reads at', animated: 'false = still frame', loop: 'seconds per cycle',
        glyphs: 'minimum glyph support: ascii|unicode|braille|sextant', color: 'minimum color depth: mono|16|256|truecolor',
        params: 'tunable parameters {key:{default,min,max,options,label}}',
        module: "repo path of the facet's ES module; also the key into top-level `sources` for its code",
        imports: 'import specifiers in the module, relative to `module`: "_" gallery helpers (code in `sources`) and engine modules (not included)',
        preview: 'plain-text frame (no color) at up to 60×16',
      },
      sources: 'top-level `sources`: { "<repo path>": "<full ES module source>" } for every facet module (`facet.module`) and every "_" gallery helper they import (listed in `imports`, including helpers other helpers re-export, across galleries), sorted by path. Several facets can share one module. Engine modules (prism-term/src/*.js) are not included.',
      count: records.length,
      island: '<script type="application/json" id="prism-terminal-catalog">',
    },
    engine: {
      package: pkg.name,
      version: pkg.version,
      repo: 'https://github.com/crazy54/Prism/tree/main/prism-term',
      npx: `npx -y --package=${SITE}/dl/prism-term.tgz prism-term`,
      curl: `curl -sL ${SITE}/tty`,
      web: `${SITE}/terminal/`,
    },
    galleries: tree.map((g) => ({ id: g.id, title: g.title, icon: g.icon, blurb: g.blurb, count: g.count, categories: g.categories.map((c) => ({ name: c.name, count: c.facets.length })) })),
    facets: records,
    sources,
  };
  const problems = catalogProblems(catalog);
  if (problems.length) throw new Error(`terminal catalog is inconsistent:\n  ${problems.join('\n  ')}`);
  return catalog;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const json = JSON.stringify(buildCatalog(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur) {
      const problems = catalogProblems(JSON.parse(cur));
      if (problems.length) { console.error(`catalog/terminal-catalog.json is inconsistent:\n  ${problems.join('\n  ')}`); process.exit(1); }
    }
    if (cur !== json) { console.error('catalog/terminal-catalog.json is stale — run `npm run catalog`'); process.exit(1); }
    console.log('terminal catalog up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, json);
    console.log(`wrote catalog/terminal-catalog.json (${(json.length / 1024).toFixed(0)} KB)`);
  }
}
