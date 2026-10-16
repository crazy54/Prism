# Prism Deck — assignments (proposal from the architect)

Targets: **≥ 8 themes (aim 10)**, **≥ 50 glyphs (aim 56)** that render in every theme, motion built for the hardware, live apps, every device in `docs/devices.md`. Read `docs/authoring.md` first; it is the contract. Ship nothing that isn't great — look at every contact sheet in both modes on the Galleon, +, MK.2, XL and Mini.

## Themes + motion — 5 designers, 2 themes and one gallery each

The signature theme `prism` (Refraction) belongs to the Lead Designer. Ten more materials, each distinct in material, role painting, type and press — not recolors.

| designer | themes (`src/themes/<id>.js` + `src/facets/themes/<id>.js`) | gallery | facets to build (≈ 6–8 each) |
|---|---|---|---|
| D1 | `neon` — glass tubes on black, roles glow, a press re-strikes the gas · `ember` — warm dark, coals and amber light | `motion/` press + transitions (`press-*`, `state-*`) | press: sink, refract, bloom, shutter; transitions: crossfade, morph, flip, iris |
| D2 | `pixel` — 8-bit, glyphs through `helpers.pixelate`, LCD grid · `phosphor` — green CRT, scanlines, persistence (kin to prism-term) | `motion/` idle + alerts (`idle-*`, `alert-*`) | idle: breathe, orbit, shimmer, tick; alerts: pulse, siren, shake, countdown |
| D3 | `aurora` — soft flowing gradients, frosted keys · `blueprint` — white linework on blue grid, dimension marks | `spans/` (`span-*`) | marquee text, spectrum bars across keys, ripple from a press, progress across a row, clock across keys, life, rain |
| D4 | `chrome` — machined metal, bevel and extrusion · `porcelain` — glossy white ceramic, cobalt accents (light) | `dials/` (`dial-*`, `strip-*`) | volume arc, value bars, gauge, scrubber, color wheel, EQ strip, timeline strip |
| D5 | `paper` — ink on warm paper, letterpress (light) · `mono` — maximal contrast black/white, accessibility-first | `screens/` (`screen-*`) | Galleon dashboards (media, meeting, system, weather), Neo info-bar variants, + strip dashboards |

Every theme: both modes where it makes sense (one is fine), the palette contrast test passing, a custom `background`, at least two role effects, its own `press`, and bespoke overrides for 2+ glyphs where the material calls for it.

## Glyphs — 3 icon designers, 56 total (8 exist)

Draw on the 48-unit grid, safe area 6–42, roles not colors, named states with tones, transitions on `since`, seamless idle loops. One `src/facets/icons/<id>.js` line per glyph.

| icon designer | categories | glyphs (✓ = exemplar exists) | new |
|---|---|---|---|
| I1 | media · audio · stream | media: play-pause ✓, stop, record, skip-next, skip-prev, shuffle · audio: mic ✓, volume ✓, headphones, equalizer, music-note, mixer, waveform · stream: broadcast ✓, camera, scene, chat, marker, viewers | 15 |
| I2 | system · status · dev | system: cpu ✓, memory, disk, gpu, network, wifi, battery · status: power ✓, check, alert, info, lock, sync · dev: terminal, code, git-branch, bug, rocket, cloud | 17 |
| I3 | time · nav · productivity · home | time: clock ✓, timer, stopwatch, calendar, alarm · nav: home, back, folder, pages, search · productivity: mail, note, target, coffee · home: bulb ✓, fan, thermostat, plug | 16 |

Stateful glyphs to prioritize (they carry the most motion): record (armed/recording), camera (on/off), lock (locked/unlocked), wifi (strength by level), battery (charge by level, charging), sync (idle/syncing), timer (running), alarm (ringing). No trademarks or lookalikes (generic broadcast, chat bubble, music note).

## Apps (apps engineer) — `src/apps/**`, `src/facets/apps/`

Compose facets + data sources; every app runs simulated when no source is wired.

1. **Audio waveform across keys** — `span-waveform` wired to `ctx.data.audio` (levels ring buffer from the audio source).
2. **Spectrum analyzer** — bars across a row (span) and a single-key version; `ctx.data.spectrum.bands`.
3. **System monitor** — CPU / memory / GPU / network / disk keys (`app-cpu-ring` is the reference), a + strip dashboard, a Galleon widget set.
4. **Clocks & timers** — world clock, stopwatch, countdown, focus timer (`app-focus-timer` is the reference), a clock that spans keys.
5. **Galleon 100 SD dashboard** — `screen-galleon-dashboard` wired to live sources, with per-layer widget routing.
6. **Neo info bar** — clock / now-playing / next meeting.
7. **Now playing + media controls**, **meeting controls** (mic/camera/hand/leave), **scene switcher** for streaming.

## Engineers (handoffs)

| role | builds on | first steps |
|---|---|---|
| Plugin | `render()` slices, `nextState`, `scene/scheduler.js`, `deviceFromInfo`, `svgDataUrl`; `docs/devices.md` (setImage ≤ 10/s guidance, 200×100 encoder layouts, Galleon dial layers) | one `Prism Facet` action (Keypad + Encoder), PI generated from facet `params`, per-device update budget with frame dedupe, raw WebSocket client (Node 20 lacks a global WebSocket) |
| Raster | `scene/validate.js` subset, `scene/geom.js` (parse/flatten/winding) | rasterize the subset; PNG/GIF/JPEG/BMP encoders; golden tests against Chrome |
| Web (deck catalog) | `src/web/` (reference DeckView / KeyView), `scene/device-view.js` | `/deck/` page and `pg-deck`, island-driven offline loading |
| Linux HID / audio | `deckLayout`, `render()` → raster | hidraw writers per family, audio sources feeding `ctx.data.audio` |
| Pipeline | `scripts/build-catalog.mjs`, `scripts/embed-island.mjs` | island part `parts/island-prism-deck-catalog.html` after the terminal island |
| MCP | `catalog/deck-catalog.json` (schema 2 + `sources`) | list/search/render deck facets, edit layouts/buttons/knobs |
