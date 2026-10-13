// Tables and log tails.

import { ATTR } from '../buffer.js';
import { stringWidth, truncate } from '../width.js';
import { themeOf, col, align } from './util.js';

function normalizeColumns(columns, rows) {
  if (!columns) columns = rows.length ? Object.keys(rows[0]) : [];
  return columns.map((c) => (typeof c === 'string' ? { key: c, title: c } : { title: c.key, ...c }));
}

const cellText = (c, row) => {
  const v = row?.[c.key];
  return c.format ? String(c.format(v, row)) : v === undefined || v === null ? '' : String(v);
};

/**
 * Column-aligned table with a header row and optional zebra striping.
 * Column widths: fixed `width` is honored; the rest size to content and shrink
 * (widest first) to fit `w`.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w
 * @param {object[]} rows
 * @param {object} [opts]
 * @param {Array<string|{key:string, title?:string, width?:number, align?:'left'|'right'|'center', color?:*|function(value,row):*, format?:function(value,row):string}>} [opts.columns]
 * @param {boolean} [opts.header=true]
 * @param {*} [opts.headerColor] (theme.muted) @param {*} [opts.headerBg] (theme.panel2)
 * @param {boolean} [opts.zebra=true]  stripe odd rows with theme.panel
 * @param {number} [opts.height]  max lines (incl. header)
 * @param {string} [opts.separator=' ']
 * @returns {number} lines drawn
 */
export function table(surface, x, y, w, rows, opts = {}) {
  const theme = themeOf(opts);
  rows = rows || [];
  const cols = normalizeColumns(opts.columns, rows);
  if (!cols.length || w < 1) return 0;
  const sep = opts.separator ?? ' ';
  const sepW = stringWidth(sep);
  const widths = cols.map((c) => c.width ?? Math.max(stringWidth(String(c.title ?? '')), ...rows.map((r) => stringWidth(cellText(c, r))), 1));
  const budget = w - sepW * (cols.length - 1);
  let total = widths.reduce((a, b) => a + b, 0);
  while (total > budget) {
    let k = -1;
    for (let i = 0; i < cols.length; i++) if (cols[i].width === undefined && widths[i] > 3 && (k < 0 || widths[i] > widths[k])) k = i;
    if (k < 0) break;
    widths[k]--; total--;
  }
  const maxLines = Math.max(0, opts.height ?? Infinity);
  const header = opts.header !== false;
  let line = 0;

  const drawRow = (getText, colorOf, bg, attr) => {
    if (bg !== undefined) surface.fill(x, y + line, w, 1, ' ', undefined, bg, 0);
    let cx = x;
    cols.forEach((c, i) => {
      if (cx >= x + w) return;
      const cwid = Math.min(widths[i], x + w - cx);
      const a = align(getText(c), cwid, c.align || 'left');
      surface.text(cx + a.offset, y + line, a.text, colorOf(c), bg, attr);
      cx += widths[i] + sepW;
      if (i < cols.length - 1 && sep.trim() && cx - sepW < x + w) surface.text(cx - sepW, y + line, sep, theme.line, bg);
    });
    line++;
  };

  if (header && line < maxLines) {
    const hb = col(opts.headerBg, theme, theme.panel2);
    drawRow((c) => String(c.title ?? c.key), () => col(opts.headerColor, theme, theme.muted), hb, ATTR.BOLD);
  }
  for (let r = 0; r < rows.length && line < maxLines; r++) {
    const row = rows[r];
    const bg = opts.zebra !== false && r % 2 === 1 ? theme.panel : undefined;
    drawRow(
      (c) => cellText(c, row),
      (c) => (typeof c.color === 'function' ? col(c.color(row?.[c.key], row), theme, theme.ink) : col(c.color, theme, theme.ink)),
      bg,
      0,
    );
  }
  return line;
}

const LEVELS = {
  trace: { tag: 'TRACE', color: 'dim' },
  debug: { tag: 'DEBUG', color: 'dim' },
  info: { tag: 'INFO', color: 'info' },
  notice: { tag: 'NOTE', color: 'info' },
  warn: { tag: 'WARN', color: 'warn' },
  warning: { tag: 'WARN', color: 'warn' },
  error: { tag: 'ERROR', color: 'neg' },
  err: { tag: 'ERROR', color: 'neg' },
  crit: { tag: 'CRIT', color: 'crit', attr: ATTR.BOLD },
  critical: { tag: 'CRIT', color: 'crit', attr: ATTR.BOLD },
  fatal: { tag: 'FATAL', color: 'crit', attr: ATTR.BOLD },
};

function fmtTime(t) {
  if (t === undefined || t === null || t === '') return '';
  if (typeof t === 'string') return t;
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  return d.toTimeString().slice(0, 8);
}

/**
 * Severity-colored log tail: the last `h` lines, newest at the bottom.
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Array<string|{time?:Date|number|string, level?:string, msg:string, source?:string}>} lines
 * @param {object} [opts] { showTime=true, align='top'|'bottom', theme }
 */
export function logView(surface, x, y, w, h, lines, opts = {}) {
  const theme = themeOf(opts);
  const s = surface.view(x, y, w, h);
  const tail = (lines || []).slice(-Math.max(0, s.height));
  const offset = opts.align === 'bottom' ? s.height - tail.length : 0;
  tail.forEach((raw, i) => {
    const l = typeof raw === 'string' ? { msg: raw } : raw || {};
    const row = offset + i;
    let cx = 0;
    if (opts.showTime !== false && l.time !== undefined) cx = s.text(cx, row, fmtTime(l.time), theme.dim) + 1;
    const lv = l.level ? LEVELS[String(l.level).toLowerCase()] || { tag: String(l.level).toUpperCase().slice(0, 5), color: 'muted' } : null;
    if (lv) {
      const c = col(lv.color, theme, theme.muted);
      s.text(cx, row, lv.tag.padEnd(5), c, undefined, lv.attr || 0);
      cx += 6;
    }
    if (l.source) cx = s.text(cx, row, truncate(`${l.source}`, Math.max(0, s.width - cx)), theme.muted) + 1;
    const msgColor = lv && (lv.color === 'neg' || lv.color === 'crit') ? col(lv.color, theme, theme.ink) : theme.ink;
    s.text(cx, row, truncate(String(l.msg ?? ''), Math.max(0, s.width - cx)), msgColor);
  });
}
