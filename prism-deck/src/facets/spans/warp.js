// span-warp — the device is a viewport on a starship. Stars stream out of a vanishing
// point in the middle of the deck: a calm cruise, then the drive spools up, the streaks
// stretch, the light splits into the Spectrum at their tails and — jump — a white flash,
// before the stars ease back to a cruise. Every streak is as long as the distance its star
// travels between frames, so motion reads continuous even at the 1–4 fps a whole-wall
// span gets from the device budget.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, strokeP, fillP, backdrop, isFlat, lit, f1, rectD } from './_d6-wall.js';

const LOOP = 20;
// speed through the loop: cruise · spool · jump · ease back (continuous, and equal at both ends)
const speed = (s) => 1 + 3 * smoothstep(11, 14.6, s) + 9 * smoothstep(14.2, 15.2, s) * (1 - smoothstep(15.6, 17.4, s)) - 3 * smoothstep(15.4, 19.6, s);
const N_INT = 400;
const CUM = (() => { const a = new Float64Array(N_INT + 1); for (let i = 1; i <= N_INT; i++) a[i] = a[i - 1] + speed(((i - 0.5) / N_INT) * LOOP) * (LOOP / N_INT); return a; })();
/** Distance travelled by time s, normalized so one loop is a whole number of passes (seamless). */
const PASSES = 4;
const dist = (s) => {
  const lap = Math.floor(s / LOOP), q = ((s % LOOP) + LOOP) % LOOP, f = (q / LOOP) * N_INT, i = Math.floor(f);
  const v = CUM[i] + (CUM[Math.min(N_INT, i + 1)] - CUM[i]) * (f - i);
  return (lap + v / CUM[N_INT]) * PASSES;
};

export default {
  id: 'span-warp',
  title: 'Warp',
  category: 'Whole Device',
  description: 'Stars stream out of a vanishing point at the middle of the device: a calm cruise, the drive spools up, streaks split into the Spectrum, a white flash, then cruise again.',
  tags: ['warp', 'stars', 'space', 'hyperspace', 'starfield', 'sci-fi', 'speed', 'wall', 'ambient'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    stars: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Stars' },
    jump: { type: 'bool', default: true, label: 'Jump every 20 s' },
    budget: BUDGET,
  },
  order: 64,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t: tc, dt } = frameClock(ctx, { fps: 4, changing: cells.length, still: 5.6 });
    const t = tc + 8.4;                                        // the loop starts mid-cruise; the catalog still (6 s) catches the spool-up
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const tt = t;
    const D = (s) => (ctx.params.jump ? dist(s) : (s / LOOP) * PASSES);
    const space0 = dark ? mix(T.colors.bg, '#000000', 0.3) : T.colors.surface;
    const space1 = dark ? mix(T.colors.bg, T.spectral(270), flat ? 0 : 0.14) : mix(T.colors.surface, T.spectral(260), flat ? 0 : 0.1);
    const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
    backdrop(k, [[0, space1, 0.94], [1, space0, 0.94]], { radial: { cx, cy, r: R } });
    const ink = lit(T);
    const B = new Batch(grid);
    const N = Math.round(((w * h) / (K * K)) * 12 * ctx.params.stars);
    const f = Math.min(w, h) * 0.22;                           // focal length
    const v = ctx.params.jump ? speed(((tt % LOOP) + LOOP) % LOOP) : 1;   // no jump: a steady cruise
    const trail = Math.max(dt * 1.1, 0.12);                    // seconds of travel a streak shows
    const d0 = D(tt), d1 = D(tt - trail);
    const split = clamp((v - 2.2) / 6);                         // Spectrum at the tails while spooling / jumping
    for (let i = 0; i < N; i++) {
      // a star on a ring around the axis; depth z cycles 1 → 0 as the ship moves
      const a = hash(i, ctx.seed, 1) * Math.PI * 2, rr = 0.15 + 1.6 * Math.sqrt(hash(i, ctx.seed, 2));
      const sx = Math.cos(a) * rr, sy = Math.sin(a) * rr;
      const z = 1 - ((hash(i, ctx.seed, 3) + d0) % 1), zb = z + (d0 - d1);
      if (z < 0.02) continue;
      const px = cx + (sx / z) * f, py = cy + (sy / z) * f;
      let qx = cx + (sx / Math.min(1.5, zb)) * f, qy = cy + (sy / Math.min(1.5, zb)) * f;
      // cruising stars keep short tails; the streaks stretch only as the drive spools up
      const maxLen = K * (0.14 + 0.45 * (v - 1)), len = Math.hypot(px - qx, py - qy);
      if (len > maxLen) { qx = px + (qx - px) * (maxLen / len); qy = py + (qy - py) * (maxLen / len); }
      if ((px < -K && qx < -K) || (px > w + K && qx > w + K) || (py < -K && qy < -K) || (py > h + K && qy > h + K)) continue;
      const near = clamp(1 - z);
      const sw = Math.max(0.8, u * (0.5 + 1.8 * near * near));
      const op = clamp(0.25 + 0.75 * near);
      const bucket = op > 0.7 ? 1 : 0.5;
      if (split > 0.05 && !flat && near > 0.45) {
        // the tail splits: violet nearest the vanishing point, red outermost (refraction)
        const mx = (px + qx) / 2, my = (py + qy) / 2;
        B.seg(qx, qy, mx, my, sw, strokeP(T.spectral(290), sw, bucket * split), 1);
        B.seg(mx, my, px, py, sw, strokeP(T.spectral(200), sw, bucket * split), 1);
        B.seg(mx + (px - mx) * 0.6, my + (py - my) * 0.6, px, py, sw, strokeP(T.spectral(30), sw, bucket * split), 2);
      }
      B.seg(qx, qy, px, py, sw, strokeP(ink, sw, bucket * (1 - split * 0.5)), 3);
      if (near > 0.6) B.dot(px, py, sw * 0.9, fillP(dark ? '#ffffff' : ink, bucket), 4);
    }
    B.emit(k);
    // the vanishing point's glow, and the jump's flash
    const vp = k.id('vp');
    const glowC = dark ? '#ffffff' : T.spectral(260);
    const flash = ctx.params.jump ? smoothstep(14.9, 15.3, tt % LOOP) * (1 - smoothstep(15.3, 16.1, tt % LOOP)) : 0;
    k.def(radialGradient(vp, [[0, glowC, f1(Math.min(1, (dark ? 0.22 : 0.18) + 0.5 * flash))], [0.4, glowC, f1((dark ? 0.06 : 0.05) + 0.3 * flash)], [1, glowC, 0]], { cx: f1(cx), cy: f1(cy), r: f1(K * (1.1 + v * 0.12)), fx: f1(cx), fy: f1(cy), gradientUnits: 'userSpaceOnUse' }));
    for (const c of cells) if (Math.hypot(c.x + c.w / 2 - cx, c.y + c.h / 2 - cy) < K * (1.1 + v * 0.12) + c.w) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(vp)}"/>`);
    if (flash > 0.05) for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${dark ? '#ffffff' : T.colors.surface}" fill-opacity="${f1(flash * 0.7)}"/>`);
    return k.svg();
  },
};
