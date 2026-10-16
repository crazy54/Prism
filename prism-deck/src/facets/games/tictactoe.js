// game-tictactoe — noughts and crosses on any 3 × 3 block of keys against Prism, a small deterministic
// opponent (easy: wins when it can, blocks half the time; normal: wins, blocks, takes the center and
// corners, but can be forked; hard: perfect play). You are the cool crosses, Prism the warm rings; the
// starter alternates. A win runs a beam down the line and bursts it into the Spectrum; the bottom row
// shows the score between games. Needs three rows of keys (Galleon, MK.2, XL, + XL).
//
// State (plain JSON): { b: '.........' (x / o / .), start ('x' | 'o'), win (null | 'x' | 'o' | 'draw'), line, level,
//   score: { x, o, d }, games, ai (the cell Prism took on the last press, or −1), rng }.

import { surface } from '../../scene/index.js';
import { rngSeed, rngNext, rngInt } from '../../scene/game.js';
import { clamp } from '../../scene/easing.js';
import { cellsOf, ageOf, beam, sweepX, burst, ringWave, cellKey, HUE } from './_d8-kit.js';
import { mark } from './_d8-pieces.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const YOU = HUE.azure, PRISM = HUE.coral;
const SQUARE = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];

export function winner(b) {
  for (const L of LINES) if (b[L[0]] !== '.' && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return { who: b[L[0]], line: L };
  return b.includes('.') ? null : { who: 'draw', line: null };
}
const put = (b, i, m) => b.slice(0, i) + m + b.slice(i + 1);
const free = (b) => [...b].map((v, i) => (v === '.' ? i : -1)).filter((i) => i >= 0);
const finishing = (b, m) => free(b).find((i) => winner(put(b, i, m))?.who === m);

/** Perfect play: minimax score of board b with `m` to move (o maximizes). */
function minimax(b, m, depth = 0) {
  const w = winner(b);
  if (w) return w.who === 'o' ? 10 - depth : w.who === 'x' ? depth - 10 : 0;
  const scores = free(b).map((i) => minimax(put(b, i, m), m === 'o' ? 'x' : 'o', depth + 1));
  return m === 'o' ? Math.max(...scores) : Math.min(...scores);
}

/** Prism's move. → [cell, rng] */
export function aiMove(b, level, rng) {
  const open = free(b);
  let x;
  const win = finishing(b, 'o');
  if (win !== undefined) return [win, rng];
  const block = finishing(b, 'x');
  if (level === 'hard') {
    let best = open[0], bs = -Infinity;
    for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) if (b[i] === '.') { const v = minimax(put(b, i, 'o'), 'x', 1); if (v > bs) { bs = v; best = i; } }
    return [best, rng];
  }
  [x, rng] = rngNext(rng);
  if (block !== undefined && (level === 'normal' || x < 0.5)) return [block, rng];
  [x, rng] = rngNext(rng);
  if (level === 'easy' || x < 0.2) { let k; [k, rng] = rngInt(rng, open.length); return [open[k], rng]; }
  if (b[4] === '.') return [4, rng];
  const corners = [0, 2, 6, 8].filter((i) => b[i] === '.');
  const opposite = corners.find((i) => b[8 - i] === 'x');
  if (opposite !== undefined) return [opposite, rng];
  if (corners.length) { let k; [k, rng] = rngInt(rng, corners.length); return [corners[k], rng]; }
  return [open[0], rng];
}

function settle(s, b, ai) {
  const w = winner(b);
  if (!w) return { ...s, b, ai };
  const score = { ...s.score };
  if (w.who === 'x') score.x++; else if (w.who === 'o') score.o++; else score.d++;
  return { ...s, b, ai, win: w.who, line: w.line, score };
}
function newGame(s) {
  const start = s.start === 'x' ? 'o' : 'x';
  let g = { ...s, b: '.........', start, win: null, line: null, games: s.games + 1, ai: -1 };
  if (start === 'o') { const [i, rng] = aiMove(g.b, g.level, g.rng); g = { ...g, b: put(g.b, i, 'o'), ai: i, rng }; }
  return g;
}

