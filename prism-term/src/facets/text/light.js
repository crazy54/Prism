// Color & Light — type that emits or reflects: a flickering neon sign, words
// on fire, a rainbow sweep, lolcat'd output and 80s chrome.
import { NONE, rgb, mix, mixOklab, luminance } from '../../color.js';
import { drawBanner, bannerCanvas, measureBanner, layoutText } from '../../text/banner.js';
import { bannerMode, fitType, hash } from './_text.js';

const shared = { gallery: 'text', category: 'Color & Light', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── neon sign ───────────────────────────────────────────────────────────────
const NCYCLE = 8;

/** Is letter `i` of a tube lit at time tau? Power-on stutter, then one buzzing letter. */
function tubeLit(i, tau, onAt, buzz) {
  if (tau < onAt) return false;
  if (tau < onAt + 0.35) return hash(i, Math.floor(tau * 22)) > 0.45;
  if (i === buzz && ((tau > 3 && tau < 3.9) || (tau > 6.1 && tau < 6.5))) return hash(i, Math.floor(tau * 17), 3) > 0.55;
  return true;
}

/**
 * Bend glass along the letters: each font pixel becomes a node at s× spacing and
 * neighbouring nodes are joined by 1-px tube segments (diagonals only where no
 * square corner exists), so strokes stay thin however large the sign.
 */
function tubePaths(text, font, s) {
  const lay = layoutText(text, { font });
  const paths = [];
  for (const l of lay.lines) for (const { gl, x, ci } of l.glyphs) {
    const segs = [];
    const on = (gx, gy) => gx >= 0 && gy >= 0 && gx < gl.w && gy < gl.h && gl.bits[gy * gl.w + gx] === 1;
    for (let gy = 0; gy < gl.h; gy++) for (let gx = 0; gx < gl.w; gx++) {
      if (!on(gx, gy)) continue;
      const cx = (l.x + x + gx) * s + (s >> 1), cy = (l.y + gy) * s + (s >> 1);
      let linked = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        if (!on(gx + dx, gy + dy) || (dx && dy && (on(gx + dx, gy) || on(gx, gy + dy)))) continue;
        segs.push([cx, cy, cx + dx * s, cy + dy * s]);
        linked = true;
      }
      if (!linked && !on(gx - 1, gy) && !on(gx, gy - 1) && !on(gx - 1, gy - 1) && !on(gx + 1, gy - 1)) segs.push([cx, cy, cx, cy]);
    }
    paths.push({ ci, segs });
  }
  return { paths, w: lay.width * s, h: lay.height * s };
}

