// Offscreen rendering — run a scene without a terminal. Used by snapshots,
// HTML export, tests, and anyone who wants frames as data.

import { CellBuffer } from './buffer.js';
import { createContext } from './context.js';
import { withOverrides } from './caps.js';

const DEFAULT_CAPS = { isTTY: false, depth: 'truecolor', unicode: true, braille: true, sextant: true, width: 80, height: 24 };

/**
 * Render `scene` to a CellBuffer at time `t` (seconds), stepping from 0 at
 * `fps` so stateful scenes (fire, particles, life) evolve exactly as they would live.
 * @param {object} scene  a scene object (see src/context.js)
 * @param {object} o      { width, height, t, fps, theme, mode, caps, params, seed, transparent }
 */
export function renderScene(scene, o = {}) {
  const { width = 80, height = 24, t = 2, fps = 30, theme, mode = null, params = {}, seed = 7, transparent = false } = o;
  const caps = withOverrides({ ...DEFAULT_CAPS, ...(o.caps || {}) }, {});
  const buffer = new CellBuffer(width, height);
  const ctx = createContext({ scene, buffer, caps, theme, mode, params, seed, transparent });
  const frame = scene.setup(ctx);
  const steps = Math.max(1, Math.round(t * fps));
  for (let n = 0; n <= steps; n++) {
    buffer.clear(ctx.bg);
    frame((n / steps) * t, 1 / fps, n);
  }
  buffer.theme = ctx.theme;
  return buffer;
}

/** Render a sequence of frames (array of CellBuffer clones) — for recordings. */
export function renderFrames(scene, o = {}) {
  const { width = 80, height = 24, frames = 60, fps = 30, start = 0, theme, mode = null, params = {}, seed = 7, transparent = false } = o;
  const caps = withOverrides({ ...DEFAULT_CAPS, ...(o.caps || {}) }, {});
  const buffer = new CellBuffer(width, height);
  const ctx = createContext({ scene, buffer, caps, theme, mode, params, seed, transparent });
  const frame = scene.setup(ctx);
  const out = [];
  const warm = Math.round(start * fps);
  for (let n = 0; n < warm + frames; n++) {
    buffer.clear(ctx.bg);
    frame(n / fps, 1 / fps, n);
    if (n >= warm) out.push(buffer.clone());
  }
  return out;
}
