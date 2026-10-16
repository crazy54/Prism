// span-aquarium — the device becomes a fish tank. Light falls through the water in soft
// shafts, sand and pebbles line the bottom row, weed sways, a bubbler streams upward, and
// fish swim the whole width — gliding behind the bezels and out into the next key: neon
// tetras, an angelfish, a fan-tailed goldfish, a small silver school. Press a key and a
// pinch of food drifts down from it; the fish turn and gather there, then wander off.
//
// Only keys with a fish, a bubble or a swaying frond change, and the weed sways in a few
// quantized steps, so the tank sits inside the budget at 3–6 fps.

import { surface, polygon, linearGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep, lerp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, dotD, ellipseD, polyD, lit, clipPoly } from './_d6-wall.js';

const LOOP = 30, TAU = Math.PI * 2;

/** A fish outline in local units (nose at +x, length 1): body polygon + tail polygon + extra fins. */
function fishShape(kind, wag) {
  const body = [], N = 12;
  const H = kind === 'angel' ? 0.34 : kind === 'gold' ? 0.3 : kind === 'school' ? 0.14 : 0.16;
  for (let i = 0; i <= N; i++) { const u = i / N; body.push([0.5 - u * 0.78, -H * Math.sin(Math.PI * Math.pow(u, 0.72)) ** 0.9]); }
  for (let i = N; i >= 0; i--) { const u = i / N; body.push([0.5 - u * 0.78, H * 0.92 * Math.sin(Math.PI * Math.pow(u, 0.72)) ** 0.9]); }
  const tx = -0.28, tl = kind === 'gold' ? 0.42 : kind === 'angel' ? 0.24 : 0.22, ts = kind === 'gold' ? 0.3 : 0.17;
  const tail = [[tx + 0.02, 0], [tx - tl, -ts + wag * 0.1], [tx - tl * 0.72, wag * 0.12], [tx - tl, ts + wag * 0.1]];
  const fins = [];
  if (kind === 'angel') {
    fins.push([[0.18, -0.26], [-0.02, -0.74], [-0.2, -0.24]]);
    fins.push([[0.14, 0.26], [-0.06, 0.78], [-0.22, 0.22]]);
  }
  if (kind === 'gold') fins.push([[0.1, -0.26], [-0.06, -0.44], [-0.2, -0.24]]);
  return { body, tail, fins };
}

