// Motion — type that moves: a bobbing wave over its rippling reflection, a
// demoscene sine scroller, a dot-matrix LED board and a big 7-segment clock.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas, layoutText } from '../../text/banner.js';
import { bannerMode, fitType, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Motion', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── wave + reflection ───────────────────────────────────────────────────────
const wave = {
  ...shared,
  id: 'text-wave',
  title: 'Wave & Ripple',
  tags: ['wave', 'ripple', 'reflection', 'water', 'bounce'],
  order: 100,
  loop: 6.283,
  size: { w: 72, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'Letters ride a traveling sine wave while their reflection shimmers below in rippling water, rows sliding as the surface moves.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'RIPPLE'));
    const { font, scale } = fitType(text, { mode }, W - 2, Math.floor(H * 0.42));
    const cfg0 = { font, mode };
    const sy = Math.max(1, Array.isArray(scale) ? scale[1] : 1);
    const amp = 2 * sy;
    const cfg = { ...cfg0, scale, padY: amp };
    const probe = bannerCanvas(text, cfg);
    const cv = canvasLike(probe, W, H);
    const ox = Math.floor((cv.width - probe.width) / 2);
    const oy = Math.max(0, Math.floor(cv.height * 0.5) - probe.height);
    const water = oy + probe.height;
    return (t) => {
      const b = ctx.buffer;
      const src = bannerCanvas(text, {
        ...cfg, fill: [th.info, th.accent, th.crit], theme: th, t, speed: 0.2,
        charStyle: (ci) => ({ dy: Math.round(Math.sin(t * 3 - ci * 0.7) * amp) }),
      });
      cv.clear();
      cv.draw(src, ox, oy);
      // Surface line
      for (let x = 0; x < cv.width; x++) cv.set(x, water, mix(th.info, th.bg, Math.sin(x * 0.45 - t * 4) > 0.6 ? 0.35 : 0.72));
      // Reflection: rows flipped and squashed, each slid by the ripple, darkening with depth.
      const depth = cv.height - water - 1;
      for (let r = 1; r <= depth; r++) {
        const srcY = src.height - 1 - r;
        if (srcY < 0) break;
        const dx = Math.round(Math.sin(r * 0.8 - t * 4) * (0.5 + r * 0.06));
        const k = 0.5 + 0.4 * (r / Math.max(1, depth));
        for (let x = 0; x < src.width; x++) {
          const c = src.px[srcY * src.width + x];
          if (c !== NONE) cv.set(x + ox + dx, water + r, mixOklab(mix(c, th.info, 0.3), th.bg, k));
        }
      }
      cv.paint(b, 0, 0);
    };
  },
};

// ── sine scroller ───────────────────────────────────────────────────────────
const SCROLL = 'GREETINGS TO EVERYONE STILL CODING AT 3AM ... PRISM-TERM SAYS HI ... ' +
  'THIS SCROLLER IS PURE TEXT, EVERY PIXEL A HALF BLOCK ... KEEP YOUR LOOPS TIGHT AND YOUR FRAMES UNDER 25 MS ... ';

const scroller = {
  ...shared,
  id: 'text-sine-scroller',
  title: 'Sine Scroller',
  tags: ['scroller', 'sine', 'demoscene', 'cracktro', 'greetings'],
  order: 110,
  loop: 30,
  size: { w: 80, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'The demoscene classic: an endless greetings message scrolls past in big rainbow letters, every pixel column riding a sine curve.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', SCROLL));
    const font = H >= 12 ? 'bold' : 'tiny';
    const src = bannerCanvas(text + text.slice(0, 30), { font, mode, fill: th.ink, theme: th });
    const pal = ctx.palette('prism');
    const span = bannerCanvas(text, { font, mode }).width;
    const cv = canvasLike(src, W, H);
    const amp = Math.max(1, Math.floor((cv.height - src.height) / 2) - 1);
    const mid = Math.floor((cv.height - src.height) / 2);
    const pxPerSec = 12 * (cv.width / W) * 1.6;
    return (t) => {
      const b = ctx.buffer;
      cv.clear();
      const off = Math.floor(t * pxPerSec) % span;
      for (let x = 0; x < cv.width; x++) {
        const sx = x + off;
        if (sx >= src.width) continue;
        const dy = Math.round(Math.sin(x * 0.09 + t * 2.4) * amp * 0.85 + Math.sin(x * 0.031 - t * 1.1) * amp * 0.15);
        const c = pal((x / cv.width * 0.8 + t * 0.15) % 1);
        for (let y = 0; y < src.height; y++) if (src.px[y * src.width + sx] !== NONE) cv.set(x, mid + y + dy, y === 0 ? mixOklab(c, 0xffffff, 0.4) : c);
      }
      // A soft copper line under the scroller
      const cy = cv.height - 1;
      for (let x = 0; x < cv.width; x++) cv.set(x, cy, mix(th.accent, th.bg, 0.55 + 0.35 * Math.abs(Math.sin(x * 0.05 + t))));
      cv.paint(b, 0, 0);
    };
  },
};

