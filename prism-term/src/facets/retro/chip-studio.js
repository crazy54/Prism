// Three chiptune performance surfaces on the shared tracker tune (_music.js):
// a C64 SID voice monitor with gate LEDs, ADSR readouts and triggered scopes;
// a falling piano roll raining the pattern onto a lit keyboard; and an x0x
// drum-machine step grid with a sweeping playhead and hit flashes. Everything
// is a pure function of t — songAt() hands out envelopes, notes and hits.
import { lerpc, fract, hash2 } from './_kit.js';
import { songAt, PATTERN, ROWS, ROW, LOOP as SL, noteName } from './_music.js';
import { onFill, light } from '../charts/_data.js';

const TAU = Math.PI * 2;
const wrap = (x) => ((x % SL) + SL) % SL;

// ─────────────────────────────────────────────────────── SID voice monitor ──
const sidVoices = {
  id: 'retro-sid-voices',
  since: '0.3.0',
  title: 'SID Voice Monitor',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 200,
  tags: ['sid', 'c64', '6581', 'voice', 'adsr', 'gate', 'scope', 'chiptune'],
  description: 'A C64 SID chip monitor: three voices with gate LEDs, waveform badges, ADSR readouts, envelope ladders and live triggered scopes.',
  size: { w: 70, h: 20 },
  minSize: { w: 26, h: 9 },
  loop: SL,
  canvas: 'line',
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const cv = ctx.canvas('line');
    const chrome = H >= 12 && W >= 34;
    const top = chrome ? 1 : 0;
    const body = H - top - (chrome ? 1 : 0);
    const vh = Math.max(2, Math.floor(body / 3));
    const labW = W >= 58 ? 17 : W >= 40 ? 10 : 7;
    const envW = W >= 48 ? 6 : 0;
    const sx0 = labW + 1, sx1 = W - envW - 1;
    const vcol = [th.accent, th.info, th.warn];
    const meta = [
      { v: 'V1', adsr: '0A48', xtra: 'RING OFF' },
      { v: 'V2', adsr: '2986', xtra: '' },
      { v: 'V3', adsr: '0930', xtra: 'SYNC OFF' },
    ];
    const offLED = lerpc(th.bg, th.muted, 0.7);
    return (t) => {
      const s = songAt(t);
      const pw = 0.25 + 0.14 * Math.sin((TAU * 8 * t) / SL);
      const drumNoise = s.snare >= s.kick;
      const voices = [
        { env: s.bass, note: noteName(s.bassNote), f: s.bassFreq, wave: 'SQR',
          at: (u) => (fract(u * 2) < 0.5 ? 1 : -1) },
        { env: s.lead, note: noteName(s.leadNote), f: s.leadFreq, wave: 'PUL',
          at: (u) => (fract(u * 2) < pw ? 1 : -1) },
        { env: Math.max(s.kick, s.snare), note: drumNoise ? '···' : 'C-1', f: drumNoise ? 0 : 52,
          wave: drumNoise ? 'NOI' : 'TRI', raw: true,
          at: (u) => s.kick * Math.sin(TAU * 52 * Math.max(0, s.kickAge - (1 - u) * 0.03))
            + s.snare * 0.9 * (hash2(Math.floor(u * 64), Math.floor(t * 28), 9) * 2 - 1) },
      ];
      if (chrome) {
        b.fill(0, 0, W, 1, ' ', th.ink, th.panel);
        b.text(1, 0, 'SID 6581 ▸ $D400  prism_intro.sid', th.ink, th.panel);
        const r = `BAR ${s.bar + 1}/4  50Hz`;
        if (W >= 54) b.text(W - r.length - 1, 0, r, th.muted, th.panel);
      }
      cv.clear();
      for (let vi = 0; vi < 3; vi++) {
        const vc = vcol[vi], v = voices[vi], m = meta[vi];
        const y0 = top + vi * vh;
        const gate = v.env > 0.04;
        b.text(0, y0, m.v, vc);
        b.text(3, y0, v.wave, th.muted);
        b.set(labW - 1, y0, gate ? '●' : '○', gate ? th.pos : offLED);
        if (vh >= 2 && labW >= 10) {
          b.text(0, y0 + 1, v.note, th.ink);
          const f = v.f ? (v.f < 1000 ? `${v.f.toFixed(1)}Hz` : `${(v.f / 1000).toFixed(2)}kHz`) : 'NOISE';
          b.text(4, y0 + 1, f.slice(0, labW - 5), th.muted);
        }
        if (vh >= 4 && labW >= 17) {
          b.text(0, y0 + 2, `ADSR ${m.adsr}`, th.muted);
          if (vi === 1) {
            b.text(0, y0 + 3, 'PW', th.muted);
            const n = Math.round(pw * 14);
            for (let i = 0; i < 7; i++) b.set(3 + i, y0 + 3, i * 2 < n ? '▮' : '·', i * 2 < n ? vc : lerpc(th.bg, vc, 0.3));
          } else b.text(0, y0 + 3, m.xtra, lerpc(th.bg, th.muted, 0.8));
        }
        if (envW) {
          const lx = W - envW;
          for (let r = 0; r < vh; r++) {
            const f = 1 - r / Math.max(1, vh - 1);
            const col = f < 0.6 ? th.pos : f < 0.85 ? th.warn : th.neg;
            const on = v.env >= f - 0.02;
            for (let i = 0; i < 2; i++) b.set(lx + 1 + i, y0 + r, on ? '▮' : '·', on ? col : lerpc(th.bg, col, 0.22));
          }
        }
        if (sx1 - sx0 >= 4) {
          const X0 = sx0 * cv.sx, X1 = sx1 * cv.sx;
          const midY = (y0 + vh / 2) * cv.sy;
          const amp = Math.max(0, (vh * cv.sy) / 2 - 1);
          const col = lerpc(th.bg, vc, 0.4 + 0.6 * Math.min(1, v.env * 1.3));
          let py = midY;
          for (let xp = X0; xp <= X1; xp++) {
            const u = (xp - X0) / (X1 - X0);
            const val = v.raw ? v.at(u) : v.at(u) * v.env;
            const y = midY - Math.max(-1, Math.min(1, val)) * amp;
            if (xp > X0) cv.line(xp - 1, py, xp, y, col);
            py = y;
          }
        }
      }
      cv.paint(b);
      if (chrome) {
        const y = H - 1;
        const cut = 0.34 + 0.26 * Math.sin((TAU * 2 * t) / SL + 1.2);
        b.text(1, y, 'FILTER LP', th.muted);
        const bw = Math.max(6, Math.min(24, W - 32));
        const n = Math.round(cut * bw);
        for (let i = 0; i < bw; i++) b.set(11 + i, y, i < n ? '▮' : '·', i < n ? th.accent : lerpc(th.bg, th.accent, 0.25));
        b.text(12 + bw, y, 'RES 7  VOL F', th.muted);
      }
    };
  },
};

