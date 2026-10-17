// Pure ASCII — spinners and bars: the progress vocabulary of classic Unix tools,
// all in 7-bit characters.
import { hash, center } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'ASCII Spinners & Bars', glyphs: 'ascii', color: '16' };

const SPINNERS = [
  ['line', ['|', '/', '-', '\\'], 100],
  ['dots', ['.  ', '.. ', '...', ' ..', '  .', '   '], 160],
  ['grow', ['.', 'o', 'O', '0', 'O', 'o'], 120],
  ['arrows', ['<', '^', '>', 'v'], 140],
  ['bounce', ['[=   ]', '[ =  ]', '[  = ]', '[   =]', '[  = ]', '[ =  ]'], 110],
  ['scanner', ['(*    )', '( *   )', '(  *  )', '(   * )', '(    *)', '(   * )', '(  *  )', '( *   )'], 80],
  ['pipe', ['[|]', '[/]', '[-]', '[\\]'], 120],
  ['fill', ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]'], 120],
  ['toggle', ['+', 'x'], 250],
  ['pulse', ['.', ':', '|', ':'], 150],
  ['flip', ['_', '_', '-', '`', '`', "'", '-', '_'], 90],
  ['meter', ['[     ]', '[#    ]', '[##   ]', '[###  ]', '[#### ]', '[#####]'], 140],
  ['ping', ['|o    |', '| o   |', '|  o  |', '|   o |', '|    o|', '|   o |', '|  o  |', '| o   |'], 90],
  ['clock', ['-', '\\', '|', '/'], 220],
  ['beam', ['>    ', '>>   ', '>>>  ', ' >>> ', '  >>>', '   >>', '    >', '     '], 100],
  ['dqpb', ['d', 'q', 'p', 'b'], 120],
];

const spinners = {
  ...shared,
  id: 'ascii-spinners',
  title: 'ASCII Spinner Sampler',
  kind: 'spinner',
  tags: ['spinner', 'loader', 'busy', 'classic', 'cli'],
  order: 10,
  loop: 4,
  size: { w: 64, h: 18 },
  minSize: { w: 24, h: 6 },
  description: 'Sixteen pure-ASCII spinners — |/-\\, bouncing brackets, scanners, meters and more — each at its own classic cadence.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const colW = W >= 60 ? 32 : W >= 40 ? Math.floor(W / 2) : W;
    const cols = Math.max(1, Math.floor(W / colW));
    const rows = Math.max(1, Math.ceil(SPINNERS.length / cols));
    const accents = [th.accent, th.pos, th.warn, th.info, th.crit];
    return (t) => {
      const b = ctx.buffer;
      SPINNERS.forEach(([name, frames, ms], i) => {
        const c = Math.floor(i / rows), r = i % rows;
        if (r >= H || c >= cols) return;
        const x = c * colW + 1;
        const f = frames[Math.floor((t * 1000) / ms) % frames.length];
        b.text(x, r, f, accents[i % accents.length], undefined, 1);
        b.text(x + 9, r, name, th.muted);
      });
    };
  },
};

