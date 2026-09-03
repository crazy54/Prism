# Prism catalog pipeline

The machine-readable catalog of every Prism effect lives **inside `Prism.html`** as a
JSON island: `<script type="application/json" id="prism-catalog">`. That island is the
source of truth consumed by the MCP server and any AI tooling. `catalog/manifest.json`
(+ `index.json`) is a regenerable build artifact, not the source of truth.

The pipeline re-derives the island from the live gallery templates inside `Prism.html`:

```
extract-from-prism.mjs   →  manifest.json + index.json   (headless Chrome / CDP)
_embed-catalog.mjs       →  writes the island back into Prism.html   (idempotent)
_smoke.mjs               →  validates the island parses + shell scripts syntax-check
_check_ds.mjs            →  design-system coverage & integrity gate (exit non-zero on fail)
```

All four pipeline scripts honor `PRISM_HTML` (an absolute path to an alternate copy),
so a staged temp copy can be extracted / embedded / smoke-checked / gated without
touching the repo's `Prism.html`.

## Requirements

- **Node 18+** (uses the global `fetch`/`WebSocket` and `node:` builtins only — no npm deps).
- A **Chromium-family browser**: Google Chrome, Chromium, or Microsoft Edge. They all
  speak the same DevTools protocol, so any of them works.

## Running it

From the repo root:

```bash
node catalog/extract-from-prism.mjs   # drives Prism.html in headless Chrome, writes manifest.json + index.json
node catalog/_embed-catalog.mjs       # embeds manifest.json into the #prism-catalog island in Prism.html
node catalog/_smoke.mjs               # sanity-checks the island + shell
```

A correct run reports **1668 effects across 15 galleries** (parity with the island) and
`_smoke.mjs` prints `OK island: galleries=15 effects=1668`.

> `_smoke.mjs` also prints `FAIL: shell script #1: Unexpected identifier 'the'` / `2/3
> parsed`. This is a long-standing **false positive** — the script-extraction regex
> matches an HTML comment in `<head>`, not real JS. The actual shell logic block parses
> fine. Treat "2/3 parsed" as the expected baseline.

## Design-system coverage & integrity gate (`_check_ds.mjs`)

Enforces the theme-packs epic standard on the **live catalog island**. For each
design-system family it asserts:

- **exactly 100 facets** tagged `data-spectrum=<dsShort>` (the epic coverage standard),
- **id integrity** — kebab-case, no duplicates (reuses `prism-mcp-server/utils/validate.js`),
- **offline / token-only CSS** — no `@import`, `@font-face`, `http(s)://`, or external/data
  `url()` (internal `url(#svgFilter)` fragment refs are fine), and no raw *brand* hex
  (chromatic `#rrggbb`; achromatic `#fff`/`#000`/greys are allowed for text/masks),
- **reduced-motion** — a `prefers-reduced-motion` block covering the family where it animates.

It exits non-zero on any failure, so it can gate PRs / CI.

```bash
node catalog/_check_ds.mjs                       # gate the live Prism.html
PRISM_HTML=/abs/path/copy.html node catalog/_check_ds.mjs   # gate a staged temp copy
PRISM_SYSTEMS=/abs/path/systems.json node catalog/_check_ds.mjs  # gate a staged registry
node catalog/_check_ds.mjs --only duolingo,monzo  # restrict to some families
```

