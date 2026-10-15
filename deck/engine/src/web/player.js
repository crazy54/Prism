// prism-deck/web — virtual Stream Decks in the browser.
//
// mountDevice(el, opts) draws any model with scene/device-view.js markup and plays
// facets on its keys, strip, dials and screen at their own fps: one shared scheduler
// for the page, sleep while off-screen, a static frame under prefers-reduced-motion,
// click / tap / Enter / Space to press (state changes), wheel / vertical drag / arrow
// keys to turn dials, a tap on a dial to push it, a tap on the touch strip to touch the
// segment under the finger. mountKey(el, facet) does the same for a single tile.
// Browser-only (DOM, rAF, IntersectionObserver, ResizeObserver); everything it renders
// comes from render() — the same frames the plugin and the raster backend produce.
// The DOM-free parts (dial math, gestures, fitting, labels, layouts) are in core.js.

import { render, nextState } from '../render.js';
import { getDevice, keySize } from '../devices.js';
import { deviceMarkup, DEVICE_CSS } from '../scene/device-view.js';
import { createScheduler, effectiveFps } from '../scene/scheduler.js';
import { normalizeFacet } from '../facets/schema.js';
import { esc } from '../scene/svg.js';
import { dialAngle, dialStep, stepValue, wheelTicks, dragTicks, isTap, stripTouch, inputState, HOLD_S, fitWidth, frameTime, slotLabel } from './core.js';

const nowMs = () => performance.now();
const scheduler = createScheduler({
  cap: 30, now: nowMs, budgetMs: 8,
  setTimer: (fn, ms) => (ms <= 17 ? { r: requestAnimationFrame(fn) } : { t: setTimeout(() => requestAnimationFrame(fn), ms - 10) }),
  clearTimer: (h) => { if (h?.r) cancelAnimationFrame(h.r); if (h?.t) clearTimeout(h.t); },
});
const runtimes = new Set();
let globalPaused = false, motionChosen = false, uid = 0;

export const prefersReducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Pause (true) or resume (false) every deck on the page. Resuming is an explicit choice: it also plays under reduced motion. */
export function setGlobalMotion(paused) { globalPaused = !!paused; motionChosen = true; for (const r of runtimes) r.refresh(); }
export const isGlobalMotionPaused = () => globalPaused;

/** Page-wide numbers for perf overlays. */
export function deckStats() {
  let slots = 0, frames = 0, ms = 0, live = 0;
  for (const r of runtimes) { if (r.live()) live++; for (const s of r.slots) { slots++; frames += s.frames; ms += s.ms; } }
  return { decks: runtimes.size, live, slots, activeSlots: scheduler.active, frames, avgFrameMs: frames ? ms / frames : 0 };
}

