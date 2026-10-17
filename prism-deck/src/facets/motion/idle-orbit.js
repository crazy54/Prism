// idle-orbit — a spark of light circles the glyph on a tilted orbit, passing behind
// it and in front of it, with a tail dispersed across the Spectrum. On pixel themes
// the spark is a lattice square that steps from cell to cell.

import { surface, path, circle, ellipse, n, phase, lerp } from '../../scene/index.js';
import { glyphId, themeBox, cellOf, squaresPath, glyphTime } from './_d2-motion.js';

const TAIL = 16;

export default {
  id: 'idle-orbit',
  title: 'Orbit',
  category: 'Idle Loops',
  description: 'A spark of light circles the glyph on a tilted orbit, passing behind and in front of it, trailing a tail dispersed across the Spectrum.',
  tags: ['idle', 'orbit', 'spark', 'comet', 'loop', 'ambient', 'spectrum'],
  surface: 'key',
  fps: 10,
  loop: 6,
  params: {
    glyph: { type: 'glyph', default: 'cpu', label: 'Glyph' },
    label: { type: 'text', default: 'Working', label: 'Label', maxLength: 14 },
    period: { type: 'select', default: 3, options: [2, 3, 6], label: 'One orbit (s)' },
    hue: { type: 'hue', default: 220, min: 0, max: 360, step: 1, label: 'Hue' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const gid = glyphId(ctx, ctx.params.glyph, 'cpu');
    const g = ctx.glyphs.get(gid);
    k.background({ tone: 'idle' });
    const box = themeBox(k, true);
    const cell = cellOf(k, box);
    const cx = box.x + box.size / 2, cy = box.y + box.size / 2;
    const rx = Math.min(k.w * 0.43, box.size * 0.66), ry = rx * 0.36, tilt = (-16 * Math.PI) / 180;
    const T = Number(ctx.params.period) || 3;
    const th0 = ctx.reduced ? 0.9 : phase(ctx.t, T) * Math.PI * 2;
    const at = (th) => {
      const x = rx * Math.cos(th), y = ry * Math.sin(th);
      return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt), Math.sin(th)]; // z > 0: in front
    };
    const sw = k.m.line * 1.5;
    const spectral = (i) => ctx.theme.spectral(ctx.hue + 40 - i * 9);
    // the orbit itself, faint
    const orbit = ellipse({ cx: 0, cy: 0, rx, ry, fill: 'none', stroke: k.colors.dim, strokeWidth: n(k.m.hair), strokeOpacity: 0.35, strokeDasharray: `${n(k.m.hair * 1.5)} ${n(k.m.hair * 3)}` });
    if (!cell) k.add(`<g transform="translate(${n(cx)} ${n(cy)}) rotate(-16)">${orbit}</g>`);
    const segs = { back: '', front: '' };
    const sq = { back: [], front: [] };
    for (let i = TAIL - 1; i >= 0; i--) {
      const a = at(th0 - i * 0.1), b = at(th0 - (i + 1) * 0.1);
      const side = (a[2] + b[2]) / 2 > 0 ? 'front' : 'back';
      const f = 1 - i / TAIL;
      if (cell) {
        if (i % 2 === 0) sq[side].push({ x: Math.round(a[0] / cell - 0.5) * cell, y: Math.round(a[1] / cell - 0.5) * cell, f, i });
        continue;
      }
      segs[side] += path(`M${n(b[0])} ${n(b[1])}L${n(a[0])} ${n(a[1])}`, { stroke: spectral(i), strokeWidth: n(sw * lerp(0.35, 1, f)), strokeOpacity: n(f ** 1.6 * (side === 'back' ? 0.55 : 0.9), 3), strokeLinecap: 'round' });
    }
    const head = at(th0);
    const drawHead = () => {
      if (cell) {
        const hx = Math.round(head[0] / cell - 0.5) * cell, hy = Math.round(head[1] / cell - 0.5) * cell;
        k.add(path(squaresPath([[hx, hy]], cell), { fill: k.dark ? '#ffffff' : k.colors.ink }));
        return;
      }
      k.add(circle({ cx: head[0], cy: head[1], r: sw * 2.2, fill: spectral(0), fillOpacity: 0.22 }));
      k.add(circle({ cx: head[0], cy: head[1], r: sw * 0.85, fill: k.dark ? '#ffffff' : k.colors.ink }));
    };
    const drawSquares = (list) => { for (const s of list) k.add(path(squaresPath([[s.x, s.y]], cell), { fill: spectral(s.i), fillOpacity: n(Math.max(0.25, s.f), 3) })); };
    // behind the glyph
    if (cell) drawSquares(sq.back); else k.add(segs.back);
    if (head[2] <= 0) drawHead();
    k.glyph(gid, { labeled: true, t: glyphTime(ctx, g), state: g.stateNames.includes('busy') ? 'busy' : undefined });
    // in front of it
    if (cell) drawSquares(sq.front); else k.add(segs.front);
    if (head[2] > 0) drawHead();
    k.label(ctx.params.label);
    return k.svg();
  },
};
