// A tab strip whose underline glides between tabs as the user switches,
// each tab showing its own content.
import { ATTR, glyphs, uni, phase, ease, mix, fit, hbar } from './_input.js';

const TABS = [['Overview', ''], ['Logs', '12'], ['Traces', ''], ['Metrics', ''], ['Config', '']];
// [time, tab] switches within the loop.
const SWITCHES = [[0, 0], [1.3, 1], [2.7, 2], [4.1, 3], [5.5, 0]];
const LOGS = [
  ['WARN', 'db pool wait 840ms (20/20 in use)'],
  ['ERROR', 'timeout acquiring connection after 5000ms'],
  ['INFO', 'GET /cart 200 41ms'],
  ['WARN', 'db pool wait 1210ms (20/20 in use)'],
  ['INFO', 'POST /checkout 201 212ms'],
];
const SPANS = [['GET /checkout', 0, 1], ['auth.verify', 0.02, 0.06], ['db.acquire', 0.08, 0.78], ['db.query', 0.8, 0.9], ['render', 0.92, 0.99]];
const SPARK = [3, 3, 4, 3, 4, 5, 4, 6, 7, 9, 12, 15, 18, 22, 24, 23, 24, 22, 23, 24];

export default {
  id: 'input-tabs',
  title: 'Tabs',
  category: 'Tabs & Bars',
  description: 'A tab strip with a count badge whose underline glides between tabs as the user switches; each tab swaps in its own overview, logs, trace or metrics view.',
  tags: ['tabs', 'tab bar', 'navigation', 'switcher', 'underline'],
  kind: 'tui',
  size: { w: 60, h: 10 },
  minSize: { w: 40, h: 7 },
  loop: 7,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      let k = 0, prev = 0, at = 0;
      SWITCHES.forEach(([s, i]) => { if (p >= s) { prev = k; k = i; at = s; } });
      // Tab geometry.
      const pos = [];
      let x = 1;
      TABS.forEach(([name, badge]) => {
        const w = name.length + 2 + (badge ? badge.length + 1 : 0);
        pos.push([x, w]);
        x += w + 1;
      });
      TABS.forEach(([name, badge], i) => {
        const [tx] = pos[i];
        const on = i === k;
        if (tx + name.length + 2 > W) return;
        const nx = b.text(tx + 1, 0, name, on ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0);
        if (badge && nx + badge.length <= W) b.text(nx + 1, 0, badge, on ? th.bg : th.warn, on ? th.warn : mix(th.bg, th.warn, 0.25), ATTR.BOLD);
      });
      // Underline glides from the previous tab to the current one.
      const e = ease(p, at, at + 0.3);
      const [ax, aw] = pos[prev], [bx, bw] = pos[k];
      const lx = Math.round(ax + (bx - ax) * e), lw = Math.round(aw + (bw - aw) * e);
      b.fill(0, 1, W, 1, u ? '─' : '-', th.line);
      b.fill(lx, 1, Math.min(lw, W - lx), 1, u ? '━' : '=', th.accent, undefined, ATTR.BOLD);
      const ch = H - 2;
      const name = TABS[k][0];
      if (name === 'Overview') {
        const rows = [['p99 latency', '2.4s', th.neg, 0.92], ['error rate', '3.1%', th.warn, 0.31], ['pods ready', '2/3', th.warn, 0.66], ['cpu', '41%', th.pos, 0.41]];
        rows.slice(0, ch).forEach(([label, v, c, f], r) => {
          b.text(1, 2 + r, label.padEnd(13), th.muted);
          b.text(14, 2 + r, v.padStart(5), c, undefined, ATTR.BOLD);
          hbar(ctx, b, 21, 2 + r, Math.max(4, W - 23), f, c);
        });
      } else if (name === 'Logs') {
        LOGS.slice(0, ch).forEach(([lvl, msg], r) => {
          const c = lvl === 'ERROR' ? th.neg : lvl === 'WARN' ? th.warn : th.info;
          b.text(1, 2 + r, lvl.padEnd(6), c, undefined, ATTR.BOLD);
          b.text(7, 2 + r, fit(msg, W - 8, undefined, ctx), th.ink);
        });
      } else if (name === 'Traces') {
        const lw2 = 14, tw = Math.max(6, W - lw2 - 9);
        SPANS.slice(0, ch).forEach(([n, a, z], r) => {
          b.text(1 + (r ? 1 : 0), 2 + r, fit(n, lw2 - 1, undefined, ctx), r ? th.muted : th.ink);
          const x0 = lw2 + 1 + Math.round(a * tw), x1 = lw2 + 1 + Math.max(Math.round(a * tw) + 1, Math.round(z * tw));
          b.fill(x0, 2 + r, x1 - x0, 1, u ? '█' : '#', n === 'db.acquire' ? th.neg : r ? th.info : th.accent);
          b.text(W - 6, 2 + r, `${((z - a) * 2.4).toFixed(2)}s`.padStart(5), th.dim);
        });
      } else if (name === 'Metrics') {
        const LV = u ? ' ▁▂▃▄▅▆▇█' : ' .:-=+*#%';
        const top = 3, bottom = H >= 9 ? H - 2 : H - 1, rows = Math.max(1, bottom - top + 1);
        const sw = Math.max(4, W - 12);
        b.text(1, 2, 'p99 ms, last 20 min', th.muted);
        for (let i = 0; i < sw; i++) {
          // Resample the series across the available width.
          const f = (i / (sw - 1)) * (SPARK.length - 1), j = Math.floor(f), fr = f - j;
          const raw = SPARK[j] + ((SPARK[Math.min(SPARK.length - 1, j + 1)] - SPARK[j]) * fr);
          const v = (raw / 24) * rows;
          for (let r = 0; r < rows; r++) {
            const cell = Math.max(0, Math.min(8, Math.round((v - r) * 8)));
            if (cell) b.set(2 + i, bottom - r, LV[cell], raw > 14 ? th.neg : th.accent);
          }
        }
        b.text(W - 9, top, '2400ms', th.neg, undefined, ATTR.BOLD);
        b.text(W - 9, bottom, ' 120ms', th.dim);
      }
      // Hint, bottom right.
      const hint = `${g.left}/${g.right} or 1-5`;
      if (H >= 9) b.text(W - hint.length - 1, H - 1, hint, th.dim);
    };
  },
};
