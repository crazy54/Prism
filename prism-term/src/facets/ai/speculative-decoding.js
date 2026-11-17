// Speculative decoding: a fast draft model proposes a few tokens (italic), the big model keeps the prefix it
// agrees with, strikes the rest and adds its own token; the acceptance meter runs alongside.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, runs, flow, fitRows, fitText, beat, BEATS } from './_kit7.js';

const LOOP = 12, START = 0.6, ROUND = 1.5, R0 = 10.8, R1 = 11.5;
const TARGET = ['The', ' cache', ' is', ' warmed', ' on', ' deploy', ',', ' so', ' the', ' first', ' request', ' after', ' a',
  ' release', ' skips', ' the', ' cold', ' start', '.'];
// [draft tokens, accepted]; the big model then adds the next target token (a bonus one when all are accepted)
const ROUNDS = [
  [['The', ' cache', ' is', ' warm', ' at'], 3],
  [[' on', ' deploy', ',', ' so', ' the'], 5],
  [[' request', ' after', ' the', ' next', ' build'], 2],
  [[' release', ' skips', ' the', ' warm'], 3],
  [[' start', '.'], 2],
];
// phases inside a round: draft streams, verify, judged (rejects struck), then the big model's token lands
const DRAFT = 0.3, VERIFY = 0.75, JUDGED = 1.2;

function stateAt(p) {
  let pos = 0, drafted = 0, accepted = 0, passes = 0;
  for (let r = 0; r < ROUNDS.length; r++) {
    const [draft, acc] = ROUNDS[r], t = p - (START + r * ROUND);
    if (t < 0) return { pos, drafted, accepted, passes, round: null };
    if (t < JUDGED + 0.3 || r === ROUNDS.length - 1 && t < JUDGED) {
      const stage = t < DRAFT ? 'draft' : t < VERIFY ? 'verify' : 'judged';
      const shown = stage === 'draft' ? Math.min(draft.length, 1 + Math.floor((t / DRAFT) * draft.length)) : draft.length;
      return { pos, drafted, accepted, passes, round: { r, draft: draft.slice(0, shown), acc, stage } };
    }
    pos += acc + (pos + acc < TARGET.length ? 1 : 0); drafted += draft.length; accepted += acc; passes++;
  }
  return { pos, drafted, accepted, passes, round: null, done: true };
}

export default {
  id: 'ai-speculative-decoding',
  since: '0.3.0',
  title: 'Speculative Decoding',
  category: 'Token Streams',
  description: 'A fast draft model proposes a few tokens at a time; the big model keeps the prefix it agrees with, strikes the rest and adds its own, with a live acceptance meter.',
  tags: ['speculative decoding', 'draft model', 'inference', 'tokens', 'speedup', 'model'],
  kind: 'tui',
  size: { w: 64, h: 8 },
  minSize: { w: 40, h: 5 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const finalRows = (w) => flow(TARGET.map((t) => ({ t })), w).length;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', st = stateAt(p), rd = st.round;
      // committed text in ink; the draft tail italic (secondary colour), then accepted solid and rejects struck
      const pieces = TARGET.slice(0, st.pos).map((t) => ({ t, fg: th.ink }));
      if (rd) rd.draft.forEach((t, i) => {
        if (rd.stage !== 'judged') pieces.push({ t, fg: sub(th), attr: ATTR.ITALIC });
        else if (i < rd.acc) pieces.push({ t, fg: th.ink });
        else pieces.push({ t: u ? t : t.replace(/^(\s*)(.*)$/, '$1~$2~'), fg: sub(th), attr: ATTR.STRIKE });
      });
      const lines = flow(pieces, W), want = Math.max(lines.length, finalRows(W));
      const rows = fitRows([{ k: 'head', drop: 3 }, { k: 'gap', drop: 4 }, ...Array.from({ length: want }, (_, i) => ({ k: 'text', i, drop: 1 })),
        { k: 'gap', drop: 5 }, { k: 'stats' }, { k: 'meter' }], H);
      const textRows = rows.filter((r) => r.k === 'text').length, first = Math.max(0, lines.length - textRows);
      let ti = 0;
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['draft 7B proposes', sub(th)], [` ${MID} `, sub(th)], ['70B verifies', sub(th)]]);
        else if (r.k === 'text') { (lines[first + ti] || []).forEach((it) => b.text(it.x, y, it.t, it.fg, undefined, it.attr)); ti++; }
        else if (r.k === 'stats') {
          if (!rd) fitText(b, 0, y, W, [st.done ? `done ${MID} ${st.passes} rounds ${MID} ${st.pos} tokens` : 'waiting for the draft', 'done'], th.ink);
          else if (rd.stage === 'verify') { b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); runs(ctx, b, 2, y, W - 2, [[`round ${rd.r + 1} ${MID} verifying ${rd.draft.length} draft tokens`, th.ink]]); }
          else runs(ctx, b, 0, y, W, [[`round ${rd.r + 1}`, th.ink, ATTR.BOLD], [` ${MID} draft ${rd.draft.length}`, th.ink], [rd.stage === 'judged' ? ` ${MID} accepted ${rd.acc}` : '', th.ink]]);
        } else if (r.k === 'meter') {
          const pct = st.drafted ? Math.round((st.accepted / st.drafted) * 100) : 0, speed = st.passes ? (st.pos / (st.passes * 1.62)).toFixed(1) : '1.0';
          const label = [` ${pct}% accepted ${MID} ${speed}x speedup`, ` ${pct}% accepted`, ` ${pct}%`].find((s) => W - s.length >= 8) || ` ${pct}%`;
          const bw = Math.max(4, Math.min(24, W - label.length)), n = Math.round((pct / 100) * bw);
          for (let i = 0; i < bw; i++) b.set(i, y, i < n ? (u ? '█' : '#') : (u ? '░' : '.'), i < n ? th.accent : th.mode === 'light' ? th.ink : th.muted);
          runs(ctx, b, bw, y, W - bw, [[label, th.ink]]);
        }
      });
    };
    const plan = BEATS.fade(th.mode === 'light' ? th.ink : th.muted);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
