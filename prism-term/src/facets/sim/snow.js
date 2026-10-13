// Snow over a cabin. Three parallax layers of flakes sway down through a gusty
// wind; the near layer actually lands, building drifts on the ground and a
// cap on the roof, and the drifts slump downwind once they get too steep.
// The cabin's window glows (and spills warm light onto the snow), the chimney
// smokes, and dark pines stand behind it all.
import { NONE, mix as blend, luminance } from '../../color.js';

export default {
  title: 'Snow over a Cabin',
  gallery: 'sim',
  category: 'Weather',
  kind: 'scene',
  tags: ['snow', 'winter', 'cabin', 'drifts', 'weather', 'particles', 'night'],
  order: 20,
  description: 'Parallax snowfall in a gusty wind that settles into drifts and a roof cap, around a cabin with a glowing window.',
  size: { w: 64, h: 22 },
  minSize: { w: 24, h: 8 },
  loop: 30,
  canvas: 'field',
  palette: 'ice',
  params: { density: { default: 1, min: 0.2, max: 3, label: 'Snowfall' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, asp = cv.aspect, px = cv.px, th = ctx.theme;
    const rand = ctx.rng, noise = ctx.noise;
    const dense = ctx.param('density', 1);
    const night = luminance(th.bg) < 0.5;
    const skyTop = blend(th.bg, night ? 0x10204a : 0x9fb4cc, 0.45);
    const snowC = night ? 0xe8f0ff : 0xffffff, snowShade = night ? 0x7f93b8 : 0xb8c6d8;
    // Terrain: gentle hills, plus a far ridge silhouette.
    const ground = new Float32Array(W), ridge = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      ground[x] = H * 0.8 + Math.sin(x * 0.07 + 1) * H * 0.04 + noise.noise2(x * 0.05, 3.1) * H * 0.03;
      ridge[x] = H * 0.52 + noise.fbm(x * 0.03, 7.7, 0, 3) * H * 0.18;
    }
    const snow = new Float32Array(W).fill(1); // settled depth (pixels)
    const CAP = H * 0.12;
    // Cabin.
    const cw = Math.max(8, Math.round(W * 0.2)), cx0 = Math.round(W * 0.56), cx1 = cx0 + cw;
    const floorY = Math.round(Math.max(...Array.from({ length: cw }, (_, i) => ground[Math.min(W - 1, cx0 + i)])));
    const wallH = Math.max(4, Math.round(H * 0.16)), roofH = Math.max(3, Math.round(cw * 0.32 / asp * 1.2));
    const eave = 2;
    const roofAt = (x) => floorY - wallH - roofH * (1 - Math.abs((x - (cx0 + cx1) / 2) / (cw / 2 + eave)));
    const roofSnow = new Float32Array(W);
    const chimX = cx0 + Math.round(cw * 0.72), chimTop = Math.round(roofAt(chimX)) - Math.max(2, Math.round(roofH * 0.4));
    // Pines.
    const pines = Array.from({ length: Math.max(2, Math.round(W / 22)) }, (_, i) => {
      const x = Math.round(W * (0.08 + i * 0.3 + rand() * 0.08));
      return { x, h: H * (0.32 + rand() * 0.14), w: W * 0.05 + rand() * W * 0.02 };
    }).filter((p) => p.x + p.w < cx0 - 2 || p.x - p.w > cx1 + 2);
    // Flakes in three parallax layers; only the near layer settles.
    const flakes = Array.from({ length: Math.round(((W * H) / 26) * dense) }, () => {
      const z = [0.35, 0.65, 1][Math.floor(rand() * 3)];
      return { x: rand() * W, y: rand() * H, z, ph: rand() * 6.28, sw: 0.5 + rand() * 1.5 };
    });
    const smoke = Array.from({ length: 22 }, (_, i) => ({ age: i / 22, ph: rand() * 6.28 }));
    const surface = (x) => {
      const xi = Math.max(0, Math.min(W - 1, x | 0));
      if (xi >= cx0 - eave && xi <= cx1 + eave) return roofAt(xi) - roofSnow[xi];
      return ground[xi] - snow[xi];
    };

    let last = 0;
    return (t, dt) => {
      dt = Math.min(0.1, Math.max(0, dt));
      const wind = 0.9 * Math.sin(t * 0.13) + 0.6 * noise.noise2(t * 0.3, 0.5);
      // Flakes.
      for (const f of flakes) {
        f.y += dt * (4 + 7 * f.z) * (H / 44);
        f.x += dt * (wind * 6 * f.z + Math.sin(t * f.sw + f.ph) * 1.4);
        if (f.x < 0) f.x += W; else if (f.x >= W) f.x -= W;
        const xi = f.x | 0;
        if (f.z === 1 && f.y >= surface(f.x)) {
          if (xi >= cx0 - eave && xi <= cx1 + eave) { if (roofSnow[xi] < CAP * 0.45) roofSnow[xi] += 0.35; }
          else if (snow[xi] < CAP + (xi % 7) * 0.2) snow[xi] += 0.35;
          f.y = -rand() * 4; f.x = rand() * W;
        } else if (f.y > H) { f.y = -rand() * 4; f.x = rand() * W; }
      }
      // Drifts slump when steep, a little more readily downwind.
      if (t - last > 0.05) {
        last = t;
        for (let x = 1; x < W - 1; x++) {
          for (const s of [-1, 1]) {
            const h0 = ground[x] - snow[x], h1 = ground[x + s] - snow[x + s];
            const lim = s * wind > 0 ? 0.9 : 1.6;
            if (h1 - h0 > lim && snow[x] > 0.3) { snow[x] -= 0.12; snow[x + s] += 0.12; }
          }
        }
        for (let x = 1; x < W - 1; x++) snow[x] += 0.03 * (snow[x - 1] + snow[x + 1] - 2 * snow[x]);
        for (let x = cx0 - eave + 1; x < cx1 + eave; x++) roofSnow[x] = Math.min(roofSnow[x], (roofSnow[x - 1] + roofSnow[x + 1]) / 2 + 0.6);
      }
      // Draw: sky, ridge, pines, ground + snow, cabin, smoke, flakes.
      for (let y = 0; y < H; y++) {
        const sky = blend(skyTop, th.bg, y / (H * 0.8));
        for (let x = 0; x < W; x++) px[y * W + x] = y > ridge[x] ? blend(sky, night ? 0x1a2236 : 0xc9d3de, 0.6) : sky;
      }
      const flick = 0.85 + 0.15 * noise.noise2(t * 3, 9.1);
      const winX0 = cx0 + Math.round(cw * 0.2), winX1 = winX0 + Math.max(2, Math.round(cw * 0.25));
      const winY0 = floorY - wallH + Math.round(wallH * 0.25), winY1 = winY0 + Math.max(1, Math.round(wallH * 0.4));
      for (const p of pines) {
        const base = Math.round(ground[Math.max(0, Math.min(W - 1, p.x))]);
        for (let y = Math.round(base - p.h); y < base; y++) {
          const f = (y - (base - p.h)) / p.h, tier = (f * 3) % 1;
          const half = p.w * (0.25 + 0.75 * f) * (0.55 + 0.45 * tier);
          for (let x = Math.round(p.x - half); x <= Math.round(p.x + half); x++) {
            if (x < 0 || x >= W || y < 0) continue;
            const edge = tier < 0.18 && Math.abs(x - p.x) > half * 0.3;
            px[y * W + x] = edge ? blend(snowShade, snowC, 0.4) : blend(0x0d2a1c, 0x1f5a3a, 0.4 + 0.3 * ((x - p.x) / (half + 1)));
          }
        }
      }
      for (let x = 0; x < W; x++) {
        const g = ground[x], top = g - snow[x];
        const slope = (snow[Math.min(W - 1, x + 1)] - snow[Math.max(0, x - 1)]) * 0.5;
        for (let y = Math.max(0, Math.floor(top)); y < H; y++) {
          const i = y * W + x;
          // Fresh snow on top, older snowpack below it, a little bluer with depth.
          let c = y < g ? blend(snowShade, snowC, Math.min(1, 0.68 + slope * 0.4 + (y - top) * 0.04))
            : blend(snowShade, snowC, Math.max(0.15, 0.55 - (y - g) * 0.05));
          const glowD = Math.hypot((x - (winX0 + winX1) / 2) / (cw * 0.6), (y - floorY) / 3);
          if (glowD < 1) c = blend(c, 0xffc46b, (1 - glowD) * 0.35 * flick);
          // Anti-alias the surface: the top pixel is only partly covered.
          px[i] = y === Math.floor(top) ? blend(px[i], c, 1 - (top - y)) : c;
        }
      }
      // Cabin: walls, window, door, chimney, roof and its snow cap.
      for (let y = floorY - wallH; y < floorY; y++) for (let x = cx0; x < cx1; x++) {
        if (y < 0 || y >= H) continue;
        let c = blend(0x3a2414, 0x6a4326, (y & 1) ? 0.55 : 0.75); // log courses
        if (x >= winX0 && x < winX1 && y >= winY0 && y < winY1) c = blend(0xffb347, 0xffe7a3, flick * 0.7);
        const dx0 = cx1 - Math.round(cw * 0.32);
        if (x >= dx0 && x < dx0 + Math.max(2, Math.round(cw * 0.18)) && y >= floorY - Math.round(wallH * 0.75)) c = 0x2a180c;
        px[y * W + x] = c;
      }
      for (let y = chimTop; y < roofAt(chimX); y++) for (let x = chimX; x < chimX + 2; x++) if (y >= 0 && x < W) px[y * W + x] = 0x5a3a2a;
      for (let x = cx0 - eave; x <= cx1 + eave; x++) {
        if (x < 0 || x >= W) continue;
        const r = roofAt(x);
        for (let y = Math.max(0, Math.floor(r - roofSnow[x])); y < Math.min(H, floorY - wallH + 1); y++) {
          if (y < r) px[y * W + x] = blend(snowShade, snowC, 0.8);
          else if (y < r + 1.5) px[y * W + x] = 0x2b1a12;
        }
      }
      for (const s of smoke) {
        const a = (s.age + t * 0.12) % 1;
        const x = chimX + 1 + a * 9 * (0.6 + wind * 0.5) + Math.sin(a * 6 + s.ph) * 1.2, y = chimTop - a * H * 0.45;
        const k = (1 - a) * 0.5;
        for (const [ox, oy] of [[0, 0], [1, 0], [0, -1]]) {
          const xx = Math.round(x + ox), yy = Math.round(y + oy);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          px[yy * W + xx] = blend(px[yy * W + xx], night ? 0x8a93a6 : 0x8f99a6, k);
        }
      }
      for (const f of flakes) {
        const xx = f.x | 0, yy = f.y | 0;
        if (yy < 0 || yy >= H || f.y > surface(f.x)) continue; // hidden by the ground in front
        const i = yy * W + xx;
        px[i] = blend(px[i] === NONE ? th.bg : px[i], snowC, 0.35 + 0.65 * f.z);
      }
      cv.paint(ctx.buffer);
    };
  },
};
