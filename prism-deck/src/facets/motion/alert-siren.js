// alert-siren — a rotating beacon: two beams sweep around the glyph and the whole
// key flashes softly each time one faces you; or a wig-wag, left and right lamps
// alternating. Built for 10 frames a second (a beam steps 30° per frame, which reads
// as rotation, not as a strobe). Press to silence.

import { surface, path, rect, radialGradient, linearGradient, url, n, phase, clamp, polar, arrive } from '../../scene/index.js';
import { glyphId, stateWithTone, themeBox, cellOf, layer, addFaded, glyphTime } from './_d2-motion.js';

export default {
  id: 'alert-siren',
  title: 'Siren',
  category: 'Alerts & Attention',
  description: 'A rotating beacon sweeps two beams around the glyph and flashes the key softly as one faces you, or a wig-wag alternates two lamps. Press to silence.',
  tags: ['alert', 'siren', 'beacon', 'emergency', 'rotating', 'wigwag', 'attention'],
  surface: 'key',
  fps: 10,
  loop: 2.4,
  states: ['sounding', 'silenced'],
  tones: { sounding: 'alert', silenced: 'off' },
  press: 'toggle',
  params: {
    style: { type: 'select', default: 'rotate', options: ['rotate', 'wigwag'], label: 'Style' },
    glyph: { type: 'glyph', default: 'broadcast', label: 'Glyph' },
    label: { type: 'text', default: 'Alarm', label: 'Label', maxLength: 14 },
    severity: { type: 'select', default: 'alert', options: ['warn', 'alert', 'crit'], label: 'Severity' },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const sev = ['warn', 'alert', 'crit'].includes(ctx.params.severity) ? ctx.params.severity : 'alert';
    const gid = glyphId(ctx, ctx.params.glyph, 'broadcast');
    const g = ctx.glyphs.get(gid);
    const color = k.tone(sev);
    const box = themeBox(k, true);
    const cell = cellOf(k, box);
    const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
    if (ctx.stateName === 'silenced') {
      const s = arrive(ctx.since, 0.4);
      k.background({ tone: 'off' });
      addFaded(k, layer(k, sev), 1 - s);
      k.glyph(gid, { labeled: true, state: g.defaultState, t: glyphTime(ctx, g) });
      k.label('Silenced', { color: 'dim' });
      return k.svg();
    }
    k.background({ tone: sev });
    const R = Math.hypot(k.w, k.h);
    let flash = 0;
    if (ctx.params.style === 'wigwag') {
      // two lamps, hard alternation at 0.8 s per cycle
      const left = ctx.reduced || phase(ctx.t, 0.8) < 0.5;
      const id = k.id('lamp');
      const x0 = left ? 0 : k.w;
      k.def(linearGradient(id, [[0, color, k.dark ? 0.55 : 0.4], [0.55, color, k.dark ? 0.12 : 0.08], [1, color, 0]], { x1: x0, y1: 0, x2: k.w / 2 + (left ? 0.1 : -0.1) * k.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
      k.add(rect({ x: left ? 0 : k.w / 2, y: 0, width: k.w / 2, height: k.h, fill: url(id) }));
      const bar = cell ? Math.max(1, Math.round(cell)) : Math.max(1.5, k.m.line * 1.6);
      k.add(rect({ x: left ? 0 : k.w - bar, y: 0, width: bar, height: k.h, fill: color, fillOpacity: 0.9 }));
      flash = 0.35;
    } else {
      // two beams, 180° apart, 1.2 s per turn
      const a = ctx.reduced ? 160 : phase(ctx.t, 1.2) * 360;
      const id = k.id('beam');
      k.def(radialGradient(id, [[0, color, k.dark ? 0.6 : 0.45], [0.35, color, k.dark ? 0.22 : 0.16], [1, color, 0]], { cx, cy, r: R * 0.7, gradientUnits: 'userSpaceOnUse' }));
      const wedge = (ang, spread) => { const [x1, y1] = polar(cx, cy, R, ang - spread), [x2, y2] = polar(cx, cy, R, ang + spread); return `M${n(cx)} ${n(cy)}L${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}Z`; };
      k.add(path(wedge(a, 24), { fill: url(id) }));
      k.add(path(wedge(a + 180, 24), { fill: url(id), fillOpacity: 0.7 }));
      // facing you = pointing down at the viewer (180°): a soft flash, not a strobe
      const face = (x) => clamp(1 - Math.abs(((x % 360) + 360) % 360 - 180) / 40);
      flash = Math.max(face(a), face(a + 180) * 0.7);
      if (cell) flash = flash > 0.5 ? 1 : flash > 0.1 ? 0.5 : 0;
    }
    if (flash > 0.01) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.2 : 0.14) * flash, 3) }));
    k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: stateWithTone(g, [sev, 'alert', 'crit', 'warn']) });
    k.label(ctx.params.label, { color: flash > 0.5 ? color : 'ink' });
    return k.svg();
  },
};
