// dial-volume — one Stream Deck + / + XL encoder segment (200 × 100). Turn to set the
// level, push to mute; the level is a spectral Beam with the live signal moving
// under it. On the Galleon 100 SD it renders into a screen widget (scaled by the app).

import { surface, rect, linearGradient, url, path, n } from '../../scene/index.js';
import { noise1 } from '../../scene/noise.js';
import { clamp } from '../../scene/easing.js';

export default {
  id: 'dial-volume',
  title: 'Volume Dial',
  category: 'Dial Segments',
  description: 'Turn to set the level, push to mute. The segment shows the value as a spectral Beam with the live signal moving beneath it.',
  tags: ['volume', 'audio', 'dial', 'encoder', 'mute', 'level', 'knob'],
  surface: 'strip',
  segments: 1,
  data: ['audio'],
  fps: 15,
  loop: 6,
  states: ['on', 'muted'],
  tones: { on: 'idle', muted: 'neg' },
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Master', label: 'Channel', maxLength: 12 },
    value: { type: 'number', default: 0.64, min: 0, max: 1, step: 0.01, label: 'Level' },
    step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per tick' },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, t, stateName } = ctx;
    const muted = stateName === 'muted';
    const s = k.m.safe;
    k.background({ tone: muted ? 'neg' : 'idle' });
    k.eyebrow(muted ? 'Muted' : ctx.params.label, { color: muted ? 'neg' : 'muted' });
    k.lambda();
    const v = ctx.value;
    const isz = h * 0.42;
    k.glyph('volume', { state: muted ? 'muted' : 'on', level: v, box: { x: s * 0.6, y: h * 0.47 - isz / 2, size: isz } });
    k.value(String(Math.round(v * 100)), { align: 'right', x: w - s, cy: h * 0.47, color: muted ? 'dim' : 'ink', maxWidth: w - isz - s * 3 });
    // the level Beam
    const bx = s, bw = w - s * 2, by = h * 0.76, bh = k.m.bold * 1.1;
    const fill = k.id('level');
    k.def(linearGradient(fill, [[0, ctx.theme.spectral(ctx.hue + 50)], [0.55, ctx.theme.spectral(ctx.hue - 40)], [1, ctx.theme.spectral(ctx.hue - 120)]], { x1: bx, y1: 0, x2: bx + bw, y2: 0, gradientUnits: 'userSpaceOnUse' }));
    k.add(rect({ x: bx, y: by, width: bw, height: bh, rx: bh / 2, fill: k.colors.line }));
    if (v > 0.005) {
      k.add(rect({ x: bx, y: by, width: Math.max(bh, bw * v), height: bh, rx: bh / 2, fill: muted ? k.colors.dim : url(fill), fillOpacity: muted ? 0.6 : 0.42 }));
      if (!muted) {
        const sig = typeof ctx.data.audio?.level === 'number' ? ctx.data.audio.level : clamp(0.35 + 0.45 * (noise1(t * 3.1, ctx.seed) * 0.7 + noise1(t * 13, ctx.seed + 5) * 0.3));
        k.add(rect({ x: bx, y: by, width: Math.max(bh, bw * v * sig), height: bh, rx: bh / 2, fill: url(fill) }));
      }
      const mx = bx + bw * v;
      k.add(rect({ x: mx - k.m.line / 2, y: by - bh * 0.6, width: k.m.line, height: bh * 2.2, rx: k.m.line / 2, fill: muted ? k.colors.dim : (k.dark ? '#ffffff' : k.colors.ink) }));
    }
    let d = '';
    for (let i = 0; i <= 10; i++) { const x = bx + (bw * i) / 10; d += `M${n(x)} ${n(by + bh + k.m.line * 1.5)}v${n(i % 5 ? k.m.line * 1.2 : k.m.line * 2.4)}`; }
    k.add(path(d, { stroke: k.colors.dim, strokeWidth: k.m.hair, strokeOpacity: 0.7 }));
    return k.svg();
  },
};
