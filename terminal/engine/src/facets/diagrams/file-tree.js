// A file tree explorer: tree(1) guide lines, folders that expand and collapse
// as the cursor walks, git status markers and a running summary.
import { ATTR, glyphs, uni, phase, tint, fit } from '../callouts/_kit.js';

// [name, children | size, git status]
const TREE = ['prism-term', [
  ['src', [
    ['facets', [
      ['ai', [['thinking.js', '3.1K'], ['token-stream.js', '4.2K']]],
      ['callouts', [['_kit.js', '6.8K'], ['table-grid.js', '3.9K', 'M']]],
      ['input', [['command-palette.js', '5.2K', 'A'], ['select.js', '2.4K']]],
    ]],
    ['buffer.js', '7.7K'],
    ['canvas.js', '9.4K'],
  ]],
  ['test', [['facets.test.js', '4.4K'], ['tui.test.js', '2.1K', '?']]],
  ['package.json', '1.2K', 'M'],
  ['README.md', '8.0K'],
]];
// Folder paths and when they open (+) / close (−); cursor path per step.
const OPEN = { 'prism-term': [[0, 99]], 'prism-term/src': [[0, 99]], 'prism-term/test': [[0, 99]], 'prism-term/src/facets': [[1.0, 5.6]], 'prism-term/src/facets/callouts': [[2.0, 5.6]], 'prism-term/src/facets/input': [[3.4, 5.6]] };
const CURSOR = [[0, 'prism-term/src'], [0.6, 'prism-term/src/facets'], [1.5, 'prism-term/src/facets/ai'], [1.7, 'prism-term/src/facets/callouts'],
  [2.5, 'prism-term/src/facets/callouts/_kit.js'], [2.8, 'prism-term/src/facets/callouts/table-grid.js'], [3.1, 'prism-term/src/facets/input'],
  [3.9, 'prism-term/src/facets/input/command-palette.js'], [5.3, 'prism-term/src/facets'], [6.2, 'prism-term/src']];
const REVEAL = 0.07;

export default {
  id: 'diagrams-file-tree',
  title: 'File Tree',
  category: 'Trees & Hierarchies',
  description: 'A tree(1)-style explorer with guide lines: folders expand and collapse as the cursor walks, with git status markers, file sizes and a live summary.',
  tags: ['file tree', 'tree', 'explorer', 'directory', 'git status'],
  kind: 'diagram',
  size: { w: 56, h: 18 },
  minSize: { w: 36, h: 10 },
  loop: 7,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      const isOpen = (path) => {
        const spans = OPEN[path];
        if (!spans) return null;
        const s = spans.find(([a, z]) => p >= a && p < z);
        return s ? s[0] : null;
      };
      // Flatten the visible tree.
      const rows = [];
      let dirs = 0, files = 0;
      const walk = (node, path, depth, guides, last) => {
        const [name, kids, git] = node;
        const isDir = Array.isArray(kids);
        rows.push({ name, path, depth, guides, last, isDir, size: isDir ? '' : kids, git, open: isDir && isOpen(path) !== null });
        if (isDir && depth > 0) dirs++; else if (!isDir) files++;
        const openedAt = isDir ? isOpen(path) : null;
        if (openedAt === null) return;
        const show = openedAt === 0 ? kids.length : Math.min(kids.length, Math.floor((p - openedAt) / REVEAL) + 1);
        kids.slice(0, show).forEach((k, i) => walk(k, `${path}/${k[0]}`, depth + 1, depth > 0 ? [...guides, !last] : [], i === show - 1 && show === kids.length));
      };
      walk(TREE, TREE[0], 0, [], true);
      let cur = CURSOR[0][1];
      for (const [at, path] of CURSOR) if (p >= at) cur = path;
      const ci = Math.max(0, rows.findIndex((r) => r.path === cur));
      const listH = H - 1;
      const first = Math.max(0, Math.min(rows.length - listH, ci - Math.floor(listH / 2)));
      const G = u ? { pipe: '│   ', gap: '    ', tee: '├── ', end: '└── ' } : { pipe: '|   ', gap: '    ', tee: '|-- ', end: '`-- ' };
      for (let r = 0; r < Math.min(listH, rows.length - first); r++) {
        const row = rows[first + r], y = r, on = first + r === ci;
        if (on) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th.accent, 0.16));
        let x = 0;
        if (row.depth > 0) {
          for (const more of row.guides) x = b.text(x, y, more ? G.pipe : G.gap, th.line);
          x = b.text(x, y, row.last ? G.end : G.tee, th.line);
        }
        if (row.isDir) {
          x = b.text(x, y, row.open ? g.triDown : g.tri, th.muted);
          x = b.text(x + 1, y, `${row.name}/`, th.info, undefined, ATTR.BOLD | (on ? ATTR.UNDERLINE : 0));
        } else {
          const c = row.name.endsWith('.js') ? th.ink : row.name.endsWith('.json') ? th.warn : th.muted;
          x = b.text(x, y, row.name, c, undefined, on ? ATTR.BOLD | ATTR.UNDERLINE : 0);
        }
        const right = `${row.git ? row.git : ' '}  ${row.size.padStart(4)}`;
        if (row.size && W - right.length > x + 1) {
          b.text(W - right.length, y, row.git || ' ', row.git === 'M' ? th.warn : row.git === 'A' ? th.pos : th.neg, undefined, ATTR.BOLD);
          b.text(W - 4, y, row.size.padStart(4), th.dim);
        }
      }
      const sum = `${dirs} directories, ${files} files ${g.mid} ${g.up}${g.down} move  l open  h close`;
      b.text(0, H - 1, fit(sum, W, undefined, ctx), th.dim);
    };
  },
};
