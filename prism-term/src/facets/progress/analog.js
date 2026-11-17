// Analog — counting by mechanism: an electromechanical watt-hour meter through
// a net-zero solar day, a soroban abacus tallying builds, and a Go clock in
// byo-yomi handing the turn back and forth.
import { mix, NONE } from '../../color.js';
import { commas } from './_sim.js';
import { FONT47 } from './_fonts.js';

const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop draw identical frames. */
const loopT = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const easeOut = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - (1 - k) ** 3);
const hhmm = (h) => { const m = Math.floor((((h % 24) + 24) % 24) * 60 + 1e-6); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// ── watt-hour meter ──────────────────────────────────────────────────────────
const DAY_STEPS = 2400;
const gauss = (h, c, w) => { const d = ((h - c + 36) % 24) - 12; return Math.exp(-((d / w) ** 2)); };
const loadKW = (h) => 0.55 + 1.3 * gauss(h, 7.5, 0.8) + 0.5 * gauss(h, 12.5, 1.5) + 2.2 * gauss(h, 19.5, 1.6);
const sunUp = (h) => { const x = (((h % 24) + 24) % 24 - 6.5) / 13; return x > 0 && x < 1 ? Math.sin(Math.PI * x) ** 1.5 : 0; };
// Dial faces: [col, row] of numerals 0-9 around the hub of a clockwise dial; counter-clockwise dials mirror the columns.
const FACE_WIDE = [[0, -2], [3, -2], [4, -1], [4, 1], [3, 2], [0, 2], [-3, 2], [-4, 1], [-4, -1], [-3, -2]];
const FACE_MID = [[0, -2], [2, -2], [3, -1], [3, 1], [2, 2], [0, 2], [-2, 2], [-3, 1], [-3, -1], [-2, -2]];
const FACE_SMALL = [[0, -2], [2, -2], [2, -1], [2, 1], [2, 2], [0, 2], [-2, 2], [-2, 1], [-2, -1], [-2, -2]];

const kwhMeter = {
  id: 'progress-kwh-meter', title: 'Watt-Hour Meter', category: 'Counters & Odometers', order: 220, kind: 'progress',
  since: '0.3.0',
  description: 'An electric meter through a net-zero solar day in 24 s: five geared dials and the disc run forward at night and backward while the panels export.',
  tags: ['electric meter', 'kwh', 'solar', 'net metering', 'dials', 'energy', 'analog'],
  size: { w: 64, h: 14 }, minSize: { w: 40, h: 7 }, loop: 24, glyphs: 'braille', color: '256', canvas: 'line',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    // Net power over the day (h = 6 … 30), solar scaled so the day nets to exactly zero.
    let sl = 0, ss = 0;
    for (let i = 0; i < DAY_STEPS; i++) { const h = 6 + (24 * i) / DAY_STEPS; sl += loadKW(h); ss += sunUp(h); }
    const k = sl / ss, net = (h) => loadKW(h) - k * sunUp(h);
    const E = new Float64Array(DAY_STEPS + 1);                // energy since 06:00, kWh
    for (let i = 0; i < DAY_STEPS; i++) E[i + 1] = E[i] + net(6 + (24 * (i + 0.5)) / DAY_STEPS) * (24 / DAY_STEPS);
    const drift = E[DAY_STEPS];
    for (let i = 0; i <= DAY_STEPS; i++) E[i] -= drift * (i / DAY_STEPS);  // exact closure
    const energy = (tau) => { const x = (tau / 24) * DAY_STEPS, i = Math.min(DAY_STEPS - 1, Math.floor(x)); return E[i] + (E[i + 1] - E[i]) * (x - i); };
    const R0 = 4219.4;
    const big = W >= 56 && H >= 12;
    const framed = H >= 9;
    const dw = big ? Math.min(12, Math.floor((W - 4) / 5)) : Math.max(7, Math.floor((W - 2) / 5)), dh = 5;
    const dx0 = Math.floor((W - dw * 5) / 2), dy0 = big ? 2 : framed ? 1 : 0;
    const cv = ctx.canvas('line', { cols: W, rows: H });
    const pxX = cv.width / W, pxY = cv.height / H;
    // the widest face the dial's cells allow, keeping two blank columns between dials; the pointer stops short of it
    const face = dw >= 11 ? FACE_WIDE : dw >= 9 ? FACE_MID : FACE_SMALL, reach = dw >= 11 ? 2.5 : dw >= 9 ? 2 : 1.5;
    const hub = (i) => [dx0 + i * dw + (dw >> 1), dy0 + 2];
    const places = [10000, 1000, 100, 10, 1];
    const slotY = dy0 + dh + (big ? 2 : 0), slotW = Math.min(26, W - 18), slotX = Math.max(1, Math.floor((W - slotW) / 2) - (big ? 6 : 4));
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 24), h = 6 + tau, e = energy(tau), reading = R0 + e, p = net(h);
      if (framed) {                                          // the glass cover
        b.text(0, 0, (u ? '╭' : '+') + (u ? '─' : '-').repeat(W - 2) + (u ? '╮' : '+'), th.line);
        for (let y = 1; y < H - 1; y++) { b.set(0, y, u ? '│' : '|', th.line); b.set(W - 1, y, u ? '│' : '|', th.line); }
        b.text(0, H - 1, (u ? '╰' : '+') + (u ? '─' : '-').repeat(W - 2) + (u ? '╯' : '+'), th.line);
        b.text(2, big ? 1 : 0, 'kWh', th.ink, undefined, 1);
      }
      cv.clear();
      const dials = places.map((place, i) => {                // five gear-coupled dials, alternately CW / CCW
        const dir = (4 - i) % 2 === 0 ? 1 : -1;                 // units dial turns clockwise
        const a = dir * (((reading / place) % 10) / 10) * TAU, [hx, hy] = hub(i);
        const x0 = hx * pxX + (pxX >> 1), y0 = hy * pxY + (pxY >> 1), x1 = x0 + Math.sin(a) * reach * pxX, y1 = y0 - Math.cos(a) * 1.25 * pxY;
        // a bold pointer: the wire doubled one pixel across its run, inside the same cells, its tip cell in accent
        const steep = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
        const ox = steep && pxX >= 2 ? (Math.round(x0) % pxX ? -1 : 1) : 0, oy = !steep && pxY >= 2 ? (Math.round(y0) % pxY ? -1 : 1) : 0;
        cv.line(x0, y0, x1, y1, th.ink);
        if (ox || oy) cv.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, th.ink);
        const tx = Math.floor(Math.round(x1) / pxX), ty = Math.floor(Math.round(y1) / pxY);
        for (let y = ty * pxY; y < (ty + 1) * pxY; y++) for (let x = tx * pxX; x < (tx + 1) * pxX; x++) if (cv.get(x, y) !== NONE) cv.set(x, y, th.accent);
        return [dir, hx, hy, place];
      });
      cv.paint(b);
      for (const [dir, hx, hy, place] of dials) {               // all ten numbers round each dial, the hub on top
        face.forEach(([fx, fy], d) => b.set(hx + dir * fx, hy + fy, String(d), th.muted));
        b.set(hx, hy, u ? '●' : 'o', th.ink);
        if (big) b.text(hx - (String(place).length >> 1), dy0 + dh, String(place), th.muted);
      }
      // the disc's edge in its window: the black mark passes once a revolution, speed ∝ net power
      const theta = TAU * 0.12 * e;
      if (slotY < H - (framed ? 1 : 0)) {
        b.text(slotX - 1, slotY, '[', th.line); b.text(slotX + slotW, slotY, ']', th.line);
        for (let x = 0; x < slotW; x++) b.set(slotX + x, slotY, u ? '─' : '-', th.muted);
        if (Math.cos(theta) > 0) b.set(slotX + Math.round((slotW - 1) / 2 + Math.sin(theta) * (slotW - 1) / 2), slotY, u ? '█' : '#', th.ink);
        if (slotX + slotW + 3 + 6 <= W) b.text(slotX + slotW + 3, slotY, 'Kh 7.2', th.muted);
      }
      const sy = Math.min(H - (framed ? 2 : 1), slotY + 1 + (big ? 1 : 0));
      const imp = p >= 0, kw = Math.abs(p).toFixed(1);
      const status = imp ? `${u ? '⌂' : '<-'} importing ${kw} kW` : `${u ? '☀' : '->'} exporting ${kw} kW`;
      b.text(slotX - 1, sy, status, imp ? th.neg : th.pos);
      b.text(W - (framed ? 2 : 1) - 5, big ? 1 : sy, hhmm(h), th.ink);
      if (big && slotY + 3 < H - 1) {                          // the sun's arc over the panels, inside the glass
        const ax = W - 16, ay = slotY + 3, rx = 6, ry = 2;
        for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); b.set(Math.round(ax + 7 - Math.cos(a) * rx), Math.round(ay - Math.sin(a) * ry), '.', th.dim); }
        const s = ((((h % 24) + 24) % 24) - 6.5) / 13;
        if (s > 0 && s < 1) b.set(Math.round(ax + 7 - Math.cos(Math.PI * s) * rx), Math.round(ay - Math.sin(Math.PI * s) * ry), u ? '☀' : '*', th.warn, undefined, 1);
      }
    };
  },
};

