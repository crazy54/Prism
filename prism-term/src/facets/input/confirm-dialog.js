// A destructive-action confirm dialog: Cancel is the default, Delete stays
// disabled until the resource name is typed, then it runs and closes.
import { ATTR, glyphs, uni, phase, typed, blink, ease, mix, fit, spin, button, backdrop, modal } from './_input.js';

const NAME = 'checkout';
const T = { open: 0.1, type: 0.9, tab: 2.6, enter: 3.2, close: 4.6 };

export default {
  id: 'input-confirm-dialog',
  title: 'Confirm Dialog',
  category: 'Dialogs & Prompts',
  description: 'A destructive-action modal with a shadow: Cancel is focused by default and Delete unlocks only after the namespace is typed, then it runs and closes.',
  tags: ['dialog', 'modal', 'confirm', 'destructive', 'buttons'],
  kind: 'tui',
  size: { w: 64, h: 15 },
  minSize: { w: 42, h: 10 },
  loop: 7,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      backdrop(ctx, b, t);
      b.fill(0, H - 1, W, 1, ' ', undefined, th.panel2);
      if (p >= T.close) {
        b.text(1, H - 1, fit(`${g.check} Deleted 3 pods in ${NAME} ${g.mid} rescheduling`, W - 2, undefined, ctx), th.pos, th.panel2, ATTR.BOLD);
        return;
      }
      b.text(1, H - 1, fit(`k9s ${g.mid} ${NAME} ${g.mid} pods`, W - 2, undefined, ctx), th.muted, th.panel2);

      const mw = Math.min(W - 4, 50), mh = Math.min(H - 2, 9);
      const mx = Math.floor((W - mw) / 2), my = Math.max(0, Math.floor((H - 1 - mh) / 2));
      const inner = modal(ctx, b, mx, my, mw, mh, {
        enter: ease(p, T.open, T.open + 0.35), color: th.neg,
        title: `${u ? '▲' : '!'} Delete pods`, titleColor: th.neg,
      });
      const iw = inner.width, ih = inner.height;
      const typedName = typed(NAME, p, T.type, 7);
      const ok = typedName === NAME;
      const running = p >= T.enter;
      let y = 0;
      inner.text(1, y++, fit('Terminate 3 pods in checkout?', iw - 2, undefined, ctx), th.ink, th.panel, ATTR.BOLD);
      if (ih >= 7) inner.text(1, y++, fit("They'll be rescheduled; local logs are lost.", iw - 2, undefined, ctx), th.muted, th.panel);
      if (ih >= 7) y++;
      const tag = `Type ${NAME} to confirm`;
      inner.text(1, y, fit(tag, iw - 2, undefined, ctx), th.muted, th.panel);
      inner.text(6, y, NAME, th.ink, th.panel, ATTR.BOLD);
      y++;
      // Confirmation field.
      const fw = Math.min(iw - 2, 30);
      const fbg = mix(th.panel, th.bg, 0.6);
      inner.fill(1, y, fw, 1, ' ', undefined, fbg);
      let fx = inner.text(2, y, typedName, ok ? th.pos : th.ink, fbg);
      if (!typedName && p > T.open + 0.3) inner.text(2, y, NAME, mix(fbg, th.muted, 0.45), fbg, ATTR.ITALIC);
      if (p < T.tab && blink(t, 0.9)) inner.set(fx, y, undefined, undefined, undefined, ATTR.INVERSE);
      if (ok) inner.text(fw - 1, y, g.check, th.pos, fbg, ATTR.BOLD);
      y += 2;

      // Buttons, right-aligned. Cancel holds focus until Tab.
      const by = Math.min(ih - 1, y);
      if (running) {
        const n = Math.min(3, 1 + Math.floor((p - T.enter) / 0.45));
        inner.text(1, by, fit(`${spin(ctx, t)} Deleting ${n}/3 ${g.ellipsis}`, iw - 2, undefined, ctx), th.warn, th.panel, ATTR.BOLD);
        return;
      }
      const focusDelete = p >= T.tab;
      const del = 'Delete 3 pods', cancel = 'Cancel';
      const dw = u ? del.length + 2 : del.length + 4, cw = u ? cancel.length + 2 : cancel.length + 4;
      const dx = iw - dw - 1, cx = dx - cw - 2;
      button(ctx, inner, cx, by, cancel, { focused: !focusDelete, color: th.muted });
      if (ok) button(ctx, inner, dx, by, del, { focused: focusDelete, color: th.neg, pressed: p > T.enter - 0.15 });
      else inner.text(dx, by, u ? ` ${del} ` : `[ ${del} ]`, mix(th.panel, th.muted, 0.5), u ? mix(th.panel, th.panel2, 0.5) : undefined, ATTR.DIM);
    };
  },
};
