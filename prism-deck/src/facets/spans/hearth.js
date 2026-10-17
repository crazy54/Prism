// span-hearth — a fire in the hearth, the whole device for its firebox. Logs lie across the
// bottom row (their cracks glowing), tongues of flame climb from them through the bezel into
// the row above, sparks drift up and wink out, and the soot-dark brick behind is lit warm
// from below. By day it is a paper-cut fire: flat layers of vermilion, orange and gold on the
// theme's light material, logs in ink.
//
// Budget: only the flame rows change every frame (the brick, logs and glow are still or
// change in rare quantized steps), so the fire runs at 2–5 fps — a slow, rolling fire.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix, shade } from '../../scene/color.js';
import { clamp } from '../../scene/easing.js';
import { hash, noise1 } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, f1, clipPoly, lit } from './_d6-wall.js';

const LOOP = 24, TAU = Math.PI * 2;

/** One tongue of flame as a polygon: base center (x, y), height H, half-width W, sway s (px at the tip). */
function tongue(x, y, H, W, s, ph) {
  const L = [], R = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const cx = x + s * f * f + Math.sin(f * 5.5 + ph) * W * 0.35 * f;
    const hw = W * Math.pow(1 - f, 0.75) * (1 + 0.18 * Math.sin(f * 9 + ph * 1.7)) * (f < 0.12 ? 0.75 + f * 2 : 1);
    L.push([cx - hw, y - H * f]);
    R.unshift([cx + hw, y - H * f]);
  }
  return [...L, ...R.slice(1)];
}

