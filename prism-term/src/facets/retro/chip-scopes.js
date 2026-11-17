// Chiptune analysis gear on the shared tracker tune (_music.js): a tracker
// sample editor whose playhead scrubs the waveform every time the instrument
// fires; the spectrum as a night skyline of window-lit towers; and a quad of
// per-channel triggered scopes in the famitracker style.
import { lerpc, fract, hash2, shade } from './_kit.js';
import { songAt, bands, PATTERN, ROWS, ROW, LOOP as SL, noteName, INSTRUMENTS } from './_music.js';
import { glyphs, frame, light } from '../charts/_data.js';

const TAU = Math.PI * 2;
const wrap = (x) => ((x % SL) + SL) % SL;
const hx = (n) => Math.round(n).toString(16).toUpperCase();

/** Rows since channel `ch` last fired an event matching `match`, per pattern row. */
function backTable(ch, match = () => true) {
  const out = new Int32Array(ROWS);
  let last = -ROWS;
  for (let i = 0; i < ROWS * 2; i++) {
    const ev = PATTERN[i % ROWS][ch];
    if (ev && match(ev)) last = i;
    if (i >= ROWS) out[i % ROWS] = i - last;
  }
  return out;
}
const ageAt = (tbl, t) => {
  const lt = wrap(t), pos = lt / ROW, row = Math.floor(pos) % ROWS;
  return (tbl[row] + (pos - Math.floor(pos))) * ROW;
};

