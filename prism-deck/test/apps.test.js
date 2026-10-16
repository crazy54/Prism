// Apps: data sources (simulated determinism, throttling, shapes, live probes against fixtures),
// the hub (ref-counting, live → simulated fallthrough), timer / calendar / media adapters, the
// audio adapter's live PCM path, Galleon routing, and the app facets' data handling + slice sizes.
//
//   node --test test/apps.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, lease, createSimulatedHub, simulatedSystem, simulatedAudio, simulatedMedia, simulatedCalendar, simulatedSource, createPoller, createTimer, parseIcs, agendaOf, icsTime, parsePlayerctl, parseVolume, createAudioSource, probes as P } from '../src/apps/sources/index.js';
import { createSystemSource } from '../src/apps/sources/system.js';
import { createLinuxMediaSource } from '../src/apps/sources/media.js';
import { createIcsCalendarSource } from '../src/apps/sources/calendar.js';
import { autoAudioSource } from '../src/apps/sources/audio.js';
import { galleonPlan, planData, renderGalleon, GALLEON_SLOTS, DEFAULT_ROUTES } from '../src/apps/routing.js';
import { manualClock } from '../src/audio/system.js';
import { fakeSystem, sineBytes, lines } from '../src/audio/fake.js';
import { findFacet, allFacets } from '../src/facets/index.js';
import { render } from '../src/render.js';
import { validateSvg } from '../src/scene/validate.js';
import { createContext } from '../src/scene/context.js';
import { audioOf, spectrumOf, metricOf, netOf, seriesOf, mediaOf, calendarOf, resample } from '../src/facets/apps/_data.js';
import { simAudio, simSpectrum, PHRASE, grooveLevel } from '../src/facets/apps/_sim.js';
import { FAMILY_DEVICES } from '../src/devices.js';

const flush = () => new Promise((r) => setImmediate(r));
const in01 = (v) => typeof v === 'number' && v >= 0 && v <= 1;
const T0 = Date.UTC(2026, 3, 14, 9, 41, 0);

// ── simulated sources ───────────────────────────────────────────────────────
test('simulated sources: deterministic per instant, cached per 1/rate s, and they move', () => {
  const sys = simulatedSystem(), sys2 = simulatedSystem();
  assert.deepEqual(sys.snapshot(T0), sys2.snapshot(T0), 'same instant → same data');
  assert.equal(sys.snapshot(T0 + 100), sys.snapshot(T0 + 900), 'a 1 Hz source returns the cached object within its second');
  assert.notDeepEqual(sys.snapshot(T0), sys.snapshot(T0 + 5000), 'it moves');
  const a = simulatedAudio();
  assert.equal(a.snapshot(T0 + 1), a.snapshot(T0 + 20), '30 Hz: same frame within 1/30 s');
  assert.notDeepEqual(a.snapshot(T0).audio.levels, a.snapshot(T0 + 100).audio.levels);
  assert.deepEqual(simulatedMedia().snapshot(T0), simulatedMedia().snapshot(T0));
  assert.deepEqual(simulatedCalendar().snapshot(T0), simulatedCalendar().snapshot(T0));
});

test('simulated shapes match the README (ctx.data contract)', () => {
  const s = simulatedSystem().snapshot(T0);
  for (const k of ['cpu', 'mem', 'gpu', 'disk', 'battery']) assert.ok(in01(s[k]), `${k} 0–1`);
  assert.ok(s.net.down >= 0 && s.net.up >= 0 && Number.isFinite(s.temp) && s.uptime > 0);
  assert.ok(Array.isArray(s.sys.cores) && s.sys.cores.every(in01) && s.sys.memTotal > 0);
  for (const k of ['cpu', 'mem', 'gpu', 'down', 'up', 'read', 'write', 'temp']) assert.equal(s.series[k].length, 60, `series.${k}`);
  assert.equal(s.series.step, 1);
  const { audio, spectrum } = simulatedAudio().snapshot(T0);
  assert.equal(audio.levels.length, 16 * 30);
  assert.equal(audio.rate, 30);
  assert.ok([audio.level, audio.peak, audio.rms, ...audio.levels].every(in01));
  assert.equal(spectrum.bands.length, 16);
  assert.ok(spectrum.bands.every(in01) && spectrum.peaks.every((p, i) => p >= spectrum.bands[i] - 1e-9));
  const m = simulatedMedia().snapshot(T0).media;
  assert.ok(m.title && m.artist && m.duration > 0 && m.position >= 0 && m.position <= m.duration && typeof m.playing === 'boolean');
  const c = simulatedCalendar().snapshot(T0).calendar;
  assert.ok(c.next.title && c.next.at > T0 && c.next.end > c.next.at);
});

