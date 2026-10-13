// BBS-era helpers: an ANSI-art encoder and block-letter logos.
//
// ansify() turns a 1×2-pixel-per-cell image into what an ANSI artist would
// have drawn in 1993: every cell is one of ' ░▒▓█▀▄' with a foreground from
// the 16 VGA colors and a background from the 8 low ones (DOS text mode had
// no bright backgrounds without iCE colors). Mid-tones come out as shade
// dithers, sharp vertical detail as half blocks.

import { VGA } from './_kit.js';
import { distance2, mix } from '../../color.js';

const SHADES = [[' ', 0], ['░', 0.25], ['▒', 0.5], ['▓', 0.75]];
const LUTS = new Map(); // palette signature → Map(color key → [ch, fg, bg])

function shadeLut(pal) {
  const sig = pal.join(',');
  let lut = LUTS.get(sig);
  if (!lut) { lut = new Map(); LUTS.set(sig, lut); }
  return lut;
}

/** Best single-cell approximation of `c` with a shade glyph (4-bit-per-channel memo). */
function bestShade(c, pal) {
  const key = (((c >> 20) & 15) << 8) | (((c >> 12) & 15) << 4) | ((c >> 4) & 15);
  const lut = shadeLut(pal);
  let hit = lut.get(key);
  if (hit) return hit;
  let best = Infinity;
  for (let b = 0; b < 8; b++) {
    for (let f = 0; f < 16; f++) {
      for (const [ch, k] of SHADES) {
        if (k === 0 && f !== 0) continue; // ' ' only needs the background
        const d = distance2(c, mix(pal[b], pal[f], k));
        if (d < best) { best = d; hit = [ch, k === 0 ? pal[7] : pal[f], pal[b]]; }
      }
    }
    // A full block shows the foreground alone, so bright colors are reachable.
    for (let f = 8; f < 16; f++) {
      const d = distance2(c, pal[f]);
      if (d < best) { best = d; hit = ['█', pal[f], pal[b]]; }
    }
  }
  lut.set(key, hit);
  return hit;
}

function nearest(c, pal, n) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < n; i++) { const d = distance2(c, pal[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}

/**
 * Paint `img` (Int32Array, w × 2h pixels, row-major) onto `surface` at (ox, oy)
 * as ANSI art. `pal` is a 16-entry palette (VGA by default).
 */
export function ansify(surface, img, w, h, ox = 0, oy = 0, pal = VGA) {
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const top = img[(cy * 2) * w + cx], bot = img[(cy * 2 + 1) * w + cx];
      if (distance2(top, bot) > 2600) {
        // Sharp vertical edge inside the cell: a half block says it best.
        const ft = nearest(top, pal, 16), bb = nearest(bot, pal, 8);
        const fb = nearest(bot, pal, 16), bt = nearest(top, pal, 8);
        const e1 = distance2(top, pal[ft]) + distance2(bot, pal[bb]);
        const e2 = distance2(bot, pal[fb]) + distance2(top, pal[bt]);
        if (e1 <= e2) surface.set(ox + cx, oy + cy, '▀', pal[ft], pal[bb]);
        else surface.set(ox + cx, oy + cy, '▄', pal[fb], pal[bt]);
      } else {
        const [ch, fg, bg] = bestShade(mix(top, bot, 0.5), pal);
        surface.set(ox + cx, oy + cy, ch, fg, bg);
      }
    }
  }
}

/**
 * Block-letter logo: font pixels become full/half blocks with a per-row color
 * ramp and a drop shadow — the "ANSI logo" look. Returns { w, h } in cells.
 */
export function blockLogo(surface, x0, y0, mask, { sx = 2, ramp, shadow = 0x555555, shade = true } = {}) {
  const rows = Math.ceil(mask.h / 2);
  const W = mask.w * sx;
  const px = (x, y) => (y >= 0 && y < mask.h && x >= 0 && x < mask.w ? mask.bits[y * mask.w + x] : 0);
  for (let r = 0; r < rows; r++) {
    const top = r * 2, bot = r * 2 + 1;
    const cTop = ramp(top / Math.max(1, mask.h - 1)), cBot = ramp(bot / Math.max(1, mask.h - 1));
    for (let x = 0; x < W; x++) {
      const mx = Math.floor(x / sx);
      const a = px(mx, top), b = px(mx, bot);
      // Shadow first (one cell right, half a row down), only where the letter isn't.
      const sa = px(Math.floor((x - 1) / sx), top - 1), sb = px(Math.floor((x - 1) / sx), bot - 1);
      if (!a && !b && (sa || sb)) surface.set(x0 + x, y0 + r, shade ? '░' : '▒', shadow);
      if (a && b) surface.set(x0 + x, y0 + r, '█', cTop, undefined);
      else if (a) surface.set(x0 + x, y0 + r, '▀', cTop);
      else if (b) surface.set(x0 + x, y0 + r, '▄', cBot);
    }
  }
  return { w: W + 1, h: rows };
}

/** Double-line frame with a title, in BBS colors. */
export function frame(surface, x, y, w, h, color, title, titleColor) {
  if (w < 2 || h < 2) return;
  surface.text(x, y, '╔' + '═'.repeat(w - 2) + '╗', color);
  for (let i = 1; i < h - 1; i++) { surface.set(x, y + i, '║', color); surface.set(x + w - 1, y + i, '║', color); }
  surface.text(x, y + h - 1, '╚' + '═'.repeat(w - 2) + '╝', color);
  if (title && w > title.length + 6) surface.text(x + 3, y, `╡ ${title} ╞`.replace(/^╡ /, '╡ '), titleColor ?? color);
}
