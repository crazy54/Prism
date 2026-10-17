import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapChromeError, stepLadder } from '../../src/background/commands.js';
import { ZOOM_LADDER, SPEED_LADDER } from '../../src/shared/protocol.js';
import { makeApp, welcome, command, contentPort, flush } from '../helpers/harness.mjs';

const calls = (env, api) => env.chrome.calls.filter((c) => c[0] === api);

test('result envelope: id, ok, data / error at the top level', async () => {
  const env = await makeApp();
  await welcome(env);
  const r = await command(env, 'tab.mute', { tabId: 13, muted: true }, 17);
  assert.equal(r.v, 1); assert.equal(r.t, 'result'); assert.equal(r.id, 17); assert.equal(r.ok, true);
  assert.deepEqual(r.data, { muted: true });
  const bad = await command(env, 'tab.mute', { tabId: 'x' }, 18);
  assert.deepEqual([bad.ok, bad.error.code], [false, 'bad_args']);
  const missing = await command(env, 'tab.mute', { tabId: 4040 }, 19);
  assert.equal(missing.error.code, 'not_found');
  const unknown = await command(env, 'tab.explode', {}, 20);
  assert.equal(unknown.error.code, 'unsupported');
});

test('commands without a valid id get no answer', async () => {
  const env = await makeApp();
  await welcome(env);
  const before = env.chrome.port.ofType('result').length;
  env.chrome.port.deliver({ v: 1, t: 'cmd', id: 0, op: 'tab.mute', args: { tabId: 13 } });
  env.chrome.port.deliver({ v: 1, t: 'cmd', op: 'tab.mute', args: { tabId: 13 } });
  await env.clock.advance(100);
  assert.equal(env.chrome.port.ofType('result').length, before);
});

test('tab.focus activates, raises and reports focus within 300 ms', async () => {
  const env = await makeApp();
  await welcome(env);
  const r = await command(env, 'tab.focus', { tabId: 13 });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data).sort(), ['bounds', 'focused', 'state', 'tabId', 'windowId']);
  assert.equal(r.data.focused, true);
  assert.ok(calls(env, 'tabs.update').some((c) => c[1] === 13 && c[2].active));
  assert.ok(calls(env, 'windows.update').some((c) => c[2].focused));
  // Windows refused the foreground (no input rights): we say so, so Prism Control can use its fallback.
  env.chrome.focusBehavior = 'refuse';
  const r2 = await command(env, 'tab.focus', { tabId: 12 });
  assert.equal(r2.data.focused, false);
  const r3 = await command(env, 'tab.focus', { tabId: 12, raise: false });
  assert.equal(calls(env, 'windows.update').length, 2, 'raise:false does not touch the window');
  assert.equal(r3.ok, true);
});

test('tab and window commands map to the right chrome calls', async () => {
  const env = await makeApp();
  await welcome(env);
  assert.equal((await command(env, 'tab.mute', { tabId: 13 })).data.muted, true, 'toggle without muted');
  assert.equal((await command(env, 'tab.pin', { tabId: 12 })).data.pinned, true);
  await command(env, 'tab.reload', { tabId: 12, bypassCache: true });
  assert.deepEqual(calls(env, 'tabs.reload').at(-1), ['tabs.reload', 12, { bypassCache: true }]);
  await command(env, 'tab.back', { tabId: 12 });
  await command(env, 'tab.forward', { tabId: 12 });
  assert.equal(calls(env, 'tabs.goBack').length, 1);
  assert.equal(calls(env, 'tabs.goForward').length, 1);
  assert.equal((await command(env, 'tab.create', { url: 'javascript:alert(1)' })).error.code, 'bad_args');
  assert.equal((await command(env, 'tab.create', { url: 'file:///C:/x' })).error.code, 'bad_args');
  assert.equal((await command(env, 'tab.create', { url: 'https://new.example/' })).ok, true);
  assert.equal((await command(env, 'window.state', { windowId: 1, state: 'maximized' })).data.state, 'maximized');
  assert.equal((await command(env, 'window.state', { windowId: 1, state: 'tiny' })).error.code, 'bad_args');
  assert.equal((await command(env, 'tab.discardable', { tabId: 12, autoDiscardable: false })).data.autoDiscardable, false);
  assert.equal((await command(env, 'tab.close', { tabId: 12 })).data.closed, true);
});

