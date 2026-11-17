// Pure ASCII — landscapes by day and night: a campfire that settles mid-cycle,
// a hot-air balloon over patchwork hills, a torch-lit castle, a desert caravan
// under heat shimmer, and a firefly forest. 7-bit glyphs only; reads in mono.
import { sprite, hash } from './_ascii.js';
import { mix } from '../../color.js';
import { clamp } from '../../easing.js';

const shared = { gallery: 'ascii', glyphs: 'ascii', color: '16', kind: 'art', size: { w: 80, h: 24 }, minSize: { w: 36, h: 12 } };
const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const ease = (k) => k * k * (3 - 2 * k);

function stars(b, W, rows, th, t, seed = 0) {
  for (let k = 0; k < W * 0.42; k++) {
    const x = Math.floor(hash(k, 11 + seed) * W), y = Math.floor(hash(k, 23 + seed) * rows);
    if (hash(k, 5 + seed, Math.floor(t * 2)) < 0.8) b.set(x, y, hash(k, 7) < 0.18 ? '*' : '.', th.dim);
  }
}

function moon(b, x, y, th) {
  b.text(x, y, ' _.._', th.ink); b.text(x, y + 1, '( (  `', th.ink); b.text(x, y + 2, " `-.'", th.ink);
}

// ── campfire ─────────────────────────────────────────────────────────────────
const CPINE = ['  ^  ', ' /^\\ ', '/_|_\\', '  |  '];

