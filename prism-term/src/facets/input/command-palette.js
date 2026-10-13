// A ctrl+shift+p style command palette over the app: the query filters
// commands live, the cursor moves, Enter runs one and a status line reports it.
import { ATTR, glyphs, uni, phase, typed, blink, tint, mix, fit, spin, stringWidth, backdrop, panel, fuzzyMatch } from './_input.js';

const COMMANDS = [
  ['Service', 'Restart checkout-api', 'ctrl+r'],
  ['Logs', 'Tail logs: checkout-api', 'ctrl+l'],
  ['Service', 'Restart payments-worker', ''],
  ['Deploy', 'Rollback checkout-api to v2.14.0', ''],
  ['Incident', 'Open runbook: DB pool exhaustion', ''],
  ['Deploy', 'Promote canary to 100%', ''],
  ['Service', 'Scale search-api', ''],
  ['View', 'Toggle compact log view', 'ctrl+k c'],
  ['Incident', 'Page on-call (sev2)', ''],
  ['Traces', 'Search traces by request id', 'ctrl+t'],
  ['Settings', 'Change theme', 'ctrl+k t'],
  ['Service', 'Restart search-api', ''],
];
const QUERY = 'restart';
// Pointer moves [seconds into the loop, rows] once the query has filtered the list.
const MOVES = [[2.3, 1], [2.8, 1], [3.3, -1]];
const ENTER = 3.9, CLOSE = 4.6, DONE = 5.6;

export default {
  id: 'input-command-palette',
  title: 'Command Palette',
  category: 'Command Palettes',
  description: 'A ctrl+shift+p palette over a dimmed app: the query fuzzy-filters commands with highlighted matches and key hints, Enter runs one and the status line confirms.',
  tags: ['command palette', 'fuzzy', 'launcher', 'overlay', 'keyboard'],
  kind: 'tui',
  size: { w: 66, h: 16 },
  minSize: { w: 40, h: 10 },
  loop: 8,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      backdrop(ctx, b, t);
      // Status line along the bottom of the "app".
      b.fill(0, H - 1, W, 1, ' ', undefined, th.panel2);
      if (p >= ENTER && p < DONE) {
        b.text(1, H - 1, fit(`${spin(ctx, t)} Restarting checkout-api ${g.mid} ${Math.min(2, Math.floor((p - ENTER) / 0.5))}/3 pods ready`, W - 2, undefined, ctx), th.warn, th.panel2);
      } else if (p >= DONE) {
        b.text(1, H - 1, fit(`${g.check} Restarted checkout-api ${g.mid} 3/3 pods ready in 9.4s`, W - 2, undefined, ctx), th.pos, th.panel2, ATTR.BOLD);
      } else b.text(1, H - 1, fit(`ctrl+shift+p commands ${g.mid} prod-us-east-2`, W - 2, undefined, ctx), th.muted, th.panel2);
      if (p >= CLOSE) return;

      const query = typed(QUERY, p, 0.7, 9);
      const hits = COMMANDS.map((c, i) => ({ c, i, m: fuzzyMatch(query, c[1]) }))
        .filter((h) => h.m)
        .sort((a, z) => (query ? z.m.score - a.m.score : 0) || a.i - z.i);
      let cur = 0;
      for (const [at, d] of MOVES) if (p >= at) cur = Math.max(0, Math.min(hits.length - 1, cur + d));

      const pw = Math.min(W - 4, 58), px = Math.floor((W - pw) / 2);
      // The palette shrinks to its results, like the real thing.
      const ph = Math.min(H - 2, 4 + Math.max(1, Math.min(hits.length, 9)));
      const inner = panel(ctx, b, px, 0, pw, ph, { color: th.accent, bg: th.panel });
      const iw = inner.width, ih = inner.height;
      // Query row.
      let x = inner.text(1, 0, '>', th.accent, th.panel, ATTR.BOLD) + 1;
      if (!query) inner.text(x + 1, 0, fit('Type a command', iw - x - 2, undefined, ctx), mix(th.panel, th.muted, 0.7), th.panel, ATTR.ITALIC);
      x = inner.text(x, 0, query, th.ink, th.panel, ATTR.BOLD);
      if (blink(t, 0.8)) inner.set(x, 0, u ? '▏' : '_', th.ink, th.panel);
      const count = `${hits.length} of ${COMMANDS.length}`;
      if (iw > 24) inner.text(iw - count.length - 1, 0, count, th.dim, th.panel);
      inner.fill(0, 1, iw, 1, u ? '─' : '-', th.line, th.panel);

      const rows = Math.min(hits.length, ih - 2);
      const first = Math.max(0, Math.min(hits.length - rows, cur - rows + 1));
      for (let r = 0; r < rows; r++) {
        const { c: [cat, label, key], m } = hits[first + r];
        const y = 2 + r, on = first + r === cur;
        const pressed = on && p >= ENTER;
        const bg = on ? (pressed ? th.accent : tint(ctx, th.accent, 0.22)) : th.panel;
        inner.fill(0, y, iw, 1, ' ', undefined, bg);
        if (on) inner.set(0, y, u ? '▌' : '>', pressed ? th.bg : th.accent, bg, ATTR.BOLD);
        let cx = inner.text(2, y, `${cat}: `, pressed ? th.bg : th.dim, bg);
        const keyW = key && iw > 34 ? stringWidth(key) + 2 : 0;
        const shown = fit(label, Math.max(0, iw - cx - keyW - 1), undefined, ctx).trimEnd();
        [...shown].forEach((ch, i) => {
          const hit = m.idx.includes(i);
          inner.text(cx + i, y, ch, pressed ? th.bg : hit ? th.accent : on ? th.ink : th.muted, bg, hit || on ? ATTR.BOLD : 0);
        });
        if (keyW) inner.text(iw - keyW, y, ` ${key} `, pressed ? th.bg : th.muted, pressed ? th.accent : th.panel2);
      }
      if (!hits.length) inner.text(2, 2, 'No matching commands', th.dim, th.panel, ATTR.ITALIC);
    };
  },
};
