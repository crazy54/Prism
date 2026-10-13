// An hourglass in a turned-wood stand. The sand is conserved: each frame the
// top level and the bottom heap are solved (by bisection over the glass's real
// profile) so the two always hold exactly the sand there is. The top drains
// with a funnel dip, a flickering grain stream falls through the neck, the heap
// below grows as a cone, and when the top runs dry the glass turns over — eased,
// shrinking to fit as it turns — while the sand slides back against the neck.
import { blend } from './_raster.js';
import { easing, smoothstep } from '../../easing.js';
import { NONE } from '../../color.js';

const FLIP = 1.4;
const NS = 72; // integration rows per bulb

export default {
  title: 'Hourglass',
  gallery: 'objects',
  category: 'Mechanical',
  kind: 'scene',
  tags: ['hourglass', 'sand', 'timer', 'waiting', 'time'],
  order: 30,
  description: 'Sand drains through the neck into a growing heap, volume conserved; when the top runs dry the glass flips over.',
  size: { w: 30, h: 22 },
  minSize: { w: 12, h: 9 },
  loop: 9.4,
  canvas: 'field',
  palette: 'gold',
  params: { duration: { default: 8, min: 2, max: 60, label: 'Seconds per run' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const run = ctx.param('duration', 8);
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    const CAP = 1.12, FRAME = 1.18;
    const hh = Math.max(2, Math.min((H * asp * 0.5 - 0.5) / CAP, (W * 0.5 - 1) / (0.56 * FRAME)));
    const hw = hh * 0.56;
    const cx = W / 2, cy = H / 2;
    const glass = blend(th.muted, 0x9cc8f0, 0.5);
    const sand = (k) => blend(0x6b4a12, 0xf2c75c, k);
    const hash = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1009) / 1009;
    // Glass half-width (px) at normalized height y ∈ [-1, 1]; 0 is the neck.
    const prof = (y) => {
      const a = Math.min(1, Math.abs(y));
      return hw * (0.07 + 0.93 * Math.pow(Math.sin(a * Math.PI * 0.5), 1.3)) * (a > 0.9 ? 1 - (a - 0.9) * 3 : 1);
    };
    const rows = Array.from({ length: NS }, (_, i) => (i + 0.5) / NS);
    const bulbArea = rows.reduce((s, y) => s + 2 * prof(y), 0) / NS;
    const SAND = bulbArea * 0.8;
    const solve = (f, target, lo, hi) => { for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; };
    // Top bulb, resting on the neck: sand where y > -S + D·g(x), g a centered bump (the funnel).
    const DIPW = 0.32 * hw;
    const topWidth = (y, S, D) => {
      const p = prof(y), q = D > 0 ? (y + S) / D : y + S > 0 ? 2 : -1;
      if (q <= 0) return 0;
      if (q >= 1) return 2 * p;
      return 2 * Math.max(0, p - DIPW * Math.sqrt(-Math.log(q)));
    };
    const topArea = (S, D) => rows.reduce((s, y) => s + topWidth(-y, S, D), 0) / NS;
    // Bottom heap: sand where y > L - K(1 - |x|/hw) — a cone whose base meets the walls.
    const heapWidth = (y, L, K) => {
      const p = prof(y);
      if (y >= L) return 2 * p;
      return 2 * Math.min(p, Math.max(0, hw * (1 - (L - y) / K)));
    };
    const heapArea = (L, K) => rows.reduce((s, y) => s + heapWidth(y, L, K), 0) / NS;
    const S_FULL = solve((S) => topArea(S, 0), SAND, 0, 1);
    const coneK = (fallen) => 0.34 * (1 - 0.55 * fallen);
    const L_FULL = solve((L) => -heapArea(L, coneK(1)), -SAND, 0, 1 + coneK(1));

    return (t) => {
      cv.clear();
      const cycle = run + FLIP;
      const k = ((t % cycle) + cycle) % cycle;
      const flipping = k > run;
      const fill = flipping ? 0 : 1 - k / run; // share of the sand still on top
      const fp = flipping ? (k - run) / FLIP : 0;
      const rot = easing.inOutCubic(fp) * Math.PI;
      // While upright: solve the top level and the heap so their areas add up.
      const D = 0.24 * Math.sqrt(1 - fill) * Math.min(1, fill * 5);
      const S = fill > 0 ? solve((s) => topArea(s, D), fill * SAND, 0, 1 + D) : 0;
      const K = coneK(1 - fill);
      const L = fill < 1 ? solve((l) => -heapArea(l, K), -(1 - fill) * SAND, 0, 1 + K) : 1 + K;
      // During the flip the heap slides back down onto the neck (local y → 0).
      const slide = flipping ? smoothstep(0.45, 0.95, fp) : 0;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const halfW = hw * FRAME + 0.6, halfH = hh * CAP;
      const sc = Math.min(1, (W / 2 - 0.5) / (Math.abs(cr) * halfW + Math.abs(sr) * halfH), (H * asp / 2 - 0.5) / (Math.abs(sr) * halfW + Math.abs(cr) * halfH));
      const flick = Math.floor(t * 24);
      const streamW = Math.max(0.55, hw * 0.04);
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const dx = (px + 0.5 - cx) / sc, dy = ((py + 0.5 - cy) * asp) / sc;
        const lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr;
        const y = ly / hh, ay = Math.abs(y), ax = Math.abs(lx);
        if (ay > CAP || ax > halfW) continue;
        // Turned-wood end caps and the two pillars.
        if (ay > 1) {
          if (ax > hw * FRAME) continue;
          const grain = 0.08 * Math.sin(lx * 1.7 + hash(px >> 2, py) * 2);
          cv.set(px, py, blend(0x2e1c0e, 0x9a6a3a, 0.35 + 0.45 * (1 - (ay - 1) / (CAP - 1)) + grain));
          continue;
        }
        const pillarR = Math.max(0.6, hw * 0.05) * (1 + 0.6 * Math.pow(Math.abs(Math.sin(y * Math.PI * 1.5)), 4));
        const pd = Math.abs(ax - hw * 1.08);
        if (pd < pillarR) { cv.set(px, py, blend(0x2e1c0e, 0x9a6a3a, 0.75 - 0.4 * (pd / pillarR) * Math.sign(lx))); continue; }
        const w = prof(y);
        const edgeD = ax - w;
        if (edgeD > 0.9) continue;
        let c = NONE;
        if (edgeD < 0.4) {
          if (flipping) {
            // The full bulb is local y > 0: heap at rest → slab against the neck.
            if (y > 0) {
              const heap = L_FULL - coneK(1) * Math.max(0, 1 - ax / hw);
              const lo = heap + (0 - heap) * slide, hi = 1 + (S_FULL - 1) * slide;
              if (y > lo && y < hi) c = sand(0.5 + hash(px, py) * 0.4);
            }
          } else if (y < 0) {
            const surf = -S + D * Math.exp(-((lx / DIPW) ** 2));
            if (fill > 0 && y > surf) c = sand(0.55 + hash(px, py) * 0.4 - Math.min(0.15, (y - surf) * 0.3));
          } else {
            const surf = L - K * Math.max(0, 1 - ax / hw);
            if (fill < 1 && y > surf) c = sand(0.5 + hash(px, py) * 0.4 - Math.min(0.15, (y - surf) * 0.25));
            else if (fill > 0 && ax < streamW && hash(px, py + flick) > 0.22) c = sand(0.8 + hash(px + 7, py + flick) * 0.2);
          }
        }
        // Glass: a faint tint inside, an anti-aliased wall, and a highlight streak.
        const wall = Math.max(0, 1 - Math.abs(edgeD) / 0.9);
        const base = c === NONE ? blend(th.bg, glass, 0.07) : c;
        let out = wall > 0 ? blend(base, glass, 0.75 * wall) : base;
        if (ay > 0.25 && ay < 0.86 && lx < -w * 0.42 && lx > -w * 0.66) out = blend(out, 0xffffff, c === NONE ? 0.12 : 0.22);
        cv.set(px, py, out);
      }
      cv.paint(ctx.buffer);
    };
  },
};