test('the groove loops seamlessly and levels look like normalized music', () => {
  for (const x of [0.1, 3.7, 9.2]) assert.ok(Math.abs(grooveLevel(x) - grooveLevel(x + PHRASE)) < 1e-12);
  const v = Array.from({ length: PHRASE * 30 }, (_, i) => grooveLevel(i / 30)).sort((a, b) => a - b);
  const q = (p) => v[Math.floor(p * (v.length - 1))];
  assert.ok(q(0.1) > 0.3 && q(0.5) > 0.4 && q(0.5) < 0.6 && q(0.99) > 0.85, `p10 ${q(0.1)} p50 ${q(0.5)} p99 ${q(0.99)}`);
  assert.deepEqual(simAudio(4.2, 7, { count: 40 }), simAudio(4.2, 7, { count: 40 }));
  assert.deepEqual(simSpectrum(4.2, 7, { count: 12 }), simSpectrum(4.2, 7, { count: 12 }));
});

// ── poller (throttling) ─────────────────────────────────────────────────────
test('poller: probes run at most every `every` s, single-flight, and stop when dead or absent', async () => {
  const clock = manualClock(0);
  let fast = 0, slow = 0, hung = 0, failing = 0, missing = 0;
  const poller = createPoller({
    rate: 2, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    probes: [
      { id: 'fast', every: 0.5, run: () => { fast++; return true; } },
      { id: 'slow', every: 5, run: () => { slow++; return true; } },
      { id: 'hung', every: 0.5, run: () => { hung++; return new Promise(() => {}); } },
      { id: 'failing', every: 0.5, run: () => { failing++; return undefined; } },
      { id: 'missing', every: 0.5, run: () => { missing++; return null; } },
    ],
  });
  poller.start();
  for (let i = 0; i < 40; i++) { clock.advance(250); await flush(); }   // 10 s
  poller.stop();
  assert.ok(fast >= 19 && fast <= 21, `fast ran ${fast}× in 10 s at 2 Hz`);
  assert.ok(slow >= 2 && slow <= 3, `slow ran ${slow}× (every 5 s)`);
  assert.equal(hung, 1, 'a run in flight is never started again');
  assert.equal(failing, 3, 'three failures in a row stop a probe');
  assert.equal(missing, 1, 'null = not on this machine: stops at once');
  assert.equal(poller.alive('fast'), true);
  assert.equal(poller.alive('missing'), false);
  const before = fast;
  clock.advance(5000); await flush();
  assert.equal(fast, before, 'stopped means stopped');
  assert.equal(clock.pending, 0, 'no timers left behind');
});

