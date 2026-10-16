// game-coin — flip a coin on one key. It leaps, spins edge-on through half-turns and lands on the side the
// state's rng chose: the sun (heads) or the moon (tails). Keeps the streak and the tally. The spin is
// drawn from the press's age; between flips the key is still.
//
// State (plain JSON): { face ('h' | 't'), was, flips, heads, streak, rng }.

import { surface, keyInto } from '../../scene/index.js';
import { rngSeed, rngNext } from '../../scene/game.js';
import { clamp } from '../../scene/easing.js';
import { ageOf, burst, HUE } from './_d8-kit.js';

const SPIN = 0.95;

/** The coin seen from an angle: sx = horizontal squash (1 = face on). */
function coin(p, side, sx, { lift = 0 } = {}) {
  const X = (x) => +(24 + (x - 24) * sx).toFixed(3);
  p.group({ y: lift }, (g) => {
    if (sx < 0.14) { g.rect(X(24) - 1.6, 9, 3.2, 30, { role: 'line', fill: true, r: 1.2 }); return; }
    g.ellipse(24, 24, 15.5 * sx, 15.5, { role: 'line', weight: 1.1 });
    g.ellipse(24, 24, 12 * sx, 12, { role: 'dim', weight: 0.6, opacity: 0.7 });
    if (side === 'h') {   // the sun
      g.ellipse(24, 24, 4.6 * sx, 4.6, { role: 'accent', fill: true });
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
        g.line(X(24 + s * 7), 24 - c * 7, X(24 + s * 9.6), 24 - c * 9.6, { role: 'accent', weight: 0.75 });
      }
    } else {               // the moon: a crescent, squashed with the coin
      // the moon piece's crescent (pieces: moon) at 0.46 ×, as an affine image so it squashes exactly
      const k = 0.46, T = (x, y) => `${X(24 + (x - 23) * k)} ${+(24 + (y - 24.5) * k).toFixed(3)}`, R = (r) => `${+(r * k * sx).toFixed(3)} ${+(r * k).toFixed(3)}`;
      g.path(`M${T(28.5, 8.4)} A${R(16)} 0 1 0 ${T(40.6, 31)} A${R(12.5)} 0 1 1 ${T(28.5, 8.4)} Z`, { role: 'accent', fill: true });
    }
  });
}

export default {
  id: 'game-coin',
  title: 'Coin Flip',
  category: 'Chance',
  description: 'Flip a coin on one key: it leaps, spins edge-on and lands sun (heads) or moon (tails), keeping the streak and the tally. Seeded, so a game replays the same flips.',
  tags: ['game', 'coin', 'flip', 'heads', 'tails', 'chance', 'toy', 'interactive'],
  surface: 'key',
  animated: false,
  fps: 12,
  loop: 2,
  game: {
    animate: 1.3,
    readout(s) {
      const tails = s.flips - s.heads;
      return { title: 'Coin', cards: [
        s.flips ? { title: 'Flip', value: s.face === 'h' ? 'Heads' : 'Tails', role: 'value', sub: s.face === 'h' ? 'the sun' : 'the moon', hue: s.face === 'h' ? HUE.amber : HUE.periwinkle, tone: 'active' } : { title: 'Coin', value: 'Ready', role: 'value', sub: 'press the key to flip', hue: HUE.amber },
        { title: 'Streak', value: s.flips ? s.streak : 0, sub: s.flips ? (s.face === 'h' ? 'heads' : 'tails') + ' in a row' : 'none yet', hue: HUE.citrine },
        { title: 'Heads', value: s.heads, bar: s.flips ? s.heads / s.flips : 0, hue: HUE.amber },
        { title: 'Tails', value: tails, bar: s.flips ? tails / s.flips : 0, hue: HUE.periwinkle },
      ] };
    },
    init({ seed }) {
      const [x, rng] = rngNext(rngSeed(seed));
      const face = x < 0.5 ? 'h' : 't';
      return { face, was: face, flips: 0, heads: 0, streak: 0, rng };
    },
    reduce(s, ev) {
      if (ev.type !== 'press') return s;
      const [x, rng] = rngNext(s.rng);
      const face = x < 0.5 ? 'h' : 't';
      return { ...s, face, was: s.face, flips: s.flips + 1, heads: s.heads + (face === 'h' ? 1 : 0), streak: s.flips && face === s.face ? s.streak + 1 : 1, rng };
    },
  },
  order: 20,
  render(ctx) {
    const k = surface(ctx);
    const s = ctx.game;
    const age = ageOf(ctx);
    const flipping = age < SPIN && s.flips > 0;
    const big = Math.min(k.w, k.h) >= 110;
    let side = s.face, sx = 1, lift = 0;
    if (flipping) {
      const u = age / SPIN, H = s.face === s.was ? 6 : 7;
      const th = H * Math.PI * (1 - Math.pow(1 - u, 2.2));
      side = Math.floor((th + Math.PI / 2) / Math.PI) % 2 === 0 ? s.was : s.was === 'h' ? 't' : 'h';
      sx = Math.abs(Math.cos(th));
      lift = -Math.sin(u * Math.PI) * 9;
    }
    const landed = s.flips > 0 && age >= SPIN && age < SPIN + 0.35;
    const hue = side === 'h' ? HUE.citrine : HUE.periwinkle;
    const tone = flipping || landed ? 'active' : s.flips ? 'active' : 'idle';
    keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
      q.background({ tone });
      const box = q.theme.glyphBox(q, { labeled: true });
      if (flipping || landed) q.pictogram((g) => g.ellipse(24, 43.5, 10 * (1 + lift / 18), 1.4, { role: 'dim', fill: true, opacity: 0.5 }), { box, tone });
      const squash = landed ? 1 + 0.06 * Math.sin(clamp((age - SPIN) / 0.25) * Math.PI) : 1;
      q.pictogram((g) => g.group({ scale: squash }, (h) => coin(h, side, sx, { lift })), { box, tone: flipping ? 'active' : tone });
      if (landed) burst(q, clamp((age - SPIN) / 0.5), { cy: box.y + box.size / 2, r0: box.size * 0.36, r1: box.size * 0.62, rays: 12, alpha: 0.8, hues: [hue, HUE.amber, hue, HUE.violet] });
      q.label(flipping ? '…' : !s.flips ? 'Flip' : s.face === 'h' ? 'Heads' : 'Tails', { color: flipping ? 'muted' : 'ink' });
      if (big && s.flips && !flipping) q.eyebrow(s.streak > 1 ? `${s.streak} in a row` : `H ${s.heads} · T ${s.flips - s.heads}`, { align: 'center', x: q.w / 2 });
    }, { hue, tone });
    return k.svg();
  },
};