test('page.zoom: factor clamps, steps walk the Chrome ladder, reset', async () => {
  assert.equal(stepLadder(ZOOM_LADDER, 1, 1), 1.1);
  assert.equal(stepLadder(ZOOM_LADDER, 1, -3), 0.75);
  assert.equal(stepLadder(ZOOM_LADDER, 4.9, 5), 5);
  assert.equal(stepLadder(SPEED_LADDER, 1, 4), 2);
  const env = await makeApp();
  await welcome(env);
  assert.equal((await command(env, 'page.zoom', { tabId: 12, factor: 9 })).data.factor, 5);
  assert.equal((await command(env, 'page.zoom', { tabId: 12, step: -1 })).data.factor, 4);
  assert.equal((await command(env, 'page.zoom', { tabId: 12, reset: true })).data.factor, 1);
  assert.equal((await command(env, 'page.zoom', { tabId: 12 })).error.code, 'bad_args');
});

test('media commands route to the frame and need host access', async () => {
  const env = await makeApp();
  await welcome(env);
  const denied = await command(env, 'media.toggle', { key: '13:0' });
  assert.equal(denied.error.code, 'no_host_permission');
  assert.equal((await command(env, 'media.toggle', { key: 'nope' })).error.code, 'bad_args');
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = (cmd) => ({ ok: true, data: { state: cmd.op === 'pause' ? 'paused' : 'playing', rate: cmd.args.rate ?? 1 } });
  assert.equal((await command(env, 'media.pause', { key: '13:0' })).data.state, 'paused');
  const rate = await command(env, 'media.rate', { key: '13:0', rate: 9 });
  assert.equal(p.received.at(-1).args.rate, 4, 'speed is clamped to the 0.25-4 ladder');
  assert.equal(rate.ok, true);
  await command(env, 'media.seek', { key: '13:0', deltaMs: -5000 });
  assert.deepEqual(p.received.at(-1).args, { deltaMs: -5000 });
  await command(env, 'media.volume', { key: '13:0', volume: 2 });
  assert.equal(p.received.at(-1).args.volume, 1);
  assert.equal((await command(env, 'media.action', { key: '13:0', action: 'rm -rf' })).error.code, 'bad_args');
  await command(env, 'media.action', { key: '13:0', action: 'togglemicrophone' });
  assert.equal(p.received.at(-1).op, 'action');
  await command(env, 'media.pip', { key: '13:0', mode: 'enter', via: 'gesture' });
  assert.deepEqual(p.received.at(-1).args, { mode: 'enter', via: 'gesture', pipKey: 'F24' }, 'the gesture key defaults to F24');
  await command(env, 'media.pip', { key: '13:0', mode: 'enter', via: 'gesture', pipKey: 'F21' });
  assert.equal(p.received.at(-1).args.pipKey, 'F21', 'the plugin may pick another F13-F24 key');
  assert.equal((await command(env, 'media.pip', { key: '13:0', via: 'gesture', pipKey: 'Enter' })).error.code, 'bad_args', 'never any other key');
  assert.equal(p.received.at(-1).sub, null);
  await command(env, 'media.mute', { key: '13:0:2', muted: true });
  assert.equal(p.received.at(-1).sub, 2, 'secondary element keys carry the element index');
  // A frozen page never answers: the plugin gets `busy`, not a hang.
  p.autoReply = null;
  const frozen = await command(env, 'media.play', { key: '13:0' });
  assert.equal(frozen.error.code, 'busy');
});

test('auto picture-in-picture switches away from the playing tab', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = () => ({ ok: true, data: { auto: true, siteHandler: false } });
  await command(env, 'tab.focus', { tabId: 12 });
  await command(env, 'tab.focus', { tabId: 13 });
  const r = await command(env, 'media.pip', { key: '13:0', via: 'auto' });
  assert.equal(r.ok, true);
  assert.equal(r.data.switchedTo, 12, 'back to the previously active tab');
});

test('page.scroll goes to the top frame of the active tab', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://bank.example/*'] });
  await flush();
  const p = contentPort(env, 11);
  p.autoReply = (cmd) => ({ ok: true, data: { scrolled: cmd.args.dy, atTop: false, atBottom: false } });
  const r = await command(env, 'page.scroll', { dy: 240 });
  assert.equal(r.data.scrolled, 240);
  assert.equal(p.received.at(-1).op, 'scroll');
});