// ── probe parsers ───────────────────────────────────────────────────────────
test('probe parsers: Linux /proc, macOS tools, Windows typeperf + CIM', () => {
  assert.deepEqual(P.parseMeminfo('MemTotal:       16000000 kB\nMemFree:  1000000 kB\nMemAvailable:    4000000 kB\n'), { used: 0.75, total: 16000000 * 1024, usedBytes: 12000000 * 1024 });
  const netdev = 'Inter-|   Receive |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets\n    lo: 9999 1 0 0 0 0 0 0 9999 1 0 0 0 0 0 0\n  eth0: 1000 10 0 0 0 0 0 0 500 5 0 0 0 0 0 0\nwlan0: 200 2 0 0 0 0 0 0 100 1 0 0 0 0 0 0\ndocker0: 777 1 0 0 0 0 0 0 777 1 0 0 0 0 0 0\n';
  assert.deepEqual(P.parseNetDev(netdev), { rx: 1200, tx: 600 });
  const disks = '   8       0 sda 100 0 2000 0 50 0 4000 0 0 0 0\n   8       1 sda1 100 0 2000 0 50 0 4000 0 0 0 0\n 259       0 nvme0n1 1 0 10 0 1 0 20 0 0 0 0\n';
  assert.deepEqual(P.parseDiskstats(disks), { read: 2010 * 512, write: 4020 * 512 });
  assert.equal(P.pickThermal([{ type: 'acpitz', temp: '40000' }, { type: 'x86_pkg_temp', temp: '55500' }]), 55.5);
  assert.equal(P.pickThermal([{ type: 'a', temp: '41000' }, { type: 'b', temp: '47000' }]), 47);
  assert.equal(P.pickThermal([]), null);
  assert.equal(P.parseNvidiaSmi('37\n12\n'), 0.37);
  const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  1000.\nPages active:  200000.\nPages wired down:  50000.\nPages occupied by compressor:  10000.\n';
  assert.equal(P.parseVmStat(vm).usedBytes, (200000 + 50000 + 10000) * 16384);
  const nst = 'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll\nlo0        16384 <Link#1>                        100     0      5000      100     0      5000     0\nen0        1500  <Link#6>    aa:bb:cc:dd:ee:ff    10     0      3000       5     0      1000     0\nen0        1500  192.0.2/24  192.0.2.10          10     -      3000       5     -      1000     -\n';
  assert.deepEqual(P.parseNetstatIb(nst), { rx: 3000, tx: 1000 });
  assert.equal(P.parseIoregGpu('"PerformanceStatistics" = {"Device Utilization %"=23,"Renderer Utilization %"=20}'), 0.23);
  assert.deepEqual(P.parsePmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t81%; discharging; 4:02 remaining present: true"), { level: 0.81, charging: false });
  assert.equal(P.parsePmset("Now drawing from 'AC Power'"), null);
  const head = String.raw`"(PDH-CSV 4.0)","\\HOST-7\Network Interface(Ethernet Adapter)\Bytes Received/sec","\\HOST-7\Network Interface(isatap.example)\Bytes Received/sec","\\HOST-7\Network Interface(Ethernet Adapter)\Bytes Sent/sec","\\HOST-7\PhysicalDisk(_Total)\Disk Read Bytes/sec","\\HOST-7\PhysicalDisk(_Total)\Disk Write Bytes/sec","\\HOST-7\GPU Engine(pid_1_eng_0_engtype_3D)\Utilization Percentage","\\HOST-7\GPU Engine(pid_2_eng_0_engtype_3D)\Utilization Percentage"`;
  const cols = P.typeperfColumns(head);
  assert.deepEqual(cols.map((c) => c.role), ['down', 'up', 'read', 'write', 'gpu', 'gpu'], 'virtual adapters skipped');
  assert.ok(!JSON.stringify(cols).includes('HOST'), 'the machine name is never kept');
  assert.deepEqual(P.typeperfRow('"10/15/2026 12:00:00.000","1000","999999","250","5000","7000","30.5","12.5"', cols), { down: 1000, up: 250, read: 5000, write: 7000, gpu: 0.43 });
  assert.equal(P.typeperfRow('"10/15/2026 12:00:00.000"," "," "," "," "," "," "," "', cols), null);
  assert.equal(P.parseWinBattery('\r\n87\r\n'), 0.87);
  assert.equal(P.parseWinBattery(''), null);
  assert.deepEqual(P.rateOf({ rx: 100, tx: 50 }, { rx: 1100, tx: 50 }, 2000), { rx: 500, tx: 0 });
});

// ── live system source against a fake machine ───────────────────────────────
function fakeOs() {
  let busy = 0;
  const core = () => ({ model: 'Fictional 4-core', speed: 3200, times: { user: busy, nice: 0, sys: 0, irq: 0, idle: 1000 + busy * 0.5 } });
  return { tick(n) { busy += n; }, cpus: () => [core(), core(), core(), core()], totalmem: () => 8 * 1024 ** 3, freemem: () => 2 * 1024 ** 3, uptime: () => 3600 };
}
function fakeFs(files) {
  return {
    readFile: async (p) => { const v = typeof files[p] === 'function' ? files[p]() : files[p]; if (v === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return v; },
    readdir: async (p) => { const pre = `${p}/`; const names = [...new Set(Object.keys(files).filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length).split('/')[0]))]; if (!names.length) throw new Error('ENOENT'); return names; },
    statfs: async () => ({ bsize: 4096, blocks: 1000, bfree: 250, bavail: 200 }),
  };
}

