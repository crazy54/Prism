// A top-down hierarchy (org chart / agent tree): mainbrain dispatches
// instructions down to its agents and findings travel back up the elbows.
import { ATTR, glyphs, uni, phase, tint, fit, stringWidth } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box, polyline, along, tap } from './_lines.js';

const ROOT = 'mainbrain';
const TEAM = [
  ['collector', ['ingest', 'logs']],
  ['analyst', ['detect', 'correlate']],
  ['fixer', ['planner', 'approve']],
];
// Message script: [start, leaf index 0-5, direction 'down' | 'up', text]
const MSGS = [
  [0.2, 0, 'down', 'sample checkout spans'], [1.0, 0, 'up', '1.2k spans/s, p99 2.4s'],
  [1.8, 2, 'down', 'scan for anomalies'], [2.6, 3, 'up', 'pool wait ~ p99 (r=0.94)'],
  [3.4, 4, 'down', 'plan: pool 20 -> 40'], [4.2, 5, 'up', 'fix #142 awaiting approval'],
  [5.0, 1, 'down', 'tail checkout errors'], [5.8, 1, 'up', 'timeouts down 92%'],
];
const HOP = 0.8;

export default {
  id: 'diagrams-org-chart',
  title: 'Agent Hierarchy',
  category: 'Trees & Hierarchies',
  description: 'An org-chart style tree with elbow connectors: mainbrain sends instructions down to its agents and their findings travel back up, each hop lighting the path.',
  tags: ['org chart', 'hierarchy', 'tree', 'agents', 'elbow connectors'],
  kind: 'diagram',
  size: { w: 76, h: 16 },
  minSize: { w: 70, h: 16 },
  loop: 7,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      // Leaves spread across the width; parents center over their children.
      const leaves = TEAM.flatMap(([, kids]) => kids);
      const lw = leaves.map((l) => stringWidth(l) + 4);
      const gap = Math.max(1, Math.floor((W - lw.reduce((a, c) => a + c, 0)) / (leaves.length - 1)));
      let x = Math.max(0, Math.floor((W - lw.reduce((a, c) => a + c, 0) - gap * (leaves.length - 1)) / 2));
      const L = leaves.map((name, i) => { const bx = box(x, 12, lw[i], 3); x += lw[i] + gap; return bx; });
      const P = TEAM.map(([name], i) => {
        const a = L[i * 2], z = L[i * 2 + 1];
        const w = stringWidth(name) + 4;
        return box(Math.round((a.cx + z.cx) / 2 - w / 2), 6, w, 3);
      });
      const rw = stringWidth(ROOT) + 6;
      // Root sits over the middle agent so its stem drops straight through.
      const R = box(P[1].cx - Math.floor(rw / 2), 0, rw, 3);

      // Which path is active?
      const live = MSGS.filter(([at]) => p >= at && p < at + HOP).pop();
      const grid = new LineGrid(W, H - 1);
      const edge = (from, to, my) => [from.bottom, [from.cx, my], [to.cx, my], to.top];
      P.forEach((pp, i) => {
        const hot = live && Math.floor(live[1] / 2) === i;
        grid.path(edge(R, pp, 4), { c: hot ? (live[2] === 'down' ? th.accent : th.pos) : undefined });
        [0, 1].forEach((k) => {
          const leafHot = live && live[1] === i * 2 + k;
          grid.path(edge(pp, L[i * 2 + k], 10), { c: leafHot ? (live[2] === 'down' ? th.accent : th.pos) : undefined });
        });
      });
      grid.paint(ctx, b, 0, 0, { style: 'round' });

      nodeBox(ctx, b, R.x, R.y, ROOT, { w: R.w, color: th.accent, bg: tint(ctx, th.accent, 0.15), attr: ATTR.BOLD });
      TEAM.forEach(([name], i) => {
        const hot = live && Math.floor(live[1] / 2) === i;
        nodeBox(ctx, b, P[i].x, P[i].y, name, { w: P[i].w, color: hot ? th.info : th.line, attr: hot ? ATTR.BOLD : 0 });
      });
      leaves.forEach((name, i) => {
        const hot = live && live[1] === i;
        nodeBox(ctx, b, L[i].x, L[i].y, name, { w: L[i].w, color: hot ? (live[2] === 'down' ? th.accent : th.pos) : th.line, fg: hot ? th.ink : th.muted });
      });

      // Join the connectors into the box borders.
      tap(ctx, b, R.cx, R.y + 2, 'bottom', th.accent);
      P.forEach((pp, i) => { tap(ctx, b, pp.cx, pp.y, 'top'); tap(ctx, b, pp.cx, pp.y + 2, 'bottom'); tap(ctx, b, L[i * 2].cx, L[i * 2].y, 'top'); tap(ctx, b, L[i * 2 + 1].cx, L[i * 2 + 1].y, 'top'); });
      // The message dot, root → leaf or leaf → root.
      if (live) {
        const [at, leaf, dir] = live;
        const pi = Math.floor(leaf / 2);
        const pts = [...polyline(edge(R, P[pi], 4)), ...polyline(edge(P[pi], L[leaf], 10))];
        const f = (p - at) / HOP;
        const pt = along(pts, dir === 'down' ? f : 1 - f);
        if (pt) b.set(pt[0], pt[1], u ? '●' : 'o', dir === 'down' ? th.accent : th.pos, undefined, ATTR.BOLD);
      }
      // Message log line.
      const last = MSGS.filter(([at]) => p >= at).pop();
      if (last) {
        const [, leaf, dir, text] = last;
        const who = leaves[leaf];
        const arrow = dir === 'down' ? `${ROOT} ${g.right} ${who}` : `${who} ${g.right} ${ROOT}`;
        let lx = b.text(0, H - 1, arrow, dir === 'down' ? th.accent : th.pos, undefined, ATTR.BOLD);
        b.text(lx + 2, H - 1, fit(u ? text.replace('->', '→') : text, Math.max(0, W - lx - 2), undefined, ctx), th.ink);
      }
    };
  },
};
