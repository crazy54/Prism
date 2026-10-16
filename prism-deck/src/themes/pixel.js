// pixel — 8-bit. Every key is a tiny LCD: glyphs are rasterized onto a 15 × 15 dot
// matrix whose cells are whole device pixels at every key size (2 px on a 72 px
// MK.2 key … 4 px on the Galleon's 160 px keys), unlit cells ghost through like a
// real panel, light comes from below as an ordered (Bayer) dither, type is a
// hand-set 5 × 7 / 3 × 5 bitmap face, and a press does what 8-bit buttons did: the
// face drops one pixel down-right and the bevel inverts. Nothing eases — motion
// steps, alerts blink.
//
// Night: backlit color LCD, deep indigo with saturated palette dots.
// Day:   reflective silver LCD, dark dots that cast a one-pixel shadow on the backplane.

import { defineTheme } from './_theme.js';
import { rect, path, n, attrs } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, phase, smoothstep, arrive } from '../scene/easing.js';
import { rasterize, bayer, latticePath, cellsToRuns, MATRIX } from './_d2-raster.js';
import { bitmapText } from './_d2-type.js';

const N = MATRIX.n;          // 15 cells across the glyph's safe area
const CU = MATRIX.span / N;  // 2.4 grid units per cell

// ── geometry: whole-pixel cells ──────────────────────────────────────────────

/** Cell size in device px of the glyph matrix on this surface (labeled glyphs are smaller). */
export function cellPx(k, labeled) {
  const m = Math.min(k.w, k.h);
  const key = k.ctx.kind === 'key';
  const target = (labeled ? 0.45 : 0.58) * m;
  let c = Math.max(1, Math.round(target / N));
  const limit = (labeled ? (key ? 0.5 : 0.62) : 0.7) * m;
  while (c > 1 && N * c > limit) c--;
  return c;
}

/** The key's LCD lattice: pitch (px) + origin, aligned with the labeled glyph matrix. */
function lattice(k) {
  if (k._d2lat) return k._d2lat;
  let c, ax, ay;
  if (k.ctx.kind === 'key') {
    c = cellPx(k, true);
    ({ ax, ay } = artOrigin(k, true, c));
  } else {
    c = Math.max(2, Math.round(2 * k.m.u));
    ax = 0; ay = 0;
  }
  k._d2lat = { c, ox: ((ax % c) + c) % c, oy: ((ay % c) + c) % c };
  return k._d2lat;
}

function artOrigin(k, labeled, c) {
  const art = N * c;
  const cy = labeled ? k.h * 0.43 : k.h / 2;
  return { ax: Math.round((k.w - art) / 2), ay: Math.round(cy - art / 2) };
}

// ── palette helpers ──────────────────────────────────────────────────────────

const step = (k, color, q) => (q >= 1 ? color : mix(k.colors.surface, color, q));
/** Stepped blink for alerts: on / half / on / off — never a smooth fade. */
function blink(k, tone) {
  if (tone !== 'alert' && tone !== 'crit') return 1;
  const p = phase(k.ctx.t, tone === 'crit' ? 0.6 : 1.2);
  return k.ctx.reduced ? 1 : p < 0.5 ? 1 : p < 0.62 ? 0.5 : 0.2;
}
const GLOW = { idle: 0, off: 0, active: 0.62, ok: 0.5, info: 0.5, warn: 0.55, neg: 0.5, alert: 0.62, crit: 0.7 };

// ── material ─────────────────────────────────────────────────────────────────

