// Audio sources (src/audio/**) and Linux app exports (src/export/linux*.js).
// No real audio is ever captured: backends run against fake binaries — in-process
// FakeChild objects (src/audio/fake.js) and tiny real Node child processes that print
// a synthetic sine — and every test bounds its own time.
//
//   node --test test/audio.test.js
//   node --test --test-name-pattern="audio:" test/audio.test.js       (sources only)
//   node --test --test-name-pattern="linux-export:" test/audio.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

import {
  createAudioSource, Analyzer, RingBuffer, createSynth, simulate, createPcmDecoder, sniffHeader,
  fftInPlace, windowedMagnitudes, bandLayout, bandAmplitudes, toLevel, coef, follow, resampleBands,
  detectBackends, backendList, BACKENDS, commandLine, parsePipewireVersion, versionGte, parseDshowDevices,
  parseAvfoundationDevices, pickDevice, hostWrap, createBridgeServer, bridgeWorkletSource, bridgePageHtml,
  BRIDGE_PROTOCOL, encodeFrame, createFrameParser, decodeMeter, checkUpgrade, nodeSystem, manualClock, whichIn, runWith, attachAudio,
} from '../src/audio/index.js';
import { fakeSystem, FakeChild, tone, silence, hang, exitWith, stallAfter, lines, sineBytes } from '../src/audio/fake.js';
import { normalizeSetup, pageUnits, renderPage, resolveDevice, loadRaster, safeName } from '../src/export/linux.js';
import { buildStreamControllerBundle, checkStreamControllerBundle } from '../src/export/linux-streamcontroller.js';
import { buildOpenDeckProfile, buildOpenDeckProfiles, checkOpenDeckProfile, linuxManifestOverlay, buildOpenDeckPlugin, openDeckPaths, PLUGIN_DIR } from '../src/export/linux-opendeck.js';
import { runLinuxExport, runAudioCommand, loadSetup } from '../src/export/linux-cli.js';
import { SAMPLE_LAYOUTS } from '../src/export/profile.js';
import { readZip, writeZip } from '../src/export/plugin-zip.js';
import { validateSvg } from '../src/scene/validate.js';

const tick = () => new Promise((r) => setImmediate(r));
/** Drive a manual clock in small steps, letting promises/IO settle between steps. */
async function run(clock, ms, step = 10) { for (let t = 0; t < ms; t += step) { await tick(); clock.advance(step); } await tick(); }
const sine = (n, f, sr, a = 1) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));
const PW = (v) => ({ 'pw-record --version': { stdout: `pw-record\nCompiled with libpipewire ${v}\nLinked with libpipewire ${v}` } });

// ── DSP ─────────────────────────────────────────────────────────────────────

test('audio: FFT matches a naive DFT', () => {
  const n = 64, re = new Float64Array(n), im = new Float64Array(n), x = [];
  for (let i = 0; i < n; i++) { x[i] = Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1) + ((i * 37) % 11) / 11; re[i] = x[i]; }
  fftInPlace(re, im);
  for (const k of [0, 1, 5, 17, 31, 32, 50]) {
    let r = 0, m = 0;
    for (let i = 0; i < n; i++) { r += x[i] * Math.cos((-2 * Math.PI * k * i) / n); m += x[i] * Math.sin((-2 * Math.PI * k * i) / n); }
    assert.ok(Math.abs(re[k] - r) < 1e-9 && Math.abs(im[k] - m) < 1e-9, `bin ${k}`);
  }
});

test('audio: a full-scale sine reads ~1.0 in its band and silence elsewhere', () => {
  const sr = 16000, size = 1024, L = bandLayout(sr, size, 16, 40, 7600);
  const mags = windowedMagnitudes(sine(size, 1000, sr), new Float64Array(size), new Float64Array(size), new Float32Array(size / 2 + 1));
  const amps = bandAmplitudes(mags, L.lo, L.hi, new Float32Array(16));
  const b = L.centers.findIndex((c, i) => 1000 >= L.lo[i] * sr / size && 1000 < L.hi[i] * sr / size);
  assert.ok(b >= 0);
  assert.ok(amps[b] > 0.85 && amps[b] < 1.1, `band ${b} = ${amps[b]}`);
  for (let i = 0; i < 16; i++) if (Math.abs(i - b) > 1) assert.ok(amps[i] < 0.01, `band ${i} leak ${amps[i]}`);
});

test('audio: band layout is monotonic, covers ≥ 1 bin per band, stays below Nyquist', () => {
  for (const [sr, size, n] of [[16000, 1024, 16], [48000, 4096, 32], [8000, 512, 24], [44100, 2048, 7]]) {
    const L = bandLayout(sr, size, n, 40, 20000);
    for (let b = 0; b < n; b++) {
      assert.ok(L.hi[b] > L.lo[b], 'non-empty');
      assert.ok(L.lo[b] >= 1 && L.hi[b] <= size / 2 + 1, 'in range');
      if (b) { assert.ok(L.lo[b] >= L.lo[b - 1]); assert.ok(L.centers[b] > L.centers[b - 1]); }
    }
  }
});

test('audio: level mapping and smoothing', () => {
  assert.equal(toLevel(1), 1);
  assert.equal(toLevel(0), 0);
  assert.equal(toLevel(0.001, -60), 0);
  assert.ok(Math.abs(toLevel(0.1, -60) - 2 / 3) < 1e-9);       // -20 dB of 60
  assert.ok(Math.abs(toLevel(0.5, -60) - (1 - 6.0206 / 60)) < 1e-4);
  assert.equal(coef(0, 30), 1);
  assert.ok(coef(300, 30) > 0 && coef(300, 30) < 0.2);
  assert.equal(follow(0, 1, 1, 0.1), 1);
  assert.ok(Math.abs(follow(1, 0, 1, 0.1) - 0.9) < 1e-12);
  assert.deepEqual(resampleBands([0, 1], 3), [0, 0.5, 1]);
});

test('audio: ring buffer keeps the newest values, oldest first', () => {
  const r = new RingBuffer(4);
  assert.deepEqual(r.toArray(), []);
  for (const v of [1, 2, 3, 4, 5, 6]) r.push(v);
  assert.deepEqual(r.toArray(), [3, 4, 5, 6]);
  assert.deepEqual(r.last(2), [5, 6]);
  assert.equal(r.at(0), 3); assert.equal(r.at(-1), 6); assert.equal(r.newest, 6); assert.equal(r.at(9), undefined);
  assert.deepEqual(Array.from(r.copyTo(new Float32Array(3))), [4, 5, 6]);
  const p = new RingBuffer(3, { fill: 0 });
  assert.equal(p.length, 3);
  p.push(1);
  assert.deepEqual(p.toArray(), [0, 0, 1]);
  r.clear(); assert.equal(r.length, 0);
});

// ── PCM ─────────────────────────────────────────────────────────────────────

test('audio: PCM decoder carries split samples across chunks', () => {
  const bytes = sineBytes(100, { freq: 500, rate: 16000, amp: 0.8 });
  const whole = createPcmDecoder().push(bytes);
  const dec = createPcmDecoder();
  const parts = [];
  for (let i = 0; i < bytes.length; i += 63) parts.push(...dec.push(bytes.subarray(i, i + 63)));   // odd chunk sizes
  assert.equal(parts.length, 100);
  assert.deepEqual(Float32Array.from(parts), whole);
  assert.equal(createPcmDecoder().push(new Uint8Array([1])).length, 0);
});

