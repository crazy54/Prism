// mono — maximal contrast, accessibility first: the theme for low vision and bright rooms.
// Pure black and white (21 : 1), every text color at WCAG AAA (≥ 7 : 1), and a state
// language that never rests on color or faint detail:
//
//   idle      black face, a 3 : 1 gray frame so every key has an edge, white glyph
//   on        a heavy frame and the label printed reverse (black on a white band)
//   warn      a dashed frame + a triangle badge with a knocked-out "!"
//   alert     a heavy segmented frame that marches for 10 s then holds + a corner notch with "!"
//   crit      alert + the label printed reverse in the critical color
//   busy      a bold segment travels the frame (2 s a lap — slow, never a flicker)
//   disabled  no frame; glyph and label in the dim gray — still AAA (8.3 : 1 night, 7.2 : 1 day)
//   press     the frame snaps in thick and the face drops 6 % — instant, no lingering motion
//
// Role painting is tuned for legibility: thick strokes; accents get a knockout keyline so a
// strike never merges with what it crosses; sparks are enlarged; dim detail stays full
// contrast (thinner, never gray); and no element animates below 55 % opacity. Semantic colors
// (all ≥ 7 : 1) appear only as redundant cues on top of shape. Type is bold, sentence case and
// larger; nothing below 9.5 px at 72. Day is black on white for bright rooms.
//
// Bespoke art (simplified silhouettes for low vision): cpu, broadcast, clock, volume — D5.

import { defineTheme, defaultText, bezelCorner } from './_theme.js';
import { rect, path, polygon, n, roundRectPath } from '../scene/svg.js';
import { clamp, outCubic, phase, arrive } from '../scene/easing.js';
import { pathBounds } from '../scene/geom.js';
import { capHeight, wrapText } from '../scene/text.js';
import { layeredPaint, strokeA, fillA } from './_d5-print.js';
import { getGlyph } from '../glyphs/_registry.js';

const NIGHT = {
  bg: '#000000', surface: '#000000', surface2: '#000000', line: '#5e5e5e',
  ink: '#ffffff', muted: '#d4d4d4', dim: '#a3a3a3',
  accent: '#ffffff', accent2: '#ffd23f', pos: '#4fe08a', info: '#7cc4ff', warn: '#ffd23f', neg: '#ff7a7a', crit: '#ff5fa2',
  edge: '#ffffff', edgeOpacity: 0, beam: '#ffffff', beamOpacity: 1, sheenOpacity: 0,
  spectrum: { l: 1, c: 0 },
  face: '#000000', reverse: '#000000',
};
const DAY = {
  bg: '#ffffff', surface: '#ffffff', surface2: '#ffffff', line: '#8a8a8a',
  ink: '#000000', muted: '#2b2b2b', dim: '#575757',
  accent: '#000000', accent2: '#6e4a00', pos: '#00632a', info: '#00459e', warn: '#6e4a00', neg: '#b0001e', crit: '#86003f',
  edge: '#000000', edgeOpacity: 0, beam: '#000000', beamOpacity: 1, sheenOpacity: 0,
  spectrum: { l: 0, c: 0 },
  face: '#ffffff', reverse: '#ffffff',
};

/** Tone → state shape. */
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'warn', neg: 'alert', alert: 'alert', crit: 'crit', busy: 'busy', off: 'off' };
const stateOf = (tone) => STATE[tone] || 'idle';
const lit = (s) => s === 'on' || s === 'crit';
/** Alert frames march for 10 s, then hold still (reduced motion: still from the start). */
const marching = (k) => !(k.ctx.reduced || k.ctx.since >= 10);

// ── the face ─────────────────────────────────────────────────────────────────

function frameRect(k, inset, width, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const i = inset + width / 2;
  return roundRectPath(x + i, y + i, w - i * 2, h - i * 2, Math.max(width, k.m.radius - i));
}

