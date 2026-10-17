// Markdown rendered as it streams: headings, bold, inline code, bullets and
// a fenced code block that is syntax-colored line by line as it arrives.
import { ATTR, glyphs, uni, phase, tint, fit, clip, codeLine, reveal, stringWidth } from './_ai.js';

const MD = [
  '## Root cause',
  'The **connection pool** is too small for the new worker count.',
  '',
  '- workers: `8 -> 32` in v2.14.1',
  '- pool: `20`, unchanged',
  '',
  '## Fix',
  '```js',
  "const pool = createPool({",
  '  max: Number(process.env.DB_POOL_SIZE ?? 40),',
  '  acquireTimeoutMillis: 2000,',
  '});',
  '```',
  'Then alert when `pool_wait_ms` p99 > 200.',
].join('\n');

/** Inline spans: **bold** and `code`. Returns [[text, kind]]. */
function inline(s) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*\*[^*]*$|`[^`]+`|`[^`]*$)/g;
  let i = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push([s.slice(i, m.index), 'text']);
    const tok = m[0];
    if (tok.startsWith('**')) out.push([tok.replace(/\*\*/g, ''), 'bold']);
    else out.push([tok.replace(/`/g, ''), 'code']);
    i = m.index + tok.length;
  }
  if (i < s.length) out.push([s.slice(i), 'text']);
  return out;
}

export default {
  id: 'ai-markdown-stream',
  title: 'Markdown Stream',
  category: 'Token Streams',
  description: 'Markdown rendered live as it streams: headings, bold and inline code spans, bullets, and a fenced code block that is syntax-colored line by line.',
  tags: ['markdown', 'streaming', 'render', 'code block', 'llm'],
  kind: 'text',
  size: { w: 64, h: 17 },
  minSize: { w: 44, h: 10 },
  loop: 10,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    const low = ctx.caps.depth === '16' || ctx.caps.depth === 'mono';
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      const r = reveal(MD, p, -0.2, 19);
      const src = r.text.split('\n');
      // Render each source line into one or more styled rows.
      const rows = [];
      let inCode = false, lang = '';
      src.forEach((line, li) => {
        const last = li === src.length - 1;
        if (line.startsWith('```')) {
          if (!inCode) { inCode = true; lang = line.slice(3); rows.push({ kind: 'fence-open', lang }); }
          else { inCode = false; rows.push({ kind: 'fence-close' }); }
          return;
        }
        if (inCode) { rows.push({ kind: 'code', text: line }); return; }
        if (/^#{1,3} /.test(line)) { rows.push({ kind: 'h', text: line.replace(/^#+ /, '') }); return; }
        if (/^- /.test(line)) { rows.push({ kind: 'li', spans: inline(line.slice(2)) }); return; }
        if (!line && !last) { rows.push({ kind: 'blank' }); return; }
        rows.push({ kind: 'p', spans: inline(line) });
      });
      const first = Math.max(0, rows.length - H);
      const codeBg = tint(ctx, th.panel2, 0.85);
      rows.slice(first, first + H).forEach((row, y) => {
        if (row.kind === 'h') {
          b.text(0, y, fit(row.text, W, undefined, ctx).trimEnd(), th.accent, undefined, ATTR.BOLD);
          return;
        }
        if (row.kind === 'fence-open' || row.kind === 'code' || row.kind === 'fence-close') {
          b.fill(0, y, W, 1, ' ', undefined, codeBg);
          if (row.kind === 'fence-open') b.text(W - stringWidth(row.lang || 'text') - 1, y, row.lang || 'text', th.dim, codeBg);
          if (row.kind === 'code') codeLine(ctx, b, 2, y, W - 3, row.text, codeBg);
          if (row.kind === 'fence-open' || row.kind === 'fence-close') b.set(0, y, u ? '▏' : '|', th.line, codeBg);
          else b.set(0, y, u ? '▏' : '|', th.accent, codeBg);
          return;
        }
        if (row.kind === 'blank') return;
        let x = 0;
        if (row.kind === 'li') x = b.text(1, y, `${g.bullet} `, th.accent);
        for (const [text, kind] of row.spans) {
          const room = Math.max(0, W - x);
          const s = u ? text.replace(/->/g, '→') : text;
          const shown = stringWidth(s) <= room ? s : clip(ctx, s, room);
          if (kind === 'code') x = b.text(x, y, shown, th.warn, low ? undefined : tint(ctx, th.warn, 0.15)); // 16 colors: a wash would be a solid block (black on Night), so code keeps the default bg
          else x = b.text(x, y, shown, th.ink, undefined, kind === 'bold' ? ATTR.BOLD : 0);
        }
      });
      // Streaming caret at the end of the last row.
      if (!r.done && rows.length) {
        const ly = Math.min(H, rows.length - first) - 1;
        let lx = 0;
        for (let x = W - 1; x >= 0; x--) { const c = b.get(x, ly); if (c && c.ch !== ' ' && c.ch !== '') { lx = x + 1; break; } }
        b.set(Math.min(W - 1, lx), ly, u ? '▍' : '_', th.accent);
      }
    };
  },
};
