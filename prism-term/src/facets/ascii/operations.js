// Pure ASCII — long operations, watched: MS-DOS DEFRAG condensing a disk, a
// Windows 95 copy dialog with its flying page, a quay crane loading a ship as a
// Kubernetes rollout, and a theater marquee of chasing bulbs. 7-bit only.
import { sprite, hash, box } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', category: 'ASCII Spinners & Bars', glyphs: 'ascii', color: '16' };
/** Time within the loop, quantized so t and t + loop draw identical frames (flicker keys included). */
const phase = (t, loop) => Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const mmss = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const pbar = (w, p) => '[' + '#'.repeat(Math.round(clamp01(p) * w)) + '.'.repeat(w - Math.round(clamp01(p) * w)) + ']';

// ── DEFRAG ───────────────────────────────────────────────────────────────────
const FREE = 0, USED = 1, FIXED = 2, BAD = 3;

const defrag = {
  ...shared,
  id: 'ascii-defrag',
  since: '0.3.0',
  title: 'Defrag Block Map',
  tags: ['defrag', 'ms-dos', 'disk', 'clusters', 'optimize', 'retro', 'block map'],
  order: 340,
  kind: 'progress',
  loop: 24,
  size: { w: 80, h: 22 },
  minSize: { w: 44, h: 12 },
  description: 'An MS-DOS 6-style DEFRAG condenses a fragmented disk: r reads a run of clusters, W writes it into the leftmost gap until the map is solid, then re-analyzes.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const gx = 1, gy = 2, gw = W - 2, gh = Math.max(3, H - (W >= 70 ? 7 : 6)), N = gw * gh;
    const start = new Uint8Array(N);
    for (let i = 0; i < N;) {                             // runs of files and gaps, a few fixed and bad clusters
      const used = hash(i, 3) < 0.58, len = 1 + Math.floor(hash(i, 5) * (used ? 8 : 5));
      for (let j = 0; j < len && i < N; j++, i++) start[i] = used ? USED : FREE;
    }
    for (let k = 0; k < 6; k++) start[Math.floor(hash(k, 11) * N)] = FIXED;
    for (let k = 0; k < 3; k++) start[Math.floor(hash(k, 13) * N)] = BAD;
    start[0] = start[1] = FIXED;                          // boot sector and FAT stay put
    // plan: move the next run of used clusters into the leftmost gap until the map is solid
    const cells = start.slice(), ops = [];
    for (let w = 0, guard = 0; guard < N; guard++) {
      while (w < N && cells[w] !== FREE) w++;
      let r = w + 1;
      while (r < N && cells[r] !== USED) r++;
      if (w >= N || r >= N) break;
      let len = 0;
      while (len < 8 && r + len < N && cells[r + len] === USED) len++;
      let gap = 0;
      while (gap < len && w + gap < N && cells[w + gap] === FREE) gap++;
      len = Math.max(1, Math.min(len, gap));
      ops.push([r, w, len]);
      for (let j = 0; j < len; j++) { cells[r + j] = FREE; cells[w + j] = USED; }
    }
    const done = cells, T0 = 0.8, T1 = 20.4, per = (T1 - T0) / Math.max(1, ops.length);
    const GLY = ['.', '#', 'X', 'B'], COL = [th.dim, th.ink, th.neg, th.neg];
    const map = new Uint8Array(N), mark = new Uint8Array(N);
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 24);
      b.fill(0, 0, W, H, ' ', undefined, th.panel2);
      b.text(1, 0, 'Optimize', th.ink, th.panel2, 1);
      const title = 'Microsoft Defrag';
      b.text(Math.floor((W - title.length) / 2), 0, title, th.ink, th.panel2, 1);
      if (W >= 60) b.text(W - 9, 0, 'F1=Help', th.muted, th.panel2);
      // the map at this moment
      map.set(start); mark.fill(0);
      const k = Math.floor((tau - T0) / per), frac = (tau - T0) / per - k;
      const nOps = tau < T0 ? 0 : Math.min(ops.length, k);
      for (let i = 0; i < nOps; i++) { const [r, w, len] = ops[i]; for (let j = 0; j < len; j++) { map[r + j] = FREE; map[w + j] = USED; } }
      if (tau >= T0 && k < ops.length) {
        const [r, w, len] = ops[k];
        for (let j = 0; j < len; j++) { if (frac < 0.5) mark[r + j] = 1; else { mark[w + j] = 2; map[r + j] = FREE; } }
      }
      const wipe = tau >= 22 ? Math.round((1 - (tau - 22) / 2) * gw) : gw;   // right → left re-analysis
      for (let i = 0; i < N; i++) {
        const x = i % gw, y = Math.floor(i / gw);
        let v = tau >= 20.4 ? done[i] : map[i];
        if (x >= wipe) v = start[i];
        const ch = mark[i] === 1 ? 'r' : mark[i] === 2 ? 'W' : GLY[v];
        b.set(gx + x, gy + y, ch, mark[i] === 1 ? th.info : mark[i] === 2 ? th.warn : COL[v], th.panel2);
      }
      // re-analysis (from 22 s) resets the readout with the wipe, so the wrap meets the t = 0 status
      const fresh = tau < T0 || tau >= 22;
      const pct = fresh ? 0 : tau >= T1 ? 100 : Math.floor(((tau - T0) / (T1 - T0)) * 100);
      const cluster = fresh ? 2 : k < ops.length ? Math.round((ops[k][0] / N) * 98304) : 98304;
      const sy = gy + gh + 1;
      const status = `Cluster ${cluster.toLocaleString('en-US')} | ${pct}% | Elapsed ${mmss(fresh ? 0 : Math.min(tau, T1) * 6)} | Full Optimization`;
      b.text(1, sy, status.slice(0, W - 2), th.ink, th.panel2);
      b.text(1, sy + 1, pbar(Math.min(40, W - 10), pct / 100), th.accent, th.panel2);
      if (W >= 70 && sy + 2 < H) b.text(1, sy + 2, '# Used  . Unused  r Reading  W Writing  X Unmovable  B Bad', th.muted, th.panel2);
      if (tau >= 20.4 && tau < 22) {                        // the finish box
        const msg = ' Finished condensing. ', bw = msg.length + 2, bx = Math.floor((W - bw) / 2), byy = gy + Math.floor(gh / 2) - 1;
        box(b, bx, byy, bw, 3, th.ink);
        b.text(bx + 1, byy + 1, msg, th.ink, th.panel, 1);
      }
    };
  },
};

