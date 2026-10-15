// The hidraw runner: facets → engine render() → src/raster → HidDeck, at the
// device's update budget; input reports → facet state.
//
//   const deck = await HidDeck.open(info);
//   const run = createRunner(deck, resolveLayout(deck.model, spec), { theme: 'prism', mode: 'dark' });
//   await run.start();  …  run.setData({ cpu: 0.42 });  …  await run.stop();
//
// Pacing: one shared scene scheduler; animated facets tick at effectiveFps(facet, { cap }), still
// facets render only on change (plus a short burst after an interaction so press feedback and state
// transitions animate; facets that read the clock refresh at 1 fps). Dedupe happens three times:
// identical slice SVG → no raster (API 1.2 slices are byte-identical when a key didn't change),
// identical pixels → no encode / write (HidDeck), unsent frame superseded → only the latest goes out.
//
// Input: key down/up → pressed / pressKey / pressedFor, release → nextState(); dial rotate → ticks,
// value (dialStep per tick), turnAge; dial press → pressed, release → nextState(); + strip touch →
// ctx.touch on the segment under the finger (tap = press + release, long press = hold, flick = value
// change); Galleon: holding a dial `layerHoldMs` (3 s, as in the Stream Deck app) switches which widget
// layer it controls, shown by a white underline.

import { render, nextState } from '../render.js';
import { createScheduler, effectiveFps, quantize, FPS_CAP } from '../scene/scheduler.js';
import { rasterize as defaultRasterize } from '../raster/index.js';
import { pad, fillRect } from './pixels.js';

