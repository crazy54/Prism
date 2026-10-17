// The figure-eight three-body choreography (Chenciner & Montgomery, 2000):
// three equal masses chasing each other round one figure-eight, integrated
// with velocity Verlet. A ring of massless dust starts in orbit around the
// trio and gets slung about chaotically by it — some captured, some flung
// clear — so the stable dance and the chaos sit side by side.
import { mix } from '../../color.js';
import { fadeMark } from '../../palettes.js';

const H_STEP = 0.0025, RATE = 1; // integrator step (sim units), sim seconds per second
const RUN = 30, DUST = 14;
const FIG8 = [
  [-0.97000436, 0.24308753, 0.466203685, 0.43236573],
  [0.97000436, -0.24308753, 0.466203685, 0.43236573],
  [0, 0, -0.93240737, -0.86473146],
];

export default {
  title: 'N-Body Orbits',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['n-body', 'gravity', 'orbits', 'three-body', 'figure eight', 'chaos', 'braille'],
  order: 30,
  description: 'The figure-eight three-body choreography, with a ring of dust that the dancing trio flings about chaotically.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: RUN,
  canvas: 'line',
  palette: 'prism',
  params: { dust: { default: DUST, min: 0, max: 40, label: 'Dust particles' } },
  setup(ctx) {
    const label = ctx.height >= 12;
    const cv = ctx.canvas('line', { rows: label ? ctx.height - 1 : ctx.height });
    const W = cv.width, Hc = cv.height, asp = cv.aspect, th = ctx.theme, rand = ctx.rng;
    const pal = ctx.palette();
    const nDust = Math.round(ctx.param('dust', DUST));
    const scale = Math.min((W / 2) / 1.6, ((Hc * asp) / 2) / 0.85);
    const cx = W / 2, cy = (Hc * asp) / 2;
    const bodyCol = [pal(0), pal(0.36), pal(0.66)];
    const dustCol = mix(th.muted, th.ink, 0.3);
    let B, D, all, run = -1, acc = 0;
    const trails = [[], [], []];
    const reset = () => {
      B = FIG8.map(([x, y, vx, vy]) => ({ x, y, vx, vy, ax: 0, ay: 0 }));
      D = Array.from({ length: nDust }, (_, i) => {
        const a = (i / Math.max(1, nDust)) * Math.PI * 2 + rand() * 0.2, r = 1.35 + rand() * 0.45, v = Math.sqrt(3 / r) * (0.92 + rand() * 0.1);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: -Math.sin(a) * v, vy: Math.cos(a) * v, ax: 0, ay: 0, tr: [] };
      });
      all = [...B, ...D];
      for (const tr of trails) tr.length = 0;
      accel();
    };
    const accel = () => {
      for (const p of B) { p.ax = 0; p.ay = 0; }
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const a = B[i], b = B[j], dx = b.x - a.x, dy = b.y - a.y, r2 = dx * dx + dy * dy + 1e-6, f = 1 / (r2 * Math.sqrt(r2));
        a.ax += dx * f; a.ay += dy * f; b.ax -= dx * f; b.ay -= dy * f;
      }
      for (const p of D) {
        p.ax = 0; p.ay = 0;
        for (const b of B) { const dx = b.x - p.x, dy = b.y - p.y, r2 = dx * dx + dy * dy + 0.004, f = 1 / (r2 * Math.sqrt(r2)); p.ax += dx * f; p.ay += dy * f; }
      }
    };
    const step = (h) => {
      for (const p of all) { p.vx += p.ax * h * 0.5; p.vy += p.ay * h * 0.5; p.x += p.vx * h; p.y += p.vy * h; }
      accel();
      for (const p of all) { p.vx += p.ax * h * 0.5; p.vy += p.ay * h * 0.5; }
    };
    const P = (x, y) => [cx + x * scale, (cy + y * scale) / asp];
    let rec = 0;

    return (t, dt) => {
      const r = Math.floor(t / RUN);
      if (r !== run) { run = r; reset(); acc = 0; }
      acc += Math.min(0.25, Math.max(0, dt)) * RATE / H_STEP;
      for (; acc >= 1; acc--) {
        step(H_STEP);
        if (++rec % 8 === 0) {
          B.forEach((b, i) => { trails[i].push([b.x, b.y]); if (trails[i].length > 120) trails[i].shift(); });
          for (const d of D) { d.tr.push([d.x, d.y]); if (d.tr.length > 40) d.tr.shift(); }
        }
      }
      cv.clear();
      for (const d of D) {
        for (let i = 1; i < d.tr.length; i++) {
          const [x0, y0] = P(...d.tr[i - 1]), [x1, y1] = P(...d.tr[i]);
          if (Math.abs(x1 - x0) < W / 3) cv.line(x0, y0, x1, y1, fadeMark(th, dustCol, 0.15 + 0.5 * (i / d.tr.length)));
        }
        const [x, y] = P(d.x, d.y);
        cv.set(x, y, dustCol);
      }
      trails.forEach((tr, k) => {
        for (let i = 1; i < tr.length; i++) {
          const [x0, y0] = P(...tr[i - 1]), [x1, y1] = P(...tr[i]);
          cv.line(x0, y0, x1, y1, fadeMark(th, bodyCol[k], 0.2 + 0.8 * (i / tr.length)));
        }
      });
      B.forEach((b, k) => { const [x, y] = P(b.x, b.y); cv.circle(x, y, Math.max(1.2, scale * 0.09), bodyCol[k], true); });
      cv.paint(ctx.buffer);
      if (label) ctx.buffer.text(1, ctx.height - 1, 'figure-eight choreography · 3 equal masses'.slice(0, ctx.width - 2), th.muted);
    };
  },
};
