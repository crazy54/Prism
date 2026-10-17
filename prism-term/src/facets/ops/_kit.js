// Shared kit for the Linux & Ops gallery.
//
// Ops facets imitate real tools, so they're mostly text laid out on a grid.
// Everything here is stateless — content is a pure function of t — which keeps
// facets deterministic, resize-safe, and able to jump to any moment (catalog
// thumbnails, snapshots, the curl site).
//
// ASCII mode (caps.unicode === false: TERM=linux, LANG=C, serial consoles):
// G() hands out 7-bit fallbacks, and the writer transliterates anything that
// slips through, one character for one character so columns never shift.

import { ATTR } from '../../buffer.js';
import { NONE, mix } from '../../color.js';

export { ATTR, NONE };

export const uni = (ctx) => ctx.caps?.unicode !== false;

/** Glyph set: Unicode where available, single-column ASCII otherwise. */
export function G(ctx) {
  return uni(ctx)
    ? { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘', tee: '├', teeL: '┤', teeT: '┬', teeB: '┴', cross: '┼',
      branch: '├─', last: '└─', pipe: '│ ', dot: '●', ring: '○', ok: '✓', bad: '✗', arrow: '→', up: '↑', down: '↓',
      full: '█', dark: '▓', mid: '▒', light: '░', ell: '…', deg: '°', bullet: '•', tri: '▸', pl: '', plThin: '',
      branchIcon: '', warn: '⚠', spark: '▁▂▃▄▅▆▇█', lt: '‹', gt: '›' }
    : { h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', tee: '+', teeL: '+', teeT: '+', teeB: '+', cross: '+',
      branch: '|-', last: '`-', pipe: '| ', dot: '*', ring: 'o', ok: '+', bad: 'x', arrow: '>', up: '^', down: 'v',
      full: '#', dark: '#', mid: '=', light: '.', ell: '.', deg: ' ', bullet: '*', tri: '>', pl: '>', plThin: '>',
      branchIcon: '', warn: '!', spark: '_.-=+*#@', lt: '<', gt: '>' };
}

/** Theme-derived terminal colors (what a 16-color scheme would call them). */
export function C(ctx) {
  const t = ctx.theme;
  return {
    fg: t.ink, muted: t.muted, dim: t.dim, line: t.line, bg: ctx.bg, panel: t.panel, panel2: t.panel2,
    // text ON a colored fill (status bars, selections): the theme's own background color, also
    // with --transparent (where bg is the terminal default and would vanish on the fill)
    onFill: t.bg,
    green: t.pos, red: t.neg, yellow: t.warn, blue: t.info, magenta: t.crit, accent: t.accent,
    cyan: mix(t.info, t.pos, 0.45), orange: mix(t.warn, t.neg, 0.4),
  };
}

// One-for-one transliteration so ASCII mode never shifts a column.
const ASCII_MAP = {
  '─': '-', '━': '-', '═': '=', '│': '|', '┃': '|', '║': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+',
  '┬': '+', '┴': '+', '┼': '+', '╭': '+', '╮': '+', '╰': '+', '╯': '+', '╔': '+', '╗': '+', '╚': '+', '╝': '+',
  '●': '*', '○': 'o', '◉': '@', '◯': 'o', '✓': '+', '✔': '+', '✗': 'x', '✖': 'x', '→': '>', '←': '<', '↑': '^', '↓': 'v',
  '█': '#', '▓': '#', '▒': '=', '░': '.', '▏': '|', '▎': '|', '▍': '|', '▌': '|', '▋': '|', '▊': '|', '▉': '#',
  '▁': '_', '▂': '_', '▃': '.', '▄': '-', '▅': '=', '▆': '+', '▇': '*', '…': '.', '°': ' ', '•': '*', '▸': '>', '▶': '>',
  '·': '.', '×': 'x', 'µ': 'u', '⚠': '!', '❯': '>', '❭': '>', '✘': 'x', '⇡': '^', '⇣': 'v', '±': '+', '⎈': '*', '–': '-', '—': '-', '‹': '<', '›': '>', '«': '<', '»': '>', '': '>', '': '>', '': ' ',
};
export function asciify(s) {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    out += cp >= 0x20 && cp <= 0x7e ? ch : ASCII_MAP[ch] ?? (cp < 0x20 ? ' ' : '?');
  }
  return out;
}