const STYLE_ID = 'pdk-style';
const TILE_CSS = `.pdk-tile{position:relative;display:inline-block;overflow:hidden;background:#000;border:0;padding:0;margin:0;border-radius:14%;box-shadow:0 0 0 3px #00000080,inset 0 0 0 1px #ffffff14;transition:transform .12s cubic-bezier(.16,1,.3,1);touch-action:manipulation}
.pdk-tile.pdk-wide{border-radius:8px}.pdk-tile::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(162deg,#ffffff1c,#ffffff08 28%,transparent 46%)}
.pdk-tile .pdk-lcd,.pdk-tile .pdk-lcd>svg{display:block;width:100%;height:100%}.pdk-tile.pdk-down{transform:scale(.965)}.pdk-tile:focus-visible{outline:2px solid #b8a2f2;outline-offset:3px}
button.pdk-tile{cursor:pointer}.pdk-interactive .pdk-dial{touch-action:none}.pdk-interactive .pdk-key,.pdk-interactive .pdk-strip{touch-action:manipulation}
@media (prefers-reduced-motion:reduce){.pdk-tile{transition:none}}`;
function injectStyle(el) {
  const root = el.getRootNode?.() || document;
  const host = root === document ? document.head : root;
  if (host.querySelector?.(`#${STYLE_ID}`)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = DEVICE_CSS + TILE_CSS;
  host.appendChild(st);
}

/** Accept a normalized facet, a raw module export, an id (with opts.resolve), or { facet, state, params, seed, value }. */
function spec(x, resolve) {
  if (!x) return null;
  if (typeof x === 'string') { const f = resolve?.(x); if (!f) throw new Error(`prism-deck/web: unknown facet "${x}" (pass facet objects or a resolve(id) option)`); return { facet: ensure(f) }; }
  if (x.render) return { facet: ensure(x) };
  if (x.facet) return { ...x, facet: ensure(typeof x.facet === 'string' ? resolve?.(x.facet) : x.facet) };
  throw new Error('prism-deck/web: expected a facet');
}
function ensure(f) {
  if (!f) throw new Error('prism-deck/web: unknown facet');
  return f.file && f.press && f.fps !== undefined ? f : normalizeFacet(f, `${f.gallery || 'apps'}/${f.id || 'facet'}.js`);
}

let observer = null;
function observe(rt) {
  if (!globalThis.IntersectionObserver) { rt.visible = true; return; }
  observer ||= new IntersectionObserver((entries) => { for (const e of entries) { const r = e.target.__pdk; if (r) { r.visible = e.isIntersecting; r.refresh(); } } }, { rootMargin: '160px' });
  rt.root.__pdk = rt;
  observer.observe(rt.root);
}

/** One thing that renders: a key, a dial segment, the strip, the screen, or a facet spanning the device. */
class Slot {
  constructor(rt, role, index, s, targets) {
    Object.assign(this, { rt, role, index, targets, facet: s.facet, state: s.state || 0, params: s.params || {}, seed: s.seed ?? rt.opts.seed + index });
    this.value = typeof s.value === 'number' ? s.value : typeof this.facet.params?.value?.default === 'number' ? this.facet.params.value.default : 0.5;
    this.ticks = 0; this.pressed = false; this.pressAt = -Infinity; this.pressStart = 0; this.pressKey = null; this.turnAt = -Infinity; this.touch = null; this.stateAt = 0; this.frames = 0; this.ms = 0; this.error = null;
    this.prefix = `pdk${rt.id}${role[0]}${index}`;
    this.fps = 0;
    this.active = () => this.rt.live() && !this.error;
    this.tick = () => this.draw();
    this.onError = (err) => this.fail(err);
  }

  opts(t) {
    const rt = this.rt;
    return { device: rt.modelId, theme: rt.opts.theme, mode: rt.opts.mode, t, since: Math.max(0, t - this.stateAt), state: this.state, params: this.params, seed: this.seed,
      pressed: this.pressed, pressAge: this.pressAt === -Infinity ? Infinity : Math.max(0, t - this.pressAt), value: this.value, ticks: this.ticks, values: rt.dialValues?.(),
      pressKey: this.pressKey, ...inputState(this, t),
      now: rt.opts.now ? rt.opts.now() : Date.now(), tzOffset: rt.opts.tzOffset ?? -new Date().getTimezoneOffset(), reduced: rt.still, idPrefix: this.prefix, data: rt.opts.data?.() || {}, uniqueIds: true, ...this.extra };
  }

  draw() {
    const t0 = nowMs();
    const t = frameTime(this.facet, this.rt.time(), { still: this.rt.still, fps: this.fps });
    try {
      const r = render(this.facet, this.opts(t));
      const put = (el, svg) => { if (el && el.__svg !== svg) { el.innerHTML = svg; el.__svg = svg; } };
      const T = this.targets;
      if (r.keys && T.keys) r.keys.forEach((k) => put(T.keys[k.i], k.svg));
      if (r.segments && T.segments) r.segments.forEach((svg, i) => put(T.segments[i], svg));
      if (r.screen && T.screen) put(T.screen, r.screen);
      if (T.el) put(T.el, r.svg);
    } catch (err) { this.fail(err); return; }
    this.frames++;
    this.ms += nowMs() - t0;
  }

  fail(err) {
    this.error = err;
    console.error(`[prism-deck] facet ${this.facet?.id} failed:`, err);
    const el = this.targets.el || this.targets.keys?.[0];
    if (el) el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" fill="#1a0d12"/><path d="M26 26l20 20M46 26L26 46" stroke="#f97676" stroke-width="3" stroke-linecap="round"/></svg>`;
  }

  label() { return slotLabel(this.facet, { state: this.state, role: this.role, value: this.value, index: this.index }); }
}

class Runtime {
  constructor(el, opts) {
    this.id = (++uid).toString(36);
    this.opts = { theme: 'prism', seed: 7, interactive: true, autoPause: true, speed: 1, fpsCap: 15, ...opts };
    this.host = el; this.slots = []; this.playing = true; this.visible = !this.opts.autoPause; this.t0 = nowMs();
    injectStyle(el);
    runtimes.add(this);
  }
  time() { return ((nowMs() - this.t0) / 1000) * this.opts.speed; }
  get still() { const rm = this.opts.reducedMotion; return rm === true ? true : rm === false ? false : !motionChosen && prefersReducedMotion(); }
  live() { return this.playing && this.visible && !globalPaused && !this.still; }
  refresh() { for (const s of this.slots) { s.fps = effectiveFps(s.facet, { cap: this.opts.fpsCap }); if (this.visible || !this.opts.autoPause) s.draw(); scheduler.wake(s); } }
  add(role, index, sp, targets, extra) {
    if (!sp) return null;
    const s = new Slot(this, role, index, spec(sp, this.opts.resolve), targets);
    s.extra = extra || {};
    s.fps = effectiveFps(s.facet, { cap: this.opts.fpsCap });
    this.slots.push(s);
    scheduler.add(s);
    return s;
  }
  clear() { for (const s of this.slots) scheduler.remove(s); this.slots = []; }
  press(s, down, key) {
    if (!s) return;
    const t = this.time();
    if (down) {
      if (key !== undefined) s.pressKey = key;
      s.pressStart = t;
      const before = s.state;
      s.state = nextState(s.facet, s.state);
      if (s.state !== before) s.stateAt = t;
      s.pressed = true;
      this.opts.onPress?.({ role: s.role, index: s.index, facet: s.facet.id, state: s.state, stateName: s.facet.states?.[s.state] ?? null });
    } else { if (!s.pressed) return; s.pressed = false; s.pressAt = t; }
    s.draw(); scheduler.wake(s); this.labelSlot?.(s);
  }
  /** A press and its release a moment later (taps, the strip, programmatic presses). */
  tap(s, ms = 140, key) { if (!s) return; this.press(s, true, key); setTimeout(() => this.press(s, false), ms); }
  destroy() { this.clear(); runtimes.delete(this); if (this.root) observer?.unobserve(this.root); this.ro?.disconnect(); this.host.innerHTML = ''; }
  play() { this.playing = true; this.refresh(); return this; }
  pause() { this.playing = false; return this; }
  restart() { this.t0 = nowMs(); for (const s of this.slots) { s.stateAt = 0; s.pressAt = -Infinity; } this.refresh(); return this; }
  get stats() { let frames = 0, ms = 0; for (const s of this.slots) { frames += s.frames; ms += s.ms; } return { slots: this.slots.length, frames, avgFrameMs: frames ? ms / frames : 0 }; }
}

/**
 * A virtual device. opts: { model, theme, mode, width | scale | fit, maxHeight, maxWidth, keys: [facet|spec|id],
 * facet (span/deck over the device; the keys a span does not cover take opts.keys), strip (a full-strip facet),
 * dials: [segment facets], screen (screen facet), dialValues, interactive, autoPause, reducedMotion, fpsCap, seed,
 * speed, data(), now(), tzOffset, resolve(id), onPress, onRotate, onTouch, label }.
 * fit: true sizes the device to the host's width (capped by maxHeight / maxWidth) and follows resizes;
 * fit: 'contain' also fits the host's own height.
 */
export class DeckView extends Runtime {
  constructor(el, opts = {}) {
    super(el, opts);
    this.modelId = getDevice(this.opts.model || 'mk2').id;
    if (this.opts.fit && globalThis.ResizeObserver) {
      let pending = 0;
      this.ro = new ResizeObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => { pending = 0; const w = this.fitted(); if (w && Math.abs(w - (this.width || 0)) > 1) this.build(); });
      });
      this.ro.observe(el);
    }
    this.build();
  }
  get model() { return getDevice(this.modelId); }

  /** CSS width for opts.fit (0 while the host has no size, e.g. inside a hidden frame). */
  fitted() {
    const r = this.host.getBoundingClientRect?.() || { width: this.host.clientWidth, height: 0 };
    if (!r.width) return 0;
    return fitWidth(this.model, { width: r.width, height: this.opts.fit === 'contain' ? r.height : this.opts.maxHeight, max: this.opts.maxWidth });
  }

  build() {
    this.clear();
    if (this.root) observer?.unobserve(this.root);
    const d = this.model, o = this.opts;
    this.width = o.fit ? this.fitted() || o.width || 600 : o.width || (o.scale ? 0 : this.host.clientWidth || 600);
    this.host.innerHTML = deviceMarkup(d.id, { theme: o.theme, mode: o.mode, width: this.width || undefined, scale: o.scale, interactive: o.interactive, label: o.label });
    this.root = this.host.firstElementChild;
    const $$ = (sel) => [...this.root.querySelectorAll(sel)];
    this.keyBtns = $$('.pdk-key'); this.keyEls = this.keyBtns.map((b) => b.querySelector('.pdk-lcd'));
    this.dialEls = $$('.pdk-dial');
    this.stripBtn = this.root.querySelector('.pdk-strip');
    const stripEl = this.stripBtn?.querySelector('.pdk-lcd');
    const screenBox = this.root.querySelector('.pdk-screen, .pdk-info');
    const screenEl = screenBox && (screenBox.querySelector('.pdk-lcd') || (() => { screenBox.innerHTML = '<span class="pdk-lcd"></span>'; return screenBox.firstElementChild; })());
    this.vals = (o.dialValues || [0.35, 0.8, 0.55, 0.2, 0.65, 0.45]).slice(0, this.dialEls.length);
    this.dialSlots = [];
    this.dialValues = () => this.vals.map((v, i) => this.dialSlots[i]?.value ?? v);
    this.keySlots = [];
    this.wide = null;
    let deckSegs = null;
    const wide = o.facet ? spec(o.facet, o.resolve) : null;
    const isDeck = wide?.facet.surface === 'deck';
    if (isDeck && stripEl && d.strip) {
      stripEl.innerHTML = `<span class="pdk-segs">${Array.from({ length: d.strip.segments }, () => '<span></span>').join('')}</span>`;
      deckSegs = [...stripEl.querySelectorAll('.pdk-segs>span')];
    }
    let covered = null;
    if (wide) {
      this.wide = this.add('device', 0, wide, { keys: this.keyEls, segments: deckSegs, screen: o.screen ? null : screenEl });
      if (o.keys?.length && wide.facet.surface === 'span') {
        try { covered = new Set(render(wide.facet, { device: d.id, theme: o.theme, mode: o.mode, t: 0, idPrefix: 'probe' }).keys.map((k) => k.i)); } catch { covered = null; }
      }
    }
    if (!wide || covered) (o.keys || []).slice(0, this.keyEls.length).forEach((k, i) => { if (k && !covered?.has(i)) this.keySlots[i] = this.add('key', i, k, { el: this.keyEls[i] }, { size: keySize(d) }); });
    if (stripEl && d.strip && !isDeck) {
      if (o.strip) this.add('strip', 0, o.strip, { el: stripEl });
      else if (o.dials?.length) {
        stripEl.innerHTML = `<span class="pdk-segs">${this.dialEls.map(() => '<span></span>').join('')}</span>`;
        const segs = [...stripEl.querySelectorAll('.pdk-segs>span')];
        o.dials.slice(0, this.dialEls.length).forEach((f, i) => { if (f) this.dialSlots[i] = this.add('dial', i, f, { el: segs[i] }, { segment: i }); });
      }
    }
    if (screenEl && o.screen) this.add('screen', 0, o.screen, { el: screenEl }, { screen: d.screen?.kind === 'infobar' ? 'infobar' : 'galleon' });
    this.syncDials();
    this.keyBtns.forEach((_, i) => this.labelKey(i));
    if (o.interactive) this.wire();
    if (o.autoPause) observe(this); else this.visible = true;
    this.refresh();
  }

  /** The slot a key press goes to: its own key facet, else the facet spanning the device. */
  slotOfKey(i) { return this.keySlots[i] || this.wide || null; }
  labelKey(i) {
    const b = this.keyBtns[i];
    if (!b || !this.opts.interactive) return;
    const own = this.keySlots[i];
    b.setAttribute('aria-label', own ? own.label() : this.wide ? `${this.wide.facet.title} — key ${i + 1}` : `Key ${i + 1} (empty)`);
  }
  labelSlot(s) { if (s.role === 'key') this.labelKey(s.index); if (s.role === 'dial') this.syncDials(); }
  syncDials() {
    this.dialEls.forEach((el, i) => {
      const v = this.dialValues()[i] ?? 0.5;
      el.style.setProperty('--rot', `${dialAngle(v).toFixed(1)}deg`);
      if (this.opts.interactive) {
        el.setAttribute('aria-label', this.dialSlots[i] ? `Dial ${i + 1}: ${this.dialSlots[i].label()}` : `Dial ${i + 1}`);
        el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
        el.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
      }
    });
  }

  /** Turn dial i by `ticks` detents. */
  rotate(i, ticks) {
    if (!ticks) return;
    const s = this.dialSlots[i];
    const t = this.time();
    if (s) { s.value = stepValue(s.value, ticks, dialStep(s.facet, s.params)); s.ticks += ticks; s.turnAt = t; s.draw(); scheduler.wake(s); }
    else if (i < this.vals.length) this.vals[i] = stepValue(this.vals[i], ticks, 0.02);
    for (const x of this.slots) if (x.role === 'strip' || x.role === 'device') { x.turnAt = t; x.draw(); scheduler.wake(x); }
    this.syncDials();
    this.opts.onRotate?.({ index: i, ticks, value: this.dialValues()[i] });
  }
  /** Press (and release) key i programmatically. */
  press(i) { this.tap(this.slotOfKey(i), 140, i); }
  /** Push dial i (a tap on the knob, Enter / Space on a focused dial). */
  pushDial(i) {
    const s = this.dialSlots[i];
    if (s) this.tap(s); else this.opts.onPress?.({ role: 'dial', index: i, facet: null, state: 0, stateName: null });
  }

  wire() {
    const down = (el, on) => el.classList.toggle('pdk-down', on);
    this.keyBtns.forEach((b, i) => {
      b.addEventListener('pointerdown', (e) => { if (e.button) return; down(b, true); super.press(this.slotOfKey(i), true, i); b.setPointerCapture?.(e.pointerId); });
      const up = () => { if (!b.classList.contains('pdk-down')) return; down(b, false); super.press(this.slotOfKey(i), false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(b, true); super.press(this.slotOfKey(i), true, i); } });
      b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); up(); } });
    });
    this.dialEls.forEach((el, i) => {
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-valuemin', '0');
      el.setAttribute('aria-valuemax', '100');
      let acc = 0;
      el.addEventListener('wheel', (e) => { e.preventDefault(); const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc; this.rotate(i, r.ticks); }, { passive: false });
      // Drag up / down to turn; a tap without travel pushes the dial.
      let g = null;
      el.addEventListener('pointerdown', (e) => { if (e.button) return; g = { x: e.clientX, y: e.clientY, ly: e.clientY, rest: 0, moved: false }; el.setPointerCapture?.(e.pointerId); down(el, true); });
      el.addEventListener('pointermove', (e) => {
        if (!g) return;
        if (!g.moved && !isTap(e.clientX - g.x, e.clientY - g.y)) g.moved = true;
        if (!g.moved) return;
        const r = dragTicks(g.ly - e.clientY + g.rest);
        g.ly = e.clientY; g.rest = r.rest;
        this.rotate(i, r.ticks);
      });
      const end = (cancel) => { if (!g) return; const tapped = !g.moved && !cancel; g = null; down(el, false); if (tapped) this.pushDial(i); };
      el.addEventListener('pointerup', () => end(false)); el.addEventListener('pointercancel', () => end(true));
      el.addEventListener('keydown', (e) => {
        const turn = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (turn) { e.preventDefault(); this.rotate(i, turn * (e.shiftKey && Math.abs(turn) === 1 ? 5 : 1)); }
        else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(el, true); this.pushDial(i); setTimeout(() => down(el, false), 140); }
      });
    });
    if (this.stripBtn && this.model.dials?.touch) {
      // Tap or long-touch (≥ HOLD_S) the segment under the finger; the facet gets ctx.touch { x, y, hold, age }.
      const strip = this.model.strip, n = this.dialEls.length || strip.segments;
      const touch = (px, py, w, h, hold) => {
        const T = stripTouch(px, py, w, h, { w: strip.w, h: strip.h, segments: n });
        const t = this.time(), dial = this.dialSlots[T.i], full = this.slots.find((x) => x.role === 'strip' || x.role === 'device');
        if (dial) dial.touch = { x: T.segX, y: T.y, hold, at: t };
        if (full) full.touch = { x: T.x, y: T.y, hold, at: t };
        this.tap(dial || full, 120);
        this.opts.onTouch?.({ index: T.i, x: T.x, y: T.y, hold });
      };
      let down = null;
      this.stripBtn.addEventListener('pointerdown', (e) => { if (e.button) return; down = { t: nowMs() }; });
      this.stripBtn.addEventListener('pointerup', (e) => {
        if (!down) return;
        const r = this.stripBtn.getBoundingClientRect(), hold = (nowMs() - down.t) / 1000 >= HOLD_S;
        down = null;
        touch(e.clientX - r.left, e.clientY - r.top, r.width, r.height, hold);
      });
      this.stripBtn.addEventListener('pointercancel', () => { down = null; });
      // Keyboard (Enter / Space on the focused strip): touch the middle of the first segment.
      this.stripBtn.addEventListener('click', (e) => { if (e.detail !== 0) return; const r = this.stripBtn.getBoundingClientRect(); touch(r.width / n / 2, r.height / 2, r.width, r.height, false); });
    }
  }

  set(next = {}) { Object.assign(this.opts, next); if (next.model) this.modelId = getDevice(next.model).id; this.build(); return this; }
  setKeys(keys) { return this.set({ keys, facet: null }); }
  setFacet(facet) { return this.set({ facet }); }
  setTheme(theme, mode) { return this.set({ theme, mode }); }
  setModel(model) { return this.set({ model }); }
}

