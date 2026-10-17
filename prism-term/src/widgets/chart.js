// Line charts (braille, 2×4 dots per cell) and half-block heatmaps.

import { NONE, mix } from '../color.js';
import { CellBuffer } from '../buffer.js';
import { Canvas } from '../canvas.js';
import { stringWidth, truncate } from '../width.js';
import { themeOf, col, grad, fmt, clamp01, extent, seriesColors, bayer } from './util.js';

function normalizeSeries(series, theme, colors) {
  if (!Array.isArray(series) || !series.length) return [];
  const list = typeof series[0] === 'number' || series[0] === null ? [series] : series;
  const cycle = (colors || seriesColors(theme)).map((c) => col(c, theme, theme.accent));
  return list.map((s, i) => {
    const o = Array.isArray(s) ? { data: s } : { ...s };
    o.data = o.data || [];
    o.color = col(o.color, theme, cycle[i % cycle.length]);
    return o;
  });
}

const isBraille = (ch) => {
  if (!ch) return 0;
  const c = ch.charCodeAt(0);
  return c > 0x2800 && c <= 0x28ff ? c - 0x2800 : 0;
};

/**
 * Multi-series line chart on a braille canvas, with y-axis ticks, optional
 * x labels, legend, grid, and a dithered gradient area fill under each line.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Array<number>|Array<Array<number>|{data:number[], color?:*, label?:string}>} series
 * @param {object} [opts]
 * @param {number} [opts.min] @param {number} [opts.max]
 * @param {Array} [opts.colors]    series color cycle
 * @param {boolean} [opts.axis=true]
 * @param {string[]} [opts.labels] x-axis labels, spread evenly (e.g. ['-5m', 'now'])
 * @param {boolean} [opts.fill=false] area fill under lines
 * @param {boolean} [opts.grid=false] dotted horizontal grid at y ticks
 * @param {boolean} [opts.legend]  default: when any series has a label
 * @param {number} [opts.ticks=5]  max y tick labels
 * @param {function} [opts.yFormat] tick value → string
 * @returns {{plotX:number, plotY:number, plotW:number, plotH:number, min:number, max:number}|undefined}
 */
