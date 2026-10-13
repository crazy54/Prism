// Orthogonal line routing for box-drawing diagrams.
//
// Segments are accumulated as N/E/S/W direction bits per cell, then painted
// with the box-drawing glyph that joins exactly those directions (─ │ ┌ ┬ ┼ …),
// so crossing and branching edges merge into proper junctions instead of
// overwriting each other. ASCII mode paints - | + instead.

import { uni, panel, center, stringWidth } from '../callouts/_kit.js';

const N = 1, E = 2, S = 4, W = 8;
const LIGHT = {
  [N]: '│', [S]: '│', [N | S]: '│', [E]: '─', [W]: '─', [E | W]: '─',
  [E | S]: '┌', [W | S]: '┐', [N | E]: '└', [N | W]: '┘',
  [N | E | S]: '├', [N | W | S]: '┤', [E | W | S]: '┬', [N | E | W]: '┴', [N | E | S | W]: '┼',
};
const ROUND = { ...LIGHT, [E | S]: '╭', [W | S]: '╮', [N | E]: '╰', [N | W]: '╯' };
const HEAVY = {
  [N]: '┃', [S]: '┃', [N | S]: '┃', [E]: '━', [W]: '━', [E | W]: '━',
  [E | S]: '┏', [W | S]: '┓', [N | E]: '┗', [N | W]: '┛',
  [N | E | S]: '┣', [N | W | S]: '┫', [E | W | S]: '┳', [N | E | W]: '┻', [N | E | S | W]: '╋',
};
const ASCII = (m) => ((m & (N | S)) && (m & (E | W)) ? '+' : m & (N | S) ? '|' : '-');

export const DIR = Object.freeze({ N, E, S, W });

/**
 * Join a line into a box border: 'top' → ┴, 'bottom' → ┬, 'left' → ┤, 'right' → ├
 * (heavy/double borders get their own tees; ASCII gets +).
 */
export function tap(ctx, s, x, y, side, color, style = 'light') {
  const u = uni(ctx);
  const T = style === 'double'
    ? { top: '╧', bottom: '╤', left: '╢', right: '╟' }
    : style === 'heavy' ? { top: '┷', bottom: '┯', left: '┨', right: '┠' } : { top: '┴', bottom: '┬', left: '┤', right: '├' };
  s.set(x, y, u ? T[side] : '+', color ?? ctx.theme.line);
}

export const ARROWS = { E: ['▶', '>'], W: ['◀', '<'], S: ['▼', 'v'], N: ['▲', '^'] };

