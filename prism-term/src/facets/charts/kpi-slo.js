// KPI tiles that judge a value against alerting rules: SLO burn rates against their page and ticket
// thresholds, and alert rules walking OK → PENDING → FIRING. Pure functions of t % loop.
import { glyphs, safe, frame, putR, ATTR } from './_data.js';
import { phase, ease, plateau, cyclic } from './_loop.js';
import { stringWidth } from '../../width.js';

// Words are ink; muted only where it holds 4.5:1 on every palette (dark themes). Semantic color goes on glyphs.
const sub = (th) => (th.mode === 'light' ? th.ink : th.muted);

/** A meter on one row: bar to frac (0..1) in eighths, ink ticks at the given fractions, ASCII #/. with | ticks. */
function meter(b, g, th, x, y, w, frac, ticks = [], color = th.accent) {
  const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'], e = Math.round(Math.max(0, Math.min(1, frac)) * w * 8), full = Math.floor(e / 8), rem = e % 8;
  for (let i = 0; i < w; i++) {
    if (i < full) b.set(x + i, y, g.u ? '█' : '#', color);
    else if (i === full && rem && g.u) b.set(x + i, y, EIGHTHS[rem], color);
    else b.set(x + i, y, g.u ? '░' : '.', sub(th));
  }
  for (const k of ticks) { const tx = x + Math.min(w - 1, Math.round(k * (w - 1))); b.set(tx, y, g.u ? '┃' : '|', th.ink); }
}

/** A state mark: glyph in its semantic color, the word beside it in ink. Returns the end column. */
function state(b, th, x, y, gl, color, word, bold = true) {
  let cx = b.text(x, y, gl, color, undefined, ATTR.BOLD);
  if (word) cx = b.text(cx + 1, y, word, th.ink, undefined, bold ? ATTR.BOLD : 0);
  return cx;
}

// ── burn-rate tiles: 1h and 6h burn against their page / ticket thresholds, and the budget left ──
const BR_LOOP = 16, BR_RATE = 4, BR_P = BR_LOOP * BR_RATE, PAGE = 14.4, TICKET = 6, BUDGET_MIN = 43.2;

