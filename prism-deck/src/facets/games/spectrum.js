// game-spectrum — put the light back in order. Every key holds a color from the Spectrum, shuffled; swap
// two keys at a time (press one, then the other) until the colors run rose → violet in reading order.
// Pinned keys (a ring) never move and show the way. Each key reads its wavelength (λ), so the puzzle is
// solvable without telling colors apart — and in monochrome themes. Solve it and a beam runs through the
// sorted spectrum.
//
// State (plain JSON): { cols, rows, order: [tile per cell], pins: '1001…', sel (cell or −1), moves, solved, best,
//   level, deals, swap: [a, b] (the last swap), rng }.

import { surface, rect } from '../../scene/index.js';
import { rngSeed, rngShuffle } from '../../scene/game.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { cellsOf, ageOf, spread, beam, sweepX, burst, cellKey, HUE, beamColor, middleCell, readout, panelBase } from './_d8-kit.js';

/** Which cells stay put: easy every other key, normal the corners (and the middle on big decks), hard the two ends. */
export function pinsFor(cols, rows, level) {
  const N = cols * rows, p = Array(N).fill('0');
  if (N <= 3) { p[0] = '1'; return p.join(''); }
  if (level === 'easy') for (let i = 0; i < N; i += 2) p[i] = '1';
  else if (level === 'hard') { p[0] = '1'; if (N >= 12) p[N - 1] = '1'; }
  else if (N < 12) { p[0] = '1'; p[N - 1] = '1'; }
  else { for (const i of [0, cols - 1, N - cols, N - 1]) p[i] = '1'; p[middleCell(cols, rows)] = '1'; }
  return p.join('');
}

function deal(s, rng) {
  const N = s.cols * s.rows, free = [];
  for (let i = 0; i < N; i++) if (s.pins[i] === '0') free.push(i);
  let order, perm;
  for (let tries = 0; ; tries++) {
    [perm, rng] = rngShuffle(rng, free);
    order = Array.from({ length: N }, (_, i) => i);
    free.forEach((cell, k) => { order[cell] = perm[k]; });
    const wrong = order.filter((t, i) => t !== i).length;
    if (wrong >= Math.min(free.length, Math.max(2, Math.ceil(free.length * 0.6))) || tries > 6) break;
  }
  return { ...s, order, sel: -1, moves: 0, solved: false, swap: [], rng };
}

