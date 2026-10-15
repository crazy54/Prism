// idle-heartbeat — an oscilloscope trace of a service's pulse; a loop that is alive
// without asking for attention — until the service degrades or goes down.

import { surface, path, circle, n, phase } from '../../scene/index.js';
import { noise1, hash } from '../../scene/noise.js';

const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
/** One heartbeat (P, QRS, T) over phase p ∈ [0, 1). */
const ecg = (p) => 0.1 * gauss(p, 0.14, 0.022) - 0.14 * gauss(p, 0.27, 0.008) + gauss(p, 0.3, 0.011) - 0.28 * gauss(p, 0.335, 0.01) + 0.2 * gauss(p, 0.56, 0.04);
const WORDS = { ok: 'Healthy', degraded: 'Degraded', down: 'Down' };

export default {
  id: 'idle-heartbeat',
  title: 'Heartbeat',
  category: 'Idle Loops',
  description: 'An oscilloscope pulse for a service: steady when healthy, arrhythmic when degraded, a flatline when down. Press to cycle.',
  tags: ['health', 'ecg', 'pulse', 'uptime', 'oscilloscope', 'idle', 'alert'],
  surface: 'key',
  fps: 15,
  loop: 2.2,
  states: ['ok', 'degraded', 'down'],
  tones: { ok: 'ok', degraded: 'warn', down: 'alert' },
  params: {
    label: { type: 'text', default: 'API', label: 'Service', maxLength: 12 },
    bpm: { type: 'number', default: 66, min: 30, max: 160, step: 1, label: 'Beats per minute' },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, stateName, tone } = ctx;
    k.background({ tone });
    k.eyebrow(ctx.params.label);
    k.lambda();
    const x0 = k.m.safe * 0.5, span = w - k.m.safe;
    const mid = h * 0.5, amp = h * 0.42;
    const sweep = 2.2, head = phase(t, sweep), bps = ctx.params.bpm / 60;
    const color = k.tone(tone);
    const down = stateName === 'down', degraded = stateName === 'degraded';
    const N = Math.round(span / (Math.min(w, h) >= 120 ? 2 : 1.5));
    const sample = (age) => {
      const tx = t - age * sweep;
      if (down) return (noise1(tx * 9, ctx.seed) - 0.5) * 0.05;
      if (degraded) {
        const warp = tx * bps * 0.8 + 0.35 * Math.sin(tx * 1.7) + 0.2 * noise1(tx * 0.7, ctx.seed);
        return hash(Math.floor(warp), ctx.seed + 3) < 0.18 ? (noise1(tx * 7, ctx.seed) - 0.5) * 0.04 : ecg(phase(warp, 1)) * 0.72;
      }
      return ecg(phase(tx * bps, 1));
    };
    // persistence: 5 opacity bands from oldest (faint) to newest (bright), a gap just ahead of the head
    const BANDS = [0.12, 0.24, 0.42, 0.66, 1], gap = 0.07;
    const ds = BANDS.map(() => []);
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const fx = i / N, age = (head - fx + 1) % 1;
      if (age > 1 - gap) { prev = null; continue; }
      const b = Math.min(BANDS.length - 1, Math.floor((1 - age / (1 - gap)) * BANDS.length));
      const p = [x0 + fx * span, mid - sample(age) * amp];
      if (prev && prev.b !== b) ds[b].push(prev.p);
      ds[b].push(p);
      prev = { b, p };
    }
    BANDS.forEach((op, b) => {
      if (ds[b].length < 2) return;
      let d = '', px = -1e9;
      for (const [x, y] of ds[b]) { d += `${x - px > (span / N) * 1.5 ? 'M' : 'L'}${n(x)} ${n(y)}`; px = x; }
      k.add(path(d, { fill: 'none', stroke: color, strokeWidth: k.m.line * 1.1, strokeOpacity: op, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    });
    const hx = x0 + head * span, hy = mid - sample(0) * amp;
    k.add(circle({ cx: hx, cy: hy, r: k.m.bold * 1.6, fill: color, fillOpacity: 0.18 }));
    k.add(circle({ cx: hx, cy: hy, r: k.m.line * 1.05, fill: down || !k.dark ? color : '#ffffff' }));
    k.label(WORDS[stateName] || 'Healthy', { color: ctx.since < 0.3 ? 'tone' : undefined });
    return k.svg();
  },
};
