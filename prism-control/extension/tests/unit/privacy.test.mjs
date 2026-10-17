import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLevel, levelReason, stricter, tabView, mediaView, downloadView, groupView, makeContext, sessionItemView, originsView } from '../../src/background/privacy.js';
import { makeApp, welcome, command, contentPort, mediaEntry, SECRET, flush } from '../helpers/harness.mjs';

const SECRETS = Object.values(SECRET).concat(['accounts/7781', 'ssn=redacted', 'zephyr-medical', 'Moonlit', 'Ivory Lantern']);

/** Every frame the extension posted after index `from`, as one string. */
const wire = (port, from = 0) => JSON.stringify(port.sent.slice(from));
function assertNoSecrets(text, label) {
  for (const s of SECRETS) assert.ok(!text.includes(s), `${label}: leaked "${s}"`);
}

test('the stricter level always wins', () => {
  assert.equal(stricter('full', 'domain'), 'domain');
  assert.equal(stricter('hidden', 'domain'), 'hidden');
  assert.equal(effectiveLevel({ base: 'full', deck: 'full' }), 'full');
  assert.equal(effectiveLevel({ base: 'hidden', deck: 'full' }), 'hidden', 'the deck cannot lower the extension setting');
  assert.equal(effectiveLevel({ base: 'full', deck: 'domain' }), 'domain');
  assert.equal(effectiveLevel({ base: 'full', deck: 'full', streaming: true, whileStreaming: 'domain' }), 'domain');
  assert.equal(effectiveLevel({ base: 'full', deck: 'full', streaming: true, whileStreaming: 'hidden' }), 'hidden');
  assert.equal(effectiveLevel({ base: 'domain', deck: 'nonsense' }), 'domain');
  assert.equal(levelReason({ base: 'full', deck: 'full', streaming: true, whileStreaming: 'domain' }), 'streaming');
  assert.equal(levelReason({ base: 'full', deck: 'hidden' }), 'deck');
  assert.equal(levelReason({ base: 'domain', deck: 'full' }), 'setting');
});

test('tab view per level', () => {
  const raw = { id: 1, win: 1, idx: 0, title: '(2) Secret Plans', url: 'https://news.example.co.uk/a/b', status: 'complete', group: -1, split: -1 };
  const full = tabView(raw, makeContext({ level: 'full' }));
  assert.equal(full.title, '(2) Secret Plans');
  assert.equal(full.url, raw.url);
  assert.equal(full.domain, 'example.co.uk');
  assert.equal(full.hidden, null);
  const dom = tabView(raw, makeContext({ level: 'domain' }));
  assert.equal(dom.title, null);
  assert.equal(dom.url, null);
  assert.equal(dom.domain, 'example.co.uk');
  assert.equal(dom.unread, 2, 'unread counts survive');
  assert.equal(dom.hidden, 'domain');
  const hid = tabView(raw, makeContext({ level: 'hidden' }));
  assert.equal(hid.title, null);
  assert.equal(hid.url, null);
  assert.equal(hid.domain, null);
  assert.equal(hid.icon, 'glyph:tab');
  assert.equal(hid.unread, 2);
  assert.equal(hid.hidden, 'all');
  const always = tabView(raw, makeContext({ level: 'full', alwaysHidden: ['example.co.uk'] }));
  assert.equal(always.title, null);
  assert.equal(always.hidden, 'all', 'always-hidden sites are hidden even at full');
});

test('media, download, group and session views per level', () => {
  const tab = { url: 'https://video.example/watch' };
  const m = { key: '1:0', tabId: 1, frameId: 0, kind: 'video', state: 'playing', title: 'T', artist: 'A', album: 'B', art: { url: 'https://img.example/a.jpg' }, chapters: [{ title: 'c', startMs: 0 }], rate: 1, source: 'element', actions: [] };
  assert.equal(mediaView(m, makeContext({ level: 'full' }), tab).title, 'T');
  const d = mediaView(m, makeContext({ level: 'domain' }), tab);
  assert.equal(d.title, null); assert.equal(d.art, null); assert.deepEqual(d.chapters, []); assert.equal(d.domain, 'video.example');
  const allow = mediaView(m, makeContext({ level: 'domain', mediaAllow: ['video.example'] }), tab);
  assert.equal(allow.title, 'T', 'allow-listed media sites keep titles at domain');
  const h = mediaView(m, makeContext({ level: 'hidden', mediaAllow: ['video.example'] }), tab);
  assert.equal(h.title, null); assert.equal(h.domain, null); assert.equal(h.hidden, 'all');
  assert.equal(h.state, 'playing', 'progress and state survive');

  const dl = { id: 1, state: 'in_progress', filename: 'C:\\Users\\someone\\Downloads\\taxes-2026.zip', url: 'https://files.example/x', bytes: 5, total: 10 };
  assert.equal(downloadView(dl, makeContext({ level: 'full' })).name, 'taxes-2026.zip', 'never the folder');
  assert.equal(downloadView(dl, makeContext({ level: 'domain' })).name, '.zip');
  assert.equal(downloadView(dl, makeContext({ level: 'hidden' })).name, null);
  assert.ok(!JSON.stringify(downloadView(dl, makeContext({ level: 'full' }))).includes('Users'), 'paths never in views');

  assert.equal(groupView({ id: 1, win: 1, title: 'Job hunt', color: 'blue' }, makeContext({ level: 'domain' })).title, null);
  const s = { lastModified: 1, tab: { sessionId: 's1', title: 'Clinic', url: 'https://clinic.example/b' } };
  assert.equal(sessionItemView(s, makeContext({ level: 'full' })).title, 'Clinic');
  assert.equal(sessionItemView(s, makeContext({ level: 'domain' })).title, null);
  assert.equal(sessionItemView(s, makeContext({ level: 'hidden' })).domain, null);
  assert.deepEqual(originsView(['https://clinic.example/*'], makeContext({ level: 'hidden' })), []);
  assert.deepEqual(originsView(['https://www.clinic.example/*'], makeContext({ level: 'domain' })), ['clinic.example']);
});