const burn = {
  id: 'charts-kpi-burn',
  since: '0.3.0',
  title: 'Burn-Rate Tiles',
  category: 'KPI Tiles',
  description: "An SLO's multi-window burn rates as tiles: 1h burn against its 14.4x page line, 6h burn against its 6x ticket line, and the error budget left, through an incident.",
  tags: ['slo', 'burn rate', 'error budget', 'alerting', 'kpi', 'multiwindow', 'sre'],
  kind: 'chart',
  size: { w: 80, h: 6 },
  minSize: { w: 44, h: 5 },
  loop: BR_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const n1 = cyclic(ctx, { seed: 301, amp: 1, period: BR_P }), n6 = cyclic(ctx, { seed: 302, amp: 1, period: BR_P });
    const MID = g.u ? '·' : '-', OK = g.check, UP = g.up, three = W >= 66, line = H >= 6, tileH = line ? H - 1 : H;
    const at = (T) => {
      const k = Math.floor(T * BR_RATE + 1e-9), inc = ease((T - 2) / 3) * (1 - ease((T - 8) / 3));
      const b1 = Math.max(0.4, 2.1 + 13.1 * inc + 0.12 * n1(k));
      const b6 = Math.max(0.3, 1.3 + 5.1 * ease((T - 3) / 6) * (1 - ease((T - 10) / 5)) + 0.05 * n6(k));
      const left = 62 - 7 * ease((T - 2) / 8) + 7 * ease((T - 12.5) / 3);   // the incident burns 7 pts; the 30-day window rolls it back out
      return { b1, b6, left };
    };
    const burnTile = (x, w, label, v, limit, word, sev) => {
      const inner = frame(b, x, 0, w, tileH, th.line, g, label, th.ink);
      const over = v >= limit, val = `${v.toFixed(1)}x`;
      b.text(inner.x, inner.y, val, th.ink, undefined, ATTR.BOLD);
      const st = over ? (sev === 2 ? [`${UP}${UP}`, th.neg, word.toUpperCase()] : [UP, th.warn, word]) : [OK, th.muted, 'ok'];
      const sw = stringWidth(st[0]) + 1 + stringWidth(st[2]);
      if (stringWidth(val) + 1 + sw <= inner.w) state(b, th, inner.x + inner.w - sw, inner.y, st[0], st[1], st[2]);
      if (inner.h >= 2) meter(b, g, th, inner.x, inner.y + 1, inner.w, v / (limit * 1.25), [0.8]);
      if (inner.h >= 3 && stringWidth(`${word} at ${limit}x`) <= inner.w) b.text(inner.x, inner.y + 2, `${word} at ${limit}x`, sub(th));
      return over;
    };
    return (t) => {
      const T = phase(t, BR_LOOP), s = at(T), n = three ? 3 : 2, tw = Math.floor(W / n);
      const xs = Array.from({ length: n }, (_, i) => [i * tw, i === n - 1 ? W - i * tw : tw - 1]);
      const paging = burnTile(xs[0][0], xs[0][1], '1h burn', s.b1, PAGE, 'page', 2);
      const ticket = three ? burnTile(xs[1][0], xs[1][1], '6h burn', s.b6, TICKET, 'ticket', 1) : s.b6 >= TICKET;
      const [bx, bw] = xs[n - 1], inner = frame(b, bx, 0, bw, tileH, th.line, g, 'budget left', th.ink);
      b.text(inner.x, inner.y, `${Math.round(s.left)}%`, th.ink, undefined, ATTR.BOLD);
      if (W >= 60) putR(b, inner.x + inner.w, inner.y, '30-day', sub(th));
      if (inner.h >= 2) meter(b, g, th, inner.x, inner.y + 1, inner.w, s.left / 100);
      const mins = `${(BUDGET_MIN * s.left / 100).toFixed(1)} of ${BUDGET_MIN} min`;
      if (inner.h >= 3 && stringWidth(mins) <= inner.w) b.text(inner.x, inner.y + 2, mins, sub(th));
      if (line) {
        const y = H - 1;
        let x = paging ? state(b, th, 0, y, `${UP}${UP}`, th.neg, 'PAGE') : ticket ? state(b, th, 0, y, UP, th.warn, 'ticket') : state(b, th, 0, y, OK, th.muted, 'ok');
        const why = paging ? `1h burn ${s.b1.toFixed(1)}x ${g.u ? '≥' : '>='} ${PAGE}x ${MID} budget ${Math.round(s.left)}% left` : ticket ? `6h burn ${s.b6.toFixed(1)}x ${g.u ? '≥' : '>='} ${TICKET}x` : `checkout availability SLO 99.9% ${MID} both windows under their lines`;
        const GE = g.u ? '≥' : '>=', ladder = paging ? [why, `1h burn ${s.b1.toFixed(1)}x ${GE} ${PAGE}x`, `1h burn ${s.b1.toFixed(1)}x`]
          : ticket ? [why, `6h burn ${s.b6.toFixed(1)}x`] : [why, `SLO 99.9% ${MID} both windows under their lines`, `SLO 99.9% ${MID} under both lines`, 'SLO 99.9%'];
        const fits = ladder.find((w) => x + 2 + stringWidth(w) <= W);
        if (fits) b.text(x + 2, y, fits, sub(th));
      }
    };
  },
};

