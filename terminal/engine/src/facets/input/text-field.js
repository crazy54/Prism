// A labeled text field: placeholder, typing, a validation error, the fix, ✔.
import { ATTR, glyphs, uni, phase, typed, blink, tint, mix, fit } from './_input.js';

export default {
  id: 'input-text-field',
  title: 'Text Field with Validation',
  category: 'Text Fields',
  description: 'A labeled input with placeholder, blinking caret and inline validation: the user types an invalid hostname, sees the error, fixes it and gets a ✔.',
  tags: ['input', 'text field', 'validation', 'form', 'caret'],
  kind: 'tui',
  size: { w: 56, h: 8 },
  minSize: { w: 34, h: 5 },
  loop: 9,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const bad = 'payments_01.internal';
      const good = 'payments-01.prod.example';
      // Script: type a hostname with an underscore (live validation flags it),
      // backspace to 'payments', retype it properly, get the green check.
      let value;
      if (p < 3.8) value = typed(bad, p, 0.6, 12);
      else if (p < 4.3) value = bad.slice(0, Math.max(8, bad.length - Math.floor((p - 3.8) * 24)));
      else value = 'payments' + typed(good.slice(8), p, 4.3, 12);
      const state = value.includes('_') ? 'error' : value === good ? 'valid' : value ? 'typing' : 'empty';
      const fw = Math.min(W - 2, 44);
      b.text(0, 0, 'Hostname', th.ink, undefined, ATTR.BOLD);
      b.text(9, 0, '*', th.neg);
      const border = state === 'error' ? th.neg : state === 'valid' ? th.pos : th.accent;
      const bg = tint(ctx, border, 0.08);
      // Field: a tinted well underlined in the state color.
      b.fill(0, 1, fw, 1, ' ', undefined, bg);
      if (!value) b.text(2, 1, 'e.g. api-01.prod.example', mix(th.bg, th.muted, 0.6), bg, ATTR.ITALIC);
      else b.text(1, 1, value.slice(-(fw - 3)), th.ink, bg);
      const cx = 1 + Math.min(value.length, fw - 3);
      if (state !== 'valid' && blink(t, 0.9)) b.set(cx, 1, u ? '▏' : '_', th.ink, bg);
      if (state === 'valid') b.text(fw - 2, 1, g.check, th.pos, bg, ATTR.BOLD);
      if (state === 'error') b.text(fw - 2, 1, g.cross, th.neg, bg, ATTR.BOLD);
      b.fill(0, 2, fw, 1, u ? '▔' : '-', border);
      if (H > 3) {
        const msg = state === 'error' ? `${g.cross} Underscores aren't allowed in hostnames (RFC 1123)`
          : state === 'valid' ? `${g.check} Resolves to 10.20.2.41`
            : 'Lowercase letters, digits, dots and hyphens';
        b.text(0, 3, fit(msg, W, undefined, ctx), state === 'error' ? th.neg : state === 'valid' ? th.pos : th.dim);
      }
      if (H > 5) b.text(0, H - 1, `enter submit ${g.mid} esc cancel ${g.mid} ctrl-u clear`, th.dim);
    };
  },
};
