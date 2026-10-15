// Icons gallery helper: one facet per glyph. A glyph module + one line here gives a
// catalog entry that renders in any theme, every state, every key size:
//
//   // src/facets/icons/mic.js
//   import { iconFacet } from './_icon.js';
//   export default iconFacet('mic');
//
// States come from the glyph (press toggles / cycles them); params: label, showLabel, level.

import { getGlyph } from '../../glyphs/_registry.js';
import { GLYPH_CATEGORIES } from '../galleries.js';
import { surface } from '../../scene/surface.js';

export function iconFacet(glyphId, extra = {}) {
  const g = getGlyph(glyphId);
  if (!g) throw new Error(`iconFacet: unknown glyph "${glyphId}" (add src/glyphs/<category>/${glyphId}.js and run npm run facets:manifest)`);
  const states = g.stateNames.length > 1 ? g.stateNames : [];
  return {
    id: `icon-${g.id}`,
    title: g.title,
    category: GLYPH_CATEGORIES[g.category] || 'Status',
    description: extra.description || `The ${g.title.toLowerCase()} glyph${states.length ? ` (${states.join(' / ')})` : ''}: 48-unit geometry, painted by whichever deck theme is active.`.slice(0, 180),
    tags: [...new Set(['icon', ...g.tags])],
    surface: 'key',
    glyph: g.id,
    animated: true,
    fps: g.loop ? 12 : 10,
    loop: g.loop || 2,
    states,
    tones: states.length ? Object.fromEntries(states.map((s) => [s, g.states[s]])) : undefined,
    press: states.length === 2 ? 'toggle' : states.length ? 'cycle' : 'momentary',
    params: {
      label: { type: 'text', default: extra.label || g.title, label: 'Label', maxLength: 14 },
      showLabel: { type: 'bool', default: true, label: 'Show label' },
      level: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.05, label: 'Level' },
      hue: { type: 'hue', default: g.hue ?? 269.8, min: 0, max: 360, step: 1, label: 'Hue' },
    },
    order: extra.order ?? 50,
    render(ctx) {
      const k = surface(ctx);
      const state = ctx.stateName || g.defaultState;
      const tone = g.states[state];
      const labeled = !!(ctx.params.showLabel && ctx.params.label);
      k.background({ tone });
      k.glyph(g.id, { state, labeled, level: ctx.params.level });
      if (labeled) k.label(ctx.params.label, { color: tone === 'off' ? 'dim' : undefined });
      return k.svg();
    },
  };
}
