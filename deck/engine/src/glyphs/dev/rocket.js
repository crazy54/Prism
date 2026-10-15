// rocket — deploy / launch. ready: the rocket stands on its pad. launched: it lifts off the
// pad, the exhaust flame flickers under it (whole-number frequencies, so the loop is
// seamless), it trembles a little, and speed lines stream past.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp, smoothstep } from '../../scene/easing.js';
import { quadC } from '../system/_kit.js';

const LOOP = 1.2;
const TAU = Math.PI * 2;

export default defineGlyph({
  id: 'rocket',
  title: 'Rocket',
  category: 'dev',
  tags: ['rocket', 'launch', 'deploy', 'release', 'ship', 'start'],
  states: { ready: 'idle', launched: 'active' },
  loop: LOOP,
  draw(g, s) {
    const up = s.state === 'launched';
    const k = up ? arrive(s.since, 0.5) : 1 - arrive(s.since, 0.35);
    const p = s.phase(LOOP);
    const shake = up ? 0.35 * Math.sin(p * TAU * 6) * k : 0;
    const dy = -3 * k;                                   // lift
    const X = (x) => +(x + shake).toFixed(2), Y = (y) => +(y + dy).toFixed(2);
    // flame first, so the nozzle sits on it
    if (k > 0.02) {
      const fl = 5.5 + 1.6 * Math.sin(p * TAU * 5) + 0.9 * Math.sin(p * TAU * 7 + 1.3);
      const len = fl * k, y0 = Y(33.5);
      g.path(`M${X(20)} ${y0}${quadC([X(20), y0], [X(20.4), y0 + len * 0.6], [X(24), y0 + len])}${quadC([X(24), y0 + len], [X(27.6), y0 + len * 0.6], [X(28), y0])}Z`, { role: 'accent', fill: true, opacity: 0.9 });
      g.path(`M${X(22.3)} ${y0}${quadC([X(22.3), y0], [X(22.5), y0 + len * 0.4], [X(24), y0 + len * 0.62])}${quadC([X(24), y0 + len * 0.62], [X(25.5), y0 + len * 0.4], [X(25.7), y0])}Z`, { role: 'spark', opacity: 0.9 * k });
    }
    // body: nose to tail, porthole, fins, nozzle
    g.path(`M${X(24)} ${Y(9)}C${X(30.5)} ${Y(13)} ${X(32)} ${Y(18)} ${X(32)} ${Y(23)}V${Y(31.5)}H${X(16)}V${Y(23)}C${X(16)} ${Y(18)} ${X(17.5)} ${Y(13)} ${X(24)} ${Y(9)}Z`, { join: 'round' });
    g.circle(X(24), Y(20.5), 3.4, { role: up ? 'accent' : 'dim' });
    g.path(`M${X(16)} ${Y(24.5)}L${X(10.5)} ${Y(30)}V${Y(35)}L${X(16)} ${Y(31.5)}`, { join: 'round' });
    g.path(`M${X(32)} ${Y(24.5)}L${X(37.5)} ${Y(30)}V${Y(35)}L${X(32)} ${Y(31.5)}`, { join: 'round' });
    g.line(X(20.5), Y(33.5), X(27.5), Y(33.5), { role: 'dim' });
    // ready: the pad; launched: speed lines streaming down past the fins
    if (k < 0.98) g.line(10, 39.5, 38, 39.5, { role: 'dim', opacity: 1 - k });
    // [x, phase offset, length, y from, y to] — the inner pair stays above the fins
    if (up) for (const [x, off, len, ya, yb] of [[7, 0, 5, 10, 37], [41, 0.5, 5, 10, 37], [12, 0.3, 3.5, 8, 19], [36, 0.8, 3.5, 8, 19]]) {
      const u = (p * 2 + off) % 1;                       // two passes per loop
      const y = ya + u * (yb - ya);
      const fade = smoothstep(0, 0.2, u) * (1 - smoothstep(0.7, 1, u)) * k;
      if (fade > 0.02) g.line(x, y, x, clamp(y + len, 6, 41), { role: 'dim', opacity: fade });
    }
  },
});
