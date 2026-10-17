// Linux hidraw driver (src/hid): packet bytes vs the research layouts (golden arrays),
// chunking / paging math, feature reports + the python helper's allowlist, input
// report parsing, discovery against a fake sysfs tree, EBUSY / claim handling, the
// transport over a fake /dev/hidraw*, deck pacing + dedupe, encode → packets → sniff
// → decode loopbacks per family, and the runner's input routing. No real device is
// ever opened: every test uses a fake tree, a fake fs or the memory transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODELS, MODEL_BY_ID, MODEL_BY_USB, modelForUsb, modelForDevice, hidKey, USB_IDS,
  packets, reportCount, checkOutputReport, features, checkFeature, galleonRingIndex, decodeGet, ALLOWED_SET, ALLOWED_GET,
  createInputParser, listDecks, selectDeck, parseUevent, parseHidId,
  findHolders, findDeckApps, acquireLock, claimDeck, HidError,
  openHidraw, memoryTransport, startFeatureHelper, HidDeck, resolveLayout, defaultLayout, parseSpanArg,
  createRunner, sniffReports, udevRules, UDEV_RULES_NAME, hidMain,
} from '../src/hid/index.js';
import { LCD_DEVICES, DEVICES } from '../src/devices.js';
import { decodeJPEG, decodeBMP, transformImage, diffImages } from '../src/raster/index.js';
import { solid } from '../src/hid/pixels.js';
import { useTheme } from '../src/themes/_registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'handoff-from-prism-e0', 'research', 'devices.json');
const HELPER = path.join(ROOT, 'linux', 'prism-deck-hidfeature.py');
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `prism-hid-${name}-`));
const seq = (n, f = (i) => i & 255) => Uint8Array.from({ length: n }, (_, i) => f(i));
const head = (p, n) => Array.from(p.subarray(0, n));
const zeros = (p, from) => p.subarray(from).every((b) => b === 0);
const M = MODEL_BY_ID;

// ---------------------------------------------------------------------------- models

test('hid models: every LCD hardware device has a wire model that agrees with devices.js', () => {
  for (const id of LCD_DEVICES) assert.ok(M[id], `no hid model for ${id}`);
  for (const m of MODELS) {
    const d = DEVICES[m.id];
    assert.equal(m.cols, d.cols, m.id); assert.equal(m.rows, d.rows, m.id);
    if (m.key) assert.deepEqual(m.key, d.keyPx, m.id);
    if (m.lcd?.kind === 'strip') { assert.equal(m.lcd.w, d.strip.w); assert.equal(m.lcd.segments, d.strip.segments); }
    if (m.lcd?.kind === 'screen') { assert.equal(m.lcd.w, d.screen.w); assert.equal(m.lcd.h, d.screen.h); }
    if (m.lcd?.kind === 'infobar') { assert.equal(m.lcd.w, d.screen.w); assert.equal(m.lcd.h, d.screen.h); }
  }
  assert.equal(modelForUsb(0x0fd9, 0x0084).id, 'plus');
  assert.equal(modelForUsb(0x1b1c, 0x2b18).id, 'galleon');
  assert.equal(modelForUsb(0x1b1c, 0x2b0c), null, 'the Galleon keyboard itself is not a deck');
  assert.equal(modelForDevice('sd+').id, 'plus');
  assert.equal(modelForDevice('nope'), null);
  assert.equal(modelForDevice('mcp'), null, 'software decks have no hidraw model');
});

test('hid models: USB ids match research/devices.json', { skip: !fs.existsSync(RESEARCH) && 'research not present' }, () => {
  const research = JSON.parse(fs.readFileSync(RESEARCH, 'utf8'));
  const ids = new Set();
  for (const r of research) for (const pid of r.usb?.pid || []) if (/^0x[0-9a-f]{4}$/i.test(pid)) ids.add(`${r.usb.vid.slice(2)}:${pid.slice(2)}`.toLowerCase());
  assert.deepEqual([...ids].sort(), Object.keys(MODEL_BY_USB).sort());
  const gal = research.find((r) => r.id === 'corsair-galleon-100-sd');
  assert.equal(gal.usb.hidInterface, M.galleon.iface);
});

test('hid models: formats, transforms and protocols per family (research §2.1)', () => {
  const fam = (id) => [M[id].proto, M[id].keyFmt, M[id].keyXf];
  assert.deepEqual(fam('original'), ['orig', 'bmp', 'mirrorX']);
  for (const id of ['mini', 'mini-2022', 'mini-discord', 'module-6']) assert.deepEqual(fam(id), ['mini', 'bmp', 'ccw90'], id);
  for (const id of ['original-v2', 'mk2', 'scissor', 'module-15', 'module-15-scissor', 'xl', 'xl-2022', 'module-32', 'neo']) assert.deepEqual(fam(id), ['gen2', 'jpeg', 'rot180'], id);
  for (const id of ['plus', 'studio', 'galleon']) assert.deepEqual(fam(id), ['gen2', 'jpeg', 'none'], id);
  assert.deepEqual(fam('plusxl'), ['gen2', 'jpeg', 'ccw90']);
  assert.equal(M.plusxl.lcd.xf, 'ccw90'); assert.equal(M.neo.lcd.xf, 'rot180'); assert.equal(M.neo.lcd.cmd, 0x0b);
  assert.equal(M.galleon.lcd.cmd, 0x0c); assert.deepEqual(M.galleon.keepAlive, { ms: 500, report: [0x03, 0x27] });
  assert.equal(M.original.outLen, 8191);
  assert.equal(M.neo.inputs, 10, 'Neo: 8 keys + 2 touch sensors');
  // the 2017 original runs right-to-left per row on the wire
  assert.deepEqual([0, 1, 4, 5, 9, 14].map((k) => hidKey(M.original, k)), [4, 3, 0, 9, 5, 10]);
  assert.equal(hidKey(M.mk2, 4), 4);
});

// ---------------------------------------------------------------------------- udev

/**
 * A small udev rules evaluator — enough of udev(7) for our file: ==/!= on KERNEL, SUBSYSTEM and
 * ATTRS{…} (every ATTRS key of one rule must match on the SAME device of the chain, as in udev),
 * MODE:= / TAG+= / GOTO / LABEL. `chain` is the hidraw device first, then its ancestors.
 */