// ──────────────────────────────────────────────────────────────  piano roll ──
const pianoRoll = {
  id: 'retro-piano-roll',
  since: '0.3.0',
  title: 'Piano Roll',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 210,
  tags: ['piano', 'roll', 'falling-notes', 'keyboard', 'midi', 'chiptune', 'synthesia'],
  description: 'Falling piano-roll notes rain the chiptune onto a lit keyboard — channel-colored trails, bar guides with chord names and key flashes.',
  size: { w: 64, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: SL,
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const kb = H >= 11 ? 2 : 1;
    const fh = H - kb;
    const LO = 34, HI = 84;
    const X = (n) => Math.round(((n - LO) / (HI - LO)) * (W - 1));
    const LA = 2.6;
    const chC = [th.warn, th.accent, th.info, th.pos];
    const DUR = [0.26, ROW * 2, ROW * 1.6, ROW * 0.8];
    const nw = W >= 96 ? 2 : 1;
    const evs = [];
    for (let r = 0; r < ROWS; r++) for (let ch = 0; ch < 4; ch++) {
      const ev = PATTERN[r][ch];
      if (ev) evs.push({ tt: r * ROW, ch, x: X(ev.note) });
    }
    const BLACK = new Set([1, 3, 6, 8, 10]);
    const white = lerpc(th.panel, 0xffffff, 0.72);
    const black = lerpc(th.bg, 0x000000, 0.55);
    const guide = lerpc(th.bg, th.line, 0.7);
    const barC = lerpc(th.bg, th.muted, 0.55);
    const CHORDS = ['Am', 'F', 'C', 'G'];
    const lit = new Int32Array(W);
    return (t) => {
      lit.fill(-1);
      // Bar and beat guides fall with the notes; bars carry their chord name.
      for (let k = 0; k < 16; k++) {
        const dte = wrap(k * 4 * ROW - t);
        if (dte >= LA) continue;
        const y = Math.round((fh - 1) * (1 - dte / LA));
        const strong = k % 4 === 0;
        for (let x = strong ? 0 : 1; x < W; x += strong ? 2 : 4) b.set(x, y, '╌', strong ? barC : guide);
        if (strong && W >= 30 && y > 0) b.text(1, y, CHORDS[(k >> 2) % 4], barC);
      }
      // Falling notes: the head leads, the tail fades out above it.
      for (const ev of evs) {
        const age = wrap(t - ev.tt);
        if (age < 0.14) for (let dx = 0; dx < nw; dx++) if (ev.x + dx < W) lit[ev.x + dx] = chC[ev.ch];
        const dte = wrap(ev.tt - t);
        if (dte >= LA) continue;
        const yh = Math.round((fh - 1) * (1 - dte / LA));
        const len = Math.max(1, Math.round((DUR[ev.ch] / LA) * (fh - 1)));
        const c = chC[ev.ch];
        for (let i = 0; i < len; i++) {
          const y = yh - i;
          if (y < 0 || y >= fh) continue;
          const col = i === 0 ? lerpc(c, 0xffffff, 0.25) : lerpc(th.bg, c, 1 - (i / len) * 0.7);
          for (let dx = 0; dx < nw; dx++) if (ev.x + dx < W) b.set(ev.x + dx, y, i === 0 ? '█' : '▓', col);
        }
      }
      // Keyboard: black keys on the top row, hits light the whole key.
      for (let x = 0; x < W; x++) {
        const n = LO + Math.round((x / Math.max(1, W - 1)) * (HI - LO));
        const isB = BLACK.has(((n % 12) + 12) % 12);
        const seam = ((n % 12) + 12) % 12 === 0;
        const hit = lit[x];
        for (let r = 0; r < kb; r++) {
          let col = hit >= 0 ? hit : r === 0 && kb === 2 && isB ? black : white;
          let ch = hit >= 0 ? '█' : r === 0 && kb === 2 && isB ? '▓' : '█';
          if (hit < 0 && seam && !(r === 0 && kb === 2 && isB)) col = lerpc(col, black, 0.3);
          b.set(x, fh + r, ch, col);
        }
        if (hit >= 0 && fh >= 2) b.set(x, fh - 1, '✦', lerpc(hit, 0xffffff, 0.5));
      }
    };
  },
};

