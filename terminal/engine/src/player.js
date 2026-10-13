// Player — runs facets fullscreen with live controls, a HUD and transitions.
//
//   ← / →  or p / n   previous / next facet
//   space             pause / resume
//   m                 cycle canvas mode (auto → braille → sextant → quad → half → ascii)
//   t                 cycle theme
//   r                 restart facet
//   h                 toggle HUD
//   q / esc           quit (back to the gallery when launched from it)
//
// Facets declare a preferred `size`. Scenes (and anything ≥ 70×20) fill the
// screen; smaller facets — a spinner, a progress meter, a chart tile — play on
// a centered stage at (up to a modest multiple of) their designed size, framed
// by crop marks, instead of being stretched across a 200-column terminal.
// Still facets (`animated: false`) are drawn at t = 0 and left alone.
//
// Facet switches play a "prism wipe": a diagonal, noise-jittered reveal whose
// leading edge is tinted with a spectral band.

import { Screen } from './screen.js';
import { createContext } from './context.js';
import { THEME_IDS, palette as makePalette } from './palettes.js';
import { MODE_NAMES } from './canvas.js';
import { detect, withOverrides } from './caps.js';
import { NONE, mix } from './color.js';
import { ATTR } from './buffer.js';
import { easing } from './easing.js';
import { truncate, stringWidth, charWidth } from './width.js';
import { foldChar } from './ascii.js';
import { getGallery } from './facets/galleries.js';

const MODE_CYCLE = [null, ...MODE_NAMES];
const SMALL_KINDS = new Set(['spinner', 'progress', 'text']);

/** Capabilities for a run: detected from the output stream, then CLI overrides. */
export function resolveCaps(opts = {}) {
  return withOverrides(opts.caps || detect({ stream: opts.output || process.stdout }), opts);
}

/** "FX Store · Fields" for a facet (falls back to whatever the facet carries). */
export function facetPlace(f, sep = ' · ') {
  const g = getGallery(f.gallery);
  return [g?.title || f.gallery, f.category].filter(Boolean).join(sep);
}

// Typography that facet and catalog text uses, mapped to 7-bit stand-ins for
// ASCII-only terminals (Linux console, serial lines, LANG=C).
const ASCII_MAP = {
  '—': '-', '–': '-', '…': '...', '×': 'x', '·': '-', '•': '*', '‘': "'", '’': "'", '“': '"', '”': '"',
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '≥': '>=', '≤': '<=', '±': '+/-', '≈': '~', '°': 'o',
  '✓': 'v', '✔': 'v', '✗': 'x', '✖': 'x', '★': '*', ' ': ' ', // last key: no-break space
};

/**
 * Prose for ASCII-only terminals: common typography gets a readable stand-in
 * (… → ..., ≥ → >=); anything else folds the way facet output does (foldChar).
 */
export function asciify(s) {
  return String(s).replace(/[^\x20-\x7e]/gu, (c) => ASCII_MAP[c] ?? (charWidth(c.codePointAt(0)) === 0 ? '' : foldChar(c)));
}

/**
 * Where a facet should draw inside a W×H area.
 *   fill        scenes and big facets take the whole area
 *   otherwise   centered at preferred size × k, k ∈ [1, grow], shrunk to fit;
 *               never below minSize (the caller's view clips it, `tooSmall` says so)
 * @returns {{ x, y, w, h, fill, tooSmall }}
 */
export function stageRect(f, W, H, { grow = 1 } = {}) {
  const size = f?.size || { w: W, h: H };
  const min = f?.minSize || { w: 1, h: 1 };
  if (!f || f.kind === 'scene' || (size.w >= 70 && size.h >= 20)) return { x: 0, y: 0, w: W, h: H, fill: true, tooSmall: W < min.w || H < min.h };
  const k = Math.max(1, Math.min(grow, W / size.w, H / size.h));
  // Shrink to fit (facets lay out from ctx.width/height)…
  let w = Math.min(W, Math.round(size.w * k)), h = Math.min(H, Math.round(size.h * k));
  // …but never below minSize: then the stage overflows and the caller's view clips it.
  const tooSmall = W < min.w || H < min.h;
  if (tooSmall) { w = Math.max(w, min.w); h = Math.max(h, min.h); }
  return { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h, fill: false, tooSmall };
}

/** Player stage growth for a facet kind: small kinds keep their designed size. */
export const growFor = (f) => (SMALL_KINDS.has(f?.kind) ? 1 : 1.5);

/** Draw crop marks just outside a stage (when there is room). */
export function cropMarks(b, r, color, unicode) {
  const [tl, tr, bl, br] = unicode ? ['┌', '┐', '└', '┘'] : ['+', '+', '+', '+'];
  const x0 = r.x - 1, y0 = r.y - 1, x1 = r.x + r.w, y1 = r.y + r.h;
  if (x0 < 0 || y0 < 0 || x1 >= b.width || y1 >= b.height) return;
  b.set(x0, y0, tl, color); b.set(x1, y0, tr, color); b.set(x0, y1, bl, color); b.set(x1, y1, br, color);
}

