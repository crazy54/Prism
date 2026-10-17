// Pure ASCII — living scenes: an aquarium, a steam train, a walker and digital rain.
// Original takes on the asciiquarium and sl ideas, drawn from scratch.
import { sprite, spriteWidth, mirror, hash } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'ASCII Animations', glyphs: 'ascii', color: '16', kind: 'art', size: { w: 80, h: 24 }, minSize: { w: 36, h: 12 } };

// ── aquarium ────────────────────────────────────────────────────────────────
const FISH = [
  ['><>'],
  ['><(((">'],
  ['  __  ', "><_ '>"],
  ['   .--.  ', '><(  o  >', "   `--'  "],
  ['  _____  ', '>=(  o   >', "  `---'  "],
];
const CASTLE = [
  '    |>     ',
  '   _|_     ',
  '  |   |_   ',
  ' _|[] | |_ ',
  '|_______|_|',
];

const aquarium = {
  ...shared,
  id: 'ascii-aquarium',
  title: 'ASCII Aquarium',
  tags: ['aquarium', 'fish', 'asciiquarium', 'bubbles', 'screensaver'],
  order: 80,
  loop: 20,
  description: 'Fish of five shapes cruise both ways past swaying seaweed and a sandcastle while bubbles wobble up to a rolling surface.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const colors = [th.warn, th.accent, th.crit, th.pos, th.info, th.neg];
    const top = 1, floor = H - 1;
    const fish = Array.from({ length: Math.max(3, Math.round(W * H / 260)) }, (_, i) => {
      const shape = FISH[Math.floor(rng() * FISH.length)];
      const dir = rng() < 0.5 ? 1 : -1;
      return { art: dir > 0 ? shape : mirror(shape), dir, y: top + 2 + Math.floor(rng() * Math.max(1, floor - top - 5 - shape.length)), speed: 3 + rng() * 7, off: rng() * 400, color: colors[i % colors.length] };
    });
    const weeds = Array.from({ length: Math.max(2, Math.round(W / 11)) }, () => ({ x: Math.floor(rng() * W), h: 2 + Math.floor(rng() * Math.min(6, H / 3)), ph: rng() * 6 }));
    const castleX = Math.floor(W * 0.68);
    return (t) => {
      const b = ctx.buffer;
      // Surface
      for (let x = 0; x < W; x++) {
        const v = Math.sin(x * 0.35 + t * 2.2) + Math.sin(x * 0.11 - t * 1.3);
        b.set(x, top, v > 0.8 ? '^' : v > -0.6 ? '~' : '-', th.info);
      }
      // Sand
      for (let x = 0; x < W; x++) b.set(x, floor, hash(x, 7) < 0.25 ? '.' : hash(x, 9) < 0.15 ? ',' : '_', mix(th.warn, th.bg, 0.4));
      if (W > 40 && H > 12) sprite(b, castleX, floor - CASTLE.length, CASTLE, th.muted);
      // Seaweed
      for (const w of weeds) for (let r = 0; r < w.h; r++) {
        const sway = Math.floor(t * 1.6 + w.ph + r * 0.7) % 2;
        b.set(w.x + (r % 2 === 0 ? 0 : sway ? 1 : 0), floor - 1 - r, (r + Math.floor(t * 1.6 + w.ph)) % 2 ? '(' : ')', th.pos);
      }
      // Fish + their bubbles
      for (const f of fish) {
        const fw = spriteWidth(f.art), span = W + fw * 2;
        const p = ((f.off + t * f.speed) % span + span) % span;
        const x = f.dir > 0 ? p - fw : W + fw - p - fw;
        sprite(b, x, f.y, f.art, f.color);
        const mouthX = f.dir > 0 ? x + fw : x - 1;
        const cycle = (t * 0.5 + f.off * 0.013) % 3;
        if (cycle < 1.4) {
          const rise = cycle * 4;
          const by = Math.round(f.y - rise);
          if (by > top) b.set(Math.round(mouthX + Math.sin(cycle * 6) * 0.6), by, rise < 1.5 ? '.' : rise < 3.5 ? 'o' : 'O', th.ink);
        }
      }
      // Vent bubbles from the sand
      for (let k = 0; k < 7; k++) {
        const ph = (t * (0.32 + (k % 3) * 0.07) + hash(k, 3)) % 1;
        const y = Math.round(floor - 1 - ph * (floor - top - 1));
        const x = Math.round(W * 0.2 + (k % 3) - 1 + Math.sin(ph * 14 + k * 2.1) * 1.6);
        if (y > top) b.set(x, y, ph < 0.3 ? '.' : ph < 0.7 ? 'o' : 'O', th.ink);
      }
    };
  },
};

// ── steam train ─────────────────────────────────────────────────────────────
const ENGINE = [
  '  ___                  ____        ',
  ' |   |   ___________  |[ ]|_____   ',
  ' |___|__|  P R I S M |____|     \  ',
  ' |                              |\_',
  ' |______________________________|_>',
  '    {W}    {W}    {W}      {W}  {W}  ',
];
const CAR = [
  '                          ',
  '  ______________________  ',
  ' | [] [] [] [] [] [] [] | ',
  ' |                      | ',
  '=|______________________|=',
  '    {W}            {W}    ',
];
const SPOKES = ['(-)', '(\)', '(|)', '(/)'];