/** Feeds every kind of private data through the real app, with fake chrome + fake native port. */
async function exercise(env) {
  const { chrome, clock } = env;
  chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = (cmd) => ({ ok: true, data: { state: 'paused', title: SECRET.mediaTitle, note: SECRET.tabTitle } });
  p.send({ t: 'snap', entries: [mediaEntry({ title: SECRET.mediaTitle, artist: SECRET.mediaArtist, artSrc: 'blob:https://video.example/1' })] });
  p.send({ t: 'art', src: 'blob:https://video.example/1', mime: 'image/jpeg', w: 10, h: 10, b64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64') });
  chrome._updateTab(12, { title: SECRET.sessionTitle });
  chrome._addTab({ title: SECRET.tabTitle + ' copy', url: SECRET.tabUrl + '&copy' });
  chrome.downloads.items.set(5, { id: 5, state: 'in_progress', filename: `C:\\Downloads\\${SECRET.downloadName}`, url: 'https://files.example/r', bytesReceived: 10, totalBytes: 100, danger: 'safe' });
  chrome.downloads.onCreated.dispatch(chrome.downloads.items.get(5));
  chrome.sessions.recent = [{ lastModified: 5, tab: { sessionId: 'x', title: SECRET.sessionTitle, url: 'https://clinic.example/' } }];
  chrome.tabGroups.groups.set(3, { id: 3, windowId: 1, title: SECRET.groupTitle, color: 'red', collapsed: false });
  chrome.tabGroups.onCreated.dispatch(chrome.tabGroups.groups.get(3));
  await clock.advance(3000);
  const results = [];
  results.push(await command(env, 'session.recent', { max: 5 }));
  results.push(await command(env, 'download.path', { id: 5 }));
  results.push(await command(env, 'media.pause', { key: '13:0' }));
  results.push(await command(env, 'perm.hostRequest', { tabId: 11 }));
  results.push(await command(env, 'img.get', { ids: ['art:0000000000000000'] }));
  await clock.advance(3000);
  return results;
}

const OPTS = { chromeOpts: { optionalApis: ['downloads', 'sessions', 'tabGroups'], permissions: ['tabs', 'favicon', 'nativeMessaging', 'storage', 'alarms', 'scripting', 'downloads', 'sessions', 'tabGroups'] } };

test('hidden: no title, URL, media title, artist, file name, group title or session title is ever posted', async () => {
  const env = await makeApp({ ...OPTS, settings: { privacyBase: 'hidden' } });
  await welcome(env, { privacy: 'full' });  // the deck asks for full; the extension's own hidden wins
  const results = await exercise(env);
  const text = wire(env.chrome.port);
  assertNoSecrets(text, 'hidden');
  assert.ok(!text.includes('"img"') || !env.chrome.port.ofType('img').some((m) => m.data.id.startsWith('fav:')), 'no favicons while hidden');
  assert.equal(env.chrome.port.ofType('img').filter((m) => m.data.id.startsWith('art:')).length, 0, 'no artwork while hidden');
  const dl = results[1];
  assert.equal(dl.ok, false);
  assert.equal(dl.error.code, 'privacy_blocked');
  const full = env.chrome.port.ofType('state.full').at(-1);
  assert.equal(full.data.privacy, 'hidden');
  assert.ok(full.data.tabs.every((t) => t.title === null && t.url === null && t.domain === null));
});

test('domain: titles and names are dropped, domains kept', async () => {
  const env = await makeApp({ ...OPTS, settings: { privacyBase: 'domain' } });
  await welcome(env);
  await exercise(env);
  const text = wire(env.chrome.port);
  assertNoSecrets(text, 'domain');
  assert.ok(text.includes('"bank.example"'), 'domains are allowed at domain');
  assert.ok(text.includes('".pdf"'), 'download shows only its extension');
});

test('switching to streamer-safe re-sends at once and nothing private follows', async () => {
  const env = await makeApp(OPTS);
  await welcome(env);
  await env.clock.advance(500);
  assert.ok(wire(env.chrome.port).includes(SECRET.tabTitle), 'full shows titles');
  // The user's "while streaming" level is hidden. The change itself re-sends state.full (still at full, with
  // the new privacySettings for the plugin's fallbacks)...
  await env.chrome.storage.local.set({ settings: { whileStreaming: 'hidden' } });
  await flush();
  const resent = env.chrome.port.ofType('state.full').at(-1);
  assert.deepEqual(resent.data.privacySettings, { base: 'full', whileStreaming: 'hidden', alwaysHidden: 0 });
  // ...then the plugin reports OBS running.
  const mark = env.chrome.port.sent.length;
  env.chrome.port.deliver({ v: 1, t: 'streaming', data: { active: true, app: 'obs64.exe' } });
  await flush();
  const next = env.chrome.port.sent.slice(mark);
  const firstFull = next.find((m) => m.t === 'state.full' && m.data.privacy === 'hidden');
  assert.ok(firstFull, 'a hidden state.full goes out');
  assert.equal(firstFull.at, env.clock.now(), 'immediately, not on the 100 ms cadence');
  assert.equal(env.chrome.action.badge, 'SAFE');
  await exercise(env);
  assertNoSecrets(wire(env.chrome.port, mark), 'after the switch');
  // OBS exits: back to full.
  env.chrome.port.deliver({ v: 1, t: 'streaming', data: { active: false } });
  await flush();
  assert.equal(env.chrome.port.ofType('state.full').at(-1).data.privacy, 'full');
});

test('panic forces hidden, mutes audible tabs and minimizes windows', async () => {
  const env = await makeApp();
  await welcome(env);
  const mark = env.chrome.port.sent.length;
  const r = await command(env, 'panic', {});
  assert.equal(r.ok, true);
  assert.equal(r.data.privacy, 'hidden');
  assert.equal(r.data.muted, 1);
  assert.equal(r.data.minimized, 1);
  assert.ok(env.chrome.calls.some(([api, id, p]) => api === 'tabs.update' && id === 13 && p.muted === true));
  assert.ok(env.chrome.calls.some(([api, , p]) => api === 'windows.update' && p.state === 'minimized'));
  const after = env.chrome.port.sent.slice(mark);
  const idxFull = after.findIndex((m) => m.t === 'state.full' && m.data.privacy === 'hidden');
  const idxResult = after.findIndex((m) => m.t === 'result');
  assert.ok(idxFull >= 0 && idxFull < idxResult, 'the deck is blanked before the result');
  assertNoSecrets(JSON.stringify(after), 'after panic');
  // The deck can lift it explicitly.
  const back = await command(env, 'privacy.set', { level: 'full' });
  assert.equal(back.data.level, 'full');
});

test('page-supplied strings in command results and errors never reach the plugin', async () => {
  const env = await makeApp({ settings: { privacyBase: 'hidden' } });
  await welcome(env);
  env.chrome._grant({ origins: ['https://video.example/*'] });
  await flush();
  const p = contentPort(env, 13);
  p.autoReply = (cmd) => (cmd.op === 'pause'
    ? { ok: true, data: { state: 'paused', title: SECRET.mediaTitle, positionMs: 5 } }
    : { ok: false, code: 'unsupported', message: SECRET.mediaTitle });
  const ok = await command(env, 'media.pause', { key: '13:0' });
  assert.deepEqual(ok.data, { state: 'paused', positionMs: 5 });
  const bad = await command(env, 'media.seek', { key: '13:0', positionMs: 1 });
  assert.equal(bad.error.code, 'unsupported');
  assert.ok(!bad.error.message.includes('Moonlit'));
});

test('control: at full the same exercise does carry every secret (so the negative tests mean something)', async () => {
  const env = await makeApp(OPTS);
  await welcome(env);
  const results = await exercise(env);
  const text = wire(env.chrome.port);
  for (const s of [SECRET.tabTitle, SECRET.tabUrl, SECRET.mediaTitle, SECRET.mediaArtist, SECRET.downloadName, SECRET.groupTitle, SECRET.sessionTitle]) {
    assert.ok(text.includes(s), `full should carry "${s}"`);
  }
  assert.equal(results[1].ok, true, 'download.path works at full');
  assert.ok(results[1].data.path.endsWith(SECRET.downloadName));
  assert.ok(env.chrome.port.ofType('img').some((m) => m.data.id.startsWith('art:')), 'blob artwork was re-encoded and sent');
  const media = env.chrome.port.sent.filter((m) => m.t === 'media.update' || m.t === 'state.full').flatMap((m) => m.data.upsert || m.data.media || []);
  assert.ok(media.some((m) => m.key === '13:0' && m.art && m.art.img && m.art.img.startsWith('art:')), 'media entry references the art image');
});
