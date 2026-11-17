// Shared bits for the B6 input facets: the text-color rule, whole-hint fitting, ink-inverse selection, and a
// dimmed app drawn as glyph silhouettes (no words, so nothing behind a modal can read as low-contrast text).
import { ATTR, uni, stringWidth } from './_input.js';

/** Secondary text: muted by Night, ink by Day (muted is 4.00:1 on stock xterm-16 by Day). */
export const sub = (th) => (th.mode === 'light' ? th.ink : th.muted);

/** Draw the first option that fits in w columns; whole hints only. Returns the end column, or x when none fit. */
export function fitText(s, x, y, w, options, fg, bg, attr) {
  const o = options.find((t) => t && stringWidth(t) <= w);
  return o ? s.text(x, y, o, fg, bg, attr) : x;
}

/** Ink-inverse selection text (13:1 or better on every palette); accent belongs on the brackets around it. */
export const inv = (ctx, s, x, y, text, attr = 0) => s.text(x, y, text, ctx.theme.ink, undefined, ATTR.INVERSE | ATTR.BOLD | attr);

/** A dimmed app behind a modal: rule lines, bars and dot rows in th.dim. Glyphs only, never words. */
export function silhouette(ctx, s, w, h) {
  const th = ctx.theme, u = uni(ctx), H = u ? '─' : '-', BAR = u ? '▬' : '=', DOT = u ? '·' : '.';
  for (let y = 0; y < h; y++) {
    if (y === 0 || y === h - 1) { s.text(0, y, H.repeat(w), th.dim); continue; }
    const k = (y * 7) % 5, n = 6 + ((y * 13) % 17);
    s.text(2, y, BAR.repeat(Math.min(w - 4, n)), th.dim);
    if (w > n + 12) s.text(4 + n, y, DOT.repeat(Math.min(w - n - 8, 8 + k * 3)), th.dim);
  }
}
