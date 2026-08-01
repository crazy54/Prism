// Runnable quick-start: load the real catalog and drive a few tools directly,
// without any MCP client. Demonstrates search -> get -> compose end to end.
//
//   node examples/quickstart.mjs            (uses ../Prism.html)
//   node examples/quickstart.mjs /path/to/Prism.html
//
// Uses only the zero-dependency server modules — no npm install required.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from '../utils/catalog.js';
import { buildTools } from '../tools/index.js';
import { createLogger } from '../utils/logger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = process.argv[2] || path.resolve(HERE, '..', '..', 'Prism.html');

const store = new CatalogStore(catalogPath, { watch: false, logger: createLogger('warn') });
await store.load();

// Build a name -> tool map and a tiny caller (mirrors what tools/call does).
const tools = new Map(buildTools().map((t) => [t.name, t]));
const ctx = { store, logger: createLogger('silent') };
const call = (name, args = {}) => tools.get(name).handler(args, ctx);

// 1. What's in the catalog?
const stats = call('get_catalog_stats');
console.log(`Catalog: ${stats.totalEffects} effects across ${stats.galleryCount} galleries`);
console.log(`Top tags: ${stats.topTags.slice(0, 5).map((t) => t.tag).join(', ')}\n`);

// 2. Search for something.
const hits = call('search_effects', { query: 'kpi', limit: 3 });
console.log(`search "kpi" -> ${hits.items.map((h) => `${h.id}(${h.score})`).join(', ')}`);

// 3. Compose the top hit with the first background-capable effect we can find.
const bg = call('list_effects', { usableAsBackground: true, limit: 1 }).items[0];
const ids = [hits.items[0].id, bg && bg.id].filter(Boolean);
const bundle = call('compose', { ids, wrap: { tag: 'section', className: 'demo' } });

console.log(`\ncompose [${ids.join(', ')}]`);
console.log(`  css: ${bundle.metrics.naiveCssLength} -> ${bundle.metrics.finalCssLength} bytes` +
  ` (${bundle.metrics.reductionPct}% smaller, ${bundle.metrics.duplicatesRemoved} dupes removed)`);
console.log(`  initializers needed: ${bundle.initializers.length ? bundle.initializers.join(', ') : 'none'}`);
console.log(`  html starts: ${bundle.html.slice(0, 60).replace(/\n/g, ' ')}…`);

store.close();
