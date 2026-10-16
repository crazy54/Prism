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
// Game facets (API 1.5, scene/game.js): each game slot owns a game host — presses, releases, dial
// turns / pushes and strip touches dispatch events, holding a key GAME_RESET_HOLD_S deals a new game,
// and the slot renders only while a transition plays or the game ticks (static otherwise). Keys whose
// slice didn't change aren't touched (the same per-element dedupe as every slot).
// Linked state (API 1.6, scene/link.js): every device has a link bus (or shares opts.bus with other
// devices). Slots whose facets declare `link` publish their state / dial value on a press or a turn, every
// other slot that mirrors the channel follows (its state flips, it redraws), and ctx.data carries the shared
// values, so a mic key, the Galleon screen and a + dial all say MUTED together. Games publish their
// readout on the 'game' channel; a Galleon screen left empty by the page shows it (screen-galleon-game).
// The Galleon's screen belongs to its dials: pushing a dial (or clicking the screen above it) presses the
// screen facet, and turning one redraws the screen (ctx.values).

import { render, nextState } from '../render.js';
import { getDevice, keySize } from '../devices.js';
import { deviceMarkup, DEVICE_CSS } from '../scene/device-view.js';
import { createScheduler, effectiveFps, createChangeGovernor } from '../scene/scheduler.js';
import { normalizeFacet } from '../facets/schema.js';
import { esc } from '../scene/svg.js';
import { dialAngle, dialStep, stepValue, wheelTicks, dragTicks, isTap, stripTouch, inputState, HOLD_S, fitWidth, frameTime, slotLabel, gameCell, gameAnnouncement } from './core.js';
import { createGameHost, GAME_FPS, GAME_RESET_HOLD_S } from '../scene/game.js';
import { createLinkBus, readoutOf, linksOf } from '../scene/link.js';

const nowMs = () => performance.now();
// Every slot on the page ticks on one shared beat (15 fps, the hardware's own rate cap), so all keys that are due
// render in the same frame: the page pays one style / layout / paint pass per beat instead of one per key.
const BEAT_MS = 1000 / 15;
const IDLE_FPS = 4;   // the change governor's probe rate for a slot whose frames stopped changing
// Rendering budget per beat: ≤ 4 ms of facet rendering, 15 beats a second, so the decks on a page never take more
// than ~6% of the main thread for their frames. A fast machine renders every due key in it; a slow one (or a 4×
// throttled one) lowers the rate evenly (the scheduler rotates who goes first) instead of saturating the page.
// Half of what a beat runs over (one heavy facet can take several budgets) is paid back by skipping beats (`debt`).
const BEAT_BUDGET_MS = 4;
let debt = 0;
const scheduler = createScheduler({
  cap: 30, now: nowMs, budgetMs: BEAT_BUDGET_MS,
  setTimer: (fn, ms) => {
    const now = nowMs();
    let wait = Math.max(ms, Math.ceil((now + ms) / BEAT_MS) * BEAT_MS - now);
    if (debt >= BEAT_BUDGET_MS) { const beats = Math.min(15, Math.floor(debt / BEAT_BUDGET_MS)); wait += beats * BEAT_MS; debt -= beats * BEAT_BUDGET_MS; }
    const run = () => { const t0 = nowMs(); fn(); debt += Math.max(0, nowMs() - t0 - BEAT_BUDGET_MS) / 2; };
    return wait <= 17 ? { r: requestAnimationFrame(run) } : { t: setTimeout(() => requestAnimationFrame(run), wait - 10) };
  },
  clearTimer: (h) => { if (h?.r) cancelAnimationFrame(h.r); if (h?.t) clearTimeout(h.t); },
});