test('audio: PCM decoder strips AU and WAV headers when sniffing, and downmixes stereo', () => {
  // AU: ".snd", header 32 bytes, encoding 3 (s16 BE), 16000 Hz, mono — split across chunks
  const au = new Uint8Array(32 + 4); const dv = new DataView(au.buffer);
  au.set([0x2e, 0x73, 0x6e, 0x64]); dv.setUint32(4, 32); dv.setUint32(8, 0xffffffff); dv.setUint32(12, 3); dv.setUint32(16, 16000); dv.setUint32(20, 1);
  dv.setInt16(32, 16384, false); dv.setInt16(34, -16384, false);
  let h = null;
  const d = createPcmDecoder({ sniff: true, onHeader: (x) => { h = x; } });
  assert.equal(d.push(au.subarray(0, 10)).length, 0);
  const out = d.push(au.subarray(10));
  assert.equal(h.kind, 'au'); assert.equal(d.format, 's16be');
  assert.deepEqual(Array.from(out), [0.5, -0.5]);
  // WAV: RIFF/WAVE fmt (stereo s16) + data
  const wav = new Uint8Array(44 + 8); const w = new DataView(wav.buffer);
  wav.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0); w.setUint32(4, 44); wav.set([..."WAVEfmt "].map((c) => c.charCodeAt(0)), 8);
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 2, true); w.setUint32(24, 16000, true); w.setUint32(28, 64000, true); w.setUint16(32, 4, true); w.setUint16(34, 16, true);
  wav.set([..."data"].map((c) => c.charCodeAt(0)), 36); w.setUint32(40, 8, true);
  w.setInt16(44, 16384, true); w.setInt16(46, 0, true); w.setInt16(48, -8192, true); w.setInt16(50, -8192, true);
  const wd = createPcmDecoder({ sniff: true });
  assert.deepEqual(Array.from(wd.push(wav)), [0.25, -0.25]);
  assert.equal(sniffHeader(new Uint8Array([1, 2, 3, 4])).kind, 'raw');
  // raw stays raw from byte 0 when sniffing
  assert.equal(createPcmDecoder({ sniff: true }).push(sineBytes(8)).length, 8);
});

// ── analyzer + ctx.data shapes ───────────────────────────────────────────────

test('audio: analyzer snapshot has the ctx.data shapes (authoring.md §7)', () => {
  const a = new Analyzer({ sampleRate: 16000, historySeconds: 4, historyRate: 30, bands: 16 });
  const s0 = a.snapshot();
  assert.equal(s0.audio.levels.length, 120);                      // prefilled with silence
  assert.ok(s0.audio.levels.every((v) => v === 0));
  a.push(sine(16000, 440, 16000, 0.5));
  const s = a.snapshot();
  assert.equal(a.hops, Math.floor(16000 / 533));
  assert.equal(typeof s.audio.level, 'number'); assert.ok(s.audio.level > 0.8 && s.audio.level <= 1);
  assert.equal(s.audio.rate, 30);
  assert.equal(s.audio.levels.length, 120);
  assert.ok(s.audio.levels.every((v) => typeof v === 'number' && v >= 0 && v <= 1));
  assert.ok(s.audio.levels.at(-1) > 0.4 && s.audio.levels[0] === 0, 'oldest first, newest last');
  assert.equal(s.spectrum.bands.length, 16);
  assert.ok(s.spectrum.bands.every((v) => v >= 0 && v <= 1));
  assert.equal(s.spectrum.centers.length, 16);
  assert.ok(Array.isArray(s.spectrum.peaks));
  JSON.stringify(s);                                               // plain data
  a.silence(200);
  assert.ok(a.snapshot().audio.levels.every((v) => v === 0));
});

test('audio: pre-metered hops (bridge) feed the same history as samples', () => {
  const a = new Analyzer({ bands: 8 });
  a.pushMeter({ rms: 0.3, peak: 0.6, bands: [1, 0.5, 0.25, 0.1, 0, 0, 0, 0, 0, 0, 0, 0] });   // 12 bands resampled to 8
  const s = a.snapshot();
  assert.ok(s.audio.levels.at(-1) > 0.5);
  assert.ok(s.spectrum.bands[0] > 0);
  a.pushMeter({ rms: NaN, peak: Infinity, bands: ['x'] });         // hostile input is cleaned
  assert.ok(a.snapshot().audio.levels.every(Number.isFinite));
});

test('audio: auto-gain lifts a quiet source but leaves silence silent', () => {
  const a = new Analyzer();
  a.push(sine(16000 * 6, 220, 16000, 0.05));                      // -26 dBFS for 6 s
  assert.ok(a.snapshot().audio.levels.at(-1) > 0.5, 'quiet source fills the keys');
  const b = new Analyzer();
  b.push(new Float32Array(16000 * 3));
  assert.ok(b.snapshot().audio.levels.every((v) => v === 0));
  const c = new Analyzer({ levelsScale: 'db' });
  c.push(sine(16000, 220, 16000, 0.05));
  assert.ok(Math.abs(c.snapshot().audio.levels.at(-1) - toLevel(0.05)) < 0.01);
});

// ── synthetic determinism ───────────────────────────────────────────────────

test('audio: synthetic audio is deterministic and bounded', () => {
  const a = createSynth({ seed: 3 }), b = createSynth({ seed: 3 }), c = createSynth({ seed: 4 });
  const x = a.render(123456, new Float32Array(4096)), y = b.render(123456, new Float32Array(4096)), z = c.render(123456, new Float32Array(4096));
  assert.deepEqual(x, y);
  assert.notDeepEqual(x, z);
  assert.ok(x.every((v) => v >= -1 && v <= 1));
  assert.equal(a.sample(-5), 0);
  const s1 = simulate(12.34, { seed: 9 }), s2 = simulate(12.34, { seed: 9 });
  assert.deepEqual(s1, s2);
  assert.notDeepEqual(simulate(12.34, { seed: 9 }).audio.levels, simulate(13.34, { seed: 9 }).audio.levels);
  assert.ok(s1.audio.levels.some((v) => v > 0.5) && s1.audio.levels.some((v) => v < 0.5), 'it breathes');
  assert.ok(s1.spectrum.bands.every((v) => v >= 0 && v <= 1));
});

test('audio: the synthetic fallback source is deterministic on a manual clock', async () => {
  const snap = async () => {
    const clock = manualClock();
    const sys = fakeSystem({ platform: 'linux', bins: [], clock });
    const src = createAudioSource({ system: sys, seed: 5, retryMs: 0 });
    await src.start();
    assert.equal(src.state, 'simulated');
    assert.equal(src.info().backend, 'synthetic');
    await run(clock, 2000, 33);
    const d = src.data();
    await src.stop();
    return d;
  };
  const a = await snap(), b = await snap();
  assert.deepEqual(a, b);
  assert.ok(a.audio.levels.some((v) => v > 0));
});

// ── command lines + parsers ─────────────────────────────────────────────────

test('audio: parec command line (verified research line) and pactl watcher', () => {
  const p = BACKENDS.pulse.plan({}, { ok: true, pactl: true });
  assert.equal(p.cmd, 'parec');
  assert.deepEqual(p.args.slice(0, 7), ['-d', '@DEFAULT_MONITOR@', '--raw', '--format=s16le', '--rate=16000', '--channels=1', '--latency-msec=10']);
  assert.equal(p.watch.cmd, 'pactl'); assert.deepEqual(p.watch.args, ['subscribe']);
  assert.ok(p.watch.match.test("Event 'change' on server #0"));
  const mic = BACKENDS.pulse.plan({ input: 'mic' }, { ok: true, pactl: true });
  assert.equal(mic.args[1], '@DEFAULT_SOURCE@'); assert.equal(mic.watch, null);
  assert.equal(BACKENDS.pulse.plan({ device: 'alsa_output.x.monitor' }, { ok: true, pactl: true }).args[1], 'alsa_output.x.monitor');
});

