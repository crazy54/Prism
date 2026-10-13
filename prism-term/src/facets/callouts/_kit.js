// Shared TUI kit for the ai / diagrams / callouts / input galleries.
//
// Glyph tables with 7-bit ASCII twins (so every facet degrades cleanly on
// TERM=linux / LANG=C), bordered panels that switch to +-| when Unicode is
// off, timing helpers for scripted "user" interactions, and a few small
// drawing primitives (bars, centered text, scrollbars) these facets share.

import { box as rawBox } from '../../widgets/box.js';
import { ATTR } from '../../buffer.js';
import { NONE, mix } from '../../color.js';
import { stringWidth, truncate } from '../../width.js';

export { ATTR, NONE, mix, stringWidth, truncate };

/** True unless the terminal can't do Unicode. */
export const uni = (ctx) => ctx.caps?.unicode !== false;

const UNI = {
  check: '✔', cross: '✖', dot: '●', ring: '○', radioOn: '◉', radioOff: '○',
  boxOn: '[✓]', boxOff: '[ ]', boxPart: '[-]',
  pointer: '❯', caret: '›', tri: '▸', triDown: '▾', triUp: '▴', triLeft: '◂',
  right: '→', left: '←', up: '↑', down: '↓', enter: '⏎',
  bullet: '•', mid: '·', ellipsis: '…', star: '★', diamond: '◆', spark: '✦',
  bar: '▌', lbar: '▎', block: '█', shade: '░', shade2: '▒', half: '▄',
  h: '─', v: '│', hh: '━', vv: '┃', dh: '═', dash: '╌', dot3: '┄',
  tee: '├', elbow: '└', teeEnd: '└', branch: '├──', last: '└──', pipe: '│  ', gap: '   ',
  sortUp: '▲', sortDown: '▼', info: 'ℹ', warn: '▲', bang: '!', lock: '●',
  knob: '●', trackOn: '━', trackOff: '─', cursor: '▌', blockCursor: '█',
};

const ASC = {
  check: '+', cross: 'x', dot: '*', ring: 'o', radioOn: '(*)', radioOff: '( )',
  boxOn: '[x]', boxOff: '[ ]', boxPart: '[-]',
  pointer: '>', caret: '>', tri: '>', triDown: 'v', triUp: '^', triLeft: '<',
  right: '->', left: '<-', up: '^', down: 'v', enter: 'RET',
  bullet: '*', mid: '.', ellipsis: '...', star: '*', diamond: '*', spark: '*',
  bar: '|', lbar: '|', block: '#', shade: '.', shade2: ':', half: '_',
  h: '-', v: '|', hh: '=', vv: '|', dh: '=', dash: '-', dot3: '.',
  tee: '|', elbow: '`', teeEnd: '`', branch: '|--', last: '`--', pipe: '|  ', gap: '   ',
  sortUp: '^', sortDown: 'v', info: 'i', warn: '!', bang: '!', lock: '*',
  knob: 'O', trackOn: '=', trackOff: '-', cursor: '_', blockCursor: '#',
};

/** Glyph table for this terminal. Multi-cell ASCII twins are noted in callers. */
export const glyphs = (ctx) => (uni(ctx) ? UNI : ASC);

/** Border style name, falling back to ASCII when Unicode is off. */
export const bstyle = (ctx, style = 'round') => (uni(ctx) ? style : 'ascii');

/** Ellipsis for this terminal: '…', or '...' when Unicode is off. */
export const ell = (ctx) => (uni(ctx) ? '…' : '...');

/** truncate() to `w` columns with this terminal's ellipsis. */
export function clip(ctx, str, w) {
  const s = String(str);
  if (uni(ctx) || stringWidth(s) <= w) return truncate(s, Math.max(0, w));
  return w >= 6 ? truncate(s, w, '...') : truncate(s, Math.max(0, w - 1), '') + (w > 0 ? '.' : '');
}

/** Bordered panel (widgets/box) that knows about ctx (theme + ASCII fallback). Returns the interior View. */
export function panel(ctx, s, x, y, w, h, opts = {}) {
  const o = { theme: ctx.theme, ...opts, style: bstyle(ctx, opts.style || 'round') };
  // box.js truncates labels with '…'; pre-clip so ASCII terminals stay 7-bit.
  if (!uni(ctx)) for (const k of ['title', 'footer']) if (o[k]) o[k] = clip(ctx, o[k], Math.max(0, w - 4));
  return rawBox(s, x, y, w, h, o);
}

/** Seconds into the current loop. */
export const phase = (t, loop) => ((t % loop) + loop) % loop;

/** Characters of `text` revealed at `cps` chars/second starting at `start`. */
export function typed(text, t, start = 0, cps = 18) {
  if (t < start) return '';
  return [...text].slice(0, Math.floor((t - start) * cps)).join('');
}

/** Cursor blink: on for the first ~60% of each period. */
export const blink = (t, period = 1) => phase(t, period) < period * 0.6;

/** 0→1 over [a, b], clamped. */
export const span = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));

