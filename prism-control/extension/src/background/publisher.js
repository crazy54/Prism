// The publisher turns store changes into protocol messages:
//  - state.full on welcome / resync / privacy change,
//  - tabs.delta (windows, tabs, groups) and downloads.update coalesced to <= 10 Hz,
//  - media.update at <= 4 Hz per key, with urgent changes on the next tick (capped),
//  - img once per image id per session, always before the first message that references it.
// It mirrors exactly what the plugin holds (`sent`), so deltas only carry changed fields.

import { T, LIMITS } from '../shared/protocol.js';
import { utf8Length } from '../shared/util.js';
import { diffMaps, ignoreMediaPosition } from './diff.js';
import { TokenBucket } from './ratelimit.js';

const EMPTY = () => ({ windows: new Map(), tabs: new Map(), groups: new Map(), media: new Map(), downloads: new Map(), active: {}, focused: -1 });

export class Publisher {
  /**
   * @param {object} o
   * @param {() => object} o.buildViews  returns {windows, tabs, groups, media, downloads: Map, active, focused, privacy}
   * @param {(t:string, data:object) => boolean} o.post  sends one message; false if it could not
   * @param {{get(id:string): object|undefined}} o.images
   * @param {{now():number, setTimeout:Function, clearTimeout:Function}} o.clock
   */
  constructor({ buildViews, post, images, clock, log = () => {} }) {
    this.buildViews = buildViews;
    this.postRaw = post;
    this.images = images;
    this.clock = clock;
    this.log = log;
    this.active = false;
    this.want = { tabs: true, media: true, downloads: true, groups: true };
    this.sent = EMPTY();
    this.refs = null;                // cached ids of the images referenced by `sent` (null = rebuild on demand)
    this.sentImages = new Set();
    this.dirty = new Set();          // 'tabs' | 'downloads'
    this.flushTimer = null;
    this.lastFlushAt = -Infinity;
    this.mediaPending = new Map();   // key -> urgent:boolean
    this.mediaLastAt = new Map();    // key -> last send time
    this.mediaTimer = null;
    this.mediaTimerAt = Infinity;
    this.urgentBucket = new TokenBucket({ rate: LIMITS.mediaUrgentPerSec, burst: LIMITS.mediaUrgentPerSec, clock });
    this.stats = { full: 0, delta: 0, media: 0, downloads: 0, img: 0 };
  }

  /** Starts a session (after welcome): sends state.full. */
  start(want) {
    this.want = { tabs: true, media: true, downloads: true, groups: true, ...(want || {}) };
    this.active = true;
    this.sentImages.clear();
    this.sendFull();
  }

