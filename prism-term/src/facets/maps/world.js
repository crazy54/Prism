// World Maps: a dotted world with pulsing data centers, a follow-the-sun
// choropleth of pseudo-regions, and a day/night terminator with city lights.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, clamp, smooth, NONE, ATTR } from '../charts/_data.js';
import { project, landMask, coastOf, inLand, HUBS } from './_world.js';

const RAD = Math.PI / 180;

/** Simulated UTC hour for a time t (hoursPerSecond of sim time), starting at 14:00. */
const utcHour = (t, hps) => (14 + t * hps) % 24;
const hhmm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

const cities = {
  id: 'maps-world-cities',
  title: 'Data Center Map',
  category: 'World Maps',
  description: 'A dotted braille world map with pulsing data-center markers, health-colored ripples, region codes and a live traffic footer.',
  tags: ['world map', 'braille', 'data centers', 'pulse', 'regions'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const foot = H >= 14 ? 2 : 0;
    const rows = H - foot;
    const cv = ctx.canvas('line', { cols: W, rows });
    const P = project(cv, { stretch: 1.25 });
    const mask = landMask(cv, P), coast = coastOf(mask, cv.width, cv.height);
    // A dot lattice reads as "map" without turning continents into solid blobs.
    const landPx = [];
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = y * cv.width + x;
      if (coast[i]) landPx.push(i, 1);
      else if (mask[i] && x % 2 === 0 && y % 2 === 0) landPx.push(i, 0);
    }
    const landC = mix(th.bg, th.muted, 0.55), coastC = mix(th.bg, th.muted, 0.85);
    const sites = HUBS.slice(0, W >= 60 ? 12 : 8).map(([code, , lon, lat], i) => ({ code, x: P.x(lon), y: P.y(lat), ph: i * 0.37, lon }));
    // Health over the loop: Mumbai degrades for a while, Sao Paulo blips.
    const health = (s, lt) => (s.code === 'BOM' && lt > 4 && lt < 9 ? 'warn' : s.code === 'GRU' && lt > 7.5 && lt < 8.5 ? 'neg' : 'pos');
    const labelDx = { LHR: -4, FRA: 1, IAD: 1, DFW: -4, PDX: -4, NRT: 1, SIN: -4, SYD: 1, BOM: -4, JNB: 1, GRU: 1, SCL: -4 };
    return (t) => {
      const lt = t % 12;
      cv.clear();
      const px = cv.px;
      for (let k = 0; k < landPx.length; k += 2) px[landPx[k]] = landPx[k + 1] ? coastC : landC;
      for (const s of sites) {
        const c = th[health(s, lt)];
        const cycle = ((t * 0.5 + s.ph) % 1);
        const r = 1.5 + cycle * (s.code === 'BOM' && health(s, lt) !== 'pos' ? 11 : 7);
        cv.ellipse(s.x, s.y, r, r / cv.aspect, mix(th.bg, c, 1 - smooth(cycle) * 0.85));
        for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) cv.set(s.x + dx + 0.5, s.y + dy + 0.5, 0xffffff);
      }
      cv.paint(b);
      if (W >= 60) {
        for (const s of sites) {
          const cx = Math.round(s.x / cv.sx) + labelDx[s.code], cy = Math.round(s.y / cv.sy);
          if (cy >= 0 && cy < rows && cx >= 0 && cx + 3 <= W) b.text(cx, cy, s.code, health(s, lt) === 'pos' ? th.ink : th[health(s, lt)], undefined, ATTR.BOLD);
        }
      }
      if (foot) {
        const y = H - 2;
        const bad = sites.filter((s) => health(s, lt) !== 'pos');
        let x = b.text(0, y, g.dot, th.pos);
        x = b.text(x + 1, y, `${sites.length - bad.length} healthy`, th.muted);
        for (const s of bad) { x = b.text(x + 3, y, g.dot, th[health(s, lt)]); x = b.text(x + 1, y, `${s.code} ${health(s, lt) === 'warn' ? 'degraded' : 'down'}`, th[health(s, lt)], undefined, ATTR.BOLD); }
        const rps = 1.18 + 0.12 * Math.sin(t * 0.9) + 0.03 * ctx.noise.noise2(t, 3);
        if (W >= 70) putR(b, W, y, `edge ${rps.toFixed(2)}M req/s · p50 ${Math.round(38 + 6 * Math.sin(t * 0.7))} ms`, th.muted);
        put(b, 0, H - 1, `${sites.length} regions · ${sites.length * 3} zones · anycast 192.0.2.0/24`, W, th.dim);
      }
    };
  },
};

