// Pure ASCII — the waterline. Four living water pictures: a porpoising dolphin
// pod, a lighthouse sweeping the swell, a waterfall with mist and ripples, and a
// whale that breaches once a cycle at sunset (the storm-tossed ship is storm.js).
// Every glyph is 7-bit ASCII and each scene still reads in mono.
import { sprite, mirror, hash } from './_ascii.js';
import { mix } from '../../color.js';
import { clamp } from '../../easing.js';

const shared = { gallery: 'ascii', glyphs: 'ascii', color: '16', kind: 'art', size: { w: 80, h: 24 }, minSize: { w: 36, h: 12 } };
const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;

/** Twinkling stars over the top `rows` rows. */
function stars(b, W, rows, th, tau, seed = 0) {
  for (let k = 0; k < W * 0.42; k++) {
    const x = Math.floor(hash(k, 11 + seed) * W), y = Math.floor(hash(k, 23 + seed) * rows);
    if (hash(k, 5 + seed, Math.floor(tau * 2)) < 0.8) b.set(x, y, hash(k, 7) < 0.18 ? '*' : '.', th.dim);
  }
}

/** Gulls flapping v/V, each crossing once per loop over its own span (distinct speeds, so the loop closes); `soar` circles them instead. */
function gulls(b, W, y0, n, th, tau, loop, soar = false) {
  for (let k = 0; k < n; k++) {
    let x, y = y0 + ((k * 2) % 3);
    if (soar) {
      const a = TAU * tau / loop + k * 2.3;
      x = Math.round(W * (0.55 + 0.3 * hash(k, 31)) + Math.cos(a) * W * 0.12);
      y += Math.round(Math.sin(a) * 1.2);
    } else {
      const span = W + 8 + 12 * k;
      x = Math.floor((k * 29 + tau * span / loop) % span) - 4;
      y += Math.round(Math.sin(TAU * (2 + k) * tau / loop + k * 2.1) * 0.7);
    }
    b.set(x, y, Math.floor(tau * 4 + k) % 2 ? 'v' : 'V', th.muted);
  }
}

/** Puffy clouds, each crossing once per loop over its own span. */
function clouds(b, W, n, th, tau, loop, y0 = 1) {
  for (let c = 0; c < n; c++) {
    const span = W + 14 + 20 * c;
    const cx = Math.floor((c * 41 + tau * span / loop) % span) - 7, cy = y0 + c * 2;
    b.text(cx + 1, cy, '.--.', th.dim); b.text(cx, cy + 1, '(___)', th.dim);
  }
}

/** A sprite drawn as a solid silhouette: each row's span (first to last glyph) is blanked first. */
function solid(b, x, y, lines, color) {
  for (let r = 0; r < lines.length; r++) {
    const a = lines[r].search(/\S/), e = lines[r].trimEnd().length;
    for (let c = Math.max(0, a); a >= 0 && c < e; c++) b.set(x + c, y + r, ' ');
  }
  sprite(b, x, y, lines, color);
}

/** Open water: a surface row, then rows of travelling wavelets that fade out. */
function sea(b, W, H, surf, th, tau, loop = 12) {
  for (let y = surf; y < H; y++) {
    const depth = (y - surf) / Math.max(1, H - surf);
    const col = mix(th.info, th.bg, Math.min(0.78, 0.12 + depth * 0.85));
    const n = 1 + Math.floor(hash(y, 67) * 3);          // row speed, whole cycles per loop
    const ph = hash(y, 61) * TAU, fr = 0.12 + hash(y, 5) * 0.1;
    for (let x = 0; x < W; x++) {
      let ch = ' ';
      if (y === surf) {
        const v = Math.sin(x * 0.17 + ph + tau * (TAU * 2 / loop)) + Math.sin(x * 0.06 - tau * (TAU / loop));
        ch = v > 1 ? '~' : '-';
      } else {
        const v = Math.sin(x * fr + ph - tau * (TAU * n / loop));
        if (v > 0.86 - depth * 0.2 && hash(x, y, 41) < 0.55) ch = '~';
        else if (hash(x, y, 19) < 0.02) ch = '.';
      }
      if (ch !== ' ') b.set(x, y, ch, col);
    }
  }
}

