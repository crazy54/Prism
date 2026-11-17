// Speech to text with partials: the unstable tail rewrites itself as more audio arrives ("role" becomes "roll",
// "cue" becomes "queue"), then the line commits with its punctuation on a pause.
import { ATTR, uni, phase } from './_ai.js';
import { sub, runs, flow, fitText, beat, BEATS } from './_kit7.js';

const LOOP = 12, R0 = 10.8, R1 = 11.5;
// [time, words so far] per utterance, then [commit time, final text]
const LINES = [
  [[[0.5, 'okay'], [0.8, "okay let's"], [1.1, "okay let's role"], [1.4, "okay let's roll back"], [1.8, "okay let's roll back the"],
    [2.1, "okay let's roll back the payments"], [2.4, "okay let's roll back the payments service"]], [3.0, "Okay, let's roll back the payments service."]],
  [[[3.4, 'then'], [3.7, 'then page'], [4.0, 'then page whoever'], [4.3, 'then page whoever owns'], [4.6, 'then page whoever owns the'],
    [4.9, 'then page whoever owns the billing'], [5.2, 'then page whoever owns the billing cue'], [5.6, 'then page whoever owns the billing queue for'],
    [5.9, 'then page whoever owns the billing queue for the'], [6.4, 'then page whoever owns the billing queue for the deploy']],
  [7.0, 'Then page whoever owns the billing queue for the deploy.']],
  [[[7.4, 'and'], [7.7, 'and post'], [8.0, 'and post an'], [8.3, 'and post an update'], [8.6, 'and post an update in'],
    [8.9, 'and post an update in incident'], [9.2, 'and post an update in incident chat'], [9.5, 'and post an update in the incident channel']],
  [10.0, 'And post an update in the incident channel.']],
];
const LEVELS_U = '▁▂▃▄▅▆▇█', LEVELS_A = '.:=#';

export default {
  id: 'ai-live-transcript',
  since: '0.3.0',
  title: 'Live Transcript',
  category: 'Token Streams',
  description: 'Speech to text with partials: the unstable tail rewrites itself as more audio arrives, then the line commits with punctuation when the speaker pauses.',
  tags: ['speech to text', 'transcription', 'partials', 'streaming', 'voice', 'model'],
  kind: 'tui',
  size: { w: 64, h: 8 },
  minSize: { w: 40, h: 5 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const pieces = [], rows = [];
      let partial = null, lastWord = -1;
      for (const [steps, [commit, final]] of LINES) {
        if (p < steps[0][0]) break;
        if (p >= commit) { rows.push(flow((final.match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink })), W)); continue; }
        const [at, words] = steps.filter(([t]) => p >= t).pop(), ws = words.split(' ');
        lastWord = at;
        // the last two words are unstable until the pause commits them
        ws.forEach((w, i) => pieces.push({ t: (i ? ' ' : '') + w, fg: i >= ws.length - 2 ? sub(th) : th.ink, attr: i >= ws.length - 2 ? ATTR.ITALIC | ATTR.UNDERLINE : 0 }));
        partial = flow(pieces, W);
      }
      const all = rows.flat().concat(partial || []), speaking = lastWord >= 0 && p - lastWord < 0.6;
      // status: the mic level, then the partial's age (the level drops first)
      const lv = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(p * 9.1) * Math.cos(p * 3.7)) : 0.08 + 0.06 * Math.abs(Math.sin(p * 2.3));
      const state = partial ? `partial ${MID} ${Math.max(0, p - lastWord).toFixed(1)}s` : 'listening';
      const lvW = W >= 48 ? 8 : 0;
      for (let i = 0; i < lvW; i++) {
        const k = Math.max(0, Math.min(1, lv * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + p * 6))))), L = u ? LEVELS_U : LEVELS_A;
        b.set(i, 0, L[Math.min(L.length - 1, Math.floor(k * L.length))], th.accent);
      }
      fitText(b, lvW ? lvW + 1 : 0, 0, W - (lvW ? lvW + 1 : 0), [state], th.ink, undefined, ATTR.BOLD);
      const room = H - 1;
      all.slice(Math.max(0, all.length - room)).forEach((l, y) => l.forEach((it) => runs(ctx, b, it.x, y + 1, W - it.x, [[it.t, it.fg, it.attr]])));
    };
    const plan = BEATS.divider(ctx, 'end of recording');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
