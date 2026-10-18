// Widgets — pure drawing functions over any Surface (CellBuffer or View).
// Each takes (surface, x, y, …, opts) and colors itself from opts.theme
// (a theme id or a resolved theme; default: Prism's default theme).

export { box, rule, BORDERS } from './box.js?v=a917677388';
export { progressBar, sparkline, barChart, meter } from './bars.js?v=a917677388';
export { lineChart, heatmap } from './chart.js?v=a917677388';
export { gauge } from './gauge.js?v=a917677388';
export { table, logView } from './table.js?v=a917677388';
export { badge, statusDot, kpi } from './badges.js?v=a917677388';
export { fmt, fmtDuration, LEFT_EIGHTHS, LOWER_EIGHTHS } from './util.js?v=a917677388';