test('system source (Linux): /proc deltas → rates, sysfs GPU / temp / battery, series history', async () => {
  const clock = manualClock(0), os = fakeOs();
  let rx = 0, tx = 0;
  const fs = fakeFs({
    '/proc/meminfo': 'MemTotal: 8000000 kB\nMemAvailable: 2000000 kB\n',
    '/proc/net/dev': () => `  eth0: ${rx} 0 0 0 0 0 0 0 ${tx} 0 0 0 0 0 0 0\n`,
    '/proc/diskstats': '   8 0 sda 1 0 100 0 1 0 200 0 0 0 0\n',
    '/sys/class/drm/card0/device/gpu_busy_percent': '42\n',
    '/sys/class/thermal/thermal_zone0/type': 'x86_pkg_temp', '/sys/class/thermal/thermal_zone0/temp': '51000',
    '/sys/class/power_supply/BAT0/capacity': '77', '/sys/class/power_supply/BAT0/status': 'Discharging',
  });
  const sys = fakeSystem({ platform: 'linux', clock });
  const src = createSystemSource({ sys, os, fs, rate: 1 });
  assert.equal(src.mode, 'live');
  src.start();
  for (let i = 0; i < 6; i++) { os.tick(500); rx += 1000; tx += 250; clock.advance(1000); await flush(); await flush(); }
  const s = src.snapshot();
  assert.ok(Math.abs(s.cpu - 500 / 750) < 0.01, `cpu from os.cpus deltas: ${s.cpu}`);
  assert.equal(s.sys.cores.length, 4);
  assert.equal(s.mem, 0.75);
  assert.equal(s.gpu, 0.42);
  assert.equal(s.temp, 51);
  assert.equal(s.battery, 0.77);
  assert.equal(s.sys.charging, false);
  assert.equal(s.disk, 0.75);
  assert.ok(Math.abs(s.net.down - 1000) < 1 && Math.abs(s.net.up - 250) < 1, JSON.stringify(s.net));
  assert.ok(s.series.cpu.length >= 5 && s.series.down.length >= 5);
  assert.equal(s.uptime, 3600);
  assert.ok(!JSON.stringify(s).includes('Fictional') || s.sys.cpuModel === 'Fictional 4-core');
  src.stop();
  assert.equal(clock.pending, 0, 'stop() clears every timer');
});

test('system source (Linux): what the machine cannot measure is null, never invented', async () => {
  const clock = manualClock(0), os = fakeOs();
  const src = createSystemSource({ sys: fakeSystem({ platform: 'linux', clock }), os, fs: fakeFs({ '/proc/meminfo': 'MemTotal: 1000 kB\nMemAvailable: 500 kB\n' }) });
  src.start();
  for (let i = 0; i < 8; i++) { os.tick(100); clock.advance(1000); await flush(); await flush(); }
  const s = src.snapshot();
  assert.equal(s.gpu, null);
  assert.equal(s.temp, null);
  assert.equal(s.battery, null);
  assert.equal(s.net, null);
  assert.equal(s.mem, 0.5);
  src.stop();
});