// ── dolphin pod ──────────────────────────────────────────────────────────────
// Facing right (the pod swims left to right): flukes ><, dorsal fin ^, eye and beak o>.
const D_RISE = ['      ,o>', "   ,-'^  ", "><'      "];
const D_APEX = ['   ,-^-.  ', "><'     `o>", "   `---'  "];
const D_DIVE = ['><.       ', '   `-.^   ', '      `-.o>'];

const dolphins = {
  ...shared,
  id: 'ascii-dolphins',
  since: '0.3.0',
  title: 'Dolphin Pod',
  category: 'ASCII Animations',
  tags: ['dolphins', 'sea', 'leap', 'pod', 'porpoise', 'waves'],
  order: 200,
  loop: 12,
  minSize: { w: 36, h: 10 },
  description: 'A pod of dolphins porpoises across a breezy swell in a staggered rhythm: each one arcs up, levels out and dives with spray at entry, fins cutting wakes in between.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const surf = Math.max(3, Math.floor(H * 0.45));
    const span = W + 12, spd = span / 12;              // one crossing per loop
    const P = 4, AIR = 0.52;                           // leap cycle, airborne share
    const jumpH = clamp(Math.round(H * 0.25), 2, Math.max(2, surf - 2));
    // Four dolphins, neighbours half a leap apart: any two adjacent ones are always airborne between
    // them, and two are always fully on screen, so a leap is in the air at every moment, at any width.
    const pod = 4;
    const at = (k, tt) => {                           // dolphin k at time tt
      const ph = (((tt / P + k * 0.5) % 1) + 1) % 1, air = ph < AIR, s = ph / AIR;
      return { x: ((k * (span / pod) + tt * spd) % span) - 6, y: air ? surf - Math.sin(Math.PI * s) * jumpH : surf + 2, ph, s, air };
    };
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 12);
      clouds(b, W, 2, th, tau, 12);
      gulls(b, W, 2, 3, th, tau, 12);
      sea(b, W, H, surf, th, tau, 12);
      for (let k = 0; k < pod; k++) {
        const now = at(k, tau);
        if (now.air) {
          const pose = now.s < 0.36 ? D_RISE : now.s < 0.64 ? D_APEX : D_DIVE;
          const X = Math.round(now.x) - (pose[1].length >> 1), Y = Math.round(now.y) - 1;
          for (let r = 0; r < pose.length; r++) if (Y + r < surf) sprite(b, X, Y + r, [pose[r]], th.ink);
          if (now.s < 0.2 || now.s > 0.8) {             // spray at exit and entry
            const e = at(k, now.s < 0.5 ? tau - now.ph * P : tau + (AIR - now.ph) * P);
            const Xs = Math.round(e.x);
            b.set(Xs - 1, surf, "'", th.info); b.set(Xs + 1, surf, "'", th.info); b.set(Xs, surf - 1, 'o', th.info);
          }
        } else if (now.ph < 0.78) {                    // fin cruising the surface
          b.set(Math.round(now.x), surf, '^', th.ink);
          b.text(Math.round(now.x) - 3, surf, '~~', mix(th.info, th.ink, 0.4));
        }
      }
    };
  },
};

// ── lighthouse ───────────────────────────────────────────────────────────────
const LAMP = ['  _  ', ' /_\\ ', '|(@)|', '|___|'];

