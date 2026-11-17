// Color & Light II — type as a lighting subject: a theater followspot, gold
// leaf catching a moving light, aurora curtains flowing through letters, a
// backlit stained-glass window and a breathing two-ink risograph proof.
import { NONE, mix, mixOklab } from '../../color.js';
import { drawBanner, bannerCanvas, measureBanner, layoutText } from '../../text/banner.js';
import { easing, clamp, lerp, smoothstep, fract, pingpong } from '../../easing.js';
import { bannerMode, fitType, hash, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Color & Light', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

// ── followspot ──────────────────────────────────────────────────────────────
const spotlight = {
  ...shared,
  id: 'text-spotlight',
  since: '0.3.0',
  title: 'Followspot',
  tags: ['spotlight', 'stage', 'beam', 'sweep', 'theater', 'dark'],
  order: 200,
  loop: 9,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 9 },
  description: 'A theater followspot plays over type standing in the dark: letters flare warm inside the beam, a pool of light slides along the stage floor, dust drifts through it.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'ON STAGE'));
    const { font, scale } = fitType(text, { mode }, W - 2, H - 3);
    const mh = measureBanner(text, { font, mode, scale }).height;
    const y0 = Math.max(0, Math.floor((H - mh - 1) / 2));
    const dark = mix(th.ink, th.bg, 0.78);
    const warm = mixOklab(th.warn, 0xffffff, 0.72);
    const hot = mixOklab(warm, 0xffffff, 0.6);
    const lch = asciiOnly(ctx) ? '-' : '─';
    // Followspot operator: sweep right, hold with a settling wobble, sweep back.
    const posAt = (tau) =>
      tau < 3 ? lerp(0.08, 0.92, easing.inOutCubic(tau / 3))
      : tau < 4.2 ? 0.92 + 0.025 * Math.sin((tau - 3) * 6) * (1 - (tau - 3) / 1.2)
      : tau < 7.2 ? lerp(0.92, 0.08, easing.inOutCubic((tau - 4.2) / 3))
      : 0.08 - 0.025 * Math.sin((tau - 7.2) * 6) * (1 - (tau - 7.2) / 1.8);
    return (t) => {
      const b = ctx.buffer;
      const tau = t % 9;
      const ub = posAt(tau);
      const r = drawBanner(b, 'center', y0, text, {
        font, mode, scale, theme: th,
        fill: () => dark,
        shader: (c, u, v) => {
          const d = Math.hypot((u - ub) / 0.2, (v - 0.5) / 0.95);
          const lit = 1 - smoothstep(0.55, 1.15, d);
          if (lit <= 0) return c;
          const k = 1 - smoothstep(0, 0.55, d);
          return mixOklab(mixOklab(c, warm, Math.min(1, lit * 1.35)), hot, k * 0.8);
        },
      });
      // Stage floor with the beam's light pool sliding along it.
      const fy = r.y + r.height;
      if (fy < H) {
        const cxp = r.x + ub * r.width, poolR = Math.max(3, r.width * 0.17);
        for (let x = 0; x < W; x++) {
          const k = Math.abs(x - cxp) / poolR;
          if (k < 1) b.set(x, fy, lch, mix(warm, th.bg, 0.25 + 0.5 * k), mix(th.bg, warm, 0.15 * (1 - k * k)));
          else b.set(x, fy, lch, mix(th.line, th.bg, 0.55));
        }
      }
      // Dust motes drifting up through the cone (integer cycles → clean loop).
      for (let j = 0; j < 7; j++) {
        const du = (hash(j, 3) - 0.5) * 0.34;
        const ux = ub + du;
        if (ux < 0.02 || ux > 0.98) continue;
        const span = r.height + 2;
        const py = r.y + r.height - 1 - fract(hash(j, 5) + (t / 9) * (1 + Math.round(hash(j, 7)))) * span;
        const px = Math.round(r.x + ux * r.width);
        if (py >= 0 && py < H && px >= 0 && px < W) b.set(px, Math.round(py), '·', mix(warm, th.bg, clamp(0.45 + Math.abs(du) * 2)));
      }
    };
  },
};

