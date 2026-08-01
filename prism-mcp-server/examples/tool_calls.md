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
Request:
```json
{ "name": "search_effects", "arguments": { "query": "pulsing kpi card", "limit": 3 } }
```
Result:
```json
{
  "query": "pulsing kpi card",
  "total": 3,
  "items": [
    { "id": "charts-mini-kpi-row", "name": "Mini KPI Row", "score": 15, "hasCss": true }
  ]
}
```

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
  "arguments": { "gallery": "charts", "title": "Charts Kit", "asDocument": true }
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
Provide `ids` **or** `gallery`; neither → tool error `invalid_argument`.
Omit `asDocument` to get just the reusable `css` + `html` bundle.

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
