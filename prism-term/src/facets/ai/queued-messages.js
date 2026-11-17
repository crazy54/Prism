// Follow-ups typed while the assistant works: Enter queues them as numbered chips, and when the turn ends the
// queue drains into the next turn.
import { ATTR, uni, phase, spin, typed } from './_ai.js';
import { sub, mark, runs, runsWidth, fitText, beat, BEATS } from './_kit7.js';

const LOOP = 14, CPS = 15, R0 = 12.8, R1 = 13.5;
// [typing starts, text]; Enter lands 0.25 s after the last key
const FOLLOW = [[1.0, 'also bump the version'], [3.4, 'skip docs']].map(([a, s]) => [a, s, a + s.length / CPS + 0.25]);
const FILES = [0, 2.0, 4.6, 7.0], WORKED = 8.6, DRAIN = 9.3, NEXT = 10.9;

export default {
  id: 'ai-queued-messages',
  since: '0.3.0',
  title: 'Queued Follow-ups',
  category: 'Thinking States',
  description: 'Follow-ups typed while the assistant is still working stack up as numbered queued messages, then fold into the next turn when the current one finishes.',
  tags: ['queue', 'follow-up', 'composer', 'chat', 'agent', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 9 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', OK = ['✔', '*'];
      const queued = p < DRAIN ? FOLLOW.filter(([, , sent]) => p >= sent) : [];
      const typing = FOLLOW.find(([a, , sent]) => p >= a && p < sent);
      // the transcript, newest at the bottom; older rows scroll off the top
      const log = [{ k: 'ask', text: 'rename fetchUser to getUser' }];
      if (p < WORKED) log.push({ k: 'run', text: 'Updating call sites', detail: `${FILES.filter((t) => p >= t).length} of 4` });
      else log.push({ k: 'ok', text: 'Updated 4 call sites', detail: '3 files' });
      if (p >= DRAIN) {
        log.push({ k: 'pick' });
        if (p < NEXT) log.push({ k: 'run', text: 'Bumping the version', detail: 'package.json' });
        else log.push({ k: 'ok', text: 'Bumped 2.3.0 to 2.4.0', detail: 'docs skipped' });
      }
      const rows = Math.max(1, H - 2);
      log.slice(Math.max(0, log.length - rows)).forEach((r, y) => {
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [[r.text, th.ink, ATTR.BOLD]]); }
        else if (r.k === 'run' || r.k === 'ok') {
          const x = r.k === 'run' ? (b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD), 1) : mark(ctx, b, 0, y, ...OK, th.pos);
          runs(ctx, b, x + 1, y, W - x - 1, [[r.text, th.ink], [` ${MID} ${r.detail}`, sub(th), 0, true]]);
        } else if (r.k === 'pick') {
          const x = mark(ctx, b, 0, y, '↳', '\\_', th.muted);
          runs(ctx, b, x + 1, y, W - x - 1, [['picked up 2 queued messages', th.ink]]);
        }
      });
      // the queue: a count, then whole chips while they fit
      const qy = H - 2;
      if (queued.length) {
        let x = b.text(0, qy, `queued (${queued.length})`, th.ink, undefined, ATTR.BOLD);
        for (let i = 0; i < queued.length; i++) {
          const [, text, sent] = queued[i], more = `  +${queued.length - i}`;
          const chip = [['  [', th.accent, ATTR.BOLD], [String(i + 1), th.ink, ATTR.BOLD], ['] ', th.accent, ATTR.BOLD], [text, th.ink, p - sent < 0.6 ? ATTR.BOLD : 0]];
          // a chip that won't fit becomes "+N" for itself and the rest (unless the next one is the last and fits)
          const tail = i < queued.length - 1 ? 2 + String(queued.length - i - 1).length + 1 : 0;
          if (x + runsWidth(chip) + tail <= W) x = runs(ctx, b, x, qy, W - x, chip);
          else { if (i > 0 && x + more.length <= W) b.text(x, qy, more, th.ink); break; }
        }
      }
      // the composer
      const cy = H - 1, x = mark(ctx, b, 0, cy, '›', '>', th.accent) + 1;
      if (typing) {
        const s = typed(typing[1], p, typing[0], CPS), end = runs(ctx, b, x, cy, W - x - 1, [[s, th.ink]]);
        b.set(end, cy, u ? '▌' : '_', th.ink, undefined, ATTR.BOLD);
      } else {
        b.set(x, cy, u ? '▌' : '_', th.ink, undefined, ATTR.BOLD);
        const hints = p < WORKED ? ['type a follow-up; it queues until this turn ends', 'type a follow-up to queue it', 'type to queue'] : ['type a message'];
        fitText(b, x + 2, cy, W - x - 2, hints, sub(th));
      }
    };
    const plan = BEATS.scroll(0);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
