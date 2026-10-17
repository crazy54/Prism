// Media hub: one runtime port per granted frame (from media-isolated.js), sanitizing everything the
// page reports (MAIN-world data is untrusted page data) and routing media commands back.

import { LIMITS, REPORTED_ACTIONS, PIP_KEYS } from '../shared/protocol.js';
import { capStr, clamp, finiteOrNull, isFiniteNum } from '../shared/util.js';
import { parseUrl } from '../shared/domains.js';
import { TokenBucket } from './ratelimit.js';

export const PORT_NAME = 'prism-media';
const KINDS = new Set(['video', 'audio', 'session-only']);
const STATES = new Set(['playing', 'paused', 'none']);
const SOURCES = new Set(['mediasession', 'element', 'mediasession+element']);
const ACTIONS = new Set(REPORTED_ACTIONS);
const PIP_KEY_SET = new Set(PIP_KEYS);

/** Validates one entry reported by a content script. Returns a raw media record or null. */
export function sanitizeEntry(e, tabId, frameId) {
  if (!e || typeof e !== 'object') return null;
  const sub = e.sub === null || e.sub === undefined ? null : (Number.isInteger(e.sub) && e.sub > 0 && e.sub < 1e6 ? e.sub : undefined);
  if (sub === undefined) return null;
  const key = sub === null ? `${tabId}:${frameId}` : `${tabId}:${frameId}:${sub}`;
  const actions = Array.isArray(e.actions)
    ? [...new Set(e.actions.filter((a) => typeof a === 'string' && ACTIONS.has(a)))].slice(0, LIMITS.actions)
    : [];
  const chapters = Array.isArray(e.chapters)
    ? e.chapters.slice(0, LIMITS.chapters).map((c) => ({
      title: capStr(c && typeof c.title === 'string' ? c.title : '', LIMITS.chapterTitle) || '',
      startMs: isFiniteNum(c && c.startMs) ? Math.max(0, Math.round(c.startMs)) : 0,
    }))
    : [];
  const dur = finiteOrNull(e.durationMs);
  const pos = finiteOrNull(e.positionMs);
  return {
    key,
    tabId,
    frameId,
    sub,
    kind: KINDS.has(e.kind) ? e.kind : 'session-only',
    state: STATES.has(e.state) ? e.state : 'none',
    title: capStr(e.title, LIMITS.title),
    artist: capStr(e.artist, LIMITS.artist),
    album: capStr(e.album, LIMITS.album),
    artSrc: sanitizeArtSrc(e.artSrc),
    artType: capStr(e.artType, 32),
    art: null,
    chapters,
    durationMs: dur !== null && dur >= 0 ? Math.round(dur) : null,
    live: !!e.live,
    positionMs: pos !== null && pos >= 0 ? Math.round(pos) : null,
    positionAt: finiteOrNull(e.positionAt) !== null ? Math.round(e.positionAt) : null,
    rate: isFiniteNum(e.rate) ? clamp(e.rate, 0, 16) : 1,
    volume: isFiniteNum(e.volume) ? clamp(e.volume, 0, 1) : null,
    elementMuted: typeof e.elementMuted === 'boolean' ? e.elementMuted : null,
    pip: !!e.pip,
    actions,
    mic: typeof e.mic === 'boolean' ? e.mic : null,
    camera: typeof e.camera === 'boolean' ? e.camera : null,
    source: SOURCES.has(e.source) ? e.source : 'element',
  };
}

