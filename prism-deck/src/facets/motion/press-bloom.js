// press-bloom — light blooms out of the glyph: a soft flood of the key's hue spreads
// across the face with a horizontal Beam through it while the key is held, then
// draws back into the glyph on release, leaving it lit. Rides on the theme's press.

import { surface, rect, n, clamp, outExpo, outCubic, lerp, mix, url, radialGradient, linearGradient } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { pickGlyph, statePair, pressClock } from './_d1-motion.js';

const HOLD = 0.22, BACK = 0.55;

export default {
  id: 'press-bloom',
  title: 'Bloom',
  category: 'Press Feedback',
  description: 'Light blooms out of the glyph and floods the key with a Beam across it while held, then draws back into the glyph on release, leaving it lit.',
  tags: ['press', 'feedback', 'bloom', 'glow', 'light', 'beam'],
  surface: 'key',
  fps: 10,
  loop: 2.4,
  params: {
    glyph: { type: 'glyph', default: 'bulb', label: 'Glyph' },
    label: { type: 'text', default: 'Bloom', label: 'Label', maxLength: 14 },
    intensity: { type: 'number', default: 1, min: 0.3, max: 1.5, step: 0.05, label: 'Intensity' },
    ...AUTOPLAY_PARAM,
  },
  order: 13,
  render(ctx0) {
    const c = pressClock(ctx0, { hold: HOLD });
    const k = surface(c);
    const g = pickGlyph(c);
    const lit = statePair(g)[0], rest = g.defaultState;
    // b: blooms out over 0.12 s when pressed, holds, draws back in after release
    const b = c.pressed ? outExpo(clamp(c.down / 0.12)) : c.pressAge < BACK ? 1 - outCubic(clamp(c.pressAge / BACK)) : 0;
    const on = c.pressed || c.pressAge < 1.1;
    const state = on ? lit : rest;
    k.background({ tone: g.states[state] });
    const box0 = k.theme.glyphBox(k, { labeled: true });
    const gx = box0.x + box0.size / 2, gy = box0.y + box0.size / 2, S = Math.min(k.w, k.h);
    const I = c.params.intensity;
    if (b > 0.01) {
      const tint = k.tone(g.states[lit]);
      const col = k.dark ? mix(tint, '#ffffff', 0.3) : tint;
      const id = k.id('bloom');
      const r = lerp(0.28, 0.95, b) * S;
      k.def(radialGradient(id, [[0, col, clamp(0.62 * b * I)], [0.35, col, clamp(0.26 * b * I)], [1, col, 0]], { gradientUnits: 'userSpaceOnUse', cx: n(gx), cy: n(gy), r: n(r) }));
      k.add(rect({ width: k.w, height: k.h, fill: url(id) }));
    }
    const s = 1 + 0.07 * b;
    const box = { x: gx - (box0.size * s) / 2, y: gy - (box0.size * s) / 2, size: box0.size * s };
    k.glyph(g.id, { state, box, since: on ? c.down : 9 });
    if (b > 0.01) {
      // the Beam: a horizontal hairline through the glyph, reaching for the edges as the bloom grows
      const L = lerp(0.18, 1.15, b) * k.w, hh = Math.max(1, k.m.line * 0.8);
      const id = k.id('beam'), core = k.dark ? '#ffffff' : k.tone(g.states[lit]);
      k.def(linearGradient(id, [[0, core, 0], [0.5, core, clamp(0.9 * b * I)], [1, core, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(rect({ x: n(gx - L / 2), y: n(gy - hh / 2), width: n(L), height: n(hh), fill: url(id) }));
      k.add(rect({ x: n(gx - L * 0.35), y: n(gy - hh * 2.5), width: n(L * 0.7), height: n(hh * 5), fill: url(id), fillOpacity: n(0.18 * b, 3) }));
    }
    k.label(c.params.label, { color: g.states[state] === 'off' ? 'dim' : undefined });
    return k.svg();
  },
};
