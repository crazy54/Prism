// strip-refraction — the whole touch strip as one panorama (800 × 100 on Stream Deck +,
// 1200 × 100 on + XL). Each dial's value (ctx.values) swells the light above it;
// runtimes slice it into 200 × 100 segments, one per encoder.

import { surface, path, rect, linearGradient, url, n } from '../../scene/index.js';
import { lerp, clamp, smoothstep } from '../../scene/easing.js';

export default {
  id: 'strip-refraction',
  title: 'Refraction Waves',
  category: 'Strip Panoramas',
  description: 'Spectral ribbons flow across the whole touch strip; each dial swells the light above it. One labeled channel per dial, one panorama.',
  tags: ['strip', 'touch strip', 'panorama', 'eq', 'waves', 'spectrum'],
  surface: 'strip',
  segments: 'all',
  fps: 5,             // a strip is 4–6 encoder feedbacks per frame: 5 fps keeps the + under ~20 and the + XL under ~30 updates/s
  loop: 10,
  params: { labels: { type: 'text', default: 'Low,Mid,High,Air,FX,Out', label: 'Channel labels (comma separated)', maxLength: 48 } },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t } = ctx;
    k.background({ tone: 'active' });
    const seg = 200, count = Math.round(w / seg);
    const vals = Array.from({ length: count }, (_, i) => ctx.values[i] ?? 0.5);
    const env = (x) => { const f = clamp(x / seg - 0.5, 0, count - 1); const i = Math.floor(f), j = Math.min(count - 1, i + 1); return lerp(vals[i], vals[j], smoothstep(0, 1, f - i)); };
    const RIBBONS = 5, STEP = 10, mid = h * 0.58;
    for (let r = 0; r < RIBBONS; r++) {
      const color = ctx.theme.spectral(ctx.hue + 30 - r * 55);
      const k1 = 0.006 + r * 0.0017, sp = 0.6 + r * 0.22, ph = r * 1.7;
      const thick = h * (0.05 + (0.025 * (RIBBONS - r)) / RIBBONS);
      let top = '', bot = '';
      for (let x = 0; x <= w; x += STEP) {
        const a = h * (0.08 + 0.26 * env(x));
        const y = mid + Math.sin(x * k1 + t * sp + ph) * a + Math.sin(x * k1 * 2.3 - t * sp * 0.7 + ph * 2) * a * 0.3;
        const tk = thick * (0.6 + 0.4 * Math.sin(x * 0.011 + t + r));
        top += `${x ? 'L' : 'M'}${n(x)} ${n(y - tk)}`;
        bot = `L${n(x)} ${n(y + tk)}${bot}`;
      }
      const gid = k.id(`rib${r}`);
      k.def(linearGradient(gid, [[0, color, 0], [0.12, color, 0.55], [0.5, color, 0.75], [0.88, color, 0.55], [1, color, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(path(`${top}${bot}Z`, { fill: url(gid), fillOpacity: k.dark ? 0.62 : 0.5 }));
    }
    let beam = '';
    for (let x = 0; x <= w; x += STEP) { const a = h * (0.08 + 0.26 * env(x)); beam += `${x ? 'L' : 'M'}${n(x)} ${n(mid + Math.sin(x * 0.0072 + t * 0.82 + 1.7) * a * 0.9)}`; }
    const bid = k.id('beam'), beamC = k.colors.beam || '#ffffff';
    k.def(linearGradient(bid, [[0, beamC, 0], [0.5, beamC, k.dark ? 0.9 : 0.7], [1, beamC, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(path(beam, { fill: 'none', stroke: url(bid), strokeWidth: k.m.line * 0.6 }));
    const labels = String(ctx.params.labels).split(',').map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < count; i++) {
      const x = i * seg;
      if (i) {
        const did = k.id(`div${i}`);
        k.def(linearGradient(did, [[0, k.colors.ink, 0], [0.5, k.colors.ink, 0.28], [1, k.colors.ink, 0]]));
        k.add(rect({ x: x - 0.5, y: h * 0.12, width: 1, height: h * 0.76, fill: url(did) }));
      }
      k.eyebrow(labels[i] || `Ch ${i + 1}`, { x: x + k.m.safe, maxWidth: seg * 0.6 });
      k.eyebrow(String(Math.round(vals[i] * 100)).padStart(2, '0'), { x: x + seg - k.m.safe, align: 'right', color: 'ink', maxWidth: seg * 0.3 });
    }
    return k.svg();
  },
};
