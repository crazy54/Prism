// An ANSI group logo in the 1994 style: bevelled block letters encoded as real
// ANSI art (VGA colors, ░▒▓ shading, half blocks), a light sweep gliding
// across them, sparkles, and the obligatory scene tagline and credits.
import { textMask, maskAt, bbsPalette, lerpc, hash2 } from './_kit.js';
import { ansify } from './_bbs.js';

export default {
  title: 'ANSI Group Logo',
  gallery: 'retro',
  category: 'BBS & ANSI Art',
  kind: 'art',
  tags: ['ansi', 'logo', 'bbs', 'acid', 'ice', 'scene', 'shading'],
  order: 30,
  description: 'A 1994-style ANSI group logo: bevelled block letters in ░▒▓ shading with a light sweep and sparkles.',
  size: { w: 78, h: 16 },
  minSize: { w: 36, h: 8 },
  loop: 8,
  color: '16',
  params: {
    text: { default: 'PRISM', label: 'Logo' },
    colors: { default: 'vga', options: ['vga', 'theme'], label: 'Colors' },
  },
  setup(ctx) {
    const P = bbsPalette(ctx);
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const mask = textMask(String(ctx.param('text', 'PRISM')).toUpperCase(), { font: 'bold' });
    const rows = Math.max(4, H - 5);
    // One font pixel = L cells wide × L half-rows tall, i.e. visually square.
    const L = Math.max(1, Math.min(Math.floor((W - 2) / mask.w), Math.floor((rows * 2) / mask.h)));
    const sx = L, sy = L;
    const lw = Math.min(W, mask.w * sx), lh = Math.ceil((mask.h * sy) / 2);
    const lx = Math.floor((W - lw) / 2), ly = Math.max(0, Math.floor((H - lh - 3) / 2));
    const img = new Int32Array(lw * lh * 2);
    const inside = (x, y) => maskAt(mask, x, y, sx, sy);
    const base = [P[1], P[9], P[11], P[15]];
    return (t) => {
      b.fill(0, 0, W, H, ' ', P[7], P[0]);
      const sweep = ((t * 0.28) % 1.5) - 0.25;
      for (let y = 0; y < lh * 2; y++) for (let x = 0; x < lw; x++) {
        let c = P[0];
        if (inside(x, y)) {
          const v = y / (lh * 2);
          c = lerpc(base[Math.min(3, Math.floor((1 - v) * 3.99))], base[Math.min(3, Math.floor((1 - v) * 3.99) + 1)] ?? base[3], ((1 - v) * 3.99) % 1);
          if (!inside(x - 1, y - 1)) c = lerpc(c, P[15], 0.55);           // bevel highlight
          if (!inside(x + 1, y + 1)) c = lerpc(c, P[0], 0.5);            // bevel shadow
          const d = Math.abs(x / lw - sweep - (y / (lh * 2)) * 0.2);
          if (d < 0.07) c = lerpc(c, P[15], (1 - d / 0.07) * 0.8);
        } else if (inside(x - Math.max(1, sx >> 1), y - Math.max(1, sy >> 1))) c = P[8];   // drop shadow
        img[y * lw + x] = c;
      }
      ansify(b, img, lw, lh, lx, ly, P);
      // Sparkles that bloom and fade around the letters.
      for (let i = 0; i < 8; i++) {
        const k = Math.floor(t * 1.3) + i * 7;
        const x = lx + Math.floor(hash2(k, 1) * lw), y = ly + Math.floor(hash2(k, 2) * lh);
        const life = (t * 1.3) % 1;
        b.set(x, y, life < 0.3 ? '·' : life < 0.6 ? '+' : '*', life < 0.6 ? P[15] : P[11]);
      }
      const tag = '-[ PRiSM ANSi & ASCii DiViSiON ]-';
      const credits = 'ans by ckr/prism · 10/94 · 80x25 · iCE-free';
      if (ly + lh + 1 < H) b.text(Math.max(0, Math.floor((W - tag.length) / 2)), ly + lh + 1, tag.slice(0, W), P[13]);
      if (ly + lh + 2 < H) b.text(Math.max(0, Math.floor((W - credits.length) / 2)), ly + lh + 2, credits.slice(0, W), P[8]);
    };
  },
};
