// Filter chips over a log search: each chip toggles a facet, and every count is faceted on the others.
import { ATTR, uni, glyphs, phase, stepAt, stringWidth } from './_input.js';

const DIMS = [
  ['us-east', 'eu-west', 'ap-south'],
  ['ERROR', 'WARN', 'INFO'],
  ['checkout', 'search', 'auth'],
];
const WEIGHT = [[1, 0.3, 0.08], [0.0021, 0.026, 0.97], [0.5, 0.35, 0.15]], TOTAL = 43112;
const CHIPS = DIMS.flatMap((vals, d) => vals.map((v, i) => [d, i, v]));
// a fixed table of event counts per (region, level, service)
const COUNT = (r, l, s) => Math.max(1, Math.round(TOTAL * WEIGHT[0][r] / 1.38 * WEIGHT[1][l] * WEIGHT[2][s] * (0.9 + 0.2 * (((r * 7 + l * 3 + s * 5) % 5) / 4))));
const ALL = [0, 1, 2].reduce((n, r) => n + [0, 1, 2].reduce((m, l) => m + [0, 1, 2].reduce((q, s) => q + COUNT(r, l, s), 0), 0), 0);
const START = [[0, 0], [1, 0]];   // us-east and ERROR are on at the start (and again at the end)
// [time, action]: focus walks the chips, space toggles, Clear all resets, then the start filters come back.
const SCRIPT = [[1.0, 'next'], [1.6, 'toggle'], [2.3, 'next'], [2.8, 'next'], [3.3, 'next'], [3.9, 'toggle'], [4.6, 'next'], [5.1, 'next'], [5.7, 'toggle'],
  [6.4, 'next'], [6.9, 'next'], [7.4, 'next'], [8.1, 'clear'], [8.9, 'home'], [9.4, 'toggle'], [9.9, 'next'], [10.2, 'next'], [10.5, 'next'], [10.9, 'toggle'], [11.4, 'home']];
const LOOP = 12;

function stateAt(p) {
  const on = DIMS.map((v) => v.map(() => false));
  for (const [d, i] of START) on[d][i] = true;
  let focus = 0, cleared = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const a = SCRIPT[k][1];
    if (a === 'next') focus = Math.min(CHIPS.length, focus + 1);
    else if (a === 'home') focus = 0;
    else if (a === 'clear') { for (const v of on) v.fill(false); cleared = SCRIPT[k][0]; }
    else if (a === 'toggle' && focus < CHIPS.length) { const [d, i] = CHIPS[focus]; on[d][i] = !on[d][i]; }
  }
  return { on, focus, cleared: p - cleared };
}
// matches, and each chip's count given the other dimensions' filters (faceted search)
function counts(on) {
  const pick = (d, i) => !on[d].some(Boolean) || on[d][i];
  let matches = 0;
  const facet = DIMS.map((v) => v.map(() => 0));
  for (let r = 0; r < 3; r++) for (let l = 0; l < 3; l++) for (let s = 0; s < 3; s++) {
    const c = COUNT(r, l, s), ok = [pick(0, r), pick(1, l), pick(2, s)];
    if (ok[0] && ok[1] && ok[2]) matches += c;
    if (ok[1] && ok[2]) facet[0][r] += c;
    if (ok[0] && ok[2]) facet[1][l] += c;
    if (ok[0] && ok[1]) facet[2][s] += c;
  }
  return { matches, facet };
}
const k = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

export default {
  id: 'input-filter-chips',
  since: '0.3.0',
  title: 'Filter Chips',
  category: 'Toggles & Checkboxes',
  description: 'Toggleable filter chips over a log search, region, level and service, each with a faceted count, so toggling a chip updates every count and the matches.',
  tags: ['chips', 'filters', 'facets', 'search', 'logs', 'tags', 'toggle'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 40, h: 7 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), { matches, facet } = counts(st.on), MID = u ? '·' : '-', CHECK = u ? '✓' : 'x';
      const query = H >= 9, label = (d, i, withCount) => `${st.on[d][i] ? CHECK : ' '} ${DIMS[d][i]}${withCount ? ` ${k(facet[d][i])}` : ''}`;
      // chips flow like words and wrap; counts drop before any chip would be cut
      const flow = (withCount) => {
        const out = [];
        let x = 2, y = 0;
        CHIPS.forEach(([d, i], n) => {
          const w = stringWidth(label(d, i, withCount)) + 2;
          if (x + w > W && x > 2) { x = 2; y++; }
          out.push([x, y, w, d, i, n]);
          x += w + 1;
        });
        return out;
      };
      let withCount = true, chips = flow(true);
      const room = H - (query ? 2 : 0) - 2;
      if (chips[chips.length - 1][1] + 1 > room) { withCount = false; chips = flow(false); }
      const y0 = query ? 2 : 0;
      if (query) {
        let x = b.text(0, 0, g.caret, th.accent, undefined, ATTR.BOLD);
        x = b.text(x + 1, 0, 'logs', th.ink, undefined, ATTR.BOLD);
        b.text(x + 1, 0, `last 15 min ${MID} ${ALL.toLocaleString('en-US')} events`, sub);
      }
      for (const [x, y, w, d, i, n] of chips) {
        const on = st.on[d][i], foc = st.focus === n, txt = `[${label(d, i, withCount)}]`;
        if (foc) b.text(x - 1, y0 + y, g.caret, th.accent, undefined, ATTR.BOLD);
        if (on) {   // ink-inverse label; the brackets and ✓ carry the accent (the 7-bit 'x' stays ink)
          let cx = b.text(x, y0 + y, '[', th.accent, undefined, ATTR.BOLD);
          cx = b.text(cx, y0 + y, CHECK, u ? th.accent : th.ink, undefined, ATTR.BOLD);
          cx = b.text(cx, y0 + y, label(d, i, withCount).slice(1), th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
          b.text(cx, y0 + y, ']', th.accent, undefined, ATTR.BOLD);
        }
        else {
          const lab = `${st.on[d][i] ? CHECK : ' '} ${DIMS[d][i]}`;
          let cx = b.text(x, y0 + y, '[', sub);
          cx = b.text(cx, y0 + y, lab, th.ink, undefined, foc ? ATTR.BOLD : 0);
          if (withCount) cx = b.text(cx, y0 + y, ` ${k(facet[d][i])}`, sub);
          b.text(cx, y0 + y, ']', sub);
        }
      }
      const yb = y0 + chips[chips.length - 1][1] + 2 <= H - 1 ? y0 + chips[chips.length - 1][1] + 2 : H - 1;
      const mx = b.text(2, yb, `${matches.toLocaleString('en-US')} matches`, th.ink, undefined, ATTR.BOLD);
      const cl = 'Clear all', cx = Math.max(mx + 3, W - stringWidth(cl) - 4), foc = st.focus === CHIPS.length;
      if (foc) b.text(cx - 2, yb, g.caret, th.accent, undefined, ATTR.BOLD);
      b.text(cx, yb, `[ ${cl} ]`, th.ink, undefined, foc ? ATTR.INVERSE | ATTR.BOLD : 0);
      if (st.cleared < 0.8 && yb + 1 < H) b.text(2, yb + 1, 'filters cleared', sub);
      const hint = [`${u ? '←/→' : '</>'} move ${MID} space toggle ${MID} enter on Clear all`, `${u ? '←/→' : '</>'} move ${MID} space toggle`].find((h) => stringWidth(h) <= W);
      if (H >= 9 && yb + 2 < H - 1 && hint) b.text(0, H - 1, hint, sub);
    };
  },
};
