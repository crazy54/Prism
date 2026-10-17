// Glitch & Distort — pixel-level abuse of big type: tearing RGB splits, a
// worn VHS tape with tracking noise, and letters that melt and drip.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas } from '../../text/banner.js';
import { glitch as glitchSmall } from '../../text/effects.js';
import { bannerMode, fitScale, fitType, hash, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Glitch & Distort', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── RGB split / tearing ─────────────────────────────────────────────────────
const glitchText = {
  ...shared,
  id: 'text-glitch',
  title: 'RGB Split Glitch',
  tags: ['glitch', 'rgb split', 'tearing', 'datamosh', 'corruption'],
  order: 100,
  loop: 6,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'Big type torn into horizontal slices, red and cyan channels pulled apart, blocks displaced — in bursts, like a failing signal.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'GLITCH'));
    const pad = 5;
    const { font, scale } = fitType(text, { mode, padX: pad, padY: 2 }, W, H - 2);
    const base = bannerCanvas(text, { font, mode, scale, padX: pad, padY: 2, fill: th.ink, theme: th });
    const out = canvasLike(base);
    const w = base.width, h = base.height;
    const rowDx = new Int16Array(h);
    const red = th.neg, cyan = th.info;
    const captions = ['SIGNAL CORRUPTED', 'ERR 0x5F FRAME DROP', 'RESYNCING...'];
    const ascii = asciiOnly(ctx);
    return (t) => {
      const b = ctx.buffer;
      const k = Math.floor(t * 12);
      const burst = t % 3 < 0.35 || hash(k, 1) < 0.22;
      const amt = burst ? 1 : 0.12;
      // Horizontal tears in bands of 1–4 pixel rows.
      for (let y = 0; y < h;) {
        const bh = 1 + Math.floor(hash(y, k, 2) * 4);
        const dx = hash(y, k, 3) < 0.4 * amt ? Math.round((hash(y, k, 4) - 0.5) * 14 * amt) : 0;
        for (let r = y; r < Math.min(h, y + bh); r++) rowDx[r] = dx;
        y += bh;
      }
      // At rest a 1-px fringe; none in ascii mode, where the copies would fuse into '#'.
      const s = burst ? 2 + Math.floor(hash(k, 5) * 3) : mode === 'ascii' ? 0 : 1;
      out.clear();
      if (s) for (const [ox, oy, col] of [[-s, 0, red], [s, burst ? 1 : 0, cyan]])
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (base.px[y * w + x] !== NONE) out.set(x + rowDx[y] + ox, y + oy, col);
      for (let y = 0; y < h; y++) {
        const invert = burst && hash(y, k, 6) < 0.08;
        for (let x = 0; x < w; x++) if (base.px[y * w + x] !== NONE) out.set(x + rowDx[y], y, invert ? th.bg : th.ink);
      }
      // Displaced blocks: chunks of the image copied a little way off.
      if (burst) for (let n = 0; n < 3; n++) {
        const bw = 4 + Math.floor(hash(n, k, 7) * 10), bh = 1 + Math.floor(hash(n, k, 8) * 3);
        const sx = Math.floor(hash(n, k, 9) * (w - bw)), sy = Math.floor(hash(n, k, 10) * (h - bh));
        const dx = Math.round((hash(n, k, 11) - 0.5) * 16);
        const tint = n === 0 ? red : n === 1 ? cyan : th.accent;
        for (let y = sy; y < sy + bh; y++) for (let x = sx; x < sx + bw; x++) out.set(x + dx, y, base.px[y * w + x] !== NONE ? tint : NONE);
      }
      // A noisy scanline
      const ny = Math.floor(hash(k, 12) * h);
      for (let x = 0; x < w; x++) if (hash(x, k, 13) < (burst ? 0.5 : 0.12)) out.set(x, ny, mix(th.muted, th.bg, hash(x, k, 14) * 0.6));
      const x0 = Math.floor((W - out.cols) / 2), y0 = Math.max(0, Math.floor((H - out.rows - 1) / 2));
      out.paint(b, x0, y0);
      const cap = captions[Math.floor(t / 2) % captions.length];
      const cy = Math.min(H - 1, y0 + out.rows);
      glitchSmall(b, Math.floor((W - cap.length) / 2), cy, cap, t, { theme: th, color: th.muted, intensity: burst ? 1 : 0.2, ascii });
    };
  },
};

