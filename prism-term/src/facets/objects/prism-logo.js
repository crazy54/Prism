// Prism's mark, in the terminal: a glass triangular prism turning slowly in
// 3D. A white beam strikes one face, bends through the glass, and leaves the
// other face as a fanned spectrum. The glass is drawn back-to-front with
// tinted, Fresnel-brightened faces and depth-cued edges; the fan is shaded
// per pixel so the colors blend smoothly, and a pulse of light runs through.
import { perspective, fillPoly, rotX, rotY, mul, apply, blend } from './_raster.js';
import { ATTR } from '../../buffer.js';
import { NONE, gradient, luminance } from '../../color.js';
import { SPECTRUM as REFRACTION } from '../../palettes.js';

// The fan is Refraction's own spectrum in physical order (rose bends least, violet
// most): the luminous ink tier at Night, the vivid tier on light pages.
const fanOf = (dark) => gradient(REFRACTION.map((st) => (dark ? st.night : st.dayVivid)).reverse());

export default {
  title: 'Prism',
  gallery: 'objects',
  category: 'Icons & Logos',
  kind: 'art',
  tags: ['prism', 'logo', 'spectrum', 'light', 'refraction', 'glass'],
  order: 5,
  description: "Prism's mark: a glass prism turning in 3D, splitting a white beam into a smoothly blended, pulsing spectrum.",
  size: { w: 72, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: 14,
  canvas: 'field',
  palette: 'prism',
  params: { label: { default: 'on', options: ['on', 'off'], label: 'Wordmark' } },
  setup(ctx) {
    const showLabel = ctx.param('label', 'on') !== 'off' && ctx.height >= 12;
    const rows = showLabel ? ctx.height - 2 : ctx.height;
    const cv = ctx.canvas(undefined, { rows });
    const W = cv.width, H = cv.height, th = ctx.theme;
    const project = perspective(cv, { distance: 4.6, fill: 0.34, cx: W * 0.44, cy: H * 0.52 });
    const A = [0, -0.95, 0], B = [-0.92, 0.64, 0], C = [0.92, 0.64, 0], Dz = 0.55;
    const verts = [[...A], [...B], [...C]].flatMap((p) => [[p[0], p[1], -Dz], [p[0], p[1], Dz]]);
    // indices: A0 A1 B0 B1 C0 C1  (0 = front face, 1 = back face)
    const faces = [
      { v: [0, 2, 4], kind: 'cap' }, { v: [1, 5, 3], kind: 'cap' },
      { v: [0, 1, 3, 2], kind: 'left' }, { v: [0, 4, 5, 1], kind: 'right' }, { v: [2, 3, 5, 4], kind: 'base' },
    ];
    const edges = [[0, 2], [2, 4], [4, 0], [1, 3], [3, 5], [5, 1], [0, 1], [2, 3], [4, 5]];
    // On light themes "white light" can't glow over the page, so the beam and
    // the glass edges are drawn in ink instead and the glass tint deepens.
    const dark = luminance(th.bg) < 0.5;
    const SPECTRUM = fanOf(dark);
    const glass = blend(th.bg, dark ? 0x9fc4ff : 0x5f8fcf, 0.55);
    const beamInk = dark ? 0xffffff : blend(th.ink, 0x4a6a90, 0.35);
    const edgeInk = dark ? 0xe8f2ff : blend(th.ink, 0x3b5f8a, 0.4);
    const lerp3 = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
    // Blend/add against the real background so soft edges don't fringe to black.
    const under = (x, y) => { const c = cv.get(x, y); return c === NONE ? th.bg : c; };
    const over = (x, y, c, a) => { if (x >= 0 && y >= 0 && x < W && y < H) cv.set(x, y, blend(under(x, y), c, Math.min(1, a))); };
    const glowAdd = (x, y, c) => {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = under(x, y);
      cv.set(x, y, (Math.min(255, ((o >> 16) & 255) + ((c >> 16) & 255)) << 16) | (Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255)) << 8) | Math.min(255, (o & 255) + (c & 255)));
    };

    return (t) => {
      cv.clear();
      const M = mul(rotX(-0.2 + Math.sin(t * 0.37) * 0.05), rotY(0.18 + Math.sin(t * 0.45) * 0.45));
      const V = verts.map((p) => apply(M, p));
      const P = V.map(project);
      const proj = (p) => project(apply(M, p));
      const E = proj(lerp3(A, B, 0.6)), X = proj(lerp3(A, C, 0.64));
      const pulse = (t * 0.55) % 1;

      // Incoming white beam, anti-aliased: intensity falls off with distance from its axis.
      const slope = 0.16;
      const y0 = E[1] - E[0] * slope;
      for (let x = 0; x <= Math.min(W - 1, Math.floor(E[0])); x++) {
        const yl = y0 + (x + 0.5) * slope;
        const f = x / Math.max(1, E[0]);
        const boost = 1 + 0.9 * Math.exp(-Math.pow((f - pulse * 1.6) * 6, 2));
        for (let y = Math.floor(yl - 2.5); y <= Math.ceil(yl + 2.5); y++) {
          const d = y + 0.5 - yl;
          const k = Math.exp(-(d * d) / 0.55);
          if (k < 0.04) continue;
          if (!dark) { over(x, y, beamInk, 0.85 * k * Math.min(1.3, boost)); continue; }
          const c = Math.round(Math.min(255, 235 * k * boost));
          glowAdd(x, y, (c << 16) | (c << 8) | Math.min(255, c + 12));
        }
      }

      // Spectrum fan leaving the far face, shaded per pixel.
      const base = 0.12 + Math.sin(t * 0.45) * 0.08, spread = 0.2 + Math.sin(t * 0.31) * 0.035;
      const a0 = base - spread, a1 = base + spread;
      for (let y = 0; y < H; y++) for (let x = Math.max(0, Math.floor(X[0])); x < W; x++) {
        const dx = x + 0.5 - X[0], dy = y + 0.5 - X[1];
        if (dx <= 0.5) continue;
        const phi = Math.atan2(dy, dx);
        if (phi < a0 - 0.03 || phi > a1 + 0.03) continue;
        const f = (phi - a0) / (a1 - a0);
        const edge = Math.min(1, Math.max(0, Math.min(f + 0.15, 1.15 - f) / 0.15));
        const dist = Math.hypot(dx, dy);
        const fade = Math.min(1, dist / 5) * (0.75 + 0.25 * Math.exp(-dist / (W * 0.6)));
        const travel = 1 + 0.55 * Math.exp(-Math.pow((dist / (W * 0.55) - (pulse * 1.6 - 0.6)) * 4, 2));
        const c = SPECTRUM(Math.max(0, Math.min(1, f)));
        over(x, y, c, edge * fade * 0.92 * travel);
      }

      // Glass, back to front.
      const order = faces.map((f, i) => ({ f, i, d: f.v.reduce((s, k) => s + P[k][2], 0) / f.v.length })).sort((a, b) => b.d - a.d);
      for (const { f } of order) {
        const pts = f.v.map((k) => [P[k][0], P[k][1]]);
        const a = V[f.v[0]], b = V[f.v[1]], c = V[f.v[2]];
        const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
        const nl = Math.hypot(...n) || 1;
        const facing = Math.abs(n[2] / nl);
        const alpha = f.kind === 'cap' ? 0.16 : 0.1 + (1 - facing) * 0.3;
        const tone = f.kind === 'left' ? blend(glass, 0xffffff, 0.25) : f.kind === 'base' ? blend(glass, th.bg, 0.4) : glass;
        fillPoly(cv, pts, (x, y, old) => {
          const under = old === NONE ? th.bg : old;
          // A soft specular sheen sweeping across the faces.
          const sheen = Math.max(0, 1 - Math.abs(((x / W) - 0.35 - Math.sin(t * 0.45) * 0.2) * 7)) * 0.18;
          return blend(under, blend(tone, 0xffffff, sheen), alpha + sheen);
        });
      }
      // Refracted beam inside the glass.
      cv.line(E[0], E[1], X[0], X[1], blend(th.bg, beamInk, 0.55));
      // Edges, depth-cued.
      const dmin = Math.min(...P.map((p) => p[2])), dmax = Math.max(...P.map((p) => p[2]));
      for (const [i, j] of edges) {
        const d = ((P[i][2] + P[j][2]) / 2 - dmin) / Math.max(1e-6, dmax - dmin);
        // Near edges crisp, far edges barely there — reads as glass, not wireframe.
        const k = d < 0.5 ? 0.95 - d * 0.5 : 0.32 - (d - 0.5) * 0.4;
        cv.line(P[i][0], P[i][1], P[j][0], P[j][1], blend(th.bg, edgeInk, Math.max(0.08, k)));
      }
      cv.paint(ctx.buffer);

      if (showLabel) {
        const word = ctx.width >= 30 ? 'P  R  I  S  M' : 'PRISM';
        const x0 = Math.max(0, Math.round(ctx.width * 0.44 - word.length / 2));
        for (let i = 0; i < word.length; i++) {
          if (word[i] === ' ') continue;
          ctx.buffer.text(x0 + i, ctx.height - 1, word[i], SPECTRUM(i / Math.max(1, word.length - 1)), undefined, ATTR.BOLD);
        }
      }
    };
  },
};
