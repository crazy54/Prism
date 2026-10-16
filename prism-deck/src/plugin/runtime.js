// The Prism Deck plugin runtime: action instances → render units → frames.
//
//   instance  one Prism action on the deck (a key, a dial / Galleon widget, a Neo info bar),
//             with its coordinates and settings (settings.js)
//   unit      what renders together: one instance, or a block of instances sharing a
//             multi-key facet + span group (a span across keys, a strip panorama across
//             dials, the Galleon screen across its 4 widgets, a whole-deck facet).
//             Each unit owns a scheduler slot; spans are rendered once per frame and
//             sliced per key (API 1.2 culls slices, so unchanged keys are byte-identical
//             and the per-key dedupe drops them).
//
// Frame rate per unit = the facet's fps (motion: full | calm | still), a short burst
// at BURST_FPS after any interaction (press feedback, state change, arrival), a 2 fps
// probe once its output stops changing, all capped by a fair share of the device
// budget (budget.js). Devices that disconnect pause their units; willDisappear drops
// them; systemDidWakeUp repaints everything.
//
// The live control channel (control.js) drives this through: devices(), setOverlays(),
// setPrompt(), and the 'pair-press' / 'behavior' / 'globals' events.

import { EventEmitter } from 'node:events';
import { render, stillTime, nextState } from '../render.js';
import * as sched from '../scene/scheduler.js';
import { svgDataUrl, svgWindow } from '../scene/svg.js';
import { findFacet } from '../facets/index.js';
import { deviceFromInfo, deckLayout } from '../devices.js';
import { DeviceBudget, allocateFps, createUpdateBucket, elementCount, updateCost } from './budget.js';
import { createTimer } from '../apps/sources/timer.js';
import { createGameHost, GAME_RESET_HOLD_S, GAME_FPS } from '../scene/game.js';
import { createLinkBus, readoutOf, linksOf } from '../scene/link.js';
import { facetMode, facetsFor, normalizeSettings, normalizeGlobals, compactSettings, GROUP_MODES, DEFAULT_GLOBALS, bundledProfileFor } from './settings.js';
import { CANVAS_LAYOUT_PATH, INFOBAR_LAYOUT_PATH, canvasPayload, widgetCanvas, fitCanvas, galleonWidgetRects } from './feedback.js';
import { SYSTEM_FACETS, PAIR_HOLD_S } from './system-facets.js';
import { DEMO_KEYS, withDemoBadge, badgeTarget } from './demo-badge.js';
import { createDataHub } from './data.js';

export const PLUGIN_UUID = 'com.jeremyfhall.prism';
export const BURST_FPS = 15;          // frames/s while press feedback / a state transition plays
export const BURST_S = 0.8;           // how long a burst lasts after an interaction (Refraction motion is 240–600 ms)
export const IDLE_PROBE_FPS = 2;      // a unit whose frames stopped changing is checked this often
export const VIRTUAL_TYPES = new Set([3, 11, 14]); // Mobile, Virtual Stream Deck, MCP Deck: never approve pairing there
export const AUDIO_KEYS = ['audio', 'spectrum'];   // fed per frame from the audio source (src/audio), not the 1 s data hub
const PERSIST_MS = 400;
const quantize = sched.quantize;
const BOOT_FACET = 'span-power-on';
const BOOT_DECIDE_MS = 600;       // wait this long for global settings (boot on/off, motion) before deciding
const HOLD_BURST_MAX_MS = 30_000;   // a held key keeps animating (hold gestures), up to this long (a lost keyUp can't spin forever)
const TIMER_RUN = new Set(['running', 'focus', 'break']); // states in which a key's timer runs
const MAX_TIMERS = 256;
const GAME_MODES = new Set(['key', 'span', 'deck']); // where games run (docs/game-runtime.md §1)
const spanOf = (members) => { const cs = members.map((m) => m.col), rs = members.map((m) => m.row); const col = Math.min(...cs), row = Math.min(...rs); return { col, row, cols: Math.max(...cs) - col + 1, rows: Math.max(...rs) - row + 1 }; };
const REALLOC_MS = 2000;
const PREVIEW_MS = 250;

const exactFacet = (id) => { if (typeof id !== 'string') return null; const f = findFacet(id); return f && f.id === id ? f : null; };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const coordKey = (c, r) => `${c},${r}`;

