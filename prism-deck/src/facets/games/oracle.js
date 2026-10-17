// game-oracle — ask a yes-or-no question and press. The last answer disperses into its colors, a beam
// crosses the key, and the new answer refracts into focus: warm for no, citrine for maybe, jade for yes
// (the words say it too). Answers come from the rng in the state and never repeat back to back.
//
// State (plain JSON): { a (answer index, −1 before the first question), was, asks, rng }.

import { surface, keyInto } from '../../scene/index.js';
import { rngSeed, rngInt } from '../../scene/game.js';
import { clamp } from '../../scene/easing.js';
import { ageOf, beam, sweepX, convergeText, HUE } from './_d8-kit.js';

/** [lines (≤ 2, ≤ 8 characters each, so caps themes fit a 72 px key), polarity: 1 yes · 0 maybe · −1 no] */
export const ANSWERS = [
  [['Yes'], 1], [['Surely'], 1], [['Count', 'on it'], 1], [['Signs', 'say yes'], 1], [['Most', 'likely'], 1], [['Looks', 'bright'], 1], [['No', 'doubt'], 1], [['It is', 'so'], 1],
  [['Ask', 'again'], 0], [['Maybe'], 0], [['Too', 'hazy'], 0], [['Not yet', 'clear'], 0], [['Ask', 'later'], 0], [['Can’t', 'say'], 0],
  [['No'], -1], [['Doubtful'], -1], [['Unlikely'], -1], [['Not', 'today'], -1], [['Signs', 'say no'], -1], [['Very', 'doubtful'], -1],
];
const HUE_OF = { 1: HUE.jade, 0: HUE.citrine, [-1]: HUE.rose };

export default {
  id: 'game-oracle',
  title: 'Oracle',
  category: 'Chance',
  description: 'Ask a yes-or-no question and press: the old answer disperses, a beam crosses the key and the new one refracts into focus, jade for yes, citrine for maybe, rose for no.',
  tags: ['game', 'oracle', 'fortune', 'answer', 'yes no', 'chance', 'toy', 'interactive'],
  surface: 'key',
  animated: false,
  fps: 12,
  loop: 2,
  game: {
    animate: 1.25,
    init({ seed }) { return { a: -1, was: -1, asks: 0, rng: rngSeed(seed) }; },
    readout(s) {
      const [lines, pol] = s.a >= 0 ? ANSWERS[s.a] : [['Ask'], 0];
      const word = s.a < 0 ? 'Ask' : pol > 0 ? 'Yes' : pol < 0 ? 'No' : 'Maybe';
      return { title: 'Oracle', cards: [
        { title: 'The oracle says', value: lines.join(' '), role: 'value', sub: s.a < 0 ? 'ask a yes-or-no question' : 'ask again, press again', hue: HUE_OF[pol], tone: s.a < 0 ? 'idle' : 'active' },
        { title: 'Asked', value: s.asks, sub: 'questions', hue: HUE.citrine },
        { title: 'In short', value: word, role: 'value', hue: HUE_OF[pol], tone: s.a < 0 ? 'idle' : pol > 0 ? 'ok' : pol < 0 ? 'neg' : 'warn' },
        { title: 'How', value: 'Ask, press', role: 'value', sub: 'for fun only', hue: HUE.violet },
      ] };
    },
    reduce(s, ev) {
      if (ev.type !== 'press') return s;
      let [k, rng] = rngInt(s.rng, s.a < 0 ? ANSWERS.length : ANSWERS.length - 1);
      if (s.a >= 0 && k >= s.a) k++;   // never the same answer twice in a row
      return { ...s, a: k, was: s.a, asks: s.asks + 1, rng };
    },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const s = ctx.game;
    const age = ageOf(ctx);
    const asked = s.asks > 0 && age < 1.25;
    const [text, pol] = s.a >= 0 ? ANSWERS[s.a] : [['Ask'], 0];
    const old = s.was >= 0 ? ANSWERS[s.was] : null;
    const showNew = !asked || age >= 0.42;
    const hue = s.a < 0 ? HUE.violet : showNew ? HUE_OF[pol] : old ? HUE_OF[old[1]] : HUE.violet;
    const tone = s.a < 0 ? 'idle' : 'active';
    keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
      q.background({ tone });
      const size = q.typeStyle('label').size * 1.12, lh = size * 1.18, cy = q.h * 0.5;
      // the answer's lines, centered on the key (each line drawn on its own baseline)
      const say = (lines, u) => lines.forEach((ln, j) => convergeText(q, 'label', ln, u, { size, y: cy + size * 0.36 + (j - (lines.length - 1) / 2) * lh, color: 'ink' }));
      if (s.a < 0) {   // before the first question: an orb with a prism in it
        const box = q.theme.glyphBox(q, { labeled: true });
        q.pictogram((g) => { g.circle(24, 24, 14, { role: 'line' }); g.polygon([[24, 15], [32, 30], [16, 30]], { role: 'accent', fill: true, opacity: 0.85 }); g.dot(24, 15, 1.8); }, { box, tone: 'active' });
        q.label('Ask', { color: 'ink' });
        return;
      }
      if (asked && age < 0.42 && old) {   // the last answer disperses
        const u = clamp(age / 0.4);
        say(old[0], 1 - u);
      }
      if (asked) {
        const b = sweepX(age, { t0: 0.18, dur: 0.42, pos: 0, span: 1, w: q.w });
        if (b.on) beam(q, b.x);
      }
      if (showNew) say(text, asked ? clamp((age - 0.42) / 0.45) : 1);
    }, { hue, tone });
    return k.svg();
  },
};
