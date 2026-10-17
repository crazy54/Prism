// The service-worker application: wires the store, privacy, publisher, connection, media hub,
// downloads, preview and command dispatch to the chrome.* APIs. `createApp(env)` takes every
// dependency (chrome, clock, codec, fetch) so the unit tests can run it against fakes.
//
// MV3 rule: every chrome event listener is registered synchronously in `listen()`, during the
// worker's first turn, so events can wake a stopped worker. State is rebuilt from tabs.query() and
// friends on every start (`init()`); handlers wait for that before touching the store.

import { PROTO, T, HOST_NAME, STATUS, LIMITS, LEVELS } from '../shared/protocol.js';
import { clamp } from '../shared/util.js';
import { matchesPattern } from '../shared/domains.js';
import { StateStore, tabPatchFromChange } from './store.js';
import { effectiveLevel, levelReason, makeContext, tabView, windowView, groupView, mediaView, downloadView, originsView, isLevel } from './privacy.js';
import { Publisher } from './publisher.js';
import { NativeConnection } from './connection.js';
import { MediaHub } from './media.js';
import { DownloadsTracker } from './downloads.js';
import { Grants } from './grants.js';
import { ImageStore, browserCodec } from './images.js';
import { CommandLimiter } from './ratelimit.js';
import { createHandlers, Dispatcher } from './commands.js';
import { Preview } from './preview.js';
import { loadSettings, sanitizeSettings, DEFAULT_SETTINGS } from './settings.js';

export const ALARM = 'prism-tick';

export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

/** Brand and major version from navigator.userAgentData (Edge reports "Microsoft Edge"). */
export function detectBrowser(nav = globalThis.navigator) {
  const brands = (nav && nav.userAgentData && nav.userAgentData.brands) || [];
  const pick = (name) => brands.find((b) => b.brand === name);
  const known = [['Microsoft Edge', 'Edge'], ['Google Chrome', 'Chrome'], ['Brave', 'Brave'], ['Opera', 'Opera'], ['Vivaldi', 'Vivaldi']];
  for (const [n, label] of known) { const b = pick(n); if (b) return { brand: label, major: Number.parseInt(b.version, 10) || null }; }
  const c = pick('Chromium');
  const m = /Chrom(?:e|ium)\/(\d+)/.exec((nav && nav.userAgent) || '');
  return { brand: 'Chromium', major: c ? Number.parseInt(c.version, 10) : (m ? Number(m[1]) : null) };
}

