// Text effects showcase: every effect in src/text/effects.js, applied to big
// banner text and to a plain line of log-style text, with captions.
import { MODES } from '../../canvas.js';
import { measureBanner } from '../../text/banner.js';
import { EFFECTS } from '../../text/effects.js';

const SEGMENT = 4.2;
const ORDER = ['decrypt', 'typewriter', 'wave', 'rainbow', 'shimmer', 'glitch', 'fadeIn', 'pulse', 'marquee', 'wipe'];

export default {
  title: 'Text Effects',
  gallery: 'text',
  category: 'Reveal & Type',
  kind: 'scene',
  tags: ['text effects', 'typewriter', 'decrypt', 'glitch'],
  order: 20,
  description: 'Decrypt, typewriter, wave, rainbow, shimmer, glitch, fade, pulse, marquee and wipe — on big and small text.',
  canvas: 'field',
  palette: 'prism',
  setup(ctx) {
    const { width: W, height: H, theme: th, caps } = ctx;
    const big = String(ctx.param('text', 'PRISM'));
    const line = String(ctx.param('line', 'root cause: connection pool exhausted on db-primary (p99 2.4s)'));
    const unicode = caps.unicode !== false;
    const mode = ctx.mode || (unicode ? 'half' : 'ascii');
    const font = 'bold';
    const sy = MODES[mode]?.sy || 1;

    const shadow = mode !== 'braille';
    let scale = 1;
    for (let s = 1; s <= 6; s++) {
      const m = measureBanner(big, { font, mode, scale: s, shadow });
      if (m.width <= W - 6 && m.height <= Math.max(3, H - 10)) scale = s;
      else break;
    }
    const size = measureBanner(big, { font, mode, scale, shadow });
    const waveRows = Math.ceil((2 * scale) / sy);
    const bigY = Math.max(2, Math.floor((H - size.height) / 2) - 2);
    const lineY = Math.min(H - 3, bigY + size.height + waveRows + 1);
    const pal = ctx.palette();
    const bigFill = ctx.params.palette || 'prism';

    return (t) => {
      const buf = ctx.buffer;
      const i = Math.floor(t / SEGMENT) % ORDER.length;
      const lt = t - Math.floor(t / SEGMENT) * SEGMENT;
      const name = ORDER[i];
      const fx = EFFECTS[name];
      const common = { theme: th, ascii: !unicode };

      // Header: title + progress dots.
      buf.text(2, 0, 'TEXT EFFECTS', th.muted);
      let dx = W - 2 - ORDER.length * 2;
      for (let k = 0; k < ORDER.length; k++) {
        buf.text(dx, 0, k === i ? (unicode ? '●' : '*') : (unicode ? '·' : '.'), k === i ? pal(k / ORDER.length) : th.dim);
        dx += 2;
      }

      // Big text.
      const bigOpts = { ...common, font, mode, scale, fill: bigFill, shadow };
      if (name === 'typewriter') bigOpts.cps = Math.max(2, big.length / 1.6);
      if (name === 'decrypt') bigOpts.duration = 1.8;
      if (name === 'fadeIn') bigOpts.duration = 1.6;
      if (name === 'wipe') bigOpts.duration = 1.2;
      if (name === 'shimmer' || name === 'pulse') bigOpts.fill = undefined;
      if (name === 'marquee') fx.fn(buf, 0, bigY, big + '  *', lt, { ...bigOpts, speed: 18, gap: 8, width: W });
      else {
        fx.fn(buf, 'center', bigY - (name === 'wave' ? waveRows : 0), big, lt, bigOpts);
      }

      // Small text line.
      const lineOpts = { ...common, color: th.ink };
      if (name === 'typewriter') lineOpts.cps = 30;
      if (name === 'decrypt') lineOpts.duration = 1.6;
      if (name === 'rainbow') lineOpts.spread = 0.6;
      if (name === 'wave') lineOpts.fill = 'candy';
      if (name === 'marquee') fx.fn(buf, 4, lineY, line, lt, { ...lineOpts, width: W - 8, speed: 14 });
      else fx.fn(buf, 'center', lineY, line, lt, lineOpts);

      // Caption.
      const cap = `${name}`;
      const desc = fx.description;
      const cy = H - 1;
      const cx = Math.max(1, Math.floor((W - cap.length - desc.length - 3) / 2));
      const end = buf.text(cx, cy, cap, th.accent);
      buf.text(end, cy, ' — ' + desc, th.muted);
    };
  },
};
