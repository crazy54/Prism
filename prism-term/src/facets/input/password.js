// A masked password field with a strength meter and a reveal toggle.
import { ATTR, glyphs, uni, phase, typed, blink, tint, hbar } from './_input.js';

const PW = 'c0rrect-h0rse-battery!';
const RULES = [
  ['12+ characters', (s) => s.length >= 12],
  ['a digit', (s) => /\d/.test(s)],
  ['a symbol', (s) => /[^\w]/.test(s)],
  ['not in breach lists', (s) => s.length >= 16],
];

export default {
  id: 'input-password',
  title: 'Password Field',
  category: 'Text Fields',
  description: 'A masked password input whose strength meter climbs from weak to strong as rules tick off, with a brief reveal toggle at the end.',
  tags: ['password', 'masked', 'strength', 'security', 'input'],
  kind: 'tui',
  size: { w: 52, h: 9 },
  minSize: { w: 34, h: 5 },
  loop: 6,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 6);
      const v = typed(PW, p, 0.3, 7);
      const reveal = p > 4.4 && p < 5.4;
      const passed = RULES.filter(([, f]) => f(v)).length;
      const fw = Math.min(W - 2, 40);
      b.text(0, 0, 'Password', th.ink, undefined, ATTR.BOLD);
      const bg = tint(ctx, th.accent, 0.08);
      b.fill(0, 1, fw, 1, ' ', undefined, bg);
      const shown = reveal ? v : (u ? '•' : '*').repeat(v.length);
      b.text(1, 1, shown.slice(-(fw - 6)), th.ink, bg);
      if (!reveal && blink(t, 0.9)) b.set(1 + Math.min(v.length, fw - 6), 1, u ? '▏' : '_', th.ink, bg);
      b.text(fw - 4, 1, reveal ? (u ? '◉' : 'o') : (u ? '◎' : '-'), th.muted, bg);
      const levels = [['weak', th.neg], ['fair', th.warn], ['good', th.info], ['strong', th.pos]];
      const [label, c] = levels[Math.max(0, passed - 1)] || levels[0];
      hbar(ctx, b, 0, 2, fw, passed / RULES.length, v ? c : th.line);
      b.text(fw + 1 > W - 6 ? 0 : fw + 1, fw + 1 > W - 6 ? 3 : 2, v ? label : '', c, undefined, ATTR.BOLD);
      const ry = fw + 1 > W - 6 ? 4 : 3;
      RULES.forEach(([text, f], i) => {
        const y = ry + i;
        if (y >= H) return;
        const ok = f(v);
        b.text(0, y, ok ? g.check : g.mid, ok ? th.pos : th.dim);
        b.text(2, y, text, ok ? th.ink : th.muted);
      });
    };
  },
};