// ── LED dot-matrix board ────────────────────────────────────────────────────
const LED_MSG = 'NEXT TRAIN  HARBOUR POINT  2 MIN   ***   PLEASE MIND THE GAP   ***   ';

const led = {
  ...shared,
  id: 'text-marquee',
  title: 'LED Ticker Board',
  tags: ['marquee', 'ticker', 'led', 'dot matrix', 'sign'],
  order: 120,
  loop: 24,
  size: { w: 72, h: 11 },
  minSize: { w: 30, h: 9 },
  description: 'An amber dot-matrix sign: every LED is a cell, unlit ones faintly visible, and the message steps left one column at a time.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ascii = asciiOnly(ctx);
    const msg = String(ctx.param('text', LED_MSG)).toUpperCase();
    const lay = layoutText(msg, { font: 'standard' });
    const MW = lay.width + 1, MH = 7;
    const bits = new Uint8Array(MW * MH);
    for (const l of lay.lines) for (const { gl, x } of l.glyphs)
      for (let gy = 0; gy < Math.min(MH, gl.h); gy++) for (let gx = 0; gx < gl.w; gx++) if (gl.bits[gy * gl.w + gx]) bits[gy * MW + x + gx] = 1;
    const amber = th.warn, offC = mix(th.warn, th.bg, 0.82), glowBg = mix(th.warn, th.bg, 0.9);
    const [on, off] = ascii ? ['O', '.'] : ['●', '·'];
    const bw = W - 2, y0 = Math.max(1, Math.floor((H - MH - 2) / 2) + 1);
    const box = ascii ? ['+', '+', '+', '+', '-', '|'] : ['╭', '╮', '╰', '╯', '─', '│'];
    return (t) => {
      const b = ctx.buffer;
      const step = Math.floor(t * 12);
      b.text(0, y0 - 1, box[0] + box[4].repeat(W - 2) + box[1], th.line);
      b.text(0, y0 + MH, box[2] + box[4].repeat(W - 2) + box[3], th.line);
      for (let y = 0; y < MH; y++) {
        b.set(0, y0 + y, box[5], th.line);
        b.set(W - 1, y0 + y, box[5], th.line);
        for (let x = 0; x < bw; x++) {
          const lit = bits[y * MW + ((x + step) % MW)];
          b.set(1 + x, y0 + y, lit ? on : off, lit ? amber : offC, lit && !ascii ? glowBg : undefined);
        }
      }
      if (y0 + MH + 1 < H) b.text(1, y0 + MH + 1, `PLATFORM 2   ${String(9 + Math.floor(t / 60)).padStart(2, '0')}:41`, th.dim);
    };
  },
};

// ── 7-segment clock ─────────────────────────────────────────────────────────
//                 a  b  c  d  e  f  g
const SEGS = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];

function hbar(cv, x0, x1, y, T, c) {
  for (let r = 0; r < T; r++) {
    const inset = T > 2 ? Math.min(r, T - 1 - r) : 0;
    for (let x = x0 + inset; x <= x1 - inset; x++) cv.set(x, y + r, c);
  }
}
function vbar(cv, x, y0, y1, T, c) {
  for (let r = 0; r < T; r++) {
    const inset = T > 2 ? Math.min(r, T - 1 - r) : 0;
    for (let y = y0 + inset; y <= y1 - inset; y++) cv.set(x + r, y, c);
  }
}
/** Draw one 7-segment digit; unlit segments in `off` (LCD ghosting). */
function digit(cv, d, x, y, w, h, T, on, off) {
  const s = SEGS[d] || SEGS[8];
  const mid = y + Math.floor((h - T) / 2);
  const col = (i) => (s[i] === '1' ? on : off);
  hbar(cv, x + 1, x + w - 2, y, T, col(0));                    // a
  vbar(cv, x + w - T, y + 1, mid - 1, T, col(1));              // b
  vbar(cv, x + w - T, mid + T, y + h - 2, T, col(2));          // c
  hbar(cv, x + 1, x + w - 2, y + h - T, T, col(3));            // d
  vbar(cv, x, mid + T, y + h - 2, T, col(4));                  // e
  vbar(cv, x, y + 1, mid - 1, T, col(5));                      // f
  hbar(cv, x + 1, x + w - 2, mid, T, col(6));                  // g
}

