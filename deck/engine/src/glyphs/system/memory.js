// memory — a RAM module: board, four chips, keyed contacts. The chips are the meter:
// they fill by level (a partial chip fills from the bottom), and while in use a refresh
// shimmer runs across the lit chips. high: the meter pins near full and the top chip blinks.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp } from '../../scene/easing.js';
import { bump } from './_kit.js';

const CHIPS = [11, 18, 25, 32];               // chip x (w 5, gaps 2)
const CW = 5, CY = 15.5, CH = 10.5;
const PINS = [11.5, 15.5, 19.5, 28.5, 32.5, 36.5]; // contacts, keyed by the gap at the center
const LOOP = 1.6;

export default defineGlyph({
  id: 'memory',
  title: 'Memory',
  category: 'system',
  tags: ['memory', 'ram', 'dimm', 'system', 'usage', 'performance'],
  states: { normal: 'active', high: 'warn' },
  loop: LOOP,
  draw(g, s) {
    g.rect(7, 11.5, 34, 18.5, { r: 3 });
    for (const x of PINS) g.line(x, 33.5, x, 37, { role: 'dim' });
    const high = s.state === 'high';
    const lv = (high ? Math.max(clamp(s.level), 0.92) : clamp(s.level)) * arrive(s.since, 0.5);
    const fillN = lv * 4;
    const p = s.phase(LOOP);
    CHIPS.forEach((x, i) => {
      const f = clamp(fillN - i);
      const top = i === Math.ceil(fillN) - 1;
      if (f < 1) g.rect(x, CY, CW, CH, { r: 1.2, role: 'dim', fill: true, opacity: 0.32 }); // a ghost chip
      if (f <= 0.04) return;
      // in use: a refresh shimmer travels across the chips; high: the top chip blinks
      let op = 0.78 + 0.22 * bump(p, (i + 0.5) / 4, 0.3, true);
      if (high && top) op = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(p * Math.PI * 4));
      const h = CH * f;
      g.rect(x, CY + CH - h, CW, h, { r: Math.min(1.2, h / 2), role: 'accent', fill: true, opacity: op });
    });
  },
});
