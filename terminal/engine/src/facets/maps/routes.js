// Routes & Arcs: great-circle flights, traceroute hops plotted on a map, a
// schematic transit map with moving trains, and a GPS trail over contours.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, clamp, smooth, ATTR } from '../charts/_data.js';
import { project, landMask, coastOf, greatCircle, distanceKm, drawGeoPath, hub } from './_world.js';

/** Land drawn as a sparse dot lattice plus a brighter coast, as flat pixel pairs. */
function dottedLand(cv, P, every = 2) {
  const mask = landMask(cv, P), coast = coastOf(mask, cv.width, cv.height);
  const out = [];
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = y * cv.width + x;
    if (coast[i]) out.push(i, 1);
    else if (mask[i] && x % every === 0 && y % every === 0) out.push(i, 0);
  }
  return out;
}

const ROUTES = [['LHR', 'IAD'], ['FRA', 'SIN'], ['SIN', 'SYD'], ['NRT', 'PDX'], ['IAD', 'GRU'], ['LHR', 'BOM'], ['JNB', 'FRA'], ['DFW', 'NRT'], ['SCL', 'GRU'], ['BOM', 'SIN']];

const flights = {
  id: 'maps-flights',
  title: 'Great-Circle Flights',
  category: 'Routes & Arcs',
  description: 'Flights trace great-circle arcs between hubs on a dotted world: planes with fading contrails, arrival pulses and a live departures board.',
  tags: ['flights', 'great circle', 'arcs', 'world map', 'routes'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const foot = H >= 16 ? 3 : 0;
    const rows = H - foot;
    const cv = ctx.canvas('line', { cols: W, rows });
    const P = project(cv, { stretch: 1.25 });
    const land = dottedLand(cv, P, 3);
    const landC = mix(th.bg, th.muted, 0.35), coastC = mix(th.bg, th.muted, 0.6);
    const colors = [th.accent, th.info, th.pos, th.warn, th.crit];
    const routes = ROUTES.map(([a, z], i) => {
      const A = hub(a), Z = hub(z);
      const pts = greatCircle([A[2], A[3]], [Z[2], Z[3]], 64);
      const km = distanceKm([A[2], A[3]], [Z[2], Z[3]]);
      // Whole trips per loop so the animation wraps cleanly; long hauls fly slower.
      const trips = Math.max(1, Math.round(12 / (2 + km / 2600)));
      return { a, z, pts, km, trips, ph: (i * 0.137) % 1, c: colors[i % colors.length], no: `PX ${100 + ((i * 37) % 800)}` };
    });
    return (t) => {
      cv.clear();
      const px = cv.px;
      for (let k = 0; k < land.length; k += 2) px[land[k]] = land[k + 1] ? coastC : landC;
      const live = [];
      for (const r of routes) {
        drawGeoPath(cv, P, r.pts, mix(th.bg, r.c, 0.3));
        const p = (t / 12 * r.trips + r.ph) % 1;
        const head = p * (r.pts.length - 1);
        // Contrail: the last 30% of the trip so far, brightening to the plane.
        const tail = Math.max(0, head - (r.pts.length - 1) * 0.4);
        for (let i = Math.floor(tail); i < Math.floor(head); i++) {
          const a = r.pts[i], z = r.pts[i + 1];
          if (Math.abs(a[0] - z[0]) > 180) continue;
          const k = (i - tail) / (head - tail || 1);
          cv.line(P.x(a[0]), P.y(a[1]), P.x(z[0]), P.y(z[1]), mix(r.c, 0xffffff, 0.15 * k));
        }
        const i0 = Math.min(r.pts.length - 2, Math.floor(head)), f = head - i0;
        const [lo0, la0] = r.pts[i0], [lo1, la1] = r.pts[i0 + 1];
        const lon = Math.abs(lo1 - lo0) > 180 ? lo1 : lo0 + (lo1 - lo0) * f;
        const hx = P.x(lon), hy = P.y(la0 + (la1 - la0) * f);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dy === 0) cv.set(hx + dx, hy + dy, 0xffffff);
        if (p > 0.9) {
          const Z = hub(r.z), k = (p - 0.9) / 0.1, rr = 1 + k * 5;
          cv.ellipse(P.x(Z[2]), P.y(Z[3]), rr, rr / cv.aspect, mix(th.bg, r.c, 1 - k));
        }
        live.push({ r, p });
      }
      cv.paint(b);
      if (W >= 60) for (const code of ['LHR', 'IAD', 'SIN', 'NRT', 'GRU', 'SYD', 'JNB', 'BOM']) {
        const h = hub(code);
        const x = Math.round(P.x(h[2]) / cv.sx), y = Math.round(P.y(h[3]) / cv.sy) + 1;
        if (y < rows && x + 3 < W) b.text(Math.max(0, x - 1), y, code, th.muted);
      }
      if (foot) {
        const y0 = H - foot;
        b.text(0, y0, 'FLIGHT  ROUTE      PROGRESS              DIST', th.dim, undefined, ATTR.BOLD);
        // The board pages through the flights, two at a time.
        const page = Math.floor(t / 3) % Math.ceil(live.length / (foot - 1));
        live.slice(page * (foot - 1), page * (foot - 1) + foot - 1).forEach(({ r, p }, i) => {
          const y = y0 + 1 + i;
          b.text(0, y, r.no, th.ink, undefined, ATTR.BOLD);
          b.text(8, y, `${r.a}${g.u ? '→' : '>'}${r.z}`, r.c);
          const bw = 20, f = Math.round(p * bw);
          for (let k = 0; k < bw; k++) b.set(19 + k, y, k < f ? (g.u ? '━' : '=') : (g.u ? '─' : '-'), k < f ? r.c : th.line);
          b.text(40, y, `${Math.round(r.km).toLocaleString('en-US')} km`, th.muted);
          if (W >= 70) putR(b, W, y, p > 0.9 ? 'landing' : p < 0.08 ? 'departed' : 'en route', p > 0.9 ? th.pos : th.muted);
        });
      }
    };
  },
};

