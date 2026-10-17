// format — format the document: ragged lines of text snap to a clean left edge, a sparkle marks the
// tidy-up. Arriving, the lines slide into alignment and the sparkle blooms; a press re-runs it.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp, outBack } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const LINES = [[16, 21, 3], [23, 31, -2], [30, 27, 4], [37, 20, -3]];   // [y, length, ragged offset]
const SPARK = 'M35 7.5C35.6 11.4 36.6 12.4 40.5 13C36.6 13.6 35.6 14.6 35 18.5C34.4 14.6 33.4 13.6 29.5 13C33.4 12.4 34.4 11.4 35 7.5Z';

export default defineGlyph({
  id: 'format',
  title: 'Format',
  category: 'productivity',
  tags: ['format', 'format document', 'prettify', 'beautify', 'tidy', 'align', 'code style'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.5);
    const rag = 1 - k + p;
    for (const [y, len, off] of LINES) g.line(8.5 + off * rag, y, 8.5 + off * rag + len, y, { role: y === 16 ? 'line' : 'dim' });
    const b = s.pressed ? 0.6 : outBack(clamp((s.since - 0.15) / 0.4), 2);
    g.group({ scale: Math.max(0.01, lerp(0.4, 1, b)), origin: [35, 13] }, () => g.path(SPARK, { role: 'accent', fill: true }));
  },
});
