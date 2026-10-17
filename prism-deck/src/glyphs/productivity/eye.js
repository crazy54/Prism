// eye — visibility. shown: an open eye, the iris lit, its glint resting. hidden: the eye dims and a
// strike draws through it (hide / hide UI). Turning shown, the lids open from a slit.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { strike } from '../system/_kit.js';

/** The almond eye, opened by o (0 = a slit, 1 = open). */
const lids = (o) => {
  const h = lerp(1, 12.5, o);
  return `M6.5 24C11 ${24 - h * 0.68} 17 ${24 - h} 24 ${24 - h}C31 ${24 - h} 37 ${24 - h * 0.68} 41.5 24C37 ${24 + h * 0.68} 31 ${24 + h} 24 ${24 + h}C17 ${24 + h} 11 ${24 + h * 0.68} 6.5 24Z`;
};

export default defineGlyph({
  id: 'eye',
  title: 'Visibility',
  category: 'productivity',
  tags: ['eye', 'visible', 'show', 'hide', 'view', 'preview', 'visibility', 'hide ui', 'source'],
  states: { shown: 'active', hidden: 'idle' },
  draw(g, s) {
    if (s.state === 'hidden') {
      g.path(lids(1), { role: 'dim', join: 'round' });
      g.circle(24, 24, 6, { role: 'dim' });
      strike(g, s, { from: [10, 9.5], to: [38, 38.5] });
      return;
    }
    const o = arrive(s.since, 0.45);
    g.path(lids(o), { role: 'line', join: 'round' });
    if (o > 0.4) {
      const r = lerp(2, 6.5, (o - 0.4) / 0.6);
      g.circle(24, 24, r, { role: 'accent', weight: 1.05 });
      g.circle(24, 24, r * 0.4, { role: 'fill' });
      g.dot(26.6, 21.4, 1.3, { opacity: o });
    }
  },
});
