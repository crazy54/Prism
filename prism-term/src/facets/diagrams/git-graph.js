// `git log --graph --oneline --decorate`, live: a feature branch forks,
// main moves on, then the pull request merges. Unicode gets tig-style lanes,
// ASCII gets git's own * | / \ graph.
import { ATTR, uni, phase, tint, fit, stringWidth } from '../callouts/_kit.js';

// Rows: [unicode graph, ascii graph, hash, refs, message]
const OLD = [
  ['●', '*', '9d02c55', 'tag: v2.14.0', 'Release v2.14.0'],
  ['●', '*', '5f1a8e3', '', 'Fix cart rounding'],
  ['●', '*', '0b77e21', '', 'Add OTLP exporter'],
  ['●', '*', '6c4f2d9', '', 'Split checkout worker'],
];
const STATES = [
  [0, [['●', '*', '9d02c55', 'HEAD -> main, tag: v2.14.0', 'Release v2.14.0'], ...OLD.slice(1)], []],
  [1.4, [
    ['●', '*', '3b8d0aa', 'HEAD -> feat/pool-size', 'Add pool wait alert'],
    ['●', '*', '9d02c55', 'main, tag: v2.14.0', 'Release v2.14.0'], ...OLD.slice(1)], ['3b8d0aa']],
  [2.4, [
    ['●', '*', '7c2e9b1', 'HEAD -> feat/pool-size', 'Size DB pool to workers'],
    ['●', '*', '3b8d0aa', '', 'Add pool wait alert'],
    ['●', '*', '9d02c55', 'main, tag: v2.14.0', 'Release v2.14.0'], ...OLD.slice(1)], ['7c2e9b1']],
  [3.6, [
    ['●', '*', 'e41d7f2', 'HEAD -> main', 'Bump checkout to v2.14.1'],
    ['│ ●', '| *', '7c2e9b1', 'feat/pool-size', 'Size DB pool to workers'],
    ['│ ●', '| *', '3b8d0aa', '', 'Add pool wait alert'],
    ['├─╯', '|/', '', '', ''],
    ['●', '*', '9d02c55', 'tag: v2.14.0', 'Release v2.14.0'], ...OLD.slice(1)], ['e41d7f2']],
  [5.0, [
    ['●─╮', '*   ', 'a1f9c3e', 'HEAD -> main, origin/main', 'Merge pull request #418 from feat/pool-size'],
    ['│ │', '|\\', '', '', ''],
    ['│ ●', '| *', '7c2e9b1', 'feat/pool-size', 'Size DB pool to workers'],
    ['│ ●', '| *', '3b8d0aa', '', 'Add pool wait alert'],
    ['● │', '* |', 'e41d7f2', '', 'Bump checkout to v2.14.1'],
    ['├─╯', '|/', '', '', ''],
    ['●', '*', '9d02c55', 'tag: v2.14.0', 'Release v2.14.0'], ...OLD.slice(1)], ['a1f9c3e']],
];

export default {
  id: 'diagrams-git-graph',
  title: 'Git Log Graph',
  category: 'Git Graphs',
  description: 'git log --graph, live: a feature branch forks off main, main moves on, then the pull request merges, with colored lanes and decorated refs.',
  tags: ['git', 'log', 'graph', 'branches', 'merge'],
  kind: 'diagram',
  size: { w: 72, h: 12 },
  minSize: { w: 48, h: 9 },
  loop: 8,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 8);
      let si = 0;
      STATES.forEach(([at], i) => { if (p >= at) si = i; });
      const [at, rows, fresh] = STATES[si];
      const flash = p - at < 0.9;
      b.text(0, 0, fit('$ git log --graph --oneline --decorate', W, undefined, ctx), th.dim);
      const gw = Math.max(...rows.map((r) => stringWidth((u ? r[0] : r[1]).trimEnd()))) + 1;
      rows.slice(0, H - 1).forEach(([ug, ag, hash, refs, msg], r) => {
        const y = 1 + r;
        const isNew = flash && fresh.includes(hash);
        if (isNew) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th.accent, 0.18));
        const graph = u ? ug : ag;
        // Lane colors: main in accent, the feature lane in pos.
        [...graph].forEach((ch, x) => b.set(x, y, ch, x < 2 ? th.accent : th.pos, undefined, ch === '●' || ch === '*' ? ATTR.BOLD : 0));
        if (!hash) return;
        let x = b.text(gw, y, hash, th.warn);
        if (refs) {
          x = b.text(x + 1, y, '(', th.warn);
          refs.split(', ').forEach((ref, i) => {
            if (i) x = b.text(x, y, ', ', th.warn);
            const c = ref.startsWith('HEAD') ? th.info : ref.startsWith('tag:') ? th.warn : ref.startsWith('origin/') ? th.neg : th.pos;
            x = b.text(x, y, ref, c, undefined, ATTR.BOLD);
          });
          x = b.text(x, y, ')', th.warn);
        }
        b.text(x + 1, y, fit(msg, Math.max(0, W - x - 1), undefined, ctx).trimEnd(), isNew ? th.ink : th.muted, undefined, isNew ? ATTR.BOLD : 0);
      });
    };
  },
};
