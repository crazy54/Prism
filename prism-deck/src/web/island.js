// Run Prism Deck straight from the #prism-deck-catalog JSON island — fully offline.
//
// The island's top-level `sources` holds every module (facets, glyphs, themes and the
// browser-safe engine) keyed "prism-deck/src/<path>". This loader turns each into a
// blob: URL module, rewriting its relative imports to the blob URLs of their targets,
// so the whole graph imports with no network and no server. This file imports
// nothing, so it can itself be bootstrapped from the island:
//
//   const cat = JSON.parse(document.getElementById('prism-deck-catalog').textContent);
//   const url = URL.createObjectURL(new Blob([cat.sources['prism-deck/src/web/island.js']], { type: 'text/javascript' }));
//   const { loadIsland } = await import(url);
//   const deck = await loadIsland(cat);
//   const web = await deck.import('prism-deck/src/web/index.js');
//   web.mountDevice(el, { model: 'plus', facet: await deck.facet('theme-prism') });

const IMPORT_RE = /(^|\n)(\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?)(['"])([^'"]+)\3/g;

const dirname = (p) => p.slice(0, p.lastIndexOf('/'));
function resolve(from, spec) {
  const parts = `${dirname(from)}/${spec}`.split('/');
  const out = [];
  for (const s of parts) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return out.join('/');
}

/**
 * A loader over a sources map. opts.urlFor(code, key) makes a module URL (default: blob:);
 * Node tests pass a data: URL maker. → { import(key), url(key) }
 */
export function createModuleLoader(sources, { urlFor } = {}) {
  const make = urlFor || ((code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  const urls = new Map();
  const visiting = new Set();
  function url(key) {
    if (urls.has(key)) return urls.get(key);
    if (!Object.hasOwn(sources, key)) throw new Error(`prism-deck island: no source for ${key}`);
    if (visiting.has(key)) throw new Error(`prism-deck island: import cycle through ${key}`);
    visiting.add(key);
    const code = sources[key].replace(IMPORT_RE, (m, lead, head, q, spec) => (spec.startsWith('.') ? `${lead}${head}${q}${url(resolve(key, spec))}${q}` : m));
    visiting.delete(key);
    const u = make(code, key);
    urls.set(key, u);
    return u;
  }
  return { url, import: (key) => import(url(key)) };
}

/**
 * Load the island. source: the parsed catalog, its JSON text, an element, or a Document
 * (default: document). → { catalog, records, record(id), import(key), facet(id), engine(), web() }
 */
export async function loadIsland(source = globalThis.document, opts = {}) {
  let catalog = source;
  if (typeof source === 'string') catalog = JSON.parse(source);
  else if (source && typeof source.getElementById === 'function') catalog = JSON.parse(source.getElementById('prism-deck-catalog').textContent);
  else if (source && typeof source.textContent === 'string' && !source.facets) catalog = JSON.parse(source.textContent);
  if (!catalog?.sources) throw new Error('prism-deck island: no `sources` (a lean catalog cannot run offline)');
  const loader = createModuleLoader(catalog.sources, opts);
  const byId = new Map(catalog.facets.map((f) => [f.id, f]));
  let registry = null;
  const engine = () => (registry ||= loader.import('prism-deck/src/facets/index.js'));
  return {
    catalog,
    records: catalog.facets,
    record: (id) => byId.get(id) || null,
    import: loader.import,
    /** The normalized facet (through the registry, so it matches Node exactly). */
    async facet(id) { const reg = await engine(); return reg.findFacet(id); },
    engine,
    render: async () => loader.import('prism-deck/src/render.js'),
    web: async () => loader.import('prism-deck/src/web/index.js'),
  };
}
