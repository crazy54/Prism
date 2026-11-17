// Reveal & Type — two more ways text arrives: letters condensing out of an
// orbiting particle swarm, and a classified memo whose redaction bars lift.
import { mixOklab } from '../../color.js';
import { bannerCanvas } from '../../text/banner.js';
import { NONE } from '../../color.js';
import { clamp } from '../../easing.js';
import { bannerMode, fitType, hash, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Reveal & Type', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';
const TAU = Math.PI * 2;
/** Time within the loop, quantized so t and t + loop give bit-identical frames. */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;

// ── particle swarm assembly ─────────────────────────────────────────────────
const PLOOP = 12;
const FLIGHT = 2.1; // seconds a particle spends in transit

const particleAssemble = {
  ...shared,
  id: 'text-particle-assemble',
  since: '0.3.0',
  title: 'Particle Assembly',
  tags: ['particles', 'swarm', 'assemble', 'reveal', 'physics', 'disperse'],
  order: 200,
  loop: PLOOP,
  size: { w: 76, h: 20 },
  minSize: { w: 36, h: 9 },
  description: 'A drifting particle swarm streams inward pixel by pixel, each mote curving home until the word stands solid — holds, then blows back apart.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'SWARM'));
    const { font, scale } = fitType(text, { mode }, W - 4, H - 2);
    const base = bannerCanvas(text, { font, mode, scale, fill: [th.accent, th.info], theme: th });
    const cv = canvasLike(base, W, H);
    const ox = Math.floor((cv.width - base.width) / 2), oy = Math.floor((cv.height - base.height) / 2);
    // One particle per ink pixel: target, final color, scattered home position.
    const tx = [], ty = [], col = [], sx = [], sy = [], dep = [], swirl = [], orbit = [], orbitPh = [];
    const reach = Math.max(cv.width, cv.height) * 0.62;
    for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
      const c = base.px[y * base.width + x];
      if (c === NONE) continue;
      const i = tx.length;
      tx.push(x + ox); ty.push(y + oy); col.push(c);
      const ang = hash(i, 1) * Math.PI * 2, r = reach * (0.55 + hash(i, 2) * 0.75);
      sx.push(x + ox + Math.cos(ang) * r);
      sy.push(y + oy + Math.sin(ang) * r * 0.6);
      dep.push(hash(i, 3) * 2.4); // departure stagger
      swirl.push((hash(i, 4) - 0.5) * 14); // sideways bow of the flight path
      orbit.push(1 + Math.floor(hash(i, 5) * 2)); // one or two whole orbits per loop, so the drift closes
      orbitPh.push(hash(i, 6) * TAU);
    }
    const n = tx.length;
    const hot = mixOklab(th.ink, th.accent, 0.3);
    const dust = mixOklab(th.muted, th.bg, 0.45);
    const burstAt = 8.3;
    // Mono shades by shape: a lone mote pixel would paint as a half block, so there each mote fills its cell.
    const cellW = cv.sx, cellH = cv.sy, mono = ctx.caps.depth === 'mono';
    const mote = mono
      ? (x, y, c) => { const X = Math.floor(x / cellW) * cellW, Y = Math.floor(y / cellH) * cellH; for (let j = 0; j < cellH; j++) for (let i = 0; i < cellW; i++) cv.set(X + i, Y + j, c); }
      : (x, y, c) => cv.set(x, y, c);
    return (t) => {
      const tau = phase(t, PLOOP);
      cv.clear();
      // Phase: 0‥5.5 assemble · 5.5‥8.3 hold · 8.3‥9.9 burst · then swarm again
      for (let i = 0; i < n; i++) {
        // where the mote's slow orbit has it right now — flights start and end here, not at its centre
        const w = TAU * orbit[i] * (tau / PLOOP) + orbitPh[i];
        const hx = sx[i] + Math.cos(w) * 2.2, hy = sy[i] + Math.sin(w) * 1.4;
        let e; // 0 = at home in the swarm, 1 = locked on the letter
        if (tau < burstAt) {
          const u = clamp((tau - dep[i]) / FLIGHT);
          e = 1 - (1 - u) ** 3; // assembly: leaves fast, settles gently onto its pixel
        } else {
          const v = clamp((tau - burstAt - (1 - dep[i] / 2.4) * 0.5) / 1.1);
          e = (1 - v) ** 3; // burst: blasts off the letter fast, then coasts back into the swarm
        }
        if (e <= 0) { mote(hx, hy, dust); continue; }
        if (e >= 1) { // locked: a soft ripple keeps the held word alive
          const rip = Math.sin(TAU * 4 * (tau / PLOOP) + (tx[i] + ty[i] * 0.7) * 0.12);
          cv.set(tx[i], ty[i], rip > 0.86 ? mixOklab(col[i], th.ink, 0.4) : col[i]);
          continue;
        }
        const px = hx + (tx[i] - hx) * e, py = hy + (ty[i] - hy) * e;
        const bow = Math.sin(e * Math.PI) * swirl[i];
        // perpendicular to the flight direction
        const dx = tx[i] - hx, dy = ty[i] - hy, L = Math.hypot(dx, dy) || 1;
        const X = px - (dy / L) * bow, Y = py + (dx / L) * bow;
        mote(X, Y, e > 0.8 ? col[i] : hot);
        if (e > 0.15 && e < 0.9 && !mono) cv.set(X - dx / L, Y - dy / L, dust); // short tail
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── redacted memo ───────────────────────────────────────────────────────────
// Segments in [brackets] are covered by redaction bars that lift one by one.
const MEMO = [
  'MEMO 7/ORCHID        12 OCT 1986',
  'SUBJECT: [SITE SURVEY] RESULT',
  '1. COURIER CONFIRMS [THE PACKAGE]',
  '   CLEARED [GATE NINE] AT 0400,',
  '   ESCORT [TWO VEHICLES], NO TAIL.',
  '2. ASSET [NIGHTINGALE] REQUESTS',
  '   EXTRACTION VIA [HARBOR WEST].',
  'AUTH: [DIRECTOR S.]  // DESTROY',
];
const RLOOP = 11;
const LIFT0 = 0.5, LIFT = 0.62;   // first bar lifts at 0.5 s, then one every 0.62 s
const STAMP = 5;                  // the DECLASSIFIED stamp lands
const MARK0 = 5.4, MARK = 0.5;    // a reviewer's highlighter runs over each name
const SEAL = 9;                   // bars come back down, last line first

/** Parse a memo line into segments: { text, secret }. */
function parseLine(line) {
  const segs = [];
  let i = 0;
  for (const m of line.matchAll(/\[([^\]]*)\]/g)) {
    if (m.index > i) segs.push({ text: line.slice(i, m.index), secret: false });
    segs.push({ text: m[1], secret: true });
    i = m.index + m[0].length;
  }
  if (i < line.length) segs.push({ text: line.slice(i), secret: false });
  return segs;
}

const redacted = {
  ...shared,
  id: 'text-redacted',
  since: '0.3.0',
  title: 'Redacted Memo',
  tags: ['redacted', 'classified', 'censor', 'bars', 'declassified', 'memo', 'spy', 'highlighter'],
  order: 210,
  loop: RLOOP,
  size: { w: 50, h: 14 },
  minSize: { w: 38, h: 9 },
  description: 'A classified memo under censor bars: one by one they speckle away to expose the words, a DECLASSIFIED stamp lands, a reviewer marks each name, then it is sealed again.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ascii = asciiOnly(ctx);
    const DISSOLVE = ascii ? ['#', '+', '.'] : ['█', '▓', '▒', '░'];
    const bar = th.mode === 'light' ? th.ink : th.dim; // by Night the bars sit back so the reveals lead
    const marker = mixOklab(th.bg, th.warn, th.mode === 'light' ? 0.22 : 0.3);
    const lines = MEMO.map(parseLine);
    // Layout: optional header rule · 8 memo lines · the footer row, which the stamp takes over
    // (a 3-row stamp box when there is room, else one row) — the stamp never covers a line.
    const header = H >= 10 ? 1 : 0, tall = H >= 12;
    const total = header + MEMO.length + (tall ? 3 : 1);
    const yTop = Math.max(0, Math.floor((H - total) / 2));
    const y0 = yTop + header, rows = Math.min(MEMO.length, H - y0), yF = y0 + MEMO.length;
    const memoW = Math.max(...MEMO.map((l) => l.replace(/[\[\]]/g, '').length));
    const x0 = Math.max(0, Math.floor((W - memoW) / 2));
    // Schedule: every secret segment gets a slot.
    let slot = 0;
    const order = lines.map((segs) => segs.map((s) => (s.secret ? slot++ : -1)));
    const last = slot - 1;
    const label = ' DECLASSIFIED ';
    const box = ascii ? ['+', '+', '+', '+', '=', '|'] : ['╔', '╗', '╚', '╝', '═', '║'];
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, RLOOP);
      const stamped = tau >= STAMP && tau < SEAL;
      const jolt = tau >= STAMP && tau < STAMP + 0.12 ? 1 : 0; // the thud shifts the sheet a cell
      for (let r = 0; r < rows; r++) {
        let x = x0 + jolt;
        const y = y0 + r;
        for (const [si, seg] of lines[r].entries()) {
          const k = order[r][si];
          if (!seg.secret) { b.text(x, y, seg.text, r === 0 ? th.muted : th.ink); x += seg.text.length; continue; }
          const lift = LIFT0 + k * LIFT, mark = MARK0 + k * MARK, reseal = SEAL + (last - k) * 0.12;
          for (let i = 0; i < seg.text.length; i++) {
            // each cell dissolves in its own (hashed) moment: speckle, not a wipe
            const open = lift + 0.08 + hash(i, k, 3) * 0.42, close = reseal + hash(i, k, 5) * 0.2;
            const into = (tau - (open - 0.24)) / 0.08, back = (tau - close) / 0.05;
            let ch = null, fg = bar;
            if (tau >= open && tau < close) { ch = seg.text[i]; fg = tau - open < 0.3 ? th.warn : th.accent; }
            else if (tau < open && into >= 0) ch = DISSOLVE[Math.min(DISSOLVE.length - 1, 1 + Math.floor(into))];
            else if (tau >= close && back < DISSOLVE.length - 1) ch = DISSOLVE[DISSOLVE.length - 1 - Math.floor(back)];
            else ch = DISSOLVE[0];
            const marked = tau >= mark + (i / seg.text.length) * 0.3 && tau < close && tau >= open;
            b.text(x + i, y, ch, fg, marked ? marker : undefined, ch === seg.text[i] ? 1 : 0);
          }
          x += seg.text.length;
        }
      }
      if (header) b.text(x0, yTop, (ascii ? '-' : '─').repeat(Math.min(W - x0, memoW)), th.line);
      if (yF < H) {
        if (!stamped) {
          const foot = tau < LIFT0 || tau >= SEAL + 0.6 ? 'TOP SECRET // ORCHID' : 'REVIEW COPY';
          b.text(x0, yF, foot, th.dim);
        } else {
          // The stamp, in free rows below the memo; its ink settles after the thud.
          const ink = mixOklab(th.bg, th.pos, 0.1 + 0.25 * Math.exp(-(tau - STAMP) * 5));
          if (tall && yF + 2 < H) {
            const sw = label.length + 2, sx = x0 + Math.max(0, Math.floor((memoW - sw) / 2)) + jolt;
            b.text(sx, yF, box[0] + box[4].repeat(label.length) + box[1], th.pos, ink);
            b.text(sx, yF + 1, box[5], th.pos, ink);
            b.text(sx + 1, yF + 1, label, th.pos, ink, 1);
            b.text(sx + sw - 1, yF + 1, box[5], th.pos, ink);
            b.text(sx, yF + 2, box[2] + box[4].repeat(label.length) + box[3], th.pos, ink);
          } else {
            const one = '[ DECLASSIFIED ]';
            b.text(x0 + Math.max(0, Math.floor((memoW - one.length) / 2)) + jolt, yF, one, th.pos, ink, 1);
          }
        }
      }
    };
  },
};

export default [particleAssemble, redacted];
