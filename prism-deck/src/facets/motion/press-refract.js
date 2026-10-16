// press-refract — a press refracts the key: the glyph splits into two spectral copies
// that drift apart while the key is held, and converge back into focus on release
// (Refraction's arrival curve, outExpo over half a second). Rides on the theme's press.

import { surface, n, clamp, outExpo, outCubic, mix } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { defaultText } from '../../themes/_theme.js';
import { pickGlyph, statePair, pressClock, ghost } from './_d1-motion.js';

const HOLD = 0.2, SETTLE = 0.55;

export default {
  id: 'press-refract',
  title: 'Refract',
  category: 'Press Feedback',
  description: 'The glyph splits into two spectral copies while the key is held and converges back into focus on release — the Refraction press.',
  tags: ['press', 'feedback', 'refraction', 'chromatic', 'spectrum', 'split'],
  surface: 'key',
  fps: 10,
  loop: 2.4,
  params: {
    glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
    label: { type: 'text', default: 'Refract', label: 'Label', maxLength: 14 },
    spread: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.05, label: 'Spread' },
    ...AUTOPLAY_PARAM,
  },
  order: 12,
  render(ctx0) {
    const c = pressClock(ctx0, { hold: HOLD });
    const k = surface(c);
    const g = pickGlyph(c);
    const lit = statePair(g)[0], rest = g.defaultState;
    // e: 1 while held (it opens over the first 0.1 s), converging to 0 after release
    const e = c.pressed ? outExpo(clamp(c.down / 0.1)) : c.pressAge < SETTLE ? 1 - outCubic(clamp(c.pressAge / SETTLE)) : 0;
    const on = c.pressed || c.pressAge < 1;
    const state = on ? lit : rest;
    const tone = g.states[state];
    k.background({ tone });
    const box = k.theme.glyphBox(k, { labeled: true });
    if (e > 0.01) {
      const split = box.size * 0.085 * c.params.spread * e, h = c.hue;
      const ink = (dh) => (k.dark ? c.theme.spectral(h + dh) : mix(c.theme.spectral(h + dh), '#000000', 0.08));
      const at = (dx, dy) => ({ ...box, x: box.x + dx, y: box.y + dy });
      k.add(ghost(k, g, { state, box: at(-split, -split * 0.18), color: ink(-75), opacity: 0.78 * e, since: c.down }));
      k.add(ghost(k, g, { state, box: at(split, split * 0.18), color: ink(75), opacity: 0.78 * e, since: c.down }));
    }
    k.glyph(g.id, { state, box, since: on ? c.down : 9, opacity: e > 0.01 ? n(1 - 0.25 * e, 3) : undefined });
    if (e > 0.05) {
      // the label fringes too: a hair of spectral color either side
      const off = Math.max(0.6, k.m.u * 0.9) * e * c.params.spread;
      // plain type for the fringes (no theme halos — they are a hair of color, not more lettering)
      k.add(defaultText(k, 'label', c.params.label, { x: k.w / 2 - off, color: c.theme.spectral(c.hue - 75), opacity: 0.55 * e }));
      k.add(defaultText(k, 'label', c.params.label, { x: k.w / 2 + off, color: c.theme.spectral(c.hue + 75), opacity: 0.55 * e }));
    }
    k.label(c.params.label, { color: tone === 'off' ? 'dim' : undefined });
    return k.svg();
  },
};