  stop() {
    this.active = false;
    this.sent = EMPTY();
    this.refs = null;
    this.sentImages.clear();
    this.dirty.clear();
    this.mediaPending.clear();
    this.mediaLastAt.clear();
    if (this.flushTimer) { this.clock.clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (this.mediaTimer) { this.clock.clearTimeout(this.mediaTimer); this.mediaTimer = null; this.mediaTimerAt = Infinity; }
  }

  /** Store change hook. */
  onStoreChange(kind, info) {
    if (!this.active) return;
    if (kind === 'media') { if (this.want.media) this.markMedia(info && info.key, !!(info && info.urgent)); return; }
    if (kind === 'downloads') { if (this.want.downloads) this.mark('downloads'); return; }
    if (kind === 'groups' && !this.want.groups) return;
    if (this.want.tabs || kind === 'groups') this.mark('tabs');
  }

  /** Everything may have changed (privacy level, grants): re-send in full at once. */
  invalidateAll() { if (this.active) this.sendFull(); }

  /** Re-derive tabs and media without a full resend (icons arrived, grants changed). */
  touchAll() {
    if (!this.active) return;
    this.mark('tabs');
    if (this.want.downloads) this.mark('downloads');
    if (this.want.media) for (const k of this.buildViews({ only: 'media' }).media.keys()) this.markMedia(k, false);
  }

  /**
   * True when `id` is an image the plugin may ask for again (img.get): one referenced by what it currently holds,
   * i.e. by the privacy-filtered objects we sent. The set is built once per change of `sent`, not per id.
   */
  isReferenced(id) {
    if (!this.refs) {
      const refs = new Set();
      for (const t of this.sent.tabs.values()) if (typeof t.icon === 'string' && t.icon.startsWith('fav:')) refs.add(t.icon);
      for (const m of this.sent.media.values()) if (m.art && typeof m.art.img === 'string') refs.add(m.art.img);
      for (const d of this.sent.downloads.values()) if (typeof d.icon === 'string') refs.add(d.icon);
      this.refs = refs;
    }
    return this.refs.has(id);
  }

  // ---- full ----
  sendFull() {
    if (!this.active) return;
    const v = this.views();
    const data = {
      privacy: v.privacy,
      ...(v.privacySettings ? { privacySettings: v.privacySettings } : {}),
      windows: [...v.windows.values()],
      tabs: [...v.tabs.values()],
      groups: [...v.groups.values()],
      media: [...v.media.values()],
      downloads: [...v.downloads.values()],
      activeByWindow: v.active,
      focusedWindow: v.focused,
    };
    this.sendImagesFor(data);
    const sentOk = this.postFull(data);
    if (!sentOk) return;
    this.sent = { windows: v.windows, tabs: v.tabs, groups: v.groups, media: v.media, downloads: v.downloads, active: v.active, focused: v.focused };
    this.refs = null;
    this.dirty.clear();
    this.mediaPending.clear();
    const now = this.clock.now();
    for (const k of v.media.keys()) this.mediaLastAt.set(k, now);
    this.lastFlushAt = now;
    this.stats.full++;
  }

  /** state.full, split when it would exceed the outbound cap: the remaining tabs follow as tabs.delta upserts. */
  postFull(data) {
    const budget = LIMITS.outMaxBytes - 8 * 1024;
    const whole = JSON.stringify(data);
    if (utf8Length(whole) <= budget) return this.postRaw(T.STATE_FULL, data);
    const tabs = data.tabs;
    const head = { ...data, tabs: [], more: true };
    let size = utf8Length(JSON.stringify(head));
    let i = 0;
    while (i < tabs.length) {
      const s = utf8Length(JSON.stringify(tabs[i])) + 1;
      if (size + s > budget) break;
      head.tabs.push(tabs[i]); size += s; i++;
    }
    if (!this.postRaw(T.STATE_FULL, head)) return false;
    return this.postChunks(T.TABS_DELTA, { upsert: tabs.slice(i), remove: [] }, 'upsert', true);
  }

  /** Posts `data`, splitting `field` across several messages if needed. `last` marks the final chunk. */
  postChunks(t, data, field, markEnd = false) {
    const budget = LIMITS.outMaxBytes - 8 * 1024;
    const items = data[field];
    const base = { ...data, [field]: [] };
    if (utf8Length(JSON.stringify(data)) <= budget) return this.postRaw(t, markEnd ? { ...data, more: false } : data);
    let chunk = [];
    let size = utf8Length(JSON.stringify(base));
    const flush = (final) => {
      const msg = { ...base, [field]: chunk };
      if (markEnd) msg.more = !final;
      const ok = this.postRaw(t, msg);
      chunk = [];
      size = utf8Length(JSON.stringify(base));
      // Non-chunked fields (remove lists, windows, groups) travel only once, in the first chunk.
      for (const k of Object.keys(base)) if (k !== field && Array.isArray(base[k])) base[k] = [];
      for (const k of ['windows', 'groups']) if (base[k] && !Array.isArray(base[k])) delete base[k];
      return ok;
    };
    for (const it of items) {
      const s = utf8Length(JSON.stringify(it)) + 1;
      if (chunk.length && size + s > budget) if (!flush(false)) return false;
      chunk.push(it); size += s;
    }
    return flush(true);
  }

  // ---- coalesced deltas ----
  mark(kind) {
    this.dirty.add(kind);
    if (this.flushTimer) return;
    const now = this.clock.now();
    const at = Math.max(now + 10, this.lastFlushAt + LIMITS.deltaIntervalMs);
    this.flushTimer = this.clock.setTimeout(() => { this.flushTimer = null; this.flush(); }, at - now);
  }

  flush() {
    if (!this.active || this.dirty.size === 0) return;
    const kinds = new Set(this.dirty);
    this.dirty.clear();
    this.lastFlushAt = this.clock.now();
    const v = this.views();
    if (kinds.has('tabs')) {
      const tabs = diffMaps(this.sent.tabs, v.tabs, 'id');
      const windows = diffMaps(this.sent.windows, v.windows, 'id');
      const groups = diffMaps(this.sent.groups, v.groups, 'id');
      const active = {};
      let activeChanged = false;
      for (const [w, t] of Object.entries(v.active)) if (this.sent.active[w] !== t) { active[w] = t; activeChanged = true; }
      for (const w of Object.keys(this.sent.active)) if (!(w in v.active) && v.windows.has(Number(w))) { active[w] = -1; activeChanged = true; }
      const focusChanged = v.focused !== this.sent.focused;
      const any = tabs.upsert.length || tabs.remove.length || windows.upsert.length || windows.remove.length
        || groups.upsert.length || groups.remove.length || activeChanged || focusChanged;
      if (any) {
        const data = { upsert: tabs.upsert, remove: tabs.remove };
        if (windows.upsert.length || windows.remove.length) data.windows = windows;
        if (groups.upsert.length || groups.remove.length) data.groups = groups;
        if (activeChanged) data.activeByWindow = active;
        if (focusChanged) data.focusedWindow = v.focused;
        this.sendImagesFor({ tabs: tabs.upsert });
        if (this.postChunks(T.TABS_DELTA, data, 'upsert')) {
          this.apply(this.sent.tabs, tabs, 'id');
          this.apply(this.sent.windows, windows, 'id');
          this.apply(this.sent.groups, groups, 'id');
          this.sent.active = { ...v.active };
          this.sent.focused = v.focused;
          this.stats.delta++;
        }
      }
    }
    if (kinds.has('downloads')) {
      const d = diffMaps(this.sent.downloads, v.downloads, 'id');
      if (d.upsert.length || d.remove.length) {
        this.sendImagesFor({ downloads: d.upsert });
        if (this.postChunks(T.DOWNLOADS_UPDATE, d, 'upsert')) { this.apply(this.sent.downloads, d, 'id'); this.stats.downloads++; }
      }
    }
  }

  /** Applies a diff to the mirror so it equals what the plugin now holds. */
  apply(map, d, idField) {
    this.refs = null;
    for (const u of d.upsert) {
      const prev = map.get(u[idField]);
      map.set(u[idField], prev ? { ...prev, ...u } : u);
    }
    for (const id of d.remove) map.delete(id);
  }

  // ---- media ----
  markMedia(key, urgent) {
    if (!key) return;
    if (urgent && !this.urgentBucket.take()) urgent = false;
    this.mediaPending.set(key, (this.mediaPending.get(key) || false) || urgent);
    this.scheduleMedia();
  }

  scheduleMedia() {
    if (this.mediaPending.size === 0) return;
    const now = this.clock.now();
    let due = Infinity;
    for (const [k, urgent] of this.mediaPending) {
      const last = this.mediaLastAt.get(k) ?? -Infinity;
      const at = urgent ? now + 10 : Math.max(now + 10, last + LIMITS.mediaIntervalMs);
      if (at < due) due = at;
    }
    if (this.mediaTimer && this.mediaTimerAt <= due) return;
    if (this.mediaTimer) this.clock.clearTimeout(this.mediaTimer);
    this.mediaTimerAt = due;
    this.mediaTimer = this.clock.setTimeout(() => { this.mediaTimer = null; this.mediaTimerAt = Infinity; this.flushMedia(); }, due - now);
  }

  flushMedia() {
    if (!this.active) return;
    const now = this.clock.now();
    const due = [];
    for (const [k, urgent] of this.mediaPending) {
      const last = this.mediaLastAt.get(k) ?? -Infinity;
      if (urgent || now - last >= LIMITS.mediaIntervalMs - 1) due.push(k);
    }
    if (due.length) {
      const v = this.views({ only: 'media' });   // media views only: never rebuild every tab view at 4 Hz
      const upsert = [];
      const remove = [];
      for (const k of due) {
        this.mediaPending.delete(k);
        const next = v.media.get(k);
        const prev = this.sent.media.get(k);
        if (!next) { if (prev) remove.push(k); continue; }
        if (!prev) { upsert.push(next); continue; }
        const d = diffMaps(new Map([[k, prev]]), new Map([[k, next]]), 'key', ignoreMediaPosition);
        if (d.upsert.length) upsert.push(d.upsert[0]);
      }
      if (upsert.length || remove.length) {
        this.sendImagesFor({ media: upsert });
        const d = { upsert, remove };
        if (this.postChunks(T.MEDIA_UPDATE, d, 'upsert')) {
          this.apply(this.sent.media, d, 'key');
          for (const u of upsert) this.mediaLastAt.set(u.key, now);
          for (const k of remove) this.mediaLastAt.delete(k);
          this.stats.media++;
        }
      }
    }
    this.scheduleMedia();
  }

  // ---- images ----
  /** Sends every image referenced by tabs/media/downloads in `data` that the plugin hasn't seen. */
  sendImagesFor(data) {
    const refs = new Set();
    for (const t of data.tabs || []) if (t.icon && t.icon.startsWith('fav:')) refs.add(t.icon);
    for (const m of data.media || []) if (m.art && m.art.img) refs.add(m.art.img);
    for (const d of data.downloads || []) if (d.icon) refs.add(d.icon);
    for (const ref of refs) this.sendImage(ref);
  }

  sendImage(ref, force = false) {
    if (!force && this.sentImages.has(ref)) return true;
    const img = this.images.get(ref);
    if (!img) return false;
    if (this.postRaw(T.IMG, img)) { this.sentImages.add(ref); this.stats.img++; return true; }
    return false;
  }

  /** Builds the filtered views, honouring `want`. `opts.only: 'media'` builds the media slice only. */
  views(opts) {
    const v = opts ? this.buildViews(opts) : this.buildViews();
    if (!this.want.tabs) { v.tabs = new Map(); v.windows = new Map(); v.active = {}; }
    if (!this.want.groups) v.groups = new Map();
    if (!this.want.media) v.media = new Map();
    if (!this.want.downloads) v.downloads = new Map();
    return v;
  }
}