// ──────────────────────────────────────────────────────────  sample editor ──
const scrubber = {
  id: 'retro-sample-scrubber',
  since: '0.3.0',
  title: 'Sample Scrubber',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 230,
  tags: ['sample', 'editor', 'waveform', 'scrub', 'tracker', 'st-01', 'amiga', 'chiptune'],
  description: 'A tracker sample editor: each bar swaps in an instrument, and the playhead scrubs its waveform live on every hit, loop region and all.',
  size: { w: 72, h: 18 },
  minSize: { w: 28, h: 8 },
  loop: SL,
  canvas: 'line',
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const cv = ctx.canvas('line');
    const N = 512;
    const mk = (f) => Float32Array.from({ length: N }, (_, i) => Math.max(-1, Math.min(1, f(i / N))));
    const SAMPLES = [
      { key: 3, dur: 0.42, loopR: null, rate: 8363, back: backTable(0, (e) => e.inst === 3),
        wav: mk((u) => { const a = u * 0.42; return Math.sin(TAU * (46 * a + 120 * 0.04 * (1 - Math.exp(-a / 0.04)))) * Math.exp(-a / 0.17); }) },
      { key: 2, dur: 0.48, loopR: [0.56, 0.94], rate: 8363, back: backTable(1),
        wav: mk((u) => (fract(u * 6) < 0.5 ? 1 : -1) * (0.28 + 0.72 * Math.exp(-u * 2.2))) },
      { key: 4, dur: 0.3, loopR: null, rate: 11025, back: backTable(0, (e) => e.inst === 4),
        wav: mk((u) => { const a = u * 0.3; return (hash2(Math.floor(u * N), 1, 3) * 2 - 1) * Math.exp(-a / 0.09) * 0.85 + Math.sin(TAU * 190 * a) * Math.exp(-a / 0.05) * 0.5; }) },
      { key: 5, dur: 0.12, loopR: null, rate: 16726, back: backTable(3, (e) => e.inst === 5),
        wav: mk((u) => (hash2(Math.floor(u * N), 2, 7) * 2 - 1) * Math.exp(-u / 0.22) * 0.8) },
    ];
    const ruler = H >= 12 ? 1 : 0;
    const footer = H >= 10 ? 1 : 0;
    const wy0 = 1 + ruler, waveH = Math.max(2, H - wy0 - footer);
    const loopBg = lerpc(th.bg, th.panel, 0.85);
    return (t) => {
      const s = songAt(t);
      const sm = SAMPLES[s.bar % SAMPLES.length];
      const a = ageAt(sm.back, t);
      let pos = a / sm.dur;
      if (sm.loopR && pos > sm.loopR[1]) pos = sm.loopR[0] + fract((pos - sm.loopR[0]) / (sm.loopR[1] - sm.loopR[0])) * (sm.loopR[1] - sm.loopR[0]);
      const playing = pos <= 1.001;
      const hot = a < 0.1;
      b.fill(0, 0, W, 1, ' ', th.ink, th.panel);
      b.text(1, 0, `SMP ED ▸ 0${sm.key}:${INSTRUMENTS[sm.key]}`.slice(0, W - 2), hot ? light(th) : th.ink, th.panel);
      const rt = `${sm.rate}Hz 8-BIT`;
      if (W >= 46) b.text(W - rt.length - 1, 0, rt, th.muted, th.panel);
      if (sm.loopR) b.fill(Math.round(sm.loopR[0] * (W - 1)), wy0, Math.max(1, Math.round((sm.loopR[1] - sm.loopR[0]) * (W - 1))), waveH, ' ', th.ink, loopBg);
      if (ruler) for (let k = 0; k <= 4; k++) {
        const lx = Math.min(W - 5, Math.round((k * (W - 1)) / 4));
        b.text(lx, 1, `$${hx((k * N) / 4).padStart(3, '0')}`, lerpc(th.bg, th.muted, 0.85));
      }
      cv.clear();
      const X1 = W * cv.sx - 1;
      const midY = (wy0 + waveH / 2) * cv.sy;
      const amp = Math.max(1, (waveH * cv.sy) / 2 - 1);
      const posX = Math.round(Math.min(1, pos) * X1);
      for (let x = 0; x < X1; x += 3) cv.set(x, midY, lerpc(th.bg, th.muted, 0.7));
      const step = N / (X1 + 1);
      for (let x = 0; x <= X1; x++) {
        const i0 = Math.floor(x * step), i1 = Math.max(i0 + 1, Math.floor((x + 1) * step));
        let lo = 1, hi = -1;
        for (let i = i0; i < i1 && i < N; i++) { const v = sm.wav[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const played = playing && x <= posX;
        const col = played ? lerpc(th.accent, light(th), 0.35) : lerpc(th.bg, th.accent, 0.8);
        cv.line(x, midY - hi * amp, x, midY - lo * amp, col);
      }
      if (playing) cv.line(posX, wy0 * cv.sy, posX, (wy0 + waveH) * cv.sy - 1, light(th));
      cv.paint(b);
      if (playing) b.set(Math.round(Math.min(1, pos) * (W - 1)), wy0, '▼', light(th));
      if (footer) {
        const y = H - 1;
        const lp = sm.loopR ? `LOOP $${hx(sm.loopR[0] * N).padStart(3, '0')}-$${hx(sm.loopR[1] * N).padStart(3, '0')}` : 'LOOP OFF';
        b.text(1, y, `${lp}  VOL 64`.slice(0, W - 2), th.muted);
        const ps = `POS $${hx(Math.min(1, pos) * N).padStart(3, '0')}`;
        if (W >= 40) b.text(W - ps.length - 1, y, ps, playing ? th.ink : th.muted);
      }
    };
  },
};

// ─────────────────────────────────────────────────────────  equalizer city ──
const eqTowers = {
  id: 'retro-eq-towers',
  since: '0.3.0',
  title: 'Equalizer City',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 240,
  tags: ['equalizer', 'spectrum', 'skyline', 'towers', 'windows', 'night', 'beacon', 'chiptune'],
  description: 'The spectrum as a skyline: every band is a tower whose windows light floor by floor, with peak roof caps, beacons, stars and a wet street.',
  size: { w: 64, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: SL,
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const pal = ctx.palette('theme-heat');
    const refl = H >= 14 ? 2 : 0;
    const lblRow = H >= 12 && W >= 40 ? 1 : 0;
    const groundY = H - 1 - refl - lblRow;
    const rows = Math.max(2, groundY);
    const pitch = W >= 48 ? 5 : 4, tw = pitch - 1;
    const n = Math.max(3, Math.floor((W - 1) / pitch));
    const xoff = Math.max(0, Math.floor((W - (n * pitch - 1)) / 2));
    const maxH = Float32Array.from({ length: n }, (_, i) => Math.max(2, rows * (0.45 + 0.5 * hash2(i, 11))));
    const beacon = Array.from({ length: n }, (_, i) => hash2(i, 5) < 0.3);
    const bodyC = shade(th, 0.5), sideC = shade(th, 0.72);
    const street = shade(th, 0.62);
    const stars = Array.from({ length: Math.round(W * 0.5) }, (_, i) => [Math.floor(hash2(i, 21) * W), Math.floor(hash2(i, 22) * rows * 0.45), hash2(i, 23)]);
    const K = 22, STEP = 1 / 30;
    const cur = new Float32Array(n), tmp = new Float32Array(n), peak = new Float32Array(n);
    const FREQS = [[60, '60'], [250, '250'], [1000, '1k'], [4000, '4k'], [10000, '10k']];
    const lo = Math.log2(40), hi = Math.log2(12000);
    return (t) => {
      for (const [sx, sy, k] of stars) {
        if (Math.sin(TAU * (t / SL) * (2 + Math.floor(k * 4)) + k * 20) > -0.1) b.set(sx, sy, k > 0.8 ? '✦' : '·', lerpc(th.bg, th.ink, 0.35 + k * 0.3));
      }
      if (W >= 34) b.set(W - 5, 1, '☾', lerpc(th.bg, th.ink, 0.75));
      bands(t, n, cur);
      peak.set(cur);
      for (let k = 1; k < K; k++) {
        bands(t - k * STEP, n, tmp);
        const drop = Math.max(0, k * STEP - 0.22) ** 2 * 2.8;
        for (let i = 0; i < n; i++) { const v = tmp[i] - drop; if (v > peak[i]) peak[i] = v; }
      }
      for (let i = 0; i < n; i++) {
        const x0 = xoff + i * pitch;
        const hMax = maxH[i];
        const litF = cur[i] * hMax;
        for (let f = 0; f < hMax && f < rows; f++) {
          const y = groundY - 1 - f;
          if (y < 0) break;
          for (let dx = 0; dx < tw; dx++) {
            if (dx === tw - 1) { b.set(x0 + dx, y, '░', sideC); continue; }
            const win = dx % 2 === 0 && f % 2 === 0;
            if (win && f < litF) {
              const flick = hash2(i * 7 + dx, f, Math.floor(t * 10)) < 0.05;
              b.set(x0 + dx, y, '█', flick ? lerpc(th.bg, pal(0.3), 0.4) : pal(0.12 + 0.8 * (f / rows)));
            } else b.set(x0 + dx, y, '▒', bodyC);
          }
        }
        const pk = Math.min(hMax - 0.01, peak[i] * hMax);
        const py = groundY - 1 - Math.floor(pk);
        if (pk > litF + 0.6 && py >= 0) for (let dx = 0; dx < tw - 1; dx++) b.set(x0 + dx, py, '▔', light(th));
        if (beacon[i]) {
          const by = groundY - 1 - Math.floor(hMax);
          if (by >= 0 && (t * 1.5 + i * 0.37) % 1 < 0.45) b.set(x0 + ((tw - 1) >> 1), by, '◆', lerpc(th.neg, light(th), 0.25));
        }
      }
      b.fill(0, groundY, W, 1, ' ', th.ink, street);
      for (let x = 2; x < W; x += 9) b.set(x, groundY, '·', lerpc(street, th.warn, 0.7));
      if (lblRow) for (const [f, sN] of FREQS) {
        const x = Math.round(xoff + ((Math.log2(f) - lo) / (hi - lo)) * (n * pitch - 1) - sN.length / 2);
        if (x >= 0 && x + sN.length <= W) b.text(x, groundY + 1, sN, th.muted);
      }
      for (let r = 0; r < refl; r++) {
        const y = groundY + 1 + lblRow + r;
        if (y >= H) break;
        for (let i = 0; i < n; i++) {
          const litF = cur[i] * maxH[i];
          if (r + 0.5 >= litF) continue;
          const x0 = xoff + i * pitch;
          for (let dx = 0; dx < tw - 1; dx += 2) b.set(x0 + dx, y, '░', lerpc(th.bg, pal(0.5), 0.3 * (1 - r / refl)));
        }
      }
    };
  },
};

// ────────────────────────────────────────────────────────── channel scopes ──
const chanScopes = {
  id: 'retro-channel-scopes',
  since: '0.3.0',
  title: 'Channel Scopes',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 250,
  tags: ['oscilloscope', 'channels', 'quad', 'famitracker', 'waveform', 'trigger', 'chiptune'],
  description: 'Four per-channel scopes in the famitracker style — drums, bass, lead and hats each hold a triggered wave and flash their frame on every hit.',
  size: { w: 64, h: 18 },
  minSize: { w: 24, h: 8 },
  loop: SL,
  canvas: 'line',
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const g = glyphs(ctx);
    const cv = ctx.canvas('line');
    const bw = W >> 1, bh = H >> 1;
    const boxes = [
      { x: 0, y: 0, w: bw, h: bh }, { x: bw, y: 0, w: W - bw, h: bh },
      { x: 0, y: bh, w: bw, h: H - bh }, { x: bw, y: bh, w: W - bw, h: H - bh },
    ];
    const CH = [
      { name: 'DRUMS', c: th.warn }, { name: 'BASS', c: th.accent },
      { name: 'LEAD', c: th.info }, { name: 'HATS', c: th.pos },
    ];
    const back = [0, 1, 2, 3].map((ch) => backTable(ch));
    const lineC = lerpc(th.bg, th.line, 1);
    return (t) => {
      const s = songAt(t);
      const lvls = [Math.max(s.kick, s.snare), s.bass, s.lead, s.hat];
      const labels = [s.kick >= s.snare ? 'BD' : 'SD', noteName(s.bassNote), noteName(s.leadNote), 'HH'];
      cv.clear();
      for (let i = 0; i < 4; i++) {
        const bx = boxes[i], ch = CH[i];
        const hot = ageAt(back[i], t) < 0.12;
        const title = `${i + 1}·${ch.name}`.slice(0, Math.max(0, bx.w - 6));
        const inner = frame(b, bx.x, bx.y, bx.w, bx.h, hot ? ch.c : lineC, g, title, hot ? ch.c : th.muted);
        if (bx.w >= 18) b.text(bx.x + bx.w - labels[i].length - 3, bx.y, ` ${labels[i]} `, th.muted);
        if (bx.w >= 12 && bx.h >= 3) {
          const nn = Math.round(Math.min(1, lvls[i]) * 5);
          for (let k = 0; k < 5; k++) b.set(bx.x + bx.w - 7 + k, bx.y + bx.h - 1, '▮', k < nn ? ch.c : lerpc(th.bg, ch.c, 0.2));
        }
        if (inner.w < 3 || inner.h < 1) continue;
        const X0 = inner.x * cv.sx + 1, X1 = (inner.x + inner.w) * cv.sx - 2;
        const midY = (inner.y + inner.h / 2) * cv.sy;
        const amp = Math.max(0, (inner.h * cv.sy) / 2 - 1.5);
        const env = lvls[i];
        const col = lerpc(th.bg, ch.c, 0.45 + 0.55 * Math.min(1, env * 1.2));
        let py = midY;
        for (let xp = X0; xp <= X1; xp++) {
          const u = (xp - X0) / Math.max(1, X1 - X0);
          let v;
          if (i === 0) v = s.kick * Math.sin(TAU * 52 * Math.max(0, s.kickAge - (1 - u) * 0.03)) + s.snare * 0.85 * (hash2(Math.floor(u * 48), Math.floor(t * 30), 3) * 2 - 1);
          else if (i === 1) v = (fract(u * 2) < 0.5 ? 1 : -1) * s.bass * 0.9;
          else if (i === 2) v = (fract(u * 2) < 0.25 ? 1 : -1) * s.lead * 0.9;
          else v = (hash2(Math.floor(u * 56), Math.floor(t * 34), 8) * 2 - 1) * s.hat;
          const y = midY - Math.max(-1, Math.min(1, v)) * amp;
          if (xp > X0) cv.line(xp - 1, py, xp, y, col);
          py = y;
        }
      }
      cv.paint(b);
    };
  },
};

export default [scrubber, eqTowers, chanScopes];