function plot(buf, W, H, x0, y0, x1, y1, v) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) buf[y0 * W + x0] = v;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const neon = {
  ...shared,
  id: 'text-neon-sign',
  title: 'Neon Sign',
  tags: ['neon', 'sign', 'flicker', 'glow', 'night'],
  order: 100,
  loop: NCYCLE,
  size: { w: 64, h: 18 },
  minSize: { w: 34, h: 10 },
  description: 'Thin glass tubes bent along the letters stutter on one by one with a soft halo; one tired letter keeps buzzing out, like every real sign.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const field = ctx.canvas('field');
    const FW = field.width, FH = field.height;
    const top = String(ctx.param('text', 'OPEN')).toUpperCase();
    const sub = String(ctx.param('subtitle', 'ALL NIGHT')).toUpperCase();
    const pink = mixOklab(th.crit, th.accent, 0.2), blue = th.info;
    const tw = layoutText(top, { font: 'tiny' }).width, sw = layoutText(sub, { font: 'standard' }).width;
    const s1 = Math.max(1, Math.min(Math.floor((FW - 6) / tw), Math.floor((FH * 0.6) / 5)));
    const T1 = tubePaths(top, 'tiny', s1);
    const s2 = Math.max(1, Math.min(s1 - 1, Math.floor((FW - 6) / sw), Math.floor((FH - T1.h - 6) / 7)));
    const showSub = sw * s2 <= FW - 4 && T1.h + 7 * s2 + 5 <= FH;
    const T2 = showSub ? tubePaths(sub, 'standard', s2) : null;
    const total = T1.h + (T2 ? T2.h + 3 : 0);
    const y1 = Math.max(1, Math.floor((FH - total) / 2)), x1 = Math.floor((FW - T1.w) / 2);
    const y2 = y1 + T1.h + 3, x2 = T2 ? Math.floor((FW - T2.w) / 2) : 0;
    const core = new Int32Array(FW * FH), lit = new Uint8Array(FW * FH);
    const halo = (c, k) => mix(c, th.bg, k);
    const lightWall = luminance(th.bg) > 0.5; // white-hot cores vanish on a light wall
    return (t) => {
      const b = ctx.buffer;
      const tau = t % NCYCLE;
      core.fill(NONE); lit.fill(0);
      const draw = (T, ox, oy, color, isLit) => {
        for (const { ci, segs } of T.paths) {
          const on = isLit(ci);
          const c = on ? (lightWall ? color : mixOklab(color, 0xffffff, 0.45)) : mix(color, th.bg, 0.8);
          for (const [a, b0, c0, d] of segs) plot(core, FW, FH, a + ox, b0 + oy, c0 + ox, d + oy, c);
          if (on) for (const [a, b0, c0, d] of segs) plot(lit, FW, FH, a + ox, b0 + oy, c0 + ox, d + oy, T === T1 ? 1 : 2);
        }
      };
      let n = 0;
      draw(T1, x1, y1, pink, (ci) => { const v = tubeLit(ci, tau, 0.2 + ci * 0.18, 2); n += v; return v; });
      if (T2) draw(T2, x2, y2, blue, (ci) => tubeLit(ci + 20, tau, 1.5, -1));
      // Wall glow behind the sign, following how much of it is lit.
      const glow = n / Math.max(1, top.length);
      if (glow > 0 && field.mode !== 'ascii') {
        const rows = Math.ceil((T1.h + 4) / field.sy), r0 = Math.floor((y1 - 2) / field.sy);
        for (let y = Math.max(0, r0); y < Math.min(H, r0 + rows); y++) for (let x = 0; x < W; x++) {
          const d = Math.abs(x - W / 2) / (W / 2);
          if (d < 0.8) b.set(x, y, ' ', undefined, mix(mix(th.bg, pink, 0.09 * glow), th.bg, d / 0.8));
        }
      }
      // Halo: two dilation rings around lit glass, then the glass itself.
      field.clear();
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const L = lit[y * FW + x];
        if (!L) continue;
        const c = L === 1 ? pink : blue, reach = (L === 1 ? s1 : s2) >= 3 ? 2 : 1;
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= FW || Y >= FH || core[Y * FW + X] !== NONE) continue;
          const far = Math.max(Math.abs(dx), Math.abs(dy)) > 1;
          const i = Y * FW + X, hc = halo(c, far ? 0.84 : 0.55);
          if (!far || field.px[i] === NONE) field.px[i] = hc;
        }
      }
      for (let i = 0; i < FW * FH; i++) if (core[i] !== NONE) field.px[i] = core[i];
      field.paint(b, 0, 0);
    };
  },
};
// ── fire text ───────────────────────────────────────────────────────────────
const fireText = {
  ...shared,
  id: 'text-fire',
  title: 'Text on Fire',
  tags: ['fire', 'flames', 'burning', 'heat', 'doom fire'],
  order: 110,
  loop: 6,
  size: { w: 72, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'The letters are the fuel: every ink pixel feeds a rising flame field, so fire licks off the tops and edges of the word.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'FIRE'));
    const field = ctx.canvas('field');
    const { font, scale } = fitType(text, { mode }, W - 4, Math.floor(H * 0.5));
    const src = bannerCanvas(text, { font, mode, scale, fill: th.ink, theme: th });
    const FW = field.width, FH = field.height;
    const ox = Math.floor((FW - src.width) / 2), oy = Math.max(0, FH - src.height - Math.floor(FH * 0.12));
    // ink: the letters; fuel: their upward-facing edges, where flames start.
    const ink = new Uint8Array(FW * FH), fuel = new Uint8Array(FW * FH);
    const inkAt = (x, y) => x >= 0 && y >= 0 && x < src.width && y < src.height && src.px[y * src.width + x] !== NONE;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      if (!inkAt(x, y) || x + ox >= FW || y + oy >= FH) continue;
      ink[(y + oy) * FW + x + ox] = 1;
      if (!inkAt(x, y - 1)) fuel[(y + oy) * FW + x + ox] = 1;
    }
    let heat = new Float32Array(FW * FH), next = new Float32Array(FW * FH);
    const cool = 2.6 / FH;
    // Theme-aware flame ramp: background → deep red → orange → yellow → white-hot.
    const ramp = [th.bg, mix(th.bg, th.neg, 0.55), th.neg, th.warn, mixOklab(th.warn, 0xffffff, 0.55), 0xffffff];
    const lut = Array.from({ length: 64 }, (_, i) => {
      const g = (i / 63) * (ramp.length - 1), k = Math.min(ramp.length - 2, Math.floor(g));
      return mixOklab(ramp[k], ramp[k + 1], g - k);
    });
    let acc = 0, step = 0;
    const tick = () => {
      step++;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i = y * FW + x;
        if (fuel[i]) { next[i] = 0.7 + 0.3 * hash(x, y, step); continue; }
        if (ink[i]) { next[i] = 0; continue; }
        if (y === FH - 1) { next[i] = 0; continue; }
        const r = hash(x, y, step);
        const sx = Math.min(FW - 1, Math.max(0, x + (r < 0.33 ? -1 : r < 0.66 ? 0 : 1)));
        next[i] = Math.max(0, heat[(y + 1) * FW + sx] - cool * (0.4 + r * 1.2));
      }
      [heat, next] = [next, heat];
    };
    return (t, dt) => {
      const b = ctx.buffer;
      acc += Math.min(0.25, dt || 0.05);
      while (acc > 1 / 30) { tick(); acc -= 1 / 30; }
      field.clear();
      for (let i = 0; i < FW * FH; i++) {
        const h = heat[i];
        if (!ink[i] && h > 0.08) field.px[i] = lut[Math.min(63, Math.floor(h * 63))];
      }
      // A dark rim keeps the word legible against its own flames…
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
        if (inkAt(x, y)) continue;
        if (inkAt(x - 1, y) || inkAt(x + 1, y) || inkAt(x, y + 1) || inkAt(x, y - 1)) field.set(x + ox, y + oy, mix(th.bg, th.neg, 0.2));
      }
      // …and the letters glow like embers, hottest at the top.
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
        if (!inkAt(x, y)) continue;
        const flick = hash(x >> 1, y >> 1, Math.floor(t * 8));
        const v = y / src.height;
        field.set(x + ox, y + oy, mixOklab(mixOklab(th.warn, 0xffffff, 0.5), th.neg, v * 0.7 + flick * 0.15));
      }
      field.paint(b, 0, 0);
    };
  },
};

