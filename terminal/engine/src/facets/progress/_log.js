// Scrolling-log presentation for tool-output facets (apt, cargo, docker, git…).
//
// A facet builds a script of timed lines for one loop; at time t we show the
// lines that have "printed" so far, scrolled so the newest sit above any pinned
// live rows — the way a real terminal looks while the tool runs.

import { stringWidth, truncate } from '../../width.js';

/**
 * Draw segmented text: segs = [[text, color, attr?], …]. Clips at `w` columns.
 * Returns the column after the last character drawn.
 */
export function segs(b, x, y, w, parts, ell = '…') {
  let cx = x;
  const end = x + w;
  for (const [text, color, attr] of parts) {
    if (cx >= end) break;
    const room = end - cx;
    const s = stringWidth(text) > room ? truncate(text, room, ell) : text;
    cx = b.text(cx, y, s, color, undefined, attr || 0);
  }
  return cx;
}

/**
 * Lines whose time has come, newest last, limited to `rows`.
 * @param {Array<{at:number, parts:Array}>} script  sorted by `at`
 */
export function visible(script, local, rows) {
  const out = [];
  for (const line of script) { if (line.at <= local) out.push(line); else break; }
  return rows > 0 ? out.slice(-rows) : [];
}

/**
 * Hard-wrap rows of segments at `w` columns, the way a terminal wraps a line
 * that is longer than the screen. Used only for genuine tool output that would
 * really wrap (wget's read-error line), never for our own layout.
 */
export function wrapRows(rows, w) {
  const out = [];
  for (const row of rows) {
    if (row.noWrap) { out.push(row); continue; }      // live progress lines redraw in place, they never wrap
    let cur = [], used = 0;
    for (const [text, color, attr] of row) {
      let chunk = '';
      for (const ch of text) {
        const cw = stringWidth(ch);
        if (used + cw > w) { if (chunk) cur.push([chunk, color, attr]); out.push(cur); cur = []; chunk = ''; used = 0; }
        chunk += ch; used += cw;
      }
      if (chunk) cur.push([chunk, color, attr]);
    }
    out.push(cur);
  }
  return out;
}