export default {
  id: 'span-aquarium',
  title: 'Aquarium',
  category: 'Whole Device',
  description: 'A fish tank across the device: fish glide behind the bezels from key to key over sand and swaying weed; press a key to drop food and the fish gather there.',
  tags: ['aquarium', 'fish', 'water', 'tank', 'bubbles', 'press', 'nature', 'ambient', 'wall', 'calm'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  press: 'momentary',
  fps: 6,
  loop: LOOP,
  params: {
    fish: { type: 'number', default: 1, min: 0.5, max: 2, step: 0.1, label: 'Fish' },
    bubbles: { type: 'bool', default: true, label: 'Bubbler' },
    budget: BUDGET,
  },
  order: 61,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const nFish = Math.round(clamp(cells.length * 0.45, 3, 10) * ctx.params.fish);
    const { t } = frameClock(ctx, { fps: 6, changing: Math.min(cells.length, Math.ceil(nFish * 1.5 + grid.cols * 0.5 + 1)), still: 12 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const sp = (hh, o) => T.spectral(hh, o);
    // water
    const top = dark ? mix(T.colors.bg, sp(205), flat ? 0 : 0.32) : mix(T.colors.surface, sp(200), flat ? 0 : 0.34);
    const deep = dark ? mix(T.colors.bg, sp(235), flat ? 0 : 0.18) : mix(T.colors.surface, sp(215), flat ? 0 : 0.52);
    backdrop(k, [[0, top, dark ? 0.92 : 0.85], [1, deep, dark ? 0.94 : 0.88]], { y2: h });
    // light shafts from the surface (static)
    const shaft = k.id('shaft');
    const sc = dark ? sp(185, { dl: 0.1 }) : '#ffffff';
    k.def(linearGradient(shaft, [[0, sc, dark ? 0.12 : 0.36], [1, sc, 0]], { x1: 0, y1: 0, x2: 0, y2: h * 0.9, gradientUnits: 'userSpaceOnUse' }));
    const B = new Batch(grid);
    const nShaft = Math.max(2, Math.round(w / (K * 2.2)));
    for (let i = 0; i < nShaft; i++) {
      const x = w * (i + 0.3 + 0.4 * hash(i, ctx.seed, 9)) / nShaft, sw = K * (0.3 + 0.35 * hash(i, 8));
      const pts = [[x, 0], [x + sw, 0], [x + sw * 0.6 + h * 0.35, h * 0.9], [x - sw * 0.3 + h * 0.3, h * 0.9]];
      for (const c of cells) {
        // per key, so each slice holds only its own sliver
        const cl = clipPoly(pts, c);
        if (cl.length > 2) k.add(polygon(cl, { fill: url(shaft) }));
      }
    }
    // the bottom row: sand with pebbles (static)
    const bottom = grid.row + grid.rows - 1;
    const floorCells = cells.filter((c) => c.row === bottom);
    const sand = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(70), 0.42) : mix(T.colors.surface, sp(75), 0.4);
    const sand2 = flat ? sand : dark ? mix(T.colors.bg, sp(60), 0.3) : mix(T.colors.surface, sp(60), 0.55);
    for (const c of floorCells) {
      const y0 = c.y + c.h * 0.8;
      const pts = [];
      for (let i = 0; i <= 8; i++) { const x = c.x + (c.w * i) / 8; pts.push([x, y0 + Math.sin(x / K * 2.4 + 1) * K * 0.035 + Math.sin(x / K * 5.3) * K * 0.015]); }
      pts.push([c.x + c.w, c.y + c.h], [c.x, c.y + c.h]);
      B.add([c.x, y0 - K * 0.1, c.x + c.w, c.y + c.h], fillP(sand, flat ? 0.25 : 1), polyD(pts), 0);
      let d = '';
      for (let j = 0; j < 4; j++) d += ellipseD(c.x + c.w * (0.1 + 0.8 * hash(c.i, j, 1)), c.y + c.h * (0.88 + 0.07 * hash(c.i, j, 2)), K * (0.025 + 0.03 * hash(c.i, j, 3)), K * (0.016 + 0.015 * hash(c.i, j, 3)));
      B.add([c.x, c.y + c.h * 0.8, c.x + c.w, c.y + c.h], fillP(sand2, flat ? 0.5 : 1), d, 1);
    }
    // weed: tapered fronds rooted in the sand, swaying in 6 quantized steps a cycle
    const weedA = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(150), 0.55) : mix(T.colors.ink, sp(150), 0.55);
    const weedB = flat ? weedA : dark ? mix(T.colors.bg, sp(135), 0.38) : mix(T.colors.surface, sp(140), 0.55);
    const weedR = flat ? weedA : dark ? mix(T.colors.bg, sp(18), 0.42) : mix(T.colors.surface, sp(20), 0.6);
    // rocks first (static), weed grows in front of them
    const rockC = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(250), 0.22) : mix(T.colors.ink, sp(250), 0.25);
    for (let r = 0; r < Math.max(1, Math.round(floorCells.length / 3)); r++) {
      const fc = floorCells[Math.floor(hash(r, ctx.seed, 51) * floorCells.length)];
      const cx = fc.x + fc.w * (0.25 + 0.5 * hash(r, ctx.seed, 52)), cy = fc.y + fc.h * 0.86, rw = K * (0.22 + 0.12 * hash(r, 53)), rh = rw * 0.62;
      const pts = [];
      for (let s = 0; s <= 10; s++) { const a = Math.PI + (s / 10) * Math.PI; pts.push([cx + Math.cos(a) * rw * (1 + 0.08 * Math.sin(s * 2.1 + r)), cy + Math.sin(a) * rh * (1 + 0.1 * Math.cos(s * 1.7))]); }
      B.poly(pts, fillP(rockC, flat ? (dark ? 0.35 : 0.5) : 1), 1);
      B.poly(pts.slice(1, 5).map(([x, y]) => [x + rw * 0.08, y + rh * 0.12]).concat([[cx - rw * 0.2, cy - rh * 0.55]]), fillP(dark ? '#ffffff' : '#ffffff', dark ? 0.08 : 0.3), 1);
    }
    // weed: clumps of leafy blades rooted in the sand, swaying in a few quantized steps a cycle
    const clumps = Math.max(2, Math.round(grid.cols * 0.9));
    for (let i = 0; i < clumps; i++) {
      const fc = floorCells[Math.floor(hash(i, ctx.seed, 21) * floorCells.length)];
      const xr = fc.x + fc.w * (0.15 + 0.7 * hash(i, ctx.seed, 22));
      const y0 = fc.y + fc.h * 0.9;
      const sway = Math.round(Math.sin((t / LOOP) * TAU * 3 + i * 1.9) * 3) / 3;
      const red = i % 4 === 3;
      const blades = 3 + Math.floor(hash(i, 24) * 3);
      for (let b = 0; b < blades; b++) {
        const x0 = xr + (b - blades / 2) * K * 0.05;
        const len = Math.min(h * 0.62, K * (0.55 + 1.15 * hash(i, b, 23)) * (red ? 0.6 : 1));
        const fan = (b - (blades - 1) / 2) * K * 0.1;
        const bw = K * (red ? 0.06 : 0.04 + 0.02 * hash(i, b, 25));
        const L = [], R = [];
        for (let s = 0; s <= 10; s++) {
          const f = s / 10, bend = (sway * K * 0.16 + fan) * f * f + Math.sin(f * 5 + i + b) * K * 0.04 * f;
          const ripple = 1 + 0.35 * Math.sin(f * 14 + b);
          const x = x0 + bend, y = y0 - len * f, hw = bw * (1 - f * 0.8) * ripple;
          L.push([x - hw, y]); R.unshift([x + hw, y]);
        }
        B.poly([...L, ...R], fillP(red ? weedR : b % 2 ? weedA : weedB, flat ? 0.6 : 0.95), 2);
      }
    }
    // bubbles from the bubbler
    if (ctx.params.bubbles) {
      const bx = floorCells[floorCells.length - 1].x + floorCells[floorCells.length - 1].w * 0.72;
      const bubbleC = dark ? '#ffffff' : flat ? T.colors.ink : mix(T.colors.ink, sp(200), 0.5);
      for (let j = 0; j < 7; j++) {
        const f = ((t / LOOP) * 6 + j / 7) % 1;
        const y = h - K * 0.15 - f * (h + K * 0.2);
        const x = bx + Math.sin(f * 9 + j) * K * 0.06;
        const r = K * (0.025 + 0.025 * f) * (j % 3 === 0 ? 1.4 : 1);
        B.add([x - r, y - r, x + r, y + r], strokeP(bubbleC, Math.max(1, u * 0.8), dark ? 0.6 : 0.55), dotD(x, y, r), 6);
        B.dot(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.25), fillP(bubbleC, 0.7), 6);
      }
    }
    // food, when someone presses a key
    const age = ctx.pressed ? 0 : ctx.pressAge;
    const pk = ctx.pressKey !== null ? cells.find((c) => c.i === ctx.pressKey) : null;
    const pull = age < 8 ? smoothstep(0.3, 2.2, age) * (1 - smoothstep(5.5, 8, age)) : 0;
    let food = null;
    if (age < 8) {
      const c = pk || cells[Math.floor(cells.length / 2)];
      food = { x: c.x + c.w / 2, y: Math.min(h - K * 0.3, c.y + c.h * 0.2 + age * K * 0.16) };
      const fade = 1 - smoothstep(4.5, 7, age);
      const fc = flat ? lit(T) : sp(40, { dl: dark ? 0.04 : -0.06 });
      let d = '';
      for (let j = 0; j < 6; j++) {
        const fx = food.x + (hash(j, 31) - 0.5) * K * 0.5 + Math.sin(age * 1.5 + j) * K * 0.04, fy = food.y + (hash(j, 32) - 0.3) * K * 0.3;
        const s = K * 0.022;
        d += polyD([[fx - s, fy], [fx, fy - s], [fx + s, fy], [fx, fy + s]]);
      }
      if (fade > 0.02) B.add([food.x - K * 0.4, food.y - K * 0.3, food.x + K * 0.4, food.y + K * 0.4], fillP(fc, fade), d, 7);
    }
    // fish
    const KINDS = ['tetra', 'gold', 'tetra', 'angel', 'school', 'tetra', 'gold', 'school', 'angel'];
    for (let i = 0; i < nFish; i++) {
      const kind = KINDS[i % KINDS.length];
      const m = 1 + (i % 2);                                     // crossings per loop
      const dir = i % 2 ? -1 : 1;
      const size = K * (kind === 'school' ? 0.26 : kind === 'angel' ? 0.62 : kind === 'gold' ? 0.58 : 0.42);
      const margin = size * 1.2;
      const pos = (tt) => {
        const f = (((tt / LOOP) * m + hash(i, ctx.seed, 41)) % 1 + 1) % 1;
        const x = dir > 0 ? -margin + f * (w + margin * 2) : w + margin - f * (w + margin * 2);
        const y = h * (0.12 + 0.6 * hash(i, ctx.seed, 42)) + Math.sin((tt / LOOP) * TAU * 2 + i) * K * 0.18;
        if (!food || pull <= 0) return [x, y];
        const ang = i * 2.4, rr = K * (0.3 + 0.12 * (i % 3));
        const tx = food.x + Math.cos(ang + tt * 0.6) * rr, ty = food.y + Math.sin(ang + tt * 0.6) * rr * 0.6;
        return [lerp(x, tx, pull), lerp(y, ty, pull)];
      };
      const [x, y] = pos(t), [xp] = pos(t - 0.4);
      const face = Math.abs(x - xp) > 0.5 ? Math.sign(x - xp) : dir;
      const wag = Math.sin(t * 7 + i * 2);
      const members = kind === 'school' ? [[0, 0], [-0.9, -0.55], [-1.1, 0.6], [-2, 0.05], [0.4, 0.9]] : [[0, 0]];
      for (const [mx, my] of members) {
        const ox = x + mx * size * face, oy = y + my * size * 0.8;
        const S = fishShape(kind, wag);
        const P = (pts) => pts.map(([lx, ly]) => [ox + lx * size * face, oy + ly * size]);
        const bodyC = flat ? lit(T) : kind === 'gold' ? sp(52, { dl: dark ? 0.02 : -0.04 }) : kind === 'angel' ? (dark ? mix('#ffffff', sp(80), 0.15) : mix(T.colors.ink, sp(250), 0.3)) : kind === 'school' ? (dark ? mix('#ffffff', sp(210), 0.4) : mix(T.colors.ink, sp(210), 0.4)) : sp(215, { dl: dark ? 0.06 : -0.02 });
        const tailC = flat ? bodyC : kind === 'tetra' ? sp(22) : kind === 'gold' ? sp(40, { dl: dark ? 0.08 : 0 }) : bodyC;
        const body = P(S.body), tail = P(S.tail);
        B.poly(tail, fillP(tailC, kind === 'gold' ? 0.8 : 0.9), 10);
        for (const fin of S.fins) B.poly(P(fin), fillP(tailC, 0.75), 10);
        B.poly(body, fillP(bodyC, flat && !dark ? 1 : 1), 11);
        // markings: the tetra's red belly, the angel's bars
        if (kind === 'tetra' && !flat) B.poly(P([[0.2, 0.02], [-0.24, 0.02], [-0.26, 0.11], [0.12, 0.12]]), fillP(sp(20, { dl: dark ? 0.04 : 0 }), 0.95), 12);
        if (kind === 'angel') {
          const bar = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(T.colors.bg, sp(260), 0.3) : mix(T.colors.surface, sp(60), 0.3);
          B.poly(P([[0.16, -0.3], [0.08, -0.3], [0.08, 0.3], [0.16, 0.28]]), fillP(bar, 0.85), 12);
          B.poly(P([[-0.06, -0.33], [-0.14, -0.3], [-0.14, 0.3], [-0.06, 0.33]]), fillP(bar, 0.85), 12);
        }
        // the eye
        const [ex, ey] = P([[0.34, -0.03]])[0];
        const er = Math.max(0.9, size * (kind === 'school' ? 0.04 : 0.035));
        B.dot(ex, ey, er, fillP(dark ? '#000000' : flat ? '#ffffff' : T.colors.ink, 1), 13);
        if (dark && size > K * 0.3) B.dot(ex + er * 0.3 * face, ey - er * 0.3, Math.max(0.5, er * 0.35), fillP('#ffffff', 0.9), 14);
      }
    }
    B.emit(k);
    return k.svg();
  },
};
