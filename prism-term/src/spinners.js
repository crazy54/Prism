// Spinner collection. Each entry is { frames, interval (ms) } and optionally
// { palette } — a gradient that sweeps across the frame's characters over time
// on color terminals (the glyphs still animate on their own in mono).
//
// The classic glyph loops are hand-listed; prism-term's originals (snake,
// orbit, thinking, wave, dna, radar, …) are generated from small formulas.
// Every spinner is width-stable: all of its frames occupy the same columns.

import { stringWidth } from './width.js';
import { getTheme, palette as makePalette, PALETTES } from './palettes.js';
import { rng } from './easing.js';
import { parse } from './color.js';

const BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

/** Encode dot coordinates ([[x,y], …], x in 0..2*cells-1, y in 0..3) as a braille string. */
function braille(cells, dots) {
  const m = new Array(cells).fill(0);
  for (const [x, y] of dots) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || yi > 3 || xi >= cells * 2) continue;
    m[xi >> 1] |= BITS[yi][xi & 1];
  }
  return m.map((v) => String.fromCharCode(0x2800 + v)).join('');
}

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const LOWER = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function bounce(n) {
  // 0,1,…,n-1,n-2,…,1 — positions for a back-and-forth sweep.
  return [...range(n, (i) => i), ...range(Math.max(0, n - 2), (i) => n - 2 - i)];
}

