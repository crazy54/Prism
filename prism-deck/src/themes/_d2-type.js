// Bitmap typography shared by the `pixel` and `phosphor` themes: lays out a text role
// (eyebrow · label · value · hero · caption) in the 5 × 7 / 3 × 5 faces at whole-pixel
// dot sizes, fitted to the room, and hands the dot runs to a painter.
//
//   bitmapText(k, role, str, o)                    pixel squares (+ a one-pixel LCD shadow by day)
//   bitmapText(k, role, str, o, { paint(runs, d, color, o) { … } })   any other material

import { path, n } from '../scene/svg.js';
import { capHeight } from '../scene/text.js';
import { pickFace, fitFace, textRuns, runsPath, measureDots } from './_d2-pixfont.js';

/** Draw bitmap text (shared with phosphor via `paint`): returns markup. */
export function bitmapText(k, role, str, o = {}, { paint } = {}) {
  const st = k.typeStyle(role, o);
  const color = k.color(o.color ?? st.color);
  const cap = capHeight(st.size, st.weight || 600);
  const small = role === 'eyebrow' || role === 'caption';
  const face0 = pickFace(cap, { small });
  const safe = Math.round(k.m.safe);
  const room = Math.floor(o.maxWidth ?? k.w - Math.round(k.m.text ?? k.m.safe) * 2);
  const tracking = (st.tracking || 0) >= 0.1 ? 1 : 0;
  let a = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : null;
  const lines = [];
  if ((o.maxLines || 1) > 1 && role === 'label') {
    // greedy word wrap at the face size, shrinking until it fits maxLines
    for (const f of [face0, { ...face0, d: Math.max(1, face0.d - 1) }]) {
      const words = String(str).split(/\s+/);
      const out = [];
      let cur = '';
      for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (measureDots(t, f.font, tracking) * f.d <= room || !cur) cur = t; else { out.push(cur); cur = w; } }
      if (cur) out.push(cur);
      if (out.length <= o.maxLines) { lines.push(...out.map((s) => fitFace(s, f, room, tracking))); break; }
    }
  }
  if (!lines.length) lines.push(fitFace(String(str), face0, room, tracking));
  const f0 = lines[0];
  const hpx = f0.font.h * f0.d, lead = hpx + Math.max(2, f0.d * 2);
  let top, x;
  switch (role) {
    case 'eyebrow':
      a = a || 'start';
      x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
      top = o.y !== undefined ? o.y - hpx : safe;
      break;
    case 'label':
      a = a || 'middle';
      x = o.x ?? k.w / 2;
      top = (o.y ?? k.h - (st.baseline ?? 6.5) * k.m.u) - hpx - (lines.length - 1) * lead;
      break;
    case 'value': case 'hero':
      a = a || 'middle';
      x = o.x ?? k.w / 2;
      top = (o.cy ?? k.h * 0.52) - hpx / 2;
      break;
    default:
      a = a || 'middle';
      x = o.x ?? k.w / 2;
      top = (o.y ?? k.h - safe) - hpx;
  }
  let runs = [];
  lines.forEach((f, i) => {
    const x0 = Math.round(a === 'start' ? x : a === 'end' ? x - f.width : x - f.width / 2);
    runs = runs.concat(textRuns(f.text, { font: f.font, d: f.d, x: x0, y: Math.round(top + i * lead), tracking }));
  });
  if (paint) return paint(runs, f0.d, color, o);
  let out = '';
  if (!k.dark) out += path(runsPath(runs.map(([rx, ry, len]) => [rx + 1, ry + 1, len]), f0.d), { fill: '#000000', fillOpacity: 0.14 });
  out += path(runsPath(runs, f0.d), { fill: color, fillOpacity: o.opacity !== undefined && o.opacity < 1 ? n(o.opacity, 3) : null });
  return out;
}