// Frames are SVG strings (putSvg, exported for tests). A frame that keeps the previous frame's elements and attribute names (the usual case: a
// meter's arc, a clock's digits, a glow's opacity move) only writes the values and text that changed into the live
// nodes; a frame whose structure changed is parsed again (innerHTML). Same pixels, a fraction of the DOM work.
const SVG_TOKEN = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|<!--([\s\S]*?)-->|([^<]+)/g;
const SVG_ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITY[e] ?? (decode.bad = true, m))));
const NS = { xlink: 'http://www.w3.org/1999/xlink', xml: 'http://www.w3.org/XML/1998/namespace' };
/** '<svg …>…</svg>' → { sig, nodes: [[kind, attrs | text]] } (nodes in document order), or null if it can't be patched. */
function svgTokens(svg) {
  const nodes = [];
  let sig = '', at = 0;
  decode.bad = false;
  for (const m of svg.matchAll(SVG_TOKEN)) {
    if (m.index !== at) return null;
    at = m.index + m[0].length;
    if (m[6] !== undefined) { nodes.push([0, decode(m[6])]); sig += '#'; continue; }   // text
    if (m[5] !== undefined) { nodes.push([1, m[5]]); sig += '!'; continue; }          // comment
    if (m[1]) { sig += '>'; continue; }                                                  // closing tag: no node
    const attrs = [];
    for (const a of m[3].matchAll(SVG_ATTR)) attrs.push([a[1], decode(a[2] ?? a[3] ?? '')]);
    nodes.push([2, attrs, m[2]]);
    sig += `<${m[2]}${attrs.map((a) => ' ' + a[0]).join('')}${m[4] ? '/' : ''}`;
  }
  return at === svg.length && !decode.bad ? { sig, nodes } : null;
}
export function putSvg(el, svg) {
  const prev = el.__svgTok, next = svgTokens(svg);
  el.__svg = svg; el.__svgTok = next;
  if (prev && next && prev.sig === next.sig && el.firstChild) {
    const walk = document.createTreeWalker(el, 0x85);   // elements, text, comments
    let node = walk.nextNode(), ok = true;
    for (let i = 0; i < next.nodes.length && ok; i++, node = walk.nextNode()) {
      const [kind, v] = next.nodes[i], old = prev.nodes[i][1];
      if (!node) { ok = false; break; }
      if (kind === 2) {
        if (node.nodeType !== 1 || node.localName !== next.nodes[i][2]) { ok = false; break; }
        for (let k = 0; k < v.length; k++) {
          if (v[k][1] === old[k][1]) continue;
          const name = v[k][0], c = name.indexOf(':');
          if (name === 'xmlns' || name.startsWith('xmlns:')) { ok = false; break; }
          if (c > 0 && NS[name.slice(0, c)]) node.setAttributeNS(NS[name.slice(0, c)], name, v[k][1]); else node.setAttribute(name, v[k][1]);
        }
      } else if (node.nodeType !== (kind === 0 ? 3 : 8)) ok = false;
      else if (v !== old) node.data = v;
    }
    if (ok && !node) return;
  }
  el.innerHTML = svg;
}
const runtimes = new Set();
let globalPaused = false, motionChosen = false, uid = 0;

// Screen readers and voice control activate a button with a bare `click` (detail 0) and no
// pointer or key events around it. Pointer clicks (detail ≥ 1) and the click a browser
// synthesizes after Enter / Space were already handled by those handlers, so onActivate
// runs only when no pointer or Enter / Space input touched the element just before.
const ACTIVATE_QUIET_MS = 600;
function onActivate(el, fn) {
  const stamp = () => { el.pdkInputAt = nowMs(); };
  el.addEventListener('pointerdown', stamp); el.addEventListener('pointerup', stamp);
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') stamp(); };
  el.addEventListener('keydown', key); el.addEventListener('keyup', key);
  el.addEventListener('click', (e) => { if (e.detail === 0 && !(nowMs() - (el.pdkInputAt ?? -Infinity) < ACTIVATE_QUIET_MS)) fn(e); });
}

// One MediaQueryList for the page (its .matches is live): the scheduler asks every slot, every frame, whether it
// is live, and a fresh matchMedia() per question was the deck's biggest per-frame cost.
let reducedQuery;
export const prefersReducedMotion = () => {
  if (reducedQuery === undefined) reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  return !!reducedQuery?.matches;
};

/** Pause (true) or resume (false) every deck on the page. Resuming is an explicit choice: it also plays under reduced motion. */
export function setGlobalMotion(paused) { globalPaused = !!paused; motionChosen = true; for (const r of runtimes) r.refresh(); }
export const isGlobalMotionPaused = () => globalPaused;

/** Page-wide numbers for perf overlays. */
export function deckStats() {
  let slots = 0, frames = 0, ms = 0, live = 0;
  for (const r of runtimes) { if (r.live()) live++; for (const s of r.slots) { slots++; frames += s.frames; ms += s.ms; } }
  return { decks: runtimes.size, live, slots, activeSlots: scheduler.active, frames, avgFrameMs: frames ? ms / frames : 0 };
}