const generated = {
  // A 4-dot snake running around a 2-cell (4×4 dot) perimeter.
  snake: (() => {
    const path = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]];
    return { frames: range(path.length, (k) => braille(2, range(4, (j) => path[(k - j + path.length) % path.length]))), interval: 70 };
  })(),
  // A planet with a short tail orbiting a lit "sun", 3 cells wide.
  orbit: {
    frames: range(20, (k) => {
      const dots = [[2, 1], [3, 1], [2, 2], [3, 2]];
      for (let j = 0; j < 3; j++) {
        const a = ((k - j * 0.8) / 20) * Math.PI * 2;
        dots.push([2.5 + 2.5 * Math.cos(a), 1.5 + 1.5 * Math.sin(a)]);
      }
      return braille(3, dots);
    }),
    interval: 60,
    palette: 'ice',
  },
  // Typing-indicator style: three 2-dot blobs bobbing on a phase-shifted wave.
  thinking: {
    frames: range(12, (k) => braille(3, range(3, (i) => {
      const yy = 1.5 - 1.5 * Math.sin((k / 12) * Math.PI * 2 - i * 0.9);
      return [[i * 2, yy], [i * 2 + 1, yy]];
    }).flat())),
    interval: 80,
    palette: 'aurora',
  },
  // A sine wave of 1/8 blocks rolling across 8 cells.
  wave: {
    frames: range(16, (k) => range(8, (i) => LOWER[Math.round(3.5 + 3.5 * Math.sin((k / 16) * Math.PI * 2 + i * 0.75))]).join('')),
    interval: 70,
    palette: 'ocean',
  },
  // Five-band audio equalizer.
  equalizer: {
    frames: range(24, (k) => range(5, (i) => LOWER[Math.round(3.5 + 3.5 * Math.sin(k * 0.55 * (0.6 + i * 0.37) + i * 1.3) * Math.cos(k * 0.21 + i))]).join('')),
    interval: 90,
    palette: 'synthwave',
  },
  // Two helix strands twisting with rungs, 6 cells wide.
  dna: {
    frames: range(16, (k) => {
      const dots = [];
      for (let x = 0; x < 12; x++) {
        const ph = (k / 16) * Math.PI * 2 + x * 0.55;
        const a = 1.5 + 1.5 * Math.sin(ph), b = 1.5 - 1.5 * Math.sin(ph);
        dots.push([x, a], [x, b]);
        if (x % 3 === 0 && Math.abs(a - b) >= 2) for (let y = Math.min(a, b) + 1; y < Math.max(a, b); y++) dots.push([x, y]);
      }
      return braille(6, dots);
    }),
    interval: 80,
    palette: 'candy',
  },
  // A scanning beam with a fading afterglow.
  radar: {
    frames: (() => {
      const pos = bounce(8), out = [];
      pos.forEach((p, k) => {
        const dir = k < 8 ? 1 : -1;
        const cells = range(8, () => ' ');
        ['█', '▓', '▒', '░'].forEach((g, j) => { const q = p - dir * j; if (q >= 0 && q < 8) cells[q] = g; });
        out.push(cells.join(''));
      });
      return out;
    })(),
    interval: 70,
    palette: 'ocean',
  },
  // Faceted diamonds catching a rainbow sweep.
  prism: {
    frames: range(8, (k) => range(5, (i) => ['◇', '◈', '◆', '◈'][(k + i) % 4]).join('')),
    interval: 90,
    palette: 'prism',
  },
  // One braille cell filling dot by dot from the bottom, then draining.
  fill: (() => {
    const order = [[0, 3], [1, 3], [0, 2], [1, 2], [0, 1], [1, 1], [0, 0], [1, 0]];
    const up = range(9, (k) => braille(1, order.slice(0, k)));
    const down = range(8, (k) => braille(1, order.slice(k + 1)));
    return { frames: [...up, ...down], interval: 80 };
  })(),
  binary: (() => {
    const r = rng(42);
    return { frames: range(12, () => range(6, () => (r() < 0.5 ? '0' : '1')).join('')), interval: 80, palette: 'matrix' };
  })(),
  matrix: (() => {
    const r = rng(7);
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789';
    return { frames: range(12, () => range(6, () => glyphs[Math.floor(r() * glyphs.length)]).join('')), interval: 80, palette: 'matrix' };
  })(),
  bouncingBar: {
    frames: bounce(4).map((p) => `[${range(6, (i) => (i >= p && i < p + 3 ? '=' : ' ')).join('')}]`),
    interval: 80,
  },
  bouncingBall: {
    frames: bounce(6).map((p) => `( ${range(6, (i) => (i === p ? '●' : ' ')).join('')} )`),
    interval: 80,
  },
  aesthetic: {
    frames: range(8, (k) => range(7, (i) => (i <= k - 1 ? '▰' : '▱')).join('')),
    interval: 90,
  },
  arrows2: {
    frames: range(6, (k) => range(5, (i) => (i === k - 1 ? '▸' : '▹')).join('')),
    interval: 120,
  },
  point: {
    frames: range(5, (k) => range(3, (i) => (i === k - 1 ? '●' : '∙')).join('')),
    interval: 200,
  },
};