/**
 * Seconds a facet gets in an auto-advancing playlist: an explicit number wins,
 * a function is asked per facet, otherwise its own loop length (6–12 s; stills 4 s).
 */
export function durationFor(f, duration) {
  if (typeof duration === 'function') return duration(f);
  if (typeof duration === 'number') return duration;
  if (!f.animated) return 4;
  return Math.max(6, Math.min(12, f.loop || 8));
}

/**
 * A facet player bound to an existing, started Screen. `run()` resolves when
 * the user quits (the screen keeps running, so a gallery can take over again)
 * or when a finite playlist ends.
 *
 * @param {Screen} screen
 * @param {object[]} list  facets
 * @param {object} opts    fps, duration (s per facet, 'auto', a function of the facet, or 0 = manual),
 *                         loop, theme, mode, transparent, params, seed, hud, transition (s)
 */
export function createPlayer(screen, list, opts = {}) {
  const { fps = 30, loop = true, transparent = false, params = {}, seed = 7, transition = 0.7 } = opts;
  const duration = opts.duration === 'auto' ? undefined : opts.duration;
  const auto = opts.duration === 'auto' || typeof opts.duration === 'function' || (typeof opts.duration === 'number' && opts.duration > 0);
  const caps = screen.caps;
  const U = caps.unicode !== false;
  const spectrum = makePalette('prism');

  const state = {
    index: 0,
    themeId: opts.theme || undefined,
    mode: opts.mode || null,
    hud: opts.hud !== false,
  };
  let ctx = null, frameFn = null, sceneT0 = 0, now = 0, toastUntil = 0, stage = null, facet = null;
  let from = null, fromT = -1, jitter = null, handle = null;
  let fpsCount = 0, fpsT = 0, fpsShown = 0;

  const setup = (keepTime = false) => {
    facet = list[state.index];
    const hudRows = state.hud ? 1 : 0;
    stage = stageRect(facet, screen.width, Math.max(1, screen.height - hudRows), { grow: growFor(facet) });
    const target = stage.fill ? (hudRows ? screen.buffer.view(0, 0, screen.width, screen.height - hudRows) : screen.buffer) : screen.buffer.view(stage.x, stage.y, stage.w, stage.h);
    ctx = createContext({ scene: facet, buffer: target, caps, theme: state.themeId, mode: state.mode, transparent, params, seed });
    frameFn = facet.setup(ctx);
    if (!keepTime) { sceneT0 = now; toastUntil = now + 3.5; }
  };

  const go = (delta) => {
    if (list.length > 1) {
      from = screen.buffer.clone();
      fromT = now;
      state.index = (state.index + delta + list.length) % list.length;
    }
    setup();
    if (handle?.paused) handle.resume();
  };

  const buildJitter = (n) => {
    jitter = new Float32Array(n);
    let a = 0x2545f491;
    for (let i = 0; i < n; i++) { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; jitter[i] = ((a >>> 0) % 1000) / 1000; }
  };

  const drawTransition = () => {
    const b = screen.buffer, W = b.width, H = b.height;
    const p = (now - fromT) / transition;
    if (p >= 1 || from.width !== W || from.height !== H) { from = null; return; }
    if (!jitter || jitter.length !== W * H) buildJitter(W * H);
    const e = easing.inOutCubic(p) * 1.3 - 0.15;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = (x / W) * 0.75 + (y / H) * 0.25 + jitter[i] * 0.12;
        if (v > e + 0.06) {
          b.ch[i] = from.ch[i]; b.fg[i] = from.fg[i]; b.bg[i] = from.bg[i]; b.at[i] = from.at[i];
        } else if (v > e - 0.04) {
          b.bg[i] = mix(b.bg[i] === NONE ? 0 : b.bg[i], spectrum((y / H) * 0.6 + p), 0.85);
          if (b.fg[i] !== NONE) b.fg[i] = mix(b.fg[i], 0xffffff, 0.5);
        }
      }
    }
  };

  const drawHud = () => {
    const th = ctx.theme, b = screen.buffer, W = b.width, H = b.height;
    const toast = now < toastUntil;
    const mono = caps.depth === 'mono';
    const T = U ? (s) => s : asciify;
    if (!stage.fill) cropMarks(b, stage, th.line, U);
    if (stage.tooSmall && H > 2) b.text(1, 0, truncate(T(` needs ≥ ${facet.minSize.w}×${facet.minSize.h} — enlarge the terminal `), W - 2, U ? '…' : '~'), th.warn, th.panel);
    if ((!state.hud && !toast) || H < 2 || W < 20) return;
    const y = H - 1;
    b.fill(0, y, W, 1, ' ', th.muted, th.panel, mono ? ATTR.INVERSE : 0);
    let x = b.text(0, y, T(` ${U ? '◆' : '*'} ${facet.title} `), th.bg, th.accent, ATTR.BOLD | (mono ? ATTR.INVERSE : 0));
    x = b.text(x, y, ` ${T(facetPlace(facet, U ? ' · ' : ' / '))}${list.length > 1 ? ` ${U ? '·' : '-'} ${state.index + 1}/${list.length}` : ''} `, th.ink, th.panel2, mono ? ATTR.INVERSE : 0);
    const paused = handle?.paused ? `${U ? '❚❚' : '||'} paused ${U ? '·' : '-'} ` : '';
    const sep = U ? ' · ' : ' - ';
    const right = T(` ${paused}${ctx.mode || 'auto'}${sep}${caps.depth}${sep}${facet.animated ? `${fpsShown || '–'}fps` : 'still'}${sep}${th.name} `);
    const help = U ? ' ←→ facet  m mode  t theme  space pause  h hud  q quit ' : ' <> facet  m mode  t theme  space pause  h hud  q quit ';
    if (W - x - stringWidth(right) > stringWidth(help) + 1) b.text(x + 1, y, help, th.dim, th.panel, mono ? ATTR.INVERSE : 0);
    b.text(Math.max(x, W - stringWidth(right)), y, right, th.muted, th.panel, mono ? ATTR.INVERSE : 0);
    if (toast && H > 4 && facet.description) b.text(2, H - 3, truncate(T(` ${facet.description} `), W - 4, U ? '…' : '~'), th.ink, th.panel, ATTR.ITALIC);
  };

  return {
    get index() { return state.index; },
    get theme() { return state.themeId; },
    get mode() { return state.mode; },

    run(startIndex = 0) {
      state.index = Math.max(0, Math.min(list.length - 1, startIndex));
      return new Promise((resolve, reject) => {
        let failed = null, quit = false;
        const guard = (fn) => { try { fn(); } catch (err) { failed = err; handle?.stop(); } };

        const onKey = (k) => guard(() => {
          const n = k.name;
          if (n === 'q' || n === 'escape') { quit = true; handle.stop(); return; }
          if (n === 'right' || n === 'n' || n === 'down') go(1);
          else if (n === 'left' || n === 'p' || n === 'up') go(-1);
          else if (n === 'space') handle.toggle();
          else if (n === 'h') { state.hud = !state.hud; setup(true); }
          else if (n === 'r') { from = null; setup(); }
          else if (n === 'm') {
            state.mode = MODE_CYCLE[(MODE_CYCLE.indexOf(state.mode) + 1) % MODE_CYCLE.length];
            setup(true); toastUntil = now + 2;
          } else if (n === 't') {
            state.themeId = THEME_IDS[(THEME_IDS.indexOf(ctx.theme.id) + 1) % THEME_IDS.length];
            setup(true); toastUntil = now + 2;
          }
          if (handle.paused) { drawHud(); screen.render({ force: true }); }
        });
        const onResize = () => guard(() => { from = null; jitter = null; setup(true); });
        screen.on('key', onKey);
        screen.on('resize', onResize);

        guard(() => setup());
        handle = screen.animate((t, dt) => {
          now = t;
          if (failed) return false;
          try {
            screen.buffer.clear(ctx.bg);
            frameFn(facet.animated ? t - sceneT0 : 0, facet.animated ? dt : 0);
            if (from) drawTransition();
            drawHud();
          } catch (err) {
            failed = err;
            return false;
          }
          fpsCount++;
          if (t - fpsT >= 1) { fpsShown = Math.round(fpsCount / (t - fpsT)); fpsCount = 0; fpsT = t; }
          if (auto && t - sceneT0 >= durationFor(facet, duration)) {
            if (list.length > 1 && (loop || state.index < list.length - 1)) go(1);
            else return false;
          }
          return true;
        }, { fps });

        handle.done.then(() => {
          screen.off('key', onKey);
          screen.off('resize', onResize);
          if (failed) reject(failed);
          else resolve(quit ? 'quit' : 'end');
        });
      });
    },
  };
}

