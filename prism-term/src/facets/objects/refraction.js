// Refraction — the Prism principle, drawn as a hero. A hairline of white light
// rises out of the dark, strikes the left face of a glass prism (apex up), runs
// level through the glass and leaves the far face as a fanned spectrum that
// lands on a little wavelength screen. Physically true order: violet bends most,
// so it leaves at the bottom of the fan; red bends least and stays on top.
// Shaded per pixel in physical units, so the geometry holds in every canvas mode
// (sextant, quad, half, braille and plain ASCII). A packet of light runs along
// beam and fan every 3 s, and the fan breathes; both loop seamlessly in 12 s.
import { ATTR } from '../../buffer.js';
import { gradient, luminance } from '../../color.js';
import { SPECTRUM as REFRACTION } from '../../palettes.js';
import { blend } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };
// distance from p to segment ab, and the position along it (0..1)
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const u = clamp01(((px - ax) * vx + (py - ay) * vy) / l2);
  const dx = px - ax - vx * u, dy = py - ay - vy * u;
  return [Math.sqrt(dx * dx + dy * dy), u];
}
const add = (o, c, k) => {
  const r = Math.min(255, ((o >> 16) & 255) + ((c >> 16) & 255) * k), g = Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255) * k), b = Math.min(255, (o & 255) + (c & 255) * k);
  return (r << 16) | (g << 8) | (b | 0);
};

