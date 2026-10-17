// bug — a beetle: shell, head, antennae, six legs. debugging: it walks in place — the legs
// swing in an alternating tripod gait and the antennae twitch; idle: it sits still.
import { defineGlyph } from '../_glyph.js';
import { arrive } from '../../scene/easing.js';
import { curve } from '../system/_kit.js';

const CX = 24, BY = 27.5, RX = 8.5, RY = 10.5;     // shell: 15.5…32.5 × 17…38
// legs: [hip x (left side), hip y, foot dx, foot dy]; mirrored on the right; tripod group
const LEGS = [[16.2, 21.5, -6, -3, 0], [15.6, 27.5, -6.5, 0, 1], [16.4, 33.5, -6, 3.5, 0]];
const LOOP = 1.2;

export default defineGlyph({
  id: 'bug',
  title: 'Bug',
  category: 'dev',
  tags: ['bug', 'debug', 'debugger', 'issue', 'defect', 'testing'],
  states: { idle: 'idle', debugging: 'active' },
  loop: LOOP,
  draw(g, s) {
    const on = s.state === 'debugging';
    const k = on ? arrive(s.since, 0.3) : 0;
    const w = Math.sin(s.phase(LOOP) * Math.PI * 4) * k; // two steps per loop
    // legs (drawn under the shell)
    for (const side of [-1, 1]) for (const [hx, hy, fx, fy, grp] of LEGS) {
      const swing = (grp === (side < 0 ? 0 : 1) ? w : -w) * 2.2;   // L front+back with R middle, then the others
      const x = side < 0 ? hx : 2 * CX - hx, dx = side < 0 ? fx : -fx;
      g.line(x, hy, x + dx, hy + fy + swing, { weight: 0.85 });
    }
    // antennae
    const tw = on ? Math.sin(s.phase(LOOP) * Math.PI * 2 * 3) * 1.2 * k : 0;
    g.path(curve([21.5, 14.5], [20, 11], [17, 9 + tw]), { role: 'dim', weight: 0.9 });
    g.path(curve([26.5, 14.5], [28, 11], [31, 9 - tw]), { role: 'dim', weight: 0.9 });
    // head + shell
    g.path('M19 18.5a5 5 0 0 1 10 0', { role: 'line' });
    g.ellipse(CX, BY, RX, RY, { role: 'line' });
    g.line(CX, 19.5, CX, 36, { role: on ? 'accent' : 'dim', weight: 0.8 });
    if (on) { g.dot(20.5, 25, 1.4, { opacity: 0.8 * k }); g.dot(27.5, 30, 1.4, { opacity: 0.8 * k }); }
  },
});
