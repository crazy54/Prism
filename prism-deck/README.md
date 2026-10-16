# prism-deck

**Prism, on your Stream Deck.** The Stream Deck catalog and the engine that draws it: icons, themes, motion and live apps for every Stream Deck, from the Mini to the Stream Deck + and + XL, plus the Corsair Galleon 100 SD. Zero dependencies, Node ≥ 18, ESM, browser-safe.

Version <!--n:version-->0.7.0<!--/n--> (plugin <!--n:pluginVersion-->0.7.0.0<!--/n-->). The numbers below are rewritten from the package on every plugin build (`scripts/doc-counts.mjs`).

- **<!--n:facets-->210<!--/n--> facets** in <!--n:galleries-->8<!--/n--> galleries: Themes, Icons, Motion, Spans, Dials & Strips, Screens, Apps and Games.
- **<!--n:themes-->11<!--/n--> themes**, each in Night and Day: Prism, Aurora, Blueprint, Chrome, Ember, Mono, Neon, Paper, Phosphor, Pixel and Porcelain.
- **<!--n:glyphs-->56<!--/n--> glyphs**. Every glyph renders in every theme.
- **<!--n:devices-->30<!--/n--> devices**, from the hardware research ([`docs/devices.md`](./docs/devices.md)).

Facets render as **deterministic SVG** in a strict SVG subset, so a frame looks the same in the Stream Deck app, in any browser and through the raster backend (hidraw devices, PNG and GIF exports). Text is drawn as paths from the Inter outlines in Prism.html, so nothing depends on installed fonts.

- **Glyphs × themes.** Icons are 48-unit geometry drawn through semantic roles (`line fill accent dim spark`). Themes are materials that paint them.
- **Surfaces.**
  - `key`: native px per device, 72 to 160 (Studio 144 × 112).
  - `span`: a block of keys, including the physical gaps, sliced per key.
  - `strip`: the Stream Deck + / + XL touch strip, or one 200 × 100 dial segment.
  - `screen`: the Galleon 100 SD's 720 × 384 screen, or the Neo info bar (232 × 50).
  - `deck`: the whole panel.
- **Every device.** All 30 models are covered, including the Corsair Galleon 100 SD, Stream Deck + and + XL.

## Getting started

