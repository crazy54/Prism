// "Muted" made unmissable (user panel F5): a muted mic is never just a red outline. The whole face
// washes in the theme's neg red (as strong as the theme's ink still reads on, ≥ 4.5:1), a heavy neg ring
// sits inside the bezel, the glyph is struck through in ink (with a cut, so the strike reads on red in
// every theme), and the label says MUTED — never color alone. Used by every key, dial segment and
// screen widget that shows a mic: icon-mic, app-meeting-mic, app-mic-meter, the state-* / alert-* mic
// variants, dial-volume / dial-volume-arc on a mic channel, and the Galleon studio / meeting screens.
//
// It also holds the shared link maps (scene/link.js) so the same glyph links the same channel everywhere.

import { rect, path, n } from '../../scene/index.js';
import { mix, contrast } from '../../scene/color.js';
import { arrive } from '../../scene/easing.js';

/** glyph id → { channel, lit: value of the glyph's lit state, rest: value of its rest state } */
export const GLYPH_LINKS = Object.freeze({
  mic: { channel: 'mic.muted', lit: false, rest: true },
  camera: { channel: 'camera.on', lit: true, rest: false },
  volume: { channel: 'volume.muted', lit: false, rest: true },
  broadcast: { channel: 'stream.live', lit: true, rest: false },
  viewers: { channel: 'stream.live', lit: true, rest: false },
});

/** link for a facet with states [lit, rest] (state-* motion keys) that shows `glyph`. */
export function pairLink(glyph, [lit = 'on', rest = 'off'] = []) {
  const L = GLYPH_LINKS[glyph];
  return L ? { [L.channel]: { [lit]: L.lit, [rest]: L.rest } } : {};
}

/** The neg wash's opacity on this surface: as red as the theme's ink still reads on, capped per mode. */
export function washOf(k) {
  const C = k.colors;
  let a = k.dark ? 0.62 : 0.5;
  while (a > 0.2 && contrast(C.ink, mix(C.surface, C.neg, a)) < 4.5) a -= 0.03;
  return a;
}

/** Paint a face (key, dial segment, screen widget) as muted: the neg wash + a heavy neg ring. */
export function mutedPlate(k, { x = 0, y = 0, w = k.w, h = k.h, since = Infinity, radius } = {}) {
  const u = k.ctx.reduced ? 1 : 0.35 + 0.65 * arrive(since, 0.3);
  const a = washOf(k), r = radius ?? k.m.radius;
  k.add(rect({ x: n(x), y: n(y), width: n(w), height: n(h), rx: n(r), fill: k.colors.neg, fillOpacity: n(a * u, 3) }));
  const ring = Math.max(2, k.m.u * 2.4), inset = (k.m.bleed ?? 4 * k.m.u) + ring / 2;
  k.add(rect({ x: n(x + inset), y: n(y + inset), width: n(w - inset * 2), height: n(h - inset * 2), rx: n(Math.max(0, r - inset * 0.5)), fill: 'none', stroke: k.colors.neg, strokeWidth: n(ring) }));
}

/** The strike over a glyph box (the mic glyph's own diagonal), in ink with a dark / light cut under it. */
export function strike(k, box, { since = Infinity } = {}) {
  const s = box.size / 48, u = k.ctx.reduced ? 1 : arrive(since, 0.32);
  const x0 = box.x + 10 * s, y0 = box.y + 8 * s;
  const d = `M${n(x0)} ${n(y0)}L${n(x0 + 28 * s * Math.max(0.05, u))} ${n(y0 + 32 * s * Math.max(0.05, u))}`;
  const w = Math.max(2, 3.1 * s);
  k.add(path(d, { fill: 'none', stroke: k.dark ? '#000000' : '#ffffff', strokeWidth: n(w * 2.3), strokeOpacity: 0.6, strokeLinecap: 'round' }));
  k.add(path(d, { fill: 'none', stroke: k.colors.ink, strokeWidth: n(w), strokeLinecap: 'round' }));
}

/** A whole muted key: the theme's material in neg, the wash, the glyph struck through, MUTED. */
export function mutedKey(k, { glyph = 'mic', state = 'off', label = 'MUTED', since = Infinity, labeled = true, eyebrow } = {}) {
  k.background({ tone: 'neg' });
  mutedPlate(k, { since });
  const box = k.theme.glyphBox(k, { labeled });
  k.glyph(glyph, { state, labeled, since });
  strike(k, box, { since });
  if (eyebrow) k.eyebrow(eyebrow, { color: 'ink' });
  if (labeled) k.label(String(label).toUpperCase(), { color: 'ink' });
}