test('audio: pw-record --raw follows the PipeWire version split; stdbuf unbuffers', () => {
  const plan = (v, stdbuf = true, input) => BACKENDS.pipewire.plan({ input }, { ok: true, version: v, stdbuf });
  const modern = plan([1, 4, 7]);
  assert.equal(modern.cmd, 'stdbuf');
  assert.deepEqual(modern.args, ['-o0', 'pw-record', '--raw', '--format', 's16', '--rate', '16000', '--channels', '1', '--latency', '20ms', '-P', '{ stream.capture.sink = true }', '-']);
  assert.ok(!plan([1, 0, 5]).args.includes('--raw'), 'Ubuntu 24.04: no --raw');
  assert.ok(plan([1, 3, 81]).args.includes('--raw'));
  assert.ok(!plan([1, 2, 7], true, 'mic').args.includes('-P'));
  const nobuf = plan([1, 4, 7], false);
  assert.equal(nobuf.cmd, 'pw-record'); assert.equal(nobuf.sampleRate, 48000, '4 KiB blocks → capture at 48 kHz');
  const unknown = plan(null);
  assert.ok(!unknown.args.includes('--raw') && unknown.sniff, 'unknown version: no --raw, sniff a header');
  assert.deepEqual(parsePipewireVersion('pw-record\nCompiled with libpipewire 1.0.5\nLinked with libpipewire 1.0.5'), [1, 0, 5]);
  assert.equal(parsePipewireVersion('nope'), null);
  assert.ok(versionGte([0, 3, 52], [0, 3, 52]) && !versionGte([0, 3, 48], [0, 3, 52]) && versionGte([1, 0, 0], [0, 3, 52]));
});

