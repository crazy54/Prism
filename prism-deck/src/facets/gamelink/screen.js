// gamelink-screen-match — the match on the Galleon 100 SD's screen: the score (map, side, target / match point),
// the round (its phase, the bomb's state, why it ended), your K / A / D with MVPs, and your money with your gear.
// On the Neo info bar: one line. The four widgets play the deck's effects (flash, damage, death, sweeps), so the
// screen whites out with the keys. Never a bomb timer.

import { surface, rect } from '../../scene/index.js';
import { textPath } from '../../scene/text.js';
import { panelInto } from '../screens/_d5-kit.js';
import { gameLinkOf, tierOf, fxOf, slotModel, money, EFFECTS_PARAM, DATA_SHAPE, SLOT_HUE } from './_gl-kit.js';
import { fieldOf, mid, panelInstrument, overlays } from './_gl-draw.js';

/** The four widget models: TL score, TR round, BL K/A/D, BR money. */
function cards(view, fx) {
  const s = view.s, m = s?.match, st = s?.stats, p = s?.player;
  const score = slotModel('score', view, fx);
  score.title = m?.title || 'Score'; score.meta = m?.side ? `${m.side} side` : m?.mode || null; score.pict = 'score'; score.foot = score.sub; score.footTone = score.tone === 'warn' ? 'warn' : null;
  const round = slotModel('round', view, fx);
  round.meta = round.sub && round.sub === m?.title ? (m?.mode ? m.mode[0].toUpperCase() + m.mode.slice(1) : null) : round.sub;   // the map is on the score widget
  const kda = slotModel('kda', view, fx);
  if (kda.kda) kda.value = `${kda.kda[0] ?? '—'} · ${kda.kda[1] ?? '—'} · ${kda.kda[2] ?? '—'}`;
  kda.meta = Number.isFinite(st?.mvps) && fx.face !== 'waiting' ? `${st.mvps} MVP` : null;
  kda.pict = 'mvp'; kda.foot = Number.isFinite(st?.score) && fx.face !== 'waiting' ? `score ${st.score}` : null;
  const cash = slotModel('money', view, fx);
  cash.meta = cash.sub || (Number.isFinite(p?.equip) ? `Gear ${money(p.equip)}` : null);
  return [score, round, kda, cash];
}

export default {
  id: 'gamelink-screen-match',
  title: 'CS2 Match Screen',
  category: 'Strips & Screens',
  description: 'The Counter-Strike 2 match on the Galleon screen: score and map, the round and why it ended, your K / A / D and MVPs, your money and gear.',
  tags: ['cs2', 'counter-strike', 'game link', 'galleon', 'screen', 'scoreboard', 'match', 'neo'],
  surface: 'screen',
  screens: ['galleon', 'infobar'],
  data: ['gamelink'],
  dataShape: DATA_SHAPE,
  animated: true,
  fps: 10,
  loop: 60,
  still: 7.5,
  press: 'none',
  params: { effects: EFFECTS_PARAM },
  order: 52,
  render(ctx) {
    const k = surface(ctx);
    const view = gameLinkOf(ctx), fx = fxOf(view, tierOf(ctx));
    const C = cards(view, fx);
    if (ctx.screen.kind === 'infobar') {
      k.background({ tone: 'idle' });
      const parts = [C[1].title && C[1].value !== '—' ? `${C[1].value}` : null, C[0].value !== '—' ? C[0].value : null, C[3].value !== '—' ? C[3].value : null].filter(Boolean);
      const stl = k.typeStyle('label'), size = Math.min(k.h * 0.4, stl.size * 1.25);
      k.add(textPath(parts.join('  ·  ') || 'Waiting for CS2', { x: k.w / 2, y: k.h / 2 + size * 0.36, size, weight: stl.weight, anchor: 'middle', maxWidth: k.w - k.m.text * 2, fill: k.colors.ink }));
      const me = { x: 0, y: 0, w: k.w, h: k.h };
      overlays(k, fx, me, fieldOf([me]), { slot: 'round' });
      return k.svg();
    }
    k.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
    const G = ctx.screen.widgets;
    const rects = [0, 1, 2, 3].map((j) => ({ x: (j % 2) * G.pitchX + G.insetX, y: (j >> 1) * G.pitchY + G.insetY, w: G.w, h: G.h }));
    const F = fieldOf(rects, { origins: { kills: mid(rects[2]), round: mid(rects[1]), health: mid(rects[0]) }, K: 160 });
    const slots = ['score', 'round', 'kda', 'money'];
    C.forEach((M, j) => panelInto(k, rects[j], (p) => { panelInstrument(p, M, fx, { meta: M.meta ?? undefined }); overlays(p, fx, rects[j], F, { slot: slots[j] === 'kda' ? 'kills' : slots[j] }); }, { kind: 'screen', tag: `w${j}`, hue: SLOT_HUE[slots[j]], tone: M.tone }));
    return k.svg();
  },
};