test('optional APIs: no_permission until granted; split is unsupported without the API', async () => {
  const env = await makeApp();
  await welcome(env);
  assert.equal((await command(env, 'session.restore', {})).error.code, 'no_permission');
  assert.equal((await command(env, 'download.show', { id: 1 })).error.code, 'no_permission');
  assert.equal((await command(env, 'group.update', { groupId: 1, collapsed: true })).error.code, 'no_permission');
  assert.equal((await command(env, 'split.create', { tabIds: [11, 12] })).error.code, 'unsupported');
  const env2 = await makeApp({ chromeOpts: { split: true, optionalApis: ['sessions', 'downloads'], permissions: ['tabs', 'sessions', 'downloads'] } });
  await welcome(env2);
  assert.equal((await command(env2, 'split.create', { tabIds: [11, 13] })).data.splitViewId, 42);
  assert.ok(env2.chrome.calls.some((c) => c[0] === 'tabs.move' && c[1] === 13), 'tabs are made adjacent first');
  assert.equal((await command(env2, 'session.restore', {})).data.tabId, 999);
});

test('perm.hostRequest: toolbar request on Chrome 133+, options page fallback', async () => {
  const env = await makeApp();
  await welcome(env);
  const r = await command(env, 'perm.hostRequest', { tabId: 13 });
  assert.equal(r.data.via, 'toolbar');
  assert.deepEqual(env.chrome.calls.find((c) => c[0] === 'permissions.addHostAccessRequest')[1], { tabId: 13 });
  const env2 = await makeApp({ chromeOpts: { hostAccessRequest: false } });
  await welcome(env2);
  const r2 = await command(env2, 'perm.hostRequest', { tabId: 13 });
  assert.equal(r2.data.via, 'options');
  const created = env2.chrome.calls.find((c) => c[0] === 'tabs.create')[1];
  assert.match(created.url, /options\.html#grant=https%3A%2F%2Fvideo\.example%2F\*/);
});

test('rate limits: 60/s overall, tighter for tab.close', async () => {
  const env = await makeApp();
  await welcome(env);
  for (let i = 1; i <= 100; i++) env.chrome.port.deliver({ v: 1, t: 'cmd', id: 1000 + i, op: 'tab.mute', args: { tabId: 13, muted: true } });
  await flush();
  await env.clock.advance(10);
  const res = env.chrome.port.ofType('result').filter((r) => r.id > 1000 && r.id <= 1100);
  assert.equal(res.length, 100);
  assert.equal(res.filter((r) => r.ok).length, 60);
  assert.equal(res.filter((r) => !r.ok && r.error.code === 'rate_limited').length, 40);
  await env.clock.advance(1000);
  for (let i = 1; i <= 12; i++) env.chrome._addTab({ id: 500 + i });
  for (let i = 1; i <= 12; i++) env.chrome.port.deliver({ v: 1, t: 'cmd', id: 2000 + i, op: 'tab.close', args: { tabId: 500 + i } });
  await flush();
  await env.clock.advance(10);
  const closes = env.chrome.port.ofType('result').filter((r) => r.id > 2000);
  assert.equal(closes.filter((r) => r.ok).length, 8, 'burst of 8 closes, then rate_limited');
});

test('chrome errors map to protocol codes', () => {
  assert.equal(mapChromeError(new Error('No tab with id: 5.')).code, 'not_found');
  assert.equal(mapChromeError(new Error('Cannot access contents of url "chrome://x"')).code, 'no_host_permission');
  assert.equal(mapChromeError(new Error('This function must be called during a user gesture')).code, 'gesture_required');
  assert.equal(mapChromeError(new Error('Tabs cannot be edited right now (user may be dragging a tab).')).code, 'busy');
});

test('oversize plugin frames are refused', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome.port.deliver({ v: 1, t: 'cmd', id: 77, op: 'tab.mute', args: { tabId: 13, pad: 'x'.repeat(70 * 1024) } });
  await env.clock.advance(10);
  const r = env.chrome.port.ofType('result').find((m) => m.id === 77);
  assert.equal(r.error.code, 'bad_args');
  assert.equal(env.chrome.calls.filter((c) => c[0] === 'tabs.update' && c[2].muted).length, 0);
});
