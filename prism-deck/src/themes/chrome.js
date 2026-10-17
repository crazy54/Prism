// chrome — machined metal. Every key is a milled button: a chamfered bevel catching
// light from the top-left, a brushed face with an anisotropic sheen, and a light
// channel cut around the face that holds an LED.
//
//   Night  black chrome: gunmetal faces, polished chrome glyphs, ice-blue LEDs.
//   Day    satin aluminum: bright brushed faces, black-chrome glyphs, orange anodizing.
//
// Roles are finishes, not colors:
//   line / fill  raised polished chrome — cast shadow down-right, a lit rim up-left,
//                horizon-banded reflection, a specular core along every stroke
//   dim          engraved and paint-filled — an inner shadow up-left, a lit lower lip
//   accent       anodized metal when idle (heat-blued by night, orange by day); an LED
//                in a milled slot when the key is lit (glow, slot, colored lens, hot core)
//   spark        a jewel lamp
// States (tone → state): idle · on (active ok info warn neg: the channel LED lights in
// the tone; warn adds the corner flag) · alert (alert crit: the LED breathes 1 Hz for
// 10 s then holds, corner flag — never color alone) · busy (a glint runs round the
// bevel, 1.2 s a lap) · off (bead-blasted: no sheen, no light, glyph flat and faint).
// Press: the button travels in (the bevel's light flips to an inner shadow), springs
// back with a little overshoot, and a specular glint sweeps the face as it settles.
// Bespoke art: mic (a ribbon capsule with engraved grille slots) and clock (a watch
// dial: baton indices, polished tapered hands, blued minute hand) — D4.

import { defineTheme, defaultText, bezelCorner } from './_theme.js';
import { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, outCubic, pulse, phase, spring, arrive } from '../scene/easing.js';
import { hash } from '../scene/noise.js';
import { getGlyph } from '../glyphs/_registry.js';
import { stack, onePen, isLettering, strokeOf, fillOf, strokeOpts, once, castText } from './_d4-layers.js';

const NIGHT = {
  bg: '#07080a', surface: '#3b4048', surface2: '#1c1f24', line: '#4a5059',
  ink: '#f1f4f7', muted: '#b1b8c2', dim: '#7f8792',
  accent: '#5cc8ff', accent2: '#ffb45c', pos: '#59e3a0', info: '#6cb6ff', warn: '#ffc451', neg: '#ff6b5e', crit: '#ff63a8',
  edge: '#ffffff', edgeOpacity: 0.16, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0.12,
  spectrum: { l: 0.8, c: 0.15 },
};
const DAY = {
  bg: '#8a9098', surface: '#f2f3f5', surface2: '#c9cdd3', line: '#aeb3bb',
  ink: '#111418', muted: '#454b54', dim: '#6c737d',
  accent: '#c2460b', accent2: '#1d5fc9', pos: '#0f7a4c', info: '#1d5fc9', warn: '#9c5800', neg: '#c02a20', crit: '#ac1767',
  edge: '#ffffff', edgeOpacity: 0.85, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0.5,
  spectrum: { l: 0.57, c: 0.17 },
};