test('audio: arecord raw capture with monitor hints; ffmpeg per platform', () => {
  const a = BACKENDS.alsa.plan({}, { ok: true });
  assert.deepEqual(a.args.slice(0, 11), ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1', '-D', 'default']);
  assert.equal(a.args.at(-1), '-');
  assert.equal(a.env.PULSE_SOURCE, '@DEFAULT_MONITOR@'); assert.equal(a.monitor, 'best-effort');
  assert.equal(BACKENDS.alsa.plan({ input: 'mic' }, { ok: true }).env.PULSE_SOURCE, undefined);
  const win = BACKENDS.ffmpeg.plan({}, { ok: true, path: 'C:\\ff\\ffmpeg.exe', device: { name: 'Stereo Mix (Realtek(R) Audio)' } }, { platform: 'win32' });
  assert.equal(win.cmd, 'C:\\ff\\ffmpeg.exe');
  assert.ok(win.args.includes('audio=Stereo Mix (Realtek(R) Audio)'), 'one argv element, no shell quoting');
  assert.deepEqual(win.args.slice(-9), ['-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-flush_packets', '1', 'pipe:1'].slice(-9));
  const mac = BACKENDS.ffmpeg.plan({}, { ok: true, device: { index: 2, name: 'BlackHole 2ch' } }, { platform: 'darwin' });
  assert.deepEqual(mac.args.slice(4, 8), ['-f', 'avfoundation', '-i', ':2']);
  const lin = BACKENDS.ffmpeg.plan({}, { ok: true }, { platform: 'linux' });
  assert.ok(lin.args.includes('pulse')); assert.equal(lin.env.PULSE_SOURCE, '@DEFAULT_MONITOR@');
  assert.match(commandLine(win), /"audio=Stereo Mix \(Realtek\(R\) Audio\)"/);
});

test('audio: ffmpeg device listings parse (dshow old/new, avfoundation) and loopback picking', () => {
  const oldDshow = `[dshow @ 000001] DirectShow video devices (some may be both video and audio devices)\n[dshow @ 000001]  "Integrated Camera"\n[dshow @ 000001]     Alternative name "@device_pnp_x"\n[dshow @ 000001] DirectShow audio devices\n[dshow @ 000001]  "Microphone (USB Audio)"\n[dshow @ 000001]     Alternative name "@device_cm_{1}"\n[dshow @ 000001]  "Stereo Mix (Realtek(R) Audio)"\n[dshow @ 000001]     Alternative name "@device_cm_{2}"\ndummy: Immediate exit requested`;
  const newDshow = `[in#0 @ 0000] "Integrated Camera" (video)\n[in#0 @ 0000]   Alternative name "@device_pnp_x"\n[in#0 @ 0000] "Headset Microphone (Example)" (audio)\n[in#0 @ 0000] "CABLE Output (VB-Audio Virtual Cable)" (audio)\n[in#0 @ 0000]   Alternative name "@device_cm_{3}"`;
  const o = parseDshowDevices(oldDshow), n = parseDshowDevices(newDshow);
  assert.deepEqual(o.map((d) => d.name), ['Microphone (USB Audio)', 'Stereo Mix (Realtek(R) Audio)']);
  assert.equal(o[1].alt, '@device_cm_{2}');
  assert.deepEqual(n.map((d) => d.name), ['Headset Microphone (Example)', 'CABLE Output (VB-Audio Virtual Cable)']);
  assert.equal(pickDevice(o, { input: 'monitor', platform: 'win32' }).name, 'Stereo Mix (Realtek(R) Audio)');
  assert.equal(pickDevice(o, { input: 'mic', platform: 'win32' }).name, 'Microphone (USB Audio)');
  assert.equal(pickDevice([{ name: 'Microphone (USB Audio)' }], { input: 'monitor' }), null, 'never silently a microphone');
  const av = `[AVFoundation indev @ 0x1] AVFoundation video devices:\n[AVFoundation indev @ 0x1] [0] FaceTime HD Camera\n[AVFoundation indev @ 0x1] AVFoundation audio devices:\n[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone\n[AVFoundation indev @ 0x1] [1] BlackHole 2ch\n: Input/output error`;
  assert.deepEqual(parseAvfoundationDevices(av), [{ index: 0, name: 'MacBook Pro Microphone' }, { index: 1, name: 'BlackHole 2ch' }]);
  assert.equal(pickDevice(parseAvfoundationDevices(av), { platform: 'darwin' }).index, 1);
});

test('audio: inside a Flatpak, host binaries run through flatpak-spawn --host', () => {
  const p = hostWrap({ cmd: 'parec', args: ['-d', 'x'], env: { LC_ALL: 'C' } }, { host: true });
  assert.equal(p.cmd, 'flatpak-spawn');
  assert.deepEqual(p.args, ['--host', '--env=LC_ALL=C', 'parec', '-d', 'x']);
  assert.equal(hostWrap({ cmd: 'parec', args: [] }, { host: false }).cmd, 'parec');
});

test('audio: which() finds fake binaries on PATH (posix and win32 PATHEXT)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-audio-bin-'));
  try {
    fs.writeFileSync(path.join(dir, 'parec'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(dir, 'ffmpeg.EXE'), '');
    const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
    const vfs = new Set(['/usr/local/bin/stdbuf', '/usr/bin/parec']);
    const posix = whichIn('parec', { platform: 'linux', env: { PATH: '/nope:/usr/local/bin:/usr/bin' }, exists: (p) => vfs.has(p), join: path.posix.join });
    assert.equal(posix, '/usr/bin/parec');
    assert.equal(whichIn('pw-record', { platform: 'linux', env: { PATH: '/usr/bin' }, exists: (p) => vfs.has(p), join: path.posix.join }), null);
    assert.equal(whichIn('/usr/bin/parec', { platform: 'linux', env: {}, exists: (p) => vfs.has(p), join: path.posix.join }), '/usr/bin/parec');
    const win = whichIn('ffmpeg', { platform: 'win32', env: { Path: `C:\\nope;${dir}`, PATHEXT: '.COM;.EXE' }, exists, join: path.join });
    assert.ok(win && win.toLowerCase().endsWith('ffmpeg.exe'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── detection ───────────────────────────────────────────────────────────────

test('audio: auto-detect orders backends per platform and explains what is missing', async () => {
  const linux = await detectBackends(fakeSystem({ platform: 'linux', bins: ['pw-record', 'arecord', 'stdbuf'], run: PW('1.4.7') }));
  assert.deepEqual(linux.candidates.map((c) => c.id), ['pulse', 'pipewire', 'alsa', 'ffmpeg']);
  assert.equal(linux.best, 'pipewire');
  assert.match(linux.candidates[0].reason, /parec not found/);
  assert.equal(linux.candidates[1].plan.cmd, 'stdbuf');
  const old = await detectBackends(fakeSystem({ platform: 'linux', bins: ['pw-record'], run: PW('0.3.48') }));
  assert.match(old.candidates[1].reason, /0\.3\.48.*0\.3\.52/);
  assert.equal(old.best, 'synthetic');
  assert.deepEqual(backendList('win32'), ['ffmpeg', 'bridge']);
  assert.deepEqual(backendList('linux', { bridge: true }).at(-1), 'bridge');
  assert.deepEqual(backendList('win32', { bridge: false }), ['ffmpeg']);
  assert.deepEqual(backendList('linux', { backend: 'alsa' }), ['alsa']);
  const listing = { 'ffmpeg -hide_banner -list_devices true -f dshow -i dummy': { code: 1, stderr: '[dshow @ 1] "Microphone (USB)" (audio)' } };
  const win = await detectBackends(fakeSystem({ platform: 'win32', bins: ['ffmpeg'], run: listing }));
  assert.equal(win.candidates[0].ok, false, 'no loopback device → not used for monitor');
  assert.match(win.candidates[0].reason, /Stereo Mix/);
  assert.equal(win.best, 'bridge');
  const winMic = await detectBackends(fakeSystem({ platform: 'win32', bins: ['ffmpeg'], run: listing }), { input: 'mic' });
  assert.equal(winMic.best, 'ffmpeg');
  assert.ok(winMic.candidates[0].plan.args.includes('audio=Microphone (USB)'));
});

test('audio: detection never hangs on a stuck probe', async () => {
  const t0 = Date.now();
  const sys = fakeSystem({ platform: 'linux', bins: ['pw-record'], run: { 'pw-record --version': { hangMs: 60000 } } });
  const d = await detectBackends(sys, { probeTimeoutMs: 150, deadlineMs: 400 });
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
  assert.ok(d.candidates.find((c) => c.id === 'pipewire'));
});

test('audio: runWith kills a hung real process at its timeout', async () => {
  const t0 = Date.now();
  const r = await runWith(spawn, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 300 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - t0 < 3000);
  const ok = await runWith(spawn, process.execPath, ['-e', 'console.log("Compiled with libpipewire 1.2.7")'], { timeoutMs: 5000 });
  assert.deepEqual(parsePipewireVersion(ok.stdout), [1, 2, 7]);
  const missing = await runWith(spawn, 'prism-no-such-binary-xyz', [], { timeoutMs: 1000 });
  assert.ok(missing.error);
});

// ── sources with fake children ──────────────────────────────────────────────

test('audio: source fails over parec → pw-record and goes live', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec', 'pactl', 'pw-record', 'stdbuf'], clock, run: PW('1.4.7'),
    behave: { parec: exitWith(1, 'Connection failure: Connection refused'), stdbuf: tone({ freq: 1000 }), pactl: hang() } });
  const src = createAudioSource({ system: sys, retryMs: 0 });
  const p = src.start();
  await run(clock, 300);
  const info = await p;
  assert.equal(info.state, 'live'); assert.equal(info.backend, 'pipewire');
  assert.match(info.command, /^stdbuf -o0 pw-record --raw/);
  assert.match(info.candidates[0].reason, /Connection refused/);
  await run(clock, 1000);
  const d = src.data();
  assert.ok(d.audio.level > 0.8);
  const peakBand = d.spectrum.bands.indexOf(Math.max(...d.spectrum.bands));
  assert.ok(d.spectrum.centers[peakBand] > 700 && d.spectrum.centers[peakBand] < 1400, `1 kHz lands at ${d.spectrum.centers[peakBand]} Hz`);
  await src.stop();
  assert.equal(src.data(), null);
  assert.ok(sys.spawned.every((c) => c.exitCode !== null), 'every child exited');
});

test('audio: no live backend → simulated within the deadline (and stays responsive)', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec', 'arecord'], clock, behave: { parec: hang(), arecord: exitWith(1, 'arecord: main:830: audio open error: No such file or directory') } });
  const src = createAudioSource({ system: sys, retryMs: 0, startTimeoutMs: 500 });
  const p = src.start();
  await run(clock, 1500);
  const info = await p;
  assert.equal(info.state, 'simulated');
  assert.match(info.candidates.find((c) => c.id === 'pulse').reason, /no audio within 500 ms/);
  assert.match(info.candidates.find((c) => c.id === 'alsa').reason, /audio open error/);
  assert.ok(sys.spawned.find((c) => c.cmd === 'parec').signals.includes('SIGTERM'), 'the silent parec was killed');
  await run(clock, 1000, 33);
  assert.ok(src.data().audio.levels.some((v) => v > 0), 'synthetic data flows');
  await src.stop();
});

test('audio: fallback: false reports unavailable and data() stays null', async () => {
  const clock = manualClock();
  const src = createAudioSource({ system: fakeSystem({ platform: 'linux', bins: [], clock }), fallback: false, retryMs: 0 });
  const info = await src.start();
  assert.equal(info.state, 'unavailable');
  assert.equal(src.data(), null);
  await src.stop();
});

test('audio: a stalled capture is restarted; gaps scroll as silence', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec'], clock, behave: { parec: stallAfter(300, { freq: 440 }) } });
  const src = createAudioSource({ system: sys, retryMs: 0, stallMs: 1000 });
  const p = src.start();
  await run(clock, 100);
  assert.equal((await p).state, 'live');
  await run(clock, 900);
  assert.ok(src.data().audio.levels.at(-1) === 0, 'silence while stalled');
  await run(clock, 1500);
  assert.ok(sys.spawned.filter((c) => c.cmd === 'parec').length >= 2, 'restarted after the stall');
  assert.ok(src.info().restarts >= 1);
  await src.stop();
});

test('audio: repeated quick crashes fail over to the next backend', async () => {
  const clock = manualClock();
  let n = 0;
  const sys = fakeSystem({ platform: 'linux', bins: ['parec', 'arecord'], clock,
    behave: (cmd) => (cmd === 'parec' ? (c) => { n++; tone()(c); c.after(60, () => c.exit(1)); } : tone({ freq: 300 })) });
  const src = createAudioSource({ system: sys, retryMs: 0 });
  src.start();
  await run(clock, 8000, 20);
  assert.equal(src.info().backend, 'alsa');
  assert.equal(src.state, 'live');
  assert.ok(n >= 4, `parec tried ${n}×`);
  await src.stop();
});

