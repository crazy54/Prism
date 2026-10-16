// check — the confirmation mark. pending: a dotted trace of the mark waits, quiet.
// done: the mark draws itself along its path, then a ring of light blooms out and fades.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp, outCubic } from '../../scene/easing.js';
import { alongPolyline, partialPolyline, polyLength } from '../system/_kit.js';

const MARK = [[9.5, 25], [19.5, 34.5], [38.5, 13.5]];

export default defineGlyph({
  id: 'check',
  title: 'Check',
  category: 'status',
  tags: ['check', 'done', 'ok', 'success', 'confirm', 'complete', 'tick'],
  states: { pending: 'idle', done: 'ok' },
  draw(g, s) {
    if (s.state === 'pending') {
      // real dots, not zero-length dashes: they survive themes that paint butt caps or rasterize
      const L = polyLength(MARK), count = Math.round(L / 4.6);
      for (let i = 0; i <= count; i++) { const [x, y] = alongPolyline(MARK, i / count); g.circle(x, y, 1.45, { role: 'line', fill: true, opacity: 0.8 }); }
      return;
    }
    const k = arrive(s.since, 0.42);
    const pts = partialPolyline(MARK, k);
    if (pts.length > 1) g.polyline(pts, { role: 'accent', weight: 1.25, cap: 'round', join: 'round' });
    // the bloom: a ring that opens past the mark and fades, after the stroke lands
    const b = clamp((s.since - 0.3) / 0.6);
    if (b > 0 && b < 1) g.circle(24, 24, 13 + 4.5 * outCubic(b), { role: 'accent', weight: 0.5, opacity: 0.55 * (1 - b) });
  },
});
