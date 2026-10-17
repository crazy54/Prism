// Bar-shaped widgets: progress bars, sparklines, bar charts, segmented meters.
// All of them use eighth-block glyphs for 8× sub-cell precision along the bar.

import { NONE } from '../color.js';
import { ATTR } from '../buffer.js';
import { Canvas } from '../canvas.js';
import { stringWidth, truncate } from '../width.js';
import {
  themeOf, col, grad, fmt, clamp01, align, zoneColor, extent,
  LEFT_EIGHTHS, LOWER_EIGHTHS, DEFAULT_ZONES,
} from './util.js';

/**
 * Horizontal progress bar with 1/8-cell precision.
 * Layout: [label ][bar][ 42%]
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w  total width incl. label/percent
 * @param {number} value  0..1
 * @param {object} [opts]
 * @param {*} [opts.gradient]  palette name, stop list, function, or color (default theme accent→info)
 * @param {*} [opts.color]     solid fill color (used when no gradient)
 * @param {*} [opts.track]     track background (default theme.panel2; 'none' for transparent)
 * @param {string} [opts.trackChar] draw the track with this glyph instead of a background
 * @param {string} [opts.label]
 * @param {boolean} [opts.showPercent=false]
 * @param {boolean} [opts.ascii=false] '[####----]' fallback
 * @returns {{barX:number, barWidth:number, filled:number}}
 */
export function progressBar(surface, x, y, w, value, opts = {}) {
  const theme = themeOf(opts);
  const v = clamp01(Number(value) || 0);
  x = Math.round(x); y = Math.round(y); w = Math.max(0, Math.round(w));
  let bx = x;
  if (opts.label) {
    const label = truncate(String(opts.label), Math.max(0, w - 6));
    if (label) bx = surface.text(x, y, label, col(opts.labelColor, theme, theme.ink)) + 1;
  }
  const pct = opts.showPercent ? ` ${String(Math.round(v * 100)).padStart(3)}%` : '';
  const barW = Math.max(0, x + w - bx - stringWidth(pct));
  const g = grad(opts.gradient ?? opts.color ?? [theme.accent, theme.info], theme, theme.accent);
  const colorAt = (i) => g(barW > 1 ? i / (barW - 1) : 1);

  if (opts.ascii) {
    const inner = Math.max(0, barW - 2);
    const n = Math.round(v * inner);
    if (barW >= 2) { surface.set(bx, y, '[', theme.dim); surface.set(bx + barW - 1, y, ']', theme.dim); }
    for (let i = 0; i < inner; i++) surface.set(bx + 1 + i, y, i < n ? '#' : '-', i < n ? colorAt(i) : theme.dim);
    if (pct) surface.text(bx + barW, y, pct, col(opts.percentColor, theme, theme.muted));
    return { barX: bx, barWidth: barW, filled: n };
  }

  const trackChar = opts.trackChar;
  const track = trackChar ? NONE : col(opts.track, theme, theme.panel2);
  const eighths = Math.round(v * barW * 8);
  const full = eighths >> 3, rem = eighths & 7;
  for (let i = 0; i < barW; i++) {
    if (i < full) { const c = colorAt(i); surface.set(bx + i, y, ' ', c, c); }
    else if (i === full && rem) surface.set(bx + i, y, LEFT_EIGHTHS[rem], colorAt(i), track);
    else if (trackChar) surface.set(bx + i, y, trackChar, col(opts.trackColor, theme, theme.line), NONE);
    else surface.set(bx + i, y, ' ', theme.dim, track);
  }
  if (pct) surface.text(bx + barW, y, pct, col(opts.percentColor, theme, theme.muted));
  return { barX: bx, barWidth: barW, filled: full + (rem ? rem / 8 : 0) };
}

/**
 * Inline trend line.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w
 * @param {number[]} data  newest last; only the tail that fits is drawn
 * @param {object} [opts]
 * @param {number} [opts.min] @param {number} [opts.max]
 * @param {*} [opts.color]     solid color (default theme.accent)
 * @param {*} [opts.gradient]  color by value level instead
 * @param {'bars'|'braille'} [opts.style='bars']  bars: ▁▂▃▄▅▆▇█, braille: 2×4 dots/cell line
 * @param {number} [opts.height=1]  rows (bars grow upward with 1/8 precision)
 * @param {'left'|'right'} [opts.align='left']  where a short series sits
 * @returns {{min:number, max:number, drawn:number}}
 */
