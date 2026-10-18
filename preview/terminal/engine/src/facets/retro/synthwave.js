// Outrun flyover: a striped, gradient sun sinking behind a neon-rimmed
// mountain ridge, starry dusk sky, and a perspective grid racing toward the
// camera. Grid lines are anti-aliased analytically (world-space distance
// converted to pixels per row), so they stay crisp without moiré at the horizon.
export default {
  title: 'Synthwave',
  gallery: 'retro',
  category: 'Outrun',
  kind: 'scene',
  tags: ['synthwave', 'outrun', 'retrowave', 'grid', 'sun'],
  order: 40,
  description: 'Outrun flyover — striped gradient sun, neon-rimmed mountains and an anti-aliased perspective grid.',
  canvas: 'field',
  palette: 'synthwave',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const rand = ctx.rng;
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const hz = Math.floor(H * 0.6);           // horizon row
    const S = Math.min(W, H * aspect);
    const sunR = S * 0.3, sunX = W / 2, sunY = hz * aspect - sunR * 0.62; // sun center in visual units
    const camH = 1, focal = W * 0.55;
    const gridC = pal(0.62), gridC2 = pal(0.5), rimC = pal(0.7);
    const sky = new Int32Array(W * hz);
    const skyTop = pal(0.02), skyLow = pal(0.45);
    for (let y = 0; y < hz; y++) {
      const k = Math.pow(y / hz, 1.6);
      sky.fill(lerpc(skyTop, skyLow, k * 0.85), y * W, (y + 1) * W);
    }
    const stars = Array.from({ length: Math.floor(W * hz * 0.01) }, () => [Math.floor(rand() * W), Math.floor(rand() * hz * 0.7), rand()]);
    const ridge = new Float32Array(W), ridge2 = new Float32Array(W);
    // Ridged noise for sharp peaks; the near range is low in the middle so the sun shows.
    for (let x = 0; x < W; x++) {
      const u = x / W, side = 0.25 + 0.75 * Math.min(1, Math.abs(u - 0.5) * 2.4);
      const p = Math.max(0, 1 - Math.abs(fbm(u * 3.4, 1.7, 0, 3)) * 1.7);
      const q = Math.max(0, 1 - Math.abs(fbm(u * 7.5, 8.2, 0, 3)) * 1.7);
      ridge[x] = hz - H * (0.012 + 0.2 * side * p * p);
      ridge2[x] = hz - H * (0.02 + 0.13 * q * q * (0.35 + 0.65 * side));
    }

    return (t) => {
      const zoff = t * 2.2 * speed;
      const xoff = Math.sin(t * 0.25) * 1.2;
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y + 0.5) * aspect;
        for (let x = 0; x < W; x++, i++) {
          if (y < hz) {
            let c = sky[i];
            // Sun: vertical gradient, with horizontal gaps that widen toward its base and scroll down.
            const dx = x + 0.5 - sunX, dy = vy - sunY;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < sunR) {
              const v = (dy / sunR + 1) / 2;       // 0 top → 1 bottom
              const band = v > 0.42 ? ((v * 6.5 - t * 0.35) % 1 + 1) % 1 : 1;
              const gap = (v - 0.42) * 1.35;
              if (band > gap) c = pal(0.98 - v * 0.42);
            } else if (d < sunR * 1.5) {
              c = lerpc(c, pal(0.75), Math.pow(1 - (d - sunR) / (sunR * 0.5), 2) * 0.35);
            }
            if (y >= ridge2[x]) c = lerpc(0x1a0630, rimC, y - ridge2[x] < 1 ? 0.55 : 0.04);
            if (y >= ridge[x]) c = lerpc(0x0c0218, rimC, y - ridge[x] < 1 ? 0.95 : 0.02);
            px[i] = c;
          } else {
            const dyp = y - hz + 0.5;
            const z = (camH * focal) / dyp;           // world depth of this row
            const wx = ((x + 0.5 - W / 2) * z) / focal + xoff;
            const fx = wx - Math.round(wx), fz = (z + zoff) - Math.round(z + zoff);
            const pxPerX = focal / z, pxPerZ = (camH * focal) / (z * z);
            // Coverage of a ~0.9px line, faded out as lines converge below ~3px spacing (no moiré).
            const lx = Math.max(0, 1 - Math.abs(fx) * pxPerX / 0.9) * Math.min(1, Math.max(0, (pxPerX - 2.5) / 6));
            const lz = Math.max(0, 1 - Math.abs(fz) * pxPerZ / 0.9) * Math.min(1, Math.max(0, (pxPerZ - 1.5) / 4));
            const fog = Math.exp(-z / 18);
            const near = Math.min(1, dyp / (H - hz));
            const base = lerpc(0x0a0016, 0x1d0638, near);
            let c = lerpc(base, gridC2, Math.min(1, lz * fog * 1.15));
            c = lerpc(c, gridC, Math.min(1, lx * fog * 1.2));
            // Horizon haze glow.
            const sx = (x + 0.5 - sunX) / (sunR * 1.3);
            c = lerpc(c, pal(0.74), Math.pow(Math.max(0, 1 - dyp / (H * 0.12)), 1.5) * (0.3 + 0.45 * Math.exp(-sx * sx)));
            px[i] = c;
          }
        }
      }
      for (const [sx, sy, p] of stars) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + p * 2) + p * 10));
        const dx = sx + 0.5 - sunX, dy = (sy + 0.5) * aspect - sunY;
        if (sy < ridge2[sx] && dx * dx + dy * dy > sunR * sunR * 1.6) px[sy * W + sx] = lerpc(px[sy * W + sx], 0xffffff, tw * 0.8);
      }
      cv.paint(ctx.buffer);
    };
  },
};

function lerpc(a, b, t) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | (bl | 0);
}
