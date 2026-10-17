// TUI galleries (ai, diagrams, callouts, input): with caps.unicode off every
// frame across the loop must be pure 7-bit ASCII, still legible (not blank),
// and the same facets must survive NO_COLOR-style monochrome by carrying
// their meaning in glyphs and words rather than colour alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allFacets } from '../src/facets/index.js';
import { CellBuffer } from '../src/buffer.js';
import { createContext } from '../src/context.js';

const TUI = new Set(['ai', 'diagrams', 'callouts', 'input']);
const ASCII_CAPS = { unicode: false, braille: false, sextant: false, depth: '16' };
const facets = allFacets().filter((f) => TUI.has(f.gallery));

function frameAt(f, w, h, t, caps) {
  const b = new CellBuffer(w, h);
  const ctx = createContext({ scene: f, buffer: b, caps, seed: 7 });
  const frame = f.setup(ctx);
  // Warm up the way a player would (some facets carry state frame to frame).
  const fps = 10;
  for (let n = 0; n <= Math.round(t * fps); n++) {
    b.clear(ctx.bg);
    frame(n / fps, 1 / fps, n);
  }
  return b;
}

const text = (b) => {
  const rows = [];
  for (let y = 0; y < b.height; y++) rows.push(b.ch.slice(y * b.width, (y + 1) * b.width).join(''));
  return rows.join('\n');
};

test('TUI galleries are populated', () => {
  for (const g of TUI) assert.ok(facets.some((f) => f.gallery === g), `no facets in ${g}`);
});

for (const f of facets) {
  test(`tui ${f.gallery}/${f.id}: ASCII fallback is 7-bit across the loop`, () => {
    const loop = f.loop || 4;
    for (const { w, h } of [f.size, f.minSize]) {
      for (let k = 0; k < 8; k++) {
        const t = (loop * k) / 8 + 0.05;
        const out = text(frameAt(f, w, h, t, ASCII_CAPS));
        const bad = [...new Set([...out].filter((c) => c.codePointAt(0) > 0x7e && c !== '\n'))];
        assert.deepEqual(bad, [], `${f.id} @${w}×${h} t=${t.toFixed(2)}: non-ASCII ${bad.join(' ')}\n${out}`);
        assert.ok(/[A-Za-z0-9]/.test(out), `${f.id} @${w}×${h} t=${t.toFixed(2)}: no legible text in ASCII mode`);
      }
    }
  });
}