export function sparkline(surface, x, y, w, data, opts = {}) {
  const theme = themeOf(opts);
  x = Math.round(x); y = Math.round(y); w = Math.max(0, Math.round(w));
  const h = Math.max(1, Math.round(opts.height || 1));
  const braille = opts.style === 'braille';
  const cap = braille ? w * 2 : w;
  const pts = (data || []).slice(-cap);
  const [min, max] = extent(pts, opts.min, opts.max);
  const norm = (v) => (max === min ? 0.5 : clamp01((v - min) / (max - min)));
  const g = opts.gradient !== undefined ? grad(opts.gradient, theme, theme.accent) : null;
  const solid = col(opts.color, theme, theme.accent);
  const colorFor = (lv) => (g ? g(lv) : solid);
  if (!pts.length || !w) return { min, max, drawn: 0 };

  if (braille) {
    const cols = Math.ceil(pts.length / 2);
    const ox = opts.align === 'right' ? x + w - cols : x;
    const cv = new Canvas(cols, h, { mode: 'braille', threshold: 0 });
    const ph = cv.height - 1;
    let prev = null;
    pts.forEach((v, i) => {
      if (!Number.isFinite(v)) { prev = null; return; }
      const lv = norm(v), py = Math.round((1 - lv) * ph);
      if (prev) cv.line(prev[0], prev[1], i, py, colorFor(lv));
      else cv.set(i, py, colorFor(lv));
      prev = [i, py];
    });
    cv.paint(surface, ox, y);
    return { min, max, drawn: pts.length };
  }

  const ox = opts.align === 'right' ? x + w - pts.length : x;
  pts.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const lv = norm(v), c = colorFor(lv);
    // Minimum one eighth so the lowest value still shows as ▁.
    const eighths = Math.max(1, Math.round(lv * (h * 8 - 1)) + 1);
    const full = eighths >> 3, rem = eighths & 7;
    for (let r = 0; r < full && r < h; r++) surface.set(ox + i, y + h - 1 - r, '█', c);
    if (rem && full < h) surface.set(ox + i, y + h - 1 - full, LOWER_EIGHTHS[rem], c);
  });
  return { min, max, drawn: pts.length };
}

/**
 * Bar chart, vertical (default) or horizontal, with 1/8-cell bar precision.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Array<{label?:string, value:number, color?:*}>} items
 * @param {object} [opts]
 * @param {boolean} [opts.horizontal=false]
 * @param {number} [opts.max]      scale max (default: largest value)
 * @param {*} [opts.gradient]      color along the bar's length instead of per item
 * @param {*} [opts.color]         default bar color (theme.accent)
 * @param {boolean} [opts.showValues=true]
 * @param {number} [opts.gap]      cells between bars (vertical: 1 if room, horizontal: 0)
 * @param {number} [opts.barWidth] vertical bar width in cells (default: fill the width)
 * @param {number} [opts.labelWidth] horizontal label column width
 * @param {function} [opts.format] value → string (default compact fmt)
 */
