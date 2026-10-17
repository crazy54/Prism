// Regression tests for the browser-stack review (aaa-prism-play/review-browser/REPORT.md). Each test proves the
// FIXED behavior; the reviewer's own repros (review-browser/repro/ext) now fail their bug assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { tabView, makeContext, effectiveLevel } from '../../src/background/privacy.js';
import { createApp } from '../../src/background/app.js';
import { NativeConnection } from '../../src/background/connection.js';
import { LIMITS } from '../../src/shared/protocol.js';
import { createFakeChrome, fakeCodec, fakeFetch, FakeContentPort } from '../helpers/fake-chrome.mjs';
import { FakeClock } from '../helpers/fake-clock.mjs';
import { makeApp, welcome, command, contentPort, mediaEntry, flush, SECRET } from '../helpers/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISOLATED = fs.readFileSync(path.join(HERE, '../../media-isolated.js'), 'utf8');
const raw = (url, title, id = 31) => ({ id, win: 1, idx: 4, active: false, pinned: false, audible: false, muted: false, title, url, status: 'complete', group: -1, split: -1 });
const mediaTitles = (env) => env.chrome.port.sent
  .filter((m) => m.t === 'media.update' || m.t === 'state.full')
  .flatMap((m) => (m.t === 'state.full' ? m.data.media : m.data.upsert))
  .map((x) => x.title).filter(Boolean);

// ---------------------------------------------------------------- HIGH 2: Tab.host
test('HIGH 2: Tab.host carries the full host name at full only; domain stays the registrable domain', () => {
  const chat = raw('https://app.chat.example/c/1', '(5) Team Chat');
  const full = tabView(chat, makeContext({ level: 'full' }));
  assert.equal(full.host, 'app.chat.example', 'Site Watch can match the sub-domain');
  assert.equal(full.domain, 'chat.example');
  assert.equal(tabView(raw('https://Mail.Example.co.uk./inbox', 'x'), makeContext({ level: 'full' })).host, 'mail.example.co.uk', 'lower case, no trailing dot');
  assert.equal(tabView(chat, makeContext({ level: 'domain' })).host, null, 'domain level: no host');
  assert.equal(tabView(chat, makeContext({ level: 'domain' })).domain, 'chat.example');
  assert.equal(tabView(chat, makeContext({ level: 'hidden' })).host, null);
  assert.equal(tabView(chat, makeContext({ level: 'full', alwaysHidden: ['chat.example'] })).host, null, 'always-hidden: no host');
  assert.equal(tabView(raw('chrome://settings/', 'Settings'), makeContext({ level: 'full' })).host, null, 'non-web pages: no host');
});

// ---------------------------------------------------------------- LOW 11: unread of always-hidden sites
test('LOW 11: always-hidden sites send no unread count at any level; other tabs keep theirs', () => {
  for (const level of ['full', 'domain', 'hidden']) {
    const ctx = makeContext({ level, alwaysHidden: ['clinic.example'] });
    const v = tabView(raw('https://portal.clinic.example/results', 'Lab results (127)'), ctx);
    assert.equal(v.unread, null, `${level}: no number from an always-hidden title`);
    assert.equal(v.hidden, 'all');
    assert.equal(tabView(raw('https://mail.example/inbox', '(3) Inbox'), ctx).unread, 3, `${level}: ordinary unread kept`);
  }
});

// ---------------------------------------------------------------- privacySettings
test('privacySettings {base, whileStreaming, alwaysHidden count} travel in hello and in every state.full; never the list', async () => {
  const env = await makeApp({ settings: { privacyBase: 'domain', whileStreaming: 'hidden', alwaysHidden: ['bank.example', 'clinic.example'] } });
  const hello = env.chrome.port.ofType('hello')[0].data;
  assert.deepEqual(hello.privacySettings, { base: 'domain', whileStreaming: 'hidden', alwaysHidden: 2 });
  await welcome(env);
  const full = env.chrome.port.ofType('state.full').at(-1).data;
  assert.deepEqual(full.privacySettings, { base: 'domain', whileStreaming: 'hidden', alwaysHidden: 2 });
  assert.ok(!JSON.stringify(env.chrome.port.sent).includes('clinic.example'), 'the always-hidden list itself never leaves');
});

