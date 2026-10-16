// toDeviceSvg — the output stage for the Stream Deck app's Qt SVG renderer.
//
// Facets emit the deck SVG subset (validate.js). Hardware testing on the owner's
// Galleon 100 SD and Stream Deck + (aaa-prism-ds/hardware-lab/results/svg-support.md)
// found two things the Qt renderer in the Stream Deck app gets wrong:
//   - <clipPath> is IGNORED (full shapes are drawn), but a luminance <mask> whose
//     content is white works as a clip, with anti-aliased edges;
//   - preserveAspectRatio is ignored (the viewBox is always stretched to the key).
// So right before setImage / setFeedback the plugin runs every frame through
// toDeviceSvg(): each <clipPath id> becomes an equivalent luminance <mask> (its shapes
// filled white, clip-rule → fill-rule, clipPathUnits / transforms honored, a mask
// region from the clip's own bounds), clip-path="url(#x)" becomes mask="url(#x)",
// preserveAspectRatio is dropped, and the root's width / height are made to match the
// viewBox aspect exactly. Browsers, the raster backend and hidraw keep clipPath.
// The result passes validateSvg(svg, { profile: 'device' }).

import { splitElements, elementBounds } from './cull.js';
import { n } from './svg.js';

const PAINT = /\s(?:fill|stroke|fill-opacity|stroke-opacity|opacity|stroke-width|stroke-dasharray|stroke-dashoffset|stroke-linecap|stroke-linejoin|stroke-miterlimit|fill-rule|clip-rule)="[^"]*"/g;

const attrOf = (open, name) => (open.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

/** A clip shape → the same shape painted white (and nothing else) for a luminance mask. */
function whiten(el, rule) {
  const gt = el.indexOf('>');
  const selfClosing = el[gt - 1] === '/';
  const open = el.slice(0, selfClosing ? gt - 1 : gt);
  const tag = (open.match(/^<([A-Za-z][\w:.-]*)/) || [])[1];
  const ownRule = attrOf(open, 'clip-rule') || rule;
  const cleaned = open.replace(PAINT, '');
  if (tag === 'g') {
    const inner = el.slice(gt + 1, el.lastIndexOf('</'));
    return `${cleaned}>${splitElements(inner).map((c) => whiten(c, ownRule)).join('')}</g>`;
  }
  const paint = ` fill="#ffffff" stroke="none"${ownRule ? ` fill-rule="${ownRule}"` : ''}`;
  return selfClosing ? `${cleaned}${paint}/>` : `${cleaned}${paint}>${el.slice(gt + 1)}`;
}

/** One <clipPath …>…</clipPath> → an equivalent luminance <mask>. */
function clipToMask(str, viewBox) {
  const gt = str.indexOf('>');
  const open = str.slice(0, gt);
  const inner = str.slice(gt + 1, str.lastIndexOf('</clipPath>'));
  const id = attrOf(open, 'id');
  const units = attrOf(open, 'clipPathUnits') === 'objectBoundingBox' ? 'objectBoundingBox' : 'userSpaceOnUse';
  const tf = attrOf(open, 'transform');
  const rule = attrOf(open, 'clip-rule');
  const kids = splitElements(inner);
  let body = kids.map((k) => whiten(k, rule)).join('');
  if (tf) body = `<g transform="${tf}">${body}</g>`;
  // the mask region: the clip's own bounds (padded), so the renderer never allocates more than it shows
  let box = null;
  for (const k of kids) { const b = elementBounds(tf ? `<g transform="${tf}">${k}</g>` : k); if (b === null) { box = null; break; } if (b !== 'empty') box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; }
  let region;
  if (units === 'objectBoundingBox') {
    const b = box || [-0.5, -0.5, 1.5, 1.5];
    region = `maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="${n(b[0] - 0.01, 4)}" y="${n(b[1] - 0.01, 4)}" width="${n(b[2] - b[0] + 0.02, 4)}" height="${n(b[3] - b[1] + 0.02, 4)}"`;
  } else {
    const b = box || viewBox;
    region = `maskUnits="userSpaceOnUse" x="${n(b[0] - 1)}" y="${n(b[1] - 1)}" width="${n(b[2] - b[0] + 2)}" height="${n(b[3] - b[1] + 2)}"`;
  }
  return `<mask id="${id}" ${region}>${body}</mask>`;
}

/**
 * Prepare one frame for the Stream Deck app: clipPath → luminance mask, no
 * preserveAspectRatio, root width / height matching the viewBox aspect. Idempotent.
 */
export function toDeviceSvg(svg) {
  let out = String(svg);
  const root = out.match(/^\s*<svg\b[^>]*>/);
  if (!root) return out;
  const vb = (attrOf(root[0], 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const viewBox = vb.length === 4 && vb.every(Number.isFinite) ? [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]] : [0, 0, +attrOf(root[0], 'width') || 144, +attrOf(root[0], 'height') || 144];
  // 1. clipPath → mask (and the references)
  const ids = new Set();
  out = out.replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/g, (m) => { ids.add(attrOf(m.slice(0, m.indexOf('>')), 'id')); return clipToMask(m, viewBox); });
  if (ids.size) out = out.replace(/\sclip-path="url\(#([^)]+)\)"/g, (m, id) => (ids.has(id) ? ` mask="url(#${id})"` : m));
  // 2. preserveAspectRatio is ignored by the app; drop it so previews and the device agree
  out = out.replace(/\spreserveAspectRatio="[^"]*"/g, '');
  // 3. the root's width / height must have the viewBox's aspect (the app stretches)
  out = out.replace(/^(\s*<svg\b[^>]*>)/, (open) => {
    const w = parseFloat(attrOf(open, 'width')), h = parseFloat(attrOf(open, 'height'));
    if (!(vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0)) return open;
    const want = (w * vb[3]) / vb[2];
    return Math.abs(want - h) < 0.005 ? open : open.replace(/\sheight="[^"]*"/, ` height="${n(want)}"`);
  });
  return out;
}