const campfire = {
  ...shared,
  id: 'ascii-campfire',
  since: '0.3.0',
  title: 'Campfire',
  category: 'ASCII Animations',
  tags: ['campfire', 'fire', 'sparks', 'night', 'camping', 'smoke', 'logs'],
  order: 210,
  loop: 10,
  minSize: { w: 32, h: 10 },
  description: 'A ringed campfire under the stars: flames sway, sparks spiral up, the top log settles in a burst, burns down to coals, and a fresh log is laid on before the next round.',
  setup(ctx) {
    const { width: W, height: H, theme: th, noise } = ctx;
    const cx = Math.floor(W / 2), ground = H - 2, logY = H - 4;
    const fw = clamp(Math.round(W * 0.1), 3, 8), half = Math.max(5, fw); // flame half-width, log half-length
    const maxH = Math.max(3, Math.min(logY - 2, Math.round(H * 0.5)));
    const tc = 6.8, burnt = 9, laid = 9.8;              // the top log settles, is burnt through, a new one lands
    const R = 4.14;                                     // flame noise sampled on a circle: one lap per 10 s loop
    const logC = mix(th.warn, th.bg, 0.45), stone = (dx) => (Math.abs(dx) <= half + 2 ? mix(th.muted, th.warn, 0.35) : th.muted);
    return (t) => {
      const b = ctx.buffer;
      const p = phase(t, 10);
      const ang = TAU * p / 10, nx = R * Math.cos(ang), ny = R * Math.sin(ang);
      stars(b, W, Math.max(2, H - 8), th, p);
      moon(b, Math.floor(W * 0.8), 1, th);
      if (W >= 44) { sprite(b, 2, ground - 4, CPINE, th.dim); sprite(b, W - 8, ground - 4, CPINE, th.dim); }
      for (let x = 0; x < W; x++) b.set(x, ground + 1, hash(x, 3) < 0.2 ? ',' : '_', mix(th.muted, th.bg, 0.5));
      for (const dx of [-half - 4, -half - 2, half + 2, half + 4]) b.set(cx + dx, ground, Math.abs(dx) > half + 3 ? 'o' : 'O', stone(dx));
      for (const dx of [-half - 3, half + 3]) b.set(cx + dx, ground - 1, 'o', stone(dx));
      // flames
      const settle = clamp((p - tc) / 0.35, 0, 1);
      const flare = settle > 0 && settle < 1 ? Math.sin(settle * Math.PI) * 0.5 : 0;
      for (let dx = -fw; dx <= fw; dx++) {
        const prof = (1 - Math.abs(dx) / (fw + 1)) * (1 + flare);
        const hCol = maxH * prof * (0.55 + 0.45 * noise.noise3(dx * 0.7, nx, ny));
        for (let i = 0; i < hCol; i++) {
          const y = logY - 1 - i, rel = i / Math.max(1, hCol);
          const ch = rel > 0.78 ? (hash(dx, i, Math.floor(p * 8)) < 0.5 ? "'" : '.') : Math.sin(TAU * 8 * p / 10 + dx * 1.3 + i * 0.9) > 0 ? '(' : ')';
          b.set(cx + dx, y, ch, rel > 0.78 ? th.muted : Math.abs(dx) < fw * 0.45 ? th.warn : th.neg);
        }
      }
      // logs: the bottom one stays; the top one is raised, settles at tc, burns down to coals, and a
      // fresh one is lowered on at 9–9.8 s so the loop starts with a raised log again
      b.text(cx - half, logY, '<' + '='.repeat(2 * half - 1) + '>', logC);
      let lift = 2, drop = 0, burn = 0;
      if (p >= tc && p < burnt) { lift = Math.round(2 * (1 - ease(settle))); burn = clamp((p - tc - 0.35) / (burnt - tc - 0.6), 0, 1); }
      else if (p >= burnt) drop = Math.round(3 * (1 - clamp((p - burnt) / (laid - burnt), 0, 1)) ** 2);
      if (p < burnt) {
        for (let i = 0; i < 2 * half - 1; i++) {
          const y = logY - 1 - Math.round(lift * (1 - i / (2 * half - 2))) - drop, k = hash(i, 17);
          if (burn > 0 && k < burn) { if (k > burn - 0.25) b.set(cx - half + 1 + i, y, '*', th.neg); continue; } // charred through
          b.set(cx - half + 1 + i, y, burn > 0.4 && k < burn + 0.2 ? '-' : '=', burn > 0 ? mix(logC, th.neg, burn * 0.6) : logC);
        }
        if (burn < 0.5) { b.set(cx - half, logY - 1 - lift - drop, '<', logC); b.set(cx + half - 1, logY - 1 - drop, '>', logC); }
      } else {
        for (let i = 0; i < 2 * half - 1; i++) b.set(cx - half + 1 + i, logY - 1 - Math.round(2 * (1 - i / (2 * half - 2))) - drop, '=', logC);
        b.set(cx - half, logY - 3 - drop, '<', logC); b.set(cx + half - 1, logY - 1 - drop, '>', logC);
      }
      // embers on the logs
      for (let k = 0; k < 4; k++) if (hash(k, Math.floor(p * 6)) < 0.6) b.set(cx - 3 + k * 2, logY, '*', th.neg);
      // sparks (5, 6 or 7 lifts per loop), with bursts when the log drops and when the new one lands
      const burst = (p > tc && p < tc + 0.9) || p > laid - 0.05;
      for (let k = 0; k < (burst ? 14 : 8); k++) {
        const ph = (p * (0.5 + (k % 3) * 0.1) + hash(k, 9) * 3) % 1;
        const y = logY - 2 - ph * (maxH + 2);
        const x = cx + (hash(k, 4) - 0.5) * 5 + Math.sin(ph * 7 + k) * 2 * ph;
        if (y > 0 && hash(k, Math.floor(p * 9)) < 0.85 - ph * 0.5) {
          b.set(Math.round(x), Math.round(y), ph < 0.3 ? '*' : ph < 0.6 ? "'" : '.', ph < 0.3 ? th.warn : ph < 0.6 ? th.neg : th.dim);
        }
      }
      if (p > tc && p < tc + 0.9) for (let k = 0; k < 10; k++) {
        const a = hash(k, 31) * Math.PI, r = (p - tc) * 9;
        b.set(Math.round(cx + Math.cos(a) * r), Math.round(logY - 1 - Math.sin(a) * r * 0.5), r < 4 ? '*' : '.', th.warn);
      }
      // smoke wisps above the flames, two rises a loop each
      for (let k = 0; k < 3; k++) {
        const ph = (p * 0.2 + k / 3) % 1;
        const y = logY - 2 - maxH - ph * 4;
        const x = cx + Math.sin(ph * 5 + k * 2) * (2 + ph * 3) + 1;
        if (y > 1 && hash(k, Math.floor(p * 3)) < 0.75) b.set(Math.round(x), Math.round(y), '~', mix(th.muted, th.bg, 0.35 + ph * 0.5));
      }
      // firelight flicker on the ground
      for (let dx = -half - 5; dx <= half + 5; dx++) {
        if (hash(dx + 30, Math.floor(p * 6)) < 0.3 * (1 - Math.abs(dx) / (half + 6))) b.set(cx + dx, ground, '.', th.warn);
      }
    };
  },
};

