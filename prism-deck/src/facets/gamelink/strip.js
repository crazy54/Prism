// Game Link on the Stream Deck + / + XL touch strip: your vitals as bars — health, armor, ammo and money (+ XL adds
// round kills and the score) — or one of them on one dial's segment. Every segment plays the deck's effects (flash,
// damage, death, the round sweep), so the strip whites out with the keys.

import { surface, rect } from '../../scene/index.js';
import { panelInto } from '../screens/_d5-kit.js';
import { gameLinkOf, tierOf, fxOf, slotModel, EFFECTS_PARAM, DATA_SHAPE } from './_gl-kit.js';
import { fieldOf, mid, panelInstrument, overlays } from './_gl-draw.js';

const STRIP_SLOTS = ['health', 'armor', 'ammo', 'money', 'kills', 'score'];
const SHOW = ['health', 'armor', 'ammo', 'money', 'kills', 'score', 'round'];

/** Draw `slots` on the strip's segments (each a theme panel) with the shared effects. */
export function renderStrip(ctx, slots) {
  const k = surface(ctx);
  k.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
  const view = gameLinkOf(ctx), fx = fxOf(view, tierOf(ctx));
  const N = ctx.strip.segments, sw = ctx.w / N;
  const rects = Array.from({ length: N }, (_, i) => ({ x: i * sw, y: 0, w: sw, h: ctx.h }));
  const at = (slot) => { const i = slots.indexOf(slot); return i >= 0 && i < N ? mid(rects[i]) : null; };
  const F = fieldOf(rects, { origins: { kills: at('kills'), round: at('round'), health: at('health') }, K: ctx.h });
  const st = view.s?.stats;
  rects.forEach((r, i) => {
    const slot = slots[i % slots.length];
    const M = slotModel(slot, view, fx);
    const meta = slot === 'money' && st && Number.isFinite(st.kills) && fx.face !== 'waiting' ? `K ${st.kills} · D ${st.deaths ?? '—'}` : undefined;
    panelInto(k, r, (p) => { panelInstrument(p, M, fx, { meta }); overlays(p, fx, r, F, { slot }); }, { kind: 'strip', tag: `s${i}`, hue: M.hue, tone: M.tone });
  });
  return k.svg();
}

export default [
  {
    id: 'gamelink-strip-vitals',
    title: 'CS2 Vitals Strip',
    category: 'Strips & Screens',
    description: 'Your Counter-Strike 2 vitals across the touch strip: health, armor, ammo and money as bars (+ XL adds kills and the score), flashing and cracking with the deck.',
    tags: ['cs2', 'counter-strike', 'game link', 'strip', 'health', 'armor', 'ammo', 'money', 'bars'],
    surface: 'strip',
    segments: 'all',
    data: ['gamelink'],
    dataShape: DATA_SHAPE,
    animated: true,
    fps: 10,
    loop: 60,
    still: 7.5,
    press: 'none',
    params: { effects: EFFECTS_PARAM },
    order: 50,
    render: (ctx) => renderStrip(ctx, STRIP_SLOTS),
  },
  {
    id: 'gamelink-dial-vital',
    title: 'CS2 Vital Dial',
    category: 'Strips & Screens',
    description: 'One Counter-Strike 2 vital on a dial’s strip segment: health, armor, ammo, money, kills, the score or the round, with the deck’s effects.',
    tags: ['cs2', 'counter-strike', 'game link', 'dial', 'segment', 'health', 'armor', 'ammo'],
    surface: 'strip',
    segments: 1,
    data: ['gamelink'],
    dataShape: DATA_SHAPE,
    animated: true,
    fps: 10,
    loop: 60,
    still: 7.5,
    press: 'none',
    params: { show: { type: 'select', default: 'health', options: SHOW, label: 'Shows' }, effects: EFFECTS_PARAM },
    order: 51,
    render: (ctx) => renderStrip(ctx, [ctx.params.show]),
  },
];
