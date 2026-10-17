import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeConnection, BACKOFF_MISSING_MS, classifyDisconnect } from '../../src/background/connection.js';
import { TokenBucket } from '../../src/background/ratelimit.js';
import { createFakeChrome } from '../helpers/fake-chrome.mjs';
import { FakeClock, flush } from '../helpers/fake-clock.mjs';
import { makeApp, welcome } from '../helpers/harness.mjs';

function rig(host = 'installed') {
  const chrome = createFakeChrome({ host });
  const clock = new FakeClock();
  const events = { welcome: 0, end: 0, statuses: [] };
  const conn = new NativeConnection({
    chrome, hostName: 'com.jeremyfhall.prismcontrol.browser', clock, random: () => 0.5,
    hello: () => ({ proto: 1 }),
    onWelcome: () => events.welcome++,
    onMessage: () => {},
    onSessionEnd: () => events.end++,
    onStatus: (s) => events.statuses.push(s),
  });
  return { chrome, clock, conn, events };
}

/** Delay between consecutive connectNative() calls. */
function gaps(chrome, times) {
  const out = [];
  for (let i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]);
  return out;
}

test('host not installed: status host_missing, retry every 5 minutes', async () => {
  const { chrome, clock, conn } = rig('missing');
  const times = [];
  const orig = chrome.runtime.connectNative;
  chrome.runtime.connectNative = (n) => { times.push(clock.now()); return orig(n); };
  conn.connectIfDue();
  await flush();
  assert.equal(conn.status, 'host_missing');
  assert.equal(classifyDisconnect('Specified native messaging host not found.'), 'host_missing');
  await clock.advance(BACKOFF_MISSING_MS * 2 + 1000);
  await flush();
  assert.deepEqual(gaps(chrome, times), [BACKOFF_MISSING_MS, BACKOFF_MISSING_MS]);
});

test('a crashing host backs off 1, 2, 4, 8, 16, 30, 30 s', async () => {
  const { chrome, clock, conn } = rig('crash');
  const times = [];
  const orig = chrome.runtime.connectNative;
  chrome.runtime.connectNative = (n) => { times.push(clock.now()); return orig(n); };
  conn.connectIfDue();
  for (let i = 0; i < 8; i++) { await flush(); await clock.advance(31_000); }
  assert.deepEqual(gaps(chrome, times).slice(0, 7), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(conn.status, 'host_error');
});

test('backoff resets once the host speaks', async () => {
  const { chrome, clock, conn } = rig('crash');
  conn.connectIfDue();
  for (let i = 0; i < 4; i++) { await flush(); await clock.advance(20_000); }
  assert.ok(conn.backoffMs > 1000);
  chrome.hostMode = 'installed';
  await clock.advance(31_000);
  await flush();
  chrome.port.deliver({ t: 'relay.down' });
  assert.equal(conn.backoffMs, 1000);
  assert.equal(conn.status, 'plugin_down');
});

test('handshake: hello first, welcome -> connected, relay.down/up, hello retries', async () => {
  const { chrome, clock, conn, events } = rig();
  conn.connectIfDue();
  assert.equal(chrome.port.sent[0].t, 'hello');
  assert.equal(conn.status, 'connecting');
  assert.equal(conn.post('state.full', {}), false, 'nothing but hello before welcome');
  await clock.advance(5000);
  assert.equal(chrome.port.ofType('hello').length, 2, 'hello retried after 5 s');
  assert.equal(conn.status, 'plugin_down', 'no welcome after the grace period');
  chrome.port.deliver({ v: 1, t: 'welcome', data: { proto: 1 } });
  assert.equal(conn.status, 'connected');
  assert.equal(events.welcome, 1);
  assert.equal(conn.post('state.full', {}), true);
  chrome.port.deliver({ t: 'relay.down' });
  assert.equal(conn.status, 'plugin_down');
  assert.equal(events.end, 1, 'the session ends: publishing stops');
  assert.equal(conn.post('tabs.delta', {}), false);
  const hellos = chrome.port.ofType('hello').length;
  chrome.port.deliver({ t: 'relay.up' });
  assert.equal(chrome.port.ofType('hello').length, hellos + 1, 'relay.up -> hello at once');
  chrome.port.deliver({ v: 1, t: 'welcome', data: { proto: 1 } });
  assert.equal(events.welcome, 2);
});

test('envelope: v, t, seq increasing from 1 per connection, at', async () => {
  const { chrome, clock, conn } = rig();
  conn.connectIfDue();
  chrome.port.deliver({ v: 1, t: 'welcome', data: {} });
  conn.post('event', { kind: 'x' });
  conn.post('event', { kind: 'y' });
  const s = chrome.port.sent;
  assert.deepEqual(s.map((m) => m.seq), [1, 2, 3]);
  assert.ok(s.every((m) => m.v === 1 && typeof m.t === 'string' && m.at === clock.now()));
  assert.equal(conn.post('event', { pad: 'x'.repeat(600 * 1024) }), false, 'outbound cap 512 KB');
});

test('protocol mismatch is reported, not obeyed', async () => {
  const { chrome, conn, events } = rig();
  conn.connectIfDue();
  chrome.port.deliver({ v: 2, t: 'welcome', data: { proto: 2 } });
  assert.equal(conn.status, 'proto_mismatch');
  assert.equal(events.welcome, 0);
});

test('a restarted worker honours the persisted next-attempt time', async () => {
  const { chrome, clock, conn } = rig('missing');
  conn.connectIfDue();
  await flush();
  const nextAt = conn.nextAt;
  assert.ok(nextAt > clock.now());
  // New worker: same storage.session, new connection object. The 30 s alarm wakes it.
  const conn2 = new NativeConnection({ chrome, hostName: 'h', clock, hello: () => ({}), onWelcome() {}, onMessage() {}, onSessionEnd() {} });
  await conn2.restore();
  const before = chrome.nativePorts.length;
  conn2.connectIfDue('alarm');
  assert.equal(chrome.nativePorts.length, before, 'the alarm does not hammer a missing host');
  assert.equal(conn2.status, 'host_missing', 'status survives the restart');
  conn2.retryNow();
  assert.equal(chrome.nativePorts.length, before + 1, '"Retry now" connects at once');
});

test('token bucket refills', () => {
  const clock = new FakeClock();
  const b = new TokenBucket({ rate: 2, burst: 2, clock });
  assert.equal(b.take(), true); assert.equal(b.take(), true); assert.equal(b.take(), false);
  clock.t += 500;
  assert.equal(b.take(), true);
  assert.equal(b.take(), false);
});

test('app: popup status for each failure mode', async () => {
  for (const [mode, line] of [['missing', 'Host not installed'], ['forbidden', 'Host not installed'], ['crash', 'Prism Control not running']]) {
    const env = await makeApp({ chromeOpts: { host: mode } });
    await flush();
    assert.equal(env.app.uiStatus().line, line, mode);
  }
  const env = await makeApp();
  await welcome(env);
  assert.equal(env.app.uiStatus().line, 'Connected');
});
