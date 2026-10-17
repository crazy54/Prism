// idle-lava — a lava lamp behind the glyph. Slow wax blobs in the key's own hue rise from a
// pool at the bottom, neck, part and sink again (a real metaball surface, traced with marching
// squares), under a soft veil so the glyph in front stays crisp. The wall-sized version is
// span-lava; this is the one-key loop for a status key that should feel alive.

import { surface, linearGradient, url } from '../../scene/index.js';
import { mix, shade } from '../../scene/color.js';
import { phase } from '../../scene/easing.js';
import { glyphId, litState, glyphTime, isoPaths, fillP, rectD } from './_d6-living.js';

const LOOP = 16, TAU = Math.PI * 2;

export default {
  id: 'idle-lava',
  title: 'Lava Lamp',
  category: 'Idle Loops',
  description: "A lava lamp behind the glyph: slow wax blobs in the key's hue rise from a pool, neck, part and sink again, under a soft veil so the glyph stays crisp.",
  tags: ['idle', 'lava', 'lamp', 'blobs', 'metaballs', 'retro', 'calm', 'ambient', 'loop'],
  surface: 'key',
  fps: 6,
  loop: LOOP,
  params: {
    glyph: { type: 'glyph', default: 'music-note', label: 'Glyph' },
    label: { type: 'text', default: 'Chill', label: 'Label', maxLength: 14 },
    hue: { type: 'hue', default: 330, min: 0, max: 360, step: 1, label: 'Wax hue' },
  },
  order: 63,
  render(ctx) {
    const k = surface(ctx);
    const T = ctx.theme, dark = T.dark;
    k.background({ tone: 'idle' });
    const W = k.w, H = k.h, S = Math.min(W, H);
    const t = ctx.reduced ? 6.4 : phase(ctx.t, LOOP) * LOOP;
    const p = t / LOOP;
    const wax = T.spectral(ctx.params.hue, { dl: dark ? 0 : -0.02 });
    const deep = shade(T.spectral(ctx.params.hue - 18), dark ? -0.14 : -0.1);
    const blobs = [0, 1, 2, 3].map((i) => {
      const a = TAU * (p * (i % 2 ? 1 : 2) + i * 0.27);
      const fr = (((p * (i % 2 ? 1 : 2) + i * 0.27) % 1) + 1) % 1, tri = 1 - Math.abs(2 * fr - 1);
      return { x: W * (0.25 + 0.5 * ((i * 0.37) % 1)) + Math.sin(a * 2 + i) * S * 0.06, y: H * 1.08 - tri * H * 1.1, r2: (S * (0.085 + 0.022 * i)) ** 2 * (0.9 + 0.1 * Math.sin(a)) };
    });
    const pool = S * 0.1;
    const field = (x, y) => {
      let f = 0;
      for (const b of blobs) { const dx = x - b.x, dy = y - b.y; f += b.r2 / (dx * dx + dy * dy + 1); }
      const db = Math.max(1, H + S * 0.02 - y);
      return f + (pool * pool) / (db * db);
    };
    const step = Math.max(2.5, S / 26);
    const [body] = isoPaths(field, { x: -step, y: -step, w: W + step * 2, h: H + step * 2 }, step, [1]);
    const [core] = isoPaths((x, y) => field(x + S * 0.03, y + S * 0.04), { x: -step, y: -step, w: W + step * 2, h: H + step * 2 }, step, [2.8]);
    const wg = k.id('wax');
    k.def(linearGradient(wg, [[0, deep], [1, mix(wax, '#ffe0b0', dark ? 0.25 : 0.1)]], { x1: 0, y1: 0, x2: 0, y2: H, gradientUnits: 'userSpaceOnUse' }));
    k.add(`<path d="${body}" fill="${url(wg)}" fill-rule="evenodd" fill-opacity="${dark ? 0.85 : 0.75}"/>`);
    if (core) k.add(`<path d="${core}" ${fillP(mix(wax, '#ffffff', 0.45), dark ? 0.4 : 0.5, 'evenodd')}/>`);
    // a veil so the glyph reads in front of the wax
    k.add(`<path d="${rectD(0, 0, W, H)}" ${fillP(dark ? T.colors.bg : T.colors.surface, dark ? 0.32 : 0.38)}/>`);
    const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'music-note'));
    k.glyph(g.id, { labeled: !!ctx.params.label, state: litState(g), t: glyphTime(ctx, g) });
    if (ctx.params.label) k.label(ctx.params.label);
    return k.svg();
  },
};
