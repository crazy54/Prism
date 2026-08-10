# Prism MCP — example tool calls

One example per tool. Each shows the **`tools/call` request** (the `params` an
MCP client sends) and the **shape of the result** (the JSON the tool returns,
which the server wraps in `content: [{ type: "text", text: "<json>" }]`).

Response payloads below are trimmed/elided (`…`) for readability; run
`node cli.js info` and the tools against your own `Prism.html` for live data.

---

## Discovery

### `list_effects`
Request:
```json
{ "name": "list_effects", "arguments": { "gallery": "charts", "tag": "kpi", "limit": 2 } }
```
Result:
```json
{
  "total": 37,
  "offset": 0,
  "limit": 2,
  "returned": 2,
  "items": [
    { "id": "charts-mini-kpi-row", "name": "Mini KPI Row", "gallery": "charts",
      "tags": ["kpi","charts"], "componentType": "widget",
      "usableAsBackground": false, "needsJs": null, "hasHtml": true, "hasCss": true }
  ]
}
```

### `search_effects`
Full-text query, faceted filters, or both. `filters` narrows by facet (OR within a
facet; `tags` is AND; AND across facets) plus boolean flags. `sort` is one of
`relevance` (default when a query is present), `name`, `newest`, `gallery`.

Request (query + facets):
```json
{
  "name": "search_effects",
  "arguments": {
    "query": "pulsing kpi card",
    "filters": { "galleries": ["charts"], "interactions": ["auto-play"], "isNew": true },
    "sort": "relevance",
    "limit": 3
  }
}
```
Result:
```json
{
  "query": "pulsing kpi card",
  "sort": "relevance",
  "filters": { "galleries": ["charts"], "interactions": ["auto-play"], "isNew": true },
  "total": 3,
  "offset": 0,
  "limit": 3,
  "returned": 3,
  "items": [
    { "id": "charts-mini-kpi-row", "name": "Mini KPI Row", "score": 15,
      "interactions": ["auto-play"], "spectrum": null, "hasCss": true }
  ]
}
```
`query` is optional when at least one filter is given (e.g. browse a gallery by
`{ "filters": { "galleries": ["fx"] }, "sort": "newest" }`). The legacy
`{ "query": "...", "gallery": "fx" }` shape still works.

### `get_available_filters`
Request:
```json
{ "name": "get_available_filters", "arguments": { "topValues": 5 } }
```
Result:
```json
{
  "totalEffects": 1668,
  "facets": {
    "gallery": { "label": "Gallery", "multi": false, "filterKey": "galleries",
      "totalValues": 15, "values": [ { "value": "spectrums", "count": 266 }, { "value": "charts", "count": 209 } ] },
    "interaction": { "label": "Interaction", "normalized": true, "filterKey": "interactions",
      "totalValues": 10, "values": [ { "value": "auto-play", "count": 895 }, { "value": "static", "count": 448 } ] }
  },
  "booleanFlags": {
    "isNew": { "label": "New", "count": 950 },
    "usableAsBackground": { "label": "Usable as background", "count": 10 }
  },
  "sorts": ["relevance","name","newest","gallery"],
  "notes": ["tags filter uses AND …", "interaction values are normalized …"]
}
```

### `list_filter_values`
Enumerate one facet in full (useful for high-cardinality facets like the 175 categories).
Request:
```json
{ "name": "list_filter_values", "arguments": { "facet": "category", "prefix": "3d", "limit": 5 } }
```
Result:
```json
{
  "facet": "category", "label": "Category",
  "total": 4, "offset": 0, "limit": 5, "returned": 4,
  "items": [ { "value": "3D Charts & Graphs", "count": 21 }, { "value": "3D Objects", "count": 18 } ]
}
```
Unknown facet → tool error `invalid_argument` with `data.validFacets`.

