// disk — a drive seen from above: platter, spindle, read arm, activity light. The platter's
// rim is the meter: used space sweeps clockwise from 12 o'clock by level. active: the arm
// seeks across the tracks and the light flickers. idle: the arm parks off the platter.
// full: the meter pins near full and breathes.
import { defineGlyph } from '../_glyph.js';
import { arrive, clamp, lerp, pulse } from '../../scene/easing.js';

const C = [24, 20.5], R = 9;         // platter
const P = [32.5, 34], L = 12;        // arm pivot + length
const LOOP = 2.4;

/** Arm angle (deg, 0 = up, clockwise) that puts the head at distance d from the spindle (on the upper side). */
function armAngle(d) {
  const dist = (a) => { const r = (a * Math.PI) / 180; return Math.hypot(P[0] + L * Math.sin(r) - C[0], P[1] - L * Math.cos(r) - C[1]); };
  const toC = (Math.atan2(C[0] - P[0], P[1] - C[1]) * 180) / Math.PI; // pointing straight at the spindle (closest)
  let lo = toC, hi = toC + 60;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dist(m) < d) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const A_IN = armAngle(4.5), A_OUT = armAngle(8), A_PARK = armAngle(11);

export default defineGlyph({
  id: 'disk',
  title: 'Disk',
  category: 'system',
  tags: ['disk', 'drive', 'storage', 'ssd', 'hdd', 'space', 'io'],
  states: { active: 'active', idle: 'idle', full: 'warn' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    g.rect(10, 8, 28, 32, { r: 4 });
    // the meter on the platter rim
    const lv = (st === 'full' ? Math.max(clamp(s.level), 0.95) : clamp(s.level)) * arrive(s.since, 0.6);
    g.circle(C[0], C[1], R, { role: 'dim', opacity: 0.6 });
    if (lv > 0.01) g.arc(C[0], C[1], R, 0, Math.min(359.9, lv * 360), { role: 'accent', opacity: st === 'full' ? 0.55 + 0.45 * pulse(s.t, 1.2) : 1 });
    g.circle(C[0], C[1], 2, { role: 'fill' });
    // the arm
    let a;
    if (st === 'active') {
      const p = s.phase(LOOP) * Math.PI * 2;
      const u = 0.5 + 0.32 * Math.sin(p) + 0.18 * Math.sin(3 * p + 0.6);
      a = lerp(A_IN, A_OUT, clamp(u));
    } else if (st === 'idle') a = lerp(A_OUT, A_PARK, arrive(s.since, 0.5));
    else a = lerp(A_IN, A_OUT, 0.5);
    const [hx, hy] = g.polar(P[0], P[1], L, a);
    g.line(P[0], P[1], hx, hy, { role: 'line', weight: 0.85 });
    g.circle(P[0], P[1], 2.2, { role: 'line', weight: 0.85 });
    g.dot(hx, hy, 1.5, { role: st === 'active' ? 'spark' : 'fill' });
    // activity light: flickers while active
    const p = s.phase(LOOP);
    const io = st === 'active' ? (Math.sin(p * Math.PI * 2 * 7) > 0.1 || Math.sin(p * Math.PI * 2 * 3 + 1) > 0.6 ? 1 : 0.25) : st === 'full' ? 1 : 0.3;
    g.dot(15.5, 35, 1.5, { role: st === 'idle' ? 'dim' : 'spark', opacity: io });
  },
});
