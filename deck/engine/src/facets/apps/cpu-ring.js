// app-cpu-ring — CPU load on a spectral ring: live from ctx.data.cpu (the plugin's
// system source), simulated when no data is wired. The head turns amber and red past
// the thresholds. (Reference app for the apps engineer.)

import { surface, ring, spectrumArc, ticks, polar, circle } from '../../scene/index.js';
import { metric } from '../../scene/noise.js';
import { lerp } from '../../scene/easing.js';

export default {
  id: 'app-cpu-ring',
  title: 'CPU Ring',
  category: 'System',
  description: 'CPU load on a 270° spectral ring, live from the system source (simulated when none is wired); the head warms past your thresholds.',
  tags: ['cpu', 'system', 'monitor', 'gauge', 'ring', 'percent', 'live'],
  surface: 'key',
  data: ['cpu'],
  fps: 4,
  loop: 12,
  params: {
    label: { type: 'text', default: 'CPU', label: 'Label', maxLength: 10 },
    warn: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.05, label: 'Warn at' },
    crit: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, label: 'Critical at' },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    const v = typeof ctx.data.cpu === 'number' ? ctx.data.cpu : metric(ctx.t, ctx.seed, { lo: 0.12, hi: 0.96, speed: 0.22, jitter: 0.12 });
    const tone = v >= p.crit ? 'alert' : v >= p.warn ? 'warn' : 'idle';
    k.background({ tone });
    const m = Math.min(w, h);
    const cx = w / 2, cy = h * 0.5, r = m * 0.36, sw = k.m.ring;
    k.add(ring({ cx, cy, r, width: sw, from: -135, to: 135, value: 0, track: k.colors.line }));
    if (m >= 110) k.add(ticks({ cx, cy, r: r - sw * 0.95, len: k.m.line * 1.4, from: -135, to: 135, count: 11, major: 5, color: k.colors.dim, width: k.m.hair, opacity: 0.55 }));
    const S = ctx.colors.spectrum || { l: 0.75, c: 0.12 };
    k.add(spectrumArc({ cx, cy, r, width: sw, value: v, h0: ctx.hue + 20, h1: ctx.hue - 150, l: S.l, c: S.c + 0.01, segments: m >= 110 ? 36 : 22 }));
    const [hx, hy] = polar(cx, cy, r, lerp(-135, 135, v));
    const head = tone === 'idle' ? (k.dark ? '#ffffff' : k.colors.ink) : k.tone(tone);
    k.add(circle({ cx: hx, cy: hy, r: sw * 1.25, fill: head, fillOpacity: 0.22 }));
    k.add(circle({ cx: hx, cy: hy, r: sw * 0.42, fill: head }));
    k.value(`${Math.round(v * 100)}%`, { cy: cy - k.m.u, maxWidth: r * 1.45, color: tone === 'idle' ? 'ink' : 'tone' });
    k.label(p.label, { y: cy + r * 0.92, color: 'muted', maxWidth: r * 1.2 });
    return k.svg();
  },
};