// Hops: [host, ip, rtt ms, lon, lat] — null host is a hop that never answers.
const HOPS = [
  ['gw.office.example', '10.40.0.1', 0.8, 8.7, 50.1],
  ['edge1.fra.example.net', '198.51.100.17', 4.9, 8.7, 50.1],
  ['core2.mrs.example.net', '198.51.100.41', 14.8, 5.4, 43.3],
  [null, null, 0, 5.4, 43.3],
  ['sub1.cai.example.net', '203.0.113.9', 52.1, 31.2, 30.0],
  ['core1.bom.example.net', '203.0.113.66', 118.4, 72.9, 19.1],
  ['core1.maa.example.net', '203.0.113.70', 131.0, 80.3, 13.1],
  ['edge2.sin.example.net', '203.0.113.130', 162.7, 103.8, 1.35],
  ['www.shop.example', '192.0.2.80', 163.2, 103.8, 1.35],
];

const traceroute = {
  id: 'maps-traceroute',
  title: 'Traceroute Map',
  category: 'Routes & Arcs',
  description: 'traceroute from Frankfurt to Singapore, hop by hop: each reply is plotted on the map as the classic output prints below with RTTs.',
  tags: ['traceroute', 'network', 'hops', 'latency', 'map'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 44, h: 12 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const out = Math.min(HOPS.length + 1, Math.max(3, Math.floor(H * 0.48)));
    const rows = H - out;
    const cv = ctx.canvas('line', { cols: W, rows });
    const P = project(cv, { view: { lon0: -12, lon1: 122, lat0: 58, lat1: -6 }, stretch: 1.6 });
    const land = dottedLand(cv, P, 2);
    const landC = mix(th.bg, th.muted, 0.38), coastC = mix(th.bg, th.muted, 0.7);
    const STEP = 1, START = 0.5;
    const rttC = (ms) => (ms < 40 ? th.pos : ms < 140 ? th.warn : th.neg);
    return (t) => {
      const lt = t % 12;
      const shown = clamp(Math.floor((lt - START) / STEP) + 1, 0, HOPS.length);
      cv.clear();
      const px = cv.px;
      for (let k = 0; k < land.length; k += 2) px[land[k]] = land[k + 1] ? coastC : landC;
      let prev = null;
      for (let i = 0; i < shown; i++) {
        const [host, , ms, lon, lat] = HOPS[i];
        if (!host) continue;
        const x = P.x(lon), y = P.y(lat);
        if (prev) {
          const arc = greatCircle(prev, [lon, lat], 24);
          const age = lt - (START + i * STEP);
          drawGeoPath(cv, P, arc, rttC(ms), clamp(age / 0.6, 0.05, 1));
        }
        const rr = i === shown - 1 ? 1 + ((lt * 2) % 1) * 4 : 0;
        if (rr) cv.ellipse(x, y, rr, rr / cv.aspect, mix(th.bg, rttC(ms), 1 - ((lt * 2) % 1)));
        cv.set(x, y, 0xffffff); cv.set(x + 1, y, 0xffffff);
        prev = [lon, lat];
      }
      cv.paint(b);
      // Hop numbers on the map (co-located hops share a label).
      const seen = new Set();
      for (let i = 0; i < shown; i++) {
        const [host, , , lon, lat] = HOPS[i];
        if (!host) continue;
        const cx = Math.round(P.x(lon) / cv.sx), cy = Math.round(P.y(lat) / cv.sy);
        const key = `${cx},${cy}`;
        const label = seen.has(key) ? null : String(i + 1);
        if (label && cy - 1 >= 0 && cx + 2 < W) b.text(cx + 1, cy - 1, label, th.ink, undefined, ATTR.BOLD);
        seen.add(key);
      }
      // The printed output.
      const y0 = rows;
      const done = lt > START + HOPS.length * STEP + 0.4;
      if (done) put(b, 0, y0, `${g.check} www.shop.example reached in ${HOPS.length} hops, ${HOPS.at(-1)[2]} ms`, W, th.pos, undefined, ATTR.BOLD);
      else put(b, 0, y0, 'traceroute to www.shop.example (192.0.2.80), 30 hops max', W, th.muted);
      const list = HOPS.slice(0, shown).map((h, i) => [h, i]);
      list.slice(-(out - 1)).forEach(([[host, ip, ms], i], r) => {
        const y = y0 + 1 + r;
        let x = b.text(0, y, String(i + 1).padStart(2), th.dim);
        if (!host) { b.text(x + 2, y, '* * *', th.dim); return; }
        x = put(b, x + 2, y, host, W - x - 2, th.ink);
        if (W >= 64) x = b.text(x + 1, y, `(${ip})`, th.muted);
        const probes = W >= 76 ? 3 : W >= 60 ? 2 : 1;
        for (let k = 0; k < probes; k++) {
          const v = ms * (1 + 0.012 * Math.sin(i * 7 + k * 3));
          x = b.text(x + 2, y, `${v.toFixed(1)} ms`, rttC(v));
        }
      });
    };
  },
};

