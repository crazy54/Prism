// Game Link key facets — one instrument per key: health, armor (+ helmet), ammo (the clip prominent, spare magazines
// as "mags"), money, round kills, the team score and the round phase. Each key also plays the deck's effects on its
// own pixels (the whiteout, damage, death, a kill's ring, the round sweep, the planted pulse on the round key), so a
// page of single keys reacts together: same data, same wall clock. Spatial effects across keys need the deck facet
// (gamelink-cs2-deck) or the span (gamelink-span-prism).

import { surface } from '../../scene/index.js';
import { gameLinkOf, tierOf, fxOf, slotModel, EFFECTS_PARAM, DATA_SHAPE, SLOT_HUE } from './_gl-kit.js';
import { fieldOf, keyInstrument, overlays } from './_gl-draw.js';

/** Render one instrument key with the deck's effects drawn on it. */
export function renderVital(ctx, slot) {
  const k = surface(ctx);
  const view = gameLinkOf(ctx), fx = fxOf(view, tierOf(ctx));
  const M = slotModel(slot, view, fx);
  if (fx.face === 'waiting' && slot !== 'round') M.sub = 'Waiting';   // honest on a key of its own: listening, no game yet
  const me = { x: 0, y: 0, w: ctx.w, h: ctx.h };
  // the key is its own field; effects that start on another instrument arrive from below the key
  const away = [ctx.w * 0.5, ctx.h * 2.2];
  const c = [ctx.w / 2, ctx.h / 2];
  const F = fieldOf([me], { origins: { kills: slot === 'kills' ? c : away, round: slot === 'round' ? c : away, health: c } });
  keyInstrument(k, M, fx);
  overlays(k, fx, me, F, { slot });
  return k.svg();
}

const vital = (slot, { title, category, description, tags, order }) => ({
  id: `gamelink-${slot}`,
  title,
  category,
  description,
  tags: ['cs2', 'counter-strike', 'game link', 'gaming', 'live', ...tags],
  surface: 'key',
  data: ['gamelink'],
  dataShape: DATA_SHAPE,
  animated: true,
  fps: 10,
  loop: 60,
  still: 7.5,
  press: 'none',
  params: { hue: { type: 'hue', default: SLOT_HUE[slot], label: 'Hue' }, effects: EFFECTS_PARAM },
  order,
  render: (ctx) => renderVital(ctx, slot),
});

export default [
  vital('health', { title: 'Health', category: 'Vitals', order: 20, tags: ['health', 'hp', 'vitals'], description: 'Your health from Counter-Strike 2 with a meter and the damage you just took; the key whites out when you are flashed and cracks when you go down.' }),
  vital('armor', { title: 'Armor', category: 'Vitals', order: 21, tags: ['armor', 'kevlar', 'helmet', 'vitals'], description: 'Your armor from Counter-Strike 2, with a shield that shows whether you have a helmet, and the deck’s flash and damage effects.' }),
  vital('ammo', { title: 'Ammo', category: 'Vitals', order: 22, tags: ['ammo', 'clip', 'magazine', 'reload', 'weapon'], description: 'The clip of the gun in your hand, prominent, with spare magazines shown as mags; warns when low, empty or reloading.' }),
  vital('money', { title: 'Money', category: 'Vitals', order: 23, tags: ['money', 'economy', 'buy'], description: 'Your money from Counter-Strike 2: up front during freeze time, with every reward and purchase shown as it lands.' }),
  vital('kills', { title: 'Round Kills', category: 'Match', order: 30, tags: ['kills', 'frags', 'headshot', 'multi-kill', 'ace'], description: 'Your kills this round: a spectral burst on every kill, a sharper one for headshots, and Double, Triple, Quad and Ace as they come.' }),
  vital('score', { title: 'Score', category: 'Match', order: 31, tags: ['score', 'match', 'team', 'match point'], description: 'Your team’s score against theirs with your side, the target and match point; the final result at the end of the match.' }),
  vital('round', { title: 'Round', category: 'Round & Bomb', order: 40, tags: ['round', 'bomb', 'planted', 'buy', 'freeze time'], description: 'The round and its phase: buy, live, planted (a steady pulse, no timer), won or lost and why, halftime, spectating.' }),
];
