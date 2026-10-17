// Old-school fire: each pixel averages the heat beneath it (drifting with a
// gusting wind) minus a scrolling cooling map, which tears the rising heat into
// tongues of flame; a flickering fuel bed feeds it and embers spiral off the top.
// On light themes the flame burns in daylight: its cool edge melts into the page
// instead of a soot-black band.
import { mix } from '../../color.js';

export default {
  title: 'Fire',
  gallery: 'fx',
  category: 'Fire & Water',
  kind: 'scene',
  tags: ['fire', 'doom', 'embers', 'heat'],
  order: 20,
  description: 'Classic demoscene fire — heat rises, averages and cools through a scrolling noise map, throwing embers on the wind.',
  canvas: 'field',
  palette: 'fire',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const day = ctx.theme.mode === 'light' && ctx.bg >= 0, paper = ctx.bg;
    const rand = ctx.rng;
    const { noise3 } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const heat = new Float32Array(W * (H + 2)); // two extra rows = fuel bed
    const rate = 32 * Math.max(1, H / 70);   // simulation steps (rows of rise) per second
    // Cooling texture, seamlessly tiled vertically so it can scroll forever.
    const CH = H * 2;
    const cool = new Float32Array(W * CH);
    const strength = ctx.param('height', 1);
    const base = 255 / Math.max(10, H * 0.62 * strength);
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < W; x++) {
        const f = (yy) => {
          const n = noise3(x * 0.19, yy * 0.075 * aspect, 0.5) * 0.5 + 0.5;
          return n * n;
        };
        const k = y / CH;
        cool[y * W + x] = base * (0.35 + 2.3 * (f(y) * (1 - k) + f(y + CH) * k));
      }
    const embers = [];
    let acc = 0, scroll = 0, steps = 0;

    const step = (t) => {
      const fuel = H * W;
      for (let x = 0; x < W; x++) {
        const n = noise3(x * 0.05, t * 1.3, 2.7);
        const v = 205 + n * 150 + (rand() - 0.5) * 70;
        heat[fuel + x] = v < 0 ? 0 : v > 255 ? 255 : v;
        heat[fuel + W + x] = heat[fuel + x];
      }
      scroll = (scroll + 1) % CH;
      for (let y = 0; y < H; y++) {
        const wind = noise3(y * 0.04, t * 0.35, 9.1) * 1.8 + Math.sin(t * 0.5) * 0.6;
        const shift = wind > 0.5 ? 1 : wind < -0.5 ? -1 : 0;
        const r1 = (y + 1) * W, r2 = (y + 2) * W;
        const cr = ((y + scroll) % CH) * W;
        for (let x = 0; x < W; x++) {
          const xs = x - shift;
          const a = xs > 0 ? xs - 1 : 0, b = xs < 0 ? 0 : xs >= W ? W - 1 : xs, c = xs + 1 < W ? xs + 1 : W - 1;
          const v = (heat[r1 + a] + heat[r1 + b] + heat[r1 + c] + heat[r2 + b]) * 0.25 - cool[cr + x];
          heat[y * W + x] = v > 0 ? v : 0;
        }
      }
      if (rand() < 0.3 * Math.max(1, W / 80)) {
        embers.push({ x: rand() * W, y: H * (0.55 + rand() * 0.3), vx: (rand() - 0.5) * 8, vy: -(12 + rand() * 20) * Math.max(1, H / 60), life: 1, p: rand() * 6 });
      }
      steps++;
    };

    return (t, dt) => {
      acc += dt * rate;
      let n = 0;
      while (acc >= 1 && n < 4) { step(t); acc -= 1; n++; }
      if (acc > 4) acc = 0;
      if (steps === 0) for (let k = 0; k < H; k++) step(t); // start with flames already up

      for (let i = 0; i < W * H; i++) {
        const h = heat[i];
        px[i] = h < 10 ? -1 : day ? mix(paper, pal(0.36 + 0.64 * (h / 255)), Math.min(1, (h - 10) / 110)) : pal(h / 255);
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.x += (e.vx + Math.sin(t * 2.5 + e.p) * 6) * dt;
        e.y += e.vy * dt;
        e.life -= dt * 0.6;
        if (e.life <= 0 || e.y < 0) { embers.splice(i, 1); continue; }
        cv.set(e.x, e.y, pal(0.45 + e.life * 0.5));
      }
      cv.paint(ctx.buffer);
    };
  },
};