const lighthouse = {
  ...shared,
  id: 'ascii-lighthouse',
  since: '0.3.0',
  title: 'Lighthouse Watch',
  category: 'ASCII Art',
  tags: ['lighthouse', 'beam', 'night', 'coast', 'rocks', 'surf', 'buoy'],
  order: 200,
  loop: 12,
  description: 'Night watch on the point: a striped lighthouse sweeps its beam down the swell and back while surf bursts on the rocks and a bell buoy blinks.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const lx = Math.max(7, Math.floor(W * 0.16));
    // On short screens the sea line drops so lamp house (4 rows) + a 2-row tower fit below row 1.
    const seaY = Math.max(Math.floor(H * 0.58), Math.min(H - 3, 8));
    const baseY = seaY - 1;
    const towerH = clamp(baseY - 5, 2, Math.max(2, Math.round(H * 0.33))); // lampY = baseY − towerH − 4 ≥ 1
    const lampY = baseY - towerH - 4;
    const surfAt = (x, tt) => seaY + Math.sin(x * 0.13 - tt * (TAU / 6)) * 0.9 + Math.sin(x * 0.31 + tt * (TAU / 4)) * 0.5;
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 12);
      stars(b, W, Math.max(2, lampY - 1), th, tau);
      const mx = Math.floor(W * 0.8);
      b.text(mx, 1, ' _.._', th.ink); b.text(mx, 2, '( (  `', th.ink); b.text(mx, 3, " `-.'", th.ink);
      for (let x = 0; x < W; x++) {                     // open sea
        const sr = Math.round(surfAt(x, tau));
        for (let y = Math.max(0, sr); y < H; y++) {
          const depth = (y - seaY) / Math.max(1, H - seaY);
          let ch = ' ';
          if (y === sr) ch = hash(x, 3, Math.floor(tau * 2)) < 0.5 ? '~' : '-';
          else {
            const v = Math.sin(x * (0.12 + hash(y, 5) * 0.1) + hash(y, 61) * TAU - tau * (TAU * (1 + Math.floor(hash(y, 67) * 3)) / 12));
            if (v > 0.88 - depth * 0.2 && hash(x, y, 41) < 0.5) ch = '~';
            else if (hash(x, y, 19) < 0.02) ch = '.';
          }
          if (ch !== ' ') b.set(x, y, ch, mix(th.info, th.bg, clamp(0.25 + depth * 0.6, 0, 0.8)));
        }
      }
      const sweep = 0.5 - 0.5 * Math.cos(TAU * tau / 6);  // two sweeps a loop
      const slope = -0.26 + 0.6 * sweep;
      const ox = lx + 2, oy = lampY + 2;
      for (let d = 3; ox + d < W; d++) {                // the beam itself
        const yC = oy + slope * d, half = 0.7 + d * 0.15;
        if (yC > surfAt(ox + d, tau) + 1) {             // beam meets the water
          for (let g = 0; g < 10; g++) {
            const gx = ox + d - 3 + Math.floor(hash(g, 41) * 12);
            if (hash(g, 3, Math.floor(tau * 7)) < 0.7) b.set(gx, Math.round(surfAt(gx, tau)), '=', th.warn);
          }
          break;
        }
        for (let o = -Math.ceil(half); o <= Math.ceil(half); o++) {
          const yy = Math.round(yC) + o;
          if (yy <= 0 || yy >= surfAt(ox + d, tau)) continue;
          const a = Math.abs(o) / (half + 0.001);
          // the far fade stops at 80% toward the sky, so the beam survives 256 and 16 colors on both themes
          b.set(ox + d, yy, a < 0.35 ? '=' : a < 0.75 ? '-' : '.', mix(th.warn, th.bg, Math.min(0.8, d / (W * 0.75) + a * 0.45)));
        }
      }
      for (let y = baseY; y < H; y++) {                 // the rocky point
        const edge = lx + 4 + Math.round((y - baseY) * 1.1 + Math.sin(y * 2.1) * 0.8);
        for (let x = 0; x <= Math.min(W - 1, edge); x++) {
          const r = hash(x, y, 31);
          b.set(x, y, r < 0.07 ? '#' : r < 0.45 ? ':' : '.', mix(th.muted, th.bg, r < 0.45 ? 0.4 : 0.6));
        }
      }
      for (let r = 0; r < towerH; r++) {                // tower, striped
        const y = baseY - 1 - r;
        const hw = Math.round(1.6 + ((towerH - r) / towerH) * 1.4);
        const band = Math.floor((r + 1) / 2) % 2 === 0;
        for (let x = lx - hw + 1; x < lx + hw; x++) b.set(x, y, band ? '=' : ' ', band ? th.neg : th.ink);
        b.set(lx - hw, y, '|', th.ink); b.set(lx + hw, y, '|', th.ink);
      }
      sprite(b, lx - 2, lampY, LAMP, (ch) => (ch === '@' ? th.warn : th.ink));
      if (Math.floor(tau * 2) % 2) { b.set(lx - 3, lampY + 2, '-', th.warn); b.set(lx + 3, lampY + 2, '-', th.warn); }
      const pb = (tau % 3) / 3, burst = Math.floor(tau / 3);  // surf burst on the rocks
      if (pb < 0.33) {
        const env = Math.sin((pb / 0.33) * Math.PI);
        const bx = lx + 5 + Math.round((seaY - baseY) * 1.1);
        for (let k = 0; k < 9; k++) {
          if (hash(k, burst) > env) continue;
          const x = bx - 1 + Math.floor(hash(k, 9, burst) * 7);
          const y = seaY - 1 - Math.floor(hash(k, 13, burst) * 3 * env);
          b.set(x, y, k % 3 === 0 ? '*' : k % 3 === 1 ? "'" : 'o', th.ink);
        }
      }
      const bx = Math.floor(W * 0.82), by = Math.round(surfAt(bx, tau)) - 1;  // bell buoy
      b.text(bx - 1, by, '(o)', th.muted);
      b.set(bx, by - 1, Math.floor(tau * 1.5) % 2 ? '!' : '.', th.neg);
    };
  },
};

