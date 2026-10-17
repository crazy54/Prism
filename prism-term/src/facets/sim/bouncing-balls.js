// Billiard-ball physics under gravity: balls of different sizes (mass goes
// with area) collide elastically with each other and the walls, integrated at
// a fixed 240 Hz so it never tunnels or explodes. Every few seconds the floor
// "pops" and throws whatever is resting on it back into the air. Lit spheres,
// soft floor shadows that tighten as a ball lands, and a flash on hard hits.
import { sphere, blend } from '../objects/_raster.js';
import { NONE } from '../../color.js';

const HZ = 240, KICK = 4.5;

export default {
  title: 'Bouncing Balls',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['physics', 'collision', 'elastic', 'balls', 'gravity', 'billiards'],
  order: 10,
  description: 'Balls of different masses colliding elastically under gravity at a fixed 240 Hz step, with shadows and impact flashes.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: KICK * 4,
  canvas: 'field',
  palette: 'prism',
  params: { balls: { default: 9, min: 2, max: 24, label: 'Balls' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, rand = ctx.rng;
    const HP = H * asp; // world height in horizontal-pixel units
    const pal = ctx.palette();
    const n = Math.round(ctx.param('balls', 9));
    const unit = Math.min(W, HP);
    const G = HP * 2.2, FLOOR = HP - 1;
    const balls = [];
    for (let i = 0; i < n; i++) {
      const r = unit * (0.05 + rand() * 0.05);
      let x, y, tries = 0;
      do { x = r + rand() * (W - 2 * r); y = r + rand() * (FLOOR * 0.6 - r); tries++; } while (tries < 40 && balls.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + r + 0.5));
      balls.push({ x, y, vx: (rand() - 0.5) * W * 0.9, vy: (rand() - 0.5) * HP * 0.4, r, m: r * r, c: pal(i / n), flash: 0 });
    }
    let acc = 0, kicks = 0;

    const step = (h) => {
      for (const b of balls) {
        b.vy += G * h;
        b.x += b.vx * h; b.y += b.vy * h;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.95; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.95; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.95; }
        if (b.y > FLOOR - b.r) {
          if (b.vy > HP * 0.9) b.flash = Math.max(b.flash, Math.min(1, b.vy / (HP * 3)));
          b.y = FLOOR - b.r; b.vy = -Math.abs(b.vy) * 0.86; b.vx *= 0.995;
        }
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        // Push apart in proportion to inverse mass, then exchange impulse along the normal.
        const over = min - d, ia = 1 / a.m, ib = 1 / b.m, sum = ia + ib;
        a.x -= nx * over * (ia / sum); a.y -= ny * over * (ia / sum);
        b.x += nx * over * (ib / sum); b.y += ny * over * (ib / sum);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn >= 0) continue;
        const jimp = (-(1 + 0.97) * vn) / sum;
        a.vx -= jimp * ia * nx; a.vy -= jimp * ia * ny;
        b.vx += jimp * ib * nx; b.vy += jimp * ib * ny;
        const hit = Math.min(1, -vn / (unit * 2.5));
        if (hit > 0.25) { a.flash = Math.max(a.flash, hit); b.flash = Math.max(b.flash, hit); }
      }
    };

    return (t, dt) => {
      // The floor pops every KICK seconds, flinging resting balls back up.
      while (t >= (kicks + 1) * KICK) {
        kicks++;
        for (const b of balls) if (b.y > FLOOR - b.r - unit * 0.2) { b.vy = -HP * (1.6 + rand() * 0.9); b.vx += (rand() - 0.5) * W * 0.6; }
      }
      acc += Math.min(0.25, Math.max(0, dt)) * HZ;
      for (; acc >= 1; acc--) step(1 / HZ);
      for (const b of balls) b.flash *= Math.pow(0.02, Math.min(0.25, dt));

      cv.clear();
      const floorRow = Math.floor(FLOOR / asp);
      for (let x = 0; x < W; x++) cv.set(x, floorRow, blend(th.bg, th.line, 0.9));
      // Shadows: wider and fainter the higher the ball.
      for (const b of balls) {
        const hgt = Math.max(0, FLOOR - b.r - b.y) / HP;
        const sw = b.r * (1 + hgt * 1.5), k = 0.45 * (1 - Math.min(0.85, hgt * 1.3));
        for (let x = Math.floor(b.x - sw); x <= Math.ceil(b.x + sw); x++) {
          const f = 1 - Math.abs(x + 0.5 - b.x) / sw;
          if (f <= 0) continue;
          const y = floorRow - 1, old = cv.get(x, y);
          cv.set(x, y, blend(old === NONE ? th.bg : old, 0x000000, k * f));
        }
      }
      // Balls, far-to-near isn't needed in 2D; small ones last so they stay visible.
      const order = balls.slice().sort((a, b) => b.r - a.r);
      for (const b of order) {
        sphere(cv, null, b.x, b.y / asp, b.r, 0, (nx, ny, nz) => {
          const dif = Math.max(0, -nx * 0.45 - ny * 0.62 - nz * 0.64);
          const spec = Math.pow(Math.max(0, -nx * 0.3 - ny * 0.5 - nz * 0.81), 30);
          let c = blend(blend(0x000000, b.c, 0.3 + 0.7 * dif), 0xffffff, spec * 0.85);
          if (b.flash > 0.02) c = blend(c, 0xffffff, b.flash * 0.6 * (1 + nz));
          return c;
        });
      }
      cv.paint(ctx.buffer);
    };
  },
};
