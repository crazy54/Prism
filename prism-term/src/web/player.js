// Facet player for the browser — runs any terminal facet live on a canvas.
//
// One shared requestAnimationFrame loop drives every player on the page; each
// player throttles itself to its own fps, sleeps while scrolled out of view
// (IntersectionObserver), and renders a single still under
// prefers-reduced-motion or when the page pauses motion. Facets run exactly as
// they do in a terminal: same scene contract, same engine, same seeded output.

import { CellBuffer } from '../buffer.js';
import { createContext } from '../context.js';
import { getTheme } from '../palettes.js';
import { normalizeDepth } from '../color.js';
import { TermCanvas, fitCells } from './renderer.js';

/** What the browser "terminal" supports — everything, since glyphs are drawn procedurally. */
export const WEB_CAPS = Object.freeze({ isTTY: false, depth: 'truecolor', unicode: true, braille: true, sextant: true, width: 80, height: 24, program: 'web', platform: 'web' });

const players = new Set();
let raf = 0;
let globalPaused = false;
let motionChosen = false; // an explicit setGlobalMotion() outranks prefers-reduced-motion

// Per-frame budget: when many players fall due on the same frame, the rest
// wait a frame (starting from a rotating index, so nobody starves) instead of
// stacking into one long frame.
const BUDGET_MS = 9;
let turn = 0;
function pump(now) {
  raf = 0;
  let again = false;
  const list = [...players], n = list.length, start = performance.now();
  turn = (turn + 1) % Math.max(1, n);
  for (let k = 0; k < n; k++) {
    const p = list[(turn + k) % n];
    if (!p._wants()) continue;
    again = true;
    if (performance.now() - start < BUDGET_MS) p._tick(now);
  }
  if (again) raf = requestAnimationFrame(pump);
}
function wake() { if (!raf && players.size) raf = requestAnimationFrame(pump); }

// One MediaQueryList for the page (its .matches is live): every player asks on every frame.
let reducedQuery;
export const prefersReducedMotion = () => {
  if (reducedQuery === undefined) reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  return !!reducedQuery?.matches;
};

/**
 * Pause or resume every player on the page (the site's motion toggle). Resuming
 * is an explicit choice, so it also plays under prefers-reduced-motion.
 */
export function setGlobalMotion(paused) {
  globalPaused = !!paused;
  motionChosen = true;
  for (const p of players) if (!globalPaused) p._resync();
  wake();
}
export const isGlobalMotionPaused = () => globalPaused;

let observer = null;
function observe(p) {
  if (!globalThis.IntersectionObserver) { p.visible = true; return; }
  observer ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pl = e.target.__prismPlayer;
      if (!pl) continue;
      pl.visible = e.isIntersecting;
      if (pl.visible) { pl._resync(); wake(); }
    }
  }, { rootMargin: '0px' });   // play only while on screen (a player painted its first frame at mount)
  p.canvas.__prismPlayer = p;
  observer.observe(p.canvas);
}

export class FacetPlayer {
  /**
   * @param {HTMLElement} el     container (a <canvas> is created inside it) or a <canvas>
   * @param {object} facet       scene/facet object (setup(ctx) → frame(t, dt))
   * @param {object} opts
   *   cols, rows        terminal size in cells (default facet.size)
   *   fit               { width, height } CSS box to fit the canvas into
   *   cellWidth         fixed CSS px per cell (overrides fit)
   *   theme, mode, params, seed, transparent
   *   depth             emulate a 'truecolor' | '256' | '16' | 'mono' terminal (default truecolor)
   *   ascii             emulate a terminal without Unicode (facets fall back to 7-bit glyphs)
   *   fps (30), speed (1), autoPause (true), still (false), warmup (seconds), label
   */
  constructor(el, facet, opts = {}) {
    this.facet = facet;
    this.opts = { fps: 30, speed: 1, autoPause: true, seed: 7, ...opts };
    this.canvas = el.tagName === 'CANVAS' ? el : el.appendChild(document.createElement('canvas'));
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', opts.label || `${facet.title || facet.id} — terminal animation`);
    this.tc = new TermCanvas(this.canvas, { depth: this.opts.depth });
    this.playing = true;
    this.visible = !this.opts.autoPause;
    this.stats = { frames: 0, ms: 0 };
    this.error = null;
    players.add(this);
    if (this.opts.autoPause) observe(this);
    this._build();
    wake();
  }

