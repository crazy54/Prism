// A multi-step wizard: a stepper header fills in as the user moves through
// Source → Target → Schedule → Review, content sliding in on each step.
import { ATTR, glyphs, uni, phase, typed, blink, ease, tint, mix, fit, button, panel, spin } from './_input.js';

const STEPS = ['Source', 'Target', 'Schedule', 'Review'];
const STARTS = [0, 2.2, 4.4, 6.4];
const SNAPS = [['snap-0413-0000', 'today 00:00', '48 GB'], ['snap-0413-0600', 'today 06:00', '48 GB'], ['snap-0412-1800', 'yesterday 18:00', '47 GB']];
const T = { snapDown: 1.0, next1: 1.8, type: 2.6, next2: 4.0, winDown: 5.2, next3: 6.0, restore: 8.2 };

export default {
  id: 'input-wizard',
  title: 'Setup Wizard',
  category: 'Dialogs & Prompts',
  description: 'A four-step restore wizard: the stepper header fills as the user picks a snapshot, names the target, schedules it and reviews before pressing Restore.',
  tags: ['wizard', 'stepper', 'multi-step', 'form', 'onboarding'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 44, h: 11 },
  loop: 10,
  color: '256',
  order: 50,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      let step = 0;
      STARTS.forEach((s, i) => { if (p >= s) step = i; });
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'Restore database', color: th.line });
      const iw = inner.width, ih = inner.height;

      // Stepper: nodes joined by a track that fills as steps complete.
      const seg = Math.floor((iw - 8) / (STEPS.length - 1));
      const nx = (i) => 4 + i * seg;
      for (let i = 0; i < STEPS.length - 1; i++) {
        const fill = ease(p, STARTS[i + 1] - 0.3, STARTS[i + 1]);
        for (let x = nx(i) + 1; x < nx(i + 1); x++) {
          const on = (x - nx(i)) / seg <= fill;
          inner.set(x, 0, u ? (on ? '━' : '─') : (on ? '=' : '-'), on ? th.pos : th.line);
        }
      }
      STEPS.forEach((name, i) => {
        const done = i < step, cur = i === step;
        const mark = done ? g.check : cur ? (u ? '●' : '@') : g.ring;
        inner.set(nx(i), 0, mark, done ? th.pos : cur ? th.accent : th.dim, undefined, ATTR.BOLD);
        const lx = Math.max(0, Math.min(iw - name.length, nx(i) - Math.floor(name.length / 2)));
        inner.text(lx, 1, name, done ? th.pos : cur ? th.ink : th.dim, undefined, cur ? ATTR.BOLD : 0);
      });

      // Step content slides in from the right.
      const slide = Math.round((1 - ease(p, STARTS[step], STARTS[step] + 0.3)) * 6);
      const cx = 2 + slide, cy = 3;
      const body = inner.view(0, cy, iw, Math.max(0, ih - cy - 2));
      const bh = body.height;
      const row = (r, ...segs) => { if (r >= bh) return; let x = cx; for (const [s, c, a, bg] of segs) x = body.text(x, r, s, c, bg, a); };
      if (step === 0) {
        row(0, ['Which snapshot?', th.ink, ATTR.BOLD]);
        const sel = p >= T.snapDown ? 1 : 0;
        SNAPS.forEach(([id, when, size], i) => {
          if (1 + i >= bh) return;
          const on = i === sel;
          if (on) body.fill(cx - 1, 1 + i, Math.max(0, iw - cx), 1, ' ', undefined, tint(ctx, th.accent, 0.12));
          row(1 + i, [on ? g.radioOn : g.radioOff, on ? th.accent : th.dim, ATTR.BOLD], [` ${id}`, on ? th.ink : th.muted, on ? ATTR.BOLD : 0], iw > 52 ? [`  ${when.padEnd(16)}${size}`, th.dim] : [`  ${size}`, th.dim]);
        });
      } else if (step === 1) {
        row(0, ['Restore into a new instance named', th.ink, ATTR.BOLD]);
        const v = typed('checkout-db-restore', p, T.type, 14);
        const fw = Math.min(iw - cx - 2, 32), fbg = mix(th.bg, th.panel2, 0.8);
        body.fill(cx, 1, fw, 1, ' ', undefined, fbg);
        const end = body.text(cx + 1, 1, v, th.ink, fbg);
        if (blink(t, 0.9) && p < T.next2) body.set(end, 1, undefined, undefined, undefined, ATTR.INVERSE);
        if (bh > 2) row(2, [v.length >= 19 ? `${g.check} name is available` : 'lowercase, digits and hyphens', v.length >= 19 ? th.pos : th.dim]);
      } else if (step === 2) {
        row(0, ['When should it run?', th.ink, ATTR.BOLD]);
        const win = p >= T.winDown;
        row(1, [win ? g.radioOff : g.radioOn, win ? th.dim : th.accent, ATTR.BOLD], [' Now', win ? th.muted : th.ink]);
        row(2, [win ? g.radioOn : g.radioOff, win ? th.accent : th.dim, ATTR.BOLD], [' Next maintenance window', win ? th.ink : th.muted, win ? ATTR.BOLD : 0]);
        if (bh > 3) row(3, [`   Sat 17 Oct 02:00${iw > 52 ? ' (in 3 days)' : ''}`, th.dim]);
      } else {
        const kv = [['Snapshot', 'snap-0413-0600'], ['Target', 'checkout-db-restore'], ['When', 'Sat 17 Oct 02:00'], ['Est. time', '~18 min']];
        kv.forEach(([k, v], i) => row(i, [g.check, th.pos], [` ${k.padEnd(10)}`, th.muted], [v, th.ink, ATTR.BOLD]));
      }

      // Footer buttons.
      const by = ih - 1;
      const last = step === STEPS.length - 1;
      if (p >= T.restore + 0.2) {
        inner.text(2, by, fit(`${p < T.restore + 1.2 ? spin(ctx, t) : g.check} Restore queued ${g.mid} job #5521`, iw - 4, undefined, ctx), p < T.restore + 1.2 ? th.warn : th.pos, undefined, ATTR.BOLD);
        return;
      }
      inner.text(2, by, `Step ${step + 1} of ${STEPS.length}`, th.dim);
      const nextLabel = last ? 'Restore' : 'Next';
      const nw = u ? nextLabel.length + 2 : nextLabel.length + 4;
      const bw = u ? 6 : 8;
      const nextX = iw - nw - 1;
      const pressAt = [T.next1, T.next2, T.next3, T.restore][step];
      button(ctx, inner, nextX - bw - 2, by, 'Back', { focused: false });
      button(ctx, inner, nextX, by, nextLabel, { focused: true, color: last ? th.pos : th.accent, pressed: p > pressAt - 0.18 && p < pressAt + 0.2 });
    };
  },
};
