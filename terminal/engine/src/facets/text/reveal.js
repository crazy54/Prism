// Reveal & Type — text that arrives: a human-paced typewriter, big-type
// type/delete loops, decrypts, digital-rain reveals, letters that drop in
// under gravity, a split-flap departures board and four scramble styles.
import { mix, mixOklab } from '../../color.js';
import { drawBanner, measureBanner } from '../../text/banner.js';
import { bannerMode, fitFont, hash } from './_text.js';

const shared = { gallery: 'text', category: 'Reveal & Type', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── typewriter with a human rhythm ──────────────────────────────────────────
const NOTE = [
  'Dear night shift,',
  '',
  'The migration finished at 03:12 UTC and nothing was lost.',
  'Cache warm-up ran long, so next time we pre-warm the',
  'edge nodes first and keep the coffee closer.',
  '',
  'Thanks for watching the graphs with me.',
  '  -- R.',
];
// Neighbouring keys on a QWERTY row, for believable typos.
const NEIGHBOR = { a: 's', s: 'd', d: 'f', e: 'r', r: 't', t: 'y', i: 'o', o: 'p', n: 'm', h: 'j', l: 'k', c: 'v', g: 'h', u: 'i', w: 'e', m: 'n' };
// Common English bigrams roll off the fingers faster.
const FAST = new Set('th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce'.split(' '));

function typingSchedule(text, rng) {
  const ev = []; // [time, op, ch] — op: 'c' type, 'b' backspace, 'n' newline
  let t = 0.8;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], prev = text[i - 1] || ' ';
    if (ch === '\n') { t += 0.3 + rng() * 0.45; ev.push([t, 'n']); t += 0.2; continue; }
    let d = 0.05 + rng() * 0.065;
    if (FAST.has((prev + ch).toLowerCase())) d *= 0.55;
    if (prev === ' ') d += rng() < 0.18 ? 0.25 + rng() * 0.4 : 0.03; // a pause to think of the next word
    if (/[.,;:]/.test(prev)) d += 0.16 + rng() * 0.22;
    if (/[A-Z0-9:]/.test(ch)) d += 0.05; // reach for shift / the number row
    t += d;
    const wrong = NEIGHBOR[ch.toLowerCase()];
    if (wrong && rng() < 0.04) {
      ev.push([t, 'c', wrong]);
      let extra = 0;
      if (rng() < 0.5 && text[i + 1] && text[i + 1] !== '\n') { t += 0.07; ev.push([t, 'c', text[i + 1]]); extra = 1; }
      t += 0.28 + rng() * 0.25; // notice…
      for (let k = 0; k <= extra; k++) { ev.push([t, 'b']); t += 0.085; }
      t += 0.1;
    }
    ev.push([t, 'c', ch]);
  }
  return { ev, end: t };
}

function wrapHard(s, w) {
  if (s.length <= w) return [s];
  const out = [];
  for (let i = 0; i < s.length; i += w) out.push(s.slice(i, i + w));
  return out;
}

