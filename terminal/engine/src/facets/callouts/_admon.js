// Text wrapping + the kit, re-exported for prose-heavy callouts.
export * from './_kit.js';
import { stringWidth } from './_kit.js';

/** Greedy word wrap to `w` columns; hard-splits words longer than a line. */
export function wrapText(text, w) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    let wd = word;
    while (stringWidth(wd) > w) { if (line) { out.push(line); line = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
    if (!line) line = wd;
    else if (stringWidth(line) + 1 + stringWidth(wd) <= w) line += ' ' + wd;
    else { out.push(line); line = wd; }
  }
  if (line) out.push(line);
  return out;
}
