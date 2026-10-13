// ANSI text → CellBuffer, for previewing terminal output (e.g. the curl-able
// terminal site's pages) with the web renderer. Handles what static ANSI
// documents use: SGR colors (16, 256, truecolor), bold/dim/italic/underline/
// inverse/strike, resets, CR/LF and tabs. Cursor-movement sequences are
// skipped (static pages don't need them).

import { CellBuffer, ATTR } from '../buffer.js';
import { NONE, ANSI16 } from '../color.js';
import { charWidth } from '../width.js';

function xterm256(n) {
  if (n < 16) return ANSI16[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return (v << 16) | (v << 8) | v; }
  const i = n - 16, lv = [0, 95, 135, 175, 215, 255];
  return (lv[Math.floor(i / 36)] << 16) | (lv[Math.floor(i / 6) % 6] << 8) | lv[i % 6];
}

/**
 * Parse ANSI text into a CellBuffer as wide as its longest line, between
 * `minWidth` and `maxWidth` columns (lines wider than maxWidth are clipped).
 */
export function parseAnsi(text, { minWidth = 1, maxWidth = 200, tabSize = 8 } = {}) {
  const rows = [];
  let row = [], fg = NONE, bg = NONE, at = 0;
  const flush = () => { rows.push(row); row = []; };
  const s = String(text).replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\x1b') {
      if (s[i + 1] === '[') {
        let j = i + 2;
        while (j < s.length && !/[@-~]/.test(s[j])) j++;
        if (s[j] === 'm') {
          const ps = s.slice(i + 2, j).split(';').map((v) => (v === '' ? 0 : Number(v)));
          for (let k = 0; k < ps.length; k++) {
            const v = ps[k];
            if (v === 0) { fg = NONE; bg = NONE; at = 0; }
            else if (v === 1) at |= ATTR.BOLD; else if (v === 2) at |= ATTR.DIM; else if (v === 3) at |= ATTR.ITALIC;
            else if (v === 4) at |= ATTR.UNDERLINE; else if (v === 7) at |= ATTR.INVERSE; else if (v === 9) at |= ATTR.STRIKE;
            else if (v === 22) at &= ~(ATTR.BOLD | ATTR.DIM); else if (v === 23) at &= ~ATTR.ITALIC; else if (v === 24) at &= ~ATTR.UNDERLINE;
            else if (v === 27) at &= ~ATTR.INVERSE; else if (v === 29) at &= ~ATTR.STRIKE;
            else if (v >= 30 && v <= 37) fg = ANSI16[v - 30]; else if (v >= 90 && v <= 97) fg = ANSI16[v - 82];
            else if (v >= 40 && v <= 47) bg = ANSI16[v - 40]; else if (v >= 100 && v <= 107) bg = ANSI16[v - 92];
            else if (v === 39) fg = NONE; else if (v === 49) bg = NONE;
            else if (v === 38 || v === 48) {
              let col = NONE;
              if (ps[k + 1] === 2) { col = ((ps[k + 2] & 255) << 16) | ((ps[k + 3] & 255) << 8) | (ps[k + 4] & 255); k += 4; }
              else if (ps[k + 1] === 5) { col = xterm256(ps[k + 2] & 255); k += 2; }
              if (v === 38) fg = col; else bg = col;
            }
          }
        }
        i = j;
      } else if (s[i + 1] === ']') {
        const end = s.indexOf('\x07', i);
        i = end < 0 ? s.length : end;
      } else i++;
      continue;
    }
    if (c === '\n') { flush(); continue; }
    if (c === '\r') continue;
    if (c === '\t') { const n = tabSize - (row.length % tabSize); for (let k = 0; k < n; k++) row.push({ ch: ' ', fg, bg, at }); continue; }
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    if (ch.length === 2) i++;
    const w = charWidth(cp);
    if (w === 0) continue;
    row.push({ ch, fg, bg, at });
    if (w === 2) row.push({ ch: '', fg, bg, at });
  }
  if (row.length) flush();
  while (rows.length && rows.at(-1).length === 0) rows.pop();
  const width = Math.min(maxWidth, rows.reduce((w, r) => Math.max(w, r.length), Math.max(1, minWidth)));
  const b = new CellBuffer(width, Math.max(1, rows.length));
  rows.forEach((r, y) => r.slice(0, width).forEach((c, x) => b.set(x, y, c.ch, c.fg, c.bg, c.at)));
  return b;
}