// ---------------------------------------------------------------- MED 8: "while streaming: don't change"
test('MED 8: whileStreaming "full" means a streaming app does not change this browser', async () => {
  assert.equal(effectiveLevel({ base: 'full', deck: 'full', streaming: true, whileStreaming: 'full' }), 'full');
  assert.equal(effectiveLevel({ base: 'domain', deck: 'full', streaming: true, whileStreaming: 'full' }), 'domain');
  const env = await makeApp({ settings: { whileStreaming: 'full' } });
  await welcome(env);
  env.chrome.port.deliver({ v: 1, t: 'streaming', data: { active: true, app: 'obs64.exe' } });
  await env.clock.advance(300);
  assert.equal(env.app.state.level, 'full');
  assert.equal(env.chrome.action.badge, '', 'no SAFE badge');
  assert.ok(env.chrome.port.ofType('state.full').every((m) => m.data.privacy === 'full'));
});

// ---------------------------------------------------------------- HIGH 3: page.scroll without media
/** A content-script stand-in that connects a port when asked (`prism.reconnect {open:true}`). */
function scriptsOnDemand(env, { present = () => true } = {}) {
  const opened = [];
  env.chrome.onTabMessage = (tabId, msg, opts) => {
    if (!present(tabId)) throw new Error('Could not establish connection. Receiving end does not exist.');
    if (msg && msg.t === 'prism.reconnect' && msg.open === true) {
      const frameId = opts && Number.isInteger(opts.frameId) ? opts.frameId : 0;
      const p = new FakeContentPort(env.chrome, { tabId, frameId });
      p.autoReply = (cmd) => (cmd.op === 'scroll' ? { ok: true, data: { scrolled: cmd.args.dy, atTop: false, atBottom: false } } : null);
      opened.push(p);
      queueMicrotask(() => env.chrome.runtime.onConnect.dispatch(p));
    }
    return undefined;
  };
  return opened;
}

test('HIGH 3: page.scroll on a granted page WITHOUT media opens the port on demand and scrolls', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://mail.example/*'] });   // tab 12 (no media)
  await flush();
  const opened = scriptsOnDemand(env);
  const r = await command(env, 'page.scroll', { tabId: 12, dy: 240 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.scrolled, 240);
  assert.equal(opened.length, 1, 'one port, opened on request');
  const ask = env.chrome.calls.find((c) => c[0] === 'tabs.sendMessage' && c[2] && c[2].open === true);
  assert.deepEqual([ask[1], ask[3]], [12, { frameId: 0 }], 'asked the top frame of that tab only');
  // The next tick goes straight through the now-open port.
  const r2 = await command(env, 'page.scroll', { tabId: 12, dy: -48 });
  assert.equal(r2.data.scrolled, -48);
  assert.equal(opened.length, 1);
  assert.equal(env.chrome.port.ofType('media.update').length, 0, 'an opened port with no media reports nothing');
});

test('HIGH 3: no script in the page yet -> it is injected, asked again, and the scroll works', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://mail.example/*'] });
  await flush();
  env.chrome.calls.length = 0;
  const injected = () => env.chrome.calls.some((c) => c[0] === 'scripting.executeScript' && c[1].target.tabId === 12);
  scriptsOnDemand(env, { present: () => injected() });
  const r = await command(env, 'page.scroll', { tabId: 12, dy: 96 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.scrolled, 96);
  assert.ok(injected(), 'injected once the first ask found no receiver');
});

test('HIGH 3: the isolated script opens its port without media exactly when asked', () => {
  const f = isolatedFrame({ entries: [] });
  f.inject();
  f.message({ t: 'prism.reconnect' });
  assert.equal(f.connects, 0, 'lazy: no media, no ask, no port');
  f.message({ t: 'prism.reconnect', open: true });
  assert.equal(f.connects, 1, 'opened on request');
  f.message({ t: 'prism.reconnect', open: true });
  assert.equal(f.connects, 1, 'not twice');
});

