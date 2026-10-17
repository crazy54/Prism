// Multi-select checkboxes: items get ticked one by one, the counter follows.
import { ATTR, glyphs, phase, promptLine, tint, fit, listAnswer } from './_input.js';

const ITEMS = ['checkout', 'payments', 'inventory', 'catalog', 'search', 'rx-orders', 'loyalty'];
const SCRIPT = [ // [time, cursor, toggle?]
  [0.5, 0, true], [1.0, 1, true], [1.5, 2, false], [1.8, 3, true], [2.4, 4, false], [2.7, 5, true], [3.4, 5, false],
];

export default {
  id: 'input-multiselect',
  title: 'Multi-select Checkboxes',
  category: 'Toggles & Checkboxes',
  description: 'A checkbox list where a scripted user moves and toggles items with space, with a live "4 of 7 selected" counter and select-all hint.',
  tags: ['checkbox', 'multiselect', 'list', 'toggle', 'prompt'],
  kind: 'tui',
  size: { w: 50, h: 12 },
  minSize: { w: 32, h: 7 },
  loop: 6,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 6);
      const on = new Set();
      let cur = 0;
      for (const [at, c, tog] of SCRIPT) if (p >= at) { cur = c; if (tog) on.has(c) ? on.delete(c) : on.add(c); }
      const done = p > 4.6;
      promptLine(ctx, b, 0, 0, 'Services to restart', done ? { state: 'done', answer: listAnswer([...on].map((i) => ITEMS[i]), W - 22) } : {});
      if (done) return;
      const rows = Math.min(ITEMS.length, H - 3);
      const first = Math.max(0, Math.min(ITEMS.length - rows, cur - rows + 2));
      for (let r = 0; r < rows; r++) {
        const i = first + r, y = 1 + r;
        const focused = i === cur, checked = on.has(i);
        if (focused) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th.accent, 0.1));
        b.text(1, y, focused ? g.pointer : ' ', th.accent);
        b.text(3, y, checked ? g.boxOn : g.boxOff, checked ? th.pos : th.dim, undefined, checked ? ATTR.BOLD : 0);
        b.text(7, y, fit(ITEMS[i], W - 8, undefined, ctx), focused ? th.ink : checked ? th.ink : th.muted, undefined, focused ? ATTR.BOLD : 0);
      }
      b.text(0, H - 1, `${on.size} of ${ITEMS.length} selected ${g.mid} space toggle ${g.mid} a all ${g.mid} enter`, th.dim);
    };
  },
};
