// Structured output streaming: JSON arrives token by token, pretty-printed
// with syntax color, while a schema checklist ticks off completed fields.
import { ATTR, glyphs, uni, phase, fit, reveal, stringWidth } from './_ai.js';

const OBJ = {
  incident: 'INC-3127', severity: 'sev2', service: 'checkout-api', cause: 'db pool starvation', confidence: 0.87,
  actions: [{ type: 'config', set: 'DB_POOL_SIZE=40' }, { type: 'alert', on: 'pool_wait_ms > 200' }],
  needs_approval: true,
};
// Pretty-printed, with each action object kept on one line.
const JSON_TEXT = JSON.stringify(OBJ, null, 2).replace(/\{\n\s+"type"/g, '{ "type"').replace(/,\n\s+"(set|on)"/g, ', "$1"').replace(/"\n\s+\}/g, '" }');
const FIELDS = Object.keys(OBJ);
// Where each top-level field's value ends in the text (it's complete once revealed past this).
const ENDS = FIELDS.map((k, i) => {
  const at = JSON_TEXT.indexOf(`"${k}"`);
  const next = i + 1 < FIELDS.length ? JSON_TEXT.indexOf(`"${FIELDS[i + 1]}"`) : JSON_TEXT.lastIndexOf('}');
  return [at, next];
});

export default {
  id: 'ai-structured-output',
  title: 'Structured Output',
  category: 'Token Streams',
  description: 'Structured output streaming in: JSON arrives token by token, pretty-printed with syntax color, while a schema checklist ticks off each completed field.',
  tags: ['json', 'structured output', 'schema', 'streaming', 'tool use'],
  kind: 'text',
  size: { w: 72, h: 14 },
  minSize: { w: 44, h: 10 },
  loop: 9,
  color: '16',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const r = reveal(JSON_TEXT, p, 0.3, 30);
      const shown = r.text;
      const side = W >= 64;
      const jw = side ? W - 20 : W;
      const lines = shown.split('\n');
      const first = Math.max(0, lines.length - (H - 1));
      lines.slice(first).forEach((line, y) => {
        let x = 0;
        // Tokenize one line of JSON for color.
        for (const m of line.matchAll(/("(?:[^"\\]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}[\],])|(\s+)|(.)/g)) {
          const [tok, str, colon, num, lit, punct] = m;
          let c = th.ink;
          if (str) c = colon ? th.accent : th.pos;
          else if (num) c = th.warn;
          else if (lit) c = th.crit;
          else if (punct) c = th.dim;
          const room = Math.max(0, jw - x);
          if (!room) break;
          const piece = stringWidth(tok) <= room ? tok : tok.slice(0, room);
          if (str && colon) { x = b.text(x, y, piece.slice(0, piece.length - colon.length), c); x = b.text(x, y, piece.slice(piece.length - colon.length), th.dim); }
          else x = b.text(x, y, piece, c);
        }
      });
      if (!r.done && lines.length) {
        const ly = lines.length - 1 - first;
        b.set(Math.min(jw - 1, lines[lines.length - 1].length), ly, u ? '▍' : '_', th.accent);
      }
      // Schema checklist.
      const done = FIELDS.map((_, i) => shown.length >= ENDS[i][1]);
      const started = FIELDS.map((_, i) => shown.length > ENDS[i][0]);
      if (side) {
        const sx = W - 18;
        for (let y = 0; y < H - 1; y++) b.set(sx - 2, y, u ? '│' : '|', th.line);
        b.text(sx, 0, fit('IncidentSummary', W - sx, undefined, ctx), th.ink, undefined, ATTR.BOLD);
        FIELDS.forEach((k, i) => {
          const y = 2 + i;
          if (y >= H - 1) return;
          const mark = done[i] ? g.check : started[i] ? g.tri : g.ring;
          b.text(sx, y, mark, done[i] ? th.pos : started[i] ? th.accent : th.dim, undefined, ATTR.BOLD);
          b.text(sx + 2, y, fit(k, W - sx - 2, undefined, ctx).trimEnd(), done[i] ? th.ink : th.muted);
        });
      }
      const n = done.filter(Boolean).length;
      const msg = r.done ? `${g.check} valid against IncidentSummary ${g.mid} ${FIELDS.length}/${FIELDS.length} fields ${g.mid} needs_approval: true`
        : `streaming ${g.mid} ${n}/${FIELDS.length} fields ${g.mid} ${r.n}/${r.total} tokens`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), r.done ? th.pos : th.muted);
    };
  },
};
