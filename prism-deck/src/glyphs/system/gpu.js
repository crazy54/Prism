// gpu — a graphics card: board, a fan, heatsink fins, edge connector. The fins are the
// meter (1–3 light by level) and the fan spins faster the higher the load — a whole
// number of blade-steps per loop, so the spin is seamless. idle: zero-RPM, the fan rests.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp } from '../../scene/easing.js';
import { curve } from './_kit.js';

const FX = 18, FY = 22, FR = 8;           // fan
const FINS = [16.5, 22, 27.5];            // fin rows (top → bottom)
const BLADES = 3;
const LOOP = 1.2;

export default defineGlyph({
  id: 'gpu',
  title: 'GPU',
  category: 'system',
  tags: ['gpu', 'graphics', 'video card', 'fan', 'system', 'performance', 'load'],
  states: { busy: 'active', idle: 'idle' },
  loop: LOOP,
  draw(g, s) {
    const busy = s.state === 'busy';
    g.rect(7, 11, 34, 22, { r: 3.5 });
    // edge connector, keyed
    g.line(12, 36.5, 15.5, 36.5, { role: 'dim' });
    g.line(19, 36.5, 30, 36.5, { role: 'dim' });
    // fan: ring, hub, three swept blades
    g.circle(FX, FY, FR, { role: 'dim', opacity: 0.8 });
    const lv = clamp(s.level);
    const steps = busy ? 1 + Math.round(lv * 2) : 0;           // 0–3 blade-steps (120°) per loop
    const spin = (steps * 360 * s.phase(LOOP)) / BLADES;
    for (let b = 0; b < BLADES; b++) {
      const a = (b * 360) / BLADES + spin;
      const [x0, y0] = g.polar(FX, FY, 2.6, a), [xc, yc] = g.polar(FX, FY, 5.6, a + 14), [x1, y1] = g.polar(FX, FY, 5.9, a + 70);
      g.path(curve([x0, y0], [xc, yc], [x1, y1]), { role: busy ? 'accent' : 'line', weight: 0.9 });
    }
    g.dot(FX, FY, 1.7, { role: busy ? 'spark' : 'fill' });
    // fins: the load meter, lighting bottom → top
    const lit = busy ? Math.ceil(lv * 3 - 1e-9) : 0;
    FINS.forEach((y, i) => {
      const on = 2 - i < lit;
      const k = on ? arrive(Math.max(0, s.since - (2 - i) * 0.1), 0.36) : 0;
      g.line(30, y, 36.5, y, { role: on ? 'accent' : 'dim', opacity: on ? 0.4 + 0.6 * k : 0.7 });
    });
  },
});