// ─────────────────────────────────────────────────────────  step sequencer ──
const stepSeq = {
  id: 'retro-step-sequencer',
  since: '0.3.0',
  title: 'Step Sequencer',
  category: 'Chiptune Visuals',
  kind: 'scene',
  order: 220,
  tags: ['drum-machine', 'sequencer', '808', 'x0x', 'pads', 'steps', 'rhythm', 'chiptune'],
  description: 'An x0x drum machine view of the chiptune: 16 color-grouped pads per track, a sweeping playhead, hit flashes and a bass note lane.',
  size: { w: 68, h: 18 },
  minSize: { w: 32, h: 8 },
  loop: SL,
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer, W = ctx.width, H = ctx.height;
    const is = (ev, inst) => (ev && ev.inst === inst ? ev : null);
    const TR = [
      { lab: 'BD', c: th.neg, at: (r) => is(PATTERN[r][0], 3) },
      { lab: 'SD', c: th.warn, at: (r) => is(PATTERN[r][0], 4) },
      { lab: 'CH', c: th.accent, at: (r) => is(PATTERN[r][3], 5) },
      { lab: 'OH', c: th.info, at: (r) => is(PATTERN[r][3], 6) },
      { lab: 'BA', c: th.pos, at: (r) => PATTERN[r][1], note: true },
    ];
    const header = H >= 10 ? 1 : 0;
    const footer = H >= 14 ? 1 : 0;
    const lab = W >= 44 ? 3 : 0;
    const cw = Math.max(2, Math.floor((W - lab) / 16));
    const x0 = lab + Math.max(0, Math.floor((W - lab - cw * 16 + 1) / 2));
    let avail = H - header - footer;
    const marker = avail >= 6 ? 1 : 0;
    avail -= marker;
    const trH = avail >= 12 ? 2 : 1;
    const nT = Math.min(TR.length, Math.max(1, Math.floor(avail / trH)));
    const gap = avail - nT * trH >= nT - 1 ? 1 : 0;
    const topY = header + marker;
    const group = [th.neg, th.warn, th.accent, th.pos];
    const hx2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    return (t) => {
      const s = songAt(t);
      const step = s.row & 15, bar = s.bar;
      if (header) {
        b.fill(0, 0, W, 1, ' ', th.ink, th.panel);
        b.text(1, 0, 'TR-64 RHYTHM COMPOSER', th.ink, th.panel);
        const beatLit = (s.t / (ROW * 4)) % 1 < 0.5;
        const right = `PTN A${bar + 1}  STEP ${hx2(s.row)}  BPM 125 `;
        if (W >= 56) b.text(W - right.length - 2, 0, right, th.muted, th.panel);
        b.set(W - 2, 0, '●', beatLit ? th.pos : lerpc(th.panel, th.pos, 0.25), th.panel);
      }
      if (marker) {
        const mx = x0 + step * cw + ((cw - 2) >> 1);
        b.set(mx, header, '▼', light(th));
      }
      for (let ti = 0; ti < nT; ti++) {
        const tr = TR[ti];
        const y = topY + ti * (trH + gap);
        if (lab) b.text(0, y, tr.lab, tr.c);
        for (let st = 0; st < 16; st++) {
          const ev = tr.at(bar * 16 + st);
          const g = group[st >> 2];
          let col = ev ? tr.c : lerpc(th.bg, g, 0.22);
          let chG = ev ? '█' : '▒';
          if (st === step) {
            col = ev && s.frac < 0.4 ? lerpc(tr.c, light(th), 0.65) : lerpc(col, light(th), 0.28);
            if (!ev) chG = '█';
          }
          const px = x0 + st * cw;
          for (let r2 = 0; r2 < trH; r2++) for (let dx = 0; dx < cw - 1; dx++) b.set(px + dx, y + r2, chG, col);
          if (tr.note && ev && cw >= 4) b.text(px, y, noteName(ev.note).slice(0, cw - 1), onFill(th, col));
        }
      }
      if (footer) {
        const y = H - 1;
        for (let st = 0; st < 16; st++) {
          const mx = x0 + st * cw;
          b.text(mx, y, st % 4 === 0 ? String(st / 4 + 1) : '·', st % 4 === 0 ? th.muted : lerpc(th.bg, th.muted, 0.6));
        }
        const tail = 'SHUF 54%';
        if (x0 + 16 * cw + tail.length + 1 < W) b.text(W - tail.length - 1, y, tail, lerpc(th.bg, th.muted, 0.8));
      }
    };
  },
};

export default [sidVoices, pianoRoll, stepSeq];