### `create_saved_search`
Request:
```json
{
  "name": "create_saved_search",
  "arguments": {
    "name": "New glassy charts",
    "query": "kpi",
    "filters": { "galleries": ["charts"], "spectrums": ["glassmorphism"] },
    "sort": "newest"
  }
}
```
Result:
```json
{
  "created": "new-glassy-charts",
  "savedSearch": { "id": "new-glassy-charts", "name": "New glassy charts",
    "query": "kpi", "filters": { "galleries": ["charts"], "spectrums": ["glassmorphism"] },
    "sort": "newest", "createdAt": "2026-08-02T…Z" },
  "total": 1
}
```
Needs a query and/or at least one filter, else tool error `invalid_argument`.

### `get_saved_searches`
Request:
```json
{ "name": "get_saved_searches", "arguments": {} }
```
Result:
```json
{ "total": 1, "items": [ { "id": "new-glassy-charts", "name": "New glassy charts", "…": "…" } ] }
```

### `execute_saved_search`
Request:
```json
{ "name": "execute_saved_search", "arguments": { "id": "new-glassy-charts", "limit": 3 } }
```
Result: same shape as `search_effects`, prefixed with the saved-search identity:
```json
{
  "savedSearch": { "id": "new-glassy-charts", "name": "New glassy charts" },
  "query": "kpi", "sort": "newest", "total": 3, "items": [ "…" ]
}
```
Unknown id → tool error `not_found` with `data.available` (the known ids).

### `get_effect`
Request:
```json
{ "name": "get_effect", "arguments": { "id": "charts-mini-kpi-row" } }
```
Result (full record):
```json
{
  "id": "charts-mini-kpi-row",
  "name": "Mini KPI Row",
  "gallery": "charts",
  "description": "…",
  "classes": ["kpi-row","kpi"],
  "tags": ["kpi","charts"],
  "needsJs": null,
  "usableAsBackground": false,
  "html": "<div class=\"kpi-row\">…</div>",
  "css": ".kpi-row{…}"
}
```
Pass `"includeCss": false` / `"includeHtml": false` to omit the heavy fields.
Unknown id → tool error `not_found` with a `data.suggestions` array.

### `get_theme_variants`
Request:
```json
{ "name": "get_theme_variants", "arguments": {} }
```
Result:
```json
{
  "tokensCss": ":root{--bg:…;--accent:…}",
  "semanticTokens": ["--accent","--info","--pos","--neg","--warn","--crit"],
  "surfaceTokens": ["--bg","--panel","--panel2","--card","--line","--ink","--muted","--dim"],
  "recolor": "Set --c and --c-rgb (or add a c-* class like c-pos) on the effect element to recolor it.",
  "builtInThemes": ["prism","oled","cyberpunk"]
}
```

### `list_galleries`
Request:
```json
{ "name": "list_galleries", "arguments": {} }
```
Result (declared vs. live counts catch a stale manifest):
```json
{
  "total": 15,
  "items": [
    { "id": "charts", "title": "Charts & Data", "declaredCount": 210, "liveCount": 210 },
    { "id": "fx", "title": "Backgrounds & FX", "declaredCount": 96, "liveCount": 96 }
  ]
}
```

### `get_catalog_stats`
Request:
```json
{ "name": "get_catalog_stats", "arguments": {} }
```
Result:
```json
{
  "totalEffects": 1668,
  "galleryCount": 15,
  "byGallery": { "charts": 210, "fx": 96, "…": 0 },
  "backgroundCapable": 140,
  "needsJs": 55,
  "uniqueTags": 320,
  "topTags": [ { "tag": "charts", "count": 210 } ]
}
```

---

## Component Variant Matrix

Prism themes are pure `:root` token overrides applied over identical component
HTML/CSS, so a "variant" is one component under a different token set. These
tools return token maps + overrides — never N rendered copies.

