// A four-pane layout where focus moves like Tab in a real TUI: the focused
// pane gets a heavy accent border, the rest recede.
import { panel, glyphs, ATTR, fit, phase, uni } from './_kit.js';

const LOGS = ['GET /cart 200 41ms', 'POST /checkout 201 212ms', 'GET /search?q=tent 200 22ms', 'healthcheck ok', 'GET /account 200 34ms', 'POST /login 200 88ms'];

export default {
  id: 'callouts-focus-panels',
  title: 'Focus Ring Layout',
  category: 'Panels & Borders',
  description: 'A four-pane dashboard where keyboard focus cycles with Tab — heavy accent border on the active pane, dimmed borders on the rest.',
  tags: ['focus', 'layout', 'panes', 'tab', 'dashboard'],
  kind: 'tui',
  size: { w: 76, h: 20 },
  minSize: { w: 40, h: 10 },
  loop: 8,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const focus = Math.floor(phase(t, 8) / 2) % 4;
      const lw = Math.floor(W * 0.42), rw = W - lw - 1;
      const PH = H - 1; // last row is the key hint
      const th1 = Math.floor((PH - 1) / 2), th2 = PH - 1 - th1 - 1;
      const panes = [
        { x: 0, y: 0, w: lw, h: th1, title: 'Services' },
        { x: lw + 1, y: 0, w: rw, h: th1, title: 'Logs' },
        { x: 0, y: th1 + 1, w: lw, h: th2 + 1, title: 'Alerts' },
        { x: lw + 1, y: th1 + 1, w: rw, h: th2 + 1, title: 'Metrics' },
      ];
      panes.forEach((p, i) => {
        const on = i === focus;
        const inner = panel(ctx, b, p.x, p.y, p.w, p.h, { style: on ? 'heavy' : 'round', title: on ? `${g.tri} ${p.title}` : p.title, titleColor: on ? th.accent : th.muted, color: on ? th.accent : th.line });
        const ink = on ? th.ink : th.muted;
        for (let r = 0; r < inner.height; r++) {
          if (i === 0) {
            const svc = ['edge-lb', 'api-gateway', 'checkout', 'payments', 'catalog', 'search'][r];
            if (!svc) break;
            const bad = svc === 'payments' && Math.sin(t * 0.8) > 0.2;
            inner.text(1, r, g.dot, bad ? th.warn : th.pos);
            inner.text(3, r, fit(svc, Math.max(0, inner.width - 12), undefined, ctx), ink);
            inner.text(inner.width - 8, r, bad ? 'degraded' : 'running', bad ? th.warn : th.dim);
          } else if (i === 1) {
            const k = (Math.floor(t * 1.5) + r) % LOGS.length;
            inner.text(1, r, fit(LOGS[k], inner.width - 2, undefined, ctx), r === inner.height - 1 ? th.ink : ink);
          } else if (i === 2) {
            const al = [['warn', 'payments p95 above SLO for 3m'], ['info', 'deploy search v2.3.1 finished'], ['ok', 'cert renewed for edge-lb']][r];
            if (!al) break;
            const c = al[0] === 'warn' ? th.warn : al[0] === 'ok' ? th.pos : th.info;
            inner.text(1, r, al[0].toUpperCase().padEnd(5), c, undefined, ATTR.BOLD);
            inner.text(7, r, fit(al[1], Math.max(0, inner.width - 8), undefined, ctx), ink);
          } else {
            const bars = ['cpu', 'mem', 'disk', 'net'][r];
            if (!bars) break;
            const v = 0.3 + 0.25 * Math.sin(t * (0.6 + r * 0.3) + r) + r * 0.08;
            inner.text(1, r, bars.padEnd(5), th.muted);
            const bw = Math.max(1, inner.width - 13);
            for (let k = 0; k < bw; k++) inner.set(7 + k, r, k < v * bw ? (uni(ctx) ? '▮' : '#') : (uni(ctx) ? '▯' : '.'), k < v * bw ? (on ? th.info : th.dim) : th.line);
            inner.text(8 + bw, r, `${Math.round(v * 100)}%`.padStart(4), ink);
          }
        }
      });
      const hint = `Tab next pane ${g.mid} Shift-Tab previous`;
      b.text(Math.max(0, W - hint.length - 1), H - 1, hint, th.dim);
    };
  },
};
