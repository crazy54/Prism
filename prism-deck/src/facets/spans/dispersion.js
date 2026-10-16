// span-dispersion — the whole device becomes one window onto a glass prism. A beam
// of white light enters from the left edge, bends into the glass, and leaves the far
// face as a broad fan of the Spectrum (red bent least, violet most) that sweeps slowly
// across every key; photons stream outward along it and each key glows in the color
// that lands on it. The prism is bigger than any key, so its edges cross the bezels —
// the keys read as panes in front of one object.
//
// Slow by design: a wall changes every key each frame, so on big decks the device
// budget allows ~1–2 frames a second; the sway (16 s) and breathing read as calm at
// any of those rates.

import { surface, rect, path, polygon, circle, linearGradient, radialGradient, url, n, P } from '../../scene/index.js';
import { clamp, lerp, smoothstep } from '../../scene/easing.js';
import { noise1 } from '../../scene/noise.js';
import { BUDGET, frameClock, materials } from './_d3-span.js';

const LOOP = 16, RAD = Math.PI / 180, BANDS = 12;
const TAU = Math.PI * 2;

export default {
  id: 'span-dispersion',
  title: 'Dispersion',
  category: 'Whole Device',
  description: 'The whole device as a window onto one glass prism: a white beam enters, bends and fans out as the Spectrum, sweeping slowly across every key and lighting each in its color.',
  tags: ['prism', 'dispersion', 'spectrum', 'refraction', 'beam', 'light', 'wall', 'ambient', 'brand'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 6,
  loop: LOOP,
  params: {
    sway: { type: 'number', default: 1, min: 0, max: 2, step: 0.1, label: 'Sway' },
    budget: BUDGET,
  },
  order: 11,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const { t } = frameClock(ctx, { fps: 6, changing: grid.cells.length, still: 4 });
    materials(k);
    const K = Math.min(grid.key.w, grid.key.h);
    const dark = T.dark;
    const beamC = dark ? (T.colors.beam || '#ffffff') : T.colors.ink;
    const sw = ctx.params.sway * Math.sin((t / LOOP) * TAU);
    const breathe = 0.5 + 0.5 * Math.sin((t / LOOP) * TAU * 2 + 1.1);
    // The composition lives in a local frame where the light flows left → right. Wide decks
    // use it as is; tall ones (the Galleon) turn it 90° so the beam falls from the top edge
    // and the Spectrum pours down through the rows.
    const rot = w / h < 1.25;
    const Wl = rot ? h : w, Hl = rot ? w : h;
    const M = rot ? ([x, y]) => [y, x] : (p) => p;               // local → canvas (tall: transposed)
    const Mi = M;                                                // a transpose is its own inverse
    const pts = (list) => list.map(M);
    const S = Math.min(Hl * 0.94, Wl * 0.46) * (Hl < Wl * 0.3 ? 1.25 : 1);
    const pcx = Wl * 0.29, pcy = Hl * 0.55;
    const A = [pcx, pcy - S * 0.56], B = [pcx - S * 0.62, pcy + S * 0.46], C = [pcx + S * 0.62, pcy + S * 0.46];
    const on = (p, q, f) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f)];
    const E = on(A, B, 0.52), X = on(A, C, 0.56);
    const S0 = [-K * 0.2, E[1] - (E[0] + K * 0.2) * Math.tan((9 + sw * 2) * RAD)];
    // the fan: bands from red (least bent) to violet (most bent), meeting edge to edge
    const spread = (38 + 6 * breathe) * RAD;
    const th0 = 11 * RAD - spread / 2 + sw * 4 * RAD;
    const L = Math.hypot(w, h) * 1.4;
    const ray = (a, d) => [X[0] + Math.cos(a) * d, X[1] + Math.sin(a) * d];
    const bandHue = (f) => lerp(18, 300, f);
    const Xc = M(X);
    for (let i = 0; i < BANDS; i++) {
      const a0 = th0 + (spread * i) / BANDS, a1 = th0 + (spread * (i + 1)) / BANDS + (i < BANDS - 1 ? 1.2 / L : 0);
      const am = (a0 + a1) / 2;
      const c = T.spectral(bandHue((i + 0.5) / BANDS), { dl: dark ? 0.04 : -0.02 });
      const shimmer = 0.85 + 0.15 * noise1(t * 0.7 + i * 0.9, ctx.seed);
      const gid = k.id(`f${i}`);
      const far = M(ray(am, L * 0.62));
      k.def(linearGradient(gid, [[0, c, n((dark ? 0.9 : 0.75) * shimmer, 3)], [0.35, c, n((dark ? 0.5 : 0.42) * shimmer, 3)], [1, c, 0]], { x1: n(Xc[0]), y1: n(Xc[1]), x2: n(far[0]), y2: n(far[1]), gradientUnits: 'userSpaceOnUse' }));
      k.add(polygon(pts([X, ray(a0, L), ray(a1, L)]), { fill: url(gid) }));
    }
    // each key glows in the color that lands on its center
    for (const c of grid.cells) {
      const [cx, cy] = Mi([c.x + c.w / 2, c.y + c.h / 2]);
      if (cx <= X[0] + K * 0.2) continue;
      const f = (Math.atan2(cy - X[1], cx - X[0]) - th0) / spread;
      const inside = smoothstep(-0.12, 0.05, f) * (1 - smoothstep(0.95, 1.12, f));
      if (inside < 0.02) continue;
      const col = T.spectral(bandHue(clamp(f)));
      const gid = k.id(`k${c.i}`);
      const a = inside * (dark ? 0.34 : 0.22) * (1 - 0.35 * clamp((cx - X[0]) / Wl));
      k.def(radialGradient(gid, [[0, col, n(a, 3)], [0.7, col, n(a * 0.3, 3)], [1, col, 0]], { cx: 0.5, cy: 0.5, r: 0.72 }));
      k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
      // the lit edge catches the color
      k.add(rect({ x: c.x + k.m.safe, y: c.y, width: c.w - k.m.safe * 2, height: k.m.line, fill: col, fillOpacity: n(clamp(inside * 0.9), 3) }));
    }
    // photons streaming outward along the fan (seamless: whole laps per loop)
    let dots = '';
    for (let i = 0; i < 9; i++) {
      const f = (i + 0.5) / 9;
      const run = ((t / LOOP) * (2 + (i % 3)) + i * 0.37) % 1;
      const [px, py] = M(ray(th0 + spread * f, run * L * 0.75));
      if (px < 0 || px > w || py < 0 || py > h) continue;
      dots += circle({ cx: n(px), cy: n(py), r: n(K * 0.018 * (1.2 - run * 0.6)), fill: dark ? '#ffffff' : T.spectral(bandHue(f)), fillOpacity: n((1 - run) * 0.85, 3) });
    }
    if (dots) k.add(dots);
    // the white beam in, and its path through the glass
    const [s0, e0, x0] = pts([S0, E, X]);
    const bid = k.id('beam');
    k.def(linearGradient(bid, [[0, beamC, 0], [0.4, beamC, dark ? 0.75 : 0.6], [1, beamC, 1]], { x1: n(s0[0]), y1: n(s0[1]), x2: n(e0[0]), y2: n(e0[1]), gradientUnits: 'userSpaceOnUse' }));
    const bw = Math.max(1.5, K * 0.024);
    k.add(path(P().M(...s0).L(...e0).d, { stroke: url(bid), strokeWidth: n(bw * 3.4), strokeOpacity: 0.18, strokeLinecap: 'round', fill: 'none' }));
    k.add(path(P().M(...s0).L(...e0).d, { stroke: url(bid), strokeWidth: n(bw), strokeLinecap: 'round', fill: 'none' }));
    k.add(path(P().M(...e0).L(...x0).d, { stroke: beamC, strokeWidth: n(bw * 1.2), strokeOpacity: dark ? 0.45 : 0.35, fill: 'none' }));
    // the glass
    const gl = k.id('glass');
    const glassC = dark ? '#ffffff' : T.colors.accent;
    k.def(linearGradient(gl, [[0, glassC, dark ? 0.12 : 0.1], [0.6, glassC, 0.03], [1, glassC, 0.07]], { x1: 0, y1: 0, x2: 0.4, y2: 1 }));
    k.add(polygon(pts([A, B, C]), { fill: url(gl), stroke: dark ? '#ffffff' : T.colors.ink, strokeWidth: n(Math.max(1.5, K * 0.018)), strokeOpacity: dark ? 0.75 : 0.65, strokeLinejoin: 'round' }));
    // highlights on the lit face, the strike and the exit
    const [h0, h1] = pts([on(A, B, 0.08), on(A, B, 0.45)]);
    k.add(path(P().M(...h0).L(...h1).d, { stroke: glassC, strokeWidth: n(K * 0.022), strokeOpacity: 0.55, strokeLinecap: 'round', fill: 'none' }));
    const fl = k.id('strike');
    k.def(radialGradient(fl, [[0, beamC, 0.8], [0.3, beamC, 0.28], [1, beamC, 0]]));
    const r = K * (0.2 + 0.04 * breathe);
    k.add(rect({ x: n(e0[0] - r), y: n(e0[1] - r), width: n(r * 2), height: n(r * 2), fill: url(fl) }));
    const xr = K * 0.16;
    const fx = k.id('exit');
    k.def(radialGradient(fx, [[0, beamC, dark ? 0.7 : 0.5], [0.4, beamC, 0.15], [1, beamC, 0]]));
    k.add(rect({ x: n(x0[0] - xr), y: n(x0[1] - xr), width: n(xr * 2), height: n(xr * 2), fill: url(fx) }));
    return k.svg();
  },
};