### `get_theme_palette`
Request (one theme; omit `theme` for all five):
```json
{ "name": "get_theme_palette", "arguments": { "theme": "oled-dark" } }
```
Result:
```json
{
  "id": "oled-dark", "name": "OLED", "mode": "dark", "builtin": true,
  "tokens": { "--bg": "#000000", "--accent": "#ffb300", "…": "…" },
  "overrides": { "--bg": "#000000", "--accent": "#ffb300", "…": "…" },
  "overrideCount": 21,
  "css": ":root{ /* OLED */\n  --bg: #000000;\n  --accent: #ffb300;\n  … }"
}
```

### `get_component_variants`
Request:
```json
{ "name": "get_component_variants", "arguments": { "id": "charts-big-metric-count-up", "themes": ["prism-dark","cyberpunk-dark"] } }
```
Result (one payload, one entry per theme):
```json
{
  "id": "charts-big-metric-count-up", "name": "Big Metric + Count-Up",
  "themeSensitive": true, "usesTokens": ["--muted","--accent"],
  "note": "One payload, many variants: render = html + css + the chosen theme's token overrides on :root.",
  "html": "<div …>$1,284,500</div>",
  "variantCount": 2,
  "variants": [
    { "theme": "prism-dark", "name": "Prism", "mode": "dark", "overrides": {}, "relevantOverrides": {}, "rootCss": ":root{ /* Prism */ … }" },
    { "theme": "cyberpunk-dark", "name": "Cyberpunk", "mode": "dark",
      "relevantOverrides": { "--muted": "#b39ddb", "--accent": "#fee600" }, "rootCss": ":root{ /* Cyberpunk */ … }" }
  ]
}
```

### `get_variants_for_theme`
Request:
```json
{ "name": "get_variants_for_theme", "arguments": { "theme": "cyberpunk-dark", "gallery": "charts", "themeSensitiveOnly": true, "limit": 2 } }
```
Result:
```json
{
  "theme": { "id": "cyberpunk-dark", "name": "Cyberpunk", "mode": "dark" },
  "overrides": { "--accent": "#fee600", "…": "…" },
  "total": 190, "offset": 0, "limit": 2, "returned": 2,
  "items": [
    { "id": "charts-big-metric-count-up", "name": "Big Metric + Count-Up",
      "themeSensitive": true, "usesTokens": ["--muted","--accent"],
      "tokenValues": { "--muted": "#b39ddb", "--accent": "#fee600" } }
  ]
}
```

---

## Composition

### `compose`
Request:
```json
{
  "name": "compose",
  "arguments": {
    "ids": ["charts-mini-kpi-row", "fx-aurora-veil"],
    "includeTokens": true,
    "wrap": { "tag": "section", "className": "dashboard" }
  }
}
```
Result:
```json
{
  "ok": true,
  "html": "<section class=\"dashboard\">…</section>",
  "css": ":root{…}\n.kpi-row{…}\n.aurora{…}",
  "effects": ["charts-mini-kpi-row","fx-aurora-veil"],
  "initializers": [],
  "warnings": [],
  "validation": { "valid": true },
  "metrics": {
    "naiveCssLength": 8120,
    "finalCssLength": 7440,
    "duplicatesRemoved": 3,
    "reductionPct": 8.4,
    "composeMs": 2
  }
}
```
Unknown id → tool error `compose_failed` with `data.missing`.

### `compose_with_template`
Request:
```json
{
  "name": "compose_with_template",
  "arguments": { "ids": ["charts-mini-kpi-row","charts-kpi-tile-delta"], "template": "grid" }
}
```
Result: same shape as `compose`, plus `"template": "grid"`, with the effects
wrapped in `.prism-compose-grid` and the grid CSS appended. Templates:
`stack`, `row`, `grid`, `card`.

### `validate_composition`
Request:
```json
{ "name": "validate_composition", "arguments": { "ids": ["fx-wind-field","ghost-effect"] } }
```
Result:
```json
{
  "valid": false,
  "errors": ["Unknown effect id: ghost-effect"],
  "warnings": ["fx-wind-field needs a JS initializer: wind-init"],
  "missing": ["ghost-effect"],
  "resolved": ["fx-wind-field"]
}
```