/** Dithered light rising from the bottom edge of a rect, on the lattice. */
function dither(k, { x, y, w, h, color, level, opacity, from = 0.38 }) {
  const L = lattice(k), c = L.c;
  const lx0 = Math.ceil((x - L.ox) / c), lx1 = Math.floor((x + w - L.ox) / c) - 1;
  const ly0 = Math.ceil((y - L.oy) / c), ly1 = Math.floor((y + h - L.oy) / c) - 1;
  const lit = [];
  for (let ly = ly0; ly <= ly1; ly++) {
    const fy = (L.oy + (ly + 0.5) * c - y) / h;
    const vy = smoothstep(from, 1.04, fy);
    if (vy <= 0) continue;
    for (let lx = lx0; lx <= lx1; lx++) {
      const fx = (L.ox + (lx + 0.5) * c - x) / w;
      const v = level * vy * (1 - 0.55 * Math.abs(fx - 0.5) ** 1.6 * 2);
      if (v > bayer(lx, ly)) lit.push([lx, ly]);
    }
  }
  if (!lit.length) return;
  k.add(path(latticePath(cellsToRuns(lit), c, L.ox, L.oy), { fill: color, fillOpacity: n(opacity, 3) }));
}

/** A one-cell pixel frame with notched corners, inset by `inset` px. dashed: every other cell. */
function frame(k, { x = 0, y = 0, w = k.w, h = k.h, color, opacity = 1, dashed = false, inset }) {
  const c = lattice(k).c;
  const i = inset ?? (k.ctx.kind === 'key' ? Math.max(1, Math.round(c * 0.5)) : c);
  const X0 = Math.round(x + i), Y0 = Math.round(y + i), X1 = Math.round(x + w - i), Y1 = Math.round(y + h - i);
  let d = '';
  const hrun = (x0, x1, yy) => {
    if (!dashed) { d += `M${x0 + c} ${yy}H${x1 - c}v${c}H${x0 + c}Z`; return; }
    for (let xx = x0 + c; xx + c <= x1 - c; xx += 2 * c) d += `M${xx} ${yy}h${c}v${c}h${-c}Z`;
  };
  const vrun = (y0, y1, xx) => {
    if (!dashed) { d += `M${xx} ${y0 + c}h${c}V${y1 - c}h${-c}Z`; return; }
    for (let yy = y0 + c; yy + c <= y1 - c; yy += 2 * c) d += `M${xx} ${yy}h${c}v${c}h${-c}Z`;
  };
  hrun(X0, X1, Y0); hrun(X0, X1, Y1 - c); vrun(Y0, Y1, X0); vrun(Y0, Y1, X1 - c);
  k.add(path(d, { fill: color, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
}

/** The pixel material: flat LCD face, dithered tone light from below, a pixel frame that lights with the state. */
function lcd(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, dark = k.dark;
  const off = tone === 'off';
  k.add(rect({ x, y, width: w, height: h, fill: off ? C.surface2 : C.surface }));
  const b = blink(k, tone);
  const level = (GLOW[tone] ?? 0.5) * b;
  const col = k.tone(tone);
  if (level > 0) dither(k, { x, y, w, h, color: col, level, opacity: dark ? 0.34 : 0.26 });
  const lit = tone !== 'idle' && !off;
  if (lit) frame(k, { x, y, w, h, color: col, opacity: (dark ? 0.9 : 0.85) * (b < 1 ? (b > 0.4 ? 0.7 : 0.35) : 1) });
  else frame(k, { x, y, w, h, color: dark ? mix(C.surface, C.line, 0.9) : C.line, opacity: 1, dashed: off });
}

// ── glyphs on the dot matrix ─────────────────────────────────────────────────

function paintMatrix(k, pen, { tone, styleOf, box }) {
  const C = k.colors, dark = k.dark;
  const meta = k._d2g; k._d2g = null;
  const c = meta?.c ?? (box ? box.size / 20 : null);   // px per cell, when known
  const px = c ? CU / c : null;                         // one device px in grid units
  const R = rasterize(pen.flat(), styleOf);
  const b = blink(k, tone);
  let out = '';
  const X = (v) => n(MATRIX.x0 + v * CU, 3);
  // unlit cells of the panel ghost through
  out += `<path${attrs({ d: `M${X(0)} ${X(0)}H${X(N)}V${X(N)}H${X(0)}Z`, fill: dark ? mix(C.surface, C.ink, 0.045) : mix(C.surface, C.ink, 0.06) })}/>`;
  const colorOf = (cell) => {
    let col = cell.color;
    if (cell.role === 'spark' && dark) col = mix(col, '#ffffff', 0.35);
    let q = cell.q;
    if (cell.role === 'accent' && b < 1) q = Math.min(q, b > 0.4 ? 0.7 : 0.45);   // sparks stay lit: no holes in a blinking glyph
    return step(k, col, q);
  };
  const groups = R.runs(colorOf);
  const runPath = (runs, dx = 0, dy = 0) => runs.map(([x, y, len]) => `M${n(MATRIX.x0 + x * CU + dx, 3)} ${n(MATRIX.x0 + y * CU + dy, 3)}h${n(len * CU, 3)}v${n(CU, 3)}h${n(-len * CU, 3)}Z`).join('');
  // Day: every dark dot casts a one-pixel shadow on the backplane
  if (!dark && px) {
    const all = groups.flatMap((g0) => g0.runs);
    if (all.length) out += `<path${attrs({ d: runPath(all, px, px), fill: '#000000', fillOpacity: 0.16 })}/>`;
  }
  for (const g0 of groups) out += `<path${attrs({ d: runPath(g0.runs), fill: g0.color })}/>`;
  // the LCD grid: one dark pixel between cells (only where cells are ≥ 3 px, so dots stay bright)
  if (c && c >= 3 && Number.isInteger(c)) {
    let d = '';
    for (let i = 1; i <= N; i++) {
      d += `M${n(MATRIX.x0 + i * CU - px, 3)} ${X(0)}h${n(px, 3)}V${X(N)}h${n(-px, 3)}Z`;
      d += `M${X(0)} ${n(MATRIX.x0 + i * CU - px, 3)}H${X(N)}v${n(px, 3)}H${X(0)}Z`;
    }
    out += `<path${attrs({ d, fill: dark ? C.surface : mix(C.surface, '#ffffff', 0.25), fillOpacity: c >= 4 ? (dark ? 0.55 : 0.5) : (dark ? 0.4 : 0.38) })}/>`;
  }
  return out;
}

// ── bespoke sprites ──────────────────────────────────────────────────────────
// 15 × 15, one char per cell, drawn as filled cells through the same pen (so they
// rasterize back exactly). map(ch, x, y) → { role, opacity } | null decides each cell.

const S = (s) => s.trim().split(/\s+/).map((r) => [...r]);
function sprite(g, rows, map) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const st = row[x] === '.' ? null : map(row[x], x, y);
      if (!st) continue;
      let e = x;
      while (e + 1 < row.length && row[e + 1] !== '.') { const nx = map(row[e + 1], e + 1, y); if (!nx || nx.role !== st.role || (nx.opacity ?? 1) !== (st.opacity ?? 1)) break; e++; }
      g.rect(MATRIX.x0 + x * CU, MATRIX.x0 + y * CU, (e - x + 1) * CU, CU, { role: st.role, fill: true, opacity: st.opacity });
      x = e;
    }
  });
}

