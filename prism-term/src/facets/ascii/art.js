// Pure ASCII — art: little living pictures in 7-bit characters.
import { sprite, spriteWidth, hash, center } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'ASCII Art', glyphs: 'ascii', color: '16', kind: 'art', size: { w: 80, h: 24 }, minSize: { w: 36, h: 12 } };

// ── sea ─────────────────────────────────────────────────────────────────────
const BOAT = [
  '     |\\     ',
  '     | \\    ',
  '     |  \\   ',
  '     |___\\  ',
  ' ____|_____ ',
  ' \\  o o o / ',
  '  \\______/  ',
];

const sea = {
  ...shared,
  id: 'ascii-sea',
  title: 'Sailboat at Sea',
  tags: ['boat', 'sea', 'waves', 'seagulls', 'sunset'],
  order: 10,
  loop: 12,
  description: 'A sailboat rides rolling ~ and ^ swells under a low sun while gulls flap overhead between v and V.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const horizon = Math.floor(H * 0.55);
    const waveAt = (x, t) => Math.sin(x * 0.18 + t * 1.3) * 0.8 + Math.sin(x * 0.07 - t * 0.7) * 0.6;
    return (t) => {
      const b = ctx.buffer;
      // Sun
      const sx = Math.floor(W * 0.78), sy = Math.max(1, horizon - 6);
      b.text(sx - 2, sy - 1, ' ___ ', th.warn);
      b.text(sx - 3, sy, '/     \\', th.warn);
      b.text(sx - 3, sy + 1, '\\_____/', th.warn);
      for (const [dx, dy, ch] of [[-6, 0, '-'], [5, 0, '-'], [0, -2, '|'], [-5, -2, '\\'], [5, -2, '/']]) if (Math.floor(t * 2) % 2 === 0) b.set(sx + dx, sy + dy, ch, th.warn);
      // Gulls
      for (let k = 0; k < 4; k++) {
        const gx = Math.floor(((k * 23 + t * (3 + k)) % (W + 6)) - 3);
        const gy = 2 + ((k * 3) % Math.max(1, horizon - 4));
        b.set(gx, gy, Math.floor(t * 4 + k) % 2 ? 'v' : 'V', th.muted);
      }
      // Sea surface and swells
      for (let y = horizon; y < H; y++) {
        const depth = (y - horizon) / Math.max(1, H - horizon);
        for (let x = 0; x < W; x++) {
          const v = waveAt(x + y * 3.1, t + y * 0.4);
          const ch = v > 1 ? '^' : v > 0.4 ? '~' : v > -0.4 ? '-' : ' ';
          if (ch !== ' ') b.set(x, y, ch, depth < 0.35 ? th.info : depth < 0.7 ? mix(th.info, th.bg, 0.3) : mix(th.info, th.bg, 0.55));
        }
      }
      // Sun glitter on the water
      for (let y = horizon; y < H; y++) for (let k = -2; k <= 2; k++) if (hash(y, k, Math.floor(t * 5)) < 0.35) b.set(sx + k * 2 + (y % 2), y, '=', th.warn);
      // Boat rides the swell
      const bx = Math.floor(W * 0.3 + Math.sin(t * 0.25) * W * 0.08);
      const bob = Math.round(waveAt(bx + 5, t) * 0.8);
      sprite(b, bx, horizon - BOAT.length + 2 + bob, BOAT, (ch, c, r) => (r < 4 ? th.ink : th.warn));
    };
  },
};