// Schematic transit map on a 78×16 design grid; lines are axis-aligned polylines.
const LINES = [
  { name: 'Red', tone: 'neg', pts: [[2, 8], [76, 8]], stations: [[2, 8, 'West Docks', 'a'], [16, 8, 'Harbour', 'b'], [34, 8, 'Central', 'al'], [50, 8, 'Museum', 'br'], [64, 8, 'Mill Lane', 'br'], [76, 8, 'East Gate', 'a']] },
  { name: 'Blue', tone: 'info', pts: [[28, 1], [28, 5], [34, 5], [34, 13], [44, 13], [44, 15]], stations: [[28, 1, 'Northgate', 'r'], [34, 8, '', ''], [34, 11, 'Quayside', 'bl'], [40, 13, 'Riverside', 'b'], [44, 15, 'Docklands', 'r']] },
  { name: 'Green', tone: 'pos', pts: [[6, 3], [50, 3], [50, 13], [74, 13]], stations: [[6, 3, 'University', 'a'], [18, 3, 'Library', 'a'], [28, 3, '', ''], [50, 3, 'Parkside', 'r'], [50, 8, '', ''], [74, 13, 'Airport', 'b']] },
  { name: 'Amber', tone: 'warn', pts: [[10, 15], [10, 11], [64, 11], [64, 1]], stations: [[10, 15, 'Old Town', 'r'], [18, 11, 'Market', 'b'], [34, 11, '', ''], [50, 11, '', ''], [64, 8, '', ''], [64, 1, 'Stadium', 'r']] },
];

