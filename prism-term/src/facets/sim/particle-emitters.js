// Hot particle emitters: an angle grinder spraying bouncing sparks, twin
// confetti cannons with tumbling foil, and a lava fountain whose spatter
// cools where it lands. All randomness flows through ctx.rng and sims advance
// on fixed-step accumulators, so a given seed replays identical frames.
import { NONE, mix, scale } from '../../color.js';
import { clamp } from '../../easing.js';
import { fadeMark } from '../../palettes.js';

/** Piecewise-linear color ramp over `stops`, k in 0..1. */
const ramp = (stops) => (k) => {
  const x = clamp(k, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, x | 0);
  return mix(stops[i], stops[i + 1], x - i);
};

const grinder = {
  id: 'sim-grinder-sparks',
  since: '0.3.0',
  title: 'Angle Grinder',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['sparks', 'grinder', 'metal', 'workshop', 'glow', 'bounce'],
  order: 200,
  description: 'An angle grinder bites a steel bar: a cone of white-hot sparks arcs out, bounces down the floor and cools to embers.',
  size: { w: 72, h: 22 },
  minSize: { w: 24, h: 8 },
  loop: 12,
  canvas: 'line',
  params: { rate: { default: 1, min: 0.2, max: 3, label: 'Spark rate' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const { width: W, height: H, aspect } = cv;
    const rand = ctx.rng, th = ctx.theme, n2 = ctx.noise.noise2;
    const rate = ctx.param('rate', 1);
    const Hv = H * aspect, S = Math.min(W, Hv);
    const floor = Hv * 0.92, g = S * 1.5;
    const cx = W * 0.27, cy = Hv * 0.48;                 // wheel/bar contact point
    const wr = Math.max(2.5, S * 0.17);
    const wc = { x: cx + wr * 0.12, y: cy - wr };        // wheel centre sits on the bar end
    const light = th.mode === 'light';
    const hot = ramp(light
      ? [0x7a3200, 0xa84a00, 0xd96a10, 0x8a3008, 0x3f1505]
      : [0xffffff, 0xffeab8, 0xffb347, 0xff6a1a, 0x5e1c06]);
    const cap = Math.max(200, Math.min(2000, Math.round(W * H * 0.05)));
    const barC = mix(th.muted, th.ink, 0.25), rimC = th.muted, spokeC = th.dim;
    const sparks = [];
    const streak = (x0, y0, x1, y1, c) => {
      const n = Math.min(20, Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))));
      for (let s = 1; s <= n; s++) cv.add(x0 + ((x1 - x0) * s) / n, (y0 + ((y1 - y0) * s) / n) / aspect, c);
    };
    const spawn = (x, y, a, sp, life) => {
      if (sparks.length < cap) sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life });
    };
    let eacc = 0;
    return (t, dt) => {
      cv.fade(Math.exp(-dt * 9));
      // The operator leans in and eases off: emission follows the pressure.
      const press = clamp(0.45 + 0.75 * n2(t * 0.55, 3.1) + 0.35 * Math.sin(t * 2.6), 0.06, 1);
      // rig: bar, disc with spinning spokes, handle, floor
      for (const k of [0, 1.4, 2.8]) cv.line(W * 0.02, (cy + k) / aspect, cx, (cy + k) / aspect, barC);
      cv.line(0, floor / aspect, W - 1, floor / aspect, fadeMark(th, th.muted, 0.6));
      cv.circle(wc.x, wc.y / aspect, wr, rimC);
      cv.circle(wc.x, wc.y / aspect, Math.max(1, wr * 0.22), rimC, true);
      const spin = -t * 13;
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        cv.line(wc.x, wc.y / aspect, wc.x + Math.cos(a) * wr * 0.82, (wc.y + Math.sin(a) * wr * 0.82) / aspect, spokeC);
      }
      for (const k of [-0.5, 0.5])
        cv.line(wc.x + wr * 0.5, (wc.y - wr * 0.55 + k) / aspect, wc.x + wr * 2.4, (wc.y - wr * 1.0 + k) / aspect, rimC);
      // contact glare
      for (let i = 0; i < 3; i++) cv.add(cx + (rand() - 0.5) * 2, (cy + (rand() - 0.5) * 2) / aspect, scale(hot(0), 0.5 * press));
      // emit: a cone flung low-right off the cut, with a little back-spray
      eacc += dt * (24 + 190 * press * rate);
      for (; eacc >= 1; eacc--) {
        if (rand() < 0.13) spawn(cx, cy - 1, Math.PI + 0.45 + (rand() - 0.5) * 0.5, S * (0.3 + rand() * 0.35), 0.35 + rand() * 0.3);
        else spawn(cx, cy, 0.2 + (rand() - 0.5) * 0.85, S * (0.75 + rand() * 0.95) * (0.7 + 0.3 * press), 0.45 + rand() * 0.75);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i], ox = p.x, oy = p.y;
        const d = Math.exp(-1.1 * dt);
        p.vx *= d; p.vy = p.vy * d + g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y >= floor && p.vy > 0) {
          p.y = floor; p.vy *= -0.42; p.vx *= 0.75;
          if (rand() < 0.1) { // micro-pop on impact
            for (let k = 0; k < 3; k++) spawn(p.x, p.y - 0.5, -Math.PI / 2 + (rand() - 0.5) * 2.2, S * 0.3 * rand(), 0.2 + rand() * 0.15);
            p.life = Math.min(p.life, 0.1);
          }
        }
        p.life -= dt;
        if (p.life <= 0 || p.x < -2 || p.x > W + 2) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
        let c = hot(1 - p.life / p.max);
        if (p.life < 0.25) c = scale(c, p.life / 0.25);
        streak(ox, oy, p.x, p.y, c);
      }
      cv.paint(ctx.buffer);
    };
  },
};

