// press-shutter — a louvered shutter: on press the slats snap shut top to bottom (a
// mechanical stagger), the state changes behind them, and on release they swing
// open to reveal it. Toggles the glyph between its lit and rest states.

import { surface, rect, n, clamp, outCubic, inQuad, mix, url, linearGradient, phase } from '../../scene/index.js';
import { AUTOPLAY_PARAM, autoplay } from './_autoplay.js';
import { pickGlyph, statePair, keyFace, stateLabel } from './_d1-motion.js';

const SLATS = 5, CLOSE = 0.12, OPEN = 0.3, STAGGER = 0.035, HOLD = 0.3; // demo hold ≥ time to shut every slat

export default {
  id: 'press-shutter',
  title: 'Shutter',
  category: 'Press Feedback',
  description: 'Louvers snap shut top to bottom on press, the state changes behind them, and they swing open on release to reveal it. Mechanical, staggered, toggling.',
  tags: ['press', 'feedback', 'shutter', 'louver', 'toggle', 'mechanical'],
  surface: 'key',
  fps: 10,
  loop: 3.2,
  states: ['on', 'off'],
  press: 'toggle',
  params: {
    glyph: { type: 'glyph', default: 'camera', label: 'Glyph' },
    labelOn: { type: 'text', default: '', label: 'Label (on)', maxLength: 14 },
    labelOff: { type: 'text', default: '', label: 'Label (off)', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 14,
  render(ctx0) {
    // demo: two presses per loop, so the toggle comes back around seamlessly
    const half = ctx0.facet.loop / 2, at = Math.max(0, phase(ctx0.facet.loop * 0.4, half) * half - HOLD - 0.1);
    const c = autoplay(ctx0, { every: half, at, hold: HOLD });
    // the shutter is the press feedback: the theme's own press (sink, flashes, sparks) would land on top of the slats
    const k = surface({ ...c, pressed: false, pressAge: Infinity });
    const g = pickGlyph(c);
    const pair = statePair(g);
    let shown = c.state, down;   // down: seconds since the press began
    if (c.autoplayed) {
      down = c.pressedFor;
      const m = Math.floor((c.t - at) / half);   // the latest demo press; state after press m
      shown = (((m + 1) % 2) + 2) % 2;
    } else down = c.pressed ? Math.min(c.since, CLOSE + STAGGER * SLATS) : c.pressAge + HOLD;
    // closure per slat: closing while held (old state behind), opening after release (new state)
    const held = c.pressed, age = c.pressAge;
    const slat = (i) => {
      if (c.reduced) return 0;
      if (held) return outCubic(clamp((down - i * STAGGER) / CLOSE));
      if (!(age < OPEN + STAGGER * SLATS)) return 0;
      return 1 - inQuad(clamp((age - i * STAGGER) / OPEN));
    };
    const closures = Array.from({ length: SLATS }, (_, i) => slat(i));
    const allShut = closures.every((v) => v > 0.98);
    // what's behind: real presses toggle the state on key-down, so until the slats are shut show the previous one
    const behind = held && !allShut ? 1 - shown : shown;
    const gs = pair[behind];
    keyFace(k, g, gs, stateLabel(c, behind, gs), { since: held ? 9 : Math.max(0, age) });
    const H = k.h, W = k.w, sh = H / SLATS, C = k.colors;
    // slats are the key's own material, a little lifted so a shut shutter still reads on a black LCD
    const top = k.dark ? mix(C.surface, '#ffffff', 0.14) : mix(C.surface, '#ffffff', 0.4), bot = k.dark ? mix(C.surface2, '#000000', 0.2) : mix(C.surface2, '#000000', 0.12);
    let gid = null;
    closures.forEach((v, i) => {
      if (v < 0.02) return;
      if (!gid) { gid = k.id('slat'); k.def(linearGradient(gid, [[0, top], [1, bot]])); }
      const hh = sh * v + (v > 0.98 ? 1 : 0), y = i * sh + (sh - hh) / 2;
      k.add(rect({ x: 0, y: n(y), width: W, height: n(hh), fill: url(gid) }));
      // lit top edge and the shadow line under each slat — fade in as the louver turns flat
      k.add(rect({ x: 0, y: n(y), width: W, height: n(Math.max(1, k.m.hair)), fill: '#ffffff', fillOpacity: n((k.dark ? 0.22 : 0.7) * v, 3) }));
      k.add(rect({ x: 0, y: n(y + hh - Math.max(1, k.m.hair)), width: W, height: n(Math.max(1, k.m.hair)), fill: '#000000', fillOpacity: n((k.dark ? 0.6 : 0.18) * v, 3) }));
    });
    return k.svg();
  },
};
