// Glitch & Distort — transmission damage: a broadcast losing its signal, a
// word whose bytes flip and erode, and analog double-exposure ghosting.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas, drawBanner, measureBanner } from '../../text/banner.js';
import { hasGlyph } from '../../text/fonts.js';
import { clamp, smoothstep } from '../../easing.js';
import { bannerMode, fitType, hash, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Glitch & Distort', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── signal loss ─────────────────────────────────────────────────────────────
const GLOOP = 10;

const signalLoss = {
  ...shared,
  id: 'text-signal-loss',
  since: '0.3.0',
  title: 'Signal Loss',
  tags: ['signal', 'dropout', 'static', 'broadcast', 'no signal', 'sync', 'tv'],
  order: 240,
  loop: GLOOP,
  size: { w: 76, h: 18 },
  minSize: { w: 36, h: 9 },
  description: 'A broadcast title degrades: dropout blocks eat the word, vertical sync rolls, the feed collapses into static behind a blinking NO SIGNAL card, then snaps back.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const ascii = asciiOnly(ctx);
    const text = String(ctx.param('text', 'SIGNAL'));
    const { font, scale } = fitType(text, { mode }, W - 4, H - 4);
    const src = bannerCanvas(text, { font, mode, scale, fill: [th.ink, th.info], direction: 'vertical', theme: th });
    const cv = canvasLike(src, W, H);
    const w = src.width, h = src.height;
    const ox = Math.floor((cv.width - w) / 2), oy = Math.floor((cv.height - h) / 2);
    const SNOW = ascii ? '.:*' : '░▒▓';
    const card = ' NO SIGNAL ';
    return (t) => {
      const b = ctx.buffer;
      const tau = t % GLOOP;
      // severity: calm → degrading → lost → recovered
      const lost = tau >= 5 && tau < 6.5;
      const sev = lost ? 1 : tau < 3 ? 0.1 : tau < 5 ? 0.1 + 0.9 * smoothstep(3, 5, tau) : tau < 6.9 ? 0.5 * (1 - (tau - 6.5) / 0.4) : 0.05;
      const k = Math.floor(tau * 14);
      cv.clear();
      if (!lost) {
        // vertical sync roll while degrading, a split ghost while recovering
        const roll = tau >= 3 && tau < 5 ? Math.floor(((tau - 3) ** 2) * h * 1.1) % h : 0;
        const gdx = tau >= 6.5 && tau < 6.9 ? Math.round((6.9 - tau) / 0.4 * 6) : 0;
        for (let y = 0; y < h; y++) {
          const Y = (y + roll) % h;
          for (let x = 0; x < w; x++) {
            const c = src.px[y * w + x];
            if (c === NONE) continue;
            if (gdx) cv.set(x + ox + gdx, Y + oy, mix(c, th.bg, 0.6));
            cv.set(x + ox - (gdx ? gdx : 0), Y + oy, c);
          }
        }
        // dropout blocks erase chunks of the picture
        const nd = Math.round(sev * 9);
        for (let j = 0; j < nd; j++) {
          const rw = 3 + Math.floor(hash(j, k, 1) * w * 0.3), rh = 1 + Math.floor(hash(j, k, 2) * 4);
          const rx = Math.floor(hash(j, k, 3) * (w - 2)) + ox, ry = Math.floor(hash(j, k, 4) * (h - 1)) + oy;
          for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) cv.set(x, y, NONE);
        }
      }
      cv.paint(b, 0, 0);
      // snow at the cell level, over everything
      if (sev > 0.02) {
        const dens = lost ? 0.8 : sev * 0.25;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const r = hash(x, y, k);
          if (r < dens) b.set(x, y, SNOW[Math.floor(r * 97) % SNOW.length], mix(th.muted, th.ink, hash(x, y, k + 1) * 0.8));
        }
      }
      // on-screen display
      const q = 1 - sev;
      const bars = Math.round(q * 4);
      const meter = `SIG ${(ascii ? '|' : '█').repeat(bars)}${(ascii ? '.' : '░').repeat(4 - bars)}`;
      if (!lost) {
        b.text(2, 1, 'CH 07', th.ink, undefined, 1);
        if (W > 30) b.text(W - meter.length - 2, 1, meter, sev > 0.4 ? th.warn : th.ink);
      }
      if (lost && Math.floor(tau * 2.5) % 2 === 0) {
        const bx = Math.max(0, Math.floor((W - card.length - 2) / 2)), by = Math.max(1, Math.floor(H / 2) - 1);
        const hline = (ascii ? '+' : '┌') + (ascii ? '-' : '─').repeat(card.length) + (ascii ? '+' : '┐');
        b.text(bx, by - 1, hline, th.ink, th.panel2);
        b.text(bx, by, (ascii ? '|' : '│') + card + (ascii ? '|' : '│'), th.ink, th.panel2, 1);
        b.text(bx, by + 1, (ascii ? '+' : '└') + (ascii ? '-' : '─').repeat(card.length) + (ascii ? '+' : '┘'), th.ink, th.panel2);
      }
    };
  },
};