// ── mountains ───────────────────────────────────────────────────────────────
const mountains = {
  ...shared,
  id: 'ascii-mountains',
  title: 'Mountain Range',
  tags: ['mountains', 'landscape', 'parallax', 'snow', 'birds'],
  order: 20,
  loop: 20,
  description: 'Three ridgelines of /\\ peaks drift past at different speeds, snow on the summits, a moon overhead and birds in flight.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ridge = (x, seed, amp) => amp * (0.55 + 0.25 * Math.sin(x * 0.11 + seed) + 0.15 * Math.sin(x * 0.27 + seed * 2.1) + 0.08 * Math.sin(x * 0.61 + seed * 3.3));
    const layers = [
      { speed: 0.6, seed: 1.7, amp: H * 0.55, base: H - 1, col: mix(th.muted, th.bg, 0.45), fill: '.' },
      { speed: 1.4, seed: 4.2, amp: H * 0.42, base: H - 1, col: th.muted, fill: ':' },
      { speed: 3.2, seed: 7.9, amp: H * 0.26, base: H - 1, col: th.ink, fill: '#' },
    ];
    return (t) => {
      const b = ctx.buffer;
      // Stars + moon
      for (let k = 0; k < W * 0.4; k++) {
        const x = Math.floor(hash(k, 1) * W), y = Math.floor(hash(k, 2) * H * 0.4);
        if (hash(k, Math.floor(t * 2)) < 0.85) b.set(x, y, hash(k, 3) < 0.2 ? '*' : '.', th.dim);
      }
      const mx = Math.floor(W * 0.2), my = 1;
      b.text(mx, my, ' _.._', th.ink);
      b.text(mx, my + 1, "( (  `", th.ink);
      b.text(mx, my + 2, " `-.'", th.ink);
      for (const L of layers) {
        const off = t * L.speed;
        const tops = [];
        for (let x = -1; x <= W; x++) tops.push(Math.round(L.base - ridge(x + off, L.seed, L.amp)));
        for (let x = 0; x < W; x++) {
          const top = tops[x + 1], left = tops[x], right = tops[x + 2];
          // Occlude whatever is behind, then texture the face.
          for (let y = top + 1; y <= L.base; y++) {
            const face = L.fill === '#' ? ((x + y) % 2 ? '#' : ':') : L.fill === ':' ? ((x * 3 + y) % 5 === 0 ? ':' : ' ') : ' ';
            b.set(x, y, face, L.col);
          }
          // Keep the outline continuous across steep steps.
          for (let y = Math.min(top, right) + 1; y < Math.max(top, right); y++) b.set(x, y, right < top ? '/' : '\\', L.col);
          const peak = top <= left && top <= right && (top < left || top < right);
          const ch = peak ? '^' : right < top ? '/' : right > top ? '\\' : left > top ? '/' : left < top ? '\\' : '_';
          const high = top < L.base - L.amp * 0.74;
          b.set(x, top, ch, high ? th.ink : L.col);
          if (high && top + 1 <= L.base) b.set(x, top + 1, '*', th.ink);
        }
      }
      // Birds
      for (let k = 0; k < 3; k++) {
        const x = Math.floor((k * 29 + t * (5 + k * 2)) % (W + 4)) - 2;
        const y = Math.floor(H * 0.18) + k * 2 + Math.round(Math.sin(t * 1.5 + k) * 0.6);
        b.text(x, y, Math.floor(t * 5 + k) % 2 ? '\\/' : 'vv', th.muted);
      }
    };
  },
};

// ── skyline ─────────────────────────────────────────────────────────────────
const skyline = {
  ...shared,
  id: 'ascii-skyline',
  title: 'City at Night',
  tags: ['city', 'skyline', 'night', 'windows', 'plane'],
  order: 30,
  loop: 16,
  description: 'A night skyline whose windows switch on and off, an antenna beacon blinks, stars twinkle and a plane crosses the moon.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const buildings = [];
    for (let x = 0; x < W;) {
      const w = 4 + Math.floor(rng() * 9), h = Math.floor(H * (0.25 + rng() * 0.5));
      buildings.push({ x, w, h, antenna: rng() < 0.25, seed: Math.floor(rng() * 1e6) });
      x += w + (rng() < 0.3 ? 1 : 0);
    }
    return (t) => {
      const b = ctx.buffer;
      for (let k = 0; k < W * 0.5; k++) {
        const x = Math.floor(hash(k, 4) * W), y = Math.floor(hash(k, 5) * H * 0.5);
        const tw = hash(k, Math.floor(t * 3));
        if (tw < 0.8) b.set(x, y, tw < 0.1 ? '*' : '.', th.dim);
      }
      const mx = Math.floor(W * 0.72), my = 1;
      b.text(mx, my, '  _..._ ', th.ink);
      b.text(mx, my + 1, '.\'     \'.', th.ink);
      b.text(mx, my + 2, '\'._   _.\'', th.ink);
      b.text(mx, my + 3, '   """  ', th.ink);
      // Plane crossing with blinking lights
      const px = Math.floor(((t * 6) % (W + 20)) - 10);
      b.text(px, 3, '__|__', th.muted);
      b.text(px + 1, 4, '--o--', th.muted);
      if (Math.floor(t * 3) % 2) b.set(px - 1, 4, '*', th.neg);
      const ground = H - 1;
      for (const bl of buildings) {
        const top = ground - bl.h;
        b.text(bl.x, top, '_'.repeat(bl.w), th.muted);
        for (let y = top + 1; y <= ground; y++) {
          b.set(bl.x, y, '|', th.muted);
          b.set(bl.x + bl.w - 1, y, '|', th.muted);
          for (let x = bl.x + 1; x < bl.x + bl.w - 1; x += 2) {
            const lit = hash(bl.seed + x, y, Math.floor(t / 2.5 + hash(x, y) * 4)) < 0.42;
            if ((y - top) % 2 === 0 && x + 1 < bl.x + bl.w - 1) b.text(x, y, lit ? '[]' : '  ', lit ? th.warn : th.dim);
          }
        }
        if (bl.antenna && top > 2) {
          b.set(bl.x + Math.floor(bl.w / 2), top - 1, '|', th.muted);
          b.set(bl.x + Math.floor(bl.w / 2), top - 2, Math.floor(t * 2 + bl.seed) % 2 ? '*' : '.', th.neg);
        }
      }
    };
  },
};

// ── rocket launch ───────────────────────────────────────────────────────────
const ROCKET = [
  '    /\\    ',
  '   /  \\   ',
  '  |    |  ',
  '  | () |  ',
  '  |    |  ',
  '  | PR |  ',
  '  | SM |  ',
  ' /|    |\\ ',
  '/_|____|_\\',
  '   /||\\   ',
];

