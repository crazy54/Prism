// porcelain — glossy white ceramic with cobalt painting. Every key is a pillowy glazed
// tile resting on a kiln shelf: a soft contact shadow, glaze pooling bluish at the rim,
// a softbox reflection across the top and a hot specular spot.
//
//   Day    white porcelain, cobalt underglaze, gold luster (the signature mode)
//   Night  cobalt-glazed porcelain, white slip painting, gold luster — for LCD keys at night
//
// Roles are ceramic techniques:
//   line   underglaze brushwork — the pigment feathers into the glaze (a soft bleed),
//          a glaze gloss runs along the top of each stroke
//   fill   a painted wash with a crisp contour and a glossy top
//   dim    a lighter, thinner wash (Delft paints in two blues)
//   accent vivid cobalt when idle; raised overglaze enamel in the tone when lit — it
//          stands proud of the glaze (a cast shadow, a bright gloss)
//   spark  an enamel bead
// States: idle (plain glazed tile) · on (a china band in the tone with a gold line inside,
// enamel accents, a tinted glaze pool) · alert (the band breathes 1 Hz for 10 s then holds,
// an enamel corner — never color alone) · busy (a glint of gold luster runs round the gold
// line, 1.2 s a lap) · off (bisque: unglazed, matte, faint).
// Press: the tile gives a little and the gloss dims; on release it rings like fine china —
// two thin rings spread from the center and fade. Bespoke art: clock (a china dial: double
// rim, hour dots, brushstroke hands) and bulb (a painted sunburst of enamel petals) — D4.

import { defineTheme, defaultText, bezelCorner } from './_theme.js';
import { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, pulse, phase, outCubic, arrive, outExpo } from '../scene/easing.js';
import { getGlyph } from '../glyphs/_registry.js';
import { stack, onePen, isLettering, strokeOf, fillOf, strokeOpts, once } from './_d4-layers.js';

const DAY = {
  bg: '#d6d9e1', surface: '#fbfcfe', surface2: '#d6deeb', line: '#c3cbdb',
  ink: '#132c6e', muted: '#42568b', dim: '#7886ac',
  accent: '#1f4fd0', accent2: '#a3761f', pos: '#1b7754', info: '#1f60c2', warn: '#a05a00', neg: '#ad2530', crit: '#981a5a',
  edge: '#ffffff', edgeOpacity: 1, beam: '#c8952c', beamOpacity: 0.9, sheenOpacity: 0.85,
  spectrum: { l: 0.52, c: 0.15 },
};
const NIGHT = {
  bg: '#040818', surface: '#1d3584', surface2: '#0c1a49', line: '#2c448f',
  ink: '#f5f7fd', muted: '#aebbe6', dim: '#7f90c6',
  accent: '#e6bb62', accent2: '#8fb3ff', pos: '#82dcb0', info: '#94c2ff', warn: '#ffc963', neg: '#ff8c7c', crit: '#ff88c1',
  edge: '#ffffff', edgeOpacity: 0.5, beam: '#f0c873', beamOpacity: 0.9, sheenOpacity: 0.42,
  spectrum: { l: 0.78, c: 0.13 },
};

const GLAZE = {
  light: {
    shelf: [[0, '#e3e6ed'], [1, '#cdd2db']], tile: [[0, '#ffffff'], [0.38, '#f6f8fb'], [0.72, '#e7ecf4'], [1, '#d3dbe9']], bisque: [[0, '#efebe4'], [1, '#ddd8cf']],
    shadow: '#55618a', shadowA: 0.22, pool: '#aebbd6', poolA: 0.55, gloss: 0.95, bleed: 0.17, glossStroke: 0.62, bounce: 0.5, gold: '#a3761f', ring: '#1f4fd0',
  },
  dark: {
    shelf: [[0, '#0a1331'], [1, '#03060f']], tile: [[0, '#2c4aa6'], [0.55, '#1b3283'], [1, '#0b1846']], bisque: [[0, '#2d3244'], [1, '#22263a']],
    shadow: '#000000', shadowA: 0.55, pool: '#050c2a', poolA: 0.6, gloss: 0.3, bleed: 0.17, glossStroke: 0.34, bounce: 0.12, gold: '#e6bb62', ring: '#e6bb62',
  },
};
const G = (k) => GLAZE[k.dark ? 'dark' : 'light'];

