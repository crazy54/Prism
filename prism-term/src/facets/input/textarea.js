// A multi-line editor: a commit message gets typed with soft line numbers,
// a 50/72 ruler and a character count.
import { ATTR, uni, phase, typed, blink, panel, mix } from './_input.js';

const MSG = 'Raise checkout DB pool to 40\n\nv2.14.1 raised worker concurrency to 32 but left\nthe pool at 20, so requests queued for a connection.\nSize the pool to the workers and alert on pool\nwait time.';

export default {
  id: 'input-textarea',
  title: 'Commit Message Editor',
  category: 'Text Fields',
  description: 'A multi-line textarea where a commit message is typed: line numbers, a 50/72 column guide, subject-length warning and a live character count.',
  tags: ['textarea', 'editor', 'multiline', 'commit', 'git'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 40, h: 7 },
  loop: 12,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 12);
      const text = typed(MSG, p, 0.2, 26);
      const lines = text.split('\n');
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'COMMIT_EDITMSG', footer: `${text.replace(/\n/g, '').length} chars`, color: th.line });
      const iw = inner.width, ih = inner.height;
      const guide = (col, c) => { if (5 + col < iw) for (let y = 0; y < ih; y++) inner.set(5 + col, y, u ? '┊' : ':', c); };
      guide(50, mix(th.bg, th.warn, 0.35));
      guide(72, mix(th.bg, th.neg, 0.35));
      const first = Math.max(0, lines.length - ih);
      for (let r = 0; r < ih; r++) {
        const i = first + r;
        inner.text(0, r, String(i + 1).padStart(3), i < lines.length ? th.dim : mix(th.bg, th.dim, 0.4));
        if (i >= lines.length) { inner.text(4, r, '~', mix(th.bg, th.accent, 0.5)); continue; }
        const line = lines[i];
        [...line].forEach((ch, x) => { if (5 + x < iw) inner.text(5 + x, r, ch, i === 0 && x >= 50 ? th.warn : i === 0 ? th.ink : th.muted, undefined, i === 0 ? ATTR.BOLD : 0); });
        if (i === lines.length - 1 && blink(t, 0.8)) inner.set(5 + Math.min(line.length, iw - 6), r, u ? '▏' : '_', th.accent);
      }
    };
  },
};
