// game-echo — the light plays a sequence across spectral pads; play it back. Each round adds one note.
// Pads are bands of keys sized to the device (the Galleon's four rows, the +'s four columns, the MK.2's
// five columns, the XL's four double columns), each with its own hue, shape and λ, so the game reads in
// monochrome themes too. The sequence plays on 4 Hz clock ticks (only while it plays); everything else
// is static between presses. Reach the goal for a perfect run; the screen / strip keeps round and best.
//
// State (plain JSON): { cols, rows, axis ('c' | 'r'), g (keys per band), pads, goal, seq: '0312…', phase
//   ('ready' | 'show' | 'input' | 'over' | 'won'), tk, i, lit, wrong, want, best, rng }.

import { surface } from '../../scene/index.js';
import { rngSeed, rngInt } from '../../scene/game.js';
import { clamp, outExpo, pulse } from '../../scene/easing.js';
import { cellsOf, ageOf, spread, beam, sweepX, burst, readout, hasReadout, statusKey, cellKey, panelBase, HUE, progressBeam, middleCell } from './_d8-kit.js';
import { PADS } from './_d8-pieces.js';

/** Pads for a grid: bands of whole rows or columns, as close to four pads as the grid allows (3–6). */
export function padLayout(cols, rows) {
  let best = null;
  for (const [axis, L] of [['c', cols], ['r', rows]]) for (let g = 1; g <= L; g++) {
    if (L % g) continue;
    const pads = L / g;
    if (pads < 3 || pads > 6) continue;
    const score = Math.abs(pads - 4) * 10 - pads + (axis === 'c' ? 0 : 0.5);
    if (!best || score < best.score) best = { axis, g, pads, score };
  }
  if (!best) return { axis: 'k', g: 1, pads: Math.max(1, Math.min(6, cols * rows)) };
  return { axis: best.axis, g: best.g, pads: best.pads };
}
export const padOf = (s, cell) => {
  const col = cell % s.cols, row = Math.floor(cell / s.cols);
  return s.axis === 'c' ? Math.floor(col / s.g) : s.axis === 'r' ? Math.floor(row / s.g) : cell % s.pads;
};
const onTicks = (s) => (s.seq.length <= 5 ? 2 : 1);   // a step is lit for 2 ticks (0.5 s), then 1 — the pace picks up
const start = (s) => { const [p, rng] = rngInt(s.rng, s.pads); return { ...s, seq: String(p), phase: 'show', tk: -2, i: 0, lit: -1, wrong: -1, want: -1, rng }; };