// ── Windows 95 copy dialog ───────────────────────────────────────────────────
const FILES = ['prism-term-0.2.0.tgz', 'README.md', 'themes.json', 'facets-catalog.json', 'prism.wasm', 'CHANGELOG.md'];
const FOLDER = [' __', '|  \\___', '|      |', '|______|'];             // a tabbed folder; the compact strip drops its middle row
const FOLDER_SMALL = [FOLDER[0], FOLDER[1], FOLDER[3]];
const PAGES = [['.-.', '|=|'], ['/-/', '/=/'], ['\\-\\', '\\=\\']];

const fileCopy = {
  ...shared,
  id: 'ascii-file-copy',
  since: '0.3.0',
  title: 'File Copy Dialog',
  tags: ['windows 95', 'copy', 'dialog', 'file transfer', 'eta', 'retro', 'progress'],
  order: 350,
  kind: 'progress',
  loop: 18,
  size: { w: 64, h: 14 },
  minSize: { w: 40, h: 9 },
  description: 'A Windows 95-style copy dialog: a page flies between folders, files tick by, and the ETA lurches from 12 seconds to 47 minutes and back, then it closes.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const dw = Math.min(60, W - 2), dh = Math.min(12, H - 1), dx = Math.floor((W - dw) / 2), dy = Math.floor((H - 1 - dh) / 2);
    const tall = dh >= 12;
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 18);
      b.fill(0, H - 1, W, 1, ' ', undefined, th.panel2);    // the taskbar
      b.text(0, H - 1, '[Start]', th.ink, th.panel2, 1);
      const open = tau < 15 || tau >= 17.4;
      if (!open) {                                          // the empty desktop
        b.text(2, 1, '[=]', th.muted); b.text(1, 2, 'My Computer', th.dim);
        b.text(2, 4, '\\_/', th.muted); b.text(1, 5, 'Recycle Bin', th.dim);
        return;
      }
      b.text(9, H - 1, '[Copying...]', th.ink, th.panel2);
      const run = tau >= 17.4 ? 0 : tau, p = clamp01((run - 0.4) / 14.6);
      // the window and its title bar; when short, the frame runs under the title bar so a row is free for the strip
      b.fill(dx, dy, dw, dh, ' ', undefined, th.panel);
      if (!tall) box(b, dx, dy, dw, dh, th.line);
      b.fill(dx, dy, dw, 1, ' ', undefined, th.accent);
      b.text(dx + 1, dy, 'Copying...', th.bg, th.accent, 1);
      b.text(dx + dw - 4, dy, '[x]', th.bg, th.accent);
      if (tall) box(b, dx, dy + 1, dw, dh - 1, th.line);
      const fy = tall ? dy + 2 : dy + 1, lx = dx + 3, rx = dx + dw - 11;
      sprite(b, lx, fy, tall ? FOLDER : FOLDER_SMALL, th.warn); sprite(b, rx, fy, tall ? FOLDER : FOLDER_SMALL, th.warn);
      // the page: an eased parabola every 0.8 s (a lower arc in the compact strip), flipping through its sprites
      const k = ((run - 0.4) / 0.8) % 1, flying = run > 0.4 && run < 15;
      if (flying) {
        const e = ease(k), px = Math.round(lx + 6 + e * (rx - lx - 8)), py = Math.round(fy + 1 - Math.sin(Math.PI * e) * (tall ? 2 : 1));
        sprite(b, px, py, PAGES[Math.min(2, Math.floor(e * 3))], th.ink);
      }
      const file = FILES[Math.min(FILES.length - 1, Math.floor(p * FILES.length))];
      const ty = tall ? fy + 5 : fy + 3, last = dy + dh - 2;      // last interior row
      b.text(lx - 1, ty, file, th.ink, th.panel);
      let ry = ty + 1;
      if (tall || last - ty >= 3) b.text(lx - 1, ry++, "From 'Downloads' to 'Backup'".slice(0, dw - 4), th.muted, th.panel);
      const bw = dw - 6, filled = Math.round(p * bw);
      b.text(lx - 1, ry, '[' + '|'.repeat(filled) + ' '.repeat(bw - filled) + ']', th.accent, th.panel);
      const eta = run < 4 ? `${12 - Math.floor(Math.max(0, run - 0.4) * 0.8)} Seconds Remaining` : run < 6.5 ? '47 Minutes Remaining' : (() => { const s = Math.max(1, Math.ceil((9 * (15 - run)) / 8.5)); return `${s} Second${s === 1 ? '' : 's'} Remaining`; })();
      if (ry + 1 <= last) {
        b.text(lx - 1, ry + 1, eta, th.muted, th.panel);
        b.text(dx + dw - 11, ry + 1, '[Cancel]', th.ink, th.panel);
      }
    };
  },
};

