// Prism Control: ISOLATED-world relay. Injected at document_start, in all frames, on granted sites.
//  - Relays media snapshots from media-main.js to the service worker over a runtime port (opened
//    lazily, once the frame has media, or when the worker asks for it: the page dial on a page without
//    media), and commands back.
//  - Re-encodes blob:/data: artwork (which never leaves the browser as a URL) to JPEG/PNG <= 288 px.
//  - Arms the one-shot key listener for picture-in-picture (F24 unless the plugin names another F13-F24 key):
//    Prism Control sends a real key press (SendInput), which grants transient user activation; we then ask the
//    MAIN world to enter PiP.
//  - Scrolls the page for the page dial (top frame only).
// MAIN-world messages are untrusted page data: they are size-capped and never cause privileged work
// other than relaying, re-encoding images we are pointed at, and nothing is ever evaluated.
(() => {
  'use strict';
  const prev = globalThis.__prismIsolatedV1;
  if (prev && prev.alive()) { prev.reconnect(); return; }

  const OUT = 'prismctl:v1:m2i';
  const IN = 'prismctl:v1:i2m';
  const PORT = 'prism-media';
  const ART_PX = 288;
  const ART_BYTES = 96 * 1024;
  const ARM_MS = 3000;
  const TOP = window === window.top;

  let port = null;
  let hadMedia = false;
  let nextId = 1;
  const pending = new Map();      // main id -> {swId, timer, pipEvent}
  let armed = null;               // {until, sub, key}
  let swallowKeyUpUntil = 0;
  let swallowKey = null;
  let droppedAt = 0;              // when the worker last closed our port (a restart, or this site's access was removed)
  const art = new Map();          // src -> token ('blob:..' | 'data:#hash' | 'failed')

  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; } };

  /** Opens the port. Right after the worker closed it, only an explicit request (forced) reopens it. */
  function ensurePort(forced = false) {
    if (port || !alive()) return port;
    if (!forced && Date.now() - droppedAt < 1000) return null;
    try { port = chrome.runtime.connect({ name: PORT }); } catch { port = null; return null; }
    port.onMessage.addListener(onSw);
    port.onDisconnect.addListener(() => { port = null; droppedAt = Date.now(); });
    return port;
  }

  function toSw(msg) {
    const p = ensurePort();
    if (!p) return;
    try { p.postMessage(msg); } catch { port = null; }
  }

  function toMain(obj) {
    document.dispatchEvent(new CustomEvent(IN, { detail: JSON.stringify(obj) }));
  }

  function requestSnap() { toMain({ id: 0, op: 'snap' }); }

  globalThis.__prismIsolatedV1 = { alive, reconnect: () => { if (hadMedia || port) ensurePort(true); requestSnap(); } };

  // ---------------------------------------------------------------- artwork
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function sizeOf(a) {
    let best = 0;
    for (const s of String(a.sizes || '').split(/\s+/)) {
      if (s === 'any') return 4096;
      const m = /^(\d+)x(\d+)$/i.exec(s);
      if (m) best = Math.max(best, Math.min(+m[1], +m[2]));
    }
    return best;
  }

  /** The smallest artwork >= ART_PX, else the largest; unknown sizes rank in between. */
  function pickArt(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const scored = list.filter((a) => a && typeof a.src === 'string').map((a) => ({ a, s: sizeOf(a) }));
    if (!scored.length) return null;
    const big = scored.filter((x) => x.s >= ART_PX).sort((x, y) => x.s - y.s);
    if (big.length) return big[0].a;
    return scored.sort((x, y) => y.s - x.s)[0].a;
  }

  function artToken(src) {
    if (src.startsWith('blob:')) return src.length <= 2048 ? src : null;
    if (src.startsWith('data:image/')) return `data:#${hashStr(src)}`;
    return null;
  }

  async function encodeArt(src, token) {
    try {
      const r = await fetch(src);
      const blob = await r.blob();
      if (blob.size > 8 * 1024 * 1024) throw new Error('too big');
      const bmp = await createImageBitmap(blob);
      const s = Math.min(1, ART_PX / bmp.width, ART_PX / bmp.height);
      const w = Math.max(1, Math.round(bmp.width * s));
      const h = Math.max(1, Math.round(bmp.height * s));
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      bmp.close && bmp.close();
      let out = null;
      for (const q of [0.85, 0.7, 0.55, 0.4]) {
        const b = await c.convertToBlob({ type: 'image/jpeg', quality: q });
        if (b.size <= ART_BYTES) { out = b; break; }
      }
      if (!out) throw new Error('could not fit');
      const bytes = new Uint8Array(await out.arrayBuffer());
      let bin = '';
      for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
      art.set(src, token);
      toSw({ t: 'art', src: token, mime: 'image/jpeg', w, h, b64: btoa(bin) });
    } catch {
      art.set(src, 'failed');
    }
  }

  function processEntries(entries) {
    const out = [];
    for (const e of entries.slice(0, 4)) {
      if (!e || typeof e !== 'object') continue;
      const a = pickArt(e.artwork);
      delete e.artwork;
      e.artSrc = null;
      e.artType = null;
      if (a) {
        const src = a.src;
        if (/^https?:/i.test(src)) { e.artSrc = src.slice(0, 2048); e.artType = a.type || null; }
        else {
          const token = artToken(src);
          if (token) {
            const known = art.get(src);
            if (known !== 'failed') e.artSrc = token;
            if (known === undefined) { art.set(src, 'pending'); encodeArt(src, token); if (art.size > 32) art.delete(art.keys().next().value); }
          }
        }
      }
      out.push(e);
    }
    return out;
  }

  // ---------------------------------------------------------------- MAIN -> SW
  document.addEventListener(OUT, (ev) => {
    if (typeof ev.detail !== 'string' || ev.detail.length > 256 * 1024) return;
    let m;
    try { m = JSON.parse(ev.detail); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'snap' && Array.isArray(m.entries)) {
      if (!m.entries.length && !hadMedia && !port) return;   // nothing to report, don't wake the worker
      if (m.entries.length) hadMedia = true;
      toSw({ t: 'snap', entries: processEntries(m.entries) });
    } else if (m.t === 'res' && typeof m.id === 'number') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (p.pipEvent) toSw({ t: 'evt', kind: 'pip', ok: !!m.ok, code: m.ok ? null : String(m.code || 'busy') });
      else toSw({ t: 'res', id: p.swId, ok: !!m.ok, data: m.ok ? m.data : undefined, code: m.code, message: m.message });
    }
  });

  // ---------------------------------------------------------------- SW -> MAIN
  function reply(swId, ok, data, code, message) {
    toSw({ t: 'res', id: swId, ok, data, code, message });
  }

  function forward(swId, op, sub, args, pipEvent = false) {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      if (pipEvent) toSw({ t: 'evt', kind: 'pip', ok: false, code: 'busy' });
      else reply(swId, false, undefined, 'busy', 'media hook did not answer');
    }, 1200);
    pending.set(id, { swId, timer, pipEvent });
    toMain({ id, op, sub, args });
  }

  function onSw(m) {
    if (!m || m.t !== 'cmd') return;
    const a = m.args || {};
    if (m.op === 'scroll') {
      if (!TOP) { reply(m.id, false, undefined, 'unsupported', 'not the top frame'); return; }
      try { reply(m.id, true, scroll(a)); } catch (e) { reply(m.id, false, undefined, 'busy', String(e && e.message || e)); }
      return;
    }
    if (m.op === 'pip' && a.via === 'gesture' && a.mode !== 'exit') {
      // The plugin presses this key (F13-F24, default F24): it picks one no other app registered as a hotkey.
      const key = typeof a.pipKey === 'string' && PIP_KEY.test(a.pipKey) ? a.pipKey : 'F24';
      armed = { until: Date.now() + ARM_MS, sub: m.sub ?? null, key };
      reply(m.id, true, { armed: true, key, expiresInMs: ARM_MS });
      return;
    }
    forward(m.id, m.op, m.sub ?? null, a);
  }

  const PIP_KEY = /^F(1[3-9]|2[0-4])$/;
  /** F13 = keyCode 124 ... F24 = 135. */
  const isKey = (e, name) => e.key === name || e.code === name || e.keyCode === 111 + Number(name.slice(1));

  // One-shot key (F24 by default) -> picture-in-picture. Only trusted key events grant activation, so only those count.
  window.addEventListener('keydown', (e) => {
    if (!armed || !e.isTrusted) return;
    if (!isKey(e, armed.key)) return;
    const a = armed;
    armed = null;
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowKeyUpUntil = Date.now() + 1000;
    swallowKey = a.key;
    if (Date.now() > a.until) { toSw({ t: 'evt', kind: 'pip', ok: false, code: 'expired' }); return; }
    forward(0, 'pip.now', a.sub, {}, true);   // synchronous dispatch: MAIN calls requestPictureInPicture now
  }, true);
  window.addEventListener('keyup', (e) => {
    if (Date.now() < swallowKeyUpUntil && swallowKey && isKey(e, swallowKey)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- scrolling
  let cachedScroller = null;
  let cachedAt = 0;
  function canScroll(el) {
    if (!el || el.scrollHeight <= el.clientHeight + 4) return false;
    if (el === document.scrollingElement) return true;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  }
  function scroller() {
    const se = document.scrollingElement || document.documentElement;
    if (canScroll(se) && getComputedStyle(document.body || se).overflowY !== 'hidden') return se;
    if (cachedScroller && cachedScroller.isConnected && Date.now() - cachedAt < 5000 && canScroll(cachedScroller)) return cachedScroller;
    let best = se;
    let area = 0;
    const all = document.querySelectorAll('body *');
    for (let k = 0; k < all.length && k < 5000; k++) {
      const el = all[k];
      if (!canScroll(el)) continue;
      const a = el.clientWidth * el.clientHeight;
      if (a > area) { best = el; area = a; }
    }
    cachedScroller = best;
    cachedAt = Date.now();
    return best;
  }
  function scroll({ dy = 0, dx = 0, smooth = true }) {
    const el = scroller();
    const before = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    el.scrollBy({ top: dy, left: dx, behavior: smooth ? 'smooth' : 'instant' });
    const after = Math.max(0, Math.min(max, before + dy));
    return { scrolled: Math.round(after - before), atTop: after <= 0, atBottom: after >= max - 1 };
  }

  // ---------------------------------------------------------------- worker restarts, ports on demand
  // `prism.reconnect` after a worker restart re-opens the port of frames with media. With `open: true` (sent to
  // one frame, e.g. by the page dial on a page without media) the port opens even without media.
  chrome.runtime.onMessage.addListener((m, sender) => {
    if (sender.id !== chrome.runtime.id || !m || m.t !== 'prism.reconnect') return;
    if (hadMedia || port || m.open === true) ensurePort(true);
    requestSnap();
  });

  requestSnap();
})();
