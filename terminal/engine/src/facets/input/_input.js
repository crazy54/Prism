// Shared bits for the input gallery: a scripted "user", a dimmed backdrop for
// dialogs, and a prompt-line renderer.
export * from '../callouts/_kit.js';
import { mix, uni, ATTR, panel, clip, stringWidth } from '../callouts/_kit.js';

const BACK = [
  ['INFO', 'checkout-api', 'GET /cart 200 41ms'],
  ['INFO', 'payments-worker', 'charge ok order=88412 312ms'],
  ['WARN', 'checkout-api', 'db pool wait 840ms (20/20 in use)'],
  ['INFO', 'search-api', 'GET /search?q=tent 200 22ms'],
  ['INFO', 'gateway', 'POST /checkout 201 212ms'],
  ['ERROR', 'checkout-api', 'timeout acquiring connection after 5000ms'],
  ['INFO', 'inventory', 'reserve sku=TNT-2P qty=1 ok'],
  ['INFO', 'gateway', 'GET /account 200 34ms'],
  ['WARN', 'payments-worker', 'retrying charge order=88415 attempt=2'],
  ['INFO', 'search-api', 'reindex shard 3/8 done'],
];

/** Dimmed app content (a log view) behind modals so they read as overlays. */
export function backdrop(ctx, s, t = 0) {
  const th = ctx.theme;
  const ink = mix(th.bg, th.muted, 0.3);
  const lvl = { INFO: mix(th.bg, th.info, 0.3), WARN: mix(th.bg, th.warn, 0.35), ERROR: mix(th.bg, th.neg, 0.4) };
  const base = Math.floor(t / 1.5);
  for (let y = 0; y < (s.height ?? ctx.height); y++) {
    const [level, svc, msg] = BACK[(y + base) % BACK.length];
    const sec = 31 + y + base;
    const ts = `12:04:${String(sec % 60).padStart(2, '0')}`;
    let x = s.text(0, y, ts, ink);
    x = s.text(x + 1, y, level.padEnd(5), lvl[level]);
    x = s.text(x + 1, y, svc.padEnd(15), ink);
    s.text(x + 1, y, msg, ink);
  }
}

/** Fill a dialog rectangle with the panel color (clears what's behind). */
export function clearRect(ctx, s, x, y, w, h, bg) {
  s.fill(x, y, w, h, ' ', undefined, bg ?? ctx.theme.panel);
}

/** "? Question  answer" prompt line, in the style of inquirer/gum/clack. */
export function promptLine(ctx, s, x, y, question, { state = 'active', answer = '' } = {}) {
  const th = ctx.theme, u = uni(ctx);
  const mark = state === 'done' ? (u ? '✔' : '+') : state === 'error' ? (u ? '✖' : 'x') : '?';
  const c = state === 'done' ? th.pos : state === 'error' ? th.neg : th.accent;
  let cx = s.text(x, y, mark, c, undefined, ATTR.BOLD);
  cx = s.text(cx + 1, y, question, th.ink, undefined, ATTR.BOLD);
  if (answer) s.text(cx + 1, y, clip(ctx, answer, Math.max(0, (s.width ?? ctx.width) - cx - 1)), state === 'done' ? th.accent : th.muted);
  return cx;
}

/** Case-insensitive subsequence match: returns matched indices or null, plus a score (contiguous + early is better). */
export function fuzzyMatch(q, s) {
  q = q.toLowerCase();
  if (!q) return { idx: [], score: 0 };
  const idx = [];
  let j = 0;
  for (let i = 0; i < s.length && j < q.length; i++) if (s[i].toLowerCase() === q[j]) { idx.push(i); j++; }
  if (j < q.length) return null;
  let score = 0;
  for (let k = 1; k < idx.length; k++) score += idx[k] === idx[k - 1] + 1 ? 3 : 0;
  score -= idx[0] * 0.05 + s.length * 0.01;
  return { idx, score };
}

/**
 * A modal dialog: a soft drop shadow over whatever is behind it, then a filled
 * panel. `enter` (0→1) slides it down into place. Returns the interior View.
 */
export function modal(ctx, s, x, y, w, h, opts = {}) {
  const th = ctx.theme;
  const { enter = 1, ...rest } = opts;
  const yy = y - Math.round((1 - enter) * 2);
  // Depth from light: a soft scrim behind dialogs, barely there by Day.
  const shade = mix(th.bg, 0x000000, th.mode === 'light' ? 0.06 : 0.35);
  for (let r = 1; r <= h; r++) {
    for (let c = 2; c <= w + 1; c++) {
      if (r < h && c < w) continue;
      const cell = s.get(x + c, yy + r);
      if (cell) s.set(x + c, yy + r, undefined, mix(shade, cell.fg < 0 ? th.muted : cell.fg, 0.35), shade);
    }
  }
  return panel(ctx, s, x, yy, w, h, { bg: th.panel, ...rest });
}

/** Join picked items for a collapsed answer, ending "+N" when they don't all fit in `w`. */
export function listAnswer(items, w) {
  for (let n = items.length; n > 0; n--) {
    const s = items.slice(0, n).join(', ') + (n < items.length ? ` +${items.length - n}` : '');
    if (stringWidth(s) <= w) return s;
  }
  return `${items.length} selected`;
}