// ── rainbow sweep ───────────────────────────────────────────────────────────
const sweep = {
  ...shared,
  id: 'text-rainbow-sweep',
  title: 'Rainbow Sweep',
  tags: ['rainbow', 'sweep', 'spectrum', 'wipe', 'prism'],
  order: 120,
  loop: 6,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'A bright leading edge sweeps over gray type and leaves a flowing spectrum behind it — then sweeps back and drains it out.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'SPECTRUM'));
    const pal = ctx.palette('prism');
    // In ascii mode every pixel is '#', so a shadow would just fuse the letters.
    const shadow = mode !== 'ascii';
    const { font, scale } = fitType(text, { mode, shadow }, W - 2, H - 3);
    const grey = mix(th.muted, th.bg, 0.35);
    return (t) => {
      const b = ctx.buffer;
      const pass = Math.floor(t / 3), p = (t % 3) / 2.4 * 1.3 - 0.15;
      const filling = pass % 2 === 0;
      const r = drawBanner(b, 'center', Math.max(0, Math.floor((H - 3) / 2) - 2), text, {
        font, mode, scale, theme: th, shadow,
        fill: (g) => g,
        shader: (_, u, v) => {
          const e = u + v * 0.15 - p; // slanted edge
          const lit = filling ? e < 0 : e > 0;
          if (Math.abs(e) < 0.04) return mixOklab(0xffffff, pal((u + t * 0.3) % 1), 0.25);
          return lit ? pal((u * 0.8 - t * 0.35 + 10) % 1) : grey;
        },
      });
      // A spectrum rule underneath, sweeping with the edge
      const y = Math.min(H - 1, r.y + r.height + 1);
      const ch = asciiOnly(ctx) ? '=' : '━';
      for (let x = r.x; x < r.x + r.width; x++) {
        const u = (x - r.x) / Math.max(1, r.width);
        const lit = filling ? u < p : u > p;
        b.set(x, y, ch, lit ? pal((u * 0.8 - t * 0.35 + 10) % 1) : th.line);
      }
    };
  },
};

// ── lolcat ──────────────────────────────────────────────────────────────────
const LISTING = [
  'total 48',
  'drwxr-xr-x  8 ops ops 4096 Oct 13 09:41 .',
  'drwxr-xr-x 24 ops ops 4096 Oct 12 18:02 ..',
  '-rw-r--r--  1 ops ops  220 Oct  2 11:15 .editorconfig',
  'drwxr-xr-x  8 ops ops 4096 Oct 13 09:40 .git',
  '-rw-r--r--  1 ops ops 1532 Oct 11 16:27 README.md',
  'drwxr-xr-x  4 ops ops 4096 Oct  9 10:03 docs',
  '-rwxr-xr-x  1 ops ops 8721 Oct 13 08:55 deploy.sh',
  'drwxr-xr-x  6 ops ops 4096 Oct 12 22:48 src',
  'drwxr-xr-x  3 ops ops 4096 Oct 10 14:30 test',
];
const CMD = 'ls -la ~/projects | lolcat -a';
const LCYCLE = 12;