// ── alert rule tiles: a value against warn / crit with a pending "for" timer ─────────────────────
const AL_LOOP = 18, AL_SCALE = 20, AL_DT = 0.05;   // one facet second is 20 s of rule time
const RULES = [
  { name: 'HighLatency', unit: ' ms', tu: '', warn: 300, crit: 500, forS: 120, fmt: (v) => `${Math.round(v)}`, v: (T, n) => 240 + 172 * ease((T - 1.5) / 3.5) * (1 - ease((T - 12) / 2.5)) + 5 * n },
  { name: 'ErrorRate', unit: '%', tu: '%', warn: 1, crit: 5, forS: 120, fmt: (v) => v.toFixed(2), v: (T, n) => 0.7 + 0.55 * (plateau(T / AL_LOOP, 4.6 / 18, 6.2 / 18, 0.02) + plateau(T / AL_LOOP, 8.0 / 18, 9.7 / 18, 0.02)) + 0.04 * n },
  { name: 'QueueDepth', unit: '', tu: '', warn: 1000, crit: 5000, forS: 300, fmt: (v) => `${Math.round(v)}`, v: (T, n) => 460 + 90 * n },
  { name: 'DiskUsage', unit: '%', tu: '%', warn: 80, crit: 90, forS: 600, fmt: (v) => v.toFixed(0), v: (T, n) => 62 + 0.8 * n },
];
const kfmt = (v) => (v >= 1000 && v % 1000 === 0 ? `${v / 1000}k` : String(v));
const dur = (s) => (s < 60 ? `${Math.floor(s)}s` : s % 60 < 1 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`);

const alert = {
  id: 'charts-kpi-alert',
  since: '0.3.0',
  title: 'Alert Rule Tiles',
  category: 'KPI Tiles',
  description: 'Four alert rules as tiles: each value against its warn and crit lines with a pending "for" timer, so a breach walks OK, PENDING, FIRING while a flapping rule resets.',
  tags: ['alerting', 'alert rules', 'pending', 'firing', 'thresholds', 'kpi', 'monitoring'],
  kind: 'chart',
  size: { w: 80, h: 7 },
  minSize: { w: 44, h: 6 },
  loop: AL_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const noise = RULES.map((_, i) => cyclic(ctx, { seed: 311 + i, amp: 1, period: AL_LOOP * 4 }));
    const value = (i, T) => RULES[i].v(T, noise[i](Math.floor(T * 4 + 1e-9)));
    // the rule state machine, stepped once over the loop: [state, seconds in it] per sample
    const N = Math.round(AL_LOOP / AL_DT), tl = RULES.map((r, i) => {
      const out = [];
      let st = 'ok', since = 0;
      for (let k = 0; k < N; k++) {
        const T = k * AL_DT, over = value(i, T) >= r.warn;
        if (over && st === 'ok') { st = 'pending'; since = T; } else if (over && st === 'resolved') { st = 'pending'; since = T; }
        else if (!over && st === 'pending') { st = 'ok'; since = T; } else if (!over && st === 'firing') { st = 'resolved'; since = T; }
        else if (st === 'pending' && (T - since) * AL_SCALE >= r.forS) { st = 'firing'; since = T; }
        else if (st === 'resolved' && T - since >= 1.6) { st = 'ok'; since = T; }
        out.push([st, (T - since) * AL_SCALE]);
      }
      return out;
    });
    const n = W >= 76 ? 4 : 2, tw = Math.floor(W / n), thresholds = H >= 7;
    const PEND = g.u ? '◐' : '~', DOT = g.u ? '●' : '*';
    return (t) => {
      const T = phase(t, AL_LOOP), k = Math.min(N - 1, Math.floor(T / AL_DT + 1e-9));
      for (let i = 0; i < n; i++) {
        const r = RULES[i], v = value(i, T), [st, secs] = tl[i][k], x = i * tw, w = i === n - 1 ? W - x : tw - 1;
        const inner = frame(b, x, 0, w, H, st === 'firing' ? th.ink : th.line, g, r.name, th.ink);
        let y = inner.y;
        b.text(inner.x, y++, `${r.fmt(v)}${r.unit}`, th.ink, undefined, ATTR.BOLD);
        if (thresholds) b.text(inner.x, y++, `warn ${kfmt(r.warn)}${r.tu} crit ${kfmt(r.crit)}${r.tu}`, sub(th));
        const top = r.crit * 1.25;
        meter(b, g, th, inner.x, y++, inner.w, v / top, [r.warn / top, r.crit / top]);
        const sy = inner.y + inner.h - 1, forTxt = dur(r.forS);
        if (y < sy) b.text(inner.x, y, `for ${forTxt}`, sub(th));
        if (st === 'pending') { const s = [`PENDING ${dur(secs)}/${forTxt}`, `PENDING ${dur(secs)}`, `PEND ${dur(secs)}`].find((o) => stringWidth(o) + 2 <= inner.w) ?? `${dur(secs)}`; state(b, th, inner.x, sy, PEND, th.warn, s); }
        else if (st === 'firing') state(b, th, inner.x, sy, g.up, th.neg, `FIRING ${dur(secs)}`);
        else if (st === 'resolved') state(b, th, inner.x, sy, g.check, th.pos, 'RESOLVED');
        else state(b, th, inner.x, sy, DOT, th.muted, 'OK', false);
      }
    };
  },
};

export default [burn, alert];
