// Unit and center-zero meters: a connection pool counted slot by slot against its hard limit, and clock
// offsets on a center-zero scale inside a tolerance band. Pure functions of t % loop.
import { glyphs, safe, putR, ATTR } from './_data.js';
import { phase, ease, cyclic } from './_loop.js';
import { stringWidth } from '../../width.js';

// Words are ink; muted only where it holds 4.5:1 on every palette (dark themes). Semantic color goes on glyphs.
const sub = (th) => (th.mode === 'light' ? th.ink : th.muted);

// ── connection pool: one cell per slot against a hard limit, waiters queued past it ──────────────
const PM_LOOP = 14, PM_RATE = 4, PM_P = PM_LOOP * PM_RATE;
const POOLS = [
  { name: 'primary', limit: 30, base: 11, peak: 36.4, seed: 201 },
  { name: 'replica', limit: 20, base: 6, peak: 15, seed: 202 },
];

const poolMeter = {
  id: 'charts-pool-meter',
  since: '0.3.0',
  title: 'Connection Pool Meter',
  category: 'Gauges & Meters',
  description: 'A database connection pool counted slot by slot against its hard limit: in-use climbs with load until every slot fills, then waiters queue past the limit.',
  tags: ['connection pool', 'database', 'saturation', 'unit meter', 'capacity', 'queue'],
  kind: 'chart',
  size: { w: 72, h: 8 },
  minSize: { w: 40, h: 4 },
  loop: PM_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const noise = POOLS.map((p) => cyclic(ctx, { seed: p.seed, amp: 1, period: PM_P }));
    const pools = H >= 6 ? POOLS : POOLS.slice(0, 1), MID = g.u ? '·' : '-';
    const at = (i, T) => {
      const p = POOLS[i], u = T / PM_LOOP, k = Math.floor(T * PM_RATE + 1e-9);
      // load climbs over ~4 s, holds past the limit, then a burst drains it in ~1.5 s
      const load = ease((u - 0.07) / 0.29) * (1 - ease((u - 0.6) / 0.12));
      const demand = p.base + (p.peak - p.base) * load + 1.3 * noise[i](k);
      const inUse = Math.max(0, Math.min(p.limit, Math.round(demand))), waiting = Math.max(0, Math.round(demand - p.limit));
      const p95 = waiting ? Math.round(3 + 7.5 * waiting + 2 * Math.abs(noise[i](k + 7))) : Math.max(1, Math.round(2.4 + noise[i](k + 3)));
      return { ...p, inUse, waiting, p95, sat: inUse >= p.limit && waiting > 0 };
    };
    return (t) => {
      const T = phase(t, PM_LOOP);
      pools.forEach((_, i) => {
        const s = at(i, T), y = i * 3;
        // label row: the p95 readout drops first, then the words compact; the state word stays
        const long = `${s.name} ${s.inUse}/${s.limit} in use ${MID} ${s.waiting} waiting`, p95 = ` ${MID} p95 wait ${s.p95} ms`;
        const opts = [long + p95, long, `${s.name} ${s.inUse}/${s.limit} ${MID} ${s.waiting}w`];
        let stateW = s.sat ? 12 : 0, label = opts.find((o) => stringWidth(o) + stateW <= W);
        if (!label) { stateW = s.sat ? 2 : 0; label = opts.find((o) => stringWidth(o) + stateW <= W) ?? opts[2]; }
        b.text(0, y, label, th.ink);
        if (label.endsWith(p95)) b.text(stringWidth(label) - stringWidth(p95), y, p95, sub(th));
        b.text(0, y, s.name, th.ink, undefined, ATTR.BOLD);
        if (s.sat) {
          const x = W - stateW + 1;
          if (stateW > 2) b.text(x, y, 'SATURATED', th.ink, undefined, ATTR.BOLD);
          b.text(W - 1, y, g.up, th.neg, undefined, ATTR.BOLD);
        }
        // track: one cell per slot (2 columns when the whole limit plus its queue fits), the limit, the queue
        const qW = 9, cw = 2 * s.limit + 1 + qW <= W ? 2 : 1, xL = s.limit * cw;
        for (let j = 0; j < s.limit; j++) b.set(j * cw, y + 1, j < s.inUse ? '▮' : '▯', j < s.inUse ? th.accent : sub(th));
        b.set(xL, y + 1, '┃', th.ink);
        if (s.waiting) {
          let x = xL + 2;
          for (let j = 0; j < Math.min(3, s.waiting); j++) x = b.text(x, y + 1, '▸', th.warn);
          b.text(x + 1, y + 1, `+${s.waiting}`, th.ink, undefined, ATTR.BOLD);
        }
      });
      const ly = H - 1;
      if (ly > (pools.length - 1) * 3 + 1 && W >= 40) {
        let x = 0;
        for (const [gl, c, word] of [['▮', th.accent, 'in use'], ['▯', sub(th), 'idle'], ['┃', th.ink, 'limit'], ['▸', th.warn, 'waiting']]) {
          x = b.text(x, ly, gl, c); x = b.text(x + 1, ly, word, sub(th)) + 2;
        }
      }
    };
  },
};

