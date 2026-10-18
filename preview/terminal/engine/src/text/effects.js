// Time-based text effects.
//
// Every effect is a pure function of time:
//
//   effect(surface, x, y, text, t, opts) → done
//
// so the same call works inside a scene, a dashboard panel, or an inline
// animation — just pass the current t (seconds). One-shot effects (typewriter,
// decrypt, fadeIn, wipe) return true once settled; continuous ones return
// `t >= opts.duration` when a duration is given, else false.
//
// Pass `opts.font` ('standard' | 'tiny' | 'bold') to apply the effect to big
// banner text instead of plain cells; banner options (mode, scale, fill,
// shadow, outline, direction…) pass straight through. `x`/`y` may be 'center'.
// `opts.final: true` draws the settled frame (used when an animation ends).
//
// Effects draw only through the Surface API, so a View works as a target.

import { getTheme, PALETTES } from '../palettes.js';
import { NONE, parse, mix, mixOklab, scale } from '../color.js';
import { charWidth, stringWidth } from '../width.js';
import { drawBanner, measureBanner, resolveFill } from './banner.js';
import { getFont, glyph, FONTS } from './fonts.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (x) => x - Math.floor(x);
const pingpong = (x) => 1 - Math.abs(fract(x / 2) * 2 - 1);

/** Deterministic hash of two ints → [0, 1). */
function hash(a, b = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=?@<>/\\';
const GLITCH_GLYPHS = '▓▒░█▀▄▚▞▌▐';
const GLITCH_ASCII = '#%&@$*+=';

function colorOf(v, fallback) {
  if (v === undefined || v === null) return fallback;
  return typeof v === 'number' ? v : parse(v);
}

// ── shared drawing ───────────────────────────────────────────────────────────

/** Per-character gradient lookup for small text (`opts.fill`), else null. */
function smallFill(opts, th, len, phase = 0) {
  if (opts.fill === undefined || opts.fill === null) return null;
  const f = resolveFill(opts.fill, th);
  const n = f.cyclic ? Math.max(1, len) : Math.max(1, len - 1);
  return (i) => {
    let g = i / n + phase;
    g = f.cyclic ? fract(g) : phase ? pingpong(g) : clamp01(g);
    return f.at(g);
  };
}

function originSmall(surface, x, y, text) {
  const cx = x === 'center' ? Math.floor((surface.width - stringWidth(text)) / 2) : Math.round(x || 0);
  const cy = y === 'center' ? Math.floor(surface.height / 2) : Math.round(y || 0);
  return [cx, cy];
}

/**
 * Draw plain-cell text where each character may be restyled:
 * style(i, ch) → { ch, fg, bg, attr, dx, dy, hidden } | null
 */
function drawSmall(surface, x, y, text, style, base) {
  const [x0, y0] = originSmall(surface, x, y, text);
  let col = 0, i = 0;
  for (const ch of String(text)) {
    const w = charWidth(ch.codePointAt(0));
    if (w === 0) continue;
    const s = style ? style(i, ch) : null;
    if (!(s && s.hidden) && ch !== ' ') {
      surface.text(x0 + col + (s?.dx || 0), y0 + (s?.dy || 0), s?.ch ?? ch, s?.fg ?? base.fg, s?.bg ?? base.bg, s?.attr ?? base.attr);
    }
    col += w;
    i++;
  }
}

function bannerOpts(opts, th, extra) {
  return {
    font: opts.font, mode: opts.mode, scale: opts.scale, wide: opts.wide, caps: opts.caps,
    letterSpacing: opts.letterSpacing, lineSpacing: opts.lineSpacing, align: opts.align,
    fill: opts.fill ?? (opts.color !== undefined ? opts.color : undefined),
    direction: opts.direction, shadow: opts.shadow, shadowOffset: opts.shadowOffset, outline: opts.outline,
    theme: th, ...extra,
  };
}

/** Canvas-pixel vertical scale for big text (one font pixel). */
function fontPx(opts) {
  const m = opts.mode || 'half';
  const base = { half: 1, quad: 1, sextant: 1, braille: 1, block: 1, ascii: 1 }[m] || 1;
  const s = Array.isArray(opts.scale) ? opts.scale[1] : typeof opts.scale === 'number' ? opts.scale : 1;
  return Math.max(1, Math.round(base * s));
}

const len = (text) => [...String(text)].length;

// ── effects ──────────────────────────────────────────────────────────────────

/**
 * Characters appear one by one with a cursor.
 * opts: { cps=24, delay=0, color, cursor='▌', cursorColor, keepCursor=false, theme, font… }
 */
export function typewriter(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const n0 = len(text);
  const cps = opts.cps ?? 24;
  const n = opts.final ? n0 : Math.max(0, Math.min(n0, Math.floor((t - (opts.delay || 0)) * cps)));
  const done = n >= n0;
  const blinkOn = !done || Math.floor(t * 2.5) % 2 === 0;
  const showCursor = !opts.final && blinkOn && (!done || opts.keepCursor);
  const cursorColor = colorOf(opts.cursorColor, th.accent);
  if (opts.font) {
    drawBanner(surface, x, y, text, bannerOpts(opts, th, { charStyle: (ci) => (ci >= n ? { hidden: true } : null), cursorAt: showCursor ? n : null, cursorColor }));
    return done;
  }
  const fill = smallFill(opts, th, n0);
  const fg = colorOf(opts.color, th.ink);
  drawSmall(surface, x, y, text, (i) => (i >= n ? { hidden: true } : fill ? { fg: fill(i) } : null), { fg, attr: opts.attr });
  if (showCursor) {
    const [x0, y0] = originSmall(surface, x, y, text);
    const col = stringWidth([...String(text)].slice(0, n).join(''));
    surface.text(x0 + col, y0, opts.cursor ?? (opts.ascii ? '_' : '▌'), cursorColor);
  }
  return done;
}

/**
 * Scrambled glyphs resolve into the real text, left to right.
 * opts: { duration=1.2, charset, rate=18, color, scrambleColor, theme, font… }
 */
export function decrypt(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const chars = [...String(text)];
  const n = Math.max(1, chars.length);
  const dur = opts.duration ?? 1.2;
  const rate = opts.rate ?? 18;
  const charset = opts.charset || SCRAMBLE;
  const k = Math.floor(t * rate);
  const fg = colorOf(opts.color, th.ink);
  const sc = colorOf(opts.scrambleColor, th.accent);
  const resolveAt = (i) => dur * (0.3 + 0.7 * ((i + 1) / n) - 0.12 * hash(i, 99) * ((i + 1) / n));
  const state = (i) => {
    if (opts.final || t >= dur) return 1;
    return t >= resolveAt(i) ? 1 : 0;
  };
  const flash = (i) => clamp01(1 - (t - resolveAt(i)) / 0.18);

  if (opts.font) {
    // Substitute glyphs of the same advance so the layout never jitters.
    const f = getFont(opts.font);
    const byWidth = widthBuckets(f, charset);
    const shown = chars.map((ch, i) => {
      if (ch === ' ' || state(i)) return ch;
      const bucket = byWidth.get(glyph(f, ch).w);
      return bucket ? bucket[Math.floor(hash(i, k) * bucket.length)] : ch;
    }).join('');
    drawBanner(surface, x, y, shown, bannerOpts(opts, th, {
      charStyle: (ci) => (state(ci) ? null : { fg: scale(sc, 0.6 + 0.4 * hash(ci, k + 1)) }),
      shader: opts.final ? undefined : (c, u, v, ci) => (state(ci) && flash(ci) > 0 ? mix(c, 0xffffff, flash(ci) * 0.7) : c),
    }));
    return opts.final || t >= dur;
  }
  const fill = smallFill(opts, th, chars.length);
  drawSmall(surface, x, y, text, (i, ch) => {
    if (state(i)) {
      const c = fill ? fill(i) : fg;
      return { fg: !opts.final && flash(i) > 0 ? mix(c, 0xffffff, flash(i) * 0.7) : c };
    }
    return { ch: charset[Math.floor(hash(i, k) * charset.length)], fg: scale(sc, 0.55 + 0.45 * hash(i, k + 1)) };
  }, { fg, attr: opts.attr });
  return opts.final || t >= dur;
}

const bucketCache = new WeakMap();
function widthBuckets(font, charset) {
  let per = bucketCache.get(font);
  if (!per) bucketCache.set(font, (per = new Map()));
  let m = per.get(charset);
  if (!m) {
    m = new Map();
    for (const ch of charset) {
      const g = glyph(font, ch);
      if (g === font.tofu) continue;
      if (!m.has(g.w)) m.set(g.w, []);
      m.get(g.w).push(ch);
    }
    per.set(charset, m);
  }
  return m;
}

/**
 * Bursty digital corruption: RGB-split ghosts, slice offsets, glyph noise.
 * opts: { intensity=0.6, rate=14, color, duration, theme, font… }
 */
export function glitch(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const intensity = clamp01(opts.intensity ?? 0.6);
  const k = Math.floor(t * (opts.rate ?? 14));
  const on = !opts.final && hash(k, 7) < intensity * 0.55;
  const strong = on && hash(k, 8) < 0.4;
  const fg = colorOf(opts.color, th.ink);
  const red = colorOf(opts.splitA, 0xff2a55), cyan = colorOf(opts.splitB, 0x22e5ff);
  const n = len(text);
  const sliceAt = Math.floor(hash(k, 3) * n), sliceLen = 1 + Math.floor(hash(k, 4) * Math.max(1, n / 3));
  const sliceShift = hash(k, 5) < 0.5 ? -1 : 1;
  const done = opts.duration ? t >= opts.duration : false;

  if (opts.font) {
    const px = fontPx(opts) * 2;
    drawBanner(surface, x, y, text, bannerOpts(opts, th, {
      padX: px * 2,
      ghosts: on ? [{ dx: -px, dy: 0, color: red }, { dx: px, dy: strong ? 1 : 0, color: cyan }] : undefined,
      charStyle: (ci) => {
        if (!on) return null;
        if (ci >= sliceAt && ci < sliceAt + sliceLen) return { dx: sliceShift * px * (strong ? 2 : 1) };
        if (strong && hash(ci, k) < 0.12) return { hidden: true };
        return null;
      },
      shader: on ? (c, u, v) => (hash(Math.floor(v * 9), k) < 0.18 ? mix(c, 0xffffff, 0.5) : c) : undefined,
    }));
    return done;
  }
  const fill = smallFill(opts, th, n);
  const glyphs = opts.ascii ? GLITCH_ASCII : GLITCH_GLYPHS;
  if (on) {
    drawSmall(surface, x, y, text, () => ({ dx: -1, fg: scale(red, 0.85) }), { fg: red });
    drawSmall(surface, x, y, text, () => ({ dx: 1, fg: scale(cyan, 0.85) }), { fg: cyan });
  }
  drawSmall(surface, x, y, text, (i) => {
    const s = { fg: fill ? fill(i) : fg };
    if (!on) return s;
    if (i >= sliceAt && i < sliceAt + sliceLen) s.dx = sliceShift;
    if (hash(i, k) < (strong ? 0.25 : 0.08)) s.ch = glyphs[Math.floor(hash(i, k + 9) * glyphs.length)];
    return s;
  }, { fg, attr: opts.attr });
  return done;
}

/**
 * Characters ride a sine wave. Small text moves whole rows (reserve `amp`
 * rows above and below); big text moves in canvas pixels and pads itself.
 * opts: { amp (rows | font px, default 1 | 2), freq (0.22 small | 0.6 big), speed=5, color, fill, duration, font… }
 */
export function wave(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const freq = opts.freq ?? 0.6, speed = opts.speed ?? 5;
  const done = opts.duration ? t >= opts.duration : false;
  if (opts.font) {
    const ampPx = Math.round((opts.amp ?? 2) * fontPx(opts));
    drawBanner(surface, x, y, text, bannerOpts(opts, th, {
      padY: ampPx,
      charStyle: (ci) => ({ dy: opts.final ? 0 : Math.round(Math.sin(ci * freq - t * speed) * ampPx) }),
    }));
    return done;
  }
  // Cells can only move whole rows, so a gentler default frequency keeps words legible.
  const amp = opts.amp ?? 1, sfreq = opts.freq ?? 0.22;
  const fill = smallFill(opts, th, len(text));
  const fg = colorOf(opts.color, th.accent);
  drawSmall(surface, x, y, text, (i) => ({
    dy: opts.final ? 0 : Math.round(Math.sin(i * sfreq - t * speed) * amp),
    fg: fill ? fill(i) : fg,
  }), { fg, attr: opts.attr });
  return done;
}

/**
 * A palette sweeps through the text.
 * opts: { fill='prism', speed=0.6, spread=1, duration, font… }
 */
export function rainbow(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const speed = opts.speed ?? 0.6, spread = opts.spread ?? 1;
  const fillSpec = opts.fill ?? 'prism';
  const done = opts.duration ? t >= opts.duration : false;
  if (opts.font) {
    drawBanner(surface, x, y, text, bannerOpts({ ...opts, fill: fillSpec }, th, { t, speed: -speed }));
    return done;
  }
  const f = resolveFill(fillSpec, th);
  const n = Math.max(1, len(text));
  drawSmall(surface, x, y, text, (i) => {
    let g = (i / n) * spread - t * speed;
    g = f.cyclic ? fract(g) : pingpong(g);
    return { fg: f.at(g) };
  }, { fg: th.ink, attr: opts.attr });
  return done;
}

/**
 * A bright highlight band sweeps across the text.
 * opts: { color (base), highlight, width=5 chars (0.18 of big text), period=2.2, duration, font… }
 */
export function shimmer(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const period = opts.period ?? 2.2;
  const base = colorOf(opts.color, th.muted);
  const hi = colorOf(opts.highlight, mix(th.ink, 0xffffff, 0.6));
  const done = opts.duration ? t >= opts.duration : false;
  if (opts.font) {
    const w = opts.width ?? 0.18;
    const p = fract(t / period) * (1 + 3 * w) - 1.5 * w;
    drawBanner(surface, x, y, text, bannerOpts({ ...opts, fill: opts.fill ?? base }, th, {
      shader: opts.final ? undefined : (c, u, v) => {
        const k = clamp01(1 - Math.abs(u - p + (v - 0.5) * 0.12) / w);
        return k > 0 ? mixOklab(c, hi, k * k) : c;
      },
    }));
    return done;
  }
  const n = len(text), w = opts.width ?? 5;
  const p = fract(t / period) * (n + 2 * w) - w;
  const fill = smallFill(opts, th, n);
  drawSmall(surface, x, y, text, (i) => {
    const c = fill ? fill(i) : base;
    const k = opts.final ? 0 : clamp01(1 - Math.abs(i - p) / w);
    return { fg: k > 0 ? mixOklab(c, hi, k * k) : c };
  }, { fg: base, attr: opts.attr });
  return done;
}

/**
 * Characters fade up from the background, staggered left to right.
 * opts: { duration=0.9, stagger=0.6, color, from (default theme bg), font… }
 */
export function fadeIn(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const dur = opts.duration ?? 0.9, stagger = clamp01(opts.stagger ?? 0.6);
  const from = colorOf(opts.from, th.bg);
  const n = Math.max(1, len(text));
  const alpha = (i) => (opts.final ? 1 : clamp01((t - stagger * dur * (i / n)) / Math.max(0.001, dur * (1 - stagger))));
  const done = opts.final || t >= dur;
  if (opts.font) {
    drawBanner(surface, x, y, text, bannerOpts(opts, th, {
      charStyle: (ci) => (alpha(ci) <= 0 ? { hidden: true } : null),
      shader: (c, u, v, ci) => (alpha(ci) >= 1 ? c : mixOklab(from, c, alpha(ci))),
    }));
    return done;
  }
  const fill = smallFill(opts, th, n);
  const fg = colorOf(opts.color, th.ink);
  drawSmall(surface, x, y, text, (i) => {
    const a = alpha(i);
    return a <= 0 ? { hidden: true } : { fg: mixOklab(from, fill ? fill(i) : fg, a) };
  }, { fg, attr: opts.attr });
  return done;
}

/**
 * Breathing brightness between `color` and `to`.
 * opts: { color (default accent), to, period=1.4, duration, font… }
 */
export function pulse(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const period = opts.period ?? 1.4;
  const base = colorOf(opts.color, th.accent);
  const to = colorOf(opts.to, mix(base, 0xffffff, 0.65));
  const k = opts.final ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
  const done = opts.duration ? t >= opts.duration : false;
  if (opts.font) {
    drawBanner(surface, x, y, text, bannerOpts({ ...opts, fill: opts.fill ?? base }, th, { shader: (c) => mixOklab(c, to, k) }));
    return done;
  }
  const fill = smallFill(opts, th, len(text));
  drawSmall(surface, x, y, text, (i) => ({ fg: mixOklab(fill ? fill(i) : base, to, k) }), { fg: base, attr: opts.attr });
  return done;
}

/**
 * Text scrolls through a fixed-width window, looping.
 * opts: { width (cells, default to surface edge), speed=10 cells/s, gap=6, color, fill, font… }
 */
export function marquee(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const speed = opts.speed ?? 10, gap = opts.gap ?? 6;
  const x0 = x === 'center' ? 0 : Math.round(x || 0), y0 = y === 'center' ? Math.floor(surface.height / 2) : Math.round(y || 0);
  const width = Math.max(0, opts.width ?? surface.width - x0);
  const done = opts.duration ? t >= opts.duration : false;
  if (opts.font) {
    const bo = bannerOpts(opts, th, {});
    const { width: bw, height: bh } = measureBanner(text, bo);
    if (!bw) return done;
    const view = surface.view(x0, y0, width, bh);
    const period = bw + gap;
    const off = opts.final ? 0 : Math.floor((t * speed) % period);
    for (let px = -off; px < width; px += period) drawBanner(view, px, 0, text, bo);
    return done;
  }
  const chars = [...String(text)];
  if (!chars.length) return done;
  const period = chars.length + gap;
  const off = opts.final ? 0 : Math.floor(t * speed);
  const fill = smallFill(opts, th, chars.length);
  const fg = colorOf(opts.color, th.ink);
  for (let col = 0; col < width; col++) {
    const idx = (((col + off) % period) + period) % period;
    if (idx >= chars.length || chars[idx] === ' ') continue;
    surface.text(x0 + col, y0, chars[idx], fill ? fill(idx) : fg, undefined, opts.attr);
  }
  return done;
}

/**
 * Left-to-right reveal with a glowing leading edge.
 * opts: { duration=0.8, edge (color), color, fill, font… }
 */
export function wipe(surface, x, y, text, t, opts = {}) {
  const th = getTheme(opts.theme);
  const dur = opts.duration ?? 0.8;
  const p = opts.final ? 2 : clamp01(t / dur) * 1.15;
  const edge = colorOf(opts.edge, 0xffffff);
  const done = opts.final || t >= dur;
  const at = (u, c) => {
    if (u > p) return NONE;
    const d = p - u;
    return d < 0.12 ? mixOklab(c, edge, 1 - d / 0.12) : c;
  };
  if (opts.font) {
    drawBanner(surface, x, y, text, bannerOpts(opts, th, { shader: (c, u) => at(u, c) }));
    return done;
  }
  const n = Math.max(1, len(text));
  const fill = smallFill(opts, th, n);
  const fg = colorOf(opts.color, th.ink);
  drawSmall(surface, x, y, text, (i) => {
    const c = at(i / n, fill ? fill(i) : fg);
    return c === NONE ? { hidden: true } : { fg: c };
  }, { fg, attr: opts.attr });
  return done;
}

/** Registry: name → { fn, oneShot, duration (default seconds), description }. */
export const EFFECTS = {
  typewriter: { fn: typewriter, oneShot: true, duration: null, description: 'Characters typed out one by one behind a blinking cursor' },
  decrypt: { fn: decrypt, oneShot: true, duration: 1.2, description: 'Scrambled glyphs resolve into the real text, left to right' },
  glitch: { fn: glitch, oneShot: false, duration: 1.6, description: 'RGB-split ghosts, slice offsets and glyph corruption in bursts' },
  wave: { fn: wave, oneShot: false, duration: 2, description: 'Letters ride a traveling sine wave' },
  rainbow: { fn: rainbow, oneShot: false, duration: 2, description: 'A palette sweeps continuously through the text' },
  shimmer: { fn: shimmer, oneShot: false, duration: 2.2, description: 'A bright highlight band glides across' },
  fadeIn: { fn: fadeIn, oneShot: true, duration: 0.9, description: 'Characters fade up from the background, staggered' },
  pulse: { fn: pulse, oneShot: false, duration: 2.8, description: 'Breathing brightness between two tones' },
  marquee: { fn: marquee, oneShot: false, duration: 3, description: 'Text scrolls through a fixed window, looping' },
  wipe: { fn: wipe, oneShot: true, duration: 0.8, description: 'Left-to-right reveal with a glowing edge' },
};

export const EFFECT_NAMES = Object.keys(EFFECTS);

/** Default duration for an effect on `text` (typewriter depends on length). */
export function effectDuration(name, text, opts = {}) {
  const e = EFFECTS[name];
  if (!e) return 1;
  if (name === 'typewriter') return len(text) / (opts.cps ?? 24) + 0.35;
  return e.duration;
}

/**
 * Play an effect inline at the cursor and leave the settled text in scrollback.
 *   await animateText('Root cause found: connection pool exhausted', { effect: 'decrypt' })
 *   await animateText('PROTEUS', { effect: 'shimmer', font: 'bold', fill: 'prism' })
 * Non-TTY streams just get the plain text and a newline.
 * opts: { effect='decrypt', duration, stream=process.stdout, fps=30, theme, …effect/banner opts }
 */
export async function animateText(text, opts = {}) {
  const { Screen } = await import('../screen.js'); // Node-only; loaded on demand
  const { effect = 'decrypt', stream = process.stdout, fps = 30, ...rest } = opts;
  const fx = EFFECTS[effect];
  if (!fx) throw new Error(`unknown text effect "${effect}" (expected ${EFFECT_NAMES.join('|')})`);
  const str = String(text ?? '');
  if (!stream || !stream.isTTY) {
    stream?.write?.(str + '\n');
    return;
  }
  const duration = opts.duration ?? effectDuration(effect, str, rest);
  let height, y;
  if (rest.font) {
    const extraPad = effect === 'wave' ? Math.round((rest.amp ?? 2) * fontPx(rest)) : 0;
    const h = measureBanner(str, { ...rest, theme: undefined, padY: extraPad }).height;
    height = Math.max(1, h);
    y = 0;
  } else {
    const amp = effect === 'wave' ? Math.max(0, Math.round(rest.amp ?? 1)) : 0;
    height = 1 + 2 * amp;
    y = amp;
  }
  const screen = new Screen({ mode: 'inline', height, output: stream, keys: false });
  await screen.run((t) => {
    const buf = screen.buffer;
    buf.clear();
    const settled = t >= duration;
    fx.fn(buf, 0, y, str, settled ? duration : t, settled ? { ...rest, final: true } : rest);
  }, { fps, duration });
}
