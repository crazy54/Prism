// Warp-speed starfield: stars fly at the camera in 3D, drawn as braille
// streaks whose length tracks the current speed. Every ten seconds the ship
// surges to warp; color temperature runs from ember (far) to blue-white (near).
export default {
  title: 'Starfield',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['starfield', 'warp', 'space', 'demoscene'],
  order: 10,
  description: 'Warp-speed 3D starfield — braille motion streaks, periodic warp surges, depth-based color temperature.',
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect } = cv;
    const rand = ctx.rng;
    const temp = ctx.palette(['#ff5a2e', '#ffab5e', '#fff0d8', '#d6e4ff', '#8db4ff']);
    // Deep space stays dark by Day: starlight is light, not ink.
    const sky = ctx.theme.mode === 'light' ? 0x06070b : -1;
    const speedK = ctx.param('speed', 1);
    const Hv = H * aspect;
    const k = 0.5 * Math.max(W, Hv);
    const ax = (W / 2 / k) * 1.2, ay = (Hv / 2 / k) * 1.2;
    const N = Math.max(60, Math.min(1800, Math.round(ctx.width * ctx.height * 0.16)));
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), T = new Float32Array(N);
    const spawn = (i, z) => {
      X[i] = (rand() * 2 - 1) * ax;
      Y[i] = (rand() * 2 - 1) * ay;
      Z[i] = z;
      T[i] = rand();
    };
    for (let i = 0; i < N; i++) spawn(i, 0.04 + rand() * 0.96);
    const cx = W / 2, cy = H / 2;

    // Brightness-ramped line: dim at the tail, full at the head.
    const streak = (x0, y0, x1, y1, c) => {
      const n = Math.min(240, Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))));
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      for (let s = 0; s <= n; s++) {
        const u = s / n, k2 = 0.18 + 0.82 * u * u;
        cv.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, ((r * k2) << 16) | ((g * k2) << 8) | ((b * k2) | 0));
      }
    };

    return (t, dt) => {
      // Surge envelope: cruise, then a 5 s warp bump every 10 s.
      const u = (t % 10) / 10;
      const bump = u < 0.5 ? Math.pow(Math.sin(Math.PI * u * 2), 2) : 0;
      const speed = (0.22 + 1.9 * bump) * speedK;
      const tail = 0.06 + 0.1 * bump;
      const roll = 0.35 * Math.sin(t * 0.11) + 0.25 * bump * Math.sin(t * 0.7);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      cv.clear();
      for (let i = 0; i < N; i++) {
        Z[i] -= speed * dt;
        if (Z[i] <= 0.03) { spawn(i, 1); continue; }
        const x = X[i] * cr - Y[i] * sr, y = X[i] * sr + Y[i] * cr;
        const z = Z[i], zt = Math.min(1.05, z + speed * tail + 0.004);
        const hx = cx + (x / z) * k, hy = cy + ((y / z) * k) / aspect;
        if (hx < -2 || hy < -2 || hx > W + 2 || hy > H + 2) { spawn(i, 1); continue; }
        const tx = cx + (x / zt) * k, ty = cy + ((y / zt) * k) / aspect;
        const near = 1 - z;
        const c = temp(Math.min(1, near * 0.85 + T[i] * 0.3));
        const bright = Math.min(1, 0.42 + 0.8 * near * near + 0.25 * bump);
        const r = ((c >> 16) & 255) * bright, g = ((c >> 8) & 255) * bright, b = (c & 255) * bright;
        const col = (r << 16) | (g << 8) | (b | 0);
        streak(tx, ty, hx, hy, col);
        // Close stars get a fat 2×2 head so they read as bodies, not just lines.
        if (z < 0.3) { cv.set(hx + 1, hy, col); cv.set(hx, hy + 1, col); cv.set(hx + 1, hy + 1, col); }
      }
      if (sky >= 0) ctx.buffer.fill(0, 0, ctx.width, ctx.height, ' ', ctx.theme.ink, sky);
      cv.paint(ctx.buffer);
    };
  },
};
