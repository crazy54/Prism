// press-sink — key travel: the face drops into the bezel (smaller, lower, out of the
// light, its edge in shadow) and springs back up with a small overshoot on release.
// The face carries the press state, so luminous themes still react (neon cuts its gas,
// ember flares) — but the travel replaces the theme's own sink.

import { surface, rect, n, clamp, spring, roundRectPath, path, mix } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { face, place, about, pickGlyph, statePair, keyFace, pressClock } from './_d1-motion.js';

const HOLD = 0.2;

export default {
  id: 'press-sink',
  title: 'Key Travel',
  category: 'Press Feedback',
  description: 'The face sinks into the bezel — smaller, lower, out of the light — and springs back with a small overshoot on release. Physical, quiet, five frames.',
  tags: ['press', 'feedback', 'sink', 'travel', 'spring', 'tactile'],
  surface: 'key',
  fps: 10,
  loop: 2.4,
  params: {
    glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
    label: { type: 'text', default: 'Press', label: 'Label', maxLength: 14 },
    depth: { type: 'number', default: 1, min: 0.3, max: 1.6, step: 0.05, label: 'Travel' },
    ...AUTOPLAY_PARAM,
  },
  order: 11,
  render(ctx0) {
    const c = pressClock(ctx0, { hold: HOLD });
    // the top surface takes no press (its theme sink would double the travel) — the face does
    const k = surface({ ...c, pressed: false, pressAge: Infinity });
    const g = pickGlyph(c);
    const lit = statePair(g)[0], rest = g.defaultState;
    const deep = c.params.depth;
    // depth: 1 while held; on release a spring brings it back through a small overshoot
    const d = c.pressed ? 1 : c.pressAge < 1.2 ? 1 - spring(c.pressAge, { stiffness: 300, damping: 15 }) : 0;
    const on = c.pressed || c.pressAge < 0.9;
    const W = k.w, H = k.h, cx = W / 2, cy = H / 2;
    // the well under the key: black LCD by night, a deep shade of the key's material by day
    k.add(rect({ width: W, height: H, fill: k.dark ? '#000000' : mix(k.colors.surface2, '#000000', 0.42) }));
    const f = face(k, (fk) => {
      keyFace(fk, g, on ? lit : rest, c.params.label, { since: on ? c.down : 9 });
      // out of the light: the face darkens and its rim falls into shadow as it goes down
      const dd = clamp(d * deep);
      if (dd > 0.01) {
        fk.add(rect({ width: W, height: H, fill: '#000000', fillOpacity: n(0.16 * dd, 3) }));
        const ring = roundRectPath(fk.m.hair, fk.m.hair, W - fk.m.hair * 2, H - fk.m.hair * 2, fk.m.radius);
        fk.add(path(ring, { fill: 'none', stroke: '#000000', strokeWidth: n(fk.m.bold * 2.2), strokeOpacity: n(0.5 * dd, 3) }));
      }
      // the overshoot catches the light on the top edge
      if (d < -0.02) fk.add(rect({ x: fk.m.radius, y: 0, width: W - fk.m.radius * 2, height: n(Math.max(1, fk.m.hair)), fill: '#ffffff', fillOpacity: n(clamp(-d * 4) * 0.5, 3) }));
    }, { tag: 'face', pressed: c.pressed, pressAge: c.pressAge });
    const s = 1 - 0.075 * d * deep, dy = 0.022 * H * d * deep;
    place(k, f.body, { transform: Math.abs(d) > 0.002 ? about(cx, cy, s, s, 0, dy) : null });
    return k.svg();
  },
};
