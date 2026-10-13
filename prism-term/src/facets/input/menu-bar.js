// A classic TUI menu bar (Turbo Vision / mc lineage): F10 opens a dropdown,
// the highlight walks items, a submenu flies out, Esc closes it again.
import { ATTR, glyphs, uni, phase, stepAt, mix, fit, backdrop, modal } from './_input.js';

const MENUS = [
  ['File', []],
  ['View', [['Logs', 'L'], ['Traces', 'T'], ['Topology', 'O']]],
  ['Service', [['Restart...', 'ctrl+r'], ['Scale...', ''], ['Rollback...', ''], null, ['Logs', '>'], null, ['Delete', 'no access']]],
  ['Incident', []],
  ['Help', []],
];
const SUB = [['Tail', 'F3'], ['Search...', '/'], ['Export...', '']];
// [time, menuIndex, itemIndex, subIndex]; -1 closed.
const SCRIPT = [
  [0.0, -1, -1, -1], [0.7, 1, 0, -1], [1.3, 2, 0, -1], [1.8, 2, 1, -1], [2.2, 2, 2, -1],
  [2.6, 2, 4, -1], [3.2, 2, 4, 0], [3.6, 2, 4, 1], [4.6, 2, 4, -1], [5.0, -1, -1, -1],
];

export default {
  id: 'input-menu-bar',
  title: 'Menu Bar',
  category: 'Tabs & Bars',
  description: 'A Turbo Vision-style menu bar with hotkey letters: F10 drops a shadowed menu, the highlight walks items past a disabled one, a submenu flies out, Esc closes.',
  tags: ['menu bar', 'dropdown', 'turbo vision', 'submenu', 'hotkeys'],
  kind: 'tui',
  size: { w: 64, h: 14 },
  minSize: { w: 40, h: 11 },
  loop: 6,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 6);
      const [, mi, ii, si] = SCRIPT[Math.max(0, stepAt(p, SCRIPT.map((s) => s[0])))];
      b.fill(0, 1, W, H - 2, ' ');
      const back = b.view(0, 1, W, H - 2);
      backdrop(ctx, back, t);
      // Bar.
      const barBg = th.panel2;
      b.fill(0, 0, W, 1, ' ', undefined, barBg);
      const xs = [];
      let x = 1;
      MENUS.forEach(([name], i) => {
        xs.push(x);
        const on = i === mi;
        const bg = on ? th.accent : barBg;
        b.text(x, 0, ` ${name} `, on ? th.bg : th.ink, bg, on ? ATTR.BOLD : 0);
        // Hotkey letter: first letter, underlined and tinted.
        b.text(x + 1, 0, name[0], on ? th.bg : th.warn, bg, ATTR.BOLD | ATTR.UNDERLINE);
        x += name.length + 2;
      });
      const clock = '12:05';
      if (x + clock.length + 1 < W) b.text(W - clock.length - 1, 0, clock, th.muted, barBg);
      // Status line.
      b.fill(0, H - 1, W, 1, ' ', undefined, barBg);
      const help = mi < 0 ? 'F10 menu  alt+letter open' : si >= 0 ? `${g.left} back  enter run  esc close` : `${g.up}${g.down} move  ${g.right} submenu  esc close`;
      let hx = 1;
      for (const part of help.split('  ')) {
        const [k, ...rest] = part.split(' ');
        hx = b.text(hx, H - 1, k, th.bg, th.muted, ATTR.BOLD);
        hx = b.text(hx, H - 1, ` ${rest.join(' ')}  `, th.ink, barBg);
        if (hx >= W) break;
      }
      if (mi < 0) return;

      const drawItem = (v, r, label, key, on, disabled) => {
        const bg = on ? th.accent : th.panel;
        v.fill(0, r, v.width, 1, ' ', undefined, bg);
        v.text(1, r, label, on ? th.bg : th.ink, bg, on ? ATTR.BOLD : 0);
        if (!disabled) v.text(1, r, label[0], on ? th.bg : th.warn, bg, ATTR.BOLD | ATTR.UNDERLINE);
        if (key) v.text(v.width - key.length - 1, r, key, on ? th.bg : th.dim, bg);
      };
      // Dropdown under the open menu, with a shadow.
      const items = MENUS[mi][1];
      const mw = Math.min(22, W - 2);
      const mx = Math.min(xs[mi], W - mw - 2);
      const sw = 18;
      // Narrow terminals drill down into the submenu instead of cascading it.
      const drill = si >= 0 && mx + mw + sw > W;
      if (drill) {
        const sub = modal(ctx, b, mx, 1, mw, SUB.length + 4, { style: 'single', color: th.line });
        sub.text(1, 0, `${g.triLeft} ${items[ii][0]}`, th.muted, th.panel, ATTR.BOLD);
        b.text(mx, 3, u ? '├' : '+', th.line, th.panel);
        b.fill(mx + 1, 3, mw - 2, 1, u ? '─' : '-', th.line, th.panel);
        b.text(mx + mw - 1, 3, u ? '┤' : '+', th.line, th.panel);
        SUB.forEach(([label, key], r) => drawItem(sub, r + 2, label, key, r === si, false));
        return;
      }
      const inner = modal(ctx, b, mx, 1, mw, items.length + 2, { style: 'single', color: th.line });
      items.forEach((it, r) => {
        if (!it) {
          // Separators join the frame: ├────┤
          b.text(mx, 2 + r, u ? '├' : '+', th.line, th.panel);
          b.fill(mx + 1, 2 + r, mw - 2, 1, u ? '─' : '-', th.line, th.panel);
          b.text(mx + mw - 1, 2 + r, u ? '┤' : '+', th.line, th.panel);
          return;
        }
        const [label, key] = it;
        const disabled = key === 'no access';
        const on = r === ii;
        const bg = on ? th.accent : th.panel;
        inner.fill(0, r, inner.width, 1, ' ', undefined, bg);
        inner.text(1, r, fit(label, inner.width - 2, undefined, ctx).trimEnd(), disabled ? mix(th.panel, th.muted, 0.5) : on ? th.bg : th.ink, bg, on ? ATTR.BOLD : disabled ? ATTR.DIM : 0);
        if (!disabled) inner.text(1, r, label[0], on ? th.bg : th.warn, bg, ATTR.BOLD | ATTR.UNDERLINE);
        const k = key === '>' ? g.tri : key;
        if (k) inner.text(inner.width - k.length - 1, r, k, disabled ? mix(th.panel, th.muted, 0.45) : on ? th.bg : th.dim, bg, disabled ? ATTR.ITALIC | ATTR.DIM : 0);
      });
      // Submenu.
      if (si >= 0) {
        const sub = modal(ctx, b, mx + mw, 1 + ii, sw, SUB.length + 2, { style: 'single', color: th.line });
        SUB.forEach(([label, key], r) => drawItem(sub, r, label, key, r === si, false));
      }
    };
  },
};