const train = {
  ...shared,
  id: 'ascii-train',
  title: 'Steam Train',
  tags: ['train', 'sl', 'locomotive', 'steam', 'classic'],
  order: 90,
  loop: 14,
  minSize: { w: 40, h: 10 },
  description: 'An original take on the sl gag: a steam express thunders across, spokes turning, smoke billowing back over the carriages.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cw = spriteWidth(CAR), ew = spriteWidth(ENGINE);
    const total = cw * 2 + ew;
    const groundY = H - 2;
    const y0 = groundY - ENGINE.length + 1;
    const speed = 14;
    return (t) => {
      const b = ctx.buffer;
      const period = (W + total + 24) / speed;
      const x = Math.round((t % period) * speed - total);
      // Rails and sleepers scroll under the wheels
      b.text(0, groundY + 1, '='.repeat(W), th.muted);
      for (let sx = 0; sx < W; sx += 4) b.set(sx, groundY + 1, '#', th.dim);
      const spoke = SPOKES[Math.floor(t * 10) % 4];
      const wheel = (lines) => lines.map((l) => l.replaceAll('{W}', spoke));
      const color = (ch, c, r) => (r === 2 && /[A-Z]/.test(ch) ? th.warn : r === 5 ? th.ink : th.accent);
      sprite(b, x, y0, wheel(CAR), (ch, c, r) => (r === 2 && ch === '[' || ch === ']' ? th.warn : r === 5 ? th.ink : th.muted));
      sprite(b, x + cw, y0, wheel(CAR), (ch, c, r) => (r === 2 && (ch === '[' || ch === ']') ? th.warn : r === 5 ? th.ink : th.muted));
      sprite(b, x + cw * 2, y0, wheel(ENGINE), color);
      // Smoke from the stack (engine col 2), drifting back over the train
      const stackX = x + cw * 2 + 2;
      for (let k = 0; k < 10; k++) {
        const age = (t * 1.2 + k * 0.31) % 3.1;
        const px = stackX - age * 7 - k * 0.8;
        const py = y0 - 1 - age * 1.3;
        if (py < 0) continue;
        const puff = age < 0.7 ? '(@@)' : age < 1.6 ? '( )' : age < 2.4 ? '()' : '.';
        b.text(Math.round(px), Math.round(py), puff, mix(th.muted, th.bg, Math.min(0.8, age / 3.4)));
      }
    };
  },
};

// ── walker ──────────────────────────────────────────────────────────────────
const LEGS = ['/ \\', ' |\\', ' | ', '/| '];
const ARMS = ['/|\\', '-|\\', '/|-', '-|-'];

const walker = {
  ...shared,
  id: 'ascii-walker',
  title: 'Evening Walk',
  tags: ['stick figure', 'walk cycle', 'parallax', 'street'],
  order: 100,
  loop: 12,
  minSize: { w: 30, h: 8 },
  description: 'A stick figure strolls past lamp posts and drifting clouds — a four-frame walk cycle over three layers of parallax.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ground = H - 2;
    return (t) => {
      const b = ctx.buffer;
      // Clouds (slow)
      for (let k = 0; k < 4; k++) {
        const cw = 9 + k * 2, span = W + cw;
        const x = Math.round(((k * 37 - t * (1 + k * 0.4)) % span + span) % span - cw);
        const y = 1 + (k % 3);
        if (y < ground - 4) { b.text(x + 2, y, '.--.', th.dim); b.text(x, y + 1, '(' + '_'.repeat(cw - 2) + ')', th.dim); }
      }
      // Lamp posts (fast)
      for (let lx = ((-Math.floor(t * 6)) % 22 + 22) % 22 - 2; lx < W; lx += 22) {
        for (let y = ground - 5; y < ground; y++) b.set(lx, y, '|', th.muted);
        if (ground - 6 >= 0) b.text(lx - 1, ground - 6, '_O_', th.warn);
      }
      // Ground
      for (let x = 0; x < W; x++) b.set(x, ground, '_', th.dim);
      for (let x = ((-Math.floor(t * 6)) % 5 + 5) % 5; x < W; x += 5) b.set(x, ground + 1, hash(x + Math.floor(t * 6), 3) < 0.5 ? ',' : '.', th.dim);
      // The walker, bobbing on each step
      const f = Math.floor(t * 6) % 4;
      const wx = Math.floor(W * 0.42), wy = ground - 3 - (f % 2 === 0 ? 0 : 0);
      b.text(wx, wy, ' o ', th.ink);
      b.text(wx, wy + 1, ARMS[f], th.ink);
      b.text(wx, wy + 2, LEGS[f], th.ink);
    };
  },
};

// ── digital rain ────────────────────────────────────────────────────────────
const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$+-*/=%"\'#&_(),.;:?!\\|{}<>[]^~';

const rainCode = {
  ...shared,
  id: 'ascii-matrix',
  title: 'ASCII Digital Rain',
  tags: ['matrix', 'digital rain', 'code', 'hacker'],
  order: 110,
  loop: 8,
  description: 'Columns of falling ASCII code with bright heads and decaying trails — the digital-rain look on a 7-bit terminal.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const cols = Array.from({ length: W }, () => ({ speed: 6 + rng() * 14, len: 5 + Math.floor(rng() * H * 0.8), off: rng() * 60, on: rng() < 0.7 }));
    const head = mix(th.pos, 0xffffff, 0.75);
    return (t) => {
      const b = ctx.buffer;
      for (let x = 0; x < W; x++) {
        const c = cols[x];
        if (!c.on) continue;
        const span = H + c.len;
        const hy = ((c.off + t * c.speed) % span) | 0;
        for (let k = 0; k < c.len; k++) {
          const y = hy - k;
          if (y < 0 || y >= H) continue;
          const g = GLYPHS[Math.floor(hash(x, y, Math.floor(t * (k === 0 ? 12 : 3)) + k) * GLYPHS.length)];
          const fade = k / c.len;
          b.set(x, y, g, k === 0 ? head : fade < 0.3 ? th.pos : fade < 0.7 ? mix(th.pos, th.bg, 0.4) : th.dim, undefined, k === 0 ? 1 : 0);
        }
      }
    };
  },
};

export default [aquarium, train, walker, rainCode];