// ── clock offset: center-zero meters inside a tolerance band, one host drifts and is stepped back ──
const OM_LOOP = 16, OM_RATE = 4, OM_P = OM_LOOP * OM_RATE, OM_RANGE = 50, OM_TOL = 10;
const HOSTS = ['web-01', 'web-02', 'db-01', 'db-02'], DRIFTER = 3, STEP_AT = 10, STEPPED_FOR = 3.5;

const offsetMeter = {
  id: 'charts-offset-meter',
  since: '0.3.0',
  title: 'Clock Offset Meter',
  category: 'Gauges & Meters',
  description: 'Clock offsets of four hosts on center-zero meters: bars grow behind or ahead of 0 inside a ±10 ms band with jitter whiskers, and one host drifts out until it is stepped.',
  tags: ['ntp', 'clock offset', 'time sync', 'center zero', 'tolerance', 'drift', 'jitter'],
  kind: 'chart',
  size: { w: 72, h: 9 },
  minSize: { w: 40, h: 5 },
  loop: OM_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const noise = HOSTS.map((_, i) => cyclic(ctx, { seed: 211 + i, amp: 1, period: OM_P }));
    const MINUS = g.u ? '−' : '-', BAR = g.u ? '━' : '=', SYNC = g.check, DRIFT = g.up, STEPPED = g.u ? '↺' : '@';
    const whiskers = W >= 66, ticks = W >= 56, words = W >= 50, step = H >= 9 ? 2 : 1;
    const nameW = W >= 60 ? 8 : 7, valueW = 9, stateW = words ? 11 : 2;
    let trackW = Math.max(9, W - nameW - valueW - stateW - 1);
    if (trackW % 2 === 0) trackW--;
    const tx = nameW, c0 = tx + (trackW - 1) / 2, per = (trackW - 1) / 2 / OM_RANGE;
    const col = (v) => c0 + Math.max(-OM_RANGE, Math.min(OM_RANGE, v)) * per;
    const fmt = (v) => `${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(1)} ms`;
    const host = (i, T) => {
      const k = Math.floor(T * OM_RATE + 1e-9);
      let off = (i === DRIFTER ? 1.4 : 3.2) * noise[i](k);
      if (i === DRIFTER && T >= 3 && T < STEP_AT) off += 27 * ease((T - 3) / 6);
      const jit = 1.4 + 0.9 * Math.sin(2 * Math.PI * (T / 8 + i / 4));
      const state = i === DRIFTER && T >= STEP_AT && T < STEP_AT + STEPPED_FOR ? 'stepped' : Math.abs(off) > OM_TOL ? 'drift' : 'synced';
      return { off, jit, state };
    };
    return (t) => {
      const T = phase(t, OM_LOOP);
      // scale row: ends, center, and interior ticks while there is room
      const placed = [], label = (x, s, color, attr = 0) => {
        const w = stringWidth(s);
        if (placed.some(([a, z]) => x < z + 1 && a < x + w + 1)) return;   // never touch a placed label
        placed.push([x, x + w]); b.text(x, 0, s, color, undefined, attr);
      };
      label(tx, `${MINUS}${OM_RANGE} ms`, th.ink);
      label(tx + trackW - stringWidth(`+${OM_RANGE} ms`), `+${OM_RANGE} ms`, th.ink);
      label(Math.round(c0), '0', th.ink, ATTR.BOLD);
      const tk = [-25, 25].map((v) => [Math.round(col(v)) - 1, `${v < 0 ? MINUS : '+'}${Math.abs(v)}`]);   // both or neither
      if (ticks && tk.every(([x, s]) => !placed.some(([a, z]) => x < z + 1 && a < x + stringWidth(s) + 1))) for (const [x, s] of tk) label(x, s, sub(th));
      HOSTS.forEach((name, i) => {
        const y = 1 + i * step;
        if (y >= H) return;
        const { off, jit, state } = host(i, T);
        b.text(0, y, name.slice(0, nameW - 1), th.ink);
        for (const v of [-OM_TOL, OM_TOL]) b.set(Math.round(col(v)), y, g.u ? '┊' : ':', th.dim);
        b.set(Math.round(c0), y, g.v, sub(th));
        // the bar from zero, in half cells, on the warm pole ahead and the cool pole behind
        const half = Math.round(Math.abs(off) * per * 2), dir = off < 0 ? -1 : 1, color = off < 0 ? th.info : th.warn;
        for (let h = 1; h <= Math.floor(half / 2); h++) b.set(Math.round(c0) + dir * h, y, BAR, color);
        if (half % 2) b.set(Math.round(c0) + dir * (Math.floor(half / 2) + 1), y, g.u ? (dir > 0 ? '╸' : '╺') : '-', color);
        if (whiskers) {
          const a = Math.round(col(off - jit)), z = Math.round(col(off + jit)), tip = Math.round(col(off));
          for (let x = a + 1; x < z; x++) if (dir > 0 ? x > tip : x < tip) b.set(x, y, g.h, sub(th));
          if (z > a) { b.set(a, y, g.u ? '├' : '[', sub(th)); b.set(z, y, g.u ? '┤' : ']', sub(th)); }
        }
        putR(b, tx + trackW + 1 + valueW, y, fmt(off), th.ink, undefined, ATTR.BOLD);
        const sx = tx + trackW + 1 + valueW + 1, [gl, gc] = state === 'synced' ? [SYNC, th.pos] : state === 'drift' ? [DRIFT, th.warn] : [STEPPED, th.info];
        if (sx < W) b.text(sx, y, gl, gc, undefined, ATTR.BOLD);
        if (words && sx + 2 < W) b.text(sx + 2, y, state, th.ink);
      });
      if (step === 2 && H >= 9 && W >= 60) {
        let x = tx;
        x = b.text(x, H - 1, g.u ? '┊' : ':', th.dim); x = b.text(x + 1, H - 1, `${g.u ? '±' : '+/-'}${OM_TOL} ms tolerance`, sub(th)) + 2;
        if (whiskers) { x = b.text(x, H - 1, g.u ? '├─┤' : '[-]', sub(th)); x = b.text(x + 1, H - 1, 'jitter', sub(th)) + 2; }
        x = b.text(x, H - 1, g.u ? '◀' : '<', th.info); x = b.text(x + 1, H - 1, 'behind', sub(th)) + 2;
        x = b.text(x, H - 1, 'ahead', sub(th)); b.text(x + 1, H - 1, g.u ? '▶' : '>', th.warn);
      }
    };
  },
};

export default [poolMeter, offsetMeter];
