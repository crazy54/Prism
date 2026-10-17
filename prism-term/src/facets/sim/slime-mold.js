// Physarum slime mold: thousands of agents each sense the trail ahead-left,
// ahead and ahead-right, steer toward the strongest scent, step, and deposit.
// The trail diffuses and evaporates. Food sources keep leaking scent, so the
// swarm self-organizes into a transport network linking them — the same trick
// the real organism uses to rebuild a railway map out of oat flakes.
import { NONE, mix } from '../../color.js';

const SA = Math.PI / 4, RA = Math.PI / 4, SO = 9; // sensor angle, rotation angle, sensor offset (px)

export default {
  title: 'Slime Mold',
  gallery: 'sim',
  category: 'Life & Flocking',
  kind: 'scene',
  tags: ['physarum', 'slime mold', 'agents', 'network', 'emergence', 'trails'],
  order: 30,
  description: 'Physarum agents sensing and laying scent trails self-organize into a transport network linking food sources.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: 20,
  canvas: 'line',
  palette: 'toxic',
  params: { agents: { default: 1, min: 0.2, max: 3, label: 'Agent density' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme, rand = ctx.rng;
    const pal = ctx.palette();
    const N = W * H;
    const count = Math.min(9000, Math.round(N * 0.13 * ctx.param('agents', 1)));
    let trail = new Float32Array(N), tmp = new Float32Array(N);
    const occ = new Uint8Array(N); // one agent per pixel (Jones' exclusion rule)
    const ax = new Float32Array(count), ay = new Float32Array(count), ah = new Float32Array(count);
    // Scattered start, random headings: the network condenses out of the noise.
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0;
      do { x = rand() * W; y = rand() * H; tries++; } while (occ[(y | 0) * W + (x | 0)] && tries < 8);
      ax[i] = x; ay[i] = y; ah[i] = rand() * Math.PI * 2; occ[(y | 0) * W + (x | 0)] = 1;
    }
    const food = Array.from({ length: Math.max(3, Math.min(7, Math.round(N / 1500))) }, () => [3 + rand() * (W - 6), 3 + rand() * (H - 6)]);
    const sense = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : trail[(y | 0) * W + (x | 0)]);
    let acc = 0, peak = 1;
    const step = () => {
      for (const [fx, fy] of food) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) trail[((fy | 0) + dy) * W + (fx | 0) + dx] += 6;
      for (let i = 0; i < count; i++) {
        const h = ah[i], x = ax[i], y = ay[i];
        // Sensory stage: steer toward the strongest of three sensors.
        const f = sense(x + Math.cos(h) * SO, y + Math.sin(h) * SO);
        const l = sense(x + Math.cos(h - SA) * SO, y + Math.sin(h - SA) * SO);
        const r = sense(x + Math.cos(h + SA) * SO, y + Math.sin(h + SA) * SO);
        let nh = h;
        if (f >= l && f >= r) { /* straight on */ } else if (f < l && f < r) nh += (rand() < 0.5 ? -1 : 1) * RA; else if (l > r) nh -= RA; else nh += RA;
        // Motor stage: move only into a free pixel inside the dish; otherwise pick a new heading.
        const nx = x + Math.cos(nh), ny = y + Math.sin(nh);
        const j = (ny | 0) * W + (nx | 0), o = (y | 0) * W + (x | 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || (j !== o && occ[j])) { ah[i] = rand() * Math.PI * 2; continue; }
        occ[o] = 0; occ[j] = 1;
        ax[i] = nx; ay[i] = ny; ah[i] = nh > Math.PI * 2 ? nh - Math.PI * 2 : nh < 0 ? nh + Math.PI * 2 : nh;
        trail[j] += 5;
      }
      // Diffuse (3×3 mean, closed edges) and evaporate.
      let mx = 0;
      for (let y = 0; y < H; y++) {
        const y0 = y > 0 ? y - 1 : y, y1 = y < H - 1 ? y + 1 : y;
        for (let x = 0; x < W; x++) {
          const a = x > 0 ? x - 1 : x, b = x < W - 1 ? x + 1 : x;
          const s = trail[y0 * W + a] + trail[y0 * W + x] + trail[y0 * W + b] + trail[y * W + a] + trail[y * W + x] + trail[y * W + b] + trail[y1 * W + a] + trail[y1 * W + x] + trail[y1 * W + b];
          const v = (s / 9) * 0.9;
          tmp[y * W + x] = v;
          if (v > mx) mx = v;
        }
      }
      [trail, tmp] = [tmp, trail];
      peak = peak * 0.9 + mx * 0.1;
    };

    return (t, dt) => {
      acc += Math.min(0.25, Math.max(0, dt)) * 30;
      for (let k = 0; acc >= 1 && k < 6; k++, acc--) step();
      if (acc > 6) acc = 0;
      // Braille is on/off per dot: threshold the scent against its running peak.
      const thr = peak * 0.18;
      for (let i = 0; i < N; i++) {
        const v = trail[i];
        px[i] = v < thr ? NONE : pal(0.45 + 0.55 * Math.min(1, (v - thr) / (peak * 0.6)));
      }
      for (const [fx, fy] of food) {
        cv.circle(fx, fy, 1.5, mix(th.warn, 0xffffff, 0.3 + 0.2 * Math.sin(t * 3 + fx)), true);
      }
      cv.paint(ctx.buffer);
    };
  },
};
