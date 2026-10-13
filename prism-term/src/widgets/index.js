// Widgets — pure drawing functions over any Surface (CellBuffer or View).
// Each takes (surface, x, y, …, opts) and colors itself from opts.theme
// (a theme id or a resolved theme; default: Prism's default theme).

export { box, rule, BORDERS } from './box.js';
export { progressBar, sparkline, barChart, meter } from './bars.js';
export { lineChart, heatmap } from './chart.js';
export { gauge } from './gauge.js';
export { table, logView } from './table.js';
export { badge, statusDot, kpi } from './badges.js';
export { fmt, fmtDuration, LEFT_EIGHTHS, LOWER_EIGHTHS } from './util.js';
