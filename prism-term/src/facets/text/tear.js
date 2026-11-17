// Glitch & Distort — geometric abuse of big type: sliced rows shearing in
// patterns, a mirrored word shattering into Voronoi shards, interlace comb
// tearing locked to motion, and rubber letters stretched and let go.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas } from '../../text/banner.js';
import { MODES } from '../../canvas.js';
import { clamp, smoothstep } from '../../easing.js';
import { bannerMode, fitType, hash, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Glitch & Distort', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };
const TAU = Math.PI * 2;

// ── sliced rows ─────────────────────────────────────────────────────────────
const PATTERNS = 4; // alternate · staircase · sine · scatter

const sliced = {
  ...shared,
  id: 'text-sliced',
  since: '0.3.0',
  title: 'Sliced Shear',
  tags: ['slice', 'shear', 'displacement', 'rows', 'cut', 'kinetic'],
  order: 200,
  loop: 2 * PATTERNS,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'The word is cut into horizontal slices that shear apart and glide home in four choreographies — alternating, staircase, wave and scatter — with colored cut edges.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'SLICED'));
    const pad = Math.max(4, Math.min(10, Math.floor(W / 9)));
    const { font, scale } = fitType(text, { mode, padX: pad, padY: 1 }, W, H);
    const src = bannerCanvas(text, { font, mode, scale, padX: pad, padY: 1, fill: [th.ink, th.accent], direction: 'vertical', theme: th });
    const out = canvasLike(src);
    const w = src.width, h = src.height;
    // A few thick slices (3–4), snapped to whole cell rows so cuts never split a cell:
    // thin ones turn the alternate/scatter patterns into an unreadable comb.
    const sh = Math.max(2 * src.sy, Math.round(h / 3.5 / src.sy) * src.sy);
    const slices = Math.ceil(h / sh);
    const A = Math.min(pad - 1, Math.max(3, Math.round(w * 0.1)));
    // Leftmost / rightmost ink pixel per row, for the painted cut faces.
    const lo = new Int16Array(h).fill(-1), hi = new Int16Array(h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.px[y * w + x] !== NONE) { if (lo[y] < 0) lo[y] = x; hi[y] = x; }
    // Lone edge pixels read as stray half blocks at mono depth — drop them there.
    const faces = ctx.caps.depth !== 'mono';
    const shape = (p, s, k) => p === 0 ? (s % 2 ? 1 : -1)
      : p === 1 ? (s - (slices - 1) / 2) / Math.max(1, slices - 1) * 2
      : p === 2 ? Math.sin(s * 1.25 + k)
      : (hash(s, k, 7) - 0.5) * 2;
    return (t) => {
      const tau = t % (2 * PATTERNS);
      const k = Math.floor(tau / 2), ph = tau % 2;
      // ease out, hold sheared, ease back — then 0.6 s at rest so the word reads between moves
      const amp = smoothstep(0.3, 0.75, ph) * (1 - smoothstep(1.25, 1.7, ph));
      out.clear();
      for (let s = 0; s < slices; s++) {
        const dx = Math.round(shape(k, s, k) * A * amp);
        const tint = clamp(Math.abs(dx) / A);
        for (let y = s * sh; y < Math.min(h, (s + 1) * sh); y++) {
          for (let x = 0; x < w; x++) {
            const c = src.px[y * w + x];
            if (c !== NONE) out.set(x + dx, y, tint ? mixOklab(c, th.accent2, tint * 0.35) : c);
          }
          if (faces && tint > 0.25 && lo[y] >= 0) { // cut faces catch the light
            out.set(lo[y] - 1 + dx, y, mixOklab(th.accent2, th.bg, 0.25));
            out.set(hi[y] + 1 + dx, y, mixOklab(th.accent2, th.bg, 0.25));
          }
        }
      }
      out.paint(ctx.buffer, Math.floor((W - out.cols) / 2), Math.floor((H - out.rows) / 2));
    };
  },
};

// ── mirror shatter ──────────────────────────────────────────────────────────
const SLOOP = 9;
const FLY = 3.2; // seconds of flight before the rewind

