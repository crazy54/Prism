// game-memory — pairs of pieces hidden across every key. Press a key and its piece refracts into view
// (two chromatic copies converge); press a second: a match stays lit and bursts into the Spectrum, a
// miss shows both for a moment and folds back. Clear the board in as few moves as you can. On the
// Galleon the screen keeps score (pairs, moves, best, the last pair) and a dial push deals a new board;
// on the + the touch strip does; an odd key out (MK.2) becomes the score key.
//
// State (plain JSON): { cols, rows, cards: '0a3…' (pair id per cell, '.' = the score key), pieces: [piece per pair],
//   hues: n, found: '0110…', open (cell or −1), miss: [a, b], missAt, hide: [a, b], moves, pairs, left, best,
//   won, deals, last (pair or −1), rng }.

import { surface, P } from '../../scene/index.js';
import { rngSeed, rngShuffle } from '../../scene/game.js';
import { clamp } from '../../scene/easing.js';
import { cellsOf, ageOf, spread, beam, sweepX, burst, converge, readout, statusKey, cellKey, panelBase, HUE, middleCell } from './_d8-kit.js';
import { PIECES } from './_d8-pieces.js';

const HOLD = 1.0;    // a missed pair stays face up this long …
const FLIP = 0.34;   // … and a reveal takes this long
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
// card back: a 3 × 3 grid of dots, one path
const BACK = [14, 24, 34].flatMap((y) => [14, 24, 34].map((x) => { const r = x === 24 && y === 24 ? 2.6 : 1.8; return P().M(x + r, y).A(r, r, 0, 0, 1, x - r, y).A(r, r, 0, 0, 1, x + r, y).Z().d; })).join('');

/** Deal a board: shuffled pairs over every cell but the score key. → { cards, pieces, pairs, rng } */
export function dealBoard(cols, rows, rng) {
  const N = cols * rows;
  const pairs = Math.max(1, Math.min(PIECES.length, Math.floor(N / 2)));
  let pieces, order;
  [pieces, rng] = rngShuffle(rng, PIECES.map((_, i) => i));
  pieces = pieces.slice(0, pairs);
  const spare = new Set();
  if (N - pairs * 2 >= 1) spare.add(middleCell(cols, rows));
  for (let i = N - 1; spare.size < N - pairs * 2; i--) if (!spare.has(i)) spare.add(i);
  const deck = [];
  for (let p = 0; p < pairs; p++) deck.push(p, p);
  [order, rng] = rngShuffle(rng, deck);
  let k = 0, cards = '';
  for (let i = 0; i < N; i++) cards += spare.has(i) ? '.' : B36[order[k++]];
  return { cards, pieces, pairs, rng };
}

const fresh = (s, d, extra = {}) => ({ ...s, cards: d.cards, pieces: d.pieces, pairs: d.pairs, left: d.pairs, found: '0'.repeat(d.cards.length), open: -1, miss: [], missAt: 0, hide: [], moves: 0, won: false, last: -1, rng: d.rng, ...extra });