// Classic tool progress lines. Each loops: run → finish → short hold.
const TOOLS = [
  { id: 'wget', total: 18.4, rate: 4.2, render: (p, s, W) => {
    const barW = Math.max(6, Math.min(40, W - 52));
    const fill = Math.round(barW * p);
    const bar = '='.repeat(Math.max(0, fill - 1)) + (p < 1 ? '>' : '=') + ' '.repeat(barW - fill);
    return `prism-term.tgz   ${String(Math.round(p * 100)).padStart(3)}%[${bar}] ${(18.4 * p).toFixed(2)}M  ${s.rate}KB/s  ${p < 1 ? `eta ${s.eta}s ` : 'in 4.4s '}`;
  } },
  { id: 'curl', total: 1, rate: 0.16, render: (p, s, W) => {
    const barW = Math.max(10, W - 8);
    return `${'#'.repeat(Math.round(barW * p)).padEnd(barW)} ${(p * 100).toFixed(1).padStart(5)}%`;
  } },
  { id: 'apt', total: 1, rate: 0.12, render: (p, s, W) => {
    const barW = Math.max(10, W - 26);
    const f = Math.round(barW * p);
    return `Progress: [${String(Math.round(p * 100)).padStart(3)}%] [${'#'.repeat(f)}${'.'.repeat(barW - f)}]`;
  } },
  { id: 'tqdm', total: 100, rate: 18, render: (p, s, W) => {
    const barW = Math.max(6, Math.min(30, W - 46));
    const exact = barW * p, full = Math.floor(exact), frac = Math.floor((exact - full) * 10);
    const bar = ('#'.repeat(full) + (full < barW ? String(frac) : '')).padEnd(barW).slice(0, barW);
    const n = Math.round(p * 100);
    return `${String(n).padStart(3)}%|${bar}| ${n}/100 [00:0${Math.floor(p * 5)}<00:0${Math.max(0, 5 - Math.floor(p * 5))}, 18.20it/s]`;
  } },
  { id: 'rsync', total: 1, rate: 0.1, render: (p) => `     ${Math.round(1204322 * p).toLocaleString('en-US').padStart(10)}  ${String(Math.round(p * 100)).padStart(3)}%    1.21MB/s    0:00:${String(Math.max(0, Math.round((1 - p) * 9))).padStart(2, '0')}` },
  { id: 'docker', total: 40.3, rate: 7, render: (p, s, W) => {
    const barW = Math.max(6, Math.min(40, W - 48));
    const f = Math.round(barW * p);
    return p < 1
      ? `a3ed95caeb02: Downloading [${'='.repeat(Math.max(0, f - 1))}>${' '.repeat(barW - f)}]  ${(40.3 * p).toFixed(1)}MB/40.3MB`
      : 'a3ed95caeb02: Pull complete';
  } },
  { id: 'pip', total: 9.6, rate: 2.3, render: (p, s, W) => {
    const barW = Math.max(6, Math.min(40, W - 34));
    const f = Math.round(barW * p);
    return `   ${'-'.repeat(f).padEnd(barW)} ${(9.6 * p).toFixed(1)}/9.6 MB ${p < 1 ? '2.3 MB/s eta 0:00:0' + Math.max(0, Math.round((1 - p) * 4)) : ''}`;
  } },
  { id: 'make', total: 1, rate: 0.09, render: (p) => `[${String(Math.round(p * 100)).padStart(3)}%] Building C object src/CMakeFiles/prism.dir/render.c.o` },
];

const progress = {
  ...shared,
  id: 'ascii-progress-bars',
  title: 'Classic Tool Progress Bars',
  kind: 'progress',
  tags: ['progress', 'wget', 'curl', 'apt', 'tqdm', 'rsync', 'docker'],
  order: 20,
  loop: 10,
  size: { w: 80, h: 18 },
  minSize: { w: 40, h: 8 },
  description: 'The progress lines everyone recognizes — wget, curl, apt, tqdm, rsync, docker pull, pip and make — in pure ASCII.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const gap = H >= TOOLS.length * 2 + 1 ? 2 : 1;
    return (t) => {
      const b = ctx.buffer;
      TOOLS.forEach((tool, i) => {
        const y = i * gap;
        if (y + (gap === 2 ? 1 : 0) >= H) return;
        const dur = tool.total / tool.rate;
        const cycle = dur + 1.6;
        const local = (t + i * 0.9) % cycle;
        const p = Math.min(1, local / dur);
        const s = { rate: Math.round(820 + hash(i, Math.floor(t * 2)) * 60), eta: Math.max(0, Math.ceil((1 - p) * dur)) };
        if (gap === 2) b.text(0, y, `$ ${tool.id}`, th.dim);
        const line = tool.render(p, s, W).slice(0, W);
        const yy = gap === 2 ? y + 1 : y;
        b.text(0, yy, line, p >= 1 ? th.pos : th.ink);
        // Color the bar itself
        for (let x = 0; x < line.length; x++) if ('#=>-'.includes(line[x]) && p < 1) b.set(x, yy, undefined, th.accent);
      });
    };
  },
};