const MIC = S(`
  ......###......
  .....#...#.....
  .....#...#.....
  .....#...#.....
  w.#..#...#..#.w
  w.#..#...#..#.w
  w.#..#...#..#.w
  ..#...###...#..
  ...#.......#...
  ....#.....#....
  .....#####.....
  .......#.......
  .......#.......
  ....#######....
  ...............`);
const PLAY = [S(`
  ...............
  ...............
  ....##.........
  ....####.......
  ....######.....
  ....########...
  ....#########..
  ....##########.
  ....#########..
  ....########...
  ....######.....
  ....####.......
  ....##.........
  ...............
  ...............`), S(`
  ...............
  ...............
  ...###...##....
  ...####..###...
  ...#####.###...
  ...#########...
  ...#########...
  ...##########..
  ...#########...
  ...#########...
  ...#####.###...
  ...####..###...
  ...###...##....
  ...............
  ...............`), S(`
  ...............
  ...............
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...###...###...
  ...............
  ...............`)];
const BULB = S(`
  .......r.......
  ..r.........r..
  ......###......
  ....##...##....
  r..#.......#..r
  ...#.......#...
  ...#.x...x.#...
  ...#..x.x..#...
  ....#..x..#....
  .....#...#.....
  .....#####.....
  .....#...#.....
  .....#####.....
  ......ddd......
  ...............`);
