// Kinetic contraptions — mechanisms whose motion tells the story: a clock
// escapement that ticks in discrete eased steps as the pendulum releases it,
// a smock windmill whose sails ride gusty air over waving grass, and a radar
// station pairing a yawing dish with a phosphor-decay PPI scope.
import { blend } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const fract = (v) => ((v % 1) + 1) % 1;
const LIGHT = Math.atan2(-1, -1);

export default [
  {
    id: 'objects-escapement',
    since: '0.3.0',
    title: 'Clock Escapement',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['escapement', 'clock', 'pendulum', 'anchor', 'tick', 'clockwork', 'horology', 'gear'],
    order: 230,
    description: 'The beating heart of a pendulum clock: an anchor rocks over a brass escape wheel, releasing it one eased half-tooth per swing with a glint at each tick.',
    size: { w: 56, h: 26 },
    minSize: { w: 22, h: 12 },
    loop: 8,
    canvas: 'field',
    palette: 'gold',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const rw = Math.max(2.5, Math.min((HP * 0.72 - 3) / 2.45, W * 0.44));
      const cx = W * 0.5;
      const Ca = [cx, 1.8 + rw * 0.5];                    // anchor arbor
      const Cw = [cx, Ca[1] + rw * 1.45];                 // escape wheel centre
      const Lp = Math.max(2, HP - Ca[1] - Math.max(1.2, HP * 0.07) - 1.5);
      const bobR = Math.max(1.2, HP * 0.07);
      const NT = 12, pitchHalf = TAU / NT / 2;
      const brass = blend(0xb08d3a, th.warn, 0.25);
      const steelC = blend(0x9aa4b0, th.ink, 0.12);
      const cpt = (s) => [Cw[0] + rw * Math.sin(s), Cw[1] - rw * Math.cos(s)];
      // anchor arc: polar range of the two pallet contacts as seen from the arbor
      const span = [-0.55, 0.55].map((s) => { const p = cpt(s); return [Math.atan2(p[1] - Ca[1], p[0] - Ca[0]), Math.hypot(p[0] - Ca[0], p[1] - Ca[1])]; });
      const ra = (span[0][1] + span[1][1]) / 2;

      return (t) => {
        cv.clear();
        const phi = 0.16 * Math.sin(TAU * t / 2);          // pendulum (2 s period)
        const gam = -0.12 * Math.sin(TAU * t / 2);         // anchor rock
        const b = t, f = fract(b);                         // one beat per second
        const ang = pitchHalf * (Math.floor(b) + ss(0.04, 0.16, f));
        // pendulum rod and bob, hung behind the wheel
        const bob = [Ca[0] + Lp * Math.sin(phi), Ca[1] + Lp * Math.cos(phi)];
        cv.line(Ca[0], Ca[1] / asp, bob[0], bob[1] / asp, blend(th.bg, th.muted, 0.8));
        cv.ellipse(bob[0], bob[1] / asp, bobR, bobR / asp, blend(0x241a08, brass, 0.75), true);
        cv.ellipse(bob[0] - bobR * 0.3, (bob[1] - bobR * 0.35) / asp, bobR * 0.4, bobR * 0.4 / asp, blend(brass, 0xfff2c8, 0.55), true);
        // escape wheel: pointed ratchet teeth, three spokes, rim and hub — per pixel
        const y0 = Math.max(0, Math.floor((Cw[1] - rw - 1) / asp)), y1 = Math.min(H - 1, Math.ceil((Cw[1] + rw + 1) / asp));
        const x0 = Math.max(0, Math.floor(Cw[0] - rw - 1)), x1 = Math.min(W - 1, Math.ceil(Cw[0] + rw + 1));
        for (let py = y0; py <= y1; py++) {
          const dyH = (py + 0.5) * asp - Cw[1];
          for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - Cw[0];
            const d = Math.hypot(dx, dyH);
            if (d > rw + 1) continue;
            const a = Math.atan2(dyH, dx);
            const local = a - ang;
            const u = (local * NT) / TAU;
            const f2 = u - Math.floor(u);
            const R = rw * (0.8 + 0.2 * f2);
            let cov = clamp01(R - d + 0.5);
            if (cov <= 0) continue;
            if (d < rw * 0.64) {
              let sp = 0;
              for (let k = 0; k < 3; k++) sp = Math.max(sp, clamp01(rw * 0.055 - Math.abs(Math.sin(local - (k * TAU) / 3)) * d + 0.5));
              cov = Math.min(cov, Math.max(sp, clamp01(rw * 0.2 - d + 0.5)));
              if (cov <= 0) continue;
            }
            let k = 0.55 + 0.3 * Math.cos(a - LIGHT);
            if (R - d < 1.2) k += 0.25;
            const col = blend(0x241a08, brass, clamp01(k));
            cv.set(px, py, cov >= 1 ? col : blend(th.bg, col, cov));
          }
        }
        cv.ellipse(Cw[0], Cw[1] / asp, Math.max(0.8, rw * 0.08), Math.max(0.8, rw * 0.08) / asp, steelC, true);
        // anchor: a thick rocking arc with pallets dipping to the wheel rim
        const a0 = span[0][0] + gam, a1 = span[1][0] + gam;
        for (let i = 0; i <= 20; i++) {
          const a = a0 + ((a1 - a0) * i) / 20;
          const px0 = Ca[0] + Math.cos(a) * (ra - 0.5), py0 = Ca[1] + Math.sin(a) * (ra - 0.5);
          const px1 = Ca[0] + Math.cos(a) * (ra + 0.6), py1 = Ca[1] + Math.sin(a) * (ra + 0.6);
          cv.line(px0, py0 / asp, px1, py1 / asp, steelC);
        }
        for (const a of [a0, a1]) {
          cv.line(Ca[0] + Math.cos(a) * ra, (Ca[1] + Math.sin(a) * ra) / asp, Ca[0] + Math.cos(a) * (ra + 2), (Ca[1] + Math.sin(a) * (ra + 2)) / asp, blend(steelC, 0xffffff, 0.25));
        }
        cv.ellipse(Ca[0], Ca[1] / asp, Math.max(0.8, rw * 0.1), Math.max(0.8, rw * 0.1) / asp, blend(steelC, 0xffffff, 0.2), true);
        // tick glint on the engaging pallet
        const fl = ss(0.04, 0.09, f) * (1 - ss(0.16, 0.24, f));
        if (fl > 0.02) {
          const sidx = Math.floor(fract(b / 2) * 2) ? 0 : 1;
          const P = cpt(sidx ? 0.55 : -0.55);
          cv.blend(P[0], P[1] / asp, 0xfff6d0, fl);
          cv.blend(P[0] + 1, P[1] / asp, 0xffe9a8, fl * 0.6);
          cv.blend(P[0] - 1, P[1] / asp, 0xffe9a8, fl * 0.6);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-windmill',
    since: '0.3.0',
    title: 'Windmill',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['windmill', 'mill', 'sails', 'wind', 'gust', 'countryside', 'rotation', 'lattice'],
    order: 240,
    description: 'A smock mill turning in gusty air: four latticed sails surge and ease with the wind, grass leans in waves and streaks of breeze drift past.',
    size: { w: 64, h: 26 },
    minSize: { w: 24, h: 10 },
    loop: 8,
    canvas: 'field',
    palette: 'aurora',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const xm = W * 0.42, yh = HP * 0.40, yg = HP - 2.2;
      const Ls = Math.max(2, Math.min(xm - 2, W - xm - 2, yh - 1.5, HP - 3.2 - yh));
      const topW = Math.max(2.4, W * 0.055), botW = topW * 2.1, capH = Math.max(1.4, topW * 0.8);
      const yTop = yh + capH * 0.6;
      const stone = blend(th.panel2, th.muted, 0.35);
      const armC = blend(th.muted, 0x7a5c3a, 0.3);
      const sailC = blend(th.bg, th.ink, 0.3);
      const streaks = Array.from({ length: 8 }, () => ({ y: 1 + ctx.rng() * yh, p: ctx.rng(), k: ctx.rng() < 0.5 ? 1 : 2, b: ctx.rng() * TAU }));
      const n3 = ctx.noise.noise3;

      return (t) => {
        cv.clear();
        const tn = fract(t / 8);
        const s1 = Math.sin(TAU * tn), c1 = Math.cos(TAU * tn);
        // grass band with leaning tufts
        for (let py = Math.ceil(yg / asp); py < H; py++) for (let px = 0; px < W; px++) cv.set(px, py, blend(th.bg, th.pos, 0.16));
        for (let x = 0; x < W; x += 2) {
          const lean = n3(x * 0.33, s1, c1) * 1.8;
          cv.line(x, (yg + 0.4) / asp, x + lean, (yg - 1.4) / asp, blend(th.bg, th.pos, 0.42));
        }
        // cap, tower, door and lit windows
        cv.ellipse(xm, yTop / asp, topW * 0.72, capH / asp, blend(stone, th.ink, 0.25), true);
        cv.polygon([[xm - topW / 2, yTop / asp], [xm + topW / 2, yTop / asp], [xm + botW / 2, yg / asp], [xm - botW / 2, yg / asp]], stone);
        cv.line(xm - topW / 2, yTop / asp, xm - botW / 2, yg / asp, blend(stone, 0x000000, 0.35));
        cv.line(xm + topW / 2, yTop / asp, xm + botW / 2, yg / asp, blend(stone, 0xffffff, 0.18));
        const tH = yg - yTop;
        for (const wy of [0.35, 0.62]) cv.ellipse(xm, (yTop + tH * wy) / asp, Math.max(0.7, topW * 0.14), Math.max(0.7, topW * 0.14) / asp, blend(th.warn, 0xffd98a, 0.4), true);
        cv.polygon([[xm - topW * 0.3, (yg - tH * 0.16) / asp], [xm + topW * 0.3, (yg - tH * 0.16) / asp], [xm + topW * 0.3, yg / asp], [xm - topW * 0.3, yg / asp]], blend(stone, 0x000000, 0.45));
        // four latticed sails, gusting
        const base = TAU * (3 * tn + 0.05 * Math.sin(TAU * tn));
        for (let k = 0; k < 4; k++) {
          const a = base + (k * TAU) / 4;
          const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
          const r0 = 0.18 * Ls, w0 = 0.09 * Ls, w1 = 0.17 * Ls;
          const p1 = [xm + ux * r0, yh + uy * r0], p2 = [xm + ux * Ls, yh + uy * Ls];
          cv.polygon([
            [p1[0], p1[1] / asp], [p2[0], p2[1] / asp],
            [p2[0] + vx * w1, (p2[1] + vy * w1) / asp], [p1[0] + vx * w0, (p1[1] + vy * w0) / asp],
          ], sailC);
          cv.line(p1[0], p1[1] / asp, p2[0], p2[1] / asp, armC);
          for (let i = 1; i <= 4; i++) {
            const fr = r0 + ((Ls - r0) * i) / 4.6, w = w0 + (w1 - w0) * (i / 4.6);
            cv.line(xm + ux * fr, (yh + uy * fr) / asp, xm + ux * fr + vx * w, (yh + uy * fr + vy * w) / asp, armC);
          }
        }
        cv.ellipse(xm, yh / asp, Math.max(1, Ls * 0.07), Math.max(1, Ls * 0.07) / asp, blend(armC, 0xffffff, 0.3), true);
        // breeze streaks
        for (const s of streaks) {
          const x = fract(s.p + tn * s.k) * (W + 12) - 6;
          const y = s.y + 0.5 * Math.sin(TAU * 2 * tn + s.b);
          cv.line(x, y / asp, x + 4, y / asp, blend(th.bg, th.dim, 0.5));
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'objects-radar-dish',
    since: '0.3.0',
    title: 'Radar Station',
    gallery: 'objects',
    category: 'Mechanical',
    kind: 'scene',
    tags: ['radar', 'dish', 'sweep', 'ppi', 'scope', 'phosphor', 'antenna', 'blip', 'surveillance'],
    order: 250,
    description: 'A yawing radar dish turns in lockstep with its PPI scope, where a phosphor sweep re-paints fading blips and one slow contact circles the screen.',
    size: { w: 72, h: 24 },
    minSize: { w: 30, h: 10 },
    loop: 6,
    canvas: 'field',
    palette: 'matrix',
    params: {},
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, HP = H * asp;
      const Rs = Math.max(3, Math.min(HP * 0.44, W * 0.27));
      const Wd = W - (2 * Rs + 4);
      const drawDish = Wd >= 10;
      const scx = drawDish ? W - Rs - 2 : W / 2, scy = HP * 0.5;
      const base = blend(th.bg, th.pos, 0.08);
      const phos = blend(th.pos, 0xbfffd0, 0.25);
      const blips = Array.from({ length: 6 }, () => ({ a: ctx.rng() * TAU, r: (0.25 + 0.6 * ctx.rng()) * Rs }));
      const yg = HP - 1.5;
      const steel = (k) => blend(blend(0x1a2027, 0xbcc8d4, k), th.ink, 0.08);

      return (t) => {
        cv.clear();
        const tn = fract(t / 6);
        const s = TAU * 2 * tn;
        // PPI scope, per pixel: afterglow decays with angle behind the sweep
        const y0 = Math.max(0, Math.floor((scy - Rs) / asp)), y1 = Math.min(H - 1, Math.ceil((scy + Rs) / asp));
        for (let py = y0; py <= y1; py++) {
          const dyH = (py + 0.5) * asp - scy;
          for (let px = Math.max(0, Math.floor(scx - Rs)); px <= Math.min(W - 1, Math.ceil(scx + Rs)); px++) {
            const dx = px + 0.5 - scx;
            const rr = Math.hypot(dx, dyH);
            if (rr > Rs) continue;
            const a = Math.atan2(dyH, dx);
            const age = fract((s - a) / TAU);
            let col = blend(base, phos, 0.08 + 0.8 * Math.exp(-age * 5.5));
            const ring = Math.min(Math.abs(rr - Rs / 3), Math.abs(rr - (2 * Rs) / 3));
            if (ring < 0.45 || Math.abs(dx) < 0.4 || Math.abs(dyH) < 0.4) col = blend(col, th.pos, 0.2);
            if (Rs - rr < 1) col = blend(col, phos, 0.5);
            if (age < 0.02) col = blend(col, 0xeaffe8, 1 - age / 0.02);
            cv.set(px, py, col);
          }
        }
        // blips re-energised each pass, plus one contact actually underway
        const draw = (ab, rb) => {
          const ageB = fract((s - ab) / TAU);
          const I = Math.exp(-ageB * 3.2);
          if (I < 0.03) return;
          const bx = scx + rb * Math.cos(ab), by = (scy + rb * Math.sin(ab)) / asp;
          const c = blend(th.pos, 0xffffff, 0.35);
          cv.blend(bx, by, c, I);
          cv.blend(bx + 1, by, c, I * 0.6);
          cv.blend(bx - 1, by, c, I * 0.6);
          cv.blend(bx, by + 1, c, I * 0.45);
        };
        for (const bl of blips) draw(bl.a, bl.r);
        draw(TAU * tn + 1.0, 0.55 * Rs);
        // bearing ticks
        for (let k = 0; k < 12; k++) {
          const a = (k * TAU) / 12;
          cv.line(scx + Math.cos(a) * (Rs + 0.5), (scy + Math.sin(a) * (Rs + 0.5)) / asp, scx + Math.cos(a) * (Rs + 1.6), (scy + Math.sin(a) * (Rs + 1.6)) / asp, blend(th.bg, k % 3 ? th.dim : th.muted, 0.8));
        }
        if (drawDish) {
          const xd = Wd * 0.5 + 1, Dy = HP * 0.3, Rd = Math.max(2, Math.min(Wd * 0.42, HP * 0.2));
          cv.line(0, yg / asp, Wd + 2, yg / asp, blend(th.bg, th.line, 0.8));
          cv.polygon([[xd - 1.4, yg / asp], [xd + 1.4, yg / asp], [xd + 0.7, (Dy + Rd * 0.5) / asp], [xd - 0.7, (Dy + Rd * 0.5) / asp]], steel(0.35));
          cv.line(xd - 2, (yg - 0.8) / asp, xd + 2, (yg - 0.8) / asp, steel(0.5));
          // dish yaws with the sweep: rim ellipse narrows as it turns edge-on
          const xi = s;
          const rx = Math.max(Rd * 0.14, Rd * Math.abs(Math.sin(xi)));
          cv.ellipse(xd, Dy / asp, rx, (Rd * 0.95) / asp, blend(th.bg, th.info, 0.35), true);
          cv.ellipse(xd, Dy / asp, rx, (Rd * 0.95) / asp, blend(th.info, 0xffffff, 0.35), false);
          const fx = xd + Math.cos(xi) * Rd * 1.05;
          cv.line(xd, Dy / asp, fx, Dy / asp, steel(0.8));
          cv.ellipse(fx, Dy / asp, 0.7, 0.7 / asp, blend(th.info, 0xffffff, 0.5), true);
          cv.ellipse(xd, (Dy - Rd * 1.05) / asp, 0.6, 0.6 / asp, fract(tn * 6) < 0.5 ? th.crit : blend(th.bg, th.crit, 0.3), true);
          cv.line(xd, (Dy - Rd * 1.05) / asp, xd, (Dy + Rd * 0.4) / asp, steel(0.3));
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
