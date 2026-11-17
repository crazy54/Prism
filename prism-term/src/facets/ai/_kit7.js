// Shared bits for the B7 ai facets. The text-colour rule, whole-hint fitting and ink-inverse selection come from
// the B6 kit; added here: mark glyphs with 7-bit twins, number formats, styled runs that never pass the edge,
// a row fitter that drops the least needed rows first, and the reset beats (divider, wipe, scroll, clear, collapse,
// fade) that end each loop on its own start frame, so the wrap itself changes nothing.
import { CellBuffer } from '../../buffer.js';
import { ATTR, uni, stringWidth, clip } from './_ai.js';

export { sub, fitText, inv } from '../input/_kit6.js';

/** A mark glyph: the Unicode one in `color`, or its 7-bit twin, drawn in ink when the twin is a letter or digit. */
export function mark(ctx, s, x, y, u, a, color, attr = ATTR.BOLD) {
  const ch = uni(ctx) ? u : a;
  return s.text(x, y, ch, /[A-Za-z0-9]/.test(ch) ? ctx.theme.ink : color, undefined, attr);
}

/** A fixed pseudo-random number in [0, 1) for (i, k): an integer mix, so different k give unrelated draws. */
export function hash01(i, k = 0) {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(k + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 3104 -> "3,104". */
export const comma = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 12400 -> "12.4k", 980 -> "980". */
export const kilo = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

/**
 * Styled runs [[text, fg, attr, optional], ...] from x within w columns. A run that doesn't fit is clipped with
 * this terminal's ellipsis, or left out whole when it is optional, and the runs after it are dropped.
 * Returns the column after the last glyph.
 */
export function runs(ctx, s, x, y, w, parts) {
  let cx = x;
  const end = x + w;
  for (const part of parts) {
    if (!part || !part[0]) continue;
    const [text, fg, attr, optional] = part, room = end - cx;
    if (room <= 0) break;
    if (stringWidth(text) <= room) { cx = s.text(cx, y, text, fg, undefined, attr); continue; }
    if (!optional) cx = s.text(cx, y, clip(ctx, text, room), fg, undefined, attr);
    break;
  }
  return cx;
}

/** Total width of styled runs. */
export const runsWidth = (parts) => parts.reduce((n, p) => n + (p && p[0] ? stringWidth(p[0]) : 0), 0);

/**
 * Lay styled pieces [{ t, fg, attr }] out in rows of w columns, word-wrap style. A piece that starts without a
 * space stays on the row of the piece before it (so "start" and "." wrap together); a word that would cross the
 * edge starts the next row with its leading spaces dropped; a word wider than a row is split.
 * Returns rows of [{ x, t, fg, attr }].
 */
export function flow(items, w) {
  const words = [];
  for (const it of items) {
    if (!it.t) continue;
    if (!words.length || /^\s/.test(it.t)) words.push([]);
    words[words.length - 1].push(it);
  }
  const rows = [[]];
  let x = 0;
  for (const word of words) {
    const width = word.reduce((n, it) => n + stringWidth(it.t), 0);
    if (x + width > w && x > 0) { rows.push([]); x = 0; }
    word.forEach((it, i) => {
      let t = x === 0 && i === 0 ? it.t.replace(/^\s+/, '') : it.t;
      while (stringWidth(t) > w - x && t) {
        if (x > 0 && stringWidth(t) <= w) { rows.push([]); x = 0; continue; }
        const cut = [...t].slice(0, Math.max(1, w - x)).join('');
        rows[rows.length - 1].push({ ...it, x, t: cut });
        rows.push([]); x = 0; t = t.slice(cut.length);
      }
      if (t) { rows[rows.length - 1].push({ ...it, x, t }); x += stringWidth(t); }
    });
  }
  return rows;
}

/** Text ending at column xr (exclusive). */
export const putR = (s, xr, y, text, fg, attr) => s.text(xr - stringWidth(text), y, text, fg, undefined, attr);

/**
 * Keep the rows that fit in h. Each row may carry `drop` (higher goes first; rows without it are kept longest);
 * on a tie the earlier row goes first. Order is preserved.
 */
export function fitRows(rows, h) {
  const keep = rows.slice();
  while (keep.length > h) {
    let k = -1;
    for (let i = 0; i < keep.length; i++) if ((keep[i].drop || 0) > 0 && (k < 0 || keep[i].drop > keep[k].drop)) k = i;
    if (k < 0) { keep.splice(0, keep.length - h); break; }
    keep.splice(k, 1);
  }
  return keep;
}

/** The value of the last [time, value] entry at or before p, or `fallback` before the first. */
export function last(p, script, fallback) {
  let v = fallback;
  for (const [t, x] of script) { if (t > p) break; v = x; }
  return v;
}

const SCRATCH = new WeakMap();
const scratch = (ctx, i, w, h) => {
  const pair = SCRATCH.get(ctx) || [];
  if (!pair[i] || pair[i].width !== w || pair[i].height !== h) pair[i] = new CellBuffer(w, h);
  SCRATCH.set(ctx, pair);
  return pair[i];
};
const blankRow = (b, y) => { for (let x = 0; x < b.width; x++) { const c = b.get(x, y); if (c.ch !== ' ' && c.ch !== '') return false; } return true; };

/**
 * The loop's reset beat, played between `from` and `to`: `end` is the frame at `from` and `start` the frame at 0,
 * both rendered into scratch buffers. plan(k, info) returns { rows, over }: per screen row the row it shows
 * ({ src: 'end' | 'start', y, fg?, mask?(x) } or null for blank), and text drawn on top ([{ x, y, text, fg, attr }]).
 * Rows are copied cell by cell, so nothing drawn as text is erased within a frame. Returns false outside the window.
 */
export function beat(ctx, s, draw, p, from, to, plan) {
  if (p < from || p >= to) return false;
  const W = s.width, H = s.height, A = scratch(ctx, 0, W, H), B = scratch(ctx, 1, W, H);
  A.clear(ctx.bg); draw(A, from);
  B.clear(ctx.bg); draw(B, 0);
  let last = -1;
  for (let y = 0; y < H; y++) if (!blankRow(A, y)) last = y;
  const { rows, over = [] } = plan((p - from) / (to - from), { W, H, last });
  // a row the start frame draws exactly as the end frame does stays put instead of blinking out and back
  for (let y = 0; y < H; y++) {
    let same = true;
    for (let x = 0; x < W && same; x++) { const a = A.get(x, y), c = B.get(x, y); same = a.ch === c.ch && a.fg === c.fg && a.bg === c.bg && a.attr === c.attr; }
    if (same) rows[y] = { src: 'end', y };
  }
  for (let y = 0; y < H; y++) {
    const r = rows[y];
    for (let x = 0; x < W; x++) {
      if (!r || (r.mask && r.mask(x))) { s.set(x, y, ' ', ctx.theme.ink, ctx.bg, 0); continue; }
      const c = (r.src === 'start' ? B : A).get(x, r.y ?? y);
      s.set(x, y, c.ch, r.fg !== undefined && /[A-Za-z0-9]/.test(c.ch) ? r.fg : c.fg, c.bg, c.attr | (r.attr || 0));
    }
  }
  for (const o of over) s.text(o.x, o.y, o.text, o.fg, undefined, o.attr);
  return true;
}

const rule = (ctx, W, label, half) => {
  const H = ctx.caps?.unicode === false ? '-' : '─', mid = ` ${label} `, n = Math.max(0, Math.min(Math.floor((W - mid.length) / 2), half));
  const text = H.repeat(n) + mid + H.repeat(n);
  return { x: Math.max(0, Math.floor((W - text.length) / 2)), text: text.slice(0, W) };
};
const same = (src, H) => Array.from({ length: H }, (_, y) => ({ src, y }));

/** Ready-made beats; each ends on the start frame for its last tenth. */
export const BEATS = {
  /** "── label ──" draws under the content, the rows above clear top to bottom, then the start frame. */
  divider: (ctx, label) => (k, { W, H, last }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const dy = Math.min(H - 1, last + 1), grow = Math.min(1, k / 0.3), cleared = k < 0.3 ? 0 : Math.ceil(((k - 0.3) / 0.6) * dy);
    const rows = same('end', H).map((r, y) => (y < cleared || y === dy ? null : r)), d = rule(ctx, W, label, Math.ceil(grow * W / 2));
    return { rows, over: [{ ...d, y: dy, fg: ctx.theme.mode === 'light' ? ctx.theme.ink : ctx.theme.muted }] };
  },
  /** A "── label ──" divider rises from the bottom, wiping the rows below it. */
  wipeUp: (ctx, label) => (k, { W, H }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const dy = H - 1 - Math.floor((k / 0.9) * H), d = rule(ctx, W, label, W);
    return { rows: same('end', H).map((r, y) => (y >= dy ? null : r)), over: dy >= 0 ? [{ ...d, y: dy, fg: ctx.theme.mode === 'light' ? ctx.theme.ink : ctx.theme.muted }] : [] };
  },
  /** Rows from `keep` down scroll up and off the top of their area. */
  scroll: (keep = 0) => (k, { H }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const n = Math.floor((k / 0.9) * (H - keep + 1));
    return { rows: Array.from({ length: H }, (_, y) => (y < keep ? { src: 'end', y } : y + n < H ? { src: 'end', y: y + n } : null)) };
  },
  /** Rows clear one after another, from the top or the bottom (rows above `keep` stay). */
  clear: (from = 'top', keep = 0) => (k, { H }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const n = Math.ceil((k / 0.9) * (H - keep));
    return { rows: same('end', H).map((r, y) => (y < keep ? r : (from === 'top' ? y - keep < n : H - 1 - y < n) ? null : r)) };
  },
  /** Everything below `row` folds up into it, then it clears too. */
  collapse: (row = 0) => (k, { H, last }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const below = Math.max(0, last - row), n = Math.ceil(Math.min(1, k / 0.65) * below);
    return { rows: same('end', H).map((r, y) => (y > last - n || (k >= 0.7 && y === row) ? null : r)) };
  },
  /** Text turns to `fg` (muted by Night) and italic, so the fade also reads without colour; then the rows clear. */
  fade: (fg) => (k, { H }) => {
    if (k >= 0.9) return { rows: same('start', H) };
    const n = k < 0.4 ? 0 : Math.ceil(((k - 0.4) / 0.5) * H);
    return { rows: same('end', H).map((r, y) => (y < n ? null : { ...r, fg, attr: ATTR.ITALIC })) };
  },
};
