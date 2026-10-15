// equalizer — five bars over a floor. on: the bars dance (seamless sums of sines
// whose periods divide the loop) with peak-hold caps that fall back slowly; off:
// they settle from wherever they were into a resting smile curve.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, clamp } from '../../scene/easing.js';

const XS = [11, 17.5, 24, 30.5, 37];
const FLOOR = 37, MIN = 3, MAX = 23;
const REST = [0.5, 0.32, 0.22, 0.32, 0.5];
const PH = [0.1, 0.62, 0.35, 0.83, 0.47], PH2 = [0.7, 0.2, 0.9, 0.4, 0.05];
const TAU = Math.PI * 2;

/** Live bar height 0–1 at time t (periods 1.2, 0.8, 2.4 divide the 2.4 s loop). */
function live(i, t, level) {
  const v = 0.52 + 0.3 * Math.sin(TAU * (t / 1.2 + PH[i])) + 0.18 * Math.sin(TAU * (t / 0.8 + PH2[i])) + 0.12 * Math.sin(TAU * (t / 2.4 + PH[4 - i]));
  return clamp(v * (0.45 + 0.75 * level));
}
/** Peak hold: the max of recent heights minus a gravity fall since each. */
function peak(i, t, level) {
  let p = 0;
  for (let j = 0; j <= 14; j++) { const dt = j * 0.05; p = Math.max(p, live(i, t - dt, level) - 1.6 * dt * dt); }
  return p;
}

export default defineGlyph({
  id: 'equalizer',
  title: 'Equalizer',
  category: 'audio',
  tags: ['equalizer', 'eq', 'spectrum', 'visualizer', 'bars', 'audio', 'music'],
  states: { off: 'idle', on: 'active' },
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, on ? 0.35 : 0.6);
    const t0 = s.t - s.since; // the moment the state changed
    XS.forEach((x, i) => {
      const from = on ? REST[i] : live(i, t0, s.level);
      const to = on ? live(i, s.t, s.level) : REST[i];
      const v = lerp(from, to, k);
      const top = FLOOR - lerp(MIN, MAX, v);
      g.line(x, FLOOR, x, top, { role: on ? 'accent' : 'line', weight: 1.35, cap: 'round' });
      if (on) {
        const p = lerp(REST[i], peak(i, s.t, s.level), k);
        const py = Math.min(top - 3.6, FLOOR - lerp(MIN, MAX, p) - 3.6);
        g.line(x - 1.4, py, x + 1.4, py, { role: 'line', weight: 0.75, opacity: k });
      }
    });
  },
});
