// Refraction — Prism's design language, translated to terminal cells.
//
// "White light in, every color out." The terminal chrome (catalog browser,
// live player, curl site) is built from a handful of parts, all defined here
// and documented with rendered examples in docs/refraction-terminal.md:
//
//   the beam        a hairline rule (─) lit where the light enters and fading
//                   along its length, ending in a glint of spectrum
//   the mark        ──◢◣━━━  beam in, the prism, the spectrum out  (7-bit: --/\===)
//   spectral index  every gallery owns a hue on Refraction's OKLCH spectrum and
//                   a wavelength label (λ 436 … λ 583), from design/tokens.json
//   instrument      mono, upper-case labels with coordinates and counts:
//   labels          01 / CHARTS & METRICS · 30 · λ 436
//   glass           one hairline frame with shared dividers, lit top/left
//                   edges; a hue-washed lift for the selected row; focus is
//                   the beam running along the focused pane's top edge
//
// Colors are data (TOKENS, synced from design/tokens.json; the gallery hues come
// through src/themes.js) so a token change is a data edit. Everything else
// derives from the active theme (bg, panel, panel2, line, ink, muted, dim,
// accent), so Cloudscape or Primer get the same grammar in their own colors;
// Prism Night / Day get it as designed.
//
// Pure module (no node:*): safe for the web catalog and the site builder.

import { NONE, mix, fromOklab, luminance, parse } from './color.js';
import { TERMINAL_GALLERIES } from './themes.js';
import { ATTR } from './buffer.js';
import { Canvas } from './canvas.js';

// ── tokens ──────────────────────────────────────────────────────────────────

export const TOKENS = {
  source: 'design/tokens.json 1.2.2',
  // The spectrum: OKLCH, violet (296°) → rose (8°), decreasing hue. Tiers per
  // mode: ink = text-safe (≥ 4.5:1 on every surface), vivid = marks / beams /
  // glints (≥ 3:1). `site` is for curl pages, which land on a terminal
  // background we can't see — mid-tones that read on dark and light alike.
  spectrum: {
    hueStart: 296, hueEnd: 8,
    night: { L: 0.795, C: 0.105 }, nightVivid: { L: 0.715, C: 0.13 },
    day: { L: 0.525, C: 0.15 }, dayVivid: { L: 0.64, C: 0.16 },
    site: { L: 0.70, C: 0.13 },
    // (hue, λ nm) of the 12 stops, for labelling hues without a token.
    lambda: [[296, 436], [269.8, 472], [243.6, 479], [217.5, 485], [191.3, 492], [165.1, 510], [138.9, 554], [112.7, 569], [86.5, 578], [60.4, 585], [34.2, 597]],
  },
  // galleries.terminal: one λ per gallery across surfaces (tokens 1.3.0) — a gallery with a
  // web counterpart (charts, fx, text … status → notify, diagrams → arch) wears the web hue and λ;
  // terminal-only galleries take free half-steps of the web ramp.
  // Generated into src/themes.js (TERMINAL_GALLERIES) by scripts/sync-themes.mjs;
  // each also carries its designed xterm-256 indexes (night256, day256, …Vivid256).
  galleries: Object.fromEntries(TERMINAL_GALLERIES.map(({ id, ...g }) => [id, g])),
  // The terminal surface's own hue (galleries.surfaces: "phosphor mint").
  surface: { h: 163, lambda: 'λ 514' },
  // rf.night / rf.day beam-core: white light at Night, the brand violet by Day.
  beam: { night: 0xffffff, day: 0x7353bb },
  // The curl site can't see the reader's background. Its text colors are
  // "balanced" tones — relative luminance ≈ 0.18, which is ≥ 4.5:1 on both a
  // black and a white terminal — computed from these hues (siteTone below).
  site: {
    Y: 0.18,
    accent: { h: 296, C: 0.15 },  // section labels — the brand violet
    cmd: { h: 252, C: 0.11 },     // commands
    C: 0.13,                      // gallery hues
    beam: 0xd0d0d0,               // the beam's bright head (decorative; white light)
    line: 0x767676,               // hairlines (Y ≈ 0.18 too)
  },
};

