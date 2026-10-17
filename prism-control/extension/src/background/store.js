// The raw state store: windows, tabs, groups, media sessions and downloads.
// It holds unfiltered data and never touches the wire; privacy.js builds what is sent.
// Every mutation reports which slice changed through `onChange(kind, info)`.

export function normalizeTab(t) {
  return {
    id: t.id,
    win: t.windowId,
    idx: t.index,
    active: !!t.active,
    pinned: !!t.pinned,
    audible: !!t.audible,
    muted: !!(t.mutedInfo && t.mutedInfo.muted),
    title: typeof t.title === 'string' ? t.title : null,
    url: typeof t.url === 'string' && t.url ? t.url : (typeof t.pendingUrl === 'string' ? t.pendingUrl : null),
    status: t.status || 'complete',
    discarded: !!t.discarded,
    frozen: !!t.frozen,
    group: Number.isInteger(t.groupId) ? t.groupId : -1,
    split: Number.isInteger(t.splitViewId) ? t.splitViewId : -1,
    lastAccessed: typeof t.lastAccessed === 'number' ? t.lastAccessed : null,
    favIconUrl: typeof t.favIconUrl === 'string' ? t.favIconUrl : null,
    autoDiscardable: t.autoDiscardable !== false,
    incognito: !!t.incognito,
  };
}

/** Maps a tabs.onUpdated changeInfo onto raw-tab fields. */
export function tabPatchFromChange(c) {
  const p = {};
  if ('title' in c) p.title = c.title ?? null;
  if ('url' in c) p.url = c.url ?? null;
  if ('status' in c) p.status = c.status;
  if ('audible' in c) p.audible = !!c.audible;
  if ('mutedInfo' in c) p.muted = !!(c.mutedInfo && c.mutedInfo.muted);
  if ('pinned' in c) p.pinned = !!c.pinned;
  if ('discarded' in c) { p.discarded = !!c.discarded; if (c.discarded) p.status = 'unloaded'; }
  if ('frozen' in c) p.frozen = !!c.frozen;
  if ('groupId' in c) p.group = c.groupId;
  if ('splitViewId' in c) p.split = c.splitViewId;
  if ('favIconUrl' in c) p.favIconUrl = c.favIconUrl ?? null;
  if ('autoDiscardable' in c) p.autoDiscardable = c.autoDiscardable !== false;
  if ('lastAccessed' in c) p.lastAccessed = c.lastAccessed;
  return p;
}

export function normalizeWindow(w) {
  return {
    id: w.id,
    focused: !!w.focused,
    state: w.state || 'normal',
    type: w.type || 'normal',
    left: w.left, top: w.top, width: w.width, height: w.height,
    incognito: !!w.incognito,
  };
}

export function normalizeGroup(g) {
  return { id: g.id, win: g.windowId, title: g.title || '', color: g.color || 'grey', collapsed: !!g.collapsed };
}

export function normalizeDownload(d) {
  const eta = d.estimatedEndTime ? Date.parse(d.estimatedEndTime) : NaN;
  return {
    id: d.id,
    state: d.state || 'in_progress',
    filename: d.filename || '',
    url: d.finalUrl || d.url || '',
    mime: d.mime || '',
    bytes: d.bytesReceived || 0,
    total: d.totalBytes > 0 ? d.totalBytes : null,
    etaAt: Number.isFinite(eta) ? eta : null,
    paused: !!d.paused,
    canResume: !!d.canResume,
    danger: d.danger || 'safe',
    error: d.error || null,
    exists: d.exists !== false,
    startTime: d.startTime ? Date.parse(d.startTime) : null,
    incognito: !!d.incognito,
    iconRef: null,
  };
}

export class StateStore {
  constructor() {
    this.windows = new Map();
    this.tabs = new Map();
    this.groups = new Map();
    this.media = new Map();      // key -> media entry
    this.downloads = new Map();
    this.focusedWindow = -1;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, info) { for (const fn of this.listeners) fn(kind, info); }

  // ---- windows ----
  replaceWindows(list) {
    this.windows.clear();
    for (const w of list) if (!w.incognito) this.windows.set(w.id, normalizeWindow(w));
    const f = list.find((w) => w.focused && !w.incognito);
    this.focusedWindow = f ? f.id : -1;
    this.emit('windows');
  }
  upsertWindow(w) {
    if (w.incognito) return;
    const prev = this.windows.get(w.id);
    this.windows.set(w.id, { ...(prev || {}), ...normalizeWindow(w), focused: this.focusedWindow === w.id });
    this.emit('windows', { id: w.id });
  }
  patchWindow(id, patch) {
    const prev = this.windows.get(id);
    if (!prev) return;
    this.windows.set(id, { ...prev, ...patch });
    this.emit('windows', { id });
  }
  removeWindow(id) {
    if (!this.windows.delete(id)) return;
    for (const t of [...this.tabs.values()]) if (t.win === id) this.removeTab(t.id);
    if (this.focusedWindow === id) this.focusedWindow = -1;
    this.emit('windows', { id, removed: true });
  }
  setFocusedWindow(id) {
    if (this.focusedWindow === id) return;
    this.focusedWindow = id;
    for (const w of this.windows.values()) w.focused = w.id === id;
    this.emit('windows', { focus: id });
  }

