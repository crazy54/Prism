// Panels — instruments that count: a nixie-tube frequency counter on the FT8
// calling frequency, a PDP-11/70 front panel blinking through a memory test,
// and a video scrubber with a buffered-ahead layer and chapter seeks.
import { mix, NONE } from '../../color.js';
import { clock } from './_sim.js';
import { FONT47, FONT35 } from './_fonts.js';

/** Time within the loop, quantized so t and t + loop draw identical frames. */
const loopT = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// ── nixie counter ────────────────────────────────────────────────────────────
// Thin wire numerals in a unit box (x 0..1, y 0..1 down): polylines, or [cx, cy, rx, ry] ellipses.
const STROKES = {
  0: [[0.5, 0.5, 0.42, 0.49]],
  1: [[[0.33, 0.2], [0.56, 0], [0.56, 1]]],
  2: [[[0.1, 0.25], [0.2, 0.07], [0.4, 0], [0.62, 0], [0.82, 0.08], [0.9, 0.26], [0.84, 0.44], [0.1, 1], [0.92, 1]]],
  3: [[[0.1, 0.03], [0.9, 0.03], [0.44, 0.42], [0.7, 0.45], [0.88, 0.6], [0.9, 0.79], [0.75, 0.95], [0.5, 1], [0.25, 0.97], [0.09, 0.87]]],
  4: [[[0.74, 1], [0.74, 0], [0.07, 0.68], [0.93, 0.68]]],
  5: [[[0.88, 0], [0.2, 0], [0.13, 0.45], [0.45, 0.37], [0.75, 0.44], [0.9, 0.65], [0.85, 0.88], [0.6, 1], [0.3, 1], [0.1, 0.9]]],
  6: [[[0.8, 0.04], [0.55, 0], [0.3, 0.1], [0.13, 0.4], [0.1, 0.7], [0.2, 0.92], [0.5, 1], [0.8, 0.92], [0.9, 0.7], [0.8, 0.5], [0.5, 0.42], [0.25, 0.5], [0.11, 0.66]]],
  7: [[[0.08, 0], [0.92, 0], [0.42, 1]]],
  8: [[0.5, 0.25, 0.33, 0.25], [0.5, 0.72, 0.41, 0.28]],
  9: [[[0.2, 0.96], [0.45, 1], [0.7, 0.9], [0.87, 0.6], [0.9, 0.3], [0.8, 0.08], [0.5, 0], [0.2, 0.08], [0.1, 0.3], [0.2, 0.5], [0.5, 0.58], [0.75, 0.5], [0.89, 0.34]]],
};
// Twelve 1 s gate readings of the FT8 calling frequency, in Hz (the list repeats: reading 13 = reading 1).
const READINGS = [14074000, 14074003, 14073998, 14074012, 14074007, 14073995, 14074001, 14074020, 14074015, 14074004, 14073990, 14073999];

/** Draw digit d's wire in the box; `bold` doubles the wire one pixel right so the lit cathode leads the ghosts. */
function strokeDigit(cv, d, x0, y0, w, h, color, bold = false) {
  for (let o = 0; o <= (bold ? 1 : 0); o++) for (const s of STROKES[d]) {
    if (typeof s[0] === 'number') cv.ellipse(x0 + o + s[0] * w, y0 + s[1] * h, s[2] * w, s[3] * h, color);
    else for (let i = 1; i < s.length; i++) cv.line(x0 + o + s[i - 1][0] * w, y0 + s[i - 1][1] * h, x0 + o + s[i][0] * w, y0 + s[i][1] * h, color);
  }
}

const HALVES = ' ▌▐█';                                    // two font pixels per cell: left 1, right 2