test('audio: a default-device change restarts capture (pactl subscribe)', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec', 'pactl'], clock,
    behave: { parec: tone(), pactl: lines([[500, "Event 'new' on sink-input #12"], [800, "Event 'change' on server #0"]]) } });
  const src = createAudioSource({ system: sys, retryMs: 0 });
  src.start();
  await run(clock, 2000);
  const parecs = sys.spawned.filter((c) => c.cmd === 'parec');
  assert.equal(parecs.length, 2, 'restarted once on the server change only');
  assert.equal(src.state, 'live');
  assert.equal(src.info().restarts, 1);
  await src.stop();
  assert.ok(sys.spawned.find((c) => c.cmd === 'pactl').exitCode !== null, 'watcher killed on stop');
});

test('audio: a source can be stopped and started again (watchdog and retry re-arm)', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec'], clock, behave: { parec: stallAfter(200) } });
  const src = createAudioSource({ system: sys, retryMs: 0, stallMs: 600 });
  src.start(); await run(clock, 100);
  await src.stop();
  src.start(); await run(clock, 100);
  assert.equal(src.state, 'live');
  await run(clock, 1500);
  assert.ok(sys.spawned.length >= 3, 'the second run still restarts a stalled capture');
  await src.stop();
});

test('audio: stop() escalates to SIGKILL and never hangs', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec'], clock, behave: { parec: (c) => { c.ignore.add('SIGTERM'); tone()(c); } } });
  const src = createAudioSource({ system: sys, retryMs: 0, killTimeoutMs: 100 });
  const p = src.start();
  await run(clock, 100);
  await p;
  const t0 = Date.now();
  await src.stop();
  assert.ok(Date.now() - t0 < 1500);
  assert.deepEqual(sys.spawned[0].signals, ['SIGTERM', 'SIGKILL']);
});

test('audio: retain/release starts on demand and stops after idleMs; pcm frames are opt-in', async () => {
  const clock = manualClock();
  const sys = fakeSystem({ platform: 'linux', bins: ['parec'], clock });
  const frames = [];
  const src = createAudioSource({ system: sys, retryMs: 0, idleMs: 1000, pcm: true });
  src.on('pcm', (f, sr) => frames.push([f.length, sr]));
  const release = src.retain();
  await run(clock, 200);
  assert.equal(src.state, 'live');
  assert.ok(frames.length > 0 && frames[0][1] === 16000);
  release(); release();                                     // idempotent
  await run(clock, 500);
  assert.equal(src.state, 'live', 'still running inside idleMs');
  const again = src.retain();
  await run(clock, 1500);
  assert.equal(src.state, 'live', 're-retained: no stop');
  again();
  await run(clock, 1300);
  await tick();
  assert.equal(src.state, 'stopped');
  const quiet = createAudioSource({ system: fakeSystem({ platform: 'linux', bins: ['parec'], clock }), retryMs: 0 });
  let got = 0; quiet.on('pcm', () => got++);
  quiet.start(); await run(clock, 200);
  assert.equal(got, 0, 'no pcm events unless opts.pcm');
  await quiet.stop();
});

test('audio: the source speaks the apps-hub interface (src/apps/sources/README.md)', async () => {
  const clock = manualClock();
  const src = createAudioSource({ system: fakeSystem({ platform: 'linux', bins: ['parec'], clock }), historySeconds: 16, historyRate: 30, bands: 16, seed: 3, retryMs: 0 });
  assert.equal(src.id, 'audio'); assert.deepEqual(src.provides, ['audio', 'spectrum']);
  assert.equal(src.running, false); assert.equal(src.snapshot(), null);
  src.start();
  await run(clock, 300);
  assert.equal(src.running, true); assert.equal(src.mode, 'live'); assert.equal(src.rate, 30);
  const s = src.snapshot();
  assert.equal(s.audio.levels.length, 480, '16 s × 30 Hz');
  assert.equal(s.spectrum.bands.length, 16);
  assert.equal(src.snapshot(), s, 'cached until the next hop');
  await run(clock, 100);
  assert.notEqual(src.snapshot(), s);
  assert.equal(src.status().backend, 'pulse');
  await src.stop();
  assert.equal(src.running, false);
});

test('audio: attachAudio registers data-hub getters in the §7 shapes', async () => {
  const clock = manualClock();
  const reg = new Map();
  const hub = { register: (k, fn) => reg.set(k, fn) };
  const src = createAudioSource({ system: fakeSystem({ platform: 'linux', bins: [], clock }), retryMs: 0 });
  attachAudio(hub, src);
  assert.equal(reg.get('audio')(), undefined, 'nothing until started');
  await src.start();
  await run(clock, 300, 33);
  assert.ok(Array.isArray(reg.get('audio')().levels));
  assert.ok(Array.isArray(reg.get('spectrum')().bands));
  await src.stop();
});

// ── real child processes (fake binaries that print a synthetic sine) ─────────

function fakeBinary(dir, name, body) {
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(file, body);
  return file;
}
const TONE_SCRIPT = `
const rate = 16000, per = 320; let i = 0;
setInterval(() => {
  const b = Buffer.alloc(per * 2);
  for (let k = 0; k < per; k++, i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 1000 * i / rate) * 16000), k * 2);
  process.stdout.write(b.subarray(0, 3)); process.stdout.write(b.subarray(3));   // split mid-sample
}, 20);
process.on('SIGTERM', () => process.exit(0));
`;