// Finishes per mode. Gradients run top → bottom: sky, horizon, ground — how chrome reflects a room.
const FINISH = {
  dark: {
    chrome: [[0, '#ffffff'], [0.3, '#d9dee5'], [0.47, '#959ca8'], [0.53, '#5f6671'], [0.61, '#adb4be'], [1, '#e9edf1']],
    dome: [[0, '#ffffff'], [0.4, '#d3d8df'], [0.66, '#8e96a1'], [1, '#c9ced5']],
    anodized: (c) => [[0, mix(c, '#ffffff', 0.55)], [0.45, c], [0.53, mix(c, '#0b1530', 0.45)], [0.62, mix(c, '#ffffff', 0.15)], [1, mix(c, '#ffffff', 0.4)]],
    bevel: [[0, '#a7aeb8'], [0.3, '#60666f'], [0.62, '#2b2f35'], [1, '#141619']],
    face: [[0, '#3b4048'], [0.46, '#2d3138'], [0.5, '#33373e'], [1, '#1c1f24']],
    matte: [[0, '#2c2f34'], [1, '#202327']],
    housing: [[0, '#0c0d10'], [1, '#040506']],
    shadow: '#000000', shadowA: 0.62, hiA: 0.32, coreA: 0.75, lipA: 0.16, innerA: 0.7, glowA: 0.22, slotA: 0.55,
    streakLight: 0.07, streakDark: 0.28, channel: '#050608', channelA: 0.75,
  },
  light: {
    chrome: [[0, '#626a74'], [0.4, '#2b3037'], [0.5, '#0d0f12'], [0.58, '#3b4149'], [1, '#1b1f24']],
    dome: [[0, '#5d646e'], [0.42, '#262a30'], [0.7, '#0f1114'], [1, '#30353c']],
    anodized: (c) => [[0, mix(c, '#ffffff', 0.35)], [0.45, c], [0.53, mix(c, '#000000', 0.35)], [0.62, mix(c, '#ffffff', 0.1)], [1, mix(c, '#000000', 0.15)]],
    bevel: [[0, '#ffffff'], [0.35, '#eceef1'], [0.7, '#a2a8b1'], [1, '#80868f']],
    face: [[0, '#f2f3f5'], [0.45, '#dfe2e6'], [0.5, '#e7e9ec'], [1, '#c9cdd3']],
    matte: [[0, '#dcdee1'], [1, '#cfd2d6']],
    housing: [[0, '#9aa0a8'], [1, '#7a8088']],
    shadow: '#1d232b', shadowA: 0.34, hiA: 0.95, coreA: 0.4, lipA: 0.95, innerA: 0.4, glowA: 0.12, slotA: 0.3,
    streakLight: 0.45, streakDark: 0.07, channel: '#6f7680', channelA: 0.7,
  },
};
const F = (k) => FINISH[k.dark ? 'dark' : 'light'];

/** Tone → panel state. */
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'on', neg: 'on', alert: 'alert', crit: 'alert', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const flagged = (tone) => tone === 'warn' || tone === 'alert' || tone === 'crit';
/** Alerts breathe 1 Hz (.55 ↔ 1) for 10 s, then hold. */
const breath = (k, tone) => (stateOf(tone) !== 'alert' || k.ctx.reduced || k.ctx.since >= 10 ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));

// layer order: 0 glow · 1 down-right (cast shadow / lower lip) · 2 up-left (lit rim / inner shadow) · 3 slot · 4 body · 5 core
const OFFSETS = { 1: [0.55, 0.8], 2: [-0.35, -0.5], 5: [-0.2, -0.32] };

function grad(k, key, stops, attrs) {
  return once(k, key, () => { const id = k.id(key); k.def(linearGradient(id, stops, attrs)); return url(id); });
}
const GRID_V = { x1: 0, y1: 7, x2: 0, y2: 41, gradientUnits: 'userSpaceOnUse' };
/** A colored lens (LED / jewel lamp) for filled shapes: hot spot up-left, deep rim. */
const lens = (k, c) => once(k, `lens${c}`, () => {
  const id = k.id('lens');
  k.def(radialGradient(id, [[0, mix(c, '#ffffff', 0.72)], [0.42, c], [1, mix(c, '#000000', 0.3)]], { cx: 0.38, cy: 0.32, r: 0.78 }));
  return url(id);
});