const nixie = {
  id: 'progress-glow-counter', title: 'Glow-Tube Frequency Counter', category: 'Counters & Odometers', order: 200, kind: 'progress',
  since: '0.3.0',
  description: 'A nixie-tube counter reading 14.074 000 MHz, the FT8 calling frequency: one reading per gate, changed digits die and re-ignite over faint ghost cathodes.',
  tags: ['nixie', 'frequency counter', 'ham radio', 'ft8', 'tubes', 'instrument', 'glow'],
  size: { w: 70, h: 12 }, minSize: { w: 34, h: 5 }, loop: 12, glyphs: 'braille', color: '256', canvas: 'line',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const labels = H >= 7;
    const tw = Math.max(3, Math.floor((W - 8) / 8));       // tube width in cells; the rest is the point, gap and "MHz"
    const glass = u && tw >= 6 && H >= 7;
    const rows = Math.max(3, H - (labels ? 2 : 0));
    const total = tw * 8 + 2 + 4;
    const x0 = Math.max(0, Math.floor((W - total) / 2));
    const tubeX = (i) => x0 + i * tw + (i >= 2 ? 1 : 0) + (i >= 5 ? 1 : 0);
    const cv = ctx.canvas('line', { cols: W, rows });
    const ascii = cv.mode === 'ascii';
    const sx = cv.width / W, sy = cv.height / rows;          // canvas pixels per cell
    const inX = glass ? 1 : 0, inY = glass ? 1 : 0;
    const box = (i) => {                                     // numeral box in canvas pixels
      const cx = tubeX(i) + inX, cw = tw - 2 * inX, cy = inY, ch = rows - 2 * inY;
      const px = Math.max(1, Math.round(cw * sx * 0.16)), py = Math.max(0, Math.round(ch * sy * 0.08));
      return [cx * sx + px, cy * sy + py, cw * sx - 2 * px - 2, ch * sy - 2 * py - 1];
    };
    const lit = th.warn, ghost = mix(th.warn, th.bg, 0.8), glow = mix(th.bg, th.warn, th.mode === 'light' ? 0.06 : 0.1);
    const strokeGlow = mix(th.warn, th.bg, 0.85), heat = new Float64Array(8);
    const font = tw >= 5 && rows >= 7 ? FONT47 : tw >= 4 && rows >= 5 ? FONT35 : null;   // the 7-bit block digits
    // narrow: block digits read better than wire numerals — tall 4×7 at two pixels a cell when there are 7 rows,
    // else 3×5 in whole cells (or two pixels a cell in a 3-cell tube); each over its ghost '8'
    const blocks = !ascii && W < 48, bf = rows >= 7 ? FONT47 : FONT35, pxW = rows >= 7 || tw < 4 ? 2 : 1;
    const blockDigit = (b, i, d, c, a) => {
      const gl = bf[d], g8 = bf[8], fw = gl[0].length, fh = gl.length, cw = Math.ceil(fw / pxW), bg = mix(glow, strokeGlow, a);
      if (rows < fh) { b.set(tubeX(i) + (tw >> 1), rows >> 1, String(d), c, bg, 1); return; }
      const gx = tubeX(i) + Math.max(0, Math.floor((tw - cw) / 2)), gy = Math.floor((rows - fh) / 2);
      for (let y = 0; y < fh; y++) for (let x = 0; x < cw; x++) {
        let m = 0, m8 = 0;
        for (let k = 0; k < pxW; k++) { const px = x * pxW + k; if (px >= fw) continue; if (gl[y][px] === '#') m |= 1 << k; else if (g8[y][px] === '#') m8 |= 1 << k; }
        if (m) b.set(gx + x, gy + y, pxW === 1 ? '█' : HALVES[m], c, bg);
        else if (m8) b.set(gx + x, gy + y, '·', ghost);
      }
    };
    const ghosts = ctx.canvas('line', { cols: W, rows });    // the ten stacked cathodes, drawn once
    if (!ascii) for (let i = 0; i < 8; i++) { const [bx, by, bw, bh] = box(i); for (let d = 0; d <= 9; d++) strokeDigit(ghosts, d, bx, by, bw, bh, ghost); }
    // dither the stacked cathodes to a third of their dots: they read as faint wire mesh, and the lit
    // numeral leads by dot density as well as color (mono has only the density)
    for (let y = 0, i = 0; y < ghosts.height; y++) for (let x = 0; x < ghosts.width; x++, i++) if ((x + 2 * y) % 3) ghosts.px[i] = -1;
    const digits = (k) => String(READINGS[((k % 12) + 12) % 12]).padStart(8, '0');
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 12), k = Math.floor(tau), tg = tau - k;
      const now = digits(k), prev = digits(k - 1);
      // glass envelopes and their warm glow
      for (let i = 0; i < 8; i++) {
        const x = tubeX(i);
        if (glass) {
          b.text(x, 0, '╭' + '─'.repeat(tw - 2) + '╮', th.line);
          for (let y = 1; y < rows - 1; y++) { b.set(x, y, '│', th.line); b.set(x + tw - 1, y, '│', th.line); }
          b.text(x, rows - 1, '╰' + '─'.repeat(tw - 2) + '╯', th.line);
        }
        for (let y = inY; y < rows - inY; y++) for (let xx = x + inX; xx < x + tw - inX; xx++) b.set(xx, y, undefined, undefined, glow);
      }
      cv.clear();
      for (let i = 0; i < 8; i++) {
        const [bx, by, bw, bh] = box(i);
        const changed = now[i] !== prev[i];
        // a changed digit: the old cathode dies (60 ms), the new one ignites with a two-frame flicker
        const inten = !changed || tg >= 0.12 ? 1 : tg < 0.06 ? 0 : tg < 0.08 ? 0.65 : tg < 0.1 ? 0.15 : 0.85;
        const dying = changed && tg < 0.06 ? 1 - tg / 0.06 : 0;
        heat[i] = Math.max(dying, inten);
        if (blocks) { if (dying) blockDigit(b, i, +prev[i], mix(ghost, lit, dying), dying); else blockDigit(b, i, +now[i], inten >= 1 ? lit : mix(ghost, lit, inten), inten); continue; }
        if (dying) strokeDigit(cv, +prev[i], bx, by, bw, bh, mix(ghost, lit, dying), true);
        if (inten > 0 && !ascii) strokeDigit(cv, +now[i], bx, by, bw, bh, inten >= 1 ? lit : mix(ghost, lit, inten), true);
        if (ascii && inten > 0.5) {                           // 7-bit: a block digit in '#', its ghost '8' in '.' (a column to spare between digits)
          if (!font) { b.set(tubeX(i) + (tw >> 1), rows >> 1, now[i], lit, undefined, 1); continue; }
          const gl = font[now[i]], g8 = font[8], fw = gl[0].length, fh = gl.length;
          const gx = tubeX(i) + Math.max(0, Math.floor((tw - fw) / 2)), gy = Math.max(0, Math.floor((rows - fh) / 2));
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
            if (gl[y][x] === '#') b.set(gx + x, gy + y, '#', lit);
            else if (g8[y][x] === '#') b.set(gx + x, gy + y, '.', ghost);
          }
        }
      }
      if (!ascii && !blocks) {
        ghosts.paint(b); cv.paint(b);
        for (let i = 0; i < 8; i++) {                         // a soft glow under each lit stroke: a numeral reads as a lit shape, not dots
          if (!heat[i]) continue;
          const gc = mix(glow, strokeGlow, heat[i]);
          for (let cy = 0; cy < rows; cy++) for (let cx = tubeX(i); cx < tubeX(i) + tw; cx++) {
            let hot = false;
            for (let py = cy * sy; py < (cy + 1) * sy && !hot; py++) for (let px = cx * sx; px < (cx + 1) * sx; px++) if (cv.get(px, py) !== NONE) { hot = true; break; }
            if (hot) b.set(cx, cy, undefined, undefined, gc);
          }
        }
      }
      const base = Math.max(0, rows - 1 - inY);
      b.set(tubeX(2) - 1, base, '.', lit, undefined, 1);    // the decimal point after "14"
      b.text(tubeX(7) + tw + 1, base, 'MHz', th.muted);
      if (labels) {
        const on = tg < 0.8;                                 // the gate LED is lit while the gate is open
        const parts = [['GATE 1s ', th.muted], [u ? (on ? '●' : '○') : on ? '*' : 'o', on ? th.neg : th.dim], [u ? ' · CH A · 50Ω · x1' : ' - CH A - 50 ohm - x1', th.muted]];
        let x = Math.max(0, Math.floor((W - (u ? 27 : 30)) / 2));
        for (const [s, c] of parts) x = b.text(x, H - 1, s, c);
      }
    };
  },
};