// ---------------------------------------------------------------- MED 6: the PiP key
test('MED 6: the isolated script arms the PiP key the plugin names (F13-F24) and ignores others', () => {
  const f = isolatedFrame({ entries: [] });
  f.inject();
  f.message({ t: 'prism.reconnect', open: true });
  f.cmd({ t: 'cmd', id: 5, op: 'pip', sub: null, args: { mode: 'enter', via: 'gesture', pipKey: 'F21' } });
  const res = f.posted.find((m) => m.t === 'res' && m.id === 5);
  assert.deepEqual(res.data, { armed: true, key: 'F21', expiresInMs: 3000 });
  f.key('keydown', { key: 'F24', code: 'F24', keyCode: 135, isTrusted: true });
  assert.equal(f.toMain.filter((m) => m.op === 'pip.now').length, 0, 'F24 is not the armed key');
  f.key('keydown', { key: 'F21', code: 'F21', keyCode: 132, isTrusted: false });
  assert.equal(f.toMain.filter((m) => m.op === 'pip.now').length, 0, 'untrusted events never count');
  f.key('keydown', { key: 'F21', code: 'F21', keyCode: 132, isTrusted: true });
  assert.equal(f.toMain.filter((m) => m.op === 'pip.now').length, 1, 'the armed key enters PiP');
  // A bad key falls back to F24 in the page (the worker already refused it with bad_args).
  f.cmd({ t: 'cmd', id: 6, op: 'pip', sub: null, args: { mode: 'enter', via: 'gesture', pipKey: 'Enter' } });
  assert.equal(f.posted.find((m) => m.t === 'res' && m.id === 6).data.key, 'F24');
});

// ---------------------------------------------------------------- MED 4: revoked sites
test('MED 4: a revoked site stops reporting and is no longer controllable', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = () => ({ ok: true, data: { state: 'paused' } });
  p.send({ t: 'snap', entries: [mediaEntry({ title: 'Before Revoke' })] });
  await env.clock.advance(300);
  assert.ok(mediaTitles(env).includes('Before Revoke'));
  const mark = env.chrome.port.sent.length;

  await env.chrome.permissions.remove({ origins: ['https://video.example/*'] });
  await flush(); await env.clock.advance(300);
  assert.equal(p.connected, false, 'the worker closed the revoked frame\'s port');
  const removed = env.chrome.port.sent.slice(mark).filter((m) => m.t === 'media.update').flatMap((m) => m.data.remove);
  assert.ok(removed.includes('13:0'), 'its media entry left the deck');
  p.send({ t: 'snap', entries: [mediaEntry({ title: 'After Revoke' })] });   // the orphaned script keeps talking
  await env.clock.advance(300);
  assert.ok(!mediaTitles(env).includes('After Revoke'), 'nothing it says reaches the plugin');
  const r = await command(env, 'media.pause', { key: '13:0' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'no_host_permission');
  // It reconnects (its document still runs the old script): refused.
  const again = contentPort(env, 13);
  assert.equal(again.connected, false, 'a reconnect from the revoked page is refused');
});

test('MED 4: a frame that lost access is refused by the command path too (revocation seen only there)', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = () => ({ ok: true, data: { state: 'paused' } });
  // The grant disappears without a permissions event reaching us yet (e.g. a policy change): only grants.refresh knows.
  env.app.grants.origins = [];
  const r = await command(env, 'media.pause', { key: '13:0' });
  assert.equal(r.error.code, 'no_host_permission');
  assert.equal(p.connected, false);
  assert.equal(p.received.filter((m) => m.t === 'cmd').length, 0, 'the command never reached the page');
});

// ---------------------------------------------------------------- MED 9: huge tab counts
test('MED 9: img.get checks references without rebuilding views; the media flush builds media views only', async () => {
  const env = await makeApp();
  await welcome(env);
  await env.clock.advance(300);
  // Count only the builds made inside the code under test (favicon hashing finishes on the thread pool and may
  // legitimately trigger other flushes at any time).
  let counting = false;
  const calls = [];
  const pub = env.app.publisher;
  const orig = pub.buildViews;
  pub.buildViews = (opts) => { if (counting) calls.push(opts && opts.only ? opts.only : 'all'); return orig(opts); };
  // Favicon hashing settles on the thread pool: wait (real time) until the first favicon went out.
  for (let i = 0; i < 80 && env.chrome.port.ofType('img').length === 0; i++) { await new Promise((res) => setTimeout(res, 25)); await env.clock.advance(100); }
  const fav = env.chrome.port.ofType('img')[0].data.id;
  const ids = [fav, ...Array.from({ length: 31 }, (_, i) => `fav:${String(i).padStart(16, '0')}`)];
  counting = true;
  const pending = env.app.handlers['img.get']({ ids });   // the handler runs synchronously up to its result
  counting = false;
  const r = await pending;
  assert.equal(r.sent, 1);
  assert.equal(r.missing.length, 31);
  assert.deepEqual(calls, [], 'no view was rebuilt for 32 ids');
  assert.equal((await command(env, 'img.get', { ids: [fav] })).data.sent, 1, 'and through the dispatcher');
  const flushMedia = pub.flushMedia.bind(pub);
  pub.flushMedia = () => { counting = true; try { flushMedia(); } finally { counting = false; } };
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.send({ t: 'snap', entries: [mediaEntry()] });
  await env.clock.advance(30);
  assert.ok(env.chrome.port.ofType('media.update').length >= 1);
  assert.ok(calls.length >= 1 && calls.every((c) => c === 'media'), `media flushes built: ${calls.join(',')}`);
});

