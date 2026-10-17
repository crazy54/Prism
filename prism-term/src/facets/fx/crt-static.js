// Between channels on an old CRT: snow, a darker hum bar crawling up the
// tube, scanlines and a vignette — then the set catches a station for a beat,
// a test card rolls into lock with the channel number, and it's gone again.
import { lerpc, clamp01, hash2 } from '../retro/_kit.js';

const LOOP = 12;

export default {
  title: 'CRT Static',
  gallery: 'fx',
  category: 'Glitch & Noise',
  kind: 'scene',
  tags: ['static', 'snow', 'crt', 'tv', 'noise', 'analog', 'channel'],
  order: 40,
  description: 'Between channels on an old CRT: snow, a crawling hum bar and scanlines, until a test card rolls into lock.',
  size: { w: 64, h: 20 },
  minSize: { w: 16, h: 6 },
  loop: LOOP,
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas();
    const b = ctx.buffer;
    const { theme } = ctx;
    const { width: W, height: H, px, aspect } = cv;
    const tint = lerpc(0xffffff, theme.info, 0.12);
    // A simple test card: bars, a gray ramp, a circle with a cross.
    const card = (x, y) => {
      const u = x / W, v = y / H;
      const dx = (u - 0.5) * W, dy = (v - 0.5) * H * aspect, r = Math.hypot(dx, dy), R = Math.min(W, H * aspect) * 0.36;
      if (Math.abs(r - R) < 0.9 || (r < R && (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6))) return 0xffffff;
      if (v > 0.38 && v < 0.62 && r < R) return lerpc(0x101010, 0xf0f0f0, Math.floor(u * 8) / 7);
      if (v < 0.5) return [0xb0b0b0, 0xb0b000, 0x00b0b0, 0x00b000, 0xb000b0, 0xb00000, 0x0000b0][Math.min(6, Math.floor(u * 7))];
      return [0x0000b0, 0x101010, 0xb000b0, 0x101010, 0x00b0b0, 0x101010, 0xb0b0b0][Math.min(6, Math.floor(u * 7))];
    };
    return (t) => {
      const lt = t % LOOP, frame = Math.floor(t * 30);
      // Station lock: fades in from 6.0 s, rolls into place, holds, drops at 8.4 s.
      const lock = lt > 6 && lt < 8.4 ? clamp01((lt - 6) * 3) * clamp01((8.4 - lt) * 5) : 0;
      const roll = lt > 6 ? Math.floor(Math.max(0, 1 - (lt - 6) * 1.4) * H * 1.5) : 0;
      const hum = ((-lt / 3) % 1 + 1) % 1 * H * 1.4 - H * 0.2;
      for (let y = 0, i = 0; y < H; y++) {
        const bar = Math.exp(-Math.pow((y - hum) / (H * 0.12), 2));
        const scan = y % 2 ? 0.86 : 1;
        for (let x = 0; x < W; x++, i++) {
          let v = hash2(x, y, frame);
          v = v * v * 0.9 + (hash2(x >> 1, y, frame + 99) > 0.97 ? 0.4 : 0);
          let c = lerpc(0x000000, tint, clamp01(v) * (1 - bar * 0.45) * scan);
          if (lock > 0) c = lerpc(c, card(x, (y + roll) % H), lock * (0.9 - bar * 0.2) * scan);
          // Vignette toward the tube's corners.
          const vx = (x / W - 0.5) * 2, vy = (y / H - 0.5) * 2;
          px[i] = lerpc(c, 0x000000, clamp01((vx * vx + vy * vy - 0.55) * 0.55));
        }
      }
      cv.paint(b);
      if (lock > 0.5) b.text(Math.max(1, ctx.width - 7), 1, 'CH 03', theme.pos);
      else if (ctx.width >= 24) b.text(Math.max(1, ctx.width - 7), 1, `CH ${String(2 + (Math.floor(lt / 1.5) % 11)).padStart(2, '0')}`, lerpc(theme.pos, 0x000000, 0.3));
    };
  },
};