test('system source (Windows): one streaming typeperf → net / disk IO / GPU, killed on stop', async () => {
  const clock = manualClock(0), os = fakeOs();
  const head = String.raw`"(PDH-CSV 4.0)","\\HOST\Network Interface(Ethernet)\Bytes Received/sec","\\HOST\Network Interface(Ethernet)\Bytes Sent/sec","\\HOST\PhysicalDisk(_Total)\Disk Read Bytes/sec","\\HOST\PhysicalDisk(_Total)\Disk Write Bytes/sec","\\HOST\GPU Engine(pid_9_engtype_3D)\Utilization Percentage"`;
  const sys = fakeSystem({ platform: 'win32', clock, bins: ['typeperf', 'powershell.exe'], run: { 'powershell.exe -NoProfile -NonInteractive -Command (Get-CimInstance -ClassName Win32_Battery | Measure-Object -Property EstimatedChargeRemaining -Average).Average': { stdout: '' } },
    behave: { typeperf: lines([[20, ''], [30, head], [2000, '"10/15/2026 12:00:00.000","120000","30000","5000","6000","61"']]) } });
  const src = createSystemSource({ sys, os, fs: fakeFs({}) });
  src.start();
  for (let i = 0; i < 4; i++) { os.tick(100); clock.advance(1000); await flush(); await flush(); }
  const s = src.snapshot();
  assert.deepEqual(s.net, { down: 120000, up: 30000 });
  assert.equal(s.gpu, 0.61);
  assert.equal(s.sys.diskRead, 5000);
  assert.equal(s.battery, null, 'no battery → null (and PowerShell is not asked again)');
  assert.equal(s.mem, 0.75);
  const tp = sys.spawned.find((c) => c.cmd === 'typeperf');
  assert.ok(tp.args.includes('-si') && tp.args.some((a) => a.includes('GPU Engine')));
  src.stop();
  await flush();
  assert.equal(tp.killed, true, 'the typeperf child is killed on stop');
});

// ── hub ─────────────────────────────────────────────────────────────────────
test('hub: reference-counted start/stop, live beats simulated, null live data falls through', () => {
  let started = 0, stopped = 0, live = null;
  const fakeLive = { id: 'audio-live', provides: ['audio', 'spectrum'], mode: 'simulated', running: false, start() { started++; this.running = true; }, stop() { stopped++; this.running = false; }, snapshot: () => live };
  const sim = simulatedAudio();
  const hub = createHub({ sources: [sim, fakeLive], now: () => T0 });
  assert.equal(hub.active, false);
  const r1 = hub.need(['audio']), r2 = hub.need(['audio', 'spectrum']);
  assert.equal(started, 1);
  assert.ok(hub.pick(['audio']).audio.levels.length > 0, 'capture not live yet → the simulated groove');
  live = { audio: { level: 0.5, levels: [0.1, 0.2], rate: 30 }, spectrum: { bands: [0.3] } };
  fakeLive.mode = 'live';
  assert.deepEqual(hub.pick(['audio']).audio.levels, [0.1, 0.2], 'live wins the moment it is live');
  live = null;
  assert.equal(hub.pick(['audio']).audio.levels.length, 480, '…and drops back when it has nothing');
  r1();
  assert.equal(stopped, 0, 'still needed by the second consumer');
  r2(); r2();
  assert.equal(stopped, 1, 'the last release stops it (release is idempotent)');
  assert.equal(hub.active, false);
  hub.register('weather', () => ({ temp: 21, code: 1 }));
  assert.deepEqual(hub.pick(['weather']).weather, { temp: 21, code: 1 });
  assert.ok(hub.supported().includes('weather'));
});

test('hub: extension keys (sys, series) ride along; unknown keys are simply absent', () => {
  const hub = createSimulatedHub({ now: () => T0 });
  const L = lease(hub, ['cpu', 'nope']);
  const d = L.data(T0);
  assert.ok(in01(d.cpu) && d.sys && d.series && !('nope' in d));
  L.release();
  const all = hub.snapshot(T0);
  for (const k of ['cpu', 'audio', 'spectrum', 'media', 'calendar']) assert.ok(k in all, k);
});