/** Smoothstep 0→1 over [a, b]. */
export const ease = (t, a, b) => { const k = span(t, a, b); return k * k * (3 - 2 * k); };

/** Index of the last schedule entry whose time is ≤ t (−1 before the first). */
export function stepAt(t, times) {
  let i = -1;
  for (let k = 0; k < times.length; k++) if (t >= times[k]) i = k;
  return i;
}

const BRAILLE_SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const ASCII_SPIN = '|/-\\';
/** One-cell spinner glyph. */
export const spin = (ctx, t, speed = 1) => (uni(ctx) ? BRAILLE_SPIN[Math.floor(t * 12 * speed) % 10] : ASCII_SPIN[Math.floor(t * 8 * speed) % 4]);

/** Pad / clip a plain string to exactly `w` columns (pass ctx for an ASCII-safe ellipsis). */
export function fit(str, w, how = 'left', ctx) {
  const s = ctx ? clip(ctx, str, Math.max(0, w)) : truncate(String(str), Math.max(0, w));
  const gap = Math.max(0, w - stringWidth(s));
  if (how === 'right') return ' '.repeat(gap) + s;
  if (how === 'center') return ' '.repeat(gap >> 1) + s + ' '.repeat(gap - (gap >> 1));
  return s + ' '.repeat(gap);
}

/** Write text centered in [x, x+w) (pass ctx for an ASCII-safe ellipsis). */
export function center(s, x, y, w, str, fg, bg, attr, ctx) {
  const t = ctx ? clip(ctx, str, Math.max(0, w)) : truncate(String(str), Math.max(0, w));
  return s.text(x + Math.max(0, Math.floor((w - stringWidth(t)) / 2)), y, t, fg, bg, attr);
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
/** Horizontal bar with eighth-cell precision (#/. in ASCII). Returns the filled cell count. */
export function hbar(ctx, s, x, y, w, frac, fg, trackColor) {
  const f = Math.max(0, Math.min(1, frac)) * w;
  const full = Math.floor(f), rem = f - full;
  const u = uni(ctx);
  const tc = trackColor ?? mix(ctx.theme.bg, fg, 0.28);
  for (let i = 0; i < w; i++) {
    if (i < full) s.set(x + i, y, u ? '█' : '#', fg);
    else if (i === full && u && rem >= 1 / 16) s.set(x + i, y, EIGHTHS[Math.max(1, Math.round(rem * 8))], fg);
    else s.set(x + i, y, u ? '░' : '.', tc);
  }
  return full;
}

/** Vertical scrollbar in column x for a list window. */
export function scrollbar(ctx, s, x, y, h, total, first, visible) {
  if (total <= visible || h < 2) return;
  const u = uni(ctx);
  const th = Math.max(1, Math.round((visible / total) * h));
  const top = Math.round((first / Math.max(1, total - visible)) * (h - th));
  for (let i = 0; i < h; i++) {
    const on = i >= top && i < top + th;
    s.set(x, y + i, on ? (u ? '┃' : '#') : (u ? '│' : '|'), on ? ctx.theme.muted : ctx.theme.line);
  }
}

/** Soft background tint of a theme color. */
export const tint = (ctx, c, k = 0.18) => mix(ctx.theme.bg, c, k);

/** Draw a `[ Label ]` button; focused buttons are filled with the accent. Returns width. */
export function button(ctx, s, x, y, label, { focused = false, color, pressed = false } = {}) {
  const th = ctx.theme;
  const c = color ?? th.accent;
  const text = uni(ctx) ? ` ${label} ` : `[ ${label} ]`;
  if (focused) s.text(x, y, text, pressed ? th.ink : th.bg, pressed ? mix(c, th.bg, 0.35) : c, ATTR.BOLD);
  else s.text(x, y, text, th.ink, uni(ctx) ? th.panel2 : undefined, 0);
  return stringWidth(text);
}

/** Simple keyword-ish syntax coloring for one line of JS/TS/Python/shell-like code. */
const KW = /\b(const|let|var|function|return|if|else|for|while|import|from|export|default|async|await|class|new|def|in|of|true|false|null|None|self|try|catch|throw)\b/g;
export function codeLine(ctx, s, x, y, w, line, bg) {
  const th = ctx.theme;
  const str = clip(ctx, line, Math.max(0, w));
  const colors = new Array([...str].length).fill(th.ink);
  const chars = [...str];
  const mark = (re, c) => { for (const m of str.matchAll(re)) for (let i = m.index; i < m.index + m[0].length && i < colors.length; i++) colors[i] = c; };
  mark(/\b\d+(\.\d+)?\b/g, th.warn);
  mark(KW, th.crit);
  mark(/\b[A-Za-z_]\w*(?=\()/g, th.info);
  mark(/(['"`]).*?\1/g, th.pos);
  mark(/(\/\/|#).*$/g, th.dim);
  let cx = x;
  chars.forEach((ch, i) => { cx = s.text(cx, y, ch, colors[i], bg); });
  return cx;
}