const shatter = {
  ...shared,
  id: 'text-shatter',
  since: '0.3.0',
  title: 'Mirror Shatter',
  tags: ['shatter', 'mirror', 'glass', 'voronoi', 'shards', 'crack', 'break'],
  order: 210,
  loop: SLOOP,
  size: { w: 76, h: 18 },
  minSize: { w: 36, h: 9 },
  description: 'A word etched on a mirror takes a hit: cracks race out from the impact, rigid Voronoi shards tumble away under gravity, then time rewinds and the glass seals itself.',
  credits: 'after classic broken-glass title cards',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'MIRROR'));
    const { sx: msx, sy: msy } = MODES[mode] || MODES.half;
    const padX = 3 * msx, padY = msy; // the mirror: three cells of glass beside the word, one above and below
    const { font, scale } = fitType(text, { mode, padX, padY }, W - 2, Math.max(3, H - 3));
    const glass = [mixOklab(th.info, th.ink, 0.55), mixOklab(th.info, th.bg, 0.25)];
    const src = bannerCanvas(text, { font, mode, scale, padX, padY, fill: glass, direction: 'vertical', theme: th });
    const cv = canvasLike(src, W, H);
    const w = src.width, h = src.height, asp = cv.aspect;
    const ox = Math.floor((cv.width - w) / 2), oy = Math.floor((cv.height - h) / 2);
    // The pane: faint glass with a slow diagonal sheen and a brighter rim; the letters sit on it,
    // so every shard is a solid piece of glass rather than loose fragments of strokes.
    // 16 colors needs heavier glass to survive quantization; sheen and rim rise with it so the sheen never inverts.
    const [kLo, kHi, kRim] = ctx.caps.depth === '16' ? [0.24, 0.3, 0.42] : [0.16, 0.22, 0.34];
    const paneLo = mixOklab(th.bg, th.info, kLo), paneHi = mixOklab(th.bg, th.info, kHi), rim = mixOklab(th.bg, th.info, kRim);
    const pane = new Int32Array(w * h), kindOf = new Uint8Array(w * h); // 1 glass · 2 letter · 5 rim
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, c = src.px[j];
      if (c !== NONE) { pane[j] = c; kindOf[j] = 2; continue; }
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      pane[j] = edge ? rim : mix(paneLo, paneHi, 0.5 + 0.5 * Math.cos(((x + y * asp) / (w + h * asp)) * TAU * 1.5));
      kindOf[j] = edge ? 5 : 1;
    }
    // Impact point and Voronoi shard seeds radiating from it.
    const K = 12;
    const ix = w * (0.35 + hash(1, 2) * 0.3), iy = h * (0.3 + hash(3, 4) * 0.4);
    const seedX = [], seedY = [];
    for (let s = 0; s < K; s++) {
      const a = (s / K) * Math.PI * 2 + hash(s, 5) * 0.9;
      const r = (0.18 + hash(s, 6) * 0.85) * Math.max(w, h) * 0.55;
      seedX.push(ix + Math.cos(a) * r);
      seedY.push(iy + Math.sin(a) * r * 0.7);
    }
    const shardOf = (x, y) => {
      let best = 0, bd = Infinity;
      for (let s = 0; s < K; s++) {
        const dx = x - seedX[s], dy = (y - seedY[s]) * 1.4;
        const d = dx * dx + dy * dy + hash(s, 9) * 30;
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const id = new Int8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id[y * w + x] = shardOf(x, y);
    // Crack network: every Voronoi seam across the pane, with its distance from the impact
    // so the cracks can race outward.
    const seamX = [], seamY = [], seamD = [], seamInk = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = id[y * w + x];
      if ((x + 1 < w && id[y * w + x + 1] !== s) || (y + 1 < h && id[(y + 1) * w + x] !== s)) {
        seamX.push(x); seamY.push(y); seamD.push(Math.hypot(x - ix, (y - iy) * asp));
        seamInk.push(kindOf[y * w + x] === 2 ? 1 : 0);
      }
    }
    const seamMax = Math.max(1, ...seamD);
    // Per-shard dynamics: drift away from the impact, slow tumble, shared gravity.
    const cd = Math.max(w, h);
    const vx = [], vy = [], vr = [], cxs = new Float64Array(K), cys = new Float64Array(K), cnt = new Float64Array(K);
    const bx0 = new Int32Array(K).fill(1 << 30), bx1 = new Int32Array(K).fill(-1), by0 = new Int32Array(K).fill(1 << 30), by1 = new Int32Array(K).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = id[y * w + x];
      cxs[s] += x; cys[s] += y; cnt[s]++;
      if (x < bx0[s]) bx0[s] = x;
      if (x > bx1[s]) bx1[s] = x;
      if (y < by0[s]) by0[s] = y;
      if (y > by1[s]) by1[s] = y;
    }
    for (let s = 0; s < K; s++) {
      if (cnt[s]) { cxs[s] = cxs[s] / cnt[s] + 0.5; cys[s] = cys[s] / cnt[s] + 0.5; }
      const dx = cxs[s] - ix, dy = cys[s] - iy, L = Math.hypot(dx, dy) || 1;
      const sp = (0.08 + hash(s, 10) * 0.16) * cd;
      vx.push((dx / L) * sp); vy.push((dy / L) * sp * 0.6); vr.push((hash(s, 11) - 0.5) * 1.5);
    }
    const g = (1.1 * h) / (FLY * FLY);
    const flash = mixOklab(th.ink, th.info, 0.25);
    const crackC = mixOklab(th.info, th.ink, 0.35); // a crack line running across the glass
    // The glint sweeps toward ink: a bright sheen by Night, a dark one by Day (a pale glint on a light
    // page would wash the glass out below 3:1 — the same rule as charts/_data.js light()).
    const glintC = th.mode === 'light' ? mixOklab(th.ink, th.info, 0.5) : th.ink; // by Day tinted toward the glass, not a grey smudge
    // Without Unicode the ascii canvas paints every pixel '#', which would bury the word in its
    // own pane: remember what each cell holds and give glass, rim, cracks and sparks lighter glyphs.
    const CWd = cv.width, CHd = cv.height;
    const cellKind = mode === 'ascii' ? new Uint8Array(CWd * CHd) : null;
    const GLYPH = [null, '.', null, '/', '*', ':'];
    const put = (X, Y, c, k) => {
      cv.set(X, Y, c);
      if (cellKind) { X = Math.floor(X); Y = Math.floor(Y); if (X >= 0 && Y >= 0 && X < CWd && Y < CHd) cellKind[Y * CWd + X] = k; }
    };
    return (t) => {
      const tau = t % SLOOP;
      cv.clear();
      if (cellKind) cellKind.fill(0);
      // Phase: intact+glint · cracks race out · fly · exact rewind · seams flare as it seals
      let tf = 0, crack = -1;
      if (tau < 1.8) { /* intact */ }
      else if (tau < 2.2) crack = smoothstep(1.8, 2.05, tau);
      else if (tau < 2.2 + FLY) tf = tau - 2.2;
      else if (tau < 2.2 + 2 * FLY) tf = 2.2 + 2 * FLY - tau;
      else if (tau < 2.2 + 2 * FLY + 0.25) crack = 1 - smoothstep(2.2 + 2 * FLY, 2.2 + 2 * FLY + 0.25, tau);
      const glint = tau < 1.8 ? (tau / 1.8) * 1.3 - 0.15 : -1;
      if (tf === 0) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const j = y * w + x;
          let c = pane[j];
          if (glint >= 0 && Math.abs((x + y * 0.6) / (w + h * 0.6) - glint) < 0.035) c = mixOklab(c, glintC, kindOf[j] === 2 ? 0.65 : 0.3);
          put(x + ox, y + oy, c, kindOf[j]);
        }
        if (crack >= 0) {
          const reach = crack * seamMax + 0.5, blink = Math.floor(t * 18) % 2;
          for (let j = 0; j < seamX.length; j++) {
            if (seamD[j] > reach) continue;
            put(seamX[j] + ox, seamY[j] + oy, seamInk[j] ? (blink ? th.ink : flash) : crackC, 3);
          }
        }
      } else {
        // Each shard moves as one rigid piece: one rounded offset per shard, and its tumble is
        // inverse-mapped over the rotated box (sample the pane, keep this shard's pixels).
        const drop = 0.5 * g * tf * tf, fade = clamp(tf / FLY) * 0.35;
        for (let s = 0; s < K; s++) {
          if (!cnt[s]) continue;
          const ang = vr[s] * tf, co = Math.cos(ang), si = Math.sin(ang);
          const Tx = Math.round(vx[s] * tf), Ty = Math.round(vy[s] * tf + drop);
          const cx = cxs[s], cyv = cys[s] * asp; // rotate in visual space (pixels may be non-square)
          let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
          for (const [px, py] of [[bx0[s], by0[s]], [bx1[s] + 1, by0[s]], [bx0[s], by1[s] + 1], [bx1[s] + 1, by1[s] + 1]]) {
            const rx = px - cx, ry = py * asp - cyv;
            const X = cx + rx * co - ry * si, Y = (cyv + rx * si + ry * co) / asp;
            if (X < X0) X0 = X;
            if (X > X1) X1 = X;
            if (Y < Y0) Y0 = Y;
            if (Y > Y1) Y1 = Y;
          }
          for (let Y = Math.floor(Y0) - 1; Y <= Math.ceil(Y1); Y++) {
            for (let X = Math.floor(X0) - 1; X <= Math.ceil(X1); X++) {
              const ux = X + 0.5 - cx, uy = (Y + 0.5) * asp - cyv;
              const sx = Math.floor(cx + ux * co + uy * si), sy = Math.floor((cyv - ux * si + uy * co) / asp);
              if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
              const j = sy * w + sx;
              if (id[j] !== s) continue;
              put(X + Tx + ox, Y + Ty + oy, fade ? mix(pane[j], th.bg, fade) : pane[j], kindOf[j]);
            }
          }
        }
      }
      // Impact sparks while the cracks are fresh
      if (tau >= 1.8 && tau < 2.6) {
        const r = (tau - 1.8) * cd * 0.5;
        for (let j = 0; j < 14; j++) {
          const a = hash(j, 21) * Math.PI * 2;
          put(ix + Math.cos(a) * r + ox, iy + Math.sin(a) * r * 0.6 + oy, mix(th.ink, th.bg, hash(j, 22) * 0.5), 4);
        }
      }
      cv.paint(ctx.buffer, 0, 0);
      if (cellKind) for (let i = 0; i < cellKind.length; i++) if (GLYPH[cellKind[i]]) ctx.buffer.set(i % CWd, Math.floor(i / CWd), GLYPH[cellKind[i]]);
    };
  },
};

