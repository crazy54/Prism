// Counters & odometers — numbers that roll, tick, light up and fill rings.
import { ATTR } from '../../buffer.js';
import { Canvas } from '../../canvas.js';
import { mix, gradient } from '../../color.js';
import { sparkline, progressBar, box } from '../../widgets/index.js';
import { truncate, stringWidth } from '../../width.js';
import { phase, transfer, glyphs, clamp01, commas, clock } from './_sim.js';
import { lift } from '../charts/_data.js';
import { FONT47, FONT35, width35, SEG7, SEG7_RECTS, seg7Ascii, ring, ringCells } from './_fonts.js';

const C = 'Counters & Odometers';
const pctInt = (f) => Math.floor(clamp01(f) * 100);
/** 1834 → "1.8k", 0.62 → "0.6". */
const rateText = (r) => (r >= 1000 ? `${(r / 1000).toFixed(1)}k` : r >= 10 ? `${Math.round(r)}` : r.toFixed(1));
const ASCII_SPARK = ' .:-=+*#';
function asciiSpark(b, x, y, w, data, color) {
  const pts = data.slice(-w), max = Math.max(1e-9, ...pts);
  pts.forEach((v, i) => b.set(x + i, y, ASCII_SPARK[Math.min(7, Math.round((v / max) * 7))], color));
}

/** Mechanical wheel positions: wheel i turns only during the last unit before it carries. */
function wheels(v, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = 10 ** i;
    out.push(i === 0 ? v % 10 : (Math.floor(v / p) + Math.max(0, (v % p) - (p - 1))) % 10);
  }
  return out;
}

