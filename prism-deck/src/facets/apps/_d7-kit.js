// D7's kit — Creator, Productivity & Type facets (helpers only; not registered).
//
//   text(k, str, o)            Inter outlines at a baseline (y) or optically centered (cy), any color spec
//   glowText(k, str, o)        tube / sign lettering: halo strokes under a lit core (no filters on the device)
//   perimeter(x, y, w, h, r)   a rounded-rect path that starts at 12 o'clock and runs clockwise → { d, len }
//   progressArc / headDot      a ring that fills or drains, with a lit head
//   burst(k, o)                the celebratory finish: rays dispersed across the Spectrum, flying out once
//   flap(k, o)                 a split-flap unit (two half cards, hinge, falling flap with gravity + bounce)
//   chip(k, o)                 a small pill with text (status, badges)
//   holdAge(ctx)               for keys that "remember" the last press: seconds held / since release
//
// Budget notes: everything here merges paint where it can (one path per color), keeps ids stable
// (k.id(name) — never frame-dependent) and draws nothing that moves at rest, so runtimes dedupe.

import { rect, path, circle, n, P, linearGradient, url } from '../../scene/svg.js';
import { textPath, textOutline, capHeight, measureText, fitText } from '../../scene/text.js';
import { arcPath, polar } from '../../scene/shapes.js';
import { clamp, lerp, outExpo, inQuad } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';

export const isBig = (k) => Math.min(k.w, k.h) >= 110;
/** "White light" in this mode: white at night, the theme's ink by day. */
export const lightOf = (k) => (k.dark ? '#ffffff' : k.colors.ink);

/** Text as outlines. o: { x, y (baseline) | cy (optical center), size, weight, anchor, color, opacity, tabular, tracking, caps, maxWidth, minSize } → markup (also added unless add: false) */
export function text(k, str, { x = k.w / 2, y, cy, size = 12, weight = 600, anchor = 'middle', color = 'ink', opacity, tabular, tracking, caps, maxWidth, minSize, add = true } = {}) {
  if (str === undefined || str === null || String(str) === '') return '';
  let s = String(str), px = size;
  if (maxWidth) { const f = fitText(s, { maxWidth, size, minSize: minSize ?? size * 0.7, weight, tabular, tracking, caps }); s = f.text; px = f.size; }
  const yy = y ?? (cy ?? k.h / 2) + capHeight(px, weight) / 2;
  const out = textPath(s, { x, y: yy, size: px, weight, anchor, tabular, tracking, caps, fill: k.color(color), fillOpacity: opacity !== undefined && opacity < 1 ? n(Math.max(0, opacity), 3) : undefined });
  if (add) k.add(out);
  return out;
}

/** Width of a string at size / weight (same options as text()). */
export const widthOf = (str, size, o = {}) => measureText(String(str), { size, weight: 600, ...o });

/**
 * Sign lettering: the outline stroked wide and faint (the halo), then the lit core. Off: only the
 * glass tube outline. o: { x, y, size, weight, anchor, color, lit (0–1), halo (px), tube (dark glass color) }
 */
export function glowText(k, str, { x, y, size, weight = 700, anchor = 'middle', color, lit = 1, halo = size * 0.16, tube, tracking = 0, core } = {}) {
  const o = textOutline(String(str), { size, weight, tracking });
  if (!o.d) return 0;
  const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
  const tf = `translate(${n(x0)} ${n(y)})`;
  const L = clamp(lit);
  const tw = Math.max(1.2, size * 0.075);               // the tube follows the letter outline
  // the glass tube (always there: an unlit sign still shows its tubes)
  k.add(path(o.d, { transform: tf, fill: 'none', stroke: tube ?? k.colors.line, strokeWidth: n(tw), strokeLinejoin: 'round' }));
  if (L <= 0.01) return o.width;
  const glow = k.dark ? 1 : 0.6;
  // halo (two soft strokes), the lit gas, a white-hot core
  k.add(path(o.d, { transform: tf, fill: color, fillOpacity: n(0.1 * L, 3), stroke: color, strokeWidth: n(halo * 1.6 + tw), strokeLinejoin: 'round', strokeOpacity: n(0.12 * L * glow, 3) }));
  k.add(path(o.d, { transform: tf, fill: 'none', stroke: color, strokeWidth: n(halo * 0.7 + tw), strokeLinejoin: 'round', strokeOpacity: n(0.26 * L * glow, 3) }));
  k.add(path(o.d, { transform: tf, fill: 'none', stroke: color, strokeWidth: n(tw), strokeLinejoin: 'round', strokeOpacity: L < 1 ? n(L, 3) : undefined }));
  if (core) k.add(path(o.d, { transform: tf, fill: 'none', stroke: core, strokeWidth: n(Math.max(0.6, tw * 0.36)), strokeLinejoin: 'round', strokeOpacity: n(L * 0.95, 3) }));
  return o.width;
}

