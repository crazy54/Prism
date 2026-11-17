// Four staples of the 1990 cracktro, canvas-rendered with loop-closed sine
// paths: shadebobs smearing additive trails, the infinite chessboard zoom,
// a waving sinus dot-flag, and a glass column refracting a copper backdrop.
import { lerpc, clamp01, fract, ground } from './_kit.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'retro-shadebobs',
    since: '0.3.0',
    title: 'Shadebobs',
    gallery: 'retro',
    category: 'Intros & Scrollers',
    kind: 'scene',
    tags: ['shadebobs', 'bobs', 'trails', 'lissajous', 'amiga', 'demoscene', 'cracktro', 'additive'],
    order: 200,
    description: 'Soft bobs on closed Lissajous paths smear additive heat trails that bloom and decay, Amiga shadebob style.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'magma',
    credits: 'after the Amiga shadebob intros',
    params: {
      bobs: { default: 3, min: 1, max: 6, label: 'Bobs' },
      speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
    },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const nBobs = Math.max(1, Math.round(ctx.param('bobs', 3)));
      const { width: W, height: H, px, aspect } = cv;
      const heat = new Float32Array(W * H);
      const base = ground(ctx.theme);
      // heat -> color, pre-blended toward the ground tone so decay fades cleanly
      const LUT = new Int32Array(160);
      for (let i = 0; i < 160; i++) {
        const v = i / 159;
        LUT[i] = lerpc(base, pal(0.08 + v * 0.88), Math.min(1, v * 1.7));
      }
      const r = Math.max(2.2, Math.min(W, H * aspect) / 7.5);
      const Rx = Math.ceil(r), Ry = Math.max(1, Math.ceil(r / aspect));
      // gaussian stamp kernel as flat buffer offsets (bob centers never reach the rim)
      const off = [], wgt = [];
      for (let dy = -Ry; dy <= Ry; dy++) for (let dx = -Rx; dx <= Rx; dx++) {
        const d = Math.hypot(dx, dy * aspect) / r;
        if (d > 1) continue;
        off.push(dy * W + dx);
        wgt.push(Math.exp(-d * d * 2.6) * 0.2);
      }
      const ax = Math.max(0, W / 2 - Rx - 1), ay = Math.max(0, H / 2 - Ry - 1);
      return (t, dt) => {
        const decay = Math.exp(-Math.min(0.25, dt) * 1.1);
        for (let i = 0; i < heat.length; i++) heat[i] *= decay;
        const step = Math.min(0.25, dt) / 3;
        for (let b = 0; b < nBobs; b++) {
          const ph = (b / nBobs) * TAU;
          const w1 = (TAU / 12) * (2 + (b % 3)), w2 = (TAU / 12) * (3 + (b % 2));
          for (let s = 0; s < 3; s++) {
            const ts = (t - s * step) * speed;
            const cx = Math.round(W / 2 + Math.sin(ts * w1 + ph) * ax);
            const cy = Math.round(H / 2 + Math.cos(ts * w2 + ph * 1.7) * ay);
            const c0 = cy * W + cx;
            for (let k = 0; k < off.length; k++) heat[c0 + off[k]] += wgt[k];
          }
        }
        for (let i = 0; i < heat.length; i++) {
          const h = heat[i];
          px[i] = LUT[h >= 1 ? 159 : (h * 159) | 0];
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-chessboard-zoomer',
    since: '0.3.0',
    title: 'Chessboard Zoomer',
    gallery: 'retro',
    category: 'Intros & Scrollers',
    kind: 'scene',
    tags: ['checkerboard', 'zoom', 'tunnel', 'log-polar', 'spiral', 'cracktro', 'demoscene'],
    order: 210,
    description: 'An endless checkerboard rushes out of the screen center, breathing into a spiral as it zooms forever.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'prism',
    credits: 'after the infinite-zoom checkers of 90s cracktros',
    params: {
      segments: { default: 8, min: 4, max: 16, label: 'Segments' },
      speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
    },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const S = Math.max(4, Math.round(ctx.param('segments', 8) / 2) * 2); // even, so the seam wraps
      const { width: W, height: H, px, aspect } = cv;
      const n = W * H;
      const lr = new Float32Array(n), an = new Float32Array(n), fog = new Float32Array(n);
      const maxR = Math.hypot(W / 2, (H / 2) * aspect);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - W / 2 + 0.5, dy = (y - H / 2 + 0.5) * aspect;
        const rr = Math.max(0.8, Math.hypot(dx, dy));
        const i = y * W + x;
        lr[i] = Math.log(rr) * 2.6;
        an[i] = (Math.atan2(dy, dx) / TAU + 0.5) * S;
        const d = clamp01(Math.log(rr) / Math.log(maxR + 1));
        fog[i] = d * d * (3 - 2 * d);
      }
      const base = ground(ctx.theme);
      return (t) => {
        const tt = t * speed;
        const zoom = tt * 2;                 // 24 rings per 12 s loop
        const rot = tt * (S / 12);           // one full segment turn per loop
        const twist = Math.sin(tt * (TAU / 12)) * 0.9;
        const hue = fract(tt / 12);
        const A = pal(fract(hue + 0.55));
        const B = lerpc(base, pal(hue), 0.35);
        const haze = lerpc(base, pal(fract(hue + 0.8)), 0.25);
        for (let i = 0; i < n; i++) {
          const u = lr[i] - zoom, v = an[i] + twist * lr[i] + rot;
          px[i] = lerpc(haze, (Math.floor(u) + Math.floor(v)) & 1 ? A : B, fog[i]);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-sine-dot-grid',
    since: '0.3.0',
    title: 'Sine Dot Grid',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['dots', 'sinus', 'dot flag', 'lattice', 'wave', 'perspective', 'amiga', 'demoscene'],
    order: 200,
    description: 'A perspective lattice of dots riding two crossed traveling sines — the sinus dot-flag every intro coder wrote.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 8,
    canvas: 'line',
    palette: 'prism',
    credits: 'after the Amiga and Atari sinus dot flags',
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H } = cv;
      const base = ground(ctx.theme);
      const gx = Math.max(12, Math.min(56, Math.round(W / 3)));
      const gz = Math.max(7, Math.min(30, Math.round(H / 3.2)));
      const w1 = TAU * 2 / 8, w2 = TAU * 3 / 8, w3 = TAU / 8; // all close over the 8 s loop
      return (t) => {
        cv.clear();
        const tt = t * speed;
        for (let j = 0; j < gz; j++) {                   // far -> near, near dots win the cell
          const fz = gz === 1 ? 1 : j / (gz - 1);
          const z = 2.75 - fz * 2.1;
          const dim = 0.3 + 0.7 * fz;
          for (let i = 0; i < gx; i++) {
            const wx = (gx === 1 ? 0 : i / (gx - 1) - 0.5) * 3.0;
            const wave = Math.sin(wx * 2.2 + tt * w1 + fz * 5.2) * Math.cos(fz * 4.4 - tt * w2) * 0.52
              + Math.sin(wx * 0.9 - tt * w3) * 0.2;
            const sx = W / 2 + (wx / z) * W * 0.46;
            const sy = H * 0.16 + ((0.55 + wave * 0.8) / z) * H * 0.9;
            cv.set(sx, sy, lerpc(base, pal(clamp01(0.5 + wave * 0.95)), dim));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-glass-bar',
    since: '0.3.0',
    title: 'Glass Bar',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['glass', 'lens', 'refraction', 'column', 'raster', 'cracktro', 'amiga'],
    order: 210,
    description: 'A polished glass column glides over a dotted copper backdrop, magnifying and bending whatever it crosses.',
    size: { w: 80, h: 20 },
    minSize: { w: 20, h: 6 },
    loop: 10,
    canvas: 'field',
    palette: 'prism',
    credits: 'after the Amiga glass-column cracktros',
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px } = cv;
      const base = ground(ctx.theme);
      const back = new Int32Array(W * H);
      for (let y = 0; y < H; y++) {
        const v = y / Math.max(1, H - 1);
        for (let x = 0; x < W; x++) {
          const u = x / W;
          let c = lerpc(base, pal(fract(u * 0.5 + v * 0.22 + 0.04)), 0.3 + 0.25 * Math.sin(v * Math.PI));
          if (Math.abs(v - 0.26) < 0.05 || Math.abs(v - 0.72) < 0.05) c = lerpc(c, 0xffffff, 0.28);
          if (x % 10 === 4 && y % 8 === 3) c = lerpc(c, ctx.theme.ink, 0.6);
          back[y * W + x] = c;
        }
      }
      const hw = Math.max(3, Math.round(W * 0.1));
      const tint = pal(0.52);
      return (t) => {
        const tt = t * speed;
        px.set(back);
        const xB = W / 2 + Math.sin(tt * (TAU / 10)) * Math.max(0, W / 2 - hw - 1);
        const x0 = Math.max(0, Math.ceil(xB - hw)), x1 = Math.min(W - 1, Math.floor(xB + hw));
        for (let x = x0; x <= x1; x++) {
          const u = (x - xB) / hw;
          if (u < -1 || u > 1) continue;
          const sxp = Math.min(W - 1, Math.max(0, Math.round(xB + Math.sin(u * Math.PI / 2) * hw * 0.45)));
          const au = Math.abs(u);
          const edge = au > 0.78 ? (au - 0.78) / 0.22 : 0;
          const bend = (1 - au) * 1.8;
          for (let y = 0; y < H; y++) {
            const ys = Math.min(H - 1, Math.max(0, y + ((Math.sin(y * 0.18 + tt * (TAU * 3 / 10)) * bend) | 0)));
            let c = back[ys * W + sxp];
            c = lerpc(c, tint, 0.14);
            c = lerpc(c, 0xffffff, 0.1 + edge * 0.5);
            px[y * W + x] = c;
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
