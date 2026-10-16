# Prism website

The source for [prism.jeremyfhall.com](https://prism.jeremyfhall.com). Everything on the site is built from this repository: static files only, no external assets, no package installation, no runtime dependencies.

| Source | Becomes | What it is |
|---|---|---|
| `index.html`, `styles.css`, `app.js`, `assets/` | `/` | the landing page: real catalog previews, searchable gallery links, copyable snippets, light/dark themes, motion controls, and quick starts for browsers, terminals and agents |
| `../Prism.html` | `/Prism.html` | the web catalog, with the terminal catalog's island embedded next to its own |
| `terminal/index.html`, `terminal/terminal.js` | `/terminal/` | the terminal catalog in the browser: every tile runs the real facet code |
| `terminal/tty.html`, `terminal/tty.js` | `/terminal/tty.html` | directions for browsing from a terminal, with a live preview of every curl page |
| `terminal/terminal.css`, `terminal/site.js` | | shared by both terminal pages: styles, engine paths, the terminal theme that follows Night/Day |
| `deck/index.html`, `deck/deck.css`, `deck/deck.js` | `/deck/` | the Stream Deck catalog: virtual devices (Galleon 100 SD, Stream Deck +, MK.2, XL, + XL, Neo, Mini) playing every deck facet live through prism-deck's browser runtime, a detail view, and the plugin / icon-pack / profile downloads |
| `assets/site.css`, `assets/site.js` | | chrome shared by every page: Inter, the glass top bar with the Web · Terminal · Stream Deck switcher, Night/Day with the relight sweep, First Light, copy and toast |
| `assets/rf/`, `assets/fonts/`, `assets/brand/`, favicons | | the Refraction design language, vendored from `../design/` by `scripts/sync-refraction.mjs` |
| `assets/deck/` | | the deck adapter (`adapter.js`) plus a sketch runtime it falls back to if prism-deck can't load |
| `../prism-term/src/site/tty.js` | `/tty`, `/t/…`, `/f/…` | the terminal site: ANSI pages for `curl`, each with `.txt` and `.24` variants |
| `../prism-term/` | `/dl/prism-term.tgz` | the packed engine the live player runs through `npx` |

## Design language

The site wears Refraction, the same tokens Prism.html uses (`../design/tokens.json`). Design files are vendored, never edited here:

```sh
node website/scripts/sync-refraction.mjs           # copy prism.css, the mark, First Light, Inter, icons, λ labels
node website/scripts/sync-refraction.mjs --check   # exit 1 if anything is out of date
```

It also fills each page's `<!--rf:icons-->` sprite with exactly the icons the page uses and every `data-rf-lambda="<id>"` label. Night/Day is stored as `localStorage['prism-site-theme']` (`dark` | `light`); a first visit follows `prefers-color-scheme`. `?fl=<ms>` freezes First Light at a moment for review (`?fl=echo:<ms>`, `?fl=off`).

## Build

From the repository root, with Node.js 18+:

```sh
node website/build.mjs                    # → site-dist/
node website/build.mjs /path/to/output    # or any dedicated output directory
```

The output directory is wiped and rebuilt on every run, so it must be a dedicated directory: the build refuses the repository root or `website/` itself. `site-dist/` is git-ignored.

The build writes:

| Output | Contents |
|---|---|
| `index.html`, `styles.css`, `app.js`, `assets/` | the landing page |
| `Prism.html` | the web catalog, carrying both JSON islands: `#prism-catalog` and `#prism-terminal-catalog` |
| `terminal/` | the terminal catalog and directions pages, with `engine/` (the browser-safe prism-term engine and `catalog/terminal-catalog.json`) and `tty-preview/` (HTML previews of the curl pages) |
| `tty`, `t/`, `f/` | the terminal site: home, `t/help`, `t/all`, one `t/<gallery>` page per gallery and one `f/<facet-id>` page per facet, each with `.txt` and `.24` variants |
| `dl/prism-term.tgz` | the live player for `npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term` |
| `sitemap.xml`, `robots.txt`, `CNAME`, `.nojekyll` | crawler and GitHub Pages files (the sitemap lists HTML pages only) |

Along the way it:

- **Regenerates the landing-page previews.** Six CSS-only previews in `assets/previews/`, plus `assets/showcase.json` and `assets/galleries.json`, are rebuilt from the `#prism-catalog` island in `Prism.html`. These files are written into `website/assets/` in the source tree, so commit them when they change. Values shown in the previews are original sample data.
- **Fills live numbers.** The text of each marked element is replaced with the current value:

  | Marker | Value |
  |---|---|
  | `data-web-stat="facets"`, `data-web-stat="galleries"` | web catalog effect and gallery counts |
  | `data-web-stat="gallery:<id>"` | one web gallery's count (ids as in `assets/galleries.json`) |
  | `data-terminal-stat="facets"`, `data-terminal-stat="galleries"` | terminal catalog facet and gallery counts |
  | `data-mcp-tools` | MCP tool count |
  | `data-prism-size` | size of the built `Prism.html` |

  The value in the source file is only a fallback. Each marked element must hold plain text, and an unknown key fails the build. Afterwards the build checks that the landing page lists every web gallery and that its counts add up to the catalog.
- **Wires up the terminal pages.** `terminal/*.html` refer to the engine as `../../prism-term/…` so they work straight from the repository. The build rewrites those references to `./engine/…`. It also fills the empty `<script type="application/json" id="prism-terminal-catalog"></script>` placeholder in `terminal/index.html` with a lean copy of the island: everything except `sources` and each facet's `preview` (the page renders tiles live from the engine modules). The full island, `sources` included, goes into `Prism.html` and `terminal/engine/catalog/terminal-catalog.json`.

## Fails loudly

The build is deterministic and stops on any of these:

- `prism-term/catalog/terminal-catalog.json` is stale — run `npm run catalog` in `prism-term/`
- the `#prism-terminal-catalog` island in `Prism.html` is missing or stale — run `npm run island` in `prism-term/`
- `terminal/index.html` is missing, or has no island placeholder
- a relative link on the landing or terminal pages doesn't resolve to a built file
- the landing page doesn't list every web gallery, or its counts don't add up to the catalog
- a live-number marker has an unknown key or holds markup
- a preview facet isn't CSS-only

For local work, `--allow-stale` turns the two staleness checks into warnings, and `--allow-incomplete` does the same for a missing terminal page and broken links. `--no-pack` skips the tarball.

## Preview locally

Serve the output with any static file server, then open it in a browser and `curl` it from a terminal:

```sh
python3 -m http.server 8080 --directory site-dist     # Windows: python -m http.server …
curl -sL http://localhost:8080/tty
```

Links between pages are relative, so the HTML pages work at a custom-domain root or under a GitHub Pages project path. The commands they show always point at `https://prism.jeremyfhall.com`.

## Deploy

GitHub Pages serves the `gh-pages` branch: a built `site-dist/` at the branch root. `.nojekyll` turns off Jekyll processing, so every file is served exactly as built, and `CNAME` sets the custom domain `prism.jeremyfhall.com`. Cloudflare sits in front. Publishing means replacing the branch contents with a fresh build: run all three regenerate steps first (`npm run catalog`, `npm run island`, then `node website/build.mjs` without the `--allow-*` flags).

The MCP server runs locally, not on the website; the agent workflow on the landing page is an illustration.
