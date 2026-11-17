// A combobox: a form field that opens an anchored dropdown, where typing jumps to the first match.
import { ATTR, uni, glyphs, phase, stepAt, scrollbar, fit, stringWidth } from './_input.js';

const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'ap-south-1', 'ap-southeast-1'];
const TYPED = 'eu-w', LOOP = 10;
// [time, action]. Tab to Region, open it, type "eu-w" (the highlight jumps), down, enter commits and closes,
// tab on; then Reset restores the form and focus goes home.
const SCRIPT = [[1.0, 'tab'], [1.5, 'open'], [2.0, 'type'], [2.25, 'type'], [2.5, 'type'], [2.75, 'type'], [3.4, 'down'], [4.0, 'enter'],
  [4.6, 'tab'], [5.6, 'tab'], [7.4, 'reset'], [8.2, 'home']];
const FIELDS = ['Name', 'Region', 'Size'];

function stateAt(p) {
  let focus = 0, open = false, typed = '', hi = 0, region = 0, resetAt = -Infinity, pressed = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const a = SCRIPT[k][1];
    if (a === 'tab') focus = Math.min(3, focus + 1);
    else if (a === 'home') focus = 0;
    else if (a === 'open') { open = true; hi = region; typed = ''; }
    else if (a === 'type') { typed = TYPED.slice(0, typed.length + 1); const m = REGIONS.findIndex((r) => r.startsWith(typed)); if (m >= 0) hi = m; }
    else if (a === 'down') hi = Math.min(REGIONS.length - 1, hi + 1);
    else if (a === 'enter') { region = hi; open = false; typed = ''; }
    else if (a === 'reset') { region = 0; pressed = SCRIPT[k][0]; resetAt = SCRIPT[k][0]; }
  }
  return { focus, open, typed, hi, region, reset: p - resetAt, pressed: p - pressed };
}

export default {
  id: 'input-combobox',
  since: '0.3.0',
  title: 'Combobox Dropdown',
  category: 'Selects & Lists',
  description: "A form's Region field opens an anchored dropdown: typing jumps the highlight to the first match, the arrows refine it, and Enter commits the value and closes the list.",
  tags: ['combobox', 'dropdown', 'typeahead', 'select', 'form', 'autocomplete'],
  kind: 'tui',
  size: { w: 56, h: 12 },
  minSize: { w: 36, h: 8 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), all = H >= 7, gap = H >= 12 ? 2 : 1, labelW = 9, fx = labelW, fw = Math.min(28, W - labelW - 1);
      const DOWN = g.triDown, values = ['web-7', REGIONS[st.region], 'm.large'];
      const rowOf = (i) => (all ? i * gap : 0);
      const fields = all ? [0, 1, 2] : [1];
      // the form; the other fields drop first when space is short
      // with the dropdown open, what lies under it isn't drawn: the list covers it
      const under = (y, x) => st.open && y > rowOf(1) && x >= fx;
      for (const i of fields) {
        const y = rowOf(i), on = st.focus === i;
        b.text(0, y, on ? g.caret : ' ', th.accent, undefined, ATTR.BOLD);
        b.text(2, y, FIELDS[i], th.ink, undefined, on ? ATTR.BOLD : 0);
        if (under(y, fx)) continue;
        const showTyped = i === 1 && st.open && st.typed, val = showTyped ? st.typed : values[i];
        const body = fit(` ${val}${showTyped && u ? '▏' : showTyped ? '_' : ''}`, fw - 2 - (i ? 2 : 0), undefined, ctx);
        b.text(fx, y, '[', on ? th.accent : th.line, undefined, ATTR.BOLD);
        b.text(fx + 1, y, body, th.ink, undefined, i === 1 && st.reset < 0.8 ? ATTR.BOLD : 0);
        if (i) b.text(fx + fw - 3, y, DOWN, on ? th.accent : sub, undefined, ATTR.BOLD);
        b.text(fx + fw - 1, y, ']', on ? th.accent : th.line, undefined, ATTR.BOLD);
      }
      // buttons
      if (all && !under(Math.min(H - 1, rowOf(2) + gap), fx)) {
        const by = Math.min(H - 1, rowOf(2) + gap), on = st.focus === 3, flash = st.pressed < 0.3;
        b.text(fx, by, '[ Create ]', th.ink, undefined, 0);
        b.text(fx + 12, by, '[ Reset ]', th.ink, undefined, on ? ATTR.INVERSE | ATTR.BOLD : flash ? ATTR.BOLD : 0);
        if (on) b.text(fx + 11, by, g.caret, th.accent, undefined, ATTR.BOLD);
      }
      // the dropdown, anchored under Region: a shadow, a window of rows, a scrollbar
      if (st.open) {
        const y0 = rowOf(1) + 1, rows = Math.max(3, Math.min(6, H - y0 - 2 - (u && W >= 44 && H >= 12 ? 1 : 0)));
        const first = Math.max(0, Math.min(REGIONS.length - rows, st.hi - Math.floor(rows / 2)));
        const shadow = u && W >= 44 && H >= 12;
        const bw = fw, h = rows + 2;
        b.text(fx, y0, (u ? '╭' : '+') + (u ? '─' : '-').repeat(bw - 2) + (u ? '╮' : '+'), th.accent);
        for (let r = 0; r < rows; r++) {
          const i = first + r, on = i === st.hi, y = y0 + 1 + r, name = REGIONS[i];
          b.text(fx, y, u ? '│' : '|', th.accent);
          b.fill(fx + 1, y, bw - 3, 1, ' ');
          const m = st.typed && name.startsWith(st.typed) ? st.typed.length : 0, label = fit(name, bw - 6, undefined, ctx).trimEnd();
          if (on) {
            b.text(fx + 1, y, ` ${fit(label, bw - 5, undefined, ctx)}`, th.ink, undefined, ATTR.INVERSE);
            b.text(fx + 2, y, label.slice(0, m), th.ink, undefined, ATTR.INVERSE | ATTR.BOLD | ATTR.UNDERLINE);
            b.text(fx + 1, y, g.caret, th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
          } else {
            b.text(fx + 2, y, label, th.ink);
            if (m) b.text(fx + 2, y, label.slice(0, m), th.ink, undefined, ATTR.BOLD | ATTR.UNDERLINE);
          }
          b.text(fx + bw - 1, y, u ? '│' : '|', th.accent);
        }
        scrollbar(ctx, b, fx + bw - 2, y0 + 1, rows, REGIONS.length, first, rows);
        b.text(fx, y0 + h - 1, (u ? '╰' : '+') + (u ? '─' : '-').repeat(bw - 2) + (u ? '╯' : '+'), th.accent);
        if (shadow) {
          for (let r = 1; r < h; r++) b.set(fx + bw, y0 + r, '░', th.dim);
          for (let c = 1; c <= bw; c++) b.set(fx + c, y0 + h, '░', th.dim);
        }
      }
      const hint = st.open ? `type to jump ${u ? '·' : '-'} ${u ? '↑/↓' : '^/v'} move ${u ? '·' : '-'} enter pick` : `tab next ${u ? '·' : '-'} enter open`;
      if (H >= 12 && stringWidth(hint) <= W && !(st.open && rowOf(1) + 10 >= H - 1)) b.text(0, H - 1, hint, sub);
    };
  },
};