const POWER = S(`
  ...............
  .......a.......
  .......a.......
  .......a.......
  ...#...a...#...
  ..#....a....#..
  .#.....a.....#.
  .#.....a.....#.
  .#...........#.
  .#...........#.
  .#...........#.
  ..#.........#..
  ...#.......#...
  ....#.....#....
  .....#####.....`);

/** Cells of a pixel circle (midpoint) of radius r around (cx, cy), ordered by angle (0 = up, clockwise). */
function ringCells(cx, cy, r) {
  const pts = new Map();
  let x = 0, y = r, d = 1 - r;
  while (x <= y) {
    for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) pts.set(`${cx + a},${cy + b}`, [cx + a, cy + b]);
    x++;
    if (d < 0) d += 2 * x + 1; else { y--; d += 2 * (x - y) + 1; }
  }
  return [...pts.values()].map(([px, py]) => ({ x: px, y: py, a: (Math.atan2(px - cx, -(py - cy)) * 180 / Math.PI + 360) % 360 })).sort((p1, p2) => p1.a - p2.a);
}
/** Cells of a filled pixel disc. */
function discCells(cx, cy, r) {
  const out = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) out.push({ x: cx + x, y: cy + y });
  return out;
}
const cell = (g, x, y, role, opacity) => g.rect(MATRIX.x0 + x * CU, MATRIX.x0 + y * CU, CU, CU, { role, fill: true, opacity });

const CHAT = S(`
  ...............
  ...............
  ..###########..
  .#...........#.
  #.............#
  #.............#
  #.............#
  #.............#
  #.............#
  #.............#
  .#...........#.
  ..##...######..
  ....#.#........
  ....##.........
  ...............`);
const AT = S(`
  .###.
  #...#
  ....#
  .##.#
  #.#.#
  #.#.#
  .###.`);
const VIEWERS = S(`
  ...............
  ...............
  .bbb.......ccc.
  .bbb..###..ccc.
  .bbb.#...#.ccc.
  .....#...#.....
  .BBB.#...#.CCC.
  B.....###.....C
  B.............C
  .....#####.....
  ....#.....#....
  ...#.......#...
  ...#.......#...
  ...#.......#...
  ...............`);