/** Label origin for an anchor: a/b above/below centered, r right, al above-left, bl below-left, br below-right. */
function labelAt(x, y, name, anchor) {
  const n = name.length;
  switch (anchor) {
    case 'a': return [x - Math.floor(n / 2), y - 1];
    case 'b': return [x - Math.floor(n / 2), y + 1];
    case 'r': return [x + 2, y];
    case 'al': return [x - n - 1, y - 1];
    case 'bl': return [x - n - 1, y + 1];
    default: return [x + 1, y + 1];
  }
}

/** Cells along an axis-aligned polyline, each with the glyph joining its neighbors. */
function trace(pts) {
  const cells = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, y0] = pts[s], [x1, y1] = pts[s + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = s === 0 ? 0 : 1; i <= n; i++) cells.push([x0 + Math.sign(x1 - x0) * i, y0 + Math.sign(y1 - y0) * i]);
  }
  return cells;
}

const subway = {
  id: 'maps-subway',
  title: 'Transit Map',
  category: 'Routes & Arcs',
  description: 'A schematic metro map with four colored lines, interchanges and trains running end to end; the status board reports a delay.',
  tags: ['subway', 'metro', 'transit', 'schematic', 'trains'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 44, h: 12 },
  loop: 24,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const board = H >= 20 ? 4 : H >= 16 ? 2 : 0;
    const mapH = H - board;
    const sx = (W - 2) / 78, sy = (mapH - 2) / 15;
    const X = (x) => Math.round(1 + x * sx), Y = (y) => Math.round(y * sy + (mapH >= 18 ? 1 : 0));
    const lines = LINES.map((l) => {
      const pts = l.pts.map(([x, y]) => [X(x), Y(y)]);
      const cells = trace(pts);
      const glyph = cells.map(([x, y], i) => {
        const p = cells[i - 1], n = cells[i + 1];
        const hz = (p && p[1] === y) || (n && n[1] === y);
        const vt = (p && p[0] === x) || (n && n[0] === x);
        if (hz && vt && p && n) {
          const dx = (p[0] - x) + (n[0] - x), dy = (p[1] - y) + (n[1] - y);
          if (!g.u) return '+';
          return dx > 0 ? (dy > 0 ? '┏' : '┗') : dy > 0 ? '┓' : '┛';
        }
        return vt && !hz ? (g.u ? '┃' : '|') : g.u ? '━' : '-';
      });
      const st = l.stations.map(([x, y, name, anchor]) => ({ x: X(x), y: Y(y), name, anchor }));
      return { ...l, c: th[l.tone], cells, glyph, st };
    });
    // Interchanges: any station cell shared by two or more lines.
    const count = new Map();
    for (const l of lines) for (const s of l.st) { const k = `${s.x},${s.y}`; count.set(k, (count.get(k) || 0) + 1); }
    return (t) => {
      const lt = t % 24;
      const delayed = lt >= 8 && lt < 18; // Blue line signal fault
      for (const l of lines) l.cells.forEach(([x, y], i) => b.set(x, y, l.glyph[i], l.c, undefined, ATTR.BOLD));
      // Trains shuttle end to end; two per line, half a cycle apart.
      for (const l of lines) {
        const n = l.cells.length;
        const speed = l.name === 'Blue' && delayed ? 0.35 : 1;
        for (let k = 0; k < 2; k++) {
          const u = ((t * speed * 6) / n + k * 0.5) % 2;
          const p = u < 1 ? u : 2 - u;
          const i = Math.round(smooth(p) * (n - 1));
          const [x, y] = l.cells[i];
          b.set(x, y, g.u ? '■' : '#', 0xffffff, l.c, ATTR.BOLD);
        }
      }
      for (const l of lines) for (const s of l.st) {
        const ic = (count.get(`${s.x},${s.y}`) || 0) > 1;
        b.set(s.x, s.y, ic ? (g.u ? '◉' : '@') : g.u ? '●' : 'o', ic ? th.ink : l.c, ic ? th.bg : undefined, ATTR.BOLD);
        if (!s.name) continue;
        const [nx, ny] = labelAt(s.x, s.y, s.name, s.anchor);
        if (ny >= 0 && ny < mapH) b.text(clamp(nx, 0, W - s.name.length), ny, s.name, th.muted);
      }
      if (board) {
        const y0 = mapH;
        const status = [
          ['Red', 'Good service', th.pos], ['Blue', delayed ? 'Minor delays: signal fault at Quayside' : 'Good service', delayed ? th.warn : th.pos],
          ['Green', 'Good service', th.pos], ['Amber', lt >= 18 ? 'Part closure Stadium-Mill Lane (event)' : 'Good service', lt >= 18 ? th.info : th.pos],
        ];
        const perRow = board >= 4 ? 1 : 2, colW = Math.floor(W / perRow);
        status.forEach(([name, msg, c], i) => {
          const row = Math.floor(i / perRow), col = i % perRow;
          if (row >= board) return;
          const x = col * colW, y = y0 + row;
          const l = lines.find((q) => q.name === name);
          b.text(x, y, ` ${name.padEnd(5)} `, th.bg, l.c, ATTR.BOLD);
          put(b, x + 8, y, msg, colW - 9, c);
        });
      }
    };
  },
};

