// GitHub-style alerts — NOTE, TIP, IMPORTANT, WARNING, CAUTION — revealed in turn.
import { glyphs, uni, ATTR, wrapText, tint, phase, span } from './_admon.js';

const KINDS = [
  { key: 'NOTE', icon: ['ℹ', 'i'], color: 'info', body: 'The agent runs read-only diagnostics without asking. Changes always wait for a human.' },
  { key: 'TIP', icon: ['✦', '*'], color: 'pos', body: 'Pipe any page of the terminal site through `less -R` to scroll it with color.' },
  { key: 'IMPORTANT', icon: ['◆', '*'], color: 'crit', body: 'Facets must be deterministic: derive everything from t, ctx.rng and ctx.noise.' },
  { key: 'WARNING', icon: ['▲', '!'], color: 'warn', body: 'tmux without Tc quantizes truecolor to 256 colors. Test both.' },
  { key: 'CAUTION', icon: ['✖', 'x'], color: 'neg', body: 'Rolling back the schema migration drops the orders.v2 column and its data.' },
];

export default {
  id: 'callouts-admonitions',
  title: 'Admonitions',
  category: 'Admonitions',
  description: 'NOTE, TIP, IMPORTANT, WARNING and CAUTION blocks in the GitHub alert style — colored gutter bar, icon, title and wrapped body.',
  tags: ['admonition', 'alert', 'note', 'warning', 'callout', 'github'],
  kind: 'widget',
  size: { w: 72, h: 22 },
  minSize: { w: 34, h: 6 },
  loop: 10,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    // 16 colors / mono: inline code keeps the default background (a 14% wash would be a solid black block on Night)
    const low = ctx.caps.depth === '16' || ctx.caps.depth === 'mono';
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height;
      const u = uni(ctx);
      const p = phase(t, 10);
      // Lay out as many blocks as fit; at small sizes, cycle one at a time.
      const blocks = KINDS.map((k) => ({ ...k, lines: wrapText(k.body, Math.max(10, W - 4)) }));
      const need = blocks.reduce((n, k) => n + k.lines.length + 2, 0);
      const list = need <= H ? blocks : [blocks[Math.floor(p / 2) % blocks.length]];
      let y = 0;
      list.forEach((k, i) => {
        const c = th[k.color];
        const shown = list.length === 1 ? 1 : span(p, i * 0.45, i * 0.45 + 0.5);
        if (shown <= 0 || y >= H) return;
        const h = k.lines.length + 1;
        for (let r = 0; r < h && y + r < H; r++) b.set(0, y + r, u ? '▌' : '|', c);
        const reveal = Math.ceil(shown * (W - 2));
        b.text(2, y, `${k.icon[u ? 0 : 1]} ${k.key[0]}${k.key.slice(1).toLowerCase()}`.slice(0, reveal), c, undefined, ATTR.BOLD);
        k.lines.forEach((line, j) => {
          if (y + 1 + j >= H) return;
          // Inline `code` spans: drop the backticks, tint the span.
          let x = 2, inCode = false, n = 0;
          for (const ch of line) {
            if (ch === '`') { inCode = !inCode; continue; }
            if (n++ >= reveal) break;
            x = b.text(x, y + 1 + j, ch, inCode ? th.accent : th.ink, inCode && !low ? tint(ctx, th.accent, 0.14) : undefined);
          }
        });
        if (list.length === 1) b.fill(1, y, W - 1, h, undefined, undefined, tint(ctx, c, 0.08));
        y += h + 1;
      });
    };
  },
};
