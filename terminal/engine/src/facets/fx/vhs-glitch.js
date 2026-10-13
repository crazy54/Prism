// A worn VHS tape of color bars: per-line jitter, chroma bleeding off the
// luma, a tracking band rolling down the frame, head-switching noise along the
// bottom, dropout specks, and the deck's on-screen display over it all.
import { lerpc, clamp01, hash2 } from '../retro/_kit.js';

const LOOP = 12;
const BARS = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
const REV = [0x0000c0, 0x131313, 0xc000c0, 0x131313, 0x00c0c0, 0x131313, 0xc0c0c0];
const PLUGE = [[0.25, 0x00214c], [0.25, 0xffffff], [0.25, 0x32006a], [0.25, 0x131313]];

export default {
  title: 'VHS Tracking',
  gallery: 'fx',
  category: 'Glitch & Noise',
  kind: 'scene',
  tags: ['vhs', 'glitch', 'tracking', 'analog', 'color bars', 'vcr', 'retro'],
  order: 30,
  description: 'Worn VHS color bars: line jitter, chroma bleed, a rolling tracking band, head-switch noise and the deck OSD.',
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: LOOP,
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas();
    const b = ctx.buffer;
    const { width: W, height: H, px } = cv;
    const bars = (x, y) => {
      const u = x / W, v = y / H;
      if (v < 0.67) return BARS[Math.min(6, Math.floor(u * 7))];
      if (v < 0.75) return REV[Math.min(6, Math.floor(u * 7))];
      if (u < 5 / 7) { let a = 0; for (const [w, c] of PLUGE) { a += w * (5 / 7); if (u < a) return c; } }
      return 0x131313;
    };
    const R = new Float32Array(W), G = new Float32Array(W), B = new Float32Array(W);
    return (t) => {
      const lt = t % LOOP, frame = Math.floor(t * 30);
      const band = ((lt / LOOP) * 1.6 - 0.3) * H, bandH = Math.max(2, H * 0.08);
      const burst = lt > 7.2 && lt < 7.6;                 // a hard tracking slip once a loop
      const roll = burst ? Math.floor((lt - 7.2) * H * 2.5) : 0;
      for (let y = 0; y < H; y++) {
        const sy = (y + roll) % H;
        const inBand = Math.abs(y - band) < bandH;
        const head = y >= H - Math.max(2, Math.round(H * 0.05));
        let off = (hash2(y, frame, 1) - 0.5) * 1.2 + Math.sin(y * 0.3 + t * 2) * 0.6;
        if (inBand) off += (hash2(y, frame, 2) - 0.2) * W * 0.06;
        if (head) off += (y - (H - H * 0.05)) * W * 0.03;
        for (let x = 0; x < W; x++) {
          const c = bars(Math.min(W - 1, Math.max(0, Math.round(x - off))), sy);
          R[x] = (c >> 16) & 255; G[x] = (c >> 8) & 255; B[x] = c & 255;
        }
        for (let x = 0; x < W; x++) {
          // Chroma bleeds right, smeared; luma stays sharper.
          const xr = Math.max(0, x - 2), xb = Math.min(W - 1, x + 1);
          let r = (R[xr] * 0.6 + R[Math.max(0, xr - 1)] * 0.4), g = G[x], bl = (B[xb] * 0.6 + B[Math.max(0, x)] * 0.4);
          let n = (hash2(x, y, frame) - 0.5) * 26;
          if (inBand) n += hash2(x >> 1, y, frame + 7) > 0.82 ? 150 : 0;
          if (head) n += (hash2(x, y, frame + 3) - 0.5) * 160;
          if (hash2(x, y * 7, frame) > 0.9985) n += 220;      // dropouts
          const k = inBand ? 0.82 : 1;
          px[y * W + x] = (clamp01((r * k + n) / 255) * 255) << 16 | (clamp01((g * k + n) / 255) * 255) << 8 | (clamp01((bl * k + n) / 255) * 255);
        }
      }
      cv.paint(b);
      // Deck OSD, drawn straight over the picture the way VCRs did.
      const CW = ctx.width, CH = ctx.height;
      const osd = (x, y, s) => b.text(x, y, s, 0xf4f4f4);
      if (Math.floor(t * 2) % 2 === 0 || lt > 2) osd(2, 1, 'PLAY ▶');
      const secs = 754 + Math.floor(lt);
      const tc = `SP  ${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      if (CW >= 30) osd(CW - tc.length - 3, CH - 2, tc);
      if (burst && CW >= 30) osd(Math.floor(CW / 2) - 4, Math.floor(CH / 2), 'TRACKING');
    };
  },
};