// ── hot-air balloon ──────────────────────────────────────────────────────────
const ENV = [
  '   .--"--.   ',
  '  / ( | ) \\  ',
  ' |  ( | )  | ',
  ' |  ( | )  | ',
  '  \\ ( | ) /  ',
  "   `-.|.-'   ",
  '    \\ | /    ',
  '    [___]    ',
];
const ENV_S = [
  ' .-"-. ',
  '( ( ) )',
  ' \\( )/ ',
  "  `.'  ",
  '  \\|/  ',
  '  [_]  ',
];

const balloon = {
  ...shared,
  id: 'ascii-balloon',
  since: '0.3.0',
  title: 'Hot-Air Balloon',
  category: 'ASCII Art',
  tags: ['balloon', 'hot air', 'hills', 'drift', 'burner', 'pastoral'],
  order: 230,
  loop: 16,
  description: 'A gored balloon drifts over patchwork hills, sinking gently until the burner roars it back up; clouds slide past and a far balloon crosses behind.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const art = H < 16 ? ENV_S : ENV;
    const aw = art[0].length;
    const yFar = (x) => H - 6 - Math.sin(x * 0.045 + 1.2) * 1.6 - Math.sin(x * 0.11) * 0.9;
    const yNear = (x) => H - 3.2 - Math.sin(x * 0.06 + 4) * 1.5 - Math.sin(x * 0.15 + 1) * 0.8;
    const depth = clamp(Math.round(H * 0.2), 2, 5);     // how far it sinks before the burner fires
    // the envelope is opaque: each row of the art blanks its span before drawing
    const spans = art.map((row) => [row.search(/\S/), row.length - row.trimEnd().length]);
    return (t) => {
      const b = ctx.buffer;
      t = phase(t, 16);
      const sx = 3;
      b.text(sx, 1, '\\ /', th.warn); b.text(sx - 2, 2, '--(_)--', th.warn); b.text(sx, 3, '/ \\', th.warn);
      for (let c = 0; c < 3; c++) {                      // clouds, one crossing per loop
        const cx = Math.floor((c * 29 + t * ((W + 16) / 16)) % (W + 16)) - 8, cy = 1 + c * 2;
        b.text(cx + 1, cy, '.--.', th.dim); b.text(cx, cy + 1, '(___)', th.dim);
      }
      for (let k = 0; k < 3; k++) {                      // birds filling the mid sky, one crossing per loop each
        const span = W + 6 + 10 * k, x = Math.floor((k * 31 + t * span / 16) % span) - 3;
        b.set(x, 4 + k * Math.max(2, Math.floor(H / 6)), Math.floor(t * 4 + k) % 2 ? 'v' : 'V', th.muted);
      }
      for (let x = 0; x < W; x++) {                      // far hills
        const yf = Math.round(yFar(x));
        b.set(x, yf, '_', mix(th.pos, th.bg, 0.55));
        for (let y = yf + 1; y < H; y++) if (hash(x, y, 3) < 0.2) b.set(x, y, '.', mix(th.pos, th.bg, 0.68));
      }
      const dx2 = ((t * ((W + 10) / 16)) % (W + 10)) - 5; // distant balloon between the hill lines
      b.text(Math.floor(dx2), Math.max(4, Math.floor(H * 0.3)), ' _ ', th.muted);
      b.text(Math.floor(dx2), Math.max(5, Math.floor(H * 0.3) + 1), '( )', th.muted);
      b.text(Math.floor(dx2), Math.max(6, Math.floor(H * 0.3) + 2), ' u ', th.muted);
      for (let x = 0; x < W; x++) {                      // near hills: hedged crop bands
        const yn = Math.round(yNear(x));
        b.set(x, yn, '_', th.pos);
        for (let y = yn + 1; y < H; y++) {
          const bv = (x + (y - yn) * 2) / 9;
          const band = ((Math.floor(bv) % 3) + 3) % 3;
          const hedge = bv - Math.floor(bv) < 0.14;
          const ch = hedge ? ':' : band === 0 ? ',' : band === 1 ? (x % 2 ? '"' : ' ') : (x + y) % 2 ? '.' : ' ';
          if (ch !== ' ') b.set(x, y, ch, mix(th.pos, th.bg, hedge ? 0.2 : 0.3 + band * 0.14));
        }
      }
      const hx = Math.floor(W * 0.74);                   // farmhouse on the near hill
      const hy = Math.round(yNear(hx));
      b.text(hx, hy - 2, '/\\', th.muted); b.text(hx, hy - 1, '||', th.muted);
      const p8 = t % 8;                                  // sinks gently, the burner roars at the bottom, it climbs
      const sink = p8 < 5.4 ? ease(p8 / 5.4) : p8 < 6.4 ? 1 : 1 - ease((p8 - 6.4) / 1.6);
      const bx = Math.round(W * 0.5 + Math.sin(TAU * t / 16) * W * 0.12 - aw / 2);
      const by = 2 + Math.round(depth * sink);
      const shx = bx + Math.floor(aw / 2);               // its shadow on the field
      b.text(shx - 2, Math.min(H - 1, Math.round(yNear(shx)) + 1), '===', mix(th.pos, th.bg, 0.7));
      for (let r = 0; r < art.length; r++) for (let c = spans[r][0]; c >= 0 && c < aw - spans[r][1]; c++) b.set(bx + c, by + r, ' ');
      sprite(b, bx, by, art, (ch, c, r) => (r >= art.length - 2 ? th.muted : ch === '(' || ch === ')' ? th.accent : ch === '|' ? th.accent2 : th.ink));
      if (p8 > 5.4 && p8 < 6.4) {                        // the burner roars
        const fy = by + art.length - 2, fx = bx + Math.floor(aw / 2);
        b.set(fx, fy, hash(1, Math.floor(t * 10)) < 0.5 ? '*' : '^', th.warn);
        b.set(fx, fy - 1, "'", th.neg);
      }
    };
  },
};

