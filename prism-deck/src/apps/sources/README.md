# Prism Deck data sources (`src/apps/sources/`)

Live inputs for facets that declare `data` (docs/authoring.md §7). Every app facet also
**simulates** its inputs when nothing is wired (`src/facets/apps/_sim.js`); the simulated
sources here compute the *same* numbers, so a deck fed by them looks identical to one with
no sources at all. Zero dependencies. `index.js` is browser-safe; `node.js` adds the live
system, capture and player sources (Node ≥ 18; the plugin runs on the app's Node 20).

## Using it

```js
// Plugin (Node): a drop-in for src/plugin/data.js createDataHub() — same interface
import { createNodeHub } from '../apps/sources/node.js';
const data = await createNodeHub();                    // live system · live audio capture (simulated while none is live) · media · calendar
new PrismRuntime({ conn, data, … });                   // runtime calls data.need(facet.data) / data.pick(facet.data)

// Web catalog, tests, demos: everything simulated, deterministic, offline
import { createSimulatedHub } from '../apps/sources/index.js';
const hub = createSimulatedHub();
const release = hub.need(facet.data);
render(facet, { …, data: hub.pick(facet.data) });
release();
```

Hub (`hub.js`): `need(keys) → release()` (reference-counted: a source starts on the first need of
any key it serves and stops — killing its processes — on the last release) · `pick(keys, nowMs?)`
(reads each source's latest snapshot; never samples) · `register(key, fn)` (ad-hoc getter, wins) ·
`supported()` · `status()` · `snapshot()` · `stop()` · `active`. Per key, a live source beats a
simulated one. A source's extension keys (`sys`, `series`) ride along with any key it serves.

## The source interface

```js
{
  id: 'system',                 // 'system' | 'audio' | 'media' | 'calendar' | yours
  provides: ['cpu', 'mem', …],  // ctx.data keys it fills
  rate: 1,                      // Hz: its snapshot changes at most this often
  mode: 'live' | 'simulated',
  running: false,
  start(), stop(),              // idempotent; stop() clears timers and kills child processes
  snapshot(nowMs?) → { cpu: 0.42, … },   // cheap, never blocks, never samples; may return a cached object
  status() → { … },             // diagnostics (probes, failures, child processes)
}
```

Helpers (`_source.js`): `simulatedSource({ id, provides, rate, compute(t, seed) })` (cached per
1/rate s — equal instants give equal objects), `createPoller({ probes })` (single-flight, each probe
at most every `every` s; a run that fails 3× in a row stops; a probe that returns `null` = "not on
this machine" stops at once), `History`, `stable()` (rounds to 4 decimals so frames dedupe).

## ctx.data shapes

**Absent key → the facet simulates it. `null` → a live source runs but can't measure it here
(facets show "—", never an invented number next to real ones).**

| key | shape | source |
|---|---|---|
| `cpu` · `mem` · `gpu` · `disk` · `battery` | number 0–1 (`disk` = used space of the system volume) | system |
| `net` | `{ down, up }` bytes/s | system |
| `temp` | °C (CPU package where named, else hottest zone) | system (Linux) |
| `uptime` | seconds | system |
| `sys` *(extension)* | `{ cores: number[] (per-core 0–1), cpuModel, cpuGhz, memTotal, memUsed, diskTotal, diskFree, diskRead, diskWrite (bytes/s), charging, platform }` — no host or user names | system |
| `series` *(extension)* | `{ step (s), cpu, mem, gpu, temp (°C), down, up, read, write (bytes/s): number[] }` oldest first, `step` apart (60 samples) | system |
| `audio` | `{ level 0–1 (meter, dB scale), levels: number[] (per-hop peaks, oldest first, linear with auto-gain: body ≈ 0.5, hits ≈ 0.95), rate (levels/s), peak, rms }` — 16 s × 30 Hz | audio |
| `spectrum` | `{ bands: number[] 0–1 low → high (log-spaced 40 Hz–12 kHz, smoothed, +1.5 dB/oct tilt), peaks: number[] (falling caps), centers: Hz[] }` — 16 bands | audio |
| `media` | `{ title, artist, album, position s, duration s, playing, volume? 0–1, muted? }` or `null` (nothing playing) | media |
| `calendar` | `{ next: { title, at, end }, current?: { title, at, end }, events?: [{ title, at, end }] }` (epoch ms) | calendar |
| `timer` | `{ elapsed s, running, laps: s[], target? s, remaining? s }` — per key (`createTimer()`), passed as that key's data | runtime |
| `clock` | use `ctx.clock` / `ctx.now` (the runtime's wall clock) | runtime |
| `weather` | see `src/facets/screens/_d5-weather.js` (no built-in source: no network) — `hub.register('weather', fn)` | — |
| `mic` · `camera` *(extensions)* | `{ muted }` · `{ on }` — meeting state when a runtime knows it (else the key's own state) | runtime |

`audio` and `spectrum` are exactly what `src/audio/analyzer.js` (`Analyzer#snapshot()`) emits; the
apps layer only asks for a longer history (`historySeconds: 16`) so span apps on big decks have a full window.

## Sources

| file | source | what it does |
|---|---|---|
| `simulated.js` | `simulatedSystem`, `simulatedAudio`, `simulatedMedia`, `simulatedCalendar` | pure functions of time (`_sim.js`) |
| `system.js` | `createSystemSource({ sys, os, fs })` | **live, read-only, throttled, never elevated.** All: `os.cpus()` deltas (total + cores), `os.uptime()`, `fs.statfs` (30 s). Linux: `/proc/meminfo`, `/proc/net/dev`, `/proc/diskstats`, thermal zones (5 s), power_supply (30 s), GPU via `gpu_busy_percent` or `nvidia-smi` (2 s). macOS: `vm_stat` (5 s), `netstat -ibn` (2 s), `ioreg -c IOAccelerator` (3 s), `pmset -g batt` (60 s). Windows: `os.freemem`, one long-running `typeperf … -si 2` (net, disk IO, GPU 3D; restarted every 10 min, gives up after 3 failed restarts), CIM `Win32_Battery` via PowerShell every 2 min (stops if there is no battery). Parsers: `probes.js` (pure, tested). |
| `audio.js` | `createAudioSource()` · `autoAudioSource()` | simulated groove, or live: PCM bytes from a capture `stream` (any `s16le`/`f32le` CLI stdout; WAV/AU headers sniffed) or a `capture` object → `src/audio/pcm.js` → `src/audio/analyzer.js`; `feed(Float32Array)` for bridges. `autoAudioSource` returns `src/audio/source.js`'s `createAudioSource({ fallback: false })` (the hub's simulated groove covers it until a backend is live; its `mode` getter is read on every pick, so audio facets switch to real capture automatically). |
| `media.js` | `createLinuxMediaSource({ sys })` | optional: MPRIS via `playerctl` (1 s) + sink volume via `wpctl`/`pactl` (2 s). Windows/macOS: simulated. |
| `calendar.js` | `createIcsCalendarSource({ file, fs })` | optional: a local `.ics` file, re-read every 60 s (SUMMARY / DTSTART / DTEND of timed events only). |
| `timer.js` | `createTimer({ now, target })` | stopwatch / countdown state for one key: `press()`, `lap()`, `reset()`, `snapshot()` |
| `hub.js` | `createHub`, `lease` | above |

## Capture interface (for `src/audio/`)

The audio source accepts any of these, so the capture layer can land without touching the apps:

1. `src/audio/source.js` exporting `createAudioSource(opts) | createSource(opts) | default` → an object with
   `start()`, `stop()`, `snapshot() → { audio, spectrum }` (`running`, `rate`, `status()` optional). Used by
   `autoAudioSource()` (and therefore `createNodeHub()`) automatically. opts passed: `{ historySeconds: 16, historyRate: 30, bands: 16, seed }`.
2. `{ stream, format: 's16le' | 'f32le' | …, channels, sampleRate }` — a Readable of raw PCM (a spawned
   `pw-record` / `parec` / `arecord` / `ffmpeg` stdout, as `src/audio/backends.js` plans them).
3. `{ capture: { stream | stdout | onData(cb), sampleRate, channels, format, start?(), stop?() } }`.

Status: #1 is live (`src/audio/source.js`). `createNodeHub()` adds it with `fallback: false` plus `simulatedAudio()`; `hub.status().keys.audio` shows the order, e.g. `audio:live > audio:simulated`.