// ── timer / calendar / media adapters ───────────────────────────────────────
test('timer: stopwatch keeps its time when stopped; countdown reports remaining', () => {
  let now = 0;
  const t = createTimer({ now: () => now });
  t.press(); now = 12500; t.lap(); now = 20000; t.press(); now = 90000;
  assert.deepEqual(t.snapshot().timer, { elapsed: 20, running: false, laps: [12.5] });
  t.press(); now = 95000;
  assert.equal(t.snapshot().timer.elapsed, 25);
  t.reset();
  assert.deepEqual(t.snapshot().timer, { elapsed: 0, running: false, laps: [] });
  const c = createTimer({ now: () => now, target: 60 });
  c.start(); now += 45000;
  assert.equal(c.snapshot().timer.remaining, 15);
});

test('calendar: .ics parsing (UTC, floating, folded, all-day skipped) and the agenda', async () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Design\r\n  review\r\nDTSTART:20260414T100000Z\r\nDTEND:20260414T104500Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20260414\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Standup\\, team\r\nDTSTART:20260414T090000\r\nDTEND:20260414T091500\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const ev = parseIcs(ics, 0);
  assert.deepEqual(ev.map((e) => e.title), ['Standup, team', 'Design review']);
  assert.equal(icsTime('20260414T100000', 120), Date.UTC(2026, 3, 14, 8, 0, 0), 'floating time in UTC+2');
  const ag = agendaOf(ev, T0, 0);
  assert.equal(ag.next.title, 'Design review');
  assert.equal(ag.current, undefined);
  assert.equal(ag.events.length, 2);
  const src = createIcsCalendarSource({ file: '/agenda.ics', fs: { readFile: async () => ics }, now: () => T0, setTimer: () => 1, clearTimer: () => {} });
  src.start(); await flush();
  assert.equal(src.snapshot().calendar.next.title, 'Design review');
  src.stop();
});

test('media: playerctl / wpctl / pactl parsing and the Linux source', async () => {
  assert.deepEqual(parsePlayerctl('Playing\tLumen Arcade\tGlass Horizon\tRefraction\t64000000\t214000000\n'), { title: 'Glass Horizon', artist: 'Lumen Arcade', album: 'Refraction', position: 64, duration: 214, playing: true });
  assert.equal(parsePlayerctl('No players found'), null);
  assert.deepEqual(parseVolume('Volume: 0.40 [MUTED]'), { volume: 0.4, muted: true });
  assert.deepEqual(parseVolume('Volume: front-left: 41287 /  63% / -12.00 dB', 'Mute: no'), { volume: 0.63, muted: false });
  assert.equal(createLinuxMediaSource({ sys: fakeSystem({ platform: 'win32' }) }), null);
  const clock = manualClock(0);
  const sys = fakeSystem({ platform: 'linux', clock, bins: ['playerctl', 'wpctl'], run: (k) => (k.startsWith('playerctl') ? { stdout: 'Paused\tMira Vale\tPaper Satellites\tOrbitals\t1000000\t243000000\n' } : k.startsWith('wpctl') ? { stdout: 'Volume: 0.55' } : null) });
  const m = createLinuxMediaSource({ sys });
  m.start(); clock.advance(10); await flush(); await flush();
  assert.deepEqual(m.snapshot().media, { title: 'Paper Satellites', artist: 'Mira Vale', album: 'Orbitals', position: 1, duration: 243, playing: false, volume: 0.55, muted: false });
  m.stop();
});

