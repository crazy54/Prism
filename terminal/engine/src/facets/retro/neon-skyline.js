// A neon city at night drifting past in three parallax layers: hazy far
// towers, mid-rise blocks full of lit windows, near buildings trimmed in neon
// with flickering signs — searchlights sweeping the clouds, traffic streaming
// along the waterfront, and the whole thing mirrored in a rippling harbour.
import { lerpc, hash2 } from './_kit.js';

const LOOP = 40;
const add = (a, b, k) => {
  const r = Math.min(255, ((a >> 16) & 255) + ((b >> 16) & 255) * k);
  const g = Math.min(255, ((a >> 8) & 255) + ((b >> 8) & 255) * k);
  const bl = Math.min(255, (a & 255) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};

export default {
  title: 'Neon Skyline',
  gallery: 'retro',
  category: 'Outrun',
  kind: 'scene',
  tags: ['city', 'skyline', 'neon', 'night', 'parallax', 'reflection', 'synthwave', 'cyberpunk'],
  order: 20,
  description: 'A neon city drifting past in parallax: lit windows, neon trim, searchlights, waterfront traffic and a rippling harbour.',
  size: { w: 80, h: 22 },
  minSize: { w: 24, h: 8 },
  loop: LOOP,
  canvas: 'field',
  palette: 'synthwave',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: PW, height: PH, px, aspect } = cv;
    const waterY = Math.floor(PH * 0.72);
    const road = waterY - Math.max(2, Math.round(PH * 0.03));
    const pitch = Math.max(2, Math.round(PH / 24));                 // window grid in pixels
    const neon = [0xff3fd0, 0x3ff0ff, 0xffe45a, pal(0.62), 0x7a5cff];
    const scale = Math.max(1, PW / 80);
    // Each layer is a strip of buildings exactly one loop's travel long, so the drift repeats seamlessly.
    const LAYERS = [
      { speed: PW / 20, hMin: 0.22, hMax: 0.6, wMin: 4, wMax: 10, body: lerpc(pal(0.1), pal(0.24), 0.5), lit: 0.16, haze: 0.45 },
      { speed: PW / 10, hMin: 0.16, hMax: 0.48, wMin: 5, wMax: 12, body: lerpc(pal(0.07), pal(0.16), 0.5), lit: 0.42, haze: 0.18 },
      { speed: PW / 5, hMin: 0.08, hMax: 0.36, wMin: 8, wMax: 17, body: lerpc(pal(0.02), 0x000000, 0.5), lit: 0.3, haze: 0, near: true },
    ].map((L, li) => {
      const len = Math.round(L.speed * LOOP);
      const owner = new Int32Array(len), local = new Int32Array(len), bs = [];
      let x = 0, j = 0;
      while (x < len) {
        let w = Math.round((L.wMin + hash2(j, li, 1) * (L.wMax - L.wMin)) * scale);
        if (len - x - w < L.wMin * scale) w = len - x;
        const top = waterY - Math.round(PH * (L.hMin + Math.pow(hash2(j, li, 2), 1.3) * (L.hMax - L.hMin)));
        bs.push({ w, top, trim: L.near && hash2(j, li, 3) < 0.5, sign: L.near && hash2(j, li, 7) < 0.4, c: neon[Math.floor(hash2(j, li, 4) * neon.length)], mast: hash2(j, li, 5) < 0.3, tone: hash2(j, li, 6) });
        for (let i = 0; i < w && x + i < len; i++) { owner[x + i] = j; local[x + i] = i; }
        x += w; j++;
      }
      return { ...L, len, owner, local, bs };
    });
    const skyTop = pal(0.01), skyMid = pal(0.14), skyLow = pal(0.42);
    const stars = Array.from({ length: Math.round(PW * PH * 0.005) }, (_, i) => [Math.floor(hash2(i, 9) * PW), Math.floor(hash2(i, 8) * waterY * 0.45), hash2(i, 7)]);
    const above = new Int32Array(PW * waterY);
    const warm = 0xffd38a, cool = 0xa8ecff;
    const beams = [{ x: 0.28, ph: 0, sp: 0.31 }, { x: 0.71, ph: 2.1, sp: 0.23 }];

    return (t) => {
      const lt = t % LOOP;
      for (let y = 0; y < waterY; y++) {
        const v = y / waterY;
        above.fill(v < 0.5 ? lerpc(skyTop, skyMid, v / 0.5) : lerpc(skyMid, skyLow, Math.pow((v - 0.5) / 0.5, 1.3)), y * PW, (y + 1) * PW);
      }
      for (const [x, y, k] of stars) if (Math.sin((t * Math.PI * (1 + Math.floor(k * 3))) / 10 + k * 30) > -0.2) above[y * PW + x] = lerpc(skyMid, 0xffffff, 0.45 + k * 0.4);
      // Searchlights: soft additive cones swinging slowly across the sky.
      for (const bm of beams) {
        const ang = Math.sin((lt * Math.PI * 2 * 2) / LOOP + bm.ph) * 0.55;    // two sweeps per loop
        const ox = bm.x * PW, oy = waterY, dx = Math.sin(ang), dy = -Math.cos(ang);
        for (let y = 0; y < waterY; y++) for (let x = 0; x < PW; x++) {
          const vx = x + 0.5 - ox, vy = (y + 0.5 - oy) * aspect;
          const along = vx * dx + vy * dy;
          if (along <= 0) continue;
          const across = Math.abs(vx * dy - vy * dx), width = 0.6 + along * 0.09;
          if (across < width) above[y * PW + x] = add(above[y * PW + x], pal(0.7), 0.32 * (1 - across / width) * Math.max(0, 1 - along / (PW * 0.9)));
        }
      }
      for (const L of LAYERS) {
        const scroll = lt * L.speed;
        for (let x = 0; x < PW; x++) {
          const wx = Math.floor(x + scroll) % L.len, j = L.owner[wx], lx = L.local[wx], bd = L.bs[j];
          for (let y = Math.max(0, bd.top); y < waterY; y++) {
            let c = L.haze ? lerpc(L.body, skyLow, L.haze * (0.4 + 0.6 * ((y - bd.top) / (waterY - bd.top)))) : L.body;
            const wy = y - bd.top - 1, edge = lx === 0 || lx === bd.w - 1;
            if (!edge && wy > 0 && lx % pitch === 1 && wy % pitch === 1) {
              const cxI = (lx / pitch) | 0, cyI = (wy / pitch) | 0;
              const on = hash2(j * 31 + cxI, cyI, Math.floor(lt / 8 + hash2(j, cxI, cyI) * 5)) < L.lit;
              if (on) c = lerpc(bd.tone < 0.65 ? warm : cool, c, L.haze * 0.9);
            }
            if (bd.sign && lx >= 2 && lx < 2 + pitch && wy > pitch && wy < pitch * 7) {
              const flick = hash2(j, Math.floor(t * 12), 5) < 0.05 ? 0.2 : 1;
              c = lerpc(L.body, wy % (pitch * 2) < pitch ? bd.c : lerpc(bd.c, 0xffffff, 0.4), flick);
            }
            above[y * PW + x] = c;
          }
          // Neon trim along the roofline and down the edges of some near buildings.
          if (bd.trim && bd.top >= 0) {
            above[bd.top * PW + x] = bd.c;
            if (lx === 0 || lx === bd.w - 1) for (let y = bd.top; y < Math.min(road, bd.top + pitch * 4); y++) above[y * PW + x] = lerpc(bd.c, L.body, (y - bd.top) / (pitch * 4));
          }
          if (bd.mast && lx === bd.w >> 1) {
            const mh = Math.max(2, pitch * 2);
            for (let y = Math.max(0, bd.top - mh); y < bd.top; y++) above[y * PW + x] = L.body;
            if ((lt + j * 0.37) % 2 < 0.5 && bd.top - mh - 1 >= 0) above[(bd.top - mh - 1) * PW + x] = lerpc(L.body, 0xff3040, L.haze ? 0.55 : 1);
          }
        }
      }
      // Waterfront road: a dark deck with headlights streaming right and tail-lights left.
      for (let y = road; y < waterY; y++) above.fill(0x0a0612, y * PW, (y + 1) * PW);
      for (let i = 0; i < Math.ceil(PW / 14); i++) {
        const xr = Math.floor((hash2(i, 1) * PW + lt * PW * 0.25) % PW), xl = Math.floor((((hash2(i, 2) * PW - lt * PW * 0.2) % PW) + PW) % PW);
        above[road * PW + xr] = 0xfff4d0;
        if (road + 1 < waterY) above[(road + 1) * PW + xl] = 0xff3a3a;
      }
      for (let x = (PW >> 3) % 7; x < PW; x += 7) above[(road - 1) * PW + x] = lerpc(warm, above[(road - 1) * PW + x], 0.3);
      px.set(above);
      // Harbour: the city upside down, rippled sideways, lights stretching into streaks.
      const water = lerpc(skyTop, 0x000000, 0.3);
      for (let y = waterY; y < PH; y++) {
        const d = y - waterY, k = d / Math.max(1, PH - waterY);
        const my = waterY - 1 - Math.floor(d * 0.8);
        const off = Math.round(Math.sin(d * 1.3 + (t * Math.PI * 2 * 8) / LOOP) * (0.5 + k * 2) + Math.sin(d * 0.5 - (t * Math.PI * 2 * 5) / LOOP) * k * 1.4);
        for (let x = 0; x < PW; x++) {
          const sx = Math.min(PW - 1, Math.max(0, x + off));
          const src = my >= 0 ? above[my * PW + sx] : skyTop;
          px[y * PW + x] = lerpc(src, water, 0.38 + k * 0.3);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
