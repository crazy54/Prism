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
const data = await createNodeHub();                    // Prism Control when it runs · live system · live audio capture (simulated while none is live) · media · calendar
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
| `temp` | °C (CPU package where named, else hottest zone) | system (Linux) · Prism Control |
| `uptime` | seconds | system |
| `sys` *(extension)* | `{ cores: number[] (per-core 0–1), cpuModel, cpuGhz, memTotal, memUsed, diskTotal, diskFree, diskRead, diskWrite (bytes/s), charging, platform }` — no host or user names. Prism Control adds `gpuName, gpuTemp (°C), vramUsed, vramTotal (bytes)` | system · Prism Control |
| `series` *(extension)* | `{ step (s), cpu, mem, gpu, temp (°C), down, up, read, write (bytes/s): number[] }` oldest first, `step` apart (60 samples) | system |
| `audio` | `{ level 0–1 (meter, dB scale), levels: number[] (per-hop peaks, oldest first, linear with auto-gain: body ≈ 0.5, hits ≈ 0.95), rate (levels/s), peak, rms }` — 16 s × 30 Hz | audio |
| `spectrum` | `{ bands: number[] 0–1 low → high (log-spaced 40 Hz–12 kHz, smoothed, +1.5 dB/oct tilt), peaks: number[] (falling caps), centers: Hz[] }` — 16 bands | audio |
| `media` | `{ title, artist, album, position s, duration s, playing, volume? 0–1, muted? }` or `null` (nothing playing). Prism Control adds `state, source, app, url (link back to the track), shuffle, repeat, liked, playerVolume 0–1, art: { dataUrl, mime, width, height }` or `null` (the real album art, as served) | media · Prism Control |
| `calendar` | `{ next: { title, at, end }, current?: { title, at, end }, events?: [{ title, at, end }] }` (epoch ms) | calendar |
| `timer` | `{ elapsed s, running, laps: s[], target? s, remaining? s }` — per key (`createTimer()`), passed as that key's data | runtime |
| `clock` | use `ctx.clock` / `ctx.now` (the runtime's wall clock) | runtime |
| `weather` | see `src/facets/screens/_d5-weather.js` (no built-in source: no network) — `hub.register('weather', fn)` | — |
| `mic` · `camera` *(extensions)* | `{ muted }` · `{ on }` — meeting state when a runtime knows it (else the key's own state). Prism Control: the default capture device `{ muted, volume 0–1, peak (linear 0–1), level (dB scale, like audio.level), inUse }`, or `null` (no mic) | runtime · Prism Control |
| `volume` *(extension)* | `{ level 0–1, muted }` — the default output device (the link bus's `volume.*` channels share this shape) | Prism Control · runtime |
| `fans` *(extension)* | `{ rpm, min, max, count, radiator, case, unassigned, gpu, list }` — `rpm/min/max` over all case + radiator + unassigned fans; each group is `{ rpm, min, max, count }` or `null` (no members); `list: [{ id, name, role, rpm, pct (0–1 or null), connected }]`. `null` when no fan reports | Prism Control |
| `pump` · `coolant` *(extensions)* | `{ rpm, min, max, count }` (AIO pump) · °C (AIO liquid) — `null` when the cooler has none | Prism Control |
| `gamelink` | the game you're playing, v1: `{ v, game, at, rev, status, player, weapon, stats, round, match, events, [game] }` — absent while Game Link is off (the demo round), `null` while it waits for a game. See [Game Link](#game-link-your-game--ctxdatagamelink-v1-frozen) | Game Link (prism-play) |

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
| `prism-control.js` | `createPrismControl({ under })` | **live, Windows, read-only:** the sibling plugin Prism Control's loopback API (below). Seven sources (`prism-control.system` … `.audio`), `wrapAudio(audioSource)` for the plugin, `status()`. Mappers `mapSystem`, `mapTemp`, `mapMedia`, `mapVolume`, `mapMic`, `mapCooling` are pure and exported. |
| `timer.js` | `createTimer({ now, target })` | stopwatch / countdown state for one key: `press()`, `lap()`, `reset()`, `snapshot()` |
| `hub.js` | `createHub`, `lease` | above |
| `gamelink*.js` | `createGameLink()` (Node) · `normalizeCs2` · `normalizeCompanion` · `simulatedGameLink` | Game Link (prism-play): the CS2 / companion listener and its pure halves, below |

## Prism Control (Windows): the PC's real numbers

`prism-control.js` reads the sibling plugin **Prism Control** (`com.jeremyfhall.prismcontrol`), a native
Stream Deck plugin with a read-only loopback HTTP API (spec: `prism-control/docs/api.md`, v1).
`createNodeHub()` adds its sources **before** the Node probes, so per key a live Prism Control wins. The
probes keep running underneath and serve every key it doesn't fill (`battery`, per-core loads, anything
it hasn't answered yet), and they take over at once when it stops. Off: `prismControl: false` or
`PRISM_DECK_PRISM_CONTROL=off`. On Linux and macOS there's nothing to read, so it costs nothing.

- **Demand.** Each source polls only its endpoints, and only while the hub has it started, at the API's §6
  cadence with `If-None-Match` (most answers are `304`). Nothing is requested while no data facet is visible.
- **Discovery.** `%APPDATA%\Prism\control\control.json` (`PRISM_CONTROL_DIR` overrides the folder) is re-read
  on every reconnect, on a `401`, and after a socket error. A stale file (dead `pid`, or a token that was
  refused) is skipped without a connect. While Prism Control is absent the file is re-checked every 1–5 s.
  Requests are async and never block a frame. `Host` is `127.0.0.1:<port>`, no `Origin` is ever sent, and
  the token is never logged or shown in `status()`.
- **Values.** A null field that Prism Control reports stays `null` (the facet shows "—"). A container it lacks
  leaves the key absent, so the next source serves it: `cpu` before stats are ready, an empty `gpus[]`,
  a `503`, a payload older than 8 s. Demo-mode payloads (`"demo": true`) make the source `simulated`, so
  real probes win and the plugin tags them DEMO. A source's `mode` is `live`, `simulated` or `idle`
  (connected but no data for it, or not connected).
- **Album art.** `/v1/now-playing/art` is fetched only when `art.etag` changes. Only JPEG or PNG up to 1 MiB
  is accepted. `media.art.dataUrl` holds the exact bytes. It's kept in memory only while a media key is
  visible. Facets that draw it must show it **whole: no crop, mask, rounded corners, tint or overlay**,
  and keep `media.url` (the link back to the track) nearby. Those are Spotify's terms.
- **Audio.** `/v1/audio/levels` (output `peak`, ~30 Hz, polled only while an audio facet is retained) goes
  through the same `Analyzer` as capture, so `audio` has the same shape: `level`, `levels` (16 s × 30
  Hz), `rate`, `peak`. There's no `rms`, because Prism Control meters peaks only. There's **no
  `spectrum`**: Prism Control has no bands, so the spectrum stays with capture or the simulation. In
  the hub this is `prism-control.audio`. The plugin feeds audio per frame from `src/audio`, so it
  needs `hub.prismControl.wrapAudio(audioSource)`. That returns an AudioSource that takes `audio` from
  Prism Control and `spectrum` from capture. Its `mode` stays the capture's, because both keys must
  be real to be `live`; `modeOf(key)` gives the mode of each key.

| endpoint | field | `ctx.data` |
|---|---|---|
| `/v1/system` | `cpu.usagePct` | `cpu` = /100 |
| | `memory.usagePct` | `mem` = /100 |
| | `gpus[]` (the one with the most VRAM) `.usagePct` | `gpu` = /100 |
| | `disks[]` (the `%SystemDrive%` volume) `.usagePct` | `disk` = /100 |
| | `network.rxBps` · `txBps` (bytes/s) | `net.down` · `net.up` (bytes/s) |
| | `uptimeSec` | `uptime` |
| | `cpu.name` · `clockMhz` · `perCorePct[]` | `sys.cpuModel` · `cpuGhz` · `cores[]` (/100; the Node probes' values when null) |
| | `memory.totalMiB` · `usedMiB` | `sys.memTotal` · `memUsed` (bytes) |
| | system disk `totalGiB` − `usedGiB`; all disks Σ `readBps` · `writeBps` | `sys.diskTotal` · `diskFree` (bytes); `sys.diskRead` · `diskWrite` (bytes/s) |
| | GPU `name` · `tempC` · `vramUsedMiB` · `vramTotalMiB` | `sys.gpuName` · `gpuTemp` · `vramUsed` · `vramTotal` (bytes) |
| | each 1 Hz answer | `series.*` (60 samples, `step` 1 s) |
| `/v1/cooling` (else `/v1/system` `cpu.tempC`) | `cpu.tempC` | `temp` (°C) |
| `/v1/cooling` | `groups[allFans · radiator · case · unassigned · gpu]`, `sensors[kind=fan]` | `fans` |
| | `groups[pump]` · `coolant.tempC` | `pump` · `coolant` |
| `/v1/now-playing` | `track.title` · `artists[]` (joined `, `) · `album` · `durationMs` | `media.title` · `artist` · `album` · `duration` (s) |
| | `positionMs` + (now − `positionAt`) while `playing` | `media.position` (s) |
| | `state` (`none` → `media: null`) · `source` · `app` · `track.url` · `shuffle` · `repeat` · `liked` · `volumePct` | `media.playing` · `state` · `source` · `app` · `url` · `shuffle` · `repeat` · `liked` · `playerVolume` (/100) |
| `/v1/now-playing/art` | bytes + `Content-Type` (when `art.etag` changes) | `media.art { dataUrl, mime, width, height }` |
| `/v1/audio/devices` | default output `volumePct` · `muted` | `volume { level, muted }`, `media.volume` · `muted` |
| `/v1/mic` | `muted` · `volumePct` · `peak` · `inUse` | `mic { muted, volume, peak, level, inUse }` |
| `/v1/audio/levels` | `output.peak` | `audio` (via `Analyzer#pushMeter`) |

## Capture interface (for `src/audio/`)

The audio source accepts any of these, so the capture layer can land without touching the apps:

1. `src/audio/source.js` exporting `createAudioSource(opts) | createSource(opts) | default` → an object with
   `start()`, `stop()`, `snapshot() → { audio, spectrum }` (`running`, `rate`, `status()` optional). Used by
   `autoAudioSource()` (and therefore `createNodeHub()`) automatically. opts passed: `{ historySeconds: 16, historyRate: 30, bands: 16, seed }`.
2. `{ stream, format: 's16le' | 'f32le' | …, channels, sampleRate }` — a Readable of raw PCM (a spawned
   `pw-record` / `parec` / `arecord` / `ffmpeg` stdout, as `src/audio/backends.js` plans them).
3. `{ capture: { stream | stdout | onData(cb), sampleRate, channels, format, start?(), stop?() } }`.

Status: #1 is live (`src/audio/source.js`). `createNodeHub()` adds it with `fallback: false` plus `simulatedAudio()`; `hub.status().keys.audio` shows the order, e.g. `audio:live > audio:simulated`.

<!-- ── Game Link (prism-play) ── -->
## Game Link: your game → `ctx.data.gamelink` (v1, frozen)

Game Link feeds one game-neutral key, `gamelink`, from two kinds of local inputs:

- **Counter-Strike 2** through Valve's Game State Integration (GSI): CS2 POSTs your own game state to the plugin's
  loopback listener after the user clicks **Connect CS2** in the property inspector (it turns listening on and writes
  `gamestate_integration_prism.cfg` into the CS2 `cfg/` folder; Disconnect removes exactly that file).
- **Companions**: local adapters that already know a game's state and post it in this vocabulary, such as Prism
  Control's Prism Sight module (screen reading, offline anti-cheat-free games only) or a game mod's local API bridge.
  They use `POST /v1/companion` with the companion token from `gamelink.json`.

It's read-only by construction: nothing is ever sent to a game.

| file | what |
|---|---|
| `gamelink-cs2.js` | **pure, browser-safe.** `normalizeCs2(payload, prev, { nowMs }) → { state, events }`, `tickCs2` (the flash hold's safety clear, a deferred strike), `gameLinkView` (what facets see), `sanitizeCs2` (drops identities), `parseVdf` / `libraryFolders` / `findCs2` (Steam libraries: Windows registry via an injected reader, `~/.steam/steam`, `~/.local/share/Steam`), `cs2Cfg` / `isPrismCfg` / `cfgState` (the cfg text) |
| `gamelink-companion.js` | **pure, browser-safe.** `normalizeCompanion(body, prev, { nowMs })`: validates and clamps a companion batch into the same shape |
| `gamelink.js` | **Node only** (never re-exported from `index.js`). `createGameLink(opts)`: the 127.0.0.1 listener, tokens, `gamelink.json`, the hub source, `configure()`, `connectCs2()` / `disconnectCs2()`, `cs2Status()`, `status()`, `on('change')` |
| `gamelink-sim.js` | `simulatedGameLink()`: the demo round as a hub source (the plugin's fallback, tagged DEMO; in `createSimulatedHub()`) |
| `../../facets/gamelink/_gl-sim.js` | `simGameLink(t)`: the demo round itself, a pure function of time (fictional payloads replayed through `normalizeCs2`). Facets call it when `ctx.data.gamelink` is absent |
| `../../plugin/gamelink.js` | `GameLinkController`: globals → listener, the PI's Game Link subsection, `runtime.dataChanged()` on every change |

### Three answers

| `ctx.data.gamelink` | when | the facet shows | DEMO tag |
|---|---|---|---|
| **absent** | Game Link isn't listening (the default: the PI's *Listen for game data* is off), the web player, tests | the demo round: `simGameLink(ctx.t)` (the plugin's simulated source serves the same round on the wall clock) | yes |
| **`null`** | listening, but no game has posted (or none for 15 s = 3 CS2 heartbeats) | an honest **"Waiting for CS2"** / "Waiting for a game" face. Never invented data | no |
| **an object** | live | the state below | no |

### The shape (v1)

Times are epoch ms on the plugin's wall clock, the same clock as `ctx.now`. Numbers are rounded to 4 decimals, so a heartbeat that changes nothing gives the same object and the same frames. `null` always means "this game doesn't report it" (show "—").

```js
gamelink = {
  v: 1,
  game: 'cs2',              // or a companion's game id: /^[a-z][a-z0-9]{1,23}$/ ('nms', 'pc2', 'factorio' …)
  source: 'prism-sight',    // companions only: who posted it
  at: 1791659453700,        // receipt time of the last payload that changed anything (a post that only plants the bomb doesn't count)
  rev: 41,                  // bumps on every change (memo key; facets shouldn't need it)
  status: 'live',           // 'menu' | 'loading' | 'live' | 'spectating' | 'between' | 'watching' (companions also 'paused')
  player: {                 // OUR player only — never the one we spectate. null in the menu, loading, watching
    fresh: true,            // false: our last known values while spectating / between rounds (draw dimmed)
    alive: true,
    team: 'CT',             // 'CT' | 'T' | null (companions: any short string)
    health: 73, armor: 91,  // 0–100 | null
    helmet: true,           // boolean | null
    flashed: 0,             // 0–1, follows the game down; rises only in a strike (≤ 1 a second); held through silence (see Flash); 0 unless fresh
    smoked: 0, burning: 0,  // 0–1; 0 unless fresh
    money: 850, equip: 4700,// $ | null (equip = the value of what we carry)
    activity: 'playing',    // 'playing' | 'menu' | 'textinput' (our UI: menu = the pause menu) | null
  },
  weapon: {                 // the gun in hand, or null (dead, spectating, nothing reported)
    name: 'm4a1_silencer',  // 'weapon_' stripped; ASCII
    kind: 'rifle',          // 'knife' | 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'mg' | 'sniper' | 'grenade' | 'c4' | 'taser' | 'other'
    clip: 4, clipMax: 20,   // guns only, else null — show the clip prominently
    reserve: 3,             // since CS2's 2026-03-18 update: spare MAGAZINES for most guns
    reserveUnit: 'mags',    // 'mags' | 'shells' (tube-fed shotguns) | 'count' (grenades; a gun's reserve > 10, plainly rounds) | null (Negev, M249, R8, CZ75: unit unverified) — show the reserve only when 'mags'
    reloading: false,
    low: true,              // clip ≤ max(1, clipMax / 4) and not reloading
  },
  stats: { kills: 9, assists: 1, deaths: 4, mvps: 2, score: 21, roundKills: 2, roundHs: 1 },   // ours; null fields when unknown
  round: {                  // null outside a round (warmup has no round, the menu has none)
    phase: 'live',          // 'freezetime' | 'live' | 'over'
    number: 7,              // 1-based current round (the round just played while 'over')
    bomb: null,             // 'planted' | 'defused' | 'exploded' | null — A STATE. There is no plant time and no fuse.
    win: null,              // 'CT' | 'T' | null (who won the round)
    result: null,           // 'win' | 'loss' | null (for us)
    reason: null,           // how it was won, once over: 'elimination' | 'bomb_defused' | 'bomb_exploded' | 'time' | 'rescue' | 'other' | null
  },
  match: {                  // null in the menu
    map: 'de_inferno', title: 'Inferno', mode: 'competitive',
    phase: 'live',          // 'warmup' | 'live' | 'intermission' (halftime) | 'gameover' | …
    side: 'CT',             // ours | null
    ct: 4, t: 2,            // side-labelled scores (they swap at halftime)
    us: 4, them: 2,         // ours vs theirs | null
    target: 13,             // wins needed (Competitive 13, Wingman 9, Casual 8; +3 in overtime) | null
    matchPoint: null,       // 'us' | 'them' | 'both' | null
    result: null,           // 'win' | 'loss' | 'draw' | null (gameover)
  },
  events: [                 // newest last, at most 16, none older than 10 s
    { type: 'kill', at: 1791659456300, seq: 23, headshot: true, roundKills: 2 },
  ],
  cs2: {                    // the per-game sub-object: gamelink[gamelink.game] (companions: their `detail`)
    defuseKit: true, hasC4: false,
    grenades: { flashbang: 1, smoke: 0, he: 0, molotov: 0, incendiary: 0, decoy: 0 },
  },
}
```

| status | means | face |
|---|---|---|
| `menu` | CS2 is in the main menu | idle / "In menu" |
| `loading` | joining a map | "Loading" |
| `live` | our own frames (alive or just died) | the HUD and the effects |
| `spectating` | we died and watch a teammate (from about 3 s after death) | a dimmed **SPECTATING** face with our last values; never the teammate's vitals |
| `between` | round over while we're dead (no player node) | as spectating |
| `watching` | GOTV, a demo, the spectator team: not our game — also a demo or GOTV of your OWN view, recognized by the spectator-only data inside components we subscribe to (`player.state.round_totaldmg`, `player.position` / `forward` / `spectarget`); verify live | "Not your match" (no effects) |
| `paused` | companions only | dimmed |

### Events

Each is `{ type, at, seq, …fields }` — except `bombPlanted`, which never appears in `events` (see the bomb row). The first post the listener ever sees (a plugin start, Listen just turned on) is a baseline: it gives `context` only, never the plant, round win or gameover it merely describes. Several can share one payload (a kill and a hurt; the final kills inside the gameover post); `kill` always comes before `multiKill`, and `hurt` before `death`. The plugin pushes the frame at once, with priority, for the effect events (`URGENT_EVENTS`).

| type | fields | when |
|---|---|---|
| `context` | `value`: 'menu' / 'loading' / 'live' / 'observing' / 'between' / 'watching' | the status changed (`observing` = spectating) |
| `resync` | | a full-state post after a gap or a listener restart: the baseline reset silently, no other events |
| `matchJoined` | `map`, `mode` | a new map or mode |
| `mapPhase` | `value` | warmup / live / intermission / gameover |
| `halftime` | | `map.phase` → intermission |
| `sideSwap` | `from`, `to` | our team changed (halftime) |
| `roundStart` | `round` | freezetime began |
| `roundLive` | | the round started |
| `roundWon` · `roundLost` | `winTeam`, `reason` (as `round.reason`, from `map.round_wins`; `roundReason()` maps CS2's `ct_win_defuse` → `bomb_defused`, `t_win_bomb` → `bomb_exploded`, `*_win_elimination` → `elimination`, `*_win_time` → `time`, `ct_win_rescue` → `rescue`, anything else → `other`) | the round ended (also inside the gameover post) |
| `matchPoint` | `us`, `them` (booleans) | at round start |
| `gameover` | `result` (`null` when our side is unknown), `us`, `them` | the match ended |
| `bombPlanted` · `bombDefused` · `bombExploded` · `bombGone` | | `round.bomb` edges (`bombGone`: the round ended another way). **No timer**: `planted` is a steady alarm state (a pulse at a fixed rate); `defused` / `exploded` are one-shot effects. `bombPlanted` is never in `events` (no `at`, no `seq`, and a plant-only post keeps `state.at`): no facet can tell when the plant arrived — read `round.bomb` |
| `hurt` | `damage`, `health` | our health fell |
| `death` | `inferred?` | our health hit 0 (or we switched to spectating mid-round) |
| `respawn` | | 0 → alive outside a new round (Deathmatch, warmup) |
| `flashOnset` | `strength` 0–1 | `flashed` crossed 12% from below. At most one strike (`flashOnset` / `flashFull`, or the value rising again) a second; a strike held back by that is applied when the second is up |
| `flashFull` | | `flashed` crossed 98% |
| `flashClear` | `peak` 0–1, `timeout?` | back to 0 (`timeout`: the safety clear, below) |
| `kill` | `headshot`, `roundKills` | one per kill |
| `multiKill` | `count`, `label`: double / triple / quad / ace | after the kill (not in Deathmatch) |
| `teamKill` · `mvp` | | `teamKill`: kills −1 while alive, not a stats reset (warmup → match) or a suicide |
| `money` | `delta`, `money` | buys (negative) and rewards |
| `weaponSwitch` · `reloadStart` · `reloadEnd` | `weapon` | |
| `lowAmmo` | `clip`, `clipMax`, `reserve` | the clip went low (edge) |
| `emptyClip` · `lastMag` | | |

Companions send their own event types (`/^[a-z][a-zA-Z0-9]{0,31}$/`, up to 8 scalar fields); facets ignore types they don't know.

### Rules for facets

- **Read** `ctx.data.gamelink`: absent → `simGameLink(ctx.t)` with `nowMs = ctx.t × 1000`; `null` → the waiting face; else the state with `nowMs = ctx.now`. Effects come from events: `age = (nowMs − ev.at) / 1000`. Quantize it (and the intensity, about 8 levels), and return to the plain HUD frame, byte-identical, once the effect is over.
- **No bomb timer, ever**: no countdown, no 10 s / 5 s defuse marks, nothing whose intensity grows with time since the plant. The source makes it structural: no facet-visible field tells when the plant arrived (`test/gamelink-cs2.test.js` replays two plants at different times and gets identical views). Don't keep your own memory of when `round.bomb` turned `planted` either.
- **Flash follows the game**: draw `player.flashed`. It never rises between strikes (at most one a second), so a stream that dips and comes back can't make a stateless facet flicker. Silence while flashed is not "flash over": the value holds until a newer payload (every post, CS2's 5 s heartbeat included, refreshes the hold), and clears by itself after 6.5 s without a post or 7.5 s without a change (a stuck stream), once: the timed-out value stays masked, so its fade or a repeated heartbeat never whitens the deck again.
- **Motion**: `ctx.motion` is `'full' | 'calm' | 'still'`. Calm = soft effects; Still = static state only (no flash wash, no pulse; a "Planted" label). Default the facet's `effects` param to `soft`; `full` is opt-in. One flash onset a second at most (the normalizer already enforces it), no full-field saturated red.
- **Spectating**: `player.fresh === false` → draw our last values dimmed. The state never contains the observed player's vitals.
- **Privacy**: there are no names or ids in the state (they're dropped at the edge). Don't add any.
- `null` fields → "—". Companion games may report no health, money or rounds at all.

### The listener (`gamelink.js`)

- **Lifecycle**: one per plugin process, created by `createNodeHub()` (`hub.gameLink`; `gamelink: false` or `PRISM_DECK_GAMELINK=off` leaves it out). It binds `127.0.0.1` only while the global `gamelink.enabled` is on (the PI's **Listen for game data** toggle, default off; **Connect CS2** turns it on too); off = no socket at all. Nothing is read or written before that. Listening doesn't depend on CS2: companions work with CS2 absent, and Disconnect (CS2) leaves the toggle alone.
- **Port**: 38140; if that fails (`EADDRINUSE` / `EACCES`, e.g. a Windows excluded range) 38141–38149. The fallback that worked is persisted (and tried first next time, so an installed cfg keeps working); binding a fallback re-checks the cfg once (read-only), so it reads **out of date** in the PI by itself until Connect CS2 is clicked again. The PI can pin a port (globals `gamelink.port`); clearing it goes back to 38140.
- **Keep-alive**: 30 s (CS2 reuses one socket and heartbeats every 5 s; Node 20, which the plugin runs on, closes exactly at the timeout). **Listen off → on**: nothing is live until a new post arrives; the old state is only the baseline it is compared with.
- **`gamelink.json`** beside `control.json` (`%APPDATA%\Prism\deck\`; `PRISM_DECK_GAMELINK_DIR` overrides the folder), written atomically, dir 0700 / file 0600 on POSIX (on Windows `%APPDATA%` is the user's own):
  `{ v: 1, plugin, api: 1, port, baseUrl, tokens: { cs2, companion } (64 hex each), pid (null while off), version, startedAt }`. Companions read `port` and `tokens.companion` and must parse it as strictly as `parseGameLinkFile` does. Disconnect rotates `tokens.cs2`. A rename blocked by a reader (Windows EPERM) is retried for ~0.5 s; if it still fails no `.tmp` is left, the old token stays, and Disconnect answers `ok: false` (`state-write-failed`).
- **Every request**: `Host` exactly `127.0.0.1:<port>` (else 421), no `Origin` header (403), a known route (404).
- **`POST /v1/cs2`**: always **204**, answered before parsing. Bad input is dropped silently and counted in `status().refused` (`type`, `size` > 64 KiB, `json`, `token` = `auth.token`, `appid` ≠ 730, `rate`): an error reply makes CS2 resend in a hot loop.
- **`POST /v1/companion`** (its push is urgent only for effect events, `URGENT_EVENTS`): `Authorization: Bearer <tokens.companion>` (401), ≤ 50 requests/s (429), `application/json` (415), ≤ 256 KiB (413), valid JSON and body (400), else `200 {}` (`{ duplicate: true }` for a repeated `(session, seq)`). Body:
  `{ v: 1, source, game, session, seq, sentAt, state?: { status, player, weapon, stats, round, match, detail }, events?: [{ type, at, … }] }`. The first batch of a game must carry `state`; `detail` becomes `gamelink[game]` (plain JSON, depth ≤ 3). Events the adapter held for more than 3 s are dropped.
- **`GET /v1/health`** (Bearer companion): `{ ok, api, game, lastAt }`. Never the state.
- Payloads, Steam ids, names and tokens are never logged and never in `status()`.

```bash
node --test test/gamelink-cs2.test.js test/gamelink-source.test.js test/gamelink-cfg.test.js test/gamelink-plugin.test.js
```