/** A badge with a knocked-out "!": a corner notch (alert) or a triangle (warn). */
function badge(k, color, kind, { x = 0, y = 0, w = k.w } = {}) {
  // both badges hang from the bezel-safe corner (key grammar: BEZEL_INSET), never from the cut corner itself
  const u = k.m.u, C = k.colors, bz = bezelCorner(k, { x, y, w, h: k.h }), X = bz.X;
  y = bz.Y;
  if (kind === 'notch') {
    const s = Math.min(16 * u, w * 0.24);
    k.add(polygon([[X - s, y], [X, y], [X, y + s]], { fill: color }));
    // the "!" sits on the notch's centroid, clear of the bezel's rounded corner
    const cx = X - s / 3, bw = Math.max(1.4, s * 0.11), bar = s * 0.27, top = y + s / 3 - (bar + bw * 1.9) / 2;
    k.add(rect({ x: cx - bw / 2, y: top, width: bw, height: bar, rx: bw / 2, fill: C.face }));
    k.add(rect({ x: cx - bw / 2, y: top + bar + bw * 0.9, width: bw, height: bw, rx: bw / 2, fill: C.face }));
    return;
  }
  const s = Math.min(13 * u, w * 0.2), m = 0;
  const ax = X - m - s / 2, ay = y + m, hgt = s * 0.88;
  k.add(polygon([[ax, ay], [ax + s / 2, ay + hgt], [ax - s / 2, ay + hgt]], { fill: color, strokeLinejoin: 'round', stroke: color, strokeWidth: n(Math.max(1, 0.8 * u)) }));
  const bw = Math.max(1.3, s * 0.11);
  k.add(rect({ x: ax - bw / 2, y: ay + hgt * 0.32, width: bw, height: hgt * 0.36, rx: bw / 2, fill: C.face }));
  k.add(rect({ x: ax - bw / 2, y: ay + hgt * 0.76, width: bw, height: bw, rx: bw / 2, fill: C.face }));
}

function face(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, u = k.m.u, s = stateOf(tone), color = k.tone(tone), R = { x, y, w, h };
  const inset = 1.5 * u;
  k.add(rect({ x, y, width: w, height: h, fill: C.face }));
  const stroke = (d, a) => k.add(path(d, { fill: 'none', ...a }));
  const base = Math.max(1, 1.5 * u);
  switch (s) {
    case 'idle': stroke(frameRect(k, inset, base, R), { stroke: C.line, strokeWidth: n(base) }); break;
    case 'on': stroke(frameRect(k, inset, 3.5 * u, R), { stroke: color, strokeWidth: n(3.5 * u) }); break;
    case 'warn': {
      const rw = 2.6 * u;
      stroke(frameRect(k, inset, rw, R), { stroke: color, strokeWidth: n(rw), strokeDasharray: `${n(7 * u)} ${n(3.5 * u)}`, strokeLinecap: 'butt' });
      badge(k, color, 'triangle', R);
      break;
    }
    case 'alert': case 'crit': {
      const rw = 4 * u, dash = 4.5 * u, gap = 3 * u;
      stroke(frameRect(k, inset, rw, R), { stroke: color, strokeWidth: n(rw), strokeDasharray: `${n(dash)} ${n(gap)}`, strokeDashoffset: marching(k) ? n(-phase(k.ctx.t, 1.5) * (dash + gap)) : null, strokeLinecap: 'butt' });
      badge(k, color, 'notch', R);
      break;
    }
    case 'busy': {
      const d = frameRect(k, inset, base, R);
      stroke(d, { stroke: C.line, strokeWidth: n(base) });
      const r = Math.max(base, k.m.radius - inset - base / 2), ww = w - (inset + base / 2) * 2, hh = h - (inset + base / 2) * 2;
      const per = 2 * (ww + hh) - (8 - 2 * Math.PI) * r, seg = per * 0.2;
      stroke(d, { stroke: C.ink, strokeWidth: n(3.5 * u), strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(-phase(k.ctx.t, 2) * per), strokeLinecap: 'round' });
      break;
    }
    default: break; // off: no frame at all
  }
}

// ── role painting ────────────────────────────────────────────────────────────

