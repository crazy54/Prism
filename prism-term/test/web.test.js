// Browser runtime (src/web): the procedural glyph tables the canvas renderer
// draws from, the ANSI parser used to preview the curl-able site, and the
// layout maths. Rendering itself needs a DOM canvas and is checked in Chrome.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphClass, blockGeometry, brailleDots, sextantCells, boxGeometry } from '../src/web/glyphs.js';
import { parseAnsi } from '../src/web/ansi.js';
import { fitCells } from '../src/web/renderer.js';
import { Canvas } from '../src/canvas.js';
import { CellBuffer, ATTR } from '../src/buffer.js';
import { NONE } from '../src/color.js';

const WHITE = 0xffffff;

test('every box-drawing code point (U+2500–257F) has geometry', () => {
  for (let cp = 0x2500; cp <= 0x257f; cp++) {
    assert.equal(glyphClass(cp), 'box', `U+${cp.toString(16)}`);
    const g = boxGeometry(cp);
    assert.ok(g && Array.isArray(g.arms) && g.arms.length === 4, `U+${cp.toString(16)} geometry`);
    assert.ok(g.style || g.arms.some(Boolean), `U+${cp.toString(16)} draws something`);
  }
  // Spot checks: ┼ light cross, ━ heavy horizontal, ╬ double cross, ╭ arc.
  assert.deepEqual(boxGeometry(0x253c).arms, [1, 1, 1, 1]);
  assert.deepEqual(boxGeometry(0x2501).arms, [0, 2, 0, 2]);
  assert.deepEqual(boxGeometry(0x256c).arms, [3, 3, 3, 3]);
  assert.equal(boxGeometry(0x256d).style, 'arc');
});

test('every block element (U+2580–259F) is a set of rects or a shade', () => {
  for (let cp = 0x2580; cp <= 0x259f; cp++) {
    assert.equal(glyphClass(cp), 'block', `U+${cp.toString(16)}`);
    const g = blockGeometry(cp);
    assert.ok(g.shade > 0 || g.rects.length > 0, `U+${cp.toString(16)}`);
    for (const [x, y, w, h] of g.rects || []) assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9);
  }
  assert.deepEqual(blockGeometry(0x2580).rects, [[0, 0, 1, 0.5]]); // ▀
  assert.deepEqual(blockGeometry(0x2588).rects, [[0, 0, 1, 1]]);   // █
  assert.equal(blockGeometry(0x2592).shade, 0.5);                   // ▒
});

test('braille dots match what the engine encodes', () => {
  for (let mask = 1; mask < 256; mask++) {
    const c = new Canvas(1, 1, { mode: 'braille', threshold: 0 });
    const want = [];
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
      const bit = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]][dy][dx];
      if (mask & bit) { c.set(dx, dy, WHITE); want.push(`${dx},${dy}`); }
    }
    const b = new CellBuffer(1, 1);
    c.paint(b);
    const cp = b.get(0, 0).ch.codePointAt(0);
    assert.equal(glyphClass(cp), 'braille');
    assert.deepEqual(brailleDots(cp).map(([x, y]) => `${x},${y}`).sort(), want.sort(), `mask ${mask}`);
  }
});

test('sextant cells match what the engine encodes', () => {
  for (let m = 1; m < 63; m++) {
    if (m === 21 || m === 42) continue; // drawn with ▌ / ▐ (block elements)
    const c = new Canvas(1, 1, { mode: 'sextant' });
    const want = [];
    for (let k = 0; k < 6; k++) {
      const x = k & 1, y = k >> 1;
      c.set(x, y, m & (1 << k) ? WHITE : 0x000000);
      if (m & (1 << k)) want.push(`${x},${y}`);
    }
    const b = new CellBuffer(1, 1);
    c.paint(b);
    const cell = b.get(0, 0), cp = cell.ch.codePointAt(0);
    assert.equal(glyphClass(cp), 'sextant', `mask ${m} → ${cell.ch}`);
    const got = sextantCells(cp).map(([x, y]) => `${x},${y}`).sort();
    // The encoder may put either colour in the foreground; the glyph covers the fg pixels.
    const fgPixels = cell.fg === WHITE ? want : ['0,0', '1,0', '0,1', '1,1', '0,2', '1,2'].filter((p) => !want.includes(p));
    assert.deepEqual(got, fgPixels.sort(), `mask ${m}`);
  }
});

test('parseAnsi round-trips toAnsi output (colours, attributes, wide glyphs)', () => {
  const src = new CellBuffer(12, 3);
  src.text(0, 0, 'plasma', 0xff3b6b, NONE, ATTR.BOLD);
  src.text(7, 0, '⣿▀', 0x2ec5ff, 0x101820);
  src.text(0, 1, 'dim', NONE, NONE, ATTR.DIM | ATTR.UNDERLINE);
  src.text(4, 1, '漢字', 0x3ddc84, NONE, ATTR.INVERSE);
  src.text(0, 2, 'italic', 0xffe14d, NONE, ATTR.ITALIC | ATTR.STRIKE);
  const out = parseAnsi(src.toAnsi('truecolor'), { minWidth: 12 });
  assert.equal(out.width, 12);
  assert.equal(out.height, 3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 12; x++) {
    const a = src.get(x, y), b = out.get(x, y);
    if (a.ch === ' ' && a.bg === NONE && !a.attr) continue; // trailing blanks are trimmed by toAnsi
    assert.deepEqual([b.ch, b.fg, b.bg, b.attr], [a.ch, a.fg, a.bg, a.attr], `cell ${x},${y}`);
  }
});

test('parseAnsi decodes 256-colour and 16-colour SGR and skips other escapes', () => {
  const b = parseAnsi('\x1b]0;title\x07\x1b[38;5;196mR\x1b[48;5;21mB\x1b[0m\x1b[92mG\x1b[2K\x1b[39;49m.\tx');
  assert.equal(b.get(0, 0).fg, 0xff0000);
  assert.equal(b.get(1, 0).bg, 0x0000ff);
  assert.equal(b.get(2, 0).fg, 0x00ff00);
  assert.equal(b.get(3, 0).fg, NONE);
  assert.equal(b.get(8, 0).ch, 'x'); // tab to column 8
});

test('fitCells picks an integer device-pixel cell that fits the box', () => {
  assert.deepEqual(fitCells(80, 24, 640, 0, 1), { cw: 8, cssWidth: 640, cssHeight: 384 });
  const f = fitCells(80, 24, 300, 150, 2);
  assert.ok(Number.isInteger(f.cw) && f.cssWidth <= 300 && f.cssHeight <= 150);
  assert.equal(fitCells(80, 24, 10, 10, 1).cw, 2); // never below 2px
});