test('audio: real child processes: live through real pipes, killed on stop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-audio-proc-'));
  try {
    const script = fakeBinary(dir, 'parec', TONE_SCRIPT);
    const real = await nodeSystem({ platform: 'linux', which: (c) => (c === 'parec' ? '/usr/bin/parec' : null),
      spawn: (cmd, args, o) => spawn(process.execPath, [script, ...args], { ...o, env: process.env }) });
    const src = createAudioSource({ system: real, retryMs: 0, startTimeoutMs: 5000 });
    const info = await src.start();
    assert.equal(info.state, 'live');
    assert.equal(info.backend, 'pulse');
    await new Promise((r) => setTimeout(r, 600));
    const d = src.data();
    assert.ok(d.audio.level > 0.7, `level ${d.audio.level}`);
    assert.ok(src.info().chunkMs >= 10 && src.info().chunkMs <= 40, `chunk ${src.info().chunkMs} ms`);
    const pid = src.active.child.pid;
    const t0 = Date.now();
    await src.stop();
    assert.ok(Date.now() - t0 < 3000);
    assert.throws(() => process.kill(pid, 0), 'the child is gone');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('audio: real child processes: a silent process times out and the source falls back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-audio-proc-'));
  try {
    const script = fakeBinary(dir, 'parec', 'setInterval(() => {}, 1000);');
    const real = await nodeSystem({ platform: 'linux', which: (c) => (c === 'parec' ? '/usr/bin/parec' : null),
      spawn: (cmd, args, o) => spawn(process.execPath, [script], { ...o, env: process.env }) });
    const t0 = Date.now();
    const src = createAudioSource({ system: real, retryMs: 0, startTimeoutMs: 400, killTimeoutMs: 300 });
    const info = await src.start();
    assert.equal(info.state, 'simulated');
    assert.ok(Date.now() - t0 < 4000, `start took ${Date.now() - t0} ms`);
    await src.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── browser bridge ──────────────────────────────────────────────────────────

test('audio: WebSocket framing round-trips (masked, fragmented, control, limits)', () => {
  const got = [], ctl = [], errs = [];
  const parse = createFrameParser({ onMessage: (op, d) => got.push([op, Buffer.from(d).toString()]), onControl: (op, d) => ctl.push([op, d.length]), onError: (r) => errs.push(r) });
  const mask = new Uint8Array([1, 2, 3, 4]);
  const a = encodeFrame(0x1, 'hello', { mask });
  const f1 = encodeFrame(0x2, 'ab', { mask }); f1[0] &= 0x7f;                        // first fragment (fin = 0)
  const f2 = encodeFrame(0x0, 'cd', { mask });                                         // continuation (fin = 1)
  const ping = encodeFrame(0x9, 'p', { mask });
  const all = Buffer.concat([a, f1, ping, f2]);
  for (let i = 0; i < all.length; i += 3) parse(all.subarray(i, i + 3));               // byte-dribbled
  assert.deepEqual(got, [[1, 'hello'], [2, 'abcd']]);
  assert.deepEqual(ctl, [[9, 1]]);
  assert.deepEqual(errs, []);
  const big = encodeFrame(0x2, new Uint8Array(70000), { mask });
  assert.equal(big[1] & 0x7f, 127);
  const e2 = []; createFrameParser({ onError: (r) => e2.push(r) })(big);
  assert.match(e2[0], /too large/);
  const e3 = []; createFrameParser({ onError: (r) => e3.push(r) })(encodeFrame(0x1, 'x'));
  assert.match(e3[0], /masked/);
  const m = decodeMeter(new Uint8Array(new Float32Array([0.1, 0.2, 0.3, NaN]).buffer));
  assert.ok(Math.abs(m.rms - 0.1) < 1e-6 && m.bands.length === 2 && m.bands[1] === 0);
  assert.equal(decodeMeter(new Uint8Array(3)), null);
});

test('audio: bridge upgrade checks host, origin, protocol and token', () => {
  const base = { url: '/ws', headers: { host: '127.0.0.1:5000', origin: 'http://127.0.0.1:5000', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'x', 'sec-websocket-protocol': `${BRIDGE_PROTOCOL}, auth.secret-token-123456` } };
  const ctx = { port: 5000, token: 'secret-token-123456' };
  assert.deepEqual(checkUpgrade(base, ctx), { ok: true, protocol: BRIDGE_PROTOCOL });
  const bad = (h, reason) => assert.equal(checkUpgrade({ ...base, headers: { ...base.headers, ...h } }, ctx).reason, reason);
  bad({ host: 'evil.example:5000' }, 'bad host');
  bad({ origin: 'https://evil.example' }, 'bad origin');
  bad({ origin: undefined }, 'bad origin');
  bad({ 'sec-websocket-protocol': 'auth.secret-token-123456' }, 'missing protocol');
  bad({ 'sec-websocket-protocol': `${BRIDGE_PROTOCOL}, auth.secret-token-123457` }, 'bad token');
  bad({ 'sec-websocket-protocol': BRIDGE_PROTOCOL }, 'bad token');
  assert.equal(checkUpgrade({ ...base, url: '/other' }, ctx).reason, 'not found');
});

test('audio: the bridge worklet computes the same bands as the plugin', () => {
  const posted = [];
  class AudioWorkletProcessor { constructor() { this.port = { postMessage: (buf) => posted.push(new Float32Array(buf)) }; } }
  let Proc = null;
  vm.runInNewContext(bridgeWorkletSource(), { AudioWorkletProcessor, registerProcessor: (name, cls) => { assert.equal(name, 'prism-meter'); Proc = cls; }, sampleRate: 48000, Float32Array, Float64Array, Int32Array, Math, Array });
  const opts = { hopHz: 30, bands: 16, minHz: 40, maxHz: 12000 };
  const p = new Proc({ processorOptions: opts });
  const x = sine(48000, 1000, 48000, 0.5);
  for (let i = 0; i < x.length; i += 128) assert.equal(p.process([[x.subarray(i, i + 128), x.subarray(i, i + 128)]]), true);
  assert.equal(posted.length, 30);
  const last = posted.at(-1);
  assert.ok(Math.abs(last[0] - 0.5 / Math.SQRT2) < 0.01, 'rms'); assert.ok(Math.abs(last[1] - 0.5) < 0.01, 'peak');
  // the plugin's analyzer on the same audio
  const a = new Analyzer({ sampleRate: 48000, bands: 16, minHz: 40, maxHz: 12000 });
  a.push(x);
  const L = a.layout, mine = bandAmplitudes(a.mags, L.lo, L.hi, new Float32Array(16));
  for (let b = 0; b < 16; b++) assert.ok(Math.abs(mine[b] - last[2 + b]) < 1e-3, `band ${b}: ${mine[b]} vs ${last[2 + b]}`);
});

/** Minimal raw WebSocket client over net (masks its frames like a browser). */
function wsConnect(port, { token, origin = `http://127.0.0.1:${port}`, host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    let buf = Buffer.alloc(0), upgraded = false;
    const msgs = [];
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        buf = buf.subarray(end + 4);
        upgraded = true;
        resolve({ sock, head, ok: /^HTTP\/1\.1 101/.test(head), msgs, send: (op, data) => sock.write(encodeFrame(op, data, { mask: new Uint8Array([9, 8, 7, 6]) })) });
      }
      while (buf.length >= 2) {
        const len = buf[1] & 0x7f;
        if (len > 125 || buf.length < 2 + len) break;
        msgs.push(buf.subarray(2, 2 + len).toString()); buf = buf.subarray(2 + len);
      }
    });
    sock.on('close', () => { if (!upgraded) resolve({ ok: false, head: buf.toString(), msgs }); });
    sock.on('error', () => {});
    sock.write(`GET /ws HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nOrigin: ${origin}\r\nSec-WebSocket-Protocol: ${BRIDGE_PROTOCOL}, auth.${token}\r\n\r\n`);
  });
}

