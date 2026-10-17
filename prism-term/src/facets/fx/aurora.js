// Aurora borealis: three curtains of light whose folds and rays come from
// per-column fbm noise (cheap: noise is sampled per column, not per pixel),
// hung over a twinkling night sky and a mountain ridge with a lake reflection.
export default {
  title: 'Aurora',
  gallery: 'fx',
  category: 'Light & Sky',
  kind: 'scene',
  tags: ['aurora', 'northern lights', 'sky', 'noise'],
  order: 60,
  description: 'Northern-lights curtains with drifting rays over a twinkling sky, mountains and a mirrored lake.',
  canvas: 'field',
  palette: 'aurora',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const rand = ctx.rng;
    const { noise2, fbm } = ctx.noise;
    const { width: W, height: H, px } = cv;
    const horizon = Math.floor(H * 0.78);
    const sky = new Int32Array(W * H);
    const top = 0x02030c, low = 0x0b1630;
    for (let y = 0; y < H; y++) {
      const k = Math.min(1, y / horizon);
      const r = ((top >> 16) & 255) * (1 - k) + ((low >> 16) & 255) * k;
      const g = ((top >> 8) & 255) * (1 - k) + ((low >> 8) & 255) * k;
      const b = (top & 255) * (1 - k) + (low & 255) * k;
      sky.fill((r << 16) | (g << 8) | (b | 0), y * W, (y + 1) * W);
    }
    const stars = Array.from({ length: Math.floor(W * horizon * 0.012) }, () => ({
      x: Math.floor(rand() * W), y: Math.floor(rand() * horizon * 0.92), p: rand() * 6.28, s: 0.4 + rand() * 0.6, f: 0.5 + rand() * 2,
    }));
    // Ridged noise (1 − |n|) gives sharp peaks rather than rolling hills.
    const ridge = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const p = 1 - Math.abs(fbm(u * 3.2, 3.1, 0, 2)) * 1.6, q = 1 - Math.abs(fbm(u * 9, 7.7, 0, 2)) * 1.8;
      ridge[x] = horizon - H * (0.03 + 0.13 * Math.max(0, p) ** 2 + 0.035 * Math.max(0, q) ** 2);
    }
    const layers = [
      { base: 0.50, amp: 0.07, len: 0.42, f: 2.2, sp: 0.05, lo: 0.62, hi: 0.9, gain: 1.5 },
      { base: 0.42, amp: 0.06, len: 0.30, f: 3.4, sp: 0.08, lo: 0.55, hi: 0.75, gain: 1.0 },
      { base: 0.32, amp: 0.05, len: 0.26, f: 1.6, sp: 0.035, lo: 0.78, hi: 1.0, gain: 0.7 },
    ];
    const lb = new Float32Array(W), li = new Float32Array(W);
    const acc = new Float32Array(W * horizon * 3);

    return (t) => {
      acc.fill(0);
      for (let L = 0; L < layers.length; L++) {
        const ly = layers[L];
        for (let x = 0; x < W; x++) {
          const u = x / W;
          const fold = fbm(u * ly.f + L * 7.3, t * ly.sp, L, 3);
          lb[x] = H * (ly.base + ly.amp * Math.sin(u * 5 + t * 0.2 + L) + fold * 0.14);
          const rays = 0.5 + 0.5 * noise2(u * 38 + t * 0.6 * (L + 1) * 0.4, t * 0.35 + L * 3);
          li[x] = Math.max(0, fold * 0.9 + 0.55) * (0.35 + rays * rays * 1.3) * ly.gain;
        }
        const c0 = pal(ly.lo), c1 = pal(ly.hi); // bright lower hem → violet crown
        const len = H * ly.len;
        for (let x = 0; x < W; x++) {
          const b = lb[x], inten = li[x];
          if (inten <= 0.01) continue;
          const y0 = Math.max(0, Math.floor(b - len)), y1 = Math.min(horizon - 1, Math.ceil(b + 3));
          for (let y = y0; y <= y1; y++) {
            const d = b - y; // >0 above the curtain's lower edge
            const a = d >= 0 ? Math.exp(-d / (len * 0.35)) * Math.min(1, d / 2 + 0.6) : Math.exp(d * 1.2);
            const k = inten * a;
            if (k < 0.004) continue;
            const m = Math.min(1, Math.max(0, d / len));
            const j = (y * W + x) * 3;
            acc[j] += (((c0 >> 16) & 255) * (1 - m) + ((c1 >> 16) & 255) * m) * k;
            acc[j + 1] += (((c0 >> 8) & 255) * (1 - m) + ((c1 >> 8) & 255) * m) * k;
            acc[j + 2] += ((c0 & 255) * (1 - m) + (c1 & 255) * m) * k;
          }
        }
      }
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          if (y < horizon) {
            const s = sky[i], j = i * 3;
            const r = ((s >> 16) & 255) + acc[j], g = ((s >> 8) & 255) + acc[j + 1], b = (s & 255) + acc[j + 2];
            px[i] = y >= ridge[x] ? mountain(x, y, acc, j) : ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b | 0);
          } else {
            // Lake: mirror the sky above the horizon with ripple wobble and darkening.
            const d = y - horizon;
            const sx = Math.min(W - 1, Math.max(0, Math.round(x + Math.sin(d * 0.9 + t * 2.1) * (1 + d * 0.08))));
            const my = horizon - 1 - d;
            const src = my >= 0 ? px[my * W + sx] : 0;
            const k = 0.55 - (d / (H - horizon)) * 0.3;
            px[i] = ((((src >> 16) & 255) * k) << 16) | ((((src >> 8) & 255) * k) << 8) | (((src & 255) * k) | 0);
          }
        }
      }
      for (const s of stars) {
        if (s.y >= ridge[s.x]) continue;
        const tw = s.s * (0.55 + 0.45 * Math.sin(t * s.f + s.p));
        cv.add(s.x, s.y, ((tw * 200) << 16) | ((tw * 210) << 8) | (tw * 255 | 0));
      }
      cv.paint(ctx.buffer);
    };

    function mountain(x, y, acc, j) {
      // Ridge silhouette, rim-lit by whatever aurora light falls just above it.
      const edge = y - ridge[x];
      const rim = edge < 1.5 ? 0.5 : 0.06;
      const r = 6 + acc[j] * rim, g = 8 + acc[j + 1] * rim, b = 16 + acc[j + 2] * rim;
      return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b | 0);
    }
  },
};
