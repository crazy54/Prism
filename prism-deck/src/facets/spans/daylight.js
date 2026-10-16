// span-daylight — a window onto the day outside, driven by the time of day. The sun climbs
// an arc across the whole device from sunrise to sunset; the sky follows it through dawn's
// violet and rose, the blue of midday, the amber of the golden hour, dusk, and a night of
// stars with the moon on its own arc; hills, trees and a small house sit on the bottom row
// (its window lights up after dark), and a few clouds drift by in the sky's own colors.
//
// Time comes from the runtime's clock (ctx.clock — fixed in tests) or, for demos, a whole
// day per loop. It changes once a minute, the clouds a pixel a second: almost free on the
// budget — static between those moments.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, lerp, smoothstep } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, lit, dotD, ellipseD, polyD, clipPoly, rectD, inCell, f1 } from './_d6-wall.js';

const LOOP = 96;
const pad2 = (v) => String(v).padStart(2, '0');

/** Interpolate keyframes [[e, a, b, c]] at e (colors per slot). */
function keyed(frames, e) {
  let i = 0;
  while (i < frames.length - 2 && e > frames[i + 1][0]) i++;
  const [e0, ...A] = frames[i], [e1, ...Bc] = frames[i + 1];
  const f = clamp((e - e0) / (e1 - e0));
  return A.map((c, j) => mix(c, Bc[j], f));
}