/**
 * Play one facet or a playlist fullscreen; owns the terminal for the duration.
 * Accepts every createPlayer option plus: depth, ascii, sextant, unicode
 * (capability overrides), width/height (fixed size), output/input, title
 * (window title — none unless asked for; see holdTitle).
 */
export async function play(scenes, opts = {}) {
  const list = Array.isArray(scenes) ? scenes : [scenes];
  if (!list.length) return;
  const caps = resolveCaps(opts);
  const restoreTitle = holdTitle(opts.output, opts.title);
  const screen = new Screen({ output: opts.output, input: opts.input, caps, depth: caps.depth, width: opts.width, height: opts.height, title: opts.title || undefined });
  screen.start();
  try {
    await createPlayer(screen, list, opts).run(opts.start || 0);
  } finally {
    screen.stop();
    restoreTitle();
  }
}

/**
 * The window title is the user's; it is only changed when a caller passes one.
 * Then the terminal's own title is pushed (CSI 22;0t) before the Screen sets
 * the new one, and popped (CSI 23;0t) by the returned function — or at process
 * exit if the run dies first.
 */
export function holdTitle(output, title) {
  if (!title) return () => {};
  const out = output || process.stdout;
  let held = true;
  const pop = () => {
    if (!held) return;
    held = false;
    process.off('exit', pop);
    out.write('\x1b[23;0t');
  };
  out.write('\x1b[22;0t');
  process.on('exit', pop);
  return pop;
}
