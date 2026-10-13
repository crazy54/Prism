// Pixel sorting, the glitch-art staple: a sunset scene whose rows are sorted
// by brightness wherever they fall inside a moving threshold window — but only
// within drifting bands, so the clean image and the smeared streaks alternate.
import { lerpc, clamp01 } from '../retro/_kit.js';

const LOOP = 16;
const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;

export default {
  title: 'Pixel Sort',
  gallery: 'fx',
  category: 'Glitch & Noise',
  kind: 'scene',
  tags: ['pixel sort', 'glitch', 'databend', 'melt', 'sort', 'glitch art'],
  order: 50,
  description: 'Glitch-art pixel sorting: a sunset whose rows sort by brightness inside a moving threshold, in drifting smeared bands.',
  size: { w: 80, h: 24 },
  minSize: { w: 16, h: 6 },
  loop: LOOP,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    // The source: sky, sun, ridge and a lake — painted once.
    const src = new Int32Array(W * H), L = new Float32Array(W * H);
    const hz = Math.floor(H * 0.62), sunR = Math.min(W * 0.14, hz * aspect * 0.55);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ridge = hz - H * (0.06 + 0.12 * Math.abs(fbm(x * 0.03, 0.5, 0, 3)) * 2.2);
      let c;
      if (y < hz) {
        c = pal(0.1 + (y / hz) * 0.75);
        const cl = clamp01(fbm(x * 0.045, y * aspect * 0.16, 4.2, 4) * 2.2 + 0.1);   // banks of cloud
        c = lerpc(c, cl > 0.5 ? pal(0.92) : pal(0.12), Math.abs(cl - 0.5) * 0.9);
        const d = Math.hypot(x + 0.5 - W * 0.62, (y + 0.5 - hz * 0.62) * aspect);
        if (d < sunR) c = lerpc(pal(0.98), pal(0.85), d / sunR);
        if (y > ridge) c = lerpc(pal(0.06), 0x000000, 0.3);
      } else {
        const my = 2 * hz - y, ripple = Math.sin(y * 1.7) * 0.5 + 0.5;
        c = lerpc(pal(0.1 + (my / hz) * 0.75), pal(0.04), 0.25 + ((y - hz) / (H - hz)) * 0.3 + ripple * 0.2);
        if (Math.abs(x + 0.5 - W * 0.62) < sunR * (0.9 - (y - hz) / (H - hz) * 0.4) * (0.6 + 0.4 * ripple)) c = lerpc(c, pal(0.95), 0.6);
      }
      src[y * W + x] = c; L[y * W + x] = lum(c);
    }
    const idx = new Int32Array(W), keys = new Float32Array(W);
    return (t) => {
      px.set(src);
      const u = (t / LOOP) * Math.PI * 2;
      const lo = 55 + 40 * Math.sin(u), hi = 235 + 20 * Math.sin(u * 2 + 1);
      for (let y = 0; y < H; y++) {
        // Only rows inside the drifting glitch bands get sorted; the rest stay clean for contrast.
        const band = Math.sin(y * 0.19 + u * 2) * Math.cos(y * 0.061 - u);
        if (band < 0.12) continue;
        const reach = clamp01(0.3 + band);
        let x = 0;
        while (x < W) {
          while (x < W && !(L[y * W + x] >= lo && L[y * W + x] <= hi)) x++;
          const x0 = x;
          while (x < W && L[y * W + x] >= lo && L[y * W + x] <= hi) x++;
          const span = x - x0, n = Math.max(1, Math.floor(span * reach));
          if (span < 3) continue;
          for (let k = 0; k < n; k++) { idx[k] = src[y * W + x0 + k]; keys[k] = L[y * W + x0 + k]; }
          // Insertion sort, darkest first: light streams off to the right.
          for (let a = 1; a < n; a++) {
            const kv = keys[a], iv = idx[a];
            let j = a - 1;
            while (j >= 0 && keys[j] > kv) { keys[j + 1] = keys[j]; idx[j + 1] = idx[j]; j--; }
            keys[j + 1] = kv; idx[j + 1] = iv;
          }
          // Stretch the sorted run across the whole span: the smear.
          for (let k = 0; k < span; k++) px[y * W + x0 + k] = idx[Math.min(n - 1, Math.floor((k / span) * n))];
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
