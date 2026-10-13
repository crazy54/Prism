// A branch diagram drawn left to right: main, a hotfix and a feature branch
// fork and merge as a playhead reveals history, tags riding above main.
import { ATTR, uni, phase, fit } from '../callouts/_kit.js';
import { LineGrid } from './_lines.js';

// Lanes: [name, row, color key]
const LANES = { main: ['main', 2, 'accent'], hotfix: ['hotfix/cart', 5, 'warn'], feat: ['feat/pool-size', 8, 'pos'] };
// Branches: [lane, fork at, merge at]
const BRANCHES = [['feat', 0.2, 0.76], ['hotfix', 0.4, 0.55]];
// Commits: [lane, at, hash, message, tag, merge?]
const COMMITS = [
  ['main', 0.04, '6c4f2d9', 'Split checkout worker'], ['main', 0.13, '9d02c55', 'Release v2.14.0', 'v2.14.0'],
  ['feat', 0.28, '3b8d0aa', 'Add pool wait alert'], ['main', 0.34, 'e41d7f2', 'Bump checkout deps'],
  ['feat', 0.43, '7c2e9b1', 'Size DB pool to workers'], ['hotfix', 0.47, 'c0a1b3f', 'Fix cart rounding'],
  ['main', 0.55, '5e2a9d0', 'Merge hotfix/cart', 'v2.14.1', true], ['feat', 0.63, '8f3c1e7', 'Alert on pool wait p99'],
  ['main', 0.76, 'a1f9c3e', 'Merge pull request #418', '', true], ['main', 0.88, 'b72ffed', 'Release v2.15.0', 'v2.15.0'],
];
const SWEEP = 7;

export default {
  id: 'diagrams-git-branches',
  title: 'Branch Diagram',
  category: 'Git Graphs',
  description: 'A left-to-right branch diagram: a feature branch and a hotfix fork from main, gain commits and merge back as a playhead reveals history, with release tags.',
  tags: ['git', 'branches', 'gitflow', 'merge', 'release'],
  kind: 'diagram',
  size: { w: 76, h: 11 },
  minSize: { w: 56, h: 11 },
  loop: 9,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 9);
      const head = Math.min(1, p / SWEEP);
      const lw = W >= 70 ? 15 : 12;
      const x0 = lw + 1, cw = W - x0 - 2;
      const X = (f) => x0 + Math.round(f * cw);
      const grid = new LineGrid(W, H - 1);
      const mainY = LANES.main[1];
      grid.hline(x0, X(head), mainY, th[LANES.main[2]]);
      for (const [lane, fork, merge] of BRANCHES) {
        if (head < fork) continue;
        const [, y, ck] = LANES[lane], c = th[ck];
        grid.vline(X(fork), mainY, y, c);
        grid.hline(X(fork), X(Math.min(head, merge)), y, c);
        if (head >= merge) grid.vline(X(merge), mainY, y, c);
      }
      grid.paint(ctx, b, 0, 0, { style: 'round' });
      // Lane labels.
      for (const [key, [name, y, ck]] of Object.entries(LANES)) {
        const active = key === 'main' || BRANCHES.some(([l, f]) => l === key && head >= f);
        b.text(0, y, fit(name, lw, undefined, ctx), active ? th[ck] : th.dim, undefined, active ? ATTR.BOLD : 0);
      }
      // Commits and tags.
      let latest = null;
      for (const c of COMMITS) {
        const [lane, at, , , tag, merge] = c;
        if (head < at) continue;
        latest = c;
        const [, y, ck] = LANES[lane];
        const fresh = head - at < 0.06;
        b.set(X(at), y, merge ? (u ? '◉' : '@') : (u ? '●' : 'o'), fresh ? th.ink : th[ck], undefined, ATTR.BOLD);
        if (tag) b.text(Math.min(W - tag.length, X(at) - Math.floor(tag.length / 2)), y - 2, tag, th.warn, undefined, ATTR.BOLD);
        if (tag) b.set(X(at), y - 1, u ? '╷' : '|', th.warn);
      }
      // Playhead.
      if (p < SWEEP) for (let y = 0; y < H - 1; y++) if (b.get(X(head), y)?.ch === ' ') b.set(X(head), y, u ? '┊' : ':', th.dim);
      if (latest) {
        const [lane, , hash, msg] = latest;
        let x = b.text(0, H - 1, hash, th.warn);
        x = b.text(x + 1, H - 1, LANES[lane][0], th[LANES[lane][2]], undefined, ATTR.BOLD);
        b.text(x + 2, H - 1, fit(msg, Math.max(0, W - x - 2), undefined, ctx), th.ink);
      }
    };
  },
};