/**
 * DOM-free: route one player input to a game host (what the key / dial / strip handlers call; exported for
 * tests). input: { type: 'press' | 'release' | 'rotate' | 'push' | 'touch' | 'reset', key?, dial?, ticks?, x?, y?, hold? }
 * ('push' = a dial pushed: a press with that dial). → host.dispatch() result
 */
export function gameInput(host, input, t) {
  const { type, ...rest } = input || {};
  if (type === 'reset') return host.reset(t);
  if (type === 'push') return host.dispatch({ type: 'press', dial: rest.dial, t });
  return host.dispatch({ ...rest, type, t });
}
/** DOM-free: the frame rate a game slot needs at t (transitions at ≤ cap fps, ticks while ticking; reduced motion keeps ticks only). */
export function gameFps(host, t, { still = false, cap = GAME_FPS } = {}) {
  if (still) return host.needsTick() ? host.tickHz : 0;
  return host.fps(t, cap);
}

const STYLE_ID = 'pdk-style';
const TILE_CSS = `.pdk-tile{position:relative;display:inline-block;overflow:hidden;background:#000;border:0;padding:0;margin:0;border-radius:14%;box-shadow:0 0 0 3px #00000080,inset 0 0 0 1px #ffffff14;transition:transform .12s cubic-bezier(.16,1,.3,1);touch-action:manipulation}
.pdk-tile.pdk-wide{border-radius:8px}.pdk-tile::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(162deg,#ffffff1c,#ffffff08 28%,transparent 46%)}
.pdk-tile .pdk-lcd,.pdk-tile .pdk-lcd>svg{display:block;width:100%;height:100%}.pdk-tile.pdk-down{transform:scale(.965)}.pdk-tile:focus-visible{outline:2px solid #b8a2f2;outline-offset:3px}
button.pdk-tile{cursor:pointer}.pdk-interactive .pdk-dial{touch-action:none}.pdk-interactive .pdk-key,.pdk-interactive .pdk-strip{touch-action:manipulation}
.pdk-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.pdk-strip:focus-visible::before{content:"";position:absolute;z-index:1;top:2px;bottom:2px;left:calc(var(--pdk-seg,0) * 100% / var(--pdk-segn,1));width:calc(100% / var(--pdk-segn,1));box-sizing:border-box;border-radius:6px;box-shadow:inset 0 0 0 2px #b8a2f2;pointer-events:none}
.pdk-day .pdk-strip:focus-visible::before{box-shadow:inset 0 0 0 2px #7353bb}
@media (prefers-reduced-motion:reduce){.pdk-tile{transition:none}}`;
const LIVE = '<span class="pdk-sr" role="status" aria-live="polite" aria-atomic="true"></span>';
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
    Object.assign(this, { rt, role, index, targets, spec: s, facet: s.facet, state: s.state || 0, params: s.params || {}, seed: s.seed ?? rt.opts.seed + index });
    this.value = typeof s.value === 'number' ? s.value : typeof this.facet.params?.value?.default === 'number' ? this.facet.params.value.default : 0.5;
    this.ticks = 0; this.pressed = false; this.pressAt = -Infinity; this.pressStart = 0; this.pressKey = null; this.turnAt = -Infinity; this.touch = null; this.stateAt = 0; this.frames = 0; this.ms = 0; this.error = null;
    this.prefix = `pdk${rt.id}${role[0]}${index}`;
    // Change governor (scene/scheduler.js, as the plugin runtime uses it): a slot whose recent frames changed
    // nothing drops to an idle probe rate until it changes again; any press / turn / redraw restores full rate.
    this.gov = createChangeGovernor({ idle: IDLE_FPS });
    this.fps = 0;
    this.active = () => this.rt.live() && !this.error;
    this.tick = () => { if (this.game && this.game.pump(this.rt.time())) { this.rt.publishGame?.(this); this.rt.labelSlot?.(this); } this.draw(true); };
    if (this.facet.game) this.bindGame(s.snapshot ?? rt.snapshots?.get(this.key()));
    this.onError = (err) => this.fail(err);
  }

  key() { return `${this.role}:${this.index}:${this.facet.id}`; }
  /** The rate the scheduler runs this slot at: the facet's own (base) rate, governed by what its frames change. */
  get fps() { return this.gov.fps(this.baseFps); }
  set fps(v) { this.baseFps = v; }

  /** A game host for this slot (fresh, or resumed from a snapshot); the slot's fps follows the game. */
  bindGame(snapshot) {
    const rt = this.rt;
    this.game = createGameHost(this.facet, { device: rt.modelId, params: this.params, seed: this.seed, span: this.spec?.span, snapshot, clock: () => rt.time() });
    let base = 0;
    Object.defineProperty(this, 'fps', { configurable: true, get: () => Math.max(base, gameFps(this.game, rt.time(), { still: rt.still, cap: rt.opts.fpsCap })), set: (v) => { base = v; } });
    // games keep ticking under reduced motion (only transitions are skipped)
    this.active = () => rt.playing && rt.visible && !globalPaused && !this.error;
  }

  /** Feed the game one input, redraw, tell the page (onGame: persist the snapshot, show a score …). */
  gameInput(input) {
    const t = this.rt.time();
    const before = this.game.state;
    const r = gameInput(this.game, input, t);
    if (r.changed || input.type !== 'tick') { this.draw(); scheduler.wake(this); }
    if (r.changed) { this.rt.publishGame?.(this); this.rt.announceGame?.(this, before); }
    this.rt.opts.onGame?.({ role: this.role, index: this.index, facet: this.facet.id, event: r.event, state: r.state, changed: r.changed, snapshot: this.game.snapshot() });
    return r;
  }

  opts(t) {
    const rt = this.rt;
    return { device: rt.modelId, theme: rt.opts.theme, mode: rt.opts.mode, t, since: Math.max(0, t - this.stateAt), state: this.state, params: this.params, seed: this.seed,
      pressed: this.pressed, pressAge: this.pressAt === -Infinity ? Infinity : Math.max(0, t - this.pressAt), value: this.value, ticks: this.ticks, values: rt.dialValues?.(),
      pressKey: this.pressKey, heldFor: this.heldFor || 0, ...inputState(this, t),
      now: rt.opts.now ? rt.opts.now() : Date.now(), tzOffset: rt.opts.tzOffset ?? -new Date().getTimezoneOffset(), reduced: rt.still, idPrefix: this.prefix, data: rt.bus.data(this.facet, this.params, rt.opts.data?.() || {}), uniqueIds: true,
      ...(this.game ? this.game.renderOpts(rt.time()) : {}), ...this.extra };
  }

  /** Render one frame into the slot's elements. scheduled: a scheduler tick (else an input / refresh: full rate again). */
  draw(scheduled = false) {
    const t0 = nowMs();
    const t = frameTime(this.facet, this.rt.time(), { still: this.rt.still, fps: this.game ? this.fps : this.baseFps });
    let changed = 0;
    try {
      const r = render(this.facet, this.opts(t));
      const put = (el, svg) => { if (el && el.__svg !== svg) { putSvg(el, svg); changed++; } };
      const T = this.targets;
      if (r.keys && T.keys) r.keys.forEach((k) => put(T.keys[k.i], k.svg));
      if (r.segments && T.segments) r.segments.forEach((svg, i) => put(T.segments[i], svg));
      if (r.screen && T.screen) put(T.screen, r.screen);
      if (T.el) put(T.el, r.svg);
    } catch (err) { this.fail(err); return; }
    if (!this.game) { if (scheduled) this.gov.observe(changed); else this.gov.reset(); }
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
    // the link bus: this device's shared state (or one a page shares between devices, opts.bus)
    this.bus = this.opts.bus || createLinkBus();
    this.unlink = this.bus.subscribe?.((changed, origin) => { if (origin !== this) this.follow(changed, null); });
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
    if (s.game) {
      clearTimeout(s.resetTimer);
      if (down) {
        s.pressKey = key ?? null; s.pressStart = t; s.pressed = true;
        s.gameInput({ type: 'press', key });
        s.resetTimer = setTimeout(() => { if (s.pressed) s.gameInput({ type: 'reset' }); }, GAME_RESET_HOLD_S * 1000);
      } else { if (!s.pressed) return; s.pressed = false; s.pressAt = t; s.heldFor = Math.max(0, t - s.pressStart); s.gameInput({ type: 'release', key: s.pressKey ?? undefined, heldFor: s.heldFor }); }
      this.labelSlot?.(s);
      return;
    }
    if (down) {
      if (key !== undefined) s.pressKey = key;
      s.pressStart = t;
      const before = s.state;
      s.state = nextState(s.facet, s.state);
      if (s.state !== before) { s.stateAt = t; this.relink(s, t); }
      s.pressed = true;
      this.opts.onPress?.({ role: s.role, index: s.index, facet: s.facet.id, state: s.state, stateName: s.facet.states?.[s.state] ?? null });
    } else { if (!s.pressed) return; s.pressed = false; s.pressAt = t; s.heldFor = Math.max(0, t - s.pressStart); }
    s.draw(); scheduler.wake(s); this.labelSlot?.(s);
  }
  /** A slot changed its state or dial value: publish its links; every slot mirroring a changed channel follows. */
  relink(src, t = this.time()) {
    const changed = this.bus.publish(src.facet, src.params, { state: src.state, value: src.value });
    if (!changed.length) return changed;
    this.follow(changed, src, t);
    this.bus.notify?.(changed, this);
    return changed;
  }
  /** Bring every slot that reads one of these channels in line with the bus, and redraw it. */
  follow(changed, src, t = this.time()) {
    for (const x of this.slots) {
      if (x === src || x.game || !this.bus.listens(x.facet, x.params, changed)) continue;
      const st = this.bus.stateOf(x.facet, x.params, x.state);
      if (st !== null && st !== x.state) { x.state = st; x.stateAt = t; }
      if (x.pressAt === -Infinity) x.pressAt = t - 10;   // it follows the device now: no demo autoplay (motion keys)
      const v = this.bus.valueOf(x.facet, x.params);
      if (v !== null && v !== x.value) { x.value = v; x.turnAt = t; }
      x.draw(); scheduler.wake(x); this.labelSlot?.(x);
    }
    this.syncDials?.();
  }
  /** New slots take the bus's shared values (or publish their own when the bus has none yet); games publish their readout. */
  adopt() {
    const changed = new Set();
    for (const x of this.slots) {
      if (x.game) { if (this.bus.set('game', readoutOf(x.facet, x.game.state, x.params))) changed.add('game'); continue; }
      const r = this.bus.adopt(x.facet, x.params, { state: x.state, value: x.value });
      x.state = r.state; if (typeof r.value === 'number') x.value = r.value;
      for (const c of r.changed) changed.add(c);
    }
    // slots that mirror a channel another slot also shows follow the device, not a demo autoplay
    const t = this.time();
    for (const x of this.slots) {
      if (x.game || x.pressAt !== -Infinity) continue;
      const own = linksOf(x.facet, x.params).map((l) => l.channel);
      if (own.length && this.slots.some((y) => y !== x && this.bus.listens(y.facet, y.params, own))) x.pressAt = t - 10;
    }
    if (changed.size) this.bus.notify?.([...changed], this);
  }
  /** A game slot changed: its readout goes on the 'game' channel (screens and strips that show it redraw). */
  publishGame(s) {
    if (!this.bus.set('game', readoutOf(s.facet, s.game.state, s.params))) return;
    this.follow(['game'], s);
    this.bus.notify?.(['game'], this);
  }
  /** Say a game's result in the device's live region once its animation has played (dice land, reels stop). */
  announceGame(s, prev) {
    const text = gameAnnouncement(s.facet, prev, s.game.state, s.params);
    if (!text) return;
    clearTimeout(this.sayTimer);
    const ms = this.still ? 0 : Math.min(3, s.facet.game?.animate || 0) * 1000;
    this.sayTimer = setTimeout(() => this.say(text), ms);
  }
  /** Polite announcement (re-set through '' so the same words twice are spoken twice). */
  say(text) {
    const el = this.liveEl;
    if (!el || !text) return;
    el.textContent = '';
    clearTimeout(this.sayClear);
    this.sayClear = setTimeout(() => { el.textContent = text; }, 40);
  }
  /** A press and its release a moment later (taps, the strip, programmatic presses). */
  tap(s, ms = 140, key) { if (!s) return; Runtime.prototype.press.call(this, s, true, key); setTimeout(() => Runtime.prototype.press.call(this, s, false), ms); }   // not DeckView.press(i) (an index)
  destroy() { clearTimeout(this.sayTimer); clearTimeout(this.sayClear); this.unlink?.(); this.clear(); runtimes.delete(this); if (this.root) observer?.unobserve(this.root); this.ro?.disconnect(); this.host.innerHTML = ''; }
  play() { this.playing = true; this.refresh(); return this; }
  pause() { this.playing = false; return this; }
  restart() { this.t0 = nowMs(); for (const s of this.slots) { s.stateAt = 0; s.pressAt = -Infinity; if (s.game) s.bindGame(null); } this.refresh(); return this; }
  get stats() { let frames = 0, ms = 0; for (const s of this.slots) { frames += s.frames; ms += s.ms; } return { slots: this.slots.length, frames, avgFrameMs: frames ? ms / frames : 0 }; }
}

