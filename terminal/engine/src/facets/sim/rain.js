// Night rain over a city: three parallax layers of slanted braille rain (far
// drops slow, short and dim; near drops fast and long), splashes on the street
// and rooftops, lit windows that come and go, and lightning — a branching bolt
// whose double-flicker flash floods the sky and throws the skyline into
// silhouette.
import { mix, NONE } from '../../color.js';

const FLASH = 0xdfe8ff, BOLT = 0xf4f7ff;
const WINDOW = [0xffc46b, 0xffd99a, 0xffb347, 0x9fd3ff, 0xfff0c8];

export default {
  title: 'Night Rain',
  gallery: 'sim',
  category: 'Weather',
  kind: 'scene',
  tags: ['rain', 'city', 'lightning', 'night'],
  order: 60,
  description: 'Parallax rain over a city skyline — street and rooftop splashes, flickering windows, and lightning that silhouettes the city.',
  canvas: 'line',
  setup(ctx) {
    const th = ctx.theme;
    const rand = ctx.rng;
    const sky = ctx.canvas('field');
    const rain = ctx.canvas('line');
    const { width: W, height: H, aspect } = rain;
    const SW = sky.width, SH = sky.height;
    const intensity = ctx.param('intensity', 1);
    const base = ctx.bg === NONE ? 0x0b0f18 : ctx.bg;
    const skyTop = mix(base, 0x000000, 0.35), skyLow = mix(base, th.info, 0.16);

    // ── skyline (in sky-canvas pixels) ──
    const roof = new Int32Array(SW).fill(SH);
    const buildings = [];
    for (let x = -2; x < SW;) {
      const w = Math.max(3, Math.round(SW * (0.03 + rand() * 0.06)));
      const h = Math.round(SH * (0.14 + Math.pow(rand(), 1.6) * 0.42));
      const top = SH - h;
      buildings.push({ x, w, top, spire: rand() < 0.18, tone: 0.45 + rand() * 0.25 });
      for (let k = Math.max(0, x); k < Math.min(SW, x + w); k++) roof[k] = top;
      x += w + (rand() < 0.3 ? 1 : 0);
    }
    for (const b of buildings) if (b.spire) {
      const sx = b.x + (b.w >> 1), sh = Math.max(2, Math.round(SH * 0.06));
      for (let y = b.top - sh; y < b.top; y++) if (sx >= 0 && sx < SW) roof[sx] = Math.min(roof[sx], y);
    }
    const windows = [];
    for (const b of buildings)
      for (let y = b.top + 2; y < SH - 2; y += 2)
        for (let x = b.x + 1; x < b.x + b.w - 1; x += 2)
          if (x >= 0 && x < SW && rand() < 0.42) windows.push({ x, y, c: WINDOW[Math.floor(rand() * WINDOW.length)], phase: rand() * 100, rate: 0.05 + rand() * 0.2 });
    const silhouette = mix(base, 0x000000, 0.55);

    // Rain-canvas roof height at a rain-canvas x.
    const roofAt = (x) => (roof[Math.max(0, Math.min(SW - 1, Math.floor((x / W) * SW)))] / SH) * H;

    // ── rain layers ──
    const area = (ctx.width * ctx.height) / 3000 * (rain.mode === "braille" ? 1 : 0.3);
    const LAYERS = [
      { n: 360, v: 0.85, len: 2, k: 0.3, roof: false },
      { n: 210, v: 1.35, len: 4, k: 0.52, roof: true },
      { n: 90, v: 2.2, len: 7, k: 0.9, roof: false },
    ];
    const drops = [];
    for (let li = 0; li < LAYERS.length; li++) {
      const L = LAYERS[li];
      const n = Math.max(8, Math.round(L.n * area * intensity));
      for (let i = 0; i < n; i++) drops.push({ li, x: rand() * W * 1.3 - W * 0.15, y: rand() * H, s: 0.85 + rand() * 0.3 });
    }
    const splashes = [];
    const rainCol = mix(th.info, 0xc8d6ff, 0.5);

    let nextStrike = 2.5 + rand() * 2, strikeAt = -10, bolt = [];
    const makeBolt = () => {
      const segs = [];
      const grow = (x, y, dir, depth, w) => {
        const target = roofAt(x) - 1;
        while (y < target) {
          const ny = y + 2 + rand() * 4, nx = x + dir * (rand() * 2) + (rand() - 0.5) * 5;
          segs.push([x, y, nx, ny, w]);
          if (depth < 2 && rand() < 0.12) grow(nx, ny, rand() < 0.5 ? -1 : 1, depth + 1, w * 0.5);
          x = nx; y = ny;
          if (depth > 0 && rand() < 0.06) return;
        }
      };
      grow(W * (0.15 + rand() * 0.7), 0, rand() < 0.5 ? -0.5 : 0.5, 0, 1);
      return segs;
    };

    return (t, dt) => {
      // Lightning envelope: a sharp flash and two decaying re-strikes.
      if (t >= nextStrike) { strikeAt = t; bolt = makeBolt(); nextStrike = t + 5 + rand() * 6; }
      const u = t - strikeAt;
      const f = u < 0 || u > 1.2 ? 0 : Math.min(1, Math.exp(-u * 9) + (u > 0.16 ? 0.7 * Math.exp(-(u - 0.16) * 7) : 0) + (u > 0.42 ? 0.35 * Math.exp(-(u - 0.42) * 10) : 0));
      const wind = 0.22 + 0.14 * Math.sin(t * 0.17) + 0.06 * Math.sin(t * 0.71);

      // Sky: a vertical gradient on cell backgrounds, lit by the flash.
      const buf = ctx.buffer;
      for (let y = 0; y < ctx.height; y++) {
        const c = mix(mix(skyTop, skyLow, Math.pow(y / Math.max(1, ctx.height - 1), 1.5)), FLASH, f * 0.8);
        buf.fill(0, y, ctx.width, 1, ' ', undefined, c);
      }

      // Skyline and windows.
      sky.clear();
      for (const b of buildings) {
        const c = mix(silhouette, 0x000000, f * 0.6);
        for (let y = b.top; y < SH; y++) for (let x = Math.max(0, b.x); x < Math.min(SW, b.x + b.w); x++) sky.px[y * SW + x] = c;
      }
      const spire = mix(silhouette, 0x000000, f * 0.6);
      for (let x = 0; x < SW; x++) for (let y = roof[x]; y < SH; y++) if (sky.px[y * SW + x] === NONE) sky.px[y * SW + x] = spire;
      for (const w of windows) {
        const on = Math.sin(w.phase + t * w.rate) > -0.35;
        if (on) sky.px[w.y * SW + w.x] = mix(w.c, 0x000000, 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(w.phase * 3 + t * 0.7)));
      }
      sky.paint(buf);

      // Rain, splashes, bolt.
      rain.clear();
      const lit = 1 + f * 0.9;
      for (const d of drops) {
        const L = LAYERS[d.li];
        const v = L.v * H * d.s;
        d.y += v * dt;
        d.x += v * wind * dt;
        const floor = L.roof ? roofAt(d.x) : H - 1;
        if (d.y >= floor) {
          if (d.li === 2 || (L.roof && d.y < H - 1)) {
            const n = d.li === 2 ? 3 : 1;
            for (let k = 0; k < n; k++) splashes.push({ x: d.x, y: floor - 1, vx: (rand() - 0.5) * H * 0.35, vy: -H * (0.25 + rand() * 0.3), life: 0.22 + rand() * 0.12, k: L.k });
          }
          d.y = -rand() * H * 0.2;
          d.x = rand() * W * 1.3 - W * 0.3;
          continue;
        }
        const len = L.len * Math.max(1, H / 120) * (0.8 + 0.4 * d.s);
        const k = Math.min(1, L.k * lit);
        const c = mix(base, rainCol, k);
        rain.line(d.x - len * wind, (d.y - len) / aspect, d.x, d.y / aspect, c);
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.vy += H * 2.4 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (s.life <= 0) { splashes.splice(i, 1); continue; }
        rain.set(s.x, s.y / aspect, mix(base, rainCol, Math.min(1, s.k * lit)));
      }
      if (f > 0.2) {
        const c = mix(rainCol, BOLT, Math.min(1, f * 1.2));
        for (const [x0, y0, x1, y1, w] of bolt) if (w >= 0.5 || f > 0.5) rain.line(x0, y0 / aspect, x1, y1 / aspect, c);
      }
      rain.paint(buf);
    };
  },
};