// ── PDP-11/70 front panel ────────────────────────────────────────────────────
const STEPS = 512;                 // two passes × 256 addresses, 32 steps/s → 16 s
const lampLevel = (bit, s, dt) => { // incandescent: ~50 ms to warm up or cool down, from the last few steps
  let L = bit(s - 5) ? 1 : 0;
  for (let j = s - 4; j <= s; j++) { const dur = j === s ? dt : 1 / 32; L = bit(j) ? Math.min(1, L + dur / 0.05) : Math.max(0, L - dur / 0.05); }
  return L;
};

const frontPanel = {
  id: 'progress-front-panel', title: 'Minicomputer Front Panel', category: 'Counters & Odometers', order: 210, kind: 'progress',
  since: '0.3.0',
  description: 'A PDP-11/70 console runs a memory test: 22 address lamps count in octal groups, data lamps flip 125252/052525, incandescent bulbs warm and fade.',
  tags: ['pdp-11', 'front panel', 'binary', 'octal', 'lamps', 'minicomputer', 'retro'],
  size: { w: 72, h: 12 }, minSize: { w: 40, h: 5 }, loop: 16, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const full = W >= 64 && H >= 10;
    const pitch = full ? 2 : 1;                              // columns per lamp
    const lampW = (n) => n * pitch + Math.ceil(n / 3) - 1;    // lamps plus one space between octal groups
    const offC = mix(th.warn, th.bg, 0.8);
    const addrAt = (s) => 0o1000 + 2 * (((s % 256) + 256) % 256);
    const pattern = (s) => ((((s % STEPS) + STEPS) % STEPS) < 256 ? 0o125252 : 0o052525);
    // each step reads the old contents back (first half), then writes the pattern
    const dataAt = (s, half) => (half ? pattern(s) : pattern(s + 256));
    const oct = (v, n) => v.toString(8).padStart(n, '0');
    const lamps = (b, x, y, n, bitOf, s, dt) => {
      for (let i = 0; i < n; i++) {
        const bitIdx = n - 1 - i, L = lampLevel((j) => bitOf(j, bitIdx), s, dt);
        const lx = x + i * pitch + Math.floor(i / 3);
        b.set(lx, y, u ? (L >= 0.5 ? '●' : '○') : L >= 0.5 ? '*' : '.', mix(offC, th.warn, L));
      }
    };
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 16), s = Math.floor(tau * 32), dt = tau - s / 32, half = dt >= 1 / 64;
      const addr = addrAt(s), data = dataAt(s, half);
      if (full) b.fill(0, 0, W, H, ' ', undefined, th.panel);
      const ax = full ? 10 : 0, ay = full ? 2 : Math.max(0, Math.floor((H - 3) / 2));
      const aw = lampW(22), dx = ax + aw - lampW(16);
      const bitOfAddr = (j, bit) => (addrAt(j) >> bit) & 1;
      const bitOfData = (j, bit) => (dataAt(j, j === s ? half : true) >> bit) & 1;
      if (full) {
        b.text(1, 0, 'pdp11/70', th.ink, th.panel, 1);
        for (let g = 0; g < 8; g++) {                        // bit labels over each octal group: 21 18 15 … 0
          const bit = 21 - g * 3, i = 22 - 1 - bit;
          b.text(ax + i * pitch + Math.floor(i / 3), ay - 1, String(bit), th.muted, th.panel);
        }
        b.text(1, ay, 'ADDRESS', th.muted, th.panel); b.text(1, ay + 2, 'DATA', th.muted, th.panel);
      }
      lamps(b, ax, ay, 22, bitOfAddr, s, dt);
      lamps(b, dx, ay + (full ? 2 : 1), 16, bitOfData, s, dt);
      const rx = ax + aw + 2;                                // octal readouts
      if (rx + 6 <= W) {
        b.text(rx, ay, oct(addr, 8).slice(-8).replace(/^00/, ''), th.ink, full ? th.panel : undefined);
        b.text(rx, ay + (full ? 2 : 1), oct(data, 6), th.ink, full ? th.panel : undefined);
      }
      const status = [['RUN', 1], ['PAUSE', dt < 0.004 && s % 256 === 0 ? 1 : 0], ['MASTER', 1], ['USER', 0], ['SUPER', 0], ['KERNEL', 1]];
      const sy = ay + (full ? 4 : 2);
      if (sy < H) {
        let x = full ? 10 : 0;
        for (const [name, on] of status) {
          if (!full && name !== 'RUN' && name !== 'KERNEL') continue;
          if (x + name.length + 2 > W) break;
          b.set(x, sy, u ? (on ? '●' : '○') : on ? '*' : '.', on ? th.warn : offC, full ? th.panel : undefined);
          x = b.text(x + 2, sy, name, th.muted, full ? th.panel : undefined) + 2;
        }
      }
      if (full && ay + 6 < H) {                              // the switch register: paddles in alternating group colours
        const py = ay + 6;
        for (let i = 0; i < 22; i++) {
          const g = Math.floor(i / 3), x = ax + i * pitch + Math.floor(i / 3);
          b.set(x, py, u ? '▮' : '#', g % 2 ? th.neg : th.accent, th.panel);
        }
        b.text(1, py, 'SWITCH', th.muted, th.panel);
        if (py + 2 < H) b.text(ax, py + 2, 'LOAD ADRS  EXAM  DEP  CONT  ENABLE/HALT  START', th.dim, th.panel);
      }
    };
  },
};

