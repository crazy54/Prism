// Section header styles that type themselves in: numbered, underlined, boxed,
// inverse bar and markdown-setext.
import { ATTR, uni, phase, typed, blink, mix, fit } from './_kit.js';

export default {
  id: 'callouts-section-headers',
  title: 'Section Headers',
  category: 'Dividers & Headers',
  description: 'Five header styles — numbered eyebrow, underlined, boxed, inverse bar and setext — that type in one after another, for reports and CLIs.',
  tags: ['header', 'heading', 'section', 'title', 'typography'],
  kind: 'text',
  size: { w: 60, h: 18 },
  minSize: { w: 30, h: 8 },
  loop: 9,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 9);
      const typer = (text, at) => typed(text, p, at, 28);
      const caret = (x, y, text, full) => { if (text.length < full.length && text.length && blink(t, 0.5)) b.set(x + text.length, y, u ? '▌' : '_', th.accent); };
      const blocks = [];
      // 1. Numbered eyebrow + title.
      blocks.push((y, at) => {
        const eyebrow = '01 / OVERVIEW', title = 'System health at a glance';
        const e = typer(eyebrow, at), tt = typer(title, at + 0.4);
        b.text(0, y, e, th.accent, undefined, ATTR.BOLD); caret(0, y, e, eyebrow);
        b.text(0, y + 1, tt, th.ink, undefined, ATTR.BOLD); caret(0, y + 1, tt, title);
        return 3;
      });
      // 2. Underlined.
      blocks.push((y, at) => {
        const title = 'Incidents';
        const tt = typer(title, at);
        b.text(0, y, tt, th.ink, undefined, ATTR.BOLD);
        b.fill(0, y + 1, Math.min(W, Math.round(tt.length / title.length * (W * 0.5))), 1, u ? '─' : '-', th.accent);
        return 3;
      });
      // 3. Boxed.
      blocks.push((y, at) => {
        const title = 'Deployments';
        const tt = typer(title, at);
        const w = Math.min(W, title.length + 4);
        if (tt.length) {
          b.text(0, y, (u ? '┌' : '+') + (u ? '─' : '-').repeat(w - 2) + (u ? '┐' : '+'), th.line);
          b.text(0, y + 1, (u ? '│' : '|') + fit(` ${tt}`, w - 2, undefined, ctx) + (u ? '│' : '|'), th.line);
          b.text(2, y + 1, tt, th.ink, undefined, ATTR.BOLD);
          b.text(0, y + 2, (u ? '└' : '+') + (u ? '─' : '-').repeat(w - 2) + (u ? '┘' : '+'), th.line);
        }
        return 4;
      });
      // 4. Inverse bar.
      blocks.push((y, at) => {
        const title = 'CAPACITY';
        const tt = typer(title, at);
        if (tt.length) {
          b.fill(0, y, W, 1, ' ', undefined, mix(th.bg, th.accent, 0.22));
          b.set(0, y, u ? '▌' : '|', th.accent, mix(th.bg, th.accent, 0.22));
          b.text(2, y, tt, th.ink, mix(th.bg, th.accent, 0.22), ATTR.BOLD);
          b.text(W - 9, y, '3 alerts', th.warn, mix(th.bg, th.accent, 0.22));
        }
        return 2;
      });
      // 5. Setext.
      blocks.push((y, at) => {
        const title = 'Runbook: rotate certificates';
        const tt = typer(title, at);
        b.text(0, y, tt, th.ink, undefined, ATTR.BOLD);
        if (tt.length) b.fill(0, y + 1, Math.min(W, tt.length), 1, '=', th.muted);
        return 3;
      });
      let y = 0, at = -0.3;
      const fitAll = blocks.length * 3 + 1 <= H;
      const list = fitAll ? blocks : [blocks[Math.floor(p / 1.8) % blocks.length]];
      list.forEach((draw) => { if (y < H) { y += draw(y, fitAll ? at : 0.05); at += 1.3; } });
    };
  },
};