// ── castle at night ──────────────────────────────────────────────────────────
const castle = {
  ...shared,
  id: 'ascii-castle',
  since: '0.3.0',
  title: 'Castle at Night',
  category: 'ASCII Art',
  tags: ['castle', 'torches', 'flag', 'moat', 'battlements', 'medieval'],
  order: 240,
  loop: 12,
  description: 'A keep and two towers over a moat: the pennant streams in the wind, gate torches gutter, arrow slits glow, bats flit across a crescent moon.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cx = Math.floor(W / 2);
    const baseY = H - 4;
    const keepW = W < 44 ? 9 : 11, tw = W < 44 ? 5 : 7;
    const wg = clamp(Math.round(W * 0.07), 3, 8);
    // Short screens: the keep stops 4 rows below the top so flagpole and flag stay on screen,
    // and towers and walls step down under it (at 80x24 these caps don't bind).
    const keepH = Math.min(Math.max(6, Math.round(H * 0.5)), baseY - 4);
    const towH = Math.min(Math.max(4, Math.round(H * 0.36)), keepH - 1);
    const wallH = Math.min(Math.max(3, Math.round(H * 0.2)), towH - 1);
    const keepL = cx - (keepW >> 1), keepR = keepL + keepW - 1;
    const towLx = keepL - wg - tw + 1, towRx = keepR + wg;
    const wall = (x0, w, hgt) => {                       // crenellated block
      const b = ctx.buffer;
      const top = baseY - hgt;
      for (let i = 0; i < w; i++) if (i % 2 === 0) b.set(x0 + i, top - 1, '_', th.ink);
      for (let i = 0; i < w; i++) b.set(x0 + i, top, i === 0 || i === w - 1 ? '|' : i % 2 ? '_' : '|', th.ink);
      for (let y = top + 1; y <= baseY; y++) {
        b.set(x0, y, '|', th.ink); b.set(x0 + w - 1, y, '|', th.ink);
        for (let i = 1; i < w - 1; i++) b.set(x0 + i, y, hash(x0 + i, y, 3) < 0.08 ? '.' : ' ', mix(th.muted, th.bg, 0.5));
      }
      return top;
    };
    return (t) => {
      const b = ctx.buffer;
      t = phase(t, 12); // flicker keys on loop time too, so the castle closes exactly
      stars(b, W, Math.max(3, H - 8), th, t);
      moon(b, Math.floor(W * 0.08), 1, th);
      for (let k = 0; k < 2; k++) {                      // bats
        const a = TAU * t / 6 + k * 2.6;
        const x = Math.round(cx + Math.cos(a) * (10 + k * 6)), y = Math.round(3 + Math.sin(a * 2) * 1.5 + k);
        b.set(x, y, Math.floor(t * 6 + k) % 2 ? 'v' : 'w', th.muted);
      }
      wall(keepL - wg, wg + 1, wallH); wall(keepR, wg + 1, wallH);       // curtain walls
      const lt = wall(towLx, tw, towH), rt = wall(towRx, tw, towH);      // towers
      const kt = wall(keepL, keepW, keepH);                              // the keep, in front
      for (const [x, y] of [[towLx + (tw >> 1), lt + 2], [towRx + (tw >> 1), rt + 2], [cx - 2, kt + 2], [cx + 2, kt + 2], [cx, kt + 4]]) {
        b.set(x, y, '!', hash(x, Math.floor(t / 1.5)) < 0.7 ? th.warn : th.dim);  // arrow slits
      }
      b.set(cx, kt - 2, '|', th.ink); b.set(cx, kt - 3, '|', th.ink);             // flagpole
      for (let i = 0; i < 5; i++) {
        const y = kt - 3 + Math.round(Math.sin(TAU * t / 2 - i * 0.9) * 0.8 * ((i + 1) / 5));
        b.set(cx + 1 + i, y, i === 4 ? '>' : '~', th.accent);
      }
      const gw = 4, gx = cx - (gw >> 1);                 // gate + portcullis
      b.text(gx, baseY - 3, ' __ ', th.muted);
      for (let y = baseY - 2; y <= baseY; y++) for (let i = 0; i < gw; i++) {
        b.set(gx + i, y, (i + y) % 2 ? '#' : '+', mix(th.muted, th.bg, 0.35));
      }
      for (const s of [-1, 1]) {                         // gate torches
        const x = cx + s * ((gw >> 1) + 2);
        b.set(x, baseY, '|', th.muted); b.set(x, baseY - 1, '|', th.muted);
        const f = hash(s + 2, Math.floor(t * 7));
        b.set(x, baseY - 2, f < 0.35 ? '(' : f < 0.7 ? ')' : '*', f < 0.5 ? th.warn : th.neg);
        if (hash(s + 5, Math.floor(t * 5)) < 0.4) b.set(x + s, baseY - 3, "'", th.warn);
      }
      for (let x = 0; x < W; x++) b.set(x, baseY + 1, '_', mix(th.pos, th.bg, 0.5));
      for (let y = baseY + 2; y < H; y++) for (let x = 0; x < W; x++) {           // the moat
        const v = Math.sin(x * 0.3 + hash(y, 61) * TAU + t * (TAU / 6) * (y % 2 ? 1 : -1));
        if (v > 0.35) b.set(x, y, v > 0.85 ? '~' : '-', mix(th.info, th.bg, 0.45 + (y - baseY) * 0.1));
      }
      for (const s of [-1, 1]) {                         // torchlight on the water
        const x = cx + s * ((gw >> 1) + 2);
        if (hash(s + 9, Math.floor(t * 4)) < 0.6) b.set(x, baseY + 2, '.', th.warn);
      }
      b.text(gx - 1, baseY + 2, '='.repeat(gw + 2), th.muted);                    // the bridge
    };
  },
};

