// Arcade-racer pseudo-3D: a road built row by row from the horizon down, with
// curvature integrated per scanline so it sweeps left and right, alternating
// rumble strips and lane dashes, palm silhouettes scaling past, the sunset
// sliding against the curves, a red convertible leaning in — and the HUD.
import { lerpc, hash2 } from './_kit.js';

const CAR = [
  '......rrrrrrrrrrrrrrrr......',
  '.....rkkkkkkkkkkkkkkkkr.....',
  '....rkkhkkkkkkkkkkkkkkkr....',
  '..rrrrrrrrrrrrrrrrrrrrrrrr..',
  '.RRRRRRRRRRRRRRRRRRRRRRRRRR.',
  'RRLLLLRRRRRRRRRRRRRRRRLLLLRR',
  'RRLLLLRRggggggggggggRRLLLLRR',
  'RRRRRRRRggggggggggggRRRRRRRR',
  'ddssssddddddddddddddddssssdd',
  'kkkkkk................kkkkkk',
];
const SEG = 7, LOOP = 12, SPEED = 60;            // world units; one loop covers 720 units
const TAU = Math.PI * 2, LEN = SPEED * LOOP;
const curve = (z) => Math.sin((TAU * z) / LEN) * 0.9 + Math.sin((TAU * 3 * z) / LEN + 1) * 0.45;
const curveInt = (z) => (-Math.cos((TAU * z) / LEN) * 0.9 * LEN) / TAU - (Math.cos((TAU * 3 * z) / LEN + 1) * 0.45 * LEN) / (3 * TAU);