export default [
  // ── odometer ─────────────────────────────────────────────────────────
  {
    id: 'progress-odometer', title: 'Rolling Odometer', category: C, order: 10, kind: 'progress',
    description: 'A mechanical counter: each drum rolls to its next digit only while the drum to its right passes 9, shaded like a cylinder.',
    tags: ['odometer', 'counter', 'rolling', 'mechanical'], size: { w: 48, h: 7 }, minSize: { w: 24, h: 3 }, loop: 10, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const base = 1283947, N = 7, PITCH = 9;
      const sim = transfer(ctx.rng, { total: 168, seconds: 10, burst: 0.9, warmup: 0.02 });
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const s = sim.at(local);
        const v = base + s.done;
        const pos = wheels(v, N);
        const order = Array.from({ length: N }, (_, k) => N - 1 - k);   // left → right = most → least significant
        const comma = (i) => i > 0 && i % 3 === 0;
        const big = g.unicode && H >= 4 && W >= 46;
        const top = big ? (H >= 6 ? 1 : 0) : H >= 5 ? 1 : 0;
        if (H >= 5) {
          b.text(1, 0, 'requests served', th.muted);
          const r = `${rateText(s.smooth)}/s`;
          b.text(W - 1 - r.length, 0, r, th.accent);
        }
        if (big) {
          const drumW = 6, cols = N * drumW + 2;
          const x0 = Math.floor((W - cols) / 2);
          const cv = new Canvas(cols, 4, { mode: 'half' });
          let x = 0;
          for (const i of order) {
            const off = Math.round(pos[i] * PITCH);
            for (let py = 0; py < 8; py++) {
              const k = 1 - Math.abs(py - 3.5) / 3.5;          // cylinder shading
              const Y = (off + py) % (PITCH * 10);
              const d = Math.floor(Y / PITCH), row = Y - d * PITCH;
              const glyph = FONT47[d];
              for (let px = 0; px < drumW; px++) {
                const edge = px === 0 || px === drumW - 1;
                const face = mix(th.bg, th.panel2, edge ? 0.35 : 0.55 + 0.3 * k);
                const lit = row < 7 && px >= 1 && px <= 4 && glyph[row][px - 1] === '#';
                cv.set(x + px, py, lit ? mix(face, i === 0 ? th.accent : th.ink, 0.55 + 0.45 * k) : face);
              }
            }
            x += drumW;
            if (comma(i)) { cv.set(x, 7, th.muted); cv.set(x, 6, th.muted); x += 1; }
          }
          cv.paint(b, x0, top);
        } else {
          // Text drums: the digit above is the one that just went by, below is the next to roll in.
          const cols = N * 2 + 2 * 2;
          let x = Math.max(0, Math.floor((W - cols) / 2));
          const y = H >= 3 ? top : 0;
          for (const i of order) {
            const cur = Math.round(pos[i]) % 10;
            if (H >= 3) b.text(x, y, String((cur + 9) % 10), th.dim);
            b.text(x, y + (H >= 3 ? 1 : 0), String(cur), i === 0 ? th.accent : th.ink, undefined, ATTR.BOLD);
            if (H >= 3) b.text(x, y + 2, String((cur + 1) % 10), th.dim);
            x += 2;
            if (comma(i)) { b.text(x - 1, y + (H >= 3 ? 1 : 0), ',', th.muted); x += 2; }
          }
        }
        if (H >= 6 || (!big && H >= 5)) {
          const line = `+${Math.floor(s.done)} this run  ${g.dot}  avg ${(s.elapsed > 0 ? s.done / s.elapsed : 0).toFixed(1)}/s`;
          b.text(1, H - 1, truncate(line, W - 2, g.ell), th.muted);
        }
      };
    },
  },

  // ── seven-segment ────────────────────────────────────────────────────
  {
    id: 'progress-seven-segment', title: 'Seven-Segment Counter', category: C, order: 20, kind: 'progress',
    description: 'A big LED counter with unlit ghost segments, ticking up in bursts and blinking when the batch completes. Classic _|_ in ASCII.',
    tags: ['seven segment', 'led', 'counter', 'retro'], size: { w: 44, h: 8 }, minSize: { w: 20, h: 3 }, loop: 10, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const total = 4096, secs = 7.6;
      const sim = transfer(ctx.rng, { total, seconds: secs, burst: 0.8, stalls: 2 });
      const led = mix(th.neg, 0xff2a1a, 0.5), ghost = mix(th.bg, led, 0.13);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const s = sim.at(local);
        const n = Math.floor(s.done);
        const after = local - secs;
        const dark = s.finished && after < 1.8 && Math.floor(after * 3.4) % 2 === 1;   // blink on completion
        const digits = String(n).padStart(4, ' ');
        const big = g.unicode && H >= 6 && W >= 32;
        const top = H >= 5 ? 1 : 0;
        if (H >= 5) {
          b.text(1, 0, 'BATCH 7', th.dim, undefined, ATTR.BOLD);
          const tag = s.finished ? 'DONE' : 'RUN';
          b.text(W - 1 - tag.length, 0, tag, s.finished ? th.pos : th.warn, undefined, ATTR.BOLD);
        }
        if (big) {
          const cv = new Canvas(30, 5, { mode: 'half' });
          [...digits].forEach((ch, k) => {
            const m = ch === ' ' ? 0 : SEG7[+ch];
            SEG7_RECTS.forEach(([x, y, w, h], bit) => {
              const on = !dark && (m >> bit) & 1;
              for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cv.set(k * 8 + x + dx, y + dy, on ? led : ghost);
            });
          });
          const x0 = Math.max(0, Math.floor((W - 30) / 2) - 4);
          cv.paint(b, x0, top);
          if (W >= x0 + 30 + 9) { b.text(x0 + 31, top + 3, 'items', th.muted); b.text(x0 + 31, top + 4, `/${commas(total)}`, th.dim); }
        } else {
          const x0 = Math.max(0, Math.floor((W - 16) / 2));
          [...digits].forEach((ch, k) => {
            const art = ch === ' ' ? ['   ', '   ', '   '] : seg7Ascii(+ch);
            art.forEach((r, y) => { if (top + y < H) b.text(x0 + k * 4, top + y, r, dark ? th.dim : led); });
          });
        }
        if (H >= 5) {
          const msg = s.finished ? `${g.ok} batch 7 complete ${g.dot} ${commas(total)} items in ${secs.toFixed(1)}s`
            : `${commas(n)} of ${commas(total)} ${g.dot} ${Math.round(s.smooth)}/s ${g.dot} eta ${clock(s.eta, { short: true })}`;
          b.text(1, H - 1, truncate(msg, W - 2, g.ell), s.finished ? th.pos : th.muted);
        }
      };
    },
  },

  // ── big percent ──────────────────────────────────────────────────────
  {
    id: 'progress-big-percent', title: 'Big Percentage', category: C, order: 30, kind: 'progress',
    description: 'A banner-sized percentage with an extruded shadow over a slim bar — the number you can read from across the room.',
    tags: ['percent', 'banner', 'big', 'figlet'], size: { w: 48, h: 9 }, minSize: { w: 20, h: 2 }, loop: 10, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const docs = 24960, secs = 7.4;
      const sim = transfer(ctx.rng, { total: docs, seconds: secs, burst: 0.6 });
      const ramp = gradient([th.info, th.accent, th.crit]);
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const s = sim.at(local);
        const p = s.finished ? 100 : pctInt(s.frac);
        const text = `${p}%`;
        const caption = s.finished ? `${g.ok} Index rebuilt ${g.dot} ${commas(docs)} docs in ${secs.toFixed(1)}s`
          : `Reindexing ${g.dot} ${commas(s.done)}/${commas(docs)} docs ${g.dot} eta ${clock(s.eta, { short: true })}`;
        const color = (u) => (s.finished ? th.pos : ramp(u));
        const shadow = mix(th.bg, s.finished ? th.pos : th.accent, 0.16);
        // Unicode: 4×7 glyphs on a half-block canvas, two columns per pixel, 1-pixel drop shadow.
        const pwU = text.length * 10 - 1;
        const pwA = width35(text) * 2 + 1;
        const bigU = g.unicode && H >= 7 && W >= pwU + 2, bigA = !g.unicode && H >= 8 && W >= pwA + 2;
        if (bigU || bigA) {
          const top = H >= 9 ? 1 : 0;
          if (bigU) {
            const cv = new Canvas(pwU, 4, { mode: 'half' });
            for (const pass of [0, 1]) {
              [...text].forEach((ch, k) => FONT47[ch].forEach((row, y) => [...row].forEach((on, x) => {
                if (on !== '#') return;
                for (const dx of [0, 1]) {
                  const X = k * 10 + x * 2 + dx;
                  if (pass === 0) cv.set(X + 1, y + 1, shadow);
                  else cv.set(X, y, color(X / pwU));
                }
              })));
            }
            cv.paint(b, Math.floor((W - pwU) / 2), top);
          } else {
            const x0 = Math.floor((W - pwA) / 2);
            for (const pass of [0, 1]) {
              let cx = 0;
              for (const ch of text) {
                const gl = FONT35[ch];
                gl.forEach((row, y) => [...row].forEach((on, x) => {
                  if (on !== '#') return;
                  for (const dx of [0, 1]) {
                    const X = x0 + (cx + x) * 2 + dx;
                    if (pass === 0) b.set(X + 1, top + y + 1, ':', shadow);
                    else b.set(X, top + y, '#', color((X - x0) / pwA));
                  }
                }));
                cx += gl[0].length + 1;
              }
            }
          }
          const by = Math.min(H - 2, top + (bigU ? 5 : 7));
          progressBar(b, 2, by, W - 4, s.frac, { theme: th, color: s.finished ? th.pos : th.accent, ascii: !g.unicode });
          b.text(1, H - 1, truncate(caption, W - 2, g.ell), s.finished ? th.pos : th.muted);
        } else {
          const label = `${String(p).padStart(3)}%`;
          b.text(1, 0, label, s.finished ? th.pos : th.ink, undefined, ATTR.BOLD);
          b.text(6, 0, truncate(caption, Math.max(0, W - 7), g.ell), s.finished ? th.pos : th.muted);
          if (H >= 2) progressBar(b, 1, 1, W - 2, s.frac, { theme: th, color: s.finished ? th.pos : th.accent, ascii: !g.unicode });
        }
      };
    },
  },

  // ── counter tiles ────────────────────────────────────────────────────
  {
    id: 'progress-counter-tiles', title: 'Live Counter Tiles', category: C, order: 40, kind: 'progress',
    description: 'Four running totals ticking at their own rates; digits that just changed flash, with a rate sparkline under each.',
    tags: ['counters', 'kpi', 'tiles', 'sparkline', 'live'], size: { w: 64, h: 10 }, minSize: { w: 36, h: 2 }, loop: 10, color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const tiles = [
        { label: 'requests', base: 48213904, per: 1850, c: th.accent },
        { label: 'rows written', base: 912440, per: 420, c: th.info },
        { label: 'jobs done', base: 18442, per: 6, c: th.pos },
        { label: 'errors 5xx', base: 1204, per: 0.7, c: th.neg },
      ].map((tl) => ({ ...tl, sim: transfer(ctx.rng, { total: tl.per * 10, seconds: 10, burst: 0.9, warmup: 0.02 }) }));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const draw = (tl, x, y, w, h) => {
          const s = tl.sim.at(local);
          const now = commas(tl.base + s.done), was = commas(tl.base + tl.sim.at(Math.max(0, local - 0.3)).done);
          const r = `+${rateText(s.smooth)}/s`;
          if (h >= 3) {
            b.text(x, y, truncate(tl.label, w - r.length - 1, g.ell), th.muted);
            b.text(x + w - r.length, y, r, tl.c);
            const nx = x;
            [...now].forEach((ch, i) => {
              const changed = was.length !== now.length || was[i] !== ch;
              b.set(nx + i, y + 1, ch, changed ? lift(th, tl.c, 0.35) : th.ink, undefined, ATTR.BOLD);
            });
            const data = Array.from({ length: w }, (_, k) => tl.sim.at(Math.max(0, local - (w - 1 - k) * 0.2)).rate);
            if (g.unicode) sparkline(b, x, y + 2, w, data, { theme: th, color: tl.c, min: 0 });
            else asciiSpark(b, x, y + 2, w, data, tl.c);
          } else {
            b.text(x, y, truncate(tl.label, 12, g.ell), th.muted);
            [...now].forEach((ch, i) => b.set(x + 13 + i, y, ch, was[i] !== ch ? lift(th, tl.c, 0.35) : th.ink));
            if (w >= 13 + now.length + r.length + 1) b.text(x + w - r.length, y, r, tl.c);
          }
        };
        if (H >= 10 && W >= 40) {
          const tw = Math.floor(W / 2), th2 = Math.floor(H / 2);
          tiles.forEach((tl, i) => {
            const x = (i % 2) * tw, y = Math.floor(i / 2) * th2;
            const bw = tw - (i % 2 ? 0 : 1);
            box(b, x, y, bw, th2, { theme: th, style: g.unicode ? 'round' : 'ascii', color: th.line });
            draw(tl, x + 2, y + 1, bw - 4, th2 - 2);
          });
        } else {
          tiles.slice(0, H).forEach((tl, i) => draw(tl, 1, i, W - 2, 1));
        }
      };
    },
  },

  // ── percentage rings ─────────────────────────────────────────────────
  {
    id: 'progress-ring', title: 'Progress Rings', category: C, order: 50, kind: 'progress',
    description: 'Braille rings filling clockwise around a centered percentage — upload, transcode and verify, finishing one after another.',
    tags: ['ring', 'donut', 'circular', 'braille'], size: { w: 60, h: 10 }, minSize: { w: 14, h: 6 }, loop: 10, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const jobs = [
        { name: 'upload', unit: 'GB', total: 4.2, secs: 6.2, c: [th.info, th.accent] },
        { name: 'transcode', unit: 'frames', total: 1820, secs: 7.1, c: [th.accent, th.crit] },
        { name: 'verify', unit: 'files', total: 312, secs: 8.0, c: [th.warn, th.pos] },
      ].map((j) => ({ ...j, ramp: gradient(j.c), sim: transfer(ctx.rng, { total: j.total, seconds: j.secs, burst: 0.5 }) }));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 10, 1);
        const rows = Math.max(5, H >= 8 ? H - 2 : H - 1);
        const cols = rows * 2;
        const n = Math.max(1, Math.min(jobs.length, Math.floor(W / (cols + 2))));
        const slot = Math.floor(W / n);
        jobs.slice(0, n).forEach((j, k) => {
          const s = j.sim.at(local);
          const x = k * slot + Math.floor((slot - cols) / 2);
          const done = s.finished;
          if (g.unicode) {
            const cv = new Canvas(cols, rows, { mode: 'braille', threshold: 0 });
            const cx = cv.width / 2, cy = cv.height / 2;
            ring(cv, { cx, cy, rx: cx - 0.5, ry: cy - 0.5, thick: 2.6, frac: done ? 1 : s.frac, color: (u) => (done ? th.pos : j.ramp(u)), track: th.line });
            cv.paint(b, x, 0);
          } else {
            ringCells(cols, rows, done ? 1 : s.frac, (cx, cy, lit) => b.set(x + cx, cy, lit ? '#' : '.', lit ? (done ? th.pos : j.c[1]) : th.line));
          }
          const mid = Math.floor(rows / 2);
          const label = done ? g.ok : `${pctInt(s.frac)}%`;
          b.text(x + Math.floor((cols - stringWidth(label)) / 2), mid, label, done ? th.pos : th.ink, undefined, ATTR.BOLD);
          const amount = j.unit === 'GB' ? `${s.done.toFixed(1)}/${j.total} GB` : `${commas(s.done)}/${commas(j.total)}`;
          // The amount sits inside the ring when it fits; ASCII rings are fatter at the sides, so it moves under the name.
          const inside = g.unicode && rows >= 6 && amount.length <= cols - 6;
          if (inside) b.text(x + Math.floor((cols - amount.length) / 2), mid + 1, amount, th.muted);
          const name = truncate(inside || amount.length + j.name.length + 1 > slot - 1 ? j.name : `${j.name} ${amount}`, slot - 1, g.ell);
          if (H > rows) b.text(k * slot + Math.floor((slot - stringWidth(name)) / 2), rows + (H - rows > 1 ? 1 : 0), name, done ? th.pos : th.muted);
        });
      };
    },
  },

  // ── concentric rings ─────────────────────────────────────────────────
  {
    id: 'progress-concentric-rings', title: 'Concentric Rings', category: C, order: 60, kind: 'progress',
    description: 'Three nested rings for the three phases of a rolling deploy, each with a legend row giving its count, so color is never the only cue.',
    tags: ['rings', 'activity', 'nested', 'rollout', 'braille'], size: { w: 52, h: 11 }, minSize: { w: 24, h: 3 }, loop: 11, glyphs: 'braille', color: '256',
    setup(ctx) {
      const th = ctx.theme, g = glyphs(ctx);
      const sets = [
        { name: 'nodes drained', total: 24, secs: 5.0, c: mix(th.neg, th.crit, 0.3), mark: g.unicode ? '●' : '#' },
        { name: 'images pulled', total: 9, secs: 6.8, c: th.pos, mark: g.unicode ? '◆' : '=' },
        { name: 'health checks', total: 60, secs: 8.4, c: th.info, mark: g.unicode ? '▲' : '+' },
      ].map((r) => ({ ...r, sim: transfer(ctx.rng, { total: r.total, seconds: r.secs, burst: 0.4, stalls: 1 }) }));
      return (t) => {
        const b = ctx.buffer, W = ctx.width, H = ctx.height;
        const { local } = phase(t, 11, 1);
        const big = H >= 7 && W >= 40;
        const legendX = big ? H * 2 + 3 : 1;
        if (big) {
          const rows = H, cols = H * 2;
          if (g.unicode) {
            const cv = new Canvas(cols, rows, { mode: 'braille', threshold: 0 });
            const cx = cv.width / 2, cy = cv.height / 2;
            sets.forEach((r, i) => {
              const s = r.sim.at(local);
              const rad = cx - 0.5 - i * 4.2;
              ring(cv, { cx, cy, rx: rad, ry: rad, thick: 2.8, frac: s.frac, color: (u) => lift(th, r.c, u > s.frac - 0.03 ? 0.35 : 0), track: mix(th.bg, r.c, 0.35) });
            });
            cv.paint(b, 1, 0);
          } else {
            sets.forEach((r, i) => {
              const s = r.sim.at(local), inset = i * 2;
              ringCells(cols - inset * 4, rows - inset * 2, s.frac, (x, y, lit) => b.set(1 + inset * 2 + x, inset + y, lit ? r.mark : '.', lit ? r.c : th.line));
            });
          }
        }
        const y0 = big ? Math.max(0, Math.floor(H / 2) - 2) : 0;
        sets.forEach((r, i) => {
          const s = r.sim.at(local), y = y0 + i * (big ? 2 : 1);
          if (y >= H) return;
          const n = Math.floor(s.done);
          b.text(legendX, y, r.mark, r.c);
          const txt = `${r.name}`;
          const val = s.finished ? `${r.total}/${r.total} ${g.ok}` : `${n}/${r.total}`;
          const room = W - legendX - 2 - val.length - 1;
          b.text(legendX + 2, y, truncate(txt, Math.max(0, room), g.ell), s.finished ? th.muted : th.ink);
          b.text(W - 1 - val.length, y, val, s.finished ? th.pos : r.c);
        });
        if (big && H >= 9) {
          const all = sets.every((r) => r.sim.at(local).finished);
          b.text(legendX, y0 + 6, truncate(all ? `${g.ok} rollout 0.9.2 complete` : `rolling out 0.9.2`, W - legendX - 1, g.ell), all ? th.pos : th.dim);
        }
      };
    },
  },
];
