// Image transport (browser.md §9.4): favicons, re-encoded artwork and download file icons.
// Images are content-addressed (`fav:<hash>`, `art:<hash>`, `file:<hash>`, hash = SHA-1 truncated to
// 16 hex) and travel once per session as `img` messages; the publisher sends them before the first
// message that references them.

import { LIMITS } from '../shared/protocol.js';
import { bytesToBase64, base64ToBytes, hash16, sniffImage, clamp } from '../shared/util.js';
import { parseUrl } from '../shared/domains.js';

const MAX_STORE_BYTES = 8 * 1024 * 1024;
export const MISS_RETRY_MS = 30_000;

/**
 * Browser codec built on createImageBitmap + OffscreenCanvas (both exist in service workers).
 * Tests inject a fake with the same two methods.
 */
export const browserCodec = {
  /** Re-encodes to exactly px x px PNG; nearest-neighbor when upscaling (the deck smooths anyway). */
  async iconPng(bytes, px) {
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(px, px);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = bmp.width < px || bmp.height < px ? false : true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, px, px);
    bmp.close?.();
    const blob = await c.convertToBlob({ type: 'image/png' });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', w: px, h: px };
  },
  /** Fits within maxW x maxH (contain), JPEG unless the source has alpha worth keeping, under maxBytes. */
  async fit(bytes, maxW, maxH, maxBytes, prefer = 'image/jpeg') {
    const bmp = await createImageBitmap(new Blob([bytes]));
    const s = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    let q = 0.85;
    for (let i = 0; i < 6; i++) {
      const blob = await c.convertToBlob({ type: prefer, quality: q });
      const out = new Uint8Array(await blob.arrayBuffer());
      if (out.length <= maxBytes) return { bytes: out, mime: prefer, w, h };
      if (prefer === 'image/png') prefer = 'image/jpeg';
      else q -= 0.15;
    }
    return null;
  },
};

export class ImageStore {
  constructor({ fetchFavicon, fetchUrl, canFetch = () => false, now = () => Date.now(), defer = null, codec = browserCodec, subtle = globalThis.crypto.subtle, onReady = () => {}, log = () => {} }) {
    this.fetchFavicon = fetchFavicon;   // (pageUrl, px) => Promise<Uint8Array|null>
    this.fetchUrl = fetchUrl;           // (url) => Promise<Uint8Array|null>  (host-permitted URLs only)
    this.canFetch = canFetch;           // (url) => true when we hold host permission for it
    this.now = now;
    this.defer = defer;                 // (fn, ms) => void: one early retry after a miss
    this.codec = codec;
    this.subtle = subtle;
    this.onReady = onReady;
    this.log = log;
    this.images = new Map();            // ref -> {id, mime, w, h, b64}, insertion order = LRU
    this.bytes = 0;
    this.favPx = LIMITS.favDefaultPx;
    this.favByKey = new Map();          // `${px}|${key}` -> {ref|null, at}; misses are retried after MISS_RETRY_MS
    this.favPending = new Map();
    this.favAttempts = new Map();
    this.defaultHash = undefined;       // hash of the browser's default globe at favPx
    this.artBySrc = new Map();          // src -> ref
    this.queue = [];
    this.running = 0;
  }

  setFaviconPx(px) {
    const n = clamp(Number.isFinite(px) ? Math.round(px) : LIMITS.favDefaultPx, LIMITS.favMinPx, LIMITS.favMaxPx);
    if (n !== this.favPx) { this.favPx = n; this.defaultHash = undefined; }
  }

  get(ref) {
    const img = this.images.get(ref);
    if (!img) return undefined;
    this.images.delete(ref); this.images.set(ref, img); // touch
    return img;
  }

  has(ref) { return this.images.has(ref); }

  async put(prefix, bytes, mime, w, h) {
    const ref = `${prefix}:${await hash16(bytes, this.subtle)}`;
    if (!this.images.has(ref)) {
      const img = { id: ref, mime, w, h, b64: bytesToBase64(bytes) };
      this.images.set(ref, img);
      this.bytes += img.b64.length;
      while (this.bytes > MAX_STORE_BYTES && this.images.size > 1) {
        const [oldRef, old] = this.images.entries().next().value;
        this.images.delete(oldRef);
        this.bytes -= old.b64.length;
      }
    }
    return ref;
  }

  // ---- favicons ----
  faviconKey(tab) {
    const u = parseUrl(tab.url || '');
    if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
    return `${this.favPx}|${tab.favIconUrl || u.origin}`;
  }

  /** Synchronous lookup: the ref if known, else null (and a fetch is queued). */
  iconFor(tab) {
    const key = this.faviconKey(tab);
    if (!key) return null;
    const hit = this.favByKey.get(key);
    if (hit) {
      if (hit.ref && this.images.has(hit.ref)) return hit.ref;
      // A miss (Chrome's favicon database often learns a new page's icon a moment after load) or an
      // evicted image: look again, but not more than every MISS_RETRY_MS.
      if (!hit.ref && this.now() - hit.at < MISS_RETRY_MS) return null;
      this.favByKey.delete(key);
    }
    if (!this.favPending.has(key)) {
      this.favPending.set(key, true);
      const attempt = (this.favAttempts.get(key) || 0) + 1;
      this.favAttempts.set(key, attempt);
      if (this.favAttempts.size > 512) this.favAttempts.delete(this.favAttempts.keys().next().value);
      this.enqueue(() => this.loadFavicon(key, tab.url, tab.favIconUrl, attempt));
    }
    return null;
  }

