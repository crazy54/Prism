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
```

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
