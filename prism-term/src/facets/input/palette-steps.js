// A multi-step palette that drills down: action → service → environment → confirm, with a breadcrumb in the input.
import { ATTR, uni, glyphs, phase, panel, spin, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 14, SHA = '7f3c2e';
const STEPS = [['Deploy', 'Rollback', 'Scale', 'Restart'], ['api', 'web', 'worker', 'search'], ['dev', 'staging', 'prod']];
// [time, key]: "dep" Enter, "ap" Enter, ↓ staging Enter, Backspace backs up once, Enter again, Enter confirms.
const KEYS = [[0.6, 'OPEN'], [1.0, 'd'], [1.2, 'e'], [1.4, 'p'], [2.0, 'ENTER'], [2.6, 'a'], [2.8, 'p'], [3.4, 'ENTER'], [4.1, 'DOWN'], [4.7, 'ENTER'],
  [5.8, 'BS'], [6.6, 'ENTER'], [7.6, 'ENTER'], [10.0, 'CLOSE']];

function stateAt(p) {
  let open = false, path = [], q = '', sel = 0, done = -Infinity;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    const list = path.length < 3 ? STEPS[path.length].filter((s) => s.toLowerCase().startsWith(q)) : [];
    if (k === 'OPEN') { open = true; path = []; q = ''; sel = 0; }
    else if (k === 'CLOSE') { open = false; done = -Infinity; }
    else if (k === 'DOWN') sel = Math.min(list.length - 1, sel + 1);
    else if (k === 'BS') { if (q) q = q.slice(0, -1); else { path.pop(); sel = path.length === 2 ? 1 : 0; } }
    else if (k === 'ENTER') { if (path.length < 3) { path.push(list[sel]); q = ''; sel = path.length === 2 ? 0 : 0; } else done = t; }
    else { q += k; sel = 0; }
  }
  return { open, path, q, sel, done: done > -Infinity ? p - done : -1 };
}

export default {
  id: 'input-palette-steps',
  since: '0.3.0',
  title: 'Multi-step Palette',
  category: 'Command Palettes',
  description: 'A command palette that drills down, action then service then environment then confirm, with a breadcrumb in the input; Backspace on an empty query steps back one level.',
  tags: ['command palette', 'drill down', 'breadcrumb', 'multi step', 'deploy', 'wizard'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx), SEP = u ? ' › ' : ' > ', ELL = u ? '…' : '...';
      const p = phase(t, LOOP), st = stateAt(p);
      if (!st.open) { fitText(b, 0, H - 1, W, [`Ctrl+K commands`], sub(th)); return; }
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'Run', color: th.accent, titleColor: th.ink });
      // the breadcrumb input: middle segments become … when it doesn't fit
      const segs = [...st.path];
      let crumb = segs.length ? segs.join(SEP) + SEP : '';
      if (stringWidth(crumb + st.q) + 4 > inner.width && segs.length > 2) crumb = [segs[0], ELL, segs[segs.length - 1]].join(SEP) + SEP;
      let x = inner.text(0, 0, u ? '❯ ' : '> ', th.accent, undefined, ATTR.BOLD);
      const parts = crumb.split(SEP).filter(Boolean);
      parts.forEach((sgm) => { x = inner.text(x, 0, sgm, th.ink, undefined, ATTR.BOLD); x = inner.text(x, 0, SEP, sub(th)); });
      x = inner.text(x, 0, st.q, th.ink); inner.text(x, 0, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD);
      inner.text(0, 1, (u ? '─' : '-').repeat(inner.width), th.line);
      const depth = st.path.length;
      if (st.done >= 0) {
        const c = inner.text(0, 3, g.check, th.pos, undefined, ATTR.BOLD);
        fitText(inner, c + 1, 3, inner.width - c - 1, [`deploying ${st.path[1]}@${SHA} to ${st.path[2]}`, `deploying ${st.path[1]}`], th.ink, undefined, ATTR.BOLD);
        inner.text(0, 4, spin(ctx, p), th.accent);
        return;
      }
      if (depth < 3) {
        const list = STEPS[depth].filter((s) => s.toLowerCase().startsWith(st.q));
        list.slice(0, Math.max(1, inner.height - 3)).forEach((s, i) => {
          const on = i === st.sel;
          inner.text(0, 2 + i, on ? '›' : ' ', th.accent, undefined, ATTR.BOLD);
          if (on) inv(ctx, inner, 2, 2 + i, ` ${s} `); else inner.text(3, 2 + i, s, th.ink);
          if (st.q && s.toLowerCase().startsWith(st.q)) inner.text(on ? 3 : 3, 2 + i, s.slice(0, st.q.length), th.ink, undefined, (on ? ATTR.INVERSE : 0) | ATTR.UNDERLINE | ATTR.BOLD);
        });
      } else {
        inner.text(0, 2, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, 2, 2, ' Confirm ');
        inner.text(12, 2, 'Back', th.ink);
      }
      // the preview drops first
      if (depth >= 2 && inner.height >= 6) fitText(inner, 0, inner.height - 1, inner.width, [`will deploy ${st.path[1]}@${SHA} to ${depth === 3 ? st.path[2] : STEPS[2][st.sel] ?? 'dev'}`], sub(th));
      else if (inner.height >= 6) fitText(inner, 0, inner.height - 1, inner.width, [`Enter pick ${u ? '·' : '-'} Backspace back a level`, 'Enter pick'], sub(th));
    };
  },
};
