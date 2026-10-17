// A fake chrome.* API (just what the extension uses) plus a fake native port, for node --test.
// Fixtures use fictional data only (.example domains).

export class FakeEvent {
  constructor() { this.listeners = []; }
  addListener(fn) { this.listeners.push(fn); }
  removeListener(fn) { this.listeners = this.listeners.filter((x) => x !== fn); }
  hasListener(fn) { return this.listeners.includes(fn); }
  dispatch(...args) { const out = []; for (const fn of [...this.listeners]) out.push(fn(...args)); return out; }
}

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/** The native-messaging port as the extension sees it. `sent` records what the extension posted. */
export class FakeNativePort {
  constructor(chrome, name) {
    this.chrome = chrome;
    this.name = name;
    this.onMessage = new FakeEvent();
    this.onDisconnect = new FakeEvent();
    this.sent = [];
    this.connected = true;
  }
  postMessage(msg) {
    if (!this.connected) throw new Error('Attempting to use a disconnected port object');
    // Native messaging serializes to JSON; so do we, which also proves the frames are pure JSON.
    this.sent.push(JSON.parse(JSON.stringify(msg)));
  }
  disconnect() { this.connected = false; }
  /** The host (relay/plugin) sends a frame to the extension. */
  deliver(msg) { if (this.connected) this.onMessage.dispatch(clone(msg)); }
  /** The host goes away; lastError is set only during the callback, like Chrome. */
  hostDisconnect(message = 'Native host has exited.') {
    if (!this.connected) return;
    this.connected = false;
    this.chrome.runtime.lastError = { message };
    try { this.onDisconnect.dispatch(this); } finally { this.chrome.runtime.lastError = undefined; }
  }
  ofType(t) { return this.sent.filter((m) => m.t === t); }
}

/** A content-script port (runtime.onConnect) for one frame. */
export class FakeContentPort {
  /** `url` is the frame's document URL (default: the tab's URL, like a top frame; else video.example). */
  constructor(chrome, { tabId, frameId = 0, name = 'prism-media', id, url }) {
    this.name = name;
    const tabUrl = chrome._tabs && chrome._tabs.get(tabId) ? chrome._tabs.get(tabId).url : null;
    this.sender = { id: id ?? chrome.runtime.id, tab: { id: tabId, incognito: false }, frameId, url: url ?? tabUrl ?? 'https://video.example/' };
    this.onMessage = new FakeEvent();
    this.onDisconnect = new FakeEvent();
    this.received = [];
    this.connected = true;
    this.autoReply = null; // (cmd) => reply message or null
  }
  postMessage(msg) {
    this.received.push(clone(msg));
    if (this.autoReply && msg.t === 'cmd') {
      const r = this.autoReply(msg);
      if (r) queueMicrotask(() => this.send({ t: 'res', id: msg.id, ...r }));
    }
  }
  /** The worker closed the port: the content script sees onDisconnect. */
  disconnect() { this.connected = false; this.disconnectedByWorker = true; }
  send(msg) { if (this.connected) this.onMessage.dispatch(clone(msg)); }
  close() { this.connected = false; this.onDisconnect.dispatch(this); }
}

function storageArea(chrome, area) {
  const data = {};
  return {
    data,
    async get(keys) {
      if (keys == null) return clone(data);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in data) out[k] = clone(data[k]);
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: clone(data[k]), newValue: clone(v) }; data[k] = clone(v); }
      chrome.storage.onChanged.dispatch(changes, area);
    },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
}

/**
 * Creates the fake. Options:
 *  host: 'installed' | 'missing' | 'forbidden'   what connectNative does
 *  permissions / origins: granted at start
 *  optionalApis: which optional namespaces exist (downloads, tabGroups, sessions)
 */
