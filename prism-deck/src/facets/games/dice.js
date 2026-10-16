// game-dice — one key, one or two dice. Press to roll: the dice tumble through faces, hop and spin,
// then land on the result. The faces come from the rng carried in the game state, so a seed
// replays the same rolls. The tumble is drawn from the press event's age and seed (ctx.gameEvent),
// so nothing animates between rolls. The dice are drawn with the theme's glyph roles (paintPen), so
// neon dice glow and paper dice look printed.
//
// State (plain JSON): { count, faces: [1–6, …], rolls, rng }.

import { surface } from '../../scene/index.js';
import { rngSeed, rngInt } from '../../scene/game.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { HUE } from './_d8-kit.js';

const ROLL = 0.8;   // seconds of tumble
const PIPS = {      // pip centers on the 48-unit grid (the die spans 8–40)
  1: [[24, 24]],
  2: [[16, 16], [32, 32]],
  3: [[16, 16], [24, 24], [32, 32]],
  4: [[16, 16], [32, 16], [16, 32], [32, 32]],
  5: [[16, 16], [32, 16], [24, 24], [16, 32], [32, 32]],
  6: [[16, 15], [32, 15], [16, 24], [32, 24], [16, 33], [32, 33]],
};

function roll(rng, count) {
  const faces = [];
  for (let i = 0; i < count; i++) { let f; [f, rng] = rngInt(rng, 6); faces.push(f + 1); }
  return { faces, rng };
}

export default {
  id: 'game-dice',
  title: 'Dice',
  category: 'Chance',
  description: 'Press to roll one or two dice: they tumble, hop and land on the result, drawn in the deck theme. Seeded, so the same game replays the same rolls.',
  tags: ['game', 'dice', 'chance', 'random', 'roll', 'toy', 'interactive'],
  surface: 'key',
  animated: false,
  fps: 12,
  loop: 2,
  params: {
    count: { type: 'number', default: 1, min: 1, max: 2, step: 1, label: 'Dice' },
    label: { type: 'text', default: 'Roll', label: 'Label', maxLength: 10 },
  },
  game: {
    animate: 1,
    readout(s) {
      const sum = s.faces.reduce((a, b) => a + b, 0), two = s.faces.length > 1, dbl = two && s.faces[0] === s.faces[1];
      return { title: 'Dice', cards: [
        s.rolls ? { title: 'Rolled', value: sum, sub: two ? s.faces.join(' + ') + (dbl ? ' · doubles' : '') : 'one die', hue: HUE.amber, tone: dbl ? 'ok' : 'active' } : { title: 'Dice', value: 'Ready', role: 'value', sub: 'press the key to roll', hue: HUE.amber },
        { title: 'Rolls', value: s.rolls, sub: 'this game', hue: HUE.citrine },
        { title: 'Dice', value: s.faces.length, sub: two ? 'two dice: 2–12' : 'one die: 1–6', hue: HUE.coral },
        { title: 'Odds', value: two ? Math.round((100 * (6 - Math.abs(sum - 7))) / 36) + '%' : '17%', role: 'value', sub: s.rolls ? 'of rolling ' + (two ? sum : s.faces[0]) : 'each face', hue: HUE.lime },
      ] };
    },
    init({ seed, params }) {
      const count = Math.round(params.count) === 2 ? 2 : 1;
      const r = roll(rngSeed(seed), count);
      return { count, faces: r.faces, rolls: 0, rng: r.rng };
    },
    reduce(s, ev) {
      if (ev.type !== 'press') return s;
      const r = roll(s.rng, s.count);
      return { ...s, faces: r.faces, rolls: s.rolls + 1, rng: r.rng };
    },
  },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const s = ctx.game, ev = ctx.gameEvent;
    const age = ctx.reduced || !ev || ev.type !== 'press' ? Infinity : ev.age;
    const rolling = age < ROLL;
    k.background({ tone: age < ROLL + 0.6 ? 'active' : 'idle' });
    const box = k.theme.glyphBox(k, { labeled: true });
    const n = s.faces.length;
    const size = n === 2 ? Math.min(box.size * 0.86, k.w * 0.42) : box.size;
    const cy = box.y + box.size / 2;
    s.faces.forEach((final, j) => {
      const cx = n === 2 ? k.w / 2 + (j ? 1 : -1) * size * 0.54 : k.w / 2;
      let face = final, rotate = 0, scale = 1, hop = 0;
      if (rolling) {
        const u = age / ROLL, frame = Math.floor(age * 14);
        face = 1 + Math.floor(hash(ev.seed | 0, j, frame) * 6);
        rotate = (1 - outExpo(u)) * 540 * (j ? -1 : 1);
        scale = 1 + 0.08 * (1 - u);
        hop = -Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 7;
      } else if (age < ROLL + 0.2) scale = 1 + 0.07 * Math.sin(clamp((age - ROLL) / 0.2) * Math.PI);   // the landing
      k.pictogram((p) => p.group({ rotate, scale, y: hop }, (g) => {
        g.rect(8, 8, 32, 32, { role: rolling ? 'accent' : 'line', r: 7, fill: false });
        for (const [x, y] of PIPS[face]) g.circle(x, y, 3.3, { role: 'fill' });
      }), { box: { x: cx - size / 2, y: cy - size / 2, size }, tone: rolling ? 'active' : 'idle' });
    });
    const sum = s.faces.reduce((a, b) => a + b, 0);
    k.label(rolling || !s.rolls ? ctx.params.label : n === 2 ? `= ${sum}` : ctx.params.label, { color: rolling ? 'muted' : 'ink' });
    return k.svg();
  },
};