// ── soroban ──────────────────────────────────────────────────────────────────
const START = 4268;
const BUMPS = [1, 3, 7, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3].map((n, i) => [0.5 + i * 0.9, n]); // bursts every 0.9 s, +31 → 4,299
const CLEAR = 12, REENTER = 13;                              // tilt-clear wave, then 4,268 entered rod by rod
const MOVE = 0.25, RIPPLE = 0.08;

/** Abacus value per rod at time tau, plus when each rod last changed: [digits, changedAt, flashAt]. */
function soroban(tau, rods) {
  const digitsOf = (v) => Array.from({ length: rods }, (_, i) => Math.floor(v / 10 ** (rods - 1 - i)) % 10);
  let v = START;
  const changed = new Array(rods).fill(-9), flash = new Array(rods).fill(-9);
  let cur = digitsOf(v);
  for (const [at, n] of BUMPS) {
    if (at > tau || at >= CLEAR) break;
    const next = digitsOf(v + n);
    // the units rod moves first; each carry ripples one rod left a beat later, with a flash
    for (let i = rods - 1, lag = 0; i >= 0; i--) if (next[i] !== cur[i]) { changed[i] = at + lag; if (lag) flash[i] = at + lag; lag += RIPPLE; }
    v += n; cur = next;
  }
  if (tau >= CLEAR) {
    const re = digitsOf(START);
    cur = cur.map((d, i) => {
      const off = CLEAR + i * 0.06;                            // the wave sweeps every rod clear, left to right
      if (tau < off) return d;
      changed[i] = Math.max(changed[i], off);
      const lead = re.findIndex((x) => x > 0), slot = REENTER + (i - lead) * 0.55;
      if (re[i] === 0 || i < lead || tau < slot) return 0;
      changed[i] = slot;
      return re[i];
    });
  }
  return { digits: cur, changed, flash, value: cur.reduce((s, d) => s * 10 + d, 0) };
}

