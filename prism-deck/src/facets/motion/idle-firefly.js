// idle-firefly — two fireflies keep a key company. They drift on slow looping paths around
// the glyph, each blinking on its own rhythm with a soft halo, sometimes passing behind the
// glyph, sometimes in front. Press and they answer together: three synchronized flashes.
// A dark firefly isn't drawn, so between blinks the key is still.

import { surface } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { smoothstep, phase } from '../../scene/easing.js';
import { glyphId, restState, glyphTime, cellOf, themeBox, glow, dots, fillP } from './_d6-living.js';

const LOOP = 12, TAU = Math.PI * 2;
const flash = (q) => (q < 0.12 ? smoothstep(0, 0.12, q) : q < 0.3 ? 1 : q < 0.75 ? 1 - smoothstep(0.3, 0.75, q) : 0);

export default {
  id: 'idle-firefly',
  title: 'Fireflies',
  category: 'Idle Loops',
  description: 'Two fireflies drift around the glyph on slow looping paths, blinking on their own rhythms, passing behind and in front; press and they flash together.',
  tags: ['idle', 'fireflies', 'glow', 'night', 'blink', 'press', 'calm', 'ambient', 'loop'],
  surface: 'key',
  fps: 8,
  loop: LOOP,
  press: 'momentary',
  params: {
    glyph: { type: 'glyph', default: 'bulb', label: 'Glyph' },
    label: { type: 'text', default: 'Night', label: 'Label', maxLength: 14 },
    hue: { type: 'hue', default: 100, min: 0, max: 360, step: 1, label: 'Glow hue' },
  },
  order: 62,
  render(ctx) {
    const k = surface(ctx);
    const T = ctx.theme, dark = T.dark;
    k.background({ tone: 'idle' });
    const W = k.w, H = k.h, S = Math.min(W, H);
    const labeled = !!ctx.params.label;
    const box = themeBox(k, labeled), cell = cellOf(k, box);
    const t = ctx.reduced ? 2.1 : phase(ctx.t, LOOP) * LOOP;
    const a = (t / LOOP) * TAU;
    const glowC = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : -0.02 });
    const hot = mix(glowC, dark ? '#fffbe6' : '#ffffff', dark ? 0.55 : 0.2);
    const age = ctx.pressed ? 0 : ctx.pressAge;
    const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'bulb'));
    const gcx = box.x + box.size / 2, gcy = box.y + box.size / 2;
    const flies = [0, 1].map((i) => {
      // a lazy figure-eight around the glyph; z (sin) decides behind / in front
      const ph = i * Math.PI + 0.6;
      const x = gcx + Math.sin(a * (1 + i) + ph) * box.size * 0.62;
      const y = gcy + Math.sin(a * 2 + ph * 1.3) * box.size * 0.38 - box.size * 0.05;
      const z = Math.cos(a * (1 + i) + ph);
      const m = i ? 4 : 3;                                       // blinks per loop
      const q = ((t / LOOP) * m + i * 0.37) % 1, dur = 1.6 / (LOOP / m);
      let b = q < dur ? flash(q / dur) : 0;
      if (age < 4) { const lag = age - i * 0.08; b = lag > 0 && lag < 3.6 ? flash((lag % 1.2) / 1.2) : 0; }
      return { i, x, y, z, b: Math.round(b * 4) / 4 };
    });
    const draw = (f) => {
      if (f.b <= 0) return;
      glow(k, f.x, f.y, S * 0.36, glowC, f.b * (dark ? 1 : 1.2), `g${f.i}`, [[0, 0.7], [0.25, 0.3], [0.6, 0.07], [1, 0]]);
      dots(k, [[f.x, f.y, Math.max(1.4, S * 0.036)]], fillP(hot, Math.min(1, 0.45 + 0.55 * f.b)), cell);
    };
    for (const f of flies) if (f.z <= 0) draw(f);
    k.glyph(g.id, { labeled, state: restState(g), t: glyphTime(ctx, g) });
    for (const f of flies) if (f.z > 0) draw(f);
    if (labeled) k.label(ctx.params.label);
    return k.svg();
  },
};
