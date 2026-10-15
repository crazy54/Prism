// Glyph registry. Glyphs live in src/glyphs/<category>/<id>.js (one per file; "_"
// files are helpers). The module list is the generated src/glyphs/_manifest.js.

import { GLYPH_MODULES } from './_manifest.js';

let cache = null;

/** { glyphs: Map(id → glyph), problems: [] } */
export function glyphRegistry() {
  if (cache) return cache;
  const glyphs = new Map(), problems = [];
  for (const [file, mod] of GLYPH_MODULES) {
    const g = mod.default;
    if (!g || typeof g.draw !== 'function' || !g.stateNames) { problems.push(`${file}: default export must be defineGlyph({...})`); continue; }
    const [cat, name] = file.split('/');
    if (g.category !== cat) problems.push(`${file}: category "${g.category}" must match its folder "${cat}"`);
    if (`${g.id}.js` !== name) problems.push(`${file}: glyph id "${g.id}" must match its file name`);
    if (glyphs.has(g.id)) problems.push(`duplicate glyph id "${g.id}" (${file})`);
    glyphs.set(g.id, Object.freeze({ ...g, file }));
  }
  cache = { glyphs, problems };
  return cache;
}

export const allGlyphs = () => [...glyphRegistry().glyphs.values()];
export const getGlyph = (id) => glyphRegistry().glyphs.get(id) || null;
export const glyphCategories = () => [...new Set(allGlyphs().map((g) => g.category))];