// ── color ───────────────────────────────────────────────────────────────────

/** OKLCH → packed sRGB, reducing chroma until the color is inside the gamut. */
export function oklch(L, C, h) {
  const a = (h * Math.PI) / 180;
  for (let c = C; c >= 0; c -= 0.01) {
    const A = c * Math.cos(a), B = c * Math.sin(a);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    if (r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001) return fromOklab([L, A, B]);
  }
  return fromOklab([L, 0, 0]);
}

/** WCAG relative luminance of a packed color. */
export function relLuminance(c) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255);
}

/** A hue at the luminance that reads on dark and light backgrounds alike (curl site). */
export function siteTone(h, C = TOKENS.site.C, Y = TOKENS.site.Y) {
  let lo = 0.3, hi = 0.85, c = 0;
  for (let i = 0; i < 22; i++) {
    const L = (lo + hi) / 2;
    c = oklch(L, C, h);
    if (relLuminance(c) < Y) lo = L; else hi = L;
  }
  return c;
}

const isDark = (th) => (th?.mode ? th.mode !== 'light' : luminance(th?.bg ?? 0) < 0.5);

/**
 * A spectral color for a hue. tier: 'night' | 'nightVivid' | 'day' | 'dayVivid'
 * | 'site', or a theme (its mode's vivid tier).
 */
export function spectral(hue, tier = 'nightVivid') {
  if (tier === 'site') return siteTone(((hue % 360) + 360) % 360);
  const k = typeof tier === 'string' ? tier : isDark(tier) ? 'nightVivid' : 'dayVivid';
  const { L, C } = TOKENS.spectrum[k] || TOKENS.spectrum.nightVivid;
  return oklch(L, C, ((hue % 360) + 360) % 360);
}

/** Hue at u ∈ [0, 1] along the spectrum, violet → rose. */
export const rampHue = (u) => TOKENS.spectrum.hueStart - u * (TOKENS.spectrum.hueStart - TOKENS.spectrum.hueEnd);

/** Wavelength (nm) for a hue, interpolated between the spectrum's stops. */
export function lambdaOf(hue) {
  const t = TOKENS.spectrum.lambda;
  if (hue >= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    const [h1, l1] = t[i], [h0, l0] = t[i - 1];
    if (hue >= h1) return Math.round(l1 + ((hue - h1) / (h0 - h1)) * (l0 - l1));
  }
  return t[t.length - 1][1];
}

/** Hue of a gallery (unknown ids get a stable hue from their name). */
export function galleryHue(id) {
  const g = TOKENS.galleries[id];
  if (g) return g.h;
  let x = 0;
  for (const c of String(id)) x = (x * 31 + c.codePointAt(0)) % 360;
  return x;
}

/** "λ 467" (Unicode) or "467nm" (7-bit). */
export function lambdaLabel(id, unicode = true) {
  const label = TOKENS.galleries[id]?.lambda || `λ ${lambdaOf(galleryHue(id))}`;
  const nm = label.replace(/^λ\s*/, '');
  // "494c": a purple has no wavelength of its own — the label is its complementary one.
  return unicode ? label : /c$/.test(nm) ? nm : `${nm}nm`;
}

const PARSED = new Map();
const hex = (s) => { let c = PARSED.get(s); if (c === undefined) PARSED.set(s, (c = parse(s))); return c; };

/** A gallery's color: tier 'night' | 'day' (text-safe ink) or 'nightVivid' | 'dayVivid' (marks). */
export function galleryColor(id, tier = 'night') {
  const g = TOKENS.galleries[id];
  return g ? hex(g[tier]) : spectral(galleryHue(id), tier);
}

// ── glyphs ──────────────────────────────────────────────────────────────────

