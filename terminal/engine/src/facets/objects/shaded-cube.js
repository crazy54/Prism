// The first thing anyone writes in software 3D: a spinning cube — here done
// with a z-buffer, Lambert + Blinn-Phong lighting, six palette-tinted faces,
// a gentle bob, and a soft contact shadow that breathes with the height.
import { meshes } from '../../math3d.js';
import { zbuffer, drawMesh, perspective, shadow, rotX, rotY, mul, apply, norm, blend } from './_raster.js';

export default {
  title: 'Shaded Cube',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['cube', '3d', 'lighting', 'z-buffer', 'phong'],
  order: 5,
  description: 'A z-buffered cube with Lambert and Blinn-Phong lighting, palette-tinted faces and a soft contact shadow.',
  size: { w: 60, h: 22 },
  minSize: { w: 18, h: 7 },
  loop: 12,
  canvas: 'field',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const speed = ctx.param('speed', 1);
    const pal = ctx.palette();
    // One hue per axis (the cube's faces come in ±x, ±y, ±z pairs), so the three
    // faces in view are always three clearly different colors.
    const faceColors = [0, 0.06, 0.34, 0.4, 0.64, 0.7].map((f) => blend(pal(f), ctx.theme.ink, 0.1));
    const mesh = meshes.cube();
    const dist = 4.2;
    const project = perspective(cv, { distance: dist, fill: 0.25, cy: cv.height * 0.44 });
    const light = norm([-0.55, -0.75, -0.55]);
    const camera = [0, 0, -dist];
    // Rotation taking the body diagonal (1,1,1) onto the vertical axis (Rodrigues).
    const CORNER = (() => {
      const d = norm([1, 1, 1]), up = [0, -1, 0];
      const ax = norm([d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]);
      const ang = Math.acos(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]);
      const c = Math.cos(ang), s = Math.sin(ang), C = 1 - c, [x, y, zz] = ax;
      return [c + x * x * C, x * y * C - zz * s, x * zz * C + y * s, y * x * C + zz * s, c + y * y * C, y * zz * C - x * s, zz * x * C - y * s, zz * y * C + x * s, c + zz * zz * C];
    })();
    return (t) => {
      const tt = t * speed;
      cv.clear();
      z.fill(Infinity);
      const bob = Math.sin(tt * 1.3) * 0.12;
      // Stood on a vertex (body diagonal vertical) and spun about it, viewed from a
      // little above: three faces are always in view, never a flat face-on frame.
      // Keep the camera low: from ~35° above you would be looking straight at a top face.
      const M = mul(rotX(0.14 + Math.sin(tt * 0.5) * 0.08), mul(rotY(tt * 0.8), CORNER));
      const floorY = project([0, 1.45, 0])[1];
      const k = 1 - bob * 1.8;
      shadow(cv, cv.width / 2, floorY, Math.min(cv.width, cv.height * cv.aspect) * 0.3 * k, Math.max(1.2, (Math.min(cv.width, cv.height * cv.aspect) * 0.07 * k) / cv.aspect), 0.6, ctx.theme.bg);
      const P = drawMesh(cv, z, mesh, {
        transform: (p) => { const q = apply(M, p); return [q[0], q[1] + bob, q[2]]; },
        project, light, camera, specular: 0.5, shininess: 30, ambient: 0.42,
        shade: (i, fi) => {
          const c = faceColors[fi];
          if (i <= 1) return blend(0x000000, c, Math.max(0, i));
          return blend(c, 0xffffff, Math.min(1, i - 1));
        },
      });
      // Bevel highlights on the edges that are actually visible (depth-tested).
      for (const [i, j] of mesh.edges) {
        const a = P[i], c = P[j];
        const n = Math.ceil(Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]))) * 2 + 1;
        for (let s2 = 0; s2 <= n; s2++) {
          const f = s2 / n;
          const x = Math.floor(a[0] + (c[0] - a[0]) * f), y = Math.floor(a[1] + (c[1] - a[1]) * f);
          if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
          const k = y * cv.width + x;
          if (a[2] + (c[2] - a[2]) * f > z[k] + 0.06) continue;
          cv.px[k] = blend(cv.px[k] < 0 ? ctx.theme.bg : cv.px[k], 0xffffff, 0.32);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
