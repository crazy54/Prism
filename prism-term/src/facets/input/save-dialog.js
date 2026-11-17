// A save-as dialog: places, a folder listing, a filename field and a type select; an existing name turns Save into Replace.
import { ATTR, uni, glyphs, phase, panel, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 14, NAME = 'q4-latency.csv';
const PLACES = ['home', '/srv/reports', 'recent'];
const FILES = {
  home: [['Documents/', '', ''], ['Downloads/', '', ''], ['notes.md', '4 KB', 'Nov 10']],
  '/srv/reports': [['q3-latency.csv', '1.2 MB', 'Oct 2'], ['q4-latency.csv', '1.4 MB', 'Nov 9'], ['q4-errors.csv', '220 KB', 'Nov 9'], ['README.md', '2 KB', 'Sep 1']],
};
// [time, key]: down to /srv/reports, Tab to the name, type an existing name, edit it to -v2, Enter saves, then reset.
const KEYS = (() => {
  const out = [[1.2, 'DOWN'], [2.0, 'TAB']];
  let t = 2.4;
  for (const c of NAME) { out.push([t, c]); t += 0.15; }
  t = 7.2; for (let i = 0; i < 4; i++) { out.push([t, 'BS']); t += 0.15; }
  t = 8.0; for (const c of '-v2.csv') { out.push([t, c]); t += 0.14; }
  out.push([9.8, 'ENTER'], [12.6, 'RESET']);
  return out;
})();

function stateAt(p) {
  let place = 0, focus = 'places', name = '', saved = -Infinity;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'DOWN') place = Math.min(PLACES.length - 1, place + 1);
    else if (k === 'TAB') focus = 'name';
    else if (k === 'BS') name = name.slice(0, -1);
    else if (k === 'ENTER') saved = t;
    else if (k === 'RESET') { place = 0; focus = 'places'; name = ''; saved = -Infinity; }
    else name += k;
  }
  const files = FILES[PLACES[place]] ?? [];
  return { place, focus, name, files, exists: files.some(([f]) => f === name), saved: saved > -Infinity ? p - saved : -1 };
}

export default {
  id: 'input-save-dialog',
  since: '0.3.0',
  title: 'Save Dialog',
  category: 'Dialogs & Prompts',
  description: 'A save-as dialog with places, a folder listing, a filename field and a type select: typing a name that already exists turns Save into Replace until the name changes.',
  tags: ['save as', 'file dialog', 'overwrite', 'filename', 'dialog', 'form'],
  kind: 'tui',
  size: { w: 64, h: 14 },
  minSize: { w: 44, h: 10 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), inner = panel(ctx, b, 0, 0, W, H, { title: 'Save report as', color: th.accent, titleColor: th.ink });
      const iw = inner.width, ih = inner.height, places = iw >= 56, cols = iw >= 50;
      const listX = places ? 17 : 0, rows = Math.max(1, ih - 5);
      // places: the selected place is ink-inverse while the places list has focus
      if (places) {
        inner.text(0, 0, 'Places', th.ink, undefined, ATTR.BOLD);
        PLACES.forEach((pl, i) => {
          const on = i === st.place, y = 1 + i;
          if (on && st.focus === 'places') { inner.text(0, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, 1, y, ` ${pl} `); }
          else inner.text(2, y, pl, th.ink, undefined, on ? ATTR.BOLD : 0);
        });
        for (let y = 0; y < rows + 1; y++) inner.text(15, y, u ? '│' : '|', th.line);
      }
      // the listing; size and date columns drop before the rows do
      if (!places && st.focus === 'places') { inner.text(listX, 0, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, listX + 1, 0, ` ${PLACES[st.place]} `); }   // Places hidden: its focus shows on the folder
      else inner.text(listX, 0, PLACES[st.place], th.ink, undefined, ATTR.BOLD);
      st.files.slice(0, rows).forEach(([f, sz, dt], i) => {
        const y = 1 + i, hit = f === st.name;
        inner.text(listX, y, f, th.ink, undefined, hit ? ATTR.BOLD | ATTR.UNDERLINE : 0);
        if (cols && sz) { inner.text(iw - 16, y, sz.padStart(7), sub(th)); inner.text(iw - 7, y, dt.padStart(6), sub(th)); }
      });
      // the name field and the type select
      const fy = ih - 3, nameFocus = st.focus === 'name';
      let x = inner.text(0, fy, 'Name', th.ink, undefined, ATTR.BOLD);
      const fw = Math.max(12, iw - 20);
      x = inner.text(x + 1, fy, '[', nameFocus ? th.accent : th.line, undefined, ATTR.BOLD);
      const shown = st.name.length > fw - 2 ? st.name.slice(-(fw - 2)) : st.name;
      inner.text(x + 1, fy, shown, th.ink);
      if (nameFocus && st.saved < 0) inner.text(x + 1 + stringWidth(shown), fy, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD);
      inner.text(x + fw, fy, ']', nameFocus ? th.accent : th.line, undefined, ATTR.BOLD);
      inner.text(x + fw + 2, fy, `[CSV ${g.triDown}]`, th.ink);
      // the overwrite warning, and the buttons: Save becomes Replace while the name exists
      const wy = ih - 2, by = ih - 1;
      if (st.saved >= 0) { const c = inner.text(0, wy, g.check, th.pos, undefined, ATTR.BOLD); fitText(inner, c + 1, wy, iw - c - 1, [`saved ${st.name}`, 'saved'], th.ink); }
      else if (st.exists) { const c = inner.text(0, wy, g.warn, th.warn, undefined, ATTR.BOLD); fitText(inner, c + 1, wy, iw - c - 1, [`${st.name} exists ${u ? '—' : '-'} Replace?`, 'exists - Replace?'.replace('-', u ? '—' : '-')], th.ink); }
      const label = st.exists ? 'Replace' : 'Save', primary = `[ ${label} ]`;
      const px = iw - stringWidth(primary), cx = px - 12;
      inner.text(cx, by, '[ Cancel ]', th.ink);
      if (nameFocus && st.name) { inv(ctx, inner, px, by, primary); } else inner.text(px, by, primary, th.ink, undefined, ATTR.BOLD);
    };
  },
};