export default {
  title: 'Outrun Road',
  gallery: 'retro',
  category: 'Outrun',
  kind: 'scene',
  tags: ['outrun', 'racer', 'pseudo-3d', 'road', 'palms', 'sunset', 'arcade', '1986'],
  order: 10,
  description: 'Arcade pseudo-3D racing: a curving road with rumble strips, palm silhouettes, a sunset and a red convertible.',
  size: { w: 80, h: 24 },
  minSize: { w: 24, h: 8 },
  loop: LOOP,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { theme } = ctx;
    const b = ctx.buffer;
    const { width: PW, height: PH, px, aspect } = cv;
    const hy = Math.floor(PH * 0.46);
    const rows = PH - hy;
    const zNear = 3, zFar = 260;
    const halfW = (p) => p * PW * 0.4;
    const fogC = pal(0.62);
    const roadA = 0x5c5866, roadB = 0x56525f, grassA = 0x1f7a3c, grassB = 0x1a6a34;
    const sil = lerpc(pal(0.05), 0x000000, 0.3);
    const sunR = Math.min(PW * 0.16, hy * aspect * 0.8);
    // Mountains: a ridge wider than the screen so it can slide with the curves.
    const MW = PW * 3, ridge = new Float32Array(MW);
    for (let x = 0; x < MW; x++) {
      const u = x / MW;
      ridge[x] = hy - PH * (0.04 + 0.09 * Math.pow(Math.abs(Math.sin(u * TAU * 3 + 1.3)), 0.7) * (0.6 + 0.4 * Math.sin(u * TAU * 7)));
    }
    const wx = new Float32Array(rows);            // road centre per row, in road half-widths
    const hud = PW >= 40 && ctx.height >= 12;
    const carW0 = CAR[0].length, carH0 = CAR.length;
    const carScale = Math.max(PW * 0.3, 8) / carW0;
    const carColors = { r: 0xd81e2c, R: 0xf0283a, k: 0x1a1020, h: 0x6a6aa8, L: 0xffb040, g: 0x2a1418, d: 0x301018, s: 0x8a8a96 };

    return (t) => {
      const lt = t % LOOP, camZ = lt * SPEED;
      const shift = (curveInt(camZ) * 0.04 * PW) / 10;
      // Sky and sun.
      for (let y = 0; y < hy; y++) {
        const c = pal(0.04 + (y / hy) * 0.62);
        px.fill(c, y * PW, (y + 1) * PW);
      }
      const sunX = PW / 2 - shift * 0.6, sunY = hy - sunR * 0.35 / aspect;
      for (let y = Math.max(0, Math.floor(sunY - sunR / aspect)); y < hy; y++) for (let x = Math.max(0, Math.floor(sunX - sunR)); x < Math.min(PW, sunX + sunR); x++) {
        const dx = x + 0.5 - sunX, dy = (y + 0.5 - sunY) * aspect;
        if (dx * dx + dy * dy < sunR * sunR) px[y * PW + x] = lerpc(pal(0.98), pal(0.78), (y - (sunY - sunR / aspect)) / (2 * sunR / aspect));
      }
      for (let x = 0; x < PW; x++) {
        const rx = Math.floor((((x + shift) % MW) + MW) % MW);
        for (let y = Math.max(0, Math.floor(ridge[rx])); y < hy; y++) px[y * PW + x] = lerpc(sil, fogC, 0.35);
      }
      // Road: walk from the bottom (near) up to the horizon, integrating curvature.
      let x = 0, dx = 0, zPrev = zNear;
      for (let r = rows - 1; r >= 0; r--) {
        const p = (r + 1) / rows, z = zNear / p;
        if (z > zFar) { wx[r] = x; continue; }
        const dz = z - zPrev; zPrev = z;
        dx += curve(camZ + z) * 0.0011 * dz;
        x += dx * dz;
        wx[r] = x;
      }
      for (let r = 0; r < rows; r++) {
        const y = hy + r, p = (r + 1) / rows, z = zNear / p;
        const hw = halfW(p), cx = PW / 2 + wx[r] * hw;
        const seg = Math.floor((camZ + z) / SEG) & 1;
        const fog = Math.min(1, Math.pow(z / zFar, 0.7));
        const grass = lerpc(seg ? grassA : grassB, fogC, fog), road = lerpc(seg ? roadA : roadB, fogC, fog);
        const rumble = lerpc(seg ? 0xf0f0f0 : 0xd02030, fogC, fog), lane = lerpc(0xf0f0f0, road, fog);
        const rw = hw * 0.12, lw = hw * 0.035;
        for (let xx = 0; xx < PW; xx++) {
          const d = Math.abs(xx + 0.5 - cx);
          let c = grass;
          if (d < hw) c = road;
          else if (d < hw + rw) c = rumble;
          if (seg && d < hw && Math.abs(d - hw / 3) < lw) c = lane;
          px[y * PW + xx] = c;
        }
      }
      // Palms, far to near: trunk and drooping fronds, silhouetted against the sunset.
      const GAP = 10, first = Math.ceil((camZ + zNear + 1) / GAP), last = Math.floor((camZ + zFar) / GAP);
      for (let k = last; k >= first; k--) {
        const z = k * GAP - camZ, p = zNear / z;
        const r = Math.min(rows - 1, Math.max(0, Math.round(p * rows) - 1));
        const side = k & 1 ? 1 : -1, hw = halfW(p);
        const bx = PW / 2 + (wx[r] + side * (1.4 + hash2(k, 3) * 0.35)) * hw, by = hy + r;
        const fog = Math.min(1, Math.pow(z / zFar, 0.7)), c = lerpc(sil, fogC, fog * 0.9);
        const hgt = (hw * 2.1) / aspect, lean = side * hw * 0.22;
        const th = Math.max(1, hw * 0.06);
        for (let i = 0; i <= 40; i++) {
          const f = i / 40, tx = bx + lean * f * f, ty = by - hgt * f;
          for (let w = 0; w < th; w++) cv.set(tx + w - th / 2, ty, c);
        }
        const topX = bx + lean, topY = by - hgt;
        for (let a = 0; a < 8; a++) {
          // Fronds arc up and out, then droop; each a little different.
          const ang = -Math.PI + (a / 7) * Math.PI, len = hw * (0.7 + 0.2 * hash2(k, a));
          for (let i = 0; i <= 30; i++) {
            const f = i / 30, fx = topX + Math.cos(ang) * len * f, fy = topY + (Math.sin(ang) * len * f * 0.55 + len * f * f * 0.7) / aspect;
            cv.set(fx, fy, c);
            if (f < 0.7) cv.set(fx, fy + 1, c);
          }
        }
      }
      // The car: bobbing slightly, leaning into the curve.
      const lean = curve(camZ + 20) * PW * 0.03;
      const cw = carW0 * carScale, ch = (carH0 * carScale) / aspect;
      const cx0 = PW / 2 - cw / 2 + lean, cy0 = PH - ch - Math.max(1, PH * 0.03) - (Math.floor(lt * 8) % 2 ? 0 : 0.6);
      for (let y = 0; y < ch; y++) for (let xx = 0; xx < cw; xx++) {
        const k = CAR[Math.min(carH0 - 1, Math.floor((y / ch) * carH0))][Math.min(carW0 - 1, Math.floor((xx / cw) * carW0))];
        if (k !== '.') cv.set(cx0 + xx, cy0 + y, k === 'L' && Math.floor(lt * 2) % 4 === 0 ? 0xff5a3a : carColors[k]);
      }
      cv.paint(b);
      if (hud) {
        const time = 60 - Math.floor(lt * 2.5);
        const score = String(1250000 + Math.floor(camZ * 37) * 10).padStart(8, '0');
        const kmh = 286 + Math.round(Math.sin(lt * 1.3) * 6);
        b.text(1, 0, 'TIME', theme.warn);
        b.text(6, 0, String(time), 0xffffff);
        b.text(Math.floor(ctx.width / 2) - 7, 0, `SCORE ${score}`, 0x7cf0ff);
        const sp = `${kmh} km/h`;
        b.text(ctx.width - sp.length - 1, ctx.height - 1, sp, 0xffe14a);
      }
    };
  },
};