const clock = {
  ...shared,
  id: 'text-clock',
  title: 'Big Digital Clock',
  tags: ['clock', '7 segment', 'digital', 'time', 'lcd'],
  order: 130,
  loop: 60,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'A big seven-segment clock — HH:MM with a blinking colon, small seconds, faint unlit segments like a real LCD, and the date.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cv = ctx.canvas('field');
    const FW = cv.width, FH = cv.height;
    const rows = H > 10 ? 2 : 1;
    const capH = Math.ceil((rows * FH) / H);
    const gap = FW < 60 ? 1 : Math.max(2, Math.round(FW / 40));
    // Digit width with the small seconds; narrow screens drop them so HH:MM stays big.
    const fitW = (sec) => Math.floor((FW - 8 - gap * (sec ? 6 : 4)) / (sec ? 5.2 : 4));
    let dw = fitW(true) >= 6 ? fitW(true) : fitW(false);
    let dh = Math.min(FH - capH - 2, Math.round(dw * 1.75));
    dw = Math.min(dw, Math.round(dh / 1.75));
    const T = Math.max(1, Math.round(dw / 5));
    const sw = Math.max(3, Math.round(dw * 0.6)), sh = Math.max(5, Math.round(dh * 0.6)), sT = T <= 2 ? T : Math.round(T * 0.7);
    const colonW = T * 2 + 2;
    const hm = dw * 4 + gap * 4 + colonW, withSec = hm + gap * 2 + sw * 2;
    const showSec = withSec <= FW;
    const total = showSec ? withSec : hm - gap;
    const x0 = Math.max(0, Math.floor((FW - total) / 2)), y0 = Math.max(0, Math.floor((FH - dh - capH) / 2));
    const on = th.accent, off = mix(th.accent, th.bg, 0.9), sOn = th.info, sOff = mix(th.info, th.bg, 0.9);
    const start = 9 * 3600 + 41 * 60;
    const DAYS = ['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'MON'];
    return (t) => {
      const b = ctx.buffer;
      cv.clear();
      const s = Math.floor(start + t);
      const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60, ss = s % 60;
      const h12 = hh % 12 || 12;
      const ds = [Math.floor(h12 / 10), h12 % 10, Math.floor(mm / 10), mm % 10];
      let x = x0;
      ds.forEach((d, i) => {
        if (i === 0 && d === 0) digit(cv, 8, x, y0, dw, dh, T, off, off); // leading zero stays dark
        else digit(cv, d, x, y0, dw, dh, T, on, off);
        x += dw + gap;
        if (i === 1) {
          const lit = (t % 1) < 0.5 ? on : off;
          for (const fy of [0.3, 0.7]) for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) cv.set(x + 1 + c, y0 + Math.round(dh * fy) - (T >> 1) + r, lit);
          x += colonW + gap;
        }
      });
      x += gap;
      const syy = y0 + dh - sh;
      if (showSec) {
        digit(cv, Math.floor(ss / 10), x, syy, sw, sh, sT, sOn, sOff);
        digit(cv, ss % 10, x + sw + gap, syy, sw, sh, sT, sOn, sOff);
      }
      cv.paint(b, 0, 0);
      // Captions in cells: AM/PM over the seconds, the date underneath.
      const cellX = (px) => Math.floor(px / cv.sx);
      const ampm = hh < 12 ? 'AM' : 'PM';
      const ay = Math.floor(y0 / cv.sy);
      if (showSec) b.text(Math.min(W - 2, cellX(x)), ay, ampm, th.ink, undefined, 1);
      const date = `${DAYS[Math.floor(s / 86400) % 7]} 13 OCT 2026`;
      const dy = Math.min(H - 1, Math.ceil((y0 + dh) / cv.sy) + (rows > 1 ? 1 : 0));
      if (dy < H && dy * cv.sy >= y0 + dh) b.text(Math.floor((W - date.length) / 2), dy, date, th.muted);
    };
  },
};

export default [wave, scroller, led, clock];
