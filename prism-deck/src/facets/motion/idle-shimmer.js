// idle-shimmer — every few seconds a glint crosses the key like light across glass:
// a soft band with spectral fringes on its edges, catching the glyph as it passes.
// Between glints nothing changes, so on hardware it costs nothing but the sweep.
// Pixel themes get the 8-bit "shine": two hard diagonal bars stepping across.

import { surface, polygon, linearGradient, url, n, clamp, inOutCubic, phase, mix } from '../../scene/index.js';
import { glyphId, themeBox, cellOf, litState, glyphTime } from './_d2-motion.js';

const SWEEP = 0.9;

export default {
  id: 'idle-shimmer',
  title: 'Shimmer',
  category: 'Idle Loops',
  description: 'Every few seconds a glint crosses the key like light over glass, catching the glyph on its way. Still in between, so it costs nothing.',
  tags: ['idle', 'shimmer', 'glint', 'sheen', 'shine', 'attract', 'ambient'],
  surface: 'key',
  fps: 12,
  loop: 4,
  params: {
    glyph: { type: 'glyph', default: 'play-pause', label: 'Glyph' },
    label: { type: 'text', default: 'Ready', label: 'Label', maxLength: 14 },
    lit: { type: 'bool', default: false, label: 'Key is on' },
    hue: { type: 'hue', default: 220, min: 0, max: 360, step: 1, label: 'Fringe hue' },
  },
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const gid = glyphId(ctx, ctx.params.glyph, 'play-pause');
    const g = ctx.glyphs.get(gid);
    const tone = ctx.params.lit ? 'active' : 'idle';
    const state = ctx.params.lit ? litState(g) : undefined;
    k.background({ tone });
    const box = themeBox(k, true);
    const cell = cellOf(k, box);
    k.glyph(gid, { labeled: true, state, t: glyphTime(ctx, g) });
    k.label(ctx.params.label);
    const p = phase(ctx.t, 4) * 4;
    if (ctx.reduced || p > SWEEP) return k.svg();
    const { w, h } = k;
    const q = cell ? Math.round(clamp(p / SWEEP) * 8) / 8 : inOutCubic(clamp(p / SWEEP));
    const slant = h * 0.55, bw = w * (cell ? 0.12 : 0.36);
    let x = -bw - slant + q * (w + bw * 2 + slant * 1.2);
    if (cell) x = Math.round(x / cell) * cell;
    const band = (x0, wid) => [[x0 + slant, 0], [x0 + slant + wid, 0], [x0 + wid, h], [x0, h]];
    const white = k.dark ? '#ffffff' : mix('#ffffff', ctx.tint, 0.15);
    if (cell) {
      // two hard bars, one wide one thin, a cell apart
      const b1 = Math.max(cell, Math.round(bw / cell) * cell), b2 = cell;
      k.add(polygon(band(x, b1), { fill: white, fillOpacity: k.dark ? 0.32 : 0.55 }));
      k.add(polygon(band(x + b1 + cell, b2), { fill: white, fillOpacity: k.dark ? 0.22 : 0.4 }));
      return k.svg();
    }
    const id = k.id('glint');
    const a = k.dark ? 0.42 : 0.75;
    k.def(linearGradient(id, [[0, white, 0], [0.42, white, a * 0.7], [0.5, white, a], [0.58, white, a * 0.7], [1, white, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(polygon(band(x, bw), { fill: url(id) }));
    // spectral fringes on both edges of the glint (the light splitting as it crosses)
    const f = Math.max(1, k.m.hair);
    k.add(polygon(band(x + bw * 0.16, f), { fill: ctx.theme.spectral(ctx.hue - 70), fillOpacity: 0.55 }));
    k.add(polygon(band(x + bw * 0.84 - f, f), { fill: ctx.theme.spectral(ctx.hue + 70), fillOpacity: 0.55 }));
    void n;
    return k.svg();
  },
};
