// Rain on a pond: a damped 2D wave equation (two height buffers) disturbed by
// random drops. Each pixel refracts a pebbled riverbed through the surface
// slope and adds a specular glint, so ripples read as real water.
export default {
  title: 'Ripple Pond',
  gallery: 'fx',
  category: 'Fire & Water',
  kind: 'scene',
  tags: ['water', 'ripple', 'rain', 'wave equation'],
  order: 70,
  description: 'Rain on water — damped wave-equation ripples refracting a pebbled bed, with specular glints.',
  canvas: 'field',
  palette: 'ocean',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const rand = ctx.rng;
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    let cur = new Float32Array(W * H), prev = new Float32Array(W * H);
    const rate = ctx.param('rain', 1);
    const damp = 0.986;
    // Riverbed texture: water-tinted pebbles from two noise octaves.
    const bed = new Int32Array(W * H);
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const u = x / 14, v = (y * aspect) / 14;
        const n = fbm(u, v, 0, 3) * 0.5 + 0.5;
        const cell = Math.abs(Math.sin(u * 3.1 + Math.sin(v * 2.3) * 1.7) * Math.cos(v * 2.9 + Math.sin(u * 1.9)));
        bed[i] = pal(0.22 + n * 0.16 + cell * 0.07);
      }
    let acc = 0, rain = 1;

    const drop = (x, y, r, s) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx, yy = y + Math.round(dy / aspect);
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
          const d = Math.hypot(dx, dy) / (r + 0.5);
          if (d < 1) cur[yy * W + xx] -= s * (Math.cos(d * Math.PI) * 0.5 + 0.5);
        }
    };

    const step = () => {
      for (let y = 1; y < H - 1; y++) {
        const row = y * W;
        for (let x = 1; x < W - 1; x++) {
          const i = row + x;
          prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * damp;
        }
      }
      const tmp = cur; cur = prev; prev = tmp;
    };

    return (t, dt) => {
      rain += dt * rate * (1.5 + (W * H) / 3000);
      while (rain >= 1) {
        drop(1 + Math.floor(rand() * (W - 2)), 1 + Math.floor(rand() * (H - 2)), 1 + Math.floor(rand() * 2.5), 90 + rand() * 120);
        rain -= 1;
      }
      acc += dt * 40;
      let n = 0;
      while (acc >= 1 && n < 3) { step(); acc -= 1; n++; }
      if (acc > 3) acc = 0;

      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const l = x > 0 ? cur[i - 1] : cur[i], r = x < W - 1 ? cur[i + 1] : cur[i];
          const u = y > 0 ? cur[i - W] : cur[i], d = y < H - 1 ? cur[i + W] : cur[i];
          const gx = r - l, gy = d - u;
          let sx = x + Math.round(gx * 0.1), sy = y + Math.round(gy * 0.1 / aspect);
          sx = sx < 0 ? 0 : sx >= W ? W - 1 : sx;
          sy = sy < 0 ? 0 : sy >= H ? H - 1 : sy;
          const c = bed[sy * W + sx];
          // Light from the upper-left: brighten slopes facing it, plus a tight glint.
          const shade = 1 + (-gx - gy) * 0.011;
          const spec = Math.max(0, (-gx - gy) * 0.02 - 0.3);
          const g2 = spec * spec * 255;
          const rr = ((c >> 16) & 255) * shade + g2, gg = ((c >> 8) & 255) * shade + g2, bb = (c & 255) * shade + g2;
          px[i] = ((rr < 0 ? 0 : rr > 255 ? 255 : rr) << 16) | ((gg < 0 ? 0 : gg > 255 ? 255 : gg) << 8) | (bb < 0 ? 0 : bb > 255 ? 255 : bb | 0);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
