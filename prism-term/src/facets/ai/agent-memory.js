// An assistant writes a note to its memory mid-task and, days later, recalls it to answer a new question; the
// memory pane beside the log shows the notes, their ages and the recall.
import { ATTR, uni, phase, spin, reveal } from './_ai.js';
import { sub, inv, mark, runs, runsWidth, putR, flow, beat, BEATS } from './_kit7.js';

const LOOP = 14, STORE = 1.8, LATER = 4.6, RECALL = 6.4, ANSWER = 7.4, R0 = 12.8, R1 = 13.5;
// [key, note, age before, age after "2 days later"]; the first is written during the loop
const NOTES = [['build', 'make, not npm', 'now', '2d'], ['test-db', 'set TEST_DB_URL', '5d', '1w'], ['style', 'wrap at 100 cols', '1w', '1w']];
const REPLY = 'This repo builds with make, so run make build; npm has no build script here.';

export default {
  id: 'ai-agent-memory',
  since: '0.3.0',
  title: 'Agent Memory',
  category: 'Agents & Pipelines',
  description: 'An assistant writes a note to its memory store mid-task and recalls it days later to answer a new question, with the notes and their ages in a pane beside the log.',
  tags: ['memory', 'notes', 'recall', 'persistence', 'agent', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', OK = ['✔', '*'];
      const pw = W >= 60 ? 26 : 20, px = W - pw, lw = px - 2;
      // the log, newest at the bottom
      const log = [{ k: 'ask', text: 'add lint to CI' }];
      log.push(p < 1.4 ? (p >= 0.6 ? { k: 'run', text: 'Reading Makefile' } : null) : { k: 'ok', text: 'Read Makefile' });
      if (p >= STORE) log.push({ k: 'store' });
      if (p >= 2.6) log.push(p < 3.6 ? { k: 'run', text: 'Editing .ci/pipeline.yml' } : { k: 'ok', text: 'Added a lint stage' });
      if (p >= LATER) log.push({ k: 'later' });
      if (p >= 5.4) log.push({ k: 'ask', text: 'npm run build fails?' });
      if (p >= RECALL) log.push({ k: 'recall' });
      if (p >= ANSWER) for (const l of flow((reveal(REPLY, p, ANSWER, 14).text.trimStart().match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink })), lw)) log.push({ k: 'say', l });
      const live = log.filter(Boolean);
      live.slice(Math.max(0, live.length - H)).forEach((r, y) => {
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, lw - x - 1, [[r.text, th.ink, ATTR.BOLD]]); }
        else if (r.k === 'run') { b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); runs(ctx, b, 2, y, lw - 2, [[r.text, th.ink]]); }
        else if (r.k === 'ok') { const x = mark(ctx, b, 0, y, ...OK, th.pos); runs(ctx, b, x + 1, y, lw - x - 1, [[r.text, th.ink]]); }
        else if (r.k === 'store') {
          const x = mark(ctx, b, 0, y, '▸', '>>', th.accent), full = [['stored: ', th.ink, ATTR.BOLD], ['build uses make, not npm', th.ink]];
          runs(ctx, b, x + 1, y, lw - x - 1, runsWidth(full) <= lw - x - 1 ? full : [['stored 1 note', th.ink, ATTR.BOLD]]);
        }
        else if (r.k === 'later') { const s = `${MID} 2 days later ${MID}`; b.text(Math.max(0, Math.floor((lw - s.length) / 2)), y, s, sub(th), undefined, ATTR.ITALIC); }
        else if (r.k === 'recall') { const x = mark(ctx, b, 0, y, '◂', '<<', th.accent); runs(ctx, b, x + 1, y, lw - x - 1, [['recalled 1 note', th.ink, ATTR.BOLD], [` (score 0.91)`, th.ink, 0, true]]); }
        else if (r.k === 'say') r.l.forEach((it) => b.text(it.x, y, it.t, it.fg));
      });
      // the memory pane: newest note first; when short, only the newest
      const V = u ? '│' : '|', Hz = u ? '─' : '-', notes = NOTES.filter((n, i) => i > 0 || p >= STORE), fits = Math.max(1, Math.floor((H - 2) / 2));
      b.text(px, 0, (u ? '╭' : '+') + Hz.repeat(pw - 2) + (u ? '╮' : '+'), th.line);
      b.text(px + 2, 0, ` memory ${notes.length} `, th.ink, undefined, ATTR.BOLD);
      const ph = Math.min(H - 2, fits * 2);
      for (let y = 1; y <= ph; y++) { b.set(px, y, V, th.line); b.set(W - 1, y, V, th.line); }
      b.text(px, ph + 1, (u ? '╰' : '+') + Hz.repeat(pw - 2) + (u ? '╯' : '+'), th.line);
      notes.slice(0, fits).forEach(([key, text, before, after], i) => {
        const y = 1 + i * 2, hot = (key === 'build' && p >= STORE && p < STORE + 1) || (key === 'build' && p >= RECALL);
        const x = hot ? inv(ctx, b, px + 2, y, key) : b.text(px + 2, y, key, th.ink, undefined, ATTR.BOLD);
        const age = p >= LATER ? after : before;
        if (x + 1 + age.length < W - 2) putR(b, W - 2, y, age, sub(th));
        runs(ctx, b, px + 2, y + 1, pw - 4, [[text, th.ink]]);
      });
    };
    // the task log clears row by row while the memory pane stays; then the pane returns to its first two notes
    const plan = (k, info) => {
      if (k >= 0.9) return BEATS.clear()(1, info);
      const px = info.W - (info.W >= 60 ? 26 : 20), n = Math.ceil((k / 0.9) * info.H);
      return { rows: Array.from({ length: info.H }, (_, y) => ({ src: 'end', y, mask: y < n ? (x) => x < px : undefined })) };
    };
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
