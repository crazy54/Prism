// A delivery flowchart with decisions and a loop: a run token walks the graph,
// fails tests once, goes round the fix loop, then ships through a canary.
import { ATTR, glyphs, uni, phase, fit } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box, polyline, along } from './_lines.js';

// Node layout on a 64-column grid; decisions are drawn double-bordered.
const NODES = {
  commit: [0, 2, 11, 'commit'], build: [17, 2, 9, 'build'], tests: [32, 2, 12, 'tests?', 1], notify: [52, 2, 10, 'notify'],
  canary: [32, 8, 13, 'canary 5%'], healthy: [14, 8, 13, 'healthy?', 1], promote: [0, 8, 9, 'ship'],
  rollback: [14, 13, 13, 'roll back'],
};
// Steps the run token takes: [kind, id, seconds, result].
const STEPS = [
  ['node', 'commit', 0.5], ['edge', 'commit-build', 0.3], ['node', 'build', 0.6], ['edge', 'build-tests', 0.3],
  ['node', 'tests', 0.5, 'fail'], ['edge', 'tests-notify', 0.3], ['node', 'notify', 0.5], ['edge', 'notify-build', 0.6],
  ['node', 'build', 0.5], ['edge', 'build-tests', 0.3], ['node', 'tests', 0.5, 'pass'], ['edge', 'tests-canary', 0.4],
  ['node', 'canary', 0.7], ['edge', 'canary-healthy', 0.3], ['node', 'healthy', 0.5, 'pass'], ['edge', 'healthy-promote', 0.3],
  ['node', 'promote', 1.9, 'done'],
];

export default {
  id: 'diagrams-flowchart',
  title: 'Flowchart',
  category: 'Boxes & Flows',
  description: 'A delivery flowchart with decisions, labeled yes/no branches and a fix loop; a run token walks it, fails tests once, loops back, then ships via a canary.',
  tags: ['flowchart', 'decision', 'process', 'ci', 'graph'],
  kind: 'diagram',
  size: { w: 64, h: 17 },
  minSize: { w: 62, h: 17 },
  loop: 9,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    const N = Object.fromEntries(Object.entries(NODES).map(([k, [x, y, w]]) => [k, box(x, y, w, 3)]));
    const EDGES = {
      'commit-build': [[N.commit.right, N.build.left]],
      'build-tests': [[N.build.right, N.tests.left]],
      'tests-notify': [[N.tests.right, N.notify.left], 'no'],
      'notify-build': [[N.notify.top, [N.notify.cx, 0], [N.build.cx, 0], N.build.top], 'fix'],
      'tests-canary': [[N.tests.bottom, N.canary.top], 'yes'],
      'canary-healthy': [[N.canary.left, N.healthy.right]],
      'healthy-promote': [[N.healthy.left, N.promote.right], 'yes'],
      'healthy-rollback': [[N.healthy.bottom, N.rollback.top], 'no'],
    };
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      // Where is the token?
      let acc = 0, cur = STEPS.length - 1, local = 1;
      for (let i = 0; i < STEPS.length; i++) {
        if (p < acc + STEPS[i][2]) { cur = i; local = (p - acc) / STEPS[i][2]; break; }
        acc += STEPS[i][2];
      }
      const visited = new Set(), results = {};
      for (let i = 0; i <= cur; i++) {
        const [kind, id, , res] = STEPS[i];
        if (kind === 'node') { visited.add(id); if (res && (i < cur || local > 0.6)) results[id] = res; }
      }
      const [kind, id] = STEPS[cur];

      const grid = new LineGrid(W, H - 1);
      for (const [eid, [corners]] of Object.entries(EDGES)) {
        const hot = kind === 'edge' && eid === id;
        grid.path(corners, { c: hot ? th.accent : undefined, arrow: true });
      }
      grid.paint(ctx, b, 0, 0, { style: 'round' });
      for (const [eid, [corners, label]] of Object.entries(EDGES)) {
        if (!label) continue;
        const [[ax, ay], [bx, by]] = corners;
        const lx = ay === by ? Math.floor((ax + bx) / 2) - Math.floor(label.length / 2) : ax + 1;
        const ly = ay === by ? ay - (eid === 'notify-build' ? 0 : 1) : Math.floor((ay + by) / 2);
        if (eid === 'notify-build') b.text(Math.floor((N.notify.cx + N.build.cx) / 2) - 2, 0, ` ${label} `, th.muted);
        else b.text(lx, ly, label, label === 'no' ? th.neg : th.pos);
      }
      for (const [nid, [x, y, w, label, decision]] of Object.entries(NODES)) {
        const here = kind === 'node' && id === nid;
        const res = results[nid];
        const color = res === 'fail' && (here || !visited.has('canary')) ? th.neg : here ? th.accent : visited.has(nid) ? th.pos : th.line;
        const mark = res === 'fail' ? `${g.cross} ` : res === 'pass' || res === 'done' ? `${g.check} ` : '';
        nodeBox(ctx, b, x, y, here || res ? `${mark}${label}` : label, {
          w, color, style: decision ? 'double' : 'round',
          fg: nid === 'rollback' ? th.muted : here ? th.ink : visited.has(nid) ? th.ink : th.muted, attr: here ? ATTR.BOLD : 0,
        });
      }
      // The token, traveling the current edge.
      if (kind === 'edge') {
        const at = along(polyline(EDGES[id][0]), local);
        if (at) b.set(at[0], at[1], u ? '●' : '@', th.accent, undefined, ATTR.BOLD);
      }
      const msg = results.promote === 'done' ? `${g.check} shipped a1f9c3e ${g.mid} 2 runs, 1 fix`
        : results.tests === 'fail' && !visited.has('canary') ? `${g.cross} unit tests failed ${g.mid} author notified` : `run #418 ${g.mid} ${kind === 'node' ? NODES[id][3].replace('?', '') : `${g.ellipsis}`}`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), results.promote === 'done' ? th.pos : msg.startsWith(g.cross) ? th.neg : th.muted);
    };
  },
};