// ── desert caravan ───────────────────────────────────────────────────────────
const CAMEL = [
  ' ,,    __    __  ',
  ' (.`,-"  `--"  `.',
  '  \\ ;          \\ \\',
];
const LEG_X = [5, 8, 12, 15];

/** A dune crest as one smooth curve: its height inside each cell picks the glyph (" - . _, top to bottom); sparse sand below. */
const CURVE = ['"', '-', '.', '_'];
function crest(b, W, yOf, yMax, line, sand, dens, seed) {
  for (let x = 0; x < W; x++) {
    const y = yOf(x), r = Math.floor(y);
    b.set(x, r, CURVE[Math.min(3, Math.floor((y - r) * 4))], line);
    for (let yy = r + 1; yy < yMax; yy++) if (hash(x, yy, seed) < dens) b.set(x, yy, hash(x, yy, seed + 1) < 0.5 ? '.' : ',', sand);
  }
}

const caravan = {
  ...shared,
  id: 'ascii-caravan',
  since: '0.3.0',
  title: 'Desert Caravan',
  category: 'ASCII Art',
  tags: ['desert', 'caravan', 'camels', 'dunes', 'heat', 'shimmer'],
  order: 260,
  loop: 18,
  minSize: { w: 44, h: 13 },
  description: 'Three roped camels sway across the dunes under a hard sun: heat shimmer bends the far ridge, footprints trail off and drift over, a vulture rides the thermal.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const gy = H - 7;                                    // camel top row
    const horizon = Math.max(2, Math.min(Math.floor(H * 0.45), gy - 2));
    const span = W + 76;
    const sand = mix(th.warn, th.bg, 0.45), sandDim = mix(th.warn, th.bg, th.mode === 'light' ? 0.5 : 0.62);
    return (t) => {
      const b = ctx.buffer;
      const p = phase(t, 18);
      const sx = Math.floor(W * 0.78);
      b.text(sx + 1, 1, ' __ ', th.warn); b.text(sx, 2, '(__)', th.warn);
      for (const [dx, dy, ch] of [[-2, 0, '-'], [6, 0, '-'], [2, -2, '|'], [-1, 2, '/'], [5, 2, '\\']]) b.set(sx + dx + 1, 2 + dy, ch, th.warn);
      // far ridge, bent by a travelling heat-shimmer wave
      crest(b, W, (x) => horizon - 1.2 * Math.sin(x * 0.05 + 2) - 0.7 * Math.sin(x * 0.12 + 0.7) + 0.35 * Math.sin(x * 0.35 - TAU * 9 * p / 18), horizon + 2, sandDim, sandDim, 0.05, 11);
      // a mid dune behind the caravan
      crest(b, W, (x) => gy - 2.2 + Math.sin(x * 0.08 + 1) * 1.2, gy, sandDim, sandDim, 0.08, 13);
      const vx = Math.round(W * 0.3 + Math.cos(TAU * p / 9) * 12);                // vulture
      b.set(vx, Math.round(2 + Math.sin(TAU * p / 9) * 1.2), Math.floor(p * 2) % 2 ? 'v' : '-', th.muted);
      const head = W + 10 - p * (span / 18);             // the caravan walks right to left
      for (let i = 0; i < 3; i++) {
        const x = Math.round(head + i * 20);
        sprite(b, x, gy, CAMEL, th.ink);
        const stride = Math.floor(p * 2.5 + i * 0.7) % 2;
        for (let l = 0; l < 4; l++) {
          const lx = x + LEG_X[l];
          b.set(lx, gy + 3, '|', th.ink);
          b.set(lx + (stride && l % 2 ? -1 : stride ? 1 : 0), gy + 4, stride ? (l % 2 ? '/' : '\\') : '|', th.ink);
        }
        if (i === 0) { b.set(x + 9, gy - 1, 'o', th.accent); b.set(x + 10, gy, '(', th.accent); }
        if (i < 2) { b.set(x + 17, gy + 1, '-', th.muted); b.set(x + 18, gy + 2, '.', th.muted); b.set(x + 19, gy + 1, '-', th.muted); }
      }
      for (let x = 0; x < W; x++) b.set(x, gy + 5, hash(x, 2) < 0.7 ? '_' : '.', sand);   // the track
      for (let j = 1; j < 14; j++) {                     // footprints, the oldest drifting over first in the last 2 s
        const fx = Math.round(head + 3 * 20 + j * 3), gone = 18 - 2 * (j / 13);
        if (fx <= 0 || fx >= W || p >= gone) continue;
        b.set(fx + (j % 2), gy + 5, gone - p < 0.4 ? '.' : j % 2 ? 'v' : 'w', mix(th.warn, th.bg, 0.5 + j * 0.03));
      }
      for (let y = gy + 6; y < H; y++) for (let x = 0; x < W; x++) {              // open sand
        if (hash(x, y, 9) < 0.12) b.set(x, y, hash(x, y, 5) < 0.5 ? '.' : ',', sandDim);
      }
    };
  },
};