// ── video scrubber ───────────────────────────────────────────────────────────
const LEN = 2287;                                             // 38:07
const CHAPTERS = [[0, 'Cold Open'], [761, 'The Long Night'], [1110, 'Watch'], [1450, 'The Breach'], [1862, 'Dawn']];
const SPEED = 24;                                             // video seconds per second: a time-lapse of playback

/** Head position, buffer end and state at loop time tau — a scripted session that ends where it began. */
function session(tau) {
  const B0 = 761 + 80;
  const burst = (t0, dur, amt) => amt * ease((tau - t0) / dur);
  if (tau < 9.3) {
    // play from 12:41; the network bursts twice, then stalls, so the head catches the buffer edge
    const bufEnd = Math.min(LEN, B0 + burst(0.6, 0.5, 60) + burst(1.6, 0.4, 40) + burst(8.4, 0.45, 70));
    const catchAt = (941 - 761) / SPEED;                       // the head meets the stalled edge at 7.5 s
    let head;
    if (tau < catchAt) head = 761 + SPEED * tau;
    else if (tau < catchAt + 1.5) head = 941;                  // rebuffering: the knob spins
    else head = 941 + SPEED * (tau - catchAt - 1.5);
    return { head, bufEnd, spin: tau >= catchAt && tau < catchAt + 1.5, drag: -1 };
  }
  if (tau < 9.7) {                                             // dragging the knob to chapter 4
    const k = ease((tau - 9.3) / 0.4), from = 941 + SPEED * 0.3;
    return { head: from + (1450 - from) * k, bufEnd: 941 + SPEED * 0.3 + 70, spin: false, drag: k };
  }
  if (tau < 12.5) {                                            // seek evicted the buffer; it regrows from 24:10
    const head = 1450 + SPEED * (tau - 9.7);
    const bufEnd = 1450 + burst(9.8, 0.5, 70) + burst(10.9, 0.5, 60) + burst(11.8, 0.4, 50);
    return { head, bufEnd: Math.max(head, bufEnd), spin: false, drag: -1 };
  }
  // chapter-2 jump back to 12:41: the buffer refills to exactly the t = 0 extent by the wrap
  return { head: 761, bufEnd: 761 + 80 * ease((tau - 12.5) / 1.4), spin: false, drag: -1 };
}