test('audio: bridge server end to end: page, auth, meters → live source → standby', async () => {
  const sys = await nodeSystem({ platform: 'win32', which: () => null });
  const src = createAudioSource({ system: sys, backend: 'bridge', retryMs: 0, stallMs: 600 });
  const info = await src.start();
  try {
    assert.equal(info.state, 'standby');
    assert.ok(src.data().audio.levels.length === 120, 'simulated data while waiting');
    const url = new URL(info.bridge.url);
    assert.equal(url.hostname, '127.0.0.1');
    const token = url.hash.slice(1), port = Number(url.port);
    assert.ok(token.length >= 20);
    // the page: CSP, no secrets in the body
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    const html = await page.text();
    assert.ok(!html.includes(token));
    assert.match(html, /Nothing is recorded/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/worklet.js`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
    // refused: wrong token, wrong origin, rebinding host
    for (const o of [{ token: 'x'.repeat(24) }, { token, origin: 'https://evil.example' }, { token, host: `evil.example:${port}` }]) {
      const r = await wsConnect(port, o);
      assert.ok(!r.ok, `refused: ${JSON.stringify(o).slice(0, 60)} → ${r.head?.split('\r\n')[0]}`);
    }
    assert.equal(src.state, 'standby');
    // accepted: config arrives, meters make it live
    const c = await wsConnect(port, { token });
    assert.ok(c.ok, c.head);
    assert.match(c.head, new RegExp(`Sec-WebSocket-Protocol: ${BRIDGE_PROTOCOL.replace('.', '\\.')}`));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(JSON.parse(c.msgs[0]).type, 'config');
    assert.equal(JSON.parse(c.msgs[0]).bands, 16);
    c.send(0x1, JSON.stringify({ type: 'hello', source: 'display', sampleRate: 48000, label: 'Example' }));
    for (let i = 0; i < 20; i++) c.send(0x2, new Uint8Array(new Float32Array([0.3, 0.7, ...new Array(16).fill(0.2)]).buffer));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(src.state, 'live'); assert.equal(src.info().backend, 'bridge');
    assert.equal(src.info().bridge.client.source, 'display');
    assert.ok(src.data().audio.levels.at(-1) > 0.6);
    // the page goes quiet → standby (simulated) again
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(src.state, 'standby');
    c.sock.destroy();
  } finally { await src.stop(); }
  assert.equal(src.state, 'stopped');
});

test('audio: the bridge page is accessible and offline', () => {
  const html = bridgePageHtml();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /prefers-color-scheme:light/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /:focus-visible/);
  assert.ok(!/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org/g, '')), 'no external URLs');
  assert.ok(!/<script>/.test(html), 'no inline script (CSP)');
});

// ── Linux app exports ───────────────────────────────────────────────────────

const setupFor = (dev) => ({ device: dev, ...SAMPLE_LAYOUTS[dev] });

test('linux-export: setups normalize (profile shape and MCP layout documents)', () => {
  const s = normalizeSetup(setupFor('plus'));
  assert.equal(s.device.id, 'plus'); assert.equal(s.pages.length, 2);
  const mcp = normalizeSetup({ schema: 'prism-deck-layout/0.1', device: 'streamdeck-plus', theme: 'prism:light', pages: [{ id: 'home', keys: [{ col: 0, row: 0, look: { glyph: 'audio/mic' } }, { col: 1, row: 0, look: { facet: 'app-cpu-ring', params: { label: 'CPU' } } }], dials: [{ dial: 0, feedback: { facet: 'dial-volume' } }] }] });
  assert.equal(mcp.device.id, 'plus'); assert.equal(mcp.mode, 'light');
  assert.deepEqual(mcp.pages[0].keys.map((k) => k.settings.facet), ['icon-mic', 'app-cpu-ring']);
  assert.equal(mcp.pages[0].dials[0].settings.facet, 'dial-volume');
  assert.throws(() => resolveDevice('stream-deck-9000'), /unknown device/);
});

test('linux-export: spans group like the plugin runtime and slice per key', () => {
  const s = normalizeSetup(setupFor('mk2'));
  const { units, dropped } = pageUnits(s.device, s.pages[0]);
  assert.deepEqual(dropped, []);
  const span = units.find((u) => u.facet.id === 'span-waveform');
  assert.equal(span.mode, 'span'); assert.equal(span.members.length, 5);
  const r = renderPage(s.device, s.pages[0], s);
  assert.equal(r.keys.size, 15);
  const slices = [0, 1, 2, 3, 4].map((c) => r.keys.get(`${c},1`).svg);
  assert.equal(new Set(slices).size, 5, 'each key gets its own slice');
  for (const sl of r.keys.values()) assert.deepEqual(validateSvg(sl.svg), [], `${sl.facet} slice is in the deck SVG subset`);
});

test('linux-export: StreamController bundles match the importer (PageBundle.py)', () => {
  for (const dev of ['mk2', 'plus', 'xl-2022', 'mini-2022', 'neo']) {
    const b = buildStreamControllerBundle(setupFor(dev));
    const entries = readZip(b.zip);
    assert.deepEqual(checkStreamControllerBundle(entries), [], dev);
    const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data);
    const pages = manifest.format === 'streamcontroller-page' ? [JSON.parse(entries.find((e) => e.name === 'page.json').data)] : entries.filter((e) => !e.dir && e.name.startsWith('pages/')).map((e) => JSON.parse(e.data));
    assert.equal(pages.length, SAMPLE_LAYOUTS[dev].pages.length);
    const keys = Object.keys(pages[0].keys);
    assert.ok(keys.every((k) => /^\d+x\d+$/.test(k)), 'keys are "<col>x<row>"');
    const st = Object.values(pages[0].keys)[0].states['0'];
    assert.deepEqual(Object.keys(st.media).sort(), ['fill-mode', 'halign', 'path', 'size', 'valign']);
    assert.equal(st.media['fill-mode'], 'cover');
    if (dev === 'plus') {
      assert.deepEqual(Object.keys(pages[0].dials), ['0', '1', '2', '3']);
      assert.equal(pages[0].dials['0'].states['0'].media['fill-mode'], 'contain');
    }
    if (dev === 'neo') assert.ok(b.dropped.some((d) => d.slot === 'infobar'));
  }
  assert.match(buildStreamControllerBundle(setupFor('mk2')).fileName, /\.scpage$/);
  assert.match(buildStreamControllerBundle(setupFor('plus')).fileName, /\.zip$/);
  assert.throws(() => buildStreamControllerBundle(setupFor('galleon')), /does not drive the Corsair Galleon 100 SD/);
});

test('linux-export: exports are byte-reproducible', () => {
  assert.ok(buildStreamControllerBundle(setupFor('plus')).zip.equals(buildStreamControllerBundle(setupFor('plus')).zip));
  assert.equal(buildOpenDeckProfile(setupFor('mk2')).text, buildOpenDeckProfile(setupFor('mk2')).text);
});

test('linux-export: animated StreamController keys are GIF loops ≥ 62 ms a frame', async () => {
  const raster = await loadRaster();
  if (!raster) return;                                                     // raster backend not built yet
  const b = buildStreamControllerBundle({ device: 'mini-2022', name: 'GIF test', pages: [{ name: 'p', keys: [{ col: 0, row: 0, settings: { facet: 'icon-mic' } }, { col: 1, row: 0, settings: { facet: 'span-waveform' } }, { col: 2, row: 0, settings: { facet: 'span-waveform' } }] }] }, { raster, animate: true, fps: 30 });
  const entries = readZip(b.zip);
  assert.deepEqual(checkStreamControllerBundle(entries), []);
  const page = JSON.parse(entries.find((e) => e.name === 'page.json').data);
  const media = page.keys['0x0'].states['0'].media;
  assert.match(media.path, /\.gif$/); assert.equal(media.loop, true); assert.equal(media.fps, 16, 'capped');
  const gif = raster.decodeGIF(entries.find((e) => e.name === media.path).data);
  assert.ok(gif.frames.length > 1);
  assert.ok(gif.frames.every((f) => (f.delay ?? 0) >= 50), `delays ${gif.frames.map((f) => f.delay).join(',')}`);
});

test('linux-export: OpenDeck profiles match the loader (simplified_profile.rs)', () => {
  for (const dev of ['mk2', 'plus', 'neo', 'xl-2022', 'mini-2022']) {
    for (const p of buildOpenDeckProfiles(setupFor(dev), { deviceId: 'sd-TEST123' })) {
      assert.deepEqual(checkOpenDeckProfile(p.json, resolveDevice(dev)), [], `${dev} ${p.profile}`);
      assert.match(p.path, /^profiles\/sd-TEST123\/.+\.json$/);
      const inst = p.json.keys.find(Boolean);
      assert.equal(inst.action.plugin, PLUGIN_DIR);
      assert.equal(inst.action.uuid, 'com.jeremyfhall.prism.facet');
      assert.match(inst.states[0].image, /^data:image\/svg\+xml;base64,/);
      assert.ok(inst.settings.facet);
    }
  }
  const neo = buildOpenDeckProfile(setupFor('neo'));
  assert.equal(neo.json.keys.length, 10, '8 keys + 2 touch points');
  assert.equal(neo.json.infobars.length, 1);
  assert.equal(neo.json.infobars[0].context, 'Infobar.0.0');
  assert.equal(neo.json.infobars[0].action.uuid, 'com.jeremyfhall.prism.infobar');
  const plus = buildOpenDeckProfile(setupFor('plus'));
  assert.equal(plus.json.sliders.length, 4);
  assert.equal(plus.json.sliders[2].context, 'Encoder.2.0');
  const spanKeys = plus.json.keys.filter((k) => k?.settings.facet === 'span-spectrum');
  assert.equal(spanKeys.length, 4);
  assert.deepEqual(spanKeys.map((k) => k.context), ['Keypad.4.0', 'Keypad.5.0', 'Keypad.6.0', 'Keypad.7.0']);
  const none = buildOpenDeckProfile(setupFor('mk2'), { images: 'none' });
  assert.match(none.json.keys[0].states[0].image, /^plugins\/com\.jeremyfhall\.prism\.sdPlugin\/imgs\/actions\/facet\/key/);
  assert.throws(() => buildOpenDeckProfile(setupFor('galleon')), /OpenDeck does not drive/);
});

test('linux-export: OpenDeck plugin overlay (manifest.linux.json) and paths', () => {
  const manifest = { UUID: 'com.jeremyfhall.prism', CodePath: 'bin/plugin.js', OS: [{ Platform: 'windows' }, { Platform: 'mac' }], Actions: [{ UUID: 'com.jeremyfhall.prism.facet', Controllers: ['Keypad', 'Encoder'] }, { UUID: 'com.jeremyfhall.prism.infobar', Controllers: ['Neo'] }] };
  const o = linuxManifestOverlay(manifest);
  assert.deepEqual(o.OS, [{ Platform: 'linux', MinimumVersion: '0' }]);
  assert.deepEqual(o.Actions[1].Controllers, ['Neo', 'Infobar']);
  assert.deepEqual(o.Actions[0], manifest.Actions[0]);
  const zip = writeZip([{ name: `${PLUGIN_DIR}/manifest.json`, data: JSON.stringify(manifest) }, { name: `${PLUGIN_DIR}/bin/plugin.js`, data: '// plugin' }]);
  const b = buildOpenDeckPlugin(zip);
  const names = readZip(b.zip).map((e) => e.name);
  assert.ok(names.includes(`${PLUGIN_DIR}/manifest.linux.json`) && names.includes(`${PLUGIN_DIR}/bin/plugin.js`));
  assert.throws(() => buildOpenDeckPlugin(writeZip([{ name: 'x/manifest.json', data: '{}' }])), /not a Prism plugin/);
  assert.equal(openDeckPaths({ home: '/home/u' }).plugin, `/home/u/.config/opendeck/plugins/${PLUGIN_DIR}`);
  assert.equal(openDeckPaths({ home: '/home/u', flatpak: true }).profiles, '/home/u/.var/app/me.amankhanna.opendeck/config/opendeck/profiles');
});

test('linux-export: the CLI handlers write exports and print install steps', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-linux-export-'));
  try {
    const logs = [];
    assert.equal(await runLinuxExport('streamcontroller', { sample: 'mk2', out }, { log: (m) => logs.push(m), err: (m) => logs.push(`ERR ${m}`) }), 0);
    assert.ok(fs.readdirSync(path.join(out, 'streamcontroller')).some((f) => f.endsWith('.scpage')));
    assert.equal(await runLinuxExport('opendeck', { sample: 'plus', out, 'device-id': 'sd-ABC' }, { log: (m) => logs.push(m), err: (m) => logs.push(`ERR ${m}`) }), 0);
    assert.equal(fs.readdirSync(path.join(out, 'opendeck', 'profiles', 'sd-ABC')).length, 2);
    assert.ok(logs.some((l) => /Install from file/.test(l)));
    assert.equal(await runLinuxExport('linux-paths', { home: '/home/u', json: true }, { log: (m) => logs.push(m) }), 0);
    assert.equal(await runLinuxExport('streamcontroller', { sample: 'galleon', out }, { log: () => {}, err: (m) => logs.push(`ERR ${m}`) }), 1);
    assert.equal(loadSetup({ sample: 'xl' }).name, SAMPLE_LAYOUTS['xl-2022'].name, 'xl falls back to the XL sample');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('linux-export: ASCII-only file names, XDG base dirs, usage errors exit 2', async () => {
  assert.equal(safeName('Prism · Stream Deck + - Panorama'), 'Prism - Stream Deck + - Panorama');
  assert.equal(safeName('Café — Déjà vu'), 'Cafe - Deja vu');
  assert.equal(safeName('a/b:c*?'), 'a b c');
  assert.equal(safeName('日本'), 'Prism', 'nothing ASCII left → fallback');
  for (const s of ['Prism · Night', 'λ 612 × 2', 'naïve…']) assert.match(safeName(s), /^[\x20-\x7e]+$/, s);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-linux-ascii-'));
  try {
    assert.equal(await runLinuxExport('opendeck', { sample: 'plus', out, 'device-id': 'sd-ABC' }, { log: () => {} }), 0);
    for (const f of fs.readdirSync(path.join(out, 'opendeck', 'profiles', 'sd-ABC'))) assert.match(f, /^[\x20-\x7e]+$/, f);
    assert.equal(await runLinuxExport('streamcontroller', { sample: 'plus', out }, { log: () => {} }), 0);
    for (const f of fs.readdirSync(path.join(out, 'streamcontroller'))) assert.match(f, /^[\x20-\x7e]+$/, f);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  const paths = async (opt, env) => { const logs = []; assert.equal(await runLinuxExport('linux-paths', { ...opt, json: true }, { log: (m) => logs.push(m), env }), 0); return JSON.parse(logs[0]); };
  const x = await paths({}, { XDG_CONFIG_HOME: '/srv/cfg/', XDG_DATA_HOME: '/srv/data' });
  assert.equal(x.opendeck.profiles, '/srv/cfg/opendeck/profiles');
  assert.equal(x.opendeck.pluginLog, `/srv/data/opendeck/logs/plugins/${PLUGIN_DIR}.log`);
  assert.equal(x.opendeckFlatpak.profiles, '~/.var/app/me.amankhanna.opendeck/config/opendeck/profiles', 'the Flatpak sandbox sets its own XDG dirs');
  assert.equal((await paths({}, { XDG_CONFIG_HOME: 'relative/cfg' })).opendeck.profiles, '~/.config/opendeck/profiles', 'relative XDG values are ignored (XDG spec)');
  assert.equal((await paths({ home: '/home/u' }, { XDG_CONFIG_HOME: '/srv/cfg' })).opendeck.profiles, '/home/u/.config/opendeck/profiles', '--home is another account: this shell\'s XDG does not apply');
  const errs = [];
  assert.equal(await runLinuxExport('bogus', {}, { log: () => {}, err: (m) => errs.push(m) }), 2);
  assert.equal(await runAudioCommand('bogus', {}, { log: () => {}, err: (m) => errs.push(m) }), 2);
  assert.equal(errs.length, 2);
});