const hourglass = {
  ...shared,
  id: 'ascii-hourglass',
  title: 'ASCII Hourglass',
  kind: 'spinner',
  tags: ['hourglass', 'timer', 'sand', 'waiting'],
  order: 30,
  loop: 10,
  size: { w: 30, h: 14 },
  minSize: { w: 14, h: 12 },
  description: 'Sand drains grain by grain through the neck of a 7-bit hourglass, piles up below, then the glass flips and starts again.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const rows = 5;
    return (t) => {
      const b = ctx.buffer;
      const p = (t % 10) / 9;
      const k = Math.min(1, p);
      const cx = Math.floor(W / 2), y0 = Math.max(0, Math.floor((H - (rows * 2 + 2)) / 2));
      b.text(cx - rows - 1, y0, '_'.repeat(rows * 2 + 3), th.muted);
      // Top bulb drains from its upper rows; bottom bulb fills from the base.
      for (let r = 0; r < rows; r++) {
        const w = (rows - r) * 2 - 1;
        const y = y0 + 1 + r;
        b.set(cx - rows + r - 1, y, '\\', th.muted);
        b.set(cx + rows - r + 1, y, '/', th.muted);
        const level = r / rows;
        const sand = level >= k ? '.'.repeat(w + 2).replace(/./g, (c, i) => (hash(i, r) < 0.6 ? ':' : '.')) : ' '.repeat(w + 2);
        b.text(cx - Math.floor((w + 2) / 2), y, sand, th.warn);
      }
      for (let r = 0; r < rows; r++) {
        const w = r * 2 + 1;
        const y = y0 + 1 + rows + r;
        b.set(cx - r - 2, y, '/', th.muted);
        b.set(cx + r + 2, y, '\\', th.muted);
        const filled = (rows - 1 - r) / rows < k;
        if (filled) b.text(cx - Math.floor((w + 2) / 2), y, '.'.repeat(w + 2).replace(/./g, (c, i) => (hash(i, r, 9) < 0.6 ? ':' : '.')), th.warn);
      }
      b.text(cx - rows - 1, y0 + 1 + rows * 2, '-'.repeat(rows * 2 + 3), th.muted);
      // The falling stream
      if (k < 1) for (let y = y0 + rows; y < y0 + rows + 3 + Math.round((1 - k) * (rows - 2)); y++) if ((y + Math.floor(t * 12)) % 2) b.set(cx, y, '.', th.warn);
      if (H > rows * 2 + 4) center(b, Math.min(H - 1, y0 + rows * 2 + 3), `${String(Math.max(0, Math.ceil((1 - k) * 9))).padStart(1)}s`, th.dim);
    };
  },
};

const BANDS = ['60', '150', '400', '1k', '2.5k', '6k', '15k'];

const vu = {
  ...shared,
  id: 'ascii-vu-meter',
  title: 'ASCII Spectrum Analyzer',
  kind: 'chart',
  tags: ['spectrum', 'vu meter', 'equalizer', 'audio', 'bars'],
  order: 40,
  loop: 8,
  size: { w: 64, h: 18 },
  minSize: { w: 24, h: 8 },
  description: 'A hi-fi spectrum analyzer in #: bars bounce to a synthetic beat, peak markers hang and fall, labels sit on the axis.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const n = Math.max(6, Math.floor((W - 2) / 3));
    const maxH = H - 2;
    const peaks = new Float32Array(n);
    let last = 0;
    return (t) => {
      const b = ctx.buffer;
      const dt = Math.max(0, Math.min(0.2, t - last)); last = t;
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2)), 8);
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const v = Math.min(1, 0.15 + 0.55 * (1 - f) * beat + 0.3 * Math.abs(Math.sin(t * (2.1 + f * 5) + i * 0.7)) * (0.6 + 0.4 * hash(i, Math.floor(t * 8))));
        const hgt = Math.round(v * maxH);
        peaks[i] = Math.max(hgt, peaks[i] - dt * 6);
        const x = 1 + i * 3;
        for (let y = 0; y < hgt; y++) {
          const level = y / maxH;
          b.text(x, H - 2 - y, '##', level > 0.8 ? th.neg : level > 0.55 ? th.warn : th.pos);
        }
        const py = H - 2 - Math.round(peaks[i]);
        if (py >= 0 && Math.round(peaks[i]) > hgt) b.text(x, py, '==', th.ink);
      }
      b.text(0, H - 1, '-'.repeat(W), th.dim);
      BANDS.forEach((l, k) => {
        const x = Math.round(1 + (k / (BANDS.length - 1)) * (n - 1) * 3);
        b.text(Math.min(W - l.length, x), H - 1, l, th.muted);
      });
    };
  },
};

export default [spinners, progress, hourglass, vu];