  // ---- tabs ----
  replaceTabs(list) {
    this.tabs.clear();
    for (const t of list) if (!t.incognito) this.tabs.set(t.id, normalizeTab(t));
    this.emit('tabs');
  }
  upsertTab(t) {
    if (t.incognito) return;
    this.tabs.set(t.id, normalizeTab(t));
    this.emit('tabs', { id: t.id });
  }
  patchTab(id, patch) {
    const prev = this.tabs.get(id);
    if (!prev) return false;
    const next = { ...prev, ...patch };
    this.tabs.set(id, next);
    this.emit('tabs', { id, patch });
    return true;
  }
  removeTab(id) {
    if (!this.tabs.delete(id)) return;
    this.removeMediaForTab(id);
    this.emit('tabs', { id, removed: true });
  }
  /** Marks `tabId` active in its window and the others inactive. */
  setActive(windowId, tabId) {
    for (const t of this.tabs.values()) {
      if (t.win !== windowId) continue;
      const a = t.id === tabId;
      if (t.active !== a) t.active = a;
    }
    this.emit('tabs', { activeWindow: windowId });
  }
  activeByWindow() {
    const out = {};
    for (const t of this.tabs.values()) if (t.active) out[t.win] = t.id;
    return out;
  }
  /** The active tab of the focused window (or of the most recently focused one we know). */
  activeTab() {
    const byWin = this.activeByWindow();
    if (this.focusedWindow !== -1 && byWin[this.focusedWindow] !== undefined) return this.tabs.get(byWin[this.focusedWindow]) || null;
    let best = null;
    for (const t of this.tabs.values()) if (t.active && (!best || (t.lastAccessed || 0) > (best.lastAccessed || 0))) best = t;
    return best;
  }

  // ---- groups ----
  replaceGroups(list) {
    this.groups.clear();
    for (const g of list) this.groups.set(g.id, normalizeGroup(g));
    this.emit('groups');
  }
  upsertGroup(g) { this.groups.set(g.id, normalizeGroup(g)); this.emit('groups', { id: g.id }); }
  removeGroup(id) { if (this.groups.delete(id)) this.emit('groups', { id, removed: true }); }

  // ---- media ----
  /** Replaces every media entry of one frame with `entries` (already sanitized). */
  setFrameMedia(tabId, frameId, entries) {
    const prefix = `${tabId}:${frameId}`;
    const keep = new Set();
    for (const e of entries) {
      keep.add(e.key);
      const prev = this.media.get(e.key);
      this.media.set(e.key, e);
      if (!prev || prev.state !== e.state) this.emit('media', { key: e.key, urgent: true });
      else this.emit('media', { key: e.key, urgent: urgentChange(prev, e) });
    }
    for (const k of [...this.media.keys()]) {
      if ((k === prefix || k.startsWith(prefix + ':')) && !keep.has(k)) {
        this.media.delete(k);
        this.emit('media', { key: k, removed: true, urgent: true });
      }
    }
  }
  removeMediaForFrame(tabId, frameId) { this.setFrameMedia(tabId, frameId, []); }
  removeMediaForTab(tabId) {
    const p = `${tabId}:`;
    for (const k of [...this.media.keys()]) {
      if (k.startsWith(p)) { this.media.delete(k); this.emit('media', { key: k, removed: true, urgent: true }); }
    }
  }
  mediaForTab(tabId) {
    const p = `${tabId}:`;
    return [...this.media.values()].filter((m) => m.key.startsWith(p));
  }

  // ---- downloads ----
  replaceDownloads(list) {
    this.downloads.clear();
    for (const d of list) if (!d.incognito) this.downloads.set(d.id, normalizeDownload(d));
    this.emit('downloads');
  }
  upsertDownload(d) {
    if (d.incognito) return;
    const prev = this.downloads.get(d.id);
    const next = normalizeDownload(d);
    if (prev) next.iconRef = prev.iconRef;
    this.downloads.set(d.id, next);
    this.emit('downloads', { id: d.id });
  }
  patchDownload(id, patch) {
    const prev = this.downloads.get(id);
    if (!prev) return;
    this.downloads.set(id, { ...prev, ...patch });
    this.emit('downloads', { id });
  }
  removeDownload(id) { if (this.downloads.delete(id)) this.emit('downloads', { id, removed: true }); }
}

/** Changes the deck should see at once, not at the 4 Hz cadence. */
function urgentChange(a, b) {
  return a.title !== b.title || a.pip !== b.pip || a.mic !== b.mic || a.camera !== b.camera
    || a.elementMuted !== b.elementMuted || a.rate !== b.rate || a.live !== b.live
    || (a.actions || []).join() !== (b.actions || []).join();
}