const choropleth = {
  id: 'maps-world-choropleth',
  title: 'Follow-the-Sun Choropleth',
  category: 'World Maps',
  description: 'Active users by region as a choropleth of pseudo-regions: demand rolls west with the daylight while a legend and UTC clock keep score.',
  tags: ['choropleth', 'world map', 'regions', 'diurnal', 'half blocks'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 12,
  canvas: 'field',
  palette: 'viridis',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const foot = H >= 14 ? 2 : 1;
    const rows = H - foot;
    const cv = ctx.canvas('field', { cols: W, rows });
    const P = project(cv, { stretch: 1.25 });
    const mask = landMask(cv, P);
    // Pseudo-regions: Voronoi cells around seeded land points, each with a population weight.
    const seeds = [];
    while (seeds.length < 64) {
      const lon = ctx.rng.range(-170, 180), lat = ctx.rng.range(-55, 75);
      if (inLand(lon, lat)) seeds.push({ lon, lat, x: P.x(lon), y: P.y(lat), pop: 0.25 + 0.75 * ctx.rng() ** 1.6 });
    }
    const region = new Int16Array(cv.width * cv.height).fill(-1);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = y * cv.width + x;
      if (!mask[i]) continue;
      let best = 0, bd = Infinity;
      for (let k = 0; k < seeds.length; k++) { const dx = seeds[k].x - x, dy = (seeds[k].y - y) / cv.aspect; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
      region[i] = best;
    }
    const border = new Uint8Array(cv.width * cv.height);
    for (let y = 1; y < cv.height; y++) for (let x = 1; x < cv.width; x++) {
      const i = y * cv.width + x;
      if (region[i] >= 0 && ((region[i - 1] >= 0 && region[i - 1] !== region[i]) || (region[i - cv.width] >= 0 && region[i - cv.width] !== region[i]))) border[i] = 1;
    }
    const pal = ctx.palette('viridis');
    const CLASSES = 6, LIMITS = ['<5k', '5k', '20k', '50k', '100k', '200k+'];
    const ocean = mix(th.bg, th.info, 0.08);
    const cls = new Uint8Array(seeds.length);
    const shades = Array.from({ length: CLASSES }, (_, k) => pal(0.12 + (k / (CLASSES - 1)) * 0.86));
    const borderC = shades.map((c) => mix(c, th.bg, 0.45));
    return (t) => {
      const hour = utcHour(t, 2);
      let total = 0;
      for (let k = 0; k < seeds.length; k++) {
        const local = (hour + seeds[k].lon / 15 + 24) % 24;
        // Usage peaks in the evening and bottoms out before dawn.
        const day = 0.08 + 0.92 * Math.max(0, Math.sin(((local - 7) / 17) * Math.PI)) ** 1.3 * (local > 7 ? 1 : 0);
        const v = seeds[k].pop * day;
        total += v * 380;
        cls[k] = clamp(Math.floor(v * CLASSES * 1.05), 0, CLASSES - 1);
      }
      cv.clear(ocean);
      const px = cv.px;
      for (let i = 0; i < px.length; i++) { const r = region[i]; if (r >= 0) px[i] = border[i] ? borderC[cls[r]] : shades[cls[r]]; }
      if (cv.mode === 'ascii') {
        // One pixel per cell: the class as a density glyph over a tinted cell, so it reads with or without color.
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          const i = y * cv.width + x, r = region[i];
          if (r < 0) b.set(x, y, ' ', undefined, ocean);
          else b.set(x, y, '.:-=+#'[cls[r]], shades[cls[r]], mix(th.bg, shades[cls[r]], border[i] ? 0.15 : 0.35));
        }
      } else cv.paint(b);
      const y = H - foot;
      let x = b.text(0, y, 'users', th.muted);
      const sw = W >= 70 ? 6 : 3;
      for (let k = 0; k < CLASSES; k++) {
        for (let j = 0; j < sw; j++) b.set(x + 1 + k * sw + j, y, g.u ? '█' : '#', shades[k]);
        if (foot > 1 && sw >= 6) b.text(x + 1 + k * sw, y + 1, LIMITS[k], th.dim);
      }
      putR(b, W, y, `UTC ${hhmm(hour)}`, th.ink, undefined, ATTR.BOLD);
      if (foot > 1 && W >= 70) putR(b, W, y + 1, `${(total / 1000).toFixed(2)}M active`, th.muted);
    };
  },
};

