// A gold coin spinning on its edge, ray-cast per pixel with 2×2 supersampling:
// an exact cylinder (two faces and a reeded rim), embossed relief on both faces
// (a prism mark on heads, a star on tails) bump-mapped from a height field, and
// metal shading from a studio environment — so the faces flash as they sweep
// past the softbox. A soft shadow below breathes with the coin's silhouette.
import { NONE } from '../../color.js';
import { blend, rotX, rotY, mul } from './_raster.js';

const LOOP = 6;
const THICK = 0.085;

// Signed distance to an equilateral triangle (point up) of "radius" r.
function triSD(x, y, r) {
  const k = Math.sqrt(3);
  x = Math.abs(x) - r; y = y + r / k;
  if (x + k * y > 0) { const nx = (x - k * y) / 2, ny = (-k * x - y) / 2; x = nx; y = ny; }
  x -= Math.min(Math.max(x, -2 * r), 0);
  return -Math.hypot(x, y) * Math.sign(y);
}
// Signed distance to a five-pointed star.
function starSD(x, y, r, rf) {
  const k1 = [0.809016994375, -0.587785252292], k2 = [-k1[0], k1[1]];
  x = Math.abs(x);
  let d = 2 * Math.max(k1[0] * x + k1[1] * y, 0); x -= d * k1[0]; y -= d * k1[1];
  d = 2 * Math.max(k2[0] * x + k2[1] * y, 0); x -= d * k2[0]; y -= d * k2[1];
  x = Math.abs(x); y -= r;
  const ba = [rf * -k1[1] - 0, rf * k1[0] - 1];
  const h = Math.min(Math.max((x * ba[0] + y * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1]), 0), r);
  return Math.hypot(x - ba[0] * h, y - ba[1] * h) * Math.sign(y * ba[0] - x * ba[1]);
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Relief height (0…1) at face coordinates (u, v), unit radius.
function relief(u, v, heads) {
  const r = Math.hypot(u, v);
  let h = ss(0.9, 0.86, r) * ss(0.78, 0.82, r) * 0.9; // raised rim ring
  for (let i = 0; i < 16; i++) { // beads inside the rim
    const a = (i / 16) * Math.PI * 2, dx = u - Math.cos(a) * 0.71, dy = v - Math.sin(a) * 0.71;
    h = Math.max(h, ss(0.05, 0.02, Math.hypot(dx, dy)) * 0.7);
  }
  const d = heads ? triSD(u, -v - 0.06, 0.42) : starSD(u, -v, 0.48, 0.45);
  h = Math.max(h, ss(0.03, -0.03, d) * (heads ? 0.8 + 0.2 * ss(-0.02, -0.25, d) : 0.9));
  if (heads) h -= ss(-0.12, -0.15, d) * 0.45 * ss(-0.3, -0.27, d); // inset facet line
  return h;
}

// The relief is baked once into height + gradient textures (shared by every
// instance), so a face hit costs a lookup rather than three field evaluations.
const TEX = 128;
let baked = null;
function bake() {
  if (baked) return baked;
  baked = [true, false].map((heads) => {
    const h = new Float32Array(TEX * TEX), gx = new Float32Array(TEX * TEX), gy = new Float32Array(TEX * TEX);
    for (let j = 0; j < TEX; j++) for (let i = 0; i < TEX; i++) h[j * TEX + i] = relief(((i + 0.5) / TEX) * 2 - 1, ((j + 0.5) / TEX) * 2 - 1, heads);
    const step = 2 / TEX;
    for (let j = 0; j < TEX; j++) for (let i = 0; i < TEX; i++) {
      const at = (a, b) => h[Math.min(TEX - 1, Math.max(0, b)) * TEX + Math.min(TEX - 1, Math.max(0, a))];
      gx[j * TEX + i] = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      gy[j * TEX + i] = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
    }
    return { h, gx, gy };
  });
  return baked;
}

