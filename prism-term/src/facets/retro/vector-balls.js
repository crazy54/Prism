// Vector balls: 64 shaded spheres arranged in 3D, morphing cube → sphere →
// torus → helix while the formation tumbles. Painter's-sorted, Phong-lit,
// sized by perspective — the Amiga demo effect that made people buy Amigas.
import { lerpc } from './_kit.js';
import { rotate } from '../../math3d.js';
import { easing } from '../../easing.js';

const N = 64;
function shapes() {
  const cube = [], sphere = [], torus = [], helix = [];
  for (let i = 0; i < N; i++) {
    cube.push([(i % 4) / 1.5 - 1, (Math.floor(i / 4) % 4) / 1.5 - 1, Math.floor(i / 16) / 1.5 - 1]);
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    sphere.push([Math.cos(th) * r * 1.15, y * 1.15, Math.sin(th) * r * 1.15]);
    const a = (i % 16) / 16 * Math.PI * 2, b = Math.floor(i / 16) / 4 * Math.PI * 2;
    torus.push([(1 + 0.42 * Math.cos(b)) * Math.cos(a), 0.42 * Math.sin(b), (1 + 0.42 * Math.cos(b)) * Math.sin(a)]);
    const k = i / N, s = i % 2 ? Math.PI : 0;
    helix.push([Math.cos(k * Math.PI * 6 + s) * 0.7, k * 2.4 - 1.2, Math.sin(k * Math.PI * 6 + s) * 0.7]);
  }
  return [cube, sphere, torus, helix];
}

export default {
  title: 'Vector Balls',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['vector balls', 'amiga', '3d', 'morph', 'demoscene', 'spheres'],
  order: 40,
  description: '64 Phong-lit spheres morphing cube → sphere → torus → helix while the formation tumbles in 3D.',
  size: { w: 70, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: 16,
  canvas: 'field',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const forms = shapes();
    const VH = H * aspect, S = Math.min(W, VH) * 0.36, D = 4;
    const ballR = Math.max(1.2, Math.min(W, VH) * 0.045);
    const L = [-0.45, -0.6, 0.66];
    const bg0 = ctx.theme.bg, bg1 = lerpc(ctx.theme.bg, pal(0.7), 0.15);
    const colors = Array.from({ length: N }, (_, i) => pal(i / N));
    return (t) => {
      const tt = t * speed;
      for (let y = 0; y < H; y++) px.fill(lerpc(bg0, bg1, y / H), y * W, (y + 1) * W);
      const seg = (tt / 4) % forms.length, i0 = Math.floor(seg), k = easing.inOutCubic(Math.min(1, (seg - i0) * 1.6));
      const A = forms[i0], B = forms[(i0 + 1) % forms.length];
      const pts = [];
      for (let i = 0; i < N; i++) {
        const p = [A[i][0] + (B[i][0] - A[i][0]) * k, A[i][1] + (B[i][1] - A[i][1]) * k, A[i][2] + (B[i][2] - A[i][2]) * k];
        const [x, y, z] = rotate(p, tt * 0.7, tt * 0.9, tt * 0.31);
        const zz = z + D;
        pts.push({ x: W / 2 + (x * S * D) / zz, y: (VH / 2 + (y * S * D) / zz) / aspect, r: (ballR * D) / zz, z: zz, c: colors[i] });
      }
      pts.sort((a, b) => b.z - a.z);
      for (const b of pts) {
        const ry = b.r / aspect;
        for (let y = Math.floor(b.y - ry); y <= Math.ceil(b.y + ry); y++) {
          if (y < 0 || y >= H) continue;
          for (let x = Math.floor(b.x - b.r); x <= Math.ceil(b.x + b.r); x++) {
            if (x < 0 || x >= W) continue;
            const nx = (x + 0.5 - b.x) / b.r, ny = ((y + 0.5) - b.y) * aspect / b.r;
            const r2 = nx * nx + ny * ny;
            if (r2 > 1) continue;
            const nz = Math.sqrt(1 - r2);
            const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
            const spec = Math.pow(Math.max(0, 2 * diff * nz - L[2]), 18);
            const fog = Math.min(1, (b.z - D + 1.3) / 2.6);
            let c = lerpc(0x000000, b.c, 0.18 + 0.82 * diff);
            c = lerpc(c, 0xffffff, spec * 0.9);
            px[y * W + x] = lerpc(c, bg0, fog * 0.45);
          }
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
