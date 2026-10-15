// idle-tick — a seconds ring: 60 ticks around the key, the current second's tick
// snapping on with a small overshoot each second and the last few fading behind it.
// Between snaps the frame is identical, so the hardware sends ~3 updates a second.
// Reads ctx.clock, so on a live runtime it is the real seconds of the minute.

import { surface, path, circle, n, clamp, outBack, polar } from '../../scene/index.js';
import { pad2 } from '../../scene/text.js';
import { glyphId, cellOf, themeBox, cellRing, squaresPath, glyphTime } from './_d2-motion.js';

export default {
  id: 'idle-tick',
  title: 'Tick',
  category: 'Idle Loops',
  description: 'A seconds ring of 60 ticks: each second the hand snaps one tick on with a small overshoot, then holds still until the next. Real seconds when live.',
  tags: ['idle', 'tick', 'seconds', 'clock', 'metronome', 'ring', 'time'],
  surface: 'key',
  fps: 10,
  loop: 60,
  data: ['clock'],
  params: {
    center: { type: 'select', default: 'seconds', options: ['seconds', 'glyph'], label: 'Center' },
    glyph: { type: 'glyph', default: 'clock', label: 'Glyph (center: glyph)' },
    label: { type: 'text', default: 'Sec', label: 'Eyebrow', maxLength: 10 },
    trail: { type: 'number', default: 8, min: 0, max: 30, step: 1, label: 'Trail (ticks)' },
  },
  order: 50,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = k;
    k.background({ tone: 'idle' });
    const c = ctx.clock;
    const sec = c.s, frac = ctx.reduced ? 1 : c.ms / 1000;
    const snap = clamp(frac / 0.24);
    const pos = sec - 1 + (snap >= 1 ? 1 : outBack(snap, 2.2));
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - k.m.safe * 0.55;
    const len = Math.max(2, k.m.bold * 0.9);
    const tint = ctx.tint, dim = k.colors.dim;
    const box = themeBox(k, false);
    const cell = cellOf(k, box);
    const trail = Math.round(ctx.params.trail);
    const lit = (i) => { const age = (sec - i + 60) % 60; return age === 0 ? 1 : age <= trail ? 1 - age / (trail + 1) : 0; };
    if (cell) {
      // pixel themes: one lattice square per tick on a ring, the trail as palette steps
      const sz = Math.max(1, Math.round(cell / 2));
      const groups = new Map();
      for (let i = 0; i < 60; i++) {
        const [x, y] = polar(cx, cy, R - sz, i * 6);
        const cl = [Math.round(x - sz / 2), Math.round(y - sz / 2)];
        const v = lit(i);
        const key = v ? `${tint}|${Math.ceil(v * 4) / 4}` : `${dim}|${i % 5 ? 0.35 : 0.8}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(cl);
      }
      for (const [key, cells] of groups) { const [col, op] = key.split('|'); k.add(path(squaresPath(cells, sz), { fill: col, fillOpacity: +op < 1 ? op : null })); }
      const [hx, hy] = polar(cx, cy, R - sz, Math.round(pos) * 6);
      k.add(path(squaresPath([[Math.round(hx - sz), Math.round(hy - sz)]], sz * 2), { fill: k.dark ? '#ffffff' : k.colors.ink }));
      void cellRing;
    } else {
      let dMinor = '', dMajor = '';
      const litD = new Map();
      for (let i = 0; i < 60; i++) {
        const a = i * 6, major = i % 5 === 0;
        const [x1, y1] = polar(cx, cy, R, a), [x2, y2] = polar(cx, cy, R - len * (major ? 1.7 : 1), a);
        const seg = `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
        const v = lit(i);
        if (v) { const q = Math.ceil(v * 5) / 5; litD.set(q, (litD.get(q) || '') + seg); } else if (major) dMajor += seg; else dMinor += seg;
      }
      k.add(path(dMinor, { stroke: dim, strokeWidth: n(k.m.hair), strokeOpacity: 0.55, strokeLinecap: 'round' }));
      k.add(path(dMajor, { stroke: dim, strokeWidth: n(k.m.line), strokeLinecap: 'round' }));
      for (const [q, d] of litD) k.add(path(d, { stroke: tint, strokeWidth: n(k.m.line * 1.1), strokeOpacity: n(q, 2), strokeLinecap: 'round' }));
      // the hand: a bright tick and a spark that overshoots onto the new second
      const a = pos * 6;
      const [x1, y1] = polar(cx, cy, R + k.m.hair, a), [x2, y2] = polar(cx, cy, R - len * 2.1, a);
      k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: tint, strokeWidth: n(k.m.bold * 1.6), strokeOpacity: 0.22, strokeLinecap: 'round' }));
      k.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: k.dark ? '#ffffff' : k.colors.ink, strokeWidth: n(k.m.line * 1.3), strokeLinecap: 'round' }));
      k.add(circle({ cx: x2, cy: y2, r: n(k.m.line * 0.9), fill: tint }));
    }
    if (ctx.params.center === 'glyph') {
      const gid = glyphId(ctx, ctx.params.glyph, 'clock');
      k.glyph(gid, { size: Math.min(w, h) * 0.46, t: glyphTime(ctx, ctx.glyphs.get(gid)), params: { ...ctx.params, h: c.h, m: c.m, s: c.s } });
    } else {
      k.value(pad2(sec), { cy: cy + h * 0.02, maxWidth: R * 1.3 });
      k.eyebrow(ctx.params.label, { align: 'center', x: cx, y: cy - h * 0.15, maxWidth: R * 1.2 });
    }
    return k.svg();
  },
};