function paintMono(k, pen, { tone, styleOf }) {
  const C = k.colors, s = stateOf(tone), off = s === 'off';
  return layeredPaint(pen, (p) => {
    const st = styleOf(p);
    const raw = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
    if (raw < 0.02) return [];
    const op = 0.55 + 0.45 * raw;                       // nothing animates out of sight
    const w = (st.width ?? 3.4) * (p.weight ?? 1);
    const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
    const A = (color, width, o) => (p.fill ? fillA(color, o) : strokeA(color, width, o, so));
    // disabled: the whole glyph in the dim gray (8.3 : 1 night, 7.2 : 1 day) — no frame, no knockouts
    if (off) return [{ layer: 0, a: A(C.dim, w, op) }];
    if (p.role === 'spark') {
      const b = pathBounds(p.d), cx = b.x + b.w / 2, cy = b.y + b.h / 2, sc = b.w < 6 ? 1.45 : 1;
      const tf = sc !== 1 ? `translate(${n(cx)} ${n(cy)}) scale(${sc}) translate(${n(-cx)} ${n(-cy)})` : null;
      return [
        { layer: 3, a: { ...strokeA(C.face, 2.2, 1), transform: tf } },
        { layer: 4, a: { ...fillA(st.color, op), transform: tf } },
      ];
    }
    const accent = p.role === 'accent';
    if (!accent) return [{ layer: 0, a: A(st.color, w, op) }];
    // the knockout keyline: a face-colored outline under every accent so it never merges with what it crosses
    return [
      { layer: 1, a: p.fill ? { ...strokeA(C.face, 2.6, 1, so), fill: C.face } : strokeA(C.face, w + 2.6, 1, so) },
      { layer: 2, a: A(st.color, w, op) },
    ];
  }, { layers: 5 });
}

// ── type: bold, sentence case; lit labels print reverse ─────────────────────

function monoText(k, role, str, o = {}) {
  const s = stateOf(k.toneName);
  if (!(role === 'label' && k.ctx.kind === 'key' && lit(s))) return defaultText(k, role, str, o);
  const st = k.typeStyle('label', o), u = k.m.u;
  const by = o.y ?? k.h - (st.baseline ?? 6.5) * u;
  const room = o.maxWidth ?? k.w - (k.m.text ?? k.m.safe) * 2;
  const wr = (o.maxLines || 1) > 1 ? wrapText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps }) : null;
  const lines = wr ? wr.lines.length : 1;
  const top = by - capHeight(st.size, st.weight) - (lines - 1) * (wr ? wr.lineHeight : 0) - 2.6 * u, bot = Math.max(by + 2.6 * u, k.h - 4.4 * u);
  const bx = 3.5 * u + 1.5 * u;
  const band = rect({ x: bx, y: top, width: k.w - bx * 2, height: bot - top, rx: n(1.6 * u), fill: k.tone(k.toneName) });
  return band + defaultText(k, role, str, { ...o, color: k.colors.reverse });
}