export const SPINNERS = {
  dots: { frames: [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'], interval: 80 },
  dots2: { frames: [...'⣾⣽⣻⢿⡿⣟⣯⣷'], interval: 80 },
  dots3: { frames: [...'⠁⠂⠄⡀⢀⠠⠐⠈'], interval: 90 },
  line: { frames: ['-', '\\', '|', '/'], interval: 130 },
  pipe: { frames: [...'┤┘┴└├┌┬┐'], interval: 100 },
  arc: { frames: [...'◜◠◝◞◡◟'], interval: 100 },
  circle: { frames: [...'◐◓◑◒'], interval: 120 },
  quarter: { frames: [...'◴◷◶◵'], interval: 120 },
  squareCorners: { frames: [...'◰◳◲◱'], interval: 180 },
  triangle: { frames: [...'◢◣◤◥'], interval: 60 },
  bounce: { frames: [...'⠁⠂⠄⠂'], interval: 120 },
  pulse: { frames: ['·', '•', '●', '•'], interval: 140 },
  pulseRing: { frames: ['·', '∘', '○', '◎', '◉', '●', '◉', '◎', '○', '∘'], interval: 90 },
  grow: { frames: [...'▁▂▃▄▅▆▇█▇▆▅▄▃▂'], interval: 80 },
  growH: { frames: [...'▏▎▍▌▋▊▉█▉▊▋▌▍▎'], interval: 80 },
  bars: { frames: [...'▉▊▋▌▍▎▏▎▍▌▋▊▉'], interval: 100 },
  loadingBlocks: { frames: [...'⣀⣤⣶⣿⣶⣤'], interval: 100 },
  toggle: { frames: ['⊶', '⊷'], interval: 250 },
  moon: { frames: [...'🌑🌒🌓🌔🌕🌖🌗🌘'], interval: 100 },
  clock: { frames: [...'🕛🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚'], interval: 100 },
  earth: { frames: [...'🌍🌎🌏'], interval: 180 },
  hourglass: { frames: ['⏳', '⌛'], interval: 500 },
  arrows: { frames: [...'←↖↑↗→↘↓↙'], interval: 100 },
  boxBounce: { frames: [...'▖▘▝▗'], interval: 120 },
  boxBounce2: { frames: [...'▌▀▐▄'], interval: 100 },
  star: { frames: [...'✶✸✹✺✹✷'], interval: 70 },
  hamburger: { frames: [...'☱☲☴'], interval: 100 },
  noise: { frames: [...'▓▒░'], interval: 100 },
  layer: { frames: [...'-=≡'], interval: 150 },
  flip: { frames: [...'___-``\'´-___'], interval: 70 },
  dqpb: { frames: [...'dqpb'], interval: 100 },
  heart: { frames: ['♡', '♥'], interval: 300 },
  simpleDots: { frames: ['.  ', '.. ', '...', '   '], interval: 300 },
  ...generated,
};

export const SPINNER_NAMES = Object.keys(SPINNERS);

/** Resolve a spinner by name or pass through a { frames, interval } object. */
export function getSpinner(name = 'dots') {
  if (name && typeof name === 'object' && Array.isArray(name.frames)) return name;
  return SPINNERS[name] || SPINNERS.dots;
}

/** The frame string to show at time t (seconds). */
export function spinnerFrame(name, t) {
  const s = getSpinner(name);
  const i = Math.floor((Math.max(0, t) * 1000) / s.interval);
  return s.frames[i % s.frames.length];
}

/** Column width of a spinner (all frames share it). */
export function spinnerWidth(name) {
  return stringWidth(getSpinner(name).frames[0]);
}

const paletteCache = new Map();

/**
 * Draw a spinner frame into a Surface at (x, y). Spinners with a `palette`
 * get a moving per-character gradient unless `opts.color` is given.
 * @param {Surface} surface
 * @param {number} x @param {number} y
 * @param {string|object} name
 * @param {number} t  seconds
 * @param {object} [opts] { color, theme }
 * @returns {number} the column after the spinner
 */
export function drawSpinner(surface, x, y, name, t, opts = {}) {
  const s = getSpinner(name);
  const frame = spinnerFrame(s, t);
  const theme = getTheme(opts.theme);
  if (opts.color === undefined && s.palette) {
    let g = paletteCache.get(s.palette);
    if (!g) { g = makePalette(s.palette, theme); paletteCache.set(s.palette, g); }
    const chars = [...frame];
    let cx = x;
    chars.forEach((ch, i) => {
      const u = ((t * 0.45 + (i / Math.max(1, chars.length)) * 0.5) % 1 + 1) % 1;
      // Cyclic palettes are bright all the way round; ramps (ocean, matrix…) start
      // near black, so ping-pong over their bright half instead.
      cx = surface.text(cx, y, ch, PALETTES[s.palette]?.cyclic ? g(u) : g(0.45 + 0.55 * (u < 0.5 ? u * 2 : 2 - u * 2)));
    });
    return cx;
  }
  const c = opts.color === undefined ? theme.accent : typeof opts.color === 'number' ? opts.color : (theme[opts.color] ?? parse(opts.color));
  return surface.text(x, y, frame, c);
}
