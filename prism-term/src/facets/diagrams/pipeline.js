// A CI/CD pipeline graph: build fans out to parallel test jobs, fans back in
// to staging, waits at a human approval gate, then deploys to production.
import { ATTR, glyphs, uni, phase, fit, spin } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box } from './_lines.js';

// [id, label, start, end] in seconds; the approval gate waits for a human.
const JOBS = [
  ['build', 'build', 0.2, 1.5],
  ['unit', 'unit', 1.6, 2.9], ['integ', 'integ', 1.6, 3.6], ['lint', 'lint', 1.6, 2.3],
  ['staging', 'staging', 3.7, 4.9],
  ['approve', 'approve', 5.0, 6.6],
  ['prod', 'prod', 6.7, 8.0],
];
const MIN_PER_S = 55; // fake minutes:seconds shown per real second

const clock = (s) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;

export default {
  id: 'diagrams-pipeline',
  title: 'CI/CD Pipeline',
  category: 'Boxes & Flows',
  description: 'A pipeline graph: build fans out to parallel test jobs with spinners and timings, fans in to staging, waits at a human approval gate, then deploys to prod.',
  tags: ['pipeline', 'ci', 'cd', 'dag', 'approval'],
  kind: 'diagram',
  size: { w: 76, h: 13 },
  minSize: { w: 70, h: 13 },
  loop: 10,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      const state = (id) => {
        const [, , a, z] = JOBS.find((j) => j[0] === id);
        return p >= z ? 'done' : p >= a ? (id === 'approve' ? 'wait' : 'run') : 'todo';
      };
      // Layout: five columns, the test column holds three stacked jobs.
      const cw = [11, 11, 13, 13, 10];
      const gap = Math.max(3, Math.floor((W - cw.reduce((a, c) => a + c, 0)) / 4));
      const xs = [0];
      for (let i = 1; i < 5; i++) xs.push(xs[i - 1] + cw[i - 1] + gap);
      const mid = 4;
      const B = {
        build: box(xs[0], mid, cw[0], 3),
        unit: box(xs[1], 0, cw[1], 3), integ: box(xs[1], 4, cw[1], 3), lint: box(xs[1], 8, cw[1], 3),
        staging: box(xs[2], mid, cw[2], 3), approve: box(xs[3], mid, cw[3], 3), prod: box(xs[4], mid, cw[4], 3),
      };
      const fanOut = B.build.x + B.build.w + Math.floor(gap / 2), fanIn = xs[1] + cw[1] + Math.floor(gap / 2);
      const grid = new LineGrid(W, H - 1);
      const ec = (from) => (state(from) === 'done' ? th.pos : th.line);
      grid.hline(B.build.right[0], fanOut, B.build.cy, ec('build'));
      grid.vline(fanOut, B.unit.cy, B.lint.cy, ec('build'));
      for (const id of ['unit', 'integ', 'lint']) {
        grid.path([[fanOut, B[id].cy], B[id].left], { c: ec('build'), arrow: true });
        grid.path([B[id].right, [fanIn, B[id].cy]], { c: ec(id) });
      }
      const allTests = ['unit', 'integ', 'lint'].every((id) => state(id) === 'done');
      grid.vline(fanIn, B.unit.cy, B.lint.cy, allTests ? th.pos : th.line);
      grid.path([[fanIn, B.staging.cy], B.staging.left], { c: allTests ? th.pos : th.line, arrow: true });
      grid.path([B.staging.right, B.approve.left], { c: ec('staging'), arrow: true });
      grid.path([B.approve.right, B.prod.left], { c: ec('approve'), arrow: true });
      grid.paint(ctx, b, 0, 0, { style: 'round' });

      for (const [id, label, a, z] of JOBS) {
        const s = state(id), bx = B[id];
        const mark = s === 'done' ? g.check : s === 'run' ? spin(ctx, t) : s === 'wait' ? (u ? '‖' : '=') : g.ring;
        const color = s === 'done' ? th.pos : s === 'run' ? th.accent : s === 'wait' ? (Math.floor(p * 2) % 2 ? th.warn : th.line) : th.line;
        nodeBox(ctx, b, bx.x, bx.y, `${mark} ${label}`, { w: bx.w, color, fg: s === 'todo' ? th.muted : th.ink, attr: s === 'run' || s === 'wait' ? ATTR.BOLD : 0 });
        // Timing / gate note under (or beside) each box.
        const note = s === 'done' ? (id === 'approve' ? 'by you' : clock((z - a) * MIN_PER_S)) : s === 'run' ? clock((p - a) * MIN_PER_S) : s === 'wait' ? 'needs you' : '';
        const ny = bx.y + 3;
        if (note && ny < H - 1) b.text(bx.x + Math.floor((bx.w - note.length) / 2), ny, note, s === 'wait' ? th.warn : th.dim, undefined, s === 'wait' ? ATTR.BOLD : 0);
      }
      const total = clock(Math.min(p, 8) * MIN_PER_S);
      const msg = p >= 8 ? `${g.check} pipeline #2291 passed in ${total}`
        : state('approve') === 'wait' ? `${u ? '‖' : '='} waiting for approval ${g.mid} deploy v2.14.1 to prod?`
          : `${spin(ctx, t)} pipeline #2291 ${g.mid} ${total}`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), p >= 8 ? th.pos : state('approve') === 'wait' ? th.warn : th.muted, undefined, p >= 8 ? ATTR.BOLD : 0);
    };
  },
};
