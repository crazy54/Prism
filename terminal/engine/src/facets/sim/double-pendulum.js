// Sensitive dependence, made visible: three double pendulums released from
// starting angles a thousandth of a radian apart, integrated with RK4 at
// 480 Hz. For a few seconds they move as one; then the trails split and they
// go their own chaotic ways. Each run restarts from the same three starts.
import { mix } from '../../color.js';
import { fadeMark } from '../../palettes.js';

const RUN = 20, HZ = 480, G = 9.81;
const TRAIL = 260; // trail samples kept per pendulum (recorded at 60 Hz)

function deriv(s) {
  const [t1, w1, t2, w2] = s;
  const d = t1 - t2, den = 3 - Math.cos(2 * d); // m1 = m2 = 1, L1 = L2 = 1
  const a1 = (-G * 3 * Math.sin(t1) - G * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * (w2 * w2 + w1 * w1 * Math.cos(d))) / den;
  const a2 = (2 * Math.sin(d) * (w1 * w1 * 2 + G * 2 * Math.cos(t1) + w2 * w2 * Math.cos(d))) / den;
  return [w1, a1, w2, a2];
}
function rk4(s, h) {
  const k1 = deriv(s);
  const k2 = deriv(s.map((v, i) => v + (h / 2) * k1[i]));
  const k3 = deriv(s.map((v, i) => v + (h / 2) * k2[i]));
  const k4 = deriv(s.map((v, i) => v + h * k3[i]));
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export default {
  title: 'Double Pendulum',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['pendulum', 'chaos', 'rk4', 'butterfly effect', 'trails', 'braille'],
  order: 20,
  description: 'Three double pendulums started a thousandth of a radian apart — together at first, then chaos splits their trails.',
  size: { w: 48, h: 24 },
  minSize: { w: 16, h: 8 },
  loop: RUN,
  canvas: 'line',
  palette: 'prism',
  params: { pendulums: { default: 3, min: 1, max: 6, label: 'Pendulums' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    const pal = ctx.palette();
    const count = Math.round(ctx.param('pendulums', 3));
    const L = Math.min(W / 2, (H * asp) / 2) * 0.47; // arm length in pixels
    const ox = W / 2, oy = (H * asp) / 2;
    const cols = Array.from({ length: count }, (_, i) => mix(pal(i / count), th.ink, 0.15));
    const fresh = () => Array.from({ length: count }, (_, i) => ({ s: [2.3 + i * 0.001, 0, 2.6, 0], trail: [] }));
    let ps = fresh(), run = 0, acc = 0, rec = 0;
    const tip = (s) => {
      const x1 = ox + Math.sin(s[0]) * L, y1 = oy + Math.cos(s[0]) * L;
      return [x1, y1, x1 + Math.sin(s[2]) * L, y1 + Math.cos(s[2]) * L];
    };

    return (t, dt) => {
      const r = Math.floor(t / RUN);
      if (r !== run) { run = r; ps = fresh(); acc = 0; }
      acc += Math.min(0.25, Math.max(0, dt)) * HZ;
      for (; acc >= 1; acc--) {
        for (const p of ps) p.s = rk4(p.s, 1 / HZ);
        if (++rec % (HZ / 60) === 0) for (const p of ps) { p.trail.push(tip(p.s).slice(2)); if (p.trail.length > TRAIL) p.trail.shift(); }
      }
      cv.clear();
      // Trails, oldest (faintest) first; later pendulums drawn over earlier ones.
      ps.forEach((p, k) => {
        const tr = p.trail;
        for (let i = 1; i < tr.length; i++) {
          const f = i / tr.length;
          cv.line(tr[i - 1][0], tr[i - 1][1] / asp, tr[i][0], tr[i][1] / asp, fadeMark(th, cols[k], 0.2 + 0.8 * Math.pow(f, 1.4)));
        }
      });
      // Arms and bobs.
      ps.forEach((p, k) => {
        const [x1, y1, x2, y2] = tip(p.s);
        cv.line(ox, oy / asp, x1, y1 / asp, th.muted);
        cv.line(x1, y1 / asp, x2, y2 / asp, th.muted);
        cv.circle(x1, y1 / asp, Math.max(1, L * 0.06), th.ink, true);
        cv.circle(x2, y2 / asp, Math.max(1, L * 0.08), cols[k], true);
      });
      cv.circle(ox, oy / asp, Math.max(1, L * 0.04), th.ink, true);
      cv.paint(ctx.buffer);
    };
  },
};