Prism Deck ships as three kinds of files. You install each one by double-clicking it (on Linux, see [below](#linux)).

| File | What it is |
|---|---|
| `com.jeremyfhall.prism.streamDeckPlugin` | The plugin. It adds the **Prism Display** action (keys and dials) and **Prism Info Bar** (Stream Deck Neo). Prism Display is visual: it shows a facet. It can also open a web page or switch profile when pressed, and nothing else. |
| `com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack` | One icon pack per theme (<!--n:packs-->11<!--/n-->: `prism`, `aurora`, `blueprint`, `chrome`, `ember`, `mono`, `neon`, `paper`, `phosphor`, `pixel`, `porcelain`). Each covers <!--n:packStates-->240<!--/n--> glyph states (every glyph and its states, Night and Day). States that move are animated GIFs, each listed with its still PNG; the rest are static SVGs. Give them to any Stream Deck action. |
| `Prism - <Device>.streamDeckProfile` | <!--n:profiles-->7<!--/n--> ready-made profiles: `Prism - Galleon 100 SD`, `Prism - Stream Deck +`, `Prism - Stream Deck + XL`, `Prism - Stream Deck MK.2`, `Prism - Stream Deck XL`, `Prism - Stream Deck Mini` and `Prism - Stream Deck Neo`. Page 1, **Home**, is built from Stream Deck's own actions (media, volume, screen snip, desktop, files, clipboard, the Prism site) in Prism art, so every key does what it shows. The live Prism facets are on the **Showcase** pages. |
| `com.jeremyfhall.prism.opendeck.streamDeckPlugin` | The same plugin for OpenDeck on Linux (adds `manifest.linux.json`). |

**Get the files** from [prism.jeremyfhall.com/deck/](https://prism.jeremyfhall.com/deck/), which links every one of them:

- the plugin: [`/deck/dl/com.jeremyfhall.prism.streamDeckPlugin`](https://prism.jeremyfhall.com/deck/dl/com.jeremyfhall.prism.streamDeckPlugin), and for OpenDeck [`/deck/dl/com.jeremyfhall.prism.opendeck.streamDeckPlugin`](https://prism.jeremyfhall.com/deck/dl/com.jeremyfhall.prism.opendeck.streamDeckPlugin)
- icon packs: `/deck/dl/iconpacks/com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack`, for example [the Prism pack](https://prism.jeremyfhall.com/deck/dl/iconpacks/com.jeremyfhall.prism.icons.prism.streamDeckIconPack)
- profiles: `/deck/dl/profiles/Prism - <Device>.streamDeckProfile`, for example [Galleon 100 SD](https://prism.jeremyfhall.com/deck/dl/profiles/Prism%20-%20Galleon%20100%20SD.streamDeckProfile)

Or build them from a clone:

```bash
cd prism-deck
node scripts/build-plugin.mjs        # → plugin/dist/com.jeremyfhall.prism.streamDeckPlugin + …opendeck.streamDeckPlugin
node scripts/build-iconpacks.mjs     # → plugin/dist/iconpacks/ (one pack per theme) + plugin/dist/profiles/ (one profile per device)
```

`build-iconpacks.mjs` takes `--theme prism,neon` for just some packs, `--no-profiles` to skip the profiles, and `--out <dir>` to write elsewhere. Neither script installs anything.

### Windows and macOS (Stream Deck app)

You need the Stream Deck app **7.6 or later** on Windows 10/11 or macOS 13 or later. The plugin runs on the app's bundled Node 20 and needs no other software.

1. **Install the plugin.** Double-click `com.jeremyfhall.prism.streamDeckPlugin` and confirm in the Stream Deck app.
   - The action list gets a **Prism Deck** category with **Prism Display** and **Prism Info Bar**.
   - The app then offers the **Prism · <device>** sample profiles (a second question: click **Install Profile(s)**). It never switches you to one; pick it from the profile list when you want it.
2. **Add icon packs (optional).** Double-click any `com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack`. Its icons appear in a key's icon menu under **Icon Library**. Animated icons are GIFs and animate when you pick them; each also has a still PNG. This is how you give a working action (Multimedia, Hotkey, Website…) Prism art.
3. **Import a profile (optional).** Double-click a `Prism - <Device>.streamDeckProfile`, or use **Preferences → Profiles → Import**. Profiles need the plugin; if it's missing, the app offers to install it.
4. **Put a facet on a key.** Drag **Prism Display** onto a key or a dial. The property inspector shows a live preview. Pick a facet, a theme (Night or Day) and a motion level (*Full*, *Calm* or *Still*). Under **On press** you can make it open a web page or switch profile. Keys whose data is simulated (a demo calendar, an invented playlist) show a small **DEMO** tag on the device. Set your own calendar file under **Plugin settings → Data sources**.

On Windows the app keeps its files in `%APPDATA%\Elgato\StreamDeck\` (`Plugins\`, `IconPacks\`, `ProfilesV3\`, `logs\`). You never need to copy anything there by hand.

**Uninstall:** Preferences → Plugins → Prism Deck → Uninstall. Delete the sample profiles under Preferences → Profiles if you don't want them.

For spans across keys, dials and the touch strip, Galleon widgets, plugin settings (update budget, live audio, image format) and troubleshooting, see [`docs/plugin.md`](./docs/plugin.md).

### Linux

The Stream Deck app doesn't run on Linux, but Prism Deck does. Details for every route are in [`docs/linux.md`](./docs/linux.md).

| Route | Install | Gets you |
|---|---|---|
| **OpenDeck** (recommended) | OpenDeck → **Plugins** → *Install from file* → `com.jeremyfhall.prism.streamDeckPlugin`, or the Linux build `com.jeremyfhall.prism.opendeck.streamDeckPlugin`. Needs Node ≥ 20 on the host, also for the Flatpak. | Everything live: animated keys, spans, dials, the touch strip, the Neo info bar and the audio apps. OpenDeck doesn't support the Galleon yet. |
| **StreamController** | Page menu → **Import** → a `.scpage` (one page) or `.zip` (several pages) from `prism-deck export streamcontroller`. Or rename an icon pack to `.zip` and import it as a custom icon pack. | Prism key art as native pages, static or as GIF loops. |
| **Prism Deck Direct** | Install the udev rule, then run `prism-deck hid run`. Zero dependencies, no host app. | Every model, including the **Galleon 100 SD**: full-panel art, waveforms across keys and the strip. |

Where OpenDeck keeps things:

| | Native | Flatpak (`me.amankhanna.opendeck`) |
|---|---|---|
| Plugin | `~/.config/opendeck/plugins/com.jeremyfhall.prism.sdPlugin/` | `~/.var/app/me.amankhanna.opendeck/config/opendeck/plugins/…` |
| Profiles | `~/.config/opendeck/profiles/<device-id>/` | `~/.var/app/me.amankhanna.opendeck/config/opendeck/profiles/…` |
| Plugin log | `~/.local/share/opendeck/logs/plugins/com.jeremyfhall.prism.sdPlugin.log` | `~/.var/app/me.amankhanna.opendeck/data/opendeck/logs/…` |

StreamController keeps its data in `~/.var/app/com.core447.StreamController/data/`, even for native installs. `prism-deck export linux-paths --home /home/you` prints all of these for your machine.

OpenDeck can't import `.streamDeckProfile` files, so Prism writes OpenDeck's own profile format, and StreamController gets page bundles:

```sh
prism-deck export opendeck --sample plus --device-id sd-YOURSERIAL --plugin plugin/dist/com.jeremyfhall.prism.streamDeckPlugin
prism-deck export streamcontroller --sample mk2 [--format png] [--animate]
```

Output goes to `./prism-linux-export/` (or `--out <dir>`). Nothing is installed for you; each command prints its copy steps. Samples: `galleon`, `plus`, `mk2`, `xl-2022`, `mini-2022` and `neo`.

For **Prism Deck Direct**, install the udev rule once (the file name must sort before `73`):

```sh
sudo install -m 0644 linux/60-prism-deck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --action=change
prism-deck hid doctor       # checks access, the rule, python3 and other deck apps; opens nothing
prism-deck hid run          # the only deck present, default layout, theme prism (Ctrl-C stops)
```

The Galleon 100 SD also needs `python3` (standard library only) for its keep-alive. See [HID](./docs/linux.md#hid-direct-driver-udev).

### AI live editing (off by default)

With **Allow AI editing** switched on in the plugin settings, an assistant connected through Prism's MCP server ([`prism-mcp-server`](../prism-mcp-server)) can change how **Prism's own keys and dials look**: glyphs, facets, themes, titles, dial feedback or a whole layout page. It can't run programs, press hotkeys, type, open URLs, switch profiles or touch other plugins' keys.

1. **Switch it on.** Open any Prism key's property inspector and turn on **Allow AI editing** under *Plugin settings*. While it's off, nothing listens and no file is written.
2. **Connect the assistant.** Add Prism's MCP server to your assistant (for Claude Code: `claude mcp add prism -- node /ABS/PATH/prism/prism-mcp-server/cli.js start --catalog /ABS/PATH/prism/Prism.html`; other clients are in the [root README](../README.md#3-connect-it-to-a-client)). The plugin listens on `127.0.0.1` only, on a random port with a fresh 256-bit token each time, and writes both to a per-user file that the server finds on its own:
   - Windows: `%APPDATA%\Prism\deck\control.json`
   - macOS: `~/Library/Application Support/Prism/deck/control.json`
   - Linux: `$XDG_STATE_HOME/prism/deck/control.json`
   - `PRISM_DECK_CONTROL` (or the server's `--deck-control <file>`) overrides the location.
3. **Approve it on the device.** When the assistant asks to pair (`deck_live_pair`), the top-left Prism key on each physical deck glows with **ALLOW AI?**, a 4-digit code and *Hold to allow*. If you asked for it, **press and hold** the key for 1.5 s, until its ring is full, within 2 minutes; a tap never approves, and the key never shows the name the assistant gives itself (the property inspector quotes it). Keys on virtual decks (the MCP Deck, the Virtual Stream Deck, Stream Deck Mobile) can never approve, because an assistant could press those itself.
4. **Revoke any time.** Use **Deny** or **Revoke** in the property inspector. Switching AI editing off closes the listener, deletes `control.json`, revokes the pairing and removes every AI edit.

Every change can be undone (50 steps) and is logged, without tokens or image data, to `audit.jsonl` next to `control.json`. AI edits live only while the plugin runs; they are never written into your profiles. The full security model is in [`docs/plugin.md`](./docs/plugin.md#ai-live-editing-prism-deck-live).

**What the assistant uses.** The MCP server has 24 deck tools. The design-time tools need no plugin and no pairing: `deck_list_*`, `deck_search_facets` and `deck_get_facet` browse the catalog, `deck_render` previews a facet or a layout page as PNG or SVG, `deck_layout_*` edits stored layouts (keys, spans, dials, screens), and `deck_export_profile` / `deck_export_iconpack` write files for you to double-click. The live tools (`deck_live_status`, `deck_live_pair`, `deck_live_set_key`, `deck_live_set_dial`, `deck_live_batch`, `deck_live_apply_layout`, `deck_live_snapshot`, `deck_live_undo`) need the steps above. Details: [`prism-mcp-server/README.md`](../prism-mcp-server/README.md).

## In code

```js
import { render, findFacet } from 'prism-deck';

const frame = render(findFacet('span-waveform'), { device: 'plus', theme: 'prism', t: 1.5 });
frame.svg;                 // the whole canvas
frame.keys[0].svg;         // what key 0 shows (the gaps between keys are hidden pixels)
```

Add `mode: 'light'` for Day. Output is deterministic for the same time, state, parameters, seed and theme. To draw virtual devices in a page, see [`src/web/README.md`](./src/web/README.md).

## CLI

```bash
node cli.js list                                              # the catalog (--gallery, --surface, --json)
node cli.js search waveform                                   # find a facet
node cli.js info span-waveform                                # one facet's record
node cli.js render span-waveform --device plus --out out/     # whole canvas + per-key slices as SVG
node cli.js render theme-prism --device galleon --out out/    # whole deck + per-key / per-dial / screen slices
node cli.js devices                                           # every model (also: themes, glyphs)
npm test                                                      # conformance: every facet × theme × mode × target
node scripts/shoot.mjs --devices galleon,plus,mk2,xl,mini --facet theme-prism --out shots/   # contact sheet
```

Run `npm link` in this folder for a global `prism-deck` command. `shoot.mjs` takes its screenshots with headless Chrome through a snap tool (set `SNAP` to its path); `--html-only` writes just the HTML page.

## Docs

| Read | For |
|---|---|
| [`docs/authoring.md`](./docs/authoring.md) | the contract: glyphs, themes, facets, surfaces, the scene API, the SVG subset |
| [`docs/devices.md`](./docs/devices.md) | every device, its surfaces and gotchas (generated) |
| [`docs/plugin.md`](./docs/plugin.md) | the plugin, icon packs and profiles: install, use, settings, AI live editing, troubleshooting |
| [`docs/linux.md`](./docs/linux.md) | OpenDeck, StreamController, Prism Deck Direct (hidraw) and audio |
| [`src/web/README.md`](./src/web/README.md) | the browser runtime (virtual devices, offline island loader) |
| [`docs/ASSIGNMENTS.md`](./docs/ASSIGNMENTS.md) | who built which themes, glyphs, galleries and apps |

The key grammar (safe area, type sizes at 72 and 144 px, the state language) comes from Refraction, Prism's design language: see [`design/README.md`](../design/README.md#stream-deck-prism-deck).

## Generated files

Don't edit these by hand:

| File | Regenerate with |
|---|---|
| the `src/devices.js` data block | `npm run devices` |
| `src/scene/fonts/*` | `npm run fonts` |
| `src/scene/tokens.js` | `npm run sync-tokens` |
| `src/facets/manifest.js`, `src/themes/_manifest.js`, `src/glyphs/_manifest.js` | `npm run facets:manifest` |
| `catalog/deck-catalog.json` | `npm run catalog` |
| the `#prism-deck-catalog` island in Prism.html | `npm run island -- --html ../Prism.html` (with no flags, it writes the island part file for the Prism.html parts build) |

`devices:check`, `fonts:check`, `facets:check`, `catalog:check` and `island:check` exit non-zero when their output is stale.

Inter is © The Inter Project Authors (SIL Open Font License 1.1).