/** Paint a glyph's pen as machined metal. */
function paintChrome(k, pen, { tone, styleOf }) {
  const f = F(k), st = stateOf(tone), lit = st === 'on' || st === 'alert', b = breath(k, tone);
  const fine = k.m.u >= 1.3; // rim light and inner shadow are sub-pixel on small keys
  const chrome = grad(k, 'chrome', f.chrome, GRID_V);
  const chromeBox = grad(k, 'chromeb', f.dome, { x1: 0.15, y1: 0, x2: 0.6, y2: 1 });
  const ano = grad(k, 'ano', f.anodized(k.colors.accent), GRID_V);
  const anoBox = grad(k, 'anob', f.anodized(k.colors.accent), {});
  const entriesOf = (p) => {
    const s = styleOf(p);
    const op = clamp((s.opacity ?? 1) * (p.opacity ?? 1));
    if (op < 0.01) return [];
    const w = (s.width ?? 2.6) * (p.weight ?? 1), so = strokeOpts(p, s);
    const fillP = p.fill;
    if (st === 'off') return [{ layer: 4, a: fillP ? fillOf(k.colors.dim, op * 0.8) : strokeOf(k.colors.dim, w, op * 0.8, so) }];
    if (isLettering(p)) return [{ layer: 1, a: fillOf(f.shadow, op * f.shadowA * 0.6) }, { layer: 4, a: fillOf(p.role === 'accent' && lit ? s.color : k.colors.ink, op) }];
    const kind = p.role === 'dim' ? 'engraved' : p.role === 'spark' ? (lit ? 'led' : 'raised') : p.role === 'accent' ? (lit ? 'led' : 'anodized') : 'raised';
    const out = [];
    if (kind === 'led') {
      const c = s.color, core = mix(c, '#ffffff', k.dark ? 0.62 : 0.4);
      if (fillP) {
        out.push({ layer: 0, a: strokeOf(c, 3.2, op * f.glowA * 1.4 * b, so) });
        out.push({ layer: 3, a: strokeOf('#000000', 1.3, op * f.slotA, so) });
        out.push({ layer: 4, a: fillOf(lens(k, c), op) });
      } else {
        out.push({ layer: 0, a: strokeOf(c, w * 3.1, op * f.glowA * b, so) });
        out.push({ layer: 3, a: strokeOf('#000000', w * 1.45, op * f.slotA, so) });
        out.push({ layer: 4, a: strokeOf(c, w, op, so) });
        out.push({ layer: 5, a: strokeOf(core, w * 0.36, op * (k.dark ? 0.95 : 0.6) * b, so) });
      }
      return out;
    }
    if (kind === 'engraved') {
      if (fillP) {
        out.push({ layer: 1, a: fillOf('#ffffff', op * f.lipA) });
        out.push({ layer: 2, a: fillOf(f.shadow, op * f.innerA) });
        out.push({ layer: 4, a: fillOf(s.color, op * 0.92) });
      } else {
        out.push({ layer: 1, a: strokeOf('#ffffff', w, op * f.lipA, so) });
        if (fine) out.push({ layer: 2, a: strokeOf(f.shadow, w, op * f.innerA, so) });
        out.push({ layer: 4, a: strokeOf(s.color, w * 0.9, op * 0.95, so) });
      }
      return out;
    }
    // raised: polished chrome, or anodized color for idle accents
    const bodyS = kind === 'anodized' ? ano : chrome, bodyF = kind === 'anodized' ? anoBox : chromeBox;
    if (fillP) {
      out.push({ layer: 1, a: fillOf(f.shadow, op * f.shadowA) });
      out.push({ layer: 2, a: fillOf('#ffffff', op * f.hiA) });
      out.push({ layer: 4, a: fillOf(bodyF, op) });
    } else {
      out.push({ layer: 1, a: strokeOf(f.shadow, w * 1.05, op * f.shadowA, so) });
      if (fine) out.push({ layer: 2, a: strokeOf('#ffffff', w, op * f.hiA, so) });
      out.push({ layer: 4, a: strokeOf(bodyS, w, op, so) });
      out.push({ layer: 5, a: strokeOf('#ffffff', w * 0.28, op * f.coreA, so) });
    }
    return out;
  };
  return stack(pen, entriesOf, { layers: 6, offsets: OFFSETS });
}

// ── material ────────────────────────────────────────────────────────────────

/** Brushed-metal grain: short horizontal streaks, light and dark, fixed per surface size. */
function streaks(k, x, y, w, h, scale = 1) {
  const f = F(k), u = k.m.u;
  const count = Math.max(10, Math.round(h / (1.9 * u)));
  let light = '', dark = '';
  for (let i = 0; i < count; i++) {
    const yy = y + (h * (i + 0.5 + (hash(i, 31) - 0.5) * 0.7)) / count;
    const x0 = x + w * hash(i, 32) * 0.55, len = w * (0.22 + 0.62 * hash(i, 33)) * scale;
    const seg = `M${n(x0)} ${n(yy)}H${n(Math.min(x + w, x0 + len))}`;
    if (hash(i, 34) > 0.5) light += seg; else dark += seg;
  }
  const sw = n(Math.max(0.5, 0.32 * u), 2);
  if (light) k.add(path(light, { fill: 'none', stroke: '#ffffff', strokeWidth: sw, strokeOpacity: f.streakLight }));
  if (dark) k.add(path(dark, { fill: 'none', stroke: '#000000', strokeWidth: sw, strokeOpacity: f.streakDark }));
}