// ---------------------------------------------------------------- MED 10: no hello before init
test('MED 10: no hello before init; the first hello carries the stored uid and the user\'s level', async () => {
  const chrome = createFakeChrome();
  await chrome.storage.local.set({ profileUid: 'a'.repeat(32), settings: { privacyBase: 'hidden' } });
  const app = createApp({ chrome, clock: new FakeClock(), codec: fakeCodec, fetch: fakeFetch(), navigator: { userAgentData: { brands: [] } } });
  app.listen();
  const initDone = app.init();
  chrome.runtime.onStartup.dispatch();          // Chrome fires it on the worker's first turn
  assert.equal(chrome.nativePorts.length, 0, 'onStartup waits for init');
  await initDone;
  await flush();
  const hellos = chrome.nativePorts.flatMap((p) => p.ofType('hello'));
  assert.ok(hellos.length >= 1);
  assert.equal(hellos[0].data.profile.uid, 'a'.repeat(32));
  assert.equal(hellos[0].data.privacy, 'hidden');
  assert.equal(chrome.nativePorts.length, 1, 'one connection');
});

test('MED 10: NativeConnection posts no hello while the app is not ready, then says hello once it is', async () => {
  const chrome = createFakeChrome();
  const clock = new FakeClock();
  let ready = false;
  const conn = new NativeConnection({ chrome, hostName: 'h', clock, hello: () => (ready ? { proto: 1, profile: { uid: 'b'.repeat(32) } } : null), onWelcome() {}, onMessage() {}, onSessionEnd() {} });
  conn.connectIfDue();
  assert.equal(chrome.port.ofType('hello').length, 0);
  ready = true;
  conn.helloNow();
  assert.equal(chrome.port.ofType('hello').length, 1);
  conn.helloNow();
  assert.equal(chrome.port.ofType('hello').length, 1, 'not twice');
  assert.equal(chrome.port.ofType('hello')[0].data.profile.uid, 'b'.repeat(32));
});

// ---------------------------------------------------------------- LOW 15: preview re-verification
async function previewRig(alwaysHidden) {
  const env = await makeApp({ settings: { alwaysHidden } });
  env.chrome._grant({ origins: ['<all_urls>'] });
  await welcome(env);
  await flush();
  return env;
}

test('LOW 15: the preview drops a frame when the window switched to an always-hidden tab during the capture', async () => {
  const env = await previewRig(['mail.example']);       // tab 11 (active) is fine; tab 12 is always-hidden
  env.chrome.onCapture = async () => { await env.chrome.tabs.update(12, { active: true }); };
  const r = await command(env, 'preview.subscribe', { windowId: 1, fps: 2, w: 200, h: 100 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  await env.clock.advance(1600);
  assert.ok(env.chrome.calls.some((c) => c[0] === 'tabs.captureVisibleTab'), 'it did capture');
  assert.equal(env.chrome.port.ofType('preview.frame').length, 0, 'no frame of what the window showed after the switch');
});

test('LOW 15 (control): a stable, ordinary active tab is previewed; an always-hidden active tab never is', async () => {
  const env = await previewRig(['clinic.example']);
  await command(env, 'preview.subscribe', { windowId: 1, fps: 2, w: 200, h: 100 });
  await env.clock.advance(1100);
  const frames = env.chrome.port.ofType('preview.frame');
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].data.tabId, 11);
  const env2 = await previewRig(['bank.example']);      // tab 11 itself is always-hidden
  await command(env2, 'preview.subscribe', { windowId: 1, fps: 2, w: 200, h: 100 });
  await env2.clock.advance(1100);
  assert.equal(env2.chrome.port.ofType('preview.frame').length, 0);
});

test('LOW 15: streamer-safe turning on during the capture drops the frame', async () => {
  const env = await previewRig([]);
  env.chrome.onCapture = async () => { env.chrome.port.deliver({ v: 1, t: 'cmd', id: 999, op: 'privacy.set', args: { level: 'domain' } }); await flush(); };
  await command(env, 'preview.subscribe', { windowId: 1, fps: 2, w: 200, h: 100 });
  await env.clock.advance(1100);
  assert.equal(env.chrome.port.ofType('preview.frame').length, 0);
});

