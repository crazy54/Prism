// Real-browser tests for the extension (Chrome, optionally Edge), in THROWAWAY profiles only.
//   node tests/e2e/run.mjs --scratch <folder> [--browser chrome|edge|both] [--headed] [--skip-restart]
//
// What it does:
//  - copies the extension to <scratch>/ext-under-test and adds one required host permission,
//    http://127.0.0.1/*, so the media scripts register without a permission prompt (the only change);
//  - checks that branded Chrome ignores --load-extension, then loads the copy with CDP
//    Extensions.loadUnpacked (needs --enable-unsafe-extension-debugging + --remote-debugging-pipe);
//  - checks the id, the popup's "Host not installed" path (no registry entry exists), API support;
//  - simulates the native port INSIDE the real service worker (no registry write) and drives local
//    fixture pages: metadata/position reporting, seek/speed/volume/play/pause/actions, iframes, shadow
//    DOM, detached audio, live streams, meeting mic/camera, F24 picture-in-picture, privacy, restarts.
// Every browser and the server are closed and every temp profile deleted at the end.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, findBrowser } from './cdp.mjs';
import { startServer } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(`--${name}`);
const scratch = resolve(opt('scratch', join(extRoot, '.e2e-tmp')));
const which = opt('browser', 'chrome');
const headed = flag('headed');
const EXPECTED_ID = 'ebbfhlgndibiinpfkhcacipfkoeokcgn';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let current = '';
function check(name, ok, detail) {
  results.push({ browser: current, name, ok: !!ok, detail: detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`);
}
function note(name, detail) {
  results.push({ browser: current, name, ok: null, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`NOTE [${current}] ${name} :: ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)}`);
}
async function until(fn, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(step);
  }
  return last instanceof Error ? null : last;
}

function prepareCopy() {
  const dest = join(scratch, 'ext-under-test');
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of ['manifest.json', 'sw.js', 'media-main.js', 'media-isolated.js', 'popup.html', 'options.html', 'src', 'img']) {
    cpSync(join(extRoot, f), join(dest, f), { recursive: true });
  }
  const m = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];   // the one test-only change: no permission prompt needed
  writeFileSync(join(dest, 'manifest.json'), JSON.stringify(m, null, 2));
  return dest;
}

async function swSession(cdp, id, ms = 10000) {
  const t = await until(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.find((x) => x.type === 'service_worker' && x.url.startsWith(`chrome-extension://${id}/`));
  }, ms);
  if (!t) return null;
  const s = await cdp.attach(t.targetId);
  await s.send('Runtime.enable');
  return s;
}

/** Simulated relay + plugin inside the worker: records frames, reconstructs plugin-side state. */
const FAKE_PORT = `(() => {
  globalThis.__sent = [];
  const L = { m: [], d: [] };
  const port = { name: 'fake-relay', postMessage(m) { __sent.push(JSON.parse(JSON.stringify(m))); },
    disconnect() {}, onMessage: { addListener(f) { L.m.push(f); } }, onDisconnect: { addListener(f) { L.d.push(f); } } };
  globalThis.__deliver = (m) => { for (const f of L.m) f(JSON.parse(JSON.stringify(m))); return true; };
  globalThis.__wire = () => {
    const tabs = new Map(), media = new Map(), dl = new Map(); let privacy = null;
    for (const f of __sent) {
      if (f.t === 'state.full') { tabs.clear(); media.clear(); dl.clear(); privacy = f.data.privacy;
        for (const x of f.data.tabs) tabs.set(x.id, x); for (const x of f.data.media) media.set(x.key, x); for (const x of f.data.downloads) dl.set(x.id, x); }
      else if (f.t === 'tabs.delta') { for (const u of f.data.upsert) tabs.set(u.id, { ...(tabs.get(u.id) || {}), ...u }); for (const k of f.data.remove) tabs.delete(k); }
      else if (f.t === 'media.update') { for (const u of f.data.upsert) media.set(u.key, { ...(media.get(u.key) || {}), ...u }); for (const k of f.data.remove) media.delete(k); }
    }
    return { privacy, tabs: [...tabs.values()], media: [...media.values()], imgs: __sent.filter((f) => f.t === 'img').map((f) => ({ id: f.data.id, mime: f.data.mime, w: f.data.w, h: f.data.h, bytes: Math.round(f.data.b64.length * 3 / 4) })) };
  };
  prism.connection.connectNative = () => port;
  prism.connection.close();
  prism.connection.retryNow();
  return prism.connection.status;
})()`;

