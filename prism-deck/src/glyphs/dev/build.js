// build — a hammer (build / compile), head up-right. building: it taps away (a 0.8 s loop) and sparks
// fly off the striking face. Arriving, it swings into place; a press is one strike.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter, xf, xfPts, rot, capsule } from '../_tools.js';

// drawn upright about the grid center, then turned 45° and nudged so the whole hammer sits centered
const HEAD = 'M17 10.5H31A2.5 2.5 0 0 1 33.5 13V15A2.5 2.5 0 0 1 31 17.5H17L14.5 15.5V12.5Z';
const HANDLE = capsule([24, 17.5], [24, 38.5], 2.6);
const NUDGE = [-2.8, 1.6];
const at = (deg) => { const m = rot(deg); return [m[0], m[1], m[2], m[3], m[4] + NUDGE[0], m[5] + NUDGE[1]]; };

export default defineGlyph({
  id: 'build',
  title: 'Build',
  category: 'dev',
  tags: ['build', 'hammer', 'compile', 'make', 'construct', 'tools', 'task'],
  states: { idle: 'idle', building: 'busy' },
  loop: 0.8,
  draw(g, s) {
    const busy = s.state === 'building';
    const k = enter(s, 0.5);
    const tap = busy ? Math.max(0, Math.sin(s.phase(0.8) * Math.PI * 2)) : !s.pressed && s.pressAge < 0.35 ? Math.sin(Math.PI * clamp(s.pressAge / 0.35)) : 0;
    const M = at(45 + lerp(-20, 0, k) - 10 * tap);
    g.path(xf(HANDLE, M), { join: 'round' });
    g.path(xf(HEAD, M), { role: busy ? 'accent' : 'line', join: 'round' });
    if (busy && tap < 0.2) {
      // sparks off the striking face (the head's right end)
      const f = 1 - tap / 0.2, [fx, fy] = xfPts([[34.5, 14]], at(45))[0];
      for (const a of [20, 70, 120]) {
        const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180);
        g.line(fx + 2.5 * sn, fy - 2.5 * c, fx + 5 * sn, fy - 5 * c, { role: 'accent', weight: 0.7, opacity: f });
      }
    }
  },
});