// ── quay crane rollout ───────────────────────────────────────────────────────
const MOVE = 1.75;                                         // seconds per container
const craneTimeline = (k) => {
  // phase fractions within one container move: to the stack, lower, hoist, travel, lower, release, hoist
  const f = [0.14, 0.28, 0.4, 0.66, 0.84, 0.9, 1];
  for (let i = 0; i < f.length; i++) if (k < f[i]) return [i, (k - (f[i - 1] ?? 0)) / (f[i] - (f[i - 1] ?? 0))];
  return [6, 1];
};

const crane = {
  ...shared,
  id: 'ascii-container-crane',
  since: '0.3.0',
  title: 'Container Rollout',
  tags: ['crane', 'containers', 'kubernetes', 'rollout', 'deployment', 'ship', 'port'],
  order: 360,
  kind: 'progress',
  loop: 24,
  size: { w: 80, h: 20 },
  minSize: { w: 44, h: 12 },
  description: 'A quay crane loads a container ship as a kubectl rollout: each box hoisted, swung aboard and set down turns green once ready, then the ship sails.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cols = W >= 70 ? 5 : 3, n = 2 * cols;
    const wy = H - 4, deck = wy - 1, boomY = Math.max(2, Math.round(H * 0.15));
    // left to right: the quay stack, the crane's legs, the quay edge, the ship
    const stackCols = W >= 70 ? 2 : 1, stackX = 0, legL = stackCols * 6 + 1, legR = legL + 6, qx = legR + 2;
    const shipX0 = qx + 2, hullW = cols * 6 + 9;             // bays plus room aft for the bridge
    const slotX = (c) => shipX0 + 3 + c * 6, slotY = (tier) => deck - 1 - tier;
    const lastLand = n * MOVE;
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 24);
      const k = Math.min(n, Math.floor(tau / MOVE)), within = tau / MOVE - k;
      // the ship: docked while loading, sails out at 18.5, an empty one docks by 23.5
      const shipX = tau < 18.5 ? shipX0 : tau < 20.5 ? shipX0 + ease((tau - 18.5) / 2) * (W - shipX0 + 2) : tau < 21 ? W + 2 : shipX0 + (1 - ease((tau - 21) / 2.5)) * (W - shipX0 + 2);
      const loadedShip = tau < 20.5;
      for (let y = wy; y < H - 1; y++) for (let x = 0; x < W; x++) if (x > qx && (x + y * 3 + Math.floor(tau * 4)) % 7 === 0) b.set(x, y, '~', mix(th.info, th.bg, 0.4));
      for (let x = 0; x <= qx; x++) b.set(x, deck, '=', th.muted);        // the quay
      for (let y = deck + 1; y < H - 1; y++) b.set(qx, y, '|', th.muted);
      // the quay stack of the new image
      // the next image's containers are trucked back onto the quay while the empty ship comes in
      const left = tau >= 20.5 ? Math.min(n, Math.floor((tau - 20.5) / 0.25)) : Math.max(0, n - (k + (within > 0.4 ? 1 : 0)));
      const cap = stackCols * 3;
      for (let i = 0; i < left && i < cap; i++) b.text(stackX + (i % stackCols) * 6, deck - 1 - Math.floor(i / stackCols), '[web]', th.info);
      if (left > cap) b.text(stackX + 1, deck - 4, `+${left - cap}`, th.info);
      b.text(1, deck + 1, 'prism/web:2.4.1', th.muted);
      // ship hull and bays
      const sx = Math.round(shipX);
      b.text(sx, wy, '\\' + '_'.repeat(hullW - 2) + '/', th.ink);
      b.text(sx + 1, wy + 1, '\\' + '~'.repeat(hullW - 4) + '/', th.dim);
      b.text(sx, deck, '|' + '='.repeat(hullW - 2) + '|', th.muted);
      b.text(sx + hullW - 6, deck - 3, '|__', th.muted); b.text(sx + hullW - 6, deck - 2, '|[]|', th.muted); b.text(sx + hullW - 6, deck - 1, '|__|', th.muted);
      const placed = loadedShip ? Math.min(n, k + (within >= 0.84 ? 1 : 0)) : 0;
      for (let i = 0; i < placed; i++) {
        const tier = Math.floor(i / cols), c = i % cols, landAt = i * MOVE + 0.84 * MOVE;
        const ready = tau >= 18.5 || tau - landAt >= 1;   // readiness lags the landing by a second
        b.text(sx - shipX0 + slotX(c), slotY(tier), '[web]', ready ? th.pos : th.info);
      }
      // the crane: legs, boom, trolley, cable, spreader (and its load)
      for (let y = boomY + 1; y < deck; y++) { b.set(legL, y, '|', th.warn); b.set(legR, y, '|', th.warn); if ((y - boomY) % 2 === 0) b.text(legL + 1, y, '\\' + ' '.repeat(Math.max(0, legR - legL - 3)) + '/', mix(th.warn, th.bg, 0.4)); }
      b.text(0, boomY, '='.repeat(Math.min(W - 1, qx + hullW + 6)), th.warn);           // boom, with backreach over the quay stack
      let tx = stackX + 2, hookY = boomY + 2, carry = false, sway = 0;
      if (tau < lastLand) {
        const [ph, u] = craneTimeline(within);
        const target = k, tier = Math.floor(target / cols), c = target % cols;
        const bayX = slotX(c) + 2, stackTop = deck - 1 - Math.min(2, Math.floor(Math.max(0, n - k - 1) / stackCols));
        const fromX = k === 0 ? stackX + 2 : slotX((k - 1) % cols) + 2;
        if (ph === 0) tx = fromX + (stackX + 2 - fromX) * ease(u);
        else if (ph === 3) tx = stackX + 2 + (bayX - stackX - 2) * ease(u);
        else tx = ph < 3 ? stackX + 2 : bayX;
        hookY = ph === 1 ? boomY + 2 + (stackTop - boomY - 2) * ease(u) : ph === 2 ? stackTop - (stackTop - boomY - 2) * ease(u)
          : ph === 4 ? boomY + 2 + (slotY(tier) - boomY - 2) * ease(u) : ph === 5 ? slotY(tier) : ph === 6 ? slotY(tier) - (slotY(tier) - boomY - 2) * ease(u) : boomY + 2;
        carry = ph >= 2 && ph <= 4;
        sway = ph === 4 ? Math.round(Math.sin(u * 9) * (1 - u)) : 0;
      }
      const TX = Math.round(tx), HY = Math.round(hookY);
      b.text(TX - 1, boomY + 1, '[#]', th.warn);
      for (let y = boomY + 2; y < HY; y++) b.set(TX + 1 + (y === HY - 1 ? sway : 0), y, '|', th.muted);
      if (carry) b.text(TX - 1 + sway, HY, '[web]', th.info);
      else b.text(TX + sway, HY, '|=|', th.muted);
      const ready = tau >= 21 ? 0 : tau >= 18.5 ? n : Array.from({ length: n }, (_, i) => tau - (i * MOVE + 0.84 * MOVE) >= 1).filter(Boolean).length;
      const full = `Waiting for deployment "web" rollout to finish: ${ready} of ${n} updated replicas are available...`;
      const short = `deployment "web": ${ready} of ${n} updated replicas are available...`;
      const msg = ready >= n ? 'deployment "web" successfully rolled out' : full.length <= W ? full : short.length <= W ? short : `rollout "web": ${ready}/${n} replicas available`;
      b.text(0, H - 1, msg.slice(0, W), ready >= n ? th.pos : th.ink);   // one status line under the scene
    };
  },
};

