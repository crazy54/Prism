import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Publisher } from '../../src/background/publisher.js';
import { diffObject, diffMaps, ignoreMediaPosition } from '../../src/background/diff.js';
import { FakeClock, flush } from '../helpers/fake-clock.mjs';
import { makeApp, welcome, contentPort, mediaEntry } from '../helpers/harness.mjs';

function rig() {
  const clock = new FakeClock();
  const sent = [];
  const views = { windows: new Map(), tabs: new Map(), groups: new Map(), media: new Map(), downloads: new Map(), active: {}, focused: -1, privacy: 'full' };
  const images = new Map();
  const pub = new Publisher({
    buildViews: () => ({ ...views, windows: new Map(views.windows), tabs: new Map(views.tabs), groups: new Map(views.groups), media: new Map(views.media), downloads: new Map(views.downloads) }),
    post: (t, data) => { sent.push({ t, data: JSON.parse(JSON.stringify(data)), at: clock.now() }); return true; },
    images: { get: (id) => images.get(id) },
    clock,
  });
  return { clock, sent, views, pub, images };
}

test('diffs carry only changed fields and null for removed ones', () => {
  assert.equal(diffObject({ id: 1, a: 1 }, { id: 1, a: 1 }, 'id'), null);
  assert.deepEqual(diffObject({ id: 1, a: 1, b: 2 }, { id: 1, a: 3 }, 'id'), { id: 1, a: 3, b: null });
  const d = diffMaps(new Map([[1, { id: 1, x: 1 }], [2, { id: 2 }]]), new Map([[1, { id: 1, x: 2 }], [3, { id: 3, y: 1 }]]));
  assert.deepEqual(d, { upsert: [{ id: 1, x: 2 }, { id: 3, y: 1 }], remove: [2] });
});

test('media positions within tolerance are not resent', () => {
  const prev = { key: 'k', state: 'playing', rate: 1, positionMs: 1000, positionAt: 0 };
  assert.equal(ignoreMediaPosition('positionMs', prev, { ...prev, positionMs: 2000, positionAt: 1000 }), true, 'on track');
  assert.equal(ignoreMediaPosition('positionMs', prev, { ...prev, positionMs: 9000, positionAt: 1000 }), false, 'seeked');
  assert.equal(ignoreMediaPosition('positionMs', prev, { ...prev, state: 'paused', positionMs: 2000, positionAt: 1000 }), false, 'state changed');
});

test('tabs.delta is coalesced to <= 10 Hz under a burst of changes', async () => {
  const { clock, sent, views, pub } = rig();
  pub.start();
  sent.length = 0;
  // 300 changes over 1 s (one every ~3 ms).
  for (let i = 0; i < 300; i++) {
    views.tabs.set(1, { id: 1, title: `t${i}`, idx: 0 });
    pub.onStoreChange('tabs', { id: 1 });
    await clock.advance(3.3);
  }
  await clock.advance(500);
  const deltas = sent.filter((m) => m.t === 'tabs.delta');
  assert.ok(deltas.length >= 8 && deltas.length <= 12, `got ${deltas.length} deltas for ~1.5 s`);
  for (let i = 1; i < deltas.length; i++) assert.ok(deltas[i].at - deltas[i - 1].at >= 100, 'never closer than 100 ms');
  assert.equal(deltas.at(-1).data.upsert[0].title, 't299', 'the last value always arrives');
  assert.deepEqual(Object.keys(deltas.at(-1).data.upsert[0]).sort(), ['id', 'title'], 'only changed fields');
});

test('nothing is sent when nothing visible changed', async () => {
  const { clock, sent, views, pub } = rig();
  views.tabs.set(1, { id: 1, title: 'a' });
  pub.start();
  sent.length = 0;
  pub.onStoreChange('tabs', { id: 1 });
  await clock.advance(500);
  assert.equal(sent.length, 0);
});