/** The anisotropic sheen of brushed metal: a soft diagonal band of light. */
function sheen(k, d, opacity) {
  const id = k.id('sheen');
  k.def(linearGradient(id, [[0, '#ffffff', 0], [0.34, '#ffffff', opacity * 0.45], [0.47, '#ffffff', opacity], [0.6, '#ffffff', opacity * 0.3], [1, '#ffffff', 0]], { x1: 0, y1: 0, x2: 1, y2: 0.42 }));
  k.add(path(d, { fill: url(id) }));
}

/** Corner flag (warn / alert / crit): a milled pennant filled with the tone, hung inside the bezel cut (BEZEL_INSET). */
function flag(k, x, y, w, c, opacity = 1) {
  const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h });
  k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: c, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
  k.add(path(`M${n(X - s)} ${n(Y)}L${n(X)} ${n(Y + s)}`, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.75, k.m.hair * 0.8)), strokeOpacity: k.dark ? 0.35 : 0.6 }));
}

/** Busy: a glint of light runs round a rounded-rect path, 1.2 s per lap. */
function glint(k, x, y, w, h, r, width) {
  const d = roundRectPath(x, y, w, h, r);
  const per = 2 * (w + h) - (8 - 2 * Math.PI) * Math.min(r, w / 2, h / 2);
  const seg = per * 0.15, off = n(-phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2) * per);
  k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(width * 2.6), strokeOpacity: 0.16, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: off, strokeLinecap: 'round' }));
  k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(width), strokeOpacity: k.dark ? 0.95 : 0.9, strokeDasharray: `${n(seg * 0.6)} ${n(per - seg * 0.6)}`, strokeDashoffset: n(+off - seg * 0.2), strokeLinecap: 'round' }));
}

/** Key geometry: bevel outer inset, bevel width, face inset, radii. */
function keyGeom(k) {
  const u = k.m.u, o = 2 * u, bw = 3.2 * u, R = k.m.radius;
  return { o, bw, fi: o + bw, R, r: Math.max(1.5 * u, R - bw) };
}