export default {
  id: 'game-tictactoe',
  title: 'Tic-Tac-Toe',
  category: 'Board',
  description: 'Noughts and crosses on any 3 × 3 block of keys against Prism, a small opponent with three levels. A win beams down the line; the Galleon screen keeps score.',
  tags: ['game', 'board', 'tic-tac-toe', 'noughts and crosses', 'versus', 'ai', 'interactive'],
  surface: 'span',
  span: { cols: 3, rows: 3 },
  devices: ['mk2', 'xl', 'galleon', 'plusxl'],
  animated: false,
  fps: 12,
  loop: 4,
  params: {
    level: { type: 'select', default: 'normal', options: ['easy', 'normal', 'hard'], label: 'Prism plays' },
  },
  game: {
    animate: 1.4,
    /** The scoreboard for a screen beside the board (screen-galleon-game, via the link bus). */
    readout(s) {
      const res = s.win === 'x' ? 'You win' : s.win === 'o' ? 'Prism wins' : s.win === 'draw' ? 'Draw' : 'Your move';
      const played = s.games - (s.win ? 0 : 1);
      return { title: 'Tic-Tac-Toe', cards: [
        { title: 'You', value: s.score.x, sub: 'crosses', hue: YOU, tone: s.win === 'x' ? 'ok' : 'idle' },
        { title: 'Prism', value: s.score.o, sub: 'rings · ' + s.level, hue: PRISM, tone: s.win === 'o' ? 'warn' : 'idle' },
        { title: s.win ? 'Result' : 'Game ' + s.games, value: res, role: 'value', sub: s.win ? 'press a key: next game' : 'press a free key', hue: HUE.violet, tone: s.win ? (s.win === 'x' ? 'ok' : s.win === 'o' ? 'warn' : 'idle') : 'active' },
        { title: 'Draws', value: s.score.d, sub: played + ' played', hue: HUE.citrine },
      ] };
    },
    /** Non-visual play (web runtime): what is on each square, and what just happened. */
    cell(s, k) { const c = s.b[k]; return { label: `${SQUARE[k]}, ${c === 'x' ? 'your cross' : c === 'o' ? "Prism's ring" : 'empty'}` }; },
    announce(s, prev) {
      if (prev && s.games !== prev.games) return `Game ${s.games}. ${s.ai >= 0 ? `Prism played ${SQUARE[s.ai]}. ` : ''}Your move.`;
      const out = [];
      if (s.ai >= 0 && (!prev || prev.b[s.ai] !== 'o')) out.push(`Prism played ${SQUARE[s.ai]}.`);
      if (s.win) out.push(`${s.win === 'x' ? 'You win!' : s.win === 'o' ? 'Prism wins.' : 'Draw.'} You ${s.score.x}, Prism ${s.score.o}. Press a key for the next game.`);
      else out.push('Your move.');
      return out.join(' ');
    },
    init({ seed, params }) {
      return { b: '.........', start: 'x', win: null, line: null, level: params.level, score: { x: 0, o: 0, d: 0 }, games: 1, ai: -1, rng: rngSeed(seed) };
    },
    reduce(s, ev) {
      if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell > 8) return s;
      if (s.win) return newGame(s);
      if (s.b[ev.cell] !== '.') return s;
      const b = put(s.b, ev.cell, 'x');
      if (winner(b)) return settle(s, b, -1);
      const [i, rng] = aiMove(b, s.level, s.rng);
      return settle({ ...s, rng }, put(b, i, 'o'), i);
    },
  },
  order: 10,
  render(ctx) {
    const d = surface(ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const fresh = prev && prev.games !== s.games;
    const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
    const ended = s.win && prev && !prev.win;
    const t0 = s.ai >= 0 ? 0.78 : 0.3;   // the line lights once the last mark has landed
    const L = s.line, orient = L ? (L[1] - L[0] === 1 ? 'row' : L[1] - L[0] === 3 ? 'col' : L[0] === 0 ? 'diag' : 'anti') : null;
    for (const c of cellsOf(ctx)) {
      const i = c.k, m = s.b[i];
      const inLine = L?.includes(i);
      // when each mark draws in: yours at once, Prism's a beat later (it "thinks")
      let u = 1;
      if (fresh) u = m === '.' ? 1 : clamp((age - 0.45) / 0.3);
      else if (i === evCell && m === 'x' && prev?.b[i] === '.') u = clamp(age / 0.28);
      else if (i === s.ai && prev?.b[i] === '.') u = clamp((age - 0.42) / 0.32);
      const showScore = s.win && c.row === 2;
      const lit = m !== '.' && (!s.win || inLine);
      const tone = s.win ? (inLine ? (s.win === 'x' ? 'ok' : 'warn') : 'idle') : lit ? 'active' : 'idle';
      const hue = m === 'x' ? YOU : m === 'o' ? PRISM : HUE.violet;
      cellKey(d, c, (q) => {
        q.background({ tone });
        if (m !== '.') q.pictogram((g) => mark(g, m, u), { tone: s.win && !inLine ? 'idle' : 'active', labeled: showScore, opacity: s.win && !inLine ? 0.5 : undefined });
        else if (!s.win) q.pictogram((g) => g.circle(24, 24, 2.2, { role: 'dim', fill: true, opacity: 0.55 }), { tone: 'idle' });
        if (showScore) {
          const [who, n] = c.col === 0 ? ['You', s.score.x] : c.col === 1 ? ['Draw', s.score.d] : ['Prism', s.score.o];
          q.label(`${who} ${n}`, { color: (c.col === 0 && s.win === 'x') || (c.col === 2 && s.win === 'o') || (c.col === 1 && s.win === 'draw') ? 'ink' : 'muted' });
        }
        if (ended && inLine) {
          const k = L.indexOf(i);
          const axis = orient === 'col' ? 'y' : 'x', slant = orient === 'diag' ? -0.9 : orient === 'anti' ? 0.9 : 0.12;
          const b = sweepX(age, { t0, dur: 0.6, pos: k, span: 3, w: axis === 'y' ? q.h : q.w });
          if (b.on) beam(q, b.x, { axis, slant });
          burst(q, clamp((age - t0 - 0.25 - k * 0.07) / 0.7), { rays: 12 });
        }
        if (ended && s.win === 'draw') ringWave(q, clamp((age - t0 - (c.col + c.row) * 0.06) / 0.6));
      }, { hue, tone });
    }
    return d.svg();
  },
};
