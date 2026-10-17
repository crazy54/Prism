import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/background/app.js';
import { SCRIPT_MAIN, SCRIPT_ISOLATED } from '../../src/background/grants.js';
import { fakeCodec, fakeFetch } from '../helpers/fake-chrome.mjs';
import { makeApp, welcome, command, contentPort, mediaEntry, flush } from '../helpers/harness.mjs';

test('a restarted service worker rebuilds everything from tabs.query and re-pings content scripts', async () => {
  const env = await makeApp();
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await welcome(env);
  await env.clock.advance(500);
  // The worker dies (the port closes with it) and Chrome starts a new one on the next event.
  env.chrome.port.disconnect();
  env.chrome.calls.length = 0;
  const app2 = createApp({ chrome: env.chrome, clock: env.clock, codec: fakeCodec, fetch: fakeFetch(), random: () => 0.5 });
  // listeners from the dead worker would not exist in reality; clear them
  for (const ns of ['tabs', 'windows', 'runtime', 'permissions', 'alarms', 'storage']) {
    for (const v of Object.values(env.chrome[ns])) if (v && v.listeners) v.listeners.length = 0;
  }
  app2.listen();
  await app2.init();
  await flush();
  assert.equal(app2.store.tabs.size, 3);
  const pinged = env.chrome.calls.filter((c) => c[0] === 'tabs.sendMessage');
  assert.deepEqual(pinged.map((c) => c[1]), [13], 'only granted tabs are asked to reconnect');
  assert.equal(pinged[0][2].t, 'prism.reconnect');
  welcome({ chrome: env.chrome, clock: env.clock });
  await flush();
  const full = env.chrome.port.ofType('state.full')[0];
  assert.deepEqual(full.data.tabs.map((t) => t.id).sort(), [11, 12, 13]);
  // The content script reconnects with a full snapshot.
  const p = contentPort({ chrome: env.chrome }, 13);
  p.send({ t: 'snap', entries: [mediaEntry()] });
  await env.clock.advance(50);
  assert.ok(env.chrome.port.ofType('media.update').some((m) => m.data.upsert.some((x) => x.key === '13:0')));
});

test('granting a site registers MAIN + ISOLATED scripts and injects into open tabs', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const reg = env.chrome.scripting.registered;
  assert.deepEqual([...reg.keys()].sort(), [SCRIPT_ISOLATED, SCRIPT_MAIN].sort());
  const main = reg.get(SCRIPT_MAIN);
  assert.equal(main.world, 'MAIN');
  assert.equal(main.runAt, 'document_start');
  assert.equal(main.allFrames, true);
  assert.deepEqual(main.matches, ['https://video.example/*']);
  const inj = env.chrome.calls.filter((c) => c[0] === 'scripting.executeScript');
  assert.deepEqual(inj.map((c) => [c[1].target.tabId, c[1].world]), [[13, 'MAIN'], [13, 'ISOLATED']], 'only the tab on the new origin');
  const ev = env.chrome.port.ofType('event').find((m) => m.data.kind === 'permissionAdded');
  assert.ok(ev && ev.data.caps.grantedOrigins.includes('https://video.example/*'));
  await env.clock.advance(200);
  const tab13 = env.chrome.port.ofType('tabs.delta').flatMap((m) => m.data.upsert).find((t) => t.id === 13 && t.access);
  assert.equal(tab13.access, 'granted', 'the tab now reports access');
  // Revoking the last origin unregisters both scripts.
  await env.chrome.permissions.remove({ origins: ['https://video.example/*'] });
  await flush();
  assert.equal(reg.size, 0);
});

test('tab events: create, move, activate, discard, replace, window close', async () => {
  const env = await makeApp();
  await welcome(env);
  await env.clock.advance(300);
  const t = env.chrome._addTab({ id: 40, url: 'https://new.example/', title: 'New' });
  await env.clock.advance(200);
  assert.ok(env.app.store.tabs.has(40));
  await env.chrome.tabs.update(40, { active: true });
  await env.clock.advance(200);
  const last = env.chrome.port.ofType('tabs.delta').at(-1).data;
  assert.equal(last.activeByWindow[1], 40);
  env.chrome._updateTab(40, { discarded: true, status: 'unloaded' });
  await env.clock.advance(200);
  assert.equal(env.app.store.tabs.get(40).discarded, true);
  env.chrome._tabs.delete(40);
  env.chrome._addTab({ id: 41, url: 'https://new.example/', title: 'New' });
  env.chrome.tabs.onReplaced.dispatch(41, 40);
  await env.clock.advance(200);
  assert.ok(!env.app.store.tabs.has(40) && env.app.store.tabs.has(41));
  env.chrome.windows.onRemoved.dispatch(1);
  await env.clock.advance(200);
  const d = env.chrome.port.ofType('tabs.delta').at(-1).data;
  assert.ok(d.windows.remove.includes(1));
  assert.ok(d.remove.includes(11) && d.remove.includes(41));
  assert.equal(t.id, 40);
});

