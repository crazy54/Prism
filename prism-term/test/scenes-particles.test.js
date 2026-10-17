// Particles & Simulations scene pack: every scene renders in every canvas mode
// at normal and tiny sizes, animates, is deterministic per seed, and only
// touches its own window when handed a View.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScene } from '../src/render.js';
import { MODE_NAMES } from '../src/canvas.js';
import { CellBuffer } from '../src/buffer.js';
import { createContext } from '../src/context.js';
import { getTheme } from '../src/palettes.js';

const IDS = ['starfield', 'matrix', 'fireworks', 'life', 'galaxy', 'flowfield', 'rain', 'dna', 'harmonograph', 'boids'];
import { findFacet } from '../src/facets/index.js';
const scenes = IDS.map((id) => findFacet(id));
const BG = getTheme().bg;

const signature = (buf) => buf.ch.join('') + '|' + buf.fg.join(',') + '|' + buf.bg.join(',');
const isBlank = (buf) => buf.ch.every((c) => c === ' ') && buf.bg.every((b) => b === BG);

for (const scene of scenes) {
  test(`${scene.id}: contract fields`, () => {
    for (const k of ['title', 'category', 'description']) assert.equal(typeof scene[k], 'string', k);
    assert.equal(typeof scene.setup, 'function');
  });

  for (const [w, h] of [[80, 24], [37, 11]]) {
    test(`${scene.id}: renders ${w}x${h} in every mode`, () => {
      for (const mode of MODE_NAMES) {
        // fireworks needs a launch to have climbed; give every scene a couple of seconds.
        const buf = renderScene(scene, { width: w, height: h, t: 2.2, fps: 20, mode });
        assert.equal(buf.width, w);
        assert.equal(buf.height, h);
        assert.ok(!isBlank(buf), `${scene.id} blank in ${mode} at ${w}x${h}`);
        for (const ch of buf.ch) assert.equal(typeof ch, 'string');
      }
    });
  }

  test(`${scene.id}: animates and is deterministic per seed`, () => {
    const a = renderScene(scene, { width: 60, height: 20, t: 1.5, fps: 20 });
    const b = renderScene(scene, { width: 60, height: 20, t: 3, fps: 20 });
    const a2 = renderScene(scene, { width: 60, height: 20, t: 1.5, fps: 20 });
    assert.notEqual(signature(a), signature(b), 'frames at different times should differ');
    assert.equal(signature(a), signature(a2), 'same seed and time should reproduce exactly');
  });

  test(`${scene.id}: draws only inside a View`, () => {
    const parent = new CellBuffer(70, 26).clear(0x123456);
    const view = parent.view(9, 5, 40, 14);
    const ctx = createContext({ scene, buffer: view, caps: { unicode: true, sextant: true, depth: 'truecolor' } });
    const frame = scene.setup(ctx);
    for (let n = 0; n < 50; n++) { view.clear(ctx.bg); frame(n / 20, 1 / 20, n); }
    for (let y = 0; y < parent.height; y++)
      for (let x = 0; x < parent.width; x++) {
        if (x >= 9 && x < 49 && y >= 5 && y < 19) continue;
        const c = parent.get(x, y);
        assert.ok(c.ch === ' ' && c.bg === 0x123456, `${scene.id} wrote outside its view at ${x},${y}`);
      }
  });
}