// ── interlace comb tear ─────────────────────────────────────────────────────
const ILOOP = 8;

const interlace = {
  ...shared,
  id: 'text-interlace',
  since: '0.3.0',
  title: 'Interlace Comb Tear',
  tags: ['interlace', 'comb', 'fields', 'deinterlace', 'scanlines', 'tv', 'tear'],
  order: 220,
  loop: ILOOP,
  size: { w: 76, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'The word swings side to side and its two interlaced fields lag apart — comb teeth grow with speed, tinted warm and cool, snapping razor-sharp at each turn.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'MOTION'));
    const { font, scale } = fitType(text, { mode }, Math.max(8, W - 14), H - 2);
    const src = bannerCanvas(text, { font, mode, scale, fill: th.ink, theme: th });
    const cv = canvasLike(src, W, H);
    const w = src.width, h = src.height;
    const A = Math.max(2, (cv.width - w) / 2 - 2);
    const oy = Math.floor((cv.height - h) / 2);
    const om = (2 * Math.PI * 2) / ILOOP; // two swings per loop
    const lag = 0.16;
    // True scanline fields need sub-cell color; at mono depth a split cell would
    // paint as a wall of half blocks, so the comb coarsens to whole cell rows.
    const fsy = ctx.caps.depth === 'mono' ? src.sy : 1;
    const xAt = (tt) => (cv.width - w) / 2 + A * Math.sin(tt * om);
    const warm = (c) => mixOklab(c, th.warn, 0.3), cool = (c) => mixOklab(c, th.info, 0.3);
    return (t) => {
      cv.clear();
      const xa = xAt(t), xb = xAt(t - lag);
      const sep = Math.abs(xa - xb);
      const tinted = sep > 0.6;
      for (let y = 0; y < h; y++) {
        const even = Math.floor((y + oy) / fsy) % 2 === 0;
        const dx = Math.round(even ? xa : xb);
        for (let x = 0; x < w; x++) {
          const c = src.px[y * w + x];
          if (c === NONE) continue;
          cv.set(x + dx, y + oy, tinted ? (even ? warm(c) : cool(c)) : c);
        }
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

// ── rubber stretch ──────────────────────────────────────────────────────────
const RLOOP = 6;
const LEAD = 0.2, PULL = 0.8; // a beat at rest, then the pull, then the release

// Feature runs along one axis: maximal stretches of identical source columns (or rows) by
// ink mask. A stroke, a counter and the gap between two letters are each one run.
function featureRuns(src, axis) {
  const w = src.width, h = src.height, n = axis ? h : w, m = axis ? w : h;
  const run = new Int32Array(n), first = [], last = [];
  const inkAt = (i, j) => src.px[axis ? i * w + j : j * w + i] !== NONE;
  for (let i = 0; i < n; i++) {
    let same = i > 0;
    for (let j = 0; same && j < m; j++) if (inkAt(i, j) !== inkAt(i - 1, j)) same = false;
    if (same) { run[i] = run[i - 1]; last[run[i]] = i; } else { run[i] = first.length; first.push(i); last.push(i); }
  }
  return { run, first, last, count: first.length };
}

// Resampling keeps every feature: after pixel-centre sampling (map[d] = source index or -1),
// a run that got no destination pixel takes one from an adjacent run that has two or more,
// so squashed type keeps its strokes AND the gaps between letters (order is preserved).
function keepFeatures(map, n, R, cnt) {
  cnt.fill(0);
  for (let d = 0; d < n; d++) if (map[d] >= 0) cnt[R.run[map[d]]]++;
  for (let r = 0; r < R.count; r++) {
    if (cnt[r]) continue;
    let before = -1, after = -1;
    for (let d = 0; d < n; d++) {
      const s = map[d];
      if (s < 0) continue;
      if (s < R.first[r]) before = d;
      else if (s > R.last[r]) { after = d; break; }
    }
    const pick = before >= 0 && cnt[R.run[map[before]]] > 1 ? before : after >= 0 && cnt[R.run[map[after]]] > 1 ? after : -1;
    if (pick < 0) continue; // squashed past the point where every feature can keep a pixel
    cnt[R.run[map[pick]]]--;
    map[pick] = (R.first[r] + R.last[r]) >> 1;
    cnt[r] = 1;
  }
}

const rubber = {
  ...shared,
  id: 'text-rubber',
  since: '0.3.0',
  title: 'Rubber Stretch',
  tags: ['rubber', 'stretch', 'squash', 'spring', 'wobble', 'elastic', 'jelly'],
  order: 230,
  loop: RLOOP,
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 8 },
  description: 'Elastic letters yanked wide and squashed flat, then pulled tall and thin: each time a damped spring snaps them back as a jelly wave shivers through the word.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'RUBBER'));
    const { font, scale } = fitType(text, { mode }, Math.max(8, Math.floor((W - 2) / 1.45)), Math.max(3, Math.floor(H / 1.65)));
    const src = bannerCanvas(text, { font, mode, scale, fill: [th.pos, th.accent], theme: th });
    const cv = canvasLike(src, W, H);
    const w = src.width, h = src.height, CW = cv.width, CH = cv.height;
    // Integer centres + pixel-centre sampling: at scale 1 every destination pixel lands
    // exactly on a source pixel, so the resting word never flickers between roundings.
    const cxs = w >> 1, cys = h >> 1, cxd = CW >> 1, cyd = CH >> 1;
    const maxSx = Math.max(1.15, Math.min(1.7, (CW - 2 * cv.sx) / Math.max(1, w)));
    const maxSy = Math.max(1.15, Math.min(1.6, (CH - 2) / Math.max(1, h)));
    const kw = TAU / Math.max(8, w * 0.6); // jelly wavelength: ~60% of the word
    const cols = featureRuns(src, 0), rows = featureRuns(src, 1);
    const colMap = new Int32Array(CW), rowMap = new Int32Array(CH);
    const colCnt = new Int32Array(cols.count), rowCnt = new Int32Array(rows.count);
    // Rubber gives more under tension than under compression: undershoots below 1 are softened.
    const spring = (amp, r) => { const v = amp * Math.exp(-1.6 * r) * Math.cos(8 * r); return 1 + (v < 0 ? v * 0.6 : v); };
    // Squash floor per axis: one pixel per feature run, so tiny type is never squashed past legibility.
    const minSx = Math.min(1, (cols.count + 0.5) / Math.max(1, w)), minSy = Math.min(1, (rows.count + 0.5) / Math.max(1, h));
    const rowsFor = (syl) => {
      for (let y = 0; y < CH; y++) { const sy = Math.floor(cys + (y + 0.5 - cyd) / syl); rowMap[y] = sy >= 0 && sy < h ? sy : -1; }
      if (syl < 1) keepFeatures(rowMap, CH, rows, rowCnt);
    };
    return (t) => {
      const tau = t % RLOOP;
      // Two gestures a loop: pulled wide and let go, then pulled tall and let go (half a loop each).
      const axis = tau < RLOOP / 2 ? 0 : 1, q = tau - axis * (RLOOP / 2) - LEAD, amp = (axis ? maxSy : maxSx) - 1;
      let main, wob = 0, r = 0;
      if (q < PULL) main = 1 + amp * smoothstep(0, PULL, q);
      else { r = q - PULL; main = spring(amp, r); wob = (axis ? 0.18 : 0.2) * Math.exp(-2 * r); }
      const other = 1 / Math.sqrt(Math.max(0.35, main)); // volume-preserving squash on the other axis
      const Sx = Math.max(minSx, axis ? other : main), Sy = Math.max(minSy, axis ? main : other);
      cv.clear();
      if (Math.abs(Sx - 1) < 0.002 && Math.abs(Sy - 1) < 0.002 && wob < 0.002) { // at rest: the word itself
        cv.draw(src, cxd - cxs, cyd - cys);
        cv.paint(ctx.buffer, 0, 0);
        return;
      }
      const strain = clamp(Math.max(Math.abs(Sx - 1), Math.abs(Sy - 1)) * 0.9);
      // Horizontal jelly: a travelling displacement (monotonic, so columns never fold over).
      const Aw = axis === 0 ? wob * w * 0.06 : 0;
      for (let x = 0; x < CW; x++) {
        const sx = Math.floor(cxs + (x + 0.5 - cxd) / Sx + Aw * Math.sin(kw * (x + 0.5 - cxd) - 12 * r));
        colMap[x] = sx >= 0 && sx < w ? sx : -1;
      }
      if (Sx < 1 || Aw > 0) keepFeatures(colMap, CW, cols, colCnt);
      if (axis === 0) rowsFor(Sy);
      for (let x = 0; x < CW; x++) {
        const sx = colMap[x];
        if (sx < 0) continue;
        // Vertical jelly: each column's height scale ripples along the word.
        if (axis === 1) rowsFor(Sy * (1 + wob * Math.sin(kw * (x + 0.5 - cxd) - 12 * r)));
        for (let y = 0; y < CH; y++) {
          const sy = rowMap[y];
          if (sy < 0) continue;
          const c = src.px[sy * w + sx];
          if (c !== NONE) cv.set(x, y, strain > 0.08 ? mixOklab(c, th.warn, strain * 0.45) : c);
        }
      }
      cv.paint(ctx.buffer, 0, 0);
    };
  },
};

export default [sliced, shatter, interlace, rubber];
