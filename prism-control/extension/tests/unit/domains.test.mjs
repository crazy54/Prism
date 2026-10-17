import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain, matchesPattern, accessFor, hostInList, parseDomainList, originPattern, extensionOf } from '../../src/shared/domains.js';
import { parseUnread } from '../../src/shared/titles.js';
import { sanitizeSettings } from '../../src/background/settings.js';
import { capStr, utf8Length, sniffImage, hash16 } from '../../src/shared/util.js';

test('registrable domains', () => {
  assert.equal(registrableDomain('www.video.example'), 'video.example');
  assert.equal(registrableDomain('a.b.news.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('someone.github.io'), 'someone.github.io');
  assert.equal(registrableDomain('192.0.2.7'), '192.0.2.7');
  assert.equal(registrableDomain('localhost'), 'localhost');
  assert.equal(registrableDomain('x.y.example', () => 'from-native.example'), 'from-native.example');
});

test('match patterns and access', () => {
  assert.ok(matchesPattern('https://video.example/*', 'https://video.example/watch?v=1'));
  assert.ok(!matchesPattern('https://video.example/*', 'https://evil.example/video.example/'));
  assert.ok(matchesPattern('https://*.video.example/*', 'https://m.video.example/'));
  assert.ok(matchesPattern('https://*/*', 'https://anything.example/'));
  assert.ok(!matchesPattern('https://*/*', 'http://anything.example/'));
  assert.ok(matchesPattern('*://*/*', 'http://anything.example/'));
  assert.ok(matchesPattern('<all_urls>', 'file:///C:/x'));
  assert.equal(accessFor('chrome://settings', []), 'blocked');
  assert.equal(accessFor('https://chromewebstore.google.com/detail/x', ['https://*/*']), 'blocked');
  assert.equal(accessFor('https://video.example/', ['https://video.example/*']), 'granted');
  assert.equal(accessFor('https://other.example/', ['https://video.example/*']), 'none');
  assert.equal(originPattern('https://video.example:8443/a?b'), 'https://video.example/*');
  assert.equal(originPattern('file:///C:/x'), null);
});

test('domain lists', () => {
  assert.deepEqual(parseDomainList('bank.example\nhttps://www.mail.example/inbox, *.health.example'), ['bank.example', 'www.mail.example', 'health.example']);
  assert.ok(hostInList('online.bank.example', ['bank.example']));
  assert.ok(!hostInList('notbank.example', ['bank.example']));
  assert.equal(extensionOf('C:\\x\\Report.Final.PDF'), '.pdf');
  assert.equal(extensionOf('README'), null);
});

test('unread counts', () => {
  assert.equal(parseUnread('(3) Inbox', 'x.example'), 3);
  assert.equal(parseUnread('[12] Chat', 'x.example'), 12);
  assert.equal(parseUnread('Inbox (7)', 'x.example'), 7);
  assert.equal(parseUnread('* Activity', 'x.example'), -1);
  assert.equal(parseUnread('Plain title', 'x.example'), null);
  assert.equal(parseUnread('(0) Inbox', 'x.example'), null);
  assert.equal(parseUnread('Inbox (42) - mail.example', 'mail.example'), 42, 'site rule first');
});

test('settings are sanitized', () => {
  const s = sanitizeSettings({ privacyBase: 'nope', whileStreaming: 'loose', profileLabel: '  W\u0007ork  '.repeat(10), alwaysHidden: 'bank.example' });
  assert.equal(s.privacyBase, 'full');
  assert.equal(s.whileStreaming, 'domain', 'an unknown "while streaming" choice falls back to domain');
  assert.equal(sanitizeSettings({ whileStreaming: 'full' }).whileStreaming, 'full', '"Don\'t change" is a real choice (MED 8)');
  assert.equal(sanitizeSettings({ whileStreaming: 'hidden' }).whileStreaming, 'hidden');
  assert.ok(s.profileLabel.length <= 48 && !s.profileLabel.includes('\u0007'));
  assert.deepEqual(s.alwaysHidden, ['bank.example']);
});

test('utils', async () => {
  assert.equal(capStr('ab\u{1F600}', 3), 'ab', 'never splits a surrogate pair');
  assert.equal(utf8Length('a\u00e9\u20ac\u{1F600}'), 1 + 2 + 3 + 4);
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
  assert.equal(sniffImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null, 'SVG is not accepted as an image');
  assert.match(await hash16(new Uint8Array([1, 2, 3])), /^[0-9a-f]{16}$/);
});