const BURST_MS = 1200;   // render at the facet's (or 10) fps this long after an interaction
const CLOCK_DATA = ['clock', 'timer'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createRunner(deck, layout, opts = {}) {
  const model = deck.model;
  const {
    theme = layout.theme || 'prism', mode = layout.mode, rasterize = defaultRasterize,
    now = () => (globalThis.performance?.now ? performance.now() : Date.now()), wallNow = () => Date.now(),
    tzOffset = () => -new Date().getTimezoneOffset(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h),
    fpsCap = FPS_CAP, reduced = false, dialStep = 1 / 48, layerHoldMs = 3000, layerIndicator = true, onError = () => {},
  } = opts;
  const data = { ...(opts.data || {}) };
  const slots = layout.slots;
  const stats = { renders: 0, rasterized: 0, sameSvg: 0, errors: 0, inputs: 0 };
  const W = model.lcd?.kind === 'screen' ? model.lcd.widgets : null;
  const activeLayer = [0, 0];
  const holdTimers = new Map(), heldSwitched = new Set();
  let t0 = 0, running = false;

  const sched = createScheduler({ cap: Math.max(1, fpsCap), now, setTimer, clearTimer });

  for (const s of slots) {
    s.stateAt = 0; s.pressed = false; s.pressAt = 0; s.pressKey = null; s.releaseAt = null; s.turnAt = null; s.touch = null;
    s.burstUntil = -Infinity; s.lastSvg = new Map(); s.busy = false; s.dirty = false; s.failed = null;
    const v0 = typeof s.value === 'number' ? s.value : typeof s.facet.params?.value?.default === 'number' ? s.facet.params.value.default : 0.5;
    s.value = clamp01(v0);
    const n = s.kind === 'screen' && W ? W.cols * W.rows : s.kind === 'strip' || s.kind === 'deck' ? (model.lcd?.segments || 4) : 1;
    s.values = Array(n).fill(s.value);
    const animFps = effectiveFps(s.facet, { cap: fpsCap, reduced });
    const clocky = (s.facet.data || []).some((d) => CLOCK_DATA.includes(d));
    s.fpsAnim = animFps;
    s.fpsIdle = animFps || (clocky && !reduced ? 1 : 0);
    s.sched = {
      get fps() { return s.fpsAnim || (now() < s.burstUntil ? Math.min(fpsCap, 10) : s.fpsIdle); },
      active: () => running && !s.failed && (s.fpsAnim > 0 || s.fpsIdle > 0 || now() < s.burstUntil),
      tick: (ms) => { void renderSlot(s, ms); },
      onError: (e) => fail(s, e),
    };
  }

  function fail(s, e) {
    stats.errors++;
    if (!s.failed) { s.failed = e; onError(Object.assign(e instanceof Error ? e : new Error(String(e)), { slot: s.id, facet: s.facet.id })); }
  }

  // ---------- rendering ----------

  function optsFor(s, ms) {
    const fps = s.fpsAnim || Math.min(fpsCap, 10);
    const t = quantize(Math.max(0, (ms - t0) / 1000), fps);
    const local = s.touch && (s.kind === 'segment' ? { ...s.touch, x: s.touch.x - s.dials[0] * 200 } : s.touch);
    return {
      device: model.id, theme, mode, t, frame: Math.round(t * fps), fps,
      state: s.state, since: Math.max(0, (ms - s.stateAt) / 1000),
      pressed: s.pressed, pressKey: s.pressKey, pressedFor: s.pressed ? (ms - s.pressAt) / 1000 : 0,
      pressAge: s.releaseAt == null ? Infinity : (ms - s.releaseAt) / 1000,
      value: s.value, values: s.values, ticks: s.ticks, turnAge: s.turnAt == null ? Infinity : (ms - s.turnAt) / 1000,
      touch: local ? { x: local.x, y: local.y, hold: local.hold, age: (ms - local.at) / 1000 } : undefined,
      params: s.params, data, now: wallNow(), tzOffset: tzOffset(), reduced, ...s.renderOpts,
    };
  }

  function svgFor(s, tg, r) {
    if (tg.type === 'key') return s.kind === 'key' ? r.svg : r.keys?.find((k) => k.i === tg.key)?.svg;
    if (tg.piece === 'segment') return r.segments?.[tg.index];
    if (tg.piece === 'widget') return r.widgets?.find((w) => w.dial === tg.dial && w.layer === tg.layer)?.svg;
    return s.kind === 'deck' ? r.screen : r.svg;
  }

  /** Galleon: underline rects (target-local px) for the widget each dial controls. */
  function indicators(tg) {
    if (!W || !layerIndicator || tg.type !== 'lcd') return [];
    const out = [];
    for (let d = 0; d < W.cols; d++) {
      const x = d * W.w + W.w / 2 - 28, y = activeLayer[d] * W.h + W.h - 6;
      const lx = x - tg.rect.x, ly = y - tg.rect.y;
      if (lx >= 0 && ly >= 0 && lx + 56 <= tg.rect.w && ly + 3 <= tg.rect.h) out.push([lx, ly, 56, 3]);
    }
    return out;
  }

  async function renderSlot(s, ms = now()) {
    if (!running || s.failed) return;
    if (s.busy) { s.dirty = true; return; }
    s.busy = true;
    try {
      const r = render(s.facet, optsFor(s, ms));
      stats.renders++;
      for (const tg of s.targets) {
        const svg = svgFor(s, tg, r);
        if (!svg) continue;
        const marks = indicators(tg);
        const key = marks.length ? `${svg}|${marks.join(';')}` : svg;
        if (s.lastSvg.get(tg.id) === key) { stats.sameSvg++; continue; }
        s.lastSvg.set(tg.id, key);
        let img = await rasterize(svg, tg.w, tg.h);
        stats.rasterized++;
        if (tg.padTo) img = pad(img, tg.padTo.w, tg.padTo.h, (tg.padTo.w - tg.w) >> 1, (tg.padTo.h - tg.h) >> 1);
        for (const [x, y, w, h] of marks) fillRect(img, x, y, w, h, [255, 255, 255], 0.92);
        const sent = tg.type === 'key' ? deck.setKey(tg.key, img) : deck.setLcd(img, tg.rect);
        sent.catch((e) => { if (e.code !== 'ENODEV') fail(s, e); });
      }
    } catch (e) {
      fail(s, e);
    } finally {
      s.busy = false;
      if (s.dirty && running) { s.dirty = false; void renderSlot(s, now()); }
    }
  }

  function poke(s, ms) {
    s.burstUntil = reduced ? -Infinity : ms + BURST_MS;
    sched.wake(s.sched);
    void renderSlot(s, ms);
  }

  // ---------- input ----------

  const keySlot = (ev) => (ev.sensor !== undefined ? layout.infobarOwner : layout.keyOwner.get(ev.key));
  function dialSlot(d) {
    if (W) return layout.widgetOwner.get(`${d},${activeLayer[d]}`) || null;
    return layout.segOwner.get(d) || null;
  }
  const valueIndex = (s, d) => (W && s.kind === 'screen' ? activeLayer[d] * W.cols + d : s.kind === 'segment' || s.kind === 'widget' ? 0 : d);

  function press(s, ms, key = null) { if (!s) return; s.pressed = true; s.pressAt = ms; s.pressKey = key; poke(s, ms); }
  function release(s, ms, { advance = true } = {}) {
    if (!s || !s.pressed) return;
    s.pressed = false; s.releaseAt = ms;
    if (advance) { const ns = nextState(s.facet, s.state); if (ns !== s.state) { s.state = ns; s.stateAt = ms; } }
    poke(s, ms);
  }
  function turn(s, d, ticks, ms) {
    if (!s) return;
    s.ticks += ticks;
    const i = valueIndex(s, d);
    s.values[i] = clamp01((s.values[i] ?? s.value) + ticks * dialStep);
    s.value = s.values[i];
    s.turnAt = ms;
    poke(s, ms);
  }
  function switchLayer(d, ms) {
    const before = dialSlot(d);
    if (before) release(before, ms, { advance: false });
    activeLayer[d] ^= 1;
    heldSwitched.add(d);
    for (const s of slots) if (s.targets.some((tg) => tg.type === 'lcd')) { for (const tg of s.targets) if (tg.type === 'lcd') s.lastSvg.delete(tg.id); void renderSlot(s, ms); }
  }

  function handle(ev) {
    const ms = now();
    stats.inputs++;
    switch (ev.type) {
      case 'down': press(keySlot(ev), ms, ev.sensor === undefined ? ev.key : null); break;
      case 'up': release(keySlot(ev), ms); break;
      case 'rotate': turn(dialSlot(ev.dial), ev.dial, ev.ticks, ms); break;
      case 'dialDown': {
        press(dialSlot(ev.dial), ms);
        if (W && layerHoldMs > 0) { clearTimer(holdTimers.get(ev.dial)); holdTimers.set(ev.dial, setTimer(() => { holdTimers.delete(ev.dial); switchLayer(ev.dial, now()); }, layerHoldMs)); }
        break;
      }
      case 'dialUp': {
        if (holdTimers.has(ev.dial)) { clearTimer(holdTimers.get(ev.dial)); holdTimers.delete(ev.dial); }
        if (heldSwitched.delete(ev.dial)) break; // the hold switched layers: not a press
        release(dialSlot(ev.dial), ms);
        break;
      }
      case 'touch': {
        if (model.lcd?.kind !== 'strip') break;
        const seg = Math.max(0, Math.min(model.lcd.segments - 1, Math.floor(ev.x / 200)));
        const s = layout.segOwner.get(seg);
        if (!s) break;
        s.touch = { x: ev.x, y: ev.y, hold: ev.gesture === 'press', at: ms };
        if (ev.gesture === 'flick' && ev.x2 !== undefined) turn(s, seg, Math.round((ev.x2 - ev.x) / (200 * dialStep)), ms);
        else { press(s, ms); release(s, ms); }
        break;
      }
      default: break;
    }
  }

  const onInput = (ev) => handle(ev);
  const onInvalidate = () => { for (const s of slots) { s.lastSvg.clear(); void renderSlot(s, now()); } };

  return {
    slots, stats, data, activeLayer,
    /** Render every slot once and start the clock. */
    async start() {
      if (running) return;
      running = true;
      t0 = now();
      for (const s of slots) s.stateAt = t0;
      deck.on('input', onInput);
      deck.on('invalidate', onInvalidate);
      await Promise.all(slots.map((s) => renderSlot(s, t0)));
      for (const s of slots) sched.add(Object.assign(s.sched, { phase: 0 }));
    },
    /** Merge live data (ctx.data) and re-render the slots that read it. */
    setData(patch) {
      Object.assign(data, patch);
      const keys = Object.keys(patch);
      for (const s of slots) if ((s.facet.data || []).some((d) => keys.includes(d)) && !s.fpsAnim) void renderSlot(s, now());
    },
    /** Feed one input event (HidDeck emits them; tests call this directly). */
    handle,
    /** Re-render one slot now (tests / tools). */
    renderSlot: (s) => renderSlot(s, now()),
    /** The render() options a slot would get right now (tests / tools). */
    optsFor: (s) => optsFor(s, now()),
    async stop() {
      running = false;
      sched.stop();
      for (const h of holdTimers.values()) clearTimer(h);
      holdTimers.clear();
      deck.off('input', onInput);
      deck.off('invalidate', onInvalidate);
      await deck.flush();
    },
  };
}
