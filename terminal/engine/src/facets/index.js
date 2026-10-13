// Terminal facet registry.
//
// Facets live in src/facets/<gallery>/*.js. The list of modules is a generated,
// static manifest (src/facets/manifest.js — run `npm run facets:manifest`), so
// the same registry works in Node, in the browser catalog, and inside the
// packed CLI with no filesystem scanning at runtime.

import { FACET_MODULES } from './manifest.js';
import { GALLERIES, GALLERY_IDS, getGallery } from './galleries.js';
import { normalizeFacet, validateFacet } from './schema.js';

let cache = null;

/** Every facet, normalized and sorted (gallery order → category order → order → title). */
export function allFacets({ strict = false } = {}) {
  if (cache) {
    if (strict && cache.problems.length) throw new Error(`invalid facets:\n  ${cache.problems.join('\n  ')}`);
    return cache;
  }
  const out = [];
  const problems = [];
  for (const [file, mod] of FACET_MODULES) {
    const exported = mod.default ?? mod.facets;
    const list = Array.isArray(exported) ? exported : exported ? [exported] : [];
    list.forEach((raw, i) => {
      const f = normalizeFacet(raw, file, i, list.length);
      const errs = validateFacet(f);
      if (errs.length) { problems.push(...errs); return; }
      out.push(f);
    });
  }
  const seen = new Map();
  for (const f of out) {
    if (seen.has(f.id)) problems.push(`duplicate id "${f.id}" in ${f.file} and ${seen.get(f.id)}`);
    else seen.set(f.id, f.file);
  }
  if (problems.length && strict) throw new Error(`invalid facets:\n  ${problems.join('\n  ')}`);
  const gi = (g) => GALLERY_IDS.indexOf(g);
  const ci = (f) => getGallery(f.gallery).categories.indexOf(f.category);
  out.sort((a, b) => gi(a.gallery) - gi(b.gallery) || ci(a) - ci(b) || a.order - b.order || a.title.localeCompare(b.title));
  cache = out.filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i);
  cache.problems = problems;
  return cache;
}

/** Find by exact id, exact title, or an unambiguous id prefix. */
export function findFacet(query) {
  const facets = allFacets();
  const q = String(query).toLowerCase();
  return facets.find((f) => f.id === q)
    || facets.find((f) => f.title.toLowerCase() === q)
    || (() => { const m = facets.filter((f) => f.id.startsWith(q)); return m.length === 1 ? m[0] : null; })();
}

/** Galleries with their facets grouped by category (empty categories omitted). */
export function catalogTree() {
  const facets = allFacets();
  return GALLERIES.map((g) => ({
    ...g,
    count: facets.filter((f) => f.gallery === g.id).length,
    categories: g.categories
      .map((name) => ({ name, facets: facets.filter((f) => f.gallery === g.id && f.category === name) }))
      .filter((c) => c.facets.length),
  })).filter((g) => g.count);
}

/** Case-insensitive search over id, title, description, tags, gallery and category. */
export function searchFacets(query, { gallery, kind } = {}) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return allFacets().filter((f) => {
    if (gallery && f.gallery !== gallery) return false;
    if (kind && f.kind !== kind) return false;
    const hay = `${f.id} ${f.title} ${f.description} ${f.tags.join(' ')} ${f.gallery} ${f.category}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export { GALLERIES, getGallery };

// Back-compat for code written against the original scene registry.
export async function loadScenes() { return allFacets(); }
export async function findScene(q) { return findFacet(q); }
