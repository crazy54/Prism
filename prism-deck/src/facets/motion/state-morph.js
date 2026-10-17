// state-morph — real geometry morphing: the glyph's strokes are resampled and
// tweened from one state's shape into the other's (the mic's voice arcs bend into its
// strike, a speaker's waves fold into the cross), painted by the theme every frame.
// The key's material crossfades underneath. Seven frames at 10 fps.

import { surface, clamp, inOutSine, smoothstep } from '../../scene/index.js';
import { AUTOPLAY_PARAM } from './_autoplay.js';
import { pairLink } from '../apps/_muted.js';
import { face, place, pickGlyph, statePair, keyFace, stateLabel, stateClock, glyphPrims, morphPen, paintPen } from './_d1-motion.js';

const DUR = 0.7;

export default {
  id: 'state-morph',
  title: 'Morph',
  category: 'State Transitions',
  description: 'The glyph’s strokes bend from one state’s shape into the other’s — real geometry tweening, painted by the theme — while the material crossfades.',
  tags: ['state', 'transition', 'morph', 'tween', 'shape', 'toggle'],
  surface: 'key',
  fps: 10,
  loop: 3.2,
  states: ['on', 'off'],
  press: 'toggle',
  link: (p) => pairLink(p.glyph, ['on', 'off']),   // mic / camera / volume / broadcast keys follow the device's shared state
  params: {
    glyph: { type: 'glyph', default: 'volume', label: 'Glyph' },
    labelOn: { type: 'text', default: 'Volume', label: 'Label (on)', maxLength: 14 },
    labelOff: { type: 'text', default: 'Muted', label: 'Label (off)', maxLength: 14 },
    ...AUTOPLAY_PARAM,
  },
  order: 21,
  render(ctx) {
    const k = surface(ctx);
    const g = pickGlyph(ctx);
    const pair = statePair(g);
    const { from, to, since } = stateClock(ctx, { dur: DUR });
    const p = inOutSine(clamp(since / DUR));
    // settled: the glyph itself (its own state motion has already played out under the morph)
    if (p >= 0.999) { keyFace(k, g, pair[to], stateLabel(ctx, to, pair[to]), { since: 9 }); return k.svg(); }
    const sa = pair[from], sb = pair[to], ta = g.states[sa], tb = g.states[sb];
    // material: the new state's under the old one, which fades away
    k.background({ tone: tb });
    const old = face(k, (f) => f.background({ tone: ta }), { tag: 'a' });
    place(k, old.body, { opacity: 1 - p });
    const box = k.theme.glyphBox(k, { labeled: true });
    const pen = morphPen(glyphPrims(k, g, sa, { since: 9 }), glyphPrims(k, g, sb, { since: 9 }), p);
    paintPen(k, pen, p < 0.5 ? ta : tb, box);
    k.toneName = p < 0.5 ? ta : tb;
    const la = 1 - smoothstep(0.1, 0.5, p), lb = smoothstep(0.5, 0.9, p);
    if (la > 0.01) k.label(stateLabel(ctx, from, sa), { opacity: la, color: ta === 'off' ? 'dim' : undefined });
    if (lb > 0.01) k.label(stateLabel(ctx, to, sb), { opacity: lb, color: tb === 'off' ? 'dim' : undefined });
    return k.svg();
  },
};