/** One live key / dial segment / strip / screen as a standalone tile (gallery grids). opts: { size: {w,h}|px, displaySize, theme, mode, interactive, … } */
export class KeyView extends Runtime {
  constructor(el, facet, opts = {}) { super(el, opts); this.sp = spec(facet, this.opts.resolve); this.build(); }
  build() {
    this.clear();
    if (this.root) observer?.unobserve(this.root);
    const f = this.sp.facet, o = this.opts;
    if (f.surface === 'span' || f.surface === 'deck') throw new Error('mountKey: span and deck facets need mountDevice');
    const tag = o.interactive ? 'button' : 'div';
    const sz = typeof o.size === 'object' ? o.size : f.surface === 'key' ? { w: o.size || 144, h: o.size || 144 } : null;
    const probe = render(f, { size: sz || undefined, theme: o.theme, mode: o.mode, t: 0, idPrefix: 'probe' });
    const w = sz?.w || probe.w, h = sz?.h || probe.h;
    const css = o.displaySize ? `width:${o.displaySize}px;height:${(o.displaySize * h) / w}px` : `width:${w}px;height:${h}px`;
    this.host.innerHTML = `<${tag} class="pdk-tile${f.surface === 'key' ? '' : ' pdk-wide'}"${o.interactive ? ` type="button" aria-label="${esc(f.title)}"` : ' aria-hidden="true"'} style="${css}"><span class="pdk-lcd"></span></${tag}>`;
    this.root = this.host.firstElementChild;
    this.slot = this.add(f.surface, 0, this.sp, { el: this.root.firstElementChild }, sz ? { size: sz } : {});
    if (o.interactive) {
      const b = this.root, s = this.slot;
      b.addEventListener('pointerdown', (e) => { if (e.button) return; b.classList.add('pdk-down'); this.press(s, true); });
      const up = () => { if (!b.classList.contains('pdk-down')) return; b.classList.remove('pdk-down'); this.press(s, false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); b.classList.add('pdk-down'); this.press(s, true); } });
      b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') up(); });
      if (f.surface === 'strip') {
        let acc = 0;
        b.addEventListener('wheel', (e) => {
          e.preventDefault();
          const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc;
          if (r.ticks) { s.value = stepValue(s.value, r.ticks, dialStep(f, s.params)); s.ticks += r.ticks; s.draw(); this.labelSlot?.(s); }
        }, { passive: false });
      }
      this.labelSlot = () => b.setAttribute('aria-label', s.label());
      this.labelSlot();
    }
    if (o.autoPause) observe(this); else this.visible = true;
    this.refresh();
  }
  setState(i) { this.slot.state = i; this.slot.stateAt = this.time(); this.slot.draw(); this.labelSlot?.(this.slot); return this; }
  set(next = {}) { Object.assign(this.opts, next); if (next.facet) this.sp = spec(next.facet, this.opts.resolve); this.build(); return this; }
}

export const mountDevice = (el, opts) => new DeckView(el, opts);
export const mountKey = (el, facet, opts) => new KeyView(el, facet, opts);