// ── audio adapter: live PCM path ────────────────────────────────────────────
test('audio source: PCM from a capture stream → levels and bands in the ctx.data shapes', () => {
  const listeners = [];
  const stream = { on: (e, f) => { if (e === 'data') listeners.push(f); }, off: () => {} };
  let now = T0;
  const src = createAudioSource({ stream, format: 's16le', channels: 1, sampleRate: 16000, now: () => now });
  assert.equal(src.mode, 'live');
  src.start();
  for (let i = 0; i < 50; i++) { listeners.forEach((f) => f(sineBytes(320, { freq: 1000, start: i * 320, amp: 0.5 }))); now += 20; }
  const s = src.snapshot(now);
  assert.equal(s.audio.levels.length, 16 * 30);
  assert.equal(s.audio.rate, 30);
  assert.ok(s.audio.level > 0.5, `a −6 dBFS tone meters high: ${s.audio.level}`);
  assert.equal(s.spectrum.bands.length, 16);
  const peak = s.spectrum.bands.indexOf(Math.max(...s.spectrum.bands));
  assert.ok(Math.abs(s.spectrum.centers[peak] - 1000) / 1000 < 0.6, `the 1 kHz tone lands near its band (${s.spectrum.centers[peak]} Hz)`);
  src.stop();
});

test('audio source: the capture layer (fallback: false) defers to the hub’s simulated groove until it is live', async () => {
  const sys = fakeSystem({ platform: 'linux', bins: [] });
  const live = await autoAudioSource({ system: sys, bridge: false, deadlineMs: 50, retryMs: 600000 });
  assert.ok(live && live.provides.includes('audio'));
  const hub = createHub({ sources: [live, simulatedAudio()], now: () => T0 });
  const release = hub.need(['audio']);
  await flush();
  const d = hub.pick(['audio'], T0);
  assert.equal(d.audio.levels.length, 480, 'nothing live on this fake machine → simulated');
  assert.notEqual(live.mode, 'live');
  release();
  await live.stop?.();
});

// ── facet data handling ─────────────────────────────────────────────────────
test('app data resolvers: live data wins, null means unavailable, absent simulates', () => {
  const f = findFacet('app-cpu-graph');
  const ctx = (data) => createContext(f, { t: 3, data });
  assert.equal(metricOf(ctx({ cpu: 0.33 }), 'cpu'), 0.33);
  assert.equal(metricOf(ctx({ cpu: null }), 'cpu'), null);
  assert.ok(in01(metricOf(ctx({}), 'cpu')));
  assert.equal(netOf(ctx({ net: null })), null);
  assert.deepEqual(netOf(ctx({ net: { down: 10, up: 2 } })), { down: 10, up: 2 });
  assert.deepEqual(seriesOf(ctx({ series: { cpu: [0.1, 0.2, 0.3] } }), 'cpu', 3).values, [0.1, 0.2, 0.3]);
  assert.equal(seriesOf(ctx({ series: { down: [100, 200] } }), 'down', 2).max, 200);
  assert.equal(audioOf(ctx({ audio: { levels: [0.2, 0.4], rate: 30 } })).live, true);
  assert.equal(audioOf(ctx({})).live, false);
  assert.equal(spectrumOf(ctx({ spectrum: { bands: [0, 1] } }), 4).bands.length, 4);
  assert.equal(mediaOf(ctx({ media: { title: 'X', playing: true } })).title, 'X');
  assert.ok(calendarOf(ctx({})).next);
  assert.deepEqual(resample([1, 0, 1, 0], 2).map((v) => +v.toFixed(2)), [0.75, 0.75]);
});

test('app facets render live data, unavailable (null) data and silence as valid deck SVG', () => {
  const live = createSimulatedHub({ now: () => T0 }).snapshot(T0);
  const nulls = { cpu: null, mem: null, gpu: null, disk: null, net: null, temp: null, battery: null, media: null };
  const silence = { audio: { level: 0, levels: new Array(480).fill(0), rate: 30 }, spectrum: { bands: new Array(16).fill(0), peaks: new Array(16).fill(0) } };
  const apps = allFacets().filter((f) => f.gallery === 'apps' && !/^app-(cpu-ring|focus-timer)$/.test(f.id));
  for (const f of apps) for (const data of [live, nulls, silence]) {
    const r = render(f, { t: 3.3, data, idPrefix: 'pdtest', ...(f.surface === 'screen' ? { screen: f.screens[0] } : {}) });
    const probs = validateSvg(r.svg, { w: r.w, h: r.h, maxBytes: 524288, idPrefix: 'pdtest' });
    assert.deepEqual(probs, [], `${f.id}: ${probs.join('; ')}`);
  }
  const g = findFacet('app-waveform');
  assert.notEqual(render(g, { t: 3, data: silence }).svg, render(g, { t: 3 }).svg, 'live data replaces the simulation');
  assert.equal(render(g, { t: 3, data: silence }).svg, render(g, { t: 9, data: silence }).svg, 'with live data the frame depends on the data, not on t');
});