test('media: <= 4 Hz per key, urgent changes go out at once', async () => {
  const { clock, sent, views, pub } = rig();
  pub.start();
  sent.length = 0;
  for (let i = 0; i < 40; i++) {
    views.media.set('1:0', { key: '1:0', state: 'playing', rate: 1, volume: i / 40, positionMs: 0, positionAt: 0 });
    pub.onStoreChange('media', { key: '1:0', urgent: false });
    await clock.advance(25);
  }
  await clock.advance(400);
  const n = sent.filter((m) => m.t === 'media.update').length;
  assert.ok(n >= 3 && n <= 6, `volume ramp over 1.4 s sent ${n} updates`);
  sent.length = 0;
  views.media.set('1:0', { ...views.media.get('1:0'), state: 'paused' });
  pub.onStoreChange('media', { key: '1:0', urgent: true });
  await clock.advance(15);
  assert.equal(sent.filter((m) => m.t === 'media.update').length, 1, 'pause is sent on the next tick');
});

test('images go out once, before the first message that references them', async () => {
  const { clock, sent, views, pub, images } = rig();
  images.set('fav:aaaaaaaaaaaaaaaa', { id: 'fav:aaaaaaaaaaaaaaaa', mime: 'image/png', w: 32, h: 32, b64: 'AA==' });
  views.tabs.set(1, { id: 1, icon: 'glyph:globe' });
  pub.start();
  sent.length = 0;
  views.tabs.set(1, { id: 1, icon: 'fav:aaaaaaaaaaaaaaaa' });
  views.tabs.set(2, { id: 2, icon: 'fav:aaaaaaaaaaaaaaaa' });
  pub.onStoreChange('tabs');
  await clock.advance(200);
  assert.deepEqual(sent.map((m) => m.t), ['img', 'tabs.delta']);
  sent.length = 0;
  pub.sendFull();
  assert.deepEqual(sent.map((m) => m.t), ['state.full'], 'not resent within a session');
  pub.stop(); pub.start();
  assert.deepEqual(sent.slice(1).map((m) => m.t), ['img', 'state.full'], 'resent for a new session');
});

test('a huge state.full is split under the 512 KB cap', async () => {
  const { sent, views, pub } = rig();
  for (let i = 0; i < 400; i++) views.tabs.set(i, { id: i, title: 'x'.repeat(512), url: 'https://example.example/' + 'y'.repeat(1900) });
  pub.start();
  const full = sent.find((m) => m.t === 'state.full');
  assert.equal(full.data.more, true);
  const rest = sent.filter((m) => m.t === 'tabs.delta');
  assert.ok(rest.length >= 1);
  assert.equal(rest.at(-1).data.more, false);
  for (const m of sent) assert.ok(JSON.stringify(m.data).length < 512 * 1024, `${m.t} under the cap`);
  const total = full.data.tabs.length + rest.reduce((n, m) => n + m.data.upsert.length, 0);
  assert.equal(total, 400);
});

test('end to end: the app coalesces real tab events and mirrors the browser', async () => {
  const env = await makeApp();
  await welcome(env);
  await env.clock.advance(300);
  const mark = env.chrome.port.sent.length;
  for (let i = 0; i < 50; i++) { env.chrome._updateTab(12, { title: `(${i + 1}) Inbox` }); await env.clock.advance(10); }
  await env.clock.advance(300);
  const deltas = env.chrome.port.sent.slice(mark).filter((m) => m.t === 'tabs.delta');
  assert.ok(deltas.length <= 7, `50 updates in 0.5 s -> ${deltas.length} deltas`);
  const last = deltas.at(-1).data.upsert.find((t) => t.id === 12);
  assert.equal(last.unread, 50);
  // Media from a content script, with a 4 Hz cap and immediate pause.
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.send({ t: 'snap', entries: [mediaEntry()] });
  await env.clock.advance(20);
  const m1 = env.chrome.port.sent.filter((m) => m.t === 'media.update').at(-1);
  assert.equal(m1.data.upsert[0].key, '13:0');
  assert.equal(m1.data.upsert[0].art.url, 'https://img.video.example/art/288.jpg', 'https art is left for the plugin to fetch');
  p.close();
  await env.clock.advance(20);
  const m2 = env.chrome.port.sent.filter((m) => m.t === 'media.update').at(-1);
  assert.deepEqual(m2.data.remove, ['13:0'], 'a frame going away removes its media');
});