export default {
  id: 'game-echo',
  title: 'Echo',
  category: 'Reflex',
  description: 'The light plays a sequence across spectral pads, each with its own hue, shape and λ; play it back. Every round adds a note and the pace picks up.',
  tags: ['game', 'memory', 'sequence', 'echo', 'reflex', 'spectrum', 'interactive'],
  surface: 'deck',
  animated: false,
  fps: 12,
  loop: 4,
  params: {
    goal: { type: 'select', default: '14', options: ['8', '14', '20', '31'], label: 'Notes for a perfect run' },
  },
  game: {
    tickHz: 4,
    ticking: (s) => s.phase === 'show',
    animate: 1.4,
    init({ seed, grid, params }) {
      const L = padLayout(grid.cols, grid.rows);
      return { cols: grid.cols, rows: grid.rows, ...L, goal: +params.goal || 14, seq: '', phase: 'ready', tk: 0, i: 0, lit: -1, wrong: -1, want: -1, best: 0, rng: rngSeed(seed) };
    },
    reduce(s, ev) {
      if (ev.type === 'tick') {
        if (s.phase !== 'show') return s;
        const tk = s.tk + 1, on = onTicks(s), step = Math.floor(tk / (on + 1));
        if (tk < 0) return { ...s, tk, lit: -1 };
        if (step >= s.seq.length) return { ...s, tk, phase: 'input', i: 0, lit: -1 };
        return { ...s, tk, lit: tk % (on + 1) < on ? +s.seq[step] : -1 };
      }
      if (ev.type !== 'press') return s;
      const keyed = Number.isInteger(ev.cell) && ev.cell >= 0 && ev.cell < s.cols * s.rows;
      if (!keyed && !Number.isInteger(ev.dial)) return s;
      if (s.phase === 'ready' || s.phase === 'over' || s.phase === 'won') return start(s);
      if (s.phase !== 'input' || !keyed) return s;
      const p = padOf(s, ev.cell), want = +s.seq[s.i];
      if (p !== want) return { ...s, phase: 'over', wrong: p, want, best: Math.max(s.best, s.seq.length - 1) };
      const i = s.i + 1;
      if (i < s.seq.length) return { ...s, i };
      if (s.seq.length >= s.goal) return { ...s, i, phase: 'won', best: Math.max(s.best, s.seq.length) };
      const [n, rng] = rngInt(s.rng, s.pads);
      return { ...s, i: 0, seq: s.seq + n, phase: 'show', tk: -3, lit: -1, rng };
    },
  },
  order: 30,
  render(ctx) {
    const d = surface(ctx);
    panelBase(d, ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const hues = spread(s.pads);
    const evPad = ev?.type === 'press' && Number.isInteger(ev.cell) ? padOf(s, ev.cell) : -1;
    const level = (p) => {   // how lit pad p is now (0–1)
      if (s.phase === 'won') return 1;
      if (s.phase === 'show' && p === s.lit) return ev?.type === 'tick' ? outExpo(clamp(age / 0.12)) : 1;
      if (s.phase === 'show' && prev && prev.lit === p && ev?.type === 'tick') return 1 - clamp(age / 0.16);
      if (s.phase === 'over' && p === s.want) return ctx.reduced || age > 1.4 ? 0.7 : 0.25 + 0.75 * pulse(age, 0.35);
      if (p === evPad && (s.phase === 'input' || (s.phase === 'show' && prev?.phase === 'input'))) return age < 0.16 ? 1 : 1 - clamp((age - 0.16) / 0.3);
      return 0;
    };
    const quiet = !hasReadout(ctx);
    const mid = middleCell(s.cols, s.rows);
    const won = s.phase === 'won' && prev && prev.phase !== 'won';
    for (const c of cellsOf(ctx)) {
      const p = padOf(s, c.k), hue = hues[p], L = level(p), shape = PADS[p % PADS.length];
      const wrong = s.phase === 'over' && p === s.wrong;
      if (quiet && c.k === mid && (s.phase === 'ready' || s.phase === 'over' || s.phase === 'won')) {
        cellKey(d, c, (q) => statusKey(q, s.phase === 'ready' ? { title: 'Echo', value: s.best || '—', sub: 'press' } : s.phase === 'won' ? { title: 'Perfect', value: s.best, sub: 'notes', tone: 'ok' } : { title: 'Round', value: s.seq.length - 1, sub: `best ${s.best}`, tone: 'idle' }), { hue: HUE.coral, tone: s.phase === 'won' ? 'ok' : 'idle' });
        continue;
      }
      const tone = wrong ? 'neg' : L > 0.45 ? 'active' : 'idle';
      cellKey(d, c, (q) => {
        q.background({ tone });
        const big = Math.min(q.w, q.h) >= 110;
        const box = q.theme.glyphBox(q, { labeled: false });
        if (L < 0.999) q.pictogram((g) => shape(g, { fill: false }), { box, tone: 'active', opacity: s.phase === 'show' || s.phase === 'over' ? 0.45 : 0.8 });
        if (L > 0.001) q.pictogram((g) => g.group({ scale: 0.86 + 0.14 * L, opacity: L }, (h) => shape(h, { fill: true })), { box, tone: 'active' });
        if (big && ((s.axis === 'r' && c.col === 0) || (s.axis !== 'r' && c.row === 0))) q.lambda({ hue, color: L > 0.45 ? 'ink' : 'dim' });
        if (wrong) burst(q, clamp(age / 0.7), { hues: [HUE.rose, HUE.coral, HUE.amber], rays: 10 });
        if (won) {
          const b = sweepX(age, { t0: 0.05, dur: 0.9, pos: c.col, span: s.cols, w: q.w });
          if (b.on) beam(q, b.x);
          burst(q, clamp((age - 0.3 - p * 0.1) / 0.7));
        }
      }, { hue, tone });
    }
    const len = s.seq.length;
    const phaseText = { ready: 'Press any key', show: 'Watch', input: 'Your turn', over: 'Missed', won: 'Perfect' }[s.phase];
    readout(d, ctx, [
      { title: 'Round', value: s.phase === 'ready' ? '—' : s.phase === 'over' ? len - 1 : len, sub: s.phase === 'over' ? `missed note ${s.i + 1}` : s.phase === 'ready' ? 'press any key' : 'notes', hue: HUE.coral, short: 'Round', tone: s.phase === 'over' ? 'neg' : 'idle' },
      { title: 'Best', value: s.best || '—', sub: 'longest echo', hue: HUE.amber },
      {
        title: phaseText, hue: s.phase === 'input' ? HUE.jade : s.phase === 'over' ? HUE.rose : HUE.cyan, tone: s.phase === 'won' ? 'ok' : s.phase === 'input' ? 'active' : 'idle',
        draw: (p, F) => {   // the sequence: played notes lit, the rest waiting
          if (!len) return;
          const done = s.phase === 'input' ? s.i : s.phase === 'show' ? Math.max(0, Math.floor(Math.max(0, s.tk) / (onTicks(s) + 1))) : s.phase === 'over' ? s.i : len;
          if (len > 16) { progressBeam(p, { x: F.x0, y: p.h * 0.6, w: F.w, value: done / len }); return; }
          const gap = Math.min(F.w / len, p.m.u * 9), r = Math.min(gap * 0.32, p.m.u * 2.6), y = p.h * 0.6;
          const dots = (from, to) => { let dd = ''; for (let k = from; k < to; k++) { const x = F.x0 + r + k * gap; dd += `M${(x + r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x - r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x + r).toFixed(2)} ${y.toFixed(2)}Z`; } return dd; };
          if (done) p.add(`<path d="${dots(0, done)}" fill="${p.ctx.tint}"/>`);
          if (done < len) p.add(`<path d="${dots(done, len)}" fill="${p.colors.dim}" fill-opacity="0.6"/>`);
        },
      },
      { title: 'Goal', value: s.goal, sub: `${Math.min(len, s.goal)} of ${s.goal}`, bar: Math.min(1, (s.phase === 'over' ? len - 1 : len) / s.goal), hue: HUE.violet },
    ]);
    return d.svg();
  },
};
