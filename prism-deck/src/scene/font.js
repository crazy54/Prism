// Font runtime: Inter outlines (extracted from Prism.html's embedded woff2 by
// scripts/extract-fonts.mjs) prepared for fast text → path layout.
//
// The real weights are whatever Prism.html embeds (fonts/index.js; 400 / 600 / 700
// today). Other weights are synthesized from the nearest lighter face plus a stroke
// (faux-bold the way type tools do it). A few symbols the Prism.html subset lacks (→ ← λ ▲ ▼ ● ✓) are
// drawn here as outlines in font units, so labels never fall back to tofu.

import { FACES as SOURCES } from './fonts/index.js';

const REAL = Object.keys(SOURCES).map(Number).sort((a, b) => a - b);
const OPS = { M: 0, L: 1, Q: 2, Z: 3 };
const faces = new Map();

function parse(cmds) {
  const t = cmds.split(' ').filter(Boolean);
  const ops = [], xs = [];
  for (let i = 0; i < t.length;) {
    const op = OPS[t[i++]];
    ops.push(op);
    const n = op === 2 ? 4 : op === 3 ? 0 : 2;
    for (let k = 0; k < n; k++) xs.push(+t[i++]);
  }
  return { ops: Uint8Array.from(ops), xs: Float32Array.from(xs) };
}

/** Synthetic symbols as filled outlines in font units (y up), scaled to the face. stem = stem width in units. */
function symbols(f, stem) {
  const cap = f.capHeight, x = f.xHeight;
  // every contour clockwise (TrueType outer-contour orientation, y up) so overlaps fill under nonzero
  const poly = (pts) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
    const ring = area > 0 ? [...pts].reverse() : pts;
    return `M ${ring.map(([a, b]) => `${Math.round(a)} ${Math.round(b)}`).join(' L ')} Z`;
  };
  const mid = cap * 0.5, half = stem / 2;
  const W = Math.round(cap * 1.05);
  const head = cap * 0.34, wing = cap * 0.3;
  const arrowR = [[60, mid - half], [W - 60 - head, mid - half], [W - 60 - head, mid - wing], [W - 60, mid], [W - 60 - head, mid + wing], [W - 60 - head, mid + half], [60, mid + half]];
  const arrowL = arrowR.map(([a, b]) => [W - a, b]);
  const disc = Array.from({ length: 24 }, (_, i) => [cap * 0.4 + cap * 0.32 * Math.cos((i / 24) * Math.PI * 2), mid + cap * 0.32 * Math.sin((i / 24) * Math.PI * 2)]);
  const up = [[80, 0], [W - 80, 0], [W / 2, cap * 0.78]];
  const down = [[80, cap * 0.78], [W - 80, cap * 0.78], [W / 2, 0]];
  const check = [[70, mid], [70 + stem * 0.9, mid + stem * 0.6], [W * 0.38, stem * 1.3], [W - 70 - stem * 0.6, cap * 0.86], [W - 70, cap * 0.86 - stem * 0.9], [W * 0.38, 0]];
  // λ: a long diagonal from the top-left to the baseline, and a short leg from its middle down to the left
  const lw = Math.round(x * 1.08), top = cap * 1.02, s = stem * 1.15;
  const main = [[lw * 0.1, top], [lw * 0.1 + s, top], [lw * 0.95, 0], [lw * 0.95 - s, 0]];
  const mx = lerp2(lw * 0.1 + s / 2, lw * 0.95 - s / 2, 0.42), my = top * 0.58;
  const leg = [[mx - s * 0.55, my], [mx + s * 0.45, my - s * 0.4], [lw * 0.05 + s, 0], [lw * 0.05, 0]];
  return {
    '→': [W, poly(arrowR)],
    '←': [W, poly(arrowL)],
    '▲': [W, poly(up)],
    '▼': [W, poly(down)],
    '●': [Math.round(cap * 0.8), poly(disc)],
    '✓': [W, poly(check)],
    'λ': [lw, `${poly(main)} ${poly(leg)}`],
  };
}
const lerp2 = (a, b, t) => a + (b - a) * t;

/** A prepared face: { weight, upm, ascender, descender, capHeight, xHeight, glyphs: Map(ch → { adv, ops, xs }), kern: Map }. */
export function face(weight = 600) {
  const real = REAL.reduce((best, w) => (w <= weight + 49 ? w : best), REAL[0]);
  if (faces.has(real)) return faces.get(real);
  const f = SOURCES[real];
  const glyphs = new Map();
  for (const [ch, [adv, cmds]] of Object.entries(f.chars)) glyphs.set(ch, { adv, ...parse(cmds) });
  const stem = f.unitsPerEm * (0.082 + (Math.min(700, real) - 400) / 300 * 0.034);
  for (const [ch, [adv, cmds]] of Object.entries(symbols(f, stem))) if (!glyphs.has(ch)) glyphs.set(ch, { adv, ...parse(cmds) });
  const prepared = { weight: real, upm: f.unitsPerEm, ascender: f.ascender, descender: f.descender, capHeight: f.capHeight, xHeight: f.xHeight, glyphs, kern: new Map(Object.entries(f.kern)) };
  // tabular figures: the widest digit
  prepared.figure = Math.max(...'0123456789'.split('').map((d) => glyphs.get(d)?.adv || 0));
  faces.set(real, prepared);
  return prepared;
}

/** Weight → { face, embolden (em) }: the real face plus a synthetic stroke for in-between / heavier weights. */
export function faceFor(weight = 600) {
  const w = Math.max(100, Math.min(900, +weight || 600));
  const f = face(w);
  return { face: f, embolden: w > f.weight + 25 ? 0.024 * ((w - f.weight) / 100) : 0 };
}

export const FONT_WEIGHTS = REAL;
