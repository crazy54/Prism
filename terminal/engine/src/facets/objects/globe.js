// Holographic data globe: a dotted Earth (coarse hand-traced continents on a
// lat/lon dot lattice) spinning in braille, with a graticule, atmosphere rim,
// pulsing region markers and great-circle arcs carrying packets between them.
const LAND = [
  // North America (outer), Hudson Bay (hole — even-odd)
  [[-166, 68], [-156, 71], [-140, 69.5], [-128, 70], [-110, 68], [-95, 68], [-82, 67], [-78, 72], [-64, 67], [-64, 60], [-56, 52], [-60, 46], [-70, 43], [-74, 40], [-76, 35], [-81, 31], [-80, 26], [-82, 29], [-85, 30], [-90, 29.5], [-97, 27], [-97, 22], [-95, 18.5], [-90, 21], [-87, 21], [-88, 16], [-83, 15], [-83, 10], [-79, 9], [-77, 8], [-80, 7], [-85, 10], [-92, 14], [-96, 16], [-105, 20], [-106, 23], [-112, 29], [-110, 23], [-117, 32], [-121, 35], [-124, 40], [-124, 46], [-123, 49], [-127, 51], [-133, 56], [-140, 60], [-150, 61], [-155, 58], [-165, 55], [-158, 58], [-166, 60], [-166, 64]],
  [[-95, 60], [-90, 57], [-82, 55], [-79, 52], [-80, 57], [-77, 60], [-78, 63], [-86, 64], [-94, 62]],
  // Greenland, Iceland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 72], [-25, 69], [-40, 65], [-44, 60], [-50, 62], [-53, 67], [-58, 75]],
  [[-24, 65.5], [-22, 66.5], [-15, 66.5], [-13.5, 65], [-18, 63.4], [-22, 63.8]],
  // South America
  [[-77, 8], [-72, 12], [-63, 10.5], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -15], [-40, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-69, -55], [-73, -53], [-75, -47], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -6], [-80, -2], [-78, 2]],
  // Eurasia (outer), Black Sea + Caspian (holes)
  [[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4.5, 48], [2, 51], [5, 53], [8, 54], [10, 57], [8, 58], [5, 62], [10, 64], [15, 68], [20, 70], [28, 71], [33, 69], [40, 67], [45, 68], [55, 69], [60, 70], [68, 73], [80, 73], [90, 76], [105, 78], [112, 74], [130, 72], [140, 72], [150, 71], [160, 70], [170, 70], [179, 66], [170, 60], [162, 58], [156, 51], [150, 59], [142, 59], [136, 54], [140, 48], [135, 43], [130, 42], [129, 35], [126, 34.5], [125, 39], [122, 40], [121, 37], [119, 35], [121, 31], [122, 29], [119, 25], [114, 22], [110, 21], [106, 20], [108, 16], [109, 12], [105, 9], [101, 13], [99, 10], [100, 6], [104, 1.5], [101, 3], [98, 8], [98, 15], [94, 16], [92, 21], [88, 22], [85, 20], [80, 16], [80, 10], [77, 8], [73, 16], [72, 21], [69, 22], [66, 25], [62, 25], [57, 26], [56, 24], [59, 22], [55, 17], [52, 16], [45, 13], [43, 13], [39, 21], [35, 28], [34, 31], [35, 32], [36, 35], [33, 36.5], [28, 37], [26, 40], [22, 37], [19, 42], [13.5, 45.5], [12, 44], [16, 38], [12, 42], [8, 44], [3, 43], [0, 39], [-2, 37], [-6, 36]],
  [[28, 41], [28, 46], [34, 46], [41, 42], [36, 41.5]],
  [[47, 45], [51, 47], [54, 44], [54, 37], [49, 37], [49, 41]],
  // Britain, Ireland, Japan
  [[-5, 50], [1.5, 51], [1.7, 53], [-0.5, 54], [-2, 56], [-2, 58], [-5, 58.5], [-6, 56], [-4.8, 54.8], [-3, 53.5], [-4.5, 52]],
  [[-10, 51.5], [-6, 52], [-6, 55], [-8, 55], [-10, 54]],
  [[130, 31], [132, 34], [135, 34], [140, 35], [142, 39], [141, 42], [145, 44], [141, 45.5], [140, 42], [139, 38], [136, 36], [132, 35]],
  // Africa, Madagascar
  [[-17, 21], [-16, 28], [-10, 30], [-6, 36], [0, 36], [10, 37], [11, 33], [20, 31], [25, 32], [32, 31], [34, 28], [39, 18], [43, 12], [51, 12], [45, 2], [40, -3], [40, -10], [40, -15], [35, -20], [35, -25], [32, -29], [27, -34], [20, -35], [18, -32], [15, -27], [12, -18], [13, -12], [12, -5], [9, -1], [9, 4], [5, 6], [-2, 5], [-8, 4.5], [-13, 8], [-17, 14]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // Maritime SE Asia, Australia, New Zealand
  [[95, 5.5], [98, 4], [104, -2], [106, -6], [102, -4], [97, 1]],
  [[109, 2], [111, -3], [116, -4], [119, 1], [117, 7], [115, 5]],
  [[105, -6], [114, -7], [114, -8.5], [106, -7.5]],
  [[131, -1], [141, -2.5], [148, -6], [150, -10], [143, -9], [138, -8], [133, -4]],
  [[114, -22], [114, -34], [118, -35], [124, -33], [130, -32], [135, -35], [138, -35], [140, -38], [146, -39], [150, -37], [153, -31], [153, -25], [146, -19], [145, -15], [142, -11], [141, -17], [136, -12], [132, -11], [129, -15], [125, -14], [122, -18]],
  [[172, -34], [178, -38], [175, -41.5], [172, -41]],
  [[173, -41], [174, -42], [171, -44], [168, -46.5], [166.5, -46], [170, -43]],
];