export default {
  id: 'span-hearth',
  title: 'Hearth',
  category: 'Whole Device',
  description: 'A fire in the hearth across the whole device: logs on the bottom row, flames climbing through the bezel into the keys above, sparks drifting up, warm light on the brick.',
  tags: ['fire', 'fireplace', 'hearth', 'flames', 'cozy', 'warm', 'ambient', 'wall', 'calm', 'winter'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 5,
  loop: LOOP,
  params: {
    blaze: { type: 'number', default: 1, min: 0.5, max: 1.5, step: 0.05, label: 'Blaze' },
    sparks: { type: 'bool', default: true, label: 'Sparks' },
    budget: BUDGET,
  },
  order: 62,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const bottom = grid.row + grid.rows - 1;
    const floorCells = cells.filter((c) => c.row === bottom);
    const { t } = frameClock(ctx, { fps: 5, changing: Math.min(cells.length, grid.cols * Math.min(2, grid.rows) + 2 + Math.ceil(grid.cols * grid.rows * 0.25)), still: 9.6 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const sp = (hh, o) => T.spectral(hh, o);
    const blaze = ctx.params.blaze;
    // the firebox (Night) / the room's light material warmed from below (Day)
    const soot = dark ? mix(T.colors.bg, sp(30), flat ? 0 : 0.06) : mix(T.colors.surface, sp(60), flat ? 0 : 0.1);
    const warm = dark ? mix(T.colors.bg, sp(35), flat ? 0 : 0.32) : mix(T.colors.surface, sp(45), flat ? 0 : 0.34);
    backdrop(k, [[0, soot, dark ? 0.94 : 0.75], [0.55, soot, dark ? 0.94 : 0.75], [1, warm, dark ? 0.94 : 0.85]], { y2: h });
    // firelight: a big glow from the logs, its strength stepping slowly (rarely changes a key)
    const lvl = 0.85 + 0.15 * Math.round(noise1(Math.floor(t / 2) * 0.9, ctx.seed) * 3) / 3;
    const gl = k.id('glow');
    const glowC = sp(48, { dl: dark ? 0.04 : 0 });
    const fy = floorCells[0].y + floorCells[0].h * 0.72;
    k.def(radialGradient(gl, [[0, glowC, n2((dark ? 0.5 : 0.32) * lvl * blaze)], [0.45, glowC, n2((dark ? 0.16 : 0.1) * lvl * blaze)], [1, glowC, 0]], { cx: f1(w / 2), cy: f1(fy), r: f1(Math.max(w * 0.7, K * 2.6)), fx: f1(w / 2), fy: f1(fy), gradientUnits: 'userSpaceOnUse' }));
    for (const c of cells) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(gl)}"/>`);
    const B = new Batch(grid);
    // brick (static): staggered courses, mortar as hairlines, fainter toward the top
    const course = K / 4.2, brick = course * 2.3;
    const mortar = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(30), 0.5) : mix(T.colors.ink, sp(40), 0.3);
    for (const c of cells) {
      let d = '';
      const r0 = Math.ceil(c.y / course), r1 = Math.floor((c.y + c.h) / course);
      for (let r = r0; r <= r1; r++) {
        const y = r * course;
        if (y > c.y && y < c.y + c.h) d += `M${f1(c.x)} ${f1(y)}h${f1(c.w)}`;
        const off = (r % 2) * brick / 2;
        for (let x = Math.ceil((c.x - off) / brick) * brick + off; x < c.x + c.w; x += brick) if (x > c.x) d += `M${f1(x)} ${f1(Math.max(c.y, y))}V${f1(Math.min(c.y + c.h, y + course))}`;
      }
      const fade = 0.35 + 0.65 * clamp((c.y + c.h / 2) / h);
      B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(mortar, Math.max(0.8, u * 0.7), (dark ? 0.32 : 0.16) * fade, 'butt'), d, 0);
    }
    // logs across the bottom row, in front of the fire (static), with ember cracks that glow in quantized steps
    const logC = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(40), 0.22) : mix(T.colors.ink, sp(45), 0.35);
    const logHi = flat ? logC : dark ? mix(T.colors.bg, sp(45), 0.35) : mix(T.colors.ink, sp(50), 0.15);
    const ember = sp(32, { dl: dark ? 0.06 : -0.02 });
    const fx0 = floorCells[0].x, fx1 = floorCells[floorCells.length - 1].x + floorCells[floorCells.length - 1].w;
    const logs = [];
    const nLogs = Math.max(2, Math.round(floorCells.length * 0.9));
    for (let i = 0; i < nLogs; i++) {
      const cx = fx0 + (fx1 - fx0) * ((i + 0.5) / nLogs) + (hash(i, 61) - 0.5) * K * 0.3;
      const len = Math.min((fx1 - fx0) / nLogs * 1.5, K * 1.6), th = K * (0.15 + 0.04 * hash(i, 62));
      const tilt = (hash(i, 63) - 0.5) * 0.35;
      const cy = floorCells[0].y + floorCells[0].h * (0.86 - (i % 2) * 0.1);
      logs.push({ cx, cy, len, th, tilt });
    }
    for (const L of logs) {
      const ca = Math.cos(L.tilt), sa = Math.sin(L.tilt);
      const P = (lx, ly) => [L.cx + lx * ca - ly * sa, L.cy + lx * sa + ly * ca];
      const hl = L.len / 2, ht = L.th / 2;
      const body = [];
      for (let s = 0; s <= 6; s++) { const a = -Math.PI / 2 + (s / 6) * Math.PI; body.push(P(hl + Math.cos(a) * ht * 0.6, Math.sin(a) * ht)); }
      for (let s = 0; s <= 6; s++) { const a = Math.PI / 2 + (s / 6) * Math.PI; body.push(P(-hl + Math.cos(a) * ht * 0.6, Math.sin(a) * ht)); }
      B.poly(body, fillP(logC, flat ? (dark ? 0.3 : 0.85) : 1), 8);
      B.poly([P(-hl * 0.9, -ht * 0.95), P(hl * 0.9, -ht * 0.95), P(hl * 0.9, -ht * 0.55), P(-hl * 0.9, -ht * 0.55)], fillP(logHi, 0.9), 8);
      // the glowing cracks
      let d = '';
      for (let j = 0; j < 3; j++) {
        const lx = -hl * 0.6 + j * hl * 0.6 + (hash(j, L.cx | 0) - 0.5) * hl * 0.2;
        const [ax, ay] = P(lx, -ht * 0.3), [bx, by] = P(lx + ht * 0.6, ht * 0.4);
        d += `M${f1(ax)} ${f1(ay)}L${f1(bx)} ${f1(by)}`;
      }
      const pulse = Math.round((0.6 + 0.4 * noise1(t * 0.4 + L.cx * 0.01, ctx.seed)) * 3) / 3;
      B.add([L.cx - hl - ht, L.cy - ht * 2, L.cx + hl + ht, L.cy + ht * 2], strokeP(ember, Math.max(1, u * 1.3), pulse), d, 9);
    }
    // flames
    const outer = flat ? (dark ? '#ffffff' : T.colors.ink) : shade(sp(30), dark ? -0.1 : -0.06);
    const mid = flat ? outer : sp(50, { dl: dark ? 0.02 : 0 });
    const core = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(sp(80, { dl: 0.1 }), '#ffffff', 0.55) : sp(80, { dl: 0.04 });
    const base = floorCells[0].y + floorCells[0].h * 0.8;
    const nF = Math.max(4, Math.round((fx1 - fx0) / (K * 0.5)));
    const Hmax = Math.min(h * (grid.rows <= 2 ? 0.78 : 0.62), K * 2.6);
    // the bed of fire along the logs: one wavy sheet per layer, so the tongues rise out of a body of flame
    const bed = (lift, amp, ph) => {
      const pts = [[fx0 - K * 0.2, base + K * 0.1]];
      for (let x = fx0 - K * 0.2; x <= fx1 + K * 0.2; x += K * 0.06) pts.push([x, base - lift - amp * Math.pow(noise1(x / K * 4.2 + t * 0.9 + ph, ctx.seed), 2.2)]);
      pts.push([fx1 + K * 0.2, base + K * 0.1]);
      return pts;
    };
    const bedPolys = [[bed(K * 0.12, K * 0.42, 0), 4], [bed(K * 0.05, K * 0.26, 7), 5]];
    for (let i = 0; i < nF; i++) {
      const x = fx0 + (fx1 - fx0) * ((i + 0.5 + (hash(i, 71) - 0.5) * 0.5) / nF);
      const n1 = noise1(t * 0.9 + i * 3.1, ctx.seed), n2v = noise1(t * 1.3 + i * 1.7 + 40, ctx.seed);
      const tall = (0.35 + 0.65 * hash(i, 72) ** 1.2) * (i % 3 === 1 ? 1 : 0.8);
      const H = Hmax * tall * (0.7 + 0.42 * n1) * blaze;
      const W = Math.max(K * 0.12, H * 0.2) * (0.85 + 0.3 * hash(i, 73)) * (0.85 + 0.25 * n2v);
      const s = (n2v - 0.5) * H * 0.3;
      const ph = t * 2.2 + i * 1.3;
      B.poly(tongue(x, base, H, W, s, ph), fillP(outer, dark ? 0.92 : 1), 4);
      B.poly(tongue(x + s * 0.1, base, H * 0.72, W * 0.66, s * 0.8, ph + 0.4), fillP(mid, 0.95), 5);
      B.poly(tongue(x + s * 0.12, base, H * 0.42, W * 0.36, s * 0.55, ph + 0.9), fillP(core, flat ? 0.6 : 0.95), 6);
    }
    // the bed, split per key so each slice holds only its own part
    for (const [pts, layer] of bedPolys) {
      const paint = layer === 4 ? fillP(outer, dark ? 0.92 : 1) : layer === 5 ? fillP(mid, 0.95) : fillP(core, flat ? 0.6 : 0.95);
      for (const c of floorCells) { const cl = clipPoly(pts, c); if (cl.length > 2) B.poly(cl, paint, layer); }
    }
    // sparks rising out of the fire, drifting and winking out
    if (ctx.params.sparks) {
      const sparkC = dark ? mix(sp(55, { dl: 0.1 }), '#ffffff', 0.35) : flat ? T.colors.ink : sp(35, { dl: -0.04 });
      const nS = Math.max(3, Math.round(grid.cols * (1.2 + grid.rows * 0.4)));
      for (let j = 0; j < nS; j++) {
        const m = 2 + (j % 3), f = (((t / LOOP) * m + hash(j, 81)) % 1 + 1) % 1;
        if (f > 0.7) continue;
        const life = f / 0.7;
        const x = fx0 + (fx1 - fx0) * hash(j, 82, Math.floor((t / LOOP) * m + hash(j, 81))) + Math.sin(life * 7 + j) * K * 0.2;
        const y = base - K * 0.6 - life * (h * 0.9);
        const r = Math.max(0.9, K * 0.016 * (1 - life * 0.6));
        B.dot(x, y, r, fillP(sparkC, Math.round((1 - life) * 4) / 4), 10);
      }
    }
    // tall decks (3+ rows): the mantel above the firebox, with a pair of candles on it
    if (grid.rows >= 3) {
      const mRow = grid.row + grid.rows - 3;
      const shelf = cells.filter((c) => c.row === mRow).sort((a, b) => a.col - b.col);
      const wood = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(40), 0.4) : mix(T.colors.ink, sp(45), 0.45);
      const woodHi = flat ? wood : dark ? mix(T.colors.bg, sp(50), 0.62) : mix(T.colors.ink, sp(55), 0.2);
      const sy = shelf[0].y + shelf[0].h * 0.74, sh = K * 0.13;
      for (const c of shelf) {
        B.add([c.x, sy, c.x + c.w, sy + sh * 1.6], fillP(dark ? '#000000' : T.colors.ink, dark ? 0.35 : 0.12), `M${f1(c.x)} ${f1(sy + sh)}h${f1(c.w)}v${f1(sh * 0.6)}h${f1(-c.w)}Z`, 11);
        B.add([c.x, sy, c.x + c.w, sy + sh], fillP(wood, flat ? (dark ? 0.3 : 0.85) : 1), `M${f1(c.x)} ${f1(sy)}h${f1(c.w)}v${f1(sh)}h${f1(-c.w)}Z`, 12);
        B.add([c.x, sy, c.x + c.w, sy + sh], fillP(woodHi, 1), `M${f1(c.x)} ${f1(sy)}h${f1(c.w)}v${f1(Math.max(1, sh * 0.22))}h${f1(-c.w)}Z`, 13);
      }
      const holders = shelf.length >= 3 ? [shelf[0], shelf[shelf.length - 1]] : [shelf[0]];
      const waxC = dark ? '#efe4cf' : '#fff8ec', flame = sp(45, { dl: dark ? 0.06 : 0 });
      holders.forEach((c, j) => {
        const x = c.x + c.w * (j ? 0.3 : 0.7), cw = K * 0.06, ch = K * 0.3;
        const fl = 0.85 + 0.15 * Math.round(noise1(t * 2 + j * 5, ctx.seed) * 3) / 3;
        B.add([x - cw, sy - ch, x + cw, sy], fillP(waxC, flat ? 0.9 : 1), `M${f1(x - cw)} ${f1(sy - ch)}h${f1(cw * 2)}v${f1(ch)}h${f1(-cw * 2)}Z`, 14);
        const fh = K * 0.13 * fl, fw = K * 0.035;
        B.poly([[x, sy - ch - K * 0.015 - fh], [x + fw, sy - ch - K * 0.015 - fh * 0.35], [x, sy - ch - K * 0.01], [x - fw, sy - ch - K * 0.015 - fh * 0.35]], fillP(flat ? lit(T) : flame, 1), 15);
        if (dark && !flat) B.dot(x, sy - ch - fh * 0.5, K * 0.12, fillP(flame, 0.12), 14);
      });
    }
    B.emit(k);
    return k.svg();
  },
};

const n2 = (v) => Math.round(clamp(v) * 100) / 100;
