// span-constellation — a constellation draws itself across the device. Over a quiet field
// of stars, its stars brighten one by one, a hairline of light travels from star to star
// (crossing the bezels as if they weren't there), its name appears in a key, it holds,
// fades, and the next one begins: Orion, Cassiopeia, the Plough, Cygnus, Leo, Scorpius.
// By day the same sky is an astronomer's chart: ink stars, spectral lines, caps labels.
//
// Sparse by design: only the keys the travelling line is in change while it draws, the
// held figure is perfectly still, so the wall runs at up to 8 fps inside the budget.

import { surface } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep, outCubic } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, inCell, isFlat, starD, dotD, lit } from './_d6-wall.js';

// Shapes after the real figures (normalized, y down), magnitude 0 (brightest) … 4, and the lines.
const SKY = [
  { name: 'Orion', sub: 'The Hunter', stars: [[0.28, 0.2, 0.5], [0.66, 0.24, 1.6], [0.47, 0.06, 3.4], [0.41, 0.52, 1.8], [0.5, 0.49, 1.7], [0.59, 0.46, 2.2], [0.32, 0.88, 2.1], [0.74, 0.84, 0.2], [0.49, 0.64, 3.6]],
    lines: [[2, 0], [2, 1], [0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7], [4, 8]] },
  { name: 'Cassiopeia', sub: 'The Queen', stars: [[0.04, 0.32, 2.3], [0.27, 0.72, 2.2], [0.5, 0.42, 2.1], [0.73, 0.7, 2.7], [0.96, 0.28, 3.4]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { name: 'The Plough', sub: 'Ursa Major', stars: [[0.02, 0.22, 1.9], [0.19, 0.28, 2.2], [0.34, 0.37, 1.8], [0.48, 0.47, 3.3], [0.53, 0.8, 2.4], [0.88, 0.86, 2.4], [0.93, 0.5, 1.8]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { name: 'Cygnus', sub: 'The Swan', stars: [[0.5, 0.04, 1.3], [0.5, 0.4, 2.2], [0.5, 0.96, 3.1], [0.12, 0.3, 2.5], [0.3, 0.36, 2.9], [0.71, 0.46, 2.5], [0.9, 0.56, 3.2], [0.5, 0.66, 3.9]],
    lines: [[0, 1], [1, 7], [7, 2], [3, 4], [4, 1], [1, 5], [5, 6]] },
  { name: 'Leo', sub: 'The Lion', stars: [[0.2, 0.72, 1.4], [0.22, 0.48, 3.5], [0.3, 0.3, 2.0], [0.2, 0.12, 3.4], [0.05, 0.16, 3.0], [0.62, 0.42, 2.6], [0.95, 0.66, 2.1], [0.62, 0.7, 3.3]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7], [7, 0]] },
  { name: 'Scorpius', sub: 'The Scorpion', stars: [[0.08, 0.1, 2.6], [0.12, 0.26, 2.3], [0.18, 0.4, 2.9], [0.3, 0.36, 1.0], [0.42, 0.42, 2.8], [0.5, 0.58, 2.3], [0.52, 0.76, 3.0], [0.64, 0.9, 2.4], [0.82, 0.92, 1.9], [0.94, 0.8, 1.6], [0.9, 0.68, 2.7]],
    lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]] },
];
const ACT = 12;                      // seconds per constellation
const LOOP = ACT * SKY.length;

export default {
  id: 'span-constellation',
  title: 'Constellations',
  category: 'Ripples & Light',
  description: 'Constellations draw themselves across the device: stars brighten, a hairline of light joins them across the bezels, the name appears, then the next figure begins.',
  tags: ['constellation', 'stars', 'night', 'sky', 'astronomy', 'chart', 'ambient', 'wall', 'calm'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 8,
  loop: LOOP,
  params: {
    labels: { type: 'bool', default: true, label: 'Names' },
    hue: { type: 'hue', default: 215, min: 0, max: 360, step: 1, label: 'Line hue' },
    budget: BUDGET,
  },
  order: 45,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 8, changing: Math.min(cells.length, 3 + Math.ceil(cells.length / 12)), still: 6 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const ink = lit(T);
    const sky0 = dark ? mix(T.colors.bg, T.spectral(250), flat ? 0 : 0.1) : T.colors.surface;
    const sky1 = dark ? mix(T.colors.bg, T.spectral(280), flat ? 0 : 0.16) : mix(T.colors.surface, T.spectral(220), flat ? 0 : 0.08);
    backdrop(k, [[0, sky0, dark ? 0.9 : 0.7], [1, sky1, dark ? 0.9 : 0.7]], { x2: w, y2: h });
    const B = new Batch(grid);
    // Day: the chart's coordinate grid (static); Night: a quiet field of faint stars (static too)
    if (!dark) {
      const gs = K / 2;
      for (const c of cells) {
        let d = '';
        for (let x = Math.ceil(c.x / gs) * gs; x < c.x + c.w; x += gs) d += `M${x.toFixed(1)} ${c.y.toFixed(1)}v${c.h.toFixed(1)}`;
        for (let y = Math.ceil(c.y / gs) * gs; y < c.y + c.h; y += gs) d += `M${c.x.toFixed(1)} ${y.toFixed(1)}h${c.w.toFixed(1)}`;
        B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(flat ? T.colors.ink : mix(T.colors.ink, T.spectral(220), 0.5), Math.max(0.6, u * 0.5), flat ? 0.15 : 0.12, 'butt'), d, 0);
      }
    }
    for (const c of cells) {
      let d = '';
      const nst = 5 + Math.floor(hash(c.i, 1) * 5);
      for (let j = 0; j < nst; j++) d += dotD(c.x + c.w * hash(c.i, j, 2), c.y + c.h * hash(c.i, j, 3), Math.max(0.8, u * (0.4 + 0.55 * hash(c.i, j, 4) ** 3)));
      B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(ink, dark ? 0.5 : 0.36), d, 1);
    }
    // the figure now showing
    // (shifted 2.4 s so the catalog's still — 6 s in — catches Orion complete, with its name)
    const ts = t + 2.4;
    const act = Math.floor(ts / ACT) % SKY.length, at = ts - Math.floor(ts / ACT) * ACT;
    const C = SKY[act];
    // fit: turn wide figures upright on tall decks, keep a margin, and keep every star inside a key
    const xs = C.stars.map((s) => s[0]), ys = C.stars.map((s) => s[1]);
    const fw = Math.max(...xs) - Math.min(...xs), fh = Math.max(...ys) - Math.min(...ys);
    const turn = (w < h) !== (fw < fh) && Math.abs(fw / fh - 1) > 0.25 && Math.abs(w / h - 1) > 0.25;
    const pts = C.stars.map(([x, y]) => (turn ? [1 - y, x] : [x, y]));
    const mx = K * 0.32, my = K * 0.32;
    const X0 = Math.min(...pts.map((p) => p[0])), X1 = Math.max(...pts.map((p) => p[0])), Y0 = Math.min(...pts.map((p) => p[1])), Y1 = Math.max(...pts.map((p) => p[1]));
    const sx = (w - mx * 2) / Math.max(0.01, X1 - X0), sy = (h - my * 2) / Math.max(0.01, Y1 - Y0);
    const sc = Math.min(sx, sy, Math.max(sx, sy) * 0.62);       // no more than ~1.6× stretch
    const ox = (w - (X1 - X0) * sc) / 2 - X0 * sc, oy = (h - (Y1 - Y0) * sc) / 2 - Y0 * sc;
    const stars = pts.map(([x, y], i) => {
      let px = ox + x * sc, py = oy + y * sc;
      // a star in a gap would be hidden: nudge it into the nearest key, clear of the edge
      let best = null, bd = Infinity;
      for (const c of cells) {
        const qx = clamp(px, c.x + c.w * 0.16, c.x + c.w * 0.84), qy = clamp(py, c.y + c.h * 0.16, c.y + c.h * 0.84);
        const dd = Math.hypot(qx - px, qy - py);
        if (dd < bd) { bd = dd; best = [qx, qy]; }
      }
      [px, py] = best;
      return { x: px, y: py, mag: C.stars[i][2] };
    });
    // timeline within the act
    const nS = stars.length, nL = C.lines.length;
    const tStars = 0.4, perStar = 1.6 / nS, tLines = 2.2, perLine = 4.2 / nL, tHold = tLines + 4.2, tFade = 9.4, tEnd = 11.2;
    const fade = 1 - smoothstep(tFade, tEnd, at);
    const lineC = flat ? ink : T.spectral(ctx.params.hue, { dl: dark ? 0.04 : -0.04 });
    const lw = Math.max(1, u * 0.9);
    // lines: drawn one after another, shortened so they never touch the stars
    for (let j = 0; j < nL; j++) {
      const f = clamp((at - tLines - j * perLine) / perLine);
      if (f <= 0) continue;
      const [ia, ib] = C.lines[j], a = stars[ia], b = stars[ib];
      const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      const gap = K * 0.07;
      const e = outCubic(f), len = Math.max(0, (L - gap * 2) * e);
      if (len <= 0.5) continue;
      const x0 = a.x + ux * gap, y0 = a.y + uy * gap, x1 = x0 + ux * len, y1 = y0 + uy * len;
      const op = fade * (dark ? 0.85 : 0.9);
      if (op <= 0.02) continue;
      if (dark) B.seg(x0, y0, x1, y1, lw * 3.5, strokeP(lineC, lw * 3.5, 0.12 * fade), 2);
      B.seg(x0, y0, x1, y1, lw, strokeP(lineC, lw, op), 3);
      if (f < 1) B.dot(x1, y1, lw * 1.6, fillP(dark ? '#ffffff' : lineC, fade), 5);    // the travelling head
    }
    // stars: brighten one by one; size by magnitude; a sparkle on the brightest
    for (let i = 0; i < nS; i++) {
      const s = stars[i];
      const on = smoothstep(0, 0.35, at - tStars - i * perStar) * fade;
      if (on <= 0.02) continue;
      const r = Math.max(1.2, K * (0.05 - s.mag * 0.008));
      const q = Math.round(on * 5) / 5;
      if (dark) B.dot(s.x, s.y, r * 3.2, fillP(lineC, 0.14 * q), 4);
      B.dot(s.x, s.y, r, fillP(ink, q), 6);
      if (s.mag < 1) B.add([s.x - r * 3, s.y - r * 3, s.x + r * 3, s.y + r * 3], fillP(ink, 0.7 * q), starD(s.x, s.y, r * 3, 0.12), 6);
    }
    B.emit(k);
    // the name, in the emptiest key near the figure's center, once the figure is complete
    if (ctx.params.labels) {
      const lo = smoothstep(tHold - 0.6, tHold, at) * fade;
      if (lo > 0.02) {
        const cx = stars.reduce((s, p) => s + p.x, 0) / nS, cy = stars.reduce((s, p) => s + p.y, 0) / nS;
        let best = cells[0], score = -Infinity;
        for (const c of cells) {
          const inside = stars.filter((s) => s.x >= c.x && s.x <= c.x + c.w && s.y >= c.y + c.h * 0.55 && s.y <= c.y + c.h).length;
          const sc2 = -inside * 10 - Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy) / K;
          if (sc2 > score) { score = sc2; best = c; }
        }
        const q = Math.round(lo * 4) / 4;
        inCell(k, best, (kk) => {
          const room = kk.w - kk.m.text * 2, sub = kk.w >= 96;
          const name = kk.w < 100 && C.name.length > 9 ? C.name.split(' ').pop() : C.name;
          kk.label(name, { y: sub ? kk.h - kk.m.u * 18 : undefined, opacity: q, maxWidth: room });
          if (sub) kk.eyebrow(C.sub, { y: kk.h - kk.m.u * 7.5, align: 'center', opacity: q * 0.85, color: 'muted', maxWidth: room });
        }, 'name');
      }
    }
    return k.svg();
  },
};