export function barChart(surface, x, y, w, h, items, opts = {}) {
  const theme = themeOf(opts);
  const s = surface.view(x, y, w, h);
  items = (items || []).map((it) => (typeof it === 'number' ? { value: it } : it));
  if (!items.length || s.width < 1 || s.height < 1) return;
  const showValues = opts.showValues !== false;
  const format = opts.format || fmt;
  const max = opts.max ?? (Math.max(0, ...items.map((i) => (Number.isFinite(i.value) ? i.value : 0))) || 1);
  const g = opts.gradient !== undefined ? grad(opts.gradient, theme, theme.accent) : null;
  const base = col(opts.color, theme, theme.accent);
  const itemColor = (it) => col(it.color, theme, base);

  if (opts.horizontal) {
    const gap = opts.gap ?? 0;
    const labels = items.map((i) => String(i.label ?? ''));
    const lw = Math.min(opts.labelWidth ?? Math.max(0, ...labels.map(stringWidth)), Math.floor(s.width * 0.4));
    const vals = items.map((i) => format(i.value));
    const vw = showValues ? Math.max(...vals.map(stringWidth)) + 1 : 0;
    const bx = lw ? lw + 1 : 0;
    const area = Math.max(0, s.width - bx - vw);
    items.forEach((it, k) => {
      const row = k * (1 + gap);
      if (row >= s.height) return;
      if (lw) { const a = align(labels[k], lw, 'right'); s.text(a.offset, row, a.text, theme.muted); }
      const eighths = Math.round(clamp01((it.value || 0) / max) * area * 8);
      const full = eighths >> 3, rem = eighths & 7;
      for (let i = 0; i < full; i++) s.set(bx + i, row, '█', g ? g(area > 1 ? i / (area - 1) : 1) : itemColor(it));
      if (rem) s.set(bx + full, row, LEFT_EIGHTHS[rem], g ? g(area > 1 ? full / (area - 1) : 1) : itemColor(it));
      if (showValues) s.text(bx + full + (rem ? 1 : 0) + 1, row, vals[k], theme.ink);
    });
    return;
  }

  const n = items.length;
  const gap = opts.gap ?? (n * 2 - 1 <= s.width ? 1 : 0);
  const bw = Math.max(1, opts.barWidth ?? Math.floor((s.width - gap * (n - 1)) / n));
  const hasLabels = items.some((i) => i.label);
  const top = showValues ? 1 : 0;
  const plotH = s.height - top - (hasLabels ? 1 : 0);
  if (plotH < 1) return;
  const bottom = top + plotH - 1;
  items.forEach((it, k) => {
    const bx = k * (bw + gap);
    if (bx >= s.width) return;
    const eighths = Math.round(clamp01((it.value || 0) / max) * plotH * 8);
    const full = eighths >> 3, rem = eighths & 7;
    for (let r = 0; r < full; r++) {
      const c = g ? g(plotH > 1 ? r / (plotH - 1) : 1) : itemColor(it);
      for (let i = 0; i < bw; i++) s.set(bx + i, bottom - r, '█', c);
    }
    if (rem) {
      const c = g ? g(plotH > 1 ? full / (plotH - 1) : 1) : itemColor(it);
      for (let i = 0; i < bw; i++) s.set(bx + i, bottom - full, LOWER_EIGHTHS[rem], c);
    }
    if (showValues) {
      const a = align(format(it.value), bw + gap, 'center');
      const vy = Math.max(0, bottom - full - (rem ? 1 : 0));
      s.text(bx + Math.min(a.offset, Math.max(0, bw - a.width)), vy, a.text, theme.ink, undefined, ATTR.BOLD);
    }
    if (hasLabels) {
      const a = align(String(it.label ?? ''), bw, 'center');
      s.text(bx + a.offset, s.height - 1, a.text, theme.muted);
    }
  });
}

/**
 * Segmented LED-style meter: ▰▰▰▰▰▱▱▱ colored by zone.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w
 * @param {number} value 0..1
 * @param {object} [opts] { segments=w, thresholds=[[0.7,'warn'],[0.9,'neg']], color (base, theme.pos), on='▰', off='▱', ascii }
 */
export function meter(surface, x, y, w, value, opts = {}) {
  const theme = themeOf(opts);
  const v = clamp01(Number(value) || 0);
  const n = Math.max(0, Math.min(Math.round(w), opts.segments ?? Math.round(w)));
  const on = opts.on || (opts.ascii ? '#' : '▰'), off = opts.off || (opts.ascii ? '.' : '▱');
  const zones = opts.thresholds || DEFAULT_ZONES;
  const base = col(opts.color, theme, theme.pos);
  const lit = Math.round(v * n);
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 1;
    surface.set(x + i, y, i < lit ? on : off, i < lit ? zoneColor(f, zones, theme, base) : theme.line);
  }
}
