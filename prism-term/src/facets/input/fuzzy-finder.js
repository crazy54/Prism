// An fzf-style fuzzy finder: the query types, the list filters live with
// matched characters highlighted and the match count updating.
import { ATTR, glyphs, phase, typed, blink, uni, tint, fit, fuzzyMatch as match } from './_input.js';

const FILES = [
  'src/facets/input/fuzzy-finder.js', 'src/facets/charts/sparkline.js', 'src/screen.js', 'src/canvas.js',
  'src/facets/fx/plasma.js', 'src/widgets/table.js', 'src/text/banner.js', 'src/facets/ops/htop.js',
  'docs/authoring-facets.md', 'README.md', 'src/facets/progress/odometer.js', 'src/player.js',
  'src/facets/ai/thinking.js', 'scripts/shoot.mjs', 'src/facets/diagrams/git-graph.js', 'test/facets.test.js',
  'src/palettes.js', 'src/facets/callouts/table-grid.js', 'src/facets/sim/life.js', 'package.json',
];

export default {
  id: 'input-fuzzy-finder',
  title: 'Fuzzy Finder',
  category: 'Selects & Lists',
  description: 'An fzf-style finder: the query types itself, results re-rank live with matched characters highlighted and the match counter updating, best match nearest the prompt.',
  tags: ['fzf', 'fuzzy', 'finder', 'search', 'filter'],
  kind: 'tui',
  size: { w: 60, h: 14 },
  minSize: { w: 34, h: 6 },
  loop: 7,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 7);
      const query = typed('facetsjs', p, 0.4, 3.2).slice(0, p > 5.5 ? 6 : 99);
      const hits = FILES.map((f) => ({ f, m: match(query, f) })).filter((x) => x.m).sort((a, c) => c.m.score - a.m.score);
      const listH = H - 2;
      const cur = Math.min(hits.length - 1, Math.max(0, Math.floor(Math.max(0, p - 3.2) / 0.5) % 3));
      // fzf draws bottom-up: best match just above the prompt.
      for (let r = 0; r < Math.min(listH, hits.length); r++) {
        const y = listH - 1 - r;
        const { f, m } = hits[r];
        const on = r === cur;
        if (on) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th.accent, 0.14));
        b.text(0, y, on ? (uni(ctx) ? '▌' : '>') : ' ', th.accent, undefined, ATTR.BOLD);
        const shown = fit(f, W - 3, undefined, ctx);
        [...shown].forEach((ch, i) => b.text(2 + i, y, ch, m.idx.includes(i) ? th.pos : on ? th.ink : th.muted, undefined, m.idx.includes(i) || on ? ATTR.BOLD : 0));
      }
      const info = `  ${hits.length}/${FILES.length}`;
      b.text(0, H - 2, info, th.warn);
      b.fill(info.length + 1, H - 2, Math.max(0, W - info.length - 1), 1, uni(ctx) ? '─' : '-', th.line);
      let x = b.text(0, H - 1, `${g.pointer} `, th.accent, undefined, ATTR.BOLD);
      x = b.text(x, H - 1, query, th.ink);
      if (blink(t, 0.8)) b.set(x, H - 1, uni(ctx) ? '▏' : '_', th.ink);
    };
  },
};