/** Artwork sources we accept from pages: http(s) URLs (plugin fetches https) and blob:/data: markers. */
function sanitizeArtSrc(src) {
  if (typeof src !== 'string' || src.length === 0 || src.length > LIMITS.url) return null;
  // blob: and data: artwork never leave the browser as URLs: the content script re-encodes the bytes and
  // sends them as an `art` message keyed by this token ("blob:..." or "data:#<hash>").
  if (src.startsWith('blob:')) return src;
  if (/^data:#[0-9a-f]{1,16}$/.test(src)) return src;
  const u = parseUrl(src);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  return u.href;
}

/**
 * Command results from a page go to the plugin, so only known numeric/boolean/enum fields pass
 * (a page can't smuggle a title through a result while streamer-safe is on).
 */
const RESULT_FIELDS = {
  state: (v) => STATES.has(v) ? v : undefined,
  positionMs: (v) => isFiniteNum(v) ? Math.round(v) : undefined,
  durationMs: (v) => v === null ? null : (isFiniteNum(v) ? Math.round(v) : undefined),
  live: (v) => typeof v === 'boolean' ? v : undefined,
  rate: (v) => isFiniteNum(v) ? clamp(v, 0, 16) : undefined,
  volume: (v) => isFiniteNum(v) ? clamp(v, 0, 1) : undefined,
  muted: (v) => typeof v === 'boolean' ? v : undefined,
  pip: (v) => typeof v === 'boolean' ? v : undefined,
  armed: (v) => typeof v === 'boolean' ? v : undefined,
  key: (v) => PIP_KEY_SET.has(v) ? v : undefined,
  expiresInMs: (v) => isFiniteNum(v) ? Math.round(v) : undefined,
  auto: (v) => typeof v === 'boolean' ? v : undefined,
  siteHandler: (v) => typeof v === 'boolean' ? v : undefined,
  scrolled: (v) => isFiniteNum(v) ? Math.round(v) : undefined,
  atTop: (v) => typeof v === 'boolean' ? v : undefined,
  atBottom: (v) => typeof v === 'boolean' ? v : undefined,
  action: (v) => ACTIONS.has(v) ? v : undefined,
};
export function sanitizeResult(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  for (const [k, f] of Object.entries(RESULT_FIELDS)) {
    if (!(k in d)) continue;
    const v = f(d[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Page-reported failures map to a fixed code and canned text: page strings never reach the plugin. */
const PAGE_ERRORS = {
  gesture_required: 'the page needs a user gesture (use via: "gesture" or "auto")',
  unsupported: 'the page or player does not support that',
  not_found: 'that media is gone',
  bad_args: 'bad arguments',
  busy: 'the page did not complete the command',
};
export function pageError(code) {
  const c = Object.prototype.hasOwnProperty.call(PAGE_ERRORS, code) ? code : 'busy';
  return { code: c, message: PAGE_ERRORS[c] };
}

export class MediaHub {
  constructor({ store, images, grants, clock, getArtPx, log = () => {} }) {
    this.store = store;
    this.images = images;
    this.grants = grants;
    this.clock = clock;
    this.getArtPx = getArtPx;
    this.log = log;
    this.ports = new Map();     // "tabId:frameId" -> {port, tabId, frameId, url, bucket, pending: Map<id, {resolve, timer}>}
    this.portWaiters = new Set();
    this.nextId = 1;
    this.onEvent = () => {};    // (kind, data) => void (pip changes etc.)
  }

  /** The URL whose host access decides whether a frame may report and be controlled (about:blank frames inherit an origin). */
  static frameUrl(sender) {
    const o = sender && typeof sender.origin === 'string' && sender.origin !== 'null' ? sender.origin : null;
    return o || (sender && typeof sender.url === 'string' ? sender.url : '');
  }

  /**
   * Whether a port's frame still has host access. Until the grants were read once (worker start) access is unknown,
   * so the frame is given the benefit of the doubt; `revalidate()` runs right after the first read.
   */
  frameGranted(rec) {
    if (!this.grants || !this.grants.loaded) return true;
    return this.grants.access(rec.url) === 'granted';
  }

  /** runtime.onConnect handler. Only our own content scripts in normal tabs, on frames with host access, are accepted. */
  accept(port, ownId) {
    if (port.name !== PORT_NAME) return false;
    const s = port.sender || {};
    if (s.id !== ownId || !s.tab || typeof s.tab.id !== 'number' || s.tab.incognito) { port.disconnect(); return true; }
    const tabId = s.tab.id;
    const frameId = typeof s.frameId === 'number' ? s.frameId : 0;
    const id = `${tabId}:${frameId}`;
    const rec = {
      port, tabId, frameId, url: MediaHub.frameUrl(s),
      bucket: new TokenBucket({ rate: LIMITS.contentMsgPerSec, burst: LIMITS.contentMsgPerSec, clock: this.clock }),
      pending: new Map(),
    };
    // A page whose access was removed keeps its (old) script until it reloads; it must not report or be controlled.
    if (!this.frameGranted(rec)) { try { port.disconnect(); } catch { /* gone */ } return true; }
    const old = this.ports.get(id);
    if (old) this.dropPort(id, old, false);
    this.ports.set(id, rec);
    port.onMessage.addListener((m) => this.onPortMessage(rec, m));
    port.onDisconnect.addListener(() => { if (this.ports.get(id) === rec) this.dropPort(id, rec, true); });
    for (const w of [...this.portWaiters]) if (w.tabId === tabId && w.frameId === frameId) { this.portWaiters.delete(w); w.resolve(true); }
    return true;
  }

  dropPort(id, rec, clearMedia) {
    this.ports.delete(id);
    for (const [, p] of rec.pending) { this.clock.clearTimeout(p.timer); p.resolve({ ok: false, error: { code: 'not_found', message: 'frame went away' } }); }
    rec.pending.clear();
    if (clearMedia) this.store.removeMediaForFrame(rec.tabId, rec.frameId);
  }

  /** Drops a frame that lost host access: its port is closed and its media entries leave the wire. */
  revoke(rec) {
    const id = `${rec.tabId}:${rec.frameId}`;
    if (this.ports.get(id) === rec) this.dropPort(id, rec, true);
    else this.store.removeMediaForFrame(rec.tabId, rec.frameId);
    try { rec.port.disconnect(); } catch { /* gone */ }
  }

  /** Re-checks every connected frame against the current grants (after a permission change and at start-up). */
  revalidate() {
    let dropped = 0;
    for (const rec of [...this.ports.values()]) if (!this.frameGranted(rec)) { this.revoke(rec); dropped++; }
    return dropped;
  }

  /** The frame's host access ('granted' | 'none' | 'blocked'), or null when no script runs there. */
  frameAccess(tabId, frameId = 0) {
    const rec = this.ports.get(`${tabId}:${frameId}`);
    if (!rec) return null;
    return this.frameGranted(rec) ? 'granted' : (this.grants ? this.grants.access(rec.url) : 'none');
  }

  /** Drops the port of one frame if its access is gone; true when it was dropped. */
  dropIfRevoked(tabId, frameId = 0) {
    const rec = this.ports.get(`${tabId}:${frameId}`);
    if (!rec || this.frameGranted(rec)) return false;
    this.revoke(rec);
    return true;
  }

  /** Resolves true as soon as `tabId:frameId` has a port, or false after `ms`. */
  waitForPort(tabId, frameId, ms) {
    if (this.hasPort(tabId, frameId)) return Promise.resolve(true);
    if (ms <= 0) return Promise.resolve(false);
    return new Promise((resolve) => {
      const w = { tabId, frameId, resolve: null, timer: null };
      w.resolve = (v) => { this.clock.clearTimeout(w.timer); resolve(v); };
      w.timer = this.clock.setTimeout(() => { this.portWaiters.delete(w); resolve(this.hasPort(tabId, frameId)); }, ms);
      this.portWaiters.add(w);
    });
  }

  onPortMessage(rec, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'res') {
      const p = rec.pending.get(m.id);
      if (!p) return;
      rec.pending.delete(m.id);
      this.clock.clearTimeout(p.timer);
      p.resolve(m.ok ? { ok: true, data: sanitizeResult(m.data) }
        : { ok: false, error: pageError(m.code) });
      return;
    }
    if (!this.frameGranted(rec)) { this.revoke(rec); return; } // access removed: nothing it says reaches the plugin
    if (!rec.bucket.take()) return; // a page flooding us; drop
    if (m.t === 'snap') {
      if (!Array.isArray(m.entries)) return;
      const entries = [];
      for (const e of m.entries.slice(0, 4)) {
        const s = sanitizeEntry(e, rec.tabId, rec.frameId);
        if (s) entries.push(this.resolveArt(s));
      }
      this.store.setFrameMedia(rec.tabId, rec.frameId, entries);
      return;
    }
    if (m.t === 'art' && typeof m.src === 'string' && sanitizeArtSrc(m.src) === m.src && !m.src.startsWith('http')) {
      this.images.putArtFromContent(m.src, m, this.getArtPx()).then((ref) => {
        if (!ref) return;
        // Re-resolve entries of that frame that point at this source.
        const cur = this.store.mediaForTab(rec.tabId).filter((e) => e.frameId === rec.frameId);
        if (cur.some((e) => e.artSrc === m.src)) this.store.setFrameMedia(rec.tabId, rec.frameId, cur.map((e) => this.resolveArt({ ...e })));
      }).catch(() => {});
      return;
    }
    if (m.t === 'evt' && typeof m.kind === 'string') {
      this.onEvent(m.kind, { tabId: rec.tabId, frameId: rec.frameId, ok: !!m.ok, code: typeof m.code === 'string' ? m.code.slice(0, 32) : undefined });
    }
  }

  /** Fills `art` from artSrc: https -> url for the plugin to fetch; blob:/data:/http -> re-encoded image ref. */
  resolveArt(e) {
    const src = e.artSrc;
    e.art = null;
    if (!src) return e;
    if (src.startsWith('https:')) { e.art = { url: src, img: null, type: e.artType || null }; return e; }
    const ref = this.images.artRef(src);
    if (ref) { e.art = { url: null, img: ref, type: this.images.get(ref)?.mime || null }; return e; }
    if (src.startsWith('http:') && this.grants.covers(src)) this.images.queueArtFetch(src, this.getArtPx());
    return e;
  }

  /** Re-resolves art for every entry (after the worker fetched http: art). */
  refreshArt() {
    const byFrame = new Map();
    for (const e of this.store.media.values()) {
      const k = `${e.tabId}:${e.frameId}`;
      if (!byFrame.has(k)) byFrame.set(k, []);
      byFrame.get(k).push(e);
    }
    for (const list of byFrame.values()) {
      const { tabId, frameId } = list[0];
      this.store.setFrameMedia(tabId, frameId, list.map((e) => this.resolveArt({ ...e })));
    }
  }

  hasPort(tabId, frameId = 0) { return this.ports.has(`${tabId}:${frameId}`); }

  /**
   * Sends a command to a frame's content script and awaits its reply, at most `timeoutMs` (default and cap:
   * LIMITS.contentCmdTimeoutMs; the caller passes what is left of the command's budget).
   */
  send(tabId, frameId, op, args, sub = null, timeoutMs = LIMITS.contentCmdTimeoutMs) {
    const rec = this.ports.get(`${tabId}:${frameId}`);
    if (!rec) return Promise.resolve({ ok: false, error: { code: 'not_found', message: 'no media script in that frame' } });
    const wait = Math.max(0, Math.min(LIMITS.contentCmdTimeoutMs, Number.isFinite(timeoutMs) ? timeoutMs : LIMITS.contentCmdTimeoutMs));
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = this.clock.setTimeout(() => {
        rec.pending.delete(id);
        resolve({ ok: false, error: { code: 'busy', message: 'the page did not answer (frozen or busy)' } });
      }, wait);
      rec.pending.set(id, { resolve, timer });
      try { rec.port.postMessage({ t: 'cmd', id, op, sub, args: args || {} }); }
      catch { this.clock.clearTimeout(timer); rec.pending.delete(id); resolve({ ok: false, error: { code: 'not_found', message: 'port closed' } }); }
    });
  }

  /** Parses a media key: "tab:frame" or "tab:frame:sub". */
  static parseKey(key) {
    if (typeof key !== 'string') return null;
    const m = /^(\d{1,10}):(\d{1,10})(?::(\d{1,6}))?$/.exec(key);
    if (!m) return null;
    return { tabId: Number(m[1]), frameId: Number(m[2]), sub: m[3] ? Number(m[3]) : null };
  }
}