/** Chrome glyphs with 7-bit fallbacks (TERM=linux, LANG=C, serial lines). */
export function glyphs(unicode = true) {
  return unicode
    ? { h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', tj: '┬', bj: '┴', lj: '├', rj: '┤', glint: '━', swatch: '▌', sel: '▸', dot: '·', mark: '◆', prismL: '◢', prismR: '◣', left: '◀', right: '▶', ell: '…', caret: '▏', up: '↑', down: '↓', enter: '⏎', tab: '⇥', lr: '←→', ud: '↑↓', bar: '┃', pause: '❚❚' }
    : { h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', tj: '+', bj: '+', lj: '+', rj: '+', glint: '=', swatch: '|', sel: '>', dot: '-', mark: '*', prismL: '/', prismR: '\\', left: '<', right: '>', ell: '~', caret: '_', up: '^', down: 'v', enter: 'Enter', tab: 'Tab', lr: '<>', ud: 'jk', bar: '#', pause: '||' };
}

// ── chrome palette ──────────────────────────────────────────────────────────

/**
 * Chrome colors for a resolved theme at a color depth. Everything is derived
 * from the theme, so any theme gets the grammar; Prism Night / Day just get it
 * in the colors it was designed in.
 *   low   true at 16 colors / mono: subtle lifts (panel2) vanish there, so the
 *         selection becomes a solid hue bar (16) or inverse video (mono)
 */
export function chrome(th, depth = 'truecolor') {
  const dark = isDark(th);
  const surface = dark ? 'night' : 'day';
  const vividTier = dark ? 'nightVivid' : 'dayVivid';
  // White light at Night; by Day the beam is the brand violet (rf.day beam-core).
  const beam = dark ? TOKENS.beam.night : th.ds === 'prism' ? TOKENS.beam.day : th.accent;
  // At 16 colors a hairline as dark as the glass would quantize to the
  // background and vanish; lift it until it lands on "bright black".
  const sixteen = depth === '16';
  const line = sixteen ? mix(th.line, th.ink, 0.45) : th.line;
  return {
    th, dark, surface, depth,
    mono: depth === 'mono',
    low: depth === 'mono' || sixteen,
    bg: th.bg, panel: th.panel, glass: th.panel2, ink: th.ink, muted: th.muted, dim: th.dim, accent: th.accent,
    line,
    edge: sixteen ? line : mix(th.line, th.ink, dark ? 0.2 : 0.16),   // the lit (top / left) edge of a frame
    beam,
    hue: (id) => galleryColor(id, surface),          // text-safe (λ labels, a lit title)
    vivid: (id) => galleryColor(id, vividTier),      // marks: swatches, glints
    spectrum: (hue) => spectral(hue, vividTier),     // light: fans, fringes, sweeps

  };
}

// ── parts ───────────────────────────────────────────────────────────────────

/**
 * The beam: a hairline rule lit from `from` (a column offset into the run),
 * fading to the line color over `reach` cells, optionally ending in a spectral
 * glint (`glint: { at, hue, n }` — n cells of spectrum centered on `hue`).
 * With `lit: false` it is a plain hairline. Returns nothing; draws on `s`.
 */
export function beam(s, x, y, w, P, { from = 0, reach, lit = true, glint = null, ch, attr = 0, unicode = true } = {}) {
  const c = ch || glyphs(unicode).h;
  reach = reach ?? Math.max(6, w * 0.45);
  for (let i = 0; i < w; i++) {
    const d = Math.abs(i - from);
    const k = lit ? Math.exp(-d / reach) : 0;
    s.set(x + i, y, c, P.mono ? undefined : mix(P.line, P.beam, k), undefined, attr);
  }
  if (glint && !P.mono) {
    const n = glint.n ?? 5;
    for (let j = 0; j < n; j++) {
      const gx = x + glint.at - Math.floor(n / 2) + j;
      if (gx >= x && gx < x + w) s.set(gx, y, c, P.spectrum(glint.hue + (j - (n - 1) / 2) * (glint.spread ?? 16)));
    }
  }
}

/**
 * The mark: ─◢◣━ (beam in, prism, spectrum out). `beamW` and `raysW` cells of
 * beam and spectrum around the 2-cell prism. Returns the column after it.
 * 7-bit: --/\==.  Mono: plain glyphs, the prism in bold.
 */
export function mark(s, x, y, P, { beamW = 3, raysW = 4, unicode = true } = {}) {
  const G = glyphs(unicode);
  for (let i = 0; i < beamW; i++) s.set(x + i, y, G.h, P.mono ? undefined : mix(P.line, P.beam, (i + 1) / beamW));
  s.set(x + beamW, y, G.prismL, P.mono ? undefined : P.beam, undefined, P.mono ? ATTR.BOLD : 0);
  s.set(x + beamW + 1, y, G.prismR, P.mono ? undefined : P.accent, undefined, P.mono ? ATTR.BOLD : 0);
  for (let i = 0; i < raysW; i++) s.set(x + beamW + 2 + i, y, G.glint, P.mono ? undefined : P.spectrum(rampHue(i / Math.max(1, raysW - 1))));
  return x + beamW + 2 + raysW;
}

/** Instrument label: parts joined by " · ", upper-cased. */
export function instrument(parts, sep = ' · ') {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join(sep).toUpperCase();
}

/** Two-digit coordinate: 1 → "01". */
export const coord = (n) => String(n).padStart(2, '0');

// ── First Light ─────────────────────────────────────────────────────────────

/** How long the intro runs (s): the full version, and the echo on later launches. */
export const FIRST_LIGHT = { full: 1.5, echo: 0.32 };

export const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const easeOutCubic = (p) => 1 - (1 - p) ** 3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Seconds a Day ↔ Night (or any theme) relight sweep takes. */
export const SWEEP_S = 0.42;

/**
 * The relight sweep: the new frame (already in `s`) is revealed left to right
 * behind a vertical beam of white light with a spectral fringe; cells right of
 * the beam still show `old` (a same-sized CellBuffer). p = 0…1.
 */
export function sweep(s, old, p, P) {
  const W = s.width, H = s.height;
  if (!old || old.width !== W || old.height !== H) return;
  const front = Math.round(easeOutExpo(clamp01(p)) * (W + 6)) - 3;
  for (let y = 0; y < H; y++) {
    for (let x = Math.max(0, front + 1); x < W; x++) {
      const c = old.get(x, y);
      s.set(x, y, c.ch, c.fg, c.bg, c.attr);
    }
    const hue = rampHue(y / Math.max(1, H - 1));
    for (let k = 0; k < 4; k++) {
      const x = front - k;
      if (x < 0 || x >= W) continue;
      const c = s.get(x, y);
      const glow = k === 0 ? P.beam : mix(P.bg, P.spectrum(hue + k * 12), 0.75 - k * 0.18);
      s.set(x, y, c.ch, k === 0 ? P.bg : c.fg, glow);
    }
  }
}

/**
 * First Light, drawn over a finished frame of the app in `s` (the app is
 * already painted; this masks and lights it). p = 0…1 through the intro.
 *   0.00–0.25  dark glass; a hairline of white light crosses to the prism
 *   0.12–0.30  the prism (a braille triangle at the center) materializes
 *   0.22–0.50  the light strikes it and fans into the spectrum
 *   0.55–1.00  the spectrum paints the app in, left to right, behind a
 *              front of white light dispersing into color
 * `echo` is the short version for later launches: just the paint-in.
 * Never called for mono / 7-bit / reduced motion (the caller decides).
 */
let flCanvas = null;
export function firstLight(s, p, P, { echo = false, cy } = {}) {
  const W = s.width, H = s.height;
  cy = cy ?? Math.floor(H / 2);
  const reveal = echo ? easeOutExpo(clamp01(p)) : easeOutCubic(clamp01((p - 0.55) / 0.45));
  const edge = Math.round(reveal * (W + 10)) - 5;
  // Everything right of the paint-in front is still dark glass.
  for (let y = 0; y < H; y++) for (let x = Math.max(0, edge); x < W; x++) s.set(x, y, ' ', P.ink, P.bg, 0);
  if (!echo) {
    // Light, drawn at braille resolution (2×4 dots per cell) so rays stay hairlines.
    if (!flCanvas || flCanvas.cols !== W || flCanvas.rows !== H) flCanvas = new Canvas(W, H, { mode: 'braille', threshold: 0 });
    const cv = flCanvas.clear();
    const DW = cv.width, by = cy * 4 + 2;           // beam height in dots
    const px = Math.floor(DW / 2);                  // prism apex x (dots)
    const half = 7, top = by - 9, base = by + 5;    // a 14×14-dot triangle around the beam
    // 1 · the beam travels in from the left, its head brightest.
    const head = Math.round(easeOutExpo(clamp01(p / 0.25)) * (px - half / 2));
    for (let x = 0; x <= head; x++) cv.set(x, by, mix(P.line, P.beam, Math.exp(-(head - x) / Math.max(6, DW * 0.2))));
    // 2 · the prism materializes as the light arrives.
    const a = clamp01((p - 0.12) / 0.18);
    if (a > 0) {
      const glassC = mix(P.bg, P.accent, a), lit = mix(P.bg, P.beam, a);
      cv.line(px, top, px - half, base, lit);       // the lit face
      cv.line(px, top, px + half, base, glassC);
      cv.line(px - half, base, px + half, base, glassC);
    }
    // 3 · the fan: rays leave the right face and spread toward the edge.
    const fan = easeOutExpo(clamp01((p - 0.22) / 0.28));
    if (fan > 0) {
      const ox = px + Math.round(half / 2) + 1, oy = by;
      const reach = ox + fan * (DW - ox);
      const n = 9;
      for (let r = 0; r < n; r++) {
        const u = r / (n - 1);                       // 0 = violet (top) … 1 = red (bottom)
        const slope = (u - 0.5) * 0.9 * (0.4 + 0.6 * fan) * (cv.height / Math.max(1, DW - ox)) * 1.6;
        cv.line(ox, oy, reach, oy + slope * (reach - ox), P.spectrum(rampHue(u)));
      }
    }
    // Composite the light onto the dark part of the screen only.
    for (let y = 0; y < H; y++) {
      for (let x = Math.max(0, edge); x < W; x++) {
        let mask = 0, rr = 0, gg = 0, bb = 0, k = 0;
        for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
          const c = cv.px[(y * 4 + dy) * DW + x * 2 + dx];
          if (c === NONE) continue;
          mask |= BRAILLE[dy][dx];
          rr += (c >> 16) & 255; gg += (c >> 8) & 255; bb += c & 255; k++;
        }
        if (mask) s.set(x, y, String.fromCharCode(0x2800 + mask), ((rr / k) << 16) | ((gg / k) << 8) | (bb / k | 0), P.bg, 0);
      }
    }
  }
  // The paint-in front: a column of white light with a spectral fringe behind it.
  for (let y = 0; y < H; y++) {
    const c = P.spectrum(rampHue(y / Math.max(1, H - 1)));
    for (let k = 0; k < 5; k++) {
      const x = edge - 1 - k;
      if (x < 0 || x >= W) continue;
      const cell = s.get(x, y);
      const glow = k === 0 ? mix(P.bg, P.beam, 0.55) : mix(P.bg, c, 0.6 - k * 0.12);
      s.set(x, y, cell?.ch || ' ', mix(cell?.fg >= 0 ? cell.fg : P.ink, P.beam, k === 0 ? 0.6 : 0.25), glow);
    }
  }
}

const BRAILLE = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
