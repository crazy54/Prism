// state-flip — the key is a card: it turns over about its vertical axis, the face
// darkening as it goes edge-on, and shows the new state on its back. Six frames at
// 10 fps, one of them edge-on, so the turn reads on hardware.

import { surface, rect, n, clamp, inOutSine, mix } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { pairLink } from '../apps/_muted.js';
import { face, place, pickGlyph, statePair, keyFace, stateLabel, stateClock } from './_d1-motion.js';

const DUR = 0.6;

export default {
  id: 'state-flip',
  title: 'Card Flip',
  category: 'State Transitions',
  description: 'The key turns over like a card about its vertical axis, shading as it goes edge-on, and shows the new state on its back.',
  tags: ['state', 'transition', 'flip', 'card', 'turn', '3d', 'toggle'],
  surface: 'key',
  fps: 10,
  loop: 3.2,
  states: ['on', 'off'],
  press: 'toggle',
  link: (p) => pairLink(p.glyph, ['on', 'off']),   // mic / camera / volume / broadcast keys follow the device's shared state
  params: {
    glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
    labelOn: { type: 'text', default: 'On Air', label: 'Label (on)', maxLength: 14 },
    labelOff: { type: 'text', default: 'Offline', label: 'Label (off)', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 22,
  render(ctx) {
    const k = surface(ctx);
    const g = pickGlyph(ctx);
    const pair = statePair(g);
    const { from, to, since } = stateClock(ctx, { dur: DUR });
    const p = inOutSine(clamp(since / DUR));
    if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since: since - DUR }); return k.svg(); }
    const W = k.w, H = k.h, cx = W / 2, cy = H / 2;
    const a = Math.PI * p, front = p < 0.5;
    const sx = Math.max(0.001, Math.abs(Math.cos(a))), turn = Math.sin(a);
    const st = front ? from : to;
    const f = face(k, (fk) => {
      keyFace(fk, g, pair[st], stateLabel(ctx, st, pair[st]), { since: front ? 9 : 0 });
      // turning away from the light: shade, and a lit spine on the near edge
      fk.add(rect({ width: W, height: H, fill: '#000000', fillOpacity: n(0.62 * turn, 3) }));
      const sp = Math.max(1, fk.m.line);
      fk.add(rect({ x: front ? W - sp : 0, y: 0, width: sp, height: H, fill: '#ffffff', fillOpacity: n(0.4 * turn, 3) }));
    }, { tag: front ? 'a' : 'b' });
    // perspective cue: the near edge grows, the far edge shrinks (a gentle shear + lift)
    const shear = 0.09 * turn * (front ? 1 : -1), lift = 1 + 0.05 * turn;
    k.add(rect({ width: W, height: H, fill: k.dark ? '#000000' : mix(k.colors.surface2, '#000000', 0.42) }));
    place(k, f.body, { transform: `translate(${n(cx)} ${n(cy)}) matrix(${n(sx, 4)} ${n(shear * sx, 4)} 0 ${n(lift, 4)} 0 0) translate(${n(-cx)} ${n(-cy)})` });
    return k.svg();
  },
};