const abacus = {
  id: 'progress-abacus', title: 'Soroban Tally', category: 'Counters & Odometers', order: 230, kind: 'progress',
  since: '0.3.0',
  description: 'A soroban tallies builds: beads glide to the bar in bursts of +1, +3 and +7, carries ripple left with a flash, then a tilt-clear and the count is re-entered.',
  tags: ['abacus', 'soroban', 'beads', 'counter', 'tally', 'place value'],
  size: { w: 60, h: 11 }, minSize: { w: 32, h: 7 }, loop: 16, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const rods = W >= 50 ? 7 : 5;
    const tall = H >= 11;
    const pitch = Math.max(5, Math.floor((W - 4) / rods));
    const x0 = Math.floor((W - pitch * rods) / 2) + Math.floor(pitch / 2);
    const top = 0, heaven = tall ? 2 : 1, bar = top + 1 + heaven, earth = tall ? 5 : 4;      // slots
    const bottom = tall ? bar + 1 + earth : H;                 // short screens drop the bottom rail and digits
    const bead = u ? ['◖', '█', '◗'] : ['(', '#', ')'];
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 16);
      const S = soroban(tau, rods);
      // frame and reckoning bar
      b.text(x0 - Math.floor(pitch / 2) - 1, top, (u ? '┌' : '+') + (u ? '─' : '-').repeat(pitch * rods) + (u ? '┐' : '+'), th.muted);
      if (tall) b.text(x0 - Math.floor(pitch / 2) - 1, bottom, (u ? '└' : '+') + (u ? '─' : '-').repeat(pitch * rods) + (u ? '┘' : '+'), th.muted);
      for (let y = top + 1; y < bottom; y++) { b.set(x0 - Math.floor(pitch / 2) - 1, y, u ? '│' : '|', th.muted); b.set(x0 + pitch * rods - Math.floor(pitch / 2), y, u ? '│' : '|', th.muted); }
      b.text(x0 - Math.floor(pitch / 2), bar, (u ? '═' : '=').repeat(pitch * rods), th.line);
      for (let i = 0; i < rods; i++) {
        const x = x0 + i * pitch, d = S.digits[i];
        for (let y = top + 1; y < bottom; y++) if (y !== bar) b.set(x, y, u ? '│' : '|', th.line);
        if ((rods - 1 - i) % 3 === 0) b.set(x, bar, u ? '•' : '.', th.ink);      // unit dots every third rod
        // eased bead slots: heaven bead toward the bar when d ≥ 5; earth beads up to the bar, a gap, the rest below
        const k = easeOut((tau - S.changed[i]) / MOVE), old = k < 1 ? soroban(Math.max(0, S.changed[i] - 1e-6), rods).digits[i] : d;
        const lerp = (a, c) => Math.round(a + (c - a) * k);
        const hv = (dd) => (dd >= 5 ? heaven - 1 : 0);
        const earthSlots = (dd) => { const a = dd % 5, out = []; for (let j = 0; j < 4; j++) out.push(j < a ? j : j + 1); return out; };
        const flash = tau - S.flash[i] < 0.35;
        const col = flash ? th.accent : th.warn, hi = flash ? th.accent : mix(th.warn, th.ink, 0.35);
        const draw = (y, c = col, h = hi) => { b.set(x - 1, y, bead[0], c); b.set(x, y, bead[1], h); b.set(x + 1, y, bead[2], c); };
        if (tall) {                                             // beads slide between their slots
          draw(top + 1 + lerp(hv(old), hv(d)));
          const eo = earthSlots(old), en = earthSlots(d);
          for (let j = 0; j < 4; j++) draw(bar + 1 + lerp(eo[j], en[j]));
          if (bottom + 1 < H) b.set(x, bottom + 1, String(d), th.ink);
        } else {                                                // short screens: fixed slots, beads counted by brightness
          const off = mix(th.warn, th.bg, 0.7), n = k < 1 ? old : d;
          draw(top + 1, n >= 5 ? col : off, n >= 5 ? hi : off);
          for (let j = 0; j < 4; j++) draw(bar + 1 + j, j < n % 5 ? col : off, j < n % 5 ? hi : off);
        }
      }
      const total = ` ${commas(S.value)} builds `;            // set into the frame's top rail
      b.text(Math.max(0, x0 + pitch * rods - Math.floor(pitch / 2) - total.length - 1), top, total, th.ink, undefined, 1);
    };
  },
};

