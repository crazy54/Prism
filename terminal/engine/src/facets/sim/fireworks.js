// Fireworks: rockets climb on sparkling trails and burst into one of four shell
// types — peony (sphere), ring, willow, crackle — whose sparks fly under
// gravity and drag, cool from white-hot to ember, and leave glowing trails
// (additive plotting on a persistent, fading canvas). The lower band of the
// sky is mirrored into a rippling lake.
import { mix, NONE } from '../../color.js';

const WHITE = 0xffffff, EMBER = 0x6a1606, GOLD = 0xffc35a;

export default {
  title: 'Fireworks',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['fireworks', 'particles', 'celebration', 'glow'],
  order: 30,
  description: 'Rockets and four shell types (peony, ring, willow, crackle) with gravity, drag, additive glow trails and a lake reflection.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect, px } = cv;
    const rand = ctx.rng;
    const pal = ctx.palette();
    const reflect = ctx.param('reflect', true) && H >= 16;
    const Hv = H * aspect; // vertical extent in horizontal-pixel units (keeps bursts round)
    const S = Math.min(W, Hv);
    const g = S * 0.42;
    const groundRow = reflect ? Math.floor(H * 0.84) : H;
    const ground = groundRow * aspect;
    const maxSparks = Math.max(400, Math.min(6000, Math.round(W * H * 0.08)));
    const rockets = [], sparks = [];
    let next = 0.2;

    const addLine = (x0, y0, x1, y1, c) => {
      const n = Math.min(64, Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))));
      for (let s = 1; s <= n; s++) cv.add(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, c);
    };
    const dim = (c, k) => ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | (((c & 255) * k) | 0);
    const spark = (o) => { if (sparks.length < maxSparks) sparks.push(o); };

    const launch = () => {
      const x = W * (0.12 + 0.76 * rand());
      const apex = Hv * (0.1 + 0.32 * rand());
      rockets.push({
        x, y: ground, vx: (rand() - 0.5) * S * 0.12,
        vy: -Math.sqrt(2 * g * (ground - apex)),
        color: pal(rand()), type: rand(),
      });
    };

    const explode = (r) => {
      const c2 = rand() < 0.3 ? pal(rand()) : r.color;
      const base = { x: r.x, y: r.y, crackle: false, gf: 1 };
      if (r.type < 0.38) { // peony: sphere projected to the screen
        const n = 110 + Math.floor(rand() * 70), s = S * (0.7 + rand() * 0.3);
        for (let i = 0; i < n; i++) {
          const z = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - z * z);
          const k = s * (0.92 + rand() * 0.16);
          const life = 1.2 + rand() * 0.6;
          spark({ ...base, vx: Math.cos(a) * q * k, vy: Math.sin(a) * q * k, life, max: life, drag: 1.7, color: i % 2 ? r.color : c2 });
        }
      } else if (r.type < 0.6) { // ring, tilted and rotated
        const n = 48 + Math.floor(rand() * 18), s = S * (0.72 + rand() * 0.2);
        const tilt = 0.3 + rand() * 0.7, rot = rand() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, ex = Math.cos(a), ey = Math.sin(a) * tilt;
          const vx = (ex * Math.cos(rot) - ey * Math.sin(rot)) * s, vy = (ex * Math.sin(rot) + ey * Math.cos(rot)) * s;
          spark({ ...base, vx, vy, life: 1.4, max: 1.4, drag: 1.5, color: r.color });
        }
        for (let i = 0; i < 18; i++) { // a small core
          const a = rand() * Math.PI * 2, k = s * 0.25 * rand();
          spark({ ...base, vx: Math.cos(a) * k, vy: Math.sin(a) * k, life: 0.9, max: 0.9, drag: 2, color: c2 });
        }
      } else if (r.type < 0.8) { // willow: slow, heavy drag, long golden fall
        const n = 110 + Math.floor(rand() * 40), s = S * (0.55 + rand() * 0.15);
        for (let i = 0; i < n; i++) {
          const a = rand() * Math.PI * 2, k = s * Math.sqrt(rand());
          const life = 2.6 + rand() * 1.2;
          spark({ ...base, vx: Math.cos(a) * k, vy: Math.sin(a) * k - s * 0.1, life, max: life, drag: 2.6, gf: 0.55, color: GOLD, trail: [] });
        }
      } else { // crackle: a sphere whose sparks split into flickering white glitter
        const n = 80 + Math.floor(rand() * 30), s = S * (0.65 + rand() * 0.2);
        for (let i = 0; i < n; i++) {
          const z = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - z * z);
          const life = 0.8 + rand() * 0.4;
          spark({ ...base, vx: Math.cos(a) * q * s, vy: Math.sin(a) * q * s, life, max: life, drag: 1.8, color: r.color, crackle: true });
        }
      }
    };

    // Fireworks need a night sky, even by Day.
    const sky = ctx.theme.mode === 'light' ? 0x080a14 : NONE;
    return (t, dt) => {
      if (sky !== NONE) ctx.buffer.fill(0, 0, ctx.width, ctx.height, ' ', ctx.theme.ink, sky);
      cv.fade(Math.exp(-dt * 11));
      // Clear the lake band; it is rebuilt from the sky every frame.
      if (reflect) px.fill(NONE, groundRow * W);

      if (t >= next) {
        launch();
        if (rand() < 0.18) { launch(); launch(); }
        next = t + 0.35 + rand() * 1.1;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        const ox = r.x, oy = r.y;
        r.vy += g * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        addLine(ox, oy / aspect, r.x, r.y / aspect, 0xffd9a0);
        if (rand() < 0.6) spark({ x: r.x, y: r.y, vx: (rand() - 0.5) * S * 0.05, vy: S * 0.05 * rand(), life: 0.35, max: 0.35, drag: 3, gf: 0.3, color: 0xffa94d, crackle: false });
        if (r.vy > -S * 0.04) { explode(r); rockets.splice(i, 1); }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        const ox = p.x, oy = p.y;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy = p.vy * d + g * p.gf * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0 || p.y > ground || p.x < -4 || p.x > W + 4) {
          if (p.crackle && p.life <= 0) {
            for (let k = 0; k < 4; k++) {
              const a = rand() * Math.PI * 2, s = S * 0.08 * rand();
              spark({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, drag: 4, gf: 0.2, color: WHITE, crackle: false, flicker: true });
            }
          }
          sparks.splice(i, 1);
          continue;
        }
        if (p.flicker && rand() < 0.45) continue;
        const age = 1 - p.life / p.max;
        let c = age < 0.12 ? mix(WHITE, p.color, age / 0.12) : age > 0.65 ? mix(p.color, EMBER, (age - 0.65) / 0.35) : p.color;
        c = dim(c, Math.pow(p.life / p.max, 0.6) * 0.85 + 0.15);
        addLine(ox, oy / aspect, p.x, p.y / aspect, c);
        if (p.trail) {
          // Willow sparks drag a long fading tail of their own recent positions.
          p.trail.push(p.x, p.y);
          if (p.trail.length > 28) p.trail.splice(0, 2);
          const n = p.trail.length / 2;
          for (let k = 1; k < n; k++) {
            const tk = dim(c, (k / n) * 0.55);
            addLine(p.trail[2 * k - 2], p.trail[2 * k - 1] / aspect, p.trail[2 * k], p.trail[2 * k + 1] / aspect, tk);
          }
        }
      }

      if (reflect) {
        // Mirror the whole sky into the lake band, squashed vertically and rippled.
        // Each lake row samples a slab of sky rows and keeps the brightest pixel
        // so single sparks survive the squash.
        const rows = H - groundRow, step = groundRow / rows;
        for (let y = groundRow; y < H; y++) {
          const d = (y - groundRow + 0.5) / rows;
          const s0 = Math.max(0, Math.floor(groundRow - (d + 0.5 / rows) * groundRow));
          const s1 = Math.min(groundRow - 1, Math.ceil(s0 + step));
          const k = 0.42 * (1 - d * 0.55);
          const shift = Math.round(Math.sin(y * 1.9 + t * 2.6) * (1 + d * 2.5));
          for (let x = 0; x < W; x++) {
            const sx = (x + shift + W) % W;
            let best = NONE, bl = -1;
            for (let sy = s0; sy <= s1; sy++) {
              const c = px[sy * W + sx];
              if (c === NONE) continue;
              const l = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
              if (l > bl) { bl = l; best = c; }
            }
            px[y * W + x] = best === NONE ? NONE : dim(best, k);
          }
        }
        // A faint dashed shoreline.
        const shore = mix(ctx.theme.line, ctx.theme.muted, 0.5);
        for (let x = 0; x < W; x += 3) if (px[groundRow * W + x] === NONE) px[groundRow * W + x] = shore;
      }
      cv.paint(ctx.buffer);
    };
  },
};