const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'on', neg: 'on', alert: 'alert', crit: 'alert', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const flagged = (tone) => tone === 'warn' || tone === 'alert' || tone === 'crit';
const breath = (k, tone) => (stateOf(tone) !== 'alert' || k.ctx.reduced || k.ctx.since >= 10 ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));

// layers: 0 bleed · 1 enamel cast shadow (down-right) · 2 wash · 3 body · 4 enamel gloss fill · 5 glaze gloss (up-left)
const OFFSETS = { 1: [0.35, 0.6], 5: [-0.3, -0.45] };

/** A glossy top for filled shapes (bounding-box gradient: glaze catching the softbox). */
const glossBox = (k) => once(k, 'glossb', () => { const id = k.id('glossb'); k.def(linearGradient(id, [[0, '#ffffff', 0.7], [0.42, '#ffffff', 0.12], [0.5, '#ffffff', 0]])); return url(id); });

function paintPorcelain(k, pen, { tone, styleOf }) {
  const gz = G(k), st = stateOf(tone), lit = st === 'on' || st === 'alert';
  const base = k.dark ? k.colors.surface : '#ffffff';
  const entriesOf = (p) => {
    const s = styleOf(p);
    const op = clamp((s.opacity ?? 1) * (p.opacity ?? 1));
    if (op < 0.01) return [];
    const w = (s.width ?? 2.6) * (p.weight ?? 1), so = strokeOpts(p, s), c = s.color;
    if (st === 'off') return [{ layer: 3, a: p.fill ? fillOf(k.colors.dim, op * 0.75) : strokeOf(k.colors.dim, w, op * 0.75, so) }];
    if (isLettering(p)) return [{ layer: 3, a: fillOf(c, op) }];
    const enamel = (p.role === 'accent' && lit) || p.role === 'spark';
    if (enamel) {
      if (p.fill) return [
        { layer: 1, a: fillOf(gz.shadow, op * 0.3) },
        { layer: 3, a: fillOf(c, op) },
        { layer: 4, a: fillOf(glossBox(k), op) },
      ];
      return [
        { layer: 1, a: strokeOf(gz.shadow, w * 1.1, op * 0.28, so) },
        { layer: 3, a: strokeOf(c, w, op, so) },
        { layer: 5, a: strokeOf('#ffffff', w * 0.34, op * 0.78, so) },
      ];
    }
    const thin = p.role === 'dim';
    if (p.fill) return [
      { layer: 0, a: strokeOf(c, 1.7, op * gz.bleed, so) },
      { layer: 2, a: fillOf(mix(c, base, k.dark ? 0.08 : 0.16), op) },
      { layer: 3, a: strokeOf(c, 1.05, op, so) },
      { layer: 4, a: fillOf(glossBox(k), op * (k.dark ? 0.6 : 0.9)) },
    ];
    return [
      { layer: 0, a: strokeOf(c, w * 1.95, op * gz.bleed, so) },
      { layer: 3, a: strokeOf(c, w, op, so) },
      thin ? null : { layer: 5, a: strokeOf('#ffffff', w * 0.26, op * gz.glossStroke, so) },
    ];
  };
  return stack(pen, entriesOf, { layers: 6, offsets: OFFSETS });
}

// ── material ────────────────────────────────────────────────────────────────

function tileGeom(k) {
  const u = k.m.u, o = 1.6 * u;
  return { o, R: Math.min(13 * u, (Math.min(k.w, k.h) - 2 * o) / 2), band: 4.6 * u, bandW: 2.1 * u, gold: 6.6 * u };
}

