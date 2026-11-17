// Mid-task, the user presses Esc: the assistant stops cleanly with its finished edits kept, then a typed
// instruction steers the rest of the work.
import { ATTR, uni, phase, spin, typed, ell } from './_ai.js';
import { sub, inv, mark, runs, beat, BEATS } from './_kit7.js';

const LOOP = 14, ESC = 4.9, STEER_AT = 5.7, STEER = 'only touch the tests', CPS = 16;
const SENT = STEER_AT + STEER.length / CPS + 0.3, DONE = SENT + 4.2, R0 = 12.8, R1 = 13.5;
// [start, end, doing, done, what, detail]; the last step before Esc is cut short (done = null)
const WORK = [
  [0.4, 1.2, 'Reading', 'Read', 'src/retry/backoff.go', '84 lines'],
  [1.4, 2.6, 'Editing', 'Edited', 'src/retry/backoff.go', '+12 −3'],
  [2.8, 3.8, 'Editing', 'Edited', 'src/retry/client.go', '+4 −1'],
  [4.0, ESC, 'Editing', null, 'src/http/transport.go', ''],
  [SENT + 0.3, SENT + 1.1, 'Reading', 'Read', 'src/retry/backoff_test.go', '210 lines'],
  [SENT + 1.3, SENT + 2.6, 'Editing', 'Edited', 'src/retry/backoff_test.go', '+18 −2'],
  [SENT + 2.8, SENT + 3.9, 'Running', 'Ran', 'go test ./retry/...', '14 passed'],
];

export default {
  id: 'ai-interrupt-steer',
  since: '0.3.0',
  title: 'Interrupt & Steer',
  category: 'Thinking States',
  description: 'The assistant is mid-task when Esc stops it cleanly, keeping the edits it finished; a typed instruction then redirects the rest of the work.',
  tags: ['interrupt', 'escape', 'steer', 'cancel', 'agent', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 9 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', OK = ['✔', '*'];
      const log = [{ k: 'ask', text: 'fix the flaky retry test' }];
      WORK.forEach(([a, e, doing, did, what, detail], i) => {
        if (p < a) return;
        if (did === null) log.push(p < ESC ? { k: 'run', text: `${doing} ${what}` } : { k: 'stop' });
        else log.push(p < e ? { k: 'run', text: `${doing} ${what}` } : { k: 'did', verb: did, what, detail });
        if (i === 3 && p >= ESC + 0.3) log.push(p < SENT ? { k: 'compose', text: typed(STEER, p, STEER_AT, CPS) } : { k: 'ask', text: STEER });
      });
      if (p >= DONE) log.push({ k: 'fin' });
      const busy = p < ESC || (p >= SENT && p < DONE), composing = p >= ESC + 0.3 && p < SENT;
      const hintRow = H >= 5, rows = H - (hintRow ? 1 : 0);
      log.slice(Math.max(0, log.length - rows)).forEach((r, y) => {
        if (r.k === 'ask' || r.k === 'compose') {
          const x = mark(ctx, b, 0, y, '›', '>', th.accent);
          const end = runs(ctx, b, x + 1, y, W - x - 2, [[r.text, th.ink, r.k === 'ask' ? ATTR.BOLD : 0]]);
          if (r.k === 'compose' && end < W) b.set(end, y, u ? '▌' : '_', th.ink, undefined, ATTR.BOLD);
        } else if (r.k === 'run') {
          b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD);
          runs(ctx, b, 2, y, W - 2, [[/\.\.\.$/.test(r.text) ? r.text : `${r.text}${ell(ctx)}`, th.ink]]);
        } else if (r.k === 'did') {
          const x = mark(ctx, b, 0, y, ...OK, th.pos);
          runs(ctx, b, x + 1, y, W - x - 1, [[`${r.verb} `, th.ink], [r.what, th.ink, ATTR.BOLD], [`  ${r.detail}`, sub(th), 0, true]]);
        } else if (r.k === 'stop') {
          const x = mark(ctx, b, 0, y, '⏹', '#', th.warn);
          runs(ctx, b, x + 1, y, W - x - 1, [['interrupted', th.ink, ATTR.BOLD], [` ${MID} kept 2 of 3 edits`, th.ink]]);
        } else if (r.k === 'fin') {
          const x = mark(ctx, b, 0, y, ...OK, th.pos);
          runs(ctx, b, x + 1, y, W - x - 1, [['done', th.ink, ATTR.BOLD], [` ${MID} 3 files changed`, th.ink]]);
        }
      });
      if (!hintRow) return;
      const y = H - 1;
      if (busy) {
        const pressed = p >= ESC - 0.35 && p < ESC;
        const x = pressed ? inv(ctx, b, 0, y, 'esc') : b.text(0, y, 'esc', sub(th), undefined, ATTR.BOLD);
        b.text(x, y, ' to interrupt', sub(th));
      } else if (composing) b.text(0, y, 'enter to send', sub(th));
    };
    const plan = BEATS.wipeUp(ctx, 'new task');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
