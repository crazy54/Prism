# Prism MCP Server

A production-grade [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the **Prism component catalog** (1,600+ self-contained CSS/SVG facets) as a set of intelligent tools for agents and AI systems.

It lets an agent ask *"give me a pulsing KPI card with a wind backdrop"* and get back **production-ready HTML/CSS** — discovered, composed, deduplicated, and validated.

- **Zero runtime dependencies** — pure Node.js (≥18). Speaks MCP JSON-RPC 2.0 over stdio, the transport used by Claude Desktop and the Anthropic API's local MCP integration.
- **Reads the authoritative catalog** — points at `Prism.html` (the embedded `#prism-catalog` JSON island, which is the source of truth) or a `catalog/manifest.json`.
- **Hot reload** — edits to the catalog file are picked up without a restart.
- **Composition intelligence** — merges HTML, deduplicates CSS rules, collapses `:root` token blocks, validates output, and reports size savings.

---

## Quick start

```bash
cd prism-mcp-server

# Inspect the catalog (no server; prints stats and exits)
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
  --no-watch         Disable catalog hot reload
  --log-level <lvl>  debug | info | warn | error | silent   (default: info)
```

> **Note on `--port`:** this build speaks MCP over **stdio**, which is how Claude Desktop and the Anthropic API launch local MCP servers (as a subprocess). A `--port` flag is accepted but ignored; an HTTP/SSE transport can be added by implementing another transport against `PrismMCPServer` (see *Architecture*).

---

## Use with Claude Desktop

Add the server to your `claude_desktop_config.json` (see `examples/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": [
        "C:/path/to/prism-settings-and-custom-themes/prism-mcp-server/cli.js",
        "start",
        "--catalog",
        "C:/path/to/prism-settings-and-custom-themes/Prism.html"
      ]
    }
  }
}
```

Restart Claude Desktop; the 23 Prism tools appear in the tools menu.

## Use with the Anthropic API

The Messages API accepts local MCP servers via the `mcp_servers` parameter (stdio). Point it at the same `command`/`args` as above. See `examples/anthropic_api.md` for a full request example and a runnable Tool-Runner snippet using the Anthropic SDK.

---

## Tools (23)

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
| `get_effect` | Full record for one effect incl. production-ready `html`/`css`. |
| `get_theme_variants` | Theme token reference + how to recolor an effect. |
| `list_galleries` | All galleries with declared vs. live effect counts. |
| `get_catalog_stats` | Aggregate stats: per-gallery counts, tags, componentTypes, etc. |

> **Facets are grounded in real catalog data.** Available facets: `gallery`, `componentType`, `spectrum` (visual aesthetic), `category`, `tag`, `interaction`. Interaction values are **normalized** from noisy source data (`tatic`→`static`, `focu`→`focus`, `croll`→`scroll`, multi-value strings/arrays split). There is no `performance` field in the catalog, so that facet is intentionally omitted rather than faked. The `themeSensitive` facet is **derived** (does the component consume theme tokens?), not a stored field. Saved searches are per-process (in-memory), not persisted to disk.

### Component Variant Matrix (3)
| Tool | Purpose |
|------|---------|
| `get_theme_palette` | Token palette for one theme (or all): complete token map, overrides vs the Prism base, mode (light/dark), and a paste-ready `:root{…}` block. Themes: `prism-dark`, `oled-dark`, `cyberpunk-dark`, `light`, `dark`. |
| `get_component_variants` | Every theme variant of one component. Prism themes are pure `:root` token swaps over identical HTML/CSS, so this returns the payload **once** plus each theme's token overrides (and the subset the component actually consumes) — not N copies. |
| `get_variants_for_theme` | Components rendered under a single theme, each with the token values it uses; supports gallery/componentType/spectrum/tag + `themeSensitiveOnly` filters + pagination. |

> **Variants are token-swaps, not copies.** A "variant" is the same component under a different `:root` token set — the exact mechanism Prism's live theme engine uses. Rendering a variant = component `html` + `css` + the chosen theme's token overrides. This is why one payload yields every theme variant without multiplying storage.

### Composition (3)
| Tool | Purpose |
|------|---------|
| `compose` | Merge effects into one bundle: combined HTML + deduped/token-merged CSS + required initializers + size metrics. Optional wrapper. |
| `compose_with_template` | `compose` plus a layout template (`stack`, `row`, `grid`, `card`). |
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
| `export_collection` | Export a set of ids (or a whole gallery) as a self-contained bundle, optionally a full HTML document. |
| `get_token_reference` | Canonical CSS token reference (tokens.css + token purposes + recolor classes). |

Full parameter schemas are returned by `tools/list`. Per-tool example calls live in [`examples/`](./examples).

---

## Facet creation flow (draft → validate → register → embed)

1. Agent calls `validate_facet` (or `create_facet`, which validates first) with `{id, name, gallery, html, css, ...}`.
2. Validation checks naming (lowercase kebab-case), required metadata, HTML presence, CSS structural soundness, and token references.
3. On success `create_facet` registers the facet into the **live** catalog — it is immediately returned by `list_effects` / `search_effects` / `get_effect` with **no restart** (`persisted:false`).
4. To persist to disk, run the repository's catalog pipeline (`extract-from-prism.mjs` → `catalog/_embed-catalog.mjs`) to embed the facet into `Prism.html`. With hot reload on, the server re-reads the file and the facet becomes permanent (`persisted` on the next load).

> **Source-of-truth note:** the `#prism-catalog` island in `Prism.html` is authoritative and can be fresher than `catalog/manifest.json` on disk. Point `--catalog` at `Prism.html` for the complete catalog.

---

## Architecture

```
prism-mcp-server/
├── index.js          # PrismMCPServer (JSON-RPC dispatch) + StdioTransport
├── cli.js            # prism-mcp CLI (start / info / tools / help)
├── tools/
│   └── index.js      # the 23 tool definitions (name, description, schema, handler)
├── utils/
│   ├── catalog.js    # CatalogStore: load island/manifest, index, hot reload, runtime facets
│   ├── css.js        # split/dedupe/merge/validate CSS; token extraction
│   ├── compose.js    # composition engine + layout templates
│   ├── validate.js   # facet + composition validation
│   ├── themes.js     # canonical theme token maps (variant matrix) — mirrors Prism.html THEMES
│   └── logger.js     # stderr logger (never pollutes the stdio JSON-RPC channel)
├── examples/         # one example request/response per tool + integration configs
└── test/             # node:test integration + unit tests (90 tests)
```

**Server model.** `new PrismMCPServer(catalogPath, opts)` builds the tool registry and a `CatalogStore`. `await server.load()` reads + indexes the catalog. `server.connect(transport)` wires a transport; `StdioTransport` implements newline-delimited JSON-RPC on stdin/stdout. The transport is pluggable — implement `onMessage(cb)` / `send(obj)` to add HTTP/SSE.

**Error handling.** Protocol errors (bad method / unknown tool) return JSON-RPC errors. Tool-level failures (unknown id, validation failure) return an MCP tool result with `isError: true` and a structured `{error, code, data}` payload with actionable messages and suggestions.

**Logging.** Request + composition trace logs go to **stderr** (stdout is reserved for the JSON-RPC channel). Control verbosity with `--log-level` or `PRISM_MCP_LOG_LEVEL`.

---

## Testing

```bash
node --test          # or: npm test
```

90 tests cover every tool (incl. the variant-matrix tools + `themeSensitive` facet), the CSS/compose/validate utilities, the canonical theme token maps, the JSON-RPC protocol layer, and loading the real `Prism.html` island.

---

## License

MIT
