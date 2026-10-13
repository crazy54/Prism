// Small status widgets: badges, status dots, KPI tiles.

import { ATTR } from '../buffer.js';
import { mix } from '../color.js';
import { stringWidth, truncate } from '../width.js';
import { themeOf, col, contrast, tint, fmt } from './util.js';
import { box } from './box.js';
import { sparkline } from './bars.js';

/**
 * Inline label chip.
 * @param {Surface} surface
 * @param {number} x @param {number} y
 * @param {string} text
 * @param {object} [opts]
 * @param {*} [opts.color='accent']
 * @param {*} [opts.fg]  text color (default: readable contrast / the color itself)
 * @param {'pill'|'solid'|'soft'|'outline'} [opts.style='pill']  pill uses ▐ ▌ half-block caps
 * @returns {number} width drawn
 */
export function badge(surface, x, y, text, opts = {}) {
  const theme = themeOf(opts);
  const c = col(opts.color, theme, theme.accent);
  const t = String(text);
  const style = opts.style || 'pill';
  if (style === 'outline') {
    const end = surface.text(x, y, `[${t}]`, c, undefined, ATTR.BOLD);
    return end - x;
  }
  if (style === 'soft') {
    const end = surface.text(x, y, ` ${t} `, col(opts.fg, theme, c), tint(c, theme, 0.25), ATTR.BOLD);
    return end - x;
  }
  const fg = col(opts.fg, theme, contrast(c));
  if (style === 'solid') return surface.text(x, y, ` ${t} `, fg, c, ATTR.BOLD) - x;
  surface.set(x, y, '▐', c);
  const end = surface.text(x + 1, y, t, fg, c, ATTR.BOLD);
  surface.set(end, y, '▌', c);
  return end + 1 - x;
}

const STATUS = {
  ok: 'pos', up: 'pos', healthy: 'pos', pass: 'pos', passed: 'pos', success: 'pos', online: 'pos',
  warn: 'warn', warning: 'warn', degraded: 'warn', slow: 'warn',
  error: 'neg', err: 'neg', down: 'neg', fail: 'neg', failed: 'neg', offline: 'neg',
  crit: 'crit', critical: 'crit', fatal: 'crit',
  info: 'info', pending: 'info', running: 'info', busy: 'info',
  off: 'dim', idle: 'dim', unknown: 'dim', disabled: 'dim',
};
const PULSING = new Set(['neg', 'crit', 'info']);

/**
 * ● status indicator with optional label; pulses for error/crit/running when `t` is given.
 * @param {Surface} surface
 * @param {number} x @param {number} y
 * @param {string} status  ok|warn|error|crit|info|off (+ synonyms: up, down, degraded, running…)
 * @param {object} [opts] { label, t (seconds, enables pulse), pulse=true, theme }
 * @returns {number} width drawn
 */
export function statusDot(surface, x, y, status, opts = {}) {
  const theme = themeOf(opts);
  const key = STATUS[String(status).toLowerCase()] || 'dim';
  let c = theme[key];
  if (opts.t !== undefined && opts.pulse !== false && PULSING.has(key)) {
    const k = 0.5 + 0.5 * Math.sin(opts.t * Math.PI * 2 * 1.1);
    c = mix(mix(theme.bg, c, 0.35), c, k);
  }
  surface.set(x, y, '●', c);
  if (!opts.label) return 1;
  return surface.text(x + 2, y, String(opts.label), col(opts.labelColor, theme, theme.ink)) - x;
}

/**
 * KPI tile: label, big value + unit, delta arrow, and a trend sparkline.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {object} o
 * @param {string} o.label
 * @param {number|string} o.value
 * @param {string} [o.unit]
 * @param {number|string} [o.delta]   number = percent change (▲ 4.2%), string shown verbatim
 * @param {'up'|'down'} [o.goodWhen='up']  which direction is good (colors the delta)
 * @param {number[]} [o.trend]
 * @param {*} [o.color]               value/trend color (default theme.accent)
 * @param {boolean} [o.box=true]
 * @param {'braille'|'bars'} [o.style='braille']
 */
export function kpi(surface, x, y, w, h, o = {}) {
  const theme = themeOf(o);
  const accent = col(o.color, theme, theme.accent);
  let s;
  let row = 0;
  if (o.box !== false && w >= 6 && h >= 3) {
    s = box(surface, x, y, w, h, { title: o.label, theme, color: o.borderColor, bg: o.bg, padding: 1 });
  } else {
    s = surface.view(x, y, w, h);
    if (o.label) { s.text(0, 0, truncate(String(o.label), s.width), theme.muted); row = 1; }
  }
  if (s.width < 1 || s.height <= row) return;

  const value = typeof o.value === 'number' ? fmt(o.value) : String(o.value ?? '–');
  let cx = s.text(0, row, truncate(value, s.width), theme.ink, undefined, ATTR.BOLD);
  if (o.unit && cx + 1 < s.width) cx = s.text(cx + 1, row, truncate(String(o.unit), s.width - cx - 1), theme.muted);
  if (o.delta !== undefined && o.delta !== null) {
    const num = typeof o.delta === 'number';
    const up = num ? o.delta >= 0 : !String(o.delta).trim().startsWith('-');
    const good = (o.goodWhen || 'up') === 'up' ? up : !up;
    const txt = num ? `${up ? '▲' : '▼'} ${fmt(Math.abs(o.delta))}%` : String(o.delta);
    const dw = stringWidth(txt);
    const dx = Math.max(cx + 2, s.width - dw);
    if (dx + dw <= s.width) s.text(dx, row, txt, good ? theme.pos : theme.neg);
  }
  const trendH = s.height - row - 1;
  if (o.trend && o.trend.length && trendH >= 1) {
    sparkline(s, 0, row + 1, s.width, o.trend, { theme, color: accent, style: o.style || 'braille', height: trendH, align: 'right' });
  }
}