const typewriter = {
  ...shared,
  id: 'text-typewriter',
  title: 'Typewriter, Human Rhythm',
  tags: ['typewriter', 'typing', 'cursor', 'blink', 'realistic'],
  order: 100,
  loop: 30,
  size: { w: 72, h: 16 },
  minSize: { w: 40, h: 10 },
  description: 'A note typed at human speed — quick bigrams, pauses between words, the odd typo backspaced — with a cursor that blinks at rest.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const ascii = asciiOnly(ctx);
    const { ev, end } = typingSchedule(NOTE.join('\n'), rng);
    const period = end + 3.5;
    const cursor = ascii ? '_' : '▌';
    const rule = ascii ? '-' : '─';
    return (t) => {
      const b = ctx.buffer;
      const tau = t % period;
      const lines = [''];
      let keys = 0, bs = 0, last = 0, typed = 0;
      for (const [et, op, ch] of ev) {
        if (et > tau) break;
        keys++; last = et;
        if (op === 'c') { lines[lines.length - 1] += ch; typed++; } else if (op === 'b') { lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1); bs++; typed--; } else lines.push('');
      }
      // Header and status
      b.text(1, 0, 'note.txt', th.ink, undefined, 1);
      const wpm = tau > 2 ? Math.round(typed / 5 / ((Math.min(tau, end) - 0.8) / 60)) : 0;
      const right = `${wpm} wpm`;
      b.text(W - right.length - 1, 0, right, th.accent);
      b.text(0, 1, rule.repeat(W), th.line);
      const vis = [];
      for (const l of lines) vis.push(...wrapHard(l, W - 4));
      const rows = H - 3;
      const first = Math.max(0, vis.length - rows);
      for (let r = first; r < vis.length; r++) b.text(2, 2 + r - first, vis[r], th.ink);
      // Cursor: solid while keys are flying, blinking (530 ms) once idle.
      const idle = tau - last;
      const on = tau < end + 2.6 && (idle < 0.5 || Math.floor(idle / 0.53) % 2 === 0);
      const cl = vis.length - 1 - first;
      if (on) b.text(2 + vis[vis.length - 1].length, 2 + cl, cursor, th.accent);
      const pos = `ln ${lines.length}, col ${lines[lines.length - 1].length + 1}`;
      b.text(1, H - 1, `${pos}   keys ${keys}   backspaces ${bs}`.slice(0, W - 2), th.dim);
    };
  },
};

// ── big type / delete loop ──────────────────────────────────────────────────
const WORDS = ['HELLO', 'TYPE IT', 'DELETE', 'REPEAT'];

const typeBanner = {
  ...shared,
  id: 'text-type-banner',
  title: 'Big Type & Delete',
  tags: ['typewriter', 'banner', 'cursor', 'hero', 'loop'],
  order: 110,
  loop: 18,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'Big letters typed in one keystroke at a time behind a blinking block cursor, held, deleted back to nothing, then the next word.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const longest = WORDS.reduce((a, w) => (w.length > a.length ? w : a), '');
    const { font, scale } = fitFont(longest + 'M', ['bold', 'standard', 'tiny'], { mode }, W - 2, H - 2);
    const cfg = { font, mode, scale };
    // Timeline: [time, visible chars] for each word.
    const ev = [];
    let t0 = 0.3;
    WORDS.forEach((w, wi) => {
      for (let i = 1; i <= w.length; i++) { t0 += 0.09 + hash(wi, i) * 0.16 + (w[i - 1] === ' ' ? 0.15 : 0); ev.push([t0, i, wi]); }
      t0 += 1.6;
      for (let i = w.length - 1; i >= 0; i--) { t0 += 0.045; ev.push([t0, i, wi]); }
      t0 += 0.45;
    });
    const period = t0;
    return (t) => {
      const b = ctx.buffer;
      const tau = t % period;
      let n = 0, wi = 0, last = 0;
      for (const e of ev) { if (e[0] > tau) { wi = e[2]; break; } n = e[1]; wi = e[2]; last = e[0]; }
      const word = WORDS[wi];
      const full = measureBanner(word + 'M', cfg);
      const x = Math.max(0, Math.floor((W - full.width) / 2)), y = Math.max(0, Math.floor((H - full.height) / 2));
      const idle = tau - last;
      const blinkOn = idle < 0.35 || Math.floor(idle / 0.5) % 2 === 0;
      const text = n ? word.slice(0, n) : ' ';
      drawBanner(b, x, y, text, { ...cfg, fill: [th.accent, th.info], theme: th, t, speed: 0.1, cursorAt: blinkOn ? (n ? n : 0) : undefined, cursorColor: th.ink });
    };
  },
};

// ── decrypt ─────────────────────────────────────────────────────────────────
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?@<>';
const SECRETS = ['ENCRYPTED', 'HANDSHAKE', 'VERIFIED'];
const DSEG = 5;