const confetti = {
  id: 'sim-confetti-cannon',
  since: '0.3.0',
  title: 'Confetti Cannons',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['confetti', 'party', 'celebration', 'cannon', 'flutter'],
  order: 210,
  description: 'Twin corner cannons alternate volleys of foil confetti that tumble end over end, flashing wide when a face catches the light.',
  size: { w: 70, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 9.6,
  canvas: 'hires',
  setup(ctx) {
    const cv = ctx.canvas('hires');
    const { width: W, height: H, aspect } = cv;
    const rand = ctx.rng, th = ctx.theme, pal = ctx.palette();
    const Hv = H * aspect, S = Math.min(W, Hv);
    const floor = Hv * 0.96;
    const burstN = Math.max(30, Math.min(130, Math.round((W * H) / 70)));
    const FIRE = 1.6; // seconds between shots; 6 shots close the 9.6 s loop
    const pieces = [];
    const guns = [
      { x: W * 0.05, y: floor, a: -1.05, flash: -9 },
      { x: W * 0.95, y: floor, a: -Math.PI + 1.05, flash: -9 },
    ];
    let shot = -1;
    const fire = (gun, t) => {
      gun.flash = t;
      const mx = gun.x + Math.cos(gun.a) * S * 0.09, my = gun.y + Math.sin(gun.a) * S * 0.09;
      for (let i = 0; i < burstN && pieces.length < 520; i++) {
        const a = gun.a + (rand() - 0.5) * 0.6, sp = S * (0.8 + rand() * 0.85);
        pieces.push({
          x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          ph: rand() * 6.28, spin: 3 + rand() * 7, sway: 2 + rand() * 3,
          c: pal(rand()), land: -1,
        });
      }
    };
    return (t, dt) => {
      cv.clear();
      const k = Math.floor(t / FIRE);
      if (k !== shot) { shot = k; fire(guns[k & 1], t); }
      const g = S * 0.9, term = S * 0.16;
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (p.land < 0) {
          const d = Math.exp(-2.1 * dt);
          p.vx *= d;
          p.vy = Math.min(p.vy * d + g * dt, term); // drag wins fast: flutter-fall
          p.x += (p.vx + Math.sin(p.ph + t * p.sway) * S * 0.08) * dt;
          p.y += p.vy * dt;
          if (p.y >= floor) { p.y = floor; p.land = t; }
        }
        const rest = p.land < 0 ? 0 : (t - p.land) / 1.4;
        if (rest >= 1 || p.x < -2 || p.x > W + 2) { pieces.splice(i, 1); continue; }
        const face = Math.cos(p.ph + t * p.spin);
        const lit = p.land >= 0 ? 0.5 * (1 - rest) : 0.5 + 0.5 * Math.abs(face);
        const c = fadeMark(th, p.c, clamp(lit, 0.08, 1));
        const yp = p.y / aspect;
        cv.set(p.x, yp, c);
        if (p.land < 0 && Math.abs(face) > 0.5) cv.set(p.x + 1, yp, c); // face-on: two px wide
      }
      for (const gun of guns) {
        const ux = Math.cos(gun.a), uy = Math.sin(gun.a), nx = -uy * 1.1, ny = ux * 1.1;
        const barrel = mix(th.muted, th.ink, 0.3);
        for (const o of [-1, 0, 1])
          cv.line(gun.x + nx * o, (gun.y + ny * o) / aspect, gun.x + ux * S * 0.09 + nx * o, (gun.y + uy * S * 0.09 + ny * o) / aspect, barrel);
        const fl = t - gun.flash;
        if (fl >= 0 && fl < 0.14) {
          const mx = gun.x + ux * S * 0.1, my = gun.y + uy * S * 0.1;
          cv.circle(mx, my / aspect, Math.max(1.5, S * 0.05) * (1 - fl / 0.14), fadeMark(th, th.warn, 1 - fl / 0.14), true);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

const lava = {
  id: 'sim-lava-fountain',
  since: '0.3.0',
  title: 'Lava Fountain',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['lava', 'volcano', 'eruption', 'magma', 'heat', 'glow'],
  order: 220,
  description: 'A cinder cone jets molten blobs that arc, splatter and crust over — fresh spatter glows white while old flows cool to ember.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 16,
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, aspect, px } = cv;
    const rand = ctx.rng, th = ctx.theme, n2 = ctx.noise.noise2;
    const Hv = H * aspect, S = Math.min(W, Hv);
    const ground = Hv * 0.95, apex = Hv * 0.5, cx = W / 2;
    const bw = Math.max(3, Math.min(W * 0.3, (ground - apex) * 1.6));
    const g = S * 0.95;
    const lavaRamp = ramp([0x2e0a03, 0x8a1a06, 0xe2581a, 0xffc24a, 0xfff6d8]);
    // Column silhouette (in px rows) and the static rock base layer.
    const surf = (x) => (Math.abs(x - cx) < bw ? apex + (Math.abs(x - cx) * (ground - apex)) / bw : ground);
    const base = new Int32Array(W * H).fill(NONE);
    for (let yp = 0; yp < H; yp++) {
      const yu = yp * aspect;
      for (let x = 0; x < W; x++) {
        if (yu >= surf(x) - aspect * 0.5) {
          const grain = 0.75 + 0.5 * ctx.noise.noise2(x * 0.18, yp * 0.18);
          base[yp * W + x] = scale(mix(0x17110c, th.muted, 0.3), clamp(grain, 0.5, 1.25));
        }
      }
    }
    const heat = new Float32Array(W * H);
    const blobs = [];
    const cap = Math.max(80, Math.min(600, Math.round(W * H * 0.02)));
    // Lava wants night: hard-fill a dark sky on light themes (same trick as fireworks).
    const sky = th.mode === 'light' ? 0x0b0a12 : NONE;
    const deposit = (x, yu, amt) => {
      const ix = Math.round(x), iy = Math.round(yu / aspect);
      if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
      const i = iy * W + ix;
      heat[i] = Math.min(1.35, heat[i] + amt);
      if (ix + 1 < W) heat[i + 1] = Math.min(1.2, heat[i + 1] + amt * 0.45);
      if (ix > 0) heat[i - 1] = Math.min(1.2, heat[i - 1] + amt * 0.45);
    };
    let eacc = 0;
    return (t, dt) => {
      if (sky !== NONE) ctx.buffer.fill(0, 0, ctx.width, ctx.height, ' ', th.ink, sky);
      // eruption pulse: simmering feed with surging bursts
      const burst = Math.max(0, n2(t * 0.4, 9.2)) * 2;
      eacc += dt * (14 + 46 * burst) * clamp(W * H / 3000, 0.3, 1.6);
      for (; eacc >= 1; eacc--) {
        if (blobs.length >= cap) break;
        const big = rand() < 0.2;
        blobs.push({
          x: cx + (rand() - 0.5) * bw * 0.16, y: apex - 1.5,
          vx: (rand() - 0.5) * S * (0.3 + 0.25 * burst),
          vy: -S * (0.5 + rand() * 0.45) * (1 + 0.35 * burst),
          temp: 1, big,
        });
      }
      const decay = Math.exp(-dt * 0.26);
      for (let i = 0; i < heat.length; i++) if (heat[i] > 0.004) heat[i] *= decay;
      // the crater itself always glows
      deposit(cx, apex, dt * 2.5);
      for (let i = blobs.length - 1; i >= 0; i--) {
        const p = blobs[i];
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.temp -= dt * 0.26;
        if (p.y >= surf(p.x) - 0.6) {
          deposit(p.x, p.y, Math.max(0.15, p.temp) * (p.big ? 1.2 : 0.75));
          blobs[i] = blobs[blobs.length - 1]; blobs.pop(); continue;
        }
        if (p.temp <= 0.02 || p.x < -2 || p.x > W + 2) { blobs[i] = blobs[blobs.length - 1]; blobs.pop(); }
      }
      for (let i = 0; i < px.length; i++) {
        const h = heat[i];
        px[i] = h > 0.03 ? (base[i] === NONE ? scale(lavaRamp(h), clamp(h * 1.6, 0.2, 1)) : mix(base[i], lavaRamp(Math.min(1, h)), clamp(h * 1.3, 0, 1))) : base[i];
      }
      for (const p of blobs) {
        const c = lavaRamp(clamp(p.temp, 0, 1)), yp = p.y / aspect;
        cv.set(p.x, yp, c);
        if (p.big) {
          cv.blend(p.x + 1, yp, c, 0.7); cv.blend(p.x - 1, yp, c, 0.7);
          cv.blend(p.x, yp + 1, c, 0.6); cv.blend(p.x, yp - 1, c, 0.6);
        } else if (p.temp > 0.5) cv.blend(p.x, yp - 1, c, 0.4);
      }
      cv.paint(ctx.buffer);
    };
  },
};

export default [grinder, confetti, lava];