/** The key: housing, chamfered bevel, brushed face, the light channel and its LED. */
function keyFace(k, { tone = 'idle' } = {}) {
  const f = F(k), C = k.colors, W = k.w, H = k.h, u = k.m.u;
  const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
  const { o, bw, fi, R, r } = keyGeom(k);
  const hid = k.id('housing');
  k.def(linearGradient(hid, f.housing));
  k.add(rect({ width: W, height: H, fill: url(hid) }));
  // the chamfer
  const bid = k.id('bevel');
  k.def(linearGradient(bid, off ? f.matte : f.bevel, { x1: 0, y1: 0, x2: 0.85, y2: 1 }));
  k.add(path(roundRectPath(o, o, W - 2 * o, H - 2 * o, R), { fill: url(bid) }));
  if (!off) {
    const eid = k.id('rim');
    k.def(linearGradient(eid, [[0, '#ffffff', k.dark ? 0.55 : 1], [0.45, '#ffffff', 0]]));
    k.add(path(roundRectPath(o + k.m.hair / 2, o + k.m.hair / 2, W - 2 * o - k.m.hair, H - 2 * o - k.m.hair, R), { fill: 'none', stroke: url(eid), strokeWidth: n(k.m.hair) }));
  }
  // the face
  const faceD = roundRectPath(fi, fi, W - 2 * fi, H - 2 * fi, r);
  const fid = k.id('face');
  k.def(linearGradient(fid, off ? f.matte : f.face));
  k.add(path(faceD, { fill: url(fid) }));
  if (!off) {
    streaks(k, fi + r * 0.4, fi + u, W - 2 * fi - r * 0.8, H - 2 * fi - 2 * u);
    sheen(k, faceD, C.sheenOpacity);
  }
  // light leaking from the channel onto the face
  const c = lit ? k.tone(tone) : null, b = breath(k, tone);
  if (lit) {
    const wid = k.id('leak');
    k.def(radialGradient(wid, [[0, c, (k.dark ? 0.2 : 0.1) * b], [0.6, c, (k.dark ? 0.06 : 0.03) * b], [1, c, 0]], { cx: 0.5, cy: 1.08, r: 0.95 }));
    k.add(path(faceD, { fill: url(wid) }));
  }
  // the channel: dark when unlit; an LED (glow, colored body, hot core) when lit
  const ch = Math.max(1, 1.25 * u);
  if (!off) k.add(path(faceD, { fill: 'none', stroke: f.channel, strokeWidth: n(ch * 1.5), strokeOpacity: f.channelA }));
  if (lit) {
    k.add(path(faceD, { fill: 'none', stroke: c, strokeWidth: n(ch * 4), strokeOpacity: n(f.glowA * 1.2 * b, 3) }));
    k.add(path(faceD, { fill: 'none', stroke: c, strokeWidth: n(ch), strokeOpacity: b < 1 ? n(b, 3) : null }));
    k.add(path(faceD, { fill: 'none', stroke: mix(c, '#ffffff', k.dark ? 0.6 : 0.35), strokeWidth: n(Math.max(0.5, ch * 0.34)), strokeOpacity: n((k.dark ? 0.9 : 0.6) * b, 3) }));
  }
  if (flagged(tone)) flag(k, 0, 0, W, k.tone(tone), st === 'alert' ? 0.65 + 0.35 * b : 1);
  if (st === 'busy') glint(k, o + bw / 2, o + bw / 2, W - 2 * o - bw, H - 2 * o - bw, R - bw / 2, Math.max(1, 1.1 * u));
}