const rocket = {
  ...shared,
  id: 'ascii-rocket',
  title: 'Rocket Launch',
  tags: ['rocket', 'launch', 'countdown', 'space', 'exhaust'],
  order: 40,
  loop: 12,
  minSize: { w: 30, h: 16 },
  description: 'Countdown from T-5, ignition, a flickering exhaust plume and billowing smoke as the rocket clears the tower — then again.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const rw = spriteWidth(ROCKET);
    const pad = H - 1;
    return (t) => {
      const b = ctx.buffer;
      const p = t % 12;
      const rx = Math.floor((W - rw) / 2);
      const lift = p < 6 ? 0 : Math.pow(p - 6, 2) * 1.6;
      const ry = Math.round(pad - ROCKET.length - lift);
      // Tower
      for (let y = pad - ROCKET.length - 1; y < pad; y++) b.text(rx - 4, y, y % 2 ? '|X|' : '|-|', th.dim);
      b.text(0, pad, '_'.repeat(W), th.muted);
      // Countdown
      if (p < 6) {
        const n = Math.max(0, 5 - Math.floor(p));
        center(b, 1, n > 0 ? `T - ${n}` : 'IGNITION', n > 0 ? th.ink : th.warn, 1);
      } else if (p < 8.5) center(b, 1, 'LIFTOFF', th.pos, 1);
      // Exhaust plume
      if (p > 4.6) {
        const len = p < 6 ? 2 : 5 + Math.min(4, (p - 6) * 2);
        for (let k = 0; k < len; k++) {
          const y = ry + ROCKET.length + k;
          if (y >= pad) break;
          const wv = Math.min(4, 1 + k);
          for (let dx = -wv; dx <= wv; dx++) {
            const r = hash(dx, k, Math.floor(t * 14));
            if (r < 0.7 - Math.abs(dx) / (wv + 2)) b.set(rx + 5 + dx, y, k < 2 ? '*' : r < 0.3 ? '^' : '"', k < 2 ? th.ink : r < 0.3 ? th.warn : th.neg);
          }
        }
        // Smoke at the pad
        const spread = p < 6 ? (p - 4.6) * 4 : 6 + (p - 6) * 3;
        for (let dx = -spread; dx <= spread; dx++) {
          const r = hash(Math.round(dx), Math.floor(t * 6));
          if (r < 0.6) b.set(Math.round(rx + 5 + dx), pad - 1 - (r < 0.25 ? 1 : 0), r < 0.2 ? '@' : r < 0.4 ? 'O' : 'o', mix(th.muted, th.bg, Math.min(0.6, Math.abs(dx) / (spread + 1))));
        }
      }
      if (ry > -ROCKET.length) sprite(b, rx, ry, ROCKET, (ch, c, r) => (r === 5 || r === 6 ? th.accent : th.ink));
    };
  },
};

// ── coffee ──────────────────────────────────────────────────────────────────
const CUP = [
  '  .--------------.  ',
  '  |              |__',
  '  |              |  )',
  '  |              | / ',
  '   \\            /--  ',
  '    `----------\'    ',
  ' ___________________ ',
  '(___________________)',
];

const coffee = {
  ...shared,
  id: 'ascii-coffee',
  title: 'Fresh Coffee',
  tags: ['coffee', 'steam', 'cup', 'cozy', 'break'],
  order: 50,
  loop: 8,
  minSize: { w: 26, h: 14 },
  description: 'A cup on its saucer with three wisps of steam curling up and drifting — the universal "build is running" picture.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cw = spriteWidth(CUP);
    return (t) => {
      const b = ctx.buffer;
      const cx = Math.floor((W - cw) / 2), cy = H - CUP.length - 1;
      for (let k = 0; k < 3; k++) {
        for (let y = 0; y < cy - 1; y++) {
          const age = (cy - 1 - y) / Math.max(1, cy - 1);
          const phase = t * 2.2 + k * 2 + y * 0.55;
          const x = cx + 6 + k * 4 + Math.round(Math.sin(phase) * (1 + age * 1.5));
          const ch = Math.cos(phase) > 0 ? '(' : ')';
          if (hash(k, y, Math.floor(t * 4)) < 0.92 - age * 0.5) b.set(x, y + 1, ch, mix(th.ink, th.bg, 0.2 + age * 0.55));
        }
      }
      sprite(b, cx, cy, CUP, (ch, c, r) => (r >= 6 ? th.muted : th.ink));
      // Coffee surface
      b.text(cx + 3, cy + 1, '~'.repeat(14).split('').map((c, i) => ((i + Math.floor(t * 3)) % 4 === 0 ? '-' : '~')).join(''), th.warn);
      if (H > CUP.length + 2) center(b, H - 1, 'brewing...'.slice(0, 7 + (Math.floor(t * 2) % 4)), th.dim);
    };
  },
};

export default [sea, mountains, skyline, rocket, coffee];
