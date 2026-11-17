// Powered machines — three industrial mechanisms driven by real linkage math:
// an inline-four engine cutaway (slider-crank pistons, 1-3-4-2 firing order),
// a pumpjack whose walking beam is solved from the crank-pitman constraint by
// bisection, and a pick-and-place robot arm running two-link IK over keyframed
// targets, lifting crates off one conveyor and setting them on another.
import { blend, fillPoly } from './_raster.js';
import { NONE } from '../../color.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const fract = (v) => ((v % 1) + 1) % 1;

// All geometry below works in "horizontal pixel" units; y is divided by the
// canvas aspect only at draw time, so shapes stay true in every canvas mode.
const toPx = (asp, pts) => pts.map((p) => [p[0], p[1] / asp]);
const poly = (cv, asp, pts, col) => cv.polygon(toPx(asp, pts), col);
const polyA = (cv, asp, pts, col, a, bg) => fillPoly(cv, toPx(asp, pts), (x, y, old) => blend(old === NONE ? bg : old, col, a));
const seg = (cv, asp, x0, y0, x1, y1, c) => cv.line(x0, y0 / asp, x1, y1 / asp, c);
const disc = (cv, asp, x, y, r, c, fill = true) => cv.ellipse(x, y / asp, r, r / asp, c, fill);
function thick(cv, asp, x0, y0, x1, y1, w, col) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const px = (-dy / l) * (w / 2), py = (dx / l) * (w / 2);
  poly(cv, asp, [[x0 + px, y0 + py], [x1 + px, y1 + py], [x1 - px, y1 - py], [x0 - px, y0 - py]], col);
}

