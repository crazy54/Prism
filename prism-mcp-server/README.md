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

Restart Claude Desktop; the 21 Prism tools appear in the tools menu.

## Use with the Anthropic API

The Messages API accepts local MCP servers via the `mcp_servers` parameter (stdio). Point it at the same `command`/`args` as above. See `examples/anthropic_api.md` for a full request example and a runnable Tool-Runner snippet using the Anthropic SDK.

---

## Tools (21)

### Discovery (6)
| Tool | Purpose |
|------|---------|
| `list_effects` | List effects with filters (gallery, tag, componentType, background, new) + pagination. Returns light metadata. |
| `search_effects` | Ranked full-text search over id/name/description/tags/category. |
| `get_effect` | Full record for one effect incl. production-ready `html`/`css`. |
| `get_theme_variants` | Theme token reference + how to recolor an effect. |
| `list_galleries` | All galleries with declared vs. live effect counts. |
| `get_catalog_stats` | Aggregate stats: per-gallery counts, tags, componentTypes, etc. |

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
| `export_collection` | Export a self-contained bundle from a saved `collectionId`, an explicit set of `ids`, or a whole gallery. `format`: `bundle` (CSS+HTML, default), `document` (full `<html>`), or `schema` (portable `prism-collection-1.0` JSON, saved collections only). |
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
│   └── index.js      # the 21 tool definitions (name, description, schema, handler)
├── utils/
│   ├── catalog.js    # CatalogStore: load island/manifest, index, hot reload, runtime facets
│   ├── collections.js# CollectionStore: disk-backed named sets + prism-collection-1.0 export
│   ├── css.js        # split/dedupe/merge/validate CSS; token extraction
│   ├── compose.js    # composition engine + layout templates
│   ├── validate.js   # facet + composition validation
│   └── logger.js     # stderr logger (never pollutes the stdio JSON-RPC channel)
├── examples/         # one example request/response per tool + integration configs
└── test/             # node:test integration + unit tests (80 tests)
```

**Server model.** `new PrismMCPServer(catalogPath, opts)` builds the tool registry and a `CatalogStore`. `await server.load()` reads + indexes the catalog. `server.connect(transport)` wires a transport; `StdioTransport` implements newline-delimited JSON-RPC on stdin/stdout. The transport is pluggable — implement `onMessage(cb)` / `send(obj)` to add HTTP/SSE.

**Error handling.** Protocol errors (bad method / unknown tool) return JSON-RPC errors. Tool-level failures (unknown id, validation failure) return an MCP tool result with `isError: true` and a structured `{error, code, data}` payload with actionable messages and suggestions.

**Logging.** Request + composition trace logs go to **stderr** (stdout is reserved for the JSON-RPC channel). Control verbosity with `--log-level` or `PRISM_MCP_LOG_LEVEL`.

---

## Testing

```bash
node --test          # or: npm test
```

50 tests cover every tool, the CSS/compose/validate utilities, the JSON-RPC protocol layer, and loading the real `Prism.html` island.

---

## License

MIT
