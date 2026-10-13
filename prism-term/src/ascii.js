// ASCII folding — how every facet degrades on a terminal without Unicode
// (TERM=linux consoles, LANG=C, serial lines, old Windows consoles).
//
// foldChar() maps any single glyph to ONE printable 7-bit character, so a fold
// never shifts a column: box drawing becomes + - |, blocks and braille become a
// density ramp, arrows/marks become their closest ASCII shape, accented letters
// lose their accent, and anything unknown becomes '?'. Wide (2-cell) glyphs fold
// to two characters for the same reason.
//
// asciiSurface(surface) wraps any Surface so everything drawn through it is
// folded. createContext() applies it automatically when caps.unicode is false,
// so facets don't need their own ASCII paths (though bespoke ones look better).

import { Surface } from './buffer.js';
import { charWidth } from './width.js';

const MAP = new Map();
const put = (chars, a) => { for (const c of chars) MAP.set(c, a); };

// Box drawing (U+2500–257F): straight runs keep their direction, everything else is a joint.
for (let cp = 0x2500; cp <= 0x257f; cp++) MAP.set(String.fromCodePoint(cp), '+');
put('─━┄┅┈┉╌╍╴╶╸╺╼╾', '-');
put('═', '=');
put('│┃┆┇┊┋╎╏║╵╷╹╻╽╿', '|');
put('╱', '/'); put('╲', '\\'); put('╳', 'X');

// Block elements (U+2580–259F) by how much of the cell they fill.
put('█▓▉▊▋■▪▮◼▇', '#');
put('▒▚▞', ':');
put('░▖▗▘▝▁▂', '.');
put('▃▄', '_');
put('▅▆▬', '=');
put('▀▔', '"');
put('▏▎▍▌▐▕', '|');
put('▙▛▜▟', '#');

// Shapes, arrows, marks and punctuation.
put('●◉⬤◍', 'o'); put('○◌◯', 'o'); put('◆◈❖', '*'); put('◇', 'o'); put('□▯▢', '[');
put('★☆✦✧✶✸✺✹✷⁂☼', '*'); put('•∙⋅·', '.'); put('◐◑◒◓◔◕', 'o');
put('→⇒⟶➜➔➝➞⇢⇨', '>'); put('←⇐⟵⇠⇦', '<'); put('↑⇑⇡⇧', '^'); put('↓⇓⇣⇩', 'v');
put('↗↙', '/'); put('↖↘', '\\'); put('↔⇔', '-'); put('↕⇕', '|'); put('↻↺⟳⟲', '@');
put('▶▸►▹⏵❯›»', '>'); put('◀◂◄◃⏴❮‹«', '<'); put('▲▴△▵⏶', '^'); put('▼▾▽▿⏷', 'v');
put('✔✓☑', '+'); put('✖✗✘☒', 'x'); put('⚠', '!'); put('ℹ', 'i'); put('⚡', '!');
put('—–‒―−', '-'); put('…', '.'); put('×', 'x'); put('÷', '/'); put('±', '+');
put('≥≧', '>'); put('≤≦', '<'); put('≠', '#'); put('≈∼', '~'); put('°', 'o'); put('µμ', 'u');
put('‘’‚′', "'"); put('“”„″', '"'); put('¦‖', '|'); put('§', 'S'); put('¶', 'P');
put('©', 'c'); put('®', 'r'); put('™', 't'); put('€', 'E'); put('£', 'L'); put('¥', 'Y');
put('∞', '8'); put('√', 'v'); put('∑', 'E'); put('∆Δ', 'A'); put('λ', 'l'); put('π', 'p'); put('σ', 's');
put('⎇', 'Y'); put('⎈', '*'); put('⊘⌀', '0'); put('␣', '_'); put('⏎↵', '<');

const BRAILLE_RAMP = ' ..::++##';
const SEXTANT_RAMP = ' ..::+##';
const popcount = (n) => { let k = 0; while (n) { k += n & 1; n >>= 1; } return k; };

/** One printable ASCII character for any single glyph. */
export function foldChar(c) {
  if (!c) return c;
  const cp = c.codePointAt(0);
  if (cp >= 0x20 && cp < 0x7f) return c;
  if (cp < 0x20 || cp === 0x7f) return ' ';
  const m = MAP.get(c);
  if (m) return m;
  if (cp >= 0x2800 && cp <= 0x28ff) return BRAILLE_RAMP[popcount(cp - 0x2800)];
  if (cp >= 0x1fb00 && cp <= 0x1fb3b) {
    // Invert canvas.js's sextant numbering (masks 21 and 42 are ▌▐, 63 is █).
    let mask = cp - 0x1fb00 + 1;
    if (mask >= 21) mask++;
    if (mask >= 42) mask++;
    return SEXTANT_RAMP[popcount(mask)];
  }
  const base = c.normalize('NFD')[0];
  if (base && base.codePointAt(0) < 0x7f && base.codePointAt(0) >= 0x20) return base;
  return '?';
}

/** Fold a string so it occupies exactly the same number of columns in 7-bit ASCII. */
export function foldText(s) {
  let out = '';
  for (const c of String(s)) {
    const cp = c.codePointAt(0);
    if (cp >= 0x20 && cp < 0x7f) { out += c; continue; }
    const w = charWidth(cp);
    if (w === 0) continue;
    out += w === 2 ? '??' : foldChar(c);
  }
  return out;
}

class AsciiSurface extends Surface {
  constructor(inner) {
    super();
    this.inner = inner;
    this.ascii = true;
  }
  get width() { return this.inner.width; }
  get height() { return this.inner.height; }
  set(x, y, ch, fg, bg, attr) {
    // '' marks the right half of a wide glyph; once the glyph folds to one cell, it needs a filler.
    if (ch !== undefined) ch = ch === '' ? '?' : foldChar(String.fromCodePoint(ch.codePointAt(0)));
    return this.inner.set(x, y, ch, fg, bg, attr);
  }
  get(x, y) { return this.inner.get(x, y); }
  clear(bg, fg) { this.inner.clear(bg, fg); return this; }
  text(x, y, str, fg, bg, attr) { return super.text(x, y, foldText(str), fg, bg, attr); }
}

/** Wrap a surface so everything drawn through it is 7-bit ASCII (idempotent). */
export function asciiSurface(surface) {
  return surface && surface.ascii ? surface : new AsciiSurface(surface);
}
