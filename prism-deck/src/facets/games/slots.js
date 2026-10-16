// game-slots — a three-reel slot machine across three keys. Press any reel to spin (one coin): the reels
// blur, slow down and stop left to right with a little bounce; three of a kind pays (three prisms are the
// jackpot), a pair on the first two reels pays three. Outcomes come from the rng carried in the state, so a
// seed replays the same spins; the reels' motion is drawn from the spin's age. Out of coins? Press to
// refill the purse.
//
// State (plain JSON): { coins, reels: [a, b, c] (symbol indices), spins, won (last payout), best, jackpots, rng }.

import { surface, P } from '../../scene/index.js';
import { rngSeed, rngNext } from '../../scene/game.js';
import { clamp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { cellsOf, ageOf, beam, sweepX, burst, ringWave, cellKey, HUE, beamColor } from './_d8-kit.js';
import { PIECES } from './_d8-pieces.js';

/** Reel symbols: piece, hue, weight (how often it lands), payout for three. */
export const SYMBOLS = [
  { piece: 0, hue: HUE.violet, weight: 1, pay: 60, name: 'prism' },
  { piece: 3, hue: HUE.citrine, weight: 2, pay: 25, name: 'star' },
  { piece: 6, hue: HUE.amber, weight: 3, pay: 15, name: 'bolt' },
  { piece: 12, hue: HUE.rose, weight: 3, pay: 12, name: 'heart' },
  { piece: 5, hue: HUE.periwinkle, weight: 4, pay: 10, name: 'moon' },
  { piece: 2, hue: HUE.cyan, weight: 4, pay: 8, name: 'diamond' },
  { piece: 8, hue: HUE.azure, weight: 5, pay: 6, name: 'drop' },
];
const TOTAL = SYMBOLS.reduce((a, s) => a + s.weight, 0);
const PURSE = 20;
const STOP = [0.8, 1.2, 1.6];   // seconds: each reel stops
const TRAVEL = [9, 12, 15];      // symbols each reel scrolls through

function draw(rng) {
  let x;
  [x, rng] = rngNext(rng);
  let k = x * TOTAL, i = 0;
  while (k >= SYMBOLS[i].weight && i < SYMBOLS.length - 1) { k -= SYMBOLS[i].weight; i++; }
  return [i, rng];
}
export function payout([a, b, c]) {
  if (a === b && b === c) return SYMBOLS[a].pay;
  if (a === b) return 3;
  return 0;
}

export default {
  id: 'game-slots',
  title: 'Slots',
  category: 'Chance',
  description: 'A three-reel slot machine across three keys: press to spin, the reels stop one by one; three of a kind pays and three prisms are the jackpot. Seeded, never real money.',
  tags: ['game', 'slots', 'slot machine', 'reels', 'chance', 'toy', 'interactive'],
  surface: 'span',
  span: { cols: 3, rows: 1 },
  animated: false,
  fps: 12,
  loop: 4,
  game: {
    readout(s) {
      const names = s.reels.map((i) => SYMBOLS[i]?.name || '?');
      return { title: 'Slots', cards: [
        s.spins ? { title: s.won ? (s.won === SYMBOLS[0].pay ? 'Jackpot' : 'Win') : 'Spin', value: s.won ? '+' + s.won : 'No win', role: 'value', sub: names.join(' · '), hue: s.won ? HUE.citrine : HUE.violet, tone: s.won ? 'ok' : 'idle' } : { title: 'Slots', value: 'Ready', role: 'value', sub: 'press a reel: one coin', hue: HUE.violet },
        { title: 'Coins', value: s.coins, bar: Math.min(1, s.coins / Math.max(1, s.best)), sub: s.coins < 1 ? 'press to refill' : undefined, hue: HUE.amber, tone: s.coins < 1 ? 'warn' : 'idle' },
        { title: 'Spins', value: s.spins, sub: s.jackpots + (s.jackpots === 1 ? ' jackpot' : ' jackpots'), hue: HUE.cyan },
        { title: 'Best', value: s.best, sub: 'most coins held', hue: HUE.lime },
      ] };
    },
    animate: 2.5,
    init({ seed }) {
      let rng = rngSeed(seed);
      const reels = [];
      for (let k = 0; k < 3; k++) { let i; [i, rng] = draw(rng); reels.push(i); }
      if (payout(reels)) reels[2] = (reels[1] + 2) % SYMBOLS.length;   // don't open on a win
      return { coins: PURSE, reels, spins: 0, won: 0, best: PURSE, jackpots: 0, rng };
    },
    reduce(s, ev) {
      if (ev.type !== 'press' || !Number.isInteger(ev.cell) || ev.cell < 0 || ev.cell > 2) return s;
      if (s.coins < 1) return { ...s, coins: PURSE, won: 0 };
      let rng = s.rng;
      const reels = [];
      for (let k = 0; k < 3; k++) { let i; [i, rng] = draw(rng); reels.push(i); }
      const won = payout(reels), coins = s.coins - 1 + won;
      return { ...s, coins, reels, spins: s.spins + 1, won, best: Math.max(s.best, coins), jackpots: s.jackpots + (won === SYMBOLS[0].pay ? 1 : 0), rng };
    },
  },
  order: 20,
  render(ctx) {
    const d = surface(ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const spun = prev && s.spins === prev.spins + 1;
    const settled = !spun || age >= STOP[2] + 0.15;
    const jackpot = spun && s.won === SYMBOLS[0].pay;
    const three = s.reels[0] === s.reels[1] && s.reels[1] === s.reels[2];
    const match = (k) => s.won > 0 && (three || k < 2);
    for (const c of cellsOf(ctx)) {
      const k = c.k, sym = SYMBOLS[s.reels[k]];
      const stopped = !spun || age >= STOP[k];
      const winning = spun && settled && match(k) && s.won > 0;
      const tone = s.coins < 1 && settled ? 'off' : winning ? 'ok' : stopped && spun && age < STOP[k] + 0.35 ? 'active' : 'idle';
      cellKey(d, c, (q) => {
        q.background({ tone: tone === 'off' ? 'idle' : tone });
        const box = q.theme.glyphBox(q, { labeled: true });
        if (!stopped) {   // spinning: symbols scroll down through the window, blurred while fast
          const T = STOP[k], D = TRAVEL[k], x = clamp(age / T);
          const pos = D * (1 - Math.pow(1 - x, 3));
          const i0 = Math.floor(pos), frac = pos - i0, speed = 3 * D * Math.pow(1 - x, 2) / T;
          const symAt = (i) => (i <= 0 ? SYMBOLS[prev.reels[k]] : i >= D ? sym : SYMBOLS[Math.floor(hash(ev.seed | 0, k, i) * SYMBOLS.length)]);
          for (const [i, dy] of [[i0, frac], [i0 + 1, frac - 1]]) {
            const S = symAt(i), y = box.y + dy * box.size * 1.25;
            const blur = clamp((speed - 6) / 20);
            if (blur > 0.05) for (let j = 1; j <= 2; j++) q.pictogram(PIECES[S.piece], { box: { x: box.x, y: y - j * box.size * 0.16 * blur, size: box.size }, tone: 'idle', opacity: +(0.28 * blur / j).toFixed(3) });
            q.pictogram(PIECES[S.piece], { box: { ...box, y }, tone: 'idle', opacity: +(1 - blur * 0.45).toFixed(3) });
          }
        } else {
          const bounce = spun && age < STOP[k] + 0.3 ? Math.sin(clamp((age - STOP[k]) / 0.3) * Math.PI) * box.size * 0.07 : 0;
          const B = { ...box, y: box.y + bounce };
          q.pictogram(PIECES[sym.piece], { box: B, tone: s.coins < 1 ? 'idle' : 'active', opacity: s.coins < 1 ? 0.45 : !winning && spun && settled && s.won ? 0.6 : undefined });
        }
        // the payline: small notches in from the outer edges, at the symbols' center
        const cy = box.y + box.size / 2, nh = Math.max(3, q.m.u * 3.2), nw = Math.max(2.5, q.m.u * 2.6);
        const notch = k === 0 ? P().M(q.m.bleed, cy - nh).L(q.m.bleed + nw, cy).L(q.m.bleed, cy + nh).Z().d : k === 2 ? P().M(q.w - q.m.bleed, cy - nh).L(q.w - q.m.bleed - nw, cy).L(q.w - q.m.bleed, cy + nh).Z().d : null;
        if (notch) q.add(`<path d="${notch}" fill="${winning ? beamColor(q) : q.colors.muted}"/>`);
        if (k === 0) q.label(s.coins < 1 ? 'Empty' : 'Spin', { color: 'muted' });
        if (k === 1) q.label(s.coins < 1 ? 'Refill' : `${settled ? s.coins : prev?.coins - 1} coins`, { color: settled && s.won ? 'ink' : 'muted' });
        if (k === 2 && settled && s.won) q.label(jackpot ? 'Jackpot' : `+${s.won}`, { color: 'ink' });
        if (spun && s.won) {
          const t0 = STOP[2] + 0.12;
          const b = sweepX(age, { t0, dur: 0.55, pos: k, span: 3, w: q.w });
          if (b.on) beam(q, b.x);
          if (match(k)) burst(q, clamp((age - t0 - 0.2 - k * 0.06) / 0.7), { cy: cy, rays: jackpot ? 16 : 10 });
          if (jackpot) ringWave(q, clamp((age - t0 - 0.35) / 0.6), { cy });
        }
      }, { hue: sym.hue, tone: tone === 'off' ? 'idle' : tone });
    }
    return d.svg();
  },
};
