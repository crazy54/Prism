// Live tab preview (browser.md §3.3): captureVisibleTab of a window's active tab at <= 2 fps,
// downscaled to <= 360x180 JPEG <= 40 KB. Needs the optional <all_urls> grant and privacy `full`.
// A subscription expires after 30 s unless renewed, so a forgotten widget never keeps capturing.

import { ERR, LIMITS, T } from '../shared/protocol.js';
import { bytesToBase64 } from '../shared/util.js';
import { hostOf, hostInList } from '../shared/domains.js';
import { CmdError } from './commands.js';
import { dataUrlBytes } from './images.js';

export class Preview {
  constructor({ chrome, store, grants, clock, codec, post, privacyContext, log = () => {} }) {
    this.chrome = chrome;
    this.store = store;
    this.grants = grants;
    this.clock = clock;
    this.codec = codec;
    this.post = post;
    this.privacyContext = privacyContext;
    this.log = log;
    this.sub = null;
    this.timer = null;
    this.busy = false;
  }

  subscribe({ windowId, fps, w, h }) {
    if (fps === 0) { this.stop(); return { fps: 0 }; }
    if (!this.grants.allUrls) throw new CmdError(ERR.NO_HOST_PERMISSION, 'grant "Live preview" (all sites) in the extension options');
    if (this.privacyContext().level !== 'full') throw new CmdError(ERR.PRIVACY_BLOCKED, 'preview is off while streamer-safe is on');
    const interval = Math.round(1000 / Math.min(fps, LIMITS.previewMaxFps));
    this.sub = { windowId, interval, w, h, until: this.clock.now() + LIMITS.previewTtlMs };
    if (!this.timer) this.schedule(0);
    return { fps: 1000 / interval, w, h, expiresInMs: LIMITS.previewTtlMs };
  }

  stop() {
    this.sub = null;
    if (this.timer) { this.clock.clearTimeout(this.timer); this.timer = null; }
  }

  schedule(ms) { this.timer = this.clock.setTimeout(() => { this.timer = null; this.tick(); }, ms); }

  async tick() {
    const s = this.sub;
    if (!s) return;
    if (this.clock.now() > s.until) { this.stop(); return; }
    const start = this.clock.now();
    try { if (!this.busy) await this.capture(s); } catch (e) { this.log('preview failed', String(e && e.message || e)); }
    if (this.sub === s) this.schedule(Math.max(0, s.interval - (this.clock.now() - start)));
  }

  /**
   * The tab the window really shows now, straight from the browser (the store may lag a tab switch by an event),
   * or null when it must not be captured: always-hidden, or the level is no longer full.
   */
  async visibleTab(windowId) {
    let list;
    try { list = await this.chrome.tabs.query({ active: true, windowId }); } catch { return null; }
    const t = Array.isArray(list) ? list[0] : null;
    if (!t || typeof t.id !== 'number') return null;
    const pctx = this.privacyContext();
    if (pctx.level !== 'full') return null;
    const host = t.url ? hostOf(t.url) : null;
    if (host && hostInList(host, pctx.alwaysHidden)) return null;
    return t;
  }

  async capture(s) {
    const pctx = this.privacyContext();
    if (pctx.level !== 'full') { this.stop(); return; }
    const windowId = s.windowId ?? (this.store.focusedWindow !== -1 ? this.store.focusedWindow : undefined);
    const byWin = this.store.activeByWindow();
    const tab = windowId !== undefined ? this.store.tabs.get(byWin[windowId]) : this.store.activeTab();
    if (!tab) return;
    const host = tab.url ? hostOf(tab.url) : null;
    if (host && hostInList(host, pctx.alwaysHidden)) return;
    const win = this.store.windows.get(tab.win);
    if (win && win.state === 'minimized') return;
    this.busy = true;
    try {
      // captureVisibleTab grabs whatever the window shows at that instant: check the real active tab right before
      // and right after, and drop the frame if it changed, is always-hidden, or streamer-safe turned on meanwhile.
      const before = await this.visibleTab(tab.win);
      if (!before || before.id !== tab.id) return;
      const dataUrl = await this.chrome.tabs.captureVisibleTab(tab.win, { format: 'jpeg', quality: 70 });
      const after = await this.visibleTab(tab.win);
      if (!after || after.id !== tab.id || (after.url || '') !== (before.url || '')) return;
      const raw = dataUrlBytes(dataUrl, 8 * 1024 * 1024);
      if (!raw) return;
      const out = await this.codec.fit(raw, s.w, s.h, LIMITS.previewMaxBytes, 'image/jpeg');
      if (!out || this.sub !== s || this.privacyContext().level !== 'full') return;
      this.post(T.PREVIEW_FRAME, { windowId: tab.win, tabId: tab.id, mime: out.mime, w: out.w, h: out.h, b64: bytesToBase64(out.bytes) });
    } finally {
      this.busy = false;
    }
  }
}