test('multiple windows and focus', async () => {
  const env = await makeApp();
  const w2 = env.chrome._addWindow({});
  env.chrome.windows.onCreated.dispatch(w2);
  env.chrome._addTab({ id: 60, windowId: w2.id, active: true, url: 'https://two.example/' });
  await welcome(env);
  await env.clock.advance(300);
  env.chrome.windows.onFocusChanged.dispatch(w2.id);
  await env.clock.advance(300);
  assert.equal(env.app.store.focusedWindow, w2.id);
  assert.equal(env.app.store.activeTab().id, 60);
  const ev = env.chrome.port.ofType('event').filter((m) => m.data.kind === 'focusChanged').at(-1);
  assert.equal(ev.data.windowId, w2.id);
  env.chrome.windows.onFocusChanged.dispatch(-1);
  await env.clock.advance(300);
  assert.equal(env.chrome.port.ofType('tabs.delta').at(-1).data.focusedWindow, -1, 'browser lost focus');
});

test('profile label and uid travel in hello; label changes raise an event', async () => {
  const env = await makeApp({ settings: { profileLabel: 'Work' } });
  const hello = env.chrome.port.ofType('hello')[0].data;
  assert.equal(hello.profile.label, 'Work');
  assert.match(hello.profile.uid, /^[0-9a-f]{32}$/);
  assert.equal(hello.browser.brand, 'Chrome');
  assert.equal(hello.ext.id, 'ebbfhlgndibiinpfkhcacipfkoeokcgn');
  await welcome(env);
  await env.chrome.storage.local.set({ settings: { profileLabel: 'Streaming PC' } });
  await flush();
  const ev = env.chrome.port.ofType('event').find((m) => m.data.kind === 'profile');
  assert.equal(ev.data.profile.label, 'Streaming PC');
  const env2 = await makeApp({ settings: { profileLabel: 'Work' } });
  assert.notEqual(env2.chrome.port.ofType('hello')[0].data.profile.uid, hello.profile.uid, 'uid is random per profile');
});

test('Edge brand detection', async () => {
  const { detectBrowser } = await import('../../src/background/app.js');
  assert.deepEqual(detectBrowser({ userAgentData: { brands: [{ brand: 'Microsoft Edge', version: '155' }, { brand: 'Chromium', version: '155' }] } }), { brand: 'Edge', major: 155 });
  assert.deepEqual(detectBrowser({ userAgentData: { brands: [{ brand: 'Chromium', version: '150' }] } }), { brand: 'Chromium', major: 150 });
});

test('downloads: initial search, onChanged, 1 Hz poll while active', async () => {
  const env = await makeApp({ chromeOpts: { optionalApis: ['downloads'], permissions: ['tabs', 'downloads'] } });
  await welcome(env);
  const d = env.chrome.downloads;
  d.items.set(1, { id: 1, state: 'in_progress', filename: 'C:\\D\\a.zip', url: 'https://files.example/a', bytesReceived: 0, totalBytes: 1000, danger: 'safe' });
  d.onCreated.dispatch(d.items.get(1));
  await env.clock.advance(200);
  for (let i = 1; i <= 3; i++) { d.items.get(1).bytesReceived = i * 100; await env.clock.advance(1000); }
  const ups = env.chrome.port.ofType('downloads.update').flatMap((m) => m.data.upsert).filter((x) => x.id === 1 && x.bytes !== undefined);
  assert.deepEqual(ups.map((x) => x.bytes), [0, 100, 200, 300]);
  d.items.get(1).state = 'complete';
  d.onChanged.dispatch({ id: 1, state: { current: 'complete', previous: 'in_progress' } });
  await env.clock.advance(2000);
  const last = env.chrome.port.ofType('downloads.update').at(-1).data.upsert[0];
  assert.equal(last.state, 'complete');
  const polls = env.chrome.port.ofType('downloads.update').length;
  await env.clock.advance(5000);
  assert.equal(env.chrome.port.ofType('downloads.update').length, polls, 'polling stops when nothing is active');
});

test('img.get only resends images that are referenced and visible', async () => {
  const env = await makeApp();
  await welcome(env);
  await env.clock.advance(300);
  // Favicon hashing settles on the thread pool: under load the first favicon can take a few real milliseconds.
  for (let i = 0; i < 80 && env.chrome.port.ofType('img').length === 0; i++) { await new Promise((res) => setTimeout(res, 25)); await env.clock.advance(100); }
  const fav = env.chrome.port.ofType('img')[0].data.id;
  const r = await command(env, 'img.get', { ids: [fav, 'fav:ffffffffffffffff'] });
  assert.deepEqual([r.data.sent, r.data.missing], [1, ['fav:ffffffffffffffff']]);
});
