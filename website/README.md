# Prism website

A static project landing page with real catalog previews, searchable gallery links,
copyable snippets, light/dark themes, motion controls, and browser/MCP quick starts.
No external assets, package installation, or runtime dependencies.

Build from the repository root:

```sh
node website/build.mjs
```

The generated `site-dist/` directory contains the landing page, its assets, and the
original `Prism.html`. Serve that directory with any static host. Relative URLs
work at a GitHub Pages project path or a custom-domain root.

An optional output directory can be passed as the first argument:

```sh
node website/build.mjs /path/to/output
```

The build regenerates six CSS-only previews from the authoritative embedded
catalog and checks that the displayed gallery counts match it. Values shown in
those previews are original sample data. The agent workflow is an illustration;
the MCP server runs locally, not in the website.

GitHub Pages deployment and custom-domain configuration are deferred until the
demo has been reviewed. This change does not modify the application or MCP server.
