// game-merge — slide numbered tiles; equal tiles fuse and double. Reach 2048 (then keep going: past
// 2048 the tiles turn to white light). Tiles cool from violet (2) to rose (2048) across the Spectrum.
// Swipe with whatever the device has: the Galleon's left dial slides ← →, its right dial ↑ ↓ (the +'s
// four dials alternate, and its touch strip halves are arrows too); keys beside the board are arrow keys
// (MK.2, XL), and every board key pushes toward its own edge (top row up, side keys sideways …).
// The board is up to 4 × 4, centered (Galleon 3 × 4, + 4 × 2, MK.2 3 × 3, XL 4 × 4, Mini 3 × 2).
//
// State (plain JSON): { cols, rows, bx, by, bc, br, roles ('b' board · L R U D arrows · s score · h best · '.'),
//   board ('0' empty, else base-36 exponent: '1' = 2 … 'b' = 2048), score, best, moves, max, over, won, dir,
//   merged: [board cells], spawn, rng }.

import { surface } from '../../scene/index.js';
import { rngSeed, rngNext, rngInt } from '../../scene/game.js';
import { getDevice } from '../../devices.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { cellsOf, ageOf, beam, sweepX, burst, convergeText, readout, hasReadout, statusKey, cellKey, panelBase, HUE } from './_d8-kit.js';
import { arrow } from './_d8-pieces.js';

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const DIRS = ['left', 'right', 'up', 'down'];
const ARROW_OF = { L: 'left', R: 'right', U: 'up', D: 'down' };

/** Tile hue: 2 is violet, 2048 is rose (the Spectrum, short wavelength to long). */
export const tileHue = (e) => (e >= 12 ? HUE.violet : +(HUE.violet - (e - 1) * ((HUE.violet - HUE.rose) / 10)).toFixed(1));

/** Board + arrow keys + score keys for a cols × rows block. */
export function layout(cols, rows) {
  // one spare column can't hold both arrows: narrow the board so arrows sit on both sides (MK.2: 3 × 3)
  const bc = cols - Math.min(4, cols) === 1 ? 3 : Math.min(4, cols), br = Math.min(4, rows);
  const bx = Math.floor((cols - bc) / 2), by = Math.floor((rows - br) / 2);
  const roles = Array(cols * rows).fill('.');
  const at = (c, r, v) => { if (c >= 0 && c < cols && r >= 0 && r < rows && roles[r * cols + c] === '.') roles[r * cols + c] = v; };
  for (let r = 0; r < br; r++) for (let c = 0; c < bc; c++) roles[(by + r) * cols + bx + c] = 'b';
  if (rows >= 3) {   // handlebars: top keys up, bottom keys down, the middle ones sideways
    for (let r = 0; r < rows; r++) { const v = r === 0 ? 'U' : r === rows - 1 ? 'D' : null; at(bx - 1, r, v || 'L'); at(bx + bc, r, v || 'R'); }
  } else {
    for (let r = 0; r < rows; r++) { at(bx - 1, r, 'L'); at(bx + bc, r, 'R'); at(bx - 2, r, r === 0 ? 'U' : 'D'); at(bx + bc + 1, r, r === 0 ? 'U' : 'D'); }
  }
  const free = roles.map((v, i) => (v === '.' ? i : -1)).filter((i) => i >= 0);
  if (free.length) roles[free[0]] = 's';
  if (free.length > 1) roles[free.find((i) => i % cols >= cols / 2 && Math.floor(i / cols) === Math.floor(free[0] / cols)) ?? free[free.length - 1]] = 'h';
  return { bx, by, bc, br, roles: roles.join('') };
}

function lines(bc, br, dir) {
  const L = [];
  if (dir === 'left' || dir === 'right') for (let r = 0; r < br; r++) { const row = []; for (let c = 0; c < bc; c++) row.push(r * bc + c); L.push(dir === 'left' ? row : row.reverse()); }
  else for (let c = 0; c < bc; c++) { const col = []; for (let r = 0; r < br; r++) col.push(r * bc + c); L.push(dir === 'up' ? col : col.reverse()); }
  return L;
}
/** Slide a board (array of exponents) one way. → { board, gained, merged: [cells], moved } */
export function slide(b, bc, br, dir) {
  const out = b.slice(), merged = [];
  let gained = 0;
  for (const line of lines(bc, br, dir)) {
    const vals = line.map((i) => b[i]).filter((v) => v > 0), res = [];
    for (let k = 0; k < vals.length; k++) {
      if (k + 1 < vals.length && vals[k] === vals[k + 1]) { res.push(vals[k] + 1); gained += 2 ** (vals[k] + 1); merged.push(line[res.length - 1]); k++; } else res.push(vals[k]);
    }
    line.forEach((i, k) => { out[i] = res[k] || 0; });
  }
  return { board: out, gained, merged, moved: out.some((v, i) => v !== b[i]) };
}
const decode = (s) => [...s].map((ch) => B36.indexOf(ch));
const encode = (b) => b.map((v) => B36[v]).join('');
const canMove = (b, bc, br) => b.includes(0) || DIRS.some((d) => slide(b, bc, br, d).moved);

