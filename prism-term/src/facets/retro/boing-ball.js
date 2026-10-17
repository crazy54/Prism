// Homage to the 1984 Amiga Boing demo: a red-and-white checkered sphere spins
// and bounces across a purple grid room, casting a soft shadow on the wall.
import { lerpc } from './_kit.js';

export default {
  title: 'Boing Ball',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['boing', 'amiga', 'ball', 'checker', '1984'],
  order: 30,
  description: 'The 1984 Amiga Boing Ball: a spinning checkered sphere bouncing across a grid room with its shadow.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 6,
  canvas: 'hires',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const th = ctx.theme;
    const wall = lerpc(th.bg, 0xb0b0b0, 0.12), line = lerpc(th.bg, th.crit, 0.75);
    const red = 0xe0262b, white = 0xf2f2f2;
    const VH = H * aspect;                       // height in horizontal-pixel units
    const R = Math.min(W * 0.17, VH * 0.24);
    const floor = VH * 0.9;
    const gridX = Math.max(4, Math.round(W / 14)), gridY = Math.max(3, Math.round(H / 9));
    return (t) => {
      const tt = t * speed;
      // Room: wall grid + floor grid in perspective.
      const floorRow = Math.floor(floor / aspect);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = wall;
        if (y < floorRow) { if (x % gridX === 0 || y % gridY === 0) c = line; }
        else {
          const k = (y - floorRow + 1) / (H - floorRow + 1);
          const fx = (x - W / 2) / (0.6 + k * 1.4) + W / 2;
          if (Math.abs(fx % gridX) < 0.6 || (y - floorRow) % Math.max(1, Math.round(gridY * 0.5 * k + 1)) === 0) c = line;
        }
        px[y * W + x] = c;
      }
      // Bounce: horizontal ping-pong, vertical |sin|.
      const span = W - 2 * R - 2;
      const ph = (tt * 0.22) % 2;
      const bx = R + 1 + (ph < 1 ? ph : 2 - ph) * span;
      const by = floor - R - Math.abs(Math.sin(tt * 2.4)) * (floor - 2 * R - 2);
      const dir = ph < 1 ? 1 : -1;
      // Shadow on the wall (offset right) — drawn first.
      const sx0 = bx + R * 0.45, sy0 = by + R * 0.18;
      for (let y = Math.floor((sy0 - R) / aspect); y <= Math.ceil((sy0 + R) / aspect); y++) {
        for (let x = Math.floor(sx0 - R); x <= Math.ceil(sx0 + R); x++) {
          const dx = x + 0.5 - sx0, dy = (y + 0.5) * aspect - sy0;
          if (dx * dx + dy * dy < R * R && x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = lerpc(px[y * W + x], 0x000000, 0.45);
        }
      }
      // The ball: checker in (longitude, latitude), tilted, spinning.
      const spin = tt * 3 * dir, tilt = 0.35;
      for (let y = Math.floor((by - R) / aspect); y <= Math.ceil((by + R) / aspect); y++) {
        for (let x = Math.floor(bx - R); x <= Math.ceil(bx + R); x++) {
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const nx = (x + 0.5 - bx) / R, ny = ((y + 0.5) * aspect - by) / R;
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) continue;
          const nz = Math.sqrt(1 - r2);
          // Tilt around z then read longitude/latitude.
          const tx = nx * Math.cos(tilt) - ny * Math.sin(tilt), ty = nx * Math.sin(tilt) + ny * Math.cos(tilt);
          const lon = Math.atan2(tx, nz) + spin, lat = Math.asin(Math.max(-1, Math.min(1, ty)));
          const check = ((Math.floor(lon / (Math.PI / 8)) + Math.floor(lat / (Math.PI / 8))) & 1) === 0;
          const light = 0.45 + 0.55 * Math.max(0, nz * 0.8 - nx * 0.25 - ny * 0.35);
          px[y * W + x] = lerpc(0x000000, check ? red : white, Math.min(1, light + 0.15));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