export function createFakeChrome({ host = 'installed', permissions = ['tabs', 'favicon', 'nativeMessaging', 'storage', 'alarms', 'scripting'], origins = [], optionalApis = [], hostAccessRequest = true, split = false } = {}) {
  const chrome = { calls: [], nativePorts: [] };
  const rec = (api, ...args) => chrome.calls.push([api, ...clone(args)]);
  const ev = () => new FakeEvent();
  let nextTabId = 100;
  let nextWinId = 1;
  const tabs = new Map();
  const windows = new Map();
  const zoom = new Map();
  const granted = { permissions: new Set(permissions), origins: new Set(origins) };

  chrome.runtime = {
    id: 'ebbfhlgndibiinpfkhcacipfkoeokcgn',
    lastError: undefined,
    getManifest: () => ({ version: '0.1.0', name: 'Prism Control for Stream Deck' }),
    getURL: (p) => `chrome-extension://ebbfhlgndibiinpfkhcacipfkoeokcgn/${String(p).replace(/^\//, '')}`,
    onStartup: ev(), onInstalled: ev(), onConnect: ev(), onMessage: ev(),
    connectNative(name) {
      rec('runtime.connectNative', name);
      const port = new FakeNativePort(chrome, name);
      chrome.nativePorts.push(port);
      if (chrome.hostMode === 'missing') setImmediate(() => port.hostDisconnect('Specified native messaging host not found.'));
      else if (chrome.hostMode === 'forbidden') setImmediate(() => port.hostDisconnect('Access to the specified native messaging host is forbidden.'));
      else if (chrome.hostMode === 'crash') setImmediate(() => port.hostDisconnect('Native host has exited.'));
      return port;
    },
    sendMessage: async () => undefined,
  };
  chrome.hostMode = host;
  Object.defineProperty(chrome, 'port', { get: () => chrome.nativePorts[chrome.nativePorts.length - 1] });

  // ---- windows ----
  chrome.windows = {
    WINDOW_ID_NONE: -1,
    onCreated: ev(), onRemoved: ev(), onFocusChanged: ev(), onBoundsChanged: ev(),
    async getAll() { return [...windows.values()].map(clone); },
    async get(id) { const w = windows.get(id); if (!w) throw new Error(`No window with id: ${id}.`); return clone(w); },
    async update(id, props) {
      rec('windows.update', id, props);
      const w = windows.get(id);
      if (!w) throw new Error(`No window with id: ${id}.`);
      if (props.state) w.state = props.state;
      if (props.focused) {
        for (const x of windows.values()) x.focused = x.id === id;
        if (chrome.focusBehavior !== 'refuse') setImmediate(() => chrome.windows.onFocusChanged.dispatch(id));
        else w.focused = false;
      }
      return clone(w);
    },
  };

  // ---- tabs ----
  const tabObj = (t) => clone(t);
  chrome.tabs = {
    onCreated: ev(), onUpdated: ev(), onRemoved: ev(), onActivated: ev(), onMoved: ev(), onAttached: ev(),
    onDetached: ev(), onReplaced: ev(), onZoomChange: ev(),
    async query(q = {}) {
      return [...tabs.values()].filter((t) => (q.windowId === undefined || t.windowId === q.windowId)
        && (q.active === undefined || t.active === q.active)).sort((a, b) => a.windowId - b.windowId || a.index - b.index).map(tabObj);
    },
    async get(id) { const t = tabs.get(id); if (!t) throw new Error(`No tab with id: ${id}.`); return tabObj(t); },
    async update(id, props) {
      rec('tabs.update', id, props);
      const t = tabs.get(id);
      if (!t) throw new Error(`No tab with id: ${id}.`);
      const change = {};
      if (props.active) {
        for (const x of tabs.values()) if (x.windowId === t.windowId) x.active = x.id === id;
        chrome.tabs.onActivated.dispatch({ tabId: id, windowId: t.windowId });
      }
      if ('muted' in props) { t.mutedInfo = { muted: !!props.muted }; change.mutedInfo = t.mutedInfo; }
      if ('pinned' in props) { t.pinned = !!props.pinned; change.pinned = t.pinned; }
      if ('autoDiscardable' in props) { t.autoDiscardable = !!props.autoDiscardable; change.autoDiscardable = t.autoDiscardable; }
      if (Object.keys(change).length) chrome.tabs.onUpdated.dispatch(id, clone(change), tabObj(t));
      return tabObj(t);
    },
    async create(props = {}) {
      rec('tabs.create', props);
      const winId = props.windowId ?? [...windows.keys()][0];
      return tabObj(chrome._addTab({ windowId: winId, url: props.url || 'chrome://newtab/', title: 'New Tab', active: props.active !== false, index: props.index }));
    },
    async remove(id) {
      rec('tabs.remove', id);
      const t = tabs.get(id);
      if (!t) throw new Error(`No tab with id: ${id}.`);
      tabs.delete(id);
      chrome.tabs.onRemoved.dispatch(id, { windowId: t.windowId, isWindowClosing: false });
    },
    async reload(id, p) { rec('tabs.reload', id, p); if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`); },
    async goBack(id) { rec('tabs.goBack', id); },
    async goForward(id) { rec('tabs.goForward', id); },
    async move(id, p) { rec('tabs.move', id, p); const t = tabs.get(id); t.index = p.index; if (p.windowId !== undefined) t.windowId = p.windowId; return tabObj(t); },
    async group(o) { rec('tabs.group', o); return o.groupId ?? 7; },
    async ungroup(ids) { rec('tabs.ungroup', ids); },
    async getZoom(id) { return zoom.get(id) ?? 1; },
    async setZoom(id, f) { rec('tabs.setZoom', id, f); zoom.set(id, f === 0 ? 1 : f); },
    // A test may answer like a content script: chrome.onTabMessage(tabId, msg, opts) may connect a port, or throw
    // ("Receiving end does not exist") when no script runs in that frame.
    async sendMessage(id, msg, opts) { rec('tabs.sendMessage', id, msg, opts); if (chrome.onTabMessage) return chrome.onTabMessage(id, msg, opts); },
    // chrome.onCapture(windowId) runs during the capture (a test can switch tabs there).
    async captureVisibleTab(windowId) { rec('tabs.captureVisibleTab', windowId); if (chrome.onCapture) await chrome.onCapture(windowId); return 'data:image/jpeg;base64,/9j/4AAQ'; },
  };
  if (split) {
    chrome.tabs.createSplit = async (ids) => { rec('tabs.createSplit', ids); return 42; };
    chrome.tabs.unsplit = async (id) => { rec('tabs.unsplit', id); };
  }

  // ---- permissions ----
  chrome.permissions = {
    onAdded: ev(), onRemoved: ev(),
    async getAll() { return { permissions: [...granted.permissions], origins: [...granted.origins] }; },
    async contains(p) { return (p.permissions || []).every((x) => granted.permissions.has(x)) && (p.origins || []).every((x) => granted.origins.has(x)); },
    async request(p) { rec('permissions.request', p); return false; },
    async remove(p) { for (const x of p.permissions || []) granted.permissions.delete(x); for (const x of p.origins || []) granted.origins.delete(x); chrome.permissions.onRemoved.dispatch(p); return true; },
  };
  if (hostAccessRequest) chrome.permissions.addHostAccessRequest = async (r) => { rec('permissions.addHostAccessRequest', r); };
  chrome._grant = (p) => {
    for (const x of p.permissions || []) granted.permissions.add(x);
    for (const x of p.origins || []) granted.origins.add(x);
    chrome.permissions.onAdded.dispatch(p);
  };

  // ---- scripting ----
  const registered = new Map();
  chrome.scripting = {
    async registerContentScripts(list) { rec('scripting.registerContentScripts', list); for (const s of list) { if (registered.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`); registered.set(s.id, clone(s)); } },
    async updateContentScripts(list) { rec('scripting.updateContentScripts', list); for (const s of list) registered.set(s.id, { ...registered.get(s.id), ...clone(s) }); },
    async unregisterContentScripts(f) { rec('scripting.unregisterContentScripts', f); for (const id of (f && f.ids) || [...registered.keys()]) registered.delete(id); },
    async getRegisteredContentScripts(f) { return [...registered.values()].filter((s) => !f || !f.ids || f.ids.includes(s.id)).map(clone); },
    async executeScript(o) { rec('scripting.executeScript', o); return []; },
    registered,
  };

  // ---- storage, alarms, action ----
  chrome.storage = { onChanged: ev() };
  chrome.storage.local = storageArea(chrome, 'local');
  chrome.storage.session = storageArea(chrome, 'session');
  chrome.alarms = { onAlarm: ev(), create: (name, o) => rec('alarms.create', name, o) };
  chrome.action = {
    badge: '',
    setBadgeText(o) { this.badge = o.text; rec('action.setBadgeText', o); },
    setBadgeBackgroundColor() {}, setBadgeTextColor() {}, setTitle(o) { this.title = o.title; },
  };

  // ---- optional namespaces ----
  if (optionalApis.includes('downloads')) {
    const items = new Map();
    chrome.downloads = {
      onCreated: ev(), onChanged: ev(), onErased: ev(), items,
      async search(q = {}) {
        let list = [...items.values()];
        if (q.id !== undefined) list = list.filter((d) => d.id === q.id);
        if (q.state) list = list.filter((d) => d.state === q.state);
        if (q.limit) list = list.slice(0, q.limit);
        return list.map(clone);
      },
      show(id) { rec('downloads.show', id); },
      async pause(id) { rec('downloads.pause', id); },
      async resume(id) { rec('downloads.resume', id); },
      async cancel(id) { rec('downloads.cancel', id); },
      async getFileIcon() { return null; },
    };
  }
  if (optionalApis.includes('sessions')) {
    chrome.sessions = {
      recent: [],
      async restore(id) { rec('sessions.restore', id); return { tab: { id: 999, windowId: 1 } }; },
      async getRecentlyClosed(o) { return clone(this.recent.slice(0, o.maxResults)); },
    };
  }
  if (optionalApis.includes('tabGroups')) {
    const groups = new Map();
    chrome.tabGroups = {
      onCreated: ev(), onUpdated: ev(), onRemoved: ev(), onMoved: ev(), groups,
      async query() { return [...groups.values()].map(clone); },
      async get(id) { const g = groups.get(id); if (!g) throw new Error(`No group with id: ${id}.`); return clone(g); },
      async update(id, p) { rec('tabGroups.update', id, p); const g = groups.get(id); Object.assign(g, p); return clone(g); },
    };
  }

  // ---- fixture helpers ----
  chrome._addWindow = (props = {}) => {
    const w = { id: nextWinId++, focused: false, state: 'normal', type: 'normal', left: 0, top: 0, width: 1200, height: 800, incognito: false, ...props };
    windows.set(w.id, w);
    return w;
  };
  chrome._addTab = (props = {}) => {
    const windowId = props.windowId ?? [...windows.keys()][0];
    const index = props.index ?? [...tabs.values()].filter((t) => t.windowId === windowId).length;
    const t = {
      id: props.id ?? nextTabId++, windowId, index, active: false, pinned: false, audible: false,
      mutedInfo: { muted: false }, title: 'Untitled', url: 'https://www.example/', status: 'complete',
      discarded: false, frozen: false, groupId: -1, incognito: false, autoDiscardable: true, lastAccessed: 1_800_000_000_000,
      ...props,
    };
    if (t.active) for (const x of tabs.values()) if (x.windowId === windowId) x.active = false;
    tabs.set(t.id, t);
    chrome.tabs.onCreated.dispatch(tabObj(t));
    return t;
  };
  chrome._updateTab = (id, change) => {
    const t = tabs.get(id);
    Object.assign(t, change);
    chrome.tabs.onUpdated.dispatch(id, clone(change), tabObj(t));
  };
  chrome._tabs = tabs;
  chrome._windows = windows;
  return chrome;
}

/** Fake codec: passes bytes through, reporting the requested size. */
export const fakeCodec = {
  async iconPng(bytes, px) { return { bytes, mime: 'image/png', w: px, h: px }; },
  async fit(bytes, w, h) { return { bytes, mime: 'image/jpeg', w, h }; },
};

/** Fake fetch for _favicon: a distinct tiny "PNG" per page URL, the default globe for the probe URL. */
export function fakeFetch() {
  const enc = new TextEncoder();
  return async (url) => {
    const u = new URL(url);
    const page = u.searchParams.get('pageUrl') || url;
    const body = page.includes('prism-control-default.invalid') || page.includes('noicon.example') ? 'DEFAULT-GLOBE' : `icon:${new URL(page).hostname}`;
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...enc.encode(body)]);
    return { ok: true, headers: { get: () => String(bytes.length) }, arrayBuffer: async () => bytes.buffer };
  };
}
