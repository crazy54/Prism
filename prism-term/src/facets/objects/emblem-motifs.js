// Emblem motifs — three badge-worthy marks in motion: an infinity ribbon woven
// over and under itself with two comet heads chasing the loop, a compass whose
// needle settles on new headings with damped spring wobble, and an umbrella
// shrugging off a slanting rainstorm that splashes, drips and sheds runoff.
import { blend, fillPoly } from './_raster.js';
import { NONE } from '../../color.js';
import { light } from '../charts/_data.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const fract = (v) => ((v % 1) + 1) % 1;
const wrapPi = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU; return a - Math.PI; };

export default [
  {
    id: 'objects-infinity-ribbon',
    since: '0.3.0',
    title: 'Infinity Ribbon',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['infinity', 'lemniscate', 'ribbon', 'loop', 'weave', 'comet', 'endless', 'icon'],
    order: 230,
    description: 'A lemniscate ribbon woven over and under itself at the crossing, while two comet heads chase each other around the loop and spark where they meet.',
    size: { w: 64, h: 20 },
    minSize: { w: 24, h: 8 },
    loop: 8,
    canvas: 'field',
    palette: 'prism',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const cx = W / 2, cyH = HP * 0.5;
      const a = Math.max(3, Math.min(W / 2 - 3, (HP / 2 - 1.5) / 0.3545));
      const N = 144;
      const P = (u) => {
        const k = 1 + Math.sin(u) ** 2;
        return [cx + (a * Math.cos(u)) / k, cyH + (a * Math.sin(u) * Math.cos(u)) / k];
      };
      const wB = Math.max(1.5, a * 0.075);
      const lightC = light(th);
      const segs = [];
      for (let i = 0; i < N; i++) {
        const u0 = (i / N) * TAU, u1 = ((i + 1) / N) * TAU, um = (u0 + u1) / 2;
        const p0 = P(u0), p1 = P(u1);
        const z = Math.sin(um);
        const w = wB * (0.65 + 0.55 * (z + 1) / 2);
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
        const px = (-dy / l) * (w / 2), py = (dx / l) * (w / 2);
        segs.push({
          z,
          col: blend(th.accent, th.accent2, (z + 1) / 2),
          alpha: 0.5 + 0.3 * (z + 1) / 2,
          a: [p0[0], p0[1] / asp], b: [p1[0], p1[1] / asp],
          pts: [[p0[0] + px, (p0[1] + py) / asp], [p1[0] + px, (p1[1] + py) / asp], [p1[0] - px, (p1[1] - py) / asp], [p0[0] - px, (p0[1] - py) / asp]],
        });
      }
      const order = segs.map((_, i) => i).sort((i, j) => segs[i].z - segs[j].z);
      const back = order.filter((i) => segs[i].z < 0), front = order.filter((i) => segs[i].z >= 0);
      const drawBase = (list) => {
        for (const i of list) {
          const s = segs[i];
          cv.line(s.a[0], s.a[1], s.b[0], s.b[1], blend(th.bg, s.col, s.alpha));
          fillPoly(cv, s.pts, (x, y, old) => blend(old === NONE ? th.bg : old, s.col, s.alpha));
        }
      };
      const TL = 30, du = TAU / 150;
      const drawTrail = (uh, cc, wantFront) => {
        for (let k = TL; k >= 0; k--) {
          const u = uh - k * du, z = Math.sin(u);
          if (z >= 0 !== wantFront) continue;
          const p = P(u);
          const al = (1 - k / TL) ** 2 * 0.9;
          const col = blend(cc, lightC, 0.5 * (1 - k / TL));
          const px = p[0], py = p[1] / asp;
          cv.blend(px, py, col, al);
          cv.blend(px + 1, py, col, al * 0.5);
          cv.blend(px - 1, py, col, al * 0.5);
          cv.blend(px, py + 1, col, al * 0.35);
          cv.blend(px, py - 1, col, al * 0.35);
        }
      };

      return (t) => {
        cv.clear();
        const tn = fract(t / 8);
        const u1 = TAU * 2 * tn, u2 = u1 + Math.PI;
        drawBase(back);
        drawTrail(u1, th.accent, false);
        drawTrail(u2, th.accent2, false);
        drawBase(front);
        drawTrail(u1, th.accent, true);
        drawTrail(u2, th.accent2, true);
        for (const uh of [u1, u2]) {
          let md = Infinity;
          for (const c of [Math.PI / 2, (3 * Math.PI) / 2]) md = Math.min(md, Math.abs(wrapPi(uh - c)));
          const spk = Math.exp(-((md / 0.14) ** 2));
          if (spk > 0.05) {
            for (const [ddx, ddy] of [[2.2, 0], [-2.2, 0], [0, 1.6], [0, -1.6]]) {
              cv.line(cx, cyH / asp, cx + ddx * (0.5 + spk), (cyH + ddy * (0.5 + spk)) / asp, blend(th.bg, lightC, spk * 0.8));
            }
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-compass',
    since: '0.3.0',
    title: 'Compass',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['compass', 'needle', 'navigation', 'bearing', 'north', 'rose', 'heading', 'instrument'],
    order: 240,
    description: 'A bezelled compass rose with degree ticks and cardinal letters; the needle swings to seeded headings and settles with a damped, underdamped wobble.',
    size: { w: 48, h: 24 },
    minSize: { w: 18, h: 9 },
    loop: 10,
    canvas: 'field',
    palette: 'ice',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const cx = W / 2, cyH = HP * 0.5;
      const Rc = Math.max(3, Math.min(W * 0.44, HP * 0.44));
      const LIGHT = Math.atan2(-1, -1);
      const lightC = light(th);
      const face = blend(th.bg, th.panel, 0.85);
      const bez = blend(th.bg, th.line, 0.95);
      const north = blend(th.neg, 0xe23030, 0.35);
      const south = blend(th.bg, th.ink, 0.55);
      const H6 = [ctx.rng() * TAU];
      for (let i = 1; i <= 4; i++) H6.push(H6[i - 1] + (ctx.rng() - 0.5) * 2.6);
      H6.push(H6[0] + Math.round((H6[4] - H6[0]) / TAU) * TAU); // settle back where it began
      const step24 = TAU / 24, step4 = TAU / 4;
      const letters = ctx.width >= 18 && ctx.height >= 9;
      const ppcx = cv.width / ctx.width, ppcy = cv.height / ctx.height;
      const x0 = Math.max(0, Math.floor(cx - Rc - 1)), x1 = Math.min(W - 1, Math.ceil(cx + Rc + 1));
      const y0 = Math.max(0, Math.floor((cyH - Rc - 1) / asp)), y1 = Math.min(H - 1, Math.ceil((cyH + Rc + 1) / asp));

      return (t) => {
        cv.clear();
        const tn = fract(t / 10);
        // dial, per pixel: bezel ring, face, 8-point rose, 15° ticks with bold cardinals
        for (let py = y0; py <= y1; py++) {
          const dyH = (py + 0.5) * asp - cyH;
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - cx;
            const rr = Math.hypot(dx, dyH);
            if (rr > Rc + 0.5) continue;
            const aG = Math.atan2(dyH, dx);
            let col;
            if (rr > Rc - 1.6) {
              col = blend(bez, lightC, 0.45 * Math.max(0, Math.cos(aG - LIGHT)));
            } else {
              col = face;
              const roseK = Math.pow(Math.max(0, Math.cos(4 * aG)), 18) * clamp01(1.1 - rr / (Rc * 0.75)) * 0.35;
              if (roseK > 0.01) col = blend(col, th.muted, roseK);
              const da24 = Math.abs(aG - Math.round(aG / step24) * step24) * rr;
              const da4 = Math.abs(wrapPi(aG - Math.round(aG / step4) * step4)) * rr;
              if (da4 < 0.7 && rr > Rc * 0.72 && rr < Rc * 0.92) col = blend(col, th.ink, 0.8);
              else if (da24 < 0.4 && rr > Rc * 0.8 && rr < Rc * 0.92) col = blend(col, th.dim, 0.8);
            }
            cv.set(px, py, rr > Rc - 0.5 ? blend(th.bg, col, clamp01(Rc + 0.5 - rr)) : col);
          }
        }
        // lubber line at the top of the bezel
        cv.polygon([[cx - 1.1, (cyH - Rc + 2.2) / asp], [cx + 1.1, (cyH - Rc + 2.2) / asp], [cx, (cyH - Rc + 0.6) / asp]], th.warn);
        // needle: spring-settles toward each seeded heading in turn
        const i = Math.min(4, Math.floor(tn * 5)), tf = tn * 5 - i;
        const to = H6[i + 1], delta = wrapPi(H6[i] - to);
        const th0 = to + delta * Math.exp(-4.5 * tf) * Math.cos(9 * tf) + 0.012 * Math.sin(TAU * 10 * tn + 1.7);
        const dxn = Math.cos(th0), dyn = Math.sin(th0);
        const Ln = Rc * 0.66, hwN = Math.max(1.1, Rc * 0.1);
        const pxp = -dyn * hwN, pyp = dxn * hwN;
        const tri = (tipX, tipY, col, ox, oy, alpha) => {
          const pts = [[tipX + ox, (tipY + oy) / asp], [cx + pxp + ox, (cyH + pyp + oy) / asp], [cx - pxp + ox, (cyH - pyp + oy) / asp]];
          if (alpha >= 1) cv.polygon(pts, col);
          else fillPoly(cv, pts, (x, y, old) => blend(old === NONE ? th.bg : old, col, alpha));
        };
        tri(cx + dxn * Ln, cyH + dyn * Ln, 0x000000, 0.8, 0.8, 0.28);
        tri(cx - dxn * Ln * 0.92, cyH - dyn * Ln * 0.92, 0x000000, 0.8, 0.8, 0.28);
        tri(cx + dxn * Ln, cyH + dyn * Ln, north, 0, 0, 1);
        tri(cx - dxn * Ln * 0.92, cyH - dyn * Ln * 0.92, south, 0, 0, 1);
        cv.line(cx, cyH / asp, cx + dxn * Ln, (cyH + dyn * Ln) / asp, blend(north, 0xffffff, 0.3));
        cv.ellipse(cx, cyH / asp, Math.max(1, Rc * 0.1), Math.max(1, Rc * 0.1) / asp, th.accent, true);
        cv.blend(cx - 0.5, cyH / asp - 0.5, lightC, 0.6);
        cv.paint(ctx.buffer);
        if (letters) {
          const rT = Rc * 0.58;
          const at = (pxX, pyH) => [Math.floor(pxX / ppcx), Math.floor(pyH / asp / ppcy)];
          const pos = { N: at(cx, cyH - rT), E: at(cx + rT, cyH), S: at(cx, cyH + rT), W: at(cx - rT, cyH) };
          for (const [ch, [c, r]] of Object.entries(pos)) ctx.buffer.text(c, r, ch, ch === 'N' ? th.neg : th.muted);
        }
      };
    },
  },

  {
    id: 'objects-umbrella-rain',
    since: '0.3.0',
    title: 'Umbrella in Rain',
    gallery: 'objects',
    category: 'Icons & Logos',
    kind: 'art',
    tags: ['umbrella', 'rain', 'storm', 'weather', 'shelter', 'drops', 'splash', 'canopy'],
    order: 250,
    description: 'Slanting rain streaks splash off a scalloped two-tone canopy and drip from its tips, leaving a dry pocket beneath while the umbrella sways in gusts.',
    size: { w: 56, h: 24 },
    minSize: { w: 22, h: 10 },
    loop: 6,
    canvas: 'field',
    palette: 'ocean',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const Tx = W * 0.46, Ty = HP * 0.14;
      const Rx = Math.max(3, Math.min(W * 0.34, HP * 0.46));
      const Rh = Math.min(Rx * 0.56, HP * 0.34);
      const rimY = Ty + Rh;
      const yHnd = HP - 2.8, yGr = HP - 1.4;
      const rh = Math.max(1.2, HP * 0.06);
      const scD = Math.max(0.6, Rh * 0.22);
      const poleC = blend(th.muted, 0x6b4a2e, 0.35);
      const rainC = blend(th.bg, th.info, 0.62);
      const vx = -0.18;
      const drops = Array.from({ length: 38 }, () => ({ sx: ctx.rng() * (W + 18) - 9, p: ctx.rng(), m: ctx.rng() < 0.5 ? 2 : 3 }));
      const tips = [-Rx * 0.98, 0, Rx * 0.98].map((lx) => ({ lx, p: ctx.rng() }));
      const bx0 = Math.max(0, Math.floor(Tx - Rx - Rx * 0.08 - 1)), bx1 = Math.min(W - 1, Math.ceil(Tx + Rx + Rx * 0.08 + 1));
      const by0 = Math.max(0, Math.floor((Ty - 2) / asp)), by1 = Math.min(H - 1, Math.ceil((rimY + 1) / asp));

      return (t) => {
        cv.clear();
        const tn = fract(t / 6);
        const sw = 0.06 * Rx * Math.sin(TAU * 2 * tn);
        const xoff = (yH) => sw * clamp01(1 - (yH - Ty) / Math.max(1, yHnd - Ty));
        const xoffC = xoff(Ty + Rh * 0.5);
        // ground
        cv.line(0, yGr / asp, W - 1, yGr / asp, blend(th.bg, th.line, 0.8));
        // canopy, per pixel: upper half-ellipse with a scalloped hem, panelled two-tone
        for (let py = by0; py <= by1; py++) {
          const yH = (py + 0.5) * asp;
          const off = xoff(yH);
          for (let px = bx0; px <= bx1; px++) {
            const lx = px + 0.5 - Tx - off;
            const e = (lx / Rx) ** 2 + ((yH - (Ty + Rh)) / Rh) ** 2;
            if (e > 1.1 || yH > rimY + 0.5) continue;
            const u4 = clamp01((lx + Rx) / (2 * Rx)) * 4;
            const fr4 = fract(u4);
            const edgeY = rimY - scD * 0.5 * (1 - Math.cos(TAU * fr4));
            const alpha = Math.min(clamp01((1 - e) * (Rx / 2) + 0.5), clamp01(edgeY - yH + 0.5));
            if (alpha <= 0) continue;
            const ip = Math.min(3, Math.floor(u4));
            const cPanel = ip % 2 ? th.accent2 : th.accent;
            const ty01 = clamp01((yH - Ty) / Rh);
            let col = blend(blend(th.bg, cPanel, 0.92), 0xffffff, 0.14 * clamp01(1 - ty01 - (lx / Rx) * 0.4));
            const m = Math.min(fr4, 1 - fr4);
            col = blend(col, 0x000000, 0.16 * ty01 + (m < 0.05 ? 0.3 * (1 - m / 0.05) : 0));
            cv.set(px, py, alpha >= 1 ? col : blend(th.bg, col, alpha));
          }
        }
        // ferrule, pole and J-handle
        const topX = Tx + xoff(Ty);
        cv.line(topX, (Ty - 1.8) / asp, topX, (Ty + 0.6) / asp, poleC);
        for (let py = Math.ceil(Ty / asp); py <= Math.floor(yHnd / asp); py++) cv.set(Tx + xoff(py * asp), py, poleC);
        const hx = Tx + xoff(yHnd) - rh;
        for (let i = 0; i < 14; i++) {
          const a0 = (Math.PI * i) / 14, a1 = (Math.PI * (i + 1)) / 14;
          cv.line(hx + rh * Math.cos(a0), (yHnd + rh * 0.9 * Math.sin(a0)) / asp, hx + rh * Math.cos(a1), (yHnd + rh * 0.9 * Math.sin(a1)) / asp, poleC);
        }
        // rain: streaks fall until the canopy (splash) or the ground (tick)
        for (const d of drops) {
          const prog = fract(d.p + d.m * tn);
          const yD = prog * (HP + 6) - 3;
          const xD = d.sx + vx * yD;
          const lxs = xD - Tx - xoffC;
          if (Math.abs(lxs) < Rx) {
            const ysx = Ty + Rh - Rh * Math.sqrt(1 - (lxs / Rx) ** 2);
            if (yD >= ysx) {
              if (yD - ysx < 2.4) {
                const k = 1 - (yD - ysx) / 2.4;
                cv.blend(xD, (ysx - 0.6) / asp, 0xffffff, 0.5 * k);
                cv.blend(xD - 1, (ysx - 1) / asp, rainC, 0.6 * k);
                cv.blend(xD + 1, (ysx - 1) / asp, rainC, 0.6 * k);
              }
              continue;
            }
          } else if (yD >= yGr - 0.5) {
            if (yD - yGr < 2.5) {
              const k = clamp01(1 - (yD - yGr) / 2.5);
              cv.blend(xD - 1, (yGr - 0.4) / asp, rainC, 0.5 * k);
              cv.blend(xD + 1, (yGr - 0.4) / asp, rainC, 0.5 * k);
            }
            continue;
          }
          if (yD > -2) cv.line(xD, yD / asp, xD - vx * 3, (yD - 3) / asp, rainC);
        }
        // runoff drips from the hem tips
        for (const tp of tips) {
          const dp = fract(tn * 4 + tp.p);
          const dx = Tx + xoffC + tp.lx;
          const dy = rimY + dp * dp * (yGr - rimY);
          cv.blend(dx, dy / asp, blend(th.info, 0xffffff, 0.3), 0.8 * (1 - dp * 0.25));
          if (dp > 0.94) { cv.blend(dx - 1, (yGr - 0.4) / asp, rainC, 0.7); cv.blend(dx + 1, (yGr - 0.4) / asp, rainC, 0.7); }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
