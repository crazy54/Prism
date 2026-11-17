// Motion II — per-letter physics: letters that bounce in and leave, orbit and
// assemble, swing from a rail, pour as a waterfall, snake after a leader, and
// words that flip on a horizontal axis like a departure board.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas } from '../../text/banner.js';
import { easing, clamp, lerp, smoothstep, tween, fract } from '../../easing.js';
import { bannerMode, fitType, canvasLike, hash } from './_text.js';

const shared = { gallery: 'text', category: 'Motion', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const asciiOnly = (ctx) => ctx.caps.unicode === false || ctx.mode === 'ascii';

/** Rasterize the word once and prepare one canvas-pixel slice per letter. */
function makeWord(ctx, def, hFrac, fill) {
  const { width: W, height: H, theme: th } = ctx;
  const mode = bannerMode(ctx, 'half');
  const text = String(ctx.param('text', def)).slice(0, 24);
  const { font, scale } = fitType(text, { mode }, W - 4, Math.max(3, Math.floor(H * hFrac)));
  const src = bannerCanvas(text, { font, mode, scale, fill: fill || [th.accent, th.info], theme: th });
  const cv = canvasLike(src, W, H);
  const { kx, ky, ox, oy } = src.geometry;
  const S = [];
  for (const l of src.layout.lines) for (const { gl, x } of l.glyphs)
    S.push({ x0: ox + (l.x + x) * kx, y0: oy + l.y * ky, w: gl.w * kx, h: gl.h * ky });
  return { text, src, cv, S, ky };
}

/** Draw one letter slice of `src` into `cv`, displaced, tinted, bottom-anchored squash. */
function stamp(cv, src, s, dx, dy, tint, squash = 1) {
  const hh = Math.max(1, Math.round(s.h * squash));
  const lift = s.h - hh;
  for (let y = 0; y < hh; y++) {
    const sy = s.y0 + Math.min(s.h - 1, Math.floor((y * s.h) / hh));
    for (let x = 0; x < s.w; x++) {
      const c = src.px[sy * src.width + s.x0 + x];
      if (c !== NONE) cv.set(s.x0 + x + dx, s.y0 + y + lift + dy, tint ? tint(c) : c);
    }
  }
}

// ── bounce in ───────────────────────────────────────────────────────────────
const CONTACT = [1 / 2.75, 2 / 2.75, 2.5 / 2.75];

const bounceIn = {
  ...shared,
  id: 'text-bounce-in',
  since: '0.3.0',
  title: 'Bounce In',
  tags: ['bounce', 'drop', 'gravity', 'squash', 'impact', 'entrance'],
  order: 200,
  loop: 7,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 9 },
  description: 'Letters drop onto the stage one after another and bounce out their energy — squashing on impact, kicking up dust — hold the word, then hop off the bottom.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const { src, cv, S } = makeWord(ctx, 'BOUNCE', 0.55);
    const bx = Math.max(0, (cv.width - src.width) >> 1);
    const by = clamp(Math.floor(cv.height * 0.74) - src.height, 0, Math.max(0, cv.height - src.height - 1));
    const floorY = Math.min(cv.height - 1, by + src.height);
    const lineC = mix(th.line, th.bg, 0.25);
    const dustC = mix(th.ink, th.bg, 0.45);
    const D = 1.15;
    return (t) => {
      const tau = t % 7;
      cv.clear();
      for (let x = 0; x < cv.width; x++) cv.set(x, floorY, lineC);
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const p = (tau - (0.25 + i * 0.12)) / D;
        if (p <= 0) continue;
        let dy = 0, sq = 1, fl = 0;
        if (p < 1) {
          dy = -Math.round((1 - easing.outBounce(p)) * (by + s.y0 + s.h));
          for (let c = 0; c < CONTACT.length; c++) {
            const near = 1 - Math.abs(p - CONTACT[c]) / 0.05;
            if (near > 0) fl = Math.max(fl, near * (1 - c * 0.3));
          }
          const q = (p - CONTACT[0]) / 0.09;
          if (q >= 0 && q < 1) sq = 1 - 0.3 * Math.sin(q * Math.PI);
          // Dust puff on first impact.
          const td = (p - CONTACT[0]) * D;
          if (td > 0 && td < 0.45) {
            const spread = 1 + Math.round(td * 10), rise = Math.round(td * 5 * (1 - td / 0.45));
            const dc = mix(dustC, th.bg, td / 0.45);
            cv.set(bx + s.x0 - spread, floorY - 1 - rise, dc);
            cv.set(bx + s.x0 + s.w - 1 + spread, floorY - 1 - rise, dc);
          }
        } else {
          const eo = (tau - (4.7 + i * 0.09)) / 1.1;
          if (eo >= 1) continue;
          if (eo > 0) dy = Math.round(-5 * Math.sin(Math.PI * Math.min(1, eo * 1.6)) * (1 - eo) + easing.inCubic(eo) * (cv.height - by - s.y0 + 2));
        }
        stamp(cv, src, s, bx, dy, fl > 0 ? (c) => mixOklab(c, 0xffffff, 0.5 * fl) : null, sq);
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── orbit & assemble ────────────────────────────────────────────────────────
const orbitIn = {
  ...shared,
  id: 'text-orbit-in',
  since: '0.3.0',
  title: 'Orbit & Assemble',
  tags: ['orbit', 'assemble', 'scatter', 'ellipse', 'spiral', 'formation'],
  order: 210,
  loop: 10,
  size: { w: 72, h: 18 },
  minSize: { w: 36, h: 10 },
  description: 'The letters circle the screen in a slow elliptical orbit, spiral inward to assemble the word, hold formation, then sling back out onto their orbit.',
  setup(ctx) {
    const { theme: th } = ctx;
    const { src, cv, S } = makeWord(ctx, 'ORBIT', 0.5, [ctx.theme.accent, ctx.theme.crit]);
    const bx = Math.max(0, (cv.width - src.width) >> 1);
    const by = Math.max(0, (cv.height - src.height) >> 1);
    const n = Math.max(1, S.length);
    const cx = cv.width / 2, cy = cv.height / 2;
    const mw = Math.max(...S.map((s) => s.w), 1), mh = Math.max(...S.map((s) => s.h), 1);
    const Rx = Math.max(3, cv.width / 2 - mw), Ry = Math.max(2, cv.height / 2 - mh / 2 - 1);
    const w = (2 * Math.PI * 2) / 10; // two revolutions per loop
    const ghostT = (c) => mix(c, th.bg, 0.72);
    const ringC = mix(th.accent, th.bg, 0.6);
    const pos = (i, s, tau) => {
      const a = (i * 2 * Math.PI) / n + tau * w + 0.7;
      return [cx + Math.cos(a) * Rx - s.w / 2 - s.x0, cy + Math.sin(a) * Ry - s.h / 2 - s.y0];
    };
    return (t) => {
      const tau = t % 10;
      cv.clear();
      // Orbit ring, fading away while the word holds.
      const rA = clamp(1 - tween(tau, 2.4, 1.5) + tween(tau, 7.3, 1.2), 0, 1);
      if (rA > 0.05) for (let j = 0; j < 44; j++) {
        const a = (j / 44) * 2 * Math.PI + tau * w;
        cv.set(cx + Math.cos(a) * Rx + mw / 2 - 1, cy + Math.sin(a) * Ry, mix(ringC, th.bg, 1 - rA));
      }
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const k = tween(tau, 2.2 + i * 0.1, 1.4) * (1 - tween(tau, 7.4 + i * 0.06, 1.1));
        const [ox2, oy2] = pos(i, s, tau);
        const dx = Math.round(lerp(ox2, bx, k)), dy = Math.round(lerp(oy2, by, k));
        if (k < 0.5) {
          const [gx, gy] = pos(i, s, tau - 0.14);
          stamp(cv, src, s, Math.round(lerp(gx, bx, k)), Math.round(lerp(gy, by, k)), ghostT);
        }
        stamp(cv, src, s, dx, dy, null);
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── pendulum rail ───────────────────────────────────────────────────────────
const pendulum = {
  ...shared,
  id: 'text-pendulum',
  since: '0.3.0',
  title: 'Pendulum Rail',
  tags: ['pendulum', 'swing', 'damped', 'hanging', 'mobile', 'threads'],
  order: 220,
  loop: 9,
  size: { w: 72, h: 18 },
  minSize: { w: 36, h: 10 },
  description: 'Every letter hangs from a rail on its own thread; pulled aside and released in sequence, they swing with real damping until they rest — then wind up again.',
  setup(ctx) {
    const { theme: th } = ctx;
    const { src, cv, S } = makeWord(ctx, 'SWING', 0.42, [ctx.theme.info, ctx.theme.accent]);
    const bx = Math.max(0, (cv.width - src.width) >> 1);
    const railY = Math.max(1, Math.round(cv.height * 0.08));
    const by = clamp(Math.floor(cv.height * 0.62) - src.height + Math.floor(src.height / 2), railY + 3, Math.max(railY + 3, cv.height - src.height - 1));
    const railC = mix(th.line, th.bg, 0.2), threadC = mix(th.line, th.bg, 0.4);
    const A0 = 0.45;
    const theta = (i, tau) => {
      const rel = tau - i * 0.16;
      const d = rel <= 0 ? A0 : A0 * Math.exp(-0.5 * rel) * Math.cos(4.6 * rel);
      return lerp(d, A0, smoothstep(6.6, 8.6, tau));
    };
    return (t) => {
      const tau = t % 9;
      cv.clear();
      cv.line(0, railY, cv.width - 1, railY, railC);
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const th0 = theta(i, tau);
        const pivotX = bx + s.x0 + s.w / 2;
        const L = by + s.y0 + s.h / 2 - railY;
        const sinT = Math.sin(th0), cosT = Math.cos(th0);
        const topL = Math.max(1, L - s.h / 2);
        cv.line(pivotX, railY + 1, Math.round(pivotX + topL * sinT), Math.round(railY + topL * cosT), threadC);
        cv.set(pivotX, railY, th.ink);
        stamp(cv, src, s, bx + Math.round(L * sinT), Math.round(L * (cosT - 1)), null);
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── waterfall ───────────────────────────────────────────────────────────────
const PERIODS = [1.5, 2, 3];

const waterfall = {
  ...shared,
  id: 'text-waterfall',
  since: '0.3.0',
  title: 'Waterfall Type',
  tags: ['waterfall', 'pour', 'drip', 'water', 'pool', 'cascade'],
  order: 230,
  loop: 6,
  size: { w: 72, h: 20 },
  minSize: { w: 36, h: 10 },
  description: 'Water sheets off the underside of the word: every letter column sheds accelerating drips that streak down into a shimmering pool and splash at the surface.',
  setup(ctx) {
    const { theme: th } = ctx;
    const { src, cv } = makeWord(ctx, 'CASCADE', 0.4, [ctx.theme.info, mixOklab(ctx.theme.info, 0xffffff, 0.45)]);
    const bx = Math.max(0, (cv.width - src.width) >> 1);
    const by = Math.max(0, Math.round(cv.height * 0.07));
    const poolY = cv.height - 2;
    // Bottom ink edge per source column, and its drip lanes.
    const lanes = [];
    for (let x = 0; x < src.width; x++) {
      let edge = -1;
      for (let y = src.height - 1; y >= 0; y--) if (src.px[y * src.width + x] !== NONE) { edge = y; break; }
      if (edge < 0) continue;
      for (let k = 0; k < 2; k++) {
        if (hash(x, k, 7) <= 0.42) continue;
        lanes.push({ x, top: by + edge + 1, period: PERIODS[Math.floor(hash(x, k, 9) * 3)], off: hash(x, k, 11) });
      }
    }
    const head = mixOklab(th.info, 0xffffff, 0.35), tail = mix(th.info, th.bg, 0.45), mist = mix(th.info, th.bg, 0.62);
    return (t) => {
      cv.clear();
      // Pool with traveling shimmer (3 waves per 6 s loop).
      for (let y = poolY; y < cv.height; y++) for (let x = 0; x < cv.width; x++)
        cv.set(x, y, mix(th.info, th.bg, 0.5 + 0.25 * Math.sin(x * 0.35 + (t * Math.PI) * (y === poolY ? 1 : -1))));
      for (const ln of lanes) {
        const span = poolY - ln.top;
        if (span < 3) continue;
        const ph = fract(t / ln.period + ln.off);
        const prog = ph * ph * 0.55 + ph * 0.45; // drips accelerate
        const y = ln.top + prog * span, gx = bx + ln.x;
        cv.set(gx, y, head);
        if (y - 1 > ln.top) cv.set(gx, y - 1, tail);
        if (y - 2 > ln.top) cv.set(gx, y - 2, mix(tail, th.bg, 0.5));
        if (ph > 0.9) {
          const sp = (ph - 0.9) / 0.1, k = Math.ceil(sp * 2);
          cv.set(gx - k, poolY - 1, mix(head, th.bg, sp));
          cv.set(gx + k, poolY - 1, mix(head, th.bg, sp));
        }
      }
      for (let j = 0; j < 6; j++) {
        if (Math.sin(2 * Math.PI * ((t / 2) + hash(j, 5))) < 0.3) continue;
        cv.set(Math.floor(hash(j, 3) * cv.width), poolY - 2 - Math.floor(hash(j, 6) * 2), mist);
      }
      cv.draw(src, bx, by + Math.round(Math.sin((t * Math.PI) / 3)));
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── spring chain ────────────────────────────────────────────────────────────
const chain = {
  ...shared,
  id: 'text-spring-chain',
  since: '0.3.0',
  title: 'Follow the Leader',
  tags: ['chain', 'snake', 'follow', 'lissajous', 'whip', 'trail'],
  order: 240,
  loop: 8,
  size: { w: 76, h: 18 },
  minSize: { w: 36, h: 9 },
  description: 'The first letter leads a lap around a figure-eight course and the rest chase in a chain, bunching into the bends and stretching out of them like a spring.',
  setup(ctx) {
    const { theme: th } = ctx;
    const { src, cv, S } = makeWord(ctx, 'FOLLOW', 0.33, [ctx.theme.pos, ctx.theme.info]);
    const cx = cv.width / 2, cy = cv.height / 2;
    const mw = Math.max(...S.map((s) => s.w), 1), mh = Math.max(...S.map((s) => s.h), 1);
    const Ax = Math.max(2, (cv.width - mw) / 2 - 2), Ay = Math.max(2, (cv.height - mh) / 2 - 2);
    const P = (u) => [cx + Math.sin(u) * Ax, cy + Math.sin(2 * u + 1.1) * Ay];
    const pathC = mix(th.line, th.bg, 0.68);
    const ghostT = (c) => mix(c, th.bg, 0.75);
    const headT = (c) => mixOklab(c, 0xffffff, 0.25);
    return (t) => {
      const u0 = ((t % 8) / 8) * 2 * Math.PI;
      cv.clear();
      for (let j = 0; j < 56; j++) {
        const [px, py] = P((j / 56) * 2 * Math.PI);
        cv.set(px, py, pathC);
      }
      for (let i = S.length - 1; i >= 0; i--) {
        const s = S[i];
        const ui = u0 - i * 0.17;
        const [gx, gy] = P(ui - 0.11);
        stamp(cv, src, s, Math.round(gx - s.w / 2 - s.x0), Math.round(gy - s.h / 2 - s.y0), ghostT);
        const [px, py] = P(ui);
        stamp(cv, src, s, Math.round(px - s.w / 2 - s.x0), Math.round(py - s.h / 2 - s.y0), i === 0 ? headT : null);
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── word flip ───────────────────────────────────────────────────────────────
const wordFlip = {
  ...shared,
  id: 'text-word-flip',
  since: '0.3.0',
  title: 'Word Flip',
  tags: ['flip', '3d', 'rotate', 'departure board', 'carousel', 'cycle'],
  order: 250,
  loop: 8,
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  description: 'A cycle of words flips on a horizontal axis like a departure board: each one tilts away into a bright edge-on line, and the next rolls in behind it.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const words = String(ctx.param('text', 'BUILD TEST SHIP LOOP')).trim().toUpperCase().split(/\s+/).slice(0, 6);
    if (words.length < 2) words.push(words[0] || 'FLIP');
    const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
    const { font, scale } = fitType(longest, { mode }, W - 4, H - 3);
    const srcs = words.map((w2, i) => bannerCanvas(w2, { font, mode, scale, fill: [th.accent, mixOklab(th.accent, th.info, 0.5 + 0.5 * (i / words.length))], theme: th }));
    const cv = canvasLike(srcs[0], W, H);
    const midY = cv.height * 0.5;
    const edgeC = mixOklab(0xffffff, th.accent, 0.3);
    const slot = 8 / words.length, ft = Math.min(0.75, slot * 0.42);
    const maxH2 = Math.max(...srcs.map((s) => s.height));
    const dotY = Math.min(H - 1, Math.ceil((midY + maxH2 / 2) / cv.sy) + 1);
    const [don, doff] = asciiOnly(ctx) ? ['o', '.'] : ['●', '·'];
    return (t) => {
      const b = ctx.buffer;
      const tau = t % 8;
      const k = Math.min(words.length - 1, Math.floor(tau / slot));
      const p = (tau - k * slot) / slot;
      let idx = k, sq = 1;
      const fs = 1 - ft / slot;
      if (p >= fs) {
        const q = (p - fs) / (1 - fs);
        const a = Math.PI * (q < 0.5 ? easing.inQuad(q * 2) / 2 : 0.5 + easing.outCubic((q - 0.5) * 2) / 2);
        sq = Math.abs(Math.cos(a));
        if (a >= Math.PI / 2) idx = (k + 1) % words.length;
      }
      const s2 = srcs[idx];
      const bx2 = Math.max(0, (cv.width - s2.width) >> 1);
      cv.clear();
      const hh = Math.max(1, Math.round(s2.height * sq));
      const top = Math.round(midY - hh / 2);
      const shade = 0.55 * (1 - sq);
      for (let y = 0; y < hh; y++) {
        const sy = Math.min(s2.height - 1, Math.floor((y * s2.height) / hh));
        for (let x = 0; x < s2.width; x++) {
          const c = s2.px[sy * s2.width + x];
          if (c !== NONE) cv.set(bx2 + x, top + y, shade > 0 ? mixOklab(c, th.bg, shade) : c);
        }
      }
      if (sq < 0.22) for (let x = 0; x < s2.width; x++) cv.set(bx2 + x, Math.round(midY), mix(edgeC, th.bg, sq * 2));
      cv.paint(b, 0, 0);
      if (dotY < H && words.length * 2 - 1 <= W) {
        const x0 = Math.floor((W - (words.length * 2 - 1)) / 2);
        for (let j = 0; j < words.length; j++) b.set(x0 + j * 2, dotY, j === idx ? don : doff, j === idx ? th.accent : mix(th.muted, th.bg, 0.3));
      }
    };
  },
};

export default [bounceIn, orbitIn, pendulum, waterfall, chain, wordFlip];