const daynight = {
  id: 'maps-world-daynight',
  title: 'Day / Night Terminator',
  category: 'World Maps',
  description: 'The sun sweeps west over a half-block world: a soft terminator with twilight, city lights on the night side and world clocks below.',
  tags: ['terminator', 'day night', 'world clock', 'sun', 'city lights'],
  kind: 'scene',
  size: { w: 80, h: 22 },
  minSize: { w: 40, h: 10 },
  loop: 12,
  canvas: 'field',
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const foot = H >= 14 ? 2 : 1;
    const rows = H - foot;
    const cv = ctx.canvas('field', { cols: W, rows });
    const P = project(cv, { stretch: 1.25 });
    const mask = landMask(cv, P);
    const decl = -7.8 * RAD; // mid-October
    // Per-pixel sin/cos of latitude and longitude, computed once.
    const N = cv.width * cv.height;
    const sLat = new Float32Array(N), cLat = new Float32Array(N), lonA = new Float32Array(N), inMap = new Uint8Array(N);
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = y * cv.width + x, lat = P.lat(y + 0.5), lon = P.lon(x + 0.5);
      if (lat > P.view.lat0 || lat < P.view.lat1 || lon < -180 || lon > 180) continue;
      inMap[i] = 1; sLat[i] = Math.sin(lat * RAD); cLat[i] = Math.cos(lat * RAD); lonA[i] = lon * RAD;
    }
    const dayLand = mix(th.bg, th.pos, 0.42), nightLand = mix(th.bg, th.line, 0.55);
    const daySea = mix(th.bg, th.info, 0.3), nightSea = mix(th.bg, th.info, 0.06);
    const dusk = mix(th.bg, th.warn, 0.35);
    const LV = 16;
    const ramp = (a, c) => Array.from({ length: LV + 1 }, (_, k) => mix(a, c, k / LV));
    const landR = ramp(nightLand, dayLand), seaR = ramp(nightSea, daySea);
    const lights = [];
    while (lights.length < 46) {
      const lon = ctx.rng.range(-125, 150), lat = ctx.rng.range(-40, 60);
      if (inLand(lon, lat)) lights.push([P.x(lon), P.y(lat), lon * RAD, lat * RAD, ctx.rng()]);
    }
    for (const [, , lon, lat] of HUBS) lights.push([P.x(lon), P.y(lat), lon * RAD, lat * RAD, 1]);
    const clocks = ['PDX', 'IAD', 'LHR', 'BOM', 'SIN', 'NRT', 'SYD'];
    // ASCII terminals get one glyph per cell instead of half-block pixels.
    const glyph = cv.mode === 'ascii' ? new Array(N).fill(' ') : null;
    return (t) => {
      const hour = utcHour(t, 2);
      const sunLon = ((12 - hour) * 15) * RAD;
      const sD = Math.sin(decl), cD = Math.cos(decl);
      const px = cv.px;
      for (let i = 0; i < N; i++) {
        if (!inMap[i]) { px[i] = NONE; continue; }
        const z = sLat[i] * sD + cLat[i] * cD * Math.cos(lonA[i] - sunLon);
        const k = clamp((z + 0.12) / 0.24, 0, 1);
        const base = mask[i] ? landR[Math.round(smooth(k) * LV)] : seaR[Math.round(smooth(k) * LV)];
        px[i] = Math.abs(z) < 0.05 && mask[i] ? mix(base, dusk, 0.5) : base;
        if (glyph) glyph[i] = mask[i] ? (k > 0.5 ? '#' : ':') : k > 0.5 ? '~' : ' ';
      }
      for (const [x, y, lon, lat, w] of lights) {
        const z = Math.sin(lat) * sD + Math.cos(lat) * cD * Math.cos(lon - sunLon);
        if (z < -0.04) {
          cv.set(x, y, mix(nightLand, th.warn, clamp(0.25 + w * 0.6 + 0.08 * Math.sin(t * 3 + x), 0, 1)));
          if (glyph) glyph[Math.floor(y) * cv.width + Math.floor(x)] = '*';
        }
      }
      if (glyph) {
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          const i = y * cv.width + x;
          if (inMap[i]) b.set(x, y, glyph[i], glyph[i] === '*' ? px[i] : mix(px[i], th.ink, 0.25), px[i]);
        }
      } else cv.paint(b);
      // The subsolar point.
      const sx = Math.round(P.x(((sunLon / RAD) + 540) % 360 - 180) / cv.sx), sy = Math.round(P.y(decl / RAD) / cv.sy);
      if (sx >= 0 && sx < W && sy >= 0 && sy < rows) b.set(sx, sy, g.u ? '☼' : '*', 0xffffff, undefined, ATTR.BOLD);
      // World clocks.
      const y = H - foot;
      const per = Math.floor(W / clocks.length);
      clocks.forEach((code, i) => {
        const h = HUBS.find((c) => c[0] === code);
        const local = (hour + Math.round(h[2] / 15) + 24) % 24;
        const z = Math.sin(h[3] * RAD) * sD + Math.cos(h[3] * RAD) * cD * Math.cos(h[2] * RAD - sunLon);
        const day = z > 0;
        if (per >= 10) {
          b.text(i * per, y, code, th.muted);
          b.text(i * per + 4, y, hhmm(local), day ? th.ink : th.info, undefined, ATTR.BOLD);
          if (foot > 1) b.text(i * per, y + 1, day ? (g.u ? '☼ day' : 'day') : (g.u ? '☾ night' : 'night'), day ? th.warn : th.dim);
        } else if (i < 4) b.text(i * 10, y, `${code} ${hhmm(local)}`, day ? th.ink : th.info);
      });
    };
  },
};

export default [cities, choropleth, daynight];
