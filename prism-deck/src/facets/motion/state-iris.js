// state-iris — a camera iris: six blades sweep shut over the old state, rotating as
// they close, and open again on the new one, a ring of the key's light at the
// aperture's edge. Close in 0.3 s, open in 0.4 s: seven frames at 10 fps.

import { surface, path, n, clamp, outQuad, mix, P, url, linearGradient } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { pairLink } from '../apps/_muted.js';
import { pickGlyph, statePair, keyFace, stateLabel, stateClock } from './_d1-motion.js';

const CLOSE = 0.3, OPEN = 0.4, BLADES = 6;

export default {
  id: 'state-iris',
  title: 'Iris',
  category: 'State Transitions',
  description: 'Six iris blades sweep shut over the old state, rotating as they close, then open on the new one with a ring of light at the aperture.',
  tags: ['state', 'transition', 'iris', 'aperture', 'camera', 'shutter', 'toggle'],
  surface: 'key',
  fps: 10,
  loop: 3.2,
  states: ['on', 'off'],
  press: 'toggle',
  link: (p) => pairLink(p.glyph, ['on', 'off']),   // mic / camera / volume / broadcast keys follow the device's shared state
  params: {
    glyph: { type: 'glyph', default: 'record', label: 'Glyph' },
    labelOn: { type: 'text', default: 'Rec', label: 'Label (on)', maxLength: 14 },
    labelOff: { type: 'text', default: 'Ready', label: 'Label (off)', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 23,
  render(ctx) {
    const k = surface(ctx);
    const g = pickGlyph(ctx);
    const pair = statePair(g);
    const { from, to, since } = stateClock(ctx, { dur: CLOSE + OPEN });
    const closing = since < CLOSE;
    const st = closing ? from : to;
    keyFace(k, g, pair[st], stateLabel(ctx, st, pair[st]), { since: closing ? 9 : since - CLOSE });
    if (since >= CLOSE + OPEN) return k.svg();
    const W = k.w, H = k.h, cx = W / 2, cy = H * 0.46;
    // at R = Rmax the blade tips sit just outside the key's corners, so every frame of the close shows them moving
    const Rmax = Math.hypot(W, H) * 0.56;
    const open = closing ? 1 - clamp(since / CLOSE) : outQuad(clamp((since - CLOSE) / OPEN));
    const R = Math.max(0.5, Rmax * open);
    const rot = 18 + 42 * (1 - open);
    const V = Array.from({ length: BLADES }, (_, i) => { const a = ((rot + i * (360 / BLADES)) * Math.PI) / 180; return [cx + R * Math.sin(a), cy - R * Math.cos(a)]; });
    // the blades: everything outside the hexagonal aperture (even-odd hole)
    const C = k.colors, M = Math.max(W, H) * 2;
    const blade = P().M(-M, -M).H(W + M).V(H + M).H(-M).Z().M(...V[0]);
    for (const v of V.slice(1)) blade.L(...v);
    blade.Z();
    const id = k.id('blade');
    const b0 = k.dark ? mix(C.surface, '#000000', 0.25) : mix(C.surface2, '#000000', 0.18), b1 = k.dark ? mix(C.surface2, '#000000', 0.55) : mix(C.surface2, '#000000', 0.32);
    k.def(linearGradient(id, [[0, b0], [1, b1]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    k.add(path(blade.d, { fill: url(id), fillRule: 'evenodd' }));
    // blade seams: each aperture side carries on past its corner as the edge of one blade
    const seam = P(), L = M;
    V.forEach((v, i) => { const w = V[(i + 1) % BLADES], dx = w[0] - v[0], dy = w[1] - v[1], l = Math.hypot(dx, dy) || 1; seam.M(...v).L(w[0] + (dx / l) * L, w[1] + (dy / l) * L); });
    const hair = Math.max(1, k.m.hair);
    k.add(path(seam.d, { fill: 'none', stroke: '#000000', strokeWidth: n(hair * 1.6), strokeOpacity: k.dark ? 0.7 : 0.35 }));
    k.add(path(seam.d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(hair * 0.8), strokeOpacity: k.dark ? 0.14 : 0.5, transform: `translate(${n(hair)} ${n(hair)})` }));
    // the aperture's rim catches the key's light
    if (R > 1) {
      const rim = P().M(...V[0]);
      for (const v of V.slice(1)) rim.L(...v);
      k.add(path(rim.Z().d, { fill: 'none', stroke: k.tone(g.states[pair[st]] === 'off' ? 'active' : g.states[pair[st]]), strokeWidth: n(k.m.line), strokeOpacity: n(0.85 * Math.min(1, open * 4), 3), strokeLinejoin: 'round' }));
    }
    return k.svg();
  },
};