// ── marquee chase lights ─────────────────────────────────────────────────────
const marquee = {
  ...shared,
  id: 'ascii-chase-lights',
  since: '0.3.0',
  title: 'Marquee Chase Lights',
  tags: ['marquee', 'chase lights', 'bulbs', 'theater', 'sign', 'please wait'],
  order: 370,
  kind: 'spinner',
  loop: 12,
  size: { w: 64, h: 14 },
  minSize: { w: 32, h: 7 },
  description: 'A theater marquee around PLEASE WAIT: two rings of bulbs run a chase, a theater chase, an alternate flash and a fill-sweep, with an all-on flash between.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const ring = (x0, y0, w, h) => {                      // bulb positions clockwise from the top-left
      const out = [];
      for (let x = x0; x < x0 + w; x += 2) out.push([x, y0]);
      for (let y = y0 + 1; y < y0 + h - 1; y++) out.push([x0 + w - 1 - ((w - 1) % 2), y]);
      for (let x = x0 + w - 1 - ((w - 1) % 2); x >= x0; x -= 2) out.push([x, y0 + h - 1]);
      for (let y = y0 + h - 2; y > y0; y--) out.push([x0, y]);
      return out;
    };
    const double = W >= 48 && H >= 12;
    const rings = [ring(0, 0, W, H)];
    if (double) rings.push(ring(3, 2, W - 6, H - 4));
    const burnt = new Set(['0:5', '0:17']), flick = '1:9';
    const on = mix(th.warn, th.bg, 0.8);
    const words = ['P L E A S E', 'W A I T'];
    return (t) => {
      const b = ctx.buffer;
      const tau = phase(t, 12), pat = Math.floor(tau / 3), local = tau % 3, s = Math.floor(local * 9);
      const flash = local > 2.75;                         // all on between patterns
      rings.forEach((pts, r) => {
        const N = pts.length, dir = r ? -1 : 1;
        pts.forEach(([x, y], i0) => {
          const i = dir > 0 ? i0 : N - 1 - i0;
          let lit = flash || [((i - s) % 6 + 6) % 6 === 0, (i + s) % 3 === 0, (i + Math.floor(s / 2)) % 2 === 0, i < ((s * 3) % (N + 6))][pat];
          const id = `${r}:${i0}`;
          if (burnt.has(id)) lit = false;
          if (id === flick && hash(Math.floor(tau * 9), 41) < 0.5) lit = false;
          b.set(x, y, lit ? 'o' : '.', lit ? th.warn : on);
        });
      });
      // the sign
      const mid = Math.floor(H / 2);
      if (double) {
        const bx = 6, bw = W - 12;
        box(b, bx, mid - 2, bw, 5, th.muted);
        words.forEach((w, i) => b.text(Math.floor((W - w.length) / 2), mid - 1 + i * 2, w, th.ink, undefined, 1));
      } else {
        const msg = 'PLEASE WAIT';
        b.text(Math.floor((W - msg.length) / 2), mid, msg, th.ink, undefined, 1);
      }
    };
  },
};

export default [defrag, fileCopy, crane, marquee];
