// Gauges: a braille arc (180°) or ring (270°) with colored zones, a needle
// tick, and the value centered inside.

import { ATTR } from '../buffer.js';
import { Canvas } from '../canvas.js';
import { stringWidth, truncate } from '../width.js';
import { themeOf, col, clamp01, zoneColor, DEFAULT_ZONES } from './util.js';

/**
 * @param {Surface} surface
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} value  0..1
 * @param {object} [opts]
 * @param {string} [opts.label]      caption under the gauge
 * @param {Array} [opts.thresholds]  [[fraction, color], …] zones (default [[0.7,'warn'],[0.9,'neg']])
 * @param {*} [opts.color]           base zone color (default theme.pos)
 * @param {'arc'|'ring'} [opts.style='arc']
 * @param {string} [opts.valueText]  override the centered text (default '73%')
 * @param {boolean} [opts.needle=true]
 */
export function gauge(surface, x, y, w, h, value, opts = {}) {
  const theme = themeOf(opts);
  const s = surface.view(x, y, w, h);
  const v = clamp01(Number(value) || 0);
  const zones = opts.thresholds || DEFAULT_ZONES;
  const base = col(opts.color, theme, theme.pos);
  const text = opts.valueText ?? `${Math.round(v * 100)}%`;
  const zc = zoneColor(v, zones, theme, base);
  const label = opts.label ? String(opts.label) : '';
  if (s.width < 1 || s.height < 1) return;

  const arcRows = s.height - (label && s.height >= 3 ? 1 : 0);
  if (s.width < 4 || arcRows < 2) {
    // Too small to draw an arc — degrade to colored text.
    const t = truncate(`${text}${label && s.width > stringWidth(text) + 2 ? ' ' + label : ''}`, s.width);
    s.text(0, 0, t, zc, undefined, ATTR.BOLD);
    return;
  }

  const ring = opts.style === 'ring';
  const cv = new Canvas(s.width, arcRows, { mode: 'braille', threshold: 0 });
  const pw = cv.width, ph = cv.height;
  const a0 = ring ? Math.PI * 1.25 : Math.PI;
  const sweep = ring ? Math.PI * 1.5 : Math.PI;
  const cx = (pw - 1) / 2;
  // Size the dial to the space, then center it vertically (an arc is only half
  // as tall as it is wide, so in tall boxes it would otherwise hug the bottom).
  let r, cy;
  if (ring) { r = Math.min(pw / 2 - 1, ph / 2 - 1); cy = (ph - 1) / 2; }
  else { r = Math.min(pw / 2 - 1, ph - 2); cy = Math.min(ph - 2, Math.round((ph + r) / 2)); }
  const thick = Math.max(1.5, r * 0.24);
  const track = theme.line;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const dx = px - cx, dy = cy - py;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.5 || d < r - thick) continue;
      let da = a0 - Math.atan2(dy, dx);
      da = ((da % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (da > sweep + 0.02) continue;
      const f = Math.min(1, da / sweep);
      cv.set(px, py, f <= v ? zoneColor(f, zones, theme, base) : track);
    }
  }
  if (opts.needle !== false && r > 4) {
    const na = a0 - v * sweep, r0 = r - thick - 1, r1 = Math.max(1, r - thick - Math.max(2, r * 0.32));
    cv.line(cx + Math.cos(na) * r1, cy - Math.sin(na) * r1, cx + Math.cos(na) * r0, cy - Math.sin(na) * r0, theme.ink);
  }
  cv.paint(s, 0, 0);

  const textRow = Math.min(arcRows - 1, Math.floor(cy / 4));
  const t = truncate(text, s.width);
  s.text(Math.floor((s.width - stringWidth(t)) / 2), textRow, t, zc, undefined, ATTR.BOLD);
  if (label && arcRows < s.height) {
    // Arc: just under the value. Ring: in the gap at the bottom of the dial.
    const lr = ring ? Math.min(s.height - 1, Math.floor((cy + r * 0.85) / 4)) : textRow + 1;
    const l = truncate(label, s.width);
    s.text(Math.floor((s.width - stringWidth(l)) / 2), Math.max(textRow + 1, lr), l, theme.muted);
  }
}
