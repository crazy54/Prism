// stopwatch — crown, side button, one sweep hand. ready: hand at 12.
// running: the crown clicks in and the hand sweeps from 12 (one turn per 4 s of
// `since`, so a running key starts at zero), trailing a fading wedge of light.
// paused: the hand holds at `level` of a turn and blinks, the way a stopped watch does.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, clamp } from '../../scene/easing.js';
import { wedge } from './_dial.js';

const CX = 24, CY = 26.5, R = 14;
const LAP = 4; // seconds per turn of the sweep hand

export default defineGlyph({
  id: 'stopwatch',
  title: 'Stopwatch',
  category: 'time',
  tags: ['stopwatch', 'chrono', 'elapsed', 'lap', 'time', 'race'],
  states: { ready: 'idle', running: 'active', paused: 'idle' },
  loop: 4,
  draw(g, s) {
    const running = s.state === 'running', paused = s.state === 'paused';
    // crown: dips as the state changes (the click), springs back
    const click = s.state === 'ready' ? 0 : 1.6 * Math.sin(Math.PI * clamp(s.since / 0.28));
    g.group({ y: click }, () => {
      g.line(CX, 8, CX, 12.5, { role: 'line' });
      g.line(20.5, 8, 27.5, 8, { role: 'line', weight: 1.1 });
    });
    g.circle(CX, CY, R);
    // side button at 45°
    const [bx0, by0] = g.polar(CX, CY, R + 2.2, 45), [bx1, by1] = g.polar(CX, CY, R + 4.4, 45);
    g.line(bx0, by0, bx1, by1, { role: 'line', weight: 1.05 });
    for (const a of [90, 180, 270]) {
      const [x1, y1] = g.polar(CX, CY, 9.5, a), [x2, y2] = g.polar(CX, CY, 11.5, a);
      g.line(x1, y1, x2, y2, { role: 'dim' });
    }
    const top = g.polar(CX, CY, 9.5, 0), top2 = g.polar(CX, CY, 11.5, 0);
    g.line(top[0], top[1], top2[0], top2[1], { role: running ? 'accent' : 'dim' });

    let ang = 0, op = 1;
    if (running) ang = ((s.since / LAP) % 1) * 360;
    if (paused) { ang = clamp(s.level) * 360; op = 0.35 + 0.65 * (pulse(s.t, 1) > 0.35 ? 1 : 0.25); }
    if (running) {
      // the sweep: a wedge of light behind the hand, fading in as the watch starts
      const k = arrive(s.since, 0.4);
      const trail = Math.min(ang, 70);
      const d = wedge(CX, CY, 10.5, ang - trail, ang);
      if (d) g.path(d, { role: 'accent', fill: true, opacity: 0.34 * k });
    }
    const [hx, hy] = g.polar(CX, CY, 10.5, ang), [tx, ty] = g.polar(CX, CY, 3, ang + 180);
    g.line(tx, ty, hx, hy, { role: running || paused ? 'accent' : 'line', opacity: op });
    g.dot(CX, CY, 2, { role: 'fill' });
  },
});