// ── waterfall ────────────────────────────────────────────────────────────────
const PINE = ['  ^  ', ' /^\\ ', '/_|_\\', '  |  '];
const ROCKS = [' __  _ ', '(__)(_)'];

/** A mountain range: triangular peaks (slope one row per column, so it draws as clean / and \), sparse scree below, hiding what lies behind. */
function ridge(b, x0, x1, base, peaks, yMax, line, scree, dens, seed) {
  const top = (x) => base - Math.max(0, ...peaks.map(([c, h]) => h - Math.abs(x - c)));
  for (let x = x0; x < x1; x++) {
    const r = top(x), l = top(x - 1);
    if (r >= yMax) continue;
    for (let yy = Math.max(0, r); yy < yMax; yy++) b.set(x, yy, hash(x, yy, seed) < (yy - r < 3 ? dens * 2.5 : dens) ? (hash(x, yy, seed + 1) < 0.5 ? '.' : ':') : ' ', scree);
    if (r < l) b.set(x, r, '/', line);
    else if (r > l) b.set(x, r - 1, '\\', line);
    else b.set(x, r - 1, '_', line);
  }
}

const waterfall = {
  ...shared,
  id: 'ascii-waterfall',
  since: '0.3.0',
  title: 'Waterfall Pool',
  category: 'ASCII Art',
  tags: ['waterfall', 'river', 'pool', 'mist', 'ripples', 'cliff'],
  order: 220,
  loop: 8,
  description: 'A river slides off a rock shelf into a churning pool under far ridges: streaked falling water, rising mist, ripples spreading out and a fish jumping the spray.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const lipX = Math.max(8, Math.floor(W * 0.36));
    const topY = Math.max(2, Math.floor(H * 0.26));
    const poolY = H - 3;
    const fw = clamp(Math.round(W * 0.07), 4, 7), ix = lipX + (fw >> 1); // fall width, impact centre
    const rx0 = lipX + fw + 3, rw = W - rx0;            // the ranges start past the spray
    const room = Math.max(2, poolY - 2 - topY), k = room / 13;
    const farBase = topY + Math.round(room * 0.62), nearBase = topY + Math.round(room * 0.86);
    const farPeaks = [[0.18, 4], [0.52, 6], [0.86, 4]].map(([c, h]) => [rx0 + Math.round(rw * c), Math.max(1, Math.round(h * k * 1.6))]);
    const nearPeaks = [[0.36, 3], [0.72, 2]].map(([c, h]) => [rx0 + Math.round(rw * c), Math.max(1, Math.round(h * k * 1.6))]);
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 8);
      ridge(b, rx0, W, farBase, farPeaks, poolY - 1, mix(th.muted, th.bg, 0.4), mix(th.muted, th.bg, 0.62), 0.08, 3);
      ridge(b, rx0, W, nearBase, nearPeaks, poolY - 1, th.muted, mix(th.muted, th.bg, 0.45), 0.1, 7);
      gulls(b, W, 1, 2, th, tau, 8, true);              // soaring: a crossing per 8 s loop would be a dash
      if (W >= 40 && poolY - 4 > topY + 2) {            // pines and rocks framing the pool's far bank
        for (const px of [W - 15, W - 8]) sprite(b, px, poolY - 4, PINE, (ch, c, r) => (r < 3 ? th.pos : th.muted));
        sprite(b, W - 22, poolY - 2, ROCKS, mix(th.muted, th.bg, 0.2));
      }
      for (let y = topY + 1; y < poolY; y++) {          // cliff face, sparse texture
        for (let x = 0; x < lipX - 1; x++) {
          const r = hash(x, y, 13);
          if (r < 0.06) b.set(x, y, '%', mix(th.muted, th.bg, 0.35));
          else if (r < 0.16) b.set(x, y, ':', mix(th.muted, th.bg, 0.55));
        }
        b.set(lipX - 1, y, '|', th.muted);
        if ((y - topY) % 4 === 0) for (let x = lipX - 5; x < lipX - 1; x++) b.set(x, y, '_', th.muted);
      }
      for (let x = 0, r; x < lipX - 2; x++) if ((r = hash(x, 5)) < 0.3) b.set(x, topY - 1, r < 0.1 ? 'v' : ',', mix(th.pos, th.bg, 0.4)); // plateau bank
      for (let x = 0; x <= lipX + fw - 1; x++) b.set(x, topY, (x + Math.floor(tau * 8)) % 4 === 0 ? '-' : '~', th.info);
      if (topY >= 6) sprite(b, Math.max(1, Math.floor(lipX * 0.25)), topY - 5, PINE, (ch, c, r) => (r < 3 ? th.pos : th.muted));
      const mid = (topY + poolY) / 2;
      for (let f = 0; f < fw; f++) {                    // the fall: streak speeds of 12.5 / 15 rows/s close in 8 s
        const x = lipX + f;
        for (let y = topY + 1; y < poolY; y++) {
          const k = ((Math.floor(y - tau * (12.5 + (f % 2) * 2.5) + f * 1.7) % 5) + 5) % 5;
          b.set(x, y, '|!:|.'[k], mix(th.info, th.ink, f === 0 || f === fw - 1 ? 0.15 : 0.4));
          if (y > mid && hash(y, f, Math.floor(tau * 10)) < 0.2) b.set(lipX + fw + 1, y, "'", mix(th.info, th.bg, 0.45));
        }
      }
      for (let x = Math.max(0, lipX - 1); x < W; x++) { // pool surface
        const churn = x >= lipX - 1 && x <= lipX + fw + 3;
        const r = hash(x, Math.floor(tau * 9), 7);
        const ch = churn ? (r < 0.3 ? 'O' : r < 0.6 ? 'o' : '*') : (x - Math.floor(tau * 6)) % 3 ? '~' : '-';
        b.set(x, poolY, ch, churn ? th.ink : th.info);
      }
      for (let k = 0; k < 3; k++) {                     // ripples spreading right
        const r = (tau * 6 + k * 8) % 24;
        b.set(ix + 2 + Math.round(r), poolY, ')', mix(th.info, th.bg, r / 28));
        if (r > 4) b.set(ix + 2 + Math.round(r * 0.7), poolY + 1, ')', mix(th.info, th.bg, 0.3 + r / 30));
      }
      for (let y = poolY + 1; y < H; y++) for (let x = 0; x < W; x++) if (hash(x, y, 43) < 0.12) b.set(x, y, '~', mix(th.info, th.bg, 0.6)); // under the surface
      for (let k = 0; k < 9; k++) {                     // mist over the impact: four rises per loop
        const ph = (tau * 0.5 + hash(k, 8)) % 1;
        const x = Math.round(ix + (hash(k, 5) - 0.5) * 3 + ph * (k % 2 ? 4 : -3) + Math.sin(ph * 6 + k));
        const y = Math.round(poolY - 1 - ph * 4.5);
        if (y > topY) b.set(x, y, ph < 0.35 ? 'o' : ph < 0.7 ? '.' : "'", mix(th.ink, th.bg, 0.25 + 0.6 * ph));
      }
      if (tau > 5.4 && tau < 6.2) {                     // a fish jumps the spray
        const s = (tau - 5.4) / 0.8;
        b.text(Math.round(ix + 16 - s * 8), Math.round(poolY - Math.sin(Math.PI * s) * 3.2), '<><', th.warn);
      }
    };
  },
};