const buffered = {
  id: 'progress-buffered', title: 'Buffered Scrubber', category: 'Progress Bars', order: 200, kind: 'progress',
  since: '0.3.0',
  description: 'A video scrubber with a buffered-ahead layer: playback catches a stalled buffer and spins, a drag to chapter 4 evicts it and it regrows.',
  tags: ['video', 'scrubber', 'buffering', 'seek', 'chapters', 'player', 'streaming'],
  size: { w: 64, h: 5 }, minSize: { w: 28, h: 2 }, loop: 14, color: '256',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const u = ctx.caps.unicode !== false;
    const G = u ? { played: '━', half: '╸', buf: '━', track: '─', knob: '●', spin: '◐◓◑◒' } : { played: '=', half: '=', buf: '-', track: '.', knob: 'O', spin: '|/-\\' };
    const ty = H >= 5 ? 2 : H >= 3 ? 1 : 0, timeY = ty + 1, titleY = H >= 5 ? 0 : -1, chipY = ty - 1;
    const x0 = 1, tw = Math.max(4, W - 2);
    const col = (v) => (v / LEN) * tw;
    const gaps = new Set(CHAPTERS.slice(1).map(([s]) => Math.round(col(s))));
    const bufC = mix(th.ink, th.bg, 0.5);                   // the buffered run: heavy, and 3:1 on either theme
    return (t) => {
      const b = ctx.buffer;
      const tau = loopT(t, 14);
      const st = session(tau);
      const hp = col(st.head), be = col(st.bufEnd);
      for (let i = 0; i < tw; i++) {
        if (gaps.has(i)) continue;                             // chapter gaps stay background
        let ch = G.track, c = th.line;
        if (i + 1 <= hp) { ch = G.played; c = th.accent; }
        else if (i < hp) { ch = hp - i >= 0.5 ? G.half : G.buf; c = hp - i >= 0.5 ? th.accent : bufC; }
        else if (i < be) { ch = G.buf; c = bufC; }
        b.set(x0 + i, ty, ch, c);
      }
      const kx = x0 + Math.min(tw - 1, Math.floor(hp));
      b.set(kx, ty, st.spin ? G.spin[Math.floor(tau * 8) % 4] : G.knob, th.ink, undefined, 1);
      if (st.drag >= 0 && chipY >= 0) {                        // hover chip over the knob while dragging
        const chip = ` ${clock(1450, { short: true })} ${u ? '·' : '-'} The Breach `;
        b.text(Math.max(0, Math.min(W - chip.length, kx - (chip.length >> 1))), chipY, chip, th.ink, th.panel2);
      }
      const shown = Math.round(st.head);
      const left = `${clock(shown, { short: true })} / ${clock(LEN, { short: true })}`, right = `-${clock(LEN - shown, { short: true })}`;
      if (timeY < H) { b.text(x0, timeY, left, th.ink); if (W - 1 - right.length > x0 + left.length + 1) b.text(W - 1 - right.length, timeY, right, th.muted); }
      if (titleY >= 0) {
        b.text(x0, titleY, u ? 'S02E05 · The Long Night' : 'S02E05 - The Long Night', th.ink, undefined, 1);
        if (W >= 40) b.text(W - 7, titleY, '1080p', th.muted);
      }
    };
  },
};

export default [nixie, frontPanel, buffered];
