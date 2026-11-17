// Shared bits for ops facets that sit under `watch` or in a scrolling shell: the loop phase, the watch
// title row, watch's cut-at-the-edge lines, a tty-style transcript and a coloured bash prompt.
import { ATTR, clock, wrapParts } from './_kit.js';

/** t % loop snapped to whole microseconds, so frame(t) and frame(t + loop) land on the same side of every cue. */
export function phase(t, loop) {
  const T = Math.round((t % loop) * 1e6) / 1e6;
  return T >= loop ? T - loop : T;
}

/** A segment line cut at `width` cells: watch truncates long output lines instead of wrapping them. */
export const cut = (parts, width) => (width > 0 ? wrapParts(parts, width)[0] : []);

/**
 * procps-ng watch's title row: "Every 2.0s: cmd" left, "host: ctime" right. As the terminal narrows the
 * command is cut with "...", then dropped, then the interval; the host and time go last.
 */
export function watchTitle(w, c, y, every, cmd, host, T) {
  const k = clock(T);
  const right = `${host}: ${k.day} ${k.mon} ${k.dd} ${k.hms} ${k.date.slice(0, 4)}`;
  const head = `Every ${every.toFixed(1)}s: `;
  if (w.width < right.length) return;
  w.put(w.width - right.length, y, right, c.fg);
  const room = w.width - right.length - 1;
  if (room < head.length) return;
  const full = head + cmd;
  w.put(0, y, full.length <= room ? full : room >= head.length + 3 ? `${full.slice(0, room - 3)}...` : head, c.fg);
}

/**
 * Draw a shell transcript (segment lines) from row y0: wrapped like a tty and bottom-anchored once it
 * fills the screen. `chop` instead cuts each line at the edge with a muted '>' (pager style).
 */
export function drawTranscript(w, lines, y0 = 0, { chop = false, marker } = {}) {
  const rows = [];
  for (const l of lines) {
    const parts = l.length ? l : [['']];
    if (!chop) { for (const r of wrapParts(parts, w.width)) rows.push(r); continue; }
    const len = parts.reduce((n, p) => n + String(p[0]).length, 0);
    if (len <= w.width) { rows.push(parts); continue; }
    rows.push([...cut(parts, w.width - 1), ['>', marker]]);
  }
  rows.slice(-Math.max(0, w.height - y0)).forEach((parts, i) => w.seg(0, y0 + i, parts));
}

/** `user@host:~$ cmd` as segments, with an optional block cursor after the command. */
export const promptParts = (c, host, cmd, cursor, user = 'ops') => [
  [`${user}@${host}`, c.green, ATTR.BOLD], [':', c.fg], ['~', c.blue, ATTR.BOLD], ['$ ', c.fg], [cmd, c.fg],
  ...(cursor ? [[' ', c.bg, 0, c.fg]] : []),
];
