# Changelog

All notable changes to Prism. Package versions and the design-token version are listed with each release. Token-level changes to the design language are logged separately in [`design/CHANGELOG.md`](./design/CHANGELOG.md).

## Refraction — 2026-10-15

*White light in. Every color out.* Prism drops its AWS Cloudscape look for **Refraction**, a design language of its own, and ships to three surfaces: Web, Terminal and the new Stream Deck catalog.

| Package | Version |
|---|---|
| Design tokens (`design/tokens.json`) | 1.2.1 |
| `prism-term` | 0.2.0 |
| `prism-deck` | 0.2.0 (engine API 1.4) |
| Prism Deck plugin (`com.jeremyfhall.prism`) | 0.3.0.0 |
| `prism-mcp-server` | 1.1.0 |

### Highlights

- **Refraction, Prism's own design language.** Two separately art-directed modes: **Prism Night** (`prism-dark`), ink-navy glass lit from inside, and **Prism Day** (`prism-light`), pearl paper with an iridescent sheen. They are the new default. The spec, tokens and generators are in [`design/`](./design).
- **A spectrum as the accent system.** One OKLCH ramp, violet to rose. Every gallery owns a hue and a wavelength label (`λ 436`) in the sidebar's spectral index, and each surface owns one too.
- **First Light.** A load moment of at most 1.6 s: a beam crosses the dark screen, strikes the prism and paints the app in. It never blocks input, ends on any key or click, and plays in full once per session. Theme switching relights the page with a beam sweep.
- **Three surfaces.** Web (`Prism.html`), Terminal (`prism-term`) and the new **Stream Deck** catalog (`prism-deck`) share tokens, hues, icons and labels. A surface switcher in the top bar moves between them.
- **Custom icons and bundled type.** A hairline icon family on a 24 px grid replaces every emoji in the chrome. Inter 400, 600 and 700 are bundled; still no network requests.

### Web (`Prism.html`)

- New shell: glass top bar with the surface switcher (`Web | Terminal | Stream Deck`), the design-system picker and a **Night | Day** switch; a sidebar with the spectral index (*Library*, *Galleries · 18*, *Surfaces*); gallery headers with instrument eyebrows (`01 / CHARTS & METRICS · 214 FACETS · λ 436`) and a spectral ruler.
- **Command palette** (`Ctrl K` / `⌘K`): every facet, gallery and command, including *Switch to Day/Night*, *Use the … skin*, *Replay First Light*, *Replay animations on this page*, *Reduce motion*, *Copy a link to this page* and *What's new in Refraction*.
- **What's new in Refraction**: a one-time introduction after First Light, reopened from the sidebar footer or the palette.
- **New Terminal and Stream Deck pages**, running the real `prism-term` and `prism-deck` engines inside the file, fully offline.
- **46 new facets** drawn in the Refraction idiom, across 14 galleries (spectral KPIs, beam sweeps, caustics, refract-in motion, prism toggles, spectral command palettes and more). The web catalog now holds **2,714** facets.
- **A third JSON island**, `#prism-deck-catalog`, after the web and terminal islands.
- **Reduced motion everywhere:** `prefers-reduced-motion`, or *Reduce motion* in the palette, turns First Light into a fade and removes sweeps, glints and loops in the chrome.
- Text meets WCAG 2.2 AA in both modes (517 automated contrast checks in `design/tools/contrast.mjs`).

### Terminal (`prism-term`)

