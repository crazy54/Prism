// A rebase, visualized: feature commits lift off their old base, replay onto
// the tip of main with new hashes (the originals left behind as ghosts), then
// main fast-forwards so history is a straight line.
import { ATTR, uni, phase, ease, fit, typed } from '../callouts/_kit.js';
import { LineGrid } from './_lines.js';

const MAIN = [['A', 0.06, '6c4f2d9'], ['B', 0.2, '9d02c55'], ['C', 0.34, 'e41d7f2']];
// Feature commits: [label, x before, x after, old hash, new hash, replay start]
const FEAT = [['D', 0.36, 0.52, '3b8d0aa', '9a1c4e0', 1.6], ['E', 0.5, 0.66, '7c2e9b1', 'f02b7d3', 2.1]];
const CMDS = [[0, 'git switch feat/pool-size'], [1.3, 'git rebase main'], [4.2, 'git switch main && git merge --ff-only feat/pool-size']];
const MOVE = 0.9, FF = [4.9, 5.6], GC = 7.2;
const MAIN_Y = 2, NEW_Y = 5, OLD_Y = 8;

export default {
  id: 'diagrams-git-rebase',
  title: 'Rebase, Visualized',
  category: 'Git Graphs',
  description: 'A git rebase, visualized: feature commits lift off their old base and replay onto main with new hashes, leaving ghosts, then main fast-forwards to a line.',
  tags: ['git', 'rebase', 'fast-forward', 'history', 'branches'],
  kind: 'diagram',
  size: { w: 72, h: 12 },
  minSize: { w: 52, h: 12 },
  loop: 9,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 9);
      const X = (f) => 2 + Math.round(f * (W - 8));
      // Short hashes when commits sit close together.
      const hl = Math.max(4, Math.min(7, X(0.14) - X(0) - 1));
      const hash = (x, y, h, c, attr) => b.text(x - Math.floor(hl / 2), y, h.slice(0, hl), c, undefined, attr);
      const ff = ease(p, FF[0], FF[1]);
      const started = p >= FEAT[0][5];
      const rebased = FEAT.every(([, , , , , at]) => p >= at + MOVE);
      const ghosts = started && p < GC;
      // Where each feature commit is right now: arcing from the old lane to the new one, then up into main.
      const pos = FEAT.map(([, a, z, , , at]) => {
        const k = ease(p, at, at + MOVE);
        const y = OLD_Y + (NEW_Y - OLD_Y) * k - Math.sin(Math.PI * k) * 1.5 - (NEW_Y - MAIN_Y) * ff;
        return [X(a + (z - a) * k), Math.round(y), k];
      });

      const grid = new LineGrid(W, H - 2);
      grid.hline(X(MAIN[0][1]), ff >= 1 ? X(FEAT[1][2]) : X(MAIN[2][1]), MAIN_Y, th.accent);
      // The original lane hangs off B; once replayed it is unreachable (dim) until gc.
      if (!started || ghosts) {
        const c = started ? th.dim : th.pos;
        grid.vline(X(MAIN[1][1]), MAIN_Y, OLD_Y, c);
        grid.hline(X(MAIN[1][1]), X(FEAT[1][1]), OLD_Y, c);
      }
      if (rebased && ff < 1) {
        const ly = Math.round(NEW_Y - (NEW_Y - MAIN_Y) * ff);
        if (ly > MAIN_Y) grid.vline(X(MAIN[2][1]), MAIN_Y, ly, th.pos);
        grid.hline(X(MAIN[2][1]), X(FEAT[1][2]), ly, th.pos);
      }
      grid.paint(ctx, b, 0, 0, { style: 'round' });

      MAIN.forEach(([label, f, h]) => {
        b.set(X(f), MAIN_Y, u ? '●' : 'o', th.accent, undefined, ATTR.BOLD);
        b.text(X(f), MAIN_Y - 1, label, th.ink, undefined, ATTR.BOLD);
        hash(X(f), MAIN_Y + 1, h, th.muted);
      });
      FEAT.forEach(([label, a, , oldHash, newHash], i) => {
        const [x, y, k] = pos[i];
        if (ghosts && k > 0) {
          b.set(X(a), OLD_Y, u ? '○' : 'o', th.dim);
          b.text(X(a), OLD_Y - 1, label, th.dim);
          hash(X(a), OLD_Y + 1, oldHash, th.dim, ATTR.STRIKE);
        }
        const moved = k >= 1;
        b.set(x, y, u ? '●' : 'o', k > 0 && !moved ? th.warn : th.pos, undefined, ATTR.BOLD);
        b.text(x, y - 1, moved ? `${label}'` : label, th.ink, undefined, ATTR.BOLD);
        if (k === 0 || moved) hash(x, y + 1, moved ? newHash : oldHash, moved ? th.pos : th.muted);
      });
      // Branch pointers.
      const tip = pos[1];
      if (ff >= 1) b.text(Math.min(W - 21, tip[0] + 2), MAIN_Y, ' main, feat/pool-size', th.accent, undefined, ATTR.BOLD);
      else {
        b.text(X(MAIN[2][1]) + 2, MAIN_Y, ' main', th.accent, undefined, ATTR.BOLD);
        b.text(Math.min(W - 15, tip[0] + 2), tip[1], ' feat/pool-size', th.pos, undefined, ATTR.BOLD);
      }
      // Output and command lines.
      let ci = 0;
      CMDS.forEach(([at], i) => { if (p >= at) ci = i; });
      const [at, cmd] = CMDS[ci];
      const x = b.text(0, H - 1, '$ ', th.pos, undefined, ATTR.BOLD);
      b.text(x, H - 1, fit(typed(cmd, p, at, 30), W - x, undefined, ctx), th.ink, undefined, ATTR.BOLD);
      const note = ff >= 1 ? (p >= GC ? 'Fast-forward. Old commits unreachable; gc will drop them.' : 'Fast-forward: history is linear.')
        : rebased ? 'Successfully rebased and updated refs/heads/feat/pool-size.'
          : started ? `Applying: ${p >= FEAT[1][5] ? 'Size DB pool to workers' : 'Add pool wait alert'}` : '';
      if (note) b.text(0, H - 2, fit(note, W, undefined, ctx), ff >= 1 ? th.pos : th.muted);
    };
  },
};
