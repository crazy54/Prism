// Facet + composition validation helpers.

import { validateCss, referencedTokens, definedTokens } from './css.js';

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // kebab-case, lowercase

// The core theming tokens Prism always defines globally (from tokens.css). A facet
// referencing these is fine; referencing anything else that it doesn't define is a warning.
export const GLOBAL_TOKENS = new Set([
  '--bg', '--panel', '--panel2', '--card', '--line', '--ink', '--muted', '--dim',
  '--crit', '--crit-rgb', '--neg', '--neg-rgb', '--warn', '--warn-rgb',
  '--pos', '--pos-rgb', '--info', '--info-rgb', '--accent', '--accent-rgb',
  '--cardgrad', '--c', '--c-rgb',
  // JFH-33 chrome identity — shell font + 4-step corner-radius scale, defined globally
  // in Prism's base :root and overridden per design system.
  '--font', '--r-sm', '--r-md', '--r-lg', '--r-xl',
  // JFH-33 feel layer — elevation/motion/border/heading/density, also defined globally
  // in the base :root and overridden per design system.
  '--elev-1', '--elev-2', '--dur', '--ease', '--bd', '--head-w', '--dens',
]);

/**
 * Validate a facet definition for create/update. Checks id/naming, required metadata,
 * html/css presence, CSS structural soundness, and token references. Returns
 * { valid, errors, warnings, checks }.
 */
export function validateFacet(facet, { existingIds = new Set(), knownGalleries = null, isUpdate = false } = {}) {
  const errors = [];
  const warnings = [];
  const checks = {};

  // id / naming
  checks.id = false;
  if (!facet.id) {
    errors.push('Missing required field: id');
  } else if (!ID_RE.test(facet.id)) {
    errors.push(`Invalid id "${facet.id}": must be lowercase kebab-case (e.g. "charts-my-widget")`);
  } else {
    checks.id = true;
  }
  if (!isUpdate && facet.id && existingIds.has(facet.id)) {
    errors.push(`Duplicate id "${facet.id}": a facet with this id already exists (use update_facet)`);
  }
  if (isUpdate && facet.id && !existingIds.has(facet.id)) {
    errors.push(`Unknown id "${facet.id}": no such facet to update (use create_facet)`);
  }

  // name
  checks.name = !!(facet.name && String(facet.name).trim());
  if (!checks.name) errors.push('Missing required field: name');

  // gallery
  checks.gallery = false;
  if (!facet.gallery) {
    errors.push('Missing required field: gallery');
  } else if (knownGalleries && !knownGalleries.has(facet.gallery)) {
    warnings.push(`Gallery "${facet.gallery}" is not a known gallery id (${Array.from(knownGalleries).join(', ')})`);
    checks.gallery = true;
  } else {
    checks.gallery = true;
  }

  // description (metadata quality)
  checks.description = !!(facet.description && String(facet.description).trim().length >= 10);
  if (!facet.description) warnings.push('No description provided (recommended for discovery/search)');
  else if (String(facet.description).trim().length < 10) warnings.push('Description is very short (<10 chars)');

  // html
  checks.html = !!(facet.html && String(facet.html).trim());
  if (!checks.html) errors.push('Missing required field: html (the facet markup)');

  // css (may legitimately be empty for pure-HTML facets, but warn)
  checks.css = true;
  if (!facet.css || !String(facet.css).trim()) {
    warnings.push('No css provided — facet will rely entirely on global tokens/classes');
  } else {
    const cssRes = validateCss(facet.css);
    checks.css = cssRes.valid;
    cssRes.errors.forEach((e) => errors.push(`CSS: ${e}`));
    cssRes.warnings.forEach((w) => warnings.push(`CSS: ${w}`));
  }

  // rendering check: referenced tokens should be either defined locally or global
  checks.tokens = true;
  if (facet.css) {
    const refd = referencedTokens(facet.css);
    const defd = definedTokens(facet.css);
    for (const t of refd) {
      if (!defd.has(t) && !GLOBAL_TOKENS.has(t)) {
        warnings.push(`References token ${t} that is neither defined locally nor a known global token`);
      }
    }
  }

  // needsJs sanity
  if (facet.needsJs && typeof facet.needsJs !== 'string') {
    errors.push('needsJs must be a string (initializer key) or null');
  }

  return { valid: errors.length === 0, errors, warnings, checks };
}

/** Validate a proposed composition of effect ids against the catalog. */
export function validateComposition(ids, store) {
  const errors = [];
  const warnings = [];
  const resolved = [];
  const missing = [];
  for (const id of ids) {
    const e = store.get(id);
    if (!e) { missing.push(id); errors.push(`Unknown effect id: ${id}`); continue; }
    resolved.push(e);
    if (e.needsJs) warnings.push(`Effect "${id}" needs JS initializer "${e.needsJs}" — run it after inserting markup`);
    if (e.selfContained === false) warnings.push(`Effect "${id}" is not fully self-contained — verify surrounding context`);
  }
  return { valid: errors.length === 0, errors, warnings, resolved, missing };
}

export { ID_RE };
