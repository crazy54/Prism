<div align="center">

# ✦ prism-term

**Prism, in the terminal.** The terminal catalog — hundreds of animated facets you can browse with `curl` and play live — and the zero-dependency engine that draws them.

![Terminal facets](https://img.shields.io/badge/terminal%20facets-434-ff5fa2) ![Galleries](https://img.shields.io/badge/galleries-17-4493f8) ![Dependencies](https://img.shields.io/badge/dependencies-0-3fb950) ![Node](https://img.shields.io/badge/node-%E2%89%A518-3fb950) ![Themes](https://img.shields.io/badge/Prism%20themes-22-c879ff)

</div>

---

prism-term is the terminal half of [Prism](../README.md). It is two things in one package:

- **The terminal catalog.** **434 facets** in **17 galleries** — spinners, progress bars and counters, charts, Linux and ops views, TUI controls, diagrams, text art and demoscene effects — sorted into galleries and categories exactly like [`Prism.html`](../Prism.html)'s web catalog. Every facet is a small ES module in [`src/facets/`](./src/facets), reads at 80×24, and adapts to the terminal it lands in: truecolor down to mono, braille and blocks down to 7-bit ASCII.
- **The engine.** A sub-cell pixel canvas (braille, sextant, quadrant, half-block or ASCII), a flicker-free diff renderer, dashboard widgets, inline CLI feedback (spinners, progress bars, task lists), bitmap-font banners, Prism's 22 themes, and HTML export. Zero dependencies, Node.js 18+, and the same code runs the facets in the browser.

There are four ways to see the catalog: with `curl` on the **terminal site**, live in your terminal with the **live player**, in the browser on the **terminal catalog** page, or as data in the **terminal JSON island**.

## Quick start

**Browse with curl** — nothing to install:

```bash
curl -sL https://prism.jeremyfhall.com/tty              # home: every gallery with its facet count
curl -sL https://prism.jeremyfhall.com/f/ops-htop       # one facet: a still frame and how to run it
```

**Play it live** — Node.js 18+, no global install:

```bash
npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term                   # the catalog browser
npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term play ops-htop     # one facet, fullscreen
```

For a permanent `prism-term` command, run `npm i -g https://prism.jeremyfhall.com/dl/prism-term.tgz` once.

**From a clone** — there is nothing to `npm install`:

```bash
cd prism-term
node cli.js                    # the catalog browser
node cli.js play donut         # one facet, fullscreen
node cli.js showcase           # every facet, auto-advancing
node cli.js snapshot plasma    # a still frame to stdout
```

To get a global `prism-term` command from a clone, run `npm link` here (or `npm install -g .`).

**In the browser:** [prism.jeremyfhall.com/terminal/](https://prism.jeremyfhall.com/terminal/) — every tile runs the real facet code. Step-by-step terminal directions: [prism.jeremyfhall.com/terminal/tty.html](https://prism.jeremyfhall.com/terminal/tty.html).

## The galleries

| Gallery | id | What's inside | Count |
|---|---|---|--:|
| ✺ **FX Store** | `fx` | Full-field effects: plasma, fire, fractals, water and light. | 24 |
| ◈ **Animated Objects** | `objects` | 3D solids, wireframes, globes and mechanical things that move. | 18 |
| ✦ **Particles & Simulations** | `sim` | Particles, cellular automata, physics, flocking and weather. | 18 |
| ▚ **Retro & Demoscene** | `retro` | Cracktro scrollers, copper bars, BBS-era ANSI art and chiptune visuals. | 24 |
| Aa **Text Effects** | `text` | Banners, bitmap fonts, reveals, glitches and color on type. | 29 |
| ⠿ **Spinners & Loaders** | `loaders` | Every way to say "working…" in one or two cells. | 64 |
| ▰ **Progress & Counters** | `progress` | Progress bars, multi-step pipelines, counters, timers and transfer meters. | 41 |
| ▁▃▆ **Charts & Metrics** | `charts` | Sparklines, line and bar charts, gauges, heatmaps and KPI tiles. | 30 |
| ✳ **AI Working** | `ai` | Thinking states, token streams, tool calls and agent pipelines. | 18 |
| ● **Notifications & Status** | `status` | Toasts, status lines, badges, health indicators and log lines. | 18 |
| $_ **Linux & Ops** | `ops` | What you see on a real box: monitors, disks, network, services, containers and logins. | 39 |
| ┌┐ **Architecture Diagrams** | `diagrams` | Box-drawing flows, trees, topologies, sequences and git graphs. | 16 |
| ▌ **Callouts & Layout** | `callouts` | Panels, borders, admonitions, tables, dividers and key-value blocks. | 15 |
| ❯ **Input & Menus** | `input` | TUI controls: selects, checkboxes, text fields, palettes, dialogs and tab bars. | 23 |
| ◍ **Maps & Geo** | `maps` | World maps, radar sweeps, routes, arcs and floorplans in braille and blocks. | 11 |
| ∿ **Animation Lab** | `lab` | Motion studies: easing curves, springs, timing and the building blocks of animation. | 17 |
| # **Pure ASCII** | `ascii` | 7-bit only — no Unicode, no color required. Runs on a VT100, a serial console, anything. | 29 |

The taxonomy — galleries and their categories — lives in [`src/facets/galleries.js`](./src/facets/galleries.js). `prism-term galleries` prints it with live counts:

```
$ prism-term galleries
fx         FX Store                     24  Full-field effects: plasma, fire, fractals, water and light.
           Fields 7 · Fractals 4 · Fire & Water 5 · Light & Sky 4 · Glitch & Noise 4
objects    Animated Objects             18  3D solids, wireframes, globes and mechanical things that move.
           3D Solids 5 · Wireframes 3 · Globes & Planets 3 · Mechanical 4 · Icons & Logos 3
…
```

## Browsing

### The catalog browser

`prism-term` with no arguments opens the catalog browser: the galleries, the facets in the current gallery, and a live preview of the selected one, with the exact command that plays it underneath. `prism-term --gallery ops` opens it at a gallery.

- **Keys in the browser:** `↑↓` `jk` move · `←→` `hl` / `Tab` pane · `Enter` play · `s` showcase · `/` search · `g` gallery · `f` kind · `t` theme · `m` mode · `?` help · `q` quit
- **Keys while playing:** `←/→` facet · `space` pause · `m` mode · `t` theme · `r` restart · `h` HUD · `q` back

In a window narrower than 110 columns the browser drops the gallery pane: `←→` / `hl` / `Tab` change gallery instead, and `g` opens a gallery picker. `PgUp` / `PgDn` / `Home` / `End` jump through long lists, `F` cycles the kind filter backwards, and `?` shows the keys inside the browser.

### Finding a facet

```bash
prism-term galleries                                   # every gallery, with counts and categories
prism-term list                                        # every facet, grouped by gallery and category
prism-term list --gallery progress --category "Counters & Odometers"
prism-term list --kind spinner                         # scene | widget | spinner | progress | text | chart | tui | diagram | art
prism-term list --gallery maps --json                  # machine-readable
prism-term info progress-odometer                      # one facet: size, needs, params and its commands
```

`info` tells you everything you need to run a facet anywhere:

```
$ prism-term info progress-odometer
Rolling Odometer  (progress-odometer)
Progress & Counters · Counters & Odometers · progress
A mechanical counter: each drum rolls to its next digit only while the drum to its right passes 9, shaded like a cylinder.

  size      48×7 (min 24×3)
  motion    animated · 10 s loop
  needs     unicode glyphs · 256 colors
  tags      odometer, counter, rolling, mechanical
  file      prism-term/src/facets/progress/counters.js

  play      prism-term play progress-odometer
  snapshot  prism-term snapshot progress-odometer --size 48x7
  npx       npx -y --package=https://prism.jeremyfhall.com/dl/prism-term.tgz prism-term play progress-odometer
  curl      curl -sL https://prism.jeremyfhall.com/f/progress-odometer
```

### Playing

```bash
prism-term play ops-htop                               # one facet, fullscreen
prism-term ops-htop                                    # shorthand for play
prism-term play ops-htop ops-df                        # several = a playlist (←/→ to move)
prism-term play --gallery progress                     # a whole gallery
prism-term play --gallery ops --category "System Monitors"
prism-term play --kind spinner                         # every facet of one kind
prism-term showcase --gallery loaders --duration 2     # auto-advancing tour, 2 s per facet
prism-term play donut --mode sextant --theme primer-dark
prism-term play fire --depth 256 --size 80x24          # pin the color depth and size
prism-term play mandelbrot --set set=julia             # a facet parameter
prism-term play ascii-donut --ascii                    # no Unicode at all
```

`play`, `showcase` and the browser need an interactive terminal; when output is piped they say so and point you at `snapshot`.

### Snapshots

```bash
prism-term snapshot plasma                             # a still frame to stdout, as ANSI
prism-term snapshot ops-htop --size 80x24 -o htop.txt  # plain text
prism-term snapshot donut --size 80x24 -o donut.html   # a self-contained HTML frame
prism-term snapshot fire --frames 30 -o fire.html      # an animated HTML recording
```

### Other commands

```bash
prism-term banner PRISM --font bold --palette aurora   # big gradient text into scrollback
prism-term spin --text "Checking the catalog" -- npm run catalog:check   # a command under a spinner; exits with its code
prism-term spinners                                    # preview every built-in spinner
prism-term dashboard                                   # PROTEUS-style live metrics + AI triage demo (needs 100×34)
prism-term demo                                        # inline helpers tour
prism-term caps                                        # what prism-term detected, plus glyph test patterns
prism-term themes                                      # Prism's 22 themes
prism-term palettes                                    # gradient palettes
prism-term help                                        # every command and option
```

Common options: `--theme <id>`, `--mode <braille|sextant|quad|half|ascii>`, `--palette <name>`, `--set key=value` (repeatable), `--fps <n>` (default 30), `--duration <s>`, `--size WxH`, `--seed <n>`, `--transparent`, `--no-hud`, `--depth <truecolor|256|16|mono>`, `--ascii`, `--sextant` / `--no-sextant`.

## Using facets in code

The registry is exported as `prism-term/facets`; the engine is the package root.

```js
import { play, renderScene } from 'prism-term';
import { findFacet, searchFacets } from 'prism-term/facets';

await play(findFacet('ops-htop'));                                              // fullscreen; q to quit
await play([findFacet('plasma'), findFacet('fire')], { duration: 5, theme: 'primer-dark' });   // a playlist

const frame = renderScene(findFacet('ops-df'), { width: 72, height: 6, t: 2 });  // offscreen, at t = 2 s
console.log(frame.toString());                                                  // plain text
process.stdout.write(frame.toAnsi('256') + '\n');                               // or ANSI at 256 colors

searchFacets('braille spinner').map((f) => f.id);                               // ['loaders-dots', 'loaders-dots-fill', …]
```

`prism-term/facets` also exports `allFacets()`, `catalogTree()` (galleries → categories → facets) and `GALLERIES`. Facets are deterministic: the same `seed` gives the same frames.

### From any language

The CLI is the integration point for programs that aren't written in JavaScript — a Python, Go or shell tool can shell out to it:

```bash
prism-term banner "PROTEUS" --palette aurora                       # a branded header
prism-term spin --text "Collecting metrics" -- python collect.py    # a spinner around any command
prism-term snapshot globe --size 80x24 > frame.ans                  # a still frame for a README or a log
```

## Authoring facets

A facet is a module in `src/facets/<gallery>/` that default-exports one facet (or an array): an `id`, a `title`, its `gallery` and `category`, a `description`, `tags`, its `kind`, a preferred `size` and a `minSize`, the minimum `glyphs` and `color` it needs, optional `params`, and a `setup(ctx)` that returns `frame(t, dt)`. Facets must be browser-safe and deterministic, draw only through the Surface API, lay out from `ctx.width` / `ctx.height`, work in every canvas mode, and take their colors from theme tokens.

The full contract, the rules the conformance test enforces, and the verify loop are in **[docs/authoring-facets.md](./docs/authoring-facets.md)**. In short:

```bash
npm run facets:manifest                                                  # after adding or removing a module
node --test --test-name-pattern="facet progress/" test/facets.test.js    # conformance for one gallery
node scripts/shoot.mjs --gallery progress --sheet --t 2 --out <dir>      # a contact sheet PNG — look at it
```

Ops and Linux facets also follow **[docs/linux-sme-requirements.md](./docs/linux-sme-requirements.md)** — what a decade of `htop`, `journalctl` and `tmux` makes people expect.

## Resolution modes

| Mode | Pixels per cell | Colors per cell | Best for |
|---|---|---|---|
| `braille` | 2×4 `⣿` | 1 | lines, plots, wireframes, dithered shading |
| `sextant` | 2×3 `🬗` | 2 | sharp color art (needs a font with Legacy Computing glyphs) |
| `quad` | 2×2 `▚` | 2 | sharp color art, universally supported |
| `half` | 1×2 `▀` | 2 (exact) | smooth color fields — plasma, fire, images |
| `ascii` | 1×1 `@` | 1 | anything, anywhere |

Canvas-based facets pick the best mode for their content and your terminal; `--mode` (or `m` while playing) overrides it. Forcing a color field into braille switches on ordered dithering, so brightness becomes dot density.

## Terminal support

prism-term only emits widely supported CSI/DEC sequences and detects what your terminal can do; `prism-term caps` shows the result and test patterns.

- **Color depth:** truecolor, 256 or 16 colors, or none — quantized automatically. 256 colors is the safe default: tmux without `Tc`, screen and macOS Terminal.app all quantize truecolor, so facets are designed to survive it.
- **Glyphs:** braille and block elements everywhere except the Linux console (`TERM=linux`), `TERM=dumb` and non-UTF-8 locales such as `LANG=C`, which get 7-bit ASCII. Sextants are assumed only where they are known to render (Windows Terminal, kitty, WezTerm, ghostty, foot, VS Code and a few others); force them with `--sextant`.
- **Tear-free frames** wherever the terminal implements synchronized output (DEC mode 2026). Terminals and multiplexers without it ignore the sequence harmlessly, and frames are kept small enough to stay calm anyway.
- **Overrides:** `NO_COLOR`, `FORCE_COLOR=0..3`, `PRISM_TERM_DEPTH=truecolor|256|16|mono`, `PRISM_TERM_UNICODE=0|1`, `PRISM_TERM_SEXTANT=0|1`, or `--depth`, `--ascii` and `--sextant` on the command line.

The terminal is always restored — cursor, colors, line wrap, alternate screen and raw mode — on quit, on Ctrl-C/SIGTERM and on crashes.

| Environment | What to expect |
|---|---|
| 80×24 | every facet is designed to look intentional at 80×24 and to read at its `minSize` |
| SSH, tmux, screen | correct at 256 colors, with no reliance on synchronized output |
| `TERM=linux`, `LANG=C`, serial consoles | clean 7-bit ASCII — `+-\|` boxes, `#=.` bars — and no mojibake |
| `NO_COLOR=1` | information survives without color: symbols, brackets and words like `FAILED` |
| Windows Terminal / PowerShell | works; in Windows PowerShell 5, type `curl.exe` for the terminal site |
| piped output | `list`, `info` and `galleries` print plain text; `snapshot` writes ANSI by design (`-o x.txt` for plain) |

Very large full-color scenes are bandwidth-bound: a 338×83 plasma is ~0.65 MB per frame and measured ~27 fps in a ConPTY-backed terminal on Windows. To keep frames small, spaces never resend their foreground, full blocks never resend their background, near-identical half-block pairs collapse to one background cell, and short unchanged gaps are bridged instead of jumped. `--depth 256` cuts another ~40%.

## The terminal site and the web catalog

The terminal site is generated from the registry by [`src/site/tty.js`](./src/site/tty.js): a home page (`tty`), `t/help`, `t/all`, one `t/<gallery>` page per gallery and one `f/<facet-id>` page per facet. Every page is a still that fits 80 columns and uses only SGR color and text — no cursor movement, so `less -R` and CI logs are happy — and comes in three variants: the default 256-color page, `.24` for truecolor, and `.txt`, 7-bit ASCII with no escape codes.

```bash
curl -sL https://prism.jeremyfhall.com/t/ops | less -R                # page through a gallery
curl -sL https://prism.jeremyfhall.com/t/all.txt | grep -i spinner    # search every facet
curl -sL https://prism.jeremyfhall.com/f/plasma.24                    # truecolor
```

The terminal catalog page at [`/terminal/`](https://prism.jeremyfhall.com/terminal/) uses the browser renderer in [`src/web/`](./src/web) to run the same facet modules in the page — themes, canvas modes, color depths and parameters included.

### The terminal JSON island

[`scripts/build-catalog.mjs`](./scripts/build-catalog.mjs) derives [`catalog/terminal-catalog.json`](./catalog/terminal-catalog.json) from `src/facets/**`, and [`scripts/embed-island.mjs`](./scripts/embed-island.mjs) embeds it into `Prism.html` right after the web catalog's island:

```html
<!-- ===== PRISM TERMINAL CATALOG · AI START HERE ===== -->
<script type="application/json" id="prism-terminal-catalog"> … </script>
<!-- ===== /PRISM TERMINAL CATALOG ===== -->
```

It has the same shape as the web island:

- an `_ai` header: `schema: 2`, what it is, how to use it, what each field means, how `sources` is laid out, and the count
- an `engine` block: package, version, repo, and the `npx`, `curl` and web entry points
- `galleries[]`, with their categories and counts
- one record per facet in `facets[]`: `id`, `title`, `gallery`, `category`, `description`, `tags`, `kind`, `size`, `minSize`, `animated`, `loop`, `glyphs`, `color`, `params`, `module`, `imports`, ready-to-run `usage` commands (`cli`, `npx`, `snapshot`, `code`, `curl`) and a plain-text `preview` frame
- `sources`: each module's full source, stored once and keyed by `module`. Many modules host several facets. It also holds every gallery helper (`_*.js`) that facet modules import, directly or through another helper.

The `/terminal/` page carries a lean copy without `sources` or `preview`. The [root README](../README.md#the-terminal-json-island) shows a full record, and the Prism MCP server reads the island through five terminal tools. Its `get_terminal_facet` still returns each facet's `source` directly.

## Beyond facets: the engine

### CLI feedback

```js
import { spinner, tasks, progress, thinking, typewrite, banner, sleep } from 'prism-term';

console.log(banner('PRISM', { fill: 'prism' }));

const s = spinner('Connecting to telemetry');
await sleep(800);
s.succeed('Connected to 3 sources');

await tasks([
  { title: 'Collect metrics', run: async (t) => { t.update('cpu'); await sleep(600); } },
  { title: 'Index logs', run: () => sleep(900) },
], { concurrent: true });

const bar = progress({ total: 40, label: 'Scanning', gradient: 'aurora' });
for (let i = 0; i < 40; i++) { await sleep(20); bar.tick(); }
bar.done();

const think = thinking('Correlating anomalies across 7 services');
await sleep(1200);
think.succeed('Found 1 incident');
await typewrite('Connection pool exhausted on orders-db; raise max_connections or add a pooler.\n');   // strings or async iterables of tokens
```

Inline helpers write to stderr by default (`typewrite` to stdout), animate in place on a TTY, and fall back to plain line-by-line text — no escape codes — when piped or in CI. There are 49 built-in spinners (`prism-term spinners`), three hand-built bitmap fonts, banners in six render modes and ten text effects (decrypt, glitch, wave, shimmer…).

### Drawing your own frames

```js
import { Screen, Canvas, getTheme, palette } from 'prism-term';

const screen = new Screen();                       // fullscreen; { mode: 'inline', height: 6 } animates in scrollback
const theme = getTheme('primer-dark');
const pal = palette('synthwave');

await screen.run((t) => {
  const b = screen.buffer;
  b.clear(theme.bg);
  const cv = new Canvas(b.width, b.height, { mode: 'braille' });
  for (let x = 0; x < cv.width; x++) {
    const y = cv.height / 2 + Math.sin(x / 9 + t * 3) * cv.height * 0.35;
    cv.set(x, y, pal(x / cv.width));
  }
  cv.paint(b);
  b.text(2, 1, ' sine · press Ctrl-C ', theme.bg, theme.accent);
}, { fps: 30 });
```

`CellBuffer` / `View` hold cells (char, fg, bg, attr); every widget and facet draws through `set` / `text` / `fill`, and `buffer.view(x, y, w, h)` gives a clipped window, so layouts compose. `Canvas` adds `line`, `path`, `rect`, `circle`, `ellipse`, `polygon`, `triangle`, `bezier`, additive `add`, alpha `blend`, `fade` (trails) and `shade(fn)`.

### Widgets

```js
import { CellBuffer, getTheme, box, lineChart, kpi } from 'prism-term';

const theme = getTheme('cloudscape-dark');
const b = new CellBuffer(90, 14);
b.clear(theme.bg);
const p50 = Array.from({ length: 60 }, (_, i) => 120 + 25 * Math.sin(i / 6));
const p99 = p50.map((v, i) => v * 2.4 + 40 * Math.sin(i / 3));
const errors = Array.from({ length: 30 }, (_, i) => 0.3 - i * 0.004);

const inner = box(b, 0, 0, 60, 14, { title: 'Latency (ms)', theme });
lineChart(inner, 0, 0, inner.width, inner.height, [
  { data: p50, label: 'p50', color: 'pos' },
  { data: p99, label: 'p99', color: 'neg' },
], { grid: true, theme });
kpi(b, 60, 0, 30, 5, { label: 'error rate', value: '0.27', unit: '%', delta: -4.1, goodWhen: 'down', trend: errors, theme });

process.stdout.write(b.toAnsi('256') + '\n');
```

Also available: `gauge`, `heatmap`, `barChart`, `sparkline`, `progressBar`, `meter`, `table`, `logView`, `badge` and `statusDot`. Colors accept theme tokens (`'accent'`, `'pos'`, `'warn'`, `'neg'`, `'crit'`, …), any CSS color, packed ints, palette names or stop lists. `toHtml` / `toAnimatedHtml` export frames as self-contained HTML — no fonts or scripts fetched — ready to drop into a Prism gallery or a report.

### PROTEUS

`prism-term dashboard` is a working sketch of a PROTEUS console (metrics and AI-assisted troubleshooting), driven by a small telemetry simulator ([`examples/proteus-sim.js`](./examples/proteus-sim.js)) with three injectable incidents:

| Incident | Signal | Lesson |
|---|---|---|
| Connection-pool exhaustion | latency ↑, 5xx ↑, database idle | look for a queue in front of the dependency |
| Memory leak | RSS slope, GC-aligned latency sawtooth | latency can be a memory problem in disguise |
| Bad deploy | errors ↑ at a deploy boundary, latency flat | correlate with the change log first |

KPI tiles, a p50/p95/p99 chart, an animated service map, a latency histogram, saturation gauges, errors by endpoint and a live log feed respond to the incident. An **AI troubleshooter** panel then walks through it: tool-call evidence, ranked hypotheses with confidence bars, the fix, and the lesson. It needs a terminal of at least 100×34. Keys: `i` inject, `r` apply fix, `a` auto incidents, `t` theme, `q` quit. [`examples/inline-demo.js`](./examples/inline-demo.js) shows the same investigation as a scrolling CLI session.

## Themes and palettes

Themes come from Prism's theme registry — `npm run sync-themes` regenerates [`src/themes.js`](./src/themes.js) from [`prism-mcp-server/utils/themes.js`](../prism-mcp-server/utils/themes.js), so the terminal stays in step with `Prism.html`. `prism-term themes` lists all 22 (Cloudscape, Primer, Material 3, Polaris, …). Palettes: `prism`, `fire`, `ocean`, `aurora`, `synthwave`, `matrix`, `ice`, `sunset`, `toxic`, `magma`, `viridis`, `candy`, `gold`, `mono`, plus `theme` and `theme-heat`, which are derived from the active theme.

## Development

| Script | What it does |
|---|---|
| `npm test` | the whole Node-native suite: engine, every facet in every mode, widgets, inline helpers, text, CLI, the catalog browser, the terminal site |
| `npm run facets:manifest` | regenerate [`src/facets/manifest.js`](./src/facets/manifest.js), the static list of facet modules (`facets:check` exits 1 if it is out of date) |
| `npm run catalog` | build `catalog/terminal-catalog.json` from `src/facets/**` (`catalog:check` exits 1 if it is stale) |
| `npm run island` | embed the catalog into `../Prism.html` as `#prism-terminal-catalog` (`island:check` exits 1 if it is stale or missing) |
| `npm run tty-site -- <dir>` | write the terminal site into `<dir>`; add `--html` for HTML previews of the color pages |
| `npm run pack -- <dir>` | pack `prism-term.tgz` for the live player into `<dir>`; `--verify` installs it through `npx` and runs it |
| `npm run site` | build the whole website (`../website/build.mjs`) into `../site-dist/` |
| `npm run shoot -- …` | render facets to PNG with headless Chrome — one per facet, or a `--sheet` contact sheet |
| `npm run sync-themes` | refresh themes from the Prism registry |

The renderer tests replay real escape output through a small VT emulator ([`test/vt.js`](./test/vt.js)) and assert that what a terminal would display equals the frame buffer. The facet conformance test ([`test/facets.test.js`](./test/facets.test.js)) renders every facet at its size and `minSize` in every mode, checks that it is deterministic and stays inside its view, holds it to the frame budget at 160×48, and checks that it emits only 7-bit glyphs on a terminal without Unicode.

```
prism-term/
├── cli.js               the prism-term command
├── index.js             public API (the engine)
├── src/
│   ├── color.js caps.js ansi.js width.js     terminal facts
│   ├── buffer.js canvas.js screen.js loop.js  buffers, pixel canvas, renderer, ticker
│   ├── palettes.js themes.js                  Prism themes + gradients
│   ├── context.js render.js export.js         facet runtime, offscreen render, HTML export
│   ├── player.js gallery.js                   fullscreen player + catalog browser
│   ├── widgets/  spinners.js  inline.js       dashboards + CLI feedback
│   ├── text/                                  fonts, banners, text effects
│   ├── facets/                                the catalog: galleries.js, schema.js, index.js, manifest.js, <gallery>/*.js
│   ├── web/                                   browser renderer for the terminal catalog page
│   └── site/                                  terminal-site page generator
├── catalog/             terminal-catalog.json (derived — never hand-edit)
├── scripts/             gen-manifest, build-catalog, embed-island, build-tty-site, pack, shoot, sync-themes
├── docs/                authoring-facets.md, linux-sme-requirements.md
├── examples/            PROTEUS dashboard, simulator, inline demo
└── test/
```