export default {
  title: 'Spinning Coin',
  gallery: 'objects',
  category: 'Icons & Logos',
  kind: 'scene',
  tags: ['coin', 'gold', 'money', 'spin', 'metal', 'raycast'],
  order: 30,
  description: 'A ray-cast gold coin spinning on edge: embossed faces, a reeded rim, studio reflections and a soft shadow.',
  size: { w: 40, h: 20 },
  minSize: { w: 12, h: 6 },
  loop: LOOP,
  canvas: 'field',
  palette: 'gold',
  params: { speed: { default: 1, min: 0.2, max: 4, label: 'Spin speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const speed = ctx.param('speed', 1);
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    const S = Math.min(W * 0.46, H * asp * 0.4); // coin radius in pixels
    const cx = W / 2, cy = H * 0.45;
    const gold = 0xe0a82a, deep = 0x5a3a08, rimGold = 0xc58a1a;
    const tex = bake();

    // Studio environment seen in a reflection direction (y down = toward the floor).
    const env = (rx, ry, rz) => {
      const sky = 0.5 - ry * 0.45; // bright above, dark below
      const box = Math.pow(Math.max(0, -rx * 0.62 - ry * 0.3 - rz * 0.72), 14) * 1.5; // softbox upper-left-front
      const strip = Math.pow(Math.max(0, rx * 0.85 - rz * 0.5), 24) * 0.9; // rim light from the right
      return sky + box + strip;
    };
    // Shade with a slightly perspective view ray through (x, y) so flat faces
    // still carry a gradient across them, as a real lens would see.
    const metal = (base, nx, ny, nz, x, y) => {
      const vl = Math.hypot(x * 0.35, y * 0.35, 1), vx = (x * 0.35) / vl, vy = (y * 0.35) / vl, vz = 1 / vl;
      const dn = vx * nx + vy * ny + vz * nz;
      const e = env(vx - 2 * dn * nx, vy - 2 * dn * ny, vz - 2 * dn * nz);
      const c = blend(deep, base, Math.min(1, 0.25 + e * 0.75));
      return e > 1 ? blend(c, 0xfff6d6, Math.min(1, (e - 1) * 0.8)) : c;
    };

    // Per-frame rotation (view → coin is Mᵀ), read by trace() for every ray.
    let M = [1, 0, 0, 0, 1, 0, 0, 0, 1], dx = 0, dy = 0, dz = 1, interior = false;
    const inner = Math.pow(Math.max(0, 1 - 1.6 / S), 2);
    // Trace one orthographic ray through (x, y) in coin-radius units → color or
    // NONE. Sets `interior` when the hit is flat face well inside the rim, where a
    // single sample is enough (silhouette, rim and relief edges get 2×2 supersampling).
    const trace = (x, y) => {
      interior = false;
      const o0 = M[0] * x + M[3] * y - M[6] * 4, o1 = M[1] * x + M[4] * y - M[7] * 4, o2 = M[2] * x + M[5] * y - M[8] * 4;
      let best = Infinity, col = NONE;
      // Faces at z = ±THICK.
      if (dz > 1e-6 || dz < -1e-6) for (let side = -1; side <= 1; side += 2) {
        const s = (side * THICK - o2) / dz;
        const u = o0 + s * dx, v = o1 + s * dy, r2 = u * u + v * v;
        if (s >= best || r2 > 1) continue;
        const heads = side < 0;
        const tx = heads ? u : -u; // tails reads correctly from its own side
        const ti = Math.min(TEX - 1, ((tx + 1) * 0.5 * TEX) | 0) + Math.min(TEX - 1, ((v + 1) * 0.5 * TEX) | 0) * TEX;
        const T = heads ? tex[0] : tex[1];
        const gx = T.gx[ti] * 0.06, gy = T.gy[ti] * 0.06;
        // Bumped normal in coin space, then to view space (M ·).
        const cx0 = heads ? -gx : gx, cy0 = -gy, cz0 = side;
        let nx = M[0] * cx0 + M[1] * cy0 + M[2] * cz0, ny = M[3] * cx0 + M[4] * cy0 + M[5] * cz0, nz = M[6] * cx0 + M[7] * cy0 + M[8] * cz0;
        const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
        best = s; col = metal(blend(gold, 0xffe9a0, T.h[ti] * 0.35), nx, ny, nz, x, y);
        interior = r2 < inner && gx * gx + gy * gy < 0.02; // flat face, not a relief edge
      }
      // Reeded rim: x² + y² = 1 with |z| ≤ THICK.
      const A = dx * dx + dy * dy;
      if (A > 1e-9) {
        const B = 2 * (o0 * dx + o1 * dy), C = o0 * o0 + o1 * o1 - 1, D = B * B - 4 * A * C;
        if (D >= 0) {
          const s = (-B - Math.sqrt(D)) / (2 * A), zz = o2 + s * dz;
          if (s < best && Math.abs(zz) <= THICK) {
            const phi = Math.atan2(o1 + s * dy, o0 + s * dx), a = phi + Math.sin(phi * 90) * 0.05;
            const c0 = Math.cos(a), c1 = Math.sin(a);
            col = metal(rimGold, M[0] * c0 + M[1] * c1, M[3] * c0 + M[4] * c1, M[6] * c0 + M[7] * c1, x, y);
            interior = false;
          }
        }
      }
      return col;
    };

    return (t) => {
      cv.clear();
      const spin = (t / LOOP) * Math.PI * 2 * 2 * speed;
      const tilt = 0.12 + Math.sin(t * 1.1) * 0.05;
      const cs = Math.cos(spin);
      M = mul(rotX(tilt), rotY(spin));
      dx = M[6]; dy = M[7]; dz = M[8]; // the view ray (0, 0, 1) in coin space
      // Shadow on the floor: an ellipse as wide as the coin's silhouette.
      const silW = Math.max(Math.abs(cs), THICK * 1.5), sy0 = cy + (S * 1.18) / asp;
      const shW = S * (0.25 + 0.75 * silW), shH = Math.max(1, (S * 0.13) / asp);
      for (let py = Math.floor(sy0 - shH * 2); py <= Math.ceil(sy0 + shH * 2); py++) for (let px = Math.floor(cx - shW * 1.5); px <= Math.ceil(cx + shW * 1.5); px++) {
        const q = ((px + 0.5 - cx) / shW) ** 2 + ((py + 0.5 - sy0) / shH) ** 2;
        if (q < 2.2 && px >= 0 && py >= 0 && px < W && py < H) cv.set(px, py, blend(th.bg, 0x000000, 0.5 * Math.exp(-q * 1.6)));
      }
      // Only scan the coin's actual silhouette width this frame.
      const halfW = S * Math.min(1, Math.abs(cs) + THICK * 2 + 0.04) + 2;
      const bx0 = Math.max(0, Math.floor(cx - halfW)), bx1 = Math.min(W - 1, Math.ceil(cx + halfW));
      const by0 = Math.max(0, Math.floor(cy - S / asp - 2)), by1 = Math.min(H - 1, Math.ceil(cy + S / asp + 2));
      const px = cv.px, invS = 1 / S;
      for (let py = by0; py <= by1; py++) {
        const yc = (py + 0.5 - cy) * asp * invS, y0 = (py + 0.25 - cy) * asp * invS, y1 = (py + 0.75 - cy) * asp * invS;
        for (let pxi = bx0; pxi <= bx1; pxi++) {
          const xc = (pxi + 0.5 - cx) * invS;
          if (xc * xc + yc * yc > 1.1) continue;
          const i = py * W + pxi;
          const c = trace(xc, yc);
          if (c !== NONE && interior) { px[i] = c; continue; }
          // Near an edge: 2×2 supersample and blend coverage over what's below.
          let r = 0, g = 0, b = 0, hits = 0;
          for (let k = 0; k < 4; k++) {
            const sc = trace((pxi + (k & 1 ? 0.75 : 0.25) - cx) * invS, k & 2 ? y1 : y0);
            if (sc === NONE) continue;
            r += (sc >> 16) & 255; g += (sc >> 8) & 255; b += sc & 255; hits++;
          }
          if (!hits) continue;
          const avg = ((r / hits) << 16) | ((g / hits) << 8) | ((b / hits) | 0);
          px[i] = hits === 4 ? avg : blend(px[i] === NONE ? th.bg : px[i], avg, hits / 4);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
