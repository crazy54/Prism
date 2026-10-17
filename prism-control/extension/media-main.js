// Prism Control: MAIN-world media hook. Injected at document_start, in all frames, on sites the user
// granted. It sees what no extension API exposes (browser.md §3.4):
//  - navigator.mediaSession action handlers, position state, mic/camera state (no getters exist),
//  - metadata changes, and every HTMLMediaElement including detached `new Audio()` players and
//    elements inside (closed) shadow roots.
// It talks only to media-isolated.js, through CustomEvents with JSON-string details. Everything here
// is page-visible and page-spoofable: the isolated script and the service worker treat it as untrusted.
(() => {
  'use strict';
  const FLAG = Symbol.for('prism.control.media.v1');
  if (window[FLAG]) return;
  try { Object.defineProperty(window, FLAG, { value: true }); } catch { return; }

  const OUT = 'prismctl:v1:m2i';
  const IN = 'prismctl:v1:i2m';
  // Capture what we use before page scripts can replace it.
  const doc = document;
  const nowFn = Date.now.bind(Date);
  const stringify = JSON.stringify.bind(JSON);
  const parse = JSON.parse.bind(JSON);
  const dispatch = EventTarget.prototype.dispatchEvent;
  const listen = EventTarget.prototype.addEventListener;
  const CE = CustomEvent;
  const later = setTimeout.bind(window);
  const cancel = clearTimeout.bind(window);
  const every = setInterval.bind(window);
  const WR = WeakRef;
  const isFin = Number.isFinite;
  const navMS = () => { try { return navigator.mediaSession; } catch { return undefined; } };
  const MS_CTOR = typeof MediaStream === 'function' ? MediaStream : null;

  const EVENTS = ['play', 'playing', 'pause', 'ended', 'seeked', 'ratechange', 'volumechange', 'durationchange',
    'loadedmetadata', 'emptied', 'loadstart', 'enterpictureinpicture', 'leavepictureinpicture'];
  const URGENT = new Set(['play', 'playing', 'pause', 'ended', 'emptied', 'ratechange', 'seeked', 'volumechange',
    'enterpictureinpicture', 'leavepictureinpicture']);
  const LIVE_SECONDS = 7 * 24 * 3600;   // MSE live players report Infinity or a huge number (2^30)

  const handlers = new Map();           // action -> page handler
  let origSetActionHandler = null;
  let ourPipHandler = null;
  let pos = null;                       // {duration, position, rate, at}
  let mic = null;
  let cam = null;
  const els = [];                       // WeakRef<HTMLMediaElement>
  const info = new WeakMap();           // el -> {n, lastPlayAt, newItemAt, oursAt}
  let nextN = 1;
  const roots = [];                     // WeakRef<ShadowRoot>
  const held = { rate: null, volume: null };
  let scannedOpenShadows = false;

  function send(obj) {
    try { dispatch.call(doc, new CE(OUT, { detail: stringify(obj) })); } catch { /* page broke JSON/events */ }
  }

  // ------------------------------------------------------------------ hooks
  function wrapMethod(proto, name, make) {
    const d = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== 'function') return null;
    const orig = d.value;
    const w = make(orig);
    try { Object.defineProperty(w, 'name', { value: orig.name }); Object.defineProperty(w, 'length', { value: orig.length }); } catch { /* ignore */ }
    try { Object.defineProperty(proto, name, { ...d, value: w }); } catch { return null; }
    return orig;
  }
  function wrapSetter(proto, name, after) {
    const d = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.set !== 'function') return;
    const set = d.set;
    try {
      Object.defineProperty(proto, name, { ...d, set: { [name](v) { set.call(this, v); try { after(this); } catch { /* ignore */ } } }[name] });
    } catch { /* ignore */ }
  }

  const MSP = window.MediaSession && window.MediaSession.prototype;
  if (MSP) {
    origSetActionHandler = wrapMethod(MSP, 'setActionHandler', (orig) => function setActionHandler(action, handler) {
      const r = orig.apply(this, arguments);   // throws for unsupported actions: then nothing is recorded
      if (this === navMS()) {
        const a = String(action);
        if (typeof handler === 'function') handlers.set(a, handler); else handlers.delete(a);
        if (a === 'enterpictureinpicture') ourPipHandler = null;
        changed(true);
      }
      return r;
    });
    wrapMethod(MSP, 'setPositionState', (orig) => function setPositionState(state) {
      const r = orig.apply(this, arguments);
      if (this === navMS()) {
        if (!state || state.duration === undefined) pos = null;
        else pos = { duration: +state.duration, position: +(state.position || 0), rate: state.playbackRate === undefined ? 1 : +state.playbackRate, at: nowFn() };
        changed(false);
      }
      return r;
    });
    wrapMethod(MSP, 'setMicrophoneActive', (orig) => function setMicrophoneActive(active) {
      const r = orig.apply(this, arguments);
      if (this === navMS()) { mic = !!active; changed(true); }
      return r;
    });
    wrapMethod(MSP, 'setCameraActive', (orig) => function setCameraActive(active) {
      const r = orig.apply(this, arguments);
      if (this === navMS()) { cam = !!active; changed(true); }
      return r;
    });
    wrapSetter(MSP, 'metadata', (s) => { if (s === navMS()) changed(true); });
    wrapSetter(MSP, 'playbackState', (s) => { if (s === navMS()) changed(true); });
  }
  const MMP = window.MediaMetadata && window.MediaMetadata.prototype;
  if (MMP) {
    for (const f of ['title', 'artist', 'album', 'artwork', 'chapterInfo']) {
      wrapSetter(MMP, f, (m) => { const s = navMS(); if (s && s.metadata === m) changed(true); });
    }
  }
  wrapMethod(HTMLMediaElement.prototype, 'play', (orig) => function play() {
    try { track(this); } catch { /* ignore */ }
    return orig.apply(this, arguments);
  });
  wrapMethod(Element.prototype, 'attachShadow', (orig) => function attachShadow() {
    const root = orig.apply(this, arguments);
    try { addRoot(root); } catch { /* ignore */ }
    return root;
  });

  // ------------------------------------------------------------------ discovery
  function discover(e) {
    const el = e.target;
    if (el instanceof HTMLMediaElement && !info.has(el)) track(el);
  }
  for (const t of EVENTS) listen.call(window, t, discover, true);

  function addRoot(root) {
    roots.push(new WR(root));
    for (const t of EVENTS) listen.call(root, t, discover, true);
    if (roots.length > 512) roots.splice(0, roots.length - 512);
  }

  function track(el) {
    let i = info.get(el);
    if (i) return i;
    i = { n: nextN++, lastPlayAt: 0, newItemAt: nowFn(), oursAt: 0 };
    info.set(el, i);
    els.push(new WR(el));
    if (els.length > 64) els.splice(0, els.length - 64);
    for (const t of EVENTS) listen.call(el, t, onElementEvent, false);
    changed(false);
    return i;
  }

  function rescan() {
    const found = [];
    try { found.push(...doc.querySelectorAll('video,audio')); } catch { /* ignore */ }
    for (const r of roots) {
      const root = r.deref();
      if (root) try { found.push(...root.querySelectorAll('video,audio')); } catch { /* ignore */ }
    }
    if (!scannedOpenShadows && doc.documentElement) {
      // Late injection: shadow roots created before our attachShadow hook. Open ones only, once.
      scannedOpenShadows = true;
      try {
        const w = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
        let n = 0;
        for (let node = w.currentNode; node && n < 20000; node = w.nextNode(), n++) {
          if (node.shadowRoot) { addRoot(node.shadowRoot); found.push(...node.shadowRoot.querySelectorAll('video,audio')); }
        }
      } catch { /* ignore */ }
    }
    for (const el of found) if (!info.has(el)) track(el);
  }

  function liveEls() {
    const out = [];
    for (let k = els.length - 1; k >= 0; k--) {
      const el = els[k].deref();
      if (!el) { els.splice(k, 1); continue; }
      out.push(el);
    }
    return out;
  }

  // ------------------------------------------------------------------ holds (custom rate / volume)
  function onElementEvent(e) {
    const el = e.currentTarget;
    const i = info.get(el);
    if (!i) return;
    const t = e.type;
    const now = nowFn();
    if (t === 'play' || t === 'playing') i.lastPlayAt = now;
    if (t === 'loadstart' || t === 'emptied' || t === 'loadedmetadata') i.newItemAt = now;
    if ((t === 'loadedmetadata' || t === 'playing') && el === primary()) reapply(el, i);
    if (t === 'ratechange' && held.rate !== null && now - i.oursAt > 250 && Math.abs(el.playbackRate - held.rate) > 1e-3) {
      // The site changed the rate: on a new item (YouTube resets per video) we put ours back;
      // otherwise the user used the site's own menu, so we let go.
      if (now - i.newItemAt < 2000 && !isLive(el)) setRate(el, held.rate, i); else held.rate = null;
    }
    if (t === 'volumechange' && held.volume !== null && now - i.oursAt > 250 && Math.abs(el.volume - held.volume) > 1e-3) {
      if (now - i.newItemAt < 2000) setVolume(el, held.volume, i); else held.volume = null;
    }
    changed(URGENT.has(t));
  }

  function reapply(el, i) {
    if (held.rate !== null && !isLive(el) && Math.abs(el.playbackRate - held.rate) > 1e-3) setRate(el, held.rate, i);
    if (held.volume !== null && Math.abs(el.volume - held.volume) > 1e-3) setVolume(el, held.volume, i);
  }
  function setRate(el, r, i = info.get(el)) { if (i) i.oursAt = nowFn(); el.playbackRate = r; try { el.defaultPlaybackRate = r; } catch { /* ignore */ } }
  function setVolume(el, v, i = info.get(el)) { if (i) i.oursAt = nowFn(); el.volume = v; }

  // ------------------------------------------------------------------ snapshot
  const isLive = (el) => el.duration === Infinity || (isFin(el.duration) && el.duration >= LIVE_SECONDS)
    || !!(MS_CTOR && el.srcObject instanceof MS_CTOR);   // camera/screen/canvas streams are always live
  const isPlaying = (el) => !el.paused && !el.ended;

  function rank(el) {
    const i = info.get(el) || { lastPlayAt: 0 };
    const playing = isPlaying(el);
    const audible = playing && !el.muted && el.volume > 0;
    const loaded = !!(el.currentSrc || el.srcObject);
    const short = isFin(el.duration) && el.duration > 0 && el.duration < 5;
    const area = el.tagName === 'VIDEO' && el.isConnected ? (el.clientWidth * el.clientHeight) : 0;
    return [(audible ? 8 : 0) + (playing ? 4 : 0) + (short ? 0 : 2) + (loaded ? 1 : -16), i.lastPlayAt, area];
  }
  function better(a, b) { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; }

  function primary() {
    let best = null;
    let bestRank = null;
    for (const el of liveEls()) {
      const r = rank(el);
      if (r[0] < 0) continue;
      if (!best || better(r, bestRank)) { best = el; bestRank = r; }
    }
    return best;
  }

  function primaryVideo() {
    const p = primary();
    if (p && p.tagName === 'VIDEO') return p;
    let best = null;
    let area = -1;
    for (const el of liveEls()) {
      if (el.tagName !== 'VIDEO' || !(el.currentSrc || el.srcObject)) continue;
      const a = el.clientWidth * el.clientHeight;
      if (a > area) { best = el; area = a; }
    }
    return best;
  }

  function posNow(playing) {
    if (!pos) return null;
    let p = pos.position + (playing ? ((nowFn() - pos.at) / 1000) * pos.rate : 0);
    if (isFin(pos.duration) && pos.duration > 0) p = Math.min(p, pos.duration);
    return Math.max(0, p);
  }

  function pickArtwork(list) {
    if (!list || !list.length) return [];
    const out = [];
    for (let k = 0; k < list.length && out.length < 8; k++) {
      const a = list[k];
      if (a && typeof a.src === 'string' && a.src.length <= 4096) out.push({ src: a.src, sizes: String(a.sizes || '').slice(0, 64), type: String(a.type || '').slice(0, 32) });
    }
    return out;
  }

  function entryFor(el, isPrimary) {
    const s = navMS();
    const md = isPrimary && s ? s.metadata : null;
    const hasSession = isPrimary && !!(md || handlers.size || mic !== null || cam !== null || pos);
    const e = { sub: isPrimary ? null : info.get(el).n };
    const now = nowFn();
    if (el) {
      const live = isLive(el);
      const playing = isPlaying(el);
      const d = el.duration;
      const sessionPos = isPrimary && pos && !live
        && (!(isFin(d) && d > 0) || (pos.duration > 0 && Math.abs(pos.duration - d) / pos.duration > 0.05));
      e.kind = el.tagName === 'VIDEO' && (el.videoHeight > 0 || el.readyState < 1) ? 'video' : 'audio';
      e.state = playing ? 'playing' : 'paused';
      e.live = live;
      if (sessionPos) { e.durationMs = pos.duration * 1000; e.positionMs = posNow(playing) * 1000; e.rate = pos.rate; }
      else { e.durationMs = live || !isFin(d) ? null : d * 1000; e.positionMs = el.currentTime * 1000; e.rate = el.playbackRate; }
      e.volume = el.volume;
      e.elementMuted = el.muted;
      e.pip = doc.pictureInPictureElement === el;
      e.source = hasSession ? 'mediasession+element' : 'element';
    } else {
      const ps = s ? s.playbackState : 'none';
      const playing = ps === 'playing';
      e.kind = 'session-only';
      e.state = playing ? 'playing' : (ps === 'paused' ? 'paused' : 'none');
      e.live = !!(pos && !isFin(pos.duration));
      e.durationMs = pos && isFin(pos.duration) ? pos.duration * 1000 : null;
      e.positionMs = pos ? posNow(playing) * 1000 : null;
      e.rate = pos ? pos.rate : 1;
      e.volume = null;
      e.elementMuted = null;
      e.pip = !!doc.pictureInPictureElement;
      e.source = 'mediasession';
    }
    e.positionAt = now;
    if (isPrimary) {
      if (md) {
        e.title = typeof md.title === 'string' ? md.title.slice(0, 1024) : null;
        e.artist = typeof md.artist === 'string' ? md.artist.slice(0, 512) : null;
        e.album = typeof md.album === 'string' ? md.album.slice(0, 512) : null;
        e.artwork = pickArtwork(md.artwork);
        const ch = md.chapterInfo;
        e.chapters = ch && ch.length ? Array.from(ch).slice(0, 64).map((c) => ({ title: String(c.title || '').slice(0, 256), startMs: (+c.startTime || 0) * 1000 })) : [];
      }
      e.actions = [...handlers.keys()].slice(0, 16);
      e.mic = mic;
      e.camera = cam;
    }
    return e;
  }

  function snapshot() {
    const p = primary();
    const s = navMS();
    const hasSession = !!((s && s.metadata) || handlers.size || mic !== null || cam !== null || pos);
    const entries = [];
    if (p || hasSession) entries.push(entryFor(p, true));
    for (const el of liveEls()) {
      if (entries.length >= 4) break;
      if (el === p || !isPlaying(el) || el.muted || el.volume === 0) continue;
      if (isFin(el.duration) && el.duration < 10) continue;   // sound effects
      entries.push(entryFor(el, false));
    }
    return entries;
  }

  // ------------------------------------------------------------------ emit (<= 4 Hz, urgent at once)
  let timer = null;
  let timerUrgent = false;
  let lastAt = 0;
  let lastSig = '';
  let lastSent = [];

  function changed(urgent) {
    if (timer !== null) {
      if (!urgent || timerUrgent) return;
      cancel(timer);
    }
    timerUrgent = !!urgent;
    timer = later(emit, urgent ? 0 : Math.max(0, 250 - (nowFn() - lastAt)));
  }

  function drifted(prev, next) {
    if (prev.length !== next.length) return true;
    for (let k = 0; k < next.length; k++) {
      const a = prev[k], b = next[k];
      if (a.positionMs == null || b.positionMs == null) continue;
      const predicted = a.positionMs + (a.state === 'playing' ? (b.positionAt - a.positionAt) * (a.rate || 1) : 0);
      if (Math.abs(predicted - b.positionMs) > 750) return true;
    }
    return false;
  }

  function emit(force) {
    timer = null;
    timerUrgent = false;
    lastAt = nowFn();
    const entries = snapshot();
    const sig = stringify(entries.map((x) => ({ ...x, positionMs: 0, positionAt: 0 })));
    if (!force && sig === lastSig && !drifted(lastSent, entries)) return;
    lastSig = sig;
    lastSent = entries;
    send({ t: 'snap', entries });
  }

  // Position drift check while something plays (background tabs throttle this; the plugin extrapolates).
  every(() => { if (liveEls().some(isPlaying) || (pos && navMS() && navMS().playbackState === 'playing')) changed(false); }, 1000);

  // ------------------------------------------------------------------ commands
  class Fail extends Error { constructor(code, message) { super(message || code); this.code = code; } }
  const domFail = (e) => {
    const n = e && e.name;
    if (n === 'NotAllowedError') return new Fail('gesture_required', 'the page needs a user gesture');
    if (n === 'NotSupportedError' || n === 'InvalidStateError') return new Fail('unsupported', String(e.message || n).slice(0, 120));
    return e instanceof Fail ? e : new Fail('busy', String(e && e.message || e).slice(0, 120));
  };

  function target(sub) {
    if (sub === null || sub === undefined) return primary();
    for (const el of liveEls()) { const i = info.get(el); if (i && i.n === sub) return el; }
    throw new Fail('not_found', 'that media element is gone');
  }

  function stateOf(el) {
    if (!el) {
      const s = navMS();
      return { state: s && s.playbackState === 'playing' ? 'playing' : 'paused' };
    }
    return {
      state: isPlaying(el) ? 'playing' : 'paused',
      positionMs: Math.round(el.currentTime * 1000),
      durationMs: isLive(el) || !isFin(el.duration) ? null : Math.round(el.duration * 1000),
      live: isLive(el),
      rate: el.playbackRate,
      volume: el.volume,
      muted: el.muted,
      pip: doc.pictureInPictureElement === el,
    };
  }

  function callHandler(action, details) {
    const h = handlers.get(action);
    if (!h) return false;
    h.call(navMS(), { action, ...details });
    return true;
  }

  async function doPlay(el, sub) {
    if (sub == null && callHandler('play')) return stateOf(el);
    if (!el) throw new Fail('not_found', 'no media element');
    try { await el.play(); } catch (e) { throw domFail(e); }
    return stateOf(el);
  }
  async function doPause(el, sub) {
    if (sub == null && callHandler('pause')) return stateOf(el);
    if (!el) throw new Fail('not_found', 'no media element');
    el.pause();
    return stateOf(el);
  }

  function requestPip(el) {
    const v = el && el.tagName === 'VIDEO' ? el : primaryVideo();
    if (!v) throw new Fail('unsupported', 'no video to show in picture-in-picture');
    if (v.disablePictureInPicture) throw new Fail('unsupported', 'the site disabled picture-in-picture');
    return v.requestPictureInPicture();   // called synchronously: transient activation is checked here
  }

  async function handle(m) {
    const a = m.args && typeof m.args === 'object' ? m.args : {};
    const sub = m.sub === undefined ? null : m.sub;
    switch (m.op) {
      case 'snap': rescan(); emit(true); return {};
      case 'pip.now': {
        // From the isolated world's F24 keydown handler: still inside the trusted key event.
        const p = requestPip(target(sub));
        try { await p; } catch (e) { throw domFail(e); }
        return { pip: true };
      }
    }
    rescan();
    const el = target(sub);
    switch (m.op) {
      case 'toggle': {
        const playing = el ? isPlaying(el) : (navMS() && navMS().playbackState === 'playing');
        return playing ? doPause(el, sub) : doPlay(el, sub);
      }
      case 'play': return doPlay(el, sub);
      case 'pause': return doPause(el, sub);
      case 'seek': {
        if (el && isLive(el)) throw new Fail('unsupported', 'live stream');
        const cur = el ? el.currentTime * 1000 : (posNow(navMS() && navMS().playbackState === 'playing') ?? 0) * 1000;
        let t = isFin(a.positionMs) ? a.positionMs : cur + (isFin(a.deltaMs) ? a.deltaMs : 0);
        const dur = el && isFin(el.duration) ? el.duration * 1000 : (pos && isFin(pos.duration) ? pos.duration * 1000 : Infinity);
        t = Math.max(0, Math.min(t, dur));
        if (sub == null && handlers.has('seekto')) { callHandler('seekto', { seekTime: t / 1000, fastSeek: false }); return { ...stateOf(el), positionMs: Math.round(t) }; }
        if (el) { el.currentTime = t / 1000; return stateOf(el); }
        const delta = t - cur;
        if (delta > 0 && callHandler('seekforward', { seekOffset: delta / 1000 })) return stateOf(el);
        if (delta < 0 && callHandler('seekbackward', { seekOffset: -delta / 1000 })) return stateOf(el);
        throw new Fail('unsupported', 'this player cannot seek');
      }
      case 'rate': {
        if (!el) throw new Fail('unsupported', 'no media element');
        if (isLive(el)) throw new Fail('unsupported', 'live stream');
        let r = isFin(a.rate) ? a.rate : null;
        if (r === null && Number.isInteger(a.step) && Array.isArray(a.ladder)) {
          const L = a.ladder.filter(isFin);
          let best = 0;
          for (let k = 1; k < L.length; k++) if (Math.abs(L[k] - el.playbackRate) < Math.abs(L[best] - el.playbackRate)) best = k;
          r = L[Math.max(0, Math.min(L.length - 1, best + a.step))];
        }
        if (!isFin(r)) throw new Fail('bad_args', 'rate');
        r = Math.max(0.25, Math.min(4, r));
        try { setRate(el, r); } catch (e) { throw domFail(e); }
        held.rate = Math.abs(r - 1) < 1e-3 ? null : r;
        return stateOf(el);
      }
      case 'volume': {
        if (!el) throw new Fail('unsupported', 'no media element');
        let v = isFin(a.volume) ? a.volume : el.volume + (isFin(a.delta) ? a.delta : 0);
        v = Math.max(0, Math.min(1, v));
        const targets = new Set([el]);
        if (sub == null) for (const x of liveEls()) if (isPlaying(x)) targets.add(x);
        for (const x of targets) { setVolume(x, v); if (v > 0 && x.muted && (isFin(a.delta) ? a.delta > 0 : true)) x.muted = false; }
        held.volume = v;
        return stateOf(el);
      }
      case 'mute': {
        if (!el) throw new Fail('unsupported', 'no media element');
        el.muted = typeof a.muted === 'boolean' ? a.muted : !el.muted;
        return stateOf(el);
      }
      case 'action': {
        const action = String(a.action || '');
        if (action === 'play' || action === 'pause') return action === 'play' ? doPlay(el, sub) : doPause(el, sub);
        const off = action === 'seekbackward' || action === 'seekforward' ? { seekOffset: 10 } : {};
        if (!callHandler(action, off)) throw new Fail('unsupported', `the page has no ${action} handler`);
        return { action };
      }
      case 'pip': {
        const inPip = !!doc.pictureInPictureElement;
        const mode = a.mode || 'toggle';
        if (mode === 'exit' || (mode === 'toggle' && inPip && (!el || doc.pictureInPictureElement === el))) {
          if (inPip) { try { await doc.exitPictureInPicture(); } catch (e) { throw domFail(e); } }
          return { pip: false };
        }
        if (a.via === 'auto') {
          // Auto-PiP (Chrome 134+): Chrome fires `enterpictureinpicture` when the user leaves the tab.
          const site = handlers.has('enterpictureinpicture');
          if (!site && origSetActionHandler && navMS()) {
            ourPipHandler = () => { const v = primaryVideo(); if (v) v.requestPictureInPicture().catch(() => {}); };
            try { origSetActionHandler.call(navMS(), 'enterpictureinpicture', ourPipHandler); } catch (e) { throw domFail(e); }
          }
          return { auto: true, siteHandler: site };
        }
        const p = requestPip(el);
        try { await p; } catch (e) { throw domFail(e); }
        return { pip: true };
      }
      default:
        throw new Fail('unsupported', 'unknown op');
    }
  }

  listen.call(doc, IN, (e) => {
    if (typeof e.detail !== 'string' || e.detail.length > 4096) return;
    let m;
    try { m = parse(e.detail); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.op !== 'string') return;
    let p;
    try { p = handle(m); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then(
      (data) => send({ t: 'res', id: m.id, ok: true, data: data || {} }),
      (err) => { const f = domFail(err); send({ t: 'res', id: m.id, ok: false, code: f.code, message: f.message }); },
    );
  });

  // First look (elements already in the page when injected late).
  later(() => { rescan(); if (liveEls().length || handlers.size || (navMS() && navMS().metadata)) emit(true); }, 0);
})();