  get animated() { return this.facet.animated !== false; }
  get still() { return this.opts.still || (!motionChosen && prefersReducedMotion()) || !this.animated; }
  get time() { return this.t; }

  _size() {
    const f = this.facet;
    return { cols: this.opts.cols || f.size?.w || 80, rows: this.opts.rows || f.size?.h || 24 };
  }

  /** Capabilities of the terminal being emulated. */
  get caps() {
    const depth = normalizeDepth(this.opts.depth || 'truecolor'), u = !this.opts.ascii;
    return { ...WEB_CAPS, depth, unicode: u, braille: u, sextant: u, width: this._size().cols, height: this._size().rows };
  }

  _build() {
    const { cols, rows } = this._size();
    this.theme = getTheme(this.opts.theme);
    this.buffer = new CellBuffer(cols, rows);
    this.tc.setTheme(this.theme);
    this.tc.setDepth(this.opts.depth || 'truecolor');
    this._layout();
    this.error = null;
    try {
      const sheenKey = this._sheenKey();
      this.sheen = !!sheenKey && this._sheenFor === sheenKey;
      const params = this.sheen ? { ...this.opts.params, palette: 'prism-sheen' } : this.opts.params || {};
      this.ctx = createContext({ scene: this.facet, buffer: this.buffer, caps: this.caps, theme: this.opts.theme, mode: this.opts.mode || null, params, seed: this.opts.seed, transparent: !!this.opts.transparent });
      this.frame = this.facet.setup(this.ctx);
    } catch (err) { this._fail(err); return; }
    this.t = 0;
    this.n = 0;
    const loop = this.facet.loop || 8;
    const target = this.still ? (this.animated ? Math.min(loop * 0.35, 6) : 0) : (this.opts.warmup ?? Math.min(1.2, loop * 0.15));
    this._advanceTo(target);
    if (!this.sheen && !this.error && this._fullField()) { this._sheenFor = this._sheenKey(); this._build(); return; }
    this._paint();
    this._resync();
  }

  // Day sheen: a scene painting Refraction's spectrum ('prism') that fills (nearly) every
  // cell re-runs once with 'prism-sheen' — the Day vivid tier is tuned for marks on pearl
  // and reads as muddy olive across a whole field (design/tokens.json › day.sheen).
  // Light themes only, and never over a palette someone chose.
  _sheenKey() {
    const p = this.opts.params || {};
    if (p.palette || this.theme.mode !== 'light' || this.facet.canvas !== 'field' || (this.facet.palette || 'prism') !== 'prism') return '';
    const { cols, rows } = this._size();
    return `${this.theme.id}|${cols}x${rows}|${JSON.stringify(p)}`;
  }

  _fullField() {
    if (!this._sheenKey()) return false;
    const { bg, fg, ch } = this.buffer, base = this.theme.bg;
    let n = 0;
    for (let i = 0; i < bg.length; i++) if ((bg[i] !== -1 && bg[i] !== base) || (ch[i] !== ' ' && fg[i] !== base)) n++;
    return n >= 0.9 * bg.length;
  }

  _layout() {
    const { cols, rows } = this._size();
    const dpr = globalThis.devicePixelRatio || 1;
    let fit;
    if (this.opts.cellWidth) fit = { cw: Math.round(this.opts.cellWidth * dpr), cssWidth: cols * this.opts.cellWidth, cssHeight: rows * this.opts.cellWidth * 2 };
    else fit = fitCells(cols, rows, this.opts.fit?.width || this.canvas.parentElement?.clientWidth || 640, this.opts.fit?.height || 0, dpr);
    this.tc.layout(cols, rows, fit.cw);
    this.canvas.style.width = `${fit.cssWidth}px`;
    this.canvas.style.height = `${fit.cssHeight}px`;
  }