function spawn(b, rng) {
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return { b, rng, at: -1 };
  let k, x;
  [k, rng] = rngInt(rng, empty.length);
  [x, rng] = rngNext(rng);
  const out = b.slice();
  out[empty[k]] = x < 0.9 ? 1 : 2;
  return { b: out, rng, at: empty[k] };
}
function newBoard(s, rng) {
  let b = Array(s.bc * s.br).fill(0), r;
  r = spawn(b, rng); b = r.b;
  r = spawn(b, r.rng); b = r.b;
  return { ...s, board: encode(b), score: 0, moves: 0, max: Math.max(...b), over: false, won: false, dir: null, merged: [], spawn: -1, rng: r.rng };
}
function move(s, dir) {
  const b = decode(s.board), r = slide(b, s.bc, s.br, dir);
  if (!r.moved) return s;
  const sp = spawn(r.board, s.rng);
  const score = s.score + r.gained, max = Math.max(...sp.b);
  return { ...s, board: encode(sp.b), score, best: Math.max(s.best, score), moves: s.moves + 1, max, won: s.won || max >= 11, over: !canMove(sp.b, s.bc, s.br), dir, merged: r.merged, spawn: sp.at, rng: sp.rng };
}

/** The way a board key pushes: toward its own edge (ties go up / down; the center does nothing). */
export function edgeDir(x, y, bc, br) {
  const dx = x - (bc - 1) / 2, dy = y - (br - 1) / 2;
  if (!dx && !dy) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

export default {
  id: 'game-merge',
  title: 'Merge',
  category: 'Puzzles',
  description: 'Slide numbered tiles with dials, arrow keys or the board edges; equal tiles fuse and double. Reach 2048 as the tiles cool from violet to rose, then turn to light.',
  tags: ['game', 'puzzle', '2048', 'merge', 'tiles', 'numbers', 'dials', 'interactive'],
  surface: 'deck',
  animated: false,
  fps: 12,
  loop: 4,
  game: {
    animate: 0.9,
    init({ seed, grid, device }) {
      const L = layout(grid.cols, grid.rows);
      return newBoard({ cols: grid.cols, rows: grid.rows, ...L, dials: (getDevice(device).dials?.count || 0) > 0, best: 0 }, rngSeed(seed));
    },
    reduce(s, ev) {
      let dir = null;
      if (ev.type === 'press') {
        if (s.over) return Number.isInteger(ev.cell) || Number.isInteger(ev.dial) ? newBoard(s, s.rng) : s;
        const c = ev.cell;
        if (!Number.isInteger(c) || c < 0 || c >= s.roles.length) return s;
        const role = s.roles[c];
        if (ARROW_OF[role]) dir = ARROW_OF[role];
        else if (role === 'b') dir = edgeDir((c % s.cols) - s.bx, Math.floor(c / s.cols) - s.by, s.bc, s.br);
      } else if (ev.type === 'rotate' && ev.ticks && !s.over) {
        dir = ev.dial % 2 === 0 ? (ev.ticks > 0 ? 'right' : 'left') : ev.ticks > 0 ? 'down' : 'up';
      } else if (ev.type === 'touch' && !s.over) {
        const seg = Math.floor(ev.x / 200), lx = ev.x - seg * 200;
        dir = seg % 2 === 0 ? (lx < 100 ? 'left' : 'right') : lx < 100 ? 'up' : 'down';
      }
      return dir ? move(s, dir) : s;
    },
  },
  order: 15,
  render(ctx) {
    const d = surface(ctx);
    panelBase(d, ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const board = decode(s.board), before = prev && prev.bc === s.bc ? decode(prev.board) : null;
    const slid = before && s.moves === prev.moves + 1 && s.dir;
    const dealt = before && prev.moves > 0 && s.moves === 0;
    const ended = s.over && prev && !prev.over, crowned = s.won && prev && !prev.won;
    const horiz = s.dir === 'left' || s.dir === 'right', sign = s.dir === 'right' || s.dir === 'down' ? 1 : -1;
    const quiet = !hasReadout(ctx);
    for (const c of cellsOf(ctx)) {
      const role = s.roles[c.k];
      if (role === 's' || role === 'h') {
        cellKey(d, c, (q) => statusKey(q, role === 's' ? { title: s.over ? 'Final' : 'Score', value: s.score, tone: s.over ? 'ok' : 'idle' } : { title: 'Best', value: s.best }), { hue: role === 's' ? HUE.amber : HUE.citrine, tone: s.over && role === 's' ? 'ok' : 'idle' });
        continue;
      }
      if (role === '.') { cellKey(d, c, (q) => q.background({ tone: 'off' }), { hue: HUE.coral, tone: 'off' }); continue; }
      if (ARROW_OF[role]) {
        const dir = ARROW_OF[role], used = slid && s.dir === dir && age < 0.3;
        const tone = used ? 'active' : 'idle';
        cellKey(d, c, (q) => {
          q.background({ tone });
          q.pictogram((g) => arrow(g, dir), { tone, labeled: false });
          // MK.2-style decks without score keys: the up arrows carry score / best
          if (quiet && role === 'U' && c.row === 0 && !s.roles.includes('s')) q.eyebrow(c.col < s.cols / 2 ? `${s.score}` : `best ${s.best}`, { align: 'center', x: q.w / 2, color: 'muted' });
        }, { hue: HUE.coral, tone });
        continue;
      }
      // a board key
      const j = (c.row - s.by) * s.bc + (c.col - s.bx), e = board[j];
      const bxl = c.col - s.bx, byl = c.row - s.by;
      const changed = before && before[j] !== e;
      const isMerge = slid && s.merged.includes(j), isSpawn = slid && s.spawn === j;
      const tone = e ? (s.over ? 'idle' : 'active') : 'idle';
      cellKey(d, c, (q) => {
        q.background({ tone });
        if (!e) {
          q.pictogram((g) => g.circle(24, 24, 2.6, { role: 'dim', fill: true, opacity: 0.6 }), { tone: 'idle' });
          if (slid && before[j] && age < 0.17) q.text('value', String(2 ** before[j]), { cy: q.h * 0.5, color: 'dim', opacity: +(1 - clamp(age / 0.18)).toFixed(3) });
        } else {
          const label = String(2 ** e);
          let u = 1;
          if (dealt) u = clamp((age - (bxl + byl) * 0.06) / 0.4);
          else if (isSpawn) u = clamp((age - 0.18) / 0.32);
          else if (changed && slid) u = clamp(age / 0.22);
          const pop = isMerge ? 1 + 0.12 * Math.sin(clamp((age - 0.05) / 0.3) * Math.PI) : 1;
          const size = q.typeStyle('value').size * (label.length >= 4 ? 0.86 : 1) * pop;
          if (u >= 1) q.value(label, { cy: q.h * 0.5, size, color: s.over ? 'muted' : 'ink' });
          else {   // arrive along the swipe, split into the Spectrum
            const off = (1 - outExpo(u)) * q.m.u * 7 * -sign;
            convergeText(q, 'value', label, u, { cy: q.h * 0.5 + (horiz || dealt ? 0 : off), x: q.w / 2 + (horiz && !dealt ? off : 0), size });
          }
          if (e >= 12) beam(q, q.w * 0.5, { alpha: 0.5, fringe: true, glow: false });
          if (isMerge) burst(q, clamp((age - 0.08) / 0.5), { rays: 10, hues: [tileHue(e), HUE.rose, tileHue(e), HUE.violet] });
          if (crowned && e >= 11) burst(q, clamp((age - 0.25) / 0.8), { rays: 12 });
        }
        if (slid && age < 0.32) {   // the swipe: a beam crossing the board the way the tiles went
          const pos = horiz ? bxl : byl, span = horiz ? s.bc : s.br;
          const b = sweepX(age, { dur: 0.3, pos: sign > 0 ? pos : span - 1 - pos, span, w: horiz ? q.w : q.h });
          if (b.on) beam(q, sign > 0 ? b.x : (horiz ? q.w : q.h) - b.x, { axis: horiz ? 'x' : 'y', dir: sign, alpha: 0.85, slant: 0.1 });
        }
        if (ended) {
          const b = sweepX(age, { t0: 0.1, dur: 0.8, pos: bxl, span: s.bc, w: q.w });
          if (b.on) beam(q, b.x);
        }
      }, { hue: e ? tileHue(e) : HUE.coral, tone });
    }
    const galleon = ctx.deck?.screen?.kind === 'galleon';
    readout(d, ctx, [
      { title: s.over ? 'Final score' : 'Score', value: s.score, meta: '← →', sub: s.over ? 'press any key' : galleon ? 'left dial slides' : 'dial slides', hue: HUE.amber, tone: s.over ? 'ok' : 'idle', short: 'Score' },
      { title: 'Best', value: s.best, meta: '↑ ↓', sub: galleon ? 'right dial slides' : 'dial slides', hue: HUE.citrine, short: 'Best' },
      { title: 'Top tile', value: 2 ** s.max, meta: '← →', sub: s.won ? '2048 reached' : 'aim for 2048', hue: tileHue(s.max), tone: s.won ? 'active' : 'idle' },
      { title: 'Moves', value: s.moves, meta: '↑ ↓', sub: s.over ? 'no moves left' : 'edge keys push too', hue: HUE.coral, tone: s.over ? 'neg' : 'idle' },
    ]);
    return d.svg();
  },
};
