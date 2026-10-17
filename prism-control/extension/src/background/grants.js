// Host-permission grants and the media content-script registration (browser.md §3.4, §3.5).
//
// Media hooks only run on sites the user granted at runtime (optional host permissions):
//  - registerContentScripts() for future documents: media-main.js (MAIN, document_start) and
//    media-isolated.js (ISOLATED, document_start), in all frames, persisting across sessions;
//  - scripting.executeScript() for tabs already open when access is granted (hooks arrive late).

import { matchesPattern, originPattern, accessFor } from '../shared/domains.js';

export const SCRIPT_MAIN = 'prism-media-main';
export const SCRIPT_ISOLATED = 'prism-media-isolated';
const ALL_URLS = '<all_urls>';

export class Grants {
  constructor({ chrome, log = () => {} }) {
    this.chrome = chrome;
    this.log = log;
    this.origins = [];        // granted origin patterns usable for media (excludes <all_urls>)
    this.allUrls = false;     // <all_urls> granted (live preview)
    this.permissions = new Set();
    this.loaded = false;      // true once the granted origins were read at least once (before that, access is unknown)
  }

  async refresh() {
    const all = await this.chrome.permissions.getAll();
    const origins = (all.origins || []).filter((o) => typeof o === 'string');
    this.allUrls = origins.includes(ALL_URLS);
    this.origins = origins.filter((o) => o !== ALL_URLS && /^(https?|\*):\/\//.test(o));
    this.permissions = new Set(all.permissions || []);
    this.loaded = true;
    return this;
  }

  has(perm) { return this.permissions.has(perm); }
  access(url) { return accessFor(url, this.origins); }
  covers(url) { return this.origins.some((p) => matchesPattern(p, url)); }

  caps() {
    return {
      tabs: this.has('tabs'),
      favicon: this.has('favicon'),
      downloads: this.has('downloads') && !!this.chrome.downloads,
      tabGroups: this.has('tabGroups') && !!this.chrome.tabGroups,
      sessions: this.has('sessions') && !!this.chrome.sessions,
      scripting: this.has('scripting'),
      allUrls: this.allUrls,
      hostAccessRequest: typeof this.chrome.permissions.addHostAccessRequest === 'function',
      split: typeof this.chrome.tabs.unsplit === 'function' || typeof this.chrome.tabs.createSplit === 'function',
      grantedOrigins: [...this.origins],
    };
  }

  /** Brings the registered content scripts in line with the granted origins. */
  async syncContentScripts() {
    const s = this.chrome.scripting;
    let existing = [];
    try { existing = await s.getRegisteredContentScripts({ ids: [SCRIPT_MAIN, SCRIPT_ISOLATED] }); } catch { existing = []; }
    const have = new Map(existing.map((x) => [x.id, x]));
    if (this.origins.length === 0) {
      if (have.size) await s.unregisterContentScripts({ ids: [...have.keys()] }).catch((e) => this.log('unregister failed', String(e)));
      return;
    }
    const common = { matches: [...this.origins], allFrames: true, matchOriginAsFallback: true, runAt: 'document_start', persistAcrossSessions: true };
    const want = [
      { id: SCRIPT_MAIN, js: ['media-main.js'], world: 'MAIN', ...common },
      { id: SCRIPT_ISOLATED, js: ['media-isolated.js'], world: 'ISOLATED', ...common },
    ];
    const toUpdate = want.filter((w) => have.has(w.id));
    const toRegister = want.filter((w) => !have.has(w.id));
    try {
      if (toUpdate.length) await s.updateContentScripts(toUpdate);
      if (toRegister.length) await s.registerContentScripts(toRegister);
    } catch (e) {
      // A stale registration (e.g. an origin was revoked between calls) - start over once.
      this.log('content script sync failed, re-registering', String(e && e.message || e));
      await s.unregisterContentScripts({ ids: [SCRIPT_MAIN, SCRIPT_ISOLATED] }).catch(() => {});
      await s.registerContentScripts(want);
    }
  }

  /** Injects both scripts into an already-open tab (all frames). MAIN first so hooks exist before relaying. */
  async inject(tabId) {
    const s = this.chrome.scripting;
    await s.executeScript({ target: { tabId, allFrames: true }, files: ['media-main.js'], world: 'MAIN', injectImmediately: true });
    await s.executeScript({ target: { tabId, allFrames: true }, files: ['media-isolated.js'], world: 'ISOLATED', injectImmediately: true });
  }

  /**
   * Asks the user for access to a tab's site without a gesture: the Chrome 133+ toolbar request
   * (`permissions.addHostAccessRequest`). Falls back to the options page, where the user's click is the
   * gesture permissions.request() needs.
   */
  async requestHostAccess(tab) {
    const pattern = originPattern(tab.url || '');
    if (!pattern) return { via: 'none', reason: 'blocked' };
    if (this.covers(tab.url)) return { via: 'granted' };
    const p = this.chrome.permissions;
    if (typeof p.addHostAccessRequest === 'function') {
      try {
        await p.addHostAccessRequest({ tabId: tab.id });
        return { via: 'toolbar' };
      } catch (e) {
        this.log('addHostAccessRequest failed, falling back', String(e && e.message || e));
      }
    }
    const url = this.chrome.runtime.getURL(`options.html#grant=${encodeURIComponent(pattern)}`);
    await this.chrome.tabs.create({ url, windowId: tab.win, index: tab.idx + 1, active: true });
    return { via: 'options' };
  }
}
