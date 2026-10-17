import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageStore, dataUrlBytes, MISS_RETRY_MS } from '../../src/background/images.js';
import { fakeCodec } from '../helpers/fake-chrome.mjs';
import { flush as microFlush } from '../helpers/fake-clock.mjs';

// crypto.subtle.digest settles on the thread pool, so give it a few real milliseconds.
const flush = async () => { await microFlush(); await new Promise((r) => setTimeout(r, 25)); await microFlush(); };

const PNG = (tag) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode(tag)]);

function rig({ favicon, url, canFetch = () => false } = {}) {
  let now = 1000;
  const deferred = [];
  const ready = [];
  const store = new ImageStore({
    codec: fakeCodec,
    fetchFavicon: async (page) => (page.includes('default.invalid') ? PNG('GLOBE') : favicon(page)),
    fetchUrl: async (u) => (url ? url(u) : null),
    canFetch,
    now: () => now,
    defer: (fn, ms) => deferred.push({ fn, ms }),
    onReady: (kind, ref) => ready.push([kind, ref]),
  });
  return { store, deferred, ready, tick: (ms) => { now += ms; } };
}

test('favicons: content-addressed, cached, default globe rejected', async () => {
  const { store, ready } = rig({ favicon: (p) => (p.includes('globe.example') ? PNG('GLOBE') : PNG('icon-' + new URL(p).hostname)) });
  const tab = { url: 'https://video.example/watch', favIconUrl: 'https://video.example/favicon.ico' };
  assert.equal(store.iconFor(tab), null, 'first lookup queues a fetch');
  await flush();
  const ref = store.iconFor(tab);
  assert.match(ref, /^fav:[0-9a-f]{16}$/);
  assert.deepEqual(ready[0], ['fav', ref]);
  assert.equal(store.get(ref).w, 32);
  assert.equal(store.iconFor({ url: 'https://globe.example/' }), null);
  await flush();
  assert.equal(store.iconFor({ url: 'https://globe.example/' }), null, 'the browser default globe is not an icon');
  assert.equal(store.iconFor({ url: 'chrome://settings' }), null);
});

test('favicons: a miss is retried once early, then at most every 30 s', async () => {
  let have = false;
  const { store, deferred, ready, tick } = rig({ favicon: () => (have ? PNG('late') : PNG('GLOBE')) });
  const tab = { url: 'https://new.example/' };
  store.iconFor(tab);
  await flush();
  assert.equal(store.iconFor(tab), null);
  assert.equal(deferred.length, 1, 'one early retry scheduled');
  have = true;
  deferred[0].fn();
  assert.deepEqual(ready.at(-1), ['fav-retry', undefined]);
  store.iconFor(tab);
  await flush();
  assert.match(store.iconFor(tab), /^fav:/);
  // A permanent miss: no hammering.
  const t2 = { url: 'https://never.example/' };
  have = false;
  store.iconFor(t2); await flush();
  deferred.at(-1).fn(); store.iconFor(t2); await flush();
  const n = deferred.length;
  assert.equal(store.iconFor(t2), null);
  await flush();
  tick(MISS_RETRY_MS - 1); assert.equal(store.iconFor(t2), null);
  tick(2); store.iconFor(t2); await flush();
  assert.equal(deferred.length, n, 'no more early retries after the first');
});

test('favicons: page favicon URL fallback only with host permission', async () => {
  const { store } = rig({ favicon: () => PNG('GLOBE'), url: () => PNG('direct'), canFetch: (u) => u.startsWith('https://granted.example/') });
  store.iconFor({ url: 'https://granted.example/', favIconUrl: 'https://granted.example/i.png' });
  store.iconFor({ url: 'https://other.example/', favIconUrl: 'https://other.example/i.png' });
  await flush();
  assert.match(store.iconFor({ url: 'https://granted.example/', favIconUrl: 'https://granted.example/i.png' }), /^fav:/);
  assert.equal(store.iconFor({ url: 'https://other.example/', favIconUrl: 'https://other.example/i.png' }), null);
});

test('artwork from content scripts is validated', async () => {
  const { store } = rig({ favicon: () => null });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64');
  assert.match(await store.putArtFromContent('blob:x', { b64: jpeg, w: 100, h: 100 }, 288), /^art:/);
  assert.equal(await store.putArtFromContent('blob:y', { b64: jpeg, w: 999, h: 100 }, 288), null, 'over the size cap');
  assert.equal(await store.putArtFromContent('blob:z', { b64: Buffer.from('<svg/>').toString('base64'), w: 10, h: 10 }, 288), null, 'not PNG/JPEG');
  assert.equal(await store.putArtFromContent('blob:w', { b64: 'A'.repeat(200 * 1024), w: 10, h: 10 }, 288), null, 'over 96 KB');
  assert.equal(dataUrlBytes('data:image/png;base64,' + 'A'.repeat(100), 10), null);
  assert.equal(dataUrlBytes('data:text/html,<b>x</b>', 100), null);
});
