// A moonlit lake painted the way ANSI artists did it: a procedural scene
// encoded cell by cell into VGA colors and ░▒▓ shading. Moonlit ridges,
// pine silhouettes, twinkling stars, a shivering reflection, the odd meteor.
import { bbsPalette, lerpc, hash2 } from './_kit.js';
import { ansify } from './_bbs.js';

export default {
  title: 'ANSI Moonlit Lake',
  gallery: 'retro',
  category: 'BBS & ANSI Art',
  kind: 'art',
  tags: ['ansi', 'landscape', 'moon', 'lake', 'bbs', 'shading', 'night'],
  order: 40,
  description: 'A moonlit lake in true ANSI shading — VGA colors and ░▒▓ dithers — with twinkling stars and a rippling reflection.',
  size: { w: 80, h: 22 },
  minSize: { w: 30, h: 8 },
  loop: 10,
  color: '16',
  params: { colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' } },
  setup(ctx) {
    const P = bbsPalette(ctx);
    const W = ctx.width, H = ctx.height, PH = H * 2;
    const { fbm } = ctx.noise;
    const rng = ctx.rng;
    const img = new Int32Array(W * PH);
    const isSky = new Uint8Array(W * PH);
    const shore = Math.floor(PH * 0.6);
    const moon = { x: W * 0.74, y: PH * 0.16, r: Math.max(2.2, Math.min(W * 0.055, PH * 0.11)) };

    // Far range: one continuous ridge of a few octaves; near hills low and soft.
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    const peak = (v) => Math.pow(1 - Math.abs(Math.sin(v)), 1.6);   // ridged: sharp tops, round valleys
    const ridge = (u) => 0.62 * peak(u * 4.4 + ph[0]) + 0.26 * peak(u * 9.7 + ph[1]) + 0.1 * peak(u * 21 + ph[2]) + 0.03 * fbm(u * 12, 2, 0, 2);
    const far = new Float32Array(W), near = new Float32Array(W), lit = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      far[x] = shore - PH * (0.07 + 0.4 * Math.max(0, ridge(u)));
      near[x] = shore - PH * (0.035 + 0.05 * (0.5 + 0.5 * Math.sin(u * 7.3 + 1.1)) + 0.015 * fbm(u * 6, 5, 0, 2));
      // Slopes descending toward the moon (on the right) catch the light.
      lit[x] = ridge(u + 1.5 / W) < ridge(u - 1.5 / W) ? 1 : 0;
    }
    const snowLine = shore - PH * 0.36;
    // Pines along the near hills: narrow triangles of varying height.
    const pine = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      if (hash2(x, 7) > 0.18) continue;
      const h = PH * (0.05 + hash2(x, 9) * 0.06);
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < W) pine[xx] = Math.max(pine[xx], h * (1 - Math.abs(dx) / 2.6));
      }
    }
    const stars = Array.from({ length: Math.max(6, Math.round(W * H * 0.035)) }, (_, i) => [Math.floor(hash2(i, 1) * W), Math.floor(hash2(i, 2) * (shore * 0.75)), hash2(i, 3)]);
    const mid = P[1], horizon = lerpc(P[5], P[13], 0.25);
    const ridgeBody = lerpc(P[1], P[0], 0.7), ridgeRim = lerpc(P[8], P[7], 0.3);

    function sky(x, y) {
      const v = y / shore;
      let c = v < 0.7 ? lerpc(P[0], mid, Math.pow(v / 0.7, 1.8)) : lerpc(mid, horizon, Math.pow((v - 0.7) / 0.3, 1.2));
      const dx = x + 0.5 - moon.x, dy = y + 0.5 - moon.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < moon.r) {
        c = d < moon.r * 0.82 ? P[15] : P[7];
        if (hash2(Math.floor(dx * 1.5 + 9), Math.floor(dy * 1.5 + 9), 3) > 0.82 && d < moon.r * 0.7) c = P[7];   // craters
      } else if (d < moon.r * 2) c = lerpc(c, P[9], (1 - (d - moon.r) / moon.r) * 0.45);
      return c;
    }
    function land(x, y) {
      if (y >= near[x] - pine[x]) return P[0];
      if (y >= far[x]) {
        const depth = y - far[x];
        if (depth < 1.5 && far[x] < snowLine) return P[7];
        return lit[x] && depth < 1.2 ? ridgeRim : ridgeBody;
      }
      return -1;
    }

    return (t) => {
      isSky.fill(0);
      for (let y = 0; y < PH; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let c;
        if (y < shore) {
          c = land(x, y);
          if (c < 0) { c = sky(x, y); isSky[i] = 1; }
        } else {
          // Water: the mirrored scene, displaced by ripples and darkened with depth.
          const my = 2 * shore - y - 1;
          const k = (y - shore) / Math.max(1, PH - shore);
          const ripple = Math.round((Math.sin(y * 1.9 + t * Math.PI) * 0.6 + Math.sin(y * 0.7 - t * Math.PI * 0.6) * 0.5) * k * 2.2);
          const mx = Math.min(W - 1, Math.max(0, x + ripple));
          let m = my >= 0 ? land(mx, my) : P[0];
          if (m < 0) m = sky(mx, Math.max(0, my));
          c = lerpc(m, P[1], 0.45);
        }
        img[i] = c;
      }
      ansify(ctx.buffer, img, W, H, 0, 0, P);
      const b = ctx.buffer;
      for (const [x, y, k] of stars) {
        if (!isSky[y * W + x] || !isSky[(y ^ 1) * W + x]) continue;
        const tw = Math.sin((t * Math.PI * (2 + Math.floor(k * 5))) / 5 + k * 40);
        if (tw > 0.1) b.set(x, y >> 1, tw > 0.85 ? '*' : k > 0.55 ? '+' : '.', tw > 0.85 ? P[15] : k > 0.3 ? P[7] : P[8]);
      }
      // Glitter on the water under the moon.
      const gx = Math.round(moon.x);
      for (let row = Math.ceil(shore / 2); row < H; row++) {
        const spread = 1 + (row - shore / 2) * 0.6;
        for (let j = 0; j < 3; j++) {
          const x = Math.round(gx + (hash2(row, j + Math.floor(t * 4) * 3, 5) - 0.5) * 2 * spread);
          if (x >= 0 && x < W && hash2(row, j, Math.floor(t * 6)) > 0.45) b.set(x, row, hash2(x, row) > 0.5 ? '~' : '-', j ? P[11] : P[15]);
        }
      }
      // A meteor every five seconds.
      const mt = t % 5;
      if (mt < 0.8) {
        const k = Math.floor(t / 5);
        const sx = hash2(k, 11) * W * 0.5 + W * 0.05, sy = hash2(k, 12) * shore * 0.3;
        for (let i = 0; i < 7; i++) {
          const px = Math.round(sx + mt * W * 0.45 - i * 1.6), py = Math.round((sy + mt * shore * 0.5 - i * 0.7) / 2);
          if (py >= 0 && py < H && px >= 0 && px < W && isSky[py * 2 * W + px]) b.set(px, py, i === 0 ? '*' : i < 3 ? '-' : '·', i < 2 ? P[15] : i < 4 ? P[11] : P[3]);
        }
      }
    };
  },
};
