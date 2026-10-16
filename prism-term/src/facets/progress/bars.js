// Progress bars — the shapes a bar can take, each driven by a seeded transfer
// so fills move like real work (bursts, stalls, tail-off) and finish together
// with their percentages.
import { progressBar, meter } from '../../widgets/index.js';
import { Canvas } from '../../canvas.js';
import { mix, gradient, NONE } from '../../color.js';
import { ATTR } from '../../buffer.js';
import { truncate } from '../../width.js';
import { phase, transfer, glyphs, clamp01, clock } from './_sim.js';
import { light, lift } from '../charts/_data.js';

const C = 'Progress Bars';
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

/** Rows that fit: drop rows from the bottom when the tile is short. */
const rowsFor = (H, n, gap = 1) => {
  const per = 1 + gap;
  const fit = Math.max(1, Math.floor((H + gap) / per));
  return { count: Math.min(n, fit), step: Math.min(n, fit) * per - gap <= H ? per : 1 };
};

const pctText = (f) => `${String(Math.floor(clamp01(f) * 100)).padStart(3)}%`;

export default [
  {
    id: 'progress-smooth', title: 'Smooth Eighths', category: C, order: 10, kind: 'progress',
    description: 'Eighth-block bars that move in 1/8-cell steps, so even a 20-column bar creeps forward smoothly. Three jobs at different speeds.',
    tags: ['eighth blocks', 'smooth', 'multi'], size: { w: 60, h: 5 }, minSize: { w: 24, h: 1 }, loop: 9, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const jobs = [
        { label: 'assets', c: th.accent, sim: transfer(ctx.rng, { total: 1, seconds: 5.2 }) },
        { label: 'chunks', c: th.pos, sim: transfer(ctx.rng, { total: 1, seconds: 6.6 }) },
        { label: 'sourcemaps', c: th.info, sim: transfer(ctx.rng, { total: 1, seconds: 7.0 }) },
      ];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 9, 1);
        const { count, step } = rowsFor(ctx.height, jobs.length, 1);
        const lw = W >= 40 ? 11 : 0;
        jobs.slice(0, count).forEach((j, r) => {
          const y = r * step, s = j.sim.at(local);
          if (lw) b.text(1, y, j.label, th.muted);
          const done = s.finished;
          progressBar(b, 1 + lw, y, W - 2 - lw - 5, s.frac, { theme: th, color: j.c, ascii: !g.unicode });
          b.text(W - 5, y, done ? ` ${g.ok}`.padStart(4) : pctText(s.frac), done ? th.pos : th.ink);
        });
      };
    },
  },
  {
    id: 'progress-braille', title: 'Braille Bars', category: C, order: 20, kind: 'progress',
    description: 'Hairline progress drawn in braille dots at twice the horizontal resolution — a thin rule, a dotted track and a glowing head.',
    tags: ['braille', 'thin', 'hairline'], size: { w: 60, h: 5 }, minSize: { w: 20, h: 1 }, loop: 8, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const sims = [0, 1, 2].map((i) => transfer(ctx.rng, { total: 1, seconds: 5.2 + i * 0.6 }));
      const grad = gradient([th.info, th.accent, th.crit]);
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, 3, 1);
        const bw = Math.max(4, W - 8);
        for (let r = 0; r < count; r++) {
          const y = r * step, f = sims[r].at(local).frac;
          if (!g.unicode) { progressBar(b, 1, y, bw, f, { theme: th, ascii: true }); b.text(W - 5, y, pctText(f), th.ink); continue; }
          const cv = new Canvas(bw, 1, { mode: 'braille', threshold: 0 });
          const fill = Math.round(f * cv.width);
          for (let x = 0; x < cv.width; x++) {
            const lit = x < fill;
            const c = lit ? grad(x / cv.width) : th.line;
            if (r === 0) { if (lit) { cv.set(x, 1, c); cv.set(x, 2, c); } else cv.set(x, 2, c); }
            else if (r === 1) { if (lit) { cv.set(x, 1, c); cv.set(x, 2, c); } else if (x % 2 === 0) cv.set(x, 1.5, th.dim); }
            else if (lit) { cv.set(x, 1, c); cv.set(x, 2, c); if (fill - x <= 2) { cv.set(x, 0, light(th)); cv.set(x, 3, light(th)); } }
            else cv.set(x, 3, th.line);
          }
          cv.paint(b, 1, y);
          b.text(W - 5, y, pctText(f), th.ink);
        }
      };
    },
  },
  {
    id: 'progress-gradient', title: 'Gradient Shimmer', category: C, order: 30, kind: 'progress',
    description: 'Solid gradient fills — prism, aurora, fire and ocean — with a highlight sweeping along the finished part.',
    tags: ['gradient', 'truecolor', 'shimmer'], size: { w: 60, h: 7 }, minSize: { w: 20, h: 1 }, loop: 8, color: 'truecolor',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const bars = ['prism', 'aurora', 'fire', 'ocean'].map((p, i) => ({ name: p, pal: ctx.palette(p), sim: transfer(ctx.rng, { total: 1, seconds: 5 + i * 0.45 }) }));
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, bars.length, 1);
        const lw = W >= 40 ? 8 : 0;
        const bw = Math.max(4, W - 2 - lw - 5);
        bars.slice(0, count).forEach((bar, r) => {
          const y = r * step, f = bar.sim.at(local).frac;
          if (lw) b.text(1, y, bar.name, th.muted);
          if (!g.unicode) { progressBar(b, 1 + lw, y, bw, f, { theme: th, ascii: true }); }
          else {
            const e = Math.round(f * bw * 8), full = e >> 3, rem = e & 7;
            const sweep = ((t * 0.55 + r * 0.17) % 1.4) - 0.2;
            for (let i = 0; i < bw; i++) {
              const u = i / Math.max(1, bw - 1);
              const pal = bar.name === 'prism' ? bar.pal(u * 0.85) : bar.pal(0.35 + 0.6 * u);
              const glow = Math.max(0, 1 - Math.abs(u - sweep * f) * 9) * 0.55;
              const c = lift(th, pal, glow);
              if (i < full) b.set(1 + lw + i, y, ' ', c, c);
              else if (i === full && rem) b.set(1 + lw + i, y, EIGHTHS[rem], c, th.panel2);
              else b.set(1 + lw + i, y, ' ', th.dim, th.panel2);
            }
          }
          b.text(W - 5, y, pctText(f), th.ink);
        });
      };
    },
  },
  {
    id: 'progress-segmented', title: 'Segmented LEDs', category: C, order: 40, kind: 'progress',
    description: 'Discrete segment bars — parallelograms, squares and LED ticks — that light one by one and shift color by zone.',
    tags: ['segments', 'led', 'zones', 'battery'], size: { w: 50, h: 5 }, minSize: { w: 22, h: 1 }, loop: 8, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const sims = [0, 1, 2].map((i) => transfer(ctx.rng, { total: 1, seconds: 5.4 + i * 0.5, burst: 0.3 }));
      const styles = g.unicode ? [['▰', '▱'], ['■', '□'], ['┃', '╎']] : [['#', '.'], ['=', '-'], ['|', ':']];
      const labels = ['charge', 'sync', 'rebuild'];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, 3, 1);
        const lw = W >= 34 ? 9 : 0;
        for (let r = 0; r < count; r++) {
          const y = r * step, f = sims[r].at(local).frac;
          if (lw) b.text(1, y, labels[r], th.muted);
          const segs = Math.min(24, W - 3 - lw - 5);
          meter(b, 1 + lw, y, segs, f, { theme: th, on: styles[r][0], off: styles[r][1], thresholds: r === 0 ? [[0, 'neg'], [0.25, 'warn'], [0.6, 'pos']] : [[0.7, 'info']], color: r === 0 ? 'neg' : 'accent' });
          b.text(1 + lw + segs + 1, y, pctText(f), th.ink);
        }
      };
    },
  },
  {
    id: 'progress-indeterminate', title: 'Indeterminate', category: C, order: 50, kind: 'progress',
    description: 'For work with no known end: a gliding block, a barber-pole stripe and a stretching Material-style band.',
    tags: ['indeterminate', 'barber pole', 'busy'], size: { w: 60, h: 5 }, minSize: { w: 20, h: 1 }, loop: 6, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const labels = ['waiting for server', 'negotiating', 'resolving host'];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { count, step } = rowsFor(ctx.height, 3, 1);
        const lw = W >= 44 ? 19 : 0;
        const bw = Math.max(6, W - 2 - lw);
        for (let r = 0; r < count; r++) {
          const y = r * step, x0 = 1 + lw;
          if (lw) b.text(1, y, truncate(labels[r], lw - 1), th.muted);
          if (r === 0) {
            // Gliding block with eighth-cell edges, easing at the walls.
            const blk = Math.max(3, Math.round(bw * 0.18));
            const u = 0.5 - 0.5 * Math.cos(t * 2.1);
            const start = u * (bw - blk) * 8, end = start + blk * 8;
            b.fill(x0, y, bw, 1, ' ', th.dim, th.panel2);
            for (let i = 0; i < bw; i++) {
              const a0 = i * 8, lo = Math.max(a0, start), hi = Math.min(a0 + 8, end);
              const cov = Math.max(0, hi - lo);
              if (cov <= 0.5) continue;
              if (!g.unicode) { if (cov > 4) b.set(x0 + i, y, '#', th.accent, NONE); continue; }
              if (cov >= 7.5) { b.set(x0 + i, y, ' ', th.accent, th.accent); continue; }
              if (lo > a0) {
                // Block enters mid-cell: paint the uncovered left part in track color over an accent ground.
                const left = Math.round(lo - a0);
                if (left <= 0) b.set(x0 + i, y, ' ', th.accent, th.accent);
                else if (left < 8) b.set(x0 + i, y, EIGHTHS[left], th.panel2, th.accent);
              } else {
                const n = Math.round(cov);
                if (n >= 8) b.set(x0 + i, y, ' ', th.accent, th.accent);
                else if (n > 0) b.set(x0 + i, y, EIGHTHS[n], th.accent, th.panel2);
              }
            }
          } else if (r === 1) {
            const off = Math.floor(t * 8);
            for (let i = 0; i < bw; i++) {
              const on = ((i + off) >> 1) % 2 === 0;
              b.set(x0 + i, y, g.unicode ? '╱' : '/', on ? th.bg : th.warn, on ? th.warn : mix(th.warn, th.bg, 0.55));
            }
          } else {
            // Head runs ahead, tail catches up — the stretching band.
            const cyc = (t * 0.55) % 1;
            const head = Math.min(1, cyc * 1.6), tail = Math.max(0, cyc * 1.6 - 0.6);
            b.fill(x0, y, bw, 1, ' ', th.dim, mix(th.bg, th.info, 0.15));
            for (let i = Math.floor(tail * bw); i < Math.ceil(head * bw); i++) b.set(x0 + i, y, g.unicode ? ' ' : '=', th.info, g.unicode ? th.info : NONE);
          }
        }
      };
    },
  },
  {
    id: 'progress-ascii-classic', title: 'ASCII Classics', category: C, order: 60, kind: 'progress',
    description: 'The 7-bit bars everyone recognizes — hashes, an arrow head, pipes and stars — for serial consoles and LANG=C.',
    tags: ['ascii', 'classic', 'hash', 'retro'], size: { w: 56, h: 7 }, minSize: { w: 24, h: 1 }, loop: 8, glyphs: 'ascii', color: 'mono',
    setup(ctx) {
      const th = ctx.theme;
      const sims = [0, 1, 2, 3].map((i) => transfer(ctx.rng, { total: 1, seconds: 5 + i * 0.5 }));
      const styles = [
        (n, w) => '#'.repeat(n) + '-'.repeat(w - n),
        (n, w) => (n >= w ? '='.repeat(w) : '='.repeat(Math.max(0, n - 1)) + (n ? '>' : '') + ' '.repeat(w - n)),
        (n, w) => '|'.repeat(n) + ' '.repeat(w - n),
        (n, w) => '*'.repeat(n) + '.'.repeat(w - n),
      ];
      const wrap = [['[', ']'], ['[', ']'], ['[', ']'], ['(', ')']];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, 4, 1);
        for (let r = 0; r < count; r++) {
          const y = r * step, f = sims[r].at(local).frac;
          const w = Math.max(4, W - 9);
          const n = Math.round(f * w);
          b.text(1, y, wrap[r][0] + styles[r](n, w) + wrap[r][1], r === 1 ? th.pos : th.ink);
          b.text(W - 5, y, pctText(f), th.muted);
        }
      };
    },
  },
  {
    id: 'progress-thin-line', title: 'Thin Line', category: C, order: 70, kind: 'progress',
    description: 'The heavy-line bar modern Python and Rust tools use — a bright run, a half-cap head and a dim remainder, with elapsed time.',
    tags: ['line', 'rich', 'pip', 'minimal'], size: { w: 64, h: 5 }, minSize: { w: 24, h: 1 }, loop: 8, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const rows = [
        { name: 'Downloading', c: th.crit, sim: transfer(ctx.rng, { total: 1, seconds: 5.5 }) },
        { name: 'Building', c: th.accent, sim: transfer(ctx.rng, { total: 1, seconds: 6.2 }) },
        { name: 'Publishing', c: th.pos, sim: transfer(ctx.rng, { total: 1, seconds: 6.8 }) },
      ];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, 3, 1);
        const lw = W >= 44 ? 12 : 0;
        const tail = W >= 34 ? 13 : 5;
        const bw = Math.max(4, W - 2 - lw - tail);
        rows.slice(0, count).forEach((row, r) => {
          const y = r * step, s = row.sim.at(local);
          if (lw) b.text(1, y, row.name, th.ink);
          const half = s.frac * bw, n = Math.floor(half);
          for (let i = 0; i < bw; i++) {
            const lit = i < n || s.finished;
            const head = !s.finished && i === n && half - n >= 0.5;
            const ch = g.unicode ? (head ? '╸' : '━') : (lit || head ? '=' : '-');
            b.set(1 + lw + i, y, ch, lit || head ? (s.finished ? th.pos : row.c) : th.line);
          }
          const tx = 1 + lw + bw + 1;
          b.text(tx, y, pctText(s.frac).trim().padStart(4), th.ink);
          if (tail > 5) b.text(tx + 5, y, clock(s.elapsed), th.dim);
        });
      };
    },
  },
  {
    id: 'progress-vertical', title: 'Vertical Fill', category: C, order: 80, kind: 'progress',
    description: 'One column per worker filling bottom-up in eighth blocks — parallel shards, partitions or cores at a glance.',
    tags: ['vertical', 'columns', 'workers', 'parallel'], size: { w: 48, h: 10 }, minSize: { w: 16, h: 4 }, loop: 9, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const N = 8;
      const sims = Array.from({ length: N }, (_, i) => transfer(ctx.rng, { total: 1, seconds: 4.4 + ctx.rng() * 2.6, burst: 0.7 }));
      const LOWER = ['', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
      const colorFor = (f) => mix(th.info, th.pos, f);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 9, 1);
        const cols = Math.max(1, Math.min(N, Math.floor((W - 1) / 4)));
        const cw = Math.max(1, Math.floor((W - 1) / cols) - 1);
        const hh = Math.max(1, H - 2);
        for (let k = 0; k < cols; k++) {
          const f = sims[k].at(local).frac;
          const x = 1 + k * (cw + 1);
          const e = Math.round(f * hh * 8), full = e >> 3, rem = e & 7;
          for (let r = 0; r < hh; r++) {
            const y = hh - 1 - r;
            const c = colorFor(r / Math.max(1, hh - 1));
            for (let dx = 0; dx < cw; dx++) {
              if (r < full) b.set(x + dx, y, g.unicode ? '█' : '#', f >= 1 ? th.pos : c);
              else if (r === full && rem) b.set(x + dx, y, g.unicode ? LOWER[rem] : (rem > 4 ? '#' : '_'), c);
              else b.set(x + dx, y, g.unicode ? '░' : '.', th.line);
            }
          }
          b.text(x, H - 2, `${Math.floor(f * 100)}`.padStart(Math.min(3, cw)).slice(-cw), f >= 1 ? th.pos : th.ink);
          b.text(x, H - 1, `w${k + 1}`.slice(0, cw), th.muted);
        }
      };
    },
  },
  {
    id: 'progress-shaded', title: 'Shaded Edge', category: C, order: 90, kind: 'progress',
    description: 'Full blocks with a ▓▒░ shaded leading edge over a light-shade track — the bar that feels like a DOS installer.',
    tags: ['shade', 'dos', 'retro', 'installer'], size: { w: 56, h: 3 }, minSize: { w: 20, h: 1 }, loop: 8, color: '16',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const sims = [transfer(ctx.rng, { total: 1, seconds: 6 }), transfer(ctx.rng, { total: 1, seconds: 5.2 })];
      return (t) => {
        const b = ctx.buffer, W = ctx.width;
        const { local } = phase(t, 8, 1);
        const { count, step } = rowsFor(ctx.height, 2, 1);
        for (let r = 0; r < count; r++) {
          const y = r * step, f = sims[r].at(local).frac;
          const bw = Math.max(4, W - 8);
          const n = f * bw;
          for (let i = 0; i < bw; i++) {
            const d = n - i;
            let ch, c;
            if (d >= 1) { ch = g.unicode ? '█' : '#'; c = r ? th.info : th.accent; }
            else if (d > 0.66) { ch = g.unicode ? '▓' : '#'; c = r ? th.info : th.accent; }
            else if (d > 0.33) { ch = g.unicode ? '▒' : '+'; c = r ? th.info : th.accent; }
            else if (d > 0) { ch = g.unicode ? '░' : '-'; c = r ? th.info : th.accent; }
            else { ch = g.unicode ? '░' : '.'; c = th.line; }
            b.set(1 + i, y, ch, c);
          }
          b.text(W - 5, y, pctText(f), th.ink, undefined, f >= 1 ? ATTR.BOLD : 0);
        }
      };
    },
  },
];
