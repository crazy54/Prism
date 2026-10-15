// press-ripple — press feedback as dispersed light: three spectral rings race out from
// the glyph and fade, on top of the theme's own press (sink + refraction in prism).

import { surface, circle, n, clamp, outExpo, lerp } from '../../scene/index.js';
import { autoplay, AUTOPLAY_PARAM } from './_autoplay.js';

export default {
  id: 'press-ripple',
  title: 'Spectral Ripple',
  category: 'Press Feedback',
  description: 'Every press sends three rings of dispersed light racing out from the glyph, over the theme’s own press feedback.',
  tags: ['press', 'feedback', 'ripple', 'tap', 'spectrum'],
  surface: 'key',
  fps: 20,
  loop: 2.4,
  params: {
    glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
    label: { type: 'text', default: 'Press', label: 'Label', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 10,
  render(ctx0) {
    const ctx = autoplay(ctx0);
    const k = surface(ctx);
    k.background({ tone: ctx.pressed || ctx.pressAge < 0.5 ? 'active' : 'idle' });
    const { box } = k.glyph(ctx.params.glyph, { labeled: true, state: ctx.pressed || ctx.pressAge < 1 ? 'on' : undefined });
    k.label(ctx.params.label);
    // ripples: since the press began (pressAge counts from release, so add the hold back)
    const since = ctx.pressed ? 0 : ctx.pressAge + 0.14;
    const cx = box.x + box.size / 2, cy = box.y + box.size / 2, maxR = Math.hypot(k.w, k.h) * 0.55;
    for (let i = 0; i < 3; i++) {
      const p = clamp((since - i * 0.09) / 0.75);
      if (p <= 0 || p >= 1) continue;
      const r = lerp(box.size * 0.3, maxR, outExpo(p));
      k.add(circle({ cx, cy, r, fill: 'none', stroke: ctx.theme.spectral(ctx.hue + (i - 1) * 45), strokeWidth: k.m.line * (1.6 - p), strokeOpacity: n((1 - p) * 0.9, 3) }));
    }
    return k.svg();
  },
};
