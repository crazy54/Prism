// mixer — three channel faders. on: the tracks below each cap light up (signal) and
// the caps ride a slow automation curve; off: caps parked, tracks dim.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

const XS = [12.5, 24, 35.5];
const PARK = [29, 17.5, 24];           // cap centers when off
const TOP = 9, BOT = 39;
const TAU = Math.PI * 2;

export default defineGlyph({
  id: 'mixer',
  title: 'Mixer',
  category: 'audio',
  tags: ['mixer', 'faders', 'channels', 'gain', 'levels', 'audio', 'sliders'],
  states: { off: 'idle', on: 'active' },
  loop: 4.8,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.5);
    XS.forEach((x, i) => {
      // automation: each channel on its own slow sine (periods 4.8 / 2.4 divide the loop)
      const ride = Math.sin(TAU * (s.t / 4.8 + i * 0.31)) * 3.2 + Math.sin(TAU * (s.t / 2.4 + i * 0.57)) * 1.4;
      const y = on ? lerp(PARK[i], PARK[i] + ride, k) : PARK[i];
      if (y - 4 > TOP + 0.5) g.line(x, TOP, x, y - 4, { role: 'dim' });
      g.line(x, y + 4, x, BOT, { role: on ? 'accent' : 'dim', opacity: on ? lerp(0.85, 1, k) : 1 });
      g.rect(x - 4.5, y - 3, 9, 6, { r: 2, role: 'fill' });
    });
  },
});
