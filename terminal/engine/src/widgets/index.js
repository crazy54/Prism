// Widgets — pure drawing functions over any Surface (CellBuffer or View).
// Each takes (surface, x, y, …, opts) and colors itself from opts.theme
// (a theme id or a resolved theme; default: Prism's default theme).

export { box, rule, BORDERS } from './box.js?v=b7d3401196';
export { progressBar, sparkline, barChart, meter } from './bars.js?v=b7d3401196';
export { lineChart, heatmap } from './chart.js?v=b7d3401196';
export { gauge } from './gauge.js?v=b7d3401196';
export { table, logView } from './table.js?v=b7d3401196';
export { badge, statusDot, kpi } from './badges.js?v=b7d3401196';
export { fmt, fmtDuration, LEFT_EIGHTHS, LOWER_EIGHTHS } from './util.js?v=b7d3401196';
