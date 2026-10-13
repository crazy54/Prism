// A 3×3×3 twisty cube that scrambles itself and then solves itself: twelve
// random quarter turns, then the same turns undone in reverse — eased, with a
// pause between moves, while the whole cube slowly orbits. 27 cubies with real
// orientation matrices, black plastic bodies and inset stickers, z-buffered
// and lit.
import { zbuffer, tri, perspective, rotX, rotY, rotZ, mul, apply, norm, blend } from './_raster.js';
import { easing } from '../../easing.js';

const FACE_COLORS = {
  '1,0,0': 0xd7263d, '-1,0,0': 0xf77f00, '0,-1,0': 0xf1f1ec, '0,1,0': 0xffd100, '0,0,-1': 0x1fa64a, '0,0,1': 0x1e5bd8,
};
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const ROT = [rotX, rotY, rotZ];

export default {
  title: 'Twisty Cube',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['puzzle cube', 'twisty puzzle', 'cube', '3d', 'scramble'],
  order: 30,
  description: 'A 3×3×3 puzzle cube that scrambles itself with twelve eased quarter turns, then solves itself in reverse.',
  size: { w: 56, h: 24 },
  minSize: { w: 18, h: 8 },
  loop: 13.2,
  canvas: 'field',
  palette: 'prism',
  params: { moves: { default: 12, min: 4, max: 30, label: 'Scramble length' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const nMoves = Math.round(ctx.param('moves', 12));
    const project = perspective(cv, { distance: 7.5, fill: 0.15 });
    const light = norm([-0.35, -0.6, -0.75]);
    const body = blend(0x0b0c0f, ctx.theme.panel, 0.25);
    // Scramble: random turns (never the same axis twice running), then undone.
    const scramble = [];
    let lastAxis = -1;
    for (let i = 0; i < nMoves; i++) {
      let axis;
      do axis = Math.floor(ctx.rng() * 3); while (axis === lastAxis);
      lastAxis = axis;
      scramble.push({ axis, layer: Math.floor(ctx.rng() * 3) - 1, dir: ctx.rng() < 0.5 ? 1 : -1 });
    }
    const moves = [...scramble, ...scramble.slice().reverse().map((m) => ({ ...m, dir: -m.dir }))];
    const DUR = 0.55, TURN = 0.42;
    const period = moves.length * DUR;

    const fresh = () => {
      const out = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let zz = -1; zz <= 1; zz++) {
        const stickers = DIRS.filter((d) => (d[0] && d[0] === x) || (d[1] && d[1] === y) || (d[2] && d[2] === zz)).map((d) => ({ d, c: FACE_COLORS[d.join(',')] }));
        out.push({ pos: [x, y, zz], M: [1, 0, 0, 0, 1, 0, 0, 0, 1], stickers });
      }
      return out;
    };
    const turn = (cubies, m, ang) => {
      const R = ROT[m.axis](ang);
      for (const c of cubies) {
        if (Math.round(c.pos[m.axis]) !== m.layer) continue;
        c.pos = apply(R, c.pos).map(Math.round);
        c.M = mul(R, c.M);
      }
    };

    // Square on the face with outward normal d, half-size h, pushed out to `out`.
    const faceSquare = (d, h, out) => {
      const u = [0, 0, 0], v = [0, 0, 0];
      const axes = [0, 1, 2].filter((k) => !d[k]); // the two in-plane axes
      u[axes[0]] = h; v[axes[1]] = h;
      const c = d.map((x) => x * out);
      return [[c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]], [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]], [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]], [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]]];
    };

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const tl = ((t % period) + period) % period;
      const k = Math.floor(tl / DUR);
      const phase = (tl - k * DUR) / TURN;
      const cubies = fresh();
      for (let i = 0; i < k; i++) turn(cubies, moves[i], (Math.PI / 2) * moves[i].dir);
      const cur = moves[k];
      const ang = phase < 1 ? easing.inOutCubic(phase) * (Math.PI / 2) * cur.dir : 0;
      const view = mul(rotX(0.5 + Math.sin(t * 0.3) * 0.08), rotY(t * 0.35 + 0.65));
      const spin = ROT[cur.axis](ang);
      for (const c of cubies) {
        const moving = phase < 1 && Math.round(c.pos[cur.axis]) === cur.layer;
        const base = moving ? mul(view, spin) : view;
        // world = base · (T + M · p)
        const R = mul(base, c.M);
        const off = apply(base, c.pos.map((x) => x * 1.02));
        const proj = (p) => { const q = apply(R, p); return project([q[0] + off[0], q[1] + off[1], q[2] + off[2]]); };
        for (const d of DIRS) {
          const corners = faceSquare(d, 0.49, 0.49);
          const wn = norm(apply(R, d));
          const i = 0.12 + 0.6 * Math.max(0, wn[0] * light[0] + wn[1] * light[1] + wn[2] * light[2]);
          const P = corners.map(proj);
          const col = blend(0x000000, body, Math.min(1, i + 0.25));
          tri(cv, z, P[0], P[1], P[2], 0, 0, 0, () => col);
          tri(cv, z, P[0], P[2], P[3], 0, 0, 0, () => col);
        }
        for (const s of c.stickers) {
          const corners = faceSquare(s.d, 0.4, 0.5);
          const wn = norm(apply(R, s.d));
          const i = 0.38 + 0.72 * Math.max(0, wn[0] * light[0] + wn[1] * light[1] + wn[2] * light[2]);
          const P = corners.map((p) => { const q = proj(p); q[2] -= 0.004; return q; });
          const col = blend(0x000000, s.c, Math.min(1, i));
          tri(cv, z, P[0], P[1], P[2], 0, 0, 0, () => col);
          tri(cv, z, P[0], P[2], P[3], 0, 0, 0, () => col);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