  async loadFavicon(key, pageUrl, favIconUrl, attempt = 1) {
    let ref = null;
    try {
      const px = this.favPx;
      if (this.defaultHash === undefined) {
        const d = await this.fetchFavicon('https://prism-control-default.invalid/', px);
        this.defaultHash = d ? await hash16(d, this.subtle) : null;
      }
      let raw = await this.fetchFavicon(pageUrl, px);
      if (raw && this.defaultHash && (await hash16(raw, this.subtle)) === this.defaultHash) raw = null;
      if (!raw && typeof favIconUrl === 'string' && favIconUrl.startsWith('data:image/')) raw = dataUrlBytes(favIconUrl, 64 * 1024);
      // Fallback: the page's own favicon URL, only where we hold host permission (no CORS then).
      if (!raw && typeof favIconUrl === 'string' && /^https?:/.test(favIconUrl) && this.canFetch(favIconUrl)) raw = await this.fetchUrl(favIconUrl);
      if (raw && sniffImage(raw)) {
        const out = await this.codec.iconPng(raw, px);
        if (out && out.bytes.length <= LIMITS.favMaxBytes) ref = await this.put('fav', out.bytes, out.mime, out.w, out.h);
      }
    } catch (e) {
      this.log('favicon failed', String(e && e.message || e));
    }
    this.favPending.delete(key);
    this.favByKey.set(key, { ref, at: this.now() });
    if (this.favByKey.size > 512) this.favByKey.delete(this.favByKey.keys().next().value);
    if (ref) this.onReady('fav', ref);
    else if (attempt === 1 && this.defer) {
      this.defer(() => { const h = this.favByKey.get(key); if (h && !h.ref) { this.favByKey.delete(key); this.onReady('fav-retry'); } }, 2500);
    }
  }

  // ---- artwork ----
  /** Artwork bytes re-encoded by a content script (blob:/data: sources). Validated again here. */
  async putArtFromContent(src, msg, maxPx) {
    if (typeof msg.b64 !== 'string' || msg.b64.length > Math.ceil(LIMITS.artMaxBytes * 4 / 3) + 4) return null;
    let bytes;
    try { bytes = base64ToBytes(msg.b64); } catch { return null; }
    const mime = sniffImage(bytes);
    if (mime !== 'image/png' && mime !== 'image/jpeg') return null;
    const w = Math.round(msg.w), h = Math.round(msg.h);
    if (!(w >= 1 && h >= 1 && w <= maxPx && h <= maxPx)) return null;
    const ref = await this.put('art', bytes, mime, w, h);
    this.rememberArt(src, ref);
    return ref;
  }

  artRef(src) { const r = this.artBySrc.get(src); return r && this.images.has(r) ? r : null; }

  rememberArt(src, ref) {
    this.artBySrc.set(src, ref);
    if (this.artBySrc.size > 64) this.artBySrc.delete(this.artBySrc.keys().next().value);
  }

  /** http: artwork on an origin we hold host permission for: fetch and re-encode in the worker. */
  queueArtFetch(src, maxPx) {
    if (this.artBySrc.has(src) || this.favPending.has('art|' + src)) return;
    this.favPending.set('art|' + src, true);
    this.enqueue(async () => {
      let ref = null;
      try {
        const raw = await this.fetchUrl(src);
        if (raw && sniffImage(raw)) {
          const out = await this.codec.fit(raw, maxPx, maxPx, LIMITS.artMaxBytes);
          if (out) ref = await this.put('art', out.bytes, out.mime, out.w, out.h);
        }
      } catch (e) { this.log('art fetch failed', String(e && e.message || e)); }
      this.favPending.delete('art|' + src);
      if (ref) { this.rememberArt(src, ref); this.onReady('art', ref); }
      else this.artBySrc.set(src, null);
    });
  }

  /** A data: URL file icon from downloads.getFileIcon. */
  async putFileIcon(dataUrl) {
    const raw = dataUrlBytes(dataUrl, 64 * 1024);
    if (!raw || !sniffImage(raw)) return null;
    const out = await this.codec.iconPng(raw, 32);
    return out && out.bytes.length <= LIMITS.favMaxBytes ? this.put('file', out.bytes, out.mime, out.w, out.h) : null;
  }

  enqueue(job) {
    this.queue.push(job);
    this.pump();
  }

  pump() {
    while (this.running < 4 && this.queue.length) {
      const job = this.queue.shift();
      this.running++;
      Promise.resolve().then(job).catch(() => {}).finally(() => { this.running--; this.pump(); });
    }
  }
}

/** Decodes a base64 data: URL (images only), refusing anything larger than `max` bytes. */
export function dataUrlBytes(url, max) {
  const m = /^data:(image\/[a-z0-9.+-]+)?(;[^,]*)?,(.*)$/is.exec(url);
  if (!m) return null;
  const isB64 = /;base64/i.test(m[2] || '');
  if (!isB64) return null;
  if (m[3].length > Math.ceil(max * 4 / 3) + 4) return null;
  try { return base64ToBytes(m[3]); } catch { return null; }
}