// ---------------------------------------------------------------- LOW 21: the command budget
test('LOW 21: a page command answers within the 1.7 s budget even when injection hangs', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://mail.example/*'] });
  await flush();
  env.chrome.onTabMessage = () => { throw new Error('Could not establish connection. Receiving end does not exist.'); };
  env.chrome.scripting.executeScript = () => new Promise(() => {});   // never settles
  const start = env.clock.now();
  const r = await command(env, 'page.scroll', { tabId: 12, dy: 240 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_found');
  assert.ok(r.at - start <= LIMITS.cmdBudgetMs, `answered after ${r.at - start} ms`);
});

test('LOW 21: a frozen page answers busy within the budget', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  contentPort(env, 13);                         // never answers
  const start = env.clock.now();
  const r = await command(env, 'media.play', { key: '13:0' });
  assert.equal(r.error.code, 'busy');
  assert.ok(r.at - start <= LIMITS.cmdBudgetMs);
});

// ---------------------------------------------------------------- LOW 24: undo puts the tab back in place
test('LOW 24: tab.create honours index (undo without the sessions permission)', async () => {
  const env = await makeApp();
  await welcome(env);
  const r = await command(env, 'tab.create', { url: 'https://news.example/a', windowId: 1, index: 1 });
  assert.equal(r.ok, true);
  const props = env.chrome.calls.filter((c) => c[0] === 'tabs.create').at(-1)[1];
  assert.equal(props.index, 1);
  assert.equal(props.windowId, 1);
  assert.equal((await command(env, 'tab.create', { url: 'https://news.example/b', index: -2 })).error.code, 'bad_args');
});

// ---------------------------------------------------------------- the privacy tests still hold with the new fields
test('the new fields leak nothing at hidden: no host, no unread from always-hidden, no list', async () => {
  const env = await makeApp({ settings: { privacyBase: 'hidden', alwaysHidden: ['bank.example'] } });
  await welcome(env);
  await env.clock.advance(300);
  const text = JSON.stringify(env.chrome.port.sent);
  assert.ok(!text.includes(SECRET.tabTitle) && !text.includes('mail.example') && !text.includes('bank.example'));
  const tabs = env.chrome.port.ofType('state.full').at(-1).data.tabs;
  assert.ok(tabs.every((t) => t.host === null));
});

// ---------------------------------------------------------------- vm harness for media-isolated.js
function isolatedFrame({ entries }) {
  const listeners = new Map();
  const target = (name) => ({
    addEventListener(t, fn) { (listeners.get(name + t) || listeners.set(name + t, []).get(name + t)).push(fn); },
    dispatchEvent(ev) { for (const fn of listeners.get(name + ev.type) || []) fn(ev); return true; },
  });
  const document = target('doc:');
  const window = target('win:');
  window.top = window;
  const state = { connects: 0, posted: [], toMain: [], portListeners: [], msgListeners: [] };
  const chrome = {
    runtime: {
      id: 'ebbfhlgndibiinpfkhcacipfkoeokcgn',
      connect() {
        state.connects++;
        return { onMessage: { addListener(fn) { state.portListeners.push(fn); } }, onDisconnect: { addListener() {} }, postMessage(m) { state.posted.push(JSON.parse(JSON.stringify(m))); } };
      },
      onMessage: { addListener(fn) { state.msgListeners.push(fn); } },
    },
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  document.addEventListener('prismctl:v1:i2m', (ev) => {
    const m = JSON.parse(ev.detail);
    state.toMain.push(m);
    if (m.op === 'snap') document.dispatchEvent(new CustomEvent('prismctl:v1:m2i', { detail: JSON.stringify({ t: 'snap', entries }) }));
  });
  const ctx = vm.createContext({ chrome, document, window, CustomEvent, setTimeout, clearTimeout, Date, JSON, Map, Number, getComputedStyle: () => ({ overflowY: 'auto' }) });
  ctx.globalThis = ctx;
  return {
    inject: () => vm.runInContext(ISOLATED, ctx),
    message: (m) => state.msgListeners.forEach((fn) => fn(m, { id: chrome.runtime.id })),
    cmd: (m) => state.portListeners.forEach((fn) => fn(m)),
    key: (type, e) => window.dispatchEvent({ type, preventDefault() {}, stopImmediatePropagation() {}, ...e }),
    get connects() { return state.connects; },
    get posted() { return state.posted; },
    get toMain() { return state.toMain; },
  };
}
