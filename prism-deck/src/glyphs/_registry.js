// Glyph registry. Glyphs live in src/glyphs/<category>/<id>.js (one per file; "_"
// files are helpers). The module list is the generated src/glyphs/_manifest.js.
// Aliases (other names for existing glyphs, optionally with a default state) live in
// src/glyphs/_aliases.js; getGlyph() and resolveGlyph() follow them, allGlyphs() never lists them.

import { GLYPH_MODULES } from './_manifest.js';
import { GLYPH_ALIASES } from './_aliases.js';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let cache = null;

/** { glyphs: Map(id → glyph), aliases: Map(name → { glyph, state }), problems: [] } */
export function glyphRegistry() {
  if (cache) return cache;
  const glyphs = new Map(), aliases = new Map(), problems = [];
  for (const [file, mod] of GLYPH_MODULES) {
    const g = mod.default;
    if (!g || typeof g.draw !== 'function' || !g.stateNames) { problems.push(`${file}: default export must be defineGlyph({...})`); continue; }
    const [cat, name] = file.split('/');
    if (g.category !== cat) problems.push(`${file}: category "${g.category}" must match its folder "${cat}"`);
    if (`${g.id}.js` !== name) problems.push(`${file}: glyph id "${g.id}" must match its file name`);
    if (glyphs.has(g.id)) problems.push(`duplicate glyph id "${g.id}" (${file})`);
    glyphs.set(g.id, Object.freeze({ ...g, file }));
  }
  for (const [name, a] of Object.entries(GLYPH_ALIASES)) {
    const target = glyphs.get(a?.glyph);
    if (!KEBAB.test(name)) problems.push(`alias "${name}" must be kebab-case`);
    else if (glyphs.has(name)) problems.push(`alias "${name}" shadows the glyph of the same id`);
    else if (!target) problems.push(`alias "${name}" → unknown glyph "${a?.glyph}"`);
    else if (a.state != null && !target.states[a.state]) problems.push(`alias "${name}" → ${a.glyph} has no state "${a.state}"`);
    else aliases.set(name, Object.freeze({ glyph: a.glyph, state: a.state ?? null }));
  }
  cache = { glyphs, aliases, problems };
  return cache;
}

export const allGlyphs = () => [...glyphRegistry().glyphs.values()];
export const glyphCategories = () => [...new Set(allGlyphs().map((g) => g.category))];

/**
 * A glyph by id or alias (a "category/" prefix is ignored) → { glyph, state, alias } or null. state is
 * the alias's default state (null for plain ids); alias is the name asked for when it was one.
 */
export function resolveGlyph(name) {
  const id = typeof name === 'string' ? name.split('/').pop() : '';
  const { glyphs, aliases } = glyphRegistry();
  const g = glyphs.get(id);
  if (g) return { glyph: g, state: null, alias: null };
  const a = aliases.get(id);
  return a ? { glyph: glyphs.get(a.glyph), state: a.state, alias: id } : null;
}

/** A glyph by id, or by alias (the alias's target). */
export const getGlyph = (id) => glyphRegistry().glyphs.get(id) || resolveGlyph(id)?.glyph || null;
/** Every alias: [{ name, glyph, state }]. */
export const glyphAliases = () => [...glyphRegistry().aliases].map(([name, a]) => ({ name, ...a }));