const trail = {
  id: 'maps-topo-trail',
  title: 'Topo Trail',
  category: 'Routes & Arcs',
  description: 'A GPS track climbing a contoured mountain: index contours, a hiker drawing the trail, and an elevation profile with distance and ascent.',
  tags: ['topographic', 'contours', 'gps', 'hiking', 'elevation'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 16,
  glyphs: 'braille',
  canvas: 'line',
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const prof = H >= 14 ? 4 : 0;
    const rows = H - prof;
    const cv = ctx.canvas('line', { cols: W, rows });
    const cw = cv.width, ch = cv.height, A = cv.aspect;
    // Terrain: a summit plus ridges and fbm detail, in metres.
    const sumX = cw * 0.68, sumY = ch * 0.38;
    const elev = (x, y) => {
      const dx = (x - sumX) / cw, dy = ((y - sumY) * A) / cw;
      const m = Math.exp(-(dx * dx + dy * dy) * 9);
      return 1050 + 950 * m + 160 * ctx.noise.fbm((x / cw) * 3.2, ((y * A) / cw) * 3.2, 0, 4) + 90 * Math.exp(-(((x - cw * 0.25) / cw) ** 2 + (((y - ch * 0.7) * A) / cw) ** 2) * 30);
    };
    const E = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) E[y * cw + x] = elev(x, y);
    // Contour pixels: where a 50 m band boundary falls between neighbors.
    const contour = [];
    for (let y = 0; y < ch - 1; y++) for (let x = 0; x < cw - 1; x++) {
      const i = y * cw + x, a = Math.floor(E[i] / 50), r = Math.floor(E[i + 1] / 50), d = Math.floor(E[i + cw] / 50);
      if (a !== r || a !== d) { const lvl = Math.max(a, r, d); contour.push(i, lvl % 5 === 0 ? 1 : 0); }
    }
    // The trail: greedy uphill switchbacks from the trailhead to the summit.
    const path = [[cw * 0.08, ch * 0.9]];
    let [px, py] = path[0];
    for (let s = 0; s < 400; s++) {
      const dxs = sumX - px, dys = (sumY - py) * A, d = Math.hypot(dxs, dys);
      if (d < 2) break;
      const zig = Math.sin(s * 0.09) * 0.9;
      const ang = Math.atan2(dys, dxs) + zig * Math.min(1, d / (cw * 0.2));
      px += Math.cos(ang) * 1.5; py += (Math.sin(ang) * 1.5) / A;
      path.push([px, py]);
    }
    const at = (x, y) => E[clamp(Math.round(y), 0, ch - 1) * cw + clamp(Math.round(x), 0, cw - 1)];
    const elevs = path.map(([x, y]) => at(x, y));
    const dist = [0];
    for (let i = 1; i < path.length; i++) dist.push(dist[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], (path[i][1] - path[i - 1][1]) * A) * 0.055);
    const lo = Math.min(...elevs), hi = Math.max(...elevs);
    const lineC = mix(th.bg, th.muted, 0.35), idxC = mix(th.bg, th.warn, 0.55);
    return (t) => {
      const lt = t % 16;
      const prog = smooth(clamp(lt / 13, 0, 1));
      const n = Math.max(1, Math.round(prog * (path.length - 1)));
      cv.clear();
      const pxs = cv.px;
      for (let k = 0; k < contour.length; k += 2) pxs[contour[k]] = contour[k + 1] ? idxC : lineC;
      for (let i = 0; i < n; i++) cv.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], th.accent);
      const [hx, hy] = path[n];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cv.set(hx + dx, hy + dy, 0xffffff);
      cv.set(sumX, sumY, th.neg); cv.set(sumX + 1, sumY, th.neg);
      cv.paint(b);
      const sx = Math.round(sumX / cv.sx), sy = Math.round(sumY / cv.sy);
      if (sy - 1 >= 0 && W >= 50) b.text(clamp(sx - 6, 0, W - 14), sy - 1, `${g.up} Cairn Peak ${Math.round(hi)}`, th.ink, undefined, ATTR.BOLD);
      b.text(0, 0, 'Ridge Loop', th.ink, undefined, ATTR.BOLD);
      if (prof) {
        const y0 = rows, pw = W - (W >= 60 ? 20 : 0);
        for (let x = 0; x < pw; x++) {
          const i = Math.round((x / (pw - 1)) * (path.length - 1));
          const v = (elevs[i] - lo) / (hi - lo || 1);
          const h8 = Math.round(v * (prof - 1) * 8) + 2;
          const done = i <= n;
          for (let r = 0; r < prof - 1; r++) {
            const fill = clamp(h8 - r * 8, 0, 8);
            const chh = g.u ? ' ▁▂▃▄▅▆▇█'[fill] : ' ..::==##'[fill];
            if (fill) b.set(x, y0 + prof - 2 - r, chh, done ? mix(th.bg, th.accent, 0.8) : mix(th.bg, th.muted, 0.4));
          }
        }
        const climbed = elevs.slice(0, n + 1).reduce((a, v, i, arr) => a + (i && v > arr[i - 1] ? v - arr[i - 1] : 0), 0);
        put(b, 0, H - 1, `${dist[n].toFixed(1)} km · ${g.up} ${Math.round(climbed)} m · ${Math.round(elevs[n])} m`, pw, th.muted);
        if (W >= 60) {
          const x0 = pw + 2;
          b.text(x0, y0, 'elapsed', th.dim);
          const mins = Math.round(prog * 194);
          b.text(x0, y0 + 1, `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`, th.ink, undefined, ATTR.BOLD);
          b.text(x0, y0 + 2, `${(dist[n] / Math.max(0.1, mins / 60)).toFixed(1)} km/h`, th.muted);
        }
      }
    };
  },
};

export default [flights, traceroute, subway, trail];
