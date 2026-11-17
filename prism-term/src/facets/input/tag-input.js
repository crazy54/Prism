// A tag input: typing a key=value and pressing Enter (or a comma) makes a token; Backspace on empty removes one.
import { ATTR, uni, phase, panel, stringWidth } from './_input.js';
import { sub, fitText } from './_kit6.js';

const LOOP = 12, MAX = 10;
// [time, key]. Three tags are added, a duplicate bounces, then Backspace removes them all (back to the start).
const KEYS = (() => {
  const out = [];
  let t = 0.6;
  const type = (s, end) => { for (const c of s) { out.push([t, c]); t += 0.12; } out.push([t, end]); t += 0.5; };
  type('env=prod', 'ENTER'); type('team=web', ','); type('tier=api', 'ENTER');
  t += 0.3; type('team=web', 'ENTER');
  t = Math.max(t + 1.2, 8.4); out.push([t, 'CLEARDUP']);
  for (const dt of [0.6, 1.2, 1.8]) out.push([t + dt, 'BS']);
  return out;
})();

function stateAt(p) {
  const tags = [];
  let cur = '', dup = -Infinity, removed = -Infinity;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'ENTER' || k === ',') { if (tags.includes(cur)) dup = t; else if (cur) { tags.push(cur); cur = ''; } }
    else if (k === 'CLEARDUP') cur = '';
    else if (k === 'BS') { if (cur) cur = cur.slice(0, -1); else { tags.pop(); removed = t; } }
    else cur += k;
  }
  return { tags, cur, dup: p - dup, removed: p - removed };
}

export default {
  id: 'input-tag-input',
  since: '0.3.0',
  title: 'Tag Input',
  category: 'Text Fields',
  description: 'A labels field where typing a key=value and pressing Enter or a comma makes a token, Backspace on an empty field removes the last one, and a duplicate is refused.',
  tags: ['tags', 'tokens', 'labels', 'chips', 'text field', 'key value'],
  kind: 'tui',
  size: { w: 60, h: 8 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), MID = u ? '·' : '-', X = u ? '×' : 'x';
      const st = stateAt(phase(t, LOOP)), roomy = H >= 8;
      b.text(0, 0, 'Labels', th.ink, undefined, ATTR.BOLD);
      const counter = `${st.tags.length} / ${MAX}`;
      if (W >= 44) b.text(W - stringWidth(counter), 0, counter, sub(th));
      const boxH = roomy ? 4 : 4, inner = panel(ctx, b, 0, 1, W, boxH, { color: th.accent });
      // tokens wrap like words and are never cut; the text being typed is underlined
      let x = 0, y = 0;
      const place = (w) => { if (x + w > inner.width && x > 0) { x = 0; y++; } const at = [x, y]; x += w + 1; return at; };
      for (const tag of st.tags) {
        const [tx, ty] = place(stringWidth(tag) + 4);
        if (ty >= inner.height) break;
        inner.text(tx, ty, '[', th.accent, undefined, ATTR.BOLD); inner.text(tx + 1, ty, tag, th.ink);
        inner.text(tx + 1 + stringWidth(tag) + 1, ty, X, X === 'x' ? th.ink : sub(th)); inner.text(tx + stringWidth(tag) + 3, ty, ']', th.accent, undefined, ATTR.BOLD);
      }
      const bounce = st.dup >= 0 && st.dup < 0.3 ? 1 : 0, [cx, cy] = place(stringWidth(st.cur) + 1);
      if (cy < inner.height) {
        if (st.cur) inner.text(cx + bounce, cy, st.cur, th.ink, undefined, ATTR.UNDERLINE);
        inner.text(cx + bounce + stringWidth(st.cur), cy, u ? '▌' : '_', th.ink, undefined, ATTR.BOLD);
      }
      // status, then the hint; the hint drops first, then the counter
      const sy = 1 + boxH;
      if (st.dup >= 0 && st.dup < 1.6 && sy < H) { const c = b.text(0, sy, u ? '▲' : '!', th.warn, undefined, ATTR.BOLD); b.text(c + 1, sy, 'already added', th.ink); }
      else if (st.removed >= 0 && st.removed < 0.5 && sy < H) b.text(0, sy, 'removed the last tag', sub(th));
      if (roomy) fitText(b, 0, H - 1, W, [`Enter add ${MID} , add ${MID} Backspace remove`, `Enter add ${MID} Backspace remove`], sub(th));
    };
  },
};