// ── corrupted bytes ─────────────────────────────────────────────────────────
const TOFU = '\u0001'; // no font has it, so the banner draws its hollow missing-glyph box
const CLOOP = 8;
const TICK = 0.4;

const corrupt = {
  ...shared,
  id: 'text-corrupt',
  since: '0.3.0',
  title: 'Corrupted Bytes',
  tags: ['corruption', 'bitflip', 'bytes', 'hex', 'memory', 'ecc', 'flicker'],
  order: 250,
  loop: CLOOP,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 9 },
  description: 'A word stored in bad RAM: single bits flip and letters flicker into their bit-flipped neighbors, pixels erode away and heal, while a hex readout tracks each fault.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'MEMORY')).toUpperCase() || 'MEMORY';
    // Fixed pitch so a swapped glyph never nudges its neighbors.
    // Fixed pitch so a swapped glyph never nudges its neighbours. Biggest face first, condensed
    // (taller) scales included, then one cell per font pixel (as fitType does) — all measured, so
    // the slots always match the real glyphs; the second pass drops the side margins.
    const [bx, by] = mode === 'quad' || mode === 'ascii' ? [2, 1] : [1, 1];
    const scales = [[4, 4], [3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1]].map(([kx, ky]) => [bx * kx, by * ky]);
    if (bx !== 1 || by !== 1) scales.push([1, 1]);
    const metrics = (font, scale) => {
      const cw = Math.max(...[...text].map((c) => measureBanner(c, { font, mode, scale }).width), measureBanner('W', { font, mode, scale }).width);
      const gap = measureBanner('WW', { font, mode, scale }).width - 2 * measureBanner('W', { font, mode, scale }).width;
      return { font, scale, cw, pitch: cw + gap, gh: measureBanner('W', { font, mode, scale }).height };
    };
    let pick = null;
    for (const margin of [2, 0]) {
      for (const font of ['bold', 'standard', 'tiny']) {
        for (const scale of scales) {
          const m = metrics(font, scale);
          if (m.pitch * text.length - (m.pitch - m.cw) <= W - margin && m.gh <= H - 4) { pick = m; break; }
        }
        if (pick) break;
      }
      if (pick) break;
    }
    pick ||= metrics('tiny', [1, 1]); // nothing fits: the smallest real metrics, centred and clipped
    const { font, scale, cw, pitch, gh } = pick;
    const codes = [...text].map((c) => c.charCodeAt(0));
    const x0 = Math.floor((W - (pitch * text.length - (pitch - cw))) / 2);
    const y0 = Math.max(0, Math.floor((H - gh - 3) / 2));
    // Event for letter i at tick k: none | bitflip | erosion | burn
    const eventAt = (i, k) => {
      const r = hash(i, k, 40);
      if (r < 0.07) return { kind: 'flip', bit: Math.floor(hash(i, k, 41) * 6) };
      if (r < 0.13) return { kind: 'erode' };
      if (r < 0.16) return { kind: 'burn' };
      return null;
    };
    const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    return (t) => {
      const b = ctx.buffer;
      const tau = t % CLOOP;
      const k = Math.floor(tau / TICK);
      const age = tau - k * TICK;
      let fault = null;
      for (let i = 0; i < text.length; i++) {
        const ev = eventAt(i, k);
        let ch = text[i];
        const o = { font, mode, scale, theme: th, fill: [th.ink, th.accent2], direction: 'vertical' };
        if (ev && ev.kind === 'flip') {
          const flipped = codes[i] ^ (1 << ev.bit), fc = String.fromCharCode(flipped);
          // the byte as the font would really draw it: its glyph, or the font's missing-glyph box
          ch = flipped > 32 && flipped < 127 && hasGlyph(font, fc) ? fc : TOFU;
          o.fill = age < 0.12 ? th.ink : th.neg;
          fault = `bit ${ev.bit} flipped  0x${hex(codes[i])} -> 0x${hex(flipped)}`;
        } else if (ev && ev.kind === 'erode') {
          o.fill = mixOklab(th.ink, th.bg, 0.25);
          o.shader = (c, u, v) => (hash(Math.floor(u * 24), Math.floor(v * 24), k) < 0.45 ? NONE : c);
          fault ||= `sector ${i} parity error`;
        } else if (ev && ev.kind === 'burn') {
          o.fill = th.crit;
        }
        const gw = measureBanner(ch, { font, mode, scale }).width;
        drawBanner(b, x0 + i * pitch + Math.floor((cw - gw) / 2), y0, ch, o);
        // hex readout under each letter
        const hy = y0 + gh + 1;
        if (hy < H && pitch >= 2) {
          const bad = ev && ev.kind === 'flip';
          b.text(x0 + i * pitch, hy, hex(bad ? codes[i] ^ (1 << ev.bit) : codes[i]).slice(0, Math.max(1, pitch - 1)), bad ? th.neg : th.dim);
        }
      }
      const status = fault || 'ecc scrub idle';
      const sy = y0 + gh + 2;
      if (sy < H) b.text(Math.max(0, Math.floor((W - status.length) / 2)), sy, status.slice(0, W), fault ? th.warn : th.dim);
    };
  },
};

