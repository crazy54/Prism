// Terminal facet contract — what every catalog entry must declare.
//
// A facet is a scene (src/context.js contract) plus catalog metadata:
//
//   {
//     id:          'plasma'                 unique kebab-case id (defaults to the file name)
//     title:       'Plasma'
//     gallery:     'fx'                     a GALLERIES id (defaults to the facet's folder)
//     category:    'Fields'                 one of that gallery's categories
//     description: 'One sentence, ≤ 180 chars, what it is and why you'd use it.'
//     tags:        ['plasma', 'demoscene']  lower-case search terms
//     kind:        'scene' | 'widget' | 'spinner' | 'progress' | 'text' | 'chart' | 'tui' | 'diagram' | 'art'
//     size:        { w: 80, h: 24 }         preferred size in cells (catalog tiles and snapshots use it)
//     minSize:     { w: 20, h: 6 }          smallest size it still reads at
//     animated:    true                     false = a still (rendered once at t = 0)
//     loop:        8                        seconds per cycle — recordings and thumbnails use it
//     glyphs:      'unicode'                minimum glyph set: 'ascii' | 'unicode' | 'braille' | 'sextant'
//     color:       'truecolor'              minimum color depth to look right: 'mono' | '16' | '256' | 'truecolor'
//     canvas:      'field'                  default canvas kind (see src/canvas.js pickMode)
//     palette:     'prism'                  default palette
//     params:      { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } }   tweakable via --set key=value
//     order:       10                       sort key within its category
//     since:       '0.1.0'                  release the facet first shipped in
//     credits:     'optional attribution'
//     setup(ctx) → frame(t, dt)             draws the whole picture into ctx.buffer each frame
//   }
//
// Facets must stay browser-safe: import only from the engine's pure modules
// (color, canvas, buffer, palettes, easing, noise, math3d, width, widgets/*,
// text/*, spinners) — never node:*, process, Date.now or Math.random. Use t,
// ctx.rng and ctx.noise so output is deterministic for a given seed.

import { GALLERIES, getGallery } from './galleries.js';

export const KINDS = ['scene', 'widget', 'spinner', 'progress', 'text', 'chart', 'tui', 'diagram', 'art'];
export const GLYPHS = ['ascii', 'unicode', 'braille', 'sextant'];
export const COLORS = ['mono', '16', '256', 'truecolor'];

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Fill defaults. `file` is the path relative to src/facets (e.g. 'fx/plasma.js'). */
export function normalizeFacet(raw, file, index = 0, count = 1) {
  const [dir, name] = file.split('/');
  const base = name.replace(/\.js$/, '');
  const f = {
    id: count === 1 ? base : undefined,
    gallery: dir,
    tags: [],
    kind: 'scene',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    animated: true,
    loop: 8,
    glyphs: 'unicode',
    color: 'truecolor',
    order: 50 + index,
    since: '0.1.0',
    params: {},
    ...raw,
  };
  f.file = file;
  f.tags = [...new Set((f.tags || []).map((t) => String(t).toLowerCase()))];
  return f;
}

/** Returns a list of problems (empty when the facet is valid). */
export function validateFacet(f) {
  const errs = [];
  const at = `${f.file || '?'}${f.id ? ` (${f.id})` : ''}`;
  const need = (cond, msg) => { if (!cond) errs.push(`${at}: ${msg}`); };
  need(typeof f.id === 'string' && KEBAB.test(f.id), 'id must be kebab-case (set `id` when a file exports several facets)');
  need(typeof f.title === 'string' && f.title.trim().length > 0, 'title is required');
  const g = getGallery(f.gallery);
  need(!!g, `gallery "${f.gallery}" is not one of ${GALLERIES.map((x) => x.id).join(', ')}`);
  if (g) need(g.categories.includes(f.category), `category "${f.category}" is not in ${g.id}: ${g.categories.join(' | ')}`);
  if (f.file) need(f.file.startsWith(`${f.gallery}/`), `lives in ${f.file.split('/')[0]}/ but declares gallery "${f.gallery}"`);
  need(typeof f.description === 'string' && f.description.length >= 20 && f.description.length <= 180, 'description must be 20–180 characters');
  need(Array.isArray(f.tags), 'tags must be an array');
  need(KINDS.includes(f.kind), `kind must be one of ${KINDS.join(', ')}`);
  for (const k of ['size', 'minSize']) need(f[k] && Number.isInteger(f[k].w) && Number.isInteger(f[k].h) && f[k].w > 0 && f[k].h > 0, `${k} must be { w, h } in whole cells`);
  if (f.size && f.minSize) need(f.minSize.w <= f.size.w && f.minSize.h <= f.size.h, 'minSize must fit inside size');
  if (f.size) need(f.size.w <= 160 && f.size.h <= 60, 'size must be ≤ 160×60');
  need(typeof f.animated === 'boolean', 'animated must be true or false');
  need(typeof f.loop === 'number' && f.loop > 0 && f.loop <= 120, 'loop must be 0–120 seconds');
  need(GLYPHS.includes(f.glyphs), `glyphs must be one of ${GLYPHS.join(', ')}`);
  need(COLORS.includes(f.color), `color must be one of ${COLORS.join(', ')}`);
  need(typeof f.setup === 'function', 'setup(ctx) must be a function returning frame(t, dt)');
  need(f.params && typeof f.params === 'object', 'params must be an object');
  return errs;
}
