// hdr — high dynamic range: a display with a bright sun rising over its bottom edge. off: the sun is
// dim and small; on: it rises, its rays reach out and the display lights. The change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'hdr',
  title: 'HDR',
  category: 'window',
  tags: ['hdr', 'high dynamic range', 'display', 'brightness', 'monitor', 'color'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const m = arrive(s.since, 0.45);
    const k = on ? m : 1 - m;
    g.rect(7, 9, 34, 23, { r: 4, role: on ? 'accent' : 'line' });
    g.line(24, 32, 24, 37.5, { role: 'line' });
    g.line(16, 38.5, 32, 38.5, { role: 'line' });
    // the sun: a half disc on the display's lower edge, rays fanning above it
    const r = lerp(3.5, 5, k);
    g.path(`M${24 - r} 27.5A${r} ${r} 0 0 1 ${24 + r} 27.5`, { role: on ? 'accent' : 'dim', weight: 1.05 });
    for (const a of [-60, -30, 0, 30, 60]) {
      const [x0, y0] = g.polar(24, 27.5, r + 2.5, a), [x1, y1] = g.polar(24, 27.5, r + 2.5 + lerp(0.5, 3, k), a);
      g.line(x0, y0, x1, y1, { role: on ? 'accent' : 'dim', opacity: lerp(0.5, 1, k) });
    }
  },
});