/**
 * A virtual device. opts: { model, theme, mode, width | scale | fit, maxHeight, maxWidth, keys: [facet|spec|id],
 * facet (span/deck over the device; the keys a span does not cover take opts.keys), strip (a full-strip facet),
 * dials: [segment facets], screen (screen facet), dialValues, interactive, autoPause, reducedMotion, fpsCap, seed,
 * speed, data(), now(), tzOffset, resolve(id), onPress, onRotate, onTouch, onGame, label, bus (a createLinkBus() shared with other
 * devices on the page, so linked keys agree across them) }.
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
    this.snapshots = new Map(this.slots.filter((s) => s.game).map((s) => [s.key(), s.game.snapshot()]));   // games survive rebuilds
    this.clear();
    if (this.root) observer?.unobserve(this.root);
    const d = this.model, o = this.opts;
    this.width = o.fit ? this.fitted() || o.width || 600 : o.width || (o.scale ? 0 : this.host.clientWidth || 600);
    this.host.innerHTML = deviceMarkup(d.id, { theme: o.theme, mode: o.mode, width: this.width || undefined, scale: o.scale, interactive: o.interactive, label: o.label });
    this.root = this.host.firstElementChild;
    // game results, strip segments: one polite live region per device
    this.liveEl = null;
    if (o.interactive) { this.root.insertAdjacentHTML('beforeend', LIVE); this.liveEl = this.root.lastElementChild; }
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
    // A Galleon screen the page left empty shows the score of the game on the keys (deck facets draw their own).
    const gameOnKeys = (wide?.facet.game && !isDeck) || this.keySlots.some((s) => s?.game);
    const screenSpec = o.screen || (screenEl && d.screen?.kind === 'galleon' && gameOnKeys && o.resolve ? (() => { try { return o.resolve('screen-galleon-game') ? 'screen-galleon-game' : null; } catch { return null; } })() : null);
    this.screenSlot = screenEl && screenSpec ? this.add('screen', 0, screenSpec, { el: screenEl }, { screen: d.screen?.kind === 'infobar' ? 'infobar' : 'galleon' }) : null;
    this.adopt();
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
    let label = own ? own.label() : this.wide ? `${this.wide.facet.title} — key ${i + 1}` : `Key ${i + 1} (empty)`;
    // a game says what is on each of its keys (Lights Out: lit / off as aria-pressed; tic-tac-toe: X / O / empty)
    const g = own?.game ? own : !own && this.wide?.game ? this.wide : null;
    let pressed = null;
    if (g) {
      const k = g === own ? 0 : (g.game.grid?.cells || []).findIndex((c) => c.i === i);
      const c = gameCell(g.facet, g.game.state, k, g.params);
      if (c?.label) label += `: ${c.label}`;
      if (c && 'pressed' in c) pressed = c.pressed;
    }
    b.setAttribute('aria-label', label);
    if (pressed === null) b.removeAttribute('aria-pressed'); else b.setAttribute('aria-pressed', String(pressed));
  }
  labelSlot(s) {
    if (s.role === 'key') this.labelKey(s.index);
    else if (s.role === 'device') this.keyBtns.forEach((_, i) => this.labelKey(i));
    if (s.role === 'dial') this.syncDials();
  }
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
    if (s) { s.value = stepValue(s.value, ticks, dialStep(s.facet, s.params)); s.ticks += ticks; s.turnAt = t; s.draw(); scheduler.wake(s); this.relink(s, t); }
    else if (i < this.vals.length) this.vals[i] = stepValue(this.vals[i], ticks, 0.02);
    for (const x of this.slots) if (x.role === 'strip' || x.role === 'device' || x.role === 'screen') { x.turnAt = t; if (x.game) x.gameInput({ type: 'rotate', dial: i, ticks }); else { x.draw(); scheduler.wake(x); } }
    this.syncDials();
    this.opts.onRotate?.({ index: i, ticks, value: this.dialValues()[i] });
  }
  /** Press (and release) key i programmatically. */
  press(i) { this.tap(this.slotOfKey(i), 140, i); }
  /** Push dial i (a tap on the knob, Enter / Space on a focused dial). */
  pushDial(i) {
    const s = this.dialSlots[i];
    if (s) this.tap(s);
    else if (this.wide?.game) this.wide.gameInput({ type: 'push', dial: i });
    else if (this.screenSlot && this.model.screen?.kind === 'galleon') this.tap(this.screenSlot, 140);
    else this.opts.onPress?.({ role: 'dial', index: i, facet: null, state: 0, stateName: null });
  }

  wire() {
    const down = (el, on) => el.classList.toggle('pdk-down', on);
    this.keyBtns.forEach((b, i) => {
      b.addEventListener('pointerdown', (e) => { if (e.button) return; down(b, true); super.press(this.slotOfKey(i), true, i); b.setPointerCapture?.(e.pointerId); });
      const up = () => { if (!b.classList.contains('pdk-down')) return; down(b, false); super.press(this.slotOfKey(i), false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(b, true); super.press(this.slotOfKey(i), true, i); } });
      b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); up(); } });
      onActivate(b, () => { down(b, true); setTimeout(() => down(b, false), 140); this.press(i); });
    });
    this.dialEls.forEach((el, i) => {
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-valuemin', '0');
      el.setAttribute('aria-valuemax', '100');
      let acc = 0;
      el.addEventListener('wheel', (e) => { e.preventDefault(); const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc; this.rotate(i, r.ticks); }, { passive: false });
      // Drag up / down to turn; a tap without travel pushes the dial — or, on its left / right third, turns it
      // one detent down / up (2.5.7: a single tap does everything a drag does).
      let g = null;
      if (!el.title) el.title = 'Drag up or down, or tap the left / right side, to turn · tap the middle to push';
      el.addEventListener('pointerdown', (e) => { if (e.button) return; const r = el.getBoundingClientRect(), fx = r.width ? (e.clientX - r.left) / r.width : 0.5; g = { x: e.clientX, y: e.clientY, ly: e.clientY, rest: 0, moved: false, zone: fx < 0.34 ? -1 : fx > 0.66 ? 1 : 0 }; el.setPointerCapture?.(e.pointerId); down(el, true); });
      el.addEventListener('pointermove', (e) => {
        if (!g) return;
        if (!g.moved && !isTap(e.clientX - g.x, e.clientY - g.y)) g.moved = true;
        if (!g.moved) return;
        const r = dragTicks(g.ly - e.clientY + g.rest);
        g.ly = e.clientY; g.rest = r.rest;
        this.rotate(i, r.ticks);
      });
      const end = (cancel) => { if (!g) return; const tapped = !g.moved && !cancel, zone = g.zone; g = null; down(el, false); if (tapped) { if (zone) this.rotate(i, zone); else this.pushDial(i); } };
      el.addEventListener('pointerup', () => end(false)); el.addEventListener('pointercancel', () => end(true));
      el.addEventListener('keydown', (e) => {
        const turn = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (turn) { e.preventDefault(); this.rotate(i, turn * (e.shiftKey && Math.abs(turn) === 1 ? 5 : 1)); }
        else if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); down(el, true); this.pushDial(i); setTimeout(() => down(el, false), 140); }
      });
      // a scripted / assistive click (el.click(), screen readers, voice control) pushes the dial like a tap
      onActivate(el, () => { down(el, true); this.pushDial(i); setTimeout(() => down(el, false), 140); });
    });
    // The Galleon screen has no touch: its widgets belong to the dials, so a click on a widget pushes the dial under it.
    const scr = this.root.querySelector('.pdk-screen');
    if (scr && this.model.screen?.kind === 'galleon' && (this.screenSlot || this.wide)) {
      scr.style.cursor = 'pointer';
      scr.addEventListener('click', (e) => { const r = scr.getBoundingClientRect(); this.pushDial(e.clientX - r.left < r.width / 2 ? 0 : 1); });
    }
    if (this.stripBtn && this.model.dials?.touch) {
      // Tap or long-touch (≥ HOLD_S) the segment under the finger; the facet gets ctx.touch { x, y, hold, age }.
      const strip = this.model.strip, n = this.dialEls.length || strip.segments;
      const touch = (px, py, w, h, hold) => {
        const T = stripTouch(px, py, w, h, { w: strip.w, h: strip.h, segments: n });
        choose(T.i, false);
        const t = this.time(), dial = this.dialSlots[T.i], full = this.slots.find((x) => x.role === 'strip' || x.role === 'device');
        if (dial) dial.touch = { x: T.segX, y: T.y, hold, at: t };
        if (full) full.touch = { x: T.x, y: T.y, hold, at: t };
        if (!dial && full?.game) full.gameInput({ type: 'touch', x: T.x, y: T.y, hold });
        else this.tap(dial || full, 120);
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
      // Keyboard: ← → (Home / End) choose a segment, Enter / Space touch it (Shift: a long touch); a screen
      // reader's bare click touches the chosen segment too. The chosen segment is outlined while focused.
      const sb = this.stripBtn;
      let seg = 0;
      const segName = () => { const ds = this.dialSlots[seg]; return `Touch strip — segment ${seg + 1} of ${n}${ds ? `: ${ds.label()}` : ''}`; };
      const choose = (v, speak) => { seg = Math.max(0, Math.min(n - 1, v)); sb.style.setProperty('--pdk-seg', String(seg)); sb.setAttribute('aria-label', segName()); if (speak) this.say(segName()); };
      sb.style.setProperty('--pdk-segn', String(n));
      choose(0, false);
      const touchSeg = (hold) => {
        const r = sb.getBoundingClientRect();
        touch(((seg + 0.5) * r.width) / n, r.height / 2, r.width, r.height, hold);
        const ds = this.dialSlots[seg];
        if (ds) setTimeout(() => { sb.setAttribute('aria-label', segName()); this.say(ds.label()); }, 160);
      };
      sb.addEventListener('keydown', (e) => {
        const to = { ArrowLeft: seg - 1, ArrowRight: seg + 1, Home: 0, End: n - 1 }[e.key];
        if (to !== undefined) { e.preventDefault(); if (to !== seg && to >= 0 && to < n) choose(to, true); return; }
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); touchSeg(e.shiftKey); }
      });
      onActivate(sb, () => touchSeg(false));
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
    this.host.innerHTML = `<${tag} class="pdk-tile${f.surface === 'key' ? '' : ' pdk-wide'}"${o.interactive ? ` type="button" aria-label="${esc(f.title)}"` : ' aria-hidden="true"'} style="${css}"><span class="pdk-lcd"></span></${tag}>${o.interactive ? LIVE : ''}`;
    this.root = this.host.firstElementChild;
    this.liveEl = o.interactive ? this.host.querySelector('.pdk-sr') : null;
    this.slot = this.add(f.surface, 0, this.sp, { el: this.root.firstElementChild }, sz ? { size: sz } : {});
    if (o.interactive) {
      const b = this.root, s = this.slot;
      b.addEventListener('pointerdown', (e) => { if (e.button) return; b.classList.add('pdk-down'); this.press(s, true); });
      const up = () => { if (!b.classList.contains('pdk-down')) return; b.classList.remove('pdk-down'); this.press(s, false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); b.classList.add('pdk-down'); this.press(s, true); } });
      b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') up(); });
      onActivate(b, () => { b.classList.add('pdk-down'); setTimeout(() => b.classList.remove('pdk-down'), 140); this.tap(s); });
      if (f.surface === 'strip') {
        let acc = 0;
        b.addEventListener('wheel', (e) => {
          e.preventDefault();
          const r = wheelTicks(acc, e.deltaY, e.deltaMode); acc = r.acc;
          if (r.ticks) { s.value = stepValue(s.value, r.ticks, dialStep(f, s.params)); s.ticks += r.ticks; s.draw(); this.labelSlot?.(s); }
        }, { passive: false });
      }
      this.labelSlot = () => {
        const c = s.game ? gameCell(s.facet, s.game.state, 0, s.params) : null;
        b.setAttribute('aria-label', s.label() + (c?.label ? `: ${c.label}` : ''));
        if (c && 'pressed' in c) b.setAttribute('aria-pressed', String(c.pressed)); else b.removeAttribute('aria-pressed');
      };
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