**Two tiers (`catalog/systems.json`).** The registry splits families into `themePack`
(held to the full standard) and `legacy` — the original 9 spectrums (`material-ui`,
`cyberpunk-os`, …) that predate the standard, intentionally hardcode their brand palette
(the fixed palette *is* the design language's identity), use non-`dsShort` class prefixes
(`.mat-*`), and ship one shared reduced-motion block. Legacy families are reported for
information but only gated on the universal checks (id integrity, offline). We do **not**
re-author the ~1,668 existing facets. Any family present in the island that is not listed
as legacy is treated as a theme-pack and fully gated (so a freshly-staged system is checked
even before it is added to the registry); a declared `themePack` entry that is absent from
the island fails the parity check.

## Theme-pack scaffolder (`_scaffold_ds.mjs`)

The scaffolder emits a structural copy of the **reference pack, Cloudscape** — same theme
registry, same `:root`-token contract, same MCP mirror, different palette. Read
[`REFERENCE-PACK.md`](REFERENCE-PACK.md) for the canonical shape a correct pack takes in all
three files (`Prism.html` `THEME_REGISTRY`, `utils/themes.js` `THEMES[]`, `systems.json`),
why a pack ships **only** a `:root` block (F1/F2 moved all chrome onto `body.cs-light` mode
tokens), and how to verify a pack against the reference.

Turns a design-system **profile** into all the theme wiring in one command, so each
Phase-2 system is fill-in-the-blanks:

```bash
node catalog/_scaffold_ds.mjs catalog/profiles/<name>.mjs
```

A profile only needs `{ ds, dsShort, accent }` — from `accent` the scaffolder derives a
coherent starter palette for **both** color modes (layered over the Cloudscape base). To
hand-author instead, add `palette: { dark: {…}, light: {…} }`. `tokenProfile` (structural
tokens like `radius`/`font`) flows into the emitted facet-gen stub; `homeUrl`/`ticket` are
advisory. See `catalog/profiles/sample-scaffold.mjs`.

It idempotently patches four things:

1. **`Prism.html` `THEME_REGISTRY`** — adds `<dsShort>-dark` + `<dsShort>-light` entries
   (plus their `:root` token CSS consts). This is the single source of truth the shell and
   the Variant-Matrix picker read, so the pack becomes **selectable in both modes** with no
   further edits.
2. **`prism-mcp-server/utils/themes.js` `THEMES[]`** — adds the MCP mirror entries via
   `packTokens(mode, overrides)`.
3. **`catalog/systems.json` `themePack[]`** — registers the family so the F5 gate then
   holds its facets to the 100-facet standard.
4. **`catalog/profiles/<dsShort>.mjs`** — writes a facet-gen (F4) config stub.

Everything else is **self-maintaining off the theme registry** — no per-pack edits:

- the MCP tool metadata (`get_theme_variants.builtInThemes` / `note`, the `get_theme_palette`
  description + `THEME_IDS` enum) derives from `THEMES` via `themeIdList()` / `themesSummary()`;
- the `variants.test.js` theme-count assertions derive from `THEME_IDS`, so the suite passes
  at the new count with zero edits ("theme count reflects the new system" for free).

The scaffolded theme ships with **zero facets** (an "empty" pack): it is selectable and
correctly colored immediately, and the run prints a checklist of the remaining steps —
author the 100 facets with `_gen_system.mjs`, merge + re-embed the island, then gate with
`_check_ds.mjs --only <dsShort>`. Until the facets exist the F5 gate correctly fails the
pack (0 facets), which is the signal to run F4.

Staged-verification overrides (never touch the repo copies): `PRISM_HTML`,
`PRISM_MCP_THEMES`, `PRISM_SYSTEMS`, `PRISM_PROFILES_DIR`.

## Chrome resolution (cross-platform)

`catalog/_chrome.mjs` resolves a browser binary at runtime so the pipeline runs on
Windows, macOS, and Linux without edits. Order:

1. **`PRISM_CHROME`** environment variable — an explicit path to any Chromium-family
   executable. Set this if your browser is installed somewhere unusual, or to force a
   specific one.
2. Otherwise, the first existing path from a per-OS candidate list (Chrome → Chromium →
   Edge), covering the common install locations on each platform.

If nothing is found it throws with the list of locations it checked and how to set
`PRISM_CHROME`.

```bash
# Windows (cmd):     set PRISM_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
# Windows (bash):    export PRISM_CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
# macOS:             export PRISM_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Linux:             export PRISM_CHROME="/usr/bin/google-chrome"
```

## Other CDP tools (same resolver)

These visual/QA scripts share `_chrome.mjs`, so they honor `PRISM_CHROME` too:

- `_find_broken.mjs [pages…]` — flags broken/empty/unstyled `is-new`/`is-fixed` facets.
- `_shoot.mjs [pages…]` — full-page PNG of each gallery's new/fixed tiles → `catalog/shots/`.
- `_shell-shot.mjs [theme] [page] [w] [h]` — screenshot the themed shell chrome.
- `_scrollbar-shot.mjs [theme] [page]` — shell shot with scrollbars visible.