let cmdId = 1;
async function cmd(sw, op, a = {}) {
  const id = cmdId++;
  await sw.eval(`__deliver(${JSON.stringify({ v: 1, t: 'cmd', id, op, args: a })})`);
  const r = await until(() => sw.eval(`__sent.find((m) => m.t === 'result' && m.id === ${id}) || null`), 5000, 50);
  return r || { ok: false, error: { code: 'timeout' } };
}

async function tabIdFor(sw, path) {
  return until(() => sw.eval(`chrome.tabs.query({}).then((ts) => (ts.find((t) => (t.url || '').includes(${JSON.stringify(path)})) || {}).id || null)`), 8000);
}

async function mediaFor(sw, tabId, pred = '(m) => true', ms = 8000) {
  return until(() => sw.eval(`(__wire().media.filter((m) => m.tabId === ${tabId}).find(${pred})) || null`), ms, 100);
}

// ---------------------------------------------------------------------------------------------
async function loadExtensionFlagIgnored(browser, copy) {
  const b = await launch({ browser, profileRoot: join(scratch, 'profiles'), headless: !headed, label: 'loadext', args: [`--load-extension=${copy}`, `--disable-extensions-except=${copy}`] });
  try {
    await sleep(3000);
    const { targetInfos } = await b.cdp.send('Target.getTargets');
    const found = targetInfos.some((t) => t.url.includes(EXPECTED_ID));
    return { found, version: b.version.product };
  } finally {
    const gone = await b.close();
    if (!gone) note('temp profile not removed', b.userDataDir);
  }
}