// ── whale breach ─────────────────────────────────────────────────────────────
const WBACK = [
  '    __..--""--..__    ', " .-'    o         `-. ",
];
const WFLUKE = [
  ' __     __ ', ' \\ \\   / / ', '  \\ \\_/ /  ',
  '   \\   /   ', '    \\_/    ',
];
const WBREACH = [
  '   ___       ', " /`o  \\      ", '<      \\     ', ' \\   )  \\    ',
  "  `./    \\   ", '      \\   \\_ ', '       \\_/\\_\\',
];

const whale = {
  ...shared,
  id: 'ascii-whale',
  since: '0.3.0',
  title: 'Whale Breach',
  category: 'ASCII Art',
  tags: ['whale', 'breach', 'spout', 'ocean', 'splash', 'fluke', 'sunset'],
  order: 250,
  loop: 15,
  minSize: { w: 40, h: 12 },
  description: 'At sunset a whale works through its cycle: glide and spout, fluke-up dive, then one full breach with a crashing splash and rings that fade to calm.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const surf = Math.max(4, Math.floor(H * 0.48));
    const bx = Math.floor(W * 0.46);
    const fall = mirror(WBREACH);
    const clipped = (lines, yTop) => lines.slice(0, Math.max(0, surf + 1 - yTop));
    // Sunset: a half sun resting on the horizon, its glitter road on the water, long cloud streaks.
    const sunX = Math.floor(W * 0.8), sunR = clamp(Math.round(H * 0.16), 2, 4);
    const sunC = mix(th.warn, th.neg, 0.3), haze = mix(th.warn, th.bg, 0.5);
    const streaks = [[0.08, 2, 0.3], [0.42, 1, 0.22], [0.58, 3, 0.18]].filter(([, y]) => y < surf - sunR - 1);
    return (t) => {
      const b = ctx.buffer;
      const p = phase(t, 15);
      for (const [k, [fx, y, len]] of streaks.entries()) {   // cloud streaks drifting on the evening breeze
        const x0 = Math.round(W * fx + Math.sin(TAU * p / 15 + k * 2) * 3), n = Math.round(W * len);
        for (let i = 0; i < n; i++) if (hash(i, y, 5) < 0.8) b.set(x0 + i, y, i % 7 === 6 ? ' ' : '~', i < 2 || i > n - 3 ? th.dim : haze);
      }
      gulls(b, W, 2, 2, th, p, 15);
      sea(b, W, H, surf, th, p, 15);
      for (let dy = 1; dy <= sunR; dy++) {                     // the sun, half under the horizon
        const hw = Math.round(Math.sqrt(Math.max(0, sunR * sunR - (dy - 0.5) ** 2)) * 2);
        for (let x = sunX - hw; x <= sunX + hw; x++) {
          const edge = Math.abs(x - sunX) >= hw - 0.5;
          b.set(x, surf - dy, edge ? (x < sunX ? '(' : ')') : dy === sunR ? '-' : ':', mix(sunC, th.warn, (dy - 1) / sunR));
        }
      }
      for (let y = surf + 1; y < H; y++) {                     // its glitter road on the swell
        const w = Math.max(1, Math.round(sunR * 2 * (1 - 0.7 * (y - surf) / Math.max(1, H - surf))));
        for (let x = sunX - w; x <= sunX + w; x++) {
          if (hash(x, y, Math.floor(p * 4)) < 0.45) b.set(x, y, Math.abs(x - sunX) < w * 0.5 ? '=' : '-', mix(th.warn, th.bg, Math.min(0.75, 0.15 + (y - surf) / (H - surf) * 0.6)));
        }
      }
      if (p >= 0.5 && p < 4) {                          // glide: the back slides by
        const wx = Math.round(W * 0.6 - p * 1.4);
        solid(b, wx, surf - 2, WBACK, th.ink); // a silhouette against the sun, not see-through
        if (p > 1.3 && p < 2.9) {                       // spout
          const env = Math.sin(((p - 1.3) / 1.6) * Math.PI), hgt = Math.round(env * 4);
          const spx = wx + 8;
          for (let i = 0; i < hgt; i++) b.set(spx + (i > 2 ? (i % 2 ? -1 : 1) : 0), surf - 3 - i, i === 0 ? '|' : '!', mix(th.ink, th.bg, 0.25));
          if (hgt > 2) { b.set(spx - 1, surf - 3 - hgt, "'", th.muted); b.set(spx + 1, surf - 3 - hgt, "'", th.muted); }
        }
      }
      if (p >= 4.2 && p < 6.2) {                        // fluke-up dive
        const reveal = Math.sin(((p - 4.2) / 2) * Math.PI);
        const rows = Math.round(reveal * WFLUKE.length);
        if (rows > 0) sprite(b, Math.round(W * 0.53), surf - rows, WFLUKE.slice(0, rows), th.ink);
      }
      if (p >= 7.2 && p < 9.6) {                        // the breach
        const rise = WBREACH.length - 1;
        let yTop, art;
        if (p < 8.6) { const e = (p - 7.2) / 1.4; yTop = Math.round(surf - (1 - (1 - e) ** 3) * rise); art = WBREACH; }
        else { const e = (p - 8.6) / 1.0; yTop = Math.round(surf - rise + e * e * (rise + 2)); art = fall; }
        solid(b, bx - 6, yTop, clipped(art, yTop), th.ink);
        for (let dx = -5; dx <= 5; dx++) {              // churned water at the base
          const r = hash(dx + 20, Math.floor(p * 8));
          if (r < 0.5) b.set(bx + dx, surf, r < 0.2 ? '*' : 'o', th.ink);
        }
      }
      const e = p - 9.4;                                // splash columns + foam ring
      if (e > 0 && e < 1.7) {
        const env = e < 0.45 ? Math.sin((e / 0.45) * Math.PI / 2) : Math.max(0, 1 - (e - 0.45) / 1.2);
        for (let dx = -7; dx <= 7; dx++) {
          const h = env * 5 * (1 - Math.abs(dx) / 8) * (0.7 + hash(dx + 9, 3) * 0.6);
          for (let i = 0; i < h; i++) b.set(bx + dx, surf - 1 - i, i > h - 1.5 ? "'" : i === 0 ? '*' : '!', i === 0 ? th.ink : mix(th.info, th.ink, 0.5));
        }
        const r = Math.round(e * 8);
        b.set(bx - r - 3, surf, 'o', th.ink); b.set(bx + r + 3, surf, 'o', th.ink);
      }
      if (p >= 11 && p < 14.5) {                        // rings fading to calm
        const r = (p - 11) * 4;
        b.set(bx - Math.round(r), surf, '(', mix(th.ink, th.bg, r / 16));
        b.set(bx + Math.round(r), surf, ')', mix(th.ink, th.bg, r / 16));
      }
    };
  },
};

export default [dolphins, lighthouse, waterfall, whale];
