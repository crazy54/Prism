// A block quote that types itself out, then hands over to the next.
import { uni, ATTR, phase, typed, blink, mix } from './_kit.js';
import { wrapText } from './_admon.js';

const QUOTES = [
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['Write programs that do one thing and do it well. Write programs to work together.', 'Doug McIlroy'],
  ['Premature optimization is the root of all evil.', 'Donald Knuth'],
];

export default {
  id: 'callouts-block-quote',
  title: 'Block Quote',
  category: 'Admonitions',
  description: 'A pull quote with an accent gutter that types itself out, attributes its author, then fades to the next — for READMEs and MOTDs.',
  tags: ['quote', 'blockquote', 'typewriter', 'motd', 'pull quote'],
  kind: 'text',
  size: { w: 64, h: 9 },
  minSize: { w: 30, h: 5 },
  loop: 21,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 21);
      const k = Math.floor(p / 7) % QUOTES.length, local = p - k * 7;
      const [q, who] = QUOTES[k];
      const lines = wrapText(`“${q}”`, Math.max(10, W - 6));
      const fade = local > 6.2 ? 1 - (local - 6.2) / 0.8 : 1;
      const ink = mix(th.bg, th.ink, Math.max(0, fade));
      const y0 = Math.max(0, Math.floor((H - lines.length - 2) / 2));
      for (let r = 0; r < lines.length + 2 && y0 + r < H; r++) b.set(1, y0 + r, u ? '┃' : '|', mix(th.bg, th.accent, fade));
      let budget = typed(lines.join('\n'), local, -0.15, 34);
      lines.forEach((line, r) => {
        const part = budget.slice(0, line.length);
        budget = budget.slice(line.length + 1);
        if (y0 + r < H) b.text(4, y0 + r, u ? part : part.replace(/[“”]/g, '"'), ink, undefined, ATTR.ITALIC);
        if (part.length && part.length < line.length && blink(t, 0.6)) b.set(4 + part.length, y0 + r, u ? '▌' : '_', th.accent);
      });
      const done = typed(lines.join('\n'), local, -0.15, 34).length >= lines.join('\n').length;
      if (done && y0 + lines.length + 1 < H) {
        const attr = `${u ? '—' : '--'} ${who}`;
        b.text(Math.max(4, W - attr.length - 2), y0 + lines.length + 1, attr, mix(th.bg, th.muted, fade));
      }
    };
  },
};