// ── VHS ─────────────────────────────────────────────────────────────────────
const vhs = {
  ...shared,
  id: 'text-vhs',
  title: 'VHS Tracking',
  tags: ['vhs', 'tape', 'tracking', 'scanlines', 'retro', 'osd'],
  order: 110,
  loop: 8,
  size: { w: 80, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'A title card off a worn tape: wobbling rows, chroma bleed, scanlines and a rolling tracking band, under a PLAY on-screen display.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const ascii = asciiOnly(ctx);
    const text = String(ctx.param('text', 'LATE SHOW'));
    const { font, scale } = fitType(text, { mode, padX: 3 }, W - 2, H - 5);
    const src = bannerCanvas(text, { font, mode, scale, padX: 3, fill: [th.ink, th.crit], direction: 'vertical', theme: th });
    const cv = canvasLike(src, W, H);
    const ox = Math.floor((cv.width - src.width) / 2), oy = Math.floor((cv.height - src.height) / 2);
    const play = ascii ? 'PLAY >' : 'PLAY ▶';
    const bleed = mode !== 'ascii';
    return (t) => {
      const b = ctx.buffer;
      cv.clear();
      const bandH = Math.max(2, Math.round(cv.height * 0.12));
      const bandY = Math.floor((t * cv.height * 0.35) % (cv.height + bandH * 4)) - bandH * 2;
      const roll = t % 8 < 1.6; // tracking slips for a moment every cycle
      const dxOf = (y) => {
        const Y = y + oy;
        let d = Math.sin(Y * 0.35 + t * 2.3) * 0.7;
        if (Y >= bandY && Y < bandY + bandH) d += (hash(Y, Math.floor(t * 24)) - 0.5) * (roll ? 14 : 6);
        return Math.round(d);
      };
      for (let y = 0; y < src.height; y++) {
        const dx = dxOf(y), scan = (y + oy) % 2 === 1;
        for (let x = 0; x < src.width; x++) {
          const c = src.px[y * src.width + x];
          if (c === NONE) continue;
          const X = x + ox + dx, Y = y + oy;
          if (bleed) { cv.set(X - 1, Y, mix(th.neg, th.bg, 0.5)); cv.set(X + 1, Y, mix(th.info, th.bg, 0.6)); }
        }
        for (let x = 0; x < src.width; x++) {
          const c = src.px[y * src.width + x];
          if (c !== NONE) cv.set(x + ox + dx, y + oy, scan ? mixOklab(c, th.bg, 0.3) : c);
        }
      }
      // Tracking noise band across the full frame
      for (let Y = Math.max(0, bandY); Y < Math.min(cv.height, bandY + bandH); Y++)
        for (let X = 0; X < cv.width; X++) {
          const r = hash(X, Y, Math.floor(t * 30));
          if (r < (roll ? 0.4 : 0.16)) cv.set(X, Y, mix(th.ink, th.bg, 0.25 + r));
        }
      cv.paint(b, 0, 0);
      // On-screen display
      b.text(2, 1, play, th.ink, undefined, 1);
      const s = Math.floor(754 + t);
      const counter = `SP ${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      b.text(W - counter.length - 2, H - 2, counter, th.ink);
      if (W > 34) b.text(2, H - 2, 'OCT.13 2026', th.ink);
      if (roll) {
        const lvl = Math.floor((t % 8) / 0.32) % 6;
        const meter = ascii ? '#'.repeat(lvl) + '.'.repeat(5 - lvl) : '▮'.repeat(lvl) + '▯'.repeat(5 - lvl);
        const tr = `TRACKING ${meter}`;
        b.text(Math.floor((W - tr.length) / 2), H - 2, tr, th.ink);
      }
    };
  },
};

// ── melt ────────────────────────────────────────────────────────────────────
const MCYCLE = 10;

const melt = {
  ...shared,
  id: 'text-melt',
  title: 'Melting Type',
  tags: ['melt', 'drip', 'liquid', 'horror', 'distort'],
  order: 120,
  loop: MCYCLE,
  size: { w: 72, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'Letters soften and sag, drips run from their undersides and drop into a spreading puddle — then the word sets again.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'MELT'));
    const scale = fitScale(text, { font: 'bold', mode }, W - 4, Math.floor(H * 0.5));
    const src = bannerCanvas(text, { font: 'bold', mode, scale, fill: [th.warn, th.crit], direction: 'vertical', theme: th });
    const cv = canvasLike(src, W, H);
    const ox = Math.floor((cv.width - src.width) / 2), oy = Math.max(1, Math.floor(cv.height * 0.12));
    const floor = cv.height - 1;
    // Each pixel column: its lowest ink pixel, color there, and whether / how fast it drips.
    const cols = [];
    for (let x = 0; x < src.width; x++) {
      let bottom = -1;
      for (let y = 0; y < src.height; y++) if (src.px[y * src.width + x] !== NONE) bottom = y;
      cols.push({ bottom, color: bottom >= 0 ? src.px[bottom * src.width + x] : NONE, drips: hash(x, 3) < 0.42, start: 1 + hash(x, 4) * 3, speed: 2 + hash(x, 5) * 7 });
    }
    return (t) => {
      const b = ctx.buffer;
      const tau = t % MCYCLE;
      cv.clear();
      const melt = Math.min(1, Math.max(0, (tau - 0.8) / 6));
      const reform = tau > MCYCLE - 1 ? (tau - (MCYCLE - 1)) : 0;
      let puddle = 0;
      for (let x = 0; x < src.width; x++) {
        const c = cols[x];
        if (c.bottom < 0) continue;
        // Sag: lower rows slide down more, wobbling per column.
        const sag = melt * (1.5 + hash(x >> 1, 6) * 2.5) * (1 - reform);
        for (let y = 0; y < src.height; y++) {
          const col = src.px[y * src.width + x];
          if (col === NONE) continue;
          // Stretch each pixel down to where the next row lands, so sagging letters stay solid.
          const d0 = Math.round(sag * (y / src.height)), d1 = Math.round(sag * ((y + 1) / src.height));
          const mc = mixOklab(col, th.crit, melt * 0.35);
          for (let r = d0; r <= Math.max(d0, d1); r++) cv.set(x + ox, y + oy + r, mc);
        }
        if (!c.drips || reform) continue;
        const life = tau - c.start;
        if (life <= 0) continue;
        const top = c.bottom + oy + Math.round(sag) + 1;
        const len = Math.min(floor - top, Math.floor(life * c.speed * 0.6));
        for (let k = 0; k < len; k++) cv.set(x + ox, top + k, mixOklab(c.color, th.crit, 0.3 + 0.4 * (k / Math.max(1, len))));
        // Droplets break off the tip and fall to the floor.
        const fallT = (life * 1.3) % 1.4;
        const dropY = top + len + Math.floor(0.5 * 60 * fallT * fallT);
        if (len > 2 && dropY < floor) cv.set(x + ox, dropY, c.color);
        if (top + len >= floor - 1 || life > 3) puddle++;
      }
      // Puddle spreads along the floor from under the word.
      const pw = Math.min(cv.width, Math.round(src.width * 0.6 + puddle * 1.2));
      const px0 = Math.floor((cv.width - pw) / 2);
      if (melt > 0.15 && !reform) for (let x = px0; x < px0 + pw; x++) cv.set(x, floor, mixOklab(th.crit, th.bg, 0.35 + 0.3 * Math.abs((x - px0) / pw - 0.5)));
      cv.paint(b, 0, 0);
    };
  },
};

export default [glitchText, vhs, melt];