- **Prism Night and Prism Day** terminal themes, tuned for truecolor, 256 and 16 colors and for light and dark terminals. They are the new default (`prism-dark`), bringing the theme count to 24.
- **Day/Night auto-detect:** `PRISM_TERM_THEME`, then `COLORFGBG`, then a bounded OSC 11 background query, in interactive runs only. Pipes, files and CI stay deterministic.
- **`d` flips Day ↔ Night** in the catalog browser and the live player; **`--day` / `--night`** pick the mode of any theme family.
- **`prism-term theme <format>`** prints Prism Night / Day color schemes for 11 terminal emulators (Windows Terminal, iTerm2, Alacritty, kitty, WezTerm, Ghostty, foot, GNOME Terminal, Konsole, Xresources and the VS Code terminal). The same files are in `prism-term/themes/`.
- **Refraction chrome in cells:** the beam, the spectral index with λ labels, glass frames, a terminal First Light (`--no-intro` or `PRISM_TERM_INTRO=0` skips it) and a prism wipe between facets. `--reduced-motion` / `PRISM_REDUCED_MOTION=1` turn off the intro, wipes and sweeps.
- **Restyled curl site:** balanced tones that read on dark and light terminals, the beam and spectral index on every page, and 7-bit `.txt` pages with the same structure.
- New `prism` and `prism-ink` palettes (Refraction's spectrum); the old rainbow is now `neon`.
- The grammar is documented in [`prism-term/docs/refraction-terminal.md`](./prism-term/docs/refraction-terminal.md).

### Stream Deck (`prism-deck`, new)

- A zero-dependency engine and catalog: **159 facets** in 7 galleries (Themes, Icons, Motion, Spans, Dials & Strips, Screens, Apps), **11 themes** in Night and Day, **56 glyphs**, **30 devices**, including the Corsair Galleon 100 SD, Stream Deck + and Stream Deck + XL.
- Deterministic SVG for keys, spans of keys (including the gaps behind the bezel), dial segments, touch strips, screens and whole devices, with a raster backend for PNG/GIF and raw hidraw.
- **The Prism Deck plugin** (`com.jeremyfhall.prism.streamDeckPlugin`) for the Stream Deck app 7.6+ on Windows and macOS: the **Prism Facet** and **Prism Info Bar** actions, a live property inspector, a shared frame budget and live audio levels.
- **Icon packs** (`com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack`, one per theme, 240 icons each) and **profiles** (`Prism - <Device>.streamDeckProfile`) for the Galleon 100 SD, Stream Deck +, MK.2, XL, Mini and Neo.
- **Live apps:** an audio waveform across keys, a spectrum analyzer, VU dials, a system monitor, clocks and timers, media and meeting controls, and Galleon dashboards and widgets.
- **Linux:** the plugin runs unchanged in OpenDeck; `prism-deck export` writes OpenDeck profiles and StreamController page bundles; **Prism Deck Direct** is a zero-dependency hidraw driver for every model, with a udev rule (`linux/60-prism-deck.rules`); audio sources for PipeWire, PulseAudio and ALSA.
- **Prism Deck Live:** an opt-in, loopback-only channel that lets a paired AI assistant restyle Prism's own keys. It is off by default, needs a press on the physical deck to pair, and can't run programs or press hotkeys.
- Docs: [`prism-deck/README.md`](./prism-deck/README.md), [`docs/plugin.md`](./prism-deck/docs/plugin.md), [`docs/linux.md`](./prism-deck/docs/linux.md), [`docs/authoring.md`](./prism-deck/docs/authoring.md), [`docs/devices.md`](./prism-deck/docs/devices.md).

### MCP server (`prism-mcp-server`)

- The theme registry follows Refraction: Prism Night is the base theme, so `get_component_variants`, `get_variants_for_theme` and `get_theme_palette` report each skin's overrides against Prism Night instead of Cloudscape Dark.
- `get_token_reference` and the island's `tokens.css` now carry Prism Night values. The `--rf-*` Refraction layer is available on request.
- **24 new Stream Deck tools, 58 in all.** They read the `#prism-deck-catalog` island and drive the `prism-deck` engine:
  - **Catalog (7):** `deck_list_galleries`, `deck_list_facets`, `deck_search_facets`, `deck_get_facet`, `deck_list_themes`, `deck_list_glyphs`, `deck_list_devices`.
  - **Render, layouts, export (9):** `deck_render` (PNG and/or SVG), stored and revisioned layout documents (`deck_layout_create`, `_get`, `_list`, `_update`, `_validate`, `_delete`) for keys, spans, dials and screens, and `deck_export_profile` / `deck_export_iconpack`, which write only to the path they are given and never install anything.
  - **Live (8):** `deck_live_status`, `deck_live_pair`, `deck_live_set_key`, `deck_live_set_dial`, `deck_live_batch`, `deck_live_apply_layout`, `deck_live_snapshot`, `deck_live_undo`. They work through the Prism Deck plugin's loopback channel, only while the user has switched on **Allow AI editing** and paired on the device.
- New options: `--deck-catalog`, `--deck-engine`, `--deck-layouts` and `--deck-control`.
- Guidance for running next to Elgato's own Stream Deck MCP: [`prism-mcp-server/README.md`](./prism-mcp-server/README.md#coexisting-with-elgatos-stream-deck-mcp).

### Website

- [prism.jeremyfhall.com](https://prism.jeremyfhall.com) and the app now match: the landing page and `/terminal/` are restyled in Refraction, with the same tokens, bundled Inter, the brand mark and λ eyebrows. A new *One family. Three surfaces.* section introduces Web, Terminal and Stream Deck.
- **New `/deck/` page.** The Stream Deck catalog on virtual devices, where every key runs live and responds to presses. It links downloads for the plugin, every icon pack and every profile (`/deck/dl/…`), plus the Linux routes.
- The build copies `prism-deck/plugin/dist/` to `/deck/dl/`, and it fails if the deck catalog, its island or the downloads are missing or stale.

### Migration notes

- **Your saved theme.** If you last used Prism on its old Cloudscape default, your choice moves once to Prism Night or Prism Day, in the same mode, the first time you open this version. After that, Prism leaves your choice alone. Pick Cloudscape again from the design-system picker and it stays.
- **First visit** follows your system's light or dark setting.
- **The other skins are still there.** Cloudscape, Duolingo, Mailchimp, Stack Overflow, Monzo, Heroku, Shopify Polaris, GitHub Primer, Ant Design, Firefox Acorn and Material Design 3 remain in the design-system picker, each in dark and light. All theme ids from the previous release still exist.
- **Copied snippets.** Facets read the same contract tokens as before (`--bg`, `--ink`, `--accent`, `--info`, `--pos` …), so markup you copied earlier keeps working. The default `tokens.css` now carries Prism Night values; to keep the old colors, use the Cloudscape Dark tokens (`get_theme_palette`, or the Variant Matrix page).
- **prism-term.** The default theme is now `prism-dark` (Prism Day on light terminals). Pass `--theme cloudscape-dark` or set `PRISM_TERM_THEME=cloudscape-dark` for the old look.
- **Hosted copy.** `Prism.html` is larger, because it now bundles Inter 700, the icon family and the Stream Deck catalog. It still makes no network requests.

### Breaking changes

None.

- `window.PrismShell` keeps every method of the previous release (`pages`, `go`, `openSearch`, `themeMatrix`, `setTheme`, `getTheme`) with the same behavior. New: `current`, `families`, `setMode`, `toggleMode`, `setFamily`, `replayFirstLight`, `replayAnimations`, `reduceMotion`, `showIntro`, `toast`, `eyebrow` and `counts`.
- The theme contract is unchanged: every theme still defines the tokens facets read.
- The web island keeps its schema; no facet ids were removed or renamed. The terminal island keeps schema 2.
- `prism-term` keeps every export of the previous release and adds `detectTheme`, `exportTheme`, `terminalScheme` and related helpers.