// ── gold foil ───────────────────────────────────────────────────────────────
const goldFoil = {
  ...shared,
  id: 'text-gold-foil',
  since: '0.3.0',
  title: 'Gold Foil',
  tags: ['gold', 'foil', 'shimmer', 'metallic', 'luxury', 'emboss', 'glint'],
  order: 210,
  loop: 7,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'Gold-leaf lettering pressed into the page: crinkled foil facets twinkle as the light angle turns, and star glints pop off the brightest creases.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'GILDED'));
    const emboss = mode !== 'ascii';
    const { font, scale } = fitType(text, { mode, outline: emboss }, W - 2, H - 2);
    const lay = layoutText(text, { font });
    const deep = mixOklab(th.warn, th.neg, 0.45);
    const pale = mixOklab(th.warn, 0xffffff, 0.62);
    const edge = mixOklab(th.warn, th.bg, 0.74);
    const n2 = ctx.noise.noise2;
    const y0 = Math.max(0, Math.floor((H - measureBanner(text, { font, mode, scale, outline: emboss }).height) / 2));
    // Sparkle sites: a handful of ink pixels spread across the word.
    const sites = [];
    for (const l of lay.lines) for (const { gl, x } of l.glyphs)
      for (let gy = 0; gy < gl.h; gy++) for (let gx = 0; gx < gl.w; gx++)
        if (gl.bits[gy * gl.w + gx] && hash(l.x + x + gx, gy, 91) > 0.965) sites.push({ fx: l.x + x + gx, fy: l.y + gy });
    sites.length = Math.min(sites.length, 9);
    const [st1, st2] = asciiOnly(ctx) ? ['*', '+'] : ['✦', '+'];
    const w = (2 * Math.PI) / 7;
    return (t) => {
      const b = ctx.buffer;
      const r = drawBanner(b, 'center', y0, text, {
        font, mode, scale, theme: th,
        outline: emboss && edge,
        direction: 'vertical',
        fill: (g) => mixOklab(pale, deep, g * g),
        shader: (c, u, v) => {
          const f = n2(u * 6.3, v * 2.6 + 17.3);
          const tw = 0.5 + 0.5 * Math.sin((f * 4 + u * 2.5 - v * 1.2) * Math.PI - t * w * 2);
          let cc = mixOklab(c, deep, 0.3 * (1 - tw));
          const g2 = tw * tw * tw;
          if (g2 > 0.35) cc = mixOklab(cc, 0xffffff, (g2 - 0.35) * 0.9);
          return cc;
        },
      });
      for (let j = 0; j < sites.length; j++) {
        const a = fract((t / 7) * 2 + hash(j, 9));
        if (a >= 0.09) continue;
        const sx = r.x + Math.floor(((sites[j].fx + 0.5) / Math.max(1, lay.width)) * r.width);
        const sy = r.y + Math.floor(((sites[j].fy + 0.5) / Math.max(1, lay.height)) * r.height);
        if (sx >= 0 && sx < W && sy >= 0 && sy < H) b.set(sx, sy, a < 0.045 ? st1 : st2, mixOklab(0xffffff, pale, 0.3), undefined, 1);
      }
    };
  },
};

