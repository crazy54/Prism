// D3's span kit — shared by the span-* facets in this folder.
//
// Two hardware facts shape every span here:
//   1. Slices are culled per key (API 1.2): a key's SVG holds only the elements that
//      touch it. So spans draw PER CELL (one element per key, or geometry clipped to
//      each key) and keep ids stable, which makes a key that didn't change byte-identical
//      — the runtimes then skip it.
//   2. The device budget (authoring §9): ~30 key images/s per device. `frameClock()`
//      quantizes time to the rate the budget allows for the number of keys a span
//      changes per frame, so runtimes that dedupe identical frames stay within it on
//      every geometry; the `budget` param lets fast paths (hidraw) raise it.

import { keyInto, compose, n } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';

/** The device budget param every D3 span carries. */
export const BUDGET = { type: 'number', default: 30, min: 10, max: 240, step: 5, label: 'Device budget (key images/s)' };

/**
 * The span's own frame clock: rate = min(fps, budget / keys changed per frame).
 * → { t (quantized seconds), rate, dt, frame }
 */
export function frameClock(ctx, { fps = 10, changing = ctx.grid.cells.length, still = 2 } = {}) {
  const budget = typeof ctx.params.budget === 'number' ? ctx.params.budget : 30;
  const rate = Math.max(0.5, Math.min(fps, budget / Math.max(1, changing)));
  if (ctx.reduced) return { t: still, rate, dt: 1 / rate, frame: Math.round(still * rate) };
  const frame = Math.floor(ctx.t * rate + 1e-6);
  return { t: frame / rate, rate, dt: 1 / rate, frame };
}

/**
 * Each key's own material from the theme, frozen in time so it never costs a key
 * update (static between interactions). opts: { tone, toneOf(cell) }
 */
export function materials(k, { tone = 'idle', toneOf } = {}) {
  const frozen = { ctx: { ...k.ctx, t: 0, since: 60, pressed: false, pressAge: Infinity, reduced: true }, def: (...m) => k.def(...m), add: (...m) => k.add(...m), id: (nm) => k.id(nm) };
  for (const c of k.ctx.grid.cells) keyInto(frozen, c, (kk) => kk.background({ tone: toneOf ? toneOf(c) : tone }), { tag: `m${c.i}`, clip: false });
}

/** Draw a live sub-key into one cell (text roles, glyphs) with the theme's metrics. */
export const inCell = (k, cell, draw, tag = `c${cell.i}`) => keyInto(k, cell, draw, { tag, clip: false });

/** Draw a panel-kind sub-surface into a rect (strip-like art). */
export const inPanel = (k, rect, draw, tag) => compose(k, rect, draw, { kind: 'span', tag, clip: false });

/** The cell containing (x, y), or null when the point is behind a bezel. */
export function cellAt(grid, x, y) {
  for (const c of grid.cells) if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c;
  return null;
}

/** Split a polyline into runs that lie inside a rect (grown by m): [[x, y]…][]. Dense input → tight runs. */
export function runsInRect(pts, r, m = 0) {
  const inside = ([x, y]) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;
  const runs = [];
  let cur = null;
  for (let i = 0; i < pts.length; i++) {
    if (inside(pts[i])) {
      if (!cur) { cur = []; if (i > 0) cur.push(pts[i - 1]); runs.push(cur); }
      cur.push(pts[i]);
    } else if (cur) { cur.push(pts[i]); cur = null; }
  }
  return runs;
}

/** Path data for runs of points. */
export const runsPath = (runs) => runs.map((r) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('')).join('');

/** Points of a circle (dense enough for keys up to 160 px). */
export function circlePoints(cx, cy, r, step = 6) {
  const N = Math.max(24, Math.min(360, Math.ceil((2 * Math.PI * r) / step)));
  const pts = [];
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/** Clip a vertical segment x, [y0, y1] to a cell: → [ya, yb] or null. */
export function vClip(cell, x, y0, y1) {
  if (x < cell.x || x > cell.x + cell.w) return null;
  const a = Math.max(cell.y, Math.min(y0, y1)), b = Math.min(cell.y + cell.h, Math.max(y0, y1));
  return b > a ? [a, b] : null;
}

/** The middle row of a grid (where a one-row composition sits on a taller span). */
export const middleRow = (grid) => grid.row + Math.floor((grid.rows - 1) / 2);

/** Cells of one row, left → right. */
export const rowCells = (grid, row) => grid.cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col);

/** A hue across the Spectrum for a 0–1 position (warm → violet, Refraction order). */
export const spectrumHue = (f) => 24 + 276 * clamp(f);

/** Snap to half device pixels (crisp edges, fewer distinct frames). */
export const half = (v) => Math.round(v * 2) / 2;
