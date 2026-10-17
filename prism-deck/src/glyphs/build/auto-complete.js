// auto-complete — finish the circuit: a closed track loop (a stadium) built most of the way round from
// the station mark, the last stretch dashed in the accent where it will be completed. Arriving, the
// built part draws in; a press closes the dashed gap with a spark running round it.
import { defineGlyph } from '../_glyph.js';
import { clamp, inOutSine } from '../../scene/easing.js';
import { flattenPath } from '../../scene/geom.js';
import { enter } from '../_tools.js';
import { partialPolyline, alongPolyline, polyLength } from '../system/_kit.js';

// the circuit, clockwise from the station (bottom left)
const D = 'M17 37H31A11 11 0 0 0 31 15H17A11 11 0 0 0 17 37Z';
const LOOP = flattenPath(D, 0.2)[0].pts;
const BUILT = 0.72;               // the built fraction (from the station, counterclockwise on screen)

/** Sub-polyline between fractions a..b (by length). */
function span(pts, a, b) {
  const head = partialPolyline(pts, b);
  const L = polyLength(pts) * a;
  let acc = 0;
  for (let i = 1; i < head.length; i++) {
    const l = Math.hypot(head[i][0] - head[i - 1][0], head[i][1] - head[i - 1][1]);
    if (acc + l >= L) { const f = l ? (L - acc) / l : 0; return [[head[i - 1][0] + (head[i][0] - head[i - 1][0]) * f, head[i - 1][1] + (head[i][1] - head[i - 1][1]) * f], ...head.slice(i)]; }
    acc += l;
  }
  return head.slice(-1);
}

export default defineGlyph({
  id: 'auto-complete',
  title: 'Auto-Complete',
  category: 'build',
  tags: ['auto', 'complete', 'finish', 'auto end', 'close circuit', 'track', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.7);
    const built = span(LOOP, 0, BUILT * k);
    if (built.length > 1) g.polyline(built, { role: 'line', join: 'round' });
    const rest = span(LOOP, BUILT * k, 1);
    if (rest.length > 1) g.polyline(rest, { role: 'accent', dash: [2.2, 2.8], weight: 0.9 });
    g.line(17, 33, 17, 41, { role: 'line', weight: 1.05 });   // the station mark
    if (!s.pressed && s.pressAge < 0.9) {
      const [x, y] = alongPolyline(LOOP, BUILT + (1 - BUILT) * inOutSine(clamp(s.pressAge / 0.9)));
      g.dot(x, y, 2.3);
    }
  },
});