export function createApp(env) {
  const chrome = env.chrome;
  const clock = env.clock || realClock;
  const codec = env.codec || browserCodec;
  const fetchFn = env.fetch || ((...a) => globalThis.fetch(...a));
  const random = env.random || Math.random;
  const log = env.log || (() => {});
  const nav = env.navigator || globalThis.navigator;
  const psl = env.psl || null;

  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  const state = {
    settings: sanitizeSettings(DEFAULT_SETTINGS),
    profileUid: '',
    deck: 'full',
    streaming: false,
    streamingApp: null,
    level: 'full',
    want: { tabs: true, media: true, downloads: true, groups: true },
    artPx: LIMITS.artDefaultPx,
    browser: detectBrowser(nav),
    started: false,
  };
  const recentActive = new Map();   // windowId -> [tabId,...] most recent last
  const focusWaiters = new Set();   // {windowId, resolve, timer}
  const reindexTimers = new Map();

  const store = new StateStore();
  const grants = new Grants({ chrome, log });

  const fetchBytes = async (url) => {
    const r = await fetchFn(url, { credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) return null;
    const len = Number(r.headers && r.headers.get ? r.headers.get('content-length') : 0);
    if (len > 4 * 1024 * 1024) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length > 4 * 1024 * 1024 ? null : buf;
  };
  const images = new ImageStore({
    codec,
    subtle: env.subtle || globalThis.crypto.subtle,
    log,
    fetchFavicon: (pageUrl, px) => fetchBytes(chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${px}`)),
    fetchUrl: (url) => fetchBytes(url),
    canFetch: (url) => grants.covers(url),
    now: () => clock.now(),
    defer: (fn, ms) => clock.setTimeout(fn, ms),
    onReady: (kind) => { if (kind === 'art') media.refreshArt(); else publisher.touchAll(); },
  });

  const privacyContext = () => makeContext({
    level: state.level,
    alwaysHidden: state.settings.alwaysHidden,
    mediaAllow: state.settings.mediaAllow,
    granted: grants.origins,
    psl,
    iconFor: (t) => images.iconFor(t),
  });

  /**
   * The privacy-filtered wire views. `only: 'media'` builds just the media views (the 4 Hz media flush must not
   * rebuild thousands of tab views); every other slice is then empty.
   */
  function buildViews({ only = null } = {}) {
    const ctx = privacyContext();
    const media = new Map();
    for (const m of store.media.values()) if (store.tabs.has(m.tabId)) media.set(m.key, mediaView(m, ctx, store.tabs.get(m.tabId)));
    if (only === 'media') {
      return { windows: new Map(), tabs: new Map(), groups: new Map(), media, downloads: new Map(), active: {}, focused: store.focusedWindow, privacy: ctx.level, partial: 'media' };
    }
    const windows = new Map();
    for (const w of store.windows.values()) if (w.type !== 'devtools') windows.set(w.id, windowView(w));
    const tabs = new Map();
    for (const t of store.tabs.values()) tabs.set(t.id, tabView(t, ctx));
    const groups = new Map();
    for (const g of store.groups.values()) groups.set(g.id, groupView(g, ctx));
    const downloads = new Map();
    for (const d of store.downloads.values()) downloads.set(d.id, downloadView(d, ctx));
    return {
      windows, tabs, groups, media, downloads, active: store.activeByWindow(), focused: store.focusedWindow, privacy: ctx.level,
      privacySettings: privacySettingsView(),
    };
  }

  /** The user's own privacy choices, for the plugin's fallbacks (the always-hidden list itself never leaves). */
  function privacySettingsView() {
    return { base: state.settings.privacyBase, whileStreaming: state.settings.whileStreaming, alwaysHidden: state.settings.alwaysHidden.length };
  }

  const connection = new NativeConnection({
    chrome, hostName: HOST_NAME, clock, random, log,
    // Nothing until init() loaded the profile uid and the user's privacy settings (PROTOCOL.md §4.1).
    hello: () => (state.started ? helloData() : null),
    onWelcome: (d) => onWelcome(d),
    onMessage: (m) => onPluginMessage(m),
    onSessionEnd: () => { publisher.stop(); preview.stop(); },
    onStatus: () => updateBadge(),
  });

  const post = (t, data) => connection.post(t, data);
  const publisher = new Publisher({ buildViews, post, images, clock, log });
  store.onChange((k, i) => publisher.onStoreChange(k, i));

  const media = new MediaHub({ store, images, grants, clock, log, getArtPx: () => state.artPx });
  media.onEvent = (kind, d) => {
    if (kind === 'pip') sendEvent({ kind: d.ok ? 'pipChanged' : 'gesture.needed', key: `${d.tabId}:${d.frameId}`, ok: d.ok, code: d.code || null });
  };
  const downloads = new DownloadsTracker({ chrome, store, images, clock, log });
  const preview = new Preview({ chrome, store, grants, clock, codec, post, privacyContext, log });

  const ctx = {
    chrome, store, grants, media, images, publisher, preview, clock, log,
    privacyContext,
    setDeckPrivacy: (level) => { state.deck = level; applyPrivacy(); persistPrivacy(); return { level: state.level, deck: state.deck }; },
    waitForFocus,
    prevActive,
    ensurePort,
    isReferenced: (id) => publisher.isReferenced(id),
  };
  const handlers = createHandlers(ctx);
  const dispatcher = new Dispatcher({ handlers, limiter: new CommandLimiter({ clock, perSec: LIMITS.cmdPerSec }), log });

  // ---------------------------------------------------------------- protocol
  function capsView() {
    const c = grants.caps();
    const pctx = privacyContext();
    const origins = originsView(c.grantedOrigins, pctx);
    return { ...c, grantedOrigins: origins, grantedCount: c.grantedOrigins.length };
  }

  function helloData() {
    const m = chrome.runtime.getManifest();
    return {
      proto: PROTO,
      ext: { id: chrome.runtime.id, version: m.version },
      browser: state.browser,
      profile: { uid: state.profileUid, label: state.settings.profileLabel },
      caps: capsView(),
      privacy: state.level,
      privacySettings: privacySettingsView(),
    };
  }

  function onWelcome(d) {
    state.deck = isLevel(d.privacy) ? d.privacy : 'full';
    if (typeof d.streaming === 'boolean') state.streaming = d.streaming;
    const w = d.want && typeof d.want === 'object' ? d.want : {};
    state.want = {
      tabs: w.tabs !== false,
      media: w.media !== false,
      downloads: w.downloads !== false,
      groups: w.groups !== false,
    };
    images.setFaviconPx(w.faviconPx);
    state.artPx = clamp(Number.isFinite(w.artMaxPx) ? Math.round(w.artMaxPx) : LIMITS.artDefaultPx, LIMITS.artMinPx, LIMITS.artMaxPx);
    state.level = currentLevel();
    persistPrivacy();
    updateBadge();
    publisher.start(state.want);
  }

  async function onPluginMessage(msg) {
    await ready;
    switch (msg.t) {
      case T.CMD: {
        const r = await dispatcher.dispatch(msg);
        if (r) connection.post(T.RESULT, r.ok ? r.data : undefined, false, r.ok ? { id: r.id, ok: true } : { id: r.id, ok: false, error: r.error });
        return;
      }
      case T.RESYNC:
        publisher.sentImages.clear();
        publisher.sendFull();
        return;
      case T.STREAMING: {
        const d = msg.data || {};
        state.streaming = d.active === true;
        state.streamingApp = typeof d.app === 'string' ? d.app.slice(0, 64) : null;
        applyPrivacy();
        persistPrivacy();
        return;
      }
      default:
        return; // unknown types are ignored (forward compatibility)
    }
  }

  function sendEvent(data) { connection.post(T.EVENT, data); }

  // ---------------------------------------------------------------- privacy
  const currentLevel = () => effectiveLevel({ base: state.settings.privacyBase, deck: state.deck, streaming: state.streaming, whileStreaming: state.settings.whileStreaming });

  function applyPrivacy(force = false) {
    const next = currentLevel();
    const changed = next !== state.level;
    state.level = next;
    if (next !== 'full') preview.stop();
    updateBadge();
    if (changed || force) publisher.invalidateAll();
  }

  function persistPrivacy() {
    chrome.storage.session.set({ privacy: { deck: state.deck, streaming: state.streaming, streamingApp: state.streamingApp } }).catch?.(() => {});
  }

  function updateBadge() {
    const a = chrome.action;
    if (!a) return;
    const safe = state.level !== 'full';
    try {
      a.setBadgeText({ text: safe ? 'SAFE' : '' });
      if (safe) { a.setBadgeBackgroundColor({ color: '#b8a2f2' }); a.setBadgeTextColor?.({ color: '#0a0c12' }); }
      a.setTitle({ title: `Prism Control: ${statusLine(connection.status)}${safe ? ' (streamer-safe)' : ''}` });
    } catch { /* action API unavailable */ }
  }

  // ---------------------------------------------------------------- helpers
  function waitForFocus(windowId, ms) {
    return new Promise((resolve) => {
      const w = { windowId, resolve, timer: null };
      w.timer = clock.setTimeout(() => { focusWaiters.delete(w); resolve(false); }, ms);
      focusWaiters.add(w);
    });
  }

  function noteActive(windowId, tabId) {
    const list = recentActive.get(windowId) || [];
    const i = list.indexOf(tabId);
    if (i >= 0) list.splice(i, 1);
    list.push(tabId);
    if (list.length > 12) list.shift();
    recentActive.set(windowId, list);
  }

  function prevActive(windowId, excludeTabId) {
    const list = recentActive.get(windowId) || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const id = list[i];
      if (id !== excludeTabId && store.tabs.has(id) && store.tabs.get(id).win === windowId) return id;
    }
    const t = store.tabs.get(excludeTabId);
    if (!t) return undefined;
    const sib = [...store.tabs.values()].filter((x) => x.win === windowId && x.id !== excludeTabId).sort((a, b) => Math.abs(a.idx - t.idx) - Math.abs(b.idx - t.idx));
    return sib.length ? sib[0].id : undefined;
  }

  /**
   * Makes sure a granted frame has an open port, by `deadline` (clock ms). Content scripts open their port lazily,
   * once the frame has media; a page dial on a page without media asks the script to open it now
   * (`prism.reconnect {open:true}`). If no script answers (not injected yet, or the worker restarted before the
   * page's script loaded), it is injected and asked again. Resolves true when the port is open.
   */
  async function ensurePort(tabId, frameId, deadline) {
    if (media.hasPort(tabId, frameId)) return true;
    const left = () => deadline - clock.now();
    const ask = async () => {
      try { await chrome.tabs.sendMessage(tabId, { t: 'prism.reconnect', open: true }, { frameId }); return true; }
      catch { return false; } // "Receiving end does not exist": no script in that frame yet
    };
    if (await ask() && await media.waitForPort(tabId, frameId, Math.min(LIMITS.portWaitMs, left()))) return true;
    if (media.hasPort(tabId, frameId)) return true;
    if (left() <= 0) return false;
    try {
      // executeScript can't be cancelled; stop waiting for it at the deadline.
      await Promise.race([grants.inject(tabId), new Promise((r) => clock.setTimeout(r, Math.max(0, left())))]);
    } catch (e) {
      log('inject failed', String(e && e.message || e));
    }
    if (media.hasPort(tabId, frameId)) return true;
    if (left() <= 0) return false;
    await ask();
    return media.waitForPort(tabId, frameId, Math.max(0, left()));
  }

  function reindexWindow(windowId) {
    if (reindexTimers.has(windowId)) return;
    reindexTimers.set(windowId, clock.setTimeout(async () => {
      reindexTimers.delete(windowId);
      try {
        const tabs = await chrome.tabs.query({ windowId });
        const ids = new Set(tabs.map((t) => t.id));
        for (const t of tabs) store.upsertTab(t);
        for (const t of [...store.tabs.values()]) if (t.win === windowId && !ids.has(t.id)) store.removeTab(t.id);
      } catch { /* window closed */ }
    }, 30));
  }

  /** Rebuilds windows/tabs/groups/downloads from the browser (worker start, periodic reconcile). */
  async function rebuild() {
    const [wins, tabs] = await Promise.all([chrome.windows.getAll({}), chrome.tabs.query({})]);
    store.replaceWindows(wins);
    store.replaceTabs(tabs);
    for (const t of tabs) if (t.active) noteActive(t.windowId, t.id);
    for (const id of [...store.media.keys()]) {
      const tabId = Number(id.split(':')[0]);
      if (!store.tabs.has(tabId)) store.removeMediaForTab(tabId);
    }
    if (chrome.tabGroups && grants.has('tabGroups')) {
      try { store.replaceGroups(await chrome.tabGroups.query({})); } catch { store.replaceGroups([]); }
    } else store.replaceGroups([]);
  }

  async function onGrantsChanged(added) {
    const before = new Set(grants.origins);
    await grants.refresh();
    // A removed site keeps its scripts until its pages reload: close their ports and drop their media now.
    media.revalidate();
    await grants.syncContentScripts().catch((e) => log('sync scripts failed', String(e)));
    bindOptionalApis();
    if (grants.has('downloads')) await downloads.rebuild().catch(() => {});
    else store.replaceDownloads([]);
    if (chrome.tabGroups && grants.has('tabGroups')) store.replaceGroups(await chrome.tabGroups.query({}).catch(() => []));
    else store.replaceGroups([]);
    // Inject into open tabs on newly granted origins.
    const fresh = grants.origins.filter((o) => !before.has(o));
    if (fresh.length) {
      for (const t of store.tabs.values()) {
        if (t.discarded || !t.url) continue;
        if (fresh.some((p) => matchesPattern(p, t.url))) grants.inject(t.id).catch(() => {});
      }
    }
    publisher.touchAll();
    sendEvent({ kind: added ? 'permissionAdded' : 'permissionRemoved', caps: capsView() });
  }

  let groupsBound = false;
  function bindOptionalApis() {
    downloads.bind();
    if (!groupsBound && chrome.tabGroups && chrome.tabGroups.onCreated) {
      groupsBound = true;
      chrome.tabGroups.onCreated.addListener(async (g) => { await ready; store.upsertGroup(g); });
      chrome.tabGroups.onUpdated.addListener(async (g) => { await ready; store.upsertGroup(g); });
      chrome.tabGroups.onRemoved.addListener(async (g) => { await ready; store.removeGroup(g.id); });
      chrome.tabGroups.onMoved?.addListener(async (g) => { await ready; store.upsertGroup(g); });
    }
  }

  async function pingContentScripts() {
    for (const t of store.tabs.values()) {
      if (t.discarded || !t.url || grants.access(t.url) !== 'granted') continue;
      chrome.tabs.sendMessage(t.id, { t: 'prism.reconnect' }).catch(() => {});
    }
  }

  async function injectAllGranted() {
    for (const t of store.tabs.values()) {
      if (t.discarded || !t.url || grants.access(t.url) !== 'granted') continue;
      grants.inject(t.id).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- UI pages
  function statusLine(s) {
    switch (s) {
      case STATUS.CONNECTED: return 'Connected';
      case STATUS.CONNECTING: return 'Connecting';
      case STATUS.PLUGIN_DOWN: case STATUS.HOST_ERROR: return 'Prism Control not running';
      case STATUS.HOST_MISSING: case STATUS.HOST_FORBIDDEN: return 'Host not installed';
      case STATUS.PROTO_MISMATCH: return 'Update needed';
      default: return 'Not connected';
    }
  }

  function uiStatus() {
    return {
      status: connection.status,
      line: statusLine(connection.status),
      detail: connection.detail,
      nextAt: connection.nextAt,
      connectedAt: connection.connectedAt,
      hostName: HOST_NAME,
      extId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      browser: state.browser,
      profile: { uid: state.profileUid, label: state.settings.profileLabel },
      privacy: {
        level: state.level, base: state.settings.privacyBase, deck: state.deck, streaming: state.streaming,
        streamingApp: state.streamingApp, whileStreaming: state.settings.whileStreaming,
        reason: levelReason({ base: state.settings.privacyBase, deck: state.deck, streaming: state.streaming, whileStreaming: state.settings.whileStreaming }),
      },
      caps: grants.caps(),
      counts: { windows: store.windows.size, tabs: store.tabs.size, media: store.media.size, downloads: store.downloads.size },
      stats: { ...publisher.stats },
    };
  }

  function onUiMessage(msg, sender, sendResponse) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string' || !msg.t.startsWith('ui.')) return false;
    // Only our own extension pages (popup, options); never content scripts.
    if (sender.id !== chrome.runtime.id || sender.tab && !(sender.url || '').startsWith(chrome.runtime.getURL(''))) return false;
    (async () => {
      await ready;
      if (msg.t === 'ui.status') return uiStatus();
      if (msg.t === 'ui.retry') { connection.retryNow(); return uiStatus(); }
      if (msg.t === 'ui.grants') { await onGrantsChanged(true); return uiStatus(); }
      return { error: 'unknown' };
    })().then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true;
  }

  // ---------------------------------------------------------------- listeners
  function listen() {
    const on = (ev, fn) => { if (ev && ev.addListener) ev.addListener(fn); };
    const after = (fn) => async (...a) => { await ready; try { await fn(...a); } catch (e) { log('handler failed', String(e && e.message || e)); } };

    // After init: a hello sent before the profile uid and the privacy settings are loaded would carry defaults.
    on(chrome.runtime.onStartup, after(() => connection.connectIfDue('startup')));
    on(chrome.runtime.onInstalled, after(async () => { await injectAllGranted(); }));
    on(chrome.alarms.onAlarm, after(async (a) => {
      if (a.name !== ALARM) return;
      connection.connectIfDue('alarm');
      if (connection.welcomed) await rebuild();
    }));
    on(chrome.runtime.onConnect, (port) => { media.accept(port, chrome.runtime.id); });
    on(chrome.runtime.onMessage, onUiMessage);

    on(chrome.tabs.onCreated, after((t) => { store.upsertTab(t); if (t.active) noteActive(t.windowId, t.id); reindexWindow(t.windowId); }));
    on(chrome.tabs.onUpdated, after((id, change, t) => {
      if (t && t.incognito) return;
      if (t) store.upsertTab(t); else store.patchTab(id, tabPatchFromChange(change));
      if (change.discarded) store.removeMediaForTab(id);
    }));
    on(chrome.tabs.onRemoved, after((id, info) => { store.removeTab(id); if (info && !info.isWindowClosing) reindexWindow(info.windowId); }));
    on(chrome.tabs.onActivated, after(({ tabId, windowId }) => { store.setActive(windowId, tabId); noteActive(windowId, tabId); }));
    on(chrome.tabs.onMoved, after((id, info) => reindexWindow(info.windowId)));
    on(chrome.tabs.onAttached, after((id, info) => reindexWindow(info.newWindowId)));
    on(chrome.tabs.onDetached, after((id, info) => reindexWindow(info.oldWindowId)));
    on(chrome.tabs.onReplaced, after(async (added, removed) => {
      store.removeTab(removed);
      try { store.upsertTab(await chrome.tabs.get(added)); } catch { /* gone */ }
    }));
    on(chrome.tabs.onZoomChange, after((z) => sendEvent({ kind: 'zoom', tabId: z.tabId, factor: z.newZoomFactor })));

    on(chrome.windows.onCreated, after((w) => store.upsertWindow(w)));
    on(chrome.windows.onRemoved, after((id) => store.removeWindow(id)));
    on(chrome.windows.onBoundsChanged, after((w) => store.upsertWindow(w)));
    on(chrome.windows.onFocusChanged, (id) => {
      const wid = id === (chrome.windows.WINDOW_ID_NONE ?? -1) ? -1 : id;
      for (const w of [...focusWaiters]) if (w.windowId === wid) { clock.clearTimeout(w.timer); focusWaiters.delete(w); w.resolve(true); }
      ready.then(() => { store.setFocusedWindow(wid); sendEvent({ kind: 'focusChanged', windowId: wid }); });
    });

    on(chrome.permissions.onAdded, after(() => onGrantsChanged(true)));
    on(chrome.permissions.onRemoved, after(() => onGrantsChanged(false)));

    on(chrome.storage.onChanged, after((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const prev = state.settings;
      state.settings = sanitizeSettings(changes.settings.newValue);
      const listsChanged = prev.alwaysHidden.join() !== state.settings.alwaysHidden.join() || prev.mediaAllow.join() !== state.settings.mediaAllow.join();
      // state.full carries privacySettings, so the plugin's fallbacks learn a changed choice at once.
      const choicesChanged = prev.privacyBase !== state.settings.privacyBase || prev.whileStreaming !== state.settings.whileStreaming;
      applyPrivacy(listsChanged || choicesChanged);
      if (prev.profileLabel !== state.settings.profileLabel) sendEvent({ kind: 'profile', profile: { uid: state.profileUid, label: state.settings.profileLabel } });
    }));

    bindOptionalApis();
  }

  // ---------------------------------------------------------------- start
  async function init() {
    try {
      const [{ settings, profileUid }, sess] = await Promise.all([
        loadSettings(chrome.storage),
        chrome.storage.session.get('privacy').catch(() => ({})),
        connection.restore(),
      ]);
      state.settings = settings;
      state.profileUid = profileUid;
      const p = sess && sess.privacy;
      if (p && isLevel(p.deck)) state.deck = p.deck;
      if (p && typeof p.streaming === 'boolean') state.streaming = p.streaming;
      state.level = currentLevel();
      await grants.refresh();
      media.revalidate();   // ports that connected before the grants were known
      await rebuild();
      if (grants.has('downloads')) await downloads.rebuild().catch(() => {});
    } catch (e) {
      log('init failed', String(e && e.message || e));
    }
    state.started = true;
    resolveReady();
    grants.syncContentScripts().catch((e) => log('sync scripts failed', String(e)));
    pingContentScripts();
    try { chrome.alarms.create(ALARM, { periodInMinutes: 0.5 }); } catch { /* ignore */ }
    updateBadge();
    connection.connectIfDue('startup');
    connection.helloNow();   // a port opened before init finished has not said hello yet
  }

  return {
    listen, init, ready, store, grants, media, images, publisher, connection, downloads, preview, dispatcher, handlers,
    state, buildViews, privacyContext, uiStatus, helloData, rebuild, LEVELS,
  };
}