const decrypt = {
  ...shared,
  id: 'text-decrypt',
  title: 'Decrypt Reveal',
  tags: ['decrypt', 'scramble', 'hacker', 'reveal', 'cipher'],
  order: 120,
  loop: DSEG * SECRETS.length,
  size: { w: 80, h: 16 },
  minSize: { w: 36, h: 9 },
  description: 'Fixed-pitch big letters churn through random glyphs and lock in left to right, with a key fingerprint and progress bar resolving below.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const ascii = asciiOnly(ctx);
    const n = Math.max(...SECRETS.map((s) => s.length));
    // Fixed pitch so scrambling glyphs never shift their neighbors.
    let pick = null;
    for (const font of ['bold', 'standard', 'tiny']) {
      for (let scale = 4; scale >= 1; scale--) {
        const cw = measureBanner('W', { font, mode, scale }).width, pitch = measureBanner('WW', { font, mode, scale }).width - cw;
        const h = measureBanner('W', { font, mode, scale }).height;
        if (pitch * n <= W - 2 && h <= H - 5) { pick = { font, scale, cw, pitch, h }; break; }
      }
      if (pick) break;
    }
    pick ||= { font: 'tiny', scale: 1, cw: 3, pitch: 4, h: measureBanner('W', { font: 'tiny', mode }).height };
    const { font, scale, cw, pitch, h } = pick;
    const KEY = '7f:3a:91:c4:0e:b2:58:d6';
    return (t) => {
      const b = ctx.buffer;
      const k = Math.floor(t / DSEG) % SECRETS.length, tau = t % DSEG;
      const word = SECRETS[k];
      const x0 = Math.floor((W - (pitch * word.length - (pitch - cw))) / 2), y0 = Math.max(0, Math.floor((H - h - 3) / 2));
      let locked = 0;
      for (let i = 0; i < word.length; i++) {
        const lockAt = 0.3 + i * 0.16 + hash(i, k) * 0.35;
        const relockAt = DSEG - 0.6 + (word.length - i) * 0.03;
        const solved = tau >= lockAt && tau < relockAt;
        if (solved) locked++;
        const ch = solved ? word[i] : SCRAMBLE[Math.floor(hash(i, Math.floor(t * 16), k) * SCRAMBLE.length)];
        const flash = solved && tau - lockAt < 0.18;
        const fill = solved ? (flash ? th.ink : [th.pos, th.info]) : mix(th.pos, th.bg, 0.35 + 0.35 * hash(i, Math.floor(t * 9)));
        const gw = measureBanner(ch, { font, mode, scale }).width;
        drawBanner(b, x0 + i * pitch + Math.floor((cw - gw) / 2), y0, ch, { font, mode, scale, fill, direction: 'vertical', theme: th });
      }
      // Fingerprint + progress
      const p = locked / word.length;
      const y1 = y0 + h + 1;
      const keyShown = [...KEY].map((c, i) => (c === ':' || i / KEY.length < p ? c : '0123456789abcdef'[Math.floor(hash(i, Math.floor(t * 20)) * 16)])).join('');
      const line = `key ${keyShown}`;
      if (y1 < H) b.text(Math.floor((W - line.length) / 2), y1, line, p >= 1 ? th.ink : th.muted);
      const bw = Math.min(30, W - 12), f = Math.round(bw * p);
      const bar = ascii ? `[${'#'.repeat(f)}${'.'.repeat(bw - f)}]` : `${'█'.repeat(f)}${'░'.repeat(bw - f)}`;
      const status = `${bar} ${String(Math.round(p * 100)).padStart(3)}%`;
      if (y1 + 1 < H) b.text(Math.floor((W - status.length) / 2), y1 + 1, status, p >= 1 ? th.pos : th.accent);
    };
  },
};

// ── matrix reveal ───────────────────────────────────────────────────────────
const KANA = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
const RAIN_ASCII = '0123456789ABCDEFXZ$+-*/=%<>#&@';
const MESSAGE = ['wake up, operator...', 'the build has you.', 'follow the green prompt.'];
const MCYCLE = 12;

