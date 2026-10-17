// waveform — a mirrored audio waveform. live: the bars scroll left through a seamless
// periodic signal scaled by level, and swell in from rest; idle: a quiet still shape.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, clamp } from '../../scene/easing.js';

const XS = [9, 14, 19, 24, 29, 34, 39];
const REST = [2, 4, 6.5, 9, 6.5, 4, 2];
const ENV = [0.55, 0.8, 0.95, 1, 0.95, 0.8, 0.55]; // taper toward the edges
const TAU = Math.PI * 2;
// a fixed periodic "signal" over u ∈ [0, 1): integer harmonics → wraps seamlessly
const sig = (u) => clamp(0.5 + 0.28 * Math.sin(TAU * (u * 2 + 0.1)) + 0.2 * Math.sin(TAU * (u * 5 + 0.4)) + 0.14 * Math.sin(TAU * (u * 9 + 0.75)));

export default defineGlyph({
  id: 'waveform',
  title: 'Waveform',
  category: 'audio',
  tags: ['waveform', 'audio', 'signal', 'voice', 'sound', 'podcast'],
  states: { idle: 'idle', live: 'active' },
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'live';
    const k = on ? arrive(s.since, 0.45) : 1;
    const gain = 0.4 + 0.75 * s.level;
    XS.forEach((x, i) => {
      const u = (i * 0.07 + s.phase(2.4)) % 1;
      const a = on ? lerp(REST[i], 2 + 12.5 * sig(u) * gain * ENV[i], k) : REST[i];
      g.line(x, 24 - a, x, 24 + a, { role: on ? 'accent' : 'line', weight: 1.1, cap: 'round' });
    });
  },
});