export function lineChart(surface, x, y, w, h, series, opts = {}) {
  const theme = themeOf(opts);
  const s = surface.view(x, y, w, h);
  const list = normalizeSeries(series, theme, opts.colors);
  if (!list.length || s.width < 3 || s.height < 1) return undefined;
  let [min, max] = extent(list.flatMap((l) => l.data), opts.min, opts.max);
  if (max === min) { max += Math.abs(max) * 0.1 || 1; min -= opts.min !== undefined ? 0 : Math.abs(min) * 0.1 || 0; }

  const axis = opts.axis !== false;
  const legend = (opts.legend ?? list.some((l) => l.label)) && s.height >= 4;
  const labels = Array.isArray(opts.labels) && opts.labels.length && s.height >= 4 ? opts.labels : null;
  const top = legend ? 1 : 0;
  const axisRow = axis && s.height >= 3 ? 1 : 0;
  const plotH = s.height - top - axisRow - (labels ? 1 : 0);
  if (plotH < 1) return undefined;
  const yFmt = opts.yFormat || ((v) => fmt(v));

  // y ticks: evenly spaced cell rows, labeled with the value at the row's center.
  const nT = Math.max(1, Math.min(opts.ticks ?? 5, plotH > 1 ? Math.ceil(plotH / 2) : 1));
  const tickRows = nT === 1 ? [0] : [...new Set(Array.from({ length: nT }, (_, k) => Math.round((k * (plotH - 1)) / (nT - 1))))];
  const valueAtRow = (r) => (plotH === 1 ? max : max - (r / (plotH - 1)) * (max - min));
  const tickLabels = tickRows.map((r) => yFmt(valueAtRow(r)));
  const lw = axis ? Math.min(Math.max(...tickLabels.map(stringWidth)), Math.floor(s.width / 3)) : 0;
  const px0 = axis ? lw + 1 : 0;
  const plotW = s.width - px0;
  if (plotW < 2) return undefined;

  if (opts.grid) {
    for (const r of tickRows) for (let c = 0; c < plotW; c++) s.set(px0 + c, top + r, '┈', theme.line);
  }
  if (axis) {
    for (let r = 0; r < plotH; r++) s.set(px0 - 1, top + r, tickRows.includes(r) ? '┤' : '│', theme.line);
    tickRows.forEach((r, k) => {
      const t = truncate(tickLabels[k], lw);
      s.text(lw - stringWidth(t), top + r, t, theme.muted);
    });
    if (axisRow) {
      s.set(px0 - 1, top + plotH, '└', theme.line);
      for (let c = 0; c < plotW; c++) s.set(px0 + c, top + plotH, '─', theme.line);
    }
  }

  const lineCv = new Canvas(plotW, plotH, { mode: 'braille', threshold: 0 });
  const fillCv = opts.fill ? new Canvas(plotW, plotH, { mode: 'braille', threshold: 0 }) : null;
  const pw = lineCv.width, ph = lineCv.height;
  const n = Math.max(2, ...list.map((l) => l.data.length));
  const xOf = (i) => (i * (pw - 1)) / (n - 1);
  const yOf = (v) => (1 - clamp01((v - min) / (max - min))) * (ph - 1);

  for (const l of list) {
    const pts = [];
    l.data.forEach((v, i) => { if (Number.isFinite(v)) pts.push([xOf(i), yOf(v)]); else pts.push(null); });
    if (fillCv) {
      // Dimmer than the line so the line still reads on top of its own area.
      const fc = mix(theme.bg, l.color, 0.5);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (!a || !b) continue;
        for (let X = Math.round(a[0]); X <= Math.round(b[0]); X++) {
          const t = b[0] === a[0] ? 0 : (X - a[0]) / (b[0] - a[0]);
          const yl = a[1] + (b[1] - a[1]) * clamp01(t);
          for (let Y = Math.ceil(yl) + 1; Y < ph; Y++) {
            // Dot density fades quadratically from ~50% under the line to sparse at the floor.
            const f = 1 - (Y - yl) / (ph - yl + 1);
            const d = 0.5 * f * f + 0.03;
            if (bayer(X, Y) < d) fillCv.set(X, Y, fc);
          }
        }
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      const q = i > 0 ? pts[i - 1] : null;
      if (q) lineCv.line(q[0], q[1], p[0], p[1], l.color);
      else lineCv.set(p[0], p[1], l.color);
    }
  }

  // Merge at glyph level so lines stay crisp: in cells holding both, the fill's
  // dots are OR-ed into the line glyph and take the line's color.
  const lb = lineCv.paint(new CellBuffer(plotW, plotH));
  const fb = fillCv ? fillCv.paint(new CellBuffer(plotW, plotH)) : null;
  for (let r = 0; r < plotH; r++) {
    for (let c = 0; c < plotW; c++) {
      const i = r * plotW + c;
      const L = isBraille(lb.ch[i]), F = fb ? isBraille(fb.ch[i]) : 0;
      if (L) s.set(px0 + c, top + r, String.fromCharCode(0x2800 + (L | F)), lb.fg[i]);
      else if (F) s.set(px0 + c, top + r, String.fromCharCode(0x2800 + F), fb.fg[i]);
    }
  }

  if (labels) {
    const row = top + plotH + axisRow;
    let lastEnd = -1;
    labels.forEach((lab, k) => {
      const t = String(lab), tw = stringWidth(t);
      const pos = labels.length === 1 ? 0 : Math.round((k * (plotW - 1)) / (labels.length - 1));
      let lx = k === 0 ? 0 : k === labels.length - 1 ? plotW - tw : pos - Math.floor(tw / 2);
      lx = Math.max(0, Math.min(plotW - tw, lx));
      if (lx <= lastEnd) return;
      s.text(px0 + lx, row, t, theme.muted);
      lastEnd = lx + tw;
    });
  }

  if (legend) {
    let lx = px0;
    for (const l of list) {
      if (!l.label) continue;
      if (lx >= s.width) break;
      s.set(lx, 0, '●', l.color);
      lx = s.text(lx + 2, 0, l.label, theme.muted) + 2;
    }
  }
  return { plotX: x + px0, plotY: y + top, plotW, plotH, min, max };
}

/**
 * Heatmap with two data rows per cell (▀ with fg = upper row, bg = lower row).
 * @param {Surface} surface
 * @param {number} x @param {number} y
 * @param {number[][]} matrix  rows of values; null/NaN cells are transparent
 * @param {object} [opts] { palette='theme-heat', min, max, cellWidth=1, width, height (clip, cells) }
 * @returns {{width:number, height:number, min:number, max:number}}
 */
export function heatmap(surface, x, y, matrix, opts = {}) {
  const theme = themeOf(opts);
  const rows = (matrix || []).length;
  const cols = Math.max(0, ...(matrix || []).map((r) => (r ? r.length : 0)));
  const cw = Math.max(1, Math.round(opts.cellWidth || 1));
  const W = Math.min(cols * cw, opts.width ?? Infinity), H = Math.min(Math.ceil(rows / 2), opts.height ?? Infinity);
  const [min, max] = extent((matrix || []).flat(), opts.min, opts.max);
  const g = grad(opts.palette ?? 'theme-heat', theme, theme.accent);
  const colorAt = (r, c) => {
    const v = matrix[r]?.[c];
    if (!Number.isFinite(v)) return NONE;
    return g(max === min ? 0.5 : clamp01((v - min) / (max - min)));
  };
  const s = surface.view(x, y, W, H);
  for (let cr = 0; cr < H; cr++) {
    for (let c = 0; c < cols; c++) {
      const top = colorAt(cr * 2, c), bot = cr * 2 + 1 < rows ? colorAt(cr * 2 + 1, c) : NONE;
      if (top === NONE && bot === NONE) continue;
      for (let k = 0; k < cw; k++) {
        const X = c * cw + k;
        if (top === NONE) s.set(X, cr, '▄', bot);
        else if (bot === NONE) s.set(X, cr, '▀', top);
        else s.set(X, cr, '▀', top, bot);
      }
    }
  }
  return { width: W, height: H, min, max };
}
