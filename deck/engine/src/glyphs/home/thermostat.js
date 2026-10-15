// thermostat — a round setpoint dial: a 270° track, the set arc up to `value` with its
// knob, the setpoint in the middle and a mode mark below it (never color alone).
// heat: the mark rises and light runs up the arc to the knob. cool: the mark sinks and
// light runs back down. off: flat. The arc sweeps to the setpoint as a state arrives.
// Setpoint: params.temp if given, else `value` mapped onto 10–30 °C (params.unit 'F' → °F).
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, lerp, clamp, smoothstep } from '../../scene/easing.js';
import { digits, col, row } from '../time/_digits.js';

const C = 24, R = 15, A0 = -135, A1 = 135;

export default defineGlyph({
  id: 'thermostat',
  title: 'Thermostat',
  category: 'home',
  tags: ['thermostat', 'temperature', 'heating', 'cooling', 'climate', 'hvac', 'home'],
  states: { off: 'off', heat: 'active', cool: 'info' },
  hue: 45, // heat: ember orange
  loop: 1.6,
  draw(g, s) {
    const mode = s.state;
    const k = arrive(s.since, 0.6);
    const v = clamp(s.value);
    const end = lerp(A0, lerp(A0, A1, v), mode === 'off' ? 1 : k);
    g.arc(C, C, R, A0, A1, { role: 'dim', opacity: 0.6 });
    if (end - A0 > 0.5) g.arc(C, C, R, A0, end, { role: mode === 'off' ? 'line' : 'accent' });
    // light runs along the set arc: up for heat, down for cool
    if (mode !== 'off' && end - A0 > 8) {
      const p = phase(s.t, 1.6), u = mode === 'heat' ? p : 1 - p;
      const [px, py] = g.polar(C, C, R, lerp(A0, end, u));
      g.dot(px, py, 1.5, { opacity: k * smoothstep(0, 0.15, p) * (1 - smoothstep(0.85, 1, p)) });
    }
    const [kx, ky] = g.polar(C, C, R, end);
    g.circle(kx, ky, 2.9, { role: mode === 'off' ? 'fill' : 'spark' });
    // the setpoint
    const unitF = s.params.unit === 'F';
    const c = typeof s.params.temp === 'number' ? s.params.temp : 10 + 20 * v;
    const shown = clamp(Math.round(unitF && typeof s.params.temp !== 'number' ? c * 1.8 + 32 : c), 0, 99);
    digits(g, shown, { top: 5, role: 'line' }); // instrument digits, rows 5–9: centered on the dial
    // mode mark (rows 11–12): ▲ heat · ▼ cool · – off
    const bob = mode === 'off' ? 0 : 0.9 * Math.sin(phase(s.t, 1.6) * Math.PI * 2);
    const L = col(6), M = col(7), Rx = col(8), hi = row(11), lo = row(12);
    if (mode === 'heat') g.polyline([[L, lo - bob], [M, hi - bob], [Rx, lo - bob]], { role: 'accent', weight: 0.85, join: 'round' });
    else if (mode === 'cool') g.polyline([[L, hi + bob], [M, lo + bob], [Rx, hi + bob]], { role: 'accent', weight: 0.85, join: 'round' });
    else g.line(L, row(11.5), Rx, row(11.5), { role: 'dim', weight: 0.85 });
  },
});