export class LineGrid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    this.color = new Int32Array(w * h).fill(-1);
    this.weight = new Uint8Array(w * h);
    this.heads = [];
  }

  _add(x, y, bits, c, heavy) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.mask[i] |= bits;
    if (c !== undefined) this.color[i] = c;
    if (heavy) this.weight[i] = 1;
  }

  /** OR raw direction bits (DIR.N | DIR.S …) into a cell, e.g. to stub a line into a box border. */
  bits(x, y, dirs, c) { this._add(x, y, dirs, c); }

  /** Horizontal run on row y from x0 to x1 (inclusive). */
  hline(x0, x1, y, c, heavy) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this._add(x, y, (x > x0 ? W : 0) | (x < x1 ? E : 0) || E | W, c, heavy);
  }

  /** Vertical run in column x from y0 to y1 (inclusive). */
  vline(x, y0, y1, c, heavy) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this._add(x, y, (y > y0 ? N : 0) | (y < y1 ? S : 0) || N | S, c, heavy);
  }

  /**
   * Elbow route from (x0,y0) to (x1,y1): horizontal first then vertical
   * ('hv'), vertical first ('vh'), or vertical-horizontal-vertical through
   * row `midY` ('vhv', the org-chart / tree shape).
   */
  route(x0, y0, x1, y1, { c, heavy, shape = 'hv', midY, arrow } = {}) {
    if (shape === 'vhv') {
      const my = midY ?? Math.round((y0 + y1) / 2);
      this.vline(x0, y0, my, c, heavy); this.hline(x0, x1, my, c, heavy); this.vline(x1, my, y1, c, heavy);
    } else if (shape === 'vh') {
      this.vline(x0, y0, y1, c, heavy); this.hline(x0, x1, y1, c, heavy);
    } else {
      this.hline(x0, x1, y0, c, heavy); this.vline(x1, y0, y1, c, heavy);
    }
    if (arrow) {
      const dir = shape === 'hv' ? (y1 !== y0 ? (y1 > y0 ? 'S' : 'N') : x1 >= x0 ? 'E' : 'W')
        : shape === 'vh' ? (x1 !== x0 ? (x1 > x0 ? 'E' : 'W') : y1 >= y0 ? 'S' : 'N')
          : (y1 >= (midY ?? y1) ? 'S' : 'N');
      this.heads.push({ x: x1, y: y1, dir, c });
    }
  }

  /** Axis-aligned polyline through corner points [[x, y], ...]; optional arrowhead at the end. */
  path(corners, { c, heavy, arrow } = {}) {
    for (let k = 1; k < corners.length; k++) {
      const [ax, ay] = corners[k - 1], [bx, by] = corners[k];
      if (ay === by) this.hline(ax, bx, ay, c, heavy);
      else this.vline(ax, ay, by, c, heavy);
    }
    if (arrow && corners.length > 1) {
      const [ax, ay] = corners[corners.length - 2], [bx, by] = corners[corners.length - 1];
      const dir = ay === by ? (bx >= ax ? 'E' : 'W') : by >= ay ? 'S' : 'N';
      this.heads.push({ x: bx, y: by, dir, c });
    }
  }

  /** Paint into a surface at offset (ox, oy). style: 'light' | 'round' | 'heavy'. */
  paint(ctx, s, ox = 0, oy = 0, { style = 'round', fallback } = {}) {
    const u = uni(ctx);
    const table = style === 'heavy' ? HEAVY : style === 'light' ? LIGHT : ROUND;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = y * this.w + x, m = this.mask[i];
      if (!m) continue;
      const ch = u ? (this.weight[i] ? HEAVY[m] : table[m]) || '┼' : ASCII(m);
      s.set(ox + x, oy + y, ch, this.color[i] >= 0 ? this.color[i] : fallback ?? ctx.theme.line);
    }
    for (const h of this.heads) s.set(ox + h.x, oy + h.y, ARROWS[h.dir][u ? 0 : 1], h.c ?? fallback ?? ctx.theme.line);
  }
}

/** Points along a polyline route (for packets traveling an edge). */
export function routePoints(x0, y0, x1, y1, shape = 'hv', midY) {
  const pts = [];
  const seg = (ax, ay, bx, by) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = pts.length ? 1 : 0; k <= n; k++) pts.push([Math.round(ax + ((bx - ax) * k) / (n || 1)), Math.round(ay + ((by - ay) * k) / (n || 1))]);
  };
  if (shape === 'vhv') { const my = midY ?? Math.round((y0 + y1) / 2); seg(x0, y0, x0, my); seg(x0, my, x1, my); seg(x1, my, x1, y1); }
  else if (shape === 'vh') { seg(x0, y0, x0, y1); seg(x0, y1, x1, y1); }
  else { seg(x0, y0, x1, y0); seg(x1, y0, x1, y1); }
  return pts;
}

/**
 * A labeled diagram node: a 3-row box with the label centered. Returns its
 * geometry, with anchor points just outside each side for routing edges.
 */
export function nodeBox(ctx, s, x, y, label, { w, color, fg, bg, style = 'round', attr = 0 } = {}) {
  const ww = w ?? stringWidth(label) + 4;
  const th = ctx.theme;
  const inner = panel(ctx, s, x, y, ww, 3, { style, color: color ?? th.line, bg });
  center(inner, 0, 0, inner.width, label, fg ?? th.ink, bg, attr, ctx);
  return box(x, y, ww, 3);
}

/** Geometry for a box at (x, y, w, h): center and the cells just outside each side. */
export function box(x, y, w, h) {
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  return { x, y, w, h, cx, cy, left: [x - 1, cy], right: [x + w, cy], top: [cx, y - 1], bottom: [cx, y + h] };
}

/** Point a fraction `f` (0..1) along a polyline given as [[x, y], ...] cell points. */
export function along(pts, f) {
  if (!pts.length) return null;
  const i = Math.max(0, Math.min(pts.length - 1, Math.floor(f * pts.length)));
  return pts[i];
}

/** Cell points along an axis-aligned polyline through the given corner points. */
export function polyline(corners) {
  const pts = [];
  for (let k = 1; k < corners.length; k++) {
    const [ax, ay] = corners[k - 1], [bx, by] = corners[k];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let j = pts.length ? 1 : 0; j <= n; j++) pts.push([Math.round(ax + ((bx - ax) * j) / (n || 1)), Math.round(ay + ((by - ay) * j) / (n || 1))]);
  }
  return pts;
}
