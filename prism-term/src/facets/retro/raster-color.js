// Scanline color machines: four effects the Amiga copper chip would recognize.
// A plasma rewritten into a copper list, translucent curtains blending
// additively, venetian slats rippling open, and interference rings multiplying
// into moire blooms. All loops close on whole sine periods.
import { lerpc, clamp01, fract, ground } from './_kit.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'retro-copper-plasma',
    since: '0.3.0',
    title: 'Copper Plasma',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['copper', 'plasma', 'raster', 'scanline', 'bands', 'gradient', 'amiga'],
    order: 220,
    description: 'A copper list rewritten every frame: scanline-only plasma posterized into crawling bands with white-hot seams.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'prism-sheen',
    params: {
      bands: { default: 14, min: 4, max: 32, label: 'Bands' },
      speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
    },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const NB = Math.max(2, Math.round(ctx.param('bands', 14)));
      const { width: W, height: H, px } = cv;
      const w = TAU / 12;
      return (t) => {
        const tt = t * speed;
        let prevB = -1;
        for (let y = 0; y < H; y++) {
          const yy = (y / H) * 9;
          const p = Math.sin(yy * 1.9 + tt * w * 3) + Math.sin(yy * 3.3 - tt * w * 5)
            + Math.sin((yy + Math.sin(tt * w * 2) * 1.5) * 1.1 + tt * w);
          const v = fract(p / 6 + 0.5 + tt / 12);
          const bq = Math.floor(v * NB);
          let c = pal((bq + 0.5) / NB);
          if (bq !== prevB && prevB >= 0) c = lerpc(c, 0xffffff, 0.42); // the copper "split" seam
          prevB = bq;
          px.fill(c, y * W, (y + 1) * W);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-raster-curtains',
    since: '0.3.0',
    title: 'Raster Curtains',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['curtains', 'raster', 'additive', 'translucent', 'interference', 'copper', 'blend'],
    order: 230,
    description: 'Three translucent raster curtains drift across each other, blending additively and flaring white in the overlaps.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'prism',
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px } = cv;
      const base = ground(ctx.theme);
      const bR = (base >> 16) & 255, bG = (base >> 8) & 255, bB = base & 255;
      const CU = [0.0, 0.33, 0.66].map((h, i) => {
        const rr = new Float32Array(H), gg = new Float32Array(H), bb = new Float32Array(H);
        for (let y = 0; y < H; y++) {
          const c = pal(fract(h + 0.07 + (y / H) * 0.14));
          rr[y] = (c >> 16) & 255; gg[y] = (c >> 8) & 255; bb[y] = c & 255;
        }
        return { rr, gg, bb, k: i + 1, ph: i * 2.2, hw: Math.max(3, W * (0.3 - i * 0.055)) };
      });
      const ws = [new Float32Array(W), new Float32Array(W), new Float32Array(W)];
      return (t) => {
        const tt = t * speed * (TAU / 12);
        for (let ci = 0; ci < 3; ci++) {
          const cu = CU[ci], wv = ws[ci];
          const cx = W * 0.5 + Math.sin(tt * cu.k + cu.ph) * Math.max(0, W * 0.5 - cu.hw * 0.5);
          for (let x = 0; x < W; x++) {
            const d = Math.abs(x - cx) / cu.hw;
            wv[x] = d >= 1 ? 0 : (1 - d) ** 1.6;
          }
        }
        const [w0, w1, w2] = ws;
        for (let y = 0; y < H; y++) {
          const r0 = CU[0].rr[y], g0 = CU[0].gg[y], b0 = CU[0].bb[y];
          const r1 = CU[1].rr[y], g1 = CU[1].gg[y], b1 = CU[1].bb[y];
          const r2 = CU[2].rr[y], g2 = CU[2].gg[y], b2 = CU[2].bb[y];
          const row = y * W;
          for (let x = 0; x < W; x++) {
            const a = w0[x], c = w1[x], e = w2[x];
            const sw = a + c + e;
            if (sw < 0.004) { px[row + x] = base; continue; }
            const cov = sw > 1 ? 1 : sw;
            const ov = sw > 1 ? Math.min(0.85, (sw - 1) * 0.55) : 0;
            const inv = 1 / sw;
            let R = (a * r0 + c * r1 + e * r2) * inv;
            let G = (a * g0 + c * g1 + e * g2) * inv;
            let B = (a * b0 + c * b1 + e * b2) * inv;
            if (ov) { R += (255 - R) * ov; G += (255 - G) * ov; B += (255 - B) * ov; }
            R = bR + (R - bR) * cov; G = bG + (G - bG) * cov; B = bB + (B - bB) * cov;
            px[row + x] = (R << 16) | (G << 8) | B;
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-venetian-rasters',
    since: '0.3.0',
    title: 'Venetian Rasters',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['venetian', 'blinds', 'slats', 'raster', 'reveal', 'scanline', 'wave'],
    order: 240,
    description: 'Venetian slats ripple open in a traveling wave, letting a scrolling spectrum blaze through the gaps between them.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 10,
    canvas: 'field',
    palette: 'prism-sheen',
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px } = cv;
      const base = ground(ctx.theme);
      const slatC = lerpc(ctx.theme.bg, ctx.theme.ink, 0.42);
      const nSlats = Math.max(3, Math.min(14, Math.round(H / 7)));
      const sh = H / nSlats;
      const lip = Math.min(0.45, 0.9 / sh);
      return (t) => {
        const tt = t * speed * (TAU / 10);
        for (let y = 0; y < H; y++) {
          const i = Math.min(nSlats - 1, Math.floor(y / sh));
          const local = (y - i * sh) / sh;
          const o = clamp01(0.5 + 0.58 * Math.sin(tt * 2 - i * 0.8));
          const d = Math.abs(local - 0.5);
          let c;
          if (d < o * 0.5) {
            c = pal(fract((y / H) * 0.5 + tt / TAU));           // the spectrum behind the blinds
          } else {
            const toward = local < 0.5 ? 1 - local * 2 : local * 2 - 1;
            c = lerpc(base, slatC, 0.3 + 0.6 * toward);
            if (d - o * 0.5 < lip) c = lerpc(c, 0xffffff, 0.45); // lit lip at the opening
          }
          px.fill(c, y * W, (y + 1) * W);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'retro-moire-rings',
    since: '0.3.0',
    title: 'Moire Rings',
    gallery: 'retro',
    category: 'Raster & Copper',
    kind: 'scene',
    tags: ['moire', 'interference', 'rings', 'circles', 'amiga', 'raster', 'pattern'],
    order: 250,
    description: 'Two drifting sets of concentric rings multiply into blooming moire interference — the Amiga circle trick.',
    size: { w: 80, h: 22 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'prism',
    credits: 'after the Amiga interference-circle effect',
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const base = ground(ctx.theme);
      const LUT = new Int32Array(256);
      for (let i = 0; i < 256; i++) {
        const u = i / 255;
        LUT[i] = lerpc(base, pal(0.06 + u * 0.72), 0.1 + 0.9 * u * u);
      }
      const k = 0.62 * (96 / Math.max(24, Math.min(W, H * aspect)));
      return (t) => {
        const tt = t * speed * (TAU / 12);
        const x1 = W / 2 + Math.cos(tt) * W * 0.24, y1 = H / 2 + Math.sin(tt * 2) * H * 0.24;
        const x2 = W / 2 + Math.cos(tt * 3 + Math.PI) * W * 0.2, y2 = H / 2 + Math.sin(tt + Math.PI) * H * 0.2;
        const ph = tt * 4;
        for (let y = 0; y < H; y++) {
          const dy1 = (y - y1) * aspect, dy2 = (y - y2) * aspect;
          const q1 = dy1 * dy1, q2 = dy2 * dy2;
          const row = y * W;
          for (let x = 0; x < W; x++) {
            const ax = x - x1, bx = x - x2;
            const v = Math.sin(Math.sqrt(ax * ax + q1) * k - ph) * Math.sin(Math.sqrt(bx * bx + q2) * k + ph);
            px[row + x] = LUT[(127.5 + v * 127.5) | 0];
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