/** Text writer bound to a facet's surface: clips, and asciifies in ASCII mode. */
export function writer(ctx) {
  const b = ctx.buffer;
  const a = !uni(ctx);
  const W = () => b.width, H = () => b.height;
  const fix = (s) => (a ? asciify(s) : String(s));
  const put = (x, y, s, fg, bg, attr = 0) => (y < 0 || y >= b.height ? x + [...String(s)].length : b.text(x, y, fix(s), fg, bg, attr));
  return {
    put,
    /** Write [text, fg, attr?, bg?] segments left to right; returns the end column. */
    seg(x, y, parts) { for (const p of parts) if (p) x = put(x, y, p[0], p[1], p[3], p[2] || 0); return x; },
    /** Right-align text ending at column `xEnd` (exclusive). */
    right(xEnd, y, s, fg, bg, attr = 0) { const t = fix(s); return put(xEnd - [...t].length, y, t, fg, bg, attr); },
    fill(x, y, w, h, ch, fg, bg) { b.fill(x, y, w, h, ch, fg, bg); },
    rowBg(y, bg, x = 0, w = b.width) { b.fill(x, y, w, 1, ' ', undefined, bg); },
    hline(x, y, w, ch, fg) { if (w > 0) put(x, y, (a ? asciify(ch) : ch).repeat(w), fg); },
    get width() { return W(); },
    get height() { return H(); },
    ascii: a,
  };
}

// ── deterministic time → content helpers ────────────────────────────────────

/** Integer hash → [0, 1). Same inputs, same output, everywhere. */
export function hash(n, salt = 0) {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const pick = (arr, n, salt) => arr[Math.floor(hash(n, salt) * arr.length)];

/** Smooth wander in [0, 1] — meters that drift like real load. */
export function walk(ctx, key, t, speed = 0.35) {
  const v = ctx.noise.fbm(key * 7.31 + 0.5, t * speed, (ctx.seed || 0) * 0.13, 3);
  return Math.min(1, Math.max(0, 0.5 + v * 0.95));
}

/** Visible substring of `text` typed at `cps` starting at `start` seconds. */
export function typed(text, t, start = 0, cps = 18) {
  const n = Math.max(0, Math.floor((t - start) * cps));
  return { text: text.slice(0, n), done: n >= text.length, at: start + text.length / cps };
}

/** Blinking cursor state (500 ms phase). */
export const blink = (t, period = 1) => (t % period) < period / 2;

const BASE = Date.UTC(2026, 9, 13, 14, 2, 11) / 1000;
const z2 = (n) => String(n).padStart(2, '0');
/** Wall clock derived from t (UTC, fictional but stable). */
export function clock(t, offset = 0) {
  const s = Math.floor(BASE + offset + t);
  const d = new Date(s * 1000);
  return {
    hms: `${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}:${z2(d.getUTCSeconds())}`,
    hm: `${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}`,
    date: `${d.getUTCFullYear()}-${z2(d.getUTCMonth() + 1)}-${z2(d.getUTCDate())}`,
    day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
    mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()],
    dd: z2(d.getUTCDate()),
    sec: s,
  };
}

export const pad = (s, w) => { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); };
export const lpad = (s, w) => { s = String(s); return s.length >= w ? s.slice(-w) : ' '.repeat(w - s.length) + s; };
export const fixed = (n, d = 1) => Number(n).toFixed(d);
export function human(bytes, si = false) {
  const k = si ? 1000 : 1024, u = si ? ['B', 'kB', 'MB', 'GB', 'TB'] : ['B', 'K', 'M', 'G', 'T'];
  let i = 0;
  while (bytes >= k && i < u.length - 1) { bytes /= k; i++; }
  return `${bytes >= 100 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${u[i]}`;
}

/**
 * Stream of lines that arrive at `rate` per second; returns the last `rows`
 * line indices visible at t (stateless). `pre` lines are already on screen at t = 0.
 */
export function stream(t, rate, rows, pre = rows) {
  const total = pre + Math.floor(t * rate);
  const out = [];
  for (let i = Math.max(0, total - rows); i < total; i++) out.push(i);
  return out;
}

/**
 * htop-style meter: `label[|||||||        23.4%]`. parts: [{ v: 0..1, color }]
 * stacked left to right; `text` is right-aligned inside the brackets.
 */