// Cloud-region-ish hubs (lon, lat) and the links that carry traffic.
const HUBS = [[-77.5, 39], [-122, 45.5], [-46.6, -23.5], [-0.1, 51.5], [8.7, 50.1], [72.9, 19.1], [103.8, 1.35], [139.7, 35.7], [151.2, -33.9], [28, -26.2]];
const LINKS = [[0, 3], [1, 7], [3, 4], [4, 5], [5, 6], [6, 7], [6, 8], [0, 2], [3, 9], [0, 1], [7, 8], [2, 9]];

function lerpHub(a, b, t) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | (bl | 0);
}

// Per-polygon bounding boxes: a point outside a box contributes an even number
// of ray crossings (or none), so the box test can skip it without changing parity.
const BOXES = LAND.map((poly) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [x, y] of poly) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  return [a, b, c, d];
});

function inLand(lon, lat) {
  if (lat < -68 + 3 * Math.sin((lon * Math.PI) / 60)) return true; // Antarctica
  let inside = false;
  for (let k = 0; k < LAND.length; k++) {
    const box = BOXES[k];
    if (lat < box[2] || lat > box[3] || lon > box[1] || lon < box[0]) continue;
    const poly = LAND[k];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Land lattices are pure functions of the dot spacing; cache them across resizes.
const latticeCache = new Map();
function landLattice(step) {
  const key = step.toFixed(2);
  if (latticeCache.has(key)) return latticeCache.get(key);
  const land = [];
  for (let lat = -88; lat <= 88; lat += step) {
    const ring = Math.max(1, Math.round((360 / step) * Math.cos((lat * Math.PI) / 180)));
    for (let k = 0; k < ring; k++) {
      const lon = -180 + (k / ring) * 360;
      if (inLand(lon, lat)) land.push(toVec(lon, lat));
    }
  }
  latticeCache.set(key, land);
  return land;
}

const toVec = (lon, lat) => {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180;
  return [Math.cos(b) * Math.sin(a), -Math.sin(b), -Math.cos(b) * Math.cos(a)];
};

export default {
  title: 'Data Globe',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['globe', 'earth', 'world', 'arcs', '3d'],
  order: 30,
  description: 'Holographic dotted Earth in braille — graticule, atmosphere, pulsing hubs and packet-carrying great-circle arcs.',
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas();
    const th = ctx.theme;
    const { width: W, height: H, aspect } = cv;
    const R = Math.min(W, H * aspect) * 0.42;
    const cx = W / 2, cy = H / 2;
    // Dot lattice spacing adapted to resolution: roughly one dot per 2 pixels at the equator.
    const step = Math.max(1.2, Math.min(4, 360 / (Math.PI * 2 * R) * 2.2));
    const land = landLattice(step);
    const grat = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 1.5) grat.push(toVec(lon, lat));
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -90; lat <= 90; lat += 1.5) grat.push(toVec(lon, lat));
    const hubs = HUBS.map(([lon, lat]) => toVec(lon, lat));
    const arcs = LINKS.map(([a, b], i) => {
      const p = hubs[a], q = hubs[b];
      const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
      const om = Math.acos(dot);
      const n = Math.max(24, Math.ceil(om * R * 1.6));
      const pts = [];
      for (let s = 0; s <= n; s++) {
        const u = s / n;
        const ka = Math.sin((1 - u) * om) / Math.sin(om), kb = Math.sin(u * om) / Math.sin(om);
        const lift = 1 + Math.sin(u * Math.PI) * (0.08 + om * 0.06);
        pts.push([(p[0] * ka + q[0] * kb) * lift, (p[1] * ka + q[1] * kb) * lift, (p[2] * ka + q[2] * kb) * lift]);
      }
      return { pts, speed: 0.22 + (i % 4) * 0.05, phase: i * 0.37 };
    });
    const hubCols = [th.warn, th.pos, th.neg, th.info, th.crit];
    const halo = Array.from({ length: Math.ceil(R * 2.2) }, () => ({ a: ctx.rng() * Math.PI * 2, r: ctx.rng(), p: ctx.rng() * 6.28 }));
    const scaleC = (c, k) => {
      const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
      return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b | 0);
    };

    return (t) => {
      cv.clear();
      const spin = t * 0.28, tilt = 0.38;
      const cS = Math.cos(spin), sS = Math.sin(spin), cT = Math.cos(tilt), sT = Math.sin(tilt);
      // Spin about the polar axis, then tilt toward the viewer. Returns [sx, sy, z] (z<0 = facing us).
      const proj = (v) => {
        const x = v[0] * cS - v[2] * sS, z = v[0] * sS + v[2] * cS;
        const y = v[1] * cT - z * sT, z2 = v[1] * sT + z * cT;
        return [cx + x * R, cy + (y * R) / aspect, z2, x, y];
      };
      const occluded = (p) => p[2] > 0 && p[3] * p[3] + p[4] * p[4] < 1;

      for (const g of grat) {
        const p = proj(g);
        if (p[2] > 0) continue;
        cv.set(p[0], p[1], scaleC(th.dim, 0.35 + -p[2] * 0.35));
      }
      // Atmosphere: a crisp limb plus a sparse, shimmering dotted halo.
      cv.circle(cx, cy, R + 1, scaleC(th.info, 0.7));
      for (let k = 0; k < halo.length; k++) {
        const h = halo[k], a = h.a + t * 0.05, rr = R + 2.5 + h.r * R * 0.08;
        const tw = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + h.p));
        cv.set(cx + Math.cos(a) * rr, cy + (Math.sin(a) * rr) / aspect, scaleC(th.info, tw * (1 - h.r)));
      }
      for (const v of land) {
        const p = proj(v);
        if (p[2] > 0) {
          if (p[2] > 0.35 && p[3] * p[3] + p[4] * p[4] < 0.8) cv.set(p[0], p[1], scaleC(th.accent, 0.13)); // far side, faintly
          continue;
        }
        const face = -p[2];
        const lightK = 0.35 + 0.65 * Math.max(0, -p[3] * 0.45 - p[4] * 0.35 + face * 0.75);
        cv.set(p[0], p[1], scaleC(th.accent, 0.45 + lightK * 0.75));
      }
      for (const a of arcs) {
        const head = ((t * a.speed + a.phase) % 1.4) / 1.2;
        const n = a.pts.length - 1;
        for (let s = 0; s <= n; s++) {
          const p = proj(a.pts[s]);
          if (occluded(p)) continue;
          const u = s / n;
          const trail = u <= head ? Math.max(0, 1 - (head - u) * 5) : 0;
          const k = 0.4 + trail * 0.9;
          cv.set(p[0], p[1], trail > 0.92 ? 0xffffff : scaleC(lerpHub(th.info, th.crit, u), k));
        }
      }
      hubs.forEach((h, i) => {
        const p = proj(h);
        if (p[2] > 0.05) return;
        const c = hubCols[i % hubCols.length];
        const pulse = ((t * 0.8 + i * 0.29) % 1);
        cv.circle(p[0], p[1], 1.5 + pulse * R * 0.09, scaleC(c, 1 - pulse));
        cv.circle(p[0], p[1], 1.2, c, true);
      });
      cv.paint(ctx.buffer);
    };
  },
};
