// Minimal 3D toolkit for wireframes and shaded meshes: vectors as [x,y,z]
// arrays, rotation, perspective projection onto a Canvas, and a few meshes.

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/** Rotate a point by Euler angles (radians) in X → Y → Z order. */
export function rotate([x, y, z], ax = 0, ay = 0, az = 0) {
  let c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/**
 * Build a projector for a canvas: maps world [x,y,z] (camera at z = -distance,
 * looking +z) to canvas pixels, aspect-corrected, scaled so a unit radius
 * spans `fill` of the canvas' shorter visual side. Returns [px, py, depth].
 */
export function projector(canvas, { distance = 3.2, fov = 1, fill = 0.42, cx, cy } = {}) {
  const w = canvas.width, h = canvas.height;
  const ox = cx ?? w / 2, oy = cy ?? h / 2;
  const visualH = h * canvas.aspect; // height measured in horizontal-pixel units
  const s = Math.min(w, visualH) * fill * distance * fov;
  return ([x, y, z]) => {
    const d = z + distance;
    const k = d > 0.05 ? s / d : s / 0.05;
    return [ox + x * k, oy + (y * k) / canvas.aspect, d];
  };
}

function uniqueEdges(faces) {
  const seen = new Set(), edges = [];
  for (const f of faces)
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(k)) { seen.add(k); edges.push([a, b]); }
    }
  return edges;
}

function mesh(vertices, faces) {
  return { vertices, faces, edges: uniqueEdges(faces) };
}

export const meshes = {
  cube() {
    const v = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * 0.8, y * 0.8, z * 0.8]);
    return mesh(v, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]);
  },
  tetrahedron() {
    const v = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((p) => p.map((c) => c * 0.75));
    return mesh(v, [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]);
  },
  octahedron() {
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    return mesh(v, [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]);
  },
  icosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map((p) => v3.norm(p));
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return mesh(v, f);
  },
  /** Torus with major radius R, minor r, segment counts. */
  torus(R = 0.7, r = 0.3, seg = 24, sides = 12) {
    const v = [], f = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      for (let j = 0; j < sides; j++) {
        const b = (j / sides) * Math.PI * 2;
        v.push([(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)]);
      }
    }
    for (let i = 0; i < seg; i++)
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j, b = ((i + 1) % seg) * sides + j;
        const c = ((i + 1) % seg) * sides + ((j + 1) % sides), d = i * sides + ((j + 1) % sides);
        f.push([a, b, c, d]);
      }
    return mesh(v, f);
  },
  /** UV sphere. */
  sphere(lat = 10, lon = 16) {
    const v = [], f = [];
    for (let i = 0; i <= lat; i++) {
      const th = (i / lat) * Math.PI;
      for (let j = 0; j < lon; j++) {
        const ph = (j / lon) * Math.PI * 2;
        v.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]);
      }
    }
    for (let i = 0; i < lat; i++)
      for (let j = 0; j < lon; j++) {
        const a = i * lon + j, b = (i + 1) * lon + j, c = (i + 1) * lon + ((j + 1) % lon), d = i * lon + ((j + 1) % lon);
        f.push([a, b, c, d]);
      }
    return mesh(v, f);
  },
};