/** A rounded-rect outline starting at 12 o'clock, clockwise. → { d, len } */
export function perimeter(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const cx = x + w / 2;
  const d = P().M(cx, y).H(x + w - rr).A(rr, rr, 0, 0, 1, x + w, y + rr).V(y + h - rr).A(rr, rr, 0, 0, 1, x + w - rr, y + h)
    .H(x + rr).A(rr, rr, 0, 0, 1, x, y + h - rr).V(y + rr).A(rr, rr, 0, 0, 1, x + rr, y).H(cx).d;
  const len = 2 * (w + h) - 8 * rr + 2 * Math.PI * rr;
  return { d, len };
}

/** Stroke the first `f` (0–1) of a perimeter. → markup */
export function perimeterStroke({ d, len }, f, { color, width, opacity, cap = 'round' }) {
  const v = clamp(f);
  if (v <= 0.002) return '';
  const on = len * v;
  return path(d, { fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined, strokeLinecap: cap, strokeLinejoin: 'round', strokeDasharray: v >= 0.999 ? undefined : `${n(on)} ${n(len)}` });
}

/** Point at fraction f along a perimeter (for heads / sparks). */
export function perimeterPoint(x, y, w, h, r, f) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const segs = [
    ['l', w / 2 - rr, (s) => [x + w / 2 + s, y]],
    ['a', (Math.PI / 2) * rr, (s) => polar(x + w - rr, y + rr, rr, (s / rr) * (180 / Math.PI))],
    ['l', h - 2 * rr, (s) => [x + w, y + rr + s]],
    ['a', (Math.PI / 2) * rr, (s) => polar(x + w - rr, y + h - rr, rr, 90 + (s / rr) * (180 / Math.PI))],
    ['l', w - 2 * rr, (s) => [x + w - rr - s, y + h]],
    ['a', (Math.PI / 2) * rr, (s) => polar(x + rr, y + h - rr, rr, 180 + (s / rr) * (180 / Math.PI))],
    ['l', h - 2 * rr, (s) => [x, y + h - rr - s]],
    ['a', (Math.PI / 2) * rr, (s) => polar(x + rr, y + rr, rr, 270 + (s / rr) * (180 / Math.PI))],
    ['l', w / 2 - rr, (s) => [x + rr + s, y]],
  ];
  const total = segs.reduce((a, s) => a + s[1], 0);
  let left = clamp(f) * total;
  for (const [, L, at] of segs) { if (left <= L) return at(left); left -= L; }
  return [x + w / 2, y];
}

/** A ring arc from 12 o'clock: the first `value` of the circle (clockwise). */
export function progressArc({ cx, cy, r, value, color, width, opacity, cap = 'round' }) {
  const v = clamp(value);
  if (v <= 0.002) return '';
  if (v >= 0.999) return circle({ cx: n(cx), cy: n(cy), r: n(r), fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined });
  return path(arcPath(cx, cy, r, 0, 360 * v), { fill: 'none', stroke: color, strokeWidth: n(width), strokeLinecap: cap, strokeOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined });
}

/** A lit head: a soft halo and a white-light core. */
export function headDot(k, x, y, r, color) {
  return circle({ cx: n(x), cy: n(y), r: n(r * 2.2), fill: color, fillOpacity: k.dark ? 0.22 : 0.16 }) + circle({ cx: n(x), cy: n(y), r: n(r), fill: k.dark ? '#ffffff' : color });
}

/**
 * The celebratory finish: `count` rays dispersed across the Spectrum fly out from (cx, cy) once,
 * with sparks at their tips; age in seconds (nothing after dur). → markup
 */
