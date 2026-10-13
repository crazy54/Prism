// Boxes / panels with titled borders.

import { NONE } from '../color.js';
import { ATTR } from '../buffer.js';
import { stringWidth, truncate } from '../width.js';
import { themeOf, col } from './util.js';

export const BORDERS = Object.freeze({
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  dashed: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '╌', v: '╎' },
  ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
});

function placeLabel(s, x, y, w, label, how, fg, bg, attr) {
  const avail = w - 4;
  if (avail < 1) return;
  const text = truncate(` ${label} `, avail + 2);
  const tw = stringWidth(text);
  const lx = how === 'center' ? x + Math.floor((w - tw) / 2) : how === 'right' ? x + w - 2 - tw : x + 1;
  s.text(lx, y, text, fg, bg, attr);
}

/**
 * Draw a bordered box and return the View for its interior.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {object} [opts]
 * @param {'round'|'single'|'double'|'heavy'|'ascii'|'dashed'} [opts.style='round']
 * @param {string} [opts.title]        label set into the top border
 * @param {'left'|'center'|'right'} [opts.titleAlign='left']
 * @param {string} [opts.footer]       label set into the bottom border
 * @param {'left'|'center'|'right'} [opts.footerAlign='right']
 * @param {*} [opts.color]             border color (default theme.line)
 * @param {*} [opts.titleColor]        title color (default theme.ink)
 * @param {*} [opts.bg]                background for the whole box
 * @param {boolean} [opts.fill]        fill with theme.panel when no bg given
 * @param {number|number[]} [opts.padding] inner padding: n (horizontal) or [vertical, horizontal]
 * @returns {View} interior view (w-2 × h-2, minus padding)
 */
export function box(surface, x, y, w, h, opts = {}) {
  const theme = themeOf(opts);
  const b = BORDERS[opts.style] || BORDERS.round;
  x = Math.round(x); y = Math.round(y); w = Math.max(0, Math.round(w)); h = Math.max(0, Math.round(h));
  if (w <= 0 || h <= 0) return surface.view(x, y, 0, 0);
  const color = col(opts.color, theme, theme.line);
  const bg = opts.bg !== undefined ? col(opts.bg, theme, NONE) : opts.fill ? theme.panel : undefined;
  if (bg !== undefined) surface.fill(x, y, w, h, ' ', undefined, bg, 0);

  if (h === 1) {
    for (let i = 0; i < w; i++) surface.set(x + i, y, b.h, color, bg);
    if (opts.title) placeLabel(surface, x, y, w, opts.title, opts.titleAlign, col(opts.titleColor, theme, theme.ink), bg, ATTR.BOLD);
    return surface.view(x, y, 0, 0);
  }
  if (w === 1) {
    for (let j = 0; j < h; j++) surface.set(x, y + j, b.v, color, bg);
    return surface.view(x, y, 0, 0);
  }

  surface.set(x, y, b.tl, color, bg);
  surface.set(x + w - 1, y, b.tr, color, bg);
  surface.set(x, y + h - 1, b.bl, color, bg);
  surface.set(x + w - 1, y + h - 1, b.br, color, bg);
  for (let i = 1; i < w - 1; i++) {
    surface.set(x + i, y, b.h, color, bg);
    surface.set(x + i, y + h - 1, b.h, color, bg);
  }
  for (let j = 1; j < h - 1; j++) {
    surface.set(x, y + j, b.v, color, bg);
    surface.set(x + w - 1, y + j, b.v, color, bg);
  }
  if (opts.title) placeLabel(surface, x, y, w, opts.title, opts.titleAlign, col(opts.titleColor, theme, theme.ink), bg, ATTR.BOLD);
  if (opts.footer) placeLabel(surface, x, y + h - 1, w, opts.footer, opts.footerAlign || 'right', col(opts.footerColor, theme, theme.muted), bg, 0);

  const pad = opts.padding;
  const [pv, ph] = Array.isArray(pad) ? pad : [0, pad || 0];
  return surface.view(x + 1 + ph, y + 1 + pv, Math.max(0, w - 2 - 2 * ph), Math.max(0, h - 2 - 2 * pv));
}

/** A horizontal rule with an optional centered/left label: ──── Label ────. */
export function rule(surface, x, y, w, opts = {}) {
  const theme = themeOf(opts);
  const color = col(opts.color, theme, theme.line);
  const ch = opts.char || (opts.style === 'heavy' ? '━' : opts.style === 'double' ? '═' : opts.style === 'ascii' ? '-' : '─');
  for (let i = 0; i < w; i++) surface.set(x + i, y, ch, color);
  if (opts.label) {
    const text = truncate(` ${opts.label} `, Math.max(0, w - 2));
    const tw = stringWidth(text);
    const lx = opts.align === 'left' ? x + 2 : opts.align === 'right' ? x + w - 2 - tw : x + Math.floor((w - tw) / 2);
    surface.text(lx, y, text, col(opts.labelColor, theme, theme.muted));
  }
}
