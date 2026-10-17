// A DNA double helix spinning about its axis while the whole molecule slowly
// yaws and rolls in perspective. Backbones, base-pair rungs (A–T / G–C colored
// halves) and nucleotide beads are depth-sorted and shaded front-to-back, so
// the near strand reads in front of the far one even at braille resolution.
import { rotate, projector } from '../../math3d.js';
import { mix, NONE } from '../../color.js';
import { fadeMark } from '../../palettes.js';

export default {
  title: 'DNA Helix',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['dna', 'helix', 'biology', '3d'],
  order: 40,
  description: 'Rotating double helix in perspective — depth-sorted, shaded backbones, A–T/G–C base-pair rungs and drifting motes.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect } = cv;
    const th = ctx.theme;
    const rand = ctx.rng;
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const fill = 0.42;
    const unit = Math.min(W, H * aspect) * fill;
    const L = Math.max(1, (W / 2 / unit) * 0.92);
    const R = Math.min(0.55, (H * aspect) / unit / 2 * 0.62);
    const turns = Math.max(1.5, (L * 2) / 1.35);
    const kx = (turns * Math.PI * 2) / (2 * L);
    const proj = projector(cv, { distance: 3.4, fill });
    const BASES = [[th.pos, th.neg], [th.neg, th.pos], [th.warn, th.info], [th.info, th.warn]];
    const NR = Math.round(turns * 10);
    const pairs = Array.from({ length: NR }, () => BASES[Math.floor(rand() * 4)]);
    const NS = Math.max(60, Math.round(W * 0.9));
    const bg = ctx.bg === NONE ? 0 : ctx.bg;
    const motes = Array.from({ length: Math.round(W * H * 0.0006) + 8 }, () => ({ x: rand() * W, y: rand() * H, v: 0.5 + rand(), p: rand() * 6.28 }));

    const shade = (c, k) => (bg === ctx.bg ? fadeMark(th, c, k) : mix(bg, c, k));
    return (t, dt) => {
      const spin = t * 0.9 * speed;
      const ay = 0.3 * Math.sin(t * 0.21), az = 0.16 * Math.sin(t * 0.13 + 1), ax = 0.25 * Math.sin(t * 0.17);
      const P = (x, phase) => {
        const a = x * kx + spin + phase;
        const p = rotate([x, R * Math.cos(a), R * Math.sin(a)], ax, ay, az);
        return proj(p);
      };
      const segs = [];
      for (let s = 0; s < 2; s++) {
        let prev = P(-L, s * Math.PI);
        for (let i = 1; i <= NS; i++) {
          const x = -L + (2 * L * i) / NS;
          const cur = P(x, s * Math.PI);
          const u = i / NS;
          segs.push({ a: prev, b: cur, d: (prev[2] + cur[2]) / 2, c: pal(u * 0.45 + s * 0.5 + t * 0.02), w: 1 });
          prev = cur;
        }
      }
      for (let i = 0; i < NR; i++) {
        const x = -L + (2 * L * (i + 0.5)) / NR;
        const a = P(x, 0), b = P(x, Math.PI);
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        segs.push({ a, b: m, d: (a[2] + m[2]) / 2, c: pairs[i][0], w: 0 });
        segs.push({ a: m, b, d: (m[2] + b[2]) / 2, c: pairs[i][1], w: 0 });
        segs.push({ bead: a, d: a[2] - 0.01, c: pal(((i + 0.5) / NR) * 0.45 + t * 0.02) });
        segs.push({ bead: b, d: b[2] - 0.01, c: pal(((i + 0.5) / NR) * 0.45 + 0.5 + t * 0.02) });
      }
      let dmin = Infinity, dmax = -Infinity;
      for (const s of segs) { if (s.d < dmin) dmin = s.d; if (s.d > dmax) dmax = s.d; }
      const span = dmax - dmin || 1;
      segs.sort((p, q) => q.d - p.d);

      cv.clear();
      for (const m of motes) {
        m.y -= m.v * dt * H * 0.03;
        if (m.y < 0) { m.y += H; m.x = rand() * W; }
        cv.set(m.x + Math.sin(t * 0.5 + m.p) * 3, m.y, shade(th.muted, 0.35 + 0.25 * Math.sin(t + m.p)));
      }
      for (const s of segs) {
        const near = 1 - (s.d - dmin) / span;
        const k = 0.28 + 0.72 * near * near;
        if (s.bead) {
          const r = (1 + near * 1.6) * (cv.sx / 2);
          cv.ellipse(s.bead[0], s.bead[1], r, r / aspect, shade(s.c, Math.min(1, k + 0.15)), true);
        } else {
          cv.line(s.a[0], s.a[1], s.b[0], s.b[1], shade(s.c, Math.min(1, s.w ? k : k * 1.1)));
          // Thicken the near half of the backbones.
          if (s.w && near > 0.55) cv.line(s.a[0], s.a[1] + 1, s.b[0], s.b[1] + 1, shade(s.c, k * 0.8));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
