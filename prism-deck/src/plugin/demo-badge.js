// The DEMO badge: a small amber "DEMO" tag the plugin stamps on a key, dial segment or screen
// whose data is simulated (no live source on this machine: a demo calendar until you point the
// plugin at an .ics file, an invented playlist where no media source exists, a simulated groove
// until sound capture is live, weather always). Facets stay deterministic and badge-free; the
// runtime decides (ctx.data.demo lists the simulated keys) and composites the tag on the frame
// it sends, so the hardware never shows invented data unlabeled.
//
//   DEMO_KEYS                 data keys that can be simulated (clock / timer / link states are always real)
//   withDemoBadge(svg, { align }) → svg with the tag drawn top-right (inset from the bezel-cut corner), or
//                             top-center (align: 'center': dial segments, whose top-right holds the readout)
//   badgeTarget(members, mode) → which member of a render unit carries the tag (one per block)

import { textPath, measureText, capHeight } from '../scene/text.js';
import { n } from '../scene/svg.js';
import { BEZEL_INSET } from '../themes/_theme.js';

export const DEMO_KEYS = new Set(['audio', 'spectrum', 'media', 'calendar', 'weather', 'cpu', 'mem', 'gpu', 'net', 'disk', 'temp', 'battery', 'uptime']);
export const DEMO_TEXT = 'DEMO';
const INK = '#0b0d14', AMBER = '#ffc861';

/** The drawing box of an SVG root: its viewBox, else width/height. */
function boxOf(svg) {
  const head = svg.slice(0, svg.indexOf('>') + 1);
  const vb = /viewBox="([-\d.\s,]+)"/.exec(head);
  if (vb) { const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number); if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) return { x, y, w, h }; }
  const w = Number(/\swidth="([\d.]+)"/.exec(head)?.[1]), h = Number(/\sheight="([\d.]+)"/.exec(head)?.[1]);
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

/** The tag's markup for a w × h surface (origin x0, y0). */
export function demoBadge({ x0 = 0, y0 = 0, w, h, align = 'right' }) {
  const s = Math.min(w, h);
  const ph = Math.max(9, Math.min(20, s * 0.15));      // pill height: 11 px on a 72 px key, 20 px on screens
  const size = ph * 0.6, weight = 700, tracking = 0.08;
  const tw = measureText(DEMO_TEXT, { size, weight, tracking, caps: true });
  const pw = tw + ph * 0.9;
  const inset = Math.max(2, s * BEZEL_INSET);          // clear of the bezel's rounded corner
  const x = align === 'center' ? x0 + (w - pw) / 2 : x0 + w - inset - pw, y = y0 + inset;
  const r = ph / 2, sw = Math.max(0.75, ph * 0.08);
  return `<g id="prism-demo-tag"><rect x="${n(x)}" y="${n(y)}" width="${n(pw)}" height="${n(ph)}" rx="${n(r)}" fill="${INK}" stroke="${AMBER}" stroke-width="${n(sw)}"/>`
    + textPath(DEMO_TEXT, { x: x + pw / 2, y: y + ph / 2 + capHeight(size, weight) / 2, size, weight, tracking, caps: true, anchor: 'middle', fill: AMBER })
    + '</g>';
}

/** Stamp the tag onto a frame (any root <svg> with a viewBox or size). Idempotent. */
export function withDemoBadge(svg, { align = 'right' } = {}) {
  if (typeof svg !== 'string' || svg.includes('id="prism-demo-tag"')) return svg;
  const box = boxOf(svg), end = svg.lastIndexOf('</svg>');
  if (!box || end < 0) return svg;
  return svg.slice(0, end) + demoBadge({ x0: box.x, y0: box.y, ...box, align }) + svg.slice(end);
}

/**
 * The member that wears the tag: the top-right key of a span / whole deck, the right-most strip
 * segment, the Galleon's top-right widget (dial 1, layer 0), otherwise the unit's only member.
 */
export function badgeTarget(members, mode) {
  if (!members?.length) return null;
  const keys = members.filter((m) => m.controller === 'Keypad'), dials = members.filter((m) => m.controller === 'Encoder');
  const topRight = (list) => list.slice().sort((a, b) => a.row - b.row || b.col - a.col)[0];
  if (mode === 'span' || mode === 'deck' || mode === 'boot') return topRight(keys.length ? keys : members);
  if (mode === 'strip-all') return dials.slice().sort((a, b) => b.col - a.col)[0] || members[0];
  if (mode === 'screen-galleon') return dials.find((m) => m.col === 1 && m.row === 0) || topRight(dials) || members[0];
  return members[0];
}