  /** Step deterministically from the current t to `target` at 15 fps (no painting). */
  _advanceTo(target) {
    if (!this.frame) return;
    try {
      const dt = 1 / 15;
      if (target <= 0) { this.buffer.clear(this.ctx.bg); this.frame(0, dt, this.n++); return; }
      while (this.t < target) {
        this.t = Math.min(target, this.t + dt);
        this.buffer.clear(this.ctx.bg);
        this.frame(this.t, dt, this.n++);
      }
    } catch (err) { this._fail(err); }
  }

  _paint() {
    if (this.error) return;
    this.tc.draw(this.buffer);
  }

  _fail(err) {
    this.error = err;
    this.frame = null;
    console.error(`[prism-term] facet ${this.facet.id} failed:`, err);
    const b = this.buffer;
    b.clear(this.theme.bg);
    b.text(1, Math.floor(b.height / 2), `⚠ ${this.facet.id}: ${String(err?.message || err)}`.slice(0, b.width - 2), this.theme.neg);
    this.tc.draw(b);
  }

  _wants() { return this.playing && this.visible && !globalPaused && !this.still && !!this.frame; }

  // A random phase spreads players that start together across frames.
  _resync() { const now = performance.now(); this.last = now - Math.random() * (1000 / this.opts.fps); this.lastStep = now; }

  _tick(now) {
    const interval = 1000 / this.opts.fps;
    if (now - this.last < interval - 2) return;
    this.last = now;
    const dt = Math.min(0.1, (now - this.lastStep) / 1000) * this.opts.speed;
    this.lastStep = now;
    const t0 = performance.now();
    try {
      this.t += dt;
      this.buffer.clear(this.ctx.bg);
      this.frame(this.t, dt, this.n++);
      this.tc.draw(this.buffer);
    } catch (err) { this._fail(err); return; }
    this.stats.frames++;
    this.stats.ms += performance.now() - t0;
  }

  play() { this.playing = true; this._resync(); wake(); return this; }
  pause() { this.playing = false; return this; }
  toggle() { return this.playing ? this.pause() : this.play(); }
  restart() { this._build(); wake(); return this; }

  /** Change options; size/theme/mode/params/seed rebuild the scene, others apply live. */
  set(next = {}) {
    const rebuild = ['cols', 'rows', 'theme', 'mode', 'params', 'seed', 'transparent', 'still', 'depth', 'ascii'].some((k) => k in next && JSON.stringify(next[k]) !== JSON.stringify(this.opts[k]));
    const relayout = ['fit', 'cellWidth'].some((k) => k in next);
    Object.assign(this.opts, next);
    if (rebuild) this._build();
    else if (relayout) { this._layout(); this.tc.full = true; this._paint(); }
    wake();
    return this;
  }

  /** Average ms per live frame (compute + paint). */
  get avgFrameMs() { return this.stats.frames ? this.stats.ms / this.stats.frames : 0; }

  /** The current frame as a CellBuffer copy (for .ans / .txt downloads). */
  snapshot() { return this.buffer.clone(); }

  destroy() {
    players.delete(this);
    observer?.unobserve(this.canvas);
    if (this.canvas.__prismPlayer === this) delete this.canvas.__prismPlayer;
    this.frame = null;
  }
}

/** Mount a live facet into `el`. Returns the FacetPlayer. */
export function mountFacet(el, facet, opts) {
  return new FacetPlayer(el, facet, opts);
}

/** Number of players currently on the page and how many are animating. */
export function playerStats() {
  let active = 0, ms = 0, frames = 0;
  for (const p of players) { if (p._wants()) active++; ms += p.stats.ms; frames += p.stats.frames; }
  return { players: players.size, active, avgFrameMs: frames ? ms / frames : 0 };
}
