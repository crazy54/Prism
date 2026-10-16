// Stream Deck data adapter for the website.
//
//   const deck = await loadDeck({ engine, catalog, only })   only: facet module paths to import instead of the registry
//   deck.source           'prism-deck' (the real runtime + catalog) | 'placeholder' (sketches, only if the runtime can't load)
//   deck.catalog          the deck catalog (lean is fine) or null
//   deck.galleries        [{ id, title, icon, hue, blurb, count, categories }]
//   deck.facets           catalog records [{ id, title, gallery, category, surface, description, states, press, targets, usage, … }]
//   deck.devices          { id: model }        deck.themes  [{ id, title, modes }]
//   deck.findFacet(id)    the runtime facet (renderable)
//   deck.mountDevice(el, { model, keys | facet | strip | dials | screen, interactive, mode, theme, … })
//   deck.mountKey(el, facet, { interactive, mode, theme, size, displaySize })
//   deck.setGlobalMotion(paused) · deck.refreshMode()   (re-theme every deck that follows the page)
//   deck.linkBus()        a shared link bus (API 1.6) for devices that should mirror each other (mute, live …), or null
//
// `engine` is the base URL of the prism-deck package: ../../prism-deck/ from website/deck/ in the
// repository, ./engine/ once website/build.mjs has copied it (the same contract as /terminal/).
// `catalog` is the page's #prism-deck-catalog island when the build has filled it; otherwise the
// adapter imports <engine>/catalog/deck-catalog.json. If the runtime can't load at all, the page
// still works on the placeholder runtime (runtime.js + sketches.js), which keeps the same calls.

const pageMode = () => (document.documentElement.dataset.rfMode === 'day' ? 'light' : 'dark');
const deckMode = (m) => (m === 'day' || m === 'light' ? 'light' : m === 'night' || m === 'dark' ? 'dark' : null);

// only: facet module paths (e.g. ['src/facets/themes/prism.js']) — a page that shows a few known facets imports just
// those instead of the whole registry (on the built site that keeps the facets bundle off the landing page).
async function onlyRegistry(at, paths) {
  const [schema, ...mods] = await Promise.all([import(at('src/facets/schema.js')), ...paths.map((p) => import(at(p)))]);
  const byId = new Map();
  mods.forEach((mod, k) => {
    const exported = mod.default ?? mod.facets;
    const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
    list.forEach((raw, i) => { const f = schema.normalizeFacet(raw, paths[k].replace(/^src\/facets\//, ''), i, list.length); byId.set(f.id, f); });
  });
  return { findFacet: (id) => byId.get(id) || null };
}

async function realDeck(engine, catalog, only) {
  const base = new URL(engine, location.href);
  const at = (rel) => new URL(rel, base).href;
  const [web, registry, cat, core] = await Promise.all([
    import(at('src/web/index.js')),
    only ? onlyRegistry(at, only) : import(at('src/facets/index.js')),
    catalog ? Promise.resolve(catalog) : import(at('catalog/deck-catalog.json'), { with: { type: 'json' } }).then((m) => m.default),
    import(at('src/web/core.js')).catch(() => null),
  ]);
  if (typeof web.mountDevice !== 'function' || typeof registry.findFacet !== 'function') throw new Error('prism-deck runtime is incomplete');
  const resolve = (id) => registry.findFacet(id);
  const live = new Set();
  const follow = (view, opts) => { if (!opts.mode) live.add(view); return view; };
  const devices = Object.fromEntries((Array.isArray(cat.devices) ? cat.devices : Object.values(cat.devices || {})).map((d) => [d.id, d]));
  return {
    source: 'prism-deck',
    catalog: cat,
    count: cat.facets.length,
    galleries: cat.galleries,
    facets: cat.facets,
    devices,
    themes: cat.themes || [],
    findFacet: resolve,
    // the runtime's own choices (src/web/core.js): what to put on a device, and where to show a facet
    showcase: core?.showcaseLayout && cat.facets.length ? (model) => core.showcaseLayout(model, cat.facets) : null,
    devicesFor: core?.devicesFor ? (id) => core.devicesFor(cat.facets.find((f) => f.id === id)) : null,
    mountDevice: (el, opts = {}) => follow(web.mountDevice(el, { theme: 'prism', resolve, ...opts, mode: deckMode(opts.mode) || pageMode() }), opts),
    mountKey: (el, facet, opts = {}) => follow(web.mountKey(el, facet, { theme: 'prism', resolve, ...opts, mode: deckMode(opts.mode) || pageMode() }), opts),
    unmount: (view) => { live.delete(view); view?.destroy?.(); },
    setGlobalMotion: web.setGlobalMotion,
    refreshMode: () => { for (const v of live) { if (!v.host?.isConnected) { live.delete(v); continue; } v.set({ mode: pageMode() }); } },
    stats: web.deckStats,
    linkBus: () => (typeof web.createLinkBus === 'function' ? web.createLinkBus() : null),
  };
}

async function placeholderDeck() {
  const [rt, sk, dv] = await Promise.all([import('./runtime.js'), import('./sketches.js'), import('./devices.js')]);
  const counts = new Map();
  for (const f of sk.FACETS) counts.set(f.gallery, (counts.get(f.gallery) || 0) + 1);
  return {
    source: 'placeholder',
    catalog: null,
    count: null,
    galleries: sk.GALLERIES.map((g) => ({ ...g, count: counts.get(g.id) || 0 })),
    facets: sk.FACETS.map((f) => ({ ...f, surface: f.kind === 'dial' ? 'strip' : f.kind === 'wall' ? 'span' : f.kind })),
    devices: dv.DEVICES,
    themes: [{ id: 'prism', title: 'Prism', modes: ['dark', 'light'] }],
    findFacet: rt.findFacet,
    mountDevice: (el, opts = {}) => rt.mountDevice(el, { ...opts, wall: opts.wall || opts.facet, mode: opts.mode === 'light' || opts.mode === 'day' ? 'day' : opts.mode ? 'night' : null }),
    mountKey: (el, facet, opts = {}) => rt.mountKey(el, facet, { ...opts, mode: opts.mode === 'light' || opts.mode === 'day' ? 'day' : opts.mode ? 'night' : null }),
    unmount: (view) => view?.destroy?.(),
    setGlobalMotion: rt.setGlobalMotion,
    refreshMode: rt.refreshMode,
    stats: rt.deckStats,
    linkBus: () => null,
  };
}

export async function loadDeck({ engine = null, catalog = null, only = null } = {}) {
  if (engine) {
    try { return await realDeck(engine, catalog, only); }
    catch (err) { console.warn('[prism-deck] runtime unavailable — showing sketches instead.', err?.message || err); }
  }
  return placeholderDeck();
}