const matrixReveal = {
  ...shared,
  id: 'text-matrix-reveal',
  title: 'Digital Rain Reveal',
  tags: ['matrix', 'digital rain', 'reveal', 'katakana', 'message'],
  order: 130,
  loop: MCYCLE,
  size: { w: 80, h: 24 },
  minSize: { w: 30, h: 10 },
  description: 'Green code rain pours down; wherever a falling head crosses the hidden message, that letter locks in bright and stays.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const glyphs = asciiOnly(ctx) ? RAIN_ASCII : KANA;
    const cols = Array.from({ length: W }, () => ({ speed: 7 + rng() * 14, off: rng() * 3.2, len: 6 + Math.floor(rng() * H * 0.7), gap: 0.3 + rng() * 1.5 }));
    const lines = MESSAGE.map((l) => (l.length > W - 2 ? l.slice(0, W - 2) : l));
    const my = Math.floor(H / 2) - Math.floor(lines.length / 2) - 1;
    const msg = new Map();
    lines.forEach((l, r) => {
      const x0 = Math.floor((W - l.length) / 2);
      for (let i = 0; i < l.length; i++) if (l[i] !== ' ') msg.set((my + r * 2) * W + x0 + i, l[i]);
    });
    const head = mixOklab(th.pos, th.ink, 0.7);
    return (t) => {
      const b = ctx.buffer;
      const tau = t % MCYCLE;
      for (let x = 0; x < W; x++) {
        const c = cols[x];
        const per = (H + c.len) / c.speed + c.gap;
        const k0 = Math.floor((tau - c.off) / per);
        for (let k = Math.max(0, k0 - 1); k <= k0; k++) {
          const hy = Math.floor((tau - c.off - k * per) * c.speed);
          for (let j = 0; j < c.len; j++) {
            const y = hy - j;
            if (y < 0 || y >= H) continue;
            const g = glyphs[Math.floor(hash(x, y, Math.floor(t * (j === 0 ? 14 : 2)) + j) * glyphs.length)];
            const fade = j / c.len;
            b.set(x, y, g, j === 0 ? head : mix(th.pos, th.bg, Math.min(0.85, fade * 0.95)), undefined, j === 0 ? 1 : 0);
          }
        }
        // Locked message cells in this column
        for (let y = 0; y < H; y++) {
          const ch = msg.get(y * W + x);
          if (!ch) continue;
          const lockAt = c.off + (y + 1) / c.speed;
          const unlockAt = MCYCLE - 2.2 + hash(x, y) * 1.6;
          if (tau < lockAt || tau > unlockAt) continue;
          const fresh = tau - lockAt < 0.3;
          b.set(x, y, ch, fresh ? th.ink : mixOklab(th.pos, th.ink, 0.35), th.bg, 1);
        }
      }
    };
  },
};

// ── falling letters ─────────────────────────────────────────────────────────
const DROPS = ['GRAVITY', 'BOUNCE', 'RAIN', 'TUMBLE'];
const FSEG = 5;

/** Height above rest (px) of a body dropped from h0 with gravity g and restitution e, tau seconds after release. */
function bounceHeight(tau, h0, g, e = 0.42) {
  const t1 = Math.sqrt((2 * h0) / g);
  if (tau < t1) return h0 - 0.5 * g * tau * tau;
  tau -= t1;
  let v = e * g * t1;
  while (v > 4) {
    const flight = (2 * v) / g;
    if (tau < flight) return v * tau - 0.5 * g * tau * tau;
    tau -= flight; v *= e;
  }
  return 0;
}

