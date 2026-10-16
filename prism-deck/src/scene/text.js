// Text → paths. Every label on a deck is drawn from Inter's real outlines with
// real advance widths and GPOS kerning, so it measures exactly and looks the
// same in the Stream Deck app, every browser, and the raster/hidraw backend.
//
//   textPath('CPU 42%', { x: 72, y: 120, size: 20, weight: 600, anchor: 'middle', fill: '#f0f0f5' })
//   measureText('Healthy', { size: 20 })                → px
//   fitText('Production deploy', { maxWidth: 120, size: 20, minSize: 15 })  → { text, size, width, truncated }
//   wrapText('Turn on the lights', { maxWidth: 120, size: 18, maxLines: 2 }) → { lines, size, lineHeight }
//
// Options shared by all: size (px), weight (100–900; 400/600 real, others synthesized),
// tracking (em, added between glyphs), tabular (digits on one width — clocks/counters),
// caps (uppercase ASCII), kerning (default true).

import { faceFor } from './font.js';
import { n, attrs } from './svg.js';

const memo = new Map();
const MEMO_MAX = 600;
const remember = (k, v) => { if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value); memo.set(k, v); return v; };

const upper = (s) => s.replace(/[a-z]/g, (c) => c.toUpperCase());

/** Glyph placement for a string: { face, scale, embolden, width (px), items: [{ g, x (px) }] }. */
export function layout(str, { size = 16, weight = 600, tracking = 0, tabular = false, caps = false, kerning = true } = {}) {
  const { face, embolden } = faceFor(weight);
  const s = caps ? upper(String(str ?? '')) : String(str ?? '');
  const scale = size / face.upm;
  const items = [];
  let x = 0, prev = null;
  const space = face.glyphs.get(' ');
  for (const ch of s) {
    let g = face.glyphs.get(ch) || face.glyphs.get(ch.normalize('NFD')[0]) || null;
    if (kerning && prev) x += (face.kern.get(prev + ch) || 0) * scale;
    let adv, dx = 0;
    if (!g) { g = null; adv = (space?.adv || face.upm * 0.28) * scale; }
    else if (tabular && ch >= '0' && ch <= '9') { adv = face.figure * scale; dx = (face.figure - g.adv) * scale / 2; }
    else adv = g.adv * scale;
    if (g) items.push({ g, x: x + dx });
    x += adv + tracking * size + embolden * size;
    prev = ch;
  }
  if (s.length) x -= tracking * size + embolden * size;
  return { face, scale, embolden, width: Math.max(0, x), items, size };
}

/** Width in px. */
export const measureText = (str, opts = {}) => layout(str, opts).width;

/** Path data for laid-out text with its baseline at (0, 0), y down. */
function pathData(L, decimals) {
  const { scale } = L;
  let d = '';
  const f = (v) => n(v, decimals);
  for (const { g, x } of L.items) {
    const { ops, xs } = g;
    let k = 0;
    for (let i = 0; i < ops.length; i++) {
      switch (ops[i]) {
        case 0: d += `M${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)}`; k += 2; break;
        case 1: d += `L${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)}`; k += 2; break;
        case 2: d += `Q${f(x + xs[k] * scale)} ${f(-xs[k + 1] * scale)} ${f(x + xs[k + 2] * scale)} ${f(-xs[k + 3] * scale)}`; k += 4; break;
        default: d += 'Z';
      }
    }
  }
  return d;
}

/**
 * Text outline: { d (baseline at 0,0), width, size, embolden (px stroke) }. Memoized on
 * (string, size, weight, tracking, tabular, caps) — labels repeat every frame.
 */