// ── byo-yomi ─────────────────────────────────────────────────────────────────
const MOVES = [[3.2, 'Q16'], [5.1, 'D4'], [2.4, 'R14'], [9.6, 'C16'], [2.0, 'O17'], [1.7, 'F3']]; // 24 s, Black first
const STARTS = MOVES.reduce((a, [d], i) => (a.push((a[i - 1] ?? 0) + (i ? MOVES[i - 1][0] : 0)), a), []);

const byoyomi = {
  id: 'progress-byoyomi', title: 'Byo-yomi Clock', category: 'Timers & Countdowns', order: 200, kind: 'progress',
  since: '0.3.0',
  description: 'A Go clock in byo-yomi, five 10-second periods each: the mover\'s count resets with a flash and the turn passes; the last seconds are counted aloud.',
  tags: ['go', 'byo-yomi', 'game clock', 'baduk', 'weiqi', 'countdown', 'turns'],
  size: { w: 60, h: 10 }, minSize: { w: 30, h: 4 }, loop: 24, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const big = H >= 9 && W >= 48;
    const half = Math.floor(W / 2);
    // rows: the draining bar under each count, the last-move tag, and the timekeeper's spoken count (outer edge)
    const barY = big ? (H >= 10 ? 8 : -1) : H >= 4 ? 2 : -1, tagY = big ? H - 1 : H >= 4 ? 3 : 2, sayY = H - 1;
    const drain = (b, x, y, w, f, c) => {                    // the mover's seconds run down; the edge cell fades out
      const n = f * w, k = Math.floor(n), fr = n - k;
      for (let i = 0; i < w; i++) {
        const on = i < k, edge = i === k && fr > 0;
        b.set(x + i, y, on || edge ? (u ? '━' : '=') : u ? '─' : '-', on ? c : edge ? mix(th.line, c, fr) : th.line);
      }
    };
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 24);
      let m = MOVES.length - 1;
      while (m > 0 && STARTS[m] > tau) m--;
      const since = tau - STARTS[m], mover = m % 2;          // 0 = Black on the clock, 1 = White
      const left = Math.max(0, 10 - since);
      const lastIdx = (m + MOVES.length - 1) % MOVES.length, last = MOVES[lastIdx][1];
      const flashSide = since < 0.25 ? 1 - mover : -1;       // the side that just moved flashes its reset
      const saying = left < 5 && H >= 4;
      for (let side = 0; side < 2; side++) {
        const x = side * half, active = side === mover;
        const secs = active ? Math.ceil(left - 1e-9) : 10;
        const col = !active ? th.dim : left < 3 ? th.neg : left < 5 ? th.warn : th.ink;
        const name = side ? 'WHITE' : 'BLACK', stone = u ? (side ? '○' : '●') : side ? 'o' : '@';
        b.text(x + 2, 0, stone, side ? th.muted : th.ink); b.text(x + 4, 0, name, active ? th.ink : th.dim, undefined, active ? 1 : 0);
        const pips = (u ? '●' : 'o').repeat(5);
        const bc = side === flashSide ? th.accent : active ? col : th.dim;
        if (big) {
          const txt = String(secs).padStart(2, ' '), gx = x + Math.floor((half - 19) / 2);
          for (let c = 0; c < 2; c++) {
            const gl = FONT47[txt[c]] || FONT47[' '];
            for (let y = 0; y < 7; y++) for (let xx = 0; xx < 4; xx++) if (gl[y][xx] === '#') {
              b.text(gx + c * 10 + xx * 2, 1 + y, u ? '██' : '##', side === flashSide ? th.accent : col);
            }
          }
          b.text(x + half - 8, 0, pips, active ? th.accent : th.dim);
          if (barY >= 0) drain(b, gx, barY, 18, active ? left / 10 : 1, bc);
        } else {
          b.text(x + 2, 1, `${String(secs).padStart(2, ' ')}s`, side === flashSide ? th.accent : col, undefined, 1);
          b.text(x + 7, 1, pips, active ? th.accent : th.dim);
          if (barY >= 0) drain(b, x + 2, barY, 10, active ? left / 10 : 1, bc);
        }
        if (active && saying) {                                // the timekeeper counts the last seconds aloud, at the outer edge
          let say = '';
          for (let s = 5; s >= Math.max(1, Math.ceil(left)); s--) say += `${u ? '…' : '..'}${s}`;
          b.text(side ? W - 2 - say.length : x + 2, sayY, say, left < 3 ? th.neg : th.warn);
        }
      }
      const tag = `last ${last}`;
      if (H >= 3 && !(saying && tagY === sayY && !big)) b.text(half - Math.floor(tag.length / 2), tagY, tag, th.muted);
    };
  },
};

export default [kwhMeter, abacus, byoyomi];