/** lolcat's rainbow: three phase-shifted sines. */
const lol = (i) => rgb(Math.sin(0.1 * i) * 127 + 128, Math.sin(0.1 * i + 2.094) * 127 + 128, Math.sin(0.1 * i + 4.189) * 127 + 128);

const lolcat = {
  ...shared,
  id: 'text-lolcat',
  title: 'lolcat Output',
  tags: ['lolcat', 'rainbow', 'terminal', 'pipe', 'ls'],
  order: 130,
  loop: LCYCLE,
  size: { w: 64, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'A directory listing piped through lolcat: the classic diagonal rainbow of phase-shifted sines, flowing as with lolcat -a.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cursor = asciiOnly(ctx) ? '_' : '▌';
    return (t) => {
      const b = ctx.buffer;
      const tau = t % LCYCLE;
      const typed = CMD.slice(0, Math.max(0, Math.floor((tau - 0.3) * 22)));
      b.text(0, 0, '$ ', th.pos);
      b.text(2, 0, typed, th.ink);
      const doneTyping = typed.length === CMD.length;
      const outStart = 0.3 + CMD.length / 22 + 0.3;
      const shown = doneTyping ? Math.min(LISTING.length, Math.floor((tau - outStart) * 30)) : 0;
      if (!doneTyping || shown < 0) b.text(2 + typed.length, 0, cursor, th.accent);
      const rows = Math.min(shown, H - 2);
      const first = Math.max(0, shown - (H - 2));
      const os = 20 + t * 18;
      for (let r = 0; r < rows; r++) {
        const line = LISTING[first + r];
        for (let x = 0; x < Math.min(line.length, W); x++) if (line[x] !== ' ') b.set(x, r + 1, line[x], mixOklab(lol(os + (first + r) + x / 3), th.ink, 0.12));
      }
      if (shown >= LISTING.length && rows + 1 < H) {
        b.text(0, rows + 1, '$ ', th.pos);
        if (Math.floor(tau / 0.53) % 2 === 0) b.text(2, rows + 1, cursor, th.accent);
      }
    };
  },
};

// ── chrome ──────────────────────────────────────────────────────────────────
const chrome = {
  ...shared,
  id: 'text-chrome',
  title: '80s Chrome',
  tags: ['chrome', 'metal', '80s', 'glint', 'retro'],
  order: 140,
  loop: 5,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 9 },
  description: 'Polished-chrome lettering — sky above a hard horizon line, warm ground below — with a glint that slides across and a star-burst sparkle.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'CHROME'));
    const base0 = { mode, outline: mode !== 'ascii', letterSpacing: 3 };
    const { font, scale } = fitType(text, base0, W - 2, H - 3);
    const base = { ...base0, font };
    const m = measureBanner(text, { ...base, scale });
    const sky = mixOklab(th.info, 0xffffff, 0.75), mid = mixOklab(th.info, th.bg, 0.25), horizon = mixOklab(th.bg, 0x000000, 0.3);
    const ground = mixOklab(th.warn, th.neg, 0.35), glow = mixOklab(th.warn, 0xffffff, 0.6);
    const fill = (v) => (v < 0.5 ? mixOklab(sky, mid, v / 0.5) : v < 0.56 ? horizon : mixOklab(ground, glow, (v - 0.56) / 0.44));
    const x0 = Math.floor((W - m.width) / 2), y0 = Math.max(0, Math.floor((H - m.height - 2) / 2));
    const star = asciiOnly(ctx) ? ['+', '*'] : ['+', '✦'];
    return (t) => {
      const b = ctx.buffer;
      const g = (t % 5) / 3.2 * 1.6 - 0.3;
      drawBanner(b, x0, y0, text, {
        ...base, scale, outline: base.outline && mix(th.ink, th.bg, 0.86), theme: th, direction: 'vertical',
        fill,
        shader: (c, u, v) => {
          const d = Math.abs(u - g + (v - 0.5) * 0.35);
          return d < 0.05 ? mixOklab(c, 0xffffff, 0.8 * (1 - d / 0.05)) : c;
        },
      });
      // Sparkle where the glint leaves the top edge
      const sp = (t % 5) - 1.2;
      if (sp > 0 && sp < 0.6) {
        const sx = x0 + Math.round(m.width * Math.min(0.95, Math.max(0.05, g + 0.1)));
        b.set(sx, y0, sp < 0.3 ? star[1] : star[0], 0xffffff, undefined, 1);
        if (sp < 0.3 && sx + 1 < W) { b.set(sx - 1, y0, '-', th.ink); b.set(sx + 1, y0, '-', th.ink); }
      }
      const sub = 'est. 1986';
      if (y0 + m.height + 1 < H) b.text(Math.floor((W - sub.length) / 2), y0 + m.height + 1, sub, th.crit, undefined, 1);
    };
  },
};

export default [neon, fireText, sweep, lolcat, chrome];
