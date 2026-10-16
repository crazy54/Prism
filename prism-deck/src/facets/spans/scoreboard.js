// span-scoreboard — two teams across a row of keys, scored on split-flap cards. Tap a team's key
// to score: its digits flip. Hold it half a second and let go to take a point back (the key shows
// "−1" while you hold). With a target ("first to"), the winner's keys light and burst. Holding any
// key 1.5 s deals a new game (the host's reset).
// Layout by row width: 3 keys [A] vs [B] · 4 [A A][B B] · 5 [A A] vs [B B] · 7–8 [name A A] vs [B B name].
// Stateful (API 1.5 `game`); only the keys whose cards flip are re-sent.

import { surface, circle, rect, n } from '../../scene/index.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { materials, inCell, middleRow, rowCells } from './_d3-span.js';
import { flap, flapColors, text, burst, capHeight } from '../apps/_d7-kit.js';

const UNDO = 0.5, FLIP = 0.55;

/** Slots for n keys: side keys per team (outer → inner) and the middle. */
function plan(nKeys) {
  const side = nKeys >= 7 ? 3 : nKeys >= 4 ? 2 : 1;
  const mid = Math.max(0, nKeys - side * 2);
  const A = side === 3 ? [{ kind: 'name', team: 'a' }, { kind: 'd', team: 'a', place: 0 }, { kind: 'd', team: 'a', place: 1 }]
    : side === 2 ? [{ kind: 'd', team: 'a', place: 0, name: true }, { kind: 'd', team: 'a', place: 1 }] : [{ kind: 'pair', team: 'a', name: true }];
  const B = A.map((s) => ({ ...s, team: 'b' }));
  const B2 = side === 3 ? [B[1], B[2], B[0]] : side === 2 ? [{ ...B[0], name: true }, { ...B[1], name: false }] : B;
  if (side === 2) { A[0].name = true; B2[0].name = false; B2[1].name = true; }
  const M = Array.from({ length: mid }, (_, i) => ({ kind: i === 0 ? 'vs' : 'blank' }));
  return [...A, ...M, ...B2].slice(0, nKeys);
}

