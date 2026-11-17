// Living icons — symbols with a pulse: an anatomical-ish heart beating lub-dub
// over a synced ECG strip, an IEC power button that boots through press, charge
// sweep and steady-on, and a battery that fills, brims, sparks and drains.
import { blend } from './_raster.js';
import { light } from '../charts/_data.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const fract = (v) => ((v % 1) + 1) % 1;
const gw = (u, c, w) => { const d = Math.abs(fract(u - c + 0.5) - 0.5); return Math.exp(-((d / w) ** 2)); };

export default [
  {
    id: 'objects-beating-heart',
    since: '0.3.0',
    title: 'Beating Heart',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['heart', 'beat', 'pulse', 'ecg', 'cardiac', 'love', 'health', 'lub-dub'],
    order: 200,
    description: 'A shaded implicit-curve heart beats a true lub-dub — systole flush, glow halo and pulse rings — over a scrolling ECG whose QRS spike lands on the beat.',
    size: { w: 44, h: 22 },
    minSize: { w: 18, h: 10 },
    loop: 4,
    canvas: 'field',
    palette: 'synthwave',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const ecg = ctx.height >= 13;
      const cx = W / 2, cyH = HP * (ecg ? 0.40 : 0.5);
      const Sh = Math.max(2, Math.min(W * 0.33, HP * (ecg ? 0.26 : 0.33)));
      const cRed = blend(th.neg, 0xe3243b, 0.45);
      const dark = blend(cRed, 0x120409, 0.72);
      const hi = 0xffd9e0;
      const flush = blend(cRed, 0xff8a9a, 0.6);
      // heart = two lobes (circles) unioned with a convex wedge, as a true SDF
      const TE = [[-0.98, 0.42, 0, 1], [0.98, 0.42, 0.8405, -0.5418], [0, -1.1, -0.8405, -0.5418]];
      const x0 = Math.max(0, Math.floor(cx - Sh * 1.7)), x1 = Math.min(W - 1, Math.ceil(cx + Sh * 1.7));
      const y0 = Math.max(0, Math.floor((cyH - Sh * 1.95) / asp)), y1 = Math.min(H - 1, Math.ceil((cyH + Sh * 1.5) / asp));
      const wave = (u) => 1.35 * gw(u, 0, 0.016) - 0.4 * gw(u, 0.035, 0.012) - 0.25 * gw(u, 0.965, 0.012) + 0.3 * gw(u, 0.22, 0.035) + 0.15 * gw(u, 0.78, 0.03);

      return (t) => {
        cv.clear();
        const bt = fract(t);                               // 60 bpm
        const s = 1 + 0.085 * gw(bt, 0.03, 0.05) + 0.055 * gw(bt, 0.18, 0.06);
        const beatGlow = clamp01((s - 1) / 0.085);
        for (let py = y0; py <= y1; py++) {
          const dyH = (py + 0.5) * asp - cyH;
          for (let px = x0; px <= x1; px++) {
            const xh = (px + 0.5 - cx) / Sh, yh = -(dyH / Sh) - 0.12;
            const x = xh / s, y = yh / s;
            let f = Math.min(Math.hypot(x - 0.52, y - 0.5) - 0.62, Math.hypot(x + 0.52, y - 0.5) - 0.62);
            let tri = -Infinity;
            for (const [ex, ey, nx, ny] of TE) tri = Math.max(tri, (x - ex) * nx + (y - ey) * ny);
            f = Math.min(f, tri);
            const rr = Math.hypot(xh, yh - 0.15);
            // halo and expanding pulse rings live outside the curve
            let ground = th.bg;
            const halA = Math.exp(-Math.max(0, rr - 1.1 * s) * 7) * (0.14 + 0.3 * beatGlow);
            if (halA > 0.03) ground = blend(ground, cRed, halA);
            for (let k = 0; k < 2; k++) {
              const age = bt + k;
              const rA = 0.3 * (1 - age / 2) ** 2 * ss(0.05, 0.2, age);
              if (rA > 0.035 && Math.abs(rr - (1.22 + age * 0.25)) < 0.06) ground = blend(ground, cRed, rA);
            }
            const band = 1.3 / (Sh * s);
            const alpha = ss(band, -band, f);
            if (alpha <= 0) { if (ground !== th.bg) cv.set(px, py, ground); continue; }
            const edge = ss(-0.02, -0.4, f);
            const lum = 0.5 + 0.45 * edge * (0.85 - x * 0.35 + y * 0.3);
            let col = blend(dark, cRed, clamp01(0.3 + lum));
            col = blend(col, hi, clamp01(Math.exp(-(((x + 0.5) ** 2 + (y - 0.6) ** 2)) * 10) * 0.6 * edge));
            col = blend(col, flush, 0.3 * beatGlow);
            cv.set(px, py, alpha >= 1 ? col : blend(ground, col, alpha));
          }
        }
        if (ecg) {
          const ybH = HP * 0.86, amp = HP * 0.075, spd = Math.max(8, W / 2.5);
          let pyPrev = null;
          for (let x = 1; x < W - 1; x++) {
            const u = t - (W - 2 - x) / spd;
            const yH = ybH - wave(fract(u)) * amp;
            const col = blend(th.bg, th.pos, 0.3 + 0.6 * (x / W));
            if (pyPrev !== null) cv.line(x - 1, pyPrev, x, yH / asp, col);
            pyPrev = yH / asp;
          }
          cv.blend(W - 2, pyPrev, light(th), 0.9);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-power-pulse',
    since: '0.3.0',
    title: 'Power Button',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['power', 'button', 'boot', 'standby', 'startup', 'loader', 'ring', 'icon'],
    order: 210,
    description: 'An IEC power symbol boots on a loop: a press flash and ripple, a charge sweep racing around the ring, a breathing steady-on, then a fade to standby.',
    size: { w: 44, h: 22 },
    minSize: { w: 16, h: 8 },
    loop: 6,
    canvas: 'field',
    palette: 'neon',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const cx = W / 2, cyH = HP * 0.52;
      const R = Math.max(2.2, Math.min(W * 0.3, HP * 0.34));
      const gapHalf = 0.46, span = TAU - 2 * gapHalf;
      const sw = Math.max(1.1, R * 0.13);
      const flashC = light(th);
      const bx0 = Math.max(0, Math.floor(cx - R * 1.6)), bx1 = Math.min(W - 1, Math.ceil(cx + R * 1.6));
      const by0 = Math.max(0, Math.floor((cyH - R * 1.6) / asp)), by1 = Math.min(H - 1, Math.ceil((cyH + R * 1.6) / asp));

      return (t) => {
        cv.clear();
        const tn = fract(t / 6);
        const flash = gw(tn, 0.14, 0.022);
        const prog = ss(0.18, 0.60, tn);
        const onK = ss(0.60, 0.66, tn) * (1 - ss(0.88, 0.98, tn));
        const breath = 0.82 + 0.18 * Math.sin(TAU * 6 * tn);
        for (let py = by0; py <= by1; py++) {
          const dyH = (py + 0.5) * asp - cyH;
          for (let px = bx0; px <= bx1; px++) {
            const dx = px + 0.5 - cx;
            const len = Math.hypot(dx, dyH);
            let rel = Math.atan2(dyH, dx) + Math.PI / 2;
            if (rel > Math.PI) rel -= TAU;
            const dSeg = Math.hypot(dx, dyH - Math.min(-0.34 * R, Math.max(-1.22 * R, dyH)));
            let dRing;
            if (Math.abs(rel) >= gapHalf) dRing = Math.abs(len - R);
            else {
              const a1 = gapHalf - Math.PI / 2, a2 = -gapHalf - Math.PI / 2;
              dRing = Math.min(
                Math.hypot(dx - R * Math.cos(a1), dyH - R * Math.sin(a1)),
                Math.hypot(dx - R * Math.cos(a2), dyH - R * Math.sin(a2)),
              );
            }
            const isBar = dSeg < dRing;
            const d = isBar ? dSeg : dRing;
            const core = ss(sw, sw * 0.3, d);
            const glow = d > sw ? Math.exp(-(d - sw) / Math.max(1.5, R * 0.17)) : 1;
            if (core <= 0 && glow < 0.03) continue;
            const u = clamp01(((rel >= 0 ? rel : rel + TAU) - gapHalf) / span);
            const lit = isBar ? prog > 0.02 : u <= prog && prog > 0;
            let col = th.dim, k = 0.3;
            if (lit) {
              col = blend(th.accent, th.accent2, isBar ? 0 : u);
              k = 0.9;
              if (!isBar && prog < 1 && Math.abs(u - prog) < 0.045) col = blend(col, flashC, 0.65);
            }
            if (onK > 0.01) { col = blend(col, th.pos, onK); k = Math.max(k, 0.95 * onK * breath); }
            if (flash > 0.02) { col = blend(col, flashC, flash); k = Math.max(k, flash); }
            const alpha = clamp01(core * (0.35 + 0.65 * k) + glow * 0.4 * k);
            if (alpha > 0.03) cv.set(px, py, blend(th.bg, col, alpha));
          }
        }
        // ripples: one off the press, one when it lands on
        for (const [t0, cc] of [[0.13, th.accent], [0.62, th.pos]]) {
          const rp = (tn - t0) / 0.25;
          if (rp <= 0 || rp >= 1) continue;
          const rr = R * (1 + 1.35 * rp), a = (1 - rp) ** 2 * 0.5;
          for (let i = 0; i < 72; i++) {
            const ag = (i / 72) * TAU;
            cv.blend(cx + rr * Math.cos(ag), (cyH + rr * Math.sin(ag)) / asp, cc, a);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-battery-charge',
    since: '0.3.0',
    title: 'Battery Charging',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['battery', 'charge', 'energy', 'bolt', 'level', 'power', 'status', 'icon'],
    order: 220,
    description: 'A battery fills through red, amber and green with a sloshing wave and rising bubbles while the bolt pulses; at 100% the terminal sparks, then it drains.',
    size: { w: 56, h: 20 },
    minSize: { w: 22, h: 8 },
    loop: 8,
    canvas: 'field',
    palette: 'toxic',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const showPct = ctx.height >= 10 && ctx.width >= 10;
      const bcx = W * 0.5, bcy = HP * (showPct ? 0.44 : 0.5);
      const hw = Math.min(W * 0.36, HP * 0.62), hh = Math.min(HP * (showPct ? 0.3 : 0.38), hw * 0.55);
      const rad = Math.min(hh * 0.35, 2.5), pad = Math.max(1.3, hh * 0.22);
      const nw = Math.max(1.2, hw * 0.1), nh = hh * 0.9;
      const caseC = blend(th.ink, th.muted, 0.25);
      const emptyC = blend(th.bg, th.panel2, 0.85);
      const boltC = th.mode === 'light' ? th.ink : 0xffffff;
      const bubbles = Array.from({ length: 8 }, () => ({ x: ctx.rng(), p: ctx.rng(), m: ctx.rng() < 0.5 ? 2 : 3 }));
      const sc = hh * 0.84;
      const bolt = [[0.1, -0.5], [-0.16, 0.1], [-0.02, 0.1], [-0.1, 0.5], [0.16, -0.08], [0.02, -0.08]]
        .map(([x, y]) => [x * sc * 1.1, y * sc]);
      const x0 = Math.max(0, Math.floor(bcx - hw - 2)), x1 = Math.min(W - 1, Math.ceil(bcx + hw + nw + 2));
      const y0 = Math.max(0, Math.floor((bcy - hh - 2) / asp)), y1 = Math.min(H - 1, Math.ceil((bcy + hh + 2) / asp));
      const pip = (pts, px, py) => { // even-odd point-in-polygon
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < xi + ((py - yi) / (yj - yi)) * (xj - xi)) inside = !inside;
        }
        return inside;
      };

      return (t) => {
        cv.clear();
        const tn = fract(t / 8);
        const q = tn < 0.74 ? ss(0, 0.74, tn) : tn < 0.92 ? 1 : 1 - ss(0.92, 1, tn);
        const cF = q < 0.5 ? blend(th.neg, th.warn, ss(0.16, 0.5, q)) : blend(th.warn, th.pos, ss(0.5, 0.84, q));
        const xeBase = (-hw + pad) + q * (2 * hw - 2 * pad);
        const charging = tn < 0.74;
        const pulse = charging ? 0.45 + 0.35 * Math.sin(TAU * 4 * tn) : 0.95;
        for (let py = y0; py <= y1; py++) {
          const dyH = (py + 0.5) * asp - bcy;
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - bcx;
            let qx = Math.abs(dx) - (hw - rad), qy = Math.abs(dyH) - (hh - rad);
            const dRR = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
            qx = Math.abs(dx - (hw + nw / 2)) - nw / 2; qy = Math.abs(dyH) - nh / 2;
            const dN = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
            const d = Math.min(dRR, dN);
            if (d > 1) continue;
            if (d > -1) { cv.set(px, py, blend(th.bg, caseC, clamp01(1 - Math.abs(d) * 0.7))); continue; }
            // interior
            const inNub = dN < dRR;
            const xe = xeBase + (q > 0.02 && q < 0.98 ? 1.1 * Math.sin(dyH * 0.9 + TAU * 6 * tn) : 0);
            const filled = inNub ? q >= 0.995 : dx < xe;
            if (!filled) { cv.set(px, py, emptyC); continue; }
            let col = blend(cF, 0x000000, 0.22 * clamp01(dyH / hh + 1) * 0.5);
            col = blend(col, 0xffffff, 0.16 * clamp01(-dyH / hh));
            if (!inNub && xe - dx < 1.2 && q < 0.98) col = blend(col, 0xffffff, 0.3);
            if (pip(bolt, dx, dyH)) col = blend(col, boltC, pulse);
            cv.set(px, py, col);
          }
        }
        // bubbles rising through the fill
        if (q > 0.05 && q < 0.98) {
          for (const b of bubbles) {
            const bx = -hw + pad + b.x * (2 * hw - 2 * pad);
            if (bx > xeBase - 1.5) continue;
            const byH = (hh - pad) - fract(b.p + b.m * tn) * (2 * hh - 2 * pad);
            cv.blend(bcx + bx, (bcy + byH) / asp, 0xffffff, 0.45);
          }
        }
        // terminal sparks while it holds full charge
        if (tn >= 0.75 && tn < 0.92) {
          const tipX = bcx + hw + nw + 0.5;
          for (let i = 0; i < 3; i++) {
            const a = (0.5 + 0.5 * Math.sin(TAU * (tn * 12 + i / 3))) * 0.8;
            const ang = -0.6 + i * 0.6;
            cv.line(tipX, (bcy + Math.sin(ang)) / asp, tipX + 2.4 * Math.cos(ang * 0.7), (bcy + 3 * Math.sin(ang)) / asp, blend(th.bg, blend(th.warn, 0xffe9a0, 0.5), a));
          }
        }
        cv.paint(ctx.buffer);
        if (showPct) {
          const rowB = Math.min(ctx.height - 1, Math.floor((bcy + hh) / asp / (cv.height / ctx.height)) + 1);
          const str = `${Math.round(q * 100)}%`;
          ctx.buffer.text(Math.max(0, Math.round(ctx.width / 2 - str.length / 2)), rowB, str, q >= 0.995 ? th.pos : th.muted);
        }
      };
    },
  },
];