export default {
  id: 'span-daylight',
  title: 'Daylight',
  category: 'Whole Device',
  description: 'A window on the day, driven by the clock: the sun arcs across the device, the sky runs dawn, midday, golden hour and a starry night; a house on the hill lights up.',
  tags: ['sky', 'sun', 'time', 'day', 'night', 'sunrise', 'sunset', 'clock', 'landscape', 'wall', 'ambient'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  data: ['clock'],
  fps: 1,
  loop: LOOP,
  params: {
    source: { type: 'select', default: 'clock', options: ['clock', 'cycle'], label: 'Time (clock or a day per loop)' },
    sunrise: { type: 'number', default: 6.5, min: 3, max: 10, step: 0.25, label: 'Sunrise (h)' },
    sunset: { type: 'number', default: 19.5, min: 15, max: 22, step: 0.25, label: 'Sunset (h)' },
    time: { type: 'bool', default: true, label: 'Show the time' },
    budget: BUDGET,
  },
  order: 67,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const cycle = ctx.params.source === 'cycle';
    const { t } = frameClock(ctx, { fps: cycle ? 2 : 1, changing: cycle ? cells.length : 3, still: 30 });
    materials(k, { tone: 'off' });
    const flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const sp = (hh, o) => T.spectral(hh, o);
    // the hour: wall clock, or one day per loop (starting just before dawn)
    const H = cycle ? (5 + (t / LOOP) * 24) % 24 : (ctx.clock.h + ctx.clock.m / 60);
    const rise = ctx.params.sunrise, set = Math.max(rise + 4, ctx.params.sunset);
    const day = H >= rise && H <= set;
    const fd = (H - rise) / (set - rise), fn = (((H - set) % 24) + 24) % 24 / (24 - (set - rise));
    const e = day ? Math.sin(Math.PI * fd) : -Math.sin(Math.PI * fn);      // −1 deep night … 1 noon
    // horizon: inside a key low on the deck
    const rowOf = (y) => cells.reduce((b, c) => (Math.abs(c.y + c.h / 2 - y) < Math.abs(b.y + b.h / 2 - y) ? c : b), cells[0]);
    const hc = rowOf(h * (grid.rows <= 2 ? 0.72 : 0.66));
    const hy = hc.y + hc.h * (grid.rows <= 2 ? 0.42 : 0.5);
    // sky colors by sun elevation: top, middle, horizon
    const night0 = mix(T.dark ? T.colors.bg : '#0b1024', sp(262), 0.2), night1 = mix('#0d1430', sp(250), 0.3);
    const SKY = [
      [-1, night0, night0, night1],
      [-0.22, mix(night0, sp(270), 0.25), mix(night1, sp(285), 0.3), mix(night1, sp(320), 0.45)],
      [-0.04, mix('#1c2150', sp(275), 0.4), mix('#3a3070', sp(315), 0.5), mix('#e0806a', sp(35), 0.5)],
      [0.08, mix('#4a6ab0', sp(240), 0.4), mix('#c49ac0', sp(330), 0.3), mix('#ffc27a', sp(60), 0.4)],
      [0.3, mix('#5a9be0', sp(230), 0.4), mix('#9fcbef', sp(220), 0.3), mix('#e9eef0', sp(70), 0.15)],
      [1, mix('#3f88dd', sp(232), 0.4), mix('#7fb8ee', sp(225), 0.3), mix('#d6ecf8', sp(210), 0.2)],
    ];
    let [top, midC, low] = keyed(SKY, e);
    if (flat) top = midC = low = T.dark ? '#000000' : '#ffffff';
    const skyCells = cells.filter((c) => c.y < hy);
    backdrop(k, [[0, top, 0.96], [0.62, midC, 0.96], [1, low, 0.96]], { y2: hy, cells });
    const B = new Batch(grid);
    const light = clamp(0.5 + e * 0.9);                                   // 0 night … 1 day
    // stars after dusk
    const starO = flat ? (T.dark ? 0.8 : 0) : smoothstep(-0.05, -0.3, e);
    if (starO > 0.02) for (const c of skyCells) {
      let d = '';
      const bottom = Math.min(c.y + c.h, hy);
      for (let j = 0; j < 7; j++) d += dotD(c.x + c.w * hash(c.i, j, 1), c.y + (bottom - c.y) * hash(c.i, j, 2) * 0.92, Math.max(0.6, u * 0.45 * (0.6 + hash(c.i, j, 3))));
      B.add([c.x, c.y, c.x + c.w, bottom], fillP('#ffffff', Math.round(starO * 0.8 * 4) / 4), d, 0);
    }
    // the sun (day) or moon (night) on its arc, low at either end
    const arcX = (f) => lerp(w * 0.06, w * 0.94, f), arcY = (s) => hy + K * 0.05 - s * (hy - K * 0.42);
    const bodyF = day ? fd : fn, bodyE = Math.abs(e);
    let bx = arcX(bodyF), by = arcY(bodyE);
    {
      // never let the sun or moon park behind a bezel: it skips across the gaps instead
      const rr = K * 0.18;
      const near = cells.reduce((b, c) => { const dx = Math.max(c.x + rr - bx, 0, bx - (c.x + c.w - rr)), dy = Math.max(c.y + rr - by, 0, by - (c.y + c.h - rr)); const d = dx * dx + dy * dy; return d < b.d ? { c, d } : b; }, { c: null, d: Infinity }).c;
      bx = clamp(bx, near.x + rr, near.x + near.w - rr); by = clamp(by, near.y + rr, near.y + near.h - rr);
    }
    const sunC = flat ? lit(T) : day ? mix('#fff7e0', mix('#ff8a4a', sp(40), 0.4), 1 - smoothstep(0.05, 0.35, bodyE)) : mix('#f4f2ea', sp(80), 0.1);
    const gr = k.id('sun');
    k.def(radialGradient(gr, [[0, sunC, day ? 0.7 : 0.3], [0.3, sunC, day ? 0.26 : 0.1], [1, sunC, 0]], { cx: f1(bx), cy: f1(by), r: f1(K * (day ? 1.4 : 0.9)), fx: f1(bx), fy: f1(by), gradientUnits: 'userSpaceOnUse' }));
    for (const c of skyCells) if (Math.abs(c.x + c.w / 2 - bx) < K * 1.4 + c.w / 2 && Math.abs(c.y + c.h / 2 - by) < K * 1.4 + c.h / 2) k.add(`<path d="${rectD(c.x, c.y, c.w, Math.min(c.h, hy - c.y + K * 0.1))}" fill="${url(gr)}"/>`);
    const br = K * (day ? 0.16 : 0.13);
    if (flat) B.add([bx - br, by - br, bx + br, by + br], strokeP(lit(T), Math.max(1, u * 1.2), 1), dotD(bx, by, br), 1);
    else B.dot(bx, by, br, fillP(sunC, 1), 1);
    if (!day && !flat) {
      // the moon's shadow side, in the sky's own color at that height
      const fy = clamp(by / hy), skyAt = fy < 0.62 ? mix(top, midC, fy / 0.62) : mix(midC, low, (fy - 0.62) / 0.38);
      B.dot(bx + br * 0.4, by - br * 0.2, br * 0.85, fillP(skyAt, 0.96), 1);
    }
    // clouds: drift a pixel or so a second, whole laps per loop; tinted by the sky
    const cloudC = flat ? lit(T) : keyed([[-1, mix(night1, '#ffffff', 0.12)], [-0.05, mix('#e9a0a0', sp(340), 0.3)], [0.1, mix('#ffe0d0', sp(30), 0.2)], [0.35, '#ffffff'], [1, '#ffffff']].map(([ee, c]) => [ee, c]), e)[0];
    const nC = Math.max(2, Math.round(w / (K * 1.6)));
    for (let i = 0; i < nC; i++) {
      const span2 = w + K * 3;
      const x = ((hash(i, 41) * span2 + (t / LOOP) * span2 * (1 + (i % 2))) % span2) - K * 1.5;
      const y = K * 0.3 + (hy - K * 0.9) * hash(i, 42);
      const s = K * (0.22 + 0.2 * hash(i, 43));
      let d = '';
      for (let j = 0; j < 5; j++) d += ellipseD(Math.round(x + (j - 2) * s * 0.55), y - Math.sin((j / 4) * Math.PI) * s * 0.35, s * (0.45 + 0.2 * hash(i, j, 44)), s * (0.3 + 0.15 * hash(i, j, 45)));
      B.add([x - s * 1.8, y - s, x + s * 1.8, y + s * 0.5], flat ? strokeP(cloudC, Math.max(1, u), 0.8) : fillP(cloudC, e < 0 ? 0.35 : 0.85), d, 2);
    }
    // a few birds by day, drifting across the sky (a pixel a second)
    if (e > 0.12 && !flat) {
      const birdC = mix(top, '#1a2333', 0.6);
      for (let i = 0; i < Math.max(2, Math.round(w / (K * 2.2))); i++) {
        const span3 = w + K * 2, bxx = ((hash(i, 81) * span3 + (t / LOOP) * span3 * (2 + (i % 2))) % span3) - K;
        const byy = K * 0.35 + (hy - K * 1.1) * hash(i, 82), bs = K * (0.05 + 0.03 * hash(i, 83)), flap = Math.round(t * 2 + i) % 2 ? 0.35 : 0.1;
        B.add([bxx - bs * 1.2, byy - bs, bxx + bs * 1.2, byy + bs], strokeP(birdC, Math.max(1, u * 0.9), 0.85), `M${f1(bxx - bs)} ${f1(byy - bs * flap)}Q${f1(bxx - bs * 0.4)} ${f1(byy - bs * 0.7)} ${f1(bxx)} ${f1(byy)}Q${f1(bxx + bs * 0.4)} ${f1(byy - bs * 0.7)} ${f1(bxx + bs)} ${f1(byy - bs * flap)}`, 2);
      }
    }
    // the land: far hills on the horizon, near hills, trees and a house on the bottom rows
    const shadeOf = (c, f) => (flat ? (T.dark ? '#000000' : '#ffffff') : mix(mix('#05070d', c, 0.3 + 0.7 * light), low, f));
    const far = shadeOf(sp(220), 0.35), nearC = shadeOf(sp(150), 0.08), treeC = shadeOf(sp(140), 0);
    const hill = (base, amp, fr, ph) => { const pts = []; for (let x = -4; x <= w + 4; x += K / 12) pts.push([x, base - amp * (0.5 + 0.5 * Math.sin(x / K * fr + ph)) - amp * 0.3 * Math.sin(x / K * fr * 2.3 + ph * 1.7)]); return [...pts, [w + 4, h + 4], [-4, h + 4]]; };
    const H1 = hill(hy + K * 0.02, K * 0.18, 0.9, 1.3), H2 = hill(hy + K * 0.3, K * 0.32, 0.55, 4.1);
    for (const c of cells) {
      for (const [pts, col, layer] of [[H1, far, 3], [H2, nearC, 4]]) {
        const cl = clipPoly(pts, c);
        if (cl.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? fillP(col, 1) : fillP(col, 1), polyD(cl), layer);
      }
      if (flat) {
        // line-art land for 1-bit themes
        const edge = H2.slice(0, -2).filter(([x]) => x >= c.x - 2 && x <= c.x + c.w + 2).map(([x, y]) => [x, Math.min(Math.max(y, c.y), c.y + c.h)]);
        if (edge.length > 1) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(lit(T), Math.max(1, u * 1.1), 1), polyD(edge, false), 5);
      }
    }
    const ground = (x) => H2[Math.max(0, Math.min(H2.length - 3, Math.round((x + 4) / (K / 12))))][1];
    // trees (conifers) and a house, placed inside keys
    const land = cells.filter((c) => c.row === hc.row);
    const nT = Math.max(3, Math.round(w / K * 1.4));
    for (let i = 0; i < nT; i++) {
      const c = land[Math.floor(hash(i, 51) * land.length)];
      const x = c.x + c.w * (0.12 + 0.76 * hash(i, 52)), gy = ground(x);
      if (gy < c.y + c.h * 0.2 || gy > c.y + c.h) continue;
      const th = K * (0.22 + 0.16 * hash(i, 53));
      B.poly([[x, gy - th], [x + th * 0.26, gy - th * 0.35], [x + th * 0.13, gy - th * 0.38], [x + th * 0.32, gy], [x - th * 0.32, gy], [x - th * 0.13, gy - th * 0.38], [x - th * 0.26, gy - th * 0.35]], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(treeC, 1), 6);
    }
    const houseCell = land.find((c) => c.row === hc.row && Math.abs(c.x + c.w / 2 - w * 0.3) < c.w) || land[0];
    {
      const x = houseCell.x + houseCell.w * 0.5, gy = clamp(ground(x), houseCell.y + houseCell.h * 0.35, houseCell.y + houseCell.h - K * 0.05), s = K * 0.2;
      const wall = flat ? (T.dark ? '#000000' : '#ffffff') : shadeOf(sp(40), 0.05);
      const roof = flat ? lit(T) : shadeOf(sp(20), 0);
      B.add([x - s, gy - s * 1.6, x + s, gy], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(wall, 1), rectD(x - s * 0.7, gy - s * 0.9, s * 1.4, s * 0.9), 7);
      B.poly([[x - s * 0.85, gy - s * 0.85], [x, gy - s * 1.55], [x + s * 0.85, gy - s * 0.85]], fillP(roof, 1), 7);
      const lamp = smoothstep(0.02, -0.12, e);
      const winC = flat ? lit(T) : lamp > 0.05 ? mix(wall, mix(sp(85, { dl: 0.2 }), '#fff3c0', 0.4), lamp) : mix(wall, '#000000', 0.25);
      B.add([x - s, gy - s, x + s, gy], fillP(winC, 1), rectD(x - s * 0.35, gy - s * 0.62, s * 0.3, s * 0.28) + rectD(x + s * 0.08, gy - s * 0.62, s * 0.3, s * 0.28), 8);
    }
    // the foreground (decks with a row below the hills): a still lake that mirrors the sky, reeds
    const fore = cells.filter((c) => c.row > hc.row);
    if (fore.length && grid.rows > 2) {
      const ly = fore[0].y + fore[0].h * 0.42, lcx = w * 0.52, lrx = w * 0.38, lry = Math.min(K * 0.3, fore[0].h * 0.3);
      const lake = [];
      // an oval pond in perspective: a flatter far shore, a rounder near one
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, sy = Math.sin(a); lake.push([lcx + Math.cos(a) * lrx * (1 + 0.06 * Math.sin(a * 3)), ly + sy * lry * (sy < 0 ? 0.45 : 1)]); }
      const lakeC = flat ? (T.dark ? '#000000' : '#ffffff') : mix(mix(top, midC, 0.5), '#000000', 0.1);
      for (const c of fore) {
        const cl = clipPoly(lake, c);
        if (cl.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? strokeP(lit(T), Math.max(1, u), 1) : fillP(lakeC, 1), polyD(cl), 9);
        if (!flat && cl.length > 2) {
          // the sun's / moon's reflection: a few broken streaks under it
          let d = '';
          for (let j = 0; j < 4; j++) { const yy = ly + K * (0.06 + j * 0.08), half = K * (0.08 + j * 0.03) * (1 - 0.3 * hash(j, Math.floor(t))); if (yy > c.y && yy < c.y + c.h && bx > c.x - half && bx < c.x + c.w + half) d += rectD(bx - half, yy, half * 2, Math.max(1, u * 0.8)); }
          if (d) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(sunC, day ? 0.7 : 0.45), d, 10);
        }
        // reeds and grass in front
        let g = '';
        for (let j = 0; j < 14; j++) { const x = c.x + c.w * hash(c.i, j, 61), y0 = c.y + c.h, ht = c.h * (0.08 + 0.2 * hash(c.i, j, 62)); g += `M${f1(x - u)} ${f1(y0)}L${f1(x + (hash(c.i, j, 63) - 0.5) * K * 0.08)} ${f1(y0 - ht)}L${f1(x + u)} ${f1(y0)}Z`; }
        B.add([c.x, c.y, c.x + c.w, c.y + c.h], flat ? fillP(lit(T), 1) : fillP(treeC, 1), g, 11);
      }
    }
    B.emit(k);
    // the time, small, in the top-right key
    if (ctx.params.time) {
      const tr = cells.reduce((b, c) => (c.row < b.row || (c.row === b.row && c.col > b.col) ? c : b), cells[0]);
      const hh = Math.floor(H), mm = Math.floor((H - hh) * 60);
      inCell(k, tr, (kk) => kk.eyebrow(`${pad2(hh)}:${pad2(mm)}`, { align: 'right', color: flat ? 'ink' : '#ffffff', opacity: 0.85 }), 'time');
    }
    return k.svg();
  },
};
