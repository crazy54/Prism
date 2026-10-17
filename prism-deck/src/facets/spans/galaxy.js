// span-galaxy — a spiral galaxy turning slowly across the whole device. A warm core sits in
// the middle of the deck; two arms of blue-white stars wind out through every key, beaded
// with rose-pink star-forming knots and edged by dark dust, all inclined so the disc fits
// the deck's shape (tall on the Galleon, a long ellipse on the Stream Deck +). By Day it's an
// engraving in a star atlas: ink stipple on the theme's paper.
//
// One turn a loop (90 s): every key changes a little each frame, so it runs at the device
// budget's 1–4 fps — a degree or two a frame, which reads as a slow, stately turn.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, lit, dotD, f1, rectD } from './_d6-wall.js';

const LOOP = 90, TAU = Math.PI * 2;

/** Gaussian-ish from two hashes (deterministic). */
const gauss = (a, b) => Math.sqrt(-2 * Math.log(Math.max(1e-6, a))) * Math.cos(TAU * b);

export default {
  id: 'span-galaxy',
  title: 'Galaxy',
  category: 'Whole Device',
  description: 'A spiral galaxy turning slowly across the device: a warm core mid-deck, blue-white arms beaded with rose knots winding through every key; a star-atlas engraving by day.',
  tags: ['galaxy', 'spiral', 'space', 'stars', 'cosmos', 'astronomy', 'calm', 'ambient', 'wall'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    stars: { type: 'number', default: 1, min: 0.5, max: 1.8, step: 0.1, label: 'Stars' },
    arms: { type: 'select', default: 2, options: [2, 3, 4], label: 'Arms' },
    budget: BUDGET,
  },
  order: 66,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 36 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const sp = (hh, o) => T.spectral(hh, o);
    const space = dark ? mix(T.colors.bg, '#000000', 0.4) : T.colors.surface;
    // the core sits in the key nearest the middle (never behind a bezel)
    const mid = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
    const cx = mid.x + mid.w / 2, cy = mid.y + mid.h / 2;
    // the disc's projection: radius to the far side, and the inclination that fits the deck
    const tall = h > w;
    // big enough that the arms reach the farthest key from the core; inclined to the deck's shape
    const reach = Math.max(...cells.map((c) => Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy)));
    const sx = tall ? 0.86 : 1, sy = tall ? 1 : 0.62;
    const R = reach * 1.08 / Math.max(0.62, Math.min(sx, sy) + 0.2);
    const rot = (t / LOOP) * TAU;
    backdrop(k, [[0, dark ? mix(space, sp(270), flat ? 0 : 0.1) : space, 0.95], [1, space, 0.95]], { radial: { cx, cy, r: Math.hypot(w, h) / 2 } });
    // the core's glow
    const core = flat ? lit(T) : dark ? mix(sp(70, { dl: 0.1 }), '#ffffff', 0.45) : mix(sp(60), T.colors.ink, 0.35);
    const gid = k.id('core');
    k.def(radialGradient(gid, [[0, core, dark ? 0.9 : 0.6], [0.2, core, dark ? 0.45 : 0.3], [0.5, core, dark ? 0.12 : 0.08], [1, core, 0]], { cx: f1(cx), cy: f1(cy), r: f1(R * 0.55), fx: f1(cx), fy: f1(cy), gradientTransform: `translate(${f1(cx)} ${f1(cy)}) scale(${f1(sx * 1.1)} ${f1(sy * 1.1)}) translate(${f1(-cx)} ${f1(-cy)})`, gradientUnits: 'userSpaceOnUse' }));
    for (const c of cells) if (Math.hypot((c.x + c.w / 2 - cx) / sx, (c.y + c.h / 2 - cy) / sy) < R * 0.55 + c.w) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(gid)}"/>`);
    // the disc's own diffuse light, out to the rim (one inclined gradient, a rect per key)
    const did = k.id('disc');
    const discC = flat ? lit(T) : dark ? mix(sp(230, { dl: 0.06 }), '#ffffff', 0.35) : mix(sp(235), T.colors.surface, 0.2);
    k.def(radialGradient(did, [[0, discC, dark ? 0.2 : 0.16], [0.45, discC, dark ? 0.09 : 0.08], [0.8, discC, dark ? 0.03 : 0.03], [1, discC, 0]], { cx: f1(cx), cy: f1(cy), r: f1(R), fx: f1(cx), fy: f1(cy), gradientTransform: `translate(${f1(cx)} ${f1(cy)}) scale(${f1(sx)} ${f1(sy)}) translate(${f1(-cx)} ${f1(-cy)})`, gradientUnits: 'userSpaceOnUse' }));
    for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(did)}"/>`);
    const B = new Batch(grid);
    const P = (r, a) => [cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy];
    // a still field of background stars
    const bg = lit(T);
    for (const c of cells) {
      let d = '';
      for (let j = 0; j < 7; j++) d += dotD(c.x + c.w * hash(c.i, j, 1), c.y + c.h * hash(c.i, j, 2), Math.max(0.6, u * 0.4 * (0.6 + hash(c.i, j, 3))));
      B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(bg, dark ? 0.35 : 0.25), d, 0);
    }
    // the arms' diffuse light under the stars: wide soft strokes along each spiral (three widths
    // per layer, so the segments inside one key merge into a path)
    const armsN = Number(ctx.params.arms) || 2;
    const armA = (r, arm) => rot + (arm / armsN) * TAU + Math.log(r / (R * 0.05)) / 0.32 * 0.34;
    const haze = flat ? lit(T) : dark ? mix(sp(230, { dl: 0.06 }), '#ffffff', 0.3) : mix(sp(240), T.colors.surface, 0.3);
    for (let arm = 0; arm < armsN; arm++) {
      for (const [wid, op] of [[0.62, 0.035], [0.42, 0.04], [0.25, 0.05], [0.11, 0.06]]) {
        let prev = null;
        for (let s2 = 0; s2 <= 36; s2++) {
          const f = 0.08 + 0.9 * (s2 / 36), r = R * f, pt = P(r, armA(r, arm));
          if (prev) { const ww = K * wid * (1.4 + 0.8 * Math.round(f * 2) / 2); B.seg(prev[0], prev[1], pt[0], pt[1], ww, strokeP(haze, ww, op * 1.1), 0); }
          prev = pt;
        }
      }
    }
    // arm stars: log spirals with scatter; brighter and bluer outward, warmer inward
    const arms = armsN;
    const N = Math.round(((w * h) / (K * K)) * 46 * ctx.params.stars);
    const blue = flat ? lit(T) : dark ? mix(sp(225, { dl: 0.1 }), '#ffffff', 0.5) : mix(sp(240), T.colors.ink, 0.45);
    const warm = flat ? lit(T) : dark ? mix(sp(65, { dl: 0.1 }), '#ffffff', 0.4) : mix(sp(50), T.colors.ink, 0.4);
    const rose = flat ? lit(T) : dark ? sp(345, { dl: 0.08 }) : sp(345, { tier: 'ink' });
    const dust = dark ? mix(space, '#000000', 0.2) : mix(T.colors.surface, T.colors.ink, 0.08);
    const pitch = 0.32;                                  // tan of the arms' pitch angle
    for (let i = 0; i < N; i++) {
      const arm = i % arms;
      const f = Math.pow(hash(i, ctx.seed, 1), 0.6);   // 0 = core, 1 = rim (outer disc well filled)
      const r = R * (0.05 + 0.95 * f);
      const spread = 0.1 + 0.3 * (1 - f) + (i % 5 === 0 ? 0.5 : 0);  // a fifth scatter into the disc
      const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 + gauss(hash(i, 2), hash(i, 3)) * spread;
      const rr = r * (1 + gauss(hash(i, 4), hash(i, 5)) * 0.05);
      const [x, y] = P(rr, a);
      if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
      const big = hash(i, 6) > 0.93;
      const sz = Math.max(0.7, u * (big ? 1.2 : 0.5 + 0.4 * hash(i, 7)));
      const col = f < 0.28 ? warm : blue;
      const op = clamp(0.45 + 0.55 * hash(i, 8)) > 0.75 ? 1 : 0.6;
      B.dot(x, y, sz, fillP(col, dark ? op : op * 0.85), 1);
    }
    // rose knots along the arms, and dust lanes on their inner edges
    const knots = Math.round(((w * h) / (K * K)) * 2.5);
    for (let i = 0; i < knots; i++) {
      const arm = i % arms, f = 0.3 + 0.65 * hash(i, 31);
      const r = R * f;
      const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 + (hash(i, 32) - 0.5) * 0.16;
      const [x, y] = P(r, a);
      B.dot(x, y, Math.max(0.9, u * (0.9 + 0.8 * hash(i, 33))), fillP(rose, dark ? 0.9 : 0.8), 2);
      if (dark) B.dot(x, y, u * 3, fillP(rose, 0.12), 1);
    }
    for (let arm = 0; arm < arms && !flat; arm++) {
      for (let s = 0; s < 70; s++) {
        const f = 0.12 + 0.75 * (s / 70), r = R * f;
        const a = rot + (arm / arms) * TAU + Math.log(r / (R * 0.05)) / pitch * 0.34 - 0.22;
        const [x, y] = P(r, a);
        B.dot(x, y, K * (0.016 + 0.02 * (1 - f)), fillP(dust, dark ? 0.4 : 0.35), 3);
      }
    }
    // the nucleus
    B.dot(cx, cy, Math.max(1.5, K * 0.035), fillP(dark ? '#ffffff' : flat ? lit(T) : core, 0.95), 4);
    B.emit(k);
    return k.svg();
  },
};
