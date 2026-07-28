<div align="center">

# ✦ Prism

**One prism. Every facet of your report.**

A single-file gallery of **1,235** offline, self-contained CSS/SVG animations, components and backdrops — built to be browsed by humans *and* parsed by AI agents. Drop it into any static HTML page or GenAI-generated report and it just works. No build step, no dependencies, no network.

![Effects](https://img.shields.io/badge/effects-1235-ff9900) | ![Galleries](https://img.shields.io/badge/galleries-12-4493f8) | ![Dependencies](https://img.shields.io/badge/dependencies-0-3fb950) | ![Offline](https://img.shields.io/badge/offline-100%25-3fb950) | ![MCP](https://img.shields.io/badge/MCP-ready-c879ff) | ![Single file](https://img.shields.io/badge/single%20file-HTML-e0a52b)

</div>

---

## What Prism is

Prism is **one HTML file** — `Prism.html` — that contains a whole design library of animated elements: charts, visual effects, "AI is thinking" states, 3D objects, form inputs, text treatments, shaped text, offline maps, notifications, architecture diagrams, and report callouts. Everything is **hand-authored, pure HTML/CSS** (plus tiny inline JS only where an effect genuinely needs it). No fonts, no scripts, no images, no CDNs are fetched — so anything you copy out of Prism runs anywhere, forever, including fully offline.

It serves two audiences at once:

- **Humans** open the file in a browser, browse the galleries, and hit **Copy** on any element to grab ready-to-paste, self-contained markup.
- **AI agents** read a machine catalog embedded at the top of the file (the [JSON island](#-the-json-island--why-prism-is-mcp-ready)) and compose effects programmatically — e.g. *"make the KPI cards pulse and put a wind backdrop behind the streaming agent text."*

## Quick start

```bash
# Just open it. That's the whole install.
open Prism.html            # macOS
# or double-click the file, or serve the folder with any static host
```

The page opens on a loader veil, then routes by device: touch devices land on the **Mobile** gallery, everything else on **Charts**. A `#hash` in the URL (e.g. `Prism.html#objects`) always wins, so you can deep-link or share a specific gallery.

To use an element on your own page: browse to it, click **Copy** (or **Copy snippet**), paste. If the effect reads color/theme tokens, include the design tokens once globally (see [Composing an effect](#composing-an-effect)).

## The galleries

Prism is organized into twelve authored galleries, plus three special views. Every element carries a name, its canonical CSS selector (`.ref`), a one-line description, and a copy affordance.

| Gallery | What's inside | Count |
|---|---|--:|
| 🧪 **Animation Lab** | Motion studies — easing, transforms, loaders, physics, keyframes | 217 |
| 📊 **Charts & Metrics** | KPIs, gauges, progress, trends, comparisons, status, **3D charts** | 209 |
| 🎇 **FX Store** | Drop-in visual effects: glow, pulse, shimmer, glass, particles, glitch | 146 |
| 🤖 **AI Working** | "Thinking" states, token streams, tool calls, model internals | 118 |
| ✏️ **Input Methods** | Controls, pickers, toggles, and interactive input patterns | 101 |
| 🔤 **Text Effects** | Gradient, neon, glitch, shimmer, kinetic, 3D/extrude text | 100 |
| ⌬ **Animated Objects** | Self-contained animated SVG/CSS objects, icons, and **3D objects** | 91 |
| 🌈 **Text Shapes** | Text arranged into arcs, rings, spirals, and **3D tunnels** | 53 |
| 🌍 **Maps & Geo** | Offline SVG world/region maps, pulsing markers, great-circle arcs, choropleth, radar sweeps, live telemetry | 50 |
| 🔔 **Notifications & Status** | Toasts, snackbars, progress notifications, status banners, live indicators, empty states, skeletons | 50 |
| 🗺 **Architecture Diagrams** | Cloud/AWS-flavored diagram blocks — service nodes, animated connectors, VPC containers, mini-architectures, sequence & flow diagrams, topologies | 50 |
| ⭐ **Callouts & Annotations** | Report chrome — admonition callouts, badges & pills, timelines & steppers, dividers, tooltips, key-value meta | 50 |

**Special views:**

- **✦ New Facets** — a live-assembled page that harvests every element tagged as new or updated from across all galleries, so you can see what shipped in the latest release at a glance. Each item keeps its original Copy button.
- **📱 Mobile** / **🖱️ Desktop** — the same library sliced by input modality: touch-native (tap, swipe, drag, long-press) versus pointer-native (cursor-follow, hover-tilt, magnetic pull).
- **🎨 Idea Gallery** — an interactive playground: paste code, tweak variables, preview live.

### "Facets" — new & updated markers

Prism calls its elements **facets**. The latest release added **528 new facets** across the galleries — including four brand-new galleries (Maps & Geo, Notifications & Status, Architecture Diagrams, Callouts & Annotations) — each marked with a green **NEW** badge and a subtle pulse. When a facet is repaired or refreshed, it's re-tagged with a blue **UPDATED** badge instead — so the gallery visually distinguishes brand-new work from fixes. Both are collected automatically on the **New Facets** page.

### ▶ Play Animations

Every tile whose visual actually runs a CSS animation gets a small ▶ button in its corner — click it to replay that one effect on demand, without waiting for its loop to come back around. Each gallery page also gets a floating **REPLAY ANIMATIONS** button that retriggers every animated tile on screen at once, handy for demos or screen recordings. Static tiles (resting form fields, playground panes) get no button, since there's nothing to replay. The control is theme-aware — it re-skins with the active theme's accent/panel colors — and lives outside each tile's `.stage`, so it never shows up in a **Copy**'d snippet.

## Themes

A theme picker in the sidebar re-skins the entire tool — shell *and* every gallery — by overriding a shared set of CSS custom properties. Three themes ship:

- **Prism** — the default dark palette with the signature amber accent
- **OLED** — true-black, cyan/magenta accents
- **Cyberpunk** — neon purple/pink/yellow

Because every element reads from the same `--accent`, `--info`, `--pos`, `--bg`, `--ink` … token set, one override reskins everything at once. Your theme choice persists across sessions.

## How the page is built

`Prism.html` is a **shell + iframe** single-page app:

- A fixed left **rail** provides navigation, the theme picker, and an auto-generated "On this page" sub-nav with per-section item counts.
- Each gallery is stored as an inert `<script type="text/html" id="pg-…">` template. When you navigate, the controller injects that template into an **iframe** via `srcdoc`, so each gallery renders in isolation (its own styles and scripts can't leak into the others).
- The **New Facets** page is assembled on the fly: it harvests every `.is-new` / `.is-fixed` tile from all templates, carries each page's own CSS and (isolated) init scripts, and stitches them into one document so harvested effects animate exactly as they do at home.

Copy buttons come in two flavors: `copyViz()` reconstructs a fully self-contained snippet (markup **+** the exact CSS rules and keyframes it uses, extracted live from the stylesheet), while `data-snip` buttons copy an author-curated minimal snippet (often just the class list to apply).

## 🧩 The JSON island — why Prism is MCP-ready

At the very top of `Prism.html`'s `<head>` sits a single tag:

```html
<script type="application/json" id="prism-catalog"> … </script>
```

This is the **JSON island**: a complete, machine-readable catalog of every effect in the file (~3.2 MB), embedded right alongside the human UI. An HTML comment at the top of the document points agents straight to it. Because it's inline JSON, an agent doesn't need to scrape the DOM or understand the page's rendering — it just:

```js
const catalog = JSON.parse(document.getElementById('prism-catalog').textContent);
catalog._ai;          // read this first: what/howToUse/fields/count
catalog.effects;      // 1235 records, each with self-contained html + css
```

### Why this design is *MCP-ready*

The [Model Context Protocol](https://modelcontextprotocol.io) lets an AI agent call tools over a well-defined resource. Prism's island is purpose-built to back exactly that kind of server, because every property an MCP tool needs is already precomputed and self-describing:

- **Self-describing header.** The `_ai` key literally tells the model what the catalog is, how to use it, and what fields each record has — so a fresh agent orients itself with zero prior knowledge.
- **Every record is composable in isolation.** Each effect ships its own `html` **and** `css` (plus `classes`, `keyframes`, `params`, `needsJs`, `usableAsBackground`, `selfContained`). An agent can drop an effect into a document without loading the rest of the file.
- **Searchable/filterable dimensions.** `gallery`, `category` (152 of them), `tags`, `ref`, and `description` make `list`, `search`, and `filter` tools trivial to implement.
- **Composition rules are encoded, not implied.** The top-level `tokens.css`, `usage` (compose / recolor / markers), and `galleries` blocks give a `compose()` tool everything it needs to assemble a valid, themeable, self-contained document.
- **Truly offline.** Since no effect references anything external, composed output is portable by construction — ideal for handing back a finished artifact.

### Effect record schema

Each entry in `effects[]`:

```jsonc
{
  "id": "charts-gauge-cluster",     // stable, unique — what an agent references
  "name": "Gauge Cluster",
  "gallery": "charts",              // charts|fx|lab|ai|objects|input|text|shapes|maps|notify|arch|callouts
  "category": "Gauges & Dials",
  "ref": ".nch-gaugetri",           // canonical selector
  "description": "Three half-gauges with sweeping needles…",
  "classes": ["nch-gaugetri", …],
  "keyframes": ["nchNeedle3"],
  "params": { "color": { "var": "--c", "rgbVar": "--c-rgb", … } },
  "tags": ["charts", "animated", "updated", "fixed"],
  "usableAsBackground": false,      // full-bleed layer meant to sit behind content?
  "needsJs": null,                  // key into an initializer, or null
  "selfContained": false,           // true = renders from html alone (inline styles)
  "isNew": false, "isFixed": true,  // release markers (green NEW / blue UPDATED)
  "html": "<div class=\"nch-gaugetri\">…</div>",
  "css":  ".nch-gaugetri{…} @keyframes nchNeedle3{…}",
  "dataSnip": null                  // author-curated minimal snippet, if any
}
```

Top-level also carries `tokens.css` (the `:root` design tokens + `.c-*` color classes — include once globally), `usage` (composition rules), and `galleries` / `categories` for browsing.

### Composing an effect

1. Ensure `tokens.css` is present once in the document.
2. Insert `effect.html`.
3. Include `effect.css`.
4. If `effect.needsJs`, run the matching initializer once **after** the markup is in the DOM.
5. If `effect.params.color` exists, set `--c` / `--c-rgb` (or add a `.c-*` class) to recolor.

A natural MCP server over this catalog would expose tools like `list_effects(gallery?, tag?, category?)`, `search_effects(query)`, `get_effect(id)`, `get_background_layers()`, and `compose(ids[], { color? })`.

## Repository layout

```
.
├── Prism.html          ← the whole tool: UI + all galleries + the JSON island
├── README.md           ← you are here
├── catalog/            ← the catalog + the maintenance pipeline
│   ├── manifest.json      full catalog (source of truth for the island)
│   ├── index.json         slim discovery index (no html/css) for fast search
│   ├── extract-from-prism.mjs   regenerate the manifest from Prism.html (headless Chrome)
│   ├── _embed-catalog.mjs       embed the manifest into the #prism-catalog island
│   ├── _scaffold.mjs            assemble a brand-new gallery template from a body + css draft
│   ├── _splice.mjs              splice a drafted gallery fragment into Prism.html
│   ├── _find_broken.mjs         headless render-check: flag facets that don't render
│   ├── _shoot.mjs               screenshot new/updated facets for visual review
│   ├── drafts/ · additions/     work-in-progress fragments & generators
│   └── PROGRESS.log             build log
└── fragments/          ← standalone gallery fragments (mobile / desktop / text)
```

### Regenerating the catalog

The JSON island is **derived**, not hand-maintained. After editing any gallery, refresh it so the AI catalog stays in sync with what's on the page:

```bash
node catalog/extract-from-prism.mjs   # loads Prism.html in headless Chrome, re-extracts every effect
node catalog/_embed-catalog.mjs       # embeds the fresh manifest into the #prism-catalog island
```

> Requires Node and Google Chrome (used headlessly via the DevTools Protocol — no extra packages).

## Design principles

- **Offline & self-contained.** No external fonts, scripts, images, or network — ever.
- **Copy-paste ready.** Every element yields a snippet that renders on its own.
- **Token-themed.** Effects read shared CSS variables, so one theme override reskins everything.
- **Namespaced.** Each effect's classes/keyframes are prefixed to avoid collisions when composed together.
- **Accessible motion.** Effects honor `prefers-reduced-motion`.
- **Dual-purpose by design.** The same file is a human gallery and an agent-readable catalog.

---

<div align="center">
<sub>Single-file · offline · MCP-ready — <b>One prism. Every facet of your report.</b></sub>
</div>
