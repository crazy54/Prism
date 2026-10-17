// dial-volume-arc — a 270° volume arc for one encoder segment (200 × 100). Turn: the
// arc and the number follow every detent (2 % a detent by default) and the dB readout
// tracks it; push (or tap the strip): mute — the light drains out of the arc and the
// panel takes the theme's negative tone; push again and it sweeps back in. The thin
// inner arc is the post-fader signal (live audio when a runtime feeds it, simulated
// otherwise), streaming at ≤ 6 fps; muted, the segment is static.

import { surface, path, arcPath, polar, n } from '../../scene/index.js';
import { clamp, lerp, arrive } from '../../scene/easing.js';
import { finish, arrival, spectralArc, tickPaths, signal, dbOf } from './_d4-dial.js';
import { mutedPlate, strike } from '../apps/_muted.js';

export default {
  id: 'dial-volume-arc',
  title: 'Volume Arc',
  category: 'Dial Segments',
  description: 'A 270° spectral arc that follows every detent, with a dB readout and the signal inside. Push or tap to mute. Output or mic; shows the level only.',
  tags: ['volume', 'arc', 'dial', 'encoder', 'mute', 'audio', 'level', 'db', 'knob'],
  surface: 'strip',
  segments: 1,
  data: ['audio'],
  fps: 6,
  loop: 6,
  states: ['on', 'muted'],
  tones: { on: 'idle', muted: 'neg' },
  press: 'toggle',
  // linked state (scene/link.js): an output dial shares the deck's volume with every volume readout; a mic dial
  // mutes with every mic key and the Galleon screen
  link: (p) => (p.controls === 'mic' ? { 'mic.muted': { on: false, muted: true } } : { 'volume.level': 'value', 'volume.muted': { on: false, muted: true } }),
  params: {
    controls: { type: 'select', default: 'output', options: ['output', 'mic'], label: 'Shows (output volume, or your mic)' },
    label: { type: 'text', default: 'Master', label: 'Channel', maxLength: 12 },
    value: { type: 'number', default: 0.64, min: 0, max: 1, step: 0.01, label: 'Level' },
    step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
    hue: { type: 'hue', default: 138.9, min: 0, max: 360, label: 'Hue' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u, s = k.m.safe;
    const muted = ctx.stateName === 'muted';
    const mic = ctx.params.controls === 'mic';
    k.background({ tone: muted ? 'neg' : 'idle' });
    if (muted && mic) mutedPlate(k, { since: ctx.since });
    const e = arrival(ctx);
    const drain = muted ? arrive(ctx.since, 0.32) : 0;            // 0 → 1 as the light leaves
    const v = ctx.value, shown = muted ? v : v * e;
    const cx = 51, cy = 51, r = 32.5, sw = 6.4;
    const FROM = -135, TO = 135;
    // tick ring: 28 detent marks, majors at 0 / 50 / 100 %
    const tk = tickPaths(cx, cy, r + 9.5, 2.4, 4.6, FROM, TO, 28, 0);
    k.add(path(tk.minor, { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.55, strokeLinecap: 'round' }));
    const mj = tickPaths(cx, cy, r + 9.5, 4.6, 4.6, FROM, TO, 3, 1);
    k.add(path(mj.major, { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1.2, k.m.hair * 1.4)), strokeLinecap: 'round' }));
    // track + value arc
    k.add(path(arcPath(cx, cy, r, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: n(sw), strokeLinecap: 'round', strokeOpacity: 0.9 }));
    if (!muted || drain < 1) k.add(spectralArc(ctx, { cx, cy, r, width: sw, from: FROM, to: TO, value: shown, spread: 110, opacity: 1 - drain }));
    if (muted && drain > 0) k.add(path(arcPath(cx, cy, r, FROM, lerp(FROM, TO, Math.max(0.004, v))), { fill: 'none', stroke: C.dim, strokeWidth: n(sw * 0.55), strokeLinecap: 'round', strokeOpacity: n(0.75 * drain, 3) }));
    // the position marker: where the knob points
    const [mx, my] = polar(cx, cy, r, lerp(FROM, TO, shown));
    k.add(`<circle cx="${n(mx)}" cy="${n(my)}" r="${n(sw * 0.62)}" fill="${muted ? C.dim : k.dark ? '#ffffff' : C.ink}"/>`);
    k.add(`<circle cx="${n(mx)}" cy="${n(my)}" r="${n(sw * 0.62)}" fill="none" stroke="${C.surface2}" stroke-width="${n(Math.max(1, k.m.hair))}" stroke-opacity="0.7"/>`);
    // post-fader signal, inside the arc
    if (!muted) {
      const lvl = clamp(signal(ctx, 'audio', { speed: 1.4, lo: 0.25, hi: 0.95 }) * shown);
      k.add(path(arcPath(cx, cy, r - 8.6, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: 2, strokeLinecap: 'round', strokeOpacity: 0.7 }));
      if (lvl > 0.01) k.add(path(arcPath(cx, cy, r - 8.6, FROM, lerp(FROM, TO, lvl)), { fill: 'none', stroke: ctx.tint, strokeWidth: 2, strokeLinecap: 'round', strokeOpacity: 0.85 }));
    }
    const gbox = { x: cx - 13, y: cy - 13, size: 26 };
    if (mic) { k.glyph('mic', { state: muted ? 'off' : 'on', level: shown, box: gbox }); if (muted) strike(k, gbox, { since: ctx.since }); }
    else k.glyph('volume', { state: muted ? 'muted' : 'on', level: shown, box: gbox });
    // readouts
    const x0 = 103;
    k.eyebrow(muted ? (mic ? 'MUTED' : 'Muted') : mic && ctx.params.label === 'Master' ? 'Mic' : ctx.params.label, { x: x0, align: 'left', color: muted ? (mic ? 'ink' : 'neg') : 'muted', maxWidth: w - x0 - s });
    k.value(String(Math.round(shown * 100)), { align: 'right', x: w - s, cy: h * 0.5, color: muted ? 'dim' : 'ink', maxWidth: w - x0 - s });
    k.caption(`${dbOf(shown)} dB`, { align: 'right', x: w - s, y: h - 16, color: muted ? 'dim' : 'muted', maxWidth: w - x0 - s });
    return finish(k);
  },
};
