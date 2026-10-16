// app-cpu-ring — CPU load on a ring: live from ctx.data.cpu (the plugin's system source),
// simulated when no data is wired. Every color comes from the theme's roles and tones —
// track in the dim role, the value arc ramping from dim into the accent role, the head in
// the spark role — so a monochrome theme (phosphor, mono) keeps its one ink and a
// spectral theme its key hue. Past the thresholds the tone turns warn / alert.
// (Reference app for the apps engineer.)

import { surface, arc, ticks, polar, circle, mix } from '../../scene/index.js';
import { metric } from '../../scene/noise.js';
import { lerp } from '../../scene/easing.js';
import { n } from '../../scene/svg.js';

export default {
  id: 'app-cpu-ring',
  title: 'CPU Ring',
  category: 'System',
  description: 'CPU load on a 270° ring in the theme’s own inks that warms past your thresholds. Live in the plugin (system source); simulated on the web.',
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
    const lit = tone === 'idle' ? 'active' : tone;            // the theme's "on" ink, or its warn / alert tone
    const dim = k.roleStyle('dim', lit), acc = k.roleStyle('accent', lit), spark = k.roleStyle('spark', lit);
    k.add(arc({ cx, cy, r, from: -135, to: 135, color: k.colors.line, width: sw, cap: 'round' }));
    if (m >= 110) k.add(ticks({ cx, cy, r: r - sw * 0.95, len: k.m.line * 1.4, from: -135, to: 135, count: 11, major: 5, color: dim.color, width: k.m.hair, opacity: 0.55 }));
    const end = lerp(-135, 135, v);
    if (v > 0.002) {
      // glow under the arc when the role glows (phosphor, neon …)
      if (acc.glow) k.add(arc({ cx, cy, r, from: -135, to: end, color: acc.color, width: sw * (1 + 1.6 * acc.glow), opacity: n(0.16 * acc.glow, 3), cap: 'round' }));
      // SVG has no conic gradient: short butt-capped segments ramp dim → accent along the arc
      const count = Math.max(2, Math.round((m >= 110 ? 18 : 12) * v)), step = (end + 135) / count;
      const at = (i) => mix(mix(dim.color, acc.color, 0.35), acc.color, Math.min(1, (i + 0.5) / count));
      k.add(arc({ cx, cy, r, from: -135, to: -135 + step * 0.5, color: at(0), width: sw, cap: 'round' }));
      for (let i = 0; i < count; i++) k.add(arc({ cx, cy, r, from: -135 + step * i, to: -135 + step * (i + 1) + (i < count - 1 ? step * 0.08 : 0), color: at(i), width: sw, cap: 'butt' }));
    }
    const [hx, hy] = polar(cx, cy, r, end);
    k.add(circle({ cx: hx, cy: hy, r: sw * 1.25, fill: spark.color, fillOpacity: 0.22 }));
    k.add(circle({ cx: hx, cy: hy, r: sw * 0.42, fill: tone === 'idle' ? k.colors.ink : spark.color }));
    k.value(`${Math.round(v * 100)}%`, { cy: cy - k.m.u, maxWidth: r * 1.45, color: tone === 'idle' ? 'ink' : 'tone' });
    k.label(p.label, { y: cy + r * 0.92, color: 'muted', maxWidth: r * 1.2 });
    return k.svg();
  },
};
