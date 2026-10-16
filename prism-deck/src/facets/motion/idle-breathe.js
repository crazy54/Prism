// idle-breathe — a standby key that breathes like a sleep light. The key crossfades
// between the theme's resting and lit materials on a sleep-light curve (a quick
// inhale, a long exhale), and the glyph rises and settles with it. Press to wake:
// the breath stops and the key holds lit.

import { surface, phase, arrive, clamp, n } from '../../scene/index.js';
import { glyphId, litState, restState, layer, addFaded, breath, stepped, cellOf, themeBox, glyphTime } from './_d2-motion.js';

export default {
  id: 'idle-breathe',
  title: 'Breathe',
  category: 'Idle Loops',
  description: 'A standby key that breathes like a sleep light: its glow and glyph swell and settle on a slow, uneven breath. Press to wake it.',
  tags: ['idle', 'breathe', 'standby', 'sleep', 'glow', 'calm', 'ambient'],
  surface: 'key',
  fps: 8,
  loop: 8,
  states: ['standby', 'awake'],
  tones: { standby: 'idle', awake: 'active' },
  press: 'toggle',
  params: {
    glyph: { type: 'glyph', default: 'power', label: 'Glyph' },
    label: { type: 'text', default: 'Standby', label: 'Label', maxLength: 14 },
    wakeLabel: { type: 'text', default: 'Awake', label: 'Label when awake', maxLength: 14 },
    period: { type: 'select', default: 4, options: [2, 4, 8], label: 'Breath (s)' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const g = ctx.glyphs.get(glyphId(ctx, ctx.params.glyph, 'power'));
    const awake = ctx.stateName === 'awake';
    const cell = cellOf(k, themeBox(k));
    // breath: 0 (rest) … 1 (full); pixel themes step it, the way an 8-bit LED fades
    const b = ctx.reduced ? 0.55 : stepped(breath(phase(ctx.t, Number(ctx.params.period) || 4)), cell, 5);
    // waking converges to lit; going back to standby releases into the breath
    const w = awake ? arrive(ctx.since, 0.42) : 1 - arrive(ctx.since, 0.6);
    const lit = clamp(Math.max(w, 0.08 + b * 0.8));
    k.background({ tone: 'idle' });
    addFaded(k, layer(k, 'active'), lit);
    // two glyph layers crossfade (resting → lit) so nothing pops mid-breath
    if (lit < 0.97) k.glyph(g.id, { labeled: true, state: restState(g), t: glyphTime(ctx, g), opacity: n(0.55 * (1 - lit) + 0.2, 3), since: 9 });
    if (lit > 0.03) k.glyph(g.id, { labeled: true, state: litState(g), t: glyphTime(ctx, g), opacity: n(lit, 3), since: awake ? ctx.since : 9 });
    k.label(awake ? ctx.params.wakeLabel : ctx.params.label, { color: lit > 0.45 ? 'ink' : 'muted' });
    return k.svg();
  },
};
