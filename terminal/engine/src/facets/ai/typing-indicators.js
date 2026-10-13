// A sampler of "the model is working" indicators, each labeled:
// bouncing dots, a braille wave, a pulse, an orbit, a scanner and a meter.
import { ATTR, uni, phase, mix, fit } from './_ai.js';

const BRAILLE_LV = ['⡀', '⡄', '⡆', '⡇', '⡏', '⡟', '⡿', '⣿'];

export default {
  id: 'ai-typing-indicators',
  title: 'Typing Indicators',
  category: 'Thinking States',
  description: 'Six labeled "model is working" indicators side by side: a chat bubble of bouncing dots, a braille wave, a pulse, an orbit, a scanner and an equalizer.',
  tags: ['typing indicator', 'dots', 'wave', 'loading', 'chat'],
  kind: 'spinner',
  size: { w: 66, h: 4 },
  minSize: { w: 33, h: 4 },
  loop: 2.4,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 2.4);
      // Whole cycles per loop, so every indicator repeats seamlessly.
      const w = (k) => (2 * Math.PI * k) / 2.4;
      const cells = [
        ['bounce', (s, x, y) => {
          // Chat bubble with three dots rising in turn.
          s.text(x, y, u ? '╭───────╮' : '+-------+', th.line);
          s.text(x, y + 1, u ? '│       │' : '|       |', th.line);
          s.text(x, y + 2, u ? '╰─┬─────╯' : '+-+-----+', th.line);
          for (let i = 0; i < 3; i++) {
            const k = Math.max(0, Math.sin((p / 2.4) * Math.PI * 4 - i * 0.9));
            s.set(x + 2 + i * 2, y + 1, u ? (k > 0.6 ? '●' : k > 0.2 ? '•' : '∙') : (k > 0.6 ? 'O' : k > 0.2 ? 'o' : '.'), mix(th.muted, th.accent, k), undefined, ATTR.BOLD);
          }
        }],
        ['wave', (s, x, y) => {
          for (let i = 0; i < 9; i++) {
            const v = (Math.sin(w(2) * p - i * 0.7) + 1) / 2;
            s.set(x + i, y + 1, u ? BRAILLE_LV[Math.round(v * 7)] : ' .:-=+*#'[Math.round(v * 7)], mix(th.info, th.accent, v));
          }
        }],
        ['pulse', (s, x, y) => {
          const k = (Math.sin(w(2) * p) + 1) / 2;
          const ring = u ? ['∙', '•', '●', '◉', '◎'][Math.round(k * 4)] : ['.', 'o', 'O', '@', '0'][Math.round(k * 4)];
          s.set(x + 4, y + 1, ring, mix(th.dim, th.accent, k), undefined, ATTR.BOLD);
          s.text(x, y + 1, u ? '·  ' : '.  ', mix(th.bg, th.accent, k * 0.6));
          s.text(x + 6, y + 1, u ? '  ·' : '  .', mix(th.bg, th.accent, k * 0.6));
        }],
        ['orbit', (s, x, y) => {
          const pts = [[4, 0], [6, 1], [4, 2], [2, 1]];
          pts.forEach(([dx, dy], i) => {
            const lead = Math.floor(p * 5) % 4;
            const age = (lead - i + 4) % 4;
            s.set(x + dx, y + dy, u ? (age === 0 ? '●' : '∙') : (age === 0 ? 'O' : '.'), age === 0 ? th.accent : mix(th.bg, th.accent, 0.6 - age * 0.15), undefined, ATTR.BOLD);
          });
          s.set(x + 4, y + 1, u ? '✳' : '*', th.muted);
        }],
        ['scan', (s, x, y) => {
          const n = 9, pos = Math.round((Math.sin(w(1) * p) + 1) / 2 * (n - 1));
          for (let i = 0; i < n; i++) {
            const d = Math.abs(i - pos);
            s.set(x + i, y + 1, u ? (d === 0 ? '█' : d === 1 ? '▓' : d === 2 ? '▒' : '░') : (d === 0 ? '#' : d === 1 ? '=' : '-'), d < 3 ? mix(th.accent, th.bg, d * 0.3) : th.line);
          }
        }],
        ['meter', (s, x, y) => {
          const LV = u ? ' ▁▂▃▄▅▆▇█' : ' ..::==##';
          for (let i = 0; i < 7; i++) {
            const v = (Math.sin(w(2 + (i % 3)) * p + i) + 1) / 2;
            s.set(x + 1 + i, y + 1, LV[1 + Math.round(v * 7)], mix(th.pos, th.warn, v));
          }
        }],
      ];
      // Lay the cells out in as many columns as fit (11 columns each).
      const cw = 11, cols = Math.max(1, Math.floor(W / cw)), rowH = 4;
      const rows = Math.max(1, Math.floor(H / rowH));
      const n = Math.min(cells.length, cols * rows);
      const x0 = Math.max(0, Math.floor((W - Math.min(cols, n) * cw) / 2));
      for (let i = 0; i < n; i++) {
        const [name, draw] = cells[i];
        const cx = x0 + (i % cols) * cw, cy = Math.floor(i / cols) * rowH;
        draw(b, cx, cy);
        b.text(cx, cy + 3, fit(name, cw - 1, undefined, ctx).trimEnd(), th.dim);
      }
    };
  },
};