const OVERRIDES = {
  chat(g, s) {
    sprite(g, CHAT, () => ({ role: 'line' }));
    if (s.state === 'mention') {
      if (s.since < 0.12) return;                       // the @ pops in on the next frame
      sprite(g, [...Array(4).fill('...............'.split('')), ...AT.map((r) => [...'.....', ...r, ...'.....'])], () => ({ role: 'accent' }));
      return;
    }
    const active = s.state === 'active';
    // three dots, a cell apart; while active each hops up one cell in turn
    [4, 7, 10].forEach((x, i) => {
      const hop = active && arrive(s.since, 0.3) > 0.5 && Math.floor(phase(s.t, 1.2) * 6) === i * 2;
      cell(g, x, hop ? 6 : 7, active ? 'accent' : 'dim');
    });
  },
  viewers(g, s) {
    const live = s.state === 'live';
    const k = live ? clamp(s.since / 0.5) : 1;
    const crowd = s.level > 0.66 ? 3 : s.level > 0.33 ? 2 : 1;
    const ox = crowd === 2 ? -1 : 0;                    // a pair sits off-center, as in the vector glyph
    const showL = crowd >= 3 && k > 0.4, showR = crowd >= 2 && k > 0.4;   // the back row steps in
    sprite(g, VIEWERS, (ch) => ((ch === 'b' || ch === 'B') && showL) || ((ch === 'c' || ch === 'C') && showR) ? { role: 'dim' } : null);
    // the front viewer: a round 5 × 5 head (never a diamond) and an arch of shoulders
    for (let y = 3; y <= 7; y++) for (let x = 5; x <= 9; x++) if ((y === 3 || y === 7) ? Math.abs(x - 7) <= 1 : Math.abs(x - 7) === 2) cell(g, x + ox, y, 'line');
    if (live) for (let y = 4; y <= 6; y++) for (let x = 6; x <= 8; x++) cell(g, x + ox, y, 'accent', phase(s.t, 2.4) < 0.5 ? 1 : 0.7);
    VIEWERS.slice(9).forEach((row, j) => row.forEach((ch, x) => { if (ch === '#') cell(g, x + ox, 9 + j, 'line'); }));
  },
  record(g, s) {
    const ring = ringCells(7, 7, 6);
    const dot = discCells(7, 7, 3);
    if (s.state === 'ready') {
      for (const c of ring) cell(g, c.x, c.y, 'dim');
      for (const c of dot) cell(g, c.x, c.y, 'fill');
      return;
    }
    if (s.state === 'armed') {
      // marching segments: the dashes step one cell around the ring, the dot blinks in two steps
      const shift = Math.floor(phase(s.t, 2.4) * 6) * 15;   // eight 45° dashes, stepping 15° at a time
      ring.forEach((c) => { if (Math.floor(((c.a + shift + 22.5) % 360) / 45) % 2 === 0) cell(g, c.x, c.y, 'line'); });
      for (const c of dot) cell(g, c.x, c.y, 'accent', phase(s.t, 1.2) < 0.5 ? 1 : 0.45);
      return;
    }
    // recording: a solid ring with a bright tape head of three cells stepping around it
    const head = Math.floor(phase(s.t, 2.4) * ring.length);
    ring.forEach((c, i) => { const d = (head - i + ring.length) % ring.length; cell(g, c.x, c.y, d < 3 ? 'spark' : 'line'); });
    for (const c of dot) cell(g, c.x, c.y, 'accent');
  },
  mic(g, s) {
    const on = s.state === 'on';
    // voice waves blink in two steps, as an 8-bit sprite animates
    const wave = phase(s.t, 1.6) < 0.5 ? 1 : 0.45;
    sprite(g, MIC, (ch) => (ch === '#' ? { role: 'line' } : ch === 'w' && on ? { role: 'accent', opacity: wave } : null));
    if (!on) {
      // the strike draws in whole cells per frame (no easing in 8-bit)
      const cells = Math.round(14 * clamp(s.since / 0.3));
      for (let i = 0; i < cells; i++) g.rect(MATRIX.x0 + (0.5 + i) * CU, MATRIX.x0 + i * CU, CU, CU, { role: 'accent', fill: true });
    }
  },
  'play-pause'(g, s) {
    const m = clamp(s.since / 0.3);
    const k = s.state === 'playing' ? m : 1 - m; // 0 play → 1 pause, in three frames
    sprite(g, PLAY[k < 0.34 ? 0 : k < 0.67 ? 1 : 2], () => ({ role: 'fill' }));
  },
  bulb(g, s) {
    const on = s.state === 'on';
    const rays = on && s.since > 0.12 ? (phase(s.t, 2.4) < 0.5 ? 1 : 0.45) : 0;
    sprite(g, BULB, (ch) => (ch === '#' ? { role: 'line' } : ch === 'd' ? { role: 'dim' } : ch === 'x' ? { role: on ? 'accent' : 'dim' } : ch === 'r' && rays ? { role: 'accent', opacity: rays } : null));
  },
  power(g, s) {
    const on = s.state === 'on';
    // switching on closes the ring upward from the bottom in three whole steps
    const reach = on ? Math.PI * (0.25 + 0.75 * Math.ceil(clamp(s.since / 0.36) * 3) / 3) : Math.PI;
    sprite(g, POWER, (ch, x, y) => {
      if (ch === 'a') return { role: on ? 'accent' : 'line' };
      const ang = Math.atan2(Math.abs(x - 7), y - 9);   // 0 at the bottom of the ring, π at the top
      return ang <= reach + 1e-6 ? { role: on ? 'line' : 'dim' } : null;
    });
  },
};

