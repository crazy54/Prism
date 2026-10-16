# Prism Deck for Stream Deck: plugin, icon packs, profiles

Prism Deck puts the whole Prism Deck catalog on real hardware: animated, themed keys, art that spans across neighboring keys, touch-strip panoramas, and live widgets on the Corsair Galleon 100 SD screen. It ships three kinds of files. You install each one by double-clicking it.

| File | What it is | Where it comes from |
|---|---|---|
| `com.jeremyfhall.prism.streamDeckPlugin` | The plugin (version <!--n:pluginVersion-->0.7.0.0<!--/n-->): the **Prism Display** action (keys and dials) and **Prism Info Bar** (Stream Deck Neo) | `plugin/dist/` (`node scripts/build-plugin.mjs`) |
| `com.jeremyfhall.prism.opendeck.streamDeckPlugin` | The same plugin for OpenDeck on Linux (adds `manifest.linux.json`) | `plugin/dist/` (same script) |
| `com.jeremyfhall.prism.icons.<theme>.streamDeckIconPack` | One icon pack per deck theme (<!--n:packs-->11<!--/n-->). Each covers <!--n:packStates-->240<!--/n--> glyph states (every glyph × its states × Night/Day). States that move are GIF loops (at least 2 frames), each listed with its still PNG; the others are static SVGs | `plugin/dist/iconpacks/` (`node scripts/build-iconpacks.mjs`) |
| `Prism - <device>.streamDeckProfile` | <!--n:profiles-->7<!--/n--> sample profiles: Galleon 100 SD, Stream Deck +, Stream Deck + XL, MK.2, XL, Mini and Neo. **Home** works on day one (Stream Deck's own actions in Prism art); the **Showcase** pages hold the live Prism facets | `plugin/dist/profiles/` (same script) |

Requirements: Stream Deck app **7.6** or later on Windows 10/11 or macOS 13 or later. Build with `--min-software 7.1` for apps 7.1–7.5; that build drops the Neo info-bar action. The plugin runs on the app's bundled Node 20 and needs no other software.

## Install on Windows and macOS

1. **Plugin.** Double-click `com.jeremyfhall.prism.streamDeckPlugin` and confirm in the Stream Deck app.
   - The action list gets a **Prism Deck** category with **Prism Display** (and **Prism Info Bar** on 7.6+).
   - The app then asks a second question: *The plugin "Prism Deck" contains a/some preconfigured profile(s). Would you like to install the profiles to your devices?* Click **Install Profile(s)** to get a **Prism · <device>** sample profile for each connected device Prism has one for, or **Cancel** to skip them. Nothing is installed without that click (confirmed on the owner's Galleon 100 SD and Stream Deck +).
   - Your devices stay on the profile you were using. The plugin never switches you to the sample profile (`DontAutoSwitchWhenInstalled`); pick it from the profile list when you want it.
2. **Icon packs.** Double-click any `.streamDeckIconPack`. Its icons appear in a key's icon menu under **Icon Library**. Animated icons are GIFs; they animate when you pick them as a key's icon. Each GIF has a still PNG next to it (named "… · Still"). Give these icons to Stream Deck's own actions (Multimedia, Hotkey, Website, Open…) to get Prism art on keys that do things.
3. **Profiles.** Double-click a `.streamDeckProfile`, or use **Preferences → Profiles → Import**. Each one needs the plugin. If the plugin isn't installed, the app offers to install it (`RequiredPlugins`).

**Uninstall:** Preferences → Plugins → Prism Deck → Uninstall. Delete the sample profiles in Preferences → Profiles if you no longer want them.

## The sample profiles

Each profile has a **Home** page that works on day one, then one or more **Showcase** pages.

- **Home** is built from Stream Deck's own actions, each wearing Prism icon-pack art with its label: Multimedia (previous, play / pause, next, stop, mute, volume down / up), Hotkey (screen snip Win+Shift+S, show desktop Win+D, search, emoji, Task Manager, copy, paste, undo, redo), Open (File Explorer), Website (the Prism Deck site) and Go to Page (one key per Showcase page). Dials: system volume (Multimedia), deck brightness (Brightness), zoom (Ctrl+- / Ctrl+=) and scroll (arrow keys) as built-in actions. Some Prism readouts that are live in the plugin sit there too: CPU, memory, network, disk, the date, a world clock, a stopwatch and a focus timer. On the Galleon 100 SD the screen shows the system volume (built-in), a clock, CPU and network (Prism).
- **Showcase** pages hold the Prism facets that show off: spans across keys, panoramas, the Galleon dashboard, the + XL streamer layout (*Showcase · Studio*). They are visual: their keys change pictures and state, not your apps. A **Home** key (Go to Page 1) at the bottom right takes you back.
- The hotkeys are Windows shortcuts (the profiles are Windows exports). On macOS, edit them, or use only the media keys.
- No profile uses weather: Prism has no weather source.

| Device | Home | Showcase pages |
|---|---|---|
| Galleon 100 SD | media, volume, snip, desktop, files, Prism site; screen: volume, clock, CPU, network | Showcase (dashboard), Showcase · Studio |
| Stream Deck + | media, mute, snip, desktop; dials: volume, zoom, CPU gauge, system | Showcase, Showcase · Panorama |
| Stream Deck + XL | media, volume, 9 hotkeys, files, Prism site, 13 live readouts and timers; dials: volume, brightness, zoom, scroll, CPU gauge, system | Showcase, Showcase · Studio, Showcase · Panorama |
| MK.2 · XL · Mini · Neo | media and volume (plus hotkeys, readouts and timers on the MK.2 and XL); Neo: the Prism clock on the info bar | Showcase |

## Using Prism Display

Drag **Prism Display** onto a key or a dial. It is visual: it draws a Prism facet. It doesn't play music, change the volume or send keys. For those, use a Stream Deck action and give it a Prism icon. The property inspector (the panel under the canvas) shows a live preview and lets you choose:

- **Facet.** Search, or pick a gallery: Icons, Motion, Spans, Dials & Strips, Screens, Apps, Games, Themes (<!--n:facets-->210<!--/n--> facets in <!--n:galleries-->8<!--/n--> galleries). You only see facets that fit this slot. Keys get key, span and whole-deck facets. Dials get dial segments, strip panoramas and Galleon screens. The Neo info bar gets info-bar facets.
- **Theme and mode.** Pick any deck theme in Night or Day, or leave it on the plugin default (set under *Plugin settings*).
- **Motion.** *Full* plays the facet's own animation. *Calm* idles at about 4 fps. *Still* shows a static frame. Presses and dial turns always animate their feedback.
- **Parameters.** The controls come straight from the facet: labels, hues, speeds, toggles.
- **On press.** By default *Nothing else (visual only)*: a press only changes the key's own picture or state. It can also do one real thing the plugin SDK allows:
  - *Open a web page*: an `http://` or `https://` address, opened in your browser (`openUrl`). Other schemes are refused.
  - *Switch to the Prism profile*: this device's Prism sample profile, optionally a page (`switchToProfile`). Plugins can only switch to the profiles they install.
  - *Back to the previous profile*.
  - A dial push does the same. Games don't take one, because every press is a move. OpenDeck can't switch profiles, so there the key shows an alert. AI live editing can never set a press behavior.

**Spans across keys.** Put the same span facet (for example *Waveform*) on neighboring keys with the same **Span group**. They render as one block covering the bounding box of those keys, including the hidden gaps behind the bezel, sliced per key. Change the look on any key of the block and the change applies to the whole block. Use different groups (A–H) for two separate blocks of the same facet.

**Dials and the touch strip (Stream Deck +, + XL).**
- Each dial draws its own 200 × 100 segment.
- Turning a dial changes its value (press while turning for coarse steps). Pressing advances the facet's state.
- Tapping the strip counts as a press, and a long touch resets the value. The tap position reaches facets in surface px (strip-wide for a panorama, within the segment for one dial).
- Swipes on the strip belong to the Stream Deck app (page switching) and never reach plugins.
- A *strip panorama* facet (for example *Refraction*) on all four dials with the same group spreads one image across the whole strip.

**Galleon 100 SD.**
- Put Prism Display on the dials. Each dial has two widgets, and the screen shows all four at once, 2 × 2: dial 0 on the left (top and bottom), dial 1 on the right.
- Holding a dial for about 4 s moves it to its other widget (the app draws a white border around the widgets the dials control). That hold is handled by the device and never reaches plugins, so Prism never relies on a dial long-press.
- Each widget is 2:1. Prism renders it as a 360 × 180 window and scales it uniformly onto the app's 200 × 100 layout, exactly as the device shows it: nothing is cropped or squashed.
- Fast spins arrive as one event of up to ±12 detents; Prism applies them in one step.
- A *Galleon screen* facet (dashboard, media, meeting, system, weather) with all four widgets in one group fills the whole 720 × 384 screen.

**Stream Deck Neo.** Put **Prism Info Bar** on the info bar and pick an info-bar facet, such as the clock.

**DEMO tags.** A key, dial or screen whose data is simulated on this computer shows a small amber **DEMO** tag in its top-right corner, inside the bezel. Its property inspector says which data. One tag per span, strip panorama or Galleon screen (on the top-right key or widget). Real data is never tagged: CPU, memory, network and disk (system source), the clock and timers, sound once capture is live, and your calendar once it reads your `.ics` file. See *Data sources* below.

**Linked keys.** Keys, dials and screens on one device that show the same thing stay in step. Mute the mic on any mic key (or push a + dial set to *Shows: mic*) and every mic key, the Galleon *Studio* or *Meeting* screen and the mic dial turn red and say MUTED. Push a Galleon dial under the *Studio Console* to go live and every On Air key lights. The Studio screen's dials set the stream and mic volume it shows; the Dashboard's right dial sets its volume. These keys show state: they don't mute your call or switch scenes in other apps, and each facet's description says where its data comes from. For a real mute or scene switch, use your app's Stream Deck action (or a Hotkey) with a Prism icon.

**Games.** Put *Game Scoreboard* on both Galleon dials to see the score of the game on the keys (tic-tac-toe, dice, coin, oracle, slots, lights out, reaction).
The Games gallery holds stateful facets: *Lights Out* on any block of keys, *Dice* on one key, and more.
- Put a game on a key, or on a block of keys with the same span group (or as a whole-deck facet). Every press is a move. Only the keys that change are redrawn, and a game is still between moves, so it costs nothing while you think.
- **New game:** hold any key of the game for 1.5 s, or click **New game** in the property inspector. On the Galleon 100 SD only the button works, because the keyboard keeps long holds for itself.
- The game is saved in the key's settings (the top-left key of a block). It survives page switches, restarts and profile exports. Changing a game's options (for example the difficulty) deals a new game.

### Plugin settings (bottom of the property inspector)

- **Default theme, mode and motion** for every Prism key that doesn't set its own.
- **Boot animation** (**off** by default). Switch it on and the Prism power-on sequence plays across the Prism keys of every physical deck each time the plugin starts (when the app starts, or after the plugin is installed or updated): a beam strikes the prism and the Spectrum lights each key before it settles into its own face (about 15 s). Press any key to skip it. It never plays on the MCP Deck, a Virtual Stream Deck or Stream Deck Mobile, nor with *Still* motion.
- **Update budget.** Key and dial updates per second the plugin sends to the Stream Deck app, shared by all devices: default 200/s, at most 250/s (the slider stops there and larger stored values are clamped).
  - The hardware lab measured the owner's Galleon 100 SD and Stream Deck +. The app keeps up to about 230–300 updates/s in total. Above that it **queues** rather than drops, so keys lag further and further behind. At 60 fps × 12 keys its watchdog stopped the plugin ("Socket unresponsive").
  - Data size doesn't matter; drawing cost does. A frame with more than about 300 shapes counts as several updates, so heavy art slows down before light keys do.
  - Only keys whose image changed are sent; a newer frame replaces an older one still waiting; presses always go first. Keys that stopped changing drop to a 2 fps check. One key alone can run at up to 30 fps.
  - Lower the budget if keys lag; raise it on a fast PC.
- **Live audio.** Facets that draw audio (waveforms, spectrum analyzers) listen to the computer's sound output while they are on screen; levels only, nothing is recorded or stored. A system capture tool is used when installed (ffmpeg on Windows/macOS; parec, pw-record or arecord on Linux). Without one the keys run a simulated groove and the facet's property inspector offers **Open audio bridge**, a local page in your browser that feeds the levels once you allow audio. Capture stops a few seconds after the last audio key disappears.
- **Data sources.** What feeds the data facets on this computer, each marked *Live* or *Demo*:
  - **System:** live (CPU, memory, network, disk; GPU and temperature where the OS reports them).
  - **Sound:** live while a capture tool or the audio bridge runs, demo otherwise.
  - **Calendar:** demo (a made-up working day) until you enter the full path of a local `.ics` file in **Calendar file**. Outlook, Google Calendar and Apple Calendar can export or sync one. Prism reads only event titles and times, every 60 s; nothing leaves your computer. The inspector says whether the file was found and how many events it holds. A missing or unreadable file falls back to the demo day, tagged.
  - **Now playing:** live on Linux (playerctl / MPRIS). Demo on Windows and macOS, where Prism can't read the system player yet. Those keys carry the DEMO tag.
  - **Weather:** always demo. Prism has no weather source, so the sample profiles leave weather out.
- **Image format.** *SVG* (the default) is sharp and small. The Stream Deck app's SVG renderer ignores some SVG features (clip paths, aspect-ratio rules, translucent colors written as rgba()); Prism rewrites every frame for it before sending (`toDeviceSvg`), so you don't need to do anything. *PNG* rasterizes every frame in the plugin instead; use it if a device still draws some art wrongly.
- **Allow AI editing** (off by default). See below.

## Linux

- **OpenDeck** (recommended) runs this same plugin unchanged on the system Node (≥ 20).
  - Install `com.jeremyfhall.prism.opendeck.streamDeckPlugin` from OpenDeck's **Plugins** tab ("Install from file"). It is this plugin plus a `manifest.linux.json` that declares Linux and OpenDeck's info-bar slot (built by `src/export/linux-opendeck.js`, see docs/linux.md), and it installs to `plugins/com.jeremyfhall.prism.sdPlugin`, the folder name OpenDeck profiles reference.
  - Keys, spans, dials, the strip and the Neo info bar all work. OpenDeck has no Galleon support yet.
  - OpenDeck can't import `.streamDeckProfile` files or icon packs. Unzip a pack and pick its `icons/*.png|gif|svg` per button instead.
  - OpenDeck reports itself as "windows". The plugin detects Linux from the OS itself and skips the commands OpenDeck doesn't support (trigger descriptions, profile switching).
- **StreamController** doesn't run Elgato plugins. Rename an icon pack's `.streamDeckIconPack` to `.zip` and import it as a custom icon pack (GIFs animate natively). Prism's native StreamController exports are built separately (`src/export/linux*.js`).

## AI live editing (Prism Deck Live)

With **Allow AI editing** switched on, an AI assistant connected through Prism's MCP server (`prism-mcp-server`, `deck_live_*` tools) can change how **Prism's own keys and dials look**: glyphs, facets, themes, titles, dial feedback, or a whole layout page.

**What it can't do:**
- It can't run programs, press hotkeys, type text, open URLs, switch profiles, or touch other plugins' keys.
- Those actions can only reach your deck in an exported profile that you review and import yourself.
- `streamdeck://` deep links are refused everywhere.

**How it's secured:**
1. **Off by default.** While it's off, nothing listens and no file is written.
2. **Loopback only.** When you switch it on, the plugin listens on `127.0.0.1`, on a random port with a new 256-bit token every time.
   - The port and token are written to a per-user file: `%APPDATA%\Prism\deck\control.json` on Windows, `~/Library/Application Support/Prism/deck/control.json` on macOS, `$XDG_STATE_HOME/prism/deck/control.json` on Linux. `PRISM_DECK_CONTROL` overrides the location.
   - The file is never inside the plugin folder.
   - Requests from web browsers (any `Origin`), the wrong `Host`, non-JSON bodies or a wrong token are refused.
3. **You approve each assistant on the device: hold to approve.** The first time an assistant connects, the top-left Prism key of each physical deck glows with **ALLOW AI?**, a 4-digit code and *Hold to allow*. If you asked for it, **press and hold** that key for 1.5 s, until the ring round it is full, within 2 minutes. Letting go early cancels; a tap never approves. The app shows its check mark when it worked. Key holds reach the plugin on every device, including the Galleon 100 SD (only Galleon *dial* holds are kept by the device).
   - The key never shows the name the assistant gives itself, because that name could be anything. The property inspector quotes it: *an assistant that calls itself "…"*.
   - Keys on the MCP Deck, the Virtual Stream Deck and Stream Deck Mobile can never approve, because an assistant could press those itself.
   - You can **Deny** a pending request or **Revoke** access in the property inspector.
4. **Limits.**
   - At most 10 updates per second per key and 30 per device.
   - One whole-layout change per second per device.
   - 50 requests per second.
   - Images are capped at 256 KB and must be safe SVG/PNG/JPEG/WEBP. SVG must be in the deck subset: no scripts, external references or filters.
5. **Undo and audit.** Every change can be undone (50 steps). Each change is logged without tokens or image data to `audit.jsonl` next to `control.json`.
6. **Off means off.** Switching it off closes the listener, deletes `control.json`, revokes the pairing and removes every AI edit. Your keys go back to their own settings.

AI edits live only while the plugin runs. They are not written into your profiles.

## Troubleshooting

| Symptom | Try |
|---|---|
| A Prism key stays blank or shows the default prism | Open its property inspector. If no facet is selected, pick one. Check the Stream Deck app's log (`%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log` on Windows): the plugin reports warnings and errors there with `logMessage`, prefixed `[prism-deck]`. |
| Animation stutters or lags behind presses | Lower **Update budget**, or set **Motion** to *Calm* on busy keys. Heavy screens (Galleon dashboards) slow down first by design. |
| Some art looks wrong on the device but fine in the preview | Set **Image format** to *PNG*. |
| A span shows on only some keys | Every key of the block needs the same facet *and* the same span group. |
| Galleon widgets look squashed or cropped | Widgets are mapped uniformly onto the app's 200 × 100 layout (`GALLEON_CANVAS` in `src/plugin/feedback.js`). If the panel itself differs from the app preview, report a photo. |
| A Galleon dial doesn't react | A dial controls the widget with the white border. Hold it about 4 s to move it to the other row. |
| The sample profiles didn't appear | They install only if you click **Install Profile(s)** in the second dialog. Reinstall the plugin to get the question again, or double-click the files in `plugin/dist/profiles/`. |
| The AI assistant says "not paired" or "AI editing is off" | Switch on **Allow AI editing**. When asked, press and hold the glowing key that shows the code for 1.5 s. |
| A key shows **DEMO** | Its data is simulated on this computer. Open its property inspector: it says which data. For calendar keys, set **Calendar file** under *Data sources*. |
| A Prism key does nothing when pressed | That's expected: Prism Display is visual. Give it an *On press* behavior, or use a Stream Deck action with a Prism icon. |
| "No Prism key is visible on a physical deck" | Show a page that has at least one Prism Display key on a real deck, then ask the assistant to pair again. |

## For developers

```bash
cd prism-deck
node scripts/build-plugin.mjs          # plugin/com.jeremyfhall.prism.sdPlugin + plugin/dist/*.streamDeckPlugin (+ the OpenDeck build); schema-validated; smoke-run on node (and the app's Node 20 if present); rewrites the doc counts
node scripts/build-iconpacks.mjs       # plugin/dist/iconpacks/* (one per theme) + plugin/dist/profiles/* (one per device); --theme prism --svg-only --no-profiles
node scripts/doc-counts.mjs --check    # are README.md / docs/plugin.md numbers and versions current?
node --test test/plugin.test.js test/export.test.js
```

- `streamdeck link plugin/com.jeremyfhall.prism.sdPlugin` (Elgato CLI) installs the dev build linked. Only do this on your own machine.
- `src/plugin/dev/fake-streamdeck.js` is a fake Stream Deck app (a real WebSocket server) for running the plugin without hardware.
- Validation uses Elgato's official manifest and layout schemas from the research handoff (`PRISM_SD_SCHEMAS` points elsewhere).
- Licenses: the plugin ships `LICENSE.txt` (MIT, then Inter's SIL OFL 1.1) and `ui/fonts/OFL.txt`; each icon pack ships `license.txt` (MIT + OFL) and `OFL.txt`. The manifest's `SupportURL` is the repository's issue tracker.
- Layout: runtime `src/plugin/` (`ws.js` transport, `connection.js` protocol, `runtime.js` render units, `budget.js` frame budget, `control.js` live channel, `ui/` property inspector); exporters `src/export/{plugin,iconpack,profile}*.js`.
