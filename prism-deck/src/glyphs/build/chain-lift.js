// chain-lift — the lift chain: face link, edge link, face link climbing a diagonal to an arrowhead.
// Arriving, the chain climbs into place; on: it keeps hauling (one link pair per loop, seamless,
// links fading in at the foot and out under the arrow) and the arrowhead lights.
import { defineGlyph } from '../_glyph.js';
import { lerp, smoothstep } from '../../scene/easing.js';
import { enter, xf, xfPts, rot, capsule, chevron } from '../_tools.js';

const M = rot(-45, [24, 24]);    // the chain's slope
const STEP = 8.2;                // face link → edge link
const FACE = [2.8, 3.8], EDGE = 5.8;
const LO = -18, HI = 12.5;       // links show fully between these (local axis, relative to the center)

export default defineGlyph({
  id: 'chain-lift',
  title: 'Chain Lift',
  category: 'build',
  tags: ['chain', 'lift', 'lift hill', 'climb', 'track', 'coaster', 'build'],
  states: { off: 'idle', on: 'active' },
  loop: 1.6,
  draw(g, s) {
    const on = s.state === 'on';
    const k = enter(s, 0.6);
    const run = on ? s.phase(1.6) * STEP * 2 : lerp(-STEP * 2, 0, k);
    for (let i = -2; i <= 3; i++) {
      const c = -11 + i * STEP + run;
      const face = ((i % 2) + 2) % 2 === 0;
      const half = face ? FACE[0] + FACE[1] : EDGE;
      const fade = smoothstep(LO - 4, LO, c - half) * (1 - smoothstep(HI, HI + 4, c + half));
      if (fade < 0.02) continue;
      if (face) g.path(xf(capsule([24 + c - FACE[0], 24], [24 + c + FACE[0], 24], FACE[1]), M), { role: 'line', opacity: fade });
      else { const [a, b] = xfPts([[24 + c - EDGE, 24], [24 + c + EDGE, 24]], M); g.line(a[0], a[1], b[0], b[1], { role: 'line', opacity: fade }); }
    }
    const [tip] = xfPts([[24 + 18.5, 24]], M);
    g.polyline(chevron(tip, 45, 6.5, 45), { role: on ? 'accent' : 'line', join: 'round', weight: 1.05 });
  },
});