export function burst(k, { cx, cy, r0, r1, age, dur = 1.1, count = 12, hue = 0, width, spin = 0 }) {
  if (!(age >= 0) || age >= dur) return '';
  const p = clamp(age / dur), e = outExpo(p);
  const fade = 1 - inQuad(p);
  const head = lerp(r0, r1, e), tail = lerp(r0, r1, outExpo(clamp(p * 0.72)));
  const sw = width ?? Math.max(1.5, k.m.line * 1.4);
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = spin + (i * 360) / count + (i % 2 ? 360 / count / 2 * 0 : 0);
    const len = i % 2 ? 0.82 : 1;
    const [x0, y0] = polar(cx, cy, tail * len, a), [x1, y1] = polar(cx, cy, head * len, a);
    const c = k.theme.spectral(hue + (i * 360) / count);
    if (Math.hypot(x1 - x0, y1 - y0) > 0.4) out += path(P().M(x0, y0).L(x1, y1).d, { stroke: c, strokeWidth: n(sw * (1 - 0.5 * p)), strokeLinecap: 'round', strokeOpacity: n(fade, 3) });
    out += circle({ cx: n(x1), cy: n(y1), r: n(sw * 0.9 * (1 - p * 0.6)), fill: c, fillOpacity: n(fade, 3) });
  }
  return out;
}

/** A pill with centered text. o: { x, y, w?, h, label, color (fill), ink (text), size, weight, outline } → width */
export function chip(k, { x, y, h, label, color, ink, size = h * 0.62, weight = 700, outline = false, anchor = 'start', pad = h * 0.42, tracking = 0.04, caps = true, opacity } = {}) {
  const tw = widthOf(label, size, { weight, tracking, caps });
  const w = tw + pad * 2;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  k.add(rect({ x: n(x0), y: n(y), width: n(w), height: n(h), rx: n(h / 2), fill: outline ? 'none' : color, stroke: outline ? color : undefined, strokeWidth: outline ? n(Math.max(1, h * 0.08)) : undefined, fillOpacity: opacity !== undefined && opacity < 1 ? n(opacity, 3) : undefined }));
  text(k, label, { x: x0 + w / 2, cy: y + h / 2, size, weight, tracking, caps, color: ink ?? (outline ? color : '#ffffff') });
  return w;
}

/**
 * Keys that remember their last press through a toggle (each press-down flips the state, so
 * ctx.since counts from the press): → { held (s), pressed, released (s since release, Infinity if never) }
 */
export function holdAge(ctx) {
  if (ctx.pressed) return { held: ctx.pressedFor || 0, pressed: true, released: 0 };
  if (!Number.isFinite(ctx.pressAge)) return { held: 0, pressed: false, released: Infinity };
  return { held: Math.max(0, ctx.since - ctx.pressAge), pressed: false, released: ctx.pressAge };
}

/** Card colors for split-flap units in this theme. */
export function flapColors(k) {
  const C = k.colors;
  const top = k.dark ? mix(C.surface, '#ffffff', 0.07) : mix(C.surface, '#ffffff', 0.55);
  const bot = k.dark ? mix(C.surface2, '#ffffff', 0.04) : mix(C.surface2, C.surface, 0.5);
  return { top, bot, ink: C.ink, hinge: k.dark ? '#000000' : mix(C.line, C.ink, 0.25), shade: '#000000', edge: C.edge || '#ffffff' };
}

/**
 * A split-flap unit. o: { x, y, w, h, r, prev, cur, p (flip progress 0–1; ≥ 1 = settled), size, weight,
 * tag (stable id stem), color, colors } — the top flap of `prev` falls with gravity, the bottom of `cur`
 * lands on the stop and bounces. Text is drawn clipped to each half.
 */
