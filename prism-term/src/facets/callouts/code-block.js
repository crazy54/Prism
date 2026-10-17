// A code panel stepping like a debugger: gutter line numbers, syntax color,
// a breakpoint, diff markers and the current-line highlight walking down.
import { ATTR, uni, panel, codeLine, phase, mix, fit } from './_kit.js';

const CODE = [
  "import { connect } from './db.js';",
  '',
  'export async function reserve(order) {',
  '  const pool = await connect({ size: 40 });',
  "  const rows = await pool.query('SELECT * FROM stock');",
  '  if (rows.length === 0) throw new Error("out of stock");',
  '  // hold the items for ten minutes',
  "  await pool.query('UPDATE stock SET held = true');",
  '  return { ok: true, held: rows.length };',
  '}',
];
const DIFF = { 3: '+', 7: '~' };
const BREAK = 5;

export default {
  id: 'callouts-code-block',
  title: 'Code Block',
  category: 'Panels & Borders',
  description: 'A titled code panel with line numbers, syntax coloring, a breakpoint, diff markers and a debugger-style current line stepping through.',
  tags: ['code', 'syntax', 'line numbers', 'debugger', 'snippet'],
  kind: 'widget',
  size: { w: 66, h: 14 },
  minSize: { w: 36, h: 7 },
  loop: 9,
  color: '256',
  order: 50,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 9);
      const lines = CODE.length;
      const cur = [2, 3, 4, 5, 7, 8][Math.floor(p / 1.5) % 6];
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'inventory/reserve.js', footer: `Ln ${cur + 1}, Col 3 ${u ? '·' : '-'} JavaScript`, color: th.line });
      const iw = inner.width, ih = inner.height;
      const first = Math.max(0, Math.min(lines - ih, cur - Math.floor(ih / 2)));
      for (let r = 0; r < ih; r++) {
        const i = first + r;
        if (i >= lines) break;
        const isCur = i === cur;
        const bg = isCur ? mix(th.bg, th.accent, 0.16) : undefined;
        if (bg !== undefined) inner.fill(0, r, iw, 1, ' ', undefined, bg);
        const gut = i === BREAK ? (u ? '●' : '*') : isCur ? (u ? '▶' : '>') : ' ';
        inner.set(0, r, gut, i === BREAK ? th.neg : th.accent, bg);
        inner.text(1, r, fit(String(i + 1), 3, 'right', ctx), isCur ? th.ink : th.dim, bg);
        const mark = DIFF[i];
        inner.set(5, r, mark || ' ', mark === '+' ? th.pos : th.warn, bg);
        codeLine(ctx, inner, 7, r, iw - 7, CODE[i], bg);
      }
    };
  },
};