/** The softbox reflection and specular spot (glaze), plus bounce light along the bottom. */
function gloss(k, x, y, w, h, r, strength = 1) {
  const gz = G(k), u = k.m.u;
  const id = k.id('softbox');
  k.def(linearGradient(id, [[0, '#ffffff', gz.gloss * strength], [0.6, '#ffffff', gz.gloss * 0.55 * strength], [1, '#ffffff', gz.gloss * 0.18 * strength]]));
  const bx = x + Math.max(2.2 * u, r * 0.38), bw = w - 2 * (bx - x);
  const by = y + 1.3 * u, bh = h * 0.21, br = Math.min(r * 0.75, h * 0.1);
  if (!k.dark) k.add(path(roundRectPath(bx, by + 0.7 * u, bw, bh, br), { fill: '#9fb0cf', fillOpacity: 0.16 * strength }));
  k.add(path(roundRectPath(bx, by, bw, bh, br), { fill: url(id) }));
  const sid = k.id('spec');
  k.def(radialGradient(sid, [[0, '#ffffff', Math.min(1, 1.25 * gz.gloss * strength + 0.15)], [1, '#ffffff', 0]]));
  k.add(`<ellipse cx="${n(x + Math.max(r * 0.72, 5 * u))}" cy="${n(y + Math.max(r * 0.5, 3.6 * u))}" rx="${n(2.6 * u)}" ry="${n(1.5 * u)}" fill="${url(sid)}"/>`);
  if (gz.bounce) {
    const bid = k.id('bounce');
    k.def(linearGradient(bid, [[0, '#ffffff', 0], [1, '#ffffff', gz.bounce * strength]]));
    k.add(path(roundRectPath(x + r * 0.5, y + h - h * 0.14 - 0.9 * u, w - r, h * 0.14, h * 0.07), { fill: url(bid) }));
  }
}

function keyTile(k, { tone = 'idle' } = {}) {
  const gz = G(k), C = k.colors, W = k.w, H = k.h, u = k.m.u;
  const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
  const { o, R, band, bandW, gold } = tileGeom(k);
  const sh = k.id('shelf');
  k.def(linearGradient(sh, gz.shelf));
  k.add(rect({ width: W, height: H, fill: url(sh) }));
  // contact shadow on the shelf
  k.add(path(roundRectPath(o - 0.4 * u, o + 1.6 * u, W - 2 * o + 0.8 * u, H - 2 * o, R), { fill: gz.shadow, fillOpacity: n(gz.shadowA * 0.45, 3) }));
  k.add(path(roundRectPath(o, o + 0.8 * u, W - 2 * o, H - 2 * o, R), { fill: gz.shadow, fillOpacity: n(gz.shadowA, 3) }));
  // the tile
  const tileD = roundRectPath(o, o, W - 2 * o, H - 2 * o, R);
  const tid = k.id('tile');
  k.def(radialGradient(tid, off ? gz.bisque : gz.tile, { cx: 0.42, cy: 0.3, r: 0.9, fx: 0.38, fy: 0.24 }));
  k.add(path(tileD, { fill: url(tid) }));
  if (!off) k.add(path(roundRectPath(o + 0.9 * u, o + 0.9 * u, W - 2 * o - 1.8 * u, H - 2 * o - 1.8 * u, R - 0.9 * u), { fill: 'none', stroke: gz.pool, strokeWidth: n(1.8 * u), strokeOpacity: gz.poolA }));
  const b = breath(k, tone);
  if (lit) {
    const c = k.tone(tone);
    const wid = k.id('pool');
    k.def(radialGradient(wid, [[0, c, (k.dark ? 0.22 : 0.12) * b], [0.6, c, (k.dark ? 0.07 : 0.04) * b], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.9 }));
    k.add(path(tileD, { fill: url(wid) }));
    k.add(path(roundRectPath(band, band, W - 2 * band, H - 2 * band, Math.max(u, R - (band - o))), { fill: 'none', stroke: c, strokeWidth: n(bandW), strokeOpacity: b < 1 ? n(b, 3) : null }));
    k.add(path(roundRectPath(gold, gold, W - 2 * gold, H - 2 * gold, Math.max(u, R - (gold - o))), { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.55 * u)), strokeOpacity: 0.9 }));
  }
  if (st === 'busy') luster(k, gold, gold, W - 2 * gold, H - 2 * gold, Math.max(u, R - (gold - o)));
  if (!off) gloss(k, o, o, W - 2 * o, H - 2 * o, R);
  if (flagged(tone)) enamelCorner(k, o, o, W - 2 * o, H - 2 * o, R, k.tone(tone), st === 'alert' ? 0.6 + 0.4 * b : 1);
}