const falling = {
  ...shared,
  id: 'text-falling-letters',
  title: 'Falling Letters',
  tags: ['falling', 'gravity', 'bounce', 'rain', 'physics'],
  order: 140,
  loop: FSEG * DROPS.length,
  size: { w: 72, h: 18 },
  minSize: { w: 36, h: 10 },
  description: 'Big letters rain down one after another, bounce to rest under gravity, hold, then drop away through the floor for the next word.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const mode = bannerMode(ctx, 'half');
    const sy = { braille: 4, sextant: 3, quad: 2, half: 2, ascii: 1 }[mode] || 1;
    const longest = DROPS.reduce((a, w) => (w.length > a.length ? w : a), '');
    const { font, scale } = fitFont(longest, ['bold', 'standard', 'tiny'], { mode }, W - 2, Math.floor(H * 0.55));
    const textRows = measureBanner(longest, { font, mode, scale }).height;
    const padY = Math.max(1, Math.ceil((H - textRows) / 2)) * sy;
    const restPx = padY + 7 * scale; // rest → just above the canvas top
    const g = (2 * restPx) / (0.55 * 0.55);
    const drizzle = Array.from({ length: Math.round(W / 3) }, () => ({ x: Math.floor(rng() * W), sp: 6 + rng() * 10, off: rng() * 10, ch: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(rng() * 26)] }));
    return (t) => {
      const b = ctx.buffer;
      for (const d of drizzle) {
        const y = Math.floor((d.off + t * d.sp) % (H + 4)) - 2;
        b.set(d.x, y, d.ch.toLowerCase(), mix(th.dim, th.bg, 0.2));
      }
      const k = Math.floor(t / FSEG) % DROPS.length, tau = t % FSEG;
      const word = DROPS[k];
      const style = (ci) => {
        const t0 = 0.08 + ci * 0.11;
        if (tau < t0) return { hidden: true };
        const exit = 3.7 + ci * 0.07;
        if (tau > exit) { const d = 0.5 * g * (tau - exit) ** 2; return d > padY * 2 + textRows * sy ? { hidden: true } : { dy: Math.round(d) }; }
        return { dy: -Math.round(bounceHeight(tau - t0, restPx, g)) };
      };
      const m = measureBanner(word, { font, mode, scale, padY });
      drawBanner(b, Math.floor((W - m.width) / 2), Math.floor((H - m.height) / 2), word, { font, mode, scale, padY, fill: [th.warn, th.crit], direction: 'vertical', theme: th, charStyle: style });
    };
  },
};

// ── split-flap board ────────────────────────────────────────────────────────
const FLAPS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-';
const PAGES = [
  ['09:41 LISBON      A12 BOARDING ', '09:55 REYKJAVIK   B03 ON TIME  ', '10:10 OSAKA       C07 DELAYED  ', '10:25 NAIROBI     A04 ON TIME  ', '10:40 VALPARAISO  D11 CANCELLED'],
  ['10:55 TALLINN     B09 ON TIME  ', '11:05 HOBART      C02 BOARDING ', '11:20 MARRAKESH   A07 ON TIME  ', '11:35 QUEBEC      D04 DELAYED  ', '11:50 ULAANBAATAR B12 ON TIME  '],
];
const SSEG = 7;

const splitFlap = {
  ...shared,
  id: 'text-split-flap',
  title: 'Split-Flap Board',
  tags: ['split flap', 'solari', 'departures', 'board', 'airport'],
  order: 150,
  loop: SSEG * PAGES.length,
  size: { w: 66, h: 14 },
  minSize: { w: 34, h: 9 },
  description: 'A departures board whose tiles riffle through the alphabet one flap at a time until every row settles on its new flight.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cols = PAGES[0][0].length;
    const tile = W >= cols * 2 + 2 ? 2 : 1;
    const x0 = Math.max(0, Math.floor((W - cols * tile) / 2));
    const rows = Math.min(PAGES[0].length, Math.max(1, Math.floor((H - 3) / (H >= 13 ? 2 : 1))));
    const step = H >= 13 ? 2 : 1;
    const idx = (c) => Math.max(0, FLAPS.indexOf(c));
    const statusColor = (s) => (/BOARD/.test(s) ? th.pos : /DELAY/.test(s) ? th.warn : /CANCEL/.test(s) ? th.neg : th.ink);
    return (t) => {
      const b = ctx.buffer;
      const p = Math.floor(t / SSEG) % PAGES.length, tau = t % SSEG;
      const from = PAGES[(p + PAGES.length - 1) % PAGES.length], to = PAGES[p];
      b.text(x0, 0, 'DEPARTURES', th.warn, undefined, 1);
      const clock = to[0].slice(0, 5);
      b.text(x0 + cols * tile - clock.length, 0, clock, th.muted);
      for (const [c, label] of [[0, 'TIME'], [6, tile === 2 ? 'DESTINATION' : 'DEST'], [18, tile === 2 ? 'GATE' : 'GT'], [22, 'STATUS']]) b.text(x0 + c * tile, 1, label, th.dim);
      for (let r = 0; r < rows; r++) {
        const y = 2 + r * step;
        for (let c = 0; c < cols; c++) {
          const a = idx(from[r][c]), z = idx(to[r][c]);
          const dist = (z - a + FLAPS.length) % FLAPS.length;
          const start = 0.2 + r * 0.25 + c * 0.03 + hash(r, c) * 0.3;
          const flips = Math.max(0, Math.min(dist, Math.floor((tau - start) * 20)));
          const ch = FLAPS[(a + flips) % FLAPS.length];
          const moving = flips < dist && tau >= start;
          const fg = moving ? th.muted : c >= 22 ? statusColor(to[r].slice(22)) : c < 5 ? th.warn : th.ink;
          const bg = moving ? th.panel2 : th.panel;
          b.set(x0 + c * tile, y, ch, fg, bg, moving ? 0 : 1);
        }
      }
    };
  },
};

