// Builds a full app (the real service-worker code) on top of the fakes.
import { createApp } from '../../src/background/app.js';
import { createFakeChrome, fakeCodec, fakeFetch, FakeContentPort } from './fake-chrome.mjs';
import { FakeClock, flush } from './fake-clock.mjs';

export const SECRET = {
  tabTitle: 'Zephyr Tax Return 2026 - Confidential',
  tabUrl: 'https://bank.example/accounts/7781?ssn=redacted',
  mediaTitle: 'Moonlit Harbor (Unreleased Demo)',
  mediaArtist: 'Ivory Lantern Collective',
  downloadName: 'zephyr-medical-records.pdf',
  groupTitle: 'Job hunt',
  sessionTitle: 'Private Clinic Booking',
};

export async function makeApp({ chromeOpts = {}, settings, tabs = 'default', start = true, random = () => 0.5 } = {}) {
  const chrome = createFakeChrome(chromeOpts);
  const clock = new FakeClock();
  if (settings) await chrome.storage.local.set({ settings });
  const w1 = chrome._addWindow({ focused: true });
  if (tabs === 'default') {
    chrome._addTab({ windowId: w1.id, id: 11, title: SECRET.tabTitle, url: SECRET.tabUrl, active: true });
    chrome._addTab({ windowId: w1.id, id: 12, title: '(3) Inbox - mail.example', url: 'https://mail.example/inbox' });
    chrome._addTab({ windowId: w1.id, id: 13, title: 'Video', url: 'https://video.example/watch?v=fixture', audible: true });
  }
  chrome.calls.length = 0;
  const app = createApp({
    chrome, clock, codec: fakeCodec, fetch: fakeFetch(), random,
    navigator: { userAgentData: { brands: [{ brand: 'Google Chrome', version: '155' }, { brand: 'Chromium', version: '155' }] } },
  });
  app.listen();
  if (start) { await app.init(); await flush(); }
  return { chrome, clock, app, w1 };
}

/** Delivers a welcome on the current native port and lets state.full go out. */
export async function welcome(env, data = {}) {
  env.chrome.port.deliver({ v: 1, t: 'welcome', seq: 1, at: env.clock.now(), data: { proto: 1, plugin: { version: '0.0.0-test' }, privacy: 'full', want: {}, ...data } });
  await flush();
}

/** Sends a command and resolves with its result frame. */
export async function command(env, op, args = {}, id = Math.floor(Math.random() * 1e6) + 1) {
  const port = env.chrome.port;
  port.deliver({ v: 1, t: 'cmd', id, op, args });
  for (let i = 0; i < 60; i++) {
    await flush(3);
    const r = port.sent.find((m) => m.t === 'result' && m.id === id);
    if (r) return r;
    await env.clock.advance(50);
  }
  throw new Error(`no result for ${op}`);
}

/** Connects a fake content-script port for a frame; it can auto-answer commands. */
export function contentPort(env, tabId, frameId = 0) {
  const p = new FakeContentPort(env.chrome, { tabId, frameId });
  env.chrome.runtime.onConnect.dispatch(p);
  return p;
}

export function mediaEntry(over = {}) {
  return {
    sub: null, kind: 'video', state: 'playing', title: 'Fixture Song', artist: 'Test Artist', album: 'Test Album',
    artSrc: 'https://img.video.example/art/288.jpg', artType: 'image/jpeg', chapters: [],
    durationMs: 180000, live: false, positionMs: 1000, positionAt: 1_800_000_000_000, rate: 1, volume: 0.8,
    elementMuted: false, pip: false, actions: ['play', 'pause', 'seekto'], mic: null, camera: null, source: 'mediasession+element',
    ...over,
  };
}

export { flush };