// ── aurora lettering ────────────────────────────────────────────────────────
const aurora = {
  ...shared,
  id: 'text-aurora',
  since: '0.3.0',
  title: 'Aurora Lettering',
  tags: ['aurora', 'borealis', 'curtains', 'night', 'sky', 'gradient', 'flow'],
  order: 220,
  loop: 12,
  size: { w: 76, h: 18 },
  minSize: { w: 36, h: 9 },
  description: 'Aurora curtains ripple across a starry night and pour straight through the letters: the word is the brightest window into the same flowing light field.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'AURORA'));
    const { font, scale } = fitType(text, { mode }, W - 2, Math.max(3, Math.floor(H * 0.55)));
    const src = bannerCanvas(text, { font, mode, scale, fill: th.ink });
    const cv = canvasLike(src, W, H);
    const FW = cv.width, FH = cv.height;
    const bx = Math.max(0, (FW - src.width) >> 1);
    const by = clamp(Math.floor(FH * 0.58) - (src.height >> 1), 0, Math.max(0, FH - src.height));
    const stops = [mix(th.pos, th.bg, 0.15), th.pos, mixOklab(th.pos, th.info, 0.5), th.info, th.accent, mixOklab(th.accent, th.crit, 0.65)];
    const LUT = Array.from({ length: 48 }, (_, i) => {
      const g = (i / 47) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(g));
      return mixOklab(stops[k], stops[k + 1], g - k);
    });
    const lut = (g) => LUT[clamp(g, 0, 1) * 47 | 0];
    const n2 = ctx.noise.noise2;
    const stars = [];
    for (let k = 0; k < Math.floor((FW * FH) / 120); k++) stars.push([Math.floor(hash(k, 1) * FW), Math.floor(hash(k, 2) * FH * 0.85), hash(k, 3)]);
    const starC = mixOklab(th.info, 0xffffff, 0.7);
    // Drive the noise field around a circle so the 12 s cycle closes exactly.
    const inten = (x, y, ca, sa) => {
      const X = x / FW;
      const wv = n2(X * 2.5 + 0.35 * sa, 0.3 * ca + 7.7);
      const col = n2(X * 7 + wv * 1.8, 0.22 * sa + 0.16 * ca + 31.3);
      return clamp(0.52 + col * 1.5, 0, 1) * (0.25 + 0.75 * (1 - y / FH));
    };
    return (t) => {
      const ang = (t * Math.PI) / 6;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      cv.clear();
      for (let y = 0; y < FH; y += 2) {
        for (let x = 0; x < FW; x += 2) {
          const I = inten(x, y, ca, sa);
          if (I < 0.14) continue;
          const c = mix(lut(I), th.bg, 0.78);
          cv.set(x, y, c); cv.set(x + 1, y, c); cv.set(x, y + 1, c); cv.set(x + 1, y + 1, c);
        }
      }
      for (const [sx, sy, ph] of stars) {
        const vis = 0.5 + 0.5 * Math.sin(ang * 3 + ph * 6.28);
        if (vis > 0.35) cv.set(sx, sy, mix(starC, th.bg, 1 - vis * 0.75));
      }
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
        if (src.px[y * src.width + x] === NONE) continue;
        const gx = x + bx, gy = y + by;
        const I = inten(gx, gy, ca, sa);
        cv.set(gx, gy, mixOklab(lut(Math.min(1, 0.3 + I * 0.9)), 0xffffff, 0.16));
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── stained glass ───────────────────────────────────────────────────────────
const stainedGlass = {
  ...shared,
  id: 'text-stained-glass',
  since: '0.3.0',
  title: 'Stained Glass',
  tags: ['stained glass', 'window', 'backlight', 'lead', 'jewel', 'church'],
  order: 230,
  loop: 10,
  size: { w: 72, h: 18 },
  minSize: { w: 36, h: 10 },
  description: 'The word as a leaded window: every letter is cut into jewel-toned panes, and a light drifting behind the glass makes each pane glow as it passes.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'GLASS'));
    const { font, scale } = fitType(text, { mode }, W - 4, H - 3);
    const probe = bannerCanvas(text, { font, mode, scale, fill: th.ink });
    const { kx, ky, ox, oy } = probe.geometry;
    const lay = probe.layout;
    const cv = canvasLike(probe, W, H);
    const bx = Math.max(0, (cv.width - probe.width) >> 1), by = Math.max(0, (cv.height - probe.height) >> 1);
    const jewels = [th.crit, th.accent, th.info, th.pos, mixOklab(th.warn, th.crit, 0.35)].map((c) => mixOklab(c, th.bg, 0.08));
    const lead = mixOklab(th.ink, th.bg, 0.22);
    const FW2 = Math.max(1, lay.width), FH2 = Math.max(1, lay.height);
    const ink = new Uint8Array(FW2 * FH2), pane = new Int8Array(FW2 * FH2);
    for (const l of lay.lines) for (const { gl, x } of l.glyphs)
      for (let gy = 0; gy < gl.h; gy++) for (let gx = 0; gx < gl.w; gx++) if (gl.bits[gy * gl.w + gx]) {
        const fx = l.x + x + gx, fy = l.y + gy;
        ink[fy * FW2 + fx] = 1;
        pane[fy * FW2 + fx] = Math.floor(hash(fx >> 1, (fy + ((fx >> 2) & 1)) >> 1, 53) * jewels.length);
      }
    // Static lead map: 4 bits per font pixel (left/right/up/down needs a lead line).
    const edges = new Uint8Array(FW2 * FH2);
    const diff = (i, fx, fy) => fx < 0 || fy < 0 || fx >= FW2 || fy >= FH2 || !ink[fy * FW2 + fx] || pane[fy * FW2 + fx] !== pane[i];
    for (let fy = 0; fy < FH2; fy++) for (let fx = 0; fx < FW2; fx++) {
      const i = fy * FW2 + fx;
      if (!ink[i]) continue;
      edges[i] = (diff(i, fx - 1, fy) ? 1 : 0) | (diff(i, fx + 1, fy) ? 2 : 0) | (diff(i, fx, fy - 1) ? 4 : 0) | (diff(i, fx, fy + 1) ? 8 : 0);
    }
    const glowC = mixOklab(th.warn, 0xffffff, 0.4);
    const R = Math.max(cv.width, cv.height * 2) * 0.62;
    return (t) => {
      const ang = (t * 2 * Math.PI) / 10;
      const lx = cv.width / 2 + Math.cos(ang) * cv.width * 0.33;
      const ly = cv.height * 0.5 + Math.sin(2 * ang) * cv.height * 0.26;
      cv.clear();
      // Soft light on the wall behind the window.
      for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 3) {
        const d = Math.hypot(x - lx, (y - ly) * 1.7) / (R * 0.8);
        if (d >= 1) continue;
        const c = mix(th.bg, glowC, 0.13 * (1 - d) * (1 - d));
        cv.set(x, y, c); cv.set(x + 1, y, c); cv.set(x + 2, y, c); cv.set(x, y + 1, c); cv.set(x + 1, y + 1, c); cv.set(x + 2, y + 1, c);
      }
      for (let fy = 0; fy < FH2; fy++) for (let fx = 0; fx < FW2; fx++) {
        const i = fy * FW2 + fx;
        if (!ink[i]) continue;
        const X0 = bx + ox + fx * kx, Y0 = by + oy + fy * ky;
        const d = Math.hypot(X0 + kx / 2 - lx, (Y0 + ky / 2 - ly) * 1.5) / R;
        const g = clamp(1.18 - d + 0.08 * Math.sin(ang * 6 + pane[i] * 2.1 + fx * 0.9), 0, 1);
        const col = mixOklab(mix(jewels[pane[i]], th.bg, 0.58), mixOklab(jewels[pane[i]], 0xffffff, 0.32), g);
        const e = edges[i];
        for (let py = 0; py < ky; py++) for (let px = 0; px < kx; px++) {
          const isLead = kx > 1 && ((e & 1) && px === 0 || (e & 2) && kx > 2 && px === kx - 1) ||
            ky > 1 && ((e & 4) && py === 0 || (e & 8) && ky > 2 && py === ky - 1);
          cv.set(X0 + px, Y0 + py, isLead ? lead : col);
        }
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── riso duotone ────────────────────────────────────────────────────────────
const riso = {
  ...shared,
  id: 'text-riso-duotone',
  since: '0.3.0',
  title: 'Riso Duotone',
  tags: ['risograph', 'duotone', 'misregistration', 'overprint', 'print', 'breathing'],
  order: 240,
  loop: 8,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'A two-ink risograph proof breathing in and out of register: blue and pink layers drift apart, overprint to a dense third ink, then snap back into a crisp word.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'OFFSET'));
    const { font, scale } = fitType(text, { mode }, W - 4, H - 3);
    const src = bannerCanvas(text, { font, mode, scale, fill: 0xffffff });
    const cv = canvasLike(src, W, H);
    const bx = Math.max(0, (cv.width - src.width) >> 1), by = Math.max(0, (cv.height - src.height) >> 1);
    const A = th.info, B = th.crit;
    const AB = mixOklab(mixOklab(A, B, 0.5), th.ink, 0.45);
    const { kx, ky } = src.geometry;
    const ampX = Math.max(2, kx * 2), ampY = Math.max(1, ky);
    const flecks = [];
    for (let k = 0; k < 50; k++) flecks.push([Math.floor(hash(k, 11) * cv.width), Math.floor(hash(k, 12) * cv.height), mix(th.bg, hash(k, 13) < 0.5 ? A : B, 0.14)]);
    const caption = 'TWO-COLOR PROOF';
    const capY = Math.ceil((by + src.height + ampY + 1) / cv.sy);
    return (t) => {
      const b = ctx.buffer;
      const br = easing.inOutSine(pingpong(t / 4)); // 0 → 1 → 0 over the 8 s loop
      const dxA = Math.round(ampX * br), dyA = -Math.round(ampY * br);
      const dxB = -Math.round(ampX * br * 1.4), dyB = Math.round(ampY * br);
      cv.clear();
      for (const [fx, fy, fc] of flecks) cv.set(fx, fy, fc);
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
        if (src.px[y * src.width + x] === NONE) continue;
        cv.set(x + bx + dxA, y + by + dyA, A);
      }
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
        if (src.px[y * src.width + x] === NONE) continue;
        const gx = x + bx + dxB, gy = y + by + dyB;
        if (gx < 0 || gy < 0 || gx >= cv.width || gy >= cv.height) continue;
        cv.set(gx, gy, cv.px[gy * cv.width + gx] === A ? AB : B);
      }
      cv.paint(b, 0, 0);
      if (capY < H && caption.length <= W - 2) b.text(Math.floor((W - caption.length) / 2), capY, caption, mix(th.muted, th.bg, 0.25), undefined, 1);
    };
  },
};

export default [spotlight, goldFoil, aurora, stainedGlass, riso];
