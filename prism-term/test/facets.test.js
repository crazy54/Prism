// Catalog conformance — every terminal facet in the manifest, automatically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { allFacets, catalogTree, searchFacets, findFacet } from '../src/facets/index.js';
import { GALLERIES } from '../src/facets/galleries.js';
import { CellBuffer } from '../src/buffer.js';
import { createContext } from '../src/context.js';
import { MODE_NAMES } from '../src/canvas.js';
import { NONE } from '../src/color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const facets = allFacets();
const CAPS = { unicode: true, braille: true, sextant: true, depth: 'truecolor' };

function run(f, { w, h, frames = 8, fps = 10, mode = null, seed = 7, buffer, ox = 0, oy = 0, caps = CAPS } = {}) {
  const parent = buffer || new CellBuffer(w, h);
  const target = buffer ? buffer.view(ox, oy, w, h) : parent;
  const ctx = createContext({ scene: f, buffer: target, caps, mode, seed });
  const frame = f.setup(ctx);
  for (let n = 0; n < frames; n++) {
    target.clear(ctx.bg);
    frame(n / fps, 1 / fps, n);
  }
  return parent;
}

const snapshot = (b) => `${b.ch.join('')}|${Array.from(b.fg).join(',')}|${Array.from(b.bg).join(',')}`;
const visible = (b) => b.ch.some((c) => c !== ' ' && c !== '') || Array.from(b.bg).some((c) => c !== NONE && c !== b.bg[0]);

test('manifest is up to date with src/facets/', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-manifest.mjs'), '--check'], { stdio: 'pipe' });
});

test('every facet passes schema validation and ids are unique', () => {
  assert.deepEqual(facets.problems, [], facets.problems.join('\n'));
  assert.equal(new Set(facets.map((f) => f.id)).size, facets.length);
  assert.ok(facets.length >= 23);
});

test('gallery tree and search are consistent', () => {
  const tree = catalogTree();
  assert.equal(tree.reduce((n, g) => n + g.count, 0), facets.length);
  for (const g of tree) assert.ok(GALLERIES.find((x) => x.id === g.id));
  assert.ok(searchFacets('plasma').some((f) => f.id === 'plasma'));
  assert.equal(findFacet(facets[0].id), facets[0]);
});

for (const f of facets) {
  test(`facet ${f.gallery}/${f.id}: renders at size and minSize in every mode`, () => {
    for (const { w, h } of [f.size, f.minSize]) {
      for (const mode of [null, ...MODE_NAMES]) {
        const b = run(f, { w, h, mode, frames: 3 });
        assert.ok(visible(b), `${f.id} blank at ${w}×${h} mode=${mode || 'auto'}`);
        for (let i = 0; i < b.fg.length; i++) {
          assert.ok(Number.isInteger(b.fg[i]) && Number.isInteger(b.bg[i]), `${f.id}: non-integer colour at cell ${i}`);
        }
        assert.ok(b.ch.every((c) => typeof c === 'string' && [...c].length <= 2), `${f.id}: a cell holds more than one glyph`);
      }
    }
  });

  test(`facet ${f.gallery}/${f.id}: deterministic, animated as declared, stays inside its view`, () => {
    const { w, h } = f.size;
    const a = snapshot(run(f, { w, h, seed: 11 })), b = snapshot(run(f, { w, h, seed: 11 }));
    assert.equal(a, b, `${f.id}: same seed must give the same frames`);
    if (f.animated) {
      const early = snapshot(run(f, { w, h, frames: 2 }));
      const later = snapshot(run(f, { w, h, frames: 2 + Math.round(f.loop * 10 * 0.37) }));
      assert.notEqual(early, later, `${f.id}: declared animated but frames don't change`);
    }
    // Drawn into a View in the middle of a larger buffer, nothing lands outside it.
    const big = new CellBuffer(w + 8, h + 6);
    big.clear(0x010203);
    run(f, { w, h, buffer: big, ox: 4, oy: 3, frames: 4 });
    for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) {
      const inside = x >= 4 && x < 4 + w && y >= 3 && y < 3 + h;
      if (!inside) {
        const c = big.get(x, y);
        assert.ok(c.ch === ' ' && c.bg === 0x010203, `${f.id}: wrote outside its view at ${x},${y}`);
      }
    }
  });

  test(`facet ${f.gallery}/${f.id}: frame budget at 160×48`, () => {
    const W = Math.min(160, Math.max(f.size.w, 120)), H = Math.min(48, Math.max(f.size.h, 36));
    const ctx = createContext({ scene: f, buffer: new CellBuffer(W, H), caps: CAPS, seed: 3 });
    const frame = f.setup(ctx);
    for (let n = 0; n < 5; n++) frame(n / 30, 1 / 30, n); // warm up
    const t0 = performance.now();
    const N = 20;
    for (let n = 0; n < N; n++) { ctx.buffer.clear(ctx.bg); frame((n + 5) / 30, 1 / 30, n + 5); }
    const ms = (performance.now() - t0) / N;
    assert.ok(ms < 25, `${f.id}: ${ms.toFixed(1)} ms/frame at ${W}×${H} (budget 25 ms)`);
  });

  // Every facet, not just the ascii gallery: on a terminal without Unicode the
  // context folds glyphs to 7-bit, so nothing else may reach the screen.
  test(`facet ${f.gallery}/${f.id}: emits only 7-bit glyphs on a terminal without Unicode`, () => {
    for (const { w, h } of [f.size, f.minSize]) {
      const b = run(f, { w, h, caps: { unicode: false, braille: false, sextant: false, depth: '16' } });
      for (const c of b.ch) assert.ok(/^[\x20-\x7e]$/.test(c), `${f.id}: non-ASCII glyph "${c}" at ${w}×${h}`);
    }
  });
}

test('mono depth (NO_COLOR): no facet is a wall of half blocks — color pictures become a luminance ramp', () => {
  const HALF = new Set(['▀', '▄', '▌', '▐']);
  const bad = [];
  for (const f of facets) {
    const b = run(f, { w: 60, h: 20, frames: 6, caps: { unicode: true, braille: true, sextant: false, depth: 'mono' } });
    let half = 0, ink = 0;
    for (const c of b.ch) { if (!c || c === ' ') continue; ink++; if (HALF.has(c)) half++; }
    if (ink > 200 && half / ink > 0.6) bad.push(f.id);
  }
  assert.deepEqual(bad, []);
});