// ── double exposure ─────────────────────────────────────────────────────────
const DLOOP = 10;

const ghosting = {
  ...shared,
  id: 'text-ghosting',
  since: '0.3.0',
  title: 'Double Exposure',
  tags: ['ghosting', 'double exposure', 'echo', 'drift', 'analog', 'blur', 'focus'],
  order: 260,
  loop: DLOOP,
  size: { w: 76, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'Two translucent prints of the word, one cool and one warm, drift apart on slow crossing orbits, trailing afterimages — then breathe back into one crisp exposure.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half'), ascii = mode === 'ascii';
    const text = String(ctx.param('text', 'PHANTOM'));
    const { font, scale } = fitType(text, { mode }, Math.max(8, W - 12), Math.max(3, H - 3));
    const src = bannerCanvas(text, { font, mode, scale, fill: th.ink, theme: th });
    const cv = canvasLike(src, W, H);
    const w = src.width, h = src.height, CW = cv.width, CH = cv.height;
    const ox = Math.floor((CW - w) / 2), oy = Math.floor((CH - h) / 2);
    const ampX = Math.max(2, Math.min(11, (CW - w) / 2 - 1));
    const ampY = Math.max(1, Math.min(5, (CH - h) / 2 - 1));
    const om = (2 * Math.PI) / DLOOP;
    // Two hue families (cool, warm) so the exposures read as two prints, not one drop shadow.
    const tA = th.accent2, tB = th.warn;
    const mask = new Uint8Array(CW * CH); // 1 print A · 2 print B · 4 afterimage A · 8 afterimage B · 16 face
    const stamp = (dx, dy, bit) => {
      const X0 = Math.round(dx) + ox, Y0 = Math.round(dy) + oy;
      for (let y = 0; y < h; y++) {
        const Y = y + Y0;
        if (Y < 0 || Y >= CH) continue;
        for (let x = 0; x < w; x++) {
          const X = x + X0;
          if (X >= 0 && X < CW && src.px[y * w + x] !== NONE) mask[Y * CW + X] |= bit;
        }
      }
    };
    const ch = (c, k) => (c >> k) & 255;
    // Light adds up: each exposure lays its tint over what is already there.
    const expose = (base, c, a) => {
      if (!a) return base;
      const r = Math.min(255, ch(base, 16) + (ch(c, 16) - ch(th.bg, 16)) * a);
      const g = Math.min(255, ch(base, 8) + (ch(c, 8) - ch(th.bg, 8)) * a);
      const b = Math.min(255, ch(base, 0) + (ch(c, 0) - ch(th.bg, 0)) * a);
      return (Math.max(0, r) << 16) | (Math.max(0, g) << 8) | Math.max(0, b | 0);
    };
    return (t) => {
      const tau = t % DLOOP;
      const env = 0.5 - 0.5 * Math.cos(tau * om); // converged at the loop seam
      mask.fill(0);
      const gx = [Math.sin(t * om * 2) * ampX * env, Math.sin(t * om * 2 + Math.PI) * ampX * 0.8 * env];
      const gy = [Math.sin(t * om * 3 + 1.3) * ampY * env, Math.sin(t * om * 3 + 2.9) * ampY * env];
      stamp(gx[0] * 0.6, gy[0] * 0.6, 4); stamp(gx[1] * 0.6, gy[1] * 0.6, 8); // lagging afterimages
      stamp(gx[0], gy[0], 1); stamp(gx[1], gy[1], 2);
      stamp(0, 0, 16); // the anchored print
      const flash = env < 0.05 ? 1 - env / 0.05 : 0;
      const face = flash ? mixOklab(th.ink, th.accent, 0.35 * flash) : th.ink;
      cv.clear();
      for (let i = 0; i < mask.length; i++) {
        const m = mask[i];
        if (!m) continue;
        const a = m & 1 ? 0.55 : m & 4 ? 0.22 : 0, b = m & 2 ? 0.55 : m & 8 ? 0.22 : 0;
        // where a print crosses the face it tints it, else the prints add over the background
        cv.px[i] = m & 16 ? mix(mix(face, tA, a * 0.22), tB, b * 0.22) : expose(expose(th.bg, tA, a), tB, b);
      }
      cv.paint(ctx.buffer, 0, 0);
      // Without Unicode the ascii canvas paints every pixel '#' and both tints share one 16-color
      // slot: give the drifting prints lighter glyphs so the anchored word stays the solid one.
      if (ascii) for (let i = 0; i < mask.length; i++) {
        const m = mask[i];
        if (m && !(m & 16)) ctx.buffer.set(i % CW, Math.floor(i / CW), m & 3 ? '+' : '.');
      }
    };
  },
};

export default [signalLoss, corrupt, ghosting];