export default {
  id: 'game-memory',
  title: 'Memory',
  category: 'Puzzles',
  description: 'Pairs of pieces hidden across every key: flip two at a time, they refract into view; match them all in as few moves as you can. The screen or strip keeps score.',
  tags: ['game', 'memory', 'pairs', 'concentration', 'puzzle', 'interactive'],
  surface: 'deck',
  animated: false,
  fps: 12,
  loop: 4,
  game: {
    animate: 1.45,
    init({ seed, grid }) {
      const d = dealBoard(grid.cols, grid.rows, rngSeed(seed));
      return fresh({ cols: grid.cols, rows: grid.rows, best: 0, deals: 1 }, d);
    },
    reduce(s, ev) {
      if (ev.type !== 'press') return s;
      if (Number.isInteger(ev.dial) && ev.cell === undefined) {   // a dial push deals a new board
        if (!s.moves && !s.won) return s;
        return fresh(s, dealBoard(s.cols, s.rows, s.rng), { deals: s.deals + 1 });
      }
      const c = ev.cell;
      if (!Number.isInteger(c) || c < 0 || c >= s.cards.length || s.cards[c] === '.') return s;
      if (s.won) return fresh(s, dealBoard(s.cols, s.rows, s.rng), { deals: s.deals + 1 });
      if (s.found[c] === '1' || c === s.open) return s;
      // the missed pair still showing folds back now (hide); one that already folded doesn't replay
      const hide = s.miss.length && ev.t - s.missAt < HOLD + FLIP ? s.miss.filter((x) => x !== c) : [];
      if (s.open < 0) return { ...s, open: c, miss: [], hide };
      const a = s.open, moves = s.moves + 1;
      if (s.cards[a] === s.cards[c]) {
        const f = s.found.split('');
        f[a] = '1'; f[c] = '1';
        const left = s.left - 1, won = left === 0;
        return { ...s, found: f.join(''), open: -1, miss: [], hide, moves, left, won, last: B36.indexOf(s.cards[c]), best: won ? (s.best ? Math.min(s.best, moves) : moves) : s.best };
      }
      return { ...s, open: -1, miss: [a, c], missAt: ev.t, hide, moves };
    },
  },
  order: 20,
  render(ctx) {
    const d = surface(ctx);
    panelBase(d, ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const hues = spread(s.pairs);
    const pairOf = (i) => B36.indexOf(s.cards[i]);
    const dealt = prev && prev.deals !== s.deals;
    const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
    const matched = s.last >= 0 && prev && prev.left !== s.left;
    for (const c of cellsOf(ctx)) {
      const i = c.k;
      if (s.cards[i] === '.') {   // the score key (odd key counts)
        cellKey(d, c, (q) => statusKey(q, s.won ? { title: 'Clear', value: s.moves, sub: 'moves', tone: 'ok' } : { title: 'Moves', value: s.moves, sub: `${s.left} left` }), { hue: HUE.coral, tone: s.won ? 'ok' : 'idle' });
        continue;
      }
      const p = pairOf(i), hue = hues[p], piece = PIECES[s.pieces[p]];
      const found = s.found[i] === '1', inMiss = s.miss.includes(i), inHide = s.hide.includes(i);
      // u: 0 = face down, 1 = face up
      let u;
      if (dealt) u = 1 - clamp((age - (c.col + c.row) * 0.05) / FLIP);
      else if (found) u = i === evCell ? clamp(age / FLIP) : 1;
      else if (inMiss) u = ctx.reduced ? 1 : Math.min(i === evCell ? clamp(age / FLIP) : 1, 1 - clamp((age - HOLD) / (FLIP * 0.8)));
      else if (i === s.open) u = i === evCell ? clamp(age / FLIP) : 1;
      else if (inHide) u = 1 - clamp(age / (FLIP * 0.8));
      else u = 0;
      if (dealt && u <= 0) u = 0;
      const missing = inMiss && !ctx.reduced && age > FLIP * 0.6 && age < HOLD;
      const tone = u < 0.5 ? 'idle' : missing ? 'neg' : found && !s.won ? 'idle' : 'active';
      cellKey(d, c, (q) => {
        q.background({ tone });
        if (u < 0.5) {   // the back: a faint measurement grid (nothing like any piece)
          const b = 1 - u * 2;
          q.pictogram((g) => g.group({ scale: 0.6 + 0.4 * b, opacity: b }, (h) => h.path(BACK, { role: 'dim', fill: true })), { tone: 'idle' });
        }
        if (u > 0.25) converge(q, piece, clamp((u - 0.25) / 0.75), { tone: 'active', opacity: found && !s.won ? 0.78 : 1 });
        if (matched && found && (i === evCell || i === prev.open)) burst(q, clamp((age - FLIP * 0.7) / 0.6), { hues: [hue, HUE.rose, hue, HUE.violet] , rays: 10 });
        if (s.won && !dealt && prev && !prev.won) {
          const b = sweepX(age, { t0: 0.35, dur: 0.85, pos: c.col, span: s.cols, w: q.w });
          if (b.on) beam(q, b.x);
          burst(q, clamp((age - 0.55 - c.col * 0.08) / 0.7), { rays: 12, alpha: 0.85 });
        }
      }, { hue: u < 0.5 ? HUE.coral : hue, tone });
    }
    const piece = s.last >= 0 ? PIECES[s.pieces[s.last]] : null;
    const galleon = ctx.deck?.screen?.kind === 'galleon';
    readout(d, ctx, [
      { title: 'Pairs', value: `${s.pairs - s.left}/${s.pairs}`, bar: (s.pairs - s.left) / s.pairs, hue: HUE.coral, short: 'Pairs' },
      { title: 'Moves', value: s.moves, sub: s.won ? 'cleared' : s.open >= 0 ? 'pick a match' : 'turn two keys', hue: HUE.amber, tone: s.won ? 'ok' : 'idle' },
      { title: 'Best', value: s.best || '—', sub: 'fewest moves', hue: HUE.citrine },
      piece
        ? { title: s.won ? 'Clear' : 'Last pair', hue: hues[s.last], tone: s.won ? 'ok' : 'active', sub: galleon ? 'push a dial · new deal' : undefined, draw: (p, F) => p.pictogram(piece, { box: { x: p.w - F.pad - p.h * 0.62, y: p.h * 0.2, size: p.h * 0.6 }, tone: 'active' }) }
        : { title: 'Memory', value: undefined, sub: galleon ? 'push a dial · new deal' : 'find every pair', hue: HUE.coral, draw: (p, F) => p.pictogram(PIECES[0], { box: { x: p.w - F.pad - p.h * 0.62, y: p.h * 0.2, size: p.h * 0.6 }, tone: 'idle' }) },
    ]);
    return d.svg();
  },
};
