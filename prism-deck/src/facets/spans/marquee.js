// span-marquee — big type sliding across a row of keys. The text is one continuous
// line on the span canvas, so letters pass behind the bezels and come out the other
// side; each letter is its own element, so every key carries only the letters it
// shows. In "spectrum" color the letters take the color of the Spectrum laid across
// the row as they pass — white light in, every color out.

import { surface, textPath, measureText, capHeight, linearGradient, url, rect, n } from '../../scene/index.js';
import { BUDGET, frameClock, materials, middleRow, rowCells, spectrumHue, half } from './_d3-span.js';

export default {
  id: 'span-marquee',
  title: 'Marquee',
  category: 'Text & Marquee',
  description: 'Big type sliding across a row of keys: one continuous line of text that passes behind the bezels, colored by the Spectrum as it travels.',
  tags: ['marquee', 'text', 'ticker', 'scroll', 'banner', 'headline', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  fps: 10,
  loop: 12,
  params: {
    text: { type: 'text', default: 'WHITE LIGHT IN · EVERY COLOR OUT ·', maxLength: 64, label: 'Text' },
    speed: { type: 'number', default: 0.6, min: 0.2, max: 3, step: 0.05, label: 'Speed (keys per second)' },
    color: { type: 'select', default: 'spectrum', options: ['spectrum', 'ink', 'hue'], label: 'Color' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
    budget: BUDGET,
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const cells = grid.rows > 1 ? grid.cells : rowCells(grid, grid.row);
    const { t } = frameClock(ctx, { fps: 10, changing: cells.length, still: 3.2 });
    materials(k);
    const str = String(ctx.params.text || ' ').replace(/\s+/g, ' ');
    const KW = grid.key.w, KH = grid.key.h;
    const pitch = KW + grid.gapX;
    // one row: letters about half a key tall; a taller span: giant letters over every row
    const size = grid.rows > 1 ? Math.min(ctx.h * 0.86, KH * grid.rows * 0.8) : KH * 0.66;
    const weight = 700;
    const tracking = 0.01;
    const cap = capHeight(size, weight);
    const mid = grid.rows > 1 ? ctx.h / 2 : (cells[0].y + KH / 2);
    const base = half(mid + cap / 2);
    const textW = measureText(str, { size, weight, tracking });
    const period = textW + pitch * 0.9;
    const travel = (t * ctx.params.speed * pitch) % period;
    // the color of the letters
    let fill;
    if (ctx.params.color === 'spectrum') {
      const id = k.id('spec');
      const stops = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => [f, T.spectral(spectrumHue(1 - f), { dl: T.dark ? 0.03 : -0.02 })]);
      k.def(linearGradient(id, stops, { x1: 0, y1: 0, x2: ctx.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
      fill = url(id);
    } else fill = ctx.params.color === 'hue' ? T.ink(ctx.hue) : T.colors.ink;
    // a faint baseline beam under the letters (static)
    const bid = k.id('beam'), beamC = T.colors.beam || '#ffffff';
    k.def(linearGradient(bid, [[0, beamC, 0], [0.5, beamC, 1], [1, beamC, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    for (const c of cells) if (grid.rows === 1 || c.row === middleRow(grid)) k.add(rect({ x: c.x + k.m.safe, y: n(base + size * 0.12), width: c.w - k.m.safe * 2, height: k.m.hair, fill: url(bid), fillOpacity: T.dark ? 0.35 : 0.5 }));
    // the letters: one element each, only where a key can show them
    const chars = [...str];
    const xs = chars.map((ch, i) => measureText(chars.slice(0, i + 1).join(''), { size, weight, tracking }) - measureText(ch, { size, weight }));
    let x0 = ctx.w - travel;
    while (x0 > -period) x0 -= period;
    for (let start = x0; start < ctx.w + size; start += period) {
      chars.forEach((ch, i) => {
        if (ch === ' ') return;
        const x = half(start + xs[i]);
        if (x > ctx.w + 2 || x < -size * 1.2) return;
        k.add(textPath(ch, { x, y: base, size, weight, fill }));
      });
    }
    return k.svg();
  },
};