/** Strips, dial segments, screens and spans: a brushed plate with a chamfered top edge and a light pipe along the bottom. */
function plate(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const f = F(k), C = k.colors, u = k.m.u;
  const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
  const fid = k.id('plate');
  k.def(linearGradient(fid, off ? f.matte : f.face));
  k.add(rect({ x, y, width: w, height: h, fill: url(fid) }));
  if (!off) {
    streaks(k, x, y + u, w, h - 2 * u, 0.8);
    sheen(k, `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`, C.sheenOpacity * 0.8);
    k.add(rect({ x, y, width: w, height: Math.max(1, k.m.hair), fill: '#ffffff', fillOpacity: k.dark ? 0.2 : 0.95 }));
    k.add(rect({ x, y: y + h - Math.max(1, k.m.hair), width: w, height: Math.max(1, k.m.hair), fill: '#000000', fillOpacity: k.dark ? 0.6 : 0.18 }));
  }
  // screens get four machine screws in the corners
  if (k.ctx.kind === 'screen' && w >= 300 && h >= 150) {
    const s = k.m.safe * 0.5, rr = Math.max(2, k.m.safe * 0.2);
    for (const [sx, sy] of [[x + s, y + s], [x + w - s, y + s], [x + s, y + h - s], [x + w - s, y + h - s]]) {
      const sid = once(k, 'screw', () => { const id = k.id('screw'); k.def(radialGradient(id, [[0, k.dark ? '#9aa1ab' : '#ffffff'], [1, k.dark ? '#2a2e34' : '#9ba1a9']], { cx: 0.35, cy: 0.3, r: 0.8 })); return url(id); });
      k.add(`<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(rr)}" fill="${sid}"/>`);
      k.add(path(`M${n(sx - rr * 0.7)} ${n(sy + rr * 0.35)}L${n(sx + rr * 0.7)} ${n(sy - rr * 0.35)}`, { stroke: k.dark ? '#0b0c0e' : '#5c626a', strokeWidth: n(Math.max(0.6, rr * 0.3)) }));
    }
  }
  if (lit || st === 'busy') {
    const c = lit ? k.tone(tone) : C.beam, b = breath(k, tone);
    const ph = Math.max(1, 1.1 * u), py = y + h - 2.6 * u, px = x + k.m.safe, pw = w - 2 * k.m.safe;
    k.add(rect({ x: px, y: py - ph / 2, width: pw, height: ph * 1.8, rx: ph * 0.9, fill: f.channel, fillOpacity: f.channelA }));
    if (lit) {
      const gid = k.id('pipe');
      k.def(linearGradient(gid, [[0, c, 0], [1, c, (k.dark ? 0.28 : 0.14) * b]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
      k.add(rect({ x: px, y: py - 9 * u, width: pw, height: 9 * u, fill: url(gid) }));
      const lid = k.id('pipel');
      k.def(linearGradient(lid, [[0, c, 0], [0.08, c, 1], [0.92, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(rect({ x: px, y: py, width: pw, height: ph * 0.8, rx: ph * 0.4, fill: url(lid), fillOpacity: b < 1 ? n(b, 3) : null }));
      k.add(rect({ x: px + pw * 0.08, y: py + ph * 0.2, width: pw * 0.84, height: Math.max(0.5, ph * 0.3), fill: mix(c, '#ffffff', 0.6), fillOpacity: n((k.dark ? 0.85 : 0.5) * b, 3) }));
    } else {
      const p = phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2), gw = pw * 0.18, gx = px - gw + (pw + gw) * p;
      const lid = k.id('pipeg');
      k.def(linearGradient(lid, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(rect({ x: Math.max(px, gx), y: py, width: Math.max(0.5, Math.min(px + pw, gx + gw) - Math.max(px, gx)), height: ph * 0.8, fill: url(lid) }));
    }
    if (flagged(tone)) flag(k, x, y, w, k.tone(tone), st === 'alert' ? 0.65 + 0.35 * b : 1);
  }
}

/** Numerals are stamped (night: a cast shadow below) or engraved (day: a lit lower lip); small legends stay single, crisp outlines. */
function chromeText(k, role, str, o = {}) {
  const markup = defaultText(k, role, str, o);
  // the cast copy doubles a legend's bytes: only the big numerals get it, and only where it is more than a pixel of detail
  if (stateOf(k.toneName) === 'off' || (role !== 'value' && role !== 'hero') || k.m.u < 1.3) return markup;
  const dy = Math.max(0.75, k.m.hair * 0.9);
  return (k.dark ? castText(markup, '#000000', 0, dy, 0.7) : castText(markup, '#ffffff', 0, dy, 0.9)) + markup;
}

const draw = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'chrome',
  title: 'Chrome',
  description: 'Machined metal: chamfered keys with brushed faces, polished chrome glyphs, engraved detail and LEDs set in milled channels. Black chrome by night, satin aluminum by day.',
  tags: ['chrome', 'metal', 'machined', 'industrial', 'dark', 'light'],
  modes: { dark: NIGHT, light: DAY },
  defaultMode: 'dark',
  tones: { idle: 'accent', active: 'tint', busy: 'muted' },
  roles: {
    line: { color: 'ink', width: 2.7 },
    fill: { color: 'ink' },
    accent: { color: 'tone', width: 2.7 },
    dim: { color: 'muted', width: 2.2, opacity: 1 },
    spark: { color: 'tone' },
  },
  type: {
    eyebrow: { size: 8, weight: 700, caps: true, tracking: 0.16, color: 'muted' },
    label: { size: 10, weight: 700, caps: true, tracking: 0.1, color: 'ink', baseline: 10.5 },
    value: { size: 22, weight: 700, tabular: true, tracking: 0, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
    caption: { size: 8.5, weight: 600, tracking: 0.04, color: 'muted' },
  },
  background: keyFace,
  surface: plate,
  paintGlyph: paintChrome,
  paint(k, prim, style) { return paintChrome(k, onePen(prim), { tone: k.toneName, styleOf: () => style }); },
  text: chromeText,
  /** The button travels in, springs back past rest, and a glint sweeps the face as it settles. */
  press(k, { pressed, age }) {
    const dur = 0.5;
    if (!pressed && !(age < dur)) return null;
    const f = F(k), W = k.w, H = k.h, u = k.m.u;
    const depth = pressed ? 1 : clamp(1 - spring(age, { stiffness: 380, damping: 17 }), -0.35, 1);
    const s = 1 - 0.035 * depth, cx = W / 2, cy = H / 2, dy = 0.9 * u * depth;
    const { fi, r } = keyGeom(k);
    const faceD = roundRectPath(fi, fi, W - 2 * fi, H - 2 * fi, r);
    let overlay = '';
    if (depth > 0.02) {
      const id = k.id('sink');
      k.def(linearGradient(id, [[0, '#000000', (k.dark ? 0.6 : 0.32) * depth], [0.3, '#000000', 0], [0.85, '#ffffff', 0], [1, '#ffffff', (k.dark ? 0.12 : 0.5) * depth]]));
      overlay += path(faceD, { fill: url(id) });
    }
    if (!pressed && age > 0.03 && age < 0.4 && !k.ctx.reduced) {
      const p = outCubic(clamp((age - 0.03) / 0.37)), bx = lerp(-0.45 * W, 1.45 * W, p), half = W * 0.22;
      const id = k.id('glint');
      k.def(linearGradient(id, [[0, '#ffffff', 0], [0.5, '#ffffff', (k.dark ? 0.32 : 0.6) * (1 - p * 0.6)], [1, '#ffffff', 0]], { x1: bx - half, y1: 0, x2: bx + half, y2: H * 0.35, gradientUnits: 'userSpaceOnUse' }));
      overlay += path(faceD, { fill: url(id) });
    }
    return {
      transform: Math.abs(depth) > 0.002 ? `translate(${n(cx)} ${n(cy + dy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
      under: rect({ width: W, height: H, fill: f.housing[1][1] }),
      overlay,
    };
  },
  glyphs: {
    /** A ribbon capsule: polished shell, engraved grille slots, a yoke and stand; voice waves are LEDs when live. */
    mic(g, s) {
      if (s.state !== 'on' && s.state !== 'off') return draw('mic')(g, s);
      const on = s.state === 'on';
      g.rect(17.5, 6, 13, 21, { r: 6.5 });
      for (const y of [11.5, 15, 18.5, 22]) g.line(21, y, 27, y, { role: 'dim', weight: 0.5 });
      g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
      g.line(24, 32.5, 24, 39);
      g.line(17.5, 40, 30.5, 40);
      if (on) {
        const a = pulse(s.t, 1.6), b = pulse(s.t + 0.8, 1.6);
        g.arc(24, 16.5, 13.5, 60, 120, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.8 });
        g.arc(24, 16.5, 13.5, 240, 300, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.8 });
        g.arc(24, 16.5, 17.5, 64, 116, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.7 });
        g.arc(24, 16.5, 17.5, 244, 296, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.7 });
      } else {
        const k = arrive(s.since, 0.32);
        if (k > 0.02) g.line(10, 8, 10 + 28 * k, 8 + 32 * k, { role: 'accent', weight: 1.1 });
      }
    },
    /** A watch dial: polished case, baton indices (engraved minutes, raised quarters), tapered hands, a blued minute hand. */
    clock(g, s) {
      g.circle(24, 24, 17.5);
      for (let i = 0; i < 12; i++) {
        const major = i % 3 === 0;
        const [x1, y1] = g.polar(24, 24, major ? 10 : 11.8, i * 30), [x2, y2] = g.polar(24, 24, 13.6, i * 30);
        g.line(x1, y1, x2, y2, { role: major ? 'line' : 'dim', weight: major ? 0.75 : 0.45, cap: 'butt' });
      }
      const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
      const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
      const blade = (deg, len, w, role) => {
        const [tx, ty] = g.polar(24, 24, len, deg), [bx, by] = g.polar(24, 24, 2.6, deg + 180);
        const [lx, ly] = g.polar(24, 24, w / 2, deg - 90), [rx, ry] = g.polar(24, 24, w / 2, deg + 90);
        g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role, join: 'round', fill: true });
      };
      blade(h * 30, 8.6, 3.4, 'fill');
      blade(m * 6, 12.8, 2.6, 'accent');
      if (typeof s.params.s === 'number') { const [x, y] = g.polar(24, 24, 13, s.params.s * 6); g.line(24, 24, x, y, { role: 'accent', weight: 0.35 }); }
      g.dot(24, 24, 1.7);
    },
  },
});

export { keyFace, plate, paintChrome, stateOf };