export class PrismRuntime extends EventEmitter {
  /**
   * opts: { conn (StreamDeckConnection-like), now() → ms (monotonic), wallNow() → epoch ms, setTimer, clearTimer,
   *         data (createDataHub()), log(level, msg), version }
   */
  constructor({ conn, now = () => performance.now(), wallNow = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h), data, log = () => {}, version = '0.0.0', raster = null, audio = null, deviceSvg = null } = {}) {
    super();
    this.conn = conn;
    this.now = now;
    this.wallNow = wallNow;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.data = data || createDataHub();
    this.log = log;
    this.version = version;
    this.raster = raster;           // src/raster module (optional): globals.format 'png'
    this.audio = audio;             // src/audio AudioSource (optional): retained while audio units are visible
    this.deviceSvg = deviceSvg;     // scene/qt.js toDeviceSvg: Qt ignores clipPath / preserveAspectRatio, so every payload goes through it
    this.timers = new Map();        // context → createTimer() for stopwatch / countdown keys (kept across page switches)
    this.bootAt = now();            // the boot sequence's t = seconds since the plugin started
    this.bootPending = false;       // set by start(): physical decks' keys wait (blank) until we know whether to play it
    this.boot = null;               // { facet, devices: Set, endAt, timer }
    this.globals = normalizeGlobals(DEFAULT_GLOBALS);
    this.devices = new Map();
    this.instances = new Map();
    this.units = new Map();
    this.links = new Map();        // deviceId → link bus (scene/link.js): the state keys, dials and screens of one device share
    this.overlays = new Map();     // deviceId → { keys: Map('c,r' → look config), dials: Map('d,l' → look config) }
    this.prompt = null;            // { code, client, contexts: Set, shownAt }
    this.pi = null;                // { context, action, timer, last }
    this.updates = createUpdateBucket(this.globals.limits, now); // ~200 updates/s shared by every device (hardware lab)
    this.scheduler = sched.createScheduler({ cap: 30, now, setTimer: (fn, ms) => { const h = setTimer(fn, ms); h?.unref?.(); return h; }, clearTimer });
    this.reallocTimer = null;
    this.started = false;
    this.handlers = {
      deviceDidConnect: (m) => this.onDeviceConnect(m),
      deviceDidChange: (m) => this.onDeviceConnect(m, true),
      deviceDidDisconnect: (m) => this.onDeviceDisconnect(m),
      willAppear: (m) => this.onWillAppear(m),
      willDisappear: (m) => this.onWillDisappear(m),
      keyDown: (m) => this.onPress(m, true),
      keyUp: (m) => this.onPress(m, false),
      dialDown: (m) => this.onPress(m, true),
      dialUp: (m) => this.onPress(m, false),
      dialRotate: (m) => this.onDialRotate(m),
      touchTap: (m) => this.onTouchTap(m),
      didReceiveSettings: (m) => this.onSettings(m),
      didReceiveGlobalSettings: (m) => this.onGlobalSettings(m),
      propertyInspectorDidAppear: (m) => this.onPiAppear(m),
      propertyInspectorDidDisappear: (m) => this.onPiDisappear(m),
      sendToPlugin: (m) => this.onPiMessage(m),
      systemDidWakeUp: () => this.repaintAll(true),
    };
  }

  /** Attach to the connection (call after conn.connect() or before — events are just listened to). */
  start() {
    if (this.started) return this;
    this.started = true;
    for (const [ev, fn] of Object.entries(this.handlers)) this.conn.on(ev, (m) => { try { fn(m); } catch (e) { this.log('error', `${ev}: ${e.stack || e.message}`); } });
    for (const d of this.conn.info?.devices || []) this.upsertDevice(d.id, d);
    // Global settings (theme, budget, AI editing) arrive as didReceiveGlobalSettings once the socket is open.
    if (this.conn.open) this.conn.getGlobalSettings?.();
    else this.conn.once?.('open', () => this.conn.getGlobalSettings?.());
    this.reallocTimer = setInterval(() => this.reallocate(), REALLOC_MS);
    this.bootPending = true;
    this.bootAt = this.now();
    this.bootDecideTimer = this.setTimer(() => this.decideBoot(), BOOT_DECIDE_MS);
    this.bootDecideTimer?.unref?.();
    this.reallocTimer.unref?.();
    return this;
  }

  stop() {
    this.scheduler.stop();
    if (this.reallocTimer) clearInterval(this.reallocTimer);
    if (this.bootDecideTimer) this.clearTimer(this.bootDecideTimer);
    if (this.boot?.timer) this.clearTimer(this.boot.timer);
    this.reallocTimer = null;
    for (const u of this.units.values()) { u.release?.(); u.audioRelease?.(); u.audioRelease = null; }
    for (const d of this.devices.values()) d.budget.dispose();
    for (const i of this.instances.values()) if (i.persistTimer) this.clearTimer(i.persistTimer);
    if (this.pi?.timer) clearInterval(this.pi.timer);
    this.data.stop();
  }

  // ── devices ──────────────────────────────────────────────────────────────────
  upsertDevice(id, info) {
    let d = this.devices.get(id);
    const inf = info?.deviceInfo || info || {};
    if (!d) {
      d = { id, name: inf.name || 'Device', type: inf.type, size: inf.size, connected: true, model: deviceFromInfo(inf) };
      d.budget = new DeviceBudget({
        now: this.now, setTimer: this.setTimer, clearTimer: this.clearTimer, limits: this.globals.limits, updates: this.updates,
        buffered: () => this.conn.bufferedAmount || 0,
        send: (context, kind, payload) => (kind === 'image' ? this.conn.setImage(context, payload) : this.conn.setFeedback(context, payload)),
      });
      this.devices.set(id, d);
    } else if (inf.type !== undefined || inf.size) {
      Object.assign(d, { name: inf.name ?? d.name, type: inf.type ?? d.type, size: inf.size ?? d.size });
      d.model = deviceFromInfo({ name: d.name, type: d.type, size: d.size });
    }
    return d;
  }

  /** Physical LCD decks that can show and take the pairing approval (never virtual/AI-pressable ones). */
  isPhysical(d) { return !!d && !VIRTUAL_TYPES.has(d.type) && d.model?.display === 'lcd' && !d.model?.generic; }

  onDeviceConnect(m, change = false) {
    const d = this.upsertDevice(m.device, m.deviceInfo);
    d.connected = true;
    if (this.boot && this.isPhysical(d) && this.now() < this.boot.endAt) this.boot.devices.add(d.id);
    if (!change) d.budget.invalidate();
    this.regroup(d.id, { repaint: true });
    this.syncAudioFor(d.id);
  }

  onDeviceDisconnect(m) {
    const d = this.devices.get(m.device);
    if (!d) return;
    d.connected = false;
    d.budget.invalidate();
    this.syncAudioFor(d.id);
  }

  // ── instances ────────────────────────────────────────────────────────────────
  onWillAppear(m) {
    const p = m.payload || {};
    const d = this.devices.get(m.device) || this.upsertDevice(m.device, {});
    const infobar = String(m.action || '').endsWith('.infobar') || p.controller === 'Neo';
    const controller = infobar ? 'Neo' : p.controller === 'Encoder' ? 'Encoder' : 'Keypad';
    const inst = {
      context: m.context, action: m.action, device: d.id, controller,
      col: p.coordinates?.column ?? 0, row: p.coordinates?.row ?? 0, multi: !!p.isInMultiAction,
      settings: normalizeSettings(p.settings, { controller, device: d.model }), lastPayload: null, lastSvg: null, persistTimer: null,
    };
    this.instances.set(m.context, inst);
    this.syncTimer(inst, null);
    if (controller === 'Encoder') this.conn.setFeedbackLayout(m.context, CANVAS_LAYOUT_PATH);
    if (controller === 'Neo') this.conn.setFeedbackLayout(m.context, INFOBAR_LAYOUT_PATH); // Neo needs it on every willAppear
    if (controller === 'Encoder') this.sendTriggerDescription(inst);
    this.regroup(d.id);
  }

  onWillDisappear(m) {
    const inst = this.instances.get(m.context);
    if (!inst) return;
    if (inst.persistTimer) { this.clearTimer(inst.persistTimer); this.flushPersist(inst); }
    this.instances.delete(m.context);
    this.devices.get(inst.device)?.budget.forget(m.context);
    if (this.prompt?.contexts.delete(m.context) && !this.prompt.contexts.size) this.emit('prompt-lost');
    this.regroup(inst.device);
  }

  sendTriggerDescription(inst) {
    const f = exactFacet(inst.settings.facet);
    const states = f?.states?.length > 1 ? f.states : null;
    const touch = this.devices.get(inst.device)?.model?.dials?.touch;
    this.conn.setTriggerDescription(inst.context, {
      rotate: 'Adjust value', push: states ? `Next state (${states.join(' / ')})` : 'Press',
      ...(touch ? { touch: 'Press', longTouch: 'Reset value' } : {}),
    });
  }

  /** The render config of an instance: pairing prompt > live overlay > its settings. */
  configFor(inst) {
    const dev = this.devices.get(inst.device);
    const model = dev.model, g = this.globals;
    if (this.prompt?.contexts.has(inst.context)) {
      return { facet: SYSTEM_FACETS.pair, mode: inst.controller === 'Keypad' ? 'key' : 'key-on-dial', theme: g.theme, themeMode: g.mode, params: {}, state: 0, data: { code: this.prompt.code, client: this.prompt.client }, motion: '', key: `pair|${inst.context}`, system: true };
    }
    if (inst.controller === 'Keypad' && !inst.multi && this.isPhysical(dev)) {
      if (this.boot?.devices.has(inst.device)) return { facet: this.boot.facet, mode: 'boot', theme: g.theme, themeMode: g.mode, params: { replay: false }, state: 0, data: null, motion: '', key: `boot|${inst.device}`, system: true };
      if (this.bootPending && this.globals.boot !== false) return { blank: true, key: `bootwait|${inst.context}` };
    }
    const ov = this.overlayFor(inst);
    if (ov) {
      if (ov.image) return { image: ov.image, key: `img|${inst.context}`, overlay: ov };
      let facet = exactFacet(ov.facet) || (ov.sys ? SYSTEM_FACETS[ov.sys] : null);
      let mode = facetMode(facet, inst.controller, model);
      let data = ov.data;
      if (!mode) { // a look that can't be drawn here: fall back to its title on the right kind of surface
        facet = inst.controller === 'Keypad' ? SYSTEM_FACETS.label : SYSTEM_FACETS.value;
        mode = inst.controller === 'Keypad' ? 'key' : 'strip-1';
        data = { title: ov.data?.title ?? ov.params?.label ?? '', value: ov.data?.value ?? 0 };
      }
      const key = GROUP_MODES.has(mode) ? `grp|${inst.device}|${facet.id}|live` : `one|${inst.context}`;
      return { facet, mode, theme: ov.theme || g.theme, themeMode: ov.mode || g.mode, params: ov.params || {}, state: ov.state ?? 0, value: ov.value, data, motion: '', key, overlay: ov };
    }
    const s = inst.settings;
    const facet = exactFacet(s.facet);
    const mode = facetMode(facet, inst.controller, model);
    if (!facet || !mode) return { blank: true, key: `blank|${inst.context}` };
    const key = GROUP_MODES.has(mode) ? `grp|${inst.device}|${facet.id}|${s.group}` : `one|${inst.context}`;
    return { facet, mode, theme: s.theme || g.theme, themeMode: s.mode || g.mode, params: s.params, state: s.state, value: s.value, data: null, motion: s.motion, key };
  }

  overlayFor(inst) {
    const o = this.overlays.get(inst.device);
    if (!o) return null;
    return inst.controller === 'Keypad' ? o.keys.get(coordKey(inst.col, inst.row)) || null : o.dials.get(coordKey(inst.col, inst.row)) || null;
  }

  // ── units ────────────────────────────────────────────────────────────────────
  /** Rebuild the render units of a device after anything changed; repaint what changed. */
  regroup(deviceId, { repaint = false } = {}) {
    const dev = this.devices.get(deviceId);
    if (!dev) return;
    const want = new Map();
    for (const inst of this.instances.values()) {
      if (inst.device !== deviceId || inst.multi) continue;
      const cfg = this.configFor(inst);
      if (!want.has(cfg.key)) want.set(cfg.key, []);
      want.get(cfg.key).push(inst);
    }
    for (const [key, u] of this.units) if (u.device === deviceId && !want.has(key)) this.disposeUnit(u);
    for (const [key, members] of want) {
      members.sort((a, b) => a.row - b.row || a.col - b.col);
      const cfg = this.configFor(members[0]);
      const sig = JSON.stringify([cfg.facet?.id, cfg.mode, cfg.theme, cfg.themeMode, cfg.params, cfg.state, cfg.value, cfg.data, cfg.image?.length, cfg.image?.slice(-64), cfg.motion]);
      const msig = members.map((m) => m.context).join('|');
      let u = this.units.get(key);
      if (!u) {
        u = this.createUnit(key, deviceId, cfg, members);
        u.sig = sig; u.msig = msig;
        this.syncGame(u);
        this.adoptUnit(u);
        this.setFps(u);
        this.paint(u, { priority: true });
        continue;
      }
      const facetChanged = u.facet !== cfg.facet;
      const changed = repaint || u.sig !== sig || u.msig !== msig;
      if (facetChanged) {
        u.release?.();
        u.release = cfg.facet?.data?.length ? this.data.need(cfg.facet.data.filter((k) => !AUDIO_KEYS.includes(k))) : null;
        u.startedAt = u.stateChangedAt = this.now();
        u.burstUntil = this.now() + BURST_S * 1000;
      }
      if (u.cfg.state !== cfg.state) { u.stateChangedAt = this.now(); u.burstUntil = this.now() + BURST_S * 1000; }
      u.cfg = cfg; u.facet = cfg.facet; u.mode = cfg.mode; u.members = members; u.sig = sig; u.msig = msig;
      if (facetChanged) this.syncAudio(u);
      this.syncGame(u);
      if (changed) { u.idle = false; u.stable = 0; if (repaint) for (const m of members) m.lastPayload = null; this.paint(u, { priority: true }); }
      this.setFps(u);
    }
    this.reallocate(deviceId);
  }

  createUnit(key, deviceId, cfg, members) {
    const t = this.now();
    const u = {
      key, device: deviceId, cfg, facet: cfg.facet, mode: cfg.mode, members, seed: hashStr(key) % 100000,
      startedAt: t, stateChangedAt: t, pressed: false, pressedAt: null, releasedAt: null, pressKey: null, turnedAt: null, touch: null,
      burstUntil: cfg.facet ? t + BURST_S * 1000 : 0, burstHot: false, idle: false, stable: 0, alloc: null, avgCost: null, elements: 0, lastFull: null,
      release: cfg.facet?.data?.length ? this.data.need(cfg.facet.data.filter((k) => !AUDIO_KEYS.includes(k))) : null, audioRelease: null,
      // API 1.5.1: caps the unit's fps by how many keys its frames actually change
      gov: typeof sched.createChangeGovernor === 'function' ? sched.createChangeGovernor({ budget: Math.max(20, this.globals.limits.updatesPerSec * 0.9) }) : null,
    };
    u.slot = { fps: 0, active: () => this.devices.get(u.device)?.connected !== false, tick: () => this.tick(u), onError: (e) => this.log('error', `${u.key}: ${e.stack || e.message}`) };
    this.units.set(key, u);
    this.syncAudio(u);
    this.scheduler.add(u.slot);
    this.setFps(u);
    return u;
  }

  usesAudio(u) { return !!u?.facet?.data?.some((k) => AUDIO_KEYS.includes(k)); }

  /** Hold the audio source while a unit that draws audio is visible on a connected device; let go otherwise. */
  syncAudio(u) {
    const want = !!this.audio && this.units.get(u.key) === u && this.usesAudio(u) && this.devices.get(u.device)?.connected !== false;
    if (want && !u.audioRelease) u.audioRelease = this.audio.retain();
    else if (!want && u.audioRelease) { u.audioRelease(); u.audioRelease = null; }
  }
  syncAudioFor(deviceId) { for (const u of this.units.values()) if (u.device === deviceId) this.syncAudio(u); }

  disposeUnit(u) {
    if (u.resetTimer) { this.clearTimer(u.resetTimer); u.resetTimer = null; }
    this.scheduler.remove(u.slot);
    u.release?.();
    this.units.delete(u.key);
    this.syncAudio(u);
  }

  motionOf(u) { return u.cfg.motion || this.globals.motion; }

  /** Steady fps the unit asks for (before the budget share): 0 for stills. */
  steadyFps(u) {
    if (u.game) return this.gameFps(u);
    const f = u.facet;
    if (!f || u.cfg.image || u.cfg.blank || !f.animated) return 0;
    const motion = this.motionOf(u);
    if (motion === 'still') return 0;
    if (u.idle) return IDLE_PROBE_FPS;
    return motion === 'calm' ? Math.min(f.fps, 4) : f.fps;
  }

  setFps(u) {
    if (!u.facet) { u.slot.fps = 0; return; }
    if (u.game) {
      const want = this.gameFps(u), prev = u.slot.fps;
      u.slot.fps = u.alloc != null ? Math.min(want, u.alloc || want) : want;
      if (u.slot.fps !== prev) this.scheduler.wake(u.slot.fps > prev ? u.slot : undefined);
      return;
    }
    const burst = this.inBurst(u) && this.motionOf(u) !== 'still';
    const steady = this.steadyFps(u);
    let fps = burst ? (u.burstHot ? BURST_FPS : Math.min(BURST_FPS, Math.max(u.alloc ?? BURST_FPS, IDLE_PROBE_FPS))) : u.alloc != null ? Math.min(steady, u.alloc) : steady;
    if (!burst && u.gov && fps > 0) fps = u.gov.fps(fps);
    const prev = u.slot.fps;
    u.slot.fps = fps;
    if (fps !== prev) this.scheduler.wake(fps > prev ? u.slot : undefined);
  }

  /**
   * Fair fps for every unit on every device from the one shared update budget (≈ 200/s,
   * 10% kept free for presses): water-filling on updates per frame = members × cost, where
   * cost = max(1, elements / 300) — so a 1,200-element screen runs at a quarter of the rate
   * of a simple key, and a 12-key span degrades evenly instead of starving its neighbours.
   */
  reallocate() {
    const units = [...this.units.values()];
    if (!units.length) return;
    const L = this.globals.limits;
    const changing = (u) => { const h = u.gov?.history; return h && h.length >= 3 ? Math.min(u.members.length, Math.max(0.5, h.reduce((a, b) => a + b, 0) / h.length)) : u.members.length; };
    const alloc = allocateFps(L.updatesPerSec * 0.9, units.map((u) => ({ id: u.key, fps: this.steadyFps(u), images: (u.game ? u.members.length : changing(u)) * (u.avgCost ?? 1) })), { perKeyPerSec: L.perKeyPerSec, minFps: L.minFps });
    for (const u of units) { u.alloc = alloc.get(u.key) ?? null; this.setFps(u); }
  }

  /** Is the unit in an interaction burst: just after a press / turn / state change, or while a key is held? */
  inBurst(u) { const t = this.now(); return t < u.burstUntil || (u.pressed && u.pressedAt != null && t - u.pressedAt < HOLD_BURST_MAX_MS); }

  tick(u) {
    if (u.game) {
      const before = u.slot.fps;
      this.paint(u);
      this.setFps(u);
      if (before > 0 && u.slot.fps === 0) this.reallocate();   // the transition settled: give its share back
      return;
    }
    const burst = this.inBurst(u);
    // Press feedback / dial turns jump the queue (for BURST_S); a long hold, arrival and settings bursts take their fair turn.
    const changed = this.paint(u, { priority: u.burstHot && this.now() < u.burstUntil });
    if (!burst) {
      if (u.burstUntil) { u.burstUntil = 0; u.burstHot = false; this.setFps(u); }
      if (!changed) {
        u.stable++;
        if (!u.idle && u.stable >= Math.max(3, Math.ceil(u.facet?.fps || 10))) { u.idle = true; this.setFps(u); }
      } else {
        u.stable = 0;
        if (u.idle) { u.idle = false; this.setFps(u); this.reallocate(u.device); }
      }
    }
    if (u.gov) this.setFps(u);
  }

  /** The render options for a unit at this instant. */
  frameOpts(u) {
    const dev = this.devices.get(u.device);
    const now = this.now();
    const still = this.motionOf(u) === 'still';
    const fps = u.slot.fps > 0 ? u.slot.fps : 30;
    const anchor = u.members[0];
    const facetValue = u.facet?.params?.value?.default;
    return {
      device: dev.model, theme: u.cfg.theme, mode: u.cfg.themeMode,
      t: still ? stillTime(u.facet) : quantize((now - u.startedAt) / 1000, fps),
      state: u.cfg.state || 0,
      since: still ? 10 : quantize((now - u.stateChangedAt) / 1000, fps),
      pressed: u.pressed,
      pressAge: u.pressed ? 0 : u.releasedAt != null ? quantize((now - u.releasedAt) / 1000, fps) : Infinity,
      pressedFor: u.pressed ? quantize((now - u.pressedAt) / 1000, fps) : 0,
      heldFor: u.heldFor || 0,
      pressKey: u.pressKey,
      turnAge: u.turnedAt != null ? quantize((now - u.turnedAt) / 1000, fps) : Infinity,
      touch: u.touch ? { x: u.touch.x, y: u.touch.y, hold: u.touch.hold, segment: u.touch.segment, age: quantize((now - u.touch.at) / 1000, fps) } : null,
      value: u.cfg.value ?? anchor?.settings?.value ?? (typeof facetValue === 'number' ? facetValue : 0.5),
      ticks: u.cfg.overlay ? u.cfg.overlay.ticks || 0 : (u.lastTurned && u.members.includes(u.lastTurned) ? u.lastTurned : anchor)?.settings?.ticks || 0,
      values: this.dialValues(u, dev, facetValue),
      params: u.cfg.params || {},
      seed: u.seed,
      data: this.withDemo(u, this.linkData(u, { ...this.data.pick(u.facet?.data || []), ...this.audioData(u), ...this.timerData(u), ...(u.cfg.data || {}) })),
      now: this.wallNow(),
      tzOffset: -new Date(this.wallNow()).getTimezoneOffset(),
      reduced: still,
    };
  }

  /**
   * ctx.values: one value per dial for units that span dials (strip panoramas, Galleon screens, whole-deck
   * facets) — each dial's own setting; on the Galleon the widget turned last stands for its dial.
   */
  dialValues(u, dev, facetValue) {
    const dials = u.members.filter((m) => m.controller === 'Encoder');
    if (dials.length < 2 && u.mode !== 'strip-all') return undefined;
    const n = dev.model.strip?.segments || dev.model.dials?.count || Math.max(...dials.map((m) => m.col + 1), 1);
    const dflt = typeof facetValue === 'number' ? facetValue : 0.5;
    return Array.from({ length: n }, (_, i) => {
      const on = dials.filter((m) => m.col === i).sort((a, b) => (b.turnedAt || 0) - (a.turnedAt || 0) || a.row - b.row)[0];
      return on?.settings?.value ?? dflt;
    });
  }

  /** ctx.data.audio / spectrum for this frame (the source caches per analysis hop; null → the facet simulates). */
  audioData(u) {
    if (!this.audio || !u.audioRelease) return {};
    const snap = this.audio.snapshot?.();
    if (!snap) return {};
    const o = {};
    for (const k of u.facet.data) if (AUDIO_KEYS.includes(k) && snap[k]) o[k] = snap[k];
    return o;
  }

  /**
   * The data keys of a unit that are simulated right now (no live source on this machine): DEMO_KEYS
   * the data hub serves from a simulated source (or nobody serves: the facet simulates), audio / spectrum
   * while sound capture isn't live. Re-checked once a second. null = everything it shows is real.
   */
  demoKeys(u) {
    if (!u?.facet?.data?.length || u.cfg.system || u.cfg.overlay || u.cfg.image) return null;
    const keys = u.facet.data.filter((k) => DEMO_KEYS.has(k));
    if (!keys.length) return null;
    const t = this.now();
    if (u.demo && t - u.demo.at < 1000) return u.demo.keys;
    const hubKeys = keys.filter((k) => !AUDIO_KEYS.includes(k));
    const src = hubKeys.length && typeof this.data.sourceOf === 'function' ? this.data.sourceOf(hubKeys) : {};
    const audioLive = !!this.audio && !!u.audioRelease && this.audio.mode === 'live';
    const out = keys.filter((k) => (AUDIO_KEYS.includes(k) ? !audioLive : !(src[k] === 'live' || src[k] === 'custom')));
    u.demo = { at: t, keys: out.length ? out : null };
    return u.demo.keys;
  }

  /** ctx.data.demo = the simulated keys (the runtime's source flag; facets may read it, the badge does). */
  withDemo(u, data) { const d = this.demoKeys(u); return d ? { ...data, demo: d } : data; }

  /** The audio source as the PI shows it. */
  audioStatus() {
    if (!this.audio) return null;
    const i = this.audio.info?.() || {};
    return { state: i.state || 'idle', kind: i.kind || null, backend: i.title || i.backend || null, bridgeUrl: i.bridge?.url || null, bridgeConnected: !!i.bridge?.connected };
  }

  /** Render a unit and submit its frames. Returns true when any member's image changed. */
  paint(u, { priority = false } = {}) {
    const dev = this.devices.get(u.device);
    if (!dev || u.cfg.blank) return false;
    if (u.cfg.image) {
      const inst = u.members[0];
      return this.submitUrl(dev, inst, u.cfg.image, inst.controller === 'Keypad' ? 'image' : 'feedback', true);
    }
    const f = u.facet;
    let o = this.frameOpts(u);
    if (u.game) {
      const t = this.now() / 1000;
      if (u.game.pump(t)) this.persistGame(u);            // a due clock tick (ticking games only)
      o = { ...o, ...u.game.renderOpts(t) };             // game, gamePrev, gameEvent (+ age)
    }
    let changed = false, cost = 0, n = 0, elements = 0, nChanged = 0;
    const badged = o.data?.demo ? badgeTarget(u.members, u.mode) : null;   // DEMO: simulated data is never shown unlabeled
    const send = (inst, svg, kind) => { if (!inst || !svg) return; if (inst === badged) svg = withDemoBadge(svg, { align: u.mode === 'strip-1' || u.mode === 'strip-all' ? 'center' : 'right' }); const r = this.submitFrame(dev, inst, svg, kind, priority); n++; cost += r.cost; elements = Math.max(elements, r.elements); if (r.changed) { changed = true; nChanged++; } };
    const key = (inst, svg) => send(inst, svg, 'image');
    const dial = (inst, svg) => send(inst, svg, 'feedback');
    const by = (ctrl) => new Map(u.members.filter((m) => m.controller === ctrl).map((m) => [coordKey(m.col, m.row), m]));
    let r;
    switch (u.mode) {
      case 'key': r = render(f, o); key(u.members[0], r.svg); break;
      case 'key-on-dial': r = render(f, { ...o, size: { w: 200, h: 100 } }); dial(u.members[0], r.svg); break;
      case 'span': {
        const cs = u.members.map((m) => m.col), rs = u.members.map((m) => m.row);
        const col = Math.min(...cs), row = Math.min(...rs);
        r = render(f, { ...o, span: { col, row, cols: Math.max(...cs) - col + 1, rows: Math.max(...rs) - row + 1 } });
        const keys = by('Keypad');
        for (const k of r.keys) key(keys.get(coordKey(k.col, k.row)), k.svg);
        break;
      }
      case 'boot': {
        // the boot sequence: one span over the whole device, t from plugin start (played once, then held)
        const sec = (this.now() - this.bootAt) / 1000;
        r = render(f, { ...o, t: quantize(sec, u.slot.fps || 8), since: sec, span: { col: 0, row: 0, cols: dev.model.cols, rows: dev.model.rows } });
        const keys = by('Keypad');
        for (const k of r.keys) key(keys.get(coordKey(k.col, k.row)), k.svg);
        break;
      }
      case 'strip-1': r = render(f, { ...o, segments: 1 }); dial(u.members[0], r.segments?.[0] || r.svg); break;
      case 'strip-all': {
        const segs = dev.model.strip?.segments || dev.model.dials?.count || 4;
        r = render(f, { ...o, segments: segs });
        for (const m of u.members) dial(m, r.segments?.[m.col]);
        break;
      }
      case 'screen-galleon': {
        r = render(f, { ...o, screen: 'galleon' });
        const dials = by('Encoder');
        for (const w of r.widgets || []) dial(dials.get(coordKey(w.dial, w.layer)), w.svg && widgetCanvas(w.svg));
        break;
      }
      case 'screen-widget': r = render(f, { ...o, screen: 'galleon-widget' }); dial(u.members[0], widgetCanvas(r.svg)); break;
      case 'screen-infobar': r = render(f, { ...o, screen: 'infobar' }); dial(u.members[0], fitCanvas(r.svg, { w: 232, h: 50 })); break;
      case 'deck': {
        r = render(f, o);
        const keys = by('Keypad'), dials = by('Encoder');
        for (const k of r.keys || []) key(keys.get(coordKey(k.col, k.row)), k.svg);
        if (r.segments) for (const m of dials.values()) dial(m, r.segments[m.col]);
        const L = deckLayout(dev.model);
        if (r.widgets?.length) {
          // API 1.5.1: deck facets on the Galleon return the four 2:1 widget windows (whole-deck games keep score there)
          for (const w of r.widgets) { const m = dials.get(coordKey(w.dial, w.layer)); if (m && w.svg) dial(m, widgetCanvas(w.svg)); }
        } else if (L.screen && dev.model.screen?.kind === 'galleon') {
          for (const w of galleonWidgetRects(L.screen, dev.model.screen.widgets)) { const m = dials.get(coordKey(w.dial, w.layer)); if (m) dial(m, widgetCanvas(svgWindow(r.svg, w))); }
        } else if (L.screen && dev.model.screen?.kind === 'infobar') {
          const neo = u.members.find((m) => m.controller === 'Neo');
          if (neo) dial(neo, fitCanvas(svgWindow(r.svg, L.screen), { w: 232, h: 50 }));
        }
        break;
      }
      default: return false;
    }
    if (n) {
      // Complexity guard: heavier frames cost more of the budget, so their unit's fps drops.
      const c = cost / n, prev = u.avgCost;
      u.avgCost = prev == null ? c : prev * 0.6 + c * 0.4;
      u.elements = elements;
      if (prev == null || Math.abs(u.avgCost - prev) / prev > 0.25) this.reallocate();
    }
    u.lastFull = r?.svg || null;
    u.gov?.observe(nChanged);
    return changed;
  }

  /**
   * The device payload for a frame: SVG through toDeviceSvg (clipPath → luminance mask, no
   * preserveAspectRatio — what the app's Qt renderer needs) as a data URL (raw SVG strings are
   * rejected), or a PNG in 'png' format. → { url, cost, elements }
   */
  encode(svg) {
    if (this.globals.format === 'png' && this.raster) {
      try { return { url: 'data:image/png;base64,' + Buffer.from(this.raster.encodePNG(this.raster.rasterize(svg))).toString('base64'), cost: 1, elements: 0 }; } catch (e) { this.log('warn', 'png fallback failed: ' + e.message); }
    }
    let out = svg;
    if (this.deviceSvg) { try { out = this.deviceSvg(svg); } catch (e) { this.log('warn', 'toDeviceSvg failed: ' + e.message); } }
    const elements = elementCount(out);
    return { url: svgDataUrl(out), cost: updateCost(elements, this.globals.limits), elements };
  }

  /** Offer one frame for an instance. Unchanged SVG skips re-encoding (the budget dedupes it). → { changed, cost, elements } */
  submitFrame(dev, inst, svg, kind, priority) {
    if (svg === inst.lastSvg && inst.lastPayload && inst.lastFormat === this.globals.format) {
      dev.budget.submit(inst.context, kind, kind === 'image' ? inst.lastPayload : canvasPayload(inst.lastPayload), { priority, cost: inst.lastCost || 1 });
      return { changed: false, cost: inst.lastCost || 1, elements: inst.lastElements || 0 };
    }
    const e = this.encode(svg);
    inst.lastSvg = svg; inst.lastFormat = this.globals.format; inst.lastCost = e.cost; inst.lastElements = e.elements;
    const changed = inst.lastPayload !== e.url;
    inst.lastPayload = e.url;
    dev.budget.submit(inst.context, kind, kind === 'image' ? e.url : canvasPayload(e.url), { priority, cost: e.cost });
    return { changed, cost: e.cost, elements: e.elements };
  }

  /** An image a live look supplied (already a data URL). */
  submitUrl(dev, inst, url, kind, priority) {
    const changed = inst.lastPayload !== url;
    inst.lastPayload = url; inst.lastSvg = null; inst.lastCost = 1;
    dev.budget.submit(inst.context, kind, kind === 'image' ? url : canvasPayload(url), { priority, cost: 1 });
    return changed;
  }

  unitOf(inst) { for (const u of this.units.values()) if (u.members.includes(inst)) return u; return null; }

  repaintAll(invalidate = false) {
    for (const d of this.devices.values()) { if (invalidate) d.budget.invalidate(); this.regroup(d.id, { repaint: true }); }
  }

  // ── boot sequence (API 1.5.1, docs/game-runtime.md §7) ────────────────────────
  /**
   * Decide once, when the global settings arrive (or after BOOT_DECIDE_MS): play span-power-on on every
   * physical deck (not the MCP Deck / Virtual / Mobile) unless the user turned it off or chose 'still'
   * motion. It runs as a span over the whole device with t = seconds since the plugin started, sends only
   * the keys whose slice changed, and hands the keys back at loop − 1.4 s (or at the first key press).
   */
  decideBoot() {
    if (!this.bootPending) return;
    this.bootPending = false;
    if (this.bootDecideTimer) { this.clearTimer(this.bootDecideTimer); this.bootDecideTimer = null; }
    const f = exactFacet(BOOT_FACET);
    const devs = new Set([...this.devices.values()].filter((d) => this.isPhysical(d)).map((d) => d.id));
    if (f && this.globals.boot !== false && this.globals.motion !== 'still' && devs.size) {
      const pace = f.params?.pace?.default || 1;
      const endAt = this.bootAt + Math.max(1, (f.loop - 1.4) / pace) * 1000;
      if (endAt > this.now()) {
        this.boot = { facet: f, devices: devs, endAt, timer: this.setTimer(() => this.endBoot(), endAt - this.now()) };
        this.boot.timer?.unref?.();
      }
    }
    for (const d of this.devices.values()) this.regroup(d.id, { repaint: true });
  }

  /** Hand a deck's keys (or every deck's) back to their own facets: repaint at once. */
  endBoot(deviceId) {
    if (!this.boot) return;
    const ids = deviceId ? [deviceId] : [...this.boot.devices];
    for (const id of ids) this.boot.devices.delete(id);
    if (!this.boot.devices.size) { if (this.boot.timer) this.clearTimer(this.boot.timer); this.boot = null; }
    for (const id of ids) this.regroup(id, { repaint: true });
  }

  // ── games (API 1.5, docs/game-runtime.md) ───────────────────────────────────────
  /**
   * One game host per key / span / deck unit, built when the unit is and rebuilt when its facet,
   * block or params change (a params change deals a new game; a moved block keeps its state).
   */
  syncGame(u) {
    const want = !!u.facet?.game && GAME_MODES.has(u.mode) && !u.cfg.overlay && !u.cfg.system;
    if (!want) { u.game = null; u.gameSig = null; return; }
    const dev = this.devices.get(u.device);
    const anchor = u.members[0];
    const span = u.mode === 'span' ? spanOf(u.members) : undefined;
    const params = JSON.stringify(u.cfg.params || {});
    const sig = JSON.stringify([u.facet.id, u.mode, span, dev.model.id, params]);
    if (u.game && u.gameSig === sig) return;
    let seed = anchor.settings.gameSeed;
    if (!Number.isInteger(seed)) { seed = (hashStr(anchor.context) ^ this.wallNow()) >>> 0; this.persist(anchor, { gameSeed: seed }); }
    // The anchor's settings always hold the latest snapshot (persist() updates them at once), so resume from
    // there: on hardware a block's keys appear one by one, and the host is rebuilt as the span grows — the
    // host ignores a snapshot whose grid doesn't match yet, and resumes once the whole block is back.
    const newRules = !!u.game && (u.gameFacet !== u.facet.id || u.gameParams !== params);
    const snapshot = newRules ? null : anchor.settings.game;
    u.game = createGameHost(u.facet, { device: dev.model, span, params: u.cfg.params, seed, snapshot, clock: () => this.now() / 1000 });
    u.gameSig = sig; u.gameFacet = u.facet.id; u.gameParams = params;
    if (newRules) this.persistGame(u);   // a params change deals a new game: it replaces the old snapshot
  }

  /** The fps a game unit needs now: ≤ 12 during a transition, tickHz while ticking, else 0 (still: ticks only). */
  gameFps(u) {
    const motion = this.motionOf(u);
    if (motion === 'still') return u.game.needsTick() ? u.game.tickHz : 0;
    return u.game.fps(this.now() / 1000, motion === 'calm' ? 4 : GAME_FPS);
  }

  /** Feed the game one event; the first frame after it jumps the queue. → dispatch result */
  gameDispatch(u, ev) {
    const r = u.game.dispatch({ ...ev, t: this.now() / 1000 });
    if (r.changed) { this.persistGame(u); this.publishGame(u); }
    this.reallocate();
    this.setFps(u);
    this.paint(u, { priority: true });
    return r;
  }

  gameReset(u) {
    if (u.resetTimer) { this.clearTimer(u.resetTimer); u.resetTimer = null; }
    u.game.reset(this.now() / 1000);
    this.persistGame(u);
    this.publishGame(u);
    this.reallocate();
    this.setFps(u);
    this.paint(u, { priority: true });
  }

  /** Keys press / release with the device key index; dials with their column. Holding a key deals a new game (not on the Galleon). */
  gamePress(u, inst, dev, down) {
    if (inst.controller !== 'Keypad') return this.gameDispatch(u, { type: down ? 'press' : 'release', dial: inst.col });
    const key = inst.row * (dev.model.cols || 1) + inst.col;
    const t = this.now();
    if (u.resetTimer) { this.clearTimer(u.resetTimer); u.resetTimer = null; }
    if (down) {
      u.pressed = true; u.pressedAt = t; u.pressKey = key; u.gameHeld = key;
      // The Galleon app consumes long holds (hardware lab), so there the PI's "New game" is the way.
      if (dev.model.family !== 'galleon') {
        u.resetTimer = this.setTimer(() => { u.resetTimer = null; if (u.pressed && u.gameHeld === key && this.units.get(u.key) === u && u.game) this.gameReset(u); }, GAME_RESET_HOLD_S * 1000);
        u.resetTimer?.unref?.();
      }
      return this.gameDispatch(u, { type: 'press', key });
    }
    const heldFor = u.pressed && u.pressedAt != null ? Math.max(0, (t - u.pressedAt) / 1000) : 0;
    u.heldFor = heldFor;
    u.pressed = false; u.releasedAt = t;
    const held = u.gameHeld ?? key;
    u.gameHeld = null;
    return this.gameDispatch(u, { type: 'release', key: held, heldFor });
  }

  /** Persist the game on the unit's anchor (debounced like dial values; willDisappear flushes it). */
  persistGame(u) { if (u.game) this.persist(u.members[0], { game: u.game.snapshot() }); }

  // ── stopwatch / countdown timers (src/apps/sources/timer.js) ───────────────
  /** Does this facet keep a per-key timer (declares data 'timer')? */
  usesTimer(facet) { return !!facet?.data?.includes('timer'); }

  /** The key's timer (created on demand); its target follows the facet's minutes / seconds params. */
  timerOf(inst, facet) {
    let t = this.timers.get(inst.context);
    if (!t) {
      t = createTimer({ now: this.wallNow });
      this.timers.set(inst.context, t);
      if (this.timers.size > MAX_TIMERS) this.timers.delete(this.timers.keys().next().value);
    }
    const p = { ...Object.fromEntries(Object.entries(facet.params || {}).map(([k, d]) => [k, d.default])), ...(inst.settings.params || {}) };
    t.setTarget(typeof p.minutes === 'number' ? p.minutes * 60 + (typeof p.seconds === 'number' ? p.seconds : 0) : null);
    return t;
  }

  /**
   * Keep a key's timer in step with its state. prevName undefined = just make sure it exists
   * (and runs if the key is in a running state); otherwise apply the transition prevName → state:
   * ready resets, a running state starts (fresh after ready / done), anything else pauses — so a
   * stopped stopwatch keeps its time.
   */
  syncTimer(inst, prevName, nextName) {
    const facet = exactFacet(inst.settings.facet);
    if (inst.controller !== 'Keypad' || !this.usesTimer(facet)) return;
    const fresh = !this.timers.has(inst.context);
    const t = this.timerOf(inst, facet);
    const name = nextName ?? facet.states?.[inst.settings.state || 0] ?? null;
    if (prevName === undefined || prevName === null) { if (fresh && TIMER_RUN.has(name)) t.start(); return; }
    if (name === 'ready') t.reset();
    else if (TIMER_RUN.has(name)) { if (prevName === 'ready' || prevName === 'done') t.reset(); t.start(); }
    else t.pause();
  }

  /** ctx.data.timer for a single key that keeps a timer. */
  timerData(u) {
    if (u.mode !== 'key' || !this.usesTimer(u.facet) || u.cfg.overlay) return {};
    const inst = u.members[0];
    return this.timers.has(inst.context) ? this.timerOf(inst, u.facet).snapshot() : {};
  }

  // ── linked state (scene/link.js) ──────────────────────────────────────────────
  // One bus per device: a unit whose facet declares `link` publishes its state / dial value when it
  // changes, and every other unit of the device that mirrors the channel follows (state persisted, repainted),
  // so the mic key, the Galleon screen and a + dial agree. Games publish their readout on 'game'.
  busOf(deviceId) { let b = this.links.get(deviceId); if (!b) { b = createLinkBus(); this.links.set(deviceId, b); } return b; }
  linkable(u) { return !!u?.facet && !u.cfg.overlay && !u.cfg.system && !u.cfg.blank && !u.cfg.image; }
  linkData(u, base) { return this.linkable(u) && this.links.has(u.device) ? this.busOf(u.device).data(u.facet, u.cfg.params, base) : base; }
  /** A unit changed state or value: publish its links and bring the device's other units in line. */
  relink(u) {
    if (!this.linkable(u) || u.game) return;
    const changed = this.busOf(u.device).publish(u.facet, u.cfg.params, { state: u.cfg.state || 0, value: u.cfg.value });
    if (changed.length) this.follow(u.device, changed, u);
  }
  follow(deviceId, changed, src) {
    const bus = this.busOf(deviceId), t = this.now();
    for (const o of this.units.values()) {
      if (o === src || o.device !== deviceId || o.game || !this.linkable(o) || !bus.listens(o.facet, o.cfg.params, changed)) continue;
      const st = bus.stateOf(o.facet, o.cfg.params, o.cfg.state || 0);
      if (st !== null && st !== (o.cfg.state || 0)) {
        if (o.mode === 'key') this.syncTimer(o.members[0], o.facet.states[o.cfg.state || 0], o.facet.states[st]);
        for (const mm of o.members) this.persist(mm, { state: st }, true);
        o.cfg = { ...o.cfg, state: st }; o.stateChangedAt = t;
      }
      if (o.releasedAt == null) o.releasedAt = t - 10000;   // it follows the device now: no demo autoplay (motion keys)
      const v = bus.valueOf(o.facet, o.cfg.params);
      if (v !== null && v !== o.cfg.value && !GROUP_MODES.has(o.mode)) { for (const mm of o.members) this.persist(mm, { value: v }); o.cfg = { ...o.cfg, value: v }; o.turnedAt = t; }
      o.gov?.reset(); o.burstUntil = t + BURST_S * 1000; o.idle = false; o.stable = 0;
      this.setFps(o); this.paint(o, { priority: true });
    }
  }
  /** A unit appears: it takes the device's shared values (or publishes its own when there are none yet). */
  adoptUnit(u) {
    if (!this.linkable(u)) return;
    if (u.game) { this.publishGame(u); return; }
    const bus = this.busOf(u.device);
    const r = bus.adopt(u.facet, u.cfg.params, { state: u.cfg.state || 0, value: u.cfg.value });
    if (r.state !== (u.cfg.state || 0)) { for (const mm of u.members) this.persist(mm, { state: r.state }, true); u.cfg = { ...u.cfg, state: r.state }; }
    if (typeof r.value === 'number' && r.value !== u.cfg.value && !GROUP_MODES.has(u.mode)) { for (const mm of u.members) this.persist(mm, { value: r.value }); u.cfg = { ...u.cfg, value: r.value }; }
    if (r.changed.length) this.follow(u.device, r.changed, u);
    // units that mirror a channel another unit also shows follow the device, not a demo autoplay
    const own = linksOf(u.facet, u.cfg.params).map((l) => l.channel);
    if (own.length) {
      const t = this.now();
      const peers = [...this.units.values()].filter((o) => o !== u && o.device === u.device && this.linkable(o) && !o.game && bus.listens(o.facet, o.cfg.params, own));
      if (peers.length) for (const o of [u, ...peers]) if (o.releasedAt == null && linksOf(o.facet, o.cfg.params).length) o.releasedAt = t - 10000;
    }
  }
  /** A game unit's readout on the device's 'game' channel (the Game Scoreboard screen shows it). */
  publishGame(u) {
    if (!u.game || !this.linkable(u)) return;
    if (this.busOf(u.device).set('game', readoutOf(u.facet, u.game.state, u.cfg.params))) this.follow(u.device, ['game'], u);
  }

  // ── input ────────────────────────────────────────────────────────────────────
  onPress(m, down) {
    const inst = this.instances.get(m.context);
    if (!inst) return;
    const dev = this.devices.get(inst.device);
    if (this.prompt?.contexts.has(inst.context)) return this.onPromptPress(inst, dev, down);
    if (this.boot?.devices.has(inst.device) && inst.controller === 'Keypad') { if (down) this.endBoot(inst.device); return; }
    const u = this.unitOf(inst);
    if (!u) return;
    if (u.game) return this.gamePress(u, inst, dev, down);
    const t = this.now();
    if (down) { u.pressed = true; u.pressedAt = t; u.pressKey = inst.row * (dev.model.cols || 1) + inst.col; }
    else { if (u.pressed && u.pressedAt != null) u.heldFor = Math.round(((t - u.pressedAt) / 1000) * 1000) / 1000; u.pressed = false; u.releasedAt = t; }
    u.gov?.reset();
    u.burstUntil = t + BURST_S * 1000;
    u.burstHot = true;
    u.idle = false; u.stable = 0;
    if (down && u.facet) {
      const ov = u.cfg.overlay;
      if (ov) this.emit('behavior', { device: inst.device, controller: inst.controller, col: inst.col, row: inst.row, overlay: ov });
      else {
        this.runPress(inst, dev);
        const next = nextState(u.facet, u.cfg.state || 0);
        if (next !== (u.cfg.state || 0)) {
          if (u.mode === 'key') this.syncTimer(u.members[0], u.facet.states[u.cfg.state || 0], u.facet.states[next]);
          for (const mm of u.members) this.persist(mm, { state: next }, true);
          u.cfg = { ...u.cfg, state: next };
          u.stateChangedAt = t;
          this.relink(u);
        }
      }
    }
    this.setFps(u);
    this.paint(u, { priority: true });
  }

  /**
   * The AI pairing prompt: approval is a HOLD of PAIR_HOLD_S (1.5 s) on the glowing key of a physical deck (a progress
   * ring fills while held; letting go early cancels). A tap, a press that began before the prompt was
   * drawn, or any press on the MCP Deck / Virtual Stream Deck / Mobile never approves.
   */
  onPromptPress(inst, dev, down) {
    const p = this.prompt, u = this.unitOf(inst), t = this.now();
    if (down) {
      if (!this.isPhysical(dev) || t - p.shownAt < 400) return;
      if (p.holdTimer) this.clearTimer(p.holdTimer);
      p.hold = inst.context;
      p.holdTimer = this.setTimer(() => {
        p.holdTimer = null;
        if (this.prompt !== p || p.hold !== inst.context) return;
        p.hold = null;
        this.conn.showOk?.(inst.context);
        this.emit('pair-press', { context: inst.context, device: inst.device, heldMs: Math.round(this.now() - t) });
      }, PAIR_HOLD_S * 1000);
      p.holdTimer?.unref?.();
    } else if (p.hold === inst.context) {
      if (p.holdTimer) this.clearTimer(p.holdTimer);
      p.holdTimer = null; p.hold = null;
    }
    if (!u) return;
    if (down) { u.pressed = true; u.pressedAt = t; } else { u.pressed = false; u.releasedAt = t; }
    u.burstUntil = t + BURST_S * 1000; u.burstHot = true; u.idle = false; u.stable = 0;
    this.setFps(u);
    this.paint(u, { priority: true });
  }

  /**
   * The instance's optional REAL press behavior (settings.press; Prism Display is visual by default):
   * open an http(s) URL, switch this device to its Prism sample profile (optionally a page), or back to
   * the previous profile. Hosts without profile switching (OpenDeck) get an alert on the key instead.
   */
  runPress(inst, dev) {
    const b = inst.settings.press;
    if (!b) return false;
    let ok = false;
    if (b.kind === 'url') ok = this.conn.openUrl(b.url) !== false;
    else if (b.kind === 'profile') { const name = bundledProfileFor(dev?.type); ok = !!name && this.conn.switchToProfile(dev.id, name, b.page ? b.page - 1 : undefined) !== false; }
    else if (b.kind === 'back') ok = this.conn.switchToProfile(dev.id) !== false;
    if (!ok) this.conn.showAlert?.(inst.context);
    return ok;
  }

  onDialRotate(m) {
    const inst = this.instances.get(m.context);
    if (!inst || this.prompt?.contexts.has(inst.context)) return;
    const u = this.unitOf(inst);
    if (!u || !u.facet) return;
    const ticks = Math.max(-48, Math.min(48, Math.trunc(Number(m.payload?.ticks) || 0))); // fast spins aggregate (Galleon: up to ±12 per event)
    if (u.game) { u.turnedAt = this.now(); this.gameDispatch(u, { type: 'rotate', dial: inst.col, ticks }); return; }
    u.gov?.reset();
    const p = u.cfg.params || {};
    const step = (typeof p.step === 'number' && p.step > 0 ? p.step : u.facet.params?.step?.default > 0 ? u.facet.params.step.default : 0.02) * (m.payload?.pressed ? 5 : 1);
    const own = GROUP_MODES.has(u.mode) ? inst.settings.value : inst.settings.value ?? u.cfg.value;   // a panorama's dials each keep their own value
    const cur = own ?? (typeof u.facet.params?.value?.default === 'number' ? u.facet.params.value.default : 0.5);
    const value = Math.round(Math.min(1, Math.max(0, cur + ticks * step)) * 1e4) / 1e4;
    if (u.cfg.overlay) { u.cfg.overlay.value = value; u.cfg.overlay.ticks = (u.cfg.overlay.ticks || 0) + ticks; u.cfg = { ...u.cfg, value }; }
    else { this.persist(inst, { value, ticks: (inst.settings.ticks || 0) + ticks }); if (u.members[0] === inst || !GROUP_MODES.has(u.mode)) u.cfg = { ...u.cfg, value }; if (!GROUP_MODES.has(u.mode)) this.relink(u); }
    inst.turnedAt = this.now();
    u.lastTurned = inst;
    u.turnedAt = this.now();
    u.burstUntil = this.now() + BURST_S * 1000;
    u.burstHot = true;
    u.idle = false;
    this.setFps(u);
    this.paint(u, { priority: true });
  }

  onTouchTap(m) {
    const inst = this.instances.get(m.context);
    if (!inst) return;
    const tu = this.unitOf(inst);
    if (tu?.game) {
      // A game gets the tap as a touch event (a long touch too: it is not a reset). Deck units: strip-wide x.
      const [tx = 0, ty = 0] = Array.isArray(m.payload?.tapPos) ? m.payload.tapPos.map(Number) : [];
      this.gameDispatch(tu, { type: 'touch', x: tx + (tu.mode === 'deck' ? inst.col * 200 : 0), y: ty, hold: !!m.payload?.hold });
      return;
    }
    if (tu) {
      // tapPos is relative to the dial's 200×100 segment; whole-strip facets get strip x.
      const [x = 0, y = 0] = Array.isArray(m.payload?.tapPos) ? m.payload.tapPos.map(Number) : [];
      tu.touch = { x: tu.mode === 'strip-all' || tu.mode === 'deck' ? x + inst.col * 200 : x, y, hold: !!m.payload?.hold, segment: inst.col, at: this.now() };
    }
    if (m.payload?.hold) {
      const u = this.unitOf(inst);
      const d = u?.facet?.params?.value?.default;
      this.persist(inst, { value: typeof d === 'number' ? d : 0.5 });
      if (u) { u.cfg = { ...u.cfg, value: inst.settings.value }; this.paint(u, { priority: true }); }
      return;
    }
    this.onPress(m, true);
    this.onPress(m, false);
  }

  /** Update settings locally and store them with the app (debounced for dial turns). */
  persist(inst, patch, now = false) {
    inst.settings = { ...inst.settings, ...patch };
    if (inst.persistTimer) this.clearTimer(inst.persistTimer);
    inst.persistTimer = null;
    if (now) return this.flushPersist(inst);
    inst.persistTimer = this.setTimer(() => { inst.persistTimer = null; this.flushPersist(inst); }, PERSIST_MS);
    inst.persistTimer?.unref?.();
  }
  flushPersist(inst) { this.conn.setSettings(inst.context, compactSettings(inst.settings)); }

  // ── settings ─────────────────────────────────────────────────────────────────
  onSettings(m) {
    const inst = this.instances.get(m.context);
    if (!inst) return;
    const prev = inst.settings;
    inst.settings = normalizeSettings(m.payload?.settings, { controller: inst.controller, device: this.devices.get(inst.device).model });
    if (prev.facet === inst.settings.facet) inst.settings = { ...inst.settings, game: prev.game ?? null, gameSeed: prev.gameSeed ?? inst.settings.gameSeed };
    // Keep a span group consistent: the look you set on one key applies to every key of its block.
    const s = inst.settings;
    if (GROUP_MODES.has(facetMode(exactFacet(s.facet), inst.controller, this.devices.get(inst.device).model)) && prev.facet === s.facet && prev.group === s.group) {
      for (const o of this.instances.values()) {
        if (o === inst || o.device !== inst.device || o.settings.facet !== s.facet || o.settings.group !== s.group) continue;
        const patch = { theme: s.theme, mode: s.mode, params: s.params, motion: s.motion };
        if (JSON.stringify(patch) !== JSON.stringify({ theme: o.settings.theme, mode: o.settings.mode, params: o.settings.params, motion: o.settings.motion })) this.persist(o, patch, true);
      }
    }
    if (inst.controller === 'Encoder' && prev.facet !== s.facet) this.sendTriggerDescription(inst);
    if (prev.facet !== s.facet) this.timers.delete(inst.context);
    const sf = exactFacet(s.facet);
    if (sf?.states?.length) this.syncTimer(inst, prev.facet === s.facet && prev.state !== s.state ? sf.states[prev.state] : undefined);
    this.regroup(inst.device);
    if (this.pi?.context === inst.context) this.sendPiState();
  }

  onGlobalSettings(m) {
    const prev = this.globals;
    this.globals = normalizeGlobals(m.payload?.settings);
    for (const d of this.devices.values()) d.budget.setLimits(this.globals.limits);
    const L = this.globals.limits;
    this.updates.setRate(L.updatesPerSec, Math.max(4, L.updatesPerSec * L.burstSeconds));
    if (JSON.stringify([prev.theme, prev.mode, prev.motion, prev.format]) !== JSON.stringify([this.globals.theme, this.globals.mode, this.globals.motion, this.globals.format])) this.repaintAll();
    else this.reallocate();
    this.emit('globals', this.globals, prev);
    if (this.globals.calendarFile !== prev.calendarFile) this.applyCalendar();
    this.decideBoot();
    if (this.boot && (this.globals.boot === false || this.globals.motion === 'still')) this.endBoot();
    if (this.pi) this.sendPiState();
  }

  /**
   * Point the data hub's calendar at the user's .ics file (Data sources in the PI), check it once so the
   * PI can say whether it was found, and let every badge re-evaluate.
   */
  applyCalendar() {
    const file = this.globals.calendarFile || '';
    try { this.data.setCalendarFile?.(file); } catch (e) { this.log('warn', 'calendar: ' + e.message); }
    for (const u of this.units.values()) u.demo = null;
    this.calendarCheck = file ? { file, pending: true } : null;
    if (file && typeof this.data.checkCalendarFile === 'function') {
      Promise.resolve(this.data.checkCalendarFile(file)).then((r) => {
        if ((this.globals.calendarFile || '') !== file) return;
        this.calendarCheck = { file, ...(r || { ok: false }) };
        for (const u of this.units.values()) u.demo = null;
        if (this.pi) this.sendPiState();
      }, () => {});
    }
    if (this.pi) this.sendPiState();
  }

  /** What feeds the data facets on this machine (the PI's Data sources section). live | demo | off. */
  sourcesStatus() {
    const st = typeof this.data.status === 'function' ? this.data.status() : null;
    const live = (k) => (st ? String(st.keys?.[k] || '').split(' > ').some((p) => p.endsWith(':live') || p === 'custom') : (this.data.supported?.() || []).includes(k));
    const cal = this.calendarCheck;
    return {
      system: live('cpu') ? 'live' : 'demo',
      media: live('media') ? 'live' : 'demo',
      weather: live('weather') ? 'live' : 'demo',
      audio: !this.audio ? 'off' : this.audio.mode === 'live' ? 'live' : 'demo',
      calendar: cal?.ok ? 'live' : 'demo',
      calendarFile: this.globals.calendarFile || '',
      calendarCheck: cal ? { ok: !!cal.ok, pending: !!cal.pending, events: cal.events ?? null, error: cal.error || null } : null,
      platform: process.platform,
    };
  }

  /** Write global settings (keeps unknown keys the PI may own). */
  setGlobals(patch) {
    const next = { ...this.globals, ...patch };
    this.conn.setGlobalSettings(next);
    this.onGlobalSettings({ payload: { settings: next } });
  }

  // ── property inspector ───────────────────────────────────────────────────────
  onPiAppear(m) {
    if (this.pi?.timer) clearInterval(this.pi.timer);
    this.pi = { context: m.context, action: m.action, last: null, timer: setInterval(() => this.sendPreview(), PREVIEW_MS) };
    this.pi.timer.unref?.();
    this.sendPiState();
    this.sendPreview();
  }

  onPiDisappear(m) {
    if (this.pi && (!m.context || this.pi.context === m.context)) { clearInterval(this.pi.timer); this.pi = null; }
  }

  toPi(payload) { if (this.pi) this.conn.sendToPropertyInspector(this.pi.context, this.pi.action, payload); }

  piState() {
    const inst = this.pi && this.instances.get(this.pi.context);
    const dev = inst && this.devices.get(inst.device);
    const u = inst && this.unitOf(inst);
    return {
      type: 'state', version: this.version, host: this.conn.host, platform: this.conn.platform,
      context: inst?.context, controller: inst?.controller,
      device: dev ? { id: dev.id, name: dev.name, type: dev.type, model: dev.model.id, cols: dev.model.cols, rows: dev.model.rows, physical: this.isPhysical(dev) } : null,
      coordinates: inst ? { column: inst.col, row: inst.row } : null,
      settings: inst ? compactSettings(inst.settings) : null,
      choices: inst && dev ? facetsFor(inst.controller, dev.model).map((f) => f.id) : [],
      unit: u ? { mode: u.mode, members: u.members.length, fps: Math.round(u.slot.fps * 10) / 10, overlay: !!u.cfg.overlay, audio: this.usesAudio(u), game: u.game ? { n: u.game.n, holdReset: dev?.model?.family !== 'galleon' } : null } : null,
      audio: this.audioStatus(),
      boot: { enabled: this.globals.boot === true, playing: !!this.boot },
      sources: this.sourcesStatus(),
      demo: u ? this.demoKeys(u) : null,
      globals: this.globals,
      live: this.liveStatus ? this.liveStatus() : { running: false },
    };
  }

  sendPiState() { this.toPi(this.piState()); }

  sendPreview() {
    if (!this.pi) return;
    const inst = this.instances.get(this.pi.context);
    const u = inst && this.unitOf(inst);
    const svg = u?.lastFull || inst?.lastSvg;
    if (!svg || svg === this.pi.last) return;
    this.pi.last = svg;
    this.toPi({ type: 'preview', image: svgDataUrl(svg), mode: u?.mode });
  }

  onPiMessage(m) {
    const p = m.payload || {};
    const inst = this.instances.get(m.context);
    switch (p.cmd || (p.event === 'game-reset' ? 'game-reset' : undefined)) {
      case 'hello': if (!this.pi && m.context) this.onPiAppear(m); else this.sendPiState(); break;
      case 'reset':
        if (inst) { inst.settings = normalizeSettings({ facet: inst.settings.facet, group: inst.settings.group }, { controller: inst.controller, device: this.devices.get(inst.device).model }); this.flushPersist(inst); this.regroup(inst.device); this.sendPiState(); }
        break;
      case 'live': this.emit('pi-live', p); break;   // { action: 'deny' | 'revoke' }
      case 'stats': this.toPi({ type: 'stats', stats: this.stats() }); break;
      case 'game-reset': { const gu = inst && this.unitOf(inst); if (gu?.game) this.gameReset(gu); this.sendPiState(); break; }
      case 'audio-bridge': {
        // Only when no native capture backend is live: the bridge page feeds levels from the browser.
        const i = this.audio?.info?.();
        if (i && i.state !== 'live' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(i.bridge?.url || '')) this.conn.openUrl(i.bridge.url);
        this.sendPiState();
        break;
      }
      default: break;
    }
  }

  // ── live channel hooks ───────────────────────────────────────────────────────
  /** Devices for the control channel's status. */
  liveDevices() {
    return [...this.devices.values()].map((d) => {
      const mine = [...this.instances.values()].filter((i) => i.device === d.id && !i.multi);
      const m = d.model;
      return {
        id: d.id, type: d.type ?? null, name: d.name, model: m.id, size: { columns: m.cols, rows: m.rows },
        dials: m.dials?.count || 0, layers: m.dials?.layers || (m.dials?.count ? 1 : 0), virtual: !this.isPhysical(d), connected: d.connected,
        prismKeys: mine.filter((i) => i.controller === 'Keypad').map((i) => ({ col: i.col, row: i.row })),
        prismDials: mine.filter((i) => i.controller === 'Encoder').map((i) => ({ dial: i.col, layer: i.row })),
      };
    });
  }

  /** Replace the live overlays of a device: { keys: Map|object 'c,r' → look config, dials: … }. */
  setOverlays(deviceId, { keys = new Map(), dials = new Map() } = {}) {
    const asMap = (x) => (x instanceof Map ? x : new Map(Object.entries(x || {})));
    const k = asMap(keys), d = asMap(dials);
    if (!k.size && !d.size) this.overlays.delete(deviceId);
    else this.overlays.set(deviceId, { keys: k, dials: d });
    this.regroup(deviceId);
  }

  clearAllOverlays() { const ids = [...this.overlays.keys()]; this.overlays.clear(); for (const id of ids) this.regroup(id); }

  /** The SVG an instance shows now (snapshots / previews). */
  currentSvg(deviceId, controller, col, row) {
    for (const i of this.instances.values()) if (i.device === deviceId && i.controller === controller && i.col === col && i.row === row) return i.lastSvg;
    return null;
  }

  /** Contexts that show the pairing prompt: the top-left Prism key of every connected physical deck. */
  promptContexts() {
    const out = new Set();
    for (const d of this.devices.values()) {
      if (!d.connected || !this.isPhysical(d)) continue;
      const keys = [...this.instances.values()].filter((i) => i.device === d.id && i.controller === 'Keypad' && !i.multi).sort((a, b) => a.row - b.row || a.col - b.col);
      if (keys[0]) out.add(keys[0].context);
    }
    return out;
  }

  /** Show (or with null, clear) the pairing prompt. Returns the number of keys showing it. */
  setPrompt(prompt) {
    const before = this.prompt ? [...this.prompt.contexts] : [];
    if (this.prompt?.holdTimer) { this.clearTimer(this.prompt.holdTimer); this.prompt.holdTimer = null; }
    this.prompt = prompt ? { ...prompt, contexts: this.promptContexts(), shownAt: this.now() } : null;
    const devs = new Set([...before, ...(this.prompt ? this.prompt.contexts : [])].map((c) => this.instances.get(c)?.device).filter(Boolean));
    for (const id of devs) this.regroup(id);
    return this.prompt ? this.prompt.contexts.size : 0;
  }

  stats() {
    const devices = {};
    for (const d of this.devices.values()) {
      const units = [...this.units.values()].filter((u) => u.device === d.id);
      devices[d.id] = { name: d.name, connected: d.connected, budget: { ...d.budget.stats }, pending: d.budget.pending.size, units: units.map((u) => ({ mode: u.mode, facet: u.facet?.id, members: u.members.length, fps: Math.round(u.slot.fps * 100) / 100, idle: u.idle, cost: Math.round((u.avgCost ?? 1) * 100) / 100, elements: u.elements })) };
    }
    return { devices, instances: this.instances.size, scheduler: { ...this.scheduler.stats, active: this.scheduler.active }, bufferedAmount: this.conn.bufferedAmount || 0, limits: this.globals.limits };
  }
}

export const createRuntime = (opts) => new PrismRuntime(opts);
