// Fields & 3D scene pack: every scene renders in every canvas mode at two sizes,
// paints something, and actually animates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScene } from '../src/render.js';
import { MODE_NAMES } from '../src/canvas.js';
import { findScene } from '../src/scenes/index.js';

const IDS = ['fire', 'tunnel', 'mandelbrot', 'metaballs', 'aurora', 'ripple', 'donut', 'wireframe', 'globe', 'synthwave'];
const SIZES = [[80, 24], [37, 11]];

function painted(buf) {
  const bg = buf.theme.bg;
  let n = 0;
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      const c = buf.get(x, y);
      if (c.ch !== ' ' || c.bg !== bg) n++;
    }
  return n;
}

function differs(a, b) {
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const p = a.get(x, y), q = b.get(x, y);
      if (p.ch !== q.ch || p.fg !== q.fg || p.bg !== q.bg) return true;
    }
  return false;
}

function finiteColors(buf) {
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      const c = buf.get(x, y);
      if (!Number.isInteger(c.fg) || !Number.isInteger(c.bg) || c.fg < -1 || c.fg > 0xffffff || c.bg < -1 || c.bg > 0xffffff) return false;
    }
  return true;
}

for (const id of IDS) {
  test(`${id}: renders, paints and animates in every mode`, async () => {
    const scene = await findScene(id);
    assert.ok(scene, `scene ${id} is registered`);
    assert.equal(scene.id, id);
    assert.ok(scene.title && scene.description && scene.category, 'has metadata');
    for (const mode of MODE_NAMES) {
      for (const [width, height] of SIZES) {
        const a = renderScene(scene, { width, height, t: 0.6, fps: 15, mode });
        const b = renderScene(scene, { width, height, t: 2.4, fps: 15, mode });
        const label = `${id} ${mode} ${width}x${height}`;
        assert.ok(painted(a) > width * height * 0.02, `${label}: paints something at t=0.6`);
        assert.ok(painted(b) > width * height * 0.02, `${label}: paints something at t=2.4`);
        assert.ok(finiteColors(b), `${label}: colors are valid packed ints`);
        assert.ok(differs(a, b), `${label}: frames change over time`);
      }
    }
  });
}

test('scenes are deterministic for a given seed', async () => {
  for (const id of IDS) {
    const scene = await findScene(id);
    const a = renderScene(scene, { width: 40, height: 12, t: 1, fps: 15, seed: 3 });
    const b = renderScene(scene, { width: 40, height: 12, t: 1, fps: 15, seed: 3 });
    assert.equal(differs(a, b), false, `${id} deterministic`);
  }
});

test('scenes draw through the Surface API into an offset View', async () => {
  const { CellBuffer } = await import('../src/buffer.js');
  const { createContext } = await import('../src/context.js');
  for (const id of IDS) {
    const scene = await findScene(id);
    const root = new CellBuffer(60, 20);
    const view = root.view(10, 4, 30, 10);
    const ctx = createContext({ scene, buffer: view, caps: { unicode: true, sextant: true, depth: 'truecolor' } });
    const frame = scene.setup(ctx);
    for (let n = 0; n < 8; n++) { view.clear(ctx.bg); frame(n / 15, 1 / 15, n); }
    // Nothing outside the view may be touched.
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 60; x++) {
        if (x >= 10 && x < 40 && y >= 4 && y < 14) continue;
        const c = root.get(x, y);
        assert.ok(c.ch === ' ' && c.bg === -1 && c.fg === -1, `${id} wrote outside its view at ${x},${y}`);
      }
  }
});