// ── the theme ────────────────────────────────────────────────────────────────

export default defineTheme({
  id: 'pixel',
  title: 'Pixel',
  description: '8-bit LCD keys: glyphs on a whole-pixel dot matrix, dithered light from below, bitmap type, and a press that drops the face one pixel.',
  tags: ['8-bit', 'pixel', 'lcd', 'retro', 'dither', 'dark', 'light'],
  modes: {
    dark: {
      bg: '#07080f', surface: '#121528', surface2: '#0c0e1b', line: '#2c3256', ink: '#f6f3ff', muted: '#a9acc8', dim: '#6c7096',
      accent: '#a98bff', accent2: '#4fe3c1', pos: '#58e38f', info: '#55b6ff', warn: '#ffc53d', neg: '#ff5b6e', crit: '#ff46b4',
      spectrum: { l: 0.76, c: 0.17 },
    },
    light: {
      bg: '#b1b6aa', surface: '#d3d7cb', surface2: '#c8ccbf', line: '#959c8d', ink: '#151912', muted: '#454b41', dim: '#6c7365',
      accent: '#4a2b9c', accent2: '#0f5c48', pos: '#1b6a30', info: '#1d4f98', warn: '#7a4a00', neg: '#a1172c', crit: '#94105d',
      spectrum: { l: 0.42, c: 0.15 },
    },
  },
  defaultMode: 'dark',
  tones: { idle: 'accent', active: 'tint' },
  roles: {
    line: { color: 'ink', width: 3 },
    fill: { color: 'ink' },
    accent: { color: 'tone', width: 3 },
    dim: { color: 'muted', width: 3, opacity: 0.7 },
    spark: { color: 'tone' },
  },
  type: {
    eyebrow: { size: 7, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
    label: { size: 10, weight: 600, caps: true, color: 'ink', baseline: 7 },
    value: { size: 22, weight: 700, tabular: true, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
    caption: { size: 8.5, weight: 400, color: 'muted' },
  },
  background(k, o) { lcd(k, o); },
  surface(k, o) { lcd(k, o); },
  paintGlyph: paintMatrix,
  glyphBox(k, { labeled }) {
    const c = cellPx(k, labeled);
    const { ax, ay } = artOrigin(k, labeled, c);
    k._d2g = { c, ax, ay };
    return { x: ax - 2.5 * c, y: ay - 2.5 * c, size: 20 * c };
  },
  text(k, role, str, o) { return bitmapText(k, role, str, o); },
  /** 8-bit press: the face drops one lattice pixel down-right and the bevel inverts; no easing, one frame after release. */
  press(k, { pressed, age }) {
    if (!pressed && !(age < 0.1)) return null;
    const c = lattice(k).c;
    const C = k.colors;
    const lit = k.tone(k.toneName === 'idle' ? 'active' : k.toneName);
    return {
      transform: `translate(${c} ${c})`,
      under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : mix(C.surface, '#000000', 0.45) }),
      overlay: path(`M0 0H${k.w}V${c}H${c}V${k.h}H0Z`, { fill: k.dark ? '#000000' : mix(C.surface, '#000000', 0.5), fillOpacity: 0.9 })
        + path(`M${k.w - c} ${c}H${k.w}V${k.h}H${c}V${k.h - c}H${k.w - c}Z`, { fill: lit, fillOpacity: 0.85 }),
    };
  },
  glyphs: OVERRIDES,
});

export { lcd, lattice, frame, dither };
