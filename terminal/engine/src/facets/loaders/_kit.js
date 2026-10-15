// Shared presentation for spinner facets.
//
// A spinner tile shows the spinner the way you meet it — inline, in front of a
// task label with an elapsed timer — and then the whole cycle as a filmstrip
// (current frame lit) with its frame count and interval, so you can judge the
// rhythm at a glance. Tiles degrade by dropping rows: at two rows you get the
// live line and the strip, at one row just the live line.
//
// Without Unicode (TERM=linux, LANG=C) a non-ASCII spinner falls back to the
// classic `-\|/` and every label uses plain ASCII.

import { getSpinner } from '../../spinners.js';
import { palette as makePalette, PALETTES } from '../../palettes.js';
import { stringWidth, truncate } from '../../width.js';
import { mix } from '../../color.js';

const lum = (c) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

export const ASCII_LINE = { frames: ['-', '\\', '|', '/'], interval: 130 };
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
export const asciiSpinner = (spin) => spin.frames.every(isAscii);

const BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
/** Dots ([[x,y], …] with x in 0..2*cells-1, y in 0..3) → a braille string `cells` wide. */
export function braille(cells, dots) {
  const m = new Array(cells).fill(0);
  for (const [x, y] of dots) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || yi > 3 || xi >= cells * 2) continue;
    m[xi >> 1] |= BITS[yi][xi & 1];
  }
  return m.map((v) => String.fromCharCode(0x2800 + v)).join('');
}
export const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

/** Index of the frame showing at time t. */
export const frameAt = (spin, t) => Math.floor((Math.max(0, t) * 1000) / spin.interval) % spin.frames.length;

/**
 * Draw one spinner frame. Color precedence: spin.colorAt(t, i, k, theme) per
 * character, then a sweeping spin.palette, then `color`.
 */
export function drawFrame(surface, x, y, spin, k, t, theme, color, cache) {
  const chars = [...spin.frames[k]];
  let cx = x;
  let g = null;
  if (spin.palette && !spin.colorAt) {
    g = cache.get(spin.palette);
    if (!g) { g = makePalette(spin.palette, theme); cache.set(spin.palette, g); }
  }
  chars.forEach((ch, i) => {
    let c = color;
    if (spin.colorAt) c = spin.colorAt(t, i, k, theme);
    else if (g) {
      const u = ((t * 0.45 + (i / Math.max(1, chars.length)) * 0.5) % 1 + 1) % 1;
      c = PALETTES[spin.palette]?.cyclic ? g(u) : g(0.45 + 0.55 * (u < 0.5 ? u * 2 : 2 - u * 2));
    }
    // Spinner art colors (neon greens, embers, white sparks) are tuned for dark
    // terminals; by Day, deepen any that would wash out against the pearl.
    if (theme.mode === 'light' && (spin.colorAt || g) && c >= 0 && lum(c) > 0.3) c = mix(c, theme.ink, 0.45);
    cx = surface.text(cx, y, ch, c);
  });
  return cx;
}

const fmtElapsed = (s) => (s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`);

/**
 * Build a spinner facet.
 * @param {object} o
 *   id, title, category, description, tags     catalog metadata
 *   spin      a name from src/spinners.js, or { frames, interval, palette?, colorAt? }
 *   labels    task messages the live line cycles through (Unicode allowed; ASCII twins via asciiLabels)
 *   name      label for the meta line (defaults to the spinner name)
 *   color     theme token for monochrome spinners (default 'accent')
 */
export function spinnerFacet(o) {
  const spin0 = typeof o.spin === 'string' ? getSpinner(o.spin) : o.spin;
  const ascii = asciiSpinner(spin0);
  const width = Math.max(...spin0.frames.map(stringWidth));
  const labels = o.labels || ['Working…'];
  const asciiLabels = o.asciiLabels || labels.map((l) => l.replace(/…/g, '...').replace(/[^\x20-\x7e]/g, ''));
  return {
    id: o.id,
    title: o.title,
    category: o.category,
    description: o.description,
    tags: ['spinner', 'loader', ...(o.tags || [])],
    kind: 'spinner',
    size: { w: 44, h: 5 },
    minSize: { w: 24, h: 2 },
    loop: o.loop || 8,
    glyphs: ascii ? 'ascii' : o.glyphs || (spin0.frames.some((f) => /[⠀-⣿]/.test(f)) ? 'braille' : 'unicode'),
    color: spin0.palette || spin0.colorAt ? '256' : '16',
    order: o.order ?? 50,
    params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
    setup(ctx) {
      const th = ctx.theme;
      const unicode = ctx.caps.unicode !== false;
      const spin = unicode || ascii ? spin0 : ASCII_LINE;
      const lines = unicode ? labels : asciiLabels;
      const base = th[o.color || 'accent'] ?? th.accent;
      const cache = new Map();
      const speed = ctx.param('speed', 1);
      const W = ctx.width, H = ctx.height;
      const fw = unicode || ascii ? width : 1;
      return (t) => {
        const b = ctx.buffer;
        const tt = t * speed;
        const k = frameAt(spin, tt);
        // Live line: spinner, task label, elapsed (right).
        const row = 0;
        let x = drawFrame(b, 1, row, spin, k, tt, th, base, cache);
        const label = lines[Math.floor(t / 2.6) % lines.length];
        const elapsed = fmtElapsed(t);
        const room = W - x - 2 - (W >= 32 ? elapsed.length + 1 : 0);
        b.text(x + 1, row, truncate(label, Math.max(0, room), unicode ? '…' : '.'), th.ink);
        if (W >= 32) b.text(W - 1 - elapsed.length, row, elapsed, th.dim);
        if (H < 2) return;

        // Filmstrip of the whole cycle, windowed around the current frame.
        // Rows: live line · strip · meta, spread over what the tile has.
        const stripY = H >= 4 ? 2 : 1;
        const metaY = H >= 5 ? 4 : H >= 4 ? 3 : 2;
        const cellW = fw + 1;
        const fit = Math.max(1, Math.floor((W - 2) / cellW));
        const n = spin.frames.length;
        const start = n <= fit ? 0 : Math.min(n - fit, Math.max(0, k - Math.floor(fit / 2)));
        for (let i = start, sx = 1; i < Math.min(n, start + fit); i++, sx += cellW) {
          if (i === k) {
            b.fill(sx, stripY, fw, 1, undefined, undefined, mix(th.bg, base, 0.18));
            drawFrame(b, sx, stripY, spin, i, tt, th, base, cache);
          } else b.text(sx, stripY, spin.frames[i], th.dim);
        }
        if (n > fit && W > 12) b.text(W - 3, stripY, unicode ? ' …' : '..', th.dim);
        if (H < 3) return;

        // Meta line.
        const fallback = unicode || ascii ? '' : ' (ASCII fallback)';
        const meta = `${o.name || (typeof o.spin === 'string' ? o.spin : o.id.replace(/^loaders-/, ''))}${fallback} ${unicode ? '·' : '-'} ${n} frames ${unicode ? '·' : '-'} ${spin.interval} ms`;
        b.text(1, metaY, truncate(meta, W - 2, unicode ? '…' : '.'), th.muted);
      };
    },
  };
}