// ── scramble styles ─────────────────────────────────────────────────────────
const STYLES = [
  { name: 'glyphs', set: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*?' },
  { name: 'binary', set: '01' },
  { name: 'hex', set: '0123456789abcdef' },
  { name: 'blocks', set: '░▒▓█', ascii: '.:#@' },
];
const PHRASES = [
  ['root cause: pool exhausted', 'retrying in 3 seconds', 'all checks passed', 'deploy window open'],
  ['00101 handshake ok', 'session key rotated', 'payload verified', 'tunnel established'],
  ['sha 9f3c...e1a0 match', 'block 4.2M sealed', 'index rebuilt', 'cache primed'],
  ['signal acquired', 'locking frequency', 'channel 7 clear', 'transmission ends'],
];

const scramble = {
  ...shared,
  id: 'text-scramble',
  title: 'Scramble Styles',
  tags: ['scramble', 'decode', 'morph', 'binary', 'hex'],
  order: 160,
  loop: 16,
  size: { w: 60, h: 12 },
  minSize: { w: 34, h: 8 },
  description: 'Four ways to scramble a line — glyph noise, binary, hex and shaded blocks — each morphing phrase to phrase, char by char.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ascii = asciiOnly(ctx);
    const labelW = W >= 48 ? 9 : 0;
    const step = H >= 11 ? 2 : 1;
    const top = Math.max(0, Math.floor((H - STYLES.length * step) / 2));
    return (t) => {
      const b = ctx.buffer;
      STYLES.forEach((st, r) => {
        const y = top + r * step;
        if (y >= H) return;
        const set = ascii && st.ascii ? st.ascii : st.set;
        const tt = t + r * 0.9;
        const k = Math.floor(tt / 4), tau = tt % 4;
        const from = PHRASES[r][(k + 3) % 4], to = PHRASES[r][k % 4];
        const n = Math.max(from.length, to.length);
        if (labelW) b.text(1, y, st.name, th.dim);
        for (let i = 0; i < Math.min(n, W - labelW - 2); i++) {
          const s0 = hash(i, r, k) * 0.9, s1 = s0 + 0.25 + hash(i, r + 9, k) * 0.7;
          let ch, fg;
          if (tau < s0) { ch = from[i] || ' '; fg = th.muted; }
          else if (tau < s1) { ch = set[Math.floor(hash(i, Math.floor(t * 18), r) * set.length)]; fg = r === 1 ? th.pos : r === 2 ? th.info : r === 3 ? th.warn : th.accent; }
          else { ch = to[i] || ' '; fg = th.ink; }
          b.set(labelW + 1 + i, y, ch, fg);
        }
      });
    };
  },
};

export default [typewriter, typeBanner, decrypt, matrixReveal, falling, splitFlap, scramble];
