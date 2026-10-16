// state-crossfade — the new state dissolves in over the old one while converging into
// place (it arrives from 4.5% larger, the old one recedes 2%): material, glow, glyph and
// label all cross over. Six frames at 10 fps.

import { surface, clamp, inOutSine, outCubic, smoothstep } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { pairLink } from '../apps/_muted.js';
import { face, place, about, pickGlyph, statePair, keyFace, stateLabel, stateClock } from './_d1-motion.js';

const DUR = 0.6;

export default {
  id: 'state-crossfade',
  title: 'Crossfade',
  category: 'State Transitions',
  description: 'The new state dissolves in over the old while converging into place — material, glow, glyph and label cross over in six frames.',
  tags: ['state', 'transition', 'crossfade', 'dissolve', 'toggle'],
  surface: 'key',
  fps: 10,
  loop: 3.2,
  states: ['on', 'off'],
  press: 'toggle',
  link: (p) => pairLink(p.glyph, ['on', 'off']),   // mic / camera / volume / broadcast keys follow the device's shared state
  params: {
    glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
    labelOn: { type: 'text', default: 'Live', label: 'Label (on)', maxLength: 14 },
    labelOff: { type: 'text', default: 'Muted', label: 'Label (off)', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const g = pickGlyph(ctx);
    const pair = statePair(g);
    const { from, to, since } = stateClock(ctx, { dur: DUR });
    const p = inOutSine(clamp(since / DUR));
    const cx = k.w / 2, cy = k.h / 2;
    if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since }); return k.svg(); }
    // labels hand over rather than overlap (two words on top of each other never read at 72 px)
    const la = 1 - smoothstep(0.1, 0.5, p), lb = smoothstep(0.5, 0.9, p);
    const old = face(k, (f) => keyFace(f, g, pair[from], stateLabel(ctx, from, pair[from]), { since: 9, labelOpacity: la }), { tag: 'a' });
    const nu = face(k, (f) => keyFace(f, g, pair[to], stateLabel(ctx, to, pair[to]), { since, labelOpacity: lb }), { tag: 'b' });
    const so = 1 - 0.02 * p, sn = 1 + 0.045 * (1 - outCubic(clamp(since / DUR)));
    place(k, old.body, { transform: about(cx, cy, so) });
    place(k, nu.body, { transform: about(cx, cy, sn), opacity: p });
    return k.svg();
  },
};
