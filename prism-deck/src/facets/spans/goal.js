// span-goal — a stream goal as a row of glass tanks, one key per milestone. The goal fills like
// light poured left to right: full tanks wear a check, the current tank holds the count over a
// liquid surface that sloshes as it arrives and then settles flat, and the last tank shows the
// target. Reach it and every tank flashes with a burst of the Spectrum. Count and target are
// params (a runtime or MCP tool updates them); static once settled — only the tanks that change
// are re-sent.

import { surface, rect, path, n, P, linearGradient, url } from '../../scene/index.js';
import { clamp, outExpo, lerp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { materials, inCell, middleRow, rowCells } from './_d3-span.js';
import { text, burst, capHeight } from '../apps/_d7-kit.js';
import { compact, measureText } from '../../scene/text.js';

const FILL = 1.6, SETTLE = 2.6;

export default {
  id: 'span-goal',
  title: 'Goal Tanks',
  category: 'Bars & Meters',
  description: 'A stream goal across a row of keys: a glass tank per milestone fills with light, a burst when you reach it. You set the count (no supporter or donation source yet).',
  tags: ['goal', 'milestone', 'progress', 'stream', 'streaming', 'broadcast', 'creator', 'supporters', 'followers', 'donation', 'meter', 'span', 'obs-style'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  fps: 8,
  loop: 6,
  params: {
    label: { type: 'text', default: 'Goal', maxLength: 14, label: 'Label' },
    current: { type: 'number', default: 412, min: 0, max: 1000000, step: 1, label: 'Count' },
    target: { type: 'number', default: 500, min: 1, max: 1000000, step: 1, label: 'Target' },
    unit: { type: 'text', default: 'supporters', maxLength: 14, label: 'Unit' },
    hue: { type: 'hue', default: 165.1, min: 0, max: 360, label: 'Hue' },
  },
  order: 33,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const C = T.colors;
    const cells = rowCells(grid, middleRow(grid));
    const N = cells.length;
    const P0 = ctx.params;
    const goal = Math.max(1, P0.target), count = Math.max(0, P0.current);
    const pTrue = clamp(count / goal);
    const reached = count >= goal;
    const since = ctx.reduced ? 99 : ctx.since;
    const pNow = pTrue * outExpo(clamp(since / FILL));
    const slosh = ctx.reduced ? 0 : Math.exp(-since / 0.7) * (since < SETTLE ? 1 : 0);
    materials(k, { toneOf: (c) => (reached ? 'ok' : 'idle') });
    const hue = ctx.hue;
    const liquidTop = T.spectral(hue + 24), liquidBot = T.spectral(hue - 30);
    const curI = Math.max(0, Math.min(N - 1, Math.floor(pNow * N - 1e-9)));
    cells.forEach((cell, i) => {
      inCell(k, cell, (kk) => {
        const u = kk.m.u;
        const fc = clamp(pNow * N - i);                       // this tank's fill
        const full = fc >= 0.999;
        const tx = kk.m.safe, tw = kk.w - kk.m.safe * 2;
        const ty = kk.m.text + capHeight(kk.typeStyle('eyebrow').size, 600) + 3.5 * u, th = kk.h - ty - kk.m.safe;
        const r = Math.min(kk.m.radius * 0.7, tw / 4);
        const tank = P().M(tx, ty + r).A(r, r, 0, 0, 1, tx + r, ty).H(tx + tw - r).A(r, r, 0, 0, 1, tx + tw, ty + r).V(ty + th - r).A(r, r, 0, 0, 1, tx + tw - r, ty + th).H(tx + r).A(r, r, 0, 0, 1, tx, ty + th - r).Z().d;
        kk.add(path(tank, { fill: kk.dark ? mix(C.surface2, '#000000', 0.35) : mix(C.surface2, C.line, 0.3), stroke: C.line, strokeWidth: n(Math.max(1, u * 0.8)) }));
        if (fc > 0.002) {
          const gid = kk.id('liq');
          kk.def(linearGradient(gid, [[0, liquidTop], [1, liquidBot]], { x1: 0, y1: n(ty), x2: 0, y2: n(ty + th), gradientUnits: 'userSpaceOnUse' }));
          const cid = kk.id('tank');
          kk.def(`<clipPath id="${cid}"><path d="${tank}"/></clipPath>`);
          const level = ty + th * (1 - fc);
          // the surface: a sine that sloshes on arrival and settles flat
          const amp = !full ? th * 0.06 * slosh : 0;
          const lp = P();
          const steps = amp > 0.05 ? 10 : 1;
          lp.M(tx, ty + th);
          for (let s = 0; s <= steps; s++) { const x = tx + (tw * s) / steps; lp.L(x, level + amp * Math.sin((s / steps) * Math.PI * 2 + since * 9 + i)); }
          lp.L(tx + tw, ty + th).Z();
          kk.add(`<g clip-path="url(#${cid})">${path(lp.d, { fill: url(gid), fillOpacity: kk.dark ? 0.92 : 0.85 })}${!full ? rect({ x: n(tx), y: n(level - Math.max(0.6, u * 0.5)), width: n(tw), height: n(Math.max(1, u)), fill: kk.dark ? '#ffffff' : C.ink, fillOpacity: 0.55 }) : ''}</g>`);
        }
        // the milestone: label on the first tank, the milestone value on the others, a check once full
        const mile = Math.round((goal * (i + 1)) / N);
        const eb = i === 0 ? P0.label : (full ? `✓ ${compact(mile)}` : compact(mile));
        kk.eyebrow(i === 0 && full ? `${P0.label} ✓` : eb, { color: full ? 'pos' : 'muted', maxWidth: kk.w - kk.m.text * 2 });
        // the count on the current tank, the target on the last
        if (i === curI || (reached && i === N - 1)) {
          const big = Math.min(kk.w, kk.h) >= 110;
          const cy = ty + th * 0.48;
          const shown = Math.round(count * outExpo(clamp(since / FILL)));
          const size = (big ? 21 : 18) * u, str = compact(shown);
          const pw = Math.min(tw - u * 3, measureText(str, { size, weight: 700, tabular: true }) + 8 * u), ph = size * 1.05;
          // a smoked-glass pill keeps the count legible over the light
          kk.add(rect({ x: n(kk.w / 2 - pw / 2), y: n(cy - ph / 2), width: n(pw), height: n(ph), rx: n(ph / 2), fill: kk.dark ? '#000000' : C.surface, fillOpacity: kk.dark ? 0.5 : 0.72 }));
          text(kk, str, { x: kk.w / 2, cy, size, weight: 700, tabular: true, color: 'ink', maxWidth: tw - u * 5 });
          if (big) text(kk, reached ? P0.unit : `of ${compact(goal)}`, { x: kk.w / 2, cy: cy + ph / 2 + 6 * u, size: 7.5 * u, weight: 600, color: kk.dark ? '#ffffff' : C.ink, opacity: 0.85, maxWidth: tw - u * 4 });
        }
        if (reached) kk.add(burst(kk, { cx: kk.w / 2, cy: ty + th * 0.45, r0: tw * 0.12, r1: tw * 0.62, age: since - FILL * 0.6 - i * 0.08, dur: 1.1, count: 10, hue: hue + i * 30 }));
      }, `g${cell.i}`);
    });
    void lerp;
    return k.svg();
  },
};