export function meter(w, ctx, x, y, width, label, parts, text, { labelColor, bracketColor } = {}) {
  const c = C(ctx);
  const lab = label;
  let cx = w.put(x, y, lab, labelColor ?? c.cyan, undefined, ATTR.BOLD);
  cx = w.put(cx, y, '[', bracketColor ?? c.fg, undefined, ATTR.BOLD);
  const inner = Math.max(0, x + width - cx - 1);
  const t = String(text);
  let used = 0;
  for (const p of parts) {
    const n = Math.max(0, Math.min(inner - used, Math.round(p.v * inner)));
    if (n) w.put(cx + used, y, '|'.repeat(n), p.color);
    used += n;
  }
  const tx = cx + inner - t.length;
  if (inner > t.length + 1) w.put(tx, y, t, used > tx - cx ? c.fg : c.muted);
  w.put(cx + inner, y, ']', bracketColor ?? c.fg, undefined, ATTR.BOLD);
}

/** Simple sparkline over values in [0,1]; Unicode bars or an ASCII ramp. */
export function spark(w, ctx, x, y, values, color) {
  const g = G(ctx).spark;
  let s = '';
  for (const v of values) s += g[Math.max(0, Math.min(g.length - 1, Math.round(v * (g.length - 1))))];
  w.put(x, y, s, color);
}

/** A `user@host:dir$ ` prompt; returns the column after it. */
export function bashPrompt(w, ctx, x, y, { user = 'ops', host = 'node03', dir = '~', root = false } = {}) {
  const c = C(ctx);
  return w.seg(x, y, [[`${user}@${host}`, root ? c.red : c.green, ATTR.BOLD], [':', c.fg], [dir, c.blue, ATTR.BOLD], [root ? '# ' : '$ ', c.fg]]);
}

/**
 * Script a terminal session: a list of { cmd, out: (t, rows) => lines[], dur }
 * steps, typed then printed. Returns the visible lines (array of segment arrays)
 * ending at time t, newest last — callers draw the last `rows` of them.
 */
export function session(ctx, t, steps, { cps = 22, promptOpts = {}, gap = 0.6 } = {}) {
  const lines = [];
  let at = 0.3;
  // A step may carry its own `prompt` (the prompt it is typed at) and `after`
  // (the prompt once it finishes) — so prompts can show git state, exit codes, etc.
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const po = step.prompt ?? promptOpts;
    const ty = typed(step.cmd, t, at, cps);
    lines.push({ prompt: po, cmd: ty.text, cursor: !ty.done && t >= at, typing: true });
    if (!ty.done) return lines;
    const outStart = ty.at + 0.25 + (step.wait ?? 0);
    if (t < outStart) { lines.at(-1).cursor = blink(t, 0.8); return lines; }
    const out = step.out(t - outStart);
    for (const l of out) lines.push({ parts: l });
    at = outStart + (step.dur ?? 2.5) + gap;
    const next = step.after ?? steps[i + 1]?.prompt ?? po;
    if (t < at) { lines.push({ prompt: next, cmd: '', cursor: blink(t, 0.8) }); return lines; }
  }
  lines.push({ prompt: steps.at(-1)?.after ?? steps.at(-1)?.prompt ?? promptOpts, cmd: '', cursor: blink(t, 0.8) });
  return lines;
}

/** Draw session() lines into rows [y0, y0+rows) — the newest at the bottom, like a real terminal. */
export function drawSession(w, ctx, lines, x, y0, rows, promptFn = bashPrompt) {
  const c = C(ctx);
  const vis = lines.slice(-rows);
  vis.forEach((l, i) => {
    const y = y0 + i;
    if (l.parts) { w.seg(x, y, l.parts); return; }
    let cx = promptFn(w, ctx, x, y, l.prompt);
    cx = w.put(cx, y, l.cmd, c.fg);
    if (l.cursor) w.put(cx, y, ' ', c.bg, c.fg);
  });
}

/**
 * Split a segment line into rows of `width` cells, wrapping exactly as a tty
 * does (hard, mid-word). For real tool output that is genuinely longer than
 * the terminal — never for our own layout.
 */
export function wrapParts(parts, width) {
  const rows = [[]];
  let col = 0;
  for (const [text, ...rest] of parts) {
    let s = String(text);
    while (s.length) {
      if (col >= width) { rows.push([]); col = 0; }
      const take = s.slice(0, width - col);
      rows.at(-1).push([take, ...rest]);
      col += take.length;
      s = s.slice(take.length);
    }
  }
  return rows;
}
