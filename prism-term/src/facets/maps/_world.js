// Shared world geometry for the maps gallery: coarse hand-traced continents
// (copied from objects/globe.js so galleries stay independent), point-in-land
// tests, an aspect-correct equirectangular projection, cached land masks,
// great-circle interpolation and a set of hub locations.
export const LAND = [
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

// Per-polygon bounding boxes: a point outside a box contributes an even number
// of ray crossings (or none), so the box test can skip it without changing parity.
const BOXES = LAND.map((poly) => {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [x, y] of poly) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  return [a, b, c, d];
});

/** Even-odd point-in-land test on (lon, lat) degrees; Antarctica is a wavy band. */
export function inLand(lon, lat) {
  if (lat < -68 + 3 * Math.sin((lon * Math.PI) / 60)) return true;
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

/** The default crop: the inhabited latitudes. */
export const WORLD = { lon0: -180, lon1: 180, lat0: 80, lat1: -58 };

/**
 * Equirectangular projection fitted into a canvas with the canvas's pixel aspect,
 * centered. `stretch` > 1 lets the map grow taller than true aspect to fill space.
 */
export function project(cv, { view = WORLD, x = 0, y = 0, w = cv.width, h = cv.height, stretch = 1.15 } = {}) {
  const dLon = view.lon1 - view.lon0, dLat = view.lat0 - view.lat1;
  const sx = Math.min(w / dLon, ((h * cv.aspect) / dLat) * stretch);
  const sy = Math.min(h / dLat, (sx / cv.aspect) * stretch);
  const mw = dLon * sx, mh = dLat * sy;
  const ox = x + (w - mw) / 2, oy = y + (h - mh) / 2;
  return {
    sx, sy, ox, oy, w: mw, h: mh, view,
    x: (lon) => ox + (lon - view.lon0) * sx,
    y: (lat) => oy + (view.lat0 - lat) * sy,
    lon: (px) => view.lon0 + (px - ox) / sx,
    lat: (py) => view.lat0 - (py - oy) / sy,
  };
}

const maskCache = new Map();
/** Land mask for a projection: Uint8Array over the canvas pixels (1 = land). Cached. */
export function landMask(cv, P) {
  const key = `${cv.width}x${cv.height}:${P.ox.toFixed(2)},${P.oy.toFixed(2)},${P.sx.toFixed(4)},${P.sy.toFixed(4)},${P.view.lon0},${P.view.lat0}`;
  let m = maskCache.get(key);
  if (m) return m;
  m = new Uint8Array(cv.width * cv.height);
  for (let y = 0; y < cv.height; y++) {
    const lat = P.lat(y + 0.5);
    if (lat > P.view.lat0 || lat < P.view.lat1) continue;
    for (let x = 0; x < cv.width; x++) {
      const lon = P.lon(x + 0.5);
      if (lon < P.view.lon0 || lon > P.view.lon1) continue;
      if (inLand(lon, lat)) m[y * cv.width + x] = 1;
    }
  }
  if (maskCache.size > 24) maskCache.clear();
  maskCache.set(key, m);
  return m;
}

/** Coast pixels: land with at least one sea neighbor (4-connected). */
export function coastOf(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) out[i] = 1;
  }
  return out;
}

const RAD = Math.PI / 180;
const vec = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

/** n+1 points [lon, lat] along the great circle from a to b (spherical lerp). */
export function greatCircle(a, b, n = 48) {
  const p = vec(a[0], a[1]), q = vec(b[0], b[1]);
  const d = Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const s0 = d ? Math.sin((1 - k) * d) / Math.sin(d) : 1 - k, s1 = d ? Math.sin(k * d) / Math.sin(d) : k;
    const x = s0 * p[0] + s1 * q[0], y = s0 * p[1] + s1 * q[1], z = s0 * p[2] + s1 * q[2];
    out.push([Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD]);
  }
  return out;
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const p = vec(a[0], a[1]), q = vec(b[0], b[1]);
  return 6371 * Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
}

/** Hub cities as [code, name, lon, lat]. Codes are airport-style, not real sites. */
export const HUBS = [
  ['IAD', 'Ashburn', -77.5, 39], ['PDX', 'Portland', -122.7, 45.5], ['DFW', 'Dallas', -96.8, 32.8],
  ['GRU', 'Sao Paulo', -46.6, -23.5], ['LHR', 'London', -0.1, 51.5], ['FRA', 'Frankfurt', 8.7, 50.1],
  ['BOM', 'Mumbai', 72.9, 19.1], ['SIN', 'Singapore', 103.8, 1.35], ['NRT', 'Tokyo', 139.7, 35.7],
  ['SYD', 'Sydney', 151.2, -33.9], ['JNB', 'Johannesburg', 28, -26.2], ['SCL', 'Santiago', -70.7, -33.4],
];
export const hub = (code) => HUBS.find((h) => h[0] === code);

/** Draw a projected polyline of [lon, lat] points, splitting at the antimeridian. */
export function drawGeoPath(cv, P, pts, color, upto = 1) {
  const n = Math.max(1, Math.round((pts.length - 1) * upto));
  for (let i = 0; i < n; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (Math.abs(a[0] - b[0]) > 180) continue;
    cv.line(P.x(a[0]), P.y(a[1]), P.x(b[0]), P.y(b[1]), typeof color === 'function' ? color(i / n) : color);
  }
}
