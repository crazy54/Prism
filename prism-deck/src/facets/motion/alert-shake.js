// alert-shake — a nudge: the glyph jolts side to side in a short damped burst, then
// rests (the "you're muted" tap on the shoulder). The burst is a 5 Hz oscillation, so
// at the hardware's 10 frames a second every frame lands alternately left / right;
// offsets snap to whole pixels (whole cells on pixel themes). Press to quiet it.

import { surface, path, n, phase, clamp } from '../../scene/index.js';
import { glyphId, stateWithTone, themeBox, cellOf, snapTo, glyphTime } from './_d2-motion.js';
import { mutedPlate, strike } from '../apps/_muted.js';

const BURST = 0.7;

export default {
  id: 'alert-shake',
  title: 'Shake',
  category: 'Alerts & Attention',
  description: 'A nudge: the glyph jolts side to side in a short damped burst, then rests, like a tap on the shoulder. Press to quiet it.',
  tags: ['alert', 'shake', 'nudge', 'wiggle', 'muted', 'notification', 'attention'],
  surface: 'key',
  fps: 10,
  loop: 2.4,
  states: ['nudging', 'quiet'],
  tones: { nudging: 'neg', quiet: 'idle' },
  press: 'toggle',
  params: {
    glyph: { type: 'glyph', default: 'mic', label: 'Glyph' },
    label: { type: 'text', default: 'Muted', label: 'Label', maxLength: 14 },
    tone: { type: 'select', default: 'neg', options: ['neg', 'warn', 'alert', 'info', 'active'], label: 'Tone' },
    every: { type: 'select', default: 2.4, options: [1.2, 2.4, 4.8], label: 'Every (s)' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const gid = glyphId(ctx, ctx.params.glyph, 'mic');
    const g = ctx.glyphs.get(gid);
    const tone = ctx.params.tone;
    const quiet = ctx.stateName === 'quiet';
    const state = stateWithTone(g, quiet ? ['idle', 'off'] : [tone === 'alert' ? 'alert' : tone, 'neg', 'alert', 'warn']);
    k.background({ tone: quiet ? 'idle' : tone });
    const mutedMic = gid === 'mic' && !quiet && tone === 'neg';   // the "you're muted" nudge: unmissable red
    if (mutedMic) mutedPlate(k, { since: ctx.since });
    const box = themeBox(k, true);
    const cell = cellOf(k, box);
    const ts = phase(ctx.t, Number(ctx.params.every) || 2.4) * (Number(ctx.params.every) || 2.4);
    const on = !quiet && !ctx.reduced && ts < BURST;
    const A = k.w * 0.075;
    const x = on ? A * Math.exp(-ts / 0.24) * Math.cos(2 * Math.PI * 5 * ts) : 0;
    const dx = snapTo(x, cell);
    const color = k.tone(tone);
    if (on && Math.abs(dx) > 0.5) {
      // motion ticks on the side the glyph is leaving
      const side = dx > 0 ? -1 : 1;
      const gx = box.x + box.size / 2 + dx + side * box.size * 0.42;
      const cy = box.y + box.size / 2, L = box.size * 0.13, gap = box.size * 0.11;
      const sw = cell ? Math.max(1, Math.round(cell * 0.75)) : Math.max(1.25, k.m.line);
      let d = '';
      for (const j of [-1, 0, 1]) { const yy = Math.round(cy + j * gap), xx = Math.round(gx + side * (j === 0 ? L * 0.4 : 0)); d += `M${n(xx)} ${n(yy)}h${n(side * L)}`; }
      k.add(path(d, { stroke: color, strokeWidth: n(sw), strokeOpacity: n(clamp(1 - ts / BURST) * 0.9, 3), strokeLinecap: cell ? 'butt' : 'round' }));
    }
    k.glyph(gid, { box: { ...box, x: box.x + dx }, state, t: glyphTime(ctx, g) });
    if (mutedMic) strike(k, { ...box, x: box.x + dx });
    k.label(mutedMic ? String(ctx.params.label).toUpperCase() : ctx.params.label, { color: mutedMic ? 'ink' : on ? color : quiet ? 'muted' : 'ink' });
    return k.svg();
  },
};
