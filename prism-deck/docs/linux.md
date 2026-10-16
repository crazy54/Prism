# Prism Deck on Linux

Prism Deck reaches Linux three ways:

| Route | What you get | Devices | Section |
|---|---|---|---|
| **OpenDeck** + the Prism plugin | everything live: animated keys, spans, dials, touch strip, Neo info bar, audio apps | every Elgato model OpenDeck drives (no Studio, no Galleon yet) | [OpenDeck](#opendeck) |
| **StreamController** page bundles | Prism key art as a native page (static, or GIF loops) | everything StreamController drives (no Galleon) | [StreamController](#streamcontroller) |
| **Prism Deck Direct** (zero-dependency hidraw driver) | full-panel art, waveforms across keys + strip, the Galleon 100 SD | every model | [HID](#hid-direct-driver-udev) |

The live audio apps (waveform across keys, spectrum analyzer, VU dials) take their levels from
[Audio](#audio) on every route that runs Prism's own code (OpenDeck, Direct).

This file is shared: the **HID** sections belong to the Deck Linux Engineer — HID; **Audio** and
**Linux apps** belong to the Deck Linux Engineer — audio & Linux apps. Keep edits inside your markers.

<!-- ═══════════════ BEGIN: HID (owner: Deck Linux Engineer — HID) ═══════════════ -->

## HID: direct driver, udev

**Prism Deck Direct** (`prism-deck hid`, `src/hid/`) drives every Elgato Stream Deck with keys and
the Corsair Galleon 100 SD through `/dev/hidrawN` with nothing but `node:fs` (Node ≥ 18): no host
app, no npm dependencies. Rendering is the same as everywhere else — facet → `render()` →
`src/raster` (`rasterize`, `encodeKeyImage`) → reports on the wire. Byte layouts come from the
research (`research/linux.md` §2, cross-checked against python-elgato-streamdeck 0.10.0 and
node-elgato-stream-deck 7.8.0) and are pinned by golden byte arrays in `test/hid.test.js`.
It is opt-in and refuses any deck another app is using.

### Supported hardware

| Family | Models (USB `0fd9:` unless noted) | Key image on the wire | Extra surfaces | Input |
|---|---|---|---|---|
| 2017 original | `0060` | 72 px BMP, mirrored; keys right-to-left; 8191-byte reports (Linux ≥ 5.6) | — | keys |
| Mini family | Mini `0063` / `0090`, Mini Discord `00b3`, Module 6 `00b8` | 80 px BMP, rotated 90° | — | keys |
| 15-key gen 2 | 2019 `006d`, MK.2 `0080`, Scissor `00a5`, Module 15 `00b9` / `00e4` | 72 px JPEG, 180° | — | keys |
| XL | XL `006c` / `008f`, Module 32 `00ba` | 96 px JPEG, 180° | — | keys |
| Neo | `009a` | 96 px JPEG, 180° | info bar 248×58 | keys + 2 touch sensors |
| Stream Deck + | `0084` | 120 px JPEG | touch strip 800×100 (4 × 200×100) | keys, 4 dials, tap / long press / flick |
| Stream Deck + XL | `00c6` | 112 px JPEG, 90° CCW | touch strip 1200×100 (6 segments) | keys, 6 dials, touch |
| Studio | `00aa` | 144×112 JPEG | ring + knob LEDs | keys, 2 dials, NFC |
| Pedal | `0086` | — | — | 3 pedals (`hid events` only) |
| **Corsair Galleon 100 SD** | `1b1c:2b18`, USB interface 0 only | 160 px JPEG | screen 720×384 (4 widgets of 360×192) | 12 keys, 2 dials |

### Install

1. **The udev rule** — lets the logged-in user open the hidraw nodes. systemd ≥ 251 covers only
   some models (Ubuntu 24.04 still misses the + and the Neo; nothing covers the Studio, + XL,
   modules, Scissor, Mini Discord or the Galleon), so install ours:

   ```sh
   sudo install -m 0644 linux/60-prism-deck.rules /etc/udev/rules.d/      # or: prism-deck hid udev > 60-prism-deck.rules
   sudo udevadm control --reload-rules
   sudo udevadm trigger --subsystem-match=hidraw --action=change
   ```

   The number must sort **before 73**: `73-seat-late.rules` turns the `uaccess` tag into the ACL, so a
   later file (e.g. `99-…`) silently grants nothing. The rule is generated from the model table
   (`prism-deck hid udev`), lists each USB id (never all of Corsair), and is additive with OpenDeck's and
   Boatswain's rules. Headless / service accounts: replace `TAG+="uaccess"` with `GROUP="plugdev"`
   (Debian/Ubuntu) or a group you create (`sudo groupadd --system streamdeck`) and add the user to it.
   Flatpak apps need `--device=all` for hidraw and can't install host rules.

   **The Galleon is also a keyboard.** `1b1c:2b18` exposes several hidraw nodes, and the keyboard's
   nodes carry every raw keystroke, so the rule never grants the whole USB id. It has two stages because
   `idVendor`/`idProduct` live on the USB device, `bInterfaceNumber` lives on the USB interface, and all
   `ATTRS` keys of one udev rule must match on the same ancestor:

   ```udev
   KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1b1c", ATTRS{idProduct}=="2b18", GOTO="prism_deck_galleon"
   GOTO="prism_deck_galleon_end"
   LABEL="prism_deck_galleon"
   KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{bInterfaceNumber}=="00", MODE:="0660", TAG+="uaccess"
   LABEL="prism_deck_galleon_end"
   ```

   Only interface `00` (the Stream Deck) reaches your user; the keyboard nodes stay root-only. Check each
   Galleon node with `getfacl /dev/hidrawN` and `udevadm info -a /dev/hidrawN | grep bInterfaceNumber`.
   Discovery refuses the other interfaces too: a node must be interface 0 according to both `HID_PHYS`
   (`…/input0`) and the sysfs `bInterfaceNumber`, so `hid run --path` cannot select a keyboard node.
   If you installed an earlier copy of this file (one line per USB id), reinstall it.
2. **python3** (stdlib only; preinstalled on most desktops) for HID *feature* reports, through
   `linux/prism-deck-hidfeature.py` (~200 lines, meant to be read). Node can't call `ioctl()`, and
   brightness, the firmware logo and the Galleon's keep-alive are feature reports. Without python3
   everything works except hardware brightness (dimmed in software instead) and **the Galleon, which
   can't be driven at all** — it ignores every command until it gets a keep-alive every 500 ms.
3. **Check**: `prism-deck hid doctor` — platform, kernel, read/write access per node, rule installed
   (and current), python3 + fcntl, other deck apps running. It opens nothing. It exits 0 when at least
   one deck can be driven and 1 when nothing can work (no deck, no access, or not Linux: on Windows and
   macOS it says so and skips the Linux checks). Every `prism-deck` command exits 2 on a usage error
   (unknown command, target or subcommand) and 1 on a runtime failure.

### Use

```sh
prism-deck hid list                                    # decks found: /dev/hidrawN, model, serial, who holds them
prism-deck hid run                                     # the only deck present, default layout, theme prism (Ctrl-C stops)
prism-deck hid run --model galleon --mode dark --brightness 70
prism-deck hid run --serial A00WA1234567 --keys icon-mic,icon-volume,-,app-cpu-ring --dials dial-volume,dial-volume
prism-deck hid run --model plus --span span-waveform@0,1 --strip strip-refraction --audio   # live waveform (see Audio)
prism-deck hid run --layout my-deck.json
prism-deck hid events                                  # input events as JSON lines (diagnostics)
prism-deck hid bench --seconds 3                       # reports/s this deck + USB port sustain
prism-deck hid run --dry-run --model plus              # no device: render + encode into memory, print the budget
```

Select a deck with `--path /dev/hidrawN`, `--serial` or `--model <devices.js id>` (needed only when
several are plugged in). A layout names a facet for each part of the deck (`src/hid/layout.js`):

```json
{
  "theme": "prism", "mode": "dark",
  "spans": [{ "facet": "span-waveform", "col": 0, "row": 1, "cols": 4, "rows": 1 }],
  "keys": ["icon-mic", "icon-volume", null, { "facet": "app-focus-timer", "state": 0, "params": {} }],
  "dials": ["dial-volume", "dial-volume", "dial-volume", "dial-volume"],
  "screen": "screen-galleon-dashboard",
  "widgets": { "0,1": "<a galleon-widget facet>" }
}
```

`deck` (one whole-panel facet) wins over `spans`, spans over `keys`; `strip` (one facet across the
strip) or per-segment `dials` on the + / + XL; `screen` (whole Galleon screen) or per-widget
`widgets` (`"dial,layer"`) on the Galleon; on the Neo `screen` is the info bar, rendered at the SDK's
232×50 and centered in the 248×58 window as the Stream Deck app does. Without a layout: icons on the
keys, volume dials on the strip, the dashboard on the Galleon screen, the clock on the Neo info bar.

### Input → facet state

| Hardware | What the facet sees (`ctx`) |
|---|---|
| key down / up | `pressed`, `pressKey` (spans / deck), `pressedFor`; on release `nextState()` per the facet's `press` rule, `since` restarts, `pressAge` counts |
| dial turn | `ticks`, `value` (± 1/48 per tick, 0–1), `values[]`, `turnAge` |
| dial press | a press on the dial's segment / widget |
| + / + XL strip | `touch: { x, y, hold, age }` on the segment under the finger; tap = press + release, long press = `hold`, flick = value change |
| Galleon: dial held 3 s | switches which widget layer that dial controls (the Stream Deck app's gesture); a white underline marks the active widget |
| Neo touch sensors | press the info-bar facet |

`--audio [monitor|mic]` feeds `ctx.data.audio` / `ctx.data.spectrum` from `src/audio` at 15 Hz. From
code, `runner.setData({ cpu: 0.4, … })` (shapes as in authoring.md §7) re-renders what reads it.

### Pacing

Animated facets tick at their `fps`, capped by `--fps-cap` (default 10, the deck token). Still facets
render only when something changes, plus a 1.2 s burst after an interaction so press feedback and
transitions animate; facets that read the clock refresh at 1 fps; `--reduced` renders stills only.
Frames are deduped three times: identical slice SVG (API 1.2 slices are byte-identical when a key
didn't change) skips the raster, identical pixels skip the encode and write, and a frame still
waiting is replaced by a newer one (latest wins, never a backlog). Reports go out through a token
bucket (`--budget` reports/s; default 1500, Galleon 3000 — half of the one community measurement).
Measure yours with `hid bench` and use about half. Dry-run cost of the default layouts on a dev box:
the + ≈ 450 reports/s at 10 fps, the Galleon ≈ 660/s.

### Coexistence and safety

- **Refuses a claimed deck (`EBUSY`).** hidraw has no exclusive open, so before opening, Prism Deck
  checks `/proc/*/fd` for any process holding the node (no override), takes a per-deck lock file
  (other Prism Deck processes, any user; stale locks of dead processes are reclaimed), and refuses
  while OpenDeck, StreamController, Companion, streamdeck-linux-gui, Boatswain or galleon-deck runs
  (`--force` overrides only this heuristic, for an app that drives a different deck).
- **Documented reports only.** Every output report is checked before `write()` — key images `0x01`
  `0x07`, info bar `0x0B`, regions `0x0C`, Studio LEDs `0x0F` `0x10`, the zero-filled reset — one
  report per `write()`, serialized, never coalesced or interleaved. The python helper has its own
  allowlist (brightness, logo, color fills, sleep timer, Galleon keep-alive and ring pixels, with zero
  padding; GETs for serial / firmware / unit info only), opens nothing but `/dev/hidrawN` character
  devices, and never sends firmware or vendor commands. The test suite keeps both allowlists identical.
- **Leaves the deck tidy.** On exit the firmware logo (helper) or black keys (`--keep` leaves the last
  frame). The Galleon needs nothing: when the keep-alive stops — the helper exits with its stdin, even
  if Node crashes — it returns to its standalone numpad / volume mode.
- Unplug → `EIO` → the runner stops cleanly and releases the lock.

### Troubleshooting (HID)

| Symptom | Fix |
|---|---|
| `[EACCES] no permission to open /dev/hidrawN` | install the rule (above) and replug; `getfacl /dev/hidrawN` should list your user |
| `[EBUSY] … is already open by opendeck [1234]` | quit that app (its tray icon too); hidraw can't be shared |
| `[ENOHELPER] Corsair Galleon 100 SD ignores every command …` | install python3 (`python3 -c "import fcntl"` must work) |
| `[ENODEV] no supported deck found` | `ls /sys/class/hidraw`; the Galleon must be on its primary USB cable |
| `[EAMBIGUOUS] several decks match` | add `--serial` (from `hid list`) |
| keys flicker | another app is writing too: `hid doctor` lists them |

### Not yet verified on hardware

Byte-checked against both libraries, round-trip tested (encode → reports → reassemble → decode →
upright, every family), dry-run on every model — but not yet run on a physical deck. To confirm in the
first hardware session (the owner's Galleon 100 SD and Stream Deck +): the Galleon's PID / interface 0,
keep-alive timing, region writes and the 4-widget split, ring LED indices (node's mapping); the Mini's
orientation (libraries' byte order vs Elgato's "rotate 90° clockwise"; check with an asymmetric glyph);
+ XL strip region headers in logical coordinates (Elgato + node; python disagrees); real reports/s per
model; whether the default sleep timer blanks a streaming deck; Studio key size (node 144×112, python
80×120). The full-LCD command `0x08` is built and tested but unused (Elgato docs only).

### From code

```js
import { listDecks, selectDeck, HidDeck, resolveLayout, defaultLayout, createRunner } from 'prism-deck/src/hid/index.js';
const info = selectDeck(listDecks(), { model: 'plus' });          // throws ENODEV / EAMBIGUOUS
const deck = await HidDeck.open(info);                             // throws EBUSY / EACCES / ENOHELPER
const run = createRunner(deck, resolveLayout(deck.model, defaultLayout(deck.model)), { theme: 'prism' });
await run.start();                                                 // run.handle(ev), run.setData(patch), await run.stop()
await deck.close();
```

Lower level: `packets.*` (pure report builders), `features.*`, `createInputParser(model)`,
`deck.setKey(i, img)` / `deck.setLcd(img, rect)` with `img = { data: RGBA, w, h }` upright,
`memoryTransport()` (a fake `/dev/hidraw*` for tests and `--dry-run`), `sniffReports()` (reports back
into images).

<!-- ═══════════════ END: HID ═══════════════ -->

<!-- ═══════════════ BEGIN: LINUX APPS (owner: Deck Linux Engineer — audio & Linux apps) ═══════════════ -->

## Linux apps

Both exporters take the same *setup* as the Elgato profile exporter (`src/export/profile.js`
`SAMPLE_LAYOUTS` / `buildProfile`): `{ device, name, pages: [{ name, keys: [{ col, row, settings }], dials: [{ dial, layer, settings }], infobar }] }`,
where `settings` are the Prism Display action settings (`{ facet, theme, mode, params, group, state, value }`).
MCP layout documents (`prism-deck-layout/0.1`) work too. Exports are byte-reproducible.

```sh
prism-deck export opendeck         --sample plus --device-id sd-YOURSERIAL --plugin plugin/dist/com.jeremyfhall.prism.streamDeckPlugin
prism-deck export streamcontroller --sample mk2  [--format png] [--animate]
prism-deck export streamcontroller --layout my-setup.json
prism-deck export linux-paths      [--home /home/you] [--json]
```

Output goes to `./prism-linux-export/` (or `--out`); nothing is installed for you — the command
prints the copy steps. Exported file names are ASCII-only (`Prism - Stream Deck + - Prism.json`), so they
survive any locale, shell and zip tool. `linux-paths` follows `XDG_CONFIG_HOME` / `XDG_DATA_HOME` for a
native OpenDeck (absolute values only, as the XDG spec says; the Flatpak sandbox sets its own); with
`--home` it describes that account's default locations instead. (The `export opendeck|streamcontroller|linux-paths` and `audio detect|meter`
subcommands are handled by `src/export/linux-cli.js`; `cli.js` dispatches to it.) Samples: `galleon plus mk2 xl-2022 mini-2022 neo` (other models of the
same grid fall back to these). From code: `src/export/linux-opendeck.js`, `src/export/linux-streamcontroller.js`.

### OpenDeck

[OpenDeck](https://github.com/nekename/OpenDeck) runs stock Elgato Node plugins **unchanged**, on
the system `node` (≥ 20), on the host — even from its Flatpak (`flatpak-spawn --host node`). So the
Linux plugin *is* the Elgato plugin, `com.jeremyfhall.prism`.

**Install OpenDeck**: Flathub `me.amankhanna.opendeck` · Arch `extra/opendeck` (AUR `opendeck-git`) · `.deb` / `.rpm` / AppImage from its GitHub releases. Install Node ≥ 20 on the host (`node --version`), also for the Flatpak.

**Install the Prism plugin**: OpenDeck → **Plugins** → *Install from file* →
`com.jeremyfhall.prism.opendeck.streamDeckPlugin` (from `prism-deck export opendeck --plugin …`) or the plain
`com.jeremyfhall.prism.streamDeckPlugin`. Either way it unpacks to:

| | native | Flatpak |
|---|---|---|
| plugin | `~/.config/opendeck/plugins/com.jeremyfhall.prism.sdPlugin/` | `~/.var/app/me.amankhanna.opendeck/config/opendeck/plugins/…` |
| profiles | `~/.config/opendeck/profiles/<device-id>/<Profile>.json` | `~/.var/app/me.amankhanna.opendeck/config/opendeck/profiles/…` |
| plugin log | `~/.local/share/opendeck/logs/plugins/com.jeremyfhall.prism.sdPlugin.log` | `~/.var/app/me.amankhanna.opendeck/data/opendeck/logs/…` |

The `.opendeck` bundle adds `manifest.linux.json` (OpenDeck merges `manifest.<os>.json` over the
manifest as a JSON merge patch; the Elgato app ignores it): `OS` → `linux`, so OpenDeck runs
`bin/plugin.js` natively and never considers Wine, and the info-bar action also lists OpenDeck's
`Infobar` controller (the Neo info-bar slot) — *unverified on hardware*.

**Profiles.** OpenDeck can't import `.streamDeckProfile` files and ignores a plugin's bundled
profiles, so `export opendeck` writes OpenDeck's own profile JSON (format verified against
`store/simplified_profile.rs`): `{ keys: [instance|null] (rows × cols + touch points), sliders: [instance|null] (dials), infobars: [...] }`,
one profile per page, each Prism slot an instance of the `com.jeremyfhall.prism.facet` action with
its settings, plus a still of its art (a `data:` SVG, shown until the plugin draws; `--images none|png`).
To use it: quit OpenDeck, `ls ~/.config/opendeck/profiles/` to find your device id (`sd-<serial>`),
copy the exported `profiles/<id>/*.json` into that folder, start OpenDeck, pick the profile.
Spans work as in the Elgato app: adjacent keys with the same multi-key facet and span group draw as one block.

**Detecting Linux.** OpenDeck reports `platform: "windows"` in `-info`. Never trust that field:
the plugin and the audio sources use `process.platform`.

**Not in OpenDeck**: `setTriggerDescription`, `switchToProfile`, `getResources` (the plugin skips
them), the Studio, and the Galleon 100 SD (waiting on rust-elgato-streamdeck PR #63 — use
Prism Deck Direct or Companion for the Galleon today).

### StreamController

[StreamController](https://github.com/StreamController/StreamController) (Flathub
`com.core447.StreamController`; AUR `streamcontroller`) doesn't run Elgato plugins, but it imports
self-contained **page bundles**. `export streamcontroller` writes one:

- one page → `<Name>.scpage`; several → `<Name>.zip` (one StreamController page per Prism page)
- `manifest.json` (`format: streamcontroller-page(s)`, `version: 1`, every asset with its sha256),
  `page.json` / `pages/<page>.json`, `assets/<sha256>.svg|png|gif`
- keys at `keys["<col>x<row>"].states["0"].media` (`fill-mode: cover`), dials at `dials["<n>"]`
  (drawn on that dial's + touch-strip segment, `contain`)

Import: StreamController → page menu → **Import** → the file. Assets are copied into
StreamController's asset manager; the bundle can be deleted afterwards. Its data lives in
`~/.var/app/com.core447.StreamController/data/` even for native installs.

Images: SVG by default (StreamController renders it with CairoSVG; our SVG is outlines only — no
fonts needed). `--format png` rasterizes with `src/raster`. `--animate` exports GIF loops of animated
key facets (≤ 16 fps: StreamController treats GIF frame delays under 50 ms as centiseconds and would
play them 10× slow); dials stay still (StreamController doesn't play GIFs on dials yet).

What StreamController can't show: live data (the waveform and spectrum keys are frozen at a
representative instant), the Neo info bar, and the Galleon. For live apps use OpenDeck.

### Other apps

- **Companion** (Bitfocus) is the only Linux app that drives the Galleon 100 SD today; a Prism
  Companion module is future work.
- **Boatswain**, **streamdeck-linux-gui**: assign loose images per button — use `prism-deck render <facet> --out dir/`
  or unzip an icon pack.

### Troubleshooting (apps)

| Symptom | Fix |
|---|---|
| OpenDeck: "Node.js version 20.0.0 or higher is required" | install Node ≥ 20 on the host (`node --version`), restart OpenDeck |
| OpenDeck: the Prism keys vanish from an imported profile | the plugin folder must be `plugins/com.jeremyfhall.prism.sdPlugin` — OpenDeck drops instances whose plugin folder is missing. Install the plugin first, then copy the profile |
| OpenDeck: profile doesn't show up | wrong device folder: copy into `profiles/<your sd-serial>/`, with OpenDeck closed |
| OpenDeck: keys stay on the still image | the plugin isn't running: check the plugin log (table above) |
| StreamController: GIF keys crawl | re-export (Prism caps GIFs at 16 fps); third-party GIFs under 20 ms/frame trip its centisecond heuristic |
| No access to the deck (both apps) | the udev rule — see [HID](#hid-direct-driver-udev) |

<!-- ═══════════════ END: LINUX APPS ═══════════════ -->

<!-- ═══════════════ BEGIN: AUDIO (owner: Deck Linux Engineer — audio & Linux apps) ═══════════════ -->

## Audio

`src/audio/` turns what you hear (or a microphone) into **levels and bands only** — in memory,
never recorded, never written anywhere — for `ctx.data.audio` and `ctx.data.spectrum`. Zero
dependencies; never needs root; nothing to install beyond a tool your desktop already has.

```js
import { createAudioSource } from 'prism-deck/audio';     // = src/audio/index.js
const audio = createAudioSource({ input: 'monitor' });   // 'monitor' = what you hear (default) · 'mic'
await audio.start();                                    // resolves in ≤ 8 s: live, standby (bridge) or simulated
const data = audio.snapshot();                          // { audio, spectrum } — cheap, cached per hop
await audio.stop();
```

```sh
prism-deck audio detect            # which backends work here, and the exact command each would run (probes only)
prism-deck audio meter --seconds 5 # a terminal meter from the best backend
```

### Backends and the order they're tried

| Platform | Order (`backend: 'auto'`) | System audio ("what you hear") |
|---|---|---|
| Linux | **parec** → **pw-record** → **arecord** → **ffmpeg** → synthetic | parec / pw-record: yes (default-sink monitor); arecord: best effort |
| Windows | **ffmpeg** (dshow) → **browser bridge** → synthetic | ffmpeg only with a loopback device (Stereo Mix, a virtual cable); bridge: Chrome/Edge "Share system audio" |
| macOS | **ffmpeg** (avfoundation) → **browser bridge** → synthetic | only through a loopback device (BlackHole); bridge: a tab's audio |

Every backend writes raw mono s16le at 16 kHz to a pipe:

```sh
parec -d @DEFAULT_MONITOR@ --raw --format=s16le --rate=16000 --channels=1 --latency-msec=10 --client-name="Prism Deck" --stream-name=Levels
stdbuf -o0 pw-record --raw --format s16 --rate 16000 --channels 1 --latency 20ms -P '{ stream.capture.sink = true }' -
arecord -q -t raw -f S16_LE -r 16000 -c 1 -D default --buffer-time=100000 --period-time=20000 -      # + PULSE_SOURCE / PIPEWIRE_ALSA hints
ffmpeg -hide_banner -loglevel error -nostdin -f dshow -audio_buffer_size 20 -i "audio=Stereo Mix (…)" -vn -ac 1 -ar 16000 -f s16le -flush_packets 1 pipe:1
```

- **parec** first: unbuffered, ~20 ms chunks, and `@DEFAULT_MONITOR@` works on PulseAudio *and*
  PipeWire's pulse server (the line verified live in the research). `pactl subscribe` restarts the
  capture when the default output changes, so the waveform follows your headphones.
- **pw-record**: `--raw` exists only from PipeWire 1.3.81 (`pw-record --version` decides; unknown →
  no `--raw` and the stream is sniffed for an AU/WAV header); stdout needs ≥ 0.3.52; it buffers stdout
  in 4 KiB blocks, so it runs under `stdbuf -o0`, or at 48 kHz when `stdbuf` is missing.
- **arecord** on pure ALSA has no monitor: you get the default input. Through the sound server's
  ALSA plugin the monitor hints apply.
- **ffmpeg** is used only if you installed it. It has no WASAPI input: Windows system audio needs a
  DirectShow loopback device; Prism never silently picks a microphone when you asked for system audio.
- **Flatpak sandboxes**: a host binary runs through `flatpak-spawn --host`. (OpenDeck's Flatpak already
  runs the plugin on the host.)

**No hangs**: every probe has a timeout (a stuck tool is killed), detection has a 5 s deadline,
each backend must deliver audio within its start timeout (2.5 s; ffmpeg 5 s), `start()` resolves
within `deadlineMs` (8 s) no matter what. A capture that dies is restarted with backoff
(250 ms → 4 s); three quick failures in a row fail over to the next backend; a stall (no audio for
4 s) is treated as a crash; gaps scroll as silence. `stop()` sends SIGTERM, then SIGKILL after 1.5 s,
and resolves regardless. Children are also killed on process exit, and die on their own (EPIPE) if
the plugin is killed.

**Simulated fallback**: with no live backend the source serves a deterministic synthetic groove
(same seed → same numbers) and re-checks every 30 s. Pass `fallback: false` to get `null` instead
(the apps hub then uses its own simulation, identical to the facets' built-in fallback).

### The browser bridge (Windows / macOS without a capture tool)

The source starts a server on `127.0.0.1` (random port) and reports `info().bridge.url`
(`http://127.0.0.1:<port>/#<token>`); the runtime opens it with the host's `openUrl` — Prism never
opens a browser itself. The page asks for a microphone (`getUserMedia`) or a screen share with
system audio (`getDisplayMedia`, Chrome/Edge on Windows), meters it in an AudioWorklet (the same
FFT and band code as the plugin) and sends ~70 bytes of levels 30 times a second. Audio never
leaves the page. Until the page connects (and whenever it goes quiet) the source is in *standby*
and serves the simulated groove.

Locked down: localhost only; `Host` must be `127.0.0.1:<port>`/`localhost:<port>` (DNS-rebinding);
the WebSocket `Origin` must be the page's own; a random 144-bit token travels in the URL fragment
(never in a request) and comes back as a WebSocket subprotocol, compared in constant time; one
client at a time; masked frames ≤ 16 KiB, ≤ 120 per second; strict CSP (`script-src 'self'`).
Linux browsers can't see sink monitors (Chromium skips them), so on Linux the bridge is opt-in (`bridge: true`).

### Data shapes

`audio.snapshot()` returns exactly the shapes `src/apps/sources/README.md` documents:

| key | shape |
|---|---|
| `audio` | `{ level` 0–1 meter (smoothed peak, dB scale, −60 dBFS → 0)`, levels` number[] waveform envelope (per-hop peaks, **oldest first**, linear with a gentle auto-gain, fixed length = `historySeconds × historyRate`, prefilled with silence)`, rate` levels per second`, peak, rms }` |
| `spectrum` | `{ bands` number[] 0–1 low → high (log-spaced 40 Hz – 12 kHz or Nyquist, smoothed, dB scale −72 dB → 0, +1.5 dB/oct display tilt)`, peaks` number[] falling caps`, centers` Hz[] `}` |

Options: `historySeconds` (4), `historyRate` (30), `bands` (16), `minHz`, `maxHz`, `levelsScale: 'db'`,
`agc: false`, `tiltDb: 0` — top-level or under `analyzer`. The source also speaks the apps-hub
interface (`id`, `provides`, `running`, `mode`, `rate`, `status()`), and `retain()` / `release()`
ref-count it (capture starts on first use and stops `idleMs` after the last).

Testing without audio: `src/audio/fake.js` (`fakeSystem`, `FakeChild`, behaviors `tone()`, `hang()`,
`exitWith()`, `stallAfter()`, `lines()`) + `manualClock()` from `src/audio/system.js`.

### Audio setup per distro family

Check what you run: `pactl info | grep "Server Name"` (PulseAudio, or "PulseAudio (on PipeWire …)").

| Family | Sound server (default) | Install for Prism (one of) | Notes |
|---|---|---|---|
| Fedora (≥ 34), RHEL 9+ | PipeWire + pipewire-pulse | `sudo dnf install pulseaudio-utils` (parec) · `pipewire-utils` (pw-record) | pw-record ≥ 1.4 on Fedora 42/43 (`--raw`) |
| Ubuntu ≥ 22.10, Debian 12+ (GNOME), Mint 22 | PipeWire + pipewire-pulse | `sudo apt install pulseaudio-utils` (parec) · `pipewire-bin` (pw-record) | Ubuntu 24.04 ships PipeWire 1.0 (pw-record without `--raw`; handled) |
| Ubuntu 22.04 and older, Debian 11 | PulseAudio | `sudo apt install pulseaudio-utils` | parec is usually already installed; 22.04's PipeWire 0.3.48 pw-record can't write to a pipe — parec is used |
| Arch, Manjaro, EndeavourOS | PipeWire (or PulseAudio) | `sudo pacman -S libpulse` (parec) · `pipewire` (pw-record) | |
| openSUSE Tumbleweed / Leap 15.5+ | PipeWire | `sudo zypper install pulseaudio-utils` · `pipewire-tools` | |
| Fedora Silverblue / Kinoite | PipeWire | `rpm-ostree install pulseaudio-utils` or a toolbox | |
| ALSA only (no sound server) | — | `alsa-utils` (arecord) | no "what you hear" without `snd-aloop`; Prism captures the default input |
| SteamOS (desktop mode) | PipeWire | pw-record ships with PipeWire | read-only root: use what's there (or a distrobox) — *unverified* |

Nothing here needs root at run time; capture runs as you, through your session's sound server.

### Troubleshooting (audio)

| Symptom | Check / fix |
|---|---|
| keys show the simulated groove | `prism-deck audio detect` — each backend says why it was skipped |
| `parec: Connection refused` | no sound server for this user/session (headless service? run the plugin in your desktop session) |
| waveform moves in jerks with pw-record | install `stdbuf` (coreutils) — or Prism captures at 48 kHz to shorten pw-record's 4 KiB blocks |
| flat line although music plays | the default output moved and the tool didn't follow: with parec Prism restarts on `pactl subscribe` events; otherwise pick the device: `createAudioSource({ device: '<sink>.monitor' })` (`pactl list short sources`) |
| Windows: ffmpeg skipped "no loopback capture device" | enable *Stereo Mix* (Sound settings → Recording), install a virtual cable, use the bridge, or pass `input: 'mic'` |
| macOS: microphone permission errors | the host app needs microphone permission; for system audio install BlackHole and route output through a Multi-Output Device |
| bridge page: "That share has no audio" | Windows: choose *Entire screen* and tick *Share system audio*; macOS/Linux browsers share tab audio only |
| Flatpak host app can't find parec | the source falls back to `flatpak-spawn --host parec`; the app needs `--talk-name=org.freedesktop.Flatpak` |

What's verified: the parec line live (research), the bridge end to end in headless Chrome with
Chrome's fake audio device, every command line, parser and failure path against fake binaries
(`test/audio.test.js`). Not yet run on a real Linux desktop: pw-record's `--raw` split and buffering,
arecord's monitor hints, the ffmpeg dshow/avfoundation lines.

<!-- ═══════════════ END: AUDIO ═══════════════ -->
