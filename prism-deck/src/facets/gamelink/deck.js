// gamelink-cs2-deck — the flagship: Counter-Strike 2 on the whole deck. The keys carry the instruments (score,
// round, kills, K/D …) around a prism scene whose Spectrum is your health; the Galleon's four widgets (or the
// Stream Deck +'s strip) carry health, armor, ammo and money. The game's moments play across every surface:
//
//   flashbang  white light floods the deck (keys, widgets, strip) and disperses into the Spectrum as it fades,
//              following the game's own `flashed` value (held through silence; capped peak; rise slew ≥ 80 ms)
//   damage     refracted shards splash out from the center, as far as the damage reaches (edges only, never red fields)
//   kill       a spectral burst on the kill counter, a ripple across the deck; headshots sharper; 2K / 3K / 4K / ACE escalate
//   death      the glass cracks from your health, then the deck dims to SPECTATING (never the watched player's vitals)
//   round      a sweep of light in the winner's color (a loss: a cool fade); the round key says why
//   bomb       planted = a steady pulse at a fixed rate on the round key and a warm prism (no timer, ever);
//              defused = a cool burst, exploded = a warm one
//   ambient    freeze time breathes with money up front; warmup, halftime, match point, the final scoreboard
//
// Faces: the DEMO round while Game Link is off (the plugin tags it), "Waiting for CS2" while it listens, live after.
// Effects follow ctx.motion (Calm: gentle; Still: static state only) and the `effects` param (soft by default).

import { surface, keyInto, rect } from '../../scene/index.js';
import { textPath } from '../../scene/text.js';
import { panelInto } from '../screens/_d5-kit.js';
import { gameLinkOf, tierOf, fxOf, slotModel, layoutOf, EFFECTS_PARAM, SLOT_HUE, DATA_SHAPE } from './_gl-kit.js';
import { fieldOf, mid, keyInstrument, panelInstrument, sceneOf, sceneKey, overlays } from './_gl-draw.js';

/** The readout surfaces of a deck in panel px: Galleon widgets (TL, TR, BL, BR), strip segments, the Neo bar. */
export function readoutRects(ctx) {
  const D = ctx.deck;
  if (!D) return [];
  const S = D.screen;
  if (S?.kind === 'galleon') {
    const W = ctx.device.screen?.widgets || { w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 };
    return [0, 1, 2, 3].map((j) => ({ x: S.x + (j % 2) * W.pitchX + (W.insetX || 0), y: S.y + (j >> 1) * W.pitchY + (W.insetY || 0), w: W.w, h: W.h, kind: 'screen' }));
  }
  if (D.strip) { const w = D.strip.w / D.strip.segments; return Array.from({ length: D.strip.segments }, (_, j) => ({ x: D.strip.x + j * w, y: D.strip.y, w, h: D.strip.h, kind: 'strip' })); }
  if (S?.kind === 'infobar') return [{ x: S.x, y: S.y, w: S.w, h: S.h, kind: 'infobar' }];
  return [];
}

/** The Neo info bar: one line (round · score · money), with the deck's flash and dim. */
function infobarLine(p, view, fx, F, place) {
  p.background({ tone: 'idle' });
  const r = slotModel('round', view, fx), s = slotModel('score', view, fx), m = slotModel('money', view, fx);
  const parts = [r.value, s.value !== '—' ? s.value : null, m.value !== '—' ? m.value : null].filter(Boolean);
  const st = p.typeStyle('label');
  const size = Math.min(p.h * 0.42, st.size * 1.3);
  p.add(textPath(parts.join('  ·  '), { x: p.w / 2, y: p.h / 2 + size * 0.36, size, weight: st.weight, anchor: 'middle', maxWidth: p.w - p.m.text * 2, fill: p.colors.ink }));
  overlays(p, fx, place, F, { slot: 'round' });
}