export default {
  id: 'game-spectrum',
  title: 'Spectrum',
  category: 'Puzzles',
  description: 'Every key holds a color from the Spectrum, shuffled; swap keys two at a time until the light runs rose to violet. Each key reads its λ, so it plays in any theme.',
  tags: ['game', 'puzzle', 'color', 'hue', 'sort', 'spectrum', 'wavelength', 'interactive'],
  surface: 'deck',
  animated: false,
  fps: 12,
  loop: 4,
  params: {
    level: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard'], label: 'Pinned keys' },
  },
  game: {
    animate: 1.3,
    init({ seed, grid, params }) {
      const base = { cols: grid.cols, rows: grid.rows, pins: pinsFor(grid.cols, grid.rows, params.level), level: params.level, best: 0, deals: 1 };
      return deal(base, rngSeed(seed));
    },
    reduce(s, ev) {
      if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell >= s.order.length) return s;
      const c = ev.cell;
      if (s.solved) return { ...deal(s, s.rng), deals: s.deals + 1 };
      if (s.pins[c] === '1') return s;
      if (s.sel < 0) return { ...s, sel: c, swap: [] };
      if (s.sel === c) return { ...s, sel: -1, swap: [] };
      const order = s.order.slice();
      [order[s.sel], order[c]] = [order[c], order[s.sel]];
      const moves = s.moves + 1, solved = order.every((t, i) => t === i);
      return { ...s, order, sel: -1, moves, solved, swap: [s.sel, c], best: solved ? (s.best ? Math.min(s.best, moves) : moves) : s.best };
    },
  },
  order: 30,
  render(ctx) {
    const d = surface(ctx);
    panelBase(d, ctx);
    const s = ctx.game, prev = ctx.gamePrev;
    const age = ageOf(ctx);
    const N = s.order.length, hues = spread(N);
    const dealt = prev && prev.deals !== s.deals;
    const won = s.solved && prev && !prev.solved;
    const mid = middleCell(s.cols, s.rows);
    for (const c of cellsOf(ctx)) {
      const i = c.k, t = s.order[i], hue = hues[t];
      const pinned = s.pins[i] === '1', selected = s.sel === i;
      let u = 1;
      if (dealt) u = clamp((age - ((c.col + c.row * 0.5) * 0.05)) / 0.4);
      else if (s.swap.includes(i) && prev && prev.order[i] !== t) u = clamp(age / 0.36);
      const tone = s.solved || selected ? 'active' : 'idle';
      cellKey(d, c, (q) => {
        q.background({ tone });
        const box = q.theme.glyphBox(q, { labeled: true });
        const lift = selected ? 1.08 : 1;
        // the swatch is the content: painted in the theme's own Spectrum (theme.spectral), not its role style,
        // so a gradient or outline theme still shows the true color; it arrives by converging chromatic copies
        const sc = box.size / 48, side = 34 * sc * lift, x0 = box.x + box.size / 2 - side / 2, y0 = box.y + box.size / 2 - side / 2, r = 7 * sc * lift;
        const e = outExpo(u), off = 5 * sc * (1 - e);
        if (u < 1) [HUE.rose, HUE.violet].forEach((h, j) => q.add(rect({ x: x0 + (j ? off : -off), y: y0, width: side, height: side, rx: r, fill: q.theme.spectral(h), fillOpacity: +((1 - e) * 0.6).toFixed(3) })));
        if (e > 0.01) q.add(rect({ x: x0, y: y0, width: side, height: side, rx: r, fill: q.theme.spectral(hue), fillOpacity: e < 0.999 ? +e.toFixed(3) : null }));
        if (pinned) q.pictogram((g) => g.circle(24, 24, 4.6, { role: 'line', weight: 0.85 }), { box, tone: 'active' });
        if (selected) q.add(rect({ x: q.m.bleed * 1.5, y: q.m.bleed * 1.5, width: q.w - q.m.bleed * 3, height: q.h - q.m.bleed * 3, rx: q.m.radius * 0.8, fill: 'none', stroke: beamColor(q), strokeWidth: Math.max(1.5, q.m.u * 1.6) }));
        if (s.solved && i === mid) q.label(`${s.moves} moves`, { color: 'ink' });
        else q.label(`λ${q.theme.lambda(hue)}`, { color: s.solved ? 'ink' : 'muted' });
        if (won) {
          const b = sweepX(age, { t0: 0.3, dur: 0.9, pos: c.col, span: s.cols, w: q.w });
          if (b.on) beam(q, b.x);
          burst(q, clamp((age - 0.55 - c.col * 0.07) / 0.65), { cy: box.y + box.size / 2, rays: 10, hues: [hue, HUE.rose, hue, HUE.violet] });
        }
      }, { hue, tone });
    }
    // the screen / strip: the light as it is now, and as it should run
    const bar = (list) => (p, F) => {
      const y = p.h * 0.42, h = Math.max(6, p.h * 0.26), w = F.w / list.length;
      list.forEach((t, j) => p.add(rect({ x: F.x0 + j * w, y, width: w + 0.4, height: h, fill: p.theme.spectral(hues[t]) })));
      if (s.sel >= 0 && list === s.order) p.add(rect({ x: F.x0 + s.sel * w, y: y - p.m.u * 2, width: w, height: h + p.m.u * 4, fill: 'none', stroke: beamColor(p), strokeWidth: Math.max(1.2, p.m.u * 0.9) }));
    };
    readout(d, ctx, [
      { title: s.solved ? 'Solved' : 'Swaps', value: s.moves, sub: s.solved ? 'press for a new spectrum' : s.sel >= 0 ? 'now press its partner' : 'press two keys to swap', hue: HUE.coral, tone: s.solved ? 'ok' : 'idle', short: 'Swaps' },
      { title: 'Best', value: s.best || '—', sub: 'fewest swaps', hue: HUE.amber, short: 'Best' },
      { title: 'Now', hue: HUE.cyan, draw: bar(s.order) },
      { title: 'Goal', meta: 'rose → violet', hue: HUE.violet, draw: bar(s.order.map((_, i) => i)) },
    ]);
    return d.svg();
  },
};