export default {
  id: 'span-scoreboard',
  title: 'Scoreboard',
  category: 'Text & Marquee',
  description: 'Two teams on split-flap cards across a row: tap a team to score, hold half a second to take one back, first-to target lights the winner.',
  tags: ['score', 'scoreboard', 'game night', 'tally', 'split flap', 'teams', 'counter', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  animated: false,
  fps: 10,
  loop: 2,
  params: {
    teamA: { type: 'text', default: 'Home', maxLength: 10, label: 'Team A' },
    teamB: { type: 'text', default: 'Away', maxLength: 10, label: 'Team B' },
    hueA: { type: 'hue', default: 243.6, min: 0, max: 360, label: 'Team A hue' },
    hueB: { type: 'hue', default: 34.2, min: 0, max: 360, label: 'Team B hue' },
    to: { type: 'number', default: 0, min: 0, max: 99, step: 1, label: 'First to (0 = no target)' },
  },
  game: {
    animate: 1,
    init({ grid }) { return { a: 0, b: 0, cols: grid.cols, down: null }; },
    reduce(s, ev) {
      if (ev.type === 'press') {
        if (ev.col === undefined || ev.col === null) return s;
        const slot = plan(s.cols)[ev.col];
        if (!slot || !slot.team) return s;
        return { ...s, down: { team: slot.team, t: ev.t } };
      }
      if (ev.type === 'release' && s.down) {
        const held = ev.t - s.down.t;
        const team = s.down.team;
        const v = Math.max(0, Math.min(99, s[team] + (held >= UNDO ? -1 : 1)));
        return { ...s, [team]: v, down: null };
      }
      return s;
    },
  },
  order: 26,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const C = T.colors;
    const cells = rowCells(grid, middleRow(grid));
    const slots = plan(cells.length);
    const s = ctx.game || { a: 0, b: 0, down: null };
    const prev = ctx.gamePrev;
    const ev = ctx.gameEvent;
    const age = ev ? ev.age : 99;
    const P = ctx.params;
    const to = P.to;
    const winner = to > 0 ? (s.a >= to ? 'a' : s.b >= to ? 'b' : null) : null;
    const lead = s.a === s.b ? null : s.a > s.b ? 'a' : 'b';
    materials(k, { toneOf: (c) => { const sl = slots[cells.indexOf(c)]; return sl?.team && sl.team === winner ? 'ok' : 'idle'; } });
    const F = flapColors(k);
    const hueOf = { a: P.hueA, b: P.hueB };
    const nameOf = { a: P.teamA, b: P.teamB };
    cells.forEach((cell, i) => {
      const slot = slots[i];
      if (!slot) return;
      inCell(k, cell, (kk) => {
        const u = kk.m.u;
        const pad = kk.m.safe * 0.8;
        const team = slot.team;
        const tint = team ? T.spectral(hueOf[team]) : C.muted;
        const deep = team ? T.spectral(hueOf[team], { tier: 'ink' }) : C.muted;
        const ink = kk.dark ? tint : deep;
        if (slot.kind === 'vs') {
          text(kk, winner ? 'WIN' : 'VS', { cy: kk.h * 0.46, size: 15 * u, weight: 700, tracking: 0.1, color: winner ? 'pos' : 'muted' });
          text(kk, to > 0 ? `to ${to}` : lead ? `${nameOf[lead]} leads` : 'tied', { cy: kk.h * 0.7, size: 8 * u, weight: 600, color: 'dim', maxWidth: kk.w - kk.m.text * 2, minSize: 6.5 * u });
          return;
        }
        if (slot.kind === 'blank') return;
        if (slot.kind === 'name') {
          const r = Math.min(kk.w, kk.h) * 0.16;
          kk.add(circle({ cx: n(kk.w / 2), cy: n(kk.h * 0.38), r: n(r), fill: tint }));
          if (lead === team || winner === team) kk.add(circle({ cx: n(kk.w / 2), cy: n(kk.h * 0.38), r: n(r * 1.55), fill: 'none', stroke: tint, strokeWidth: n(Math.max(1, u)), strokeOpacity: 0.6 }));
          text(kk, nameOf[team], { cy: kk.h * 0.72, size: 12 * u, weight: 700, color: ink, maxWidth: kk.w - kk.m.text * 1.6, minSize: 7 * u });
          return;
        }
        // score cards
        const val = s[team], was = prev ? prev[team] : val;
        const str = String(val).padStart(2, '0'), pstr = String(was).padStart(2, '0');
        const flipping = ev && ev.type === 'release' && val !== was && !ctx.reduced;
        const p = flipping ? clamp(age / FLIP) * 1.25 : 9;
        const nameH = slot.name ? 10 * u : 0;
        const x = pad, y = pad + nameH, cw = kk.w - pad * 2, ch = kk.h - pad * 2 - nameH;
        const cur = slot.kind === 'pair' ? str : str[slot.place];
        const prv = slot.kind === 'pair' ? pstr : pstr[slot.place];
        const size = slot.kind === 'pair' ? Math.min(ch * 0.66, cw * 0.72) : Math.min(ch * 0.8, cw * 1.25);
        flap(kk, { x, y, w: cw, h: ch, r: kk.m.radius * 0.6, prev: prv, cur, p, size, weight: 700, tag: `s${cell.i}`, colors: F });
        // the team's color edge under the card
        kk.add(rect({ x: n(x + cw * 0.2), y: n(y + ch - Math.max(1.5, 1.6 * u)), width: n(cw * 0.6), height: n(Math.max(1.5, 1.6 * u)), rx: n(u), fill: tint }));
        if (slot.name) text(kk, nameOf[team], { x: kk.w / 2, y: pad + capHeight(8 * u, 600) + u * 0.5, size: 8 * u, weight: 600, caps: true, tracking: 0.1, color: ink, maxWidth: kk.w - kk.m.text * 1.6, minSize: 6.5 * u });
        // holding a team's key: the take-back hint
        if (s.down && s.down.team === team && ev?.type === 'press' && age > 0.18) {
          const o = clamp((age - 0.18) / 0.25);
          const undo = age >= UNDO;
          kk.add(rect({ x: n(x), y: n(y), width: n(cw), height: n(ch), rx: n(kk.m.radius * 0.6), fill: undo ? C.warn : tint, fillOpacity: n(0.22 * o, 3) }));
          if (slot.kind === 'pair' || slot.place === 1) text(kk, undo ? '−1' : '+1', { x: x + cw - 3 * u, y: y + 11 * u, size: 10 * u, anchor: 'end', weight: 700, color: undo ? C.warn : ink, opacity: o });
        }
        if (winner === team && ev && ev.type === 'release' && prev && prev[team] < to) kk.add(burst(kk, { cx: kk.w / 2, cy: kk.h / 2, r0: cw * 0.15, r1: cw * 0.7, age: age - 0.3, dur: 1, count: 10, hue: hueOf[team] }));
      }, `sb${cell.i}`);
    });
    void mix; void outExpo;
    return k.svg();
  },
};