---

## Content creation

### `validate_facet`
Request:
```json
{
  "name": "validate_facet",
  "arguments": {
    "id": "charts-spark-badge",
    "name": "Spark Badge",
    "gallery": "charts",
    "description": "A compact sparkline badge for tiny trends.",
    "html": "<span class=\"spark-badge\"></span>",
    "css": ".spark-badge{color:var(--accent)}"
  }
}
```
Result:
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "checks": { "id": true, "name": true, "gallery": true, "html": true, "css": true }
}
```
Bad id (`Charts_Bad`) → `valid:false` with an error mentioning `kebab-case`.
Unknown token (`var(--made-up)`) → a warning; unbalanced braces → an error.

### `create_facet`
Request:
```json
{
  "name": "create_facet",
  "arguments": {
    "id": "charts-spark-badge",
    "name": "Spark Badge",
    "gallery": "charts",
    "description": "A compact sparkline badge for tiny trends.",
    "html": "<span class=\"spark-badge\"></span>",
    "css": ".spark-badge{color:var(--accent)}",
    "tags": ["charts","sparkline"]
  }
}
```
Result:
```json
{
  "created": "charts-spark-badge",
  "persisted": false,
  "note": "Registered in live catalog (in-memory). Run the embed pipeline to persist into Prism.html.",
  "effect": { "id": "charts-spark-badge", "name": "Spark Badge", "…": "…" }
}
```
It is discoverable immediately (`get_effect`/`search_effects`). Duplicate id →
tool error `validation_failed`.

### `update_facet`
Request:
```json
{
  "name": "update_facet",
  "arguments": { "id": "charts-spark-badge", "description": "Now with a hover tooltip." }
}
```
Result:
```json
{ "updated": "charts-spark-badge", "persisted": false, "effect": { "…": "…" } }
```
Unknown id → tool error `not_found`.

---

## Catalog management

### `get_catalog_metadata`
Request:
```json
{ "name": "get_catalog_metadata", "arguments": {} }
```
Result:
```json
{
  "name": "prism-effects",
  "version": "0.1.0",
  "source": "Prism.html island",
  "galleryCount": 15,
  "effectCount": 1668,
  "runtimeFacetCount": 0,
  "filePath": "C:/…/Prism.html",
  "hotReload": true
}
```

### `export_collection`
Request:
```json
{
  "name": "export_collection",
  "arguments": { "gallery": "charts", "title": "Charts Kit", "format": "document" }
}
```
Result:
```json
{
  "title": "Charts Kit",
  "effects": ["charts-mini-kpi-row","…"],
  "css": ":root{…}\n…",
  "html": "…",
  "initializers": [],
  "metrics": { "duplicatesRemoved": 12, "reductionPct": 6.1 },
  "document": "<!DOCTYPE html>\n<html lang=\"en\">…</html>"
}
```
Source priority: `collectionId` (a saved collection) > explicit `ids` > `gallery`; none → tool error `invalid_argument`.
`format` is `bundle` (default; `css` + `html` only), `document` (adds a full `<html>`), or `schema`
(the portable `prism-collection-1.0` JSON — see below; requires a `collectionId`).
`asDocument: true` is a deprecated alias for `format: "document"`.

### `get_token_reference`
Request:
```json
{ "name": "get_token_reference", "arguments": {} }
```
Result:
```json
{
  "tokensCss": ":root{--bg:…}",
  "tokens": [
    { "token": "--bg", "purpose": "Page background base" },
    { "token": "--accent", "purpose": "Brand / primary accent (also --accent-rgb)" }
  ],
  "recolorClasses": ["c-accent","c-info","c-pos","c-warn","c-neg","c-crit"]
}
```

---

## Collections & favorites

Saved, named sets of effects that persist across sessions (disk-backed JSON).

### `create_collection`
Request:
```json
{
  "name": "create_collection",
  "arguments": {
    "name": "Dashboard Kit",
    "description": "KPI tiles I reuse across dashboards",
    "effectIds": ["charts-kpi-pulse", "charts-kpi-delta"],
    "tags": ["dashboards", "kpi"]
  }
}
```
Result:
```json
{
  "id": "e5b1…-uuid",
  "name": "Dashboard Kit",
  "description": "KPI tiles I reuse across dashboards",
  "version": "1.0",
  "tags": ["dashboards","kpi"],
  "components": [
    { "id": "charts-kpi-pulse", "name": "Pulsing KPI Card", "gallery": "charts" },
    { "id": "charts-kpi-delta", "name": "KPI Delta Tile", "gallery": "charts" }
  ],
  "createdAt": "2026-08-02T00:00:00.000Z",
  "updatedAt": "2026-08-02T00:00:00.000Z"
}
```
Effect ids are validated against the catalog (unknown ids → `not_found`). Constraints:
name ≤50 chars & unique (`duplicate_name`), description ≤200 chars, ≤5 tags, ≤50 components.

### `list_collections`
Request:
```json
{ "name": "list_collections", "arguments": {} }
```
Result:
```json
{
  "total": 1,
  "items": [
    { "id": "e5b1…-uuid", "name": "Dashboard Kit", "componentCount": 2,
      "tags": ["dashboards","kpi"], "updatedAt": "2026-08-02T00:00:00.000Z" }
  ]
}
```

### `get_collection`
Request:
```json
{ "name": "get_collection", "arguments": { "collectionId": "e5b1…-uuid" } }
```
Returns the full record incl. its `components` list (unknown id → `not_found`).

### `add_to_collection`
Request:
```json
{ "name": "add_to_collection", "arguments": { "collectionId": "e5b1…-uuid", "effectIds": ["fx-wind-bg"] } }
```
Result:
```json
{ "collection": { "…": "…", "components": ["…", "fx-wind-bg"] }, "added": 1, "skipped": 0 }
```
Ids already present are skipped; exceeding 50 components → `limit_exceeded`.

### `remove_from_collection`
Request:
```json
{ "name": "remove_from_collection", "arguments": { "collectionId": "e5b1…-uuid", "effectIds": ["fx-wind-bg"] } }
```
Result:
```json
{ "collection": { "…": "…" }, "removed": 1 }
```

### `delete_collection`
Request:
```json
{ "name": "delete_collection", "arguments": { "collectionId": "e5b1…-uuid" } }
```
Result:
```json
{ "deleted": "e5b1…-uuid" }
```

### Export a saved collection for the Prism.html UI
Request:
```json
{ "name": "export_collection", "arguments": { "collectionId": "e5b1…-uuid", "format": "schema" } }
```
Result — the portable `prism-collection-1.0` object the in-browser Collections panel imports:
```json
{
  "__schema": "prism-collection-1.0",
  "name": "Dashboard Kit",
  "description": "KPI tiles I reuse across dashboards",
  "version": "1.0",
  "exportedAt": "2026-08-02T00:00:00.000Z",
  "color": null, "icon": null,
  "tags": ["dashboards","kpi"],
  "components": [
    { "id": "charts-kpi-pulse", "name": "Pulsing KPI Card", "gallery": "charts" },
    { "id": "charts-kpi-delta", "name": "KPI Delta Tile", "gallery": "charts" }
  ],
  "componentCount": 2,
  "totalSize": 812
}
```

---

## Raw stdio session (no client library)

You can drive the server by piping newline-delimited JSON-RPC to it:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_effects","arguments":{"query":"pulsing kpi"}}}' \
  | node cli.js start --catalog ../Prism.html --log-level silent
```

Each response is one line of JSON on stdout; logs (if any) go to stderr.
