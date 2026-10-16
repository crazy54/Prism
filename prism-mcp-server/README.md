# Prism MCP Server

A production-grade [Model Context Protocol](https://modelcontextprotocol.io) server that exposes **Prism's three catalogs** — the web component catalog (2,700+ self-contained CSS/SVG facets), the terminal catalog and **Prism Deck** for Stream Deck — as a set of intelligent tools for agents and AI systems.

It lets an agent ask *"give me a pulsing KPI card with a wind backdrop"* and get back **production-ready HTML/CSS** — discovered, composed, deduplicated, and validated — or *"make my Galleon look like Prism Night with a volume knob on dial 1"* and get a validated Stream Deck layout, a rendered preview, an importable profile, or (with the user's consent) the change live on the device.

- **Zero runtime dependencies** — pure Node.js (≥18). Speaks MCP JSON-RPC 2.0 over stdio, the transport used by Claude Desktop and the Anthropic API's local MCP integration.
- **Reads the authoritative catalogs** — points at `Prism.html` (the embedded `#prism-catalog`, `#prism-terminal-catalog` and `#prism-deck-catalog` JSON islands, the source of truth) or a `catalog/manifest.json`.
- **Hot reload** — edits to the catalog files are picked up without a restart.
- **Composition intelligence** — merges HTML, deduplicates CSS rules, collapses `:root` token blocks, validates output, and reports size savings.
- **Refraction themes** — Prism's own design language is the default: **Prism Night** (`prism-dark`) and **Prism Day** (`prism-light`), with the `--rf-*` Refraction layer on request; Cloudscape, Material 3, Duolingo and the other design systems are optional skins.
- **Terminal catalog** — Prism's **terminal facets** ([`prism-term`](../prism-term): spinners, progress bars and counters, charts, TUI controls, ops views, animated scenes), so an agent can find *"an ASCII-safe spinner for a serial console"* and get the command that runs it.
- **Prism Deck** — Stream Deck and Corsair Galleon 100 SD facets ([`prism-deck`](../prism-deck)): browse, render to PNG/SVG, design **keys, spans, dials (knobs) and screens** in layout documents, export `.streamDeckProfile` / `.streamDeckIconPack` files, and edit Prism keys **live** through the Prism Deck plugin's loopback control channel.

---

## Quick start

```bash
cd prism-mcp-server

# Inspect the catalogs (no server; prints stats and exits)
node cli.js info

# List the available tools
node cli.js tools

# Run the MCP server over stdio
node cli.js start --catalog ../Prism.html
```

Because it has no dependencies, there is nothing to `npm install`. (`npm link` or `npm i -g .` will expose the `prism-mcp` binary if you want it on your `PATH`.)

### CLI

```
prism-mcp start [options]     Run the MCP server over stdio (default command)
prism-mcp info  [options]     Print catalog metadata + stats, then exit
prism-mcp tools               List available tools, then exit
prism-mcp help                Show help

Options:
  --catalog <path>   Path to Prism.html or catalog/manifest.json
                     (default: ../Prism.html, else ../catalog/manifest.json)
  --terminal-catalog <path>
                     Terminal catalog: a .html with a #prism-terminal-catalog island or a
                     terminal-catalog.json (default: the catalog's Prism.html island, else
                     ../prism-term/catalog/terminal-catalog.json)
  --deck-catalog <path>
                     Prism Deck catalog: a .html with a #prism-deck-catalog island or a
                     deck-catalog.json (default: the Prism.html island, else
                     ../prism-deck/catalog/deck-catalog.json)
  --deck-engine <dir> The prism-deck package for render / validate / export (default ../prism-deck)
  --deck-layouts <file>
                     Where deck layout documents are stored (default ./deck-layouts.json)
  --deck-control <file>
                     The Prism Deck plugin's control.json (default: the per-user path the plugin
                     writes while "Allow AI editing" is on, or $PRISM_DECK_CONTROL)
  --no-watch         Disable catalog hot reload (all catalogs)
  --log-level <lvl>  debug | info | warn | error | silent   (default: info)
```

> **Note on `--port`:** this build speaks MCP over **stdio**, which is how Claude Desktop and the Anthropic API launch local MCP servers (as a subprocess). A `--port` flag is accepted but ignored, and there is deliberately no HTTP or tunnel mode: nothing listens on the network. An HTTP/SSE transport can be added by implementing another transport against `PrismMCPServer` (see *Architecture*).

---

## Use with Claude Desktop

Add the server to your `claude_desktop_config.json` (see `examples/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": [
        "C:/path/to/Prism/prism-mcp-server/cli.js",
        "start",
        "--catalog",
        "C:/path/to/Prism/Prism.html"
      ]
    }
  }
}
```

Restart Claude Desktop; the 58 Prism tools appear in the tools menu. To use it next to Elgato's own Stream Deck MCP, see [Coexisting with Elgato's MCP](#coexisting-with-elgatos-stream-deck-mcp).

## Use with the Anthropic API

The Messages API accepts local MCP servers via the `mcp_servers` parameter (stdio). Point it at the same `command`/`args` as above. See `examples/anthropic_api.md` for a full request example and a runnable Tool-Runner snippet using the Anthropic SDK.

---

## Tools (58)

### Discovery & search (11)
| Tool | Purpose |
|------|---------|
| `list_effects` | List effects with filters (gallery, tag, componentType, background, new) + pagination. Returns light metadata. |
| `search_effects` | Faceted relevance search: full-text ranking + a `filters` object (gallery, componentType, spectrum, category, tag [AND], interaction) + boolean flags (incl. `themeSensitive`) + `sort` + pagination. |
| `get_available_filters` | Describe every facet with its top values + counts, the boolean flags, and valid sort options — everything needed to build a faceted UI. |
| `list_filter_values` | Enumerate the full value set for one facet (e.g. all 175 categories) with per-value counts + prefix filtering. |
| `create_saved_search` | Save a named query+filters+sort (session memory) and get an id back. |
| `get_saved_searches` | List saved searches for this session. |
| `execute_saved_search` | Run a saved search by id (with optional sort/limit override). |
| `get_effect` | Full record for one effect: its authored `html`/`css` plus `tokensCss` (the `:root` block it needs for `theme`) and `wrapperCss`; `snippet:true` adds the complete paste-ready string. |
| `get_theme_variants` | Theme token reference + how to recolor an effect. |
| `list_galleries` | All galleries with declared vs. live effect counts. |
| `get_catalog_stats` | Aggregate stats: per-gallery counts, tags, componentTypes, etc. |

> **Facets are grounded in real catalog data.** Available facets: `gallery`, `componentType`, `spectrum` (visual aesthetic), `category`, `tag`, `interaction`. Interaction values are **normalized** from noisy source data (`tatic`→`static`, `focu`→`focus`, `croll`→`scroll`, multi-value strings/arrays split). There is no `performance` field in the catalog, so that facet is intentionally omitted rather than faked. The `themeSensitive` facet is **derived** (does the component consume theme tokens?), not a stored field. Saved searches are per-process (in-memory), not persisted to disk.

### Component Variant Matrix (3)
| Tool | Purpose |
|------|---------|
| `get_theme_palette` | Token palette for one theme (or all): family (`ds` / `dsName`), complete token map, overrides vs the **Prism Night** base (the default theme, exactly like the app's `themeMatrix()`), mode (light/dark), and a paste-ready `:root{…}` block. The Prism family (Refraction) also carries the `--rf-*` layer — spectrum stops, beam, glass, type scale, gallery hues — returned with `includeRefraction: true`. Default `prism-dark` (Prism Night), light companion `prism-light` (Prism Day); Cloudscape, Material 3, Duolingo, Mailchimp, Stack Overflow, Monzo, Heroku, Polaris, Primer, Ant Design and Firefox Acorn ship as optional skins. |
| `get_component_variants` | Every theme variant of one component. Prism themes are pure `:root` token swaps over identical HTML/CSS, so this returns the payload **once** plus each theme's token overrides (and the subset the component actually consumes) — not N copies. |
| `get_variants_for_theme` | Components rendered under a single theme, each with the token values it uses; supports gallery/componentType/spectrum/tag + `themeSensitiveOnly` filters + pagination. |

> **Variants are token-swaps, not copies.** A "variant" is the same component under a different `:root` token set — the exact mechanism Prism's live theme engine uses. Rendering a variant = component `html` + `css` + the chosen theme's token overrides. This is why one payload yields every theme variant without multiplying storage.
>
> **The mirror.** `utils/themes.js` mirrors Prism.html's `THEME_REGISTRY` (checked by `aaa-prism-ds/tools/theme-sync-check.mjs`). The Prism Night / Prism Day maps and their `--rf-*` layer are generated into `utils/refraction-tokens.js` from `design/themes.js` by `node scripts/sync-refraction.mjs` (`--check` fails when stale; a test does the same).

### Composition (3)
| Tool | Purpose |
|------|---------|
| `compose` | Merge effects into one **paste-ready** bundle, exactly like Prism's Copy builder (`fix-copy/prism-snippet.js`): a `:root{}` block with exactly the tokens the CSS references, resolved for `theme` (default `prism-dark`; gallery-level tokens such as `--glm-*` included; `--font` gets the system stack), the `.prism-snippet` wrapper (font, ink, stage layout) with its `box-sizing: border-box` reset, the deduped facet CSS and the markup inside `<div class="prism-snippet">`. Returns `html`, `css`, one `snippet` string, `tokens` (`resolved`, `unresolved`, `fallbackOnly`), initializers, size metrics. `wrapper:false` / `includeTokens:false` opt out. |
| `compose_with_template` | `compose` plus a layout template (`stack`, `row`, `grid`, `card`), same paste-ready output. |
| `validate_composition` | Check a set of ids composes cleanly (missing ids, JS needs) without building output. |

### Content creation (3)
| Tool | Purpose |
|------|---------|
| `create_facet` | Validate + register a new facet into the live catalog (in-memory, instantly discoverable). |
| `update_facet` | Update fields of an existing facet, re-validated. |
| `validate_facet` | Validate a facet definition (id/kebab-case, metadata, HTML presence, CSS soundness, token references) without creating it. |

### Catalog management (3)
| Tool | Purpose |
|------|---------|
| `get_catalog_metadata` | Catalog name/version/source/counts, source path, hot-reload status. |
| `export_collection` | Export a self-contained, paste-ready bundle (same output as `compose`, `theme` param) from a saved `collectionId`, an explicit set of `ids`, or a whole gallery. `format`: `bundle` (CSS+HTML, default), `document` (full `<html>`), or `schema` (portable `prism-collection-1.0` JSON, saved collections only). |
| `get_token_reference` | Canonical CSS token reference (tokens.css + token purposes + recolor classes). |

### Collections & favorites (6)
Saved, named sets of effects that persist across sessions (disk-backed JSON). Constraints: name ≤50 chars & unique, description ≤200 chars, ≤5 tags, ≤50 components; duplicate ids are collapsed.
| Tool | Purpose |
|------|---------|
| `list_collections` | List saved collections as lightweight summaries (most-recently-updated first). |
| `get_collection` | Get one collection incl. its full component list (`{id, name, gallery}`). |
| `create_collection` | Create a named collection; effect ids are validated against the catalog and stored with their name+gallery. |
| `add_to_collection` | Add effects to a collection (dedup + 50-component cap); reports added/skipped. |
| `remove_from_collection` | Remove effects from a collection by id; reports the count removed. |
| `delete_collection` | Delete a collection entirely. |

> Export a saved collection for the Prism.html UI with `export_collection { collectionId, format: "schema" }` — the resulting `prism-collection-1.0` JSON is the cross-surface bridge between the MCP server and the in-browser Collections panel.

### Terminal catalog (5)
Prism's terminal facets — everything [`prism-term`](../prism-term) draws in a terminal: scenes, spinners, progress bars and counters, charts, text art, TUI controls, diagrams and Linux/ops views, sorted into galleries and categories like the web catalog.
| Tool | Purpose |
|------|---------|
| `list_terminal_galleries` | Galleries with their categories and declared vs. live facet counts. Start here. |
| `list_terminal_facets` | Filter by `gallery`, `category`, `kind`, `tag`/`tags` (AND), exact `glyphs`/`color` requirement, **what the target terminal supports** (`maxGlyphs`: ascii < unicode < braille < sextant; `maxColor`: mono < 16 < 256 < truecolor), `animated`, and a size budget (`maxWidth`/`maxHeight` against each facet's minimum size) + pagination. Light records with run commands. |
| `search_terminal_facets` | Ranked text search over title, id, tags, category/gallery and description (*"braille spinner"*, *"download progress eta"*), combinable with every filter above; each hit carries its `score`. |
| `get_terminal_facet` | Full record: metadata, tunable `params` (`--set key=value`), run commands (`usage.cli` / `usage.npx` / `usage.snapshot` / `usage.curl` / `usage.code`), the facet's ES-module `source` with its `imports` (relative to `module`), the `"_"` gallery helper modules it needs as `helpers: [{ path, source }]`, and a plain-text `preview` frame. Engine modules (`prism-term/src/*.js`) are never included — they ship in the package. `includeSource` (source + helpers) / `includeHelpers` / `includePreview` trim it. |
| `get_terminal_catalog_stats` | Totals per gallery, kind, glyph and colour requirement, animated vs. still, top tags, the engine package, the catalog `schema` and number of `sourceModules`, and which source was loaded. |

**Using a facet an agent found:** run its `usage.cli` (`prism-term play <id>`, with the package installed) or `usage.npx` (no install — `npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term play <id>`, Node ≥ 18), or in code `import { play, findFacet } from 'prism-term'; await play(findFacet('<id>'))`. `usage.curl` prints a still frame in any terminal.

**Where it comes from.** The terminal catalog is derived from `prism-term/src/facets/**` by `prism-term/scripts/build-catalog.mjs` (`npm run catalog` → `prism-term/catalog/terminal-catalog.json`) and embedded into `Prism.html` as `<script type="application/json" id="prism-terminal-catalog">` by the site pipeline. The server reads the **island first**, falls back to the **JSON file** when the island is absent (or malformed), and hot-reloads either. If neither exists the five tools return a structured `unavailable` error naming the paths they searched — the rest of the server is unaffected.

**Record shape (schema 2).** Module code lives once, in the catalog's top-level `sources` map (`{ "prism-term/src/facets/…/x.js": "<ES module source>" }`), together with the `"_"` gallery helpers those modules import; a facet record points at its code through `module`, and several facets can share one module (e.g. the 15 spinners in `loaders/originals.js`). The server resolves each facet's `source` as `sources[module]` — falling back to the per-facet `source` of a schema-1 catalog, so older islands still load — and keeps the strings shared rather than copied per facet. `get_terminal_facet` returns that `source` plus `helpers`: each `"_"` helper in the facet's `imports` (resolved relative to `module`) that is present in `sources`, followed by any helpers those re-export. List and search results never carry code.

### Prism Deck — catalog (7)
Prism Deck facets for **every** Stream Deck model and the Corsair Galleon 100 SD: keys, spans of keys (the physical gaps included, so art reads continuously behind the bezel), dial segments and touch-strip panoramas, the Galleon 720×384 screen and the Neo info bar, and whole-deck looks — glyphs × deck themes, each with named states, a press rule and tunable params.
| Tool | Purpose |
|------|---------|
| `deck_list_galleries` | Galleries (themes, icons, motion, spans, dials, screens, apps) with categories and live counts, catalog totals (facets, themes, glyphs, devices by surface) and where it was loaded from. Start here. |
| `deck_list_facets` | Filter by `gallery`, `category`, `surface` (key · span · strip · screen · deck), `tag`/`tags`, `device` fit (prism-deck id or DESIGN name like `galleon-100-sd`), `animated`, live `data` input, `press` rule + pagination. |
| `deck_search_facets` | Ranked text search (*"volume dial"*, *"galleon dashboard"*, *"press ripple"*) with the same filters. |
| `deck_get_facet` | Full record: params (type, default, min/max/step, options), states with tones, press rule, data inputs, render targets, the devices it fits, usage; `includePreview` / `includeSource` add the static preview SVG / module source. |
| `deck_list_themes` | The deck themes (Prism, Mono, Phosphor, Neon, Ember, Aurora, Chrome, Paper, Porcelain, Pixel, Blueprint …) with Night/Day modes; `includePalette` adds each mode's palette from the engine. |
| `deck_list_glyphs` | The 56 glyphs (icon id, category, tags, states, `icon-<id>` facet), searchable. |
| `deck_list_devices` | Every model (30 renderable, 31 with the hidden April-Fools "+ Lever"): SDK DeviceType, profile model, grid, native key px, dials (count, press, touch, rotate, Galleon layers), strip and screen geometry, aliases incl. DESIGN names. |

### Prism Deck — render, layouts, export (9)
| Tool | Purpose |
|------|---------|
| `deck_render` | Render with the prism-deck engine → **PNG as an MCP `image` block** (default) and/or SVG. One facet for a device + theme + state + params + time + press/value (sliced per key / segment / widget with `slices`), or a **layout page composited onto the device panel** (keys, spans, strip segments, Galleon screen widgets, Neo info bar) — or one key / dial of it. |
| `deck_layout_create` | New stored layout (`prism-deck-layout/0.1`) for a device: `blank`, `sample` (Prism's layouts for Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo) or an imported document. Returns `layoutId`, revision, validation. |
| `deck_layout_get` / `deck_layout_list` / `deck_layout_delete` | Read (optionally one page), list, delete stored layouts. |
| `deck_layout_update` | Batch of 1–200 ops, all or nothing, revisioned (`baseRevision` → `revision_conflict`): `set_key` / `clear_key` / `move_key`, `place_span` (multi-key art), **`set_dial` with `feedback` (what the knob shows), `press` (what a push / strip tap does) and `rotate {step, value}`**, `place_screen` (Galleon screen on all 4 widgets, strip panorama, Neo info bar), pages, theme, name, `retarget {device}`. Invalid results are not saved (unless `allowInvalid`). |
| `deck_layout_validate` | The checks the plugin applies live, offline: grid, dial count, Galleon layers 0–1, the MCP Deck has no dials, facets/glyphs/themes exist and fit their slot, params, titles, images, 200×100 dial layouts, behavior safety; spans/screens complete. `live: true` also rejects export-only behaviors. Returns `errors`, `warnings`, `review`, `stats`. |
| `deck_export_profile` | `.streamDeckProfile` (FormatVersion 1, via `prism-deck/src/export/profile.js`) for the layout's device — Prism Facet actions (`com.jeremyfhall.prism`) with facet, theme, params, state, value and span group — written **only to the absolute `outPath` the caller gives**. What a profile can't carry (title/image looks, Prism page/toggle behaviors, native actions) is listed in `skipped` / `review`. |
| `deck_export_iconpack` | `.streamDeckIconPack` for one deck theme (via `prism-deck/src/export/iconpack.js`): glyphs × states × Night/Day at 144×144, GIF idle loops + PNG twins, preview sheets — written only to `outPath`. |

**Behaviors (what a press does).** `none` · `prism.toggle` · `prism.page {page}` · `prism.app {app: clock | timer | stopwatch | counter | sysmon | spectrum | waveform}` are safe and can go live. `native {uuid, settings}` (hotkeys, apps, URLs, other plugins' actions) is **export-only**: never sent live, always listed for the user's review. `streamdeck://` links are refused everywhere. On a dial, **rotate** changes the facet's value by its `step` param per tick (×5 while pressed), **press** (and a tap on the + touch strip) runs the behavior and advances the facet state, a long touch resets the value; holding a Galleon dial ~3 s switches its layer.

**Exports never install.** The server writes files only where it is told (absolute paths; never into the Stream Deck app's folders or a `.sdPlugin` folder; existing files only with `overwrite: true`) and never imports, installs or restarts anything: the user double-clicks the file.

### Prism Deck — live (8)
Change what **Prism's own** keys, dials and screens show on the user's physical devices, through the Prism Deck plugin's local control channel (API v1; `prism-deck/src/plugin/control.js`, spec `aaa-prism-ds/elgato-mcp/DESIGN.md` §6.3).
| Tool | Purpose |
|------|---------|
| `deck_live_status` | Reachable? AI editing on? Paired? Pending prompt? Connected devices (id, SDK type, model, grid, dials, layers, virtual, where Prism keys/dials are) and limits. Never errors: `reachable: false` with the reason when the channel is off. |
| `deck_live_pair` | Start pairing (the deck shows **ALLOW AI?** and a 4-digit code on a Prism key) or poll it (`pending` · `approved` · `denied` · `expired`). |
| `deck_live_set_key` / `deck_live_set_dial` | One key (look: facet or glyph + params, state, title, theme, accent, image; safe behavior) / one knob (feedback, press, rotate; Galleon layer 0–1). `clear`, `dryRun`. |
| `deck_live_batch` | Up to 64 key/dial changes atomically. |
| `deck_live_apply_layout` | Replace a device's live Prism surface with one page of a stored or inline layout (DESIGN device names and prism-deck ids both work); `dryRun` returns the diff first. Destructive (annotated). |
| `deck_live_snapshot` | What Prism shows now on a device (`render` adds each key's SVG). |
| `deck_live_undo` | Undo the last N live changes (history 50). |

**Consent and safety (enforced by the plugin; the server only follows them).**
1. **Off by default.** The channel exists only while the user has switched **Allow AI editing** on in the plugin (Stream Deck app → a Prism Facet key → property inspector → Plugin settings). Only then does the plugin write the per-user discovery file `control.json` — `%APPDATA%\Prism\deck\control.json` (Windows), `~/Library/Application Support/Prism/deck/control.json` (macOS), `$XDG_STATE_HOME/prism/deck/control.json` (Linux), or `$PRISM_DECK_CONTROL` / `--deck-control`. **No file ⇒ the tools report `unreachable`** and point the AI at the export path; the server never tries to switch anything on.
2. **Loopback + token.** The client re-reads `control.json` on every call (port and 256-bit token rotate on each plugin start), connects to `127.0.0.1` only, sends the exact `Host` the plugin expects, never an `Origin`, JSON bodies ≤ 2 MB. The token is never logged, echoed or returned.
3. **A physical key press pairs.** The approval key lights on a physical deck; the MCP Deck, Virtual Stream Deck and Mobile can't approve (`no_physical_key`, HTTP 409). Pairing requests are rate limited (`rate_limited`, 429). Nothing over the API can approve a pairing.
4. **Limits.** 10 updates/s per key, 30/s per device, one full apply/s per device, 50 requests/s; `rate_limited` carries `retryAfterMs`. Prism facets animate on the device — never animate by calling tools in a loop.
5. **Undo and audit.** Every live write is undoable (50 steps) and audited by the plugin (`audit.jsonl` next to `control.json`, without tokens or images). Switching AI editing off removes every live edit.

Errors are structured (`isError: true`, `{ error, code, data: { hint } }`): `unreachable`, `ai_editing_off`, `not_paired`, `no_physical_key`, `rate_limited`, `unauthorized`, `requires_export`, `forbidden_behavior`, `invalid_ops`, `invalid_layout`, `device_mismatch`, `unknown_device`, `nothing_to_undo`.

Full parameter schemas are returned by `tools/list` (deck tools also carry MCP `annotations`: read-only, destructive, idempotent). Per-tool example calls live in [`examples/`](./examples).

---

## Coexisting with Elgato's Stream Deck MCP

Stream Deck 7.4+ ships an "MCP Deck" and Elgato publishes [`@elgato/mcp-server`](https://github.com/elgatosf/elgato-mcp-server) (tools named `streamdeck__*`, plus `bridge_status`). The two servers do different jobs and never collide (Prism uses `deck_*` / `deck_live_*`):

| User says | Use |
|---|---|
| "Make my Galleon look like Prism Night with a spectrum on dial 1" | `deck_layout_*` → `deck_render` → `deck_live_apply_layout` (or `deck_export_profile`) |
| "Design an icon pack / a profile I can share" | `deck_export_iconpack` / `deck_export_profile` |
| "Start my stream" / "mute Discord" (an action the user already has) | Elgato: `streamdeck__get_executable_actions` → **confirm with the user** → `streamdeck__execute_action` |
| "Add a key that opens OBS" | a `native` behavior in a layout → `deck_export_profile` → the user reviews and imports. Never live. |
| "What can you control?" | `deck_live_status` + `bridge_status` + `streamdeck__get_executable_actions` |

The server's `instructions` tell the AI the same: Elgato's MCP only presses the actions the user curated on its **MCP Actions** profile, so use it for those and **always ask first** when an action looks like keystrokes, launching apps, messages, streaming or purchases; never imitate those actions with Prism tools. Prism never connects to the Stream Deck app, its WebSocket ports or Elgato's named pipe, and never proxies Elgato's tools.

Host config with both servers, versions pinned:

```json
{ "mcpServers": {
  "prism":  { "command": "node", "args": ["C:/path/to/Prism/prism-mcp-server/cli.js", "start", "--catalog", "C:/path/to/Prism/Prism.html"] },
  "elgato": { "command": "npx",  "args": ["-y", "@elgato/mcp-server@0.1.8"] }
} }
```

> **Security note (Elgato's server).** Prefer Elgato's server in **stdio** mode, as above. Its **`--http` mode listens on all network interfaces with no authentication** (its CORS check only stops browsers — curl, scripts and other machines on the LAN can call it), and **`--ngrok` publishes that unauthenticated endpoint to the internet**. If you need HTTP (e.g. NVIDIA G-Assist), use it only on a trusted network with the firewall blocking inbound `node.exe`. Pin a version (`@0.1.8`) instead of `@latest`, and keep the MCP Actions profile limited to actions you would let a stranger press — any process running as you can drive Elgato's pipe. Prism's own control channel is loopback-only, token-protected, paired by a physical key press and has no tunnel option.

---

## Facet creation flow (draft → validate → register → embed)

1. Agent calls `validate_facet` (or `create_facet`, which validates first) with `{id, name, gallery, html, css, ...}`.
2. Validation checks naming (lowercase kebab-case), required metadata, HTML presence, CSS structural soundness, and token references.
3. On success `create_facet` registers the facet into the **live** catalog — it is immediately returned by `list_effects` / `search_effects` / `get_effect` with **no restart** (`persisted:false`).
4. To persist to disk, run the repository's catalog pipeline (`extract-from-prism.mjs` → `catalog/_embed-catalog.mjs`) to embed the facet into `Prism.html`. With hot reload on, the server re-reads the file and the facet becomes permanent (`persisted` on the next load).

> **Source-of-truth note:** the `#prism-catalog` island in `Prism.html` is authoritative and can be fresher than `catalog/manifest.json` on disk. Point `--catalog` at `Prism.html` for the complete catalog. The terminal and deck catalogs follow the same rule: the `#prism-terminal-catalog` / `#prism-deck-catalog` islands win over `prism-term/catalog/terminal-catalog.json` / `prism-deck/catalog/deck-catalog.json`.

---

## Architecture

```
prism-mcp-server/
├── index.js          # PrismMCPServer (JSON-RPC dispatch, instructions, image content) + StdioTransport
├── cli.js            # prism-mcp CLI (start / info / tools / help)
├── tools/
│   ├── index.js      # the tool definitions (name, description, schema, handler[, annotations])
│   ├── terminal.js   # the 5 terminal-catalog tools (spread into buildTools())
│   ├── deck.js       # the 16 Prism Deck design tools: catalog, render, layouts, export
│   └── deck-live.js  # the 8 live tools (plugin control channel)
├── utils/
│   ├── catalog.js    # CatalogStore: load island/manifest, index, hot reload, runtime facets
│   ├── terminal-catalog.js # TerminalCatalogStore: #prism-terminal-catalog island → JSON fallback, hot reload, shared `sources` + helpers
│   ├── deck-catalog.js     # DeckCatalogStore: #prism-deck-catalog island → deck-catalog.json, hot reload, search, device fit
│   ├── deck-engine.js      # lazy loader for prism-deck (index, raster, export/{profile,iconpack}, plugin/{live-validate,settings,system-facets})
│   ├── deck-render.js      # facet renders + layout pages composited onto the device panel; SVG → PNG
│   ├── deck-layouts.js     # prism-deck-layout/0.1 documents: ops, validation, profile pages, DeckLayoutStore (disk, revisioned)
│   ├── deck-control-client.js # control.json reader + loopback HTTP client for the plugin's channel (API v1)
│   ├── collections.js# CollectionStore: disk-backed named sets + prism-collection-1.0 export
│   ├── css.js        # split/dedupe/merge/validate CSS; token extraction
│   ├── compose.js    # composition engine + layout templates
│   ├── snippet.js    # paste-ready snippets: theme :root block, .prism-snippet wrapper + reset (mirrors the Copy builder)
│   ├── validate.js   # facet + composition validation
│   ├── themes.js     # canonical theme token maps (variant matrix) — mirrors Prism.html THEME_REGISTRY
│   ├── refraction-tokens.js # GENERATED from design/themes.js (Prism Night / Day + --rf-* layer)
│   └── logger.js     # stderr logger (never pollutes the stdio JSON-RPC channel)
├── scripts/sync-refraction.mjs # regenerate (or --check) utils/refraction-tokens.js
├── examples/         # one example request/response per tool + integration configs
└── test/             # node:test integration + unit tests (194 tests)
```

**Server model.** `new PrismMCPServer(catalogPath, opts)` builds the tool registry, a `CatalogStore`, a `TerminalCatalogStore` and a `DeckCatalogStore` (found next to `catalogPath`, or the explicit paths), a lazily loaded `DeckEngine`, a `DeckLayoutStore` (`./deck-layouts.json` by default) and a `DeckControlClient`. `await server.load()` reads + indexes the catalogs (missing terminal/deck catalogs are not an error). `server.connect(transport)` wires a transport; `StdioTransport` implements newline-delimited JSON-RPC on stdin/stdout. The transport is pluggable — implement `onMessage(cb)` / `send(obj)` to add HTTP/SSE.

**Error handling.** Protocol errors (bad method / unknown tool) return JSON-RPC errors. Tool-level failures (unknown id, validation failure, a refused live write) return an MCP tool result with `isError: true` and a structured `{error, code, data}` payload with actionable messages and suggestions.

**Logging.** Request + composition trace logs go to **stderr** (stdout is reserved for the JSON-RPC channel); debug logs shorten long strings and data URLs. Control verbosity with `--log-level` or `PRISM_MCP_LOG_LEVEL`.

---

## Testing

```bash
node --test          # or: npm test
```

194 tests cover every tool (incl. paste-ready composition — one theme-resolved `:root`, the snippet wrapper and reset, no undefined `var()` on the fixture or a whole real gallery — the advanced-search & variant-matrix tools, the `themeSensitive` facet, the 6 Collections tools + `export_collection` formats, the 5 terminal-catalog tools and the 24 Prism Deck tools), the CSS/compose/validate utilities, the canonical theme token maps (Prism Night as the base, the Cloudscape skins, the generated Refraction layer in sync with `design/themes.js`), the `CollectionStore`, the `TerminalCatalogStore` and `DeckCatalogStore` (island vs. JSON fallback, malformed/missing sources), the JSON-RPC protocol layer, and loading the real `Prism.html` islands. The deck tests use a fixture copied from the real deck catalog and the real `prism-deck` engine (renders, PNGs, layout validation, `.streamDeckProfile` / `.streamDeckIconPack` exports checked by the exporters' own checkers). The live tests run the plugin's **real control-channel code** (`prism-deck/src/plugin/control.js`) against a fake plugin runtime — pairing by a simulated key press, the pairing and per-key rate limits, safety refusals, apply / snapshot / undo, AI editing off, stale tokens — plus a raw fake server for headers and timeouts, a static check that no deck code reaches the Stream Deck app, and an end-to-end run of `cli.js start` over real stdio. No test reads the user's real `control.json` or talks to the Stream Deck app.

---

## License

MIT