export function flap(k, { x, y, w, h, r, prev, cur, p = 1, size, weight = 700, tag = 'f', color, colors, dy = 0 }) {
  const F = colors || flapColors(k);
  const mid = y + h / 2, gap = Math.max(1, h * 0.012);
  const ink = color ?? F.ink;
  const ids = { t: k.id(`${tag}-t`), b: k.id(`${tag}-b`), gt: k.id(`${tag}-gt`), gb: k.id(`${tag}-gb`) };
  k.def(`<clipPath id="${ids.t}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h / 2 - gap / 2)}"/></clipPath><clipPath id="${ids.b}"><rect x="${n(x)}" y="${n(mid + gap / 2)}" width="${n(w)}" height="${n(h / 2 - gap / 2)}"/></clipPath>`);
  k.def(linearGradient(ids.gt, [[0, F.top], [1, mix(F.top, F.bot, 0.5)]], { x1: 0, y1: n(y), x2: 0, y2: n(mid), gradientUnits: 'userSpaceOnUse' }));
  k.def(linearGradient(ids.gb, [[0, F.bot], [1, mix(F.bot, '#000000', k.dark ? 0.25 : 0.06)]], { x1: 0, y1: n(mid), x2: 0, y2: n(y + h), gradientUnits: 'userSpaceOnUse' }));
  const half = (top) => path(top
    ? P().M(x, mid - gap / 2).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(mid - gap / 2).Z().d
    : P().M(x, mid + gap / 2).H(x + w).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d,
  { fill: url(top ? ids.gt : ids.gb) });
  const glyph = (str, clip) => `<g clip-path="url(#${clip})">${textPath(String(str), { x: x + w / 2, y: mid + capHeight(size, weight) / 2 + dy, size, weight, anchor: 'middle', tabular: true, fill: ink })}</g>`;
  const settled = !(p < 1) || prev === undefined || prev === cur;
  // the two static halves: top always shows the new value; bottom shows the old one until the flap lands
  const fall = settled ? 1 : clamp(p / 0.78);
  const theta = 180 * Math.pow(fall, 1.7);            // gravity: the flap accelerates as it falls
  k.add(half(true) + glyph(cur, ids.t));
  k.add(half(false) + glyph(theta < 90 ? prev : cur, ids.b));
  if (!settled) {
    if (theta < 90) {
      const s = Math.max(0.001, Math.cos((theta * Math.PI) / 180));
      k.add(`<g transform="translate(0 ${n(mid)}) scale(1 ${n(s, 4)}) translate(0 ${n(-mid)})">${half(true)}${glyph(prev, ids.t)}${path(P().M(x, mid - gap / 2).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(mid - gap / 2).Z().d, { fill: F.shade, fillOpacity: n(0.62 * (theta / 90), 3) })}${rect({ x: n(x), y: n(y), width: n(w), height: n(Math.max(1, h * 0.012)), fill: F.edge, fillOpacity: n(0.5 * (theta / 90), 3) })}</g>`);
      // the shadow the falling flap casts on the lower half
      k.add(rect({ x: n(x), y: n(mid + gap / 2), width: n(w), height: n((h / 2) * (1 - s) * 0.9), fill: F.shade, fillOpacity: n(0.28 * (1 - s), 3) }));
    } else {
      const s = Math.max(0.001, -Math.cos((theta * Math.PI) / 180));
      k.add(`<g transform="translate(0 ${n(mid)}) scale(1 ${n(s, 4)}) translate(0 ${n(-mid)})">${half(false)}${glyph(cur, ids.b)}${path(P().M(x, mid + gap / 2).H(x + w).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d, { fill: F.shade, fillOpacity: n(0.5 * (1 - s), 3) })}</g>`);
    }
  } else if (p < 1.25 && prev !== undefined && prev !== cur) {
    // landed: a small bounce off the stop (a lit edge flickers along the hinge)
    const b = clamp((p - 1) / 0.25);
    k.add(rect({ x: n(x), y: n(mid - gap / 2), width: n(w), height: n(gap), fill: F.edge, fillOpacity: n(0.5 * (1 - b), 3) }));
  }
  // hinge: the dark gap with two pins
  k.add(rect({ x: n(x), y: n(mid - gap / 2), width: n(w), height: n(gap), fill: F.hinge }));
  const pin = Math.max(1.2, h * 0.035);
  k.add(path(`M${n(x - pin * 0.3)} ${n(mid - pin)}h${n(pin * 1.2)}v${n(pin * 2)}h${n(-pin * 1.2)}ZM${n(x + w - pin * 0.9)} ${n(mid - pin)}h${n(pin * 1.2)}v${n(pin * 2)}h${n(-pin * 1.2)}Z`, { fill: F.hinge }));
}

/** Days and months (short) for labels. */
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Seconds → m:ss (h:mm:ss past an hour), never negative. */
export function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return hh ? `${hh}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** A stable small hash of a string (avatar hues, generated art). */
export function strHash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** Approximate color of a blackbody at k kelvin (Tanner Helland's fit), as #rrggbb. */
export function kelvinHex(kelvin) {
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export { clamp, lerp, outExpo, mix, n, P, rect, path, circle, url, linearGradient, capHeight, measureText };