test('app-waveform: per-key slices stay small on every family device (API 1.2 culling)', () => {
  const f = findFacet('app-waveform');
  for (const device of FAMILY_DEVICES) for (const style of ['smooth', 'bars']) {
    const r = render(f, { device, t: 4.2, params: { style } });
    const max = Math.max(...r.keys.map((k) => k.svg.length));
    assert.ok(max < 32768, `${device}/${style}: largest key slice ${max} B`);
  }
});

test('app-spectrum and app-clock-span: keys the content leaves alone are byte-identical frame to frame', () => {
  const f = findFacet('app-clock-span');
  const a = render(f, { device: 'xl', t: 10.2 }), b = render(f, { device: 'xl', t: 10.7 });
  const same = a.keys.filter((k, i) => k.svg === b.keys[i].svg).length;
  assert.ok(same >= 20, `${same} of 32 XL keys unchanged within the same second`);
  const s = findFacet('app-spectrum');
  const quiet = { spectrum: { bands: new Array(16).fill(0.05), peaks: new Array(16).fill(0.05) } };
  const x = render(s, { device: 'mk2', t: 1, data: quiet }), y = render(s, { device: 'mk2', t: 2, data: quiet });
  assert.deepEqual(x.keys.map((k) => k.svg), y.keys.map((k) => k.svg));
});

// ── Galleon routing ─────────────────────────────────────────────────────────
test('galleon routing: plans, data keys, per-slot frames and one composed screen', () => {
  const plan = galleonPlan({ '1,0': { facet: 'screen-galleon-system', from: '0,0' }, '0,1': 'app-widget-cpu', '1,1': 'no-such-facet' });
  assert.deepEqual(plan.map((p) => p.key), GALLEON_SLOTS.map((s) => s.key));
  assert.equal(plan[0].facet.id, DEFAULT_ROUTES['0,0']);
  assert.equal(plan[1].from, '0,0');
  assert.equal(plan[3].facet.id, DEFAULT_ROUTES['1,1'], 'unknown facets fall back to the slot default');
  const keys = planData(plan);
  for (const k of ['clock', 'cpu', 'spectrum']) assert.ok(keys.includes(k), k);
  const hub = createSimulatedHub({ now: () => T0 });
  const { widgets, screen } = renderGalleon(plan, { data: hub.pick(keys, T0), t: 3, now: T0, idPrefix: 'pdtest' });
  assert.equal(widgets.length, 4);
  for (const w of widgets) assert.deepEqual(validateSvg(w.svg, { maxBytes: 131072 }), []);
  assert.deepEqual(validateSvg(screen, { w: 720, h: 384, maxBytes: 262144 }), []);
  assert.equal(renderGalleon(plan, { t: 3, now: T0 }).screen, renderGalleon(plan, { t: 3, now: T0 }).screen, 'deterministic');
});

test('app-galleon-mix: per-widget routing params pick the widget kinds', () => {
  const f = findFacet('app-galleon-mix');
  const a = render(f, { t: 2, params: { dial0Top: 'cpu' } }), b = render(f, { t: 2, params: { dial0Top: 'clock' } });
  assert.notEqual(a.widgets[0].svg, b.widgets[0].svg);
  assert.equal(a.widgets[3].svg, b.widgets[3].svg, 'other slots untouched');
});