export function textOutline(str, opts = {}) {
  const size = opts.size ?? 16;
  const decimals = opts.decimals ?? (size < 14 ? 2 : 1);
  const key = `${str}\u0000${size}|${opts.weight ?? 600}|${opts.tracking || 0}|${opts.tabular ? 1 : 0}|${opts.caps ? 1 : 0}|${opts.kerning === false ? 0 : 1}|${decimals}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const L = layout(str, opts);
  return remember(key, { d: pathData(L, decimals), width: L.width, size, embolden: L.embolden * size });
}

/**
 * Text as one <path>. x/y = baseline position; anchor start|middle|end.
 * maxWidth (+ minSize) fits by shrinking, then ellipsizes. Returns '' for empty text.
 * Paint: fill (+ fillOpacity / opacity), or stroke for outlined text.
 */
export function textPath(str, { x = 0, y = 0, size = 16, anchor = 'start', maxWidth, minSize, fill = '#ffffff', fillOpacity, opacity, stroke, strokeWidth, ...opts } = {}) {
  let s = String(str ?? ''), px = size;
  if (!s) return '';
  if (maxWidth) { const fit = fitText(s, { maxWidth, size, minSize: minSize ?? size * 0.75, ...opts }); s = fit.text; px = fit.size; }
  const o = textOutline(s, { ...opts, size: px });
  if (!o.d) return '';
  const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
  // the faux-bold stroke is part of the letter: it fades with the fill (else a faded synthesized weight keeps an opaque outline)
  const bold = o.embolden > 0.01 ? { stroke: stroke ?? fill, strokeWidth: strokeWidth ?? o.embolden, strokeLinejoin: 'round', strokeOpacity: stroke ? undefined : fillOpacity } : stroke ? { stroke, strokeWidth } : null;
  return `<path${attrs({ transform: `translate(${n(x0)} ${n(y)})`, d: o.d, fill, fillOpacity, opacity, ...bold })}/>`;
}

/** Ellipsize so the result fits maxWidth at size. */
export function ellipsize(str, maxWidth, opts) {
  const s = String(str);
  if (measureText(s, opts) <= maxWidth) return s;
  const chars = [...s];
  for (let k = chars.length - 1; k > 0; k--) {
    const t = chars.slice(0, k).join('').trimEnd() + '…';
    if (measureText(t, opts) <= maxWidth) return t;
  }
  return '…';
}

/** Largest size in [minSize, size] (0.5 px steps) at which the text fits; ellipsized at minSize otherwise. */
export function fitText(str, { maxWidth, size, minSize = size * 0.75, ...opts }) {
  const s = String(str ?? '');
  const full = measureText(s, { ...opts, size });
  if (full <= maxWidth) return { text: s, size, width: full, truncated: false };
  // width is linear in size (tracking/embolden are em-based), so solve, then step down to be safe
  let px = Math.max(minSize, Math.floor((size * maxWidth / full) * 2) / 2);
  while (px > minSize && measureText(s, { ...opts, size: px }) > maxWidth) px -= 0.5;
  if (measureText(s, { ...opts, size: px }) <= maxWidth) return { text: s, size: px, width: measureText(s, { ...opts, size: px }), truncated: false };
  const text = ellipsize(s, maxWidth, { ...opts, size: minSize });
  return { text, size: minSize, width: measureText(text, { ...opts, size: minSize }), truncated: text !== s };
}

/** Greedy wrap into ≤ maxLines lines, shrinking toward minSize; the last line is ellipsized if needed. */
export function wrapText(str, { maxWidth, size, minSize = size * 0.8, maxLines = 2, lineHeight = 1.14, ...opts }) {
  const words = String(str ?? '').trim().split(/\s+/).filter(Boolean);
  const lay = (px) => {
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || measureText(next, { ...opts, size: px }) <= maxWidth) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (let px = size; px >= minSize - 1e-6; px -= 0.5) {
    const lines = lay(px);
    if (lines.length <= maxLines && lines.every((l) => measureText(l, { ...opts, size: px }) <= maxWidth)) return { lines, size: px, lineHeight: px * lineHeight };
  }
  const lines = lay(minSize);
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines) kept[maxLines - 1] = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
  return { lines: kept.map((l) => ellipsize(l, maxWidth, { ...opts, size: minSize })), size: minSize, lineHeight: minSize * lineHeight };
}

/** Cap height in px at size (for optical vertical centering: baseline = centerY + capHeight / 2). */
export const capHeight = (size, weight = 600) => { const { face } = faceFor(weight); return (face.capHeight / face.upm) * size; };
/** x-height in px at size. */
export const xHeight = (size, weight = 600) => { const { face } = faceFor(weight); return (face.xHeight / face.upm) * size; };

/** Compact number for small displays: 1234 → "1234", 12345 → "12.3k". */
export function compact(v, { digits = 1, unit = '' } = {}) {
  const a = Math.abs(v);
  const f = (x, s) => `${+x.toFixed(x < 10 ? digits : 0)}${s}${unit}`;
  if (a >= 1e9) return f(v / 1e9, 'G');
  if (a >= 1e6) return f(v / 1e6, 'M');
  if (a >= 1e4) return f(v / 1e3, 'k');
  return `${Number.isInteger(v) ? v : +v.toFixed(digits)}${unit}`;
}

/** Zero-padded two digits. */
export const pad2 = (v) => String(Math.floor(Math.abs(v))).padStart(2, '0');

/** Seconds → "m:ss" (or "h:mm:ss" past an hour). */
export function clockText(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`;
}
