// Downloads (optional `downloads` permission; browser.md §3.8).
// onChanged does not fire for bytesReceived / estimatedEndTime, so poll at 1 Hz while any is active.

import { LIMITS } from '../shared/protocol.js';

const KEEP_RECENT = 5;

export class DownloadsTracker {
  constructor({ chrome, store, images, clock, log = () => {} }) {
    this.chrome = chrome;
    this.store = store;
    this.images = images;
    this.clock = clock;
    this.log = log;
    this.timer = null;
    this.bound = false;
  }

  get api() { return this.chrome.downloads; }
  available() { return !!this.api && typeof this.api.search === 'function'; }

  /** Registers listeners (call at worker start-up when available, and again after the grant). */
  bind() {
    if (this.bound || !this.available()) return;
    this.bound = true;
    const d = this.api;
    d.onCreated.addListener((item) => { this.store.upsertDownload(item); this.trim(); this.ensurePoll(); });
    d.onChanged.addListener((delta) => this.onChanged(delta));
    d.onErased.addListener((id) => this.store.removeDownload(id));
  }

  async rebuild() {
    if (!this.available()) { this.store.replaceDownloads([]); return; }
    const [active, recent] = await Promise.all([
      this.api.search({ state: 'in_progress' }),
      this.api.search({ orderBy: ['-startTime'], limit: KEEP_RECENT }),
    ]);
    const byId = new Map();
    for (const d of [...recent, ...active]) byId.set(d.id, d);
    this.store.replaceDownloads([...byId.values()]);
    for (const d of byId.values()) this.loadIcon(d.id);
    this.ensurePoll();
  }

  async onChanged(delta) {
    if (!this.store.downloads.has(delta.id)) {
      const [item] = await this.api.search({ id: delta.id });
      if (item) this.store.upsertDownload(item);
      this.trim();
    } else {
      const patch = {};
      if (delta.state) patch.state = delta.state.current;
      if (delta.paused) patch.paused = !!delta.paused.current;
      if (delta.canResume) patch.canResume = !!delta.canResume.current;
      if (delta.danger) patch.danger = delta.danger.current;
      if (delta.error) patch.error = delta.error.current || null;
      if (delta.filename) patch.filename = delta.filename.current || '';
      if (delta.exists) patch.exists = delta.exists.current !== false;
      if (delta.totalBytes) patch.total = delta.totalBytes.current > 0 ? delta.totalBytes.current : null;
      if (delta.mime) patch.mime = delta.mime.current || '';
      if (delta.finalUrl) patch.url = delta.finalUrl.current || '';
      this.store.patchDownload(delta.id, patch);
      if (delta.state && delta.state.current === 'complete') this.refreshOne(delta.id);
    }
    if (delta.filename) this.loadIcon(delta.id);
    this.ensurePoll();
  }

  async refreshOne(id) {
    try {
      const [item] = await this.api.search({ id });
      if (item) this.store.upsertDownload(item);
    } catch { /* gone */ }
  }

  /** Keeps every active download plus the most recent few. */
  trim() {
    const list = [...this.store.downloads.values()];
    const done = list.filter((d) => d.state !== 'in_progress').sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    for (const d of done.slice(KEEP_RECENT)) this.store.removeDownload(d.id);
  }

  ensurePoll() {
    const active = [...this.store.downloads.values()].some((d) => d.state === 'in_progress' && !d.paused);
    if (active && !this.timer) this.timer = this.clock.setTimeout(() => this.poll(), LIMITS.downloadsPollMs);
  }

  async poll() {
    this.timer = null;
    if (!this.available()) return;
    try {
      const items = await this.api.search({ state: 'in_progress' });
      for (const it of items) {
        const prev = this.store.downloads.get(it.id);
        const eta = it.estimatedEndTime ? Date.parse(it.estimatedEndTime) : NaN;
        const patch = { bytes: it.bytesReceived || 0, total: it.totalBytes > 0 ? it.totalBytes : null, etaAt: Number.isFinite(eta) ? eta : null, paused: !!it.paused };
        if (!prev) this.store.upsertDownload(it);
        else if (prev.bytes !== patch.bytes || prev.total !== patch.total || prev.etaAt !== patch.etaAt || prev.paused !== patch.paused) this.store.patchDownload(it.id, patch);
      }
    } catch (e) { this.log('downloads poll failed', String(e)); }
    this.ensurePoll();
  }

  async loadIcon(id) {
    const d = this.store.downloads.get(id);
    if (!d || !d.filename || typeof this.api.getFileIcon !== 'function') return;
    try {
      const url = await this.api.getFileIcon(id, { size: 32 });
      if (!url) return;
      const ref = await this.images.putFileIcon(url);
      if (ref) this.store.patchDownload(id, { iconRef: ref });
    } catch { /* no icon */ }
  }

  stop() { if (this.timer) { this.clock.clearTimeout(this.timer); this.timer = null; } }
}