/** Busy: a glint of gold luster runs round the gold line, 1.2 s a lap. */
function luster(k, x, y, w, h, r) {
  const gz = G(k), u = k.m.u;
  const d = roundRectPath(x, y, w, h, r);
  k.add(path(d, { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.55 * u)), strokeOpacity: 0.45 }));
  const per = 2 * (w + h) - (8 - 2 * Math.PI) * Math.min(r, w / 2, h / 2), seg = per * 0.16;
  const off = -phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2) * per;
  k.add(path(d, { fill: 'none', stroke: k.colors.beam, strokeWidth: n(Math.max(1.4, 1.5 * u)), strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
  k.add(path(d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.5, 0.5 * u)), strokeOpacity: 0.85, strokeDasharray: `${n(seg * 0.4)} ${n(per - seg * 0.4)}`, strokeDashoffset: n(off - seg * 0.3), strokeLinecap: 'round' }));
}

/** Alerts: an enamel pennant glazed in at the top right (with its own gloss), hung inside the bezel cut (BEZEL_INSET). */
function enamelCorner(k, x, y, w, h, r, c, opacity) {
  const s = Math.min(w, h) * 0.19, rr = Math.min(r * 0.35, s * 0.2);
  const { X, Y } = bezelCorner(k);   // from the key's outer edge, where the bezel sits
  // its right-angle vertex keeps a little of the tile's rounded corner
  const d = `M${n(X - s)} ${n(Y)}H${n(X - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(X)} ${n(Y + rr)}V${n(Y + s)}Z`;
  k.add(path(d, { fill: c, fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
  k.add(path(`M${n(X - s * 0.82)} ${n(Y + s * 0.08)}L${n(X - s * 0.08)} ${n(Y + s * 0.82)}`, { fill: 'none', stroke: '#ffffff', strokeWidth: n(Math.max(0.6, k.m.hair)), strokeOpacity: 0.55, strokeLinecap: 'round' }));
}

/** Strips, dial segments, spans and screens: a glazed plaque. */
function plaque(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const gz = G(k), C = k.colors, u = k.m.u;
  const st = stateOf(tone), off = st === 'off', lit = st === 'on' || st === 'alert';
  const pid = k.id('plaque');
  k.def(linearGradient(pid, off ? gz.bisque : k.dark ? [[0, '#26429c'], [0.6, '#182e7b'], [1, '#0d1b4d']] : [[0, '#ffffff'], [0.6, '#f3f5f9'], [1, '#e2e7ef']]));
  k.add(rect({ x, y, width: w, height: h, fill: url(pid) }));
  if (!off) {
    k.add(rect({ x, y, width: w, height: Math.max(1, 1.1 * u), fill: gz.pool, fillOpacity: gz.poolA * 0.6 }));
    k.add(rect({ x, y: y + h - Math.max(1, 1.4 * u), width: w, height: Math.max(1, 1.4 * u), fill: gz.pool, fillOpacity: gz.poolA }));
  }
  // screens: a painted double border, like a plaque
  if (k.ctx.kind === 'screen' && w >= 300 && h >= 150 && !off) {
    const i1 = k.m.safe * 0.45, i2 = k.m.safe * 0.62;
    k.add(path(roundRectPath(x + i1, y + i1, w - 2 * i1, h - 2 * i1, k.m.radius * 0.8), { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1, 0.5 * u)), strokeOpacity: 0.5 }));
    k.add(path(roundRectPath(x + i2, y + i2, w - 2 * i2, h - 2 * i2, k.m.radius * 0.6), { fill: 'none', stroke: gz.gold, strokeWidth: n(Math.max(0.6, 0.3 * u)), strokeOpacity: 0.7 }));
  }
  const b = breath(k, tone);
  if (lit) {
    const c = k.tone(tone), bh = Math.max(1.5, 1.6 * u), by = y + h - 3.4 * u;
    const wid = k.id('ppool');
    k.def(linearGradient(wid, [[0, c, 0], [1, c, (k.dark ? 0.22 : 0.1) * b]]));
    k.add(rect({ x, y: y + h * 0.45, width: w, height: h * 0.55, fill: url(wid) }));
    k.add(rect({ x: x + k.m.safe, y: by, width: w - 2 * k.m.safe, height: bh, rx: bh / 2, fill: c, fillOpacity: b < 1 ? n(b, 3) : null }));
    k.add(rect({ x: x + k.m.safe, y: by - 1.5 * u, width: w - 2 * k.m.safe, height: Math.max(0.6, 0.4 * u), fill: gz.gold, fillOpacity: 0.85 }));
  }
  if (st === 'busy') {
    const gy = y + h - 3.4 * u, p = phase(k.ctx.reduced ? 0.3 : k.ctx.t, 1.2), pw = w - 2 * k.m.safe, gw = pw * 0.2;
    const gx = x + k.m.safe - gw + (pw + gw) * p;
    k.add(rect({ x: x + k.m.safe, y: gy, width: pw, height: Math.max(0.6, 0.4 * u), fill: gz.gold, fillOpacity: 0.45 }));
    const lid = k.id('lust');
    k.def(linearGradient(lid, [[0, C.beam, 0], [0.5, C.beam, 1], [1, C.beam, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    const x0 = Math.max(x + k.m.safe, gx), x1 = Math.min(x + k.m.safe + pw, gx + gw);
    if (x1 > x0) k.add(rect({ x: x0, y: gy - 0.4 * u, width: x1 - x0, height: Math.max(1, 1.2 * u), fill: url(lid) }));
  }
  if (!off) {
    const id = k.id('pgloss');
    k.def(linearGradient(id, [[0, '#ffffff', gz.gloss * 0.8], [1, '#ffffff', 0]]));
    k.add(rect({ x: x + k.m.safe * 0.5, y: y + 1.2 * u, width: w - k.m.safe, height: Math.min(h * 0.2, 14 * u), rx: Math.min(h * 0.1, 7 * u), fill: url(id) }));
  }
  if (flagged(tone)) {
    const s = Math.min(w, h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h });   // inside the bezel cut
    k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: k.tone(tone), fillOpacity: st === 'alert' ? n(0.6 + 0.4 * b, 3) : null }));
  }
}

/** Lettering is painted: large numerals carry a faint underglaze bleed. */
function porcelainText(k, role, str, o = {}) {
  const markup = defaultText(k, role, str, o);
  if (stateOf(k.toneName) === 'off' || (role !== 'value' && role !== 'hero')) return markup;
  const st = k.typeStyle(role, o);
  const bare = markup.replace(/ (stroke|stroke-width|stroke-linejoin|fill-opacity|opacity)="[^"]*"/g, '');
  const halo = bare.replace(/ fill="(#[0-9a-fA-F]{6})"/g, (m, c) => ` fill="${c}" stroke="${c}" stroke-width="${n(st.size * 0.07)}" stroke-linejoin="round" opacity="${n(G(k).bleed * 1.1, 3)}"`);
  return halo + markup;
}

const draw = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'porcelain',
  title: 'Porcelain',
  description: 'Glossy white ceramic tiles painted in cobalt: underglaze brushwork, raised enamel when lit, china bands and gold luster. By night, cobalt-glazed porcelain with white slip.',
  tags: ['porcelain', 'ceramic', 'glaze', 'cobalt', 'light', 'dark'],
  modes: { light: DAY, dark: NIGHT },
  defaultMode: 'light',
  tones: { idle: 'accent', active: 'tint', busy: 'accent2' },
  roles: {
    line: { color: 'ink', width: 2.6 },
    fill: { color: 'ink' },
    accent: { color: (k, tone) => (stateOf(tone) === 'on' || stateOf(tone) === 'alert' ? k.tone(tone) : k.colors.accent), width: 2.7 },
    dim: { color: 'muted', width: 2.1, opacity: 1 },
    spark: { color: (k, tone) => (stateOf(tone) === 'on' || stateOf(tone) === 'alert' ? k.tone(tone) : k.colors.accent) },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.18, color: 'muted' },
    label: { size: 11, weight: 600, tracking: 0.01, color: 'ink', baseline: 11 },
    value: { size: 22, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
    caption: { size: 8.5, weight: 400, tracking: 0.02, color: 'muted' },
  },
  background: keyTile,
  surface: plaque,
  paintGlyph: paintPorcelain,
  paint(k, prim, style) { return paintPorcelain(k, onePen(prim), { tone: k.toneName, styleOf: () => style }); },
  text: porcelainText,
  /** The tile gives a little and its gloss dims; on release it rings like fine china. */
  press(k, { pressed, age }) {
    const dur = 0.62;
    if (!pressed && !(age < dur)) return null;
    const gz = G(k), W = k.w, H = k.h, u = k.m.u;
    const give = pressed ? 1 : 1 - outExpo(clamp(age / 0.2));
    const s = 1 - 0.028 * give, cx = W / 2, cy = H / 2;
    const { o, R } = tileGeom(k);
    let overlay = '';
    if (give > 0.02) {
      const id = k.id('tilt');
      k.def(linearGradient(id, [[0, gz.shadow, 0.16 * give], [0.4, gz.shadow, 0]]));
      overlay += path(roundRectPath(o, o, W - 2 * o, H - 2 * o, R), { fill: url(id) });
    }
    if (!pressed && !k.ctx.reduced) {
      for (const [delay, wgt] of [[0, 1], [0.13, 0.7]]) {
        const a = age - delay;
        if (a <= 0 || a > 0.48) continue;
        const p = outCubic(a / 0.48), rr = lerp(0.16, 0.64, p) * Math.min(W, H);
        overlay += `<circle cx="${n(cx)}" cy="${n(H * 0.44)}" r="${n(rr)}" fill="none" stroke="${gz.ring}" stroke-width="${n(Math.max(0.75, 0.9 * u * wgt))}" stroke-opacity="${n(0.55 * (1 - p) * wgt, 3)}"/>`;
      }
    }
    return {
      transform: give > 0.002 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
      under: rect({ width: W, height: H, fill: gz.shelf[1][1] }),
      overlay,
    };
  },
  glyphs: {
    /** A china clock dial: double rim, painted hour dots (quarters as diamonds), brushstroke hands, an enamel center. */
    clock(g, s) {
      g.circle(24, 24, 17.5);
      g.circle(24, 24, 15.2, { role: 'dim', weight: 0.42 });
      for (let i = 0; i < 12; i++) {
        const [x, y] = g.polar(24, 24, 12.4, i * 30);
        if (i % 3 === 0) {
          const [ax, ay] = g.polar(24, 24, 13.9, i * 30), [bx, by] = g.polar(24, 24, 10.9, i * 30);
          const [lx, ly] = g.polar(x, y, 1.1, i * 30 - 90), [rx, ry] = g.polar(x, y, 1.1, i * 30 + 90);
          g.polygon([[ax, ay], [lx, ly], [bx, by], [rx, ry]], { role: 'fill' });
        } else g.circle(x, y, 0.85, { role: 'dim', fill: true });
      }
      const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
      const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
      const stroke = (deg, len, w, role) => {
        const [tx, ty] = g.polar(24, 24, len, deg), [mx, my] = g.polar(24, 24, len * 0.42, deg);
        const [lx, ly] = g.polar(mx, my, w / 2, deg - 90), [rx, ry] = g.polar(mx, my, w / 2, deg + 90), [bx, by] = g.polar(24, 24, 1.6, deg + 180);
        g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role, fill: true, join: 'round' });
      };
      stroke(h * 30, 9, 3.6, 'fill');
      stroke(m * 6, 13, 2.8, 'accent');
      g.circle(24, 24, 2, { role: 'spark' });
    },
    /** A painted bulb: brushed glass and filament; switched on, a sunburst of enamel petals opens around it. */
    bulb(g, s) {
      if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
      const on = s.state === 'on';
      g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
      g.line(19, 32.5, 19, 35.5);
      g.line(29, 32.5, 29, 35.5);
      g.line(19, 35.5, 29, 35.5);
      g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
      g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8 });
      if (!on) return;
      const k = arrive(s.since, 0.45);
      [-72, -36, 0, 36, 72].forEach((a, i) => {
        const open = clamp(k * 1.6 - i * 0.12);
        if (open <= 0.02) return;
        const breathe = 0.82 + 0.18 * pulse(s.t + i * 0.24, 2.4);
        const r0 = 12.6, r1 = r0 + 3.6 * open * breathe;
        const [bx, by] = g.polar(24, 22.5, r0, a), [tx, ty] = g.polar(24, 22.5, r1, a);
        const [lx, ly] = g.polar(24, 22.5, r0 + (r1 - r0) * 0.45, a - 7), [rx, ry] = g.polar(24, 22.5, r0 + (r1 - r0) * 0.45, a + 7);
        g.polygon([[bx, by], [lx, ly], [tx, ty], [rx, ry]], { role: 'accent', fill: true, join: 'round' });
      });
    },
  },
});

export { keyTile, plaque, paintPorcelain, stateOf };