export default [
  {
    id: 'objects-piston-engine',
    since: '0.3.0',
    title: 'Inline-Four Engine',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['engine', 'piston', 'crankshaft', 'cylinder', 'combustion', 'cutaway', 'mechanical', 'motor'],
    order: 200,
    description: 'A cutaway inline-four: slider-crank pistons rise and fall over a spinning crankshaft while cylinders flash in 1-3-4-2 firing order.',
    size: { w: 72, h: 22 },
    minSize: { w: 28, h: 10 },
    loop: 4,
    canvas: 'field',
    palette: 'fire',
    params: { speed: { default: 1, min: 0.2, max: 3, label: 'Engine speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const speed = ctx.param('speed', 1);
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const n = 4;
      const r = HP * 0.125, L = r * 2.2, ph = Math.max(1.4, r * 0.95);
      const yc = HP - r * 1.7 - 0.5;                       // crank centerline
      const crownTDC = yc - (r + L) - ph * 0.55;           // piston crown at TDC
      const yHead = crownTDC - r * 0.35;                   // top of the combustion chamber
      const hh = Math.max(1, r * 0.5);                     // head block height
      const pitch = (W - 4) / n;
      const cw = Math.min(pitch * 0.68, r * 2.3);          // bore width
      const cxs = Array.from({ length: n }, (_, i) => 2 + pitch * (i + 0.5));
      const phase = [0, Math.PI, Math.PI, 0];
      const fire = [0, 3 * Math.PI, Math.PI, 2 * Math.PI]; // 1-3-4-2
      const metal = (k) => blend(blend(0x1d242e, 0xc7d2de, k), th.ink, 0.08);
      const boreC = blend(th.bg, 0x12161d, th.mode === 'light' ? 0.18 : 0.55);
      const fireC = blend(th.warn, 0xffc24a, 0.5);
      const skirt = yc - (L - r) + ph * 0.5;               // lowest point the piston reaches

      return (t) => {
        cv.clear();
        // engine block behind everything, and the sump line
        polyA(cv, asp, [[1, yHead - hh], [W - 1, yHead - hh], [W - 1, yc + r * 1.4], [1, yc + r * 1.4]], blend(th.bg, th.panel2, 0.9), 0.75, th.bg);
        seg(cv, asp, 1, yc + r * 1.4, W - 1, yc + r * 1.4, blend(th.bg, th.line, 0.9));
        for (let i = 0; i < n; i++) {
          const cx = cxs[i];
          const th0 = TAU * 2 * t * speed + phase[i];
          const sinT = Math.sin(th0), cosT = Math.cos(th0);
          const pinY = yc - (r * cosT + Math.sqrt(Math.max(0.01, L * L - r * r * sinT * sinT)));
          const crown = pinY - ph * 0.55;
          const kx = cx + r * sinT, ky = yc - r * cosT;    // crank pin
          // bore
          poly(cv, asp, [[cx - cw / 2, yHead], [cx + cw / 2, yHead], [cx + cw / 2, skirt + 1], [cx - cw / 2, skirt + 1]], boreC);
          // combustion flash, decaying from this cylinder's moment in the firing order
          const cyc = ((th0 - fire[i]) % (2 * TAU) + 2 * TAU) % (2 * TAU);
          const fk = Math.exp(-cyc * 2.1);
          if (fk > 0.03) {
            const y0 = Math.max(0, Math.ceil(yHead / asp)), y1 = Math.min(H - 1, Math.floor(crown / asp));
            for (let py = y0; py <= y1; py++) {
              const depth = 1 - (py * asp - yHead) / Math.max(0.5, crown - yHead);
              for (let px = Math.ceil(cx - cw / 2); px <= Math.floor(cx + cw / 2); px++) {
                const e = 1 - Math.abs((px + 0.5 - cx) / (cw / 2)) ** 2;
                if (e > 0) cv.blend(px, py, fireC, clamp01(fk * (0.25 + 0.75 * depth) * e));
              }
            }
          }
          // piston with ring grooves
          const pw = cw * 0.82;
          const py0 = Math.ceil(crown / asp), py1 = Math.floor((crown + ph) / asp);
          for (let py = Math.max(0, py0); py <= Math.min(H - 1, py1); py++) {
            const k = (py - py0) / Math.max(1, py1 - py0);
            const ring = py - py0 === 1 || py - py0 === 2;
            const col = ring ? metal(0.22) : metal(0.72 - 0.4 * k);
            for (let px = Math.ceil(cx - pw / 2); px <= Math.floor(cx + pw / 2); px++) cv.set(px, py, col);
          }
          // connecting rod and crank throw
          thick(cv, asp, cx, pinY, kx, ky, Math.max(1.1, r * 0.24), metal(0.5));
          disc(cv, asp, cx, pinY, Math.max(0.8, r * 0.16), metal(0.85));
          const lobe = th0 + Math.PI;
          poly(cv, asp, [
            [cx + r * 0.5 * Math.sin(lobe - 0.75), yc - r * 0.5 * Math.cos(lobe - 0.75)],
            [cx + r * 1.28 * Math.sin(lobe - 0.4), yc - r * 1.28 * Math.cos(lobe - 0.4)],
            [cx + r * 1.28 * Math.sin(lobe + 0.4), yc - r * 1.28 * Math.cos(lobe + 0.4)],
            [cx + r * 0.5 * Math.sin(lobe + 0.75), yc - r * 0.5 * Math.cos(lobe + 0.75)],
          ], metal(0.3));
          disc(cv, asp, cx, yc, Math.max(1, r * 0.34), metal(0.2));
          disc(cv, asp, kx, ky, Math.max(0.8, r * 0.2), metal(0.95));
          // cylinder walls, head and spark plug
          seg(cv, asp, cx - cw / 2, yHead, cx - cw / 2, skirt + 1, metal(0.62));
          seg(cv, asp, cx + cw / 2, yHead, cx + cw / 2, skirt + 1, metal(0.38));
          poly(cv, asp, [[cx - cw * 0.62, yHead - hh], [cx + cw * 0.62, yHead - hh], [cx + cw * 0.62, yHead], [cx - cw * 0.62, yHead]], metal(0.55));
          seg(cv, asp, cx, yHead - hh - Math.max(1, r * 0.3), cx, yHead, metal(0.8));
          if (fk > 0.45) disc(cv, asp, cx, yHead + 0.6, Math.max(0.6, cw * 0.07), blend(fireC, 0xffffff, 0.5));
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-pumpjack',
    since: '0.3.0',
    title: 'Pumpjack',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['pumpjack', 'oil', 'well', 'walking beam', 'crank', 'linkage', 'nodding donkey', 'industrial'],
    order: 210,
    description: 'A nodding-donkey oil pumpjack: the crank and counterweight swing a pitman that rocks the walking beam, solved from the true linkage geometry.',
    size: { w: 68, h: 22 },
    minSize: { w: 28, h: 10 },
    loop: 8,
    canvas: 'field',
    palette: 'sunset',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const S = Math.min(W / 24, HP / 13.5);
      const yg = HP - 1.5;
      const P = [W * 0.47, yg - 7.4 * S];                 // beam pivot atop the samson post
      const lbR = 5.2 * S, lbF = 6.8 * S, hh = 1.5 * S;   // beam arms, horsehead depth
      const C = [P[0] + 4.3 * S, yg - 2.3 * S], rc = 1.9 * S;
      const pt = (o, a, rr) => [o[0] + rr * Math.cos(a), o[1] - rr * Math.sin(a)];
      // Pitman length: midway between the extremes of |R(β=0) − K(θ)|.
      let dmin = Infinity, dmax = -Infinity;
      for (let i = 0; i < 64; i++) {
        const K = pt(C, (i / 64) * TAU, rc), R0 = pt(P, 0, lbR);
        const d = Math.hypot(R0[0] - K[0], R0[1] - K[1]);
        dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
      }
      const Lp = (dmin + dmax) / 2;
      // β(θ) table: |R(β) − K(θ)| grows with β, so bisection is safe.
      const NT = 128, beta = new Float32Array(NT + 1);
      for (let i = 0; i <= NT; i++) {
        const K = pt(C, (i / NT) * TAU, rc);
        let lo = -0.6, hi = 0.6;
        for (let it = 0; it < 26; it++) {
          const mid = (lo + hi) / 2, R = pt(P, mid, lbR);
          if (Math.hypot(R[0] - K[0], R[1] - K[1]) < Lp) lo = mid; else hi = mid;
        }
        beta[i] = (lo + hi) / 2;
      }
      const steel = (k) => blend(blend(0x191c22, 0xb9c3cf, k), th.ink, 0.08);
      const rust = blend(0x8a4426, th.warn, 0.3);

      return (t) => {
        cv.clear();
        const u = fract(t / 8) * 2;                       // two strokes per loop
        const thC = fract(u) * TAU;
        const idx = fract(u) * NT, i0 = Math.floor(idx);
        const b = beta[i0] + (beta[Math.min(NT, i0 + 1)] - beta[i0]) * (idx - i0);
        const K = pt(C, thC, rc), R = pt(P, b, lbR), F = pt(P, Math.PI + b, lbF);
        // ground and hard-pan hatching
        seg(cv, asp, 0, yg, W - 1, yg, blend(th.bg, th.line, 0.95));
        for (let x = 1; x < W - 2; x += 4) seg(cv, asp, x, yg + 1, x + 1.6, yg + 1, blend(th.bg, th.line, 0.5));
        // wellhead and polished rod hung off the horsehead's bridle
        const rodX = P[0] - (lbF + hh * 0.7);
        const rodTop = P[1] + (lbF + hh * 0.7) * Math.sin(b);
        poly(cv, asp, [[rodX - S * 0.7, yg - S * 1.1], [rodX + S * 0.7, yg - S * 1.1], [rodX + S * 0.7, yg], [rodX - S * 0.7, yg]], steel(0.35));
        seg(cv, asp, rodX, rodTop, rodX, yg - S * 1.1, steel(0.95));
        // samson post
        seg(cv, asp, P[0] - 2.1 * S, yg, P[0], P[1], steel(0.55));
        seg(cv, asp, P[0] + 2.1 * S, yg, P[0], P[1], steel(0.4));
        seg(cv, asp, P[0] - 1.25 * S, yg - 3 * S, P[0] + 1.25 * S, yg - 3 * S, steel(0.3));
        // crank, counterweight and pitman behind the beam
        disc(cv, asp, C[0], C[1], rc * 1.12, steel(0.22));
        const lo = thC + Math.PI;
        poly(cv, asp, [pt(C, lo - 0.5, rc * 0.7), pt(C, lo - 0.33, rc * 1.55), pt(C, lo + 0.33, rc * 1.55), pt(C, lo + 0.5, rc * 0.7)], steel(0.45));
        seg(cv, asp, K[0] - 0.4, K[1], R[0] - 0.4, R[1], steel(0.7));
        seg(cv, asp, K[0] + 0.4, K[1], R[0] + 0.4, R[1], steel(0.5));
        disc(cv, asp, C[0], C[1], Math.max(0.8, rc * 0.2), steel(0.8));
        disc(cv, asp, K[0], K[1], Math.max(0.8, rc * 0.18), steel(1));
        // motor shed with a spinning pulley and drive belt
        const M = [C[0] - 3.6 * S, yg - 0.8 * S];
        poly(cv, asp, [[M[0] - 1.2 * S, M[1] - 0.8 * S], [M[0] + 1.2 * S, M[1] - 0.8 * S], [M[0] + 1.2 * S, yg], [M[0] - 1.2 * S, yg]], rust);
        disc(cv, asp, M[0], M[1] - S * 0.9, S * 0.55, steel(0.6));
        const pa = thC * 3;
        seg(cv, asp, M[0] - S * 0.5 * Math.cos(pa), M[1] - S * 0.9 - S * 0.5 * Math.sin(pa), M[0] + S * 0.5 * Math.cos(pa), M[1] - S * 0.9 + S * 0.5 * Math.sin(pa), steel(1));
        seg(cv, asp, M[0], M[1] - S * 1.4, C[0], C[1] - rc * 0.3, blend(th.bg, th.muted, 0.7));
        // walking beam and horsehead
        thick(cv, asp, R[0], R[1], F[0], F[1], Math.max(1.2, S * 0.5), rust);
        disc(cv, asp, P[0], P[1], Math.max(1, S * 0.42), steel(0.75));
        polyA(cv, asp, [pt(P, Math.PI + b - 0.2, lbF), pt(P, Math.PI + b - 0.18, lbF + hh), pt(P, Math.PI + b + 0.2, lbF + hh), pt(P, Math.PI + b + 0.16, lbF * 0.98)], rust, 1, th.bg);
        seg(cv, asp, F[0] - 0.3 * S, F[1] + 0.2 * S, rodX, rodTop, blend(th.bg, th.muted, 0.85));
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-robot-arm',
    since: '0.3.0',
    title: 'Pick & Place',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['robot', 'arm', 'gripper', 'conveyor', 'automation', 'kinematics', 'factory', 'crate'],
    order: 220,
    description: 'A two-link robot arm runs inverse kinematics to lift crates off the inbound conveyor, swing them overhead and set them on the outbound belt.',
    size: { w: 72, h: 22 },
    minSize: { w: 32, h: 10 },
    loop: 6,
    canvas: 'field',
    palette: 'ice',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const yg = HP - 1.5;
      const xb = W * 0.5, Sy = yg - HP * 0.52, Sx = xb;
      const L1 = HP * 0.40, L2 = HP * 0.33;
      const beltY = yg - HP * 0.11, cs = Math.max(1.6, HP * 0.11), fl = Math.max(1, HP * 0.06);
      const gripY = beltY - cs - fl * 0.9;
      const dy = gripY - Sy;
      const dxr = Math.min(W * 0.30, Math.sqrt(Math.max(1, ((L1 + L2) * 0.93) ** 2 - dy * dy)));
      const xPick = xb - dxr, xDrop = xb + dxr;
      const pitch = Math.max(cs * 2.2, W * 0.16);
      const hov = Math.min(HP * 0.16, Math.max(2, Sy - 2));
      const hoverL = [xPick, gripY - hov], hoverR = [xDrop, gripY - hov], dropP = [xDrop, gripY];
      const lerp2 = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
      const steel = (k) => blend(blend(0x1b212b, 0xc3cedb, k), th.accent, 0.1);
      const crateC = blend(0x9a6b35, th.warn, 0.25);

      const ikJ = (tg, s) => {
        const ddx = tg[0] - Sx, ddy = tg[1] - Sy;
        const d = Math.hypot(ddx, ddy) || 1e-3;
        const dc = Math.min((L1 + L2) * 0.985, Math.max(Math.abs(L1 - L2) * 1.1 + 0.4, d));
        const a = Math.atan2(ddy, ddx);
        const k = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc))));
        const t1 = a + s * k;
        const ex = Sx + L1 * Math.cos(t1), ey = Sy + L1 * Math.sin(t1);
        return [t1, Math.atan2(Sy + dc * Math.sin(a) - ey, Sx + dc * Math.cos(a) - ex)];
      };
      const wrapPi = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU; return a - Math.PI; };
      const jlerp = (A, B, k) => [A[0] + wrapPi(B[0] - A[0]) * k, A[1] + wrapPi(B[1] - A[1]) * k];
      // elbow stays on the outside of each reach; the carry is a joint-space
      // sweep through a raised overhead waypoint, the way real arms move
      const jHoverL = ikJ(hoverL, 1), jHoverR = ikJ(hoverR, -1), jDrop = ikJ(dropP, -1);
      const jTop = ikJ([xb, Math.max(1.5, Sy - (L1 + L2) * 0.52)], -1);
      const pose = (tn) => {
        const fa = fract(tn - 0.23);
        const gl = [xPick - pitch * (1 - fa), gripY];
        if (tn < 0.08) return { j: jHoverL, g: 0.2, c: false };
        if (tn < 0.21) return { j: ikJ(lerp2(hoverL, gl, ss(0.08, 0.21, tn)), 1), g: 0.2, c: false };
        if (tn < 0.23) return { j: ikJ(gl, 1), g: 0.2 + ((tn - 0.21) / 0.02) * 0.5, c: false };
        if (tn < 0.33) return { j: ikJ(lerp2([xPick, gripY], hoverL, ss(0.23, 0.33, tn)), 1), g: 1, c: true };
        if (tn < 0.58) { const k = ss(0.33, 0.58, tn); return { j: k < 0.5 ? jlerp(jHoverL, jTop, k * 2) : jlerp(jTop, jHoverR, k * 2 - 1), g: 1, c: true }; }
        if (tn < 0.70) return { j: ikJ(lerp2(hoverR, dropP, ss(0.58, 0.70, tn)), -1), g: 1, c: true };
        if (tn < 0.74) return { j: jDrop, g: 1 - ((tn - 0.70) / 0.04) * 0.8, c: tn < 0.72 };
        if (tn < 0.84) return { j: ikJ(lerp2(dropP, hoverR, ss(0.74, 0.84, tn)), -1), g: 0.2, c: false };
        const k = ss(0.84, 1, tn);
        return { j: k < 0.5 ? jlerp(jHoverR, jTop, k * 2) : jlerp(jTop, jHoverL, k * 2 - 1), g: 0.2, c: false };
      };
      const crate = (x, top) => {
        poly(cv, asp, [[x - cs / 2, top], [x + cs / 2, top], [x + cs / 2, top + cs * 0.82], [x - cs / 2, top + cs * 0.82]], crateC);
        seg(cv, asp, x - cs / 2, top, x + cs / 2, top, blend(crateC, 0xffffff, 0.35));
        seg(cv, asp, x, top, x, top + cs * 0.82, blend(crateC, 0x000000, 0.35));
      };

      return (t) => {
        cv.clear();
        const tn = fract(t / 6);
        const fa = fract(tn - 0.23), fb = fract(tn - 0.72);
        // conveyors: rails, legs, rollers and treads that actually travel
        const lineC = blend(th.bg, th.line, 1), legC = blend(th.bg, th.muted, 0.6);
        seg(cv, asp, 0, beltY, xPick + pitch * 0.3, beltY, lineC);
        seg(cv, asp, xDrop - pitch * 0.3, beltY, W - 1, beltY, lineC);
        for (const lx of [xPick - pitch, xPick, xDrop, xDrop + pitch]) if (lx > 1 && lx < W - 1) seg(cv, asp, lx, beltY, lx, yg, legC);
        seg(cv, asp, 0, yg, W - 1, yg, blend(th.bg, th.line, 0.7));
        for (let x = 0; x < xPick + pitch * 0.3; x += 3) seg(cv, asp, x + fa * 3, beltY + 0.9, x + fa * 3 + 1.2, beltY + 0.9, legC);
        for (let x = xDrop - pitch * 0.3; x < W; x += 3) seg(cv, asp, x + fb * 3, beltY + 0.9, x + fb * 3 + 1.2, beltY + 0.9, legC);
        // crates waiting on the inbound belt (k = 1.. so the picked one hands off cleanly)
        for (let k = 1; k <= 6; k++) { const x = xPick - pitch * (k - fa); if (x > -cs) crate(x, beltY - cs * 0.82); }
        // crates riding away on the outbound belt
        for (let j = 0; j < 7; j++) { const x = xDrop + pitch * (fb + j); if (x < W + cs) crate(x, beltY - cs * 0.82); }
        // pedestal
        poly(cv, asp, [[xb - cs * 0.5, Sy], [xb + cs * 0.5, Sy], [xb + cs * 0.9, yg], [xb - cs * 0.9, yg]], steel(0.3));
        seg(cv, asp, xb - cs * 1.1, yg, xb + cs * 1.1, yg, steel(0.55));
        // arm
        const { j, g, c } = pose(tn);
        const ex = Sx + L1 * Math.cos(j[0]), ey = Sy + L1 * Math.sin(j[0]);
        const tx = ex + L2 * Math.cos(j[1]), ty = ey + L2 * Math.sin(j[1]);
        thick(cv, asp, Sx, Sy, ex, ey, Math.max(1.4, HP * 0.05), steel(0.62));
        thick(cv, asp, ex, ey, tx, ty, Math.max(1.2, HP * 0.04), steel(0.8));
        disc(cv, asp, Sx, Sy, Math.max(1, HP * 0.035), steel(0.95));
        disc(cv, asp, ex, ey, Math.max(0.8, HP * 0.028), steel(0.95));
        // gripper: palm bar plus two fingers that close around the crate
        const gap = cs * 0.62 + (1 - g) * cs * 0.55;
        seg(cv, asp, tx - gap / 2, ty, tx + gap / 2, ty, steel(0.9));
        seg(cv, asp, tx - gap / 2, ty, tx - gap / 2, ty + fl, steel(1));
        seg(cv, asp, tx + gap / 2, ty, tx + gap / 2, ty + fl, steel(1));
        if (c) {
          crate(tx, ty + fl * 0.55);
          for (let dxs = -cs; dxs <= cs; dxs++) { const k = 1 - Math.abs(dxs) / cs; if (k > 0) cv.blend(tx + dxs, (yg - 0.4) / asp, 0x000000, 0.3 * k); }
        }
        // status beacon on the pedestal
        disc(cv, asp, xb, Sy + (yg - Sy) * 0.3, Math.max(0.7, HP * 0.02), c ? th.pos : blend(th.bg, th.pos, 0.35 + 0.2 * Math.sin(TAU * 2 * tn)));
        cv.paint(ctx.buffer);
      };
    },
  },
];
