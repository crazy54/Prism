// A regex field that matches live: each key re-runs the pattern over sample log lines and shows the captures.
import { ATTR, uni, glyphs, phase, stringWidth } from './_input.js';
import { sub, fitText } from './_kit6.js';

const LOOP = 14, PATTERN = '(ERROR|WARN) .*timeout=(\\d+)ms';
const LINES = [
  '12:04:31 INFO  gateway GET /cart 200 41ms',
  '12:04:33 ERROR checkout timeout=5000ms acquiring pool',
  '12:04:34 WARN  payments retry timeout=1200ms attempt=2',
  '12:04:36 error search timeout=800ms on shard 3',
  '12:04:38 INFO  inventory reserve ok 12ms',
];
// [time, key]: the pattern typed key by key (unterminated until ")"), the i flag on and off, then cleared.
const KEYS = (() => { const out = []; let t = 0.6; for (const c of PATTERN) { out.push([t, c]); t += 0.17; } out.push([9.0, 'FLAG']); out.push([11.4, 'FLAG']); out.push([12.6, 'CLEAR']); return out; })();
const cache = new Map();
function run(pat, ci) {
  const key = `${ci}/${pat}`;
  if (cache.has(key)) return cache.get(key);
  let res;
  try { const re = new RegExp(pat, ci ? 'i' : ''); res = { ok: true, hits: pat ? LINES.map((l) => re.exec(l)) : LINES.map(() => null) }; }
  catch { res = { ok: false, why: (pat.match(/\(/g) || []).length > (pat.match(/\)/g) || []).length ? 'unterminated group' : 'invalid pattern' }; }
  cache.set(key, res);
  return res;
}

export default {
  id: 'input-regex-field',
  since: '0.3.0',
  title: 'Regex Field',
  category: 'Text Fields',
  description: 'A pattern field that matches live: each key re-runs the regex over five sample log lines, matches are underlined, captured groups are shown, and a bad pattern is flagged.',
  tags: ['regex', 'pattern', 'search', 'live match', 'text field', 'logs'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx), MID = u ? '·' : '-';
      const p = phase(t, LOOP);
      let pat = '', ci = false;
      for (const [tt, k] of KEYS) { if (tt > p) break; if (k === 'FLAG') ci = !ci; else if (k === 'CLEAR') { pat = ''; ci = false; } else pat += k; }
      const r = run(pat, ci), flags = H >= 11, nLines = H >= 11 ? 5 : 3;
      // the field, delimited like a pattern
      b.text(0, 0, '/', th.accent, undefined, ATTR.BOLD);
      const fw = Math.min(W - (flags ? 12 : 4), 44), shown = stringWidth(pat) > fw - 3 ? pat.slice(-(fw - 3)) : pat;
      let x = b.text(2, 0, shown, th.ink, undefined, ATTR.BOLD);
      if (p < 12.6) b.text(x, 0, u ? '▏' : '_', th.ink);
      b.text(fw, 0, '/', th.accent, undefined, ATTR.BOLD);
      if (flags) { let fx = fw + 2; for (const [f, on] of [['i', ci], ['g', true]]) { fx = b.text(fx, 0, '[', th.accent, undefined, ATTR.BOLD); fx = b.text(fx, 0, on ? f : ' ', th.ink, undefined, ATTR.BOLD); fx = b.text(fx, 0, ']', th.accent, undefined, ATTR.BOLD) + 1; } }
      // sample lines, matches underlined and bold
      const hits = r.ok ? r.hits : LINES.map(() => null);
      LINES.slice(0, nLines).forEach((line, i) => {
        // a long line ends at a word boundary with an ellipsis, never mid-word
        const ELL = u ? '…' : '...', cut = stringWidth(line) > W ? line.lastIndexOf(' ', W - stringWidth(ELL) - 1) : -1;
        const y = 2 + i, m = hits[i], txt = cut > 0 ? line.slice(0, cut) + ' ' + ELL : line;
        b.text(0, y, txt, th.ink);
        if (m && m[0]) {   // the visible part of the match; the ellipsis too when the match runs past the cut
          const end = m.index + m[0].length, vis = cut > 0 ? Math.min(end, cut) : end;
          if (vis > m.index) b.text(m.index, y, txt.slice(m.index, vis), th.ink, undefined, ATTR.UNDERLINE | ATTR.BOLD);
          if (cut > 0 && end > cut) b.text(cut + 1, y, ELL, th.ink, undefined, ATTR.UNDERLINE | ATTR.BOLD);
        }
      });
      // result line: matches and the second group of the first hit, or the pattern error
      const ry = 2 + nLines + 1;
      if (!r.ok) { const c = b.text(0, ry, g.cross, th.neg, undefined, ATTR.BOLD); b.text(c + 1, ry, r.why, th.ink); }
      else if (pat) {
        const n = hits.filter(Boolean).length, first = hits.find((m) => m && m[2]);
        const grp = first ? ` ${MID} group 2 = ${u ? '«' : '"'}${first[2]}${u ? '»' : '"'}` : '';
        fitText(b, 0, ry, W, [`${n} of ${LINES.length} lines${grp}`, `${n} of ${LINES.length} lines`], th.ink, undefined, ATTR.BOLD);
      }
      if (H >= 12) fitText(b, 0, H - 1, W, [`type to match ${MID} Alt-i case ${MID} Esc clear`, `Esc clear`], sub(th));
    };
  },
};