// ── firefly forest ───────────────────────────────────────────────────────────
const fireflies = {
  ...shared,
  id: 'ascii-fireflies',
  since: '0.3.0',
  title: 'Firefly Forest',
  category: 'ASCII Art',
  tags: ['fireflies', 'forest', 'night', 'glow', 'trees', 'summer'],
  order: 270,
  loop: 14,
  description: 'A dark stand of trees full of fireflies: each one wanders on its own looping path and pulses . o * o . while moonlight falls through a gap in the canopy.',
  setup(ctx) {
    const { width: W, height: H, theme: th, noise } = ctx;
    const canopyY = Math.max(2, Math.floor(H * 0.2));
    const ground = H - 2;
    const trunks = [];
    for (let i = 0, n = Math.max(3, Math.floor(W / 14)); i < n; i++) {
      trunks.push({ x: Math.floor((0.06 + 0.9 * ((i + hash(i, 2) * 0.6) / n)) * W), w: hash(i, 3) < 0.45 ? 2 : 1 });
    }
    const owl = trunks.find((tr) => tr.w === 2);
    const flies = Math.max(14, Math.round(W * H / 50));
    const gapX = Math.floor(W * 0.6);
    return (t) => {
      const b = ctx.buffer;
      t = phase(t, 14);
      const ang = TAU * t / 14, ca = Math.cos(ang), sa = Math.sin(ang);  // noise sampled on a circle: paths close in 14 s
      for (let y = 0; y <= canopyY + 1; y++) for (let x = 0; x < W; x++) {   // canopy
        if (Math.abs(x - gapX) < 5 - y) continue;                            // moon gap
        const r = hash(x, y, 7);
        const tw = hash(x, y, Math.floor(t * 1.5));
        if (r < 0.78 - y * 0.15 && tw < 0.92) b.set(x, y, r < 0.14 ? '%' : r < 0.34 ? ';' : ':', mix(th.pos, th.bg, 0.5 + r * 0.3));
      }
      b.text(gapX - 1, 0, '(_)', th.ink);                                    // the moon in the gap
      for (let k = 0; k < 14; k++) {                                         // moonbeam motes
        const y = 1 + Math.floor(hash(k, 13) * (ground - 2));
        const x = gapX - 1 + Math.floor(hash(k, 17) * 4) - Math.floor(y / 5);
        if (hash(k, Math.floor(t * 2)) < 0.55) b.set(x, y, '.', mix(th.ink, th.bg, 0.6));
      }
      for (const tr of trunks) {                                             // trunks + roots
        for (let y = canopyY + 1; y <= ground; y++) {
          for (let i = 0; i < tr.w; i++) {
            const r = hash(tr.x + i, y, 5);
            b.set(tr.x + i, y, r < 0.12 ? ')' : r < 0.2 ? '(' : '|', mix(th.muted, th.bg, 0.35));
          }
        }
        b.set(tr.x - 1, ground, '/', mix(th.muted, th.bg, 0.35));
        b.set(tr.x + tr.w, ground, '\\', mix(th.muted, th.bg, 0.35));
      }
      if (owl) {                                                             // an owl in one hollow
        const blink = Math.floor(t + hash(owl.x, 4) * 7) % 7 === 0;
        b.text(owl.x, canopyY + 3, blink ? '--' : 'oo', th.warn);
      }
      for (let x = 0; x < W; x++) {                                          // undergrowth
        const r = hash(x, 21);
        b.set(x, ground + 1, r < 0.3 ? ',' : r < 0.4 ? 'v' : '.', mix(th.pos, th.bg, th.mode === 'light' ? 0.45 : 0.6));
        if (r > 0.92) b.set(x, ground, 'w', mix(th.pos, th.bg, 0.45));
      }
      b.text(Math.floor(W * 0.15), ground, '(______)', mix(th.muted, th.bg, 0.4));  // a fallen log
      for (let k = 0; k < flies; k++) {                                      // the fireflies
        const fx = hash(k, 51) * W, fy = canopyY + 2 + hash(k, 52) * (ground - canopyY - 3);
        const x = Math.round(fx + noise.noise3(k * 3.1, 0.49 * ca, 0.49 * sa) * 9);
        const y = Math.round(fy + noise.noise3(k * 3.1 + 40, 0.4 * ca, 0.4 * sa) * 3);
        const P = 14 / (5 + Math.floor(hash(k, 53) * 4));  // 5–8 blinks per loop
        const bp = ((t + hash(k, 54) * P * 3) % P) / P;
        if (bp > 0.45 || y <= canopyY || y >= ground + 1) continue;
        const s = bp / 0.45;
        const ch = s < 0.25 || s > 0.75 ? '.' : s < 0.45 || s > 0.55 ? 'o' : '*';
        b.set(x, y, ch, ch === '*' ? th.warn : mix(th.warn, th.bg, 0.3));
        if (ch === '*') { b.set(x - 1, y, '.', mix(th.warn, th.bg, 0.55)); b.set(x + 1, y, '.', mix(th.warn, th.bg, 0.55)); }
      }
    };
  },
};

export default [campfire, balloon, castle, caravan, fireflies];