function evalUdev(text, chain) {
  const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const parse = (l) => [...l.matchAll(/([A-Z]+)(?:\{([^}]+)\})?\s*(==|!=|:=|\+=|=)\s*"([^"]*)"/g)].map(([, key, attr, op, val]) => ({ key, attr, op, val }));
  const glob = (pat, v) => new RegExp(`^${pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(v ?? '');
  const rules = lines.map(parse);
  const out = { mode: null, tags: [] };
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const label = r.find((t) => t.key === 'LABEL');
    if (label) continue;
    const self = chain[0];
    let ok = r.filter((t) => t.key === 'KERNEL' || t.key === 'SUBSYSTEM').every((t) => glob(t.val, t.key === 'KERNEL' ? self.kernel : self.subsystem) === (t.op === '=='));
    const attrs = r.filter((t) => t.key === 'ATTRS');
    if (ok && attrs.length) ok = chain.some((d) => attrs.every((t) => (d.attrs?.[t.attr] !== undefined && glob(t.val, d.attrs[t.attr])) === (t.op === '==')));
    if (!ok) continue;
    for (const t of r) {
      if (t.key === 'MODE') out.mode = t.val;
      if (t.key === 'TAG' && t.op === '+=') out.tags.push(t.val);
      if (t.key === 'GOTO') {
        const j = rules.findIndex((x) => x.some((y) => y.key === 'LABEL' && y.val === t.val));
        assert.ok(j > i, `GOTO "${t.val}" must jump forward to a LABEL in the same file`);
        i = j;
      }
    }
  }
  return out;
}

/** hidraw → hid → usb_interface → usb_device chain for one interface of a USB device. */
const usbChain = (vid, pid, iface) => [
  { kernel: `hidraw${iface + 3}`, subsystem: 'hidraw' },
  { kernel: `0003:${vid.toUpperCase()}:${pid.toUpperCase()}.000${iface + 1}`, subsystem: 'hid' },
  { kernel: `3-4:1.${iface}`, subsystem: 'usb', attrs: { bInterfaceNumber: iface.toString(16).padStart(2, '0'), bInterfaceClass: '03' } },
  { kernel: '3-4', subsystem: 'usb', attrs: { idVendor: vid, idProduct: pid, manufacturer: 'Fictional' } },
];

test('hid udev: shipped rule == generated rule, every model covered, sorts before 73-seat-late', () => {
  const shipped = fs.readFileSync(path.join(ROOT, 'linux', UDEV_RULES_NAME), 'utf8');
  assert.equal(shipped, udevRules(), 'linux/60-prism-deck.rules is stale — regenerate with `prism-deck hid udev`');
  const rules = shipped.split('\n').filter((l) => l && !l.startsWith('#'));
  for (const { vid, pid } of USB_IDS) assert.ok(rules.some((l) => l.includes(`ATTRS{idVendor}=="${vid}", ATTRS{idProduct}=="${pid}"`) && l.startsWith('KERNEL=="hidraw*"')), `${vid}:${pid}`);
  for (const l of rules.filter((x) => x.includes('TAG+="uaccess"'))) assert.match(l, /MODE:="0660"/, l);
  assert.ok(!rules.some((l) => l.includes('"1b1c"') && !l.includes('idProduct')), 'no vendor-wide Corsair rule');
  assert.ok(!rules.some((l) => l.includes('"1b1c"') && l.includes('uaccess')), 'the Corsair USB-id line never grants access by itself');
  assert.ok(UDEV_RULES_NAME < '73-seat-late.rules');
});

test('hid udev: the Galleon grants only its deck interface (00), never its keyboard; Elgato unchanged', () => {
  const r = udevRules();
  const granted = (chain) => { const o = evalUdev(r, chain); return o.mode === '0660' && o.tags.includes('uaccess'); };
  assert.ok(granted(usbChain('1b1c', '2b18', 0)), 'Galleon interface 00 (Stream Deck) → seat user');
  for (const i of [1, 2, 3]) assert.ok(!granted(usbChain('1b1c', '2b18', i)), `Galleon interface 0${i} (keyboard / media) stays root-only`);
  assert.ok(!granted(usbChain('1b1c', '2b0c', 0)), 'another Corsair product, interface 00');
  assert.ok(!granted(usbChain('abcd', '1234', 0)), 'any other vendor, interface 00 (must not fall into the label section)');
  for (const m of MODELS.filter((x) => x.iface === undefined)) assert.ok(granted(usbChain(m.usb.slice(0, 4), m.usb.slice(5), 0)), m.id);
  assert.ok(!granted([{ kernel: 'event5', subsystem: 'input' }, ...usbChain('1b1c', '2b18', 0).slice(1)]), 'only hidraw nodes, not the evdev node of the same interface');
});

// ---------------------------------------------------------------------------- output reports (goldens)

test('hid packets: gen2 key image (cmd 0x07) — 8-byte header, 1016-byte pages', () => {
  const jpg = seq(2100);
  const p = packets.gen2Key(3, jpg);
  assert.equal(p.length, 3);
  assert.ok(p.every((x) => x.length === 1024));
  assert.deepEqual(head(p[0], 8), [0x02, 0x07, 0x03, 0x00, 0xf8, 0x03, 0x00, 0x00]);
  assert.deepEqual(head(p[1], 8), [0x02, 0x07, 0x03, 0x00, 0xf8, 0x03, 0x01, 0x00]);
  assert.deepEqual(head(p[2], 8), [0x02, 0x07, 0x03, 0x01, 0x44, 0x00, 0x02, 0x00]);
  assert.deepEqual(p[0].subarray(8), jpg.subarray(0, 1016));
  assert.deepEqual(p[1].subarray(8), jpg.subarray(1016, 2032));
  assert.deepEqual(p[2].subarray(8, 76), jpg.subarray(2032));
  assert.ok(zeros(p[2], 76));
  assert.deepEqual(head(packets.gen2Key(0, new Uint8Array(0))[0], 8), [0x02, 0x07, 0x00, 0x01, 0, 0, 0, 0], 'empty image → one "last" report');
  assert.throws(() => packets.gen2Key(256, jpg), RangeError);
});

test('hid packets: Mini family (cmd 0x01) — 16-byte header, 0-based page, key + 1, 20 reports for 80×80', () => {
  const bmp = seq(54 + 80 * 80 * 3);
  const p = packets.mini(2, bmp);
  assert.equal(p.length, 20);
  assert.deepEqual(head(p[0], 16), [0x02, 0x01, 0x00, 0x00, 0x00, 0x03, ...Array(10).fill(0)]);
  assert.deepEqual(head(p[1], 6), [0x02, 0x01, 0x01, 0x00, 0x00, 0x03]);
  assert.deepEqual(head(p[19], 6), [0x02, 0x01, 0x13, 0x00, 0x01, 0x03]);
  assert.deepEqual(p[0].subarray(16), bmp.subarray(0, 1008));
  assert.deepEqual(p[19].subarray(16, 16 + 102), bmp.subarray(19 * 1008));
  assert.ok(zeros(p[19], 16 + 102));
});

test('hid packets: 2017 original — two 8191-byte halves, 1-based page, wire key + 1', () => {
  const bmp = seq(54 + 72 * 72 * 3);
  const p = packets.orig(hidKey(M.original, 0), bmp);
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => x.length === 8191));
  assert.deepEqual(head(p[0], 16), [0x02, 0x01, 0x01, 0x00, 0x00, 0x05, ...Array(10).fill(0)]);
  assert.deepEqual(head(p[1], 6), [0x02, 0x01, 0x02, 0x00, 0x01, 0x05]);
  assert.deepEqual(p[0].subarray(16, 16 + 7803), bmp.subarray(0, 7803));
  assert.deepEqual(p[1].subarray(16, 16 + 7803), bmp.subarray(7803));
  assert.ok(zeros(p[1], 16 + 7803));
});

test('hid packets: LCD region (cmd 0x0C) — 16-byte header with logical x/y/w/h, 1008-byte pages', () => {
  const jpg = seq(2500, (i) => (i * 7) & 255);
  const p = packets.region(200, 0, 200, 100, jpg);
  assert.equal(p.length, 3);
  assert.deepEqual(head(p[0], 16), [0x02, 0x0c, 0xc8, 0x00, 0x00, 0x00, 0xc8, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x03, 0x00]);
  assert.deepEqual(head(p[1], 16), [0x02, 0x0c, 0xc8, 0x00, 0x00, 0x00, 0xc8, 0x00, 0x64, 0x00, 0x00, 0x01, 0x00, 0xf0, 0x03, 0x00]);
  assert.deepEqual(head(p[2], 16), [0x02, 0x0c, 0xc8, 0x00, 0x00, 0x00, 0xc8, 0x00, 0x64, 0x00, 0x01, 0x02, 0x00, 0xe4, 0x01, 0x00]);
  assert.deepEqual(p[2].subarray(16, 16 + 484), jpg.subarray(2016));
  // the Galleon's lower-right widget
  assert.deepEqual(head(packets.region(360, 192, 360, 192, seq(10))[0], 16), [0x02, 0x0c, 0x68, 0x01, 0xc0, 0x00, 0x68, 0x01, 0xc0, 0x00, 0x01, 0x00, 0x00, 0x0a, 0x00, 0x00]);
});

test('hid packets: Neo info bar (0x0B), full LCD (0x08), Studio LEDs, reset stream', () => {
  const w = packets.window(seq(1500));
  assert.deepEqual(head(w[0], 8), [0x02, 0x0b, 0x00, 0x00, 0xf8, 0x03, 0x00, 0x00]);
  assert.deepEqual(head(w[1], 8), [0x02, 0x0b, 0x00, 0x01, 0xe4, 0x01, 0x01, 0x00]);
  assert.deepEqual(head(packets.gen2Full(seq(10))[0], 8), [0x02, 0x08, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x00]);
  const ring = packets.studioRing(1, seq(72, (i) => i + 1))[0];
  assert.equal(ring.length, 1024);
  assert.deepEqual(head(ring, 6), [0x02, 0x0f, 0x01, 1, 2, 3]);
  assert.equal(ring[3 + 71], 72); assert.ok(zeros(ring, 75));
  assert.deepEqual(head(packets.studioKnob(0, 9, 8, 7)[0], 7), [0x02, 0x10, 0x00, 9, 8, 7, 0]);
  const r = packets.resetStream(8191)[0];
  assert.equal(r.length, 8191); assert.equal(r[0], 0x02); assert.ok(zeros(r, 1));
});

test('hid packets: paging math', () => {
  assert.equal(reportCount(0, 'gen2Key'), 1);
  assert.equal(reportCount(1016, 'gen2Key'), 1);
  assert.equal(reportCount(1017, 'gen2Key'), 2);
  assert.equal(reportCount(1008, 'region'), 1);
  assert.equal(reportCount(1009, 'region'), 2);
  assert.equal(reportCount(19254, 'mini'), 20);
  assert.equal(reportCount(15606, 'orig'), 2);
  for (const n of [0, 1, 1015, 1016, 1017, 5000, 53027]) {
    assert.equal(packets.gen2Key(1, seq(n)).length, reportCount(n, 'gen2Key'), `gen2 ${n}`);
    assert.equal(packets.region(0, 0, 8, 8, seq(n)).length, reportCount(n, 'region'), `region ${n}`);
    // payload bytes reassemble exactly
    const back = sniffReports(packets.gen2Key(1, seq(n)), M.mk2)[0].bytes;
    assert.deepEqual(back, seq(n));
  }
});

test('hid packets: the documented-report guard', () => {
  const ok = (p, m) => assert.equal(checkOutputReport(p, m), null);
  const no = (p, m, re) => assert.match(checkOutputReport(p, m) || '', re);
  ok(packets.gen2Key(0, seq(10))[0], M.mk2);
  ok(packets.region(0, 0, 200, 100, seq(10))[0], M.plus);
  ok(packets.window(seq(10))[0], M.neo);
  ok(packets.mini(0, seq(10))[0], M.mini);
  ok(packets.orig(0, seq(10))[0], M.original);
  ok(packets.resetStream()[0], M.plus);
  no(packets.region(0, 0, 8, 8, seq(10))[0], M.mk2, /without a strip/);
  no(packets.window(seq(10))[0], M.plus, /info bar/);
  no(packets.gen2Key(0, seq(10))[0], M.mini, /gen2 command/);
  no(packets.mini(0, seq(10))[0], M.plus, /gen1 image/);
  no(packets.studioKnob(0, 1, 2, 3)[0], M.plus, /Studio/);
  no(packets.gen2Full(seq(10))[0], M.galleon, /full-LCD/);
  const forged = new Uint8Array(1024); forged.set([0x02, 0x09]);
  no(forged, M.plus, /not a documented/);
  const dirtyReset = packets.resetStream()[0]; dirtyReset[100] = 1;
  no(dirtyReset, M.plus, /zero-filled/);
  no(new Uint8Array(1000), M.plus, /length/);
  const feat = new Uint8Array(1024); feat[0] = 0x03;
  no(feat, M.plus, /report id/);
});

// ---------------------------------------------------------------------------- feature reports

test('hid features: byte layouts (research §2.5)', () => {
  const b = features.brightness(M.mk2, 60);
  assert.equal(b.length, 32); assert.deepEqual(head(b, 4), [0x03, 0x08, 60, 0]); assert.ok(zeros(b, 3));
  const g1 = features.brightness(M.original, 60);
  assert.equal(g1.length, 17); assert.deepEqual(head(g1, 7), [0x05, 0x55, 0xaa, 0xd1, 0x01, 60, 0]);
  assert.equal(features.brightness(M['mini-2022'], 60).length, 32, 'newer Minis try 32 first');
  assert.equal(features.brightness(M.mini, 60).length, 17, 'the 0x0063 Mini uses 17');
  assert.deepEqual(head(features.brightness(M.mini, 60, 32), 6), [0x05, 0x55, 0xaa, 0xd1, 0x01, 60]);
  assert.equal(features.brightness(M.mk2, 250)[2], 100, 'clamped');
  assert.deepEqual(head(features.showLogo(M.plus), 3), [0x03, 0x02, 0]);
  assert.deepEqual(head(features.showLogo(M.original), 3), [0x0b, 0x63, 0]);
  assert.equal(features.showLogo(M.original).length, 17);
  assert.deepEqual(head(features.sleepSeconds(300), 7), [0x03, 0x0d, 0x2c, 0x01, 0x00, 0x00, 0]);
  assert.deepEqual(head(features.fillKey(8, 1, 2, 3), 7), [0x03, 0x06, 8, 1, 2, 3, 0]);
  assert.deepEqual(head(features.fillLcd(1, 2, 3), 6), [0x03, 0x05, 1, 2, 3, 0]);
  assert.deepEqual(Array.from(features.galleonPing()), [0x03, 0x27]);
  assert.deepEqual(Array.from(features.galleonRingPixel(5, 1, 2, 3)), [0x03, 0x24, 5, 1, 2, 3]);
  assert.deepEqual([galleonRingIndex(0, 0), galleonRingIndex(0, 1), galleonRingIndex(1, 0), galleonRingIndex(1, 3)], [7, 4, 1, 0]);
  const serial = new Uint8Array(32); serial.set([0x06, 5, ...Buffer.from('AB123')]);
  assert.equal(decodeGet(M.plus, 0x06, serial), 'AB123');
});

const FEATURE_VECTORS = [
  '0308640000', '0308650000', '03083c', '0302', '030200', '0305010203', '030608010203', '030d2c010000', '0327', '032701',
  '0324050102030000', '0555aad10132', '0555aad10165', '0b63', '0b6300', '03ff', '0b00', '0406', '03', '1234', '0555aad102', '0306', '030dffffffff00',
];

test('hid features: the allowlist refuses everything undocumented', () => {
  const allow = (hex) => checkFeature(Buffer.from(hex, 'hex')) === null;
  for (const m of [M.mk2, M.original, M.mini, M.galleon]) {
    assert.ok(allow(Buffer.from(features.brightness(m, 70)).toString('hex')));
    assert.ok(allow(Buffer.from(features.showLogo(m)).toString('hex')));
  }
  assert.ok(allow('0327'));
  assert.ok(!allow('032701'), 'non-zero padding');
  assert.ok(!allow('0308650000'), 'brightness > 100');
  assert.ok(!allow('03ff'), 'unknown command');
  assert.ok(!allow('0b00'));
  assert.ok(!allow('0555aad102'), 'truncated gen1 report');
  assert.ok(!allow('03'), 'too short');
});

const py = spawnSync('python3', ['-I', HELPER, '--ioc', '32'], { encoding: 'utf8', timeout: 20000 });
const havePython = py.status === 0;

test('hid helper (python3): ioctl numbers and allowlist parity with features.js', { skip: !havePython && 'python3 not available' }, () => {
  const ioc = spawnSync('python3', ['-I', HELPER, '--ioc', '32', '17', '2'], { encoding: 'utf8' });
  assert.equal(ioc.status, 0);
  assert.deepEqual(ioc.stdout.trim().split(/\r?\n/), ['C0204806 C0204807', 'C0114806 C0114807', 'C0024806 C0024807']);
  const chk = spawnSync('python3', ['-I', HELPER, '--check', ...FEATURE_VECTORS], { encoding: 'utf8' });
  assert.equal(chk.status, 0, chk.stderr);
  const verdicts = chk.stdout.trim().split(/\r?\n/).map((l) => l.startsWith('allow'));
  assert.deepEqual(verdicts, FEATURE_VECTORS.map((h) => checkFeature(Buffer.from(h, 'hex')) === null));
  assert.ok(verdicts.filter(Boolean).length >= 8 && verdicts.filter((v) => !v).length >= 8);
  // the helper refuses anything that isn't /dev/hidrawN without touching it
  const bad = spawnSync('python3', ['-I', HELPER, '/etc/passwd'], { encoding: 'utf8', input: '' });
  assert.match(bad.stdout, /^fatal/);
});

test('hid helper (python3): allowlist tables are textually identical', () => {
  const src = fs.readFileSync(HELPER, 'utf8');
  const block = /ALLOWED_SET = \[([\s\S]*?)\n\]/.exec(src)[1];
  const rows = [...block.matchAll(/\(\[([^\]]*)\],\s*(\d+)\)/g)].map((m) => [m[1].split(',').map((x) => parseInt(x.trim(), 16)), Number(m[2])]);
  assert.deepEqual(rows, ALLOWED_SET.map(([p, n]) => [[...p], n]));
  const gets = /ALLOWED_GET = \[([^\]]*)\]/.exec(src)[1].split(',').map((x) => parseInt(x.trim(), 16));
  assert.deepEqual(gets, [...ALLOWED_GET]);
});

// helper client over a fake child process (no python needed)
function fakeChild(respond) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.lines = [];
  child.stdin = new PassThrough();
  let buf = '';
  child.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); child.lines.push(l); const r = respond(l); if (r) child.stdout.write(`${r}\n`); } });
  child.stdin.on('finish', () => { child.ended = true; });
  child.kill = () => { child.killed = true; };
  return child;
}

test('hid helper client: ready handshake, request ids, refusals never reach the helper', async () => {
  let child;
  const spawn = (cmd, args) => {
    assert.equal(cmd, 'python3'); assert.deepEqual(args.slice(0, 2), ['-I', '-u']); assert.equal(args[3], '/dev/hidraw7');
    child = fakeChild((l) => { const [id, op] = l.split(' '); return op === 'G' ? `${id} ok 06054142313233` : `${id} ok`; });
    setImmediate(() => child.stdout.write('ready 1\n'));
    return child;
  };
  const fx = await startFeatureHelper('/dev/hidraw7', { spawn });
  assert.equal(await fx.set(features.brightness(M.plus, 40)), null);
  assert.match(child.lines[0], /^1 S 030828000000/);
  const got = await fx.get(0x06, 32);
  assert.equal(decodeGet(M.plus, 0x06, got), 'AB123');
  await fx.keepAlive(500, [0x03, 0x27]);
  assert.equal(child.lines[2], '3 K 500 0327');
  await assert.rejects(fx.set(Uint8Array.from([0x03, 0xff])), { code: 'EREFUSED' });
  await assert.rejects(fx.get(0x99), { code: 'EREFUSED' });
  assert.equal(child.lines.length, 3, 'refused requests are not sent');
  fx.close();
  await new Promise((r) => setImmediate(r));
  assert.ok(child.ended, 'stdin closed → the helper stops its keep-alive and exits');
});

test('hid helper client: fatal open, missing python, helper errors', async () => {
  const fatal = () => { const c = fakeChild(() => null); setImmediate(() => c.stdout.write('fatal 13 Permission denied\n')); return c; };
  await assert.rejects(startFeatureHelper('/dev/hidraw1', { spawn: fatal }), { code: 'EACCES' });
  const missing = () => { const c = fakeChild(() => null); setImmediate(() => c.emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }))); return c; };
  await assert.rejects(startFeatureHelper('/dev/hidraw1', { spawn: missing }), { code: 'ENOHELPER' });
  const failing = () => { const c = fakeChild((l) => `${l.split(' ')[0]} err 32 Broken pipe`); setImmediate(() => c.stdout.write('ready 1\n')); return c; };
  const fx = await startFeatureHelper('/dev/hidraw1', { spawn: failing });
  await assert.rejects(fx.set(features.showLogo(M.plus)), { code: 'EIO', errno: 32 });
  fx.close();
});

// ---------------------------------------------------------------------------- input reports

const rep = (...b) => Uint8Array.from(b);

test('hid input: gen2 keys, dials, touch strip (Stream Deck +)', () => {
  const p = createInputParser(M.plus);
  assert.deepEqual(p.parse(rep(1, 0, 8, 0, 0, 0, 1, 0, 0, 0, 0, 0)), [{ type: 'down', key: 2 }]);
  assert.deepEqual(p.parse(rep(1, 0, 8, 0, 0, 0, 1, 0, 0, 0, 0, 1)), [{ type: 'down', key: 7 }], 'edge-detected: key 2 still held');
  assert.deepEqual(p.parse(rep(1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0)), [{ type: 'up', key: 2 }, { type: 'up', key: 7 }]);
  assert.deepEqual(p.parse(rep(1, 3, 5, 0, 1, 0xfe, 3, 0, 0)), [{ type: 'rotate', dial: 0, ticks: -2 }, { type: 'rotate', dial: 1, ticks: 3 }]);
  assert.deepEqual(p.parse(rep(1, 3, 5, 0, 0, 0, 1, 0, 0)), [{ type: 'dialDown', dial: 1 }]);
  assert.deepEqual(p.parse(rep(1, 3, 5, 0, 0, 0, 1, 0, 0)), [], 'no repeat while held');
  assert.deepEqual(p.parse(rep(1, 3, 5, 0, 0, 0, 0, 0, 0)), [{ type: 'dialUp', dial: 1 }]);
  assert.deepEqual(p.parse(rep(1, 2, 14, 0, 1, 0, 100, 0, 40, 0)), [{ type: 'touch', gesture: 'tap', x: 100, y: 40 }]);
  assert.deepEqual(p.parse(rep(1, 2, 14, 0, 2, 0, 0x20, 0x03, 50, 0)), [{ type: 'touch', gesture: 'press', x: 800, y: 50 }]);
  assert.deepEqual(p.parse(rep(1, 2, 14, 0, 3, 0, 0x2c, 0x01, 0x32, 0, 0x58, 0x02, 0x32, 0)), [{ type: 'touch', gesture: 'flick', x: 300, y: 50, x2: 600, y2: 50 }]);
  assert.deepEqual(p.parse(rep(2, 0, 8, 0, 1)), [], 'other report ids are ignored');
  assert.deepEqual(p.parse(rep(1, 4, 3, 0, 65, 66, 67)), [], 'no NFC on the +');
});

test('hid input: Neo sensors, Galleon, Studio NFC, gen1 (original right-to-left, Mini)', () => {
  const neo = createInputParser(M.neo);
  assert.deepEqual(neo.parse(rep(1, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)), [{ type: 'down', key: 9, sensor: 1 }]);
  const gal = createInputParser(M.galleon);
  assert.deepEqual(gal.parse(rep(1, 0, 12, 0, ...Array(11).fill(0), 1)), [{ type: 'down', key: 11 }]);
  assert.deepEqual(gal.parse(rep(1, 3, 5, 0, 1, 0, 0xff)), [{ type: 'rotate', dial: 1, ticks: -1 }]);
  assert.deepEqual(gal.parse(rep(1, 2, 14, 0, 1, 0, 1, 0, 1, 0)), [], 'the Galleon has no touch');
  const studio = createInputParser(M.studio);
  assert.deepEqual(studio.parse(rep(1, 4, 5, 0, ...Buffer.from('ABC12'))), [{ type: 'nfc', id: 'ABC12' }]);
  const orig = createInputParser(M.original);
  assert.deepEqual(orig.parse(rep(1, 0, 0, 0, 0, 1, ...Array(10).fill(0))), [{ type: 'down', key: 0 }], 'wire 4 = top-left');
  assert.deepEqual(orig.parse(rep(1, 1, 0, 0, 0, 1, ...Array(10).fill(0))), [{ type: 'down', key: 4 }], 'wire 0 = top-right');
  const mini = createInputParser(M.mini);
  assert.deepEqual(mini.parse(rep(1, 0, 0, 1, 0, 0, 0)), [{ type: 'down', key: 2 }]);
});

// ---------------------------------------------------------------------------- discovery

function fakeSysfs() {
  const root = tmp('sysfs');
  const dev = (node, lines) => { const d = path.join(root, 'class', 'hidraw', node, 'device'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'uevent'), `${lines.join('\n')}\n`); };
  dev('hidraw0', ['DRIVER=hid-generic', 'HID_ID=0003:00000FD9:00000084', 'HID_NAME=Elgato Stream Deck +', 'HID_PHYS=usb-0000:00:14.0-3/input0', 'HID_UNIQ=A00WA1234567', 'MODALIAS=hid:b0003g0001v00000FD9p00000084']);
  dev('hidraw1', ['HID_ID=0003:00001B1C:00002B18', 'HID_NAME=Corsair GALLEON 100 SD', 'HID_PHYS=usb-0000:00:14.0-4/input0', 'HID_UNIQ=GAL0001']);
  dev('hidraw2', ['HID_ID=0003:00001B1C:00002B18', 'HID_PHYS=usb-0000:00:14.0-4/input1', 'HID_UNIQ=GAL0001']);
  dev('hidraw3', ['HID_ID=0003:00001B1C:00002B18', 'HID_PHYS=usb-0000:00:14.0-4/input2']);
  dev('hidraw4', ['HID_ID=0003:00001B1C:00002B0C', 'HID_PHYS=usb-0000:00:14.0-5/input0']);
  dev('hidraw5', ['HID_ID=0005:00000FD9:00000084', 'HID_PHYS=bt/input0']);
  dev('hidraw6', ['HID_ID=0003:00000FD9:00000070', 'HID_PHYS=usb-1/input0']);
  dev('hidraw7', ['garbage without equals', 'HID_ID=not-an-id']);
  dev('hidraw10', ['HID_ID=0003:00000FD9:00000090', 'HID_NAME=Elgato Stream Deck Mini', 'HID_PHYS=usb-0000:00:14.0-1/input0']);
  // sysfs bInterfaceNumber of the parent usb_interface (in this flat fake tree: next to "device")
  const ifn = (node, v) => fs.writeFileSync(path.join(root, 'class', 'hidraw', node, 'bInterfaceNumber'), v + String.fromCharCode(10));
  dev('hidraw11', ['HID_ID=0003:00001B1C:00002B18', 'HID_PHYS=usb-0000:00:14.0-6/input0']); ifn('hidraw11', '01'); // HID_PHYS and sysfs disagree → refused
  dev('hidraw12', ['HID_ID=0003:00001B1C:00002B18', 'HID_PHYS=weird-phys-string']); ifn('hidraw12', '00'); // sysfs alone says deck interface
  dev('hidraw13', ['HID_ID=0003:00001B1C:00002B18', 'HID_PHYS=weird-phys-string']); // interface unknown → refused
  ifn('hidraw1', '00'); ifn('hidraw2', '01');
  fs.mkdirSync(path.join(root, 'class', 'hidraw', 'README'));
  fs.mkdirSync(path.join(root, 'class', 'hidraw', 'hidraw8')); // no uevent
  return root;
}

test('hid discovery: uevent parsing', () => {
  assert.deepEqual(parseUevent('A=1\nHID_NAME=Elgato = Deck\n\nbad\n'), { A: '1', HID_NAME: 'Elgato = Deck' });
  assert.deepEqual(parseHidId('0003:00000FD9:00000084'), { bus: 3, vid: 0x0fd9, pid: 0x84 });
  assert.equal(parseHidId('0003:0FD9:0084'), null);
});

test('hid discovery: a fake /sys tree — USB only, known ids, Galleon interface 0 only', () => {
  const sysfs = fakeSysfs();
  const decks = listDecks({ sysfs, dev: '/dev' });
  assert.deepEqual(decks.map((d) => [d.path, d.id, d.serial, d.iface]), [
    ['/dev/hidraw0', 'plus', 'A00WA1234567', 0],
    ['/dev/hidraw1', 'galleon', 'GAL0001', 0],
    ['/dev/hidraw10', 'mini-2022', null, 0],
    ['/dev/hidraw12', 'galleon', null, 0],
  ]);
  assert.equal(decks[0].name, 'Elgato Stream Deck +');
  assert.equal(selectDeck(decks, { model: 'galleon', path: 'hidraw1' }).path, '/dev/hidraw1');
  assert.throws(() => selectDeck(decks, { path: '/dev/hidraw2' }), { code: 'ENODEV' }, 'the Galleon keyboard interface is never selectable');
  assert.equal(selectDeck(decks, { serial: 'A00WA1234567' }).id, 'plus');
  assert.equal(selectDeck(decks, { path: 'hidraw10' }).id, 'mini-2022');
  assert.throws(() => selectDeck(decks, {}), { code: 'EAMBIGUOUS' });
  assert.throws(() => selectDeck(decks, { model: 'xl' }), { code: 'ENODEV' });
  assert.throws(() => selectDeck([], {}), { code: 'ENODEV' });
  assert.deepEqual(listDecks({ sysfs: path.join(sysfs, 'nope') }), [], 'no hidraw → no decks (Windows, macOS, containers)');
});

test('hid open: a Galleon node that is not the deck interface is refused before anything is opened', async () => {
  let opened = false;
  const openTransport = async () => { opened = true; return memoryTransport(); };
  await assert.rejects(HidDeck.open({ path: '/dev/hidraw2', node: 'hidraw2', id: 'galleon', model: M.galleon, iface: 1 }, { claim: false, openTransport, helper: false }), (e) => e.code === 'EINVAL' && /interface 1/.test(e.message));
  await assert.rejects(HidDeck.open({ path: '/dev/hidraw9', node: 'hidraw9', id: 'galleon', model: M.galleon }, { claim: false, openTransport, helper: false }), { code: 'EINVAL' });
  assert.equal(opened, false);
});

// ---------------------------------------------------------------------------- claims / EBUSY

function fakeProc(tree) {
  // tree: { '/proc': [entries], '/proc/200/fd': [..], '/proc/200/fd/5': '->/dev/hidraw0', '/proc/200/comm': 'text', '/proc/300/fd': 'EACCES' }
  const err = (code, p) => Object.assign(new Error(`${code}: ${p}`), { code });
  const get = (p) => { if (!(p in tree)) throw err('ENOENT', p); if (tree[p] === 'EACCES') throw err('EACCES', p); return tree[p]; };
  return {
    readdirSync: (p) => { const v = get(p); if (!Array.isArray(v)) throw err('ENOTDIR', p); return v; },
    readFileSync: (p) => { const v = get(p); if (typeof v !== 'string' || v.startsWith('->')) throw err('EINVAL', p); return v; },
    readlinkSync: (p) => { const v = get(p); if (typeof v !== 'string' || !v.startsWith('->')) throw err('EINVAL', p); return v.slice(2); },
  };
}
const PROC = {
  '/proc': ['1', '200', '300', '400', 'self', 'sys'],
  '/proc/1/fd': ['0'], '/proc/1/fd/0': '->/dev/null', '/proc/1/comm': 'systemd\n', '/proc/1/cmdline': '/sbin/init\0',
  '/proc/200/fd': ['0', '1', '5'], '/proc/200/fd/0': '->/dev/pts/0', '/proc/200/fd/1': '->socket:[123]', '/proc/200/fd/5': '->/dev/hidraw0', '/proc/200/comm': 'opendeck\n', '/proc/200/cmdline': '/usr/bin/opendeck\0',
  '/proc/300/fd': 'EACCES', '/proc/300/comm': 'node\n', '/proc/300/cmdline': 'node\0/srv/app.js\0',
  '/proc/400/fd': ['3'], '/proc/400/fd/3': '->/dev/hidraw9', '/proc/400/comm': 'python3\n', '/proc/400/cmdline': 'python3\0/app/bin/StreamController/main.py\0',
};

test('hid claim: /proc holders, running deck apps', () => {
  const fs_ = fakeProc(PROC);
  assert.deepEqual(findHolders('/dev/hidraw0', { proc: '/proc', fs: fs_, pid: 999 }), [{ pid: 200, comm: 'opendeck' }]);
  assert.deepEqual(findHolders('/dev/hidraw1', { proc: '/proc', fs: fs_, pid: 999 }), []);
  assert.deepEqual(findHolders('/dev/hidraw0', { proc: '/proc', fs: fs_, pid: 200 }), [], 'our own process is not a holder');
  assert.deepEqual(findDeckApps({ proc: '/proc', fs: fs_, pid: 999 }).map((a) => [a.pid, a.app]), [[200, 'OpenDeck'], [400, 'StreamController']]);
  assert.deepEqual(findHolders('/dev/hidraw0', { proc: '/nowhere', fs: fs_ }), []);
});

test('hid claim: EBUSY when held, when a deck app runs (unless --force), and on a second open', () => {
  const fs_ = fakeProc(PROC), lockDir = tmp('lock');
  const info = (n, serial) => ({ path: `/dev/hidraw${n}`, node: `hidraw${n}`, id: 'plus', model: M.plus, serial });
  assert.throws(() => claimDeck(info(0, 'S0'), { proc: '/proc', fs: fs_, lockDir, pid: 999 }), (e) => e instanceof HidError && e.code === 'EBUSY' && e.holders[0].pid === 200 && /opendeck/.test(e.message));
  assert.throws(() => claimDeck(info(0, 'S0'), { proc: '/proc', fs: fs_, lockDir, pid: 999, force: true }), { code: 'EBUSY' }, '--force never overrides a real holder');
  assert.throws(() => claimDeck(info(1, 'S1'), { proc: '/proc', fs: fs_, lockDir, pid: 999 }), (e) => e.code === 'EBUSY' && e.apps.length === 2);
  const lock = claimDeck(info(1, 'S1'), { proc: '/proc', fs: fs_, lockDir, pid: 999, force: true });
  assert.ok(fs.existsSync(lock.file));
  assert.throws(() => claimDeck(info(1, 'S1'), { proc: '/proc', fs: fs_, lockDir, pid: 999, force: true }), { code: 'EBUSY' }, 'second open in this process');
  assert.throws(() => claimDeck(info(1, 'S1'), { proc: '/proc', fs: fs_, lockDir, pid: 1000, force: true, isAlive: () => true }), (e) => e.code === 'EBUSY' && /pid 999/.test(e.message), 'another live Prism Deck process');
  lock.release();
  assert.ok(!fs.existsSync(lock.file));
});

test('hid claim: a stale lock (dead pid) is reclaimed', () => {
  const dir = tmp('stale');
  fs.writeFileSync(path.join(dir, 'prism-deck-SER1.lock'), '4242\n');
  assert.throws(() => acquireLock('SER1', { dir, pid: 7, isAlive: () => true }), { code: 'EBUSY' });
  const l = acquireLock('SER1', { dir, pid: 7, isAlive: (p) => p !== 4242 });
  assert.equal(fs.readFileSync(l.file, 'utf8').trim(), '7');
  l.release();
});

test('hid claim: HidDeck.open refuses a claimed deck before opening the node', async () => {
  let opened = false;
  const fs_ = fakeProc(PROC);
  await assert.rejects(HidDeck.open({ path: '/dev/hidraw0', node: 'hidraw0', id: 'plus', model: M.plus, serial: 'S' }, { proc: '/proc', claimFs: fs_, lockDir: tmp('l2'), openTransport: async () => { opened = true; return memoryTransport(); }, helper: false }), { code: 'EBUSY' });
  assert.equal(opened, false);
});

// ---------------------------------------------------------------------------- transport (fake /dev/hidraw*)

function fakeCharDevice({ inbox = [], openError, readError } = {}) {
  const written = [];
  let n = 0, opens = 0;
  return {
    written, inbox, get opens() { return opens; },
    constants: { O_RDWR: 2, O_NONBLOCK: 0o4000 },
    openSync(p, flags) { opens++; if (openError) throw Object.assign(new Error(openError), { code: openError }); this.flags = flags; return 42; },
    write(fd, buf, off, len, pos, cb) {
      assert.equal(pos, null, 'position must be null (pwrite on a char device is ESPIPE)');
      const copy = Buffer.from(buf.subarray(off, off + len));
      setTimeout(() => { written.push(copy); cb(null, len); }, Math.max(0, 6 - n++)); // later writes finish faster: would reorder if not serialized
    },
    readSync(fd, buf) {
      if (readError) throw Object.assign(new Error(readError), { code: readError });
      const r = inbox.shift();
      if (!r) throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' });
      buf.set(r); return r.length;
    },
    closeSync() { this.closed = true; },
  };
}

test('hid transport: one report per write, strictly in order, non-blocking reads', async () => {
  const dev = fakeCharDevice({ inbox: [rep(1, 0, 8, 0, 1)] });
  const t = await openHidraw('/dev/hidraw3', { fs: dev });
  assert.equal(dev.flags, 2 | 0o4000, 'O_RDWR | O_NONBLOCK');
  const reports = packets.gen2Key(1, seq(5000));
  await Promise.all(reports.map((p) => t.write(p)));
  assert.equal(dev.written.length, reports.length);
  dev.written.forEach((w, i) => assert.deepEqual(new Uint8Array(w), reports[i], `report ${i} in order`));
  assert.deepEqual(Array.from(t.read()), [1, 0, 8, 0, 1]);
  assert.equal(t.read(), null, 'EAGAIN → null');
  t.close();
  assert.ok(dev.closed);
  await assert.rejects(t.write(reports[0]), { code: 'ENODEV' });
});

test('hid transport: errno mapping (EACCES retried, EIO → ENODEV)', async () => {
  const denied = fakeCharDevice({ openError: 'EACCES' });
  await assert.rejects(openHidraw('/dev/hidraw3', { fs: denied, retryAccessMs: 400 }), (e) => e.code === 'EACCES' && /udev/.test(e.message));
  assert.ok(denied.opens >= 2, 'EACCES is retried while udev applies the ACL');
  await assert.rejects(openHidraw('/dev/hidraw3', { fs: fakeCharDevice({ openError: 'ENOENT' }) }), { code: 'ENODEV' });
  await assert.rejects(openHidraw('/dev/hidraw3', { fs: fakeCharDevice({ openError: 'EBUSY' }) }), { code: 'EBUSY' });
  const t = await openHidraw('/dev/hidraw3', { fs: fakeCharDevice({ readError: 'EIO' }) });
  assert.throws(() => t.read(), { code: 'ENODEV' });
});

test('hid transport: real node:fs path against a regular file', async () => {
  const file = path.join(tmp('file'), 'hidraw-fake');
  fs.writeFileSync(file, '');
  const t = await openHidraw(file);
  const reports = packets.region(0, 0, 200, 100, seq(3000));
  for (const p of reports) t.write(p);
  await t.drain();
  t.close();
  assert.deepEqual(new Uint8Array(fs.readFileSync(file)), Uint8Array.from(Buffer.concat(reports.map((p) => Buffer.from(p)))));
});

// ---------------------------------------------------------------------------- deck

function fakeClock() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms, step = 10) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + step);
        for (const h of timers.filter((x) => x.at <= t)) { timers.splice(timers.indexOf(h), 1); h.fn(); }
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      }
    },
  };
}
const info = (id) => ({ path: `/dev/fake-${id}`, node: `fake-${id}`, id, model: M[id], serial: `T-${id}` });
const fakeHelper = () => { const calls = []; return { calls, set: async (b) => { calls.push(['S', Array.from(b)]); return null; }, get: async () => new Uint8Array(32), keepAlive: async (ms, b) => { calls.push(['K', ms, Array.from(b)]); }, close() { calls.push(['close']); } }; };
const openFake = (id, extra = {}) => { const transport = memoryTransport(); return HidDeck.open(info(id), { transport, claim: false, helper: false, pollMs: 0, ...extra }).then((deck) => ({ deck, transport })); };
const gradient = (w, h) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = Math.round((x * 255) / (w - 1)); d[i + 1] = Math.round((y * 255) / (h - 1)); d[i + 2] = x < w / 4 && y < h / 4 ? 255 : 40; d[i + 3] = 255; } return { data: d, w, h }; };

test('hid deck: reset stream on open, dedupe, LCD region bounds', async () => {
  const { deck, transport } = await openFake('plus');
  assert.equal(transport.writes.length, 1);
  assert.deepEqual(transport.writes[0], packets.resetStream(1024)[0]);
  assert.equal(await deck.setKey(0, gradient(120, 120)), true);
  assert.equal(await deck.setKey(0, gradient(120, 120)), false, 'identical pixels are not re-sent');
  assert.equal(deck.stats.deduped, 1);
  await assert.rejects(deck.setKey(0, gradient(72, 72)), RangeError);
  await assert.rejects(deck.setKey(8, gradient(120, 120)), RangeError);
  assert.equal(await deck.setLcd(gradient(200, 100), { x: 600, y: 0, w: 200, h: 100 }), true);
  await assert.rejects(deck.setLcd(gradient(200, 100), { x: 700, y: 0, w: 200, h: 100 }), RangeError);
  const { deck: mk2 } = await openFake('mk2');
  await assert.rejects(mk2.setLcd(gradient(10, 10)), { code: 'EINVAL' });
  await deck.close({ blank: false }); await mk2.close({ blank: false });
});

test('hid deck: token-bucket pacing and latest-wins (no backlog)', async () => {
  const clock = fakeClock();
  const { deck, transport } = await openFake('mini', { budget: 20, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const before = transport.writes.length;
  const img = (v) => solid(80, 80, [v, v, v]);
  const sent = [0, 1, 2, 3].map((k) => deck.setKey(k, img(10 + k)));
  await Promise.all(sent.slice(0, 3));
  assert.equal(transport.writes.length - before, 60, 'three 20-report images fit the 64-report burst');
  const newer = deck.setKey(3, img(200));
  assert.equal(await sent[3], false, 'the unsent frame for key 3 was superseded');
  assert.equal(transport.writes.length - before, 60, 'key 3 waits for tokens');
  await clock.advance(1000);
  assert.equal(await newer, true);
  assert.equal(transport.writes.length - before, 80);
  const last = sniffReports(transport.writes.slice(before), M.mini).filter((f) => f.target === 'key:3');
  assert.equal(last.length, 1);
  assert.equal(decodeBMP(last[0].bytes, { rowOrder: 'device' }).data[0], 200);
  assert.equal(deck.stats.superseded, 1);
  await deck.close({ blank: false });
});

test('hid deck: the Galleon needs the helper — keep-alive first, no reset report', async () => {
  const transport = memoryTransport();
  await assert.rejects(HidDeck.open(info('galleon'), { transport, claim: false, pollMs: 0, startHelper: async () => { throw new HidError('ENOHELPER', 'no python3'); } }), (e) => e.code === 'ENOHELPER' && /keep-alive/.test(e.message));
  assert.ok(transport.closed);
  const fx = fakeHelper();
  const t2 = memoryTransport();
  const deck = await HidDeck.open(info('galleon'), { transport: t2, claim: false, pollMs: 0, startHelper: async () => fx });
  assert.deepEqual(fx.calls[0], ['K', 500, [0x03, 0x27]]);
  assert.equal(t2.writes.length, 0, 'no reset-stream report on the Galleon');
  await deck.setLcd(gradient(360, 192), { x: 360, y: 192, w: 360, h: 192 });
  assert.deepEqual(head(t2.writes[0], 16).slice(0, 10), [0x02, 0x0c, 0x68, 0x01, 0xc0, 0x00, 0x68, 0x01, 0xc0, 0x00]);
  const n = t2.writes.length;
  await deck.close();
  assert.equal(t2.writes.length, n, 'close sends nothing more: the Galleon returns to standalone mode');
  assert.deepEqual(fx.calls.at(-1), ['close']);
});

test('hid deck: brightness — hardware via the helper, software dimming without it', async () => {
  const fx = fakeHelper();
  const { deck } = await openFake('plus', { helper: fx });
  assert.equal(await deck.setBrightness(60), 'hardware');
  assert.deepEqual(fx.calls.at(-1), ['S', Array.from(features.brightness(M.plus, 60))]);
  await deck.close({ blank: false });
  const { deck: soft, transport } = await openFake('plus');
  assert.equal(await soft.setBrightness(50), 'software');
  await soft.setKey(1, solid(120, 120, [255, 255, 255]));
  const f = sniffReports(transport.writes, M.plus).find((x) => x.target === 'key:1');
  const px = decodeJPEG(f.bytes).data;
  assert.ok(Math.abs(px[0] - 128) <= 3, `dimmed to ~50% (got ${px[0]})`);
  await soft.close({ blank: false });
});

test('hid deck: close shows the logo (helper) or blanks every key and the strip', async () => {
  const fx = fakeHelper();
  const { deck } = await openFake('plus', { helper: fx });
  await deck.close();
  assert.deepEqual(fx.calls.find((c) => c[0] === 'S')[1].slice(0, 3), [0x03, 0x02, 0]);
  const { deck: d2, transport } = await openFake('plus');
  await d2.setKey(0, gradient(120, 120));
  await d2.close();
  const frames = sniffReports(transport.writes, M.plus).filter((f) => f.bytes);
  const black = frames.slice(1);
  assert.deepEqual(black.map((f) => f.target).sort(), [...Array.from({ length: 8 }, (_, k) => `key:${k}`), 'lcd:0,0,800,100'].sort());
  for (const f of black) assert.ok(decodeJPEG(f.bytes).data.every((v, i) => i % 4 === 3 || v < 4), `${f.target} is black`);
});

test('hid deck: unplug → disconnect event, lock released', async () => {
  const transport = memoryTransport({ failAfter: 1 });
  const lockDir = tmp('unplug');
  const deck = await HidDeck.open(info('mk2'), { transport, pollMs: 0, helper: false, proc: '/nowhere', lockDir });
  assert.equal(fs.readdirSync(lockDir).length, 1);
  const lost = new Promise((r) => deck.once('disconnect', r));
  await assert.rejects(deck.setKey(0, gradient(72, 72)), { code: 'ENODEV' });
  assert.equal((await lost).code, 'ENODEV');
  assert.ok(deck.closed);
  assert.equal(fs.readdirSync(lockDir).length, 0);
});

test('hid deck: input reports become events', async () => {
  const { deck, transport } = await openFake('plus');
  const seen = [];
  deck.on('input', (e) => seen.push(e));
  transport.push(rep(1, 0, 8, 0, 1));
  transport.push(rep(1, 3, 5, 0, 1, 2, 0, 0, 0));
  deck.poll();
  assert.deepEqual(seen, [{ type: 'down', key: 0 }, { type: 'rotate', dial: 0, ticks: 2 }]);
  await deck.close({ blank: false });
});

// ---------------------------------------------------------------------------- loopback: encode → packets → sniff → decode

const INV = { none: 'none', rot180: 'rot180', mirrorX: 'mirrorX', ccw90: 'cw90' };
async function loopback(id, which) {
  const m = M[id];
  const fx = m.keepAlive ? fakeHelper() : false;
  const { deck, transport } = await openFake(id, { helper: fx });
  const src = which === 'key' ? gradient(m.key.w, m.key.h) : which === 'lcd' ? gradient(m.lcd.w, m.lcd.h) : gradient(200, 100);
  if (which === 'key') await deck.setKey(m.keys - 1, src);
  else if (which === 'lcd') await deck.setLcd(src);
  else await deck.setLcd(src, { x: 200, y: 0, w: 200, h: 100 });
  const frames = sniffReports(transport.writes, m).filter((f) => f.bytes);
  await deck.close({ blank: false });
  assert.equal(frames.length, 1);
  const f = frames[0];
  const xf = which === 'key' ? m.keyXf : m.lcd.xf;
  const raw = which === 'key' && m.keyFmt === 'bmp' ? decodeBMP(f.bytes, { rowOrder: 'device' }) : decodeJPEG(f.bytes);
  return { f, back: transformImage(raw, INV[xf]), src, m };
}

for (const [id, which] of [['original', 'key'], ['mini', 'key'], ['mk2', 'key'], ['xl', 'key'], ['neo', 'key'], ['plus', 'key'], ['plusxl', 'key'], ['studio', 'key'], ['galleon', 'key'],
  ['plus', 'segment'], ['plusxl', 'segment'], ['neo', 'lcd'], ['galleon', 'lcd']]) {
  test(`hid loopback: ${id} ${which} — upright after the device transform round-trip`, async () => {
    const { f, back, src, m } = await loopback(id, which);
    if (which === 'key') assert.equal(f.key, m.keys - 1);
    assert.equal(back.w, src.w); assert.equal(back.h, src.h);
    const d = diffImages(back, src);
    if (which === 'key' && m.keyFmt === 'bmp') assert.equal(d.max, 0, 'BMP is lossless');
    else assert.ok(d.mean < 3 && d.p99 < 24, `JPEG close to the source (mean ${d.mean.toFixed(2)}, p99 ${d.p99})`);
    const enc = which === 'key' && m.keyFmt === 'bmp' ? decodeBMP(f.bytes, { rowOrder: 'device' }) : decodeJPEG(f.bytes);
    const xf = which === 'key' ? m.keyXf : m.lcd.xf;
    assert.deepEqual([enc.w, enc.h], xf === 'ccw90' ? [src.h, src.w] : [src.w, src.h], 'encoded in device orientation');
    if (which === 'segment') assert.deepEqual(f.rect, { x: 200, y: 0, w: 200, h: 100 }, 'region header keeps logical coordinates');
  });
}

test('hid loopback: the 2017 original BMP header and pixel order (research §2.6)', async () => {
  const { deck, transport } = await openFake('original');
  const img = solid(72, 72, [10, 20, 30]);
  img.data.set([200, 100, 50, 255], 0); // top-left marker
  await deck.setKey(0, img);
  await deck.close({ blank: false });
  const f = sniffReports(transport.writes, M.original).find((x) => x.bytes);
  const b = f.bytes;
  assert.equal(f.key, 0);
  assert.deepEqual(Array.from(b.subarray(0, 54)), [0x42, 0x4d, 0xf6, 0x3c, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 72, 0, 0, 0, 72, 0, 0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 0xc0, 0x3c, 0, 0, 0xc4, 0x0e, 0, 0, 0xc4, 0x0e, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const at = (x, y) => Array.from(b.subarray(54 + (y * 72 + x) * 3, 54 + (y * 72 + x) * 3 + 3));
  assert.deepEqual(at(71, 0), [50, 100, 200], 'mirrored in X, first row first, BGR');
  assert.deepEqual(at(0, 0), [30, 20, 10]);
  assert.equal(transport.writes[1][5], 5, 'logical key 0 → wire key 4 (+1)');
});

// ---------------------------------------------------------------------------- layouts

test('hid layout: defaults per device and conflicts', () => {
  const plus = resolveLayout(M.plus, defaultLayout(M.plus));
  assert.deepEqual(plus.problems, []);
  assert.equal(plus.keyOwner.size, 8);
  assert.equal(plus.segOwner.size, 4);
  const gal = resolveLayout(M.galleon, defaultLayout(M.galleon));
  assert.equal(gal.keyOwner.size, 12); assert.equal(gal.widgetOwner.size, 4);
  const neo = resolveLayout(M.neo, defaultLayout(M.neo));
  assert.ok(neo.infobarOwner);
  assert.deepEqual(neo.infobarOwner.targets[0].padTo, { w: 248, h: 58 });
  const span = resolveLayout(M.plus, { spans: [parseSpanArg('span-waveform@0,1')], keys: ['icon-mic', 'icon-mic', 'icon-mic', 'icon-mic', 'icon-mic'] });
  assert.deepEqual(span.problems, []);
  assert.deepEqual([...span.keyOwner.keys()].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(span.keyOwner.get(5).facet.id, 'span-waveform', 'span wins over the key list');
  const bad = resolveLayout(M.mk2, { keys: { 0: 'nope', 1: 'dial-volume', 20: 'icon-mic' }, strip: 'strip-refraction', screen: 'screen-galleon-dashboard' });
  assert.equal(bad.problems.length, 5, bad.problems.join('\n'));
  const dup = resolveLayout(M.plus, { strip: 'strip-refraction', dials: ['dial-volume'] });
  assert.match(dup.problems.join(), /already used/);
  const wide = resolveLayout(M.mk2, { spans: [{ facet: 'span-waveform', col: 3, cols: 4 }] });
  assert.match(wide.problems.join(), /does not fit/);
});

// ---------------------------------------------------------------------------- runner

async function runnerOn(id, spec, extra = {}) {
  const clock = fakeClock();
  const fx = M[id].keepAlive ? fakeHelper() : false;
  const { deck, transport } = await openFake(id, { helper: fx, budget: 1e6, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const layout = resolveLayout(M[id], spec);
  assert.deepEqual(layout.problems, []);
  const run = createRunner(deck, layout, { now: clock.now, wallNow: () => Date.UTC(2026, 9, 15, 9, 41), tzOffset: () => 0, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...extra });
  await run.start();
  await deck.flush();
  return { deck, transport, run, clock, layout };
}
const targetsOf = (writes, m) => sniffReports(writes, m).filter((f) => f.bytes).map((f) => f.target);

test('hid runner: first frame reaches every target; press toggles state; dials and touch route to segments', async () => {
  const { deck, transport, run, clock, layout } = await runnerOn('plus', { keys: ['icon-mic'], dials: [null, 'dial-volume'] }, { reduced: true });
  assert.deepEqual(targetsOf(transport.writes, M.plus).sort(), ['key:0', 'lcd:200,0,200,100']);
  const mic = layout.keyOwner.get(0), dial = layout.segOwner.get(1);
  const n0 = transport.writes.length;
  await clock.advance(2000);
  assert.equal(transport.writes.length, n0, 'reduced motion: nothing changes, nothing is sent');
  run.handle({ type: 'down', key: 0 });
  assert.equal(run.optsFor(mic).pressed, true);
  await clock.advance(250);
  assert.ok(Math.abs(run.optsFor(mic).pressedFor - 0.25) < 0.02, 'pressedFor (API 1.3)');
  run.handle({ type: 'up', key: 0 });
  assert.equal(mic.state, 1, 'toggle: on → off');
  assert.ok(run.optsFor(mic).pressAge < 0.05);
  await deck.flush();
  assert.ok(targetsOf(transport.writes.slice(n0), M.plus).includes('key:0'), 'the pressed key was redrawn');
  const v0 = dial.value;
  run.handle({ type: 'rotate', dial: 1, ticks: 3 });
  assert.ok(Math.abs(dial.value - (v0 + 3 / 48)) < 1e-9);
  assert.equal(dial.ticks, 3);
  assert.equal(run.optsFor(dial).turnAge, 0, 'turnAge (API 1.3)');
  run.handle({ type: 'rotate', dial: 0, ticks: 5 }); // no facet on dial 0 — ignored
  run.handle({ type: 'touch', gesture: 'tap', x: 250, y: 40 });
  assert.equal(dial.state, 1, 'a tap on segment 1 presses its facet');
  assert.deepEqual(run.optsFor(dial).touch, { x: 50, y: 40, hold: false, age: 0 }, 'touch in segment-local px (API 1.3)');
  run.handle({ type: 'dialDown', dial: 1 }); run.handle({ type: 'dialUp', dial: 1 });
  assert.equal(dial.state, 0, 'dial press toggles back');
  await run.stop();
  await deck.close({ blank: false });
});

test('hid runner: animated facets stream at the fps cap with dedupe', async () => {
  const { deck, transport, run, clock } = await runnerOn('mk2', { keys: ['icon-mic', 'icon-play-pause'] }, { fpsCap: 5 });
  const n0 = run.stats.renders;
  await clock.advance(2000, 20);
  await deck.flush();
  const r = run.stats.renders - n0;
  assert.ok(r >= 14 && r <= 24, `two slots at ≤ 5 fps for 2 s → ~20 renders (got ${r})`);
  assert.ok(run.stats.sameSvg + deck.stats.deduped + deck.stats.frames >= r, 'every render is accounted for');
  assert.ok(transport.writes.length > 2);
  await run.stop();
  await deck.close({ blank: false });
});

test('hid runner: Galleon — holding a dial 3 s switches its widget layer (underline moves)', async () => {
  const { deck, transport, run, clock, layout } = await runnerOn('galleon', { screen: 'screen-galleon-dashboard' }, { reduced: true });
  const scr = layout.widgetOwner.get('0,0');
  assert.deepEqual(targetsOf(transport.writes, M.galleon).sort(), ['lcd:0,0,360,192', 'lcd:0,192,360,192', 'lcd:360,0,360,192', 'lcd:360,192,360,192']);
  run.handle({ type: 'rotate', dial: 0, ticks: 2 });
  assert.equal(scr.values[0], scr.value);
  const n0 = transport.writes.length;
  run.handle({ type: 'dialDown', dial: 0 });
  await clock.advance(3100);
  assert.deepEqual(run.activeLayer, [1, 0]);
  run.handle({ type: 'dialUp', dial: 0 });
  assert.equal(scr.pressed, false);
  await deck.flush();
  const redrawn = targetsOf(transport.writes.slice(n0), M.galleon);
  assert.ok(redrawn.includes('lcd:0,0,360,192') && redrawn.includes('lcd:0,192,360,192'), 'both widgets of dial 0 redrawn');
  const lower = sniffReports(transport.writes.slice(n0), M.galleon).filter((f) => f.target === 'lcd:0,192,360,192').at(-1);
  const img = decodeJPEG(lower.bytes);
  const px = (x, y) => img.data[(y * img.w + x) * 4];
  assert.ok(px(180, 179) > 200, 'white underline inside the now-active lower widget (360×180 window)');
  const bg = useTheme('prism').colors.bg, g = parseInt(bg.slice(1, 3), 16);
  assert.ok(Math.abs(px(20, 2) - g) <= 4 && Math.abs(px(20, 189) - g) <= 4, 'the 6 px gutters carry the theme background');
  const before = scr.values[2];
  run.handle({ type: 'rotate', dial: 0, ticks: 4 });
  assert.ok(scr.values[2] > before, 'rotation now drives the lower layer value');
  await run.stop();
  await deck.close();
});

test('hid runner: Neo info bar is centred in the 248×58 window; live data re-renders', async () => {
  const { deck, transport, run } = await runnerOn('neo', { screen: 'screen-neo-clock' }, { reduced: true });
  const f = sniffReports(transport.writes, M.neo).find((x) => x.target === 'infobar');
  const img = transformImage(decodeJPEG(f.bytes), 'rot180');
  assert.deepEqual([img.w, img.h], [248, 58]);
  const n = run.stats.renders;
  run.setData({ clock: 1 });
  assert.equal(run.stats.renders, n + 1);
  await run.stop();
  await deck.close({ blank: false });
});

// ---------------------------------------------------------------------------- cli

test('hid cli: udev, list against a fake tree, dry run', async () => {
  let out = '';
  const io = { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { out += s; } } };
  assert.equal(await hidMain(['udev'], io), 0);
  assert.equal(out, udevRules());
  out = '';
  assert.equal(await hidMain(['list', '--json'], { ...io, sysfs: fakeSysfs(), proc: tmp('proc') }), 0);
  assert.deepEqual(JSON.parse(out).map((d) => d.id), ['plus', 'galleon', 'mini-2022', 'galleon']);
  out = '';
  assert.equal(await hidMain(['run', '--dry-run', '--model', 'plus', '--keys', 'icon-mic,-,icon-clock', '--seconds', '0.3'], io), 0);
  assert.match(out, /dry run/);
  assert.match(out, /icon-mic, icon-clock/);
  out = '';
  assert.equal(await hidMain(['run', '--dry-run'], io), 2, '--dry-run needs --model');
  assert.equal(await hidMain(['frobnicate'], io), 2);
});

test('hid cli: doctor fails off Linux (no fake kernel check) and when no deck is usable; flags a stale rule', async () => {
  let out = '';
  const io = { stdout: { write: (s) => { out += s; } }, stderr: { write: (s) => { out += s; } } };
  assert.equal(await hidMain(['doctor'], { ...io, platform: 'win32', release: '10.0.26300' }), 1);
  assert.match(out, /not Linux/);
  assert.doesNotMatch(out, /kernel/, 'no kernel check off Linux');
  out = '';
  const rules = tmp('rules');
  fs.writeFileSync(path.join(rules, UDEV_RULES_NAME), 'KERNEL=="hidraw*", ATTRS{idVendor}=="1b1c", ATTRS{idProduct}=="2b18", MODE:="0660", TAG+="uaccess"\n');
  assert.equal(await hidMain(['doctor'], { ...io, platform: 'linux', release: '6.8.0', sysfs: tmp('nosys'), proc: tmp('proc'), rulesDirs: [rules] }), 1, 'no deck → nothing can work');
  assert.match(out, /FAIL {2}0 supported deck/);
  assert.match(out, /differs from this version's rule/);
});