const original = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'mono',
  title: 'Mono',
  description: 'Maximal contrast for low vision and bright rooms: pure black and white, AAA text, heavy frames, reversed labels for on, shape-coded alerts, ghosted disabled keys, bold type.',
  tags: ['accessibility', 'high contrast', 'low vision', 'black', 'white', 'aaa', 'dark', 'light'],
  modes: { dark: NIGHT, light: DAY },
  defaultMode: 'dark',
  tones: { idle: 'ink', active: 'ink', busy: 'ink', off: 'dim' },
  roles: {
    line: { color: 'ink', width: 3.4 },
    fill: { color: 'ink' },
    accent: { color: (k, tone) => (tone === 'idle' || tone === 'active' || tone === 'busy' ? k.colors.ink : k.tone(tone)), width: 3.4 },
    dim: { color: 'ink', width: 2.6 },
    spark: { color: (k, tone) => (tone === 'idle' || tone === 'active' || tone === 'busy' ? k.colors.ink : k.tone(tone)) },
  },
  type: {
    eyebrow: { size: 9.5, weight: 700, caps: true, tracking: 0.06, color: 'muted' },
    label: { size: 12.5, weight: 700, caps: false, tracking: 0.005, color: 'ink', baseline: 8 },
    value: { size: 24, weight: 700, tabular: true, tracking: -0.01, color: 'ink' },
    hero: { size: 32, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
    caption: { size: 9.5, weight: 600, color: 'muted' },
  },
  background: face,
  surface: face,
  paintGlyph: paintMono,
  text: monoText,
  glyphBox(k, { labeled }) {
    const m = Math.min(k.w, k.h);
    const size = labeled ? m * 0.54 : m * 0.74;
    return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.4 : k.h / 2) - size / 2, size };
  },
  /** The frame snaps in thick and the face drops 6 % — instant on press, gone in 0.16 s. */
  press(k, { pressed, age }) {
    const dur = 0.16;
    if (!pressed && !(age < dur)) return null;
    const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
    const u = k.m.u, cx = k.w / 2, cy = k.h / 2, sc = 1 - 0.06 * e, rw = 5 * u;
    return {
      transform: `translate(${n(cx)} ${n(cy)}) scale(${n(sc, 4)}) translate(${n(-cx)} ${n(-cy)})`,
      under: rect({ width: k.w, height: k.h, fill: k.colors.face }),
      overlay: path(frameRect(k, 0.5 * u, rw), { fill: 'none', stroke: k.colors.ink, strokeWidth: n(rw), strokeOpacity: e < 1 ? n(e, 3) : null }),
    };
  },
  glyphs: {
    /** A bold die with two pins a side and four big cores; busy lights `level` of them (1–4) — a still meter, no chase. */
    cpu(g, s) {
      if (s.state !== 'busy' && s.state !== 'idle') return original('cpu')(g, s);
      g.rect(12.5, 12.5, 23, 23, { r: 3 });
      for (const p of [19.5, 28.5]) {
        g.line(p, 7, p, 11.5, { weight: 0.9 });
        g.line(p, 36.5, p, 41, { weight: 0.9 });
        g.line(7, p, 11.5, p, { weight: 0.9 });
        g.line(36.5, p, 41, p, { weight: 0.9 });
      }
      const count = s.state === 'busy' ? Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9)) : 0;
      const k = arrive(s.since, 0.25);
      [[17.5, 17.5], [25, 17.5], [25, 25], [17.5, 25]].forEach(([x, y], i) => {
        if (i < count) g.rect(x, y, 5.5, 5.5, { r: 1, role: 'fill', opacity: i === count - 1 ? k : 1 });
        else g.rect(x + 0.6, y + 0.6, 4.3, 4.3, { r: 0.8, role: 'dim', weight: 0.5 });
      });
    },
    /** Live: a solid core and two bold waves. Offline: a hollow core and thinner waves — shape, not color. */
    broadcast(g, s) {
      if (s.state !== 'live' && s.state !== 'offline') return original('broadcast')(g, s);
      const live = s.state === 'live';
      if (live) g.circle(24, 24, 4.6, { role: 'accent', fill: true });
      else g.circle(24, 24, 4, { role: 'line', weight: 0.75 });
      [10, 16.5].forEach((r, i) => {
        const role = live ? (i ? 'line' : 'accent') : 'dim';
        g.arc(24, 24, r, 44, 136, { role, weight: live ? 1 : 0.85 });
        g.arc(24, 24, r, 224, 316, { role, weight: live ? 1 : 0.85 });
      });
    },
    /** Four heavy marks, two thick hands, a big hub. */
    clock(g, s) {
      g.circle(24, 24, 16.5);
      for (const a of [0, 90, 180, 270]) {
        const [x1, y1] = g.polar(24, 24, 11.5, a), [x2, y2] = g.polar(24, 24, 14, a);
        g.line(x1, y1, x2, y2, { weight: 0.9, cap: 'butt' });
      }
      const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
      const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
      const hand = (deg, len, o) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, o); };
      hand(h * 30, 8, { weight: 1.2 });
      hand(m * 6, 11.5, { role: 'accent', weight: 0.95 });
      g.circle(24, 24, 2.4, { role: 'fill' });
    },
    /** Level as three whole waves — each one fully on or off; muted: a bold cross. */
    volume(g, s) {
      if (s.state !== 'on' && s.state !== 'muted') return original('volume')(g, s);
      g.polygon([[8, 19], [15, 19], [23, 11.5], [23, 36.5], [15, 29], [8, 29]], { role: 'line', join: 'round' });
      if (s.state === 'muted') {
        const k = arrive(s.since, 0.2);
        if (k < 0.05) return;
        g.line(29.5, 18.5, 29.5 + 11 * k, 18.5 + 11 * k, { role: 'accent' });
        g.line(40.5, 18.5, 40.5 - 11 * k, 18.5 + 11 * k, { role: 'accent' });
        return;
      }
      const lv = Math.round(clamp(s.level) * 3);
      [7.5, 12.5, 17.5].forEach((r, i) => { if (i < lv) g.arc(23, 24, r, 52, 128, { role: i ? 'accent' : 'line' }); else g.arc(23, 24, r, 70, 110, { role: 'dim', weight: 0.6, dash: [1.4, 2.4] }); });
    },
  },
});

export { face as monoFace, stateOf as monoState };
