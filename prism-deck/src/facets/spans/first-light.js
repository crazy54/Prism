// span-first-light — Prism's "First Light" across a whole device.
//
// A single beam of white light crosses the keys, strikes a glass prism that sits
// inside one key, and fans into the Spectrum; the light paints every key it reaches,
// one by one, then the room goes dark and it begins again. The span covers the whole
// device, gaps included, so the beam reads continuous behind the bezels — and text is
// only ever placed fully inside one key.

import { surface, keyInto, path, polygon, circle, rect, linearGradient, radialGradient, url, n, P } from '../../scene/index.js';
import { clamp, lerp, outCubic, outExpo, smoothstep, phase } from '../../scene/easing.js';
import { noise1 } from '../../scene/noise.js';

const RAD = Math.PI / 180;
const LOOP = 9;

export default {
  id: 'span-first-light',
  title: 'First Light',
  category: 'Whole Device',
  description: 'A beam of white light crosses the device, strikes a glass prism inside one key and fans into the Spectrum, lighting every key it reaches.',
  tags: ['prism', 'spectrum', 'beam', 'refraction', 'intro', 'ambient', 'brand', 'wall'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 12,
  loop: LOOP,
  params: { caption: { type: 'text', default: 'First Light', label: 'Caption', maxLength: 16 } },
  order: 10,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, theme: T, grid } = ctx;
    const tt = ctx.reduced ? 3.6 : phase(ctx.t, LOOP) * LOOP;
    const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
    k.add(`<rect width="${n(w)}" height="${n(h)}" fill="#000000"/>`);
    for (const c of grid.cells) keyInto(k, c, (kk) => kk.background({ tone: 'idle' }), { tag: `b${c.i}`, clip: false });

    // geometry: the prism lives inside one key window
    const cols = grid.cols, rows = grid.rows;
    const pc = grid.cells.find((c) => c.col - grid.col === Math.round((cols - 1) * 0.4) && c.row - grid.row === Math.floor((rows - 1) / 2)) || grid.cells[0];
    const pcx = pc.x + KW / 2, pcy = pc.y + KH / 2;
    const S = K * 0.66;
    const A = [pcx, pcy - S * 0.56], B = [pcx - S * 0.58, pcy + S * 0.44], C = [pcx + S * 0.58, pcy + S * 0.44];
    const onEdge = (p, q, f) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f)];
    const E = onEdge(A, B, 0.56), X = onEdge(A, C, 0.5);
    const S0 = [0, E[1] + E[0] * Math.tan(7 * RAD)];

    // timeline
    const travel = outCubic(clamp(tt / 1.5));
    const strike = smoothstep(1.35, 1.75, tt) * (1 - smoothstep(2.2, 3.2, tt) * 0.6);
    const open = outExpo(clamp((tt - 1.6) / 1.5));
    const live = 1 - smoothstep(7.4, LOOP, tt);
    const hueAt = (f) => lerp(28, 300, f); // red → violet

    // the spectrum fan
    const WEDGES = 22;
    const th0 = -3 * RAD, th1 = lerp(-3, 34, open) * RAD;
    const reach = (th) => (w - X[0] + K) / Math.cos(th);
    if (open > 0.001) {
      for (let i = 0; i < WEDGES; i++) {
        const f0 = i / WEDGES, f1 = (i + 1) / WEDGES;
        const a0 = lerp(th0, th1, f0), a1 = lerp(th0, th1, Math.min(1, f1 + 0.15 / WEDGES));
        const L = reach(a1) * lerp(0.25, 1, open);
        const p0 = [X[0] + Math.cos(a0) * L, X[1] + Math.sin(a0) * L], p1 = [X[0] + Math.cos(a1) * L, X[1] + Math.sin(a1) * L];
        const color = T.spectral(hueAt((f0 + f1) / 2), { c: (T.colors.spectrum?.c ?? 0.12) + 0.03 });
        const gid = k.id(`w${i}`);
        const sh = 0.82 + 0.18 * noise1(ctx.t * 0.9 + i * 0.7, ctx.seed);
        k.def(linearGradient(gid, [[0, color, (T.dark ? 0.95 : 0.8) * sh], [0.45, color, (T.dark ? 0.55 : 0.45) * sh], [1, color, 0]], { x1: X[0], y1: X[1], x2: X[0] + Math.cos((a0 + a1) / 2) * L, y2: X[1] + Math.sin((a0 + a1) / 2) * L, gradientUnits: 'userSpaceOnUse' }));
        k.add(polygon([X, p0, p1], { fill: url(gid), fillOpacity: n(live, 3) }));
      }
      if (open > 0.5) {
        let dots = '';
        for (let i = 0; i < 9; i++) {
          const f = (i + 0.5) / 9, a = lerp(th0, th1, f), run = phase(ctx.t * 0.22 + i * 0.37, 1), L = reach(a) * run;
          dots += circle({ cx: X[0] + Math.cos(a) * L, cy: X[1] + Math.sin(a) * L, r: K * 0.012 * (1 - run * 0.5), fill: T.dark ? '#ffffff' : T.spectral(hueAt(f)), fillOpacity: n((1 - run) * 0.8 * live, 3) });
        }
        k.add(dots);
      }
    }

    // the spectrum paints the device in, key by key, outward from the prism
    const span = Math.max(1, rows - 1) + 0.6;
    for (const c of grid.cells) {
      const cx = c.x + KW / 2, cy = c.y + KH / 2;
      const dist = Math.hypot(c.col - pc.col, c.row - pc.row);
      let color, level;
      if (c === pc) { color = T.dark ? '#ffffff' : T.colors.accent; level = strike * 0.55 + open * 0.3; }
      else {
        color = T.spectral(hueAt(clamp(((c.row - grid.row) + ((c.col - grid.col) / cols) * 0.6) / span)), { dl: T.dark ? 0.04 : 0 });
        const delay = 2.5 + dist * 0.24;
        level = smoothstep(delay, delay + 0.55, tt);
        const onBeam = cx < E[0] && Math.abs(cy - lerp(S0[1], E[1], cx / E[0])) < KH * 0.6;
        if (onBeam) {
          const pass = (cx / E[0]) * 1.5;
          const flash = smoothstep(pass - 0.1, pass + 0.15, tt) * (1 - smoothstep(pass + 0.3, pass + 1.2, tt));
          if (flash > level) { color = T.dark ? '#ffffff' : T.colors.accent; level = flash * 0.6; }
        }
      }
      level *= live;
      if (level <= 0.01) continue;
      const gid = k.id(`k${c.i}`);
      k.def(radialGradient(gid, [[0, color, (T.dark ? 0.5 : 0.3) * level], [0.55, color, (T.dark ? 0.16 : 0.1) * level], [1, color, 0]], { cx: 0.5, cy: 1.05, r: 0.85 }));
      k.add(rect({ x: c.x, y: c.y, width: KW, height: KH, fill: url(gid) }));
      if (c !== pc) {
        const bid = k.id(`e${c.i}`), m = k.m.safe;
        k.def(linearGradient(bid, [[0, color, 0], [0.5, color, 1], [1, color, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
        k.add(rect({ x: c.x + m, y: c.y, width: KW - m * 2, height: k.m.line, fill: url(bid), fillOpacity: n(level, 3) }));
      }
    }

    // the incoming beam
    const head = [lerp(S0[0], E[0], travel), lerp(S0[1], E[1], travel)];
    const beamW = K * 0.022, beamC = T.colors.beam || '#ffffff';
    const bid = k.id('beam');
    k.def(linearGradient(bid, [[0, beamC, 0], [0.35, beamC, T.dark ? 0.7 : 0.55], [1, beamC, 1]], { x1: S0[0], y1: S0[1], x2: Math.max(head[0], S0[0] + 1), y2: head[1], gradientUnits: 'userSpaceOnUse' }));
    if (travel > 0.001) {
      const d = P().M(...S0).L(...head).d;
      k.add(path(d, { stroke: url(bid), strokeWidth: beamW * 3.2, strokeOpacity: n(0.18 * live, 3), strokeLinecap: 'round' }));
      k.add(path(d, { stroke: url(bid), strokeWidth: beamW, strokeOpacity: n(live, 3), strokeLinecap: 'round' }));
      if (travel < 1) {
        const hg = k.id('head');
        k.def(radialGradient(hg, [[0, beamC, 0.9], [0.4, beamC, 0.25], [1, beamC, 0]]));
        k.add(circle({ cx: head[0], cy: head[1], r: K * 0.09, fill: url(hg) }));
      }
    }
    if (strike > 0.01) k.add(path(P().M(...E).L(...X).d, { stroke: beamC, strokeWidth: beamW * 1.4, strokeOpacity: n(0.5 * Math.max(strike, open * 0.6) * live, 3) }));

    // the prism
    const glassId = k.id('glass'), ink = T.dark ? '#ffffff' : T.colors.ink;
    k.def(linearGradient(glassId, [[0, T.dark ? '#ffffff' : T.colors.accent, T.dark ? 0.1 : 0.08], [1, T.dark ? '#ffffff' : T.colors.accent, 0.015]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
    const edgeOp = 0.35 + 0.65 * Math.max(strike, open * 0.7);
    k.add(polygon([A, B, C], { fill: url(glassId), stroke: ink, strokeWidth: K * 0.012, strokeOpacity: n(edgeOp * (0.4 + 0.6 * live), 3), strokeLinejoin: 'round' }));
    k.add(path(P().M(...A).L(...onEdge(A, C, 0.42)).d, { stroke: T.dark ? '#ffffff' : T.colors.accent, strokeWidth: K * 0.02, strokeOpacity: n(0.25 + 0.6 * strike, 3), strokeLinecap: 'round' }));
    if (strike > 0.01) {
      const fl = k.id('flash');
      k.def(radialGradient(fl, [[0, beamC, 0.85], [0.3, beamC, 0.3], [1, beamC, 0]]));
      k.add(circle({ cx: E[0], cy: E[1], r: K * 0.16 * strike, fill: url(fl), fillOpacity: n(strike, 3) }));
    }

    // instrument labels, each fully inside one key
    const words = smoothstep(3.2, 4, tt) * live;
    if (words > 0.01) {
      const first = grid.cells[0], last = grid.cells[grid.cells.length - 1];
      keyInto(k, first, (kk) => kk.eyebrow(ctx.params.caption, { opacity: words }), { tag: 'cap', clip: false });
      keyInto(k, last, (kk) => kk.eyebrow('λ380–700', { align: 'right', y: kk.h - kk.m.safe, color: 'dim', opacity: words }), { tag: 'lam', clip: false });
    }
    return k.svg();
  },
};
