// A modal progress dialog for an approved fix: steps tick off, a bar and ETA
// advance, Cancel becomes Close, and the result is verified before it closes.
import { ATTR, glyphs, uni, phase, span, ease, fit, spin, hbar, button, backdrop, modal } from './_input.js';

// [label, start, end] in seconds into the loop.
const STEPS = [
  ['Snapshot current config', 0.3, 1.0],
  ['Write config (pool=40)', 1.0, 1.7],
  ['Rolling restart', 1.7, 4.5],
  ['Verify p99 < 500ms', 4.5, 5.7],
];
const CLOSE = 8.2;

export default {
  id: 'input-progress-dialog',
  title: 'Progress Dialog',
  category: 'Dialogs & Prompts',
  description: 'A modal that applies a human-approved fix: steps tick off with timings, the bar and ETA advance, Cancel turns into Close, and the result is verified.',
  tags: ['progress', 'dialog', 'modal', 'steps', 'remediation'],
  kind: 'tui',
  size: { w: 60, h: 15 },
  minSize: { w: 42, h: 11 },
  loop: 9,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      backdrop(ctx, b, t);
      b.fill(0, H - 1, W, 1, ' ', undefined, th.panel2);
      if (p >= CLOSE) {
        b.text(1, H - 1, fit(`${g.check} Fix #142 applied ${g.mid} checkout-api p99 180ms`, W - 2, undefined, ctx), th.pos, th.panel2, ATTR.BOLD);
        return;
      }
      const end = STEPS[STEPS.length - 1][2];
      const finished = p >= end;
      b.text(1, H - 1, fit(`PROTEUS ${g.mid} fixes ${g.mid} ${finished ? 'verifying' : '1 running'}`, W - 2, undefined, ctx), th.muted, th.panel2);
      const mw = Math.min(W - 4, 52), mh = Math.min(H - 2, 12);
      const mx = Math.floor((W - mw) / 2), my = Math.max(0, Math.floor((H - 1 - mh) / 2));
      const inner = modal(ctx, b, mx, my, mw, mh, {
        enter: ease(p, 0, 0.3), color: finished ? th.pos : th.accent,
        title: finished ? `${g.check} Fix #142 applied` : 'Applying fix #142', titleColor: finished ? th.pos : th.ink,
      });
      const iw = inner.width, ih = inner.height, bg = th.panel;
      // Compact layouts drop the spacer rows.
      const by = ih >= 10 ? ih - 3 : ih - 2;
      let y = 0;
      inner.text(1, y++, fit(`Raise checkout DB pool 20 ${g.right} 40`, iw - 2, undefined, ctx), th.ink, bg, ATTR.BOLD);
      if (ih >= 10) inner.text(1, y++, fit(`Approved by you ${g.mid} 12:05 ${g.mid} rollback ready`, iw - 2, undefined, ctx), th.dim, bg);
      if (ih >= 10) y++;
      for (const [label, a, z] of STEPS) {
        if (y >= by) break;
        const state = p >= z ? 'done' : p >= a ? 'run' : 'todo';
        const mark = state === 'done' ? g.check : state === 'run' ? spin(ctx, t) : g.ring;
        inner.text(1, y, mark, state === 'done' ? th.pos : state === 'run' ? th.warn : th.dim, bg, ATTR.BOLD);
        let text = label;
        if (label === 'Rolling restart' && state !== 'todo') text += ` ${Math.min(3, Math.floor(span(p, a, z) * 3 + (state === 'done' ? 0 : 1)))}/3 pods`;
        const secs = state === 'done' ? `${(z - a).toFixed(1)}s` : state === 'run' ? `${(p - a).toFixed(1)}s` : '';
        inner.text(3, y, fit(text, iw - 11, undefined, ctx), state === 'todo' ? th.muted : th.ink, bg);
        if (secs) inner.text(iw - 1 - secs.length, y, secs, th.dim, bg);
        y++;
      }
      // Overall bar + ETA.
      const frac = span(p, STEPS[0][1], end);
      const pct = `${Math.round(frac * 100)}%`.padStart(4);
      const eta = finished ? 'done' : `ETA 0:${String(Math.ceil((end - p) * 3)).padStart(2, '0')}`;
      const bw = Math.max(4, iw - 2 - pct.length - eta.length - 2);
      hbar(ctx, inner, 1, by, bw, frac, finished ? th.pos : th.accent);
      inner.text(2 + bw, by, pct, th.ink, bg, ATTR.BOLD);
      inner.text(iw - 1 - eta.length, by, eta, th.dim, bg);
      // Buttons.
      const label = finished ? 'Close' : 'Cancel';
      const bwid = u ? label.length + 2 : label.length + 4;
      button(ctx, inner, iw - bwid - 1, ih - 1, label, { focused: true, color: finished ? th.pos : th.muted, pressed: p > CLOSE - 0.2 });
      if (finished && iw > 30) inner.text(1, ih - 1, fit(`${g.check} p99 2.4s ${g.right} 180ms`, iw - bwid - 4, undefined, ctx), th.pos, bg);
    };
  },
};
