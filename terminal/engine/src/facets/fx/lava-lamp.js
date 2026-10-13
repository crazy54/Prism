// Lava lamps on a shelf: wax blobs warm at the bulb, rise, cool, stretch and
// sink again — metaballs inside a tapered glass, lit from below, with the
// metal cap and base. One lamp when narrow, a row of three when there's room.
import { lerpc, clamp01 } from '../retro/_kit.js';

const LOOP = 30;

export default {
  title: 'Lava Lamp',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['lava lamp', 'metaballs', 'wax', 'blobs', 'retro', '1970s', 'groovy'],
  order: 80,
  description: 'Lava lamps on a shelf: metaball wax warms at the bulb, rises, stretches and sinks inside tapered glass lit from below.',
  size: { w: 64, h: 24 },
  minSize: { w: 16, h: 8 },
  loop: LOOP,
  canvas: 'field',
  palette: 'magma',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const rand = ctx.rng;
    const { theme } = ctx;
    const { width: W, height: H, px, aspect } = cv;
    const count = W / (H * aspect) > 1.05 ? 3 : 1;
    const lamps = Array.from({ length: count }, (_, i) => {
      const cx = W * ((i + 0.5) / count);
      const half = Math.min((W / count) * 0.34, H * aspect * 0.15);
      const hue = count === 1 ? 0 : [0.08, 0, 0.16][i];
      return {
        cx, half, hue,
        top: H * 0.05, cap: H * 0.17, bot: H * 0.8, base: H * 0.97,
        blobs: Array.from({ length: 5 }, (_, j) => ({ ph: rand(), sp: 1 + (j % 3), sw: rand() * 6.28, r: 0.26 + rand() * 0.2 })),
      };
    });
    const wall = lerpc(theme.bg, theme.panel, 0.6);
    const metal = [0x3a3a46, 0x8a8a9e, 0xd8d8e8];
    // Glass radius at height v (0 = top of glass, 1 = bottom): a tall tapered rocket shape.
    const radius = (v) => (0.5 + 0.5 * v) * Math.sqrt(Math.min(1, v * 12, (1 - v) * 14 + 0.3));
    return (t) => {
      // Back wall with a warm pool of light behind each lamp.
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) px[i] = wall;
      for (const L of lamps) {
        const liquid = pal(0.18 + L.hue), waxLo = pal(0.62 + L.hue), waxHi = pal(0.9 + L.hue * 0.5);
        for (let y = 0; y < H; y++) for (let x = Math.max(0, Math.floor(L.cx - L.half * 3.2)); x < Math.min(W, L.cx + L.half * 3.2); x++) {
          const dx = (x + 0.5 - L.cx) / (L.half * 3.2), dy = (y - L.bot) / H;
          px[y * W + x] = lerpc(px[y * W + x], waxLo, clamp01(0.22 - (dx * dx + dy * dy) * 0.3));
        }
        // Blob centers: each rides a slow heat cycle, rising from the bulb and sinking back.
        const bl = L.blobs.map((b) => {
          const ph = ((t / LOOP) * b.sp + b.ph) % 1;
          const rise = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
          return { x: Math.sin(((t * Math.PI * 2) / LOOP) * b.sp + b.sw) * 0.35, y: 0.93 - rise * 0.86, r: b.r * (0.75 + 0.35 * Math.sin(ph * Math.PI * 4 + b.sw)) };
        });
        const gh = L.bot - L.cap;
        for (let y = Math.floor(L.cap); y < Math.ceil(L.bot); y++) {
          const v = (y + 0.5 - L.cap) / gh, rw = L.half * radius(v);
          for (let x = Math.max(0, Math.floor(L.cx - rw)); x < Math.min(W, Math.ceil(L.cx + rw)); x++) {
            const lx = (x + 0.5 - L.cx) / L.half, ux = (x + 0.5 - L.cx) / rw;
            let f = 0;
            for (const b of bl) {
              const dx = lx - b.x, dy = ((v - b.y) * gh * aspect) / L.half;
              f += (b.r * b.r) / (dx * dx + dy * dy + 0.02);
            }
            f += Math.max(0, (v - 0.93) * 14) * 1.2;           // the molten pool on the bottom
            const glow = clamp01(v * 0.6 + 0.1);               // lit from the bulb below
            let c = lerpc(liquid, waxLo, glow * 0.25);
            if (f > 1) {
              const core = clamp01((f - 1) * 0.6);
              c = lerpc(waxLo, waxHi, core * (0.55 + 0.45 * glow));
            } else if (f > 0.8) c = lerpc(c, waxLo, (f - 0.8) / 0.2 * 0.6);
            // Glass: a highlight down the left, darkening at the rim.
            const rim = Math.abs(ux);
            if (rim > 0.82) c = lerpc(c, 0x000000, (rim - 0.82) * 2.2);
            if (ux > -0.62 && ux < -0.48) c = lerpc(c, 0xffffff, 0.22);
            px[y * W + x] = c;
          }
        }
        // Cap and base: brushed metal cones.
        const metalAt = (u) => (u < -0.3 ? lerpc(metal[0], metal[1], (u + 1) / 0.7) : u < 0.25 ? lerpc(metal[1], metal[2], (u + 0.3) / 0.55) : lerpc(metal[2], metal[0], (u - 0.25) / 0.75));
        for (let y = Math.floor(L.top); y < Math.ceil(L.cap); y++) {
          const k = (y - L.top) / (L.cap - L.top), rw = L.half * (0.3 + 0.13 * k);
          for (let x = Math.floor(L.cx - rw); x < L.cx + rw; x++) if (x >= 0 && x < W) px[y * W + x] = metalAt((x + 0.5 - L.cx) / rw);
        }
        for (let y = Math.floor(L.bot); y < Math.min(H, Math.ceil(L.base)); y++) {
          const k = (y - L.bot) / (L.base - L.bot), rw = L.half * (0.5 + 0.55 * Math.sin(k * Math.PI * 0.6 + 0.35));
          for (let x = Math.floor(L.cx - rw); x < L.cx + rw; x++) if (x >= 0 && x < W) px[y * W + x] = metalAt((x + 0.5 - L.cx) / rw);
        }
      }
      // The shelf.
      for (let y = Math.floor(H * 0.97); y < H; y++) px.fill(lerpc(theme.panel, 0x000000, 0.3), y * W, (y + 1) * W);
      cv.paint(ctx.buffer);
    };
  },
};