/** Render the whole Game Link deck (shared with the span variant): instruments, scene, readouts, effects. */
export function renderDeck(ctx, { hud = false, sceneOnly = false, back = false } = {}) {
  const d = surface(ctx);
  if (ctx.kind === 'deck') d.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
  const view = gameLinkOf(ctx), tier = tierOf(ctx), fx = fxOf(view, tier);
  const { slots, readout } = sceneOnly ? { slots: ctx.grid.cells.map(() => 'scene'), readout: [] } : layoutOf(ctx, { hud, back });
  const cells = ctx.grid.cells;
  const reads = ctx.kind === 'deck' ? readoutRects(ctx) : [];
  const where = (slot) => { const i = slots.indexOf(slot); if (i >= 0) return mid(cells[i]); const j = readout.indexOf(slot); return j >= 0 && reads[j] && reads[j].kind !== 'infobar' ? mid(reads[j]) : null; };
  const F = fieldOf([...cells, ...reads], { keys: cells, origins: { kills: where('kills'), round: where('round'), health: where('health') }, K: Math.min(ctx.grid.key.w, ctx.grid.key.h) });
  const sceneCells = cells.filter((c, i) => slots[i] === 'scene');
  const scene = sceneOf(sceneCells, view, fx);
  cells.forEach((c, i) => {
    const slot = slots[i];
    const M = slotModel(slot, view, fx);
    const tone = slot === 'scene' ? 'off' : M.tone;
    keyInto(d, c, (q) => {
      keyInstrument(q, { ...M, tone }, fx);
      if (slot === 'scene') sceneKey(q, c, scene);
      overlays(q, fx, c, F, { slot });
    }, { hue: M.hue, tone, tag: `k${c.i}` });
  });
  reads.forEach((r, j) => {
    if (r.kind === 'infobar') { panelInto(d, r, (p) => infobarLine(p, view, fx, F, r), { kind: 'screen', tag: 'ib', hue: SLOT_HUE.round }); return; }
    // the match over: the readout becomes the final scoreboard (score, result, K / A / D, MVPs)
    const final = fx.phase === 'gameover' && reads.length >= 4 ? ['score', 'round', 'kda', 'mvp', 'money', 'kills'] : null;
    const slot = (final || readout)[j] || 'blank';
    const M = slotModel(slot, view, fx);
    const st = view.s?.stats;
    const meta = slot === 'money' && st && Number.isFinite(st.kills) && fx.face !== 'waiting' ? `K ${st.kills} · A ${st.assists ?? '—'} · D ${st.deaths ?? '—'}` : undefined;
    panelInto(d, r, (p) => { panelInstrument(p, M, fx, { meta }); overlays(p, fx, r, F, { slot }); }, { kind: r.kind, tag: `w${j}`, hue: M.hue, tone: M.tone });
  });
  return d.svg();
}

export default {
  id: 'gamelink-cs2-deck',
  title: 'CS2 Deck',
  category: 'Whole Deck',
  description: 'Counter-Strike 2 on the whole deck: vitals on keys and screens, plus flashbang whiteouts that disperse into the Spectrum, kill ripples, damage, death and round sweeps.',
  tags: ['cs2', 'counter-strike', 'game link', 'gsi', 'hud', 'flashbang', 'fps', 'gaming', 'live', 'prism'],
  surface: 'deck',
  data: ['gamelink'],
  dataShape: DATA_SHAPE,
  animated: true,
  fps: 12,
  loop: 60,
  still: 7.5,
  press: 'none',
  params: {
    effects: EFFECTS_PARAM,
    layout: { type: 'select', default: 'scene', options: ['scene', 'hud'], label: 'Layout (prism scene · all instruments)' },
    back: { type: 'bool', default: false, label: 'Leave the bottom-right key free (a Back key)' },   // the CS2 profiles (gamelink-fix)
  },
  order: 10,
  render(ctx) { return renderDeck(ctx, { hud: ctx.params.layout === 'hud', back: ctx.params.back === true }); },
};