export default {
  title: 'Refraction',
  gallery: 'objects',
  category: 'Icons & Logos',
  kind: 'art',
  tags: ['prism', 'refraction', 'spectrum', 'light', 'beam', 'dispersion', 'hero', 'glass', 'wavelength'],
  order: 4,
  description: 'White light in, every color out: a beam strikes a glass prism and fans into a true-order spectrum (violet bends most) on a wavelength screen.',
  size: { w: 96, h: 28 },
  minSize: { w: 32, h: 10 },
  loop: 12,
  canvas: 'hires',
  palette: 'prism',
  params: { labels: { default: 'on', options: ['on', 'off'], label: 'Instrument labels' } },
  setup(ctx) {
    const th = ctx.theme, cols = ctx.width, rows = ctx.height;
    const uni = ctx.caps?.unicode !== false;
    const labels = ctx.param('labels', 'on') !== 'off' && cols >= 56 && rows >= 14;
    const caption = labels && rows >= 18 && cols >= 64;
    const cv = ctx.canvas();
    const sx = cv.width / cols, sy = cv.height / rows;       // pixels per cell
    const W = cols, Hp = rows * 2;                             // physical units: one cell = 1 × 2
    const dark = luminance(th.bg) < 0.5;
    const ground = th.bg;
    // Rose (least bent) on top → violet (most bent) at the bottom, in the vivid tier (light, not pastel).
    const fan = gradient(REFRACTION.map((st) => (dark ? st.nightVivid : st.dayVivid)).reverse());
    const beamInk = dark ? 0xffffff : blend(th.accent, th.ink, 0.35);
    const edgeLit = dark ? 0xf1ecff : 0x5b3ea8, edgeDim = dark ? 0x8f97c4 : blend(0x5b3ea8, th.bg, 0.45);
    const glassTint = dark ? 0xb9c6ff : 0x7353bb;

    // ── geometry (physical units) ──
    const room = caption ? 2 : 0;                              // keep the caption row clear
    const h = Math.min((Hp - room) * 0.74, W * 0.44), s = (2 * h) / Math.sqrt(3);
    const yA = (Hp - room) * 0.11, yB = yA + h;
    const xc = W * (labels ? 0.42 : 0.44);
    const Ax = xc, Ay = yA, Bx = xc - s / 2, By = yB, Cx = xc + s / 2, Cy = yB;
    const depth = 0.56;                                       // where the level ray crosses the faces
    const Ex = Ax + (Bx - Ax) * depth, Ey = Ay + (By - Ay) * depth;
    const Xx = Ax + (Cx - Ax) * depth, Xy = Ey;
    const rise = Math.tan(0.16);                               // the beam climbs into the face
    const y0 = Ey + Ex * rise;
    const Lb = Math.hypot(Ex, y0 - Ey);
    const screen = labels ? W - 6.5 : W + 4;                   // the wavelength screen (off-canvas when unlabeled)
    const Lf = Math.max(1, screen - Xx);
    const inside = (x, y) => {                                 // apex-up triangle test
      if (y < Ay || y > By) return false;
      const half = ((y - Ay) / h) * (s / 2);
      return x >= xc - half && x <= xc + half;
    };

    // ── labels (cells) ──
    const lab = [];
    const lamText = (t) => (uni ? t : t.replace(/λ ?/g, '').replace(/·/g, '-').replace(/–/g, '-'));
    const rowOf = (y) => Math.max(0, Math.min(rows - 1, Math.floor(y / 2)));

    return (t) => {
      cv.clear();
      // breathing (seamless over the 12 s loop) and the light packet (every 3 s)
      const b1 = Math.sin((t / 12) * TAU), b2 = Math.sin((t / 6) * TAU + 1.3);
      const th0 = 0.065 + 0.012 * b1, th1 = 0.5 + 0.03 * b2; // red (top) … violet (bottom), radians below level
      const P = 3, u = (t % P) / P, total = Lb + Lf * 1.25, pkt = u * (total + 18) - 9;
      const packet = (l) => Math.exp(-Math.pow((l - pkt) / 5.5, 2));
      const sheenX = xc + (s / 2) * Math.sin((t / 12) * TAU) * 0.8;
      const arrive = packet(Lb);                               // the packet hits the face
      lab.length = 0;

      for (let j = 0; j < cv.height; j++) {
        const Y = ((j + 0.5) / sy) * 2;
        for (let i = 0; i < cv.width; i++) {
          const X = (i + 0.5) / sx;
          let c = ground, lit = false;
          const inGlass = inside(X, Y);

          // spectrum fan, from the exit face to the screen
          if (X > Xx && X <= screen + 0.6 && !inGlass) {
            const dx = X - Xx, dy = Y - Xy, dist = Math.hypot(dx, dy);
            const a = Math.atan2(dy, dx);
            const aa = Math.max(0.012, 0.5 / Math.max(1, dist));
            const e = Math.min(smooth(th0 - aa, th0 + aa, a), 1 - smooth(th1 - aa, th1 + aa, a));
            if (e > 0.01) {
              const f = clamp01((a - th0) / (th1 - th0));
              const band = 0.5 + 0.5 * Math.cos(f * 7 * TAU - Math.PI);   // seven soft cores, like the web art
              const glow = Math.exp(-Math.pow((f - 0.5) / 0.75, 2));
              const near = smooth(0, 1.6, dist), far = 0.82 + 0.18 * Math.exp(-dist / (W * 0.45));
              const k = e * near * far * (0.72 + 0.16 * band) * glow * (1 + 0.5 * packet(Lb + dist));
              const col = fan(f);
              if (X >= screen - 0.4) c = dark ? add(blend(c, col, 0.85), col, 0.25) : blend(c, col, 0.95); // the screen catches it
              else c = dark ? add(blend(c, col, Math.min(1, k * 0.8)), col, k * 0.22) : blend(c, col, Math.min(1, k * 0.9));
              lit = true;
            }
          }

          // the glass: a faint tint, lighter at the apex, with a sheen sweeping across
          if (inGlass) {
            const v = (Y - Ay) / h;
            const sheen = Math.max(0, 1 - Math.abs((X - sheenX) / (s * 0.12))) * 0.1;
            c = blend(c, glassTint, (dark ? 0.085 - v * 0.035 : 0.08 - v * 0.03) + sheen * (dark ? 1 : 0.5));
            // the light runs level through the glass (it is already splitting)
            const [dIn, uIn] = seg(X, Y, Ex, Ey, Xx, Xy);
            if (dark) c = add(c, 0xa99cff, 0.11 * Math.exp(-(dIn * dIn) / 9));   // lit from inside
            if (dIn < 1.6) {
              const k = Math.exp(-(dIn * dIn) / 0.12) * (0.55 + 0.45 * packet(Lb + uIn * (Xx - Ex)));
              c = dark ? add(c, 0xffffff, k * 0.6) : blend(c, beamInk, k * 0.55);
            }
            lit = true;
          }

          // incoming beam: core + bloom, emerging out of the dark on the left
          if (X <= Ex + 0.4) {
            const yl = y0 - X * rise, d = Math.abs(Y - yl) * Math.cos(0.16);
            if (d < 3.2) {
              const l = X / Math.cos(0.16);
              const k = (Math.exp(-(d * d) / 0.07) + 0.28 * Math.exp(-(d * d) / 1.4)) * (0.25 + 0.75 * smooth(0, Lb * 0.7, l)) * (1 + 0.85 * packet(l));
              c = dark ? add(c, 0xf4f2ff, Math.min(1.2, k)) : blend(c, beamInk, Math.min(1, k * 0.85));
              lit = true;
            }
          }

          // edges: the lit left face crisp, the far ones softer, the base a hairline
          if (X > Bx - 1 && X < Cx + 1 && Y > Ay - 1 && Y < By + 1) {
            const [d1] = seg(X, Y, Ax, Ay, Bx, By), [d2] = seg(X, Y, Ax, Ay, Cx, Cy), [d3] = seg(X, Y, Bx, By, Cx, Cy);
            const line = (d, w) => clamp01(1 - (d - w) / 0.38);
            const k1 = line(d1, 0.2), k2 = line(d2, 0.16) * 0.8, k3 = line(d3, 0.14) * 0.6;
            if (k1 > 0.01) { c = blend(c, edgeLit, k1); lit = true; }
            if (k2 > 0.01) { c = blend(c, blend(edgeDim, edgeLit, 0.55), k2); lit = true; }
            if (k3 > 0.01) { c = blend(c, edgeDim, k3); lit = true; }
          }

          // glints: the impact, the exit and the apex
          const near3 = Math.abs(X - xc) < s * 0.62 && Y < By + 3;
          if (!near3) { /* no glints out here */ } else if (dark) {
            const gi = Math.hypot(X - Ex, (Y - Ey) * 0.9), gx = Math.hypot(X - Xx, Y - Xy), ga = Math.hypot(X - Ax, (Y - Ay) * 1.2);
            const k = 0.85 * Math.exp(-(gi * gi) / (2.2 + 2.5 * arrive)) * (0.6 + 0.6 * arrive) + 0.35 * Math.exp(-(gx * gx) / 1.6) + 0.5 * Math.exp(-(ga * ga) / 0.5);
            if (k > 0.02) { c = add(c, 0xe9e4ff, k); lit = true; }
          } else {
            const gi = Math.hypot(X - Ex, Y - Ey);
            const k = 0.35 * Math.exp(-(gi * gi) / 2.4) * (0.6 + 0.6 * arrive);
            if (k > 0.02) { c = blend(c, beamInk, k); lit = true; }
          }

          if (lit) cv.set(i, j, c);
        }
      }
      cv.paint(ctx.buffer);

      if (labels) {
        const ink = th.muted, faint = th.dim;
        // WHITE LIGHT IN — under the beam's tail
        const inRow = Math.min(rows - 1 - (caption ? 1 : 0), rowOf(y0 - 2 * rise) + 1);
        const faceX = xc - ((Math.min(By, inRow * 2 + 2) - Ay) / h) * (s / 2);   // the left face at that row
        if (1 + 14 + 1 < faceX) ctx.buffer.text(1, inRow, 'WHITE LIGHT IN', faint, undefined, 0);
        // the screen's scale, red on top: 700 … 400 nm
        for (const [nm, f] of [[700, 0], [600, 1 / 3], [500, 2 / 3], [400, 1]]) {
          const a = th0 + f * (th1 - th0), y = Xy + Math.tan(a) * (screen - Xx);
          const r = rowOf(y);
          if (r < rows - (caption ? 1 : 0)) ctx.buffer.text(W - 4, r, String(nm), f === 0 || f === 1 ? ink : faint, undefined, 0);
        }
        // EVERY COLOR OUT — above the top ray, right-aligned against the screen
        const topY = Xy + Math.tan(th0) * (screen - Xx);
        const outRow = rowOf(topY) - 2;
        const word = 'EVERY COLOR OUT';
        if (outRow >= 0) ctx.buffer.text(Math.floor(screen) - word.length - 1, outRow, word, th.accent, undefined, ATTR.BOLD);
        if (caption) {
          const capText = lamText('FIG. 001 · THE PRISM PRINCIPLE · λ 380–700 NM');
          const x0 = Math.max(0, Math.round(xc - capText.length / 2));
          ctx.buffer.text(x0, rows - 1, capText, faint, undefined, 0);
        }
      }
    };
  },
};
