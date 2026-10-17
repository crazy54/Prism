import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StateStore, normalizeTab, tabPatchFromChange, normalizeDownload } from '../../src/background/store.js';
import { sanitizeEntry, MediaHub } from '../../src/background/media.js';
import { makeApp, welcome, flush } from '../helpers/harness.mjs';

const tab = (o) => ({ id: 1, windowId: 1, index: 0, active: false, pinned: false, mutedInfo: { muted: false }, title: 'A', url: 'https://a.example/', status: 'complete', groupId: -1, ...o });

test('normalizes tabs and change infos', () => {
  const t = normalizeTab(tab({ audible: true, mutedInfo: { muted: true }, splitViewId: 4, frozen: true }));
  assert.equal(t.muted, true); assert.equal(t.audible, true); assert.equal(t.split, 4); assert.equal(t.frozen, true);
  assert.deepEqual(tabPatchFromChange({ discarded: true }), { discarded: true, status: 'unloaded' });
  assert.deepEqual(tabPatchFromChange({ mutedInfo: { muted: true }, title: 'x' }), { title: 'x', muted: true });
  const pending = normalizeTab(tab({ url: '', pendingUrl: 'https://b.example/' }));
  assert.equal(pending.url, 'https://b.example/');
});

test('incognito never enters the store', () => {
  const s = new StateStore();
  s.upsertTab(tab({ id: 5, incognito: true }));
  s.replaceWindows([{ id: 9, incognito: true }]);
  s.upsertDownload({ id: 1, incognito: true });
  assert.equal(s.tabs.size, 0); assert.equal(s.windows.size, 0); assert.equal(s.downloads.size, 0);
});

test('window removal drops its tabs and their media; active tracking', () => {
  const s = new StateStore();
  const kinds = [];
  s.onChange((k) => kinds.push(k));
  s.replaceWindows([{ id: 1, focused: true }, { id: 2 }]);
  s.replaceTabs([tab({ id: 1, windowId: 1, active: true }), tab({ id: 2, windowId: 1 }), tab({ id: 3, windowId: 2, active: true })]);
  s.setFrameMedia(1, 0, [{ key: '1:0', tabId: 1, frameId: 0, state: 'playing' }]);
  assert.deepEqual(s.activeByWindow(), { 1: 1, 2: 3 });
  assert.equal(s.activeTab().id, 1);
  s.setActive(1, 2);
  assert.deepEqual(s.activeByWindow(), { 1: 2, 2: 3 });
  s.removeWindow(1);
  assert.deepEqual([...s.tabs.keys()], [3]);
  assert.equal(s.media.size, 0);
  assert.ok(kinds.includes('media'));
});

test('setFrameMedia replaces a frame and flags urgent changes', () => {
  const s = new StateStore();
  const ev = [];
  s.onChange((k, i) => { if (k === 'media') ev.push(i); });
  s.setFrameMedia(7, 0, [{ key: '7:0', state: 'playing', title: 'a' }, { key: '7:0:2', state: 'playing' }]);
  assert.ok(ev.every((e) => e.urgent), 'new entries are urgent');
  ev.length = 0;
  s.setFrameMedia(7, 0, [{ key: '7:0', state: 'playing', title: 'a', volume: 0.5 }]);
  assert.deepEqual(ev.map((e) => [e.key, !!e.urgent, !!e.removed]), [['7:0', false, false], ['7:0:2', true, true]]);
  s.setFrameMedia(7, 1, [{ key: '7:1', state: 'paused' }]);
  s.removeMediaForFrame(7, 0);
  assert.deepEqual([...s.media.keys()], ['7:1']);
});

test('downloads normalize without paths leaking into views', () => {
  const d = normalizeDownload({ id: 3, state: 'in_progress', filename: 'C:\\x\\y.zip', bytesReceived: 5, totalBytes: 0, estimatedEndTime: '2026-10-16T12:00:00Z' });
  assert.equal(d.total, null);
  assert.equal(d.etaAt, Date.parse('2026-10-16T12:00:00Z'));
});

test('content entries are sanitized: caps, enums, URLs, keys', () => {
  const e = sanitizeEntry({
    sub: null, kind: 'hologram', state: 'dancing', title: 'x'.repeat(5000), artist: 7, actions: ['play', 'evil', 'hangup', 'play'],
    artSrc: 'javascript:alert(1)', durationMs: -5, positionMs: NaN, rate: 99, volume: 3, chapters: new Array(100).fill({ title: 'c', startMs: 1 }),
  }, 4, 2);
  assert.equal(e.key, '4:2');
  assert.equal(e.kind, 'session-only');
  assert.equal(e.state, 'none');
  assert.equal(e.title.length, 512);
  assert.equal(e.artist, null);
  assert.deepEqual(e.actions, ['play', 'hangup']);
  assert.equal(e.artSrc, null);
  assert.equal(e.durationMs, null);
  assert.equal(e.positionMs, null);
  assert.equal(e.rate, 16);
  assert.equal(e.volume, 1);
  assert.equal(e.chapters.length, 64);
  assert.equal(sanitizeEntry({ sub: -1 }, 1, 0), null);
  assert.equal(sanitizeEntry({ sub: 3 }, 1, 0).key, '1:0:3');
  assert.equal(sanitizeEntry({ artSrc: 'data:#abc123' }, 1, 0).artSrc, 'data:#abc123');
  assert.equal(sanitizeEntry({ artSrc: 'data:image/png;base64,AAAA' }, 1, 0).artSrc, null, 'raw data: URLs are not accepted as sources');
  assert.deepEqual(MediaHub.parseKey('12:0:3'), { tabId: 12, frameId: 0, sub: 3 });
  assert.equal(MediaHub.parseKey('12'), null);
  assert.equal(MediaHub.parseKey('a:b'), null);
});

test('a page flooding its port is throttled', async () => {
  const env = await makeApp();
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const { FakeContentPort } = await import('../helpers/fake-chrome.mjs');
  const p = new FakeContentPort(env.chrome, { tabId: 13 });
  env.chrome.runtime.onConnect.dispatch(p);
  let accepted = 0;
  const orig = env.app.store.setFrameMedia.bind(env.app.store);
  env.app.store.setFrameMedia = (...a) => { accepted++; return orig(...a); };
  for (let i = 0; i < 500; i++) p.send({ t: 'snap', entries: [{ sub: null, state: i % 2 ? 'playing' : 'paused' }] });
  assert.ok(accepted <= 45, `accepted ${accepted} of 500 in one instant`);
});

test('ports from other extensions or without a tab are refused', async () => {
  const env = await makeApp();
  const { FakeContentPort } = await import('../helpers/fake-chrome.mjs');
  const foreign = new FakeContentPort(env.chrome, { tabId: 13, id: 'abcdefghijklmnopabcdefghijklmnop' });
  env.chrome.runtime.onConnect.dispatch(foreign);
  assert.equal(foreign.connected, false);
  assert.equal(env.app.media.ports.size, 0);
});