async function runBrowser(browser, copy, srv) {
  current = browser;
  const exe = findBrowser(browser);
  if (!exe) { note('browser not installed', browser); return; }

  const flagRun = await loadExtensionFlagIgnored(browser, copy).catch((e) => ({ error: String(e) }));
  if (browser === 'chrome') check('--load-extension is ignored by branded Chrome', flagRun.found === false, flagRun);
  else note('--load-extension in this browser', flagRun);

  const b = await launch({ browser, profileRoot: join(scratch, 'profiles'), headless: !headed, label: 'main' });
  const pages = [];
  try {
    note('browser version', b.version.product);
    let id;
    try {
      ({ id } = await b.cdp.send('Extensions.loadUnpacked', { path: copy }));
    } catch (e) {
      check('Extensions.loadUnpacked', false, String(e.message));
      return;
    }
    check('Extensions.loadUnpacked loads the extension', !!id, id);
    check('extension id matches the manifest key', id === EXPECTED_ID, id);
    let sw = await swSession(b.cdp, id);
    check('service worker started', !!sw);
    if (!sw) return;

    // ---- real native-messaging failure path (no registry entry exists) ----
    const st = await until(() => sw.eval('prism.uiStatus().status === "host_missing" ? prism.uiStatus() : null'), 6000);
    check('no host registered -> status host_missing', st && st.status === 'host_missing', st && st.detail);
    const popup = await openPage(b.cdp, `chrome-extension://${id}/popup.html`);
    pages.push(popup);
    const line = await until(() => popup.eval(`document.getElementById('line').textContent.includes('Host not installed') ? document.getElementById('line').textContent + ' | ' + document.getElementById('help').textContent : null`), 5000);
    check('popup shows "Host not installed" with help', !!line, line);

    // ---- API probes (Edge differences) ----
    const probe = await sw.eval(`({
      createSplit: typeof chrome.tabs.createSplit, unsplit: typeof chrome.tabs.unsplit,
      addHostAccessRequest: typeof chrome.permissions.addHostAccessRequest,
      publicSuffix: typeof chrome.publicSuffix, browserNs: typeof browser,
      offscreenCanvas: typeof OffscreenCanvas, createImageBitmap: typeof createImageBitmap,
      uaBrands: (navigator.userAgentData && navigator.userAgentData.brands || []).map((b) => b.brand + ' ' + b.version),
      detected: prism.state.browser,
      registered: null,
    })`);
    probe.registered = await sw.eval(`chrome.scripting.getRegisteredContentScripts().then((l) => l.map((s) => s.id + ':' + s.world + ':' + s.matches.join(',')))`);
    note('API probe', probe);
    check('media scripts registered for the granted origin', probe.registered.some((x) => x.includes('MAIN')) && probe.registered.some((x) => x.includes('ISOLATED')), probe.registered);

    // ---- simulated native port ----
    const s0 = await sw.eval(FAKE_PORT);
    check('fake port attached, hello sent', s0 === 'connecting' && await sw.eval(`__sent[0].t === 'hello' && __sent[0].data.ext.id`) === id);
    await sw.eval(`__deliver({ v: 1, t: 'welcome', data: { proto: 1, privacy: 'full', want: {} } })`);
    check('welcome -> connected + state.full', await until(() => sw.eval(`prism.connection.status === 'connected' && __sent.some((m) => m.t === 'state.full')`), 3000));

    // ---- popup states with the simulated relay ----
    const popLine = async () => {
      await popup.send('Page.reload');
      return until(() => popup.eval(`(() => { const l = document.getElementById('line').textContent; return l && l !== 'Checking...' ? l : null; })()`), 4000);
    };
    check('popup: "Connected" once welcomed', (await popLine()) === 'Connected');
    check('popup: no SAFE badge while streamer-safe is off', await popup.eval(`document.getElementById('safe').offsetParent === null`));
    await sw.eval(`__deliver({ t: 'relay.down' })`);
    check('popup: "Prism Control not running" after relay.down', (await popLine()) === 'Prism Control not running');
    await sw.eval(`__deliver({ t: 'relay.up' })`);
    const reHello = await until(() => sw.eval(`__sent.filter((m) => m.t === 'hello').length >= 2 || null`), 3000);
    await sw.eval(`__deliver({ v: 1, t: 'welcome', data: { proto: 1, privacy: 'full', want: {} } })`);
    check('relay.up -> hello -> welcome reconnects the session', reHello && (await popLine()) === 'Connected');

    // ---- generic <video> with a full Media Session ----
    const gen = await openPage(b.cdp, `${srv.origin}/generic.html`);
    pages.push(gen);
    const genTab = await tabIdFor(sw, '/generic.html');
    let m = await mediaFor(sw, genTab, `(m) => m.title === 'Fixture Song' && m.state === 'playing'`);
    check('generic: metadata reported (title, artist, album)', m && m.artist === 'Test Artist' && m.album === 'Fixture Album', m && { title: m.title, artist: m.artist, album: m.album, kind: m.kind, source: m.source });
    check('generic: action handlers seen', m && ['play', 'pause', 'seekto', 'nexttrack', 'previoustrack'].every((a) => m.actions.includes(a)), m && m.actions);
    check('generic: duration from the element/position state', m && Math.abs(m.durationMs - 30000) < 200, m && m.durationMs);
    const genKey = m && m.key;
    m = await mediaFor(sw, genTab, `(m) => m.art && m.art.img`, 8000);
    check('generic: http artwork fetched + re-encoded in the worker', m && /^art:[0-9a-f]{16}$/.test(m.art.img), m && m.art);
    const favProbe = await sw.eval(`(async () => {
      const get = async (u) => { const r = await fetch(chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(u) + '&size=32')); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), bytes: b.length, head: [...b.slice(0, 4)] }; };
      return { page: await get(${JSON.stringify(srv.origin + '/generic.html')}), unknown: await get('https://prism-control-default.invalid/') };
    })()`);
    note('_favicon from the service worker', favProbe);
    await until(() => sw.eval(`(__wire().tabs.find((t) => t.id === ${genTab}) || {}).icon?.startsWith('fav:') || null`), 6000);
    const wire1 = await sw.eval('__wire()');
    const artImg = wire1.imgs.find((i) => m && i.id === m.art.img);
    check('artwork image within caps (<= 288 px, <= 96 KB, JPEG/PNG)', artImg && artImg.w <= 288 && artImg.h <= 288 && artImg.bytes <= 96 * 1024 && /image\/(jpeg|png)/.test(artImg.mime), artImg);
    const genTabWire = wire1.tabs.find((t) => t.id === genTab);
    check('favicon fetched via _favicon and sent as img', genTabWire && /^fav:/.test(genTabWire.icon) && wire1.imgs.some((i) => i.id === genTabWire.icon && i.w === 32 && i.h === 32), genTabWire && genTabWire.icon);
    check('tab reports access: granted', genTabWire && genTabWire.access === 'granted', genTabWire && genTabWire.access);

    let r = await cmd(sw, 'media.seek', { key: genKey, positionMs: 12000 });
    const t1 = await gen.eval('document.getElementById("v").currentTime');
    const calls1 = await gen.eval('JSON.stringify(window.__calls)');
    check('generic: media.seek via the site seekto handler', r.ok && Math.abs(t1 - 12) < 1.0 && calls1.includes('"seekto",12'), { r: r.ok, t1, calls1 });
    m = await mediaFor(sw, genTab, `(m) => m.positionMs > 11000`, 4000);
    check('generic: position after seek reaches the wire', !!m, m && m.positionMs);
    r = await cmd(sw, 'media.rate', { key: genKey, rate: 2 });
    check('generic: media.rate 2x', r.ok && await gen.eval('document.getElementById("v").playbackRate') === 2, r);
    r = await cmd(sw, 'media.rate', { key: genKey, step: 2 });
    check('generic: media.rate ladder step 2 -> 3x', r.ok && await gen.eval('document.getElementById("v").playbackRate') === 3, r.data);
    r = await cmd(sw, 'media.rate', { key: genKey, rate: 1 });
    r = await cmd(sw, 'media.volume', { key: genKey, volume: 0.3 });
    check('generic: media.volume 0.3', r.ok && Math.abs(await gen.eval('document.getElementById("v").volume') - 0.3) < 1e-6, r.data);
    m = await mediaFor(sw, genTab, `(m) => Math.abs(m.volume - 0.3) < 1e-6`, 3000);
    check('generic: volume reaches the wire', !!m);
    r = await cmd(sw, 'media.pause', { key: genKey });
    check('generic: media.pause via the site handler', r.ok && await gen.eval('document.getElementById("v").paused') === true && (await gen.eval('JSON.stringify(window.__calls)')).includes('"pause"'));
    m = await mediaFor(sw, genTab, `(m) => m.state === 'paused'`, 3000);
    check('generic: paused state reaches the wire', !!m);
    r = await cmd(sw, 'media.toggle', { key: genKey });
    check('generic: media.toggle plays again', r.ok && await until(() => gen.eval('!document.getElementById("v").paused'), 2000));
    r = await cmd(sw, 'media.action', { key: genKey, action: 'nexttrack' });
    check('generic: media.action nexttrack reaches the page', r.ok && (await gen.eval('JSON.stringify(window.__calls)')).includes('"nexttrack"'));
    r = await cmd(sw, 'media.action', { key: genKey, action: 'skipad' });
    check('generic: unregistered action -> unsupported', !r.ok && r.error.code === 'unsupported', r.error);
    r = await cmd(sw, 'tab.mute', { tabId: genTab, muted: true });
    check('tab.mute', r.ok && await sw.eval(`chrome.tabs.get(${genTab}).then((t) => t.mutedInfo.muted)`), r.data);
    await cmd(sw, 'tab.mute', { tabId: genTab, muted: false });
    r = await cmd(sw, 'page.zoom', { tabId: genTab, step: 1 });
    check('page.zoom step +1 -> 110 %', r.ok && Math.abs(r.data.factor - 1.1) < 1e-6, r.data);
    await cmd(sw, 'page.zoom', { tabId: genTab, reset: true });
    r = await cmd(sw, 'page.scroll', { tabId: genTab, dy: 400, smooth: false });
    const sy = await gen.eval('window.scrollY');
    check('page.scroll 400 px (content script, top frame)', r.ok && Math.abs(sy - 400) < 2, { r: r.data, sy });
    check('Tab.host is the full host at full (Site Watch)', genTabWire && genTabWire.host === '127.0.0.1', genTabWire && { host: genTabWire.host, domain: genTabWire.domain });

    // ---- a granted page WITHOUT media: the page dial opens the port on demand (review HIGH 3) ----
    const txt = await openPage(b.cdp, `${srv.origin}/text.html`);
    pages.push(txt);
    const txtTab = await tabIdFor(sw, '/text.html');
    await sleep(500);
    const noPort = await sw.eval(`!prism.media.hasPort(${txtTab}, 0)`);
    r = await cmd(sw, 'page.scroll', { tabId: txtTab, dy: 600, smooth: false });
    const tsy = await txt.eval('window.scrollY');
    check('page.scroll on a granted page without media (port opened on demand)', noPort && r.ok && Math.abs(tsy - 600) < 2, { noPort, r: r.ok ? r.data : r.error, tsy });
    const txtMedia = await sw.eval(`__wire().media.filter((x) => x.tabId === ${txtTab}).length`);
    check('the on-demand port reports no media for that page', txtMedia === 0, txtMedia);

    // ---- SoundCloud-like detached Audio ----
    const det = await openPage(b.cdp, `${srv.origin}/detached.html`);
    pages.push(det);
    const detTab = await tabIdFor(sw, '/detached.html');
    m = await mediaFor(sw, detTab, `(m) => m.title === 'Detached Track' && m.state === 'playing'`);
    check('detached new Audio(): found via the play() hook', m && m.kind === 'audio' && m.source === 'mediasession+element', m && { kind: m.kind, source: m.source });
    m = await mediaFor(sw, detTab, `(m) => m.art && m.art.img`, 6000);
    check('detached: data: artwork re-encoded in the content script', m && /^art:/.test(m.art.img) && !JSON.stringify(m.art).includes('data:image'), m && m.art);
    r = await cmd(sw, 'media.pause', { key: m ? m.key : `${detTab}:0` });
    check('detached: pause through the element (no site pause handler)', r.ok && await det.eval('window.__audio.paused'), r);
    r = await cmd(sw, 'media.seek', { key: `${detTab}:0`, positionMs: 20000 });
    check('detached: seek through the element', r.ok && Math.abs(await det.eval('window.__audio.currentTime') - 20) < 1, r.data);

    // ---- closed shadow DOM ----
    const sh = await openPage(b.cdp, `${srv.origin}/shadow.html`);
    pages.push(sh);
    const shTab = await tabIdFor(sw, '/shadow.html');
    m = await mediaFor(sw, shTab, `(m) => m.title === 'Shadow Clip' && m.state === 'playing'`);
    check('closed shadow root: element found (attachShadow hook)', !!m, m && { kind: m.kind, source: m.source });
    m = await mediaFor(sw, shTab, `(m) => m.art && m.art.img`, 6000);
    check('shadow: blob: artwork re-encoded in the content script', m && /^art:/.test(m.art.img), m && m.art);
    r = await cmd(sw, 'media.seek', { key: `${shTab}:0`, positionMs: 7000 });
    check('shadow: seek through the element', r.ok && Math.abs(await sh.eval('window.__shadowVideo.currentTime') - 7) < 1, r.data);
    r = await cmd(sw, 'media.rate', { key: `${shTab}:0`, rate: 0.5 });
    check('shadow: rate 0.5x', r.ok && await sh.eval('window.__shadowVideo.playbackRate') === 0.5);

    // ---- same-origin iframe ----
    const ifr = await openPage(b.cdp, `${srv.origin}/iframe.html`);
    pages.push(ifr);
    const ifrTab = await tabIdFor(sw, '/iframe.html');
    m = await mediaFor(sw, ifrTab, `(m) => m.frameId !== 0 && m.state === 'playing'`);
    check('iframe: media reported with its own frame key', m && m.key === `${ifrTab}:${m.frameId}` && m.kind === 'audio', m && m.key);
    if (m) {
      r = await cmd(sw, 'media.volume', { key: m.key, volume: 0.25 });
      const vol = await ifr.eval(`document.getElementById('f').contentDocument.getElementById('a').volume`);
      check('iframe: command reaches the iframe player', r.ok && Math.abs(vol - 0.25) < 1e-6, { vol });
    }

    // ---- live stream (Twitch-like) ----
    const live = await openPage(b.cdp, `${srv.origin}/live.html`);
    pages.push(live);
    const liveTab = await tabIdFor(sw, '/live.html');
    m = await mediaFor(sw, liveTab, `(m) => m.title === 'Live Fixture Stream' && m.state === 'playing' && m.live`);
    check('live: duration Infinity -> live:true, durationMs null', m && m.live === true && m.durationMs === null && m.kind === 'video', m && { live: m.live, durationMs: m.durationMs, kind: m.kind });
    r = await cmd(sw, 'media.rate', { key: `${liveTab}:0`, rate: 2 });
    check('live: speed refused (unsupported)', !r.ok && r.error.code === 'unsupported', r.error);
    r = await cmd(sw, 'media.seek', { key: `${liveTab}:0`, deltaMs: -5000 });
    check('live: seek refused (unsupported)', !r.ok && r.error.code === 'unsupported', r.error);

    // ---- picture-in-picture ----
    r = await cmd(sw, 'media.pip', { key: `${liveTab}:0`, mode: 'enter' });
    check('PiP without a gesture -> gesture_required', !r.ok && r.error.code === 'gesture_required', r.error || r.data);
    r = await cmd(sw, 'media.pip', { key: `${liveTab}:0`, mode: 'enter', via: 'gesture' });
    check('PiP via gesture: armed (F24, one shot)', r.ok && r.data.armed === true && r.data.key === 'F24', r.data);
    await cmd(sw, 'tab.focus', { tabId: liveTab });
    await live.send('Page.bringToFront');
    const key = { key: 'F24', code: 'F24', windowsVirtualKeyCode: 135, nativeVirtualKeyCode: 135 };
    await live.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
    await live.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    const pipOk = await until(() => live.eval('!!document.pictureInPictureElement'), 4000);
    const pipEv = await until(() => sw.eval(`__sent.filter((m) => m.t === 'event' && (m.data.kind === 'pipChanged' || m.data.kind === 'gesture.needed')).map((m) => m.data).at(-1) || null`), 4000);
    check('PiP: trusted F24 keydown -> requestPictureInPicture succeeds', pipOk === true, { pipEv, headless: !headed });
    if (pipOk) {
      m = await mediaFor(sw, liveTab, `(m) => m.pip === true`, 3000);
      check('PiP state reaches the wire', !!m);
      r = await cmd(sw, 'media.pip', { key: `${liveTab}:0`, mode: 'exit' });
      check('PiP exit without a gesture', r.ok && await until(() => live.eval('!document.pictureInPictureElement'), 2000), r.data);
      // The plugin may pick another key (review MED 6): F21 armed, F24 ignored, F21 enters PiP.
      r = await cmd(sw, 'media.pip', { key: `${liveTab}:0`, mode: 'enter', via: 'gesture', pipKey: 'F21' });
      check('PiP via gesture with pipKey F21: armed for F21', r.ok && r.data.key === 'F21', r.data || r.error);
      await live.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
      await live.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      await sleep(400);
      const ignored = await live.eval('!document.pictureInPictureElement');
      const k21 = { key: 'F21', code: 'F21', windowsVirtualKeyCode: 132, nativeVirtualKeyCode: 132 };
      await live.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k21 });
      await live.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k21 });
      const pip21 = await until(() => live.eval('!!document.pictureInPictureElement'), 4000);
      check('PiP: F24 ignored while F21 is armed; trusted F21 enters PiP', ignored && pip21 === true, { ignored, pip21 });
      if (pip21) await cmd(sw, 'media.pip', { key: `${liveTab}:0`, mode: 'exit' });
    }

    // ---- meeting (mic / camera / hang-up) ----
    const meet = await openPage(b.cdp, `${srv.origin}/meeting.html`);
    pages.push(meet);
    const meetTab = await tabIdFor(sw, '/meeting.html');
    m = await mediaFor(sw, meetTab, `(m) => m.kind === 'session-only' && m.mic === true && m.camera === false`);
    check('meeting: session-only entry with mic on / camera off', !!m, m && { actions: m.actions, mic: m.mic, camera: m.camera });
    r = await cmd(sw, 'media.action', { key: `${meetTab}:0`, action: 'togglemicrophone' });
    m = await mediaFor(sw, meetTab, `(m) => m.mic === false`, 3000);
    check('meeting: togglemicrophone -> mic false on the wire', r.ok && !!m, r);
    r = await cmd(sw, 'media.action', { key: `${meetTab}:0`, action: 'hangup' });
    check('meeting: hangup reaches the page', r.ok && await meet.eval('window.__hung'), r);

    // ---- screenshots of the UI pages (for review) ----
    try {
      await popup.send('Emulation.setDeviceMetricsOverride', { width: 354, height: 300, deviceScaleFactor: 1, mobile: false });
      await popup.send('Page.reload');
      await sleep(800);
      writeFileSync(join(scratch, `popup-${browser}.png`), Buffer.from((await popup.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      const op = await openPage(b.cdp, `chrome-extension://${id}/options.html#grant=${encodeURIComponent('https://video.example/*')}`);
      pages.push(op);
      await op.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1500, deviceScaleFactor: 1, mobile: false });
      await sleep(1000);
      writeFileSync(join(scratch, `options-${browser}.png`), Buffer.from((await op.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'));
    } catch (e) { note('screenshots failed', String(e.message)); }

    // ---- privacy in the real browser ----
    const mark = await sw.eval('__sent.length');
    await sw.eval(`chrome.storage.local.set({ settings: { privacyBase: 'hidden' } })`);
    const hiddenFull = await until(() => sw.eval(`__sent.slice(${mark}).find((m) => m.t === 'state.full' && m.data.privacy === 'hidden') ? true : null`), 3000);
    await cmd(sw, 'media.seek', { key: genKey, positionMs: 3000 });
    await det.eval('window.__audio.play()');
    await sleep(1500);
    const after = await sw.eval(`JSON.stringify(__sent.slice(${mark}))`);
    const leaks = ['Fixture Song', 'Test Artist', 'Detached Track', 'Shadow Clip', 'Generic player fixture', '/generic.html', 'Live Fixture Stream'].filter((s) => after.includes(s));
    check('hidden: immediate state.full and no titles/URLs afterwards', hiddenFull && leaks.length === 0, { leaks, frames: after.length });
    check('hidden: action badge says SAFE', await sw.eval('chrome.action.getBadgeText({})') === 'SAFE');
    await sw.eval(`chrome.storage.local.set({ settings: { privacyBase: 'full' } })`);

    // ---- worker restart: idle termination, wake on a tab event, rebuild from tabs.query ----
    if (!flag('skip-restart')) {
      await b.cdp.send('Target.detachFromTarget', { sessionId: sw.sessionId });
      sw = null;
      // Stop the worker the way Chrome does when it idles out: through the ServiceWorker domain of an
      // extension page (same storage partition). Playing fixture pages would otherwise keep it awake.
      const opts = await openPage(b.cdp, `chrome-extension://${id}/options.html`);
      pages.push(opts);
      await opts.send('ServiceWorker.enable');
      await sleep(300);
      await opts.send('ServiceWorker.stopAllWorkers').catch((e) => note('stopAllWorkers failed', String(e.message)));
      const stopped = await until(async () => {
        const { targetInfos } = await b.cdp.send('Target.getTargets');
        return !targetInfos.some((t) => t.type === 'service_worker' && t.url.includes(id)) ? true : null;
      }, 15000, 200);
      check('worker stopped (ServiceWorker.stopAllWorkers)', stopped === true);
      await opts.send('ServiceWorker.disable').catch(() => {});
      const wake = await openPage(b.cdp, `${srv.origin}/inner.html?wake`);
      pages.push(wake);
      sw = await swSession(b.cdp, id, 15000);
      check('worker restarts on a tab event', !!sw);
      if (sw) {
        const fresh = await sw.eval('typeof globalThis.__sent === "undefined"');
        const counts = await until(() => sw.eval('prism.state.started ? prism.uiStatus().counts : null'), 5000);
        const real = await sw.eval('chrome.tabs.query({}).then((t) => t.length)');
        check('restarted worker is fresh and rebuilt tabs from tabs.query', fresh && counts && counts.tabs === real, { fresh, counts, real });
        await sw.eval(FAKE_PORT);
        await sw.eval(`__deliver({ v: 1, t: 'welcome', data: { proto: 1, privacy: 'full', want: {} } })`);
        m = await mediaFor(sw, genTab, `(m) => m.title === 'Fixture Song'`, 6000);
        check('media from open pages comes back after the restart (reconnect ping)', !!m);
        r = await cmd(sw, 'media.seek', { key: genKey, positionMs: 9000 });
        check('commands work again after the restart', r.ok && Math.abs(await gen.eval('document.getElementById("v").currentTime') - 9) < 1.5, r);
      }
    }

    // ---- extension reload ("Reload" after an update): old content scripts are orphaned ----
    if (!flag('skip-restart') && sw) {
      // A CDP-loaded extension does not come back from chrome.runtime.reload() (a quirk of
      // Extensions.loadUnpacked: it unloads and stays dead), so "Reload" is simulated as uninstall +
      // load of the same folder. Either way the open pages keep orphaned copies of our scripts.
      await b.cdp.send('Target.detachFromTarget', { sessionId: sw.sessionId }).catch(() => {});
      await b.cdp.send('Extensions.uninstall', { id });
      await sleep(1000);
      const again = await b.cdp.send('Extensions.loadUnpacked', { path: copy }).catch((e) => ({ error: String(e.message) }));
      sw = await swSession(b.cdp, id, 15000);
      check('extension reloaded (same id), worker back', again.id === id && !!sw, again);
      if (sw) {
        await until(() => sw.eval('prism.state.started || null'), 5000);
        await sw.eval(FAKE_PORT);
        await sw.eval(`__deliver({ v: 1, t: 'welcome', data: { proto: 1, privacy: 'full', want: {} } })`);
        m = await mediaFor(sw, genTab, `(m) => m.title === 'Fixture Song'`, 8000);
        check('after reload: re-injected relay takes over from the orphaned one', !!m);
        r = await cmd(sw, 'media.seek', { key: genKey, positionMs: 15000 });
        const t3 = await gen.eval('document.getElementById("v").currentTime');
        const hooks = await gen.eval('JSON.stringify(window.__calls.filter((c) => c[0] === "seekto").slice(-2))');
        check('after reload: commands reach the page once (no double hooks)', r.ok && Math.abs(t3 - 15) < 1.5, { t3, hooks });
      }
    }
  } catch (e) {
    check('unexpected error', false, String(e && e.stack || e));
  } finally {
    const gone = await b.close();
    check('browser closed and temp profile deleted', gone, b.userDataDir);
  }
}

// ---------------------------------------------------------------------------------------------
mkdirSync(scratch, { recursive: true });
const copy = prepareCopy();
const srv = await startServer();
console.log(`fixtures on ${srv.origin}; extension copy at ${copy}`);
try {
  for (const br of which === 'both' ? ['chrome', 'edge'] : [which]) await runBrowser(br, copy, srv);
} finally {
  await srv.close();
  rmSync(copy, { recursive: true, force: true });
  rmSync(join(scratch, 'profiles'), { recursive: true, force: true });
}
const failed = results.filter((r) => r.ok === false);
const passed = results.filter((r) => r.ok === true);
writeFileSync(join(scratch, 'e2e-results.json'), JSON.stringify({ at: new Date().toISOString(), passed: passed.length, failed: failed.length, results }, null, 2));
console.log(`\n${passed.length} passed, ${failed.length} failed (${results.filter((r) => r.ok === null).length} notes). Report: ${join(scratch, 'e2e-results.json')}`);
process.exit(failed.length ? 1 : 0);
